/**
 * ProductionRuntimeGateway — advisory migration control boundary.
 *
 * Never executes legacy generation. Never opens v2 provider traffic.
 * Optional Shadow dry_run at most once with local timeout; always fail-open.
 * Accepts only an immutable production dry-run Shadow executor (PATCH 015B).
 */

import {
  isProductionDryRunShadowExecutor,
  type ProductionDryRunShadowExecutor,
} from "../shadow/ShadowRuntime";
import type {
  ShadowRuntimeInput,
  ShadowRuntimeResult,
  ShadowTerminalOutcome,
} from "../shadow/ShadowRuntimeTypes";
import type { ProductionRuntimeConfig } from "./ProductionRuntimeConfig";
import {
  PRODUCTION_FORBIDDEN_CONTENT_WARNING,
  PRODUCTION_SHADOW_FAILURE_WARNING,
  PRODUCTION_SHADOW_INPUT_REJECTED_WARNING,
  PRODUCTION_SHADOW_TIMEOUT_WARNING,
  PRODUCTION_SHADOW_UNAVAILABLE_WARNING,
  PRODUCTION_TELEMETRY_UNSAFE_WARNING,
  REDACTED_PRODUCTION_CONTENT,
} from "./ProductionRuntimeErrors";
import { evaluateProductionRuntimePolicy } from "./ProductionRuntimePolicy";
import {
  projectProductionTelemetry,
  validateProductionTelemetry,
  type ProductionTelemetry,
} from "./ProductionTelemetry";
import type {
  ProductionGatewayInput,
  ProductionGatewayResult,
  ProductionRuntimeDecision,
} from "./ProductionRuntimeTypes";

export interface ProductionRuntimeGatewayDependencies {
  config: ProductionRuntimeConfig;

  /** Immutable WeakSet-registered production dry-run executor only. */
  shadowExecutor?: ProductionDryRunShadowExecutor;

  now: () => number;
}

const FORBIDDEN_SENSITIVE_PATTERNS: RegExp[] = [
  /data:image\//i,
  /\bBearer\b/i,
  /\bAuthorization\b/i,
  /REPLICATE_API_TOKEN/i,
  /\bapi[_-]?key\b/i,
  /https?:\/\//i,
  /\bat\s+\S+\s+\([^)]+\.\w+:\d+:\d+\)/i,
  /(?:[A-Za-z0-9+/]{40,}={0,2})/,
  /\br8_[A-Za-z0-9]+/i,
  /\bsk-[A-Za-z0-9]+/i,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
];

function stringLooksSensitive(text: string): boolean {
  for (const pattern of FORBIDDEN_SENSITIVE_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

function deepCloneJson<T>(value: T): T {
  return structuredClone(value);
}

function legacyBlock(): ProductionGatewayResult["legacy"] {
  return {
    required: true,
    executedByGateway: false,
    owner: "existing_legacy_pipeline",
  };
}

function emptyShadowBlock(requested: boolean): ProductionGatewayResult["shadow"] {
  return {
    requested,
    executed: false,
    success: null,
    terminalOutcome: null,
    telemetry: null,
  };
}

function buildResult(partial: {
  success: boolean;
  decision: ProductionRuntimeDecision;
  shadow: ProductionGatewayResult["shadow"];
  warnings?: string[];
  errors?: string[];
}): ProductionGatewayResult {
  return {
    success: partial.success,
    decision: deepCloneJson(partial.decision),
    legacy: legacyBlock(),
    shadow: deepCloneJson(partial.shadow),
    warnings: partial.warnings ? [...partial.warnings] : [],
    errors: partial.errors ? [...partial.errors] : [],
  };
}

function isRuntimeOnlyShadowInput(
  input: ShadowRuntimeInput | undefined
): input is ShadowRuntimeInput {
  if (input == null || typeof input !== "object") return false;
  if (input.mode !== "runtime_only") return false;
  const runtimeInput = input.runtimeInput;
  if (runtimeInput == null) return true;
  if (runtimeInput.mode != null && runtimeInput.mode !== "dry_run") {
    return false;
  }
  if (
    runtimeInput.sourceImage != null ||
    runtimeInput.transportConfig != null ||
    runtimeInput.validationEvidence != null
  ) {
    return false;
  }
  return true;
}

async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  now: () => number
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const started = now();
  try {
    const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
      timer = setTimeout(
        () => resolve({ timedOut: true }),
        Math.max(0, timeoutMs)
      );
    });
    const raced = await Promise.race([
      promise.then((value) => ({ timedOut: false as const, value })),
      timeoutPromise,
    ]);
    void started;
    return raced;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Build gateway dependencies. Does not construct transport, fetch, or credentials.
 * Does not read process.env. shadowExecutor must be a sealed production executor.
 */
export function createProductionRuntimeGatewayDependencies(options: {
  config: ProductionRuntimeConfig;
  shadowExecutor?: ProductionDryRunShadowExecutor;
  now?: () => number;
}): ProductionRuntimeGatewayDependencies {
  return {
    config: options.config,
    shadowExecutor: options.shadowExecutor,
    now: options.now ?? (() => Date.now()),
  };
}

/**
 * Recursively redact forbidden strings. Does not mutate input.
 * Unsafe telemetry is removed. Legacy ownership invariants are preserved.
 */
export function sanitizeProductionGatewayResult(
  result: ProductionGatewayResult
): ProductionGatewayResult {
  const clone = deepCloneJson(result);
  let redacted = false;

  // Remove unsafe telemetry entirely before string redaction.
  if (clone.shadow.telemetry != null) {
    const telemetryJson = JSON.stringify(clone.shadow.telemetry);
    const check = validateProductionTelemetry(clone.shadow.telemetry);
    if (!check.valid || stringLooksSensitive(telemetryJson)) {
      clone.shadow.telemetry = null;
      redacted = true;
    }
  }

  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      if (stringLooksSensitive(value)) {
        redacted = true;
        return REDACTED_PRODUCTION_CONTENT;
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => walk(item));
    }
    if (value !== null && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(
        value as Record<string, unknown>
      )) {
        out[key] = walk(nested);
      }
      return out;
    }
    return value;
  };

  const walked = walk(clone) as ProductionGatewayResult;

  // Enforce permanent invariants.
  walked.decision.legacyRequired = true;
  walked.decision.userVisibleOwner = "legacy";
  walked.decision.v2ProviderTrafficAllowed = false;
  walked.legacy = legacyBlock();

  if (walked.shadow.telemetry != null) {
    const check = validateProductionTelemetry(walked.shadow.telemetry);
    const telemetryJson = JSON.stringify(walked.shadow.telemetry);
    if (
      !check.valid ||
      stringLooksSensitive(telemetryJson) ||
      telemetryJson.includes(REDACTED_PRODUCTION_CONTENT)
    ) {
      walked.shadow.telemetry = null;
      redacted = true;
    }
  }

  if (redacted) {
    const already = walked.warnings.includes(PRODUCTION_FORBIDDEN_CONTENT_WARNING);
    if (!already) {
      walked.warnings.push(PRODUCTION_FORBIDDEN_CONTENT_WARNING);
    }
  }

  return walked;
}

export class ProductionRuntimeGateway {
  private readonly dependencies: ProductionRuntimeGatewayDependencies;

  constructor(dependencies: ProductionRuntimeGatewayDependencies) {
    this.dependencies = dependencies;
  }

  async evaluate(
    input: ProductionGatewayInput
  ): Promise<ProductionGatewayResult> {
    const decision = evaluateProductionRuntimePolicy(
      this.dependencies.config,
      input.requestContext
    );

    const warnings = [...decision.warnings];
    const errors = [...decision.errors];

    if (!decision.runShadowDryRun) {
      return sanitizeProductionGatewayResult(
        buildResult({
          success: true,
          decision,
          shadow: emptyShadowBlock(false),
          warnings,
          errors,
        })
      );
    }

    // Shadow requested by policy — require sealed production dry-run executor.
    if (!isProductionDryRunShadowExecutor(this.dependencies.shadowExecutor)) {
      warnings.push(PRODUCTION_SHADOW_UNAVAILABLE_WARNING);
      return sanitizeProductionGatewayResult(
        buildResult({
          success: true,
          decision: {
            ...decision,
            reasonCode: "shadow_runtime_unavailable",
            runShadowDryRun: false,
          },
          shadow: emptyShadowBlock(true),
          warnings,
          errors,
        })
      );
    }

    const sealedExecutor = this.dependencies.shadowExecutor;

    if (!isRuntimeOnlyShadowInput(input.shadowRuntimeInput)) {
      warnings.push(PRODUCTION_SHADOW_INPUT_REJECTED_WARNING);
      return sanitizeProductionGatewayResult(
        buildResult({
          success: true,
          decision: {
            ...decision,
            reasonCode: "safe_fallback_to_legacy",
            runShadowDryRun: false,
          },
          shadow: emptyShadowBlock(true),
          warnings,
          errors,
        })
      );
    }

    // Force runtime_only — never transport mock / live.
    const shadowInput: ShadowRuntimeInput = {
      mode: "runtime_only",
      runtimeInput: input.shadowRuntimeInput.runtimeInput
        ? {
            ...input.shadowRuntimeInput.runtimeInput,
            mode: "dry_run",
          }
        : undefined,
    };

    let shadowResult: ShadowRuntimeResult | null = null;
    let timedOut = false;
    let shadowFailed = false;
    let shadowCallCount = 0;

    try {
      shadowCallCount += 1;
      if (shadowCallCount > 1) {
        throw new Error("Shadow invoked more than once in one evaluation.");
      }
      const raced = await raceWithTimeout(
        sealedExecutor.execute(shadowInput),
        this.dependencies.config.shadowTimeoutMs,
        this.dependencies.now
      );
      if (raced.timedOut) {
        timedOut = true;
      } else {
        shadowResult = raced.value;
      }
    } catch {
      shadowFailed = true;
    }

    if (timedOut) {
      warnings.push(PRODUCTION_SHADOW_TIMEOUT_WARNING);
      return sanitizeProductionGatewayResult(
        buildResult({
          success: true,
          decision,
          shadow: emptyShadowBlock(true),
          warnings,
          errors,
        })
      );
    }

    if (shadowFailed || shadowResult == null) {
      warnings.push(PRODUCTION_SHADOW_FAILURE_WARNING);
      return sanitizeProductionGatewayResult(
        buildResult({
          success: true,
          decision,
          shadow: {
            requested: true,
            executed: false,
            success: false,
            terminalOutcome: null,
            telemetry: null,
          },
          warnings,
          errors,
        })
      );
    }

    let telemetry: ProductionTelemetry | null = null;
    try {
      telemetry = projectProductionTelemetry(shadowResult);
      const check = validateProductionTelemetry(telemetry);
      if (!check.valid) {
        telemetry = null;
        warnings.push(PRODUCTION_TELEMETRY_UNSAFE_WARNING);
      }
    } catch {
      telemetry = null;
      warnings.push(PRODUCTION_TELEMETRY_UNSAFE_WARNING);
    }

    const terminalOutcome: ShadowTerminalOutcome | null =
      shadowResult.execution.terminalOutcome;

    return sanitizeProductionGatewayResult(
      buildResult({
        success: true,
        decision,
        shadow: {
          requested: true,
          executed: Boolean(shadowResult.execution.executed),
          success: Boolean(shadowResult.success),
          terminalOutcome,
          telemetry,
        },
        warnings,
        errors,
      })
    );
  }
}
