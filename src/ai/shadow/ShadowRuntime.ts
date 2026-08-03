/**
 * ShadowRuntime — observes AI OS Runtime without replacing production.
 *
 * Modes:
 * - disabled: skip immediately
 * - runtime_only: AiOsRuntime dry_run once; metrics only; discard artifacts
 * - runtime_with_transport_mock: transport_mock once; metrics only; discard artifacts
 *
 * Never exposes formatted requests, transport URLs, prompts, plans, or evidence.
 * Never performs automatic retries or production writes.
 */

import {
  AiOsRuntime,
  type AiOsRuntimeDependencies,
} from "../runtime";
import type { AiOsRuntimeInput, AiOsRuntimeResult } from "../runtime/AiOsRuntimeTypes";
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
} from "./ShadowRuntimeTypes";

export const SHADOW_FORBIDDEN_CONTENT_ERROR =
  "Shadow result contained forbidden sensitive content.";
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
  /** Injected AI OS Runtime — Shadow never reimplements layers. */
  runtime: AiOsRuntime;

  now: () => number;
}

/**
 * Build injectable shadow dependencies. Never reads environment variables.
 */
export function createShadowRuntimeDependencies(
  options: {
    runtime: AiOsRuntime;
    now?: () => number;
  }
): ShadowRuntimeDependencies {
  return {
    runtime: options.runtime,
    now: options.now ?? (() => Date.now()),
  };
}

/**
 * Convenience: wrap AiOsRuntimeDependencies into a ShadowRuntime.
 */
export function createShadowRuntimeFromAiOsDeps(
  aiOsDeps: AiOsRuntimeDependencies,
  now?: () => number
): ShadowRuntime {
  return new ShadowRuntime(
    createShadowRuntimeDependencies({
      runtime: new AiOsRuntime(aiOsDeps),
      now: now ?? aiOsDeps.now,
    })
  );
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
      const metrics = emptyShadowMetrics();
      return sanitizeShadowRuntimeResult({
        success: false,
        mode:
          input?.mode && SUPPORTED_SHADOW_MODES.includes(input.mode)
            ? input.mode
            : "disabled",
        execution: {
          executed: false,
          skipped: false,
          runtimeMode: null,
          terminalOutcome: "invalid_input",
          success: false,
        },
        metrics,
        replay: null,
        warnings: [...validation.warnings],
        errors: [...validation.errors],
      });
    }

    if (input.mode === "disabled") {
      return buildSkippedResult("disabled");
    }

    const runtimeMode = mapRuntimeMode(input.mode);
    if (runtimeMode == null || input.runtimeInput == null) {
      return sanitizeShadowRuntimeResult({
        success: false,
        mode: input.mode,
        execution: {
          executed: false,
          skipped: false,
          runtimeMode: null,
          terminalOutcome: "invalid_input",
          success: false,
        },
        metrics: emptyShadowMetrics(),
        replay: null,
        warnings: [],
        errors: ["Unable to map shadow mode to runtime mode."],
      });
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
