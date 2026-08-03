/**
 * Production Runtime Integration contracts — migration control boundary.
 *
 * Gateway returns policy + optional safe shadow telemetry only.
 * Legacy pipeline remains the user-visible production owner.
 * JSON-serializable. No images, prompts, tokens, plans, or health payloads.
 *
 * Shadow dependency (PATCH 015A): gateway accepts only a sealed
 * `ShadowRuntime` with `productionCapability === "dry_run_shadow_v1"`.
 * Structural `{ run }` callbacks and mock-transport Shadow are rejected.
 */

import type {
  ShadowRuntimeInput,
  ShadowTerminalOutcome,
} from "../shadow/ShadowRuntimeTypes";

export const PRODUCTION_RUNTIME_RULES_VERSION = "1.0" as const;

export type ProductionRuntimeMode =
  | "legacy_only"
  | "legacy_with_shadow_dry_run"
  | "v2_dry_run_internal"
  | "v2_live_disabled";

export type ProductionRuntimeAction =
  | "use_legacy_only"
  | "use_legacy_with_shadow"
  | "reject_unsupported_mode"
  | "disable_v2"
  | "skip_shadow";

export type ProductionRuntimeReasonCode =
  | "default_legacy_policy"
  | "shadow_dry_run_enabled"
  | "shadow_sample_not_selected"
  | "global_kill_switch"
  | "invalid_configuration"
  | "unsupported_mode"
  | "missing_request_identity"
  | "shadow_runtime_unavailable"
  | "safe_fallback_to_legacy";

export interface ProductionRequestContext {
  requestId: string;

  routeId: string;

  locale?: string;

  unitSystem?: "metric" | "us";

  authenticated: boolean;
}

export interface ProductionRuntimeDecision {
  rulesVersion: typeof PRODUCTION_RUNTIME_RULES_VERSION;

  action: ProductionRuntimeAction;

  reasonCode: ProductionRuntimeReasonCode;

  effectiveMode: "legacy_only" | "legacy_with_shadow_dry_run";

  legacyRequired: true;

  runShadowDryRun: boolean;

  userVisibleOwner: "legacy";

  v2ProviderTrafficAllowed: false;

  metadata: {
    sampleBucket: number | null;
    sampleRateBasisPoints: number;
    killSwitchActive: boolean;
  };

  warnings: string[];
  errors: string[];
}

export interface ProductionGatewayInput {
  requestContext: ProductionRequestContext;

  shadowRuntimeInput?: ShadowRuntimeInput;
}

export interface ProductionGatewayResult {
  success: boolean;

  decision: ProductionRuntimeDecision;

  legacy: {
    required: true;
    executedByGateway: false;
    owner: "existing_legacy_pipeline";
  };

  shadow: {
    requested: boolean;
    executed: boolean;
    success: boolean | null;
    terminalOutcome: ShadowTerminalOutcome | null;
    telemetry: import("./ProductionTelemetry").ProductionTelemetry | null;
  };

  warnings: string[];
  errors: string[];
}
