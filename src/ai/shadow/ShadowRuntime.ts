/**
 * ShadowRuntime — observes AI OS Runtime without replacing production.
 *
 * Modes:
 * - disabled: skip immediately
 * - runtime_only: AiOsRuntime dry_run once; metrics only; discard artifacts
 * - runtime_with_transport_mock: data-only mock transport once; metrics only; discard artifacts
 *
 * Construction is factory-only:
 * - createDryRunShadowRuntime
 * - createMockTransportShadowRuntime
 *
 * Transport is mock-only by construction (internal ShadowSafeRuntime + data-only adapter).
 * Never creates a real Replicate adapter, never reads environment variables,
 * never accepts caller generate callbacks / fetch / network deps,
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
import type { ReplicateTransportResult } from "../transport/ReplicateTransportTypes";
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
  type ShadowTransportKind,
} from "./ShadowRuntimeTypes";

export const SHADOW_FORBIDDEN_CONTENT_ERROR =
  "Shadow result contained forbidden sensitive content.";

export const SHADOW_TRANSPORT_KIND_MISMATCH_ERROR =
  "Shadow mode is incompatible with shadowTransportKind.";

export const SHADOW_UNBRANDED_TRANSPORT_ERROR =
  "createShadowRuntimeFromAiOsDeps rejects transport adapters. Use createMockTransportShadowRuntime with mockResults.";

export const SHADOW_MOCK_RESULTS_EXHAUSTED_ERROR =
  "Shadow mock transport results exhausted.";

export const SHADOW_DIRECT_CONSTRUCTION_ERROR =
  "ShadowRuntime can only be constructed via createDryRunShadowRuntime or createMockTransportShadowRuntime.";

export const SHADOW_DEPS_FACTORY_REMOVED_ERROR =
  "createShadowRuntimeDependencies is not a public construction API. Use createDryRunShadowRuntime or createMockTransportShadowRuntime.";

/** Module-private brand — never exported; never accepted from callers. */
const SHADOW_MOCK_TRANSPORT_BRAND: unique symbol = Symbol(
  "helseapp.shadow.mockTransport"
);

/**
 * Module-private construction token — never exported.
 * Required at runtime because TypeScript `private` is erased in emitted JS.
 */
const SHADOW_RUNTIME_CONSTRUCTION_TOKEN: unique symbol = Symbol(
  "helseapp.shadow.runtimeConstruction"
);

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

/**
 * Internal shadow-safe runtime — factory-branded only.
 * Not exported; callers cannot inject a custom `run` callback.
 */
interface ShadowSafeRuntime {
  run(input: AiOsRuntimeInput): Promise<AiOsRuntimeResult>;
  readonly shadowTransportKind: ShadowTransportKind;
}

/** Internal deps — not a public construction contract. */
interface ShadowRuntimeDeps {
  runtime: ShadowSafeRuntime;
  now: () => number;
}

/**
 * @deprecated Not a construction API. Opaque stub kept only so existing barrel
 * re-exports in index.ts typecheck until those barrels drop this symbol.
 * Direct runtime injection is unavailable.
 */
export type ShadowRuntimeDependencies = {
  readonly __shadowDirectConstructionRemoved: unique symbol;
};

/**
 * @deprecated Not a public construction API. Always throws.
 * Use createDryRunShadowRuntime or createMockTransportShadowRuntime.
 * Stub kept only so existing barrel re-exports in index.ts typecheck.
 */
export function createShadowRuntimeDependencies(
  ..._args: never[]
): never {
  throw new Error(SHADOW_DEPS_FACTORY_REMOVED_ERROR);
}

function buildShadowRuntimeDeps(options: {
  runtime: ShadowSafeRuntime;
  now?: () => number;
}): ShadowRuntimeDeps {
  return {
    runtime: options.runtime,
    now: options.now ?? (() => Date.now()),
  };
}

function exhaustedMockTransportResult(): ReplicateTransportResult {
  return {
    success: false,
    provider: "replicate",
    imageUrl: null,
    generationTimeMs: 0,
    error: {
      code: "adapter_disabled",
      message: SHADOW_MOCK_RESULTS_EXHAUSTED_ERROR,
      retryable: false,
    },
    warnings: [],
    metadata: {
      traceId: "shadow-mock-exhausted",
      pollingAttempts: 0,
    },
  };
}

/**
 * Internal data-only mock adapter.
 * generate may only clone the next fixture result or fail safely when exhausted.
 * No callbacks, fetch, env, or real Replicate adapter wiring.
 */
function createInternalDataOnlyMockTransport(
  mockResults: ReplicateTransportResult[]
): ReplicateTransportAdapter {
  const results = mockResults.map((result) => structuredClone(result));
  let nextIndex = 0;

  const adapter = {
    id: "shadow-mock-transport-v1",
    provider: "replicate" as const,
    async generate(): Promise<ReplicateTransportResult> {
      if (nextIndex >= results.length) {
        return exhaustedMockTransportResult();
      }
      const cloned = structuredClone(results[nextIndex]);
      nextIndex += 1;
      return cloned;
    },
    [SHADOW_MOCK_TRANSPORT_BRAND]: true as const,
  };

  return adapter as unknown as ReplicateTransportAdapter;
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
 * Dry-run / disabled shadow runtime — transport kind "none".
 * Cannot run runtime_with_transport_mock (mode/kind mismatch → invalid_input).
 * One of two supported public construction paths.
 */
export function createDryRunShadowRuntime(options?: {
  now?: () => number;
}): ShadowRuntime {
  const now = options?.now ?? (() => Date.now());
  const aiOs = new AiOsRuntime(createAiOsRuntimeDependencies({ now }));
  return new ShadowRuntime(
    buildShadowRuntimeDeps({
      runtime: wrapShadowSafeRuntime(aiOs, "none"),
      now,
    }),
    SHADOW_RUNTIME_CONSTRUCTION_TOKEN
  );
}

/**
 * Mock-transport shadow runtime — transport kind "mock".
 * Accepts only declarative mockResults (data-only). Internally constructs the
 * adapter; never accepts generate callbacks, fetch, runtime, or real adapters.
 * One of two supported public construction paths.
 */
export function createMockTransportShadowRuntime(options: {
  mockResults: ReplicateTransportResult[];
  now?: () => number;
}): ShadowRuntime {
  if (!Array.isArray(options.mockResults)) {
    throw new Error(
      "createMockTransportShadowRuntime requires a mockResults array of transport fixtures."
    );
  }
  const now = options.now ?? (() => Date.now());
  const mockTransport = createInternalDataOnlyMockTransport(options.mockResults);
  const aiOs = new AiOsRuntime(
    createAiOsRuntimeDependencies({
      transportAdapter: mockTransport,
      now,
    })
  );
  return new ShadowRuntime(
    buildShadowRuntimeDeps({
      runtime: wrapShadowSafeRuntime(aiOs, "mock"),
      now,
    }),
    SHADOW_RUNTIME_CONSTRUCTION_TOKEN
  );
}

/**
 * @deprecated Use createDryRunShadowRuntime or createMockTransportShadowRuntime.
 * Never accepts any transportAdapter (branded or otherwise) — dry-run only.
 * Signature preserved for public export compatibility.
 */
export function createShadowRuntimeFromAiOsDeps(
  aiOsDeps: AiOsRuntimeDependencies,
  now?: () => number
): ShadowRuntime {
  const resolvedNow = now ?? aiOsDeps.now;
  if (aiOsDeps.transportAdapter !== undefined) {
    throw new Error(SHADOW_UNBRANDED_TRANSPORT_ERROR);
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

/**
 * Shadow observation runtime.
 * Public construction is factory-only: module-private construction token
 * (TypeScript `private` constructor cannot be called from module-level factories).
 */
export class ShadowRuntime {
  private readonly dependencies: ShadowRuntimeDeps;

  /**
   * @internal Factories only. Requires module-private token — not obtainable by callers.
   */
  constructor(
    dependencies: ShadowRuntimeDeps,
    token: typeof SHADOW_RUNTIME_CONSTRUCTION_TOKEN
  ) {
    if (token !== SHADOW_RUNTIME_CONSTRUCTION_TOKEN) {
      throw new Error(SHADOW_DIRECT_CONSTRUCTION_ERROR);
    }
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
