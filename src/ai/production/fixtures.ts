/**
 * Production Runtime fixtures — fictional, non-sensitive test data only.
 *
 * No real user identity, route URL, provider token, image URL, or health payload.
 */

import { SHADOW_RUNTIME_RULES_VERSION } from "../shadow/ShadowRuntimeTypes";
import type { ShadowRuntimeResult } from "../shadow/ShadowRuntimeTypes";
import { AI_OS_RUNTIME_RULES_VERSION } from "../runtime/AiOsRuntimeTypes";
import { runtimeOnlyValidShadowInput } from "../shadow/fixtures";
import type { ProductionRuntimeConfig } from "./ProductionRuntimeConfig";
import type {
  ProductionGatewayInput,
  ProductionRequestContext,
} from "./ProductionRuntimeTypes";

export const legacyOnlyProductionConfig: ProductionRuntimeConfig = {
  mode: "legacy_only",
  globalKillSwitch: false,
  shadowSampleRateBasisPoints: 0,
  shadowTimeoutMs: 1500,
};

export const shadowDryRunProductionConfig: ProductionRuntimeConfig = {
  mode: "legacy_with_shadow_dry_run",
  globalKillSwitch: false,
  shadowSampleRateBasisPoints: 10000,
  shadowTimeoutMs: 1500,
};

export const killSwitchProductionConfig: ProductionRuntimeConfig = {
  mode: "legacy_with_shadow_dry_run",
  globalKillSwitch: true,
  shadowSampleRateBasisPoints: 10000,
  shadowTimeoutMs: 1500,
};

export const zeroSamplingProductionConfig: ProductionRuntimeConfig = {
  mode: "legacy_with_shadow_dry_run",
  globalKillSwitch: false,
  shadowSampleRateBasisPoints: 0,
  shadowTimeoutMs: 1500,
};

export const fullSamplingProductionConfig: ProductionRuntimeConfig = {
  mode: "legacy_with_shadow_dry_run",
  globalKillSwitch: false,
  shadowSampleRateBasisPoints: 10000,
  shadowTimeoutMs: 2000,
};

export const validProductionRequestContext: ProductionRequestContext = {
  requestId: "req_fixture_alpha_001",
  routeId: "route_generate_future_you",
  locale: "nb",
  unitSystem: "metric",
  authenticated: false,
};

export const invalidSensitiveRequestContext: ProductionRequestContext = {
  requestId: "https://evil.example/leak",
  routeId: "Bearer sk-forbidden-token-value",
  locale: "nb",
  unitSystem: "metric",
  authenticated: false,
};

export const validProductionGatewayInput: ProductionGatewayInput = {
  requestContext: { ...validProductionRequestContext },
  shadowRuntimeInput: structuredClone(runtimeOnlyValidShadowInput),
};

function baseSafeMetrics(
  overrides: Partial<ShadowRuntimeResult["metrics"]> = {}
): ShadowRuntimeResult["metrics"] {
  return {
    runtimeDurationMs: 42,
    stageDurations: [
      { stage: "validate_input", durationMs: 5 },
      { stage: "transformation_engine", durationMs: 12 },
      { stage: "visual_director", durationMs: 8 },
      { stage: "render_plan", durationMs: 10 },
      { stage: "provider_formatter", durationMs: 7 },
    ],
    stageCount: 5,
    retryRequested: false,
    accepted: false,
    rejected: false,
    awaitingValidation: false,
    transportFailure: false,
    runtimeMode: "dry_run",
    runtimeVersion: AI_OS_RUNTIME_RULES_VERSION,
    formatterVersion: "1.0",
    validatorVersion: null,
    retryVersion: null,
    shadowRulesVersion: SHADOW_RUNTIME_RULES_VERSION,
    ...overrides,
  };
}

export const safeShadowDryRunResultFixture: ShadowRuntimeResult = {
  success: true,
  mode: "runtime_only",
  execution: {
    executed: true,
    skipped: false,
    runtimeMode: "dry_run",
    terminalOutcome: "dry_run_complete",
    success: true,
  },
  metrics: baseSafeMetrics(),
  replay: {
    traceId: "shadow-trace-fixture-should-not-leak",
    runtimeVersion: AI_OS_RUNTIME_RULES_VERSION,
    runtimeMode: "dry_run",
    terminalOutcome: "dry_run_complete",
    stageSequence: [
      "validate_input",
      "transformation_engine",
      "visual_director",
      "render_plan",
      "provider_formatter",
    ],
    versions: {
      shadowRulesVersion: SHADOW_RUNTIME_RULES_VERSION,
      runtimeRulesVersion: AI_OS_RUNTIME_RULES_VERSION,
    },
    metrics: baseSafeMetrics(),
  },
  warnings: [],
  errors: [],
};

export const failedShadowDryRunResultFixture: ShadowRuntimeResult = {
  success: false,
  mode: "runtime_only",
  execution: {
    executed: true,
    skipped: false,
    runtimeMode: "dry_run",
    terminalOutcome: "invalid_input",
    success: false,
  },
  metrics: baseSafeMetrics({
    runtimeDurationMs: 3,
    stageDurations: [{ stage: "validate_input", durationMs: 3 }],
    stageCount: 1,
  }),
  replay: null,
  warnings: [],
  errors: ["Shadow runtime input was invalid."],
};

export const unsafeShadowResultFixture: ShadowRuntimeResult = {
  success: true,
  mode: "runtime_only",
  execution: {
    executed: true,
    skipped: false,
    runtimeMode: "dry_run",
    terminalOutcome: "dry_run_complete",
    success: true,
  },
  metrics: baseSafeMetrics({
    formatterVersion: "https://unsafe.example/formatter",
  }),
  replay: null,
  warnings: ["https://unsafe.example/image.png"],
  errors: [],
};
