/**
 * AI OS Control Room contracts — authorized fixture-only developer inspection.
 *
 * JSON-serializable, secret-safe projection shapes. No image bytes, tokens,
 * health payloads, transport results, or production request context.
 */

import type { AiOsRuntimeStage } from "../runtime/AiOsRuntimeTypes";
import type { ControlRoomBodySimulatorView } from "../shadow/BodySimulatorShadowIntegration";

export const CONTROL_ROOM_SCHEMA_VERSION = 1 as const;
export const CONTROL_ROOM_RULES_VERSION = "1.0" as const;

export type ControlRoomScenarioId =
  | "balanced_recomposition_12w"
  | "upper_body_definition_8w"
  | "gradual_fat_loss_16w"
  | "athletic_strength_24w";

export interface ControlRoomScenarioSummary {
  id: ControlRoomScenarioId;
  title: string;
  description: string;
  timelineWeeks: number;
  focusZones: string[];
  direction: string;
}

export interface ControlRoomRunRequest {
  scenarioId: ControlRoomScenarioId;
  /** Allowlisted Body Simulator shadow scenario id (optional). */
  bodySimulatorScenarioId?: string;
}

export interface ControlRoomStageView {
  stage: AiOsRuntimeStage;
  label: string;
  success: boolean;
  durationMs: number;
  warningsCount: number;
  errorsCount: number;
}

export interface ControlRoomSafetyStatus {
  dryRunOnly: true;
  providerTrafficUsed: false;
  imageGenerated: false;
  legacyProductionChanged: false;
  sourceImageAccepted: false;
  healthPayloadAccepted: false;
}

export interface ControlRoomArtifactProjection {
  transformationPlan: unknown;
  visualDirection: unknown;
  renderPlan: unknown;

  formattedRequest: {
    formatterName: string;
    formatterVersion: string;
    providerFamily: string;
    sourceOperation: string;
    aspectRatio?: string;
    seed?: number;

    positivePrompt: string;
    negativePrompt: string;
  };
}

export interface ControlRoomRunResult {
  schemaVersion: typeof CONTROL_ROOM_SCHEMA_VERSION;
  rulesVersion: typeof CONTROL_ROOM_RULES_VERSION;

  success: boolean;
  scenario: ControlRoomScenarioSummary;

  runtime: {
    mode: "dry_run";
    terminalOutcome: "dry_run_complete";
    traceId: string;
    stages: ControlRoomStageView[];
    versions: Record<string, string | null>;
  };

  /** Null when sanitizer invalidates an unsafe projection. */
  artifacts: ControlRoomArtifactProjection | null;

  safety: ControlRoomSafetyStatus;

  /**
   * Body Simulator shadow inspection (Demand 022A).
   * Always present; status is "disabled" when flag is off.
   */
  bodySimulator: ControlRoomBodySimulatorView;

  warnings: string[];
  errors: string[];
}

export interface ControlRoomApiSuccess {
  ok: true;
  enabled: true;
  scenarios: ControlRoomScenarioSummary[];
  result?: ControlRoomRunResult;
}

export interface ControlRoomApiFailure {
  ok: false;
  enabled: boolean;
  code:
    | "control_room_disabled"
    | "unauthorized"
    | "method_not_allowed"
    | "invalid_request"
    | "scenario_not_found"
    | "runtime_failure"
    | "unsafe_result";

  message: string;
}

export type ControlRoomApiResponse =
  | ControlRoomApiSuccess
  | ControlRoomApiFailure;

export const CONTROL_ROOM_FORBIDDEN_CONTENT_ERROR =
  "Control Room projection contained forbidden content." as const;

export const CONTROL_ROOM_SAFETY_STATUS: ControlRoomSafetyStatus = {
  dryRunOnly: true,
  providerTrafficUsed: false,
  imageGenerated: false,
  legacyProductionChanged: false,
  sourceImageAccepted: false,
  healthPayloadAccepted: false,
};
