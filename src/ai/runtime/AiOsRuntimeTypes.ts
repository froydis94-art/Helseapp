/**
 * AI OS Runtime contracts — single-cycle orchestration foundation.
 *
 * No image bytes, tokens, raw provider payloads, or physiology ownership.
 */

import type { FormatterOptions, FormattedImageRequest } from "../formatters/ProviderFormatter";
import type { RenderPlan } from "../render/RenderPlan";
import type { RetryAttemptState, RetryOrchestratorDecision } from "../retry/RetryOrchestratorTypes";
import type { TransformationPlan } from "../TransformationPlan";
import type { ReplicateSourceImage, ReplicateTransportResult } from "../transport/ReplicateTransportTypes";
import type { ReplicateTransportConfig } from "../transport/ReplicateTransportConfig";
import type { ValidationDecision } from "../validation-result/ValidationDecision";
import type { ValidationEvidence } from "../validation-result/ValidationEvidence";
import type { VisualDirection } from "../visual/VisualDirection";

export const AI_OS_RUNTIME_RULES_VERSION = "1.0" as const;

export type AiOsRuntimeMode = "dry_run" | "transport_mock";

export type AiOsRuntimeStage =
  | "input_validation"
  | "transformation"
  | "visual_direction"
  | "render_plan"
  | "render_plan_validation"
  | "provider_formatting"
  | "formatted_request_validation"
  | "transport"
  | "awaiting_validation"
  | "result_validation"
  | "retry_orchestration"
  | "completed";

export type AiOsRuntimeTerminalOutcome =
  | "dry_run_complete"
  | "awaiting_validation"
  | "accepted"
  | "rejected"
  | "transport_failed"
  | "retry_required"
  | "invalid_input"
  | "invalid_runtime_state";

export interface AiOsRuntimeInput {
  mode: AiOsRuntimeMode;

  profile: unknown;
  goal: unknown;

  formatterOptions?: FormatterOptions;

  sourceImage?: ReplicateSourceImage;

  validationEvidence?: ValidationEvidence;

  retryState?: RetryAttemptState;

  transportConfig?: ReplicateTransportConfig;
}

export interface AiOsRuntimeStageResult {
  stage: AiOsRuntimeStage;

  success: boolean;

  durationMs: number;

  warnings: string[];

  errors: string[];
}

export interface AiOsRuntimeTrace {
  traceId: string;

  rulesVersion: typeof AI_OS_RUNTIME_RULES_VERSION;

  stages: AiOsRuntimeStageResult[];

  versions: {
    transformationRulesVersion?: string;
    visualDirectionRulesVersion?: string;
    renderPlanRulesVersion?: string;
    formatterName?: string;
    formatterVersion?: string;
    transportAdapterId?: string;
    resultValidatorRulesVersion?: string;
    retryOrchestratorRulesVersion?: string;
  };
}

export interface AiOsRuntimeArtifacts {
  transformationPlan?: TransformationPlan;
  visualDirection?: VisualDirection;
  renderPlan?: RenderPlan;
  formattedRequest?: FormattedImageRequest;
  transportResult?: ReplicateTransportResult;
  validationDecision?: ValidationDecision;
  retryDecision?: RetryOrchestratorDecision;
}

export interface AiOsRuntimeResult {
  success: boolean;

  mode: AiOsRuntimeMode;

  terminalOutcome: AiOsRuntimeTerminalOutcome;

  trace: AiOsRuntimeTrace;

  artifacts: AiOsRuntimeArtifacts;

  warnings: string[];

  errors: string[];
}

export interface AiOsRuntimeInputValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
