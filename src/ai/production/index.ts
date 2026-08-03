/**
 * Production Runtime Integration barrel exports.
 *
 * Migration control foundation — not wired to production routes.
 */

export { PRODUCTION_RUNTIME_RULES_VERSION } from "./ProductionRuntimeTypes";
export type {
  ProductionGatewayInput,
  ProductionGatewayResult,
  ProductionRequestContext,
  ProductionRuntimeAction,
  ProductionRuntimeDecision,
  ProductionRuntimeMode,
  ProductionRuntimeReasonCode,
} from "./ProductionRuntimeTypes";

export {
  DEFAULT_PRODUCTION_RUNTIME_CONFIG,
  createProductionRuntimeConfigFromEnv,
  type ProductionRuntimeConfig,
} from "./ProductionRuntimeConfig";

export {
  calculateProductionSampleBucket,
  evaluateProductionRuntimePolicy,
  validateProductionRequestContext,
  type ProductionRequestValidation,
} from "./ProductionRuntimePolicy";

export {
  projectProductionTelemetry,
  validateProductionTelemetry,
  type ProductionTelemetry,
} from "./ProductionTelemetry";

export {
  ProductionRuntimeGateway,
  createProductionRuntimeGatewayDependencies,
  sanitizeProductionGatewayResult,
  type ProductionRuntimeGatewayDependencies,
} from "./ProductionRuntimeGateway";

export {
  PRODUCTION_FORBIDDEN_CONTENT_WARNING,
  PRODUCTION_SHADOW_FAILURE_WARNING,
  PRODUCTION_SHADOW_INPUT_REJECTED_WARNING,
  PRODUCTION_SHADOW_TIMEOUT_WARNING,
  PRODUCTION_SHADOW_UNAVAILABLE_WARNING,
  PRODUCTION_TELEMETRY_UNSAFE_WARNING,
  REDACTED_PRODUCTION_CONTENT,
} from "./ProductionRuntimeErrors";

export {
  failedShadowDryRunResultFixture,
  fullSamplingProductionConfig,
  invalidSensitiveRequestContext,
  killSwitchProductionConfig,
  legacyOnlyProductionConfig,
  safeShadowDryRunResultFixture,
  shadowDryRunProductionConfig,
  unsafeShadowResultFixture,
  validProductionGatewayInput,
  validProductionRequestContext,
  zeroSamplingProductionConfig,
} from "./fixtures";
