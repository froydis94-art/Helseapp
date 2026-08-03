/**
 * ShadowRuntime — observes AI OS Runtime without replacing production.
 *
 * Modes:
 * - disabled: skip immediately
 * - runtime_only: AiOsRuntime dry_run once; metrics only; discard artifacts
 * - runtime_with_transport_mock: branded mock transport once; metrics only; discard artifacts
 *
 * Transport is mock-only by construction (ShadowSafeRuntime + brand).
 * Never creates a real Replicate adapter, never reads environment variables,
 * never exposes formatted requests, transport URLs, prompts, plans, or evidence.
 * Never performs automatic retries or production writes.
 */

import {
  AiOsRuntime,
  createAiOsRuntimeDependencies,
  type AiOsRuntimeDependencies,
} from "../runtime";
import type { AiOsRuntimeInput, AiOsRuntimeResult } from "../runtime/AiOsRuntimeTypes";
import type { ReplicateTransportAdapter } from "../transport/ReplicateTransportAdapter";
import type {
  ReplicateTransportInput,
  ReplicateTransportResult,
} from "../transport/ReplicateTransportTypes";
import { collectShadowMetrics, emptyShadowMetrics } from "./ShadowMetrics";
import {
  buildShadowReplayRecord,
  buildSkippedShadowReplay,
  cloneShadowReplayRecord,
} from "./ShadowReplay";
import {
  SHADOW_RUNTIME_RULES_VERSION,
  type ShadowExecutionResult,
  type ShadowMode,
  type ShadowRuntimeInput,
  type ShadowRuntimeInputValidation,
  type ShadowRuntimeResult,
  type ShadowSafeRuntime,
  type ShadowTransportKind,
} from "./ShadowRuntimeTypes";

export const SHADOW_FORBIDDEN_CONTENT_ERROR =
  "Shadow result contained forbidden sensitive content.";

export const SHADOW_TRANSPORT_KIND_MISMATCH_ERROR =
  "Shadow mode is incompatible with shadowTransportKind.";

export const SHADOW_UNBRANDED_TRANSPORT_ERROR =
  "createShadowRuntimeFromAiOsDeps rejects unbranded transport. Use createMockTransportShadowRuntime with createShadowMockTransport.";

/** Explicit brand — not class-name or adapter-id detection. */
export const SHADOW_MOCK_TRANSPORT_BRAND: unique symbol = Symbol(
  "helseapp.shadow.mockTransport"
);

/**
 * Mock transport adapter proven by brand factory, not by naming.
 * Satisfies ReplicateTransportAdapter structurally for AiOsRuntime injection.
 */
export type ShadowMockTransportAdapter = ReplicateTransportAdapter & {
  readonly [SHADOW_MOCK_TRANSPORT_BRAND]: true;
};

const SUPPORTED_SHADOW_MODES: readonly ShadowMode[] = [
  "disabled",
  "runtime_only",
  "runtime_with_transport_mock",
];

const FORBIDDEN_SENSITIVE_PATTERNS: RegExp[] = [
  /data:image\//i,
  /\bBearer\b/i,
  /\bAuthorization\b/i,
  /REPLICATE_API_TOKEN/i,
  /\bapi[_-]?key\b/i,
  /https?:\/\//i,
  /\bat\s+\S+\s+\([^)]+\.\w+:\d+:\d+\)/i,
  /(?:[A-Za-z0-9+/]{80,}={0,2})/,
  /\br8_[A-Za-z0-9]+/i,
  /\bsk-[A-Za-z0-9]+/i,
];

export interface ShadowRuntimeDependencies {
  /** Injected shadow-safe runtime — never a bare production AiOsRuntime. */
  runtime: ShadowSafeRuntime;

  now: () => number;
}

/**
 * Runtime brand check for mock transport adapters.
 */
export function isShadowMockTransport(
  adapter: unknown
): adapter is ShadowMockTransportAdapter {
  return (
    typeof adapter === "object" &&
    adapter !== null &&
    (adapter as { [SHADOW_MOCK_TRANSPORT_BRAND]?: unknown })[
      SHADOW_MOCK_TRANSPORT_BRAND
    ] === true
  );
}

/**
 * Explicit mock-transport brand factory.
 * Does not wrap or instantiate ReplicateTransportAdapter class instances.
 */
export function createShadowMockTransport(spec: {
  id?: string;
  generate: (
    input: ReplicateTransportInput
  ) => Promise<ReplicateTransportResult>;
}): ShadowMockTransportAdapter {
  const adapter = {
    id: spec.id ?? "shadow-mock-transport-v1",
    provider: "replicate" as const,
    generate: spec.generate,
    [SHADOW_MOCK_TRANSPORT_BRAND]: true as const,
  };
  return adapter as unknown as ShadowMockTransportAdapter;
}

function wrapShadowSafeRuntime(
  runtime: AiOsRuntime,
  shadowTransportKind: ShadowTransportKind
): ShadowSafeRuntime {
  return {
    shadowTransportKind,
    run: (input: AiOsRuntimeInput) => runtime.run(input),
  };
}

/**
 * Build injectable shadow dependencies. Never reads environment variables.
 * Accepts only ShadowSafeRuntime (factory-branded).
 */
export function createShadowRuntimeDependencies(options: {
  runtime: ShadowSafeRuntime;
  now?: () => number;
}): ShadowRuntimeDependencies {
  return {
    runtime: options.runtime,
    now: options.now ?? (() => Date.now()),
  };
}

/**
 * Dry-run / disabled shadow runtime — transport kind "none".
 * Cannot run runtime_with_transport_mock (mode/kind mismatch → invalid_input).
 */
export function createDryRunShadowRuntime(options?: {
  now?: () => number;
}): ShadowRuntime {
  const now = options?.now ?? (() => Date.now());
  const aiOs = new AiOsRuntime(createAiOsRuntimeDependencies({ now }));
  return new ShadowRuntime(
    createShadowRuntimeDependencies({
      runtime: wrapShadowSafeRuntime(aiOs, "none"),
      now,
    })
  );
}

/**
 * Mock-transport shadow runtime — transport kind "mock".
 * Requires an explicitly branded mock transport (createShadowMockTransport).
 * Never accepts a real ReplicateTransportAdapter without the brand.
 */
export function createMockTransportShadowRuntime(options: {
  mockTransport: ShadowMockTransportAdapter;
  now?: () => number;
}): ShadowRuntime {
  if (!isShadowMockTransport(options.mockTransport)) {
    throw new Error(
      "createMockTransportShadowRuntime requires a branded mock transport from createShadowMockTransport."
    );
  }
  const now = options.now ?? (() => Date.now());
  const aiOs = new AiOsRuntime(
    createAiOsRuntimeDependencies({
      transportAdapter: options.mockTransport,
      now,
    })
  );
  return new ShadowRuntime(
    createShadowRuntimeDependencies({
      runtime: wrapShadowSafeRuntime(aiOs, "mock"),
      now,
    })
  );
}

/**
 * @deprecated Use createDryRunShadowRuntime or createMockTransportShadowRuntime.
 * Rejects transport-capable deps unless the adapter is explicitly branded as mock.
 * Signature preserved for public export compatibility.
 */
export function createShadowRuntimeFromAiOsDeps(
  aiOsDeps: AiOsRuntimeDependencies,
  now?: () => number
): ShadowRuntime {
  const resolvedNow = now ?? aiOsDeps.now;
  if (aiOsDeps.transportAdapter !== undefined) {
    if (!isShadowMockTransport(aiOsDeps.transportAdapter)) {
      throw new Error(SHADOW_UNBRANDED_TRANSPORT_ERROR);
    }
    return createMockTransportShadowRuntime({
      mockTransport: aiOsDeps.transportAdapter,
      now: resolvedNow,
    });
  }
  return createDryRunShadowRuntime({ now: resolvedNow });
}

function stringLooksSensitive(text: string): boolean {
  for (const pattern of FORBIDDEN_SENSITIVE_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

function valueLooksSensitive(value: unknown): boolean {
  if (typeof value === "string") return stringLooksSensitive(value);
  if (Array.isArray(value)) return value.some((item) => valueLooksSensitive(item));
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((nested) =>
      valueLooksSensitive(nested)
    );
  }
  return false;
}

function deepCloneJson<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Validate shadow input without echoing sensitive values.
 */
export function validateShadowRuntimeInput(
  input: ShadowRuntimeInput
): ShadowRuntimeInputValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input == null || typeof input !== "object") {
    return {
      valid: false,
      errors: ["Shadow input is invalid."],
      warnings,
    };
  }

  if (
    typeof input.mode !== "string" ||
    !SUPPORTED_SHADOW_MODES.includes(input.mode as ShadowMode)
  ) {
    errors.push("Unsupported shadow mode.");
  }

  if (input.mode !== "disabled") {
    if (input.runtimeInput === undefined || input.runtimeInput === null) {
      errors.push("runtimeInput is required when shadow mode is not disabled.");
    } else if (
      typeof input.runtimeInput !== "object" ||
      Array.isArray(input.runtimeInput)
    ) {
      errors.push("runtimeInput is invalid.");
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Sanitize a shadow result. Deterministic and idempotent. Does not mutate input.
 * Shadow never allows any URL or Base64 — stricter than runtime sanitizer.
 */
export function sanitizeShadowRuntimeResult(
  result: ShadowRuntimeResult
): ShadowRuntimeResult {
  const clone = deepCloneJson(result);

  if (!valueLooksSensitive(clone)) {
    return clone;
  }

  return {
    success: false,
    mode: clone.mode,
    execution: {
      executed: false,
      skipped: false,
      runtimeMode: null,
      terminalOutcome: "invalid_runtime_state",
      success: false,
    },
    metrics: {
      ...clone.metrics,
      runtimeDurationMs: 0,
      stageDurations: [],
      stageCount: 0,
      retryRequested: false,
      accepted: false,
      rejected: false,
      awaitingValidation: false,
      transportFailure: false,
      runtimeMode: null,
      formatterVersion: null,
      validatorVersion: null,
      retryVersion: null,
      shadowRulesVersion: SHADOW_RUNTIME_RULES_VERSION,
    },
    replay: null,
    warnings: [],
    errors: [SHADOW_FORBIDDEN_CONTENT_ERROR],
  };
}

function mapRuntimeMode(shadowMode: ShadowMode): AiOsRuntimeInput["mode"] | null {
  if (shadowMode === "runtime_only") return "dry_run";
  if (shadowMode === "runtime_with_transport_mock") return "transport_mock";
  return null;
}

function isTransportKindCompatible(
  mode: ShadowMode,
  kind: ShadowTransportKind
): boolean {
  if (mode === "disabled") return true;
  if (mode === "runtime_only") return kind === "none" || kind === "mock";
  if (mode === "runtime_with_transport_mock") return kind === "mock";
  return false;
}

function buildSkippedResult(mode: ShadowMode): ShadowRuntimeResult {
  const metrics = emptyShadowMetrics();
  const execution: ShadowExecutionResult = {
    executed: false,
    skipped: true,
    runtimeMode: null,
    terminalOutcome: "skipped",
    success: true,
  };

  return sanitizeShadowRuntimeResult({
    success: true,
    mode,
    execution,
    metrics,
    replay: buildSkippedShadowReplay(metrics),
    warnings: [],
    errors: [],
  });
}

function buildInvalidInputResult(
  mode: ShadowMode,
  errors: string[],
  warnings: string[] = []
): ShadowRuntimeResult {
  return sanitizeShadowRuntimeResult({
    success: false,
    mode,
    execution: {
      executed: false,
      skipped: false,
      runtimeMode: null,
      terminalOutcome: "invalid_input",
      success: false,
    },
    metrics: emptyShadowMetrics(),
    replay: null,
    warnings: [...warnings],
    errors: [...errors],
  });
}

/**
 * Strip any accidental artifact-shaped keys from a value before exposure.
 * Shadow public surface must never carry runtime artifacts.
 */
function assertNoArtifactLeakage(result: ShadowRuntimeResult): void {
  const json = JSON.stringify(result);
  const forbiddenKeys = [
    '"transformationPlan"',
    '"visualDirection"',
    '"renderPlan"',
    '"formattedRequest"',
    '"transportResult"',
    '"validationDecision"',
    '"retryDecision"',
    '"validationEvidence"',
    '"artifacts"',
  ];
  for (const key of forbiddenKeys) {
    if (json.includes(key)) {
      throw new Error(`Shadow result leaked forbidden key ${key}.`);
    }
  }
}

export class ShadowRuntime {
  private readonly dependencies: ShadowRuntimeDependencies;

  constructor(dependencies: ShadowRuntimeDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * Execute one shadow observation cycle.
   * At most one AiOsRuntime.run call — never an automatic retry loop.
   */
  async run(input: ShadowRuntimeInput): Promise<ShadowRuntimeResult> {
    const validation = validateShadowRuntimeInput(input);
    if (!validation.valid) {
      return buildInvalidInputResult(
        input?.mode && SUPPORTED_SHADOW_MODES.includes(input.mode)
          ? input.mode
          : "disabled",
        [...validation.errors],
        [...validation.warnings]
      );
    }

    if (input.mode === "disabled") {
      return buildSkippedResult("disabled");
    }

    const transportKind = this.dependencies.runtime.shadowTransportKind;
    if (!isTransportKindCompatible(input.mode, transportKind)) {
      // Mode/kind mismatch: zero runtime calls, zero transport calls.
      return buildInvalidInputResult(input.mode, [
        SHADOW_TRANSPORT_KIND_MISMATCH_ERROR,
      ]);
    }

    const runtimeMode = mapRuntimeMode(input.mode);
    if (runtimeMode == null || input.runtimeInput == null) {
      return buildInvalidInputResult(input.mode, [
        "Unable to map shadow mode to runtime mode.",
      ]);
    }

    // Clone caller input so Shadow never mutates production/caller objects.
    const runtimeInput: AiOsRuntimeInput = {
      ...deepCloneJson(input.runtimeInput),
      mode: runtimeMode,
    };

    const startedAt = this.dependencies.now();
    let runtimeResult: AiOsRuntimeResult;
    try {
      // Exactly one runtime invocation — no retry loop.
      runtimeResult = await this.dependencies.runtime.run(runtimeInput);
    } catch (error) {
      const durationMs = Math.max(
        0,
        Math.round(this.dependencies.now() - startedAt)
      );
      const message =
        error instanceof Error
          ? error.message.replace(/\s+/g, " ").trim().slice(0, 200)
          : "unknown error";
      const metrics = emptyShadowMetrics();
      metrics.runtimeDurationMs = durationMs;
      metrics.runtimeMode = runtimeMode;
      return sanitizeShadowRuntimeResult({
        success: false,
        mode: input.mode,
        execution: {
          executed: true,
          skipped: false,
          runtimeMode,
          terminalOutcome: "invalid_runtime_state",
          success: false,
        },
        metrics,
        replay: null,
        warnings: [],
        errors: [message || "Shadow runtime execution failed."],
      });
    }

    const durationMs = Math.max(
      0,
      Math.round(this.dependencies.now() - startedAt)
    );

    // Collect metrics from trace/outcome only — discard all artifacts.
    const metrics = collectShadowMetrics(runtimeResult, durationMs);
    const replay = buildShadowReplayRecord(runtimeResult, metrics);

    const execution: ShadowExecutionResult = {
      executed: true,
      skipped: false,
      runtimeMode: runtimeResult.mode,
      terminalOutcome: runtimeResult.terminalOutcome,
      success: runtimeResult.success,
    };

    // Explicitly discard artifacts: never attach runtimeResult.artifacts.
    void runtimeResult.artifacts;

    const result: ShadowRuntimeResult = {
      success: runtimeResult.success,
      mode: input.mode,
      execution,
      metrics,
      replay: cloneShadowReplayRecord(replay),
      warnings: [...runtimeResult.warnings],
      errors: [...runtimeResult.errors],
    };

    assertNoArtifactLeakage(result);
    return sanitizeShadowRuntimeResult(result);
  }
}
