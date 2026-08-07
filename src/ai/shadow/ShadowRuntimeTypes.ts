/**
 * Shadow Runtime contracts — observe AI OS Runtime without replacing production.
 *
 * JSON-serializable telemetry only. No image bytes, Base64, prompts, tokens,
 * Authorization headers, health payloads, or stack traces.
 *
 * Transport shadowing is mock-only by construction: real provider traffic is
 * not supported and requires a separate explicit CTO demand.
 * Mock transport is driven only by immutable result fixtures (data-only).
 */

import type {
  AiOsRuntimeInput,
  AiOsRuntimeMode,
  AiOsRuntimeStage,
  AiOsRuntimeTerminalOutcome,
} from "../runtime/AiOsRuntimeTypes";
import type { ReplicateTransportResult } from "../transport/ReplicateTransportTypes";
import type { ShadowBodySimulatorResult } from "./BodySimulatorShadowIntegration";

export const SHADOW_RUNTIME_RULES_VERSION = "1.0" as const;

export type ShadowMode =
  | "disabled"
  | "runtime_only"
  | "runtime_with_transport_mock";

/**
 * Explicit transport capability for shadow-safe runtimes.
 * - "none": dry-run / disabled only (no transport dependency)
 * - "mock": data-only mock transport fixtures (never real Replicate)
 */
export type ShadowTransportKind = "none" | "mock";

/**
 * Sealed production-gateway capability (factory-assigned only).
 * ProductionRuntimeGateway accepts only `"dry_run_shadow_v1"`.
 */
export type ShadowProductionCapability =
  | "dry_run_shadow_v1"
  | "mock_shadow_v1";

/**
 * Declarative mock-transport fixture queue.
 * Callers supply results only — never generate callbacks or network deps.
 */
export interface ShadowMockTransportScript {
  results: ReplicateTransportResult[];
}

export type ShadowTerminalOutcome =
  | AiOsRuntimeTerminalOutcome
  | "skipped";

export interface ShadowStageDuration {
  stage: AiOsRuntimeStage | string;
  durationMs: number;
}

/**
 * Architecture metrics only — no user data, prompts, images, or URLs.
 */
export interface ShadowMetrics {
  runtimeDurationMs: number;

  stageDurations: ShadowStageDuration[];

  stageCount: number;

  retryRequested: boolean;

  accepted: boolean;

  rejected: boolean;

  awaitingValidation: boolean;

  transportFailure: boolean;

  runtimeMode: AiOsRuntimeMode | null;

  runtimeVersion: string;

  formatterVersion: string | null;

  validatorVersion: string | null;

  retryVersion: string | null;

  shadowRulesVersion: typeof SHADOW_RUNTIME_RULES_VERSION;
}

/**
 * Version stamps copied from runtime trace — no plan/prompt/payload bodies.
 */
export interface ShadowReplayVersions {
  shadowRulesVersion: typeof SHADOW_RUNTIME_RULES_VERSION;

  runtimeRulesVersion: string;

  transformationRulesVersion?: string;

  visualDirectionRulesVersion?: string;

  renderPlanRulesVersion?: string;

  formatterName?: string;

  formatterVersion?: string;

  transportAdapterId?: string;

  resultValidatorRulesVersion?: string;

  retryOrchestratorRulesVersion?: string;
}

/**
 * Architecture telemetry for deterministic replay comparisons.
 * Must never store plans, prompts, images, URLs, tokens, evidence, or transport payloads.
 */
export interface ShadowReplayRecord {
  traceId: string;

  runtimeVersion: string;

  runtimeMode: AiOsRuntimeMode | null;

  terminalOutcome: ShadowTerminalOutcome;

  stageSequence: string[];

  versions: ShadowReplayVersions;

  metrics: ShadowMetrics;
}

/** Compact execution summary for one shadow invocation. */
export interface ShadowExecutionResult {
  executed: boolean;

  skipped: boolean;

  runtimeMode: AiOsRuntimeMode | null;

  terminalOutcome: ShadowTerminalOutcome;

  success: boolean;
}

/**
 * Public shadow result surface — artifacts discarded; never includes
 * formatted requests, transport URLs, prompts, plans, or evidence.
 */
export interface ShadowRuntimeResult {
  success: boolean;

  mode: ShadowMode;

  execution: ShadowExecutionResult;

  metrics: ShadowMetrics;

  replay: ShadowReplayRecord | null;

  warnings: string[];

  errors: string[];

  /**
   * Optional Body Simulator shadow phase (Demand 022A).
   * Fixture-only; never provider/prompt/image. Absent when not applicable.
   */
  bodySimulator?: ShadowBodySimulatorResult;
}

/**
 * Shadow invocation input. `runtimeInput.mode` is overridden by ShadowMode
 * (`runtime_only` → dry_run, `runtime_with_transport_mock` → transport_mock).
 */
export interface ShadowRuntimeInput {
  mode: ShadowMode;

  runtimeInput?: AiOsRuntimeInput;

  /**
   * Explicit Body Simulator shadow enable for this invocation (Demand 022A).
   * Shadow never reads environment flags — callers pass this after server-side checks.
   */
  bodySimulatorEnabled?: boolean;

  /**
   * Allowlisted Body Simulator shadow scenario id (Demand 022A).
   * Ignored unless bodySimulatorEnabled is true.
   */
  bodySimulatorScenarioId?: string;
}

export interface ShadowRuntimeInputValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
