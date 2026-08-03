/**
 * Shadow Runtime barrel exports.
 */

export { SHADOW_RUNTIME_RULES_VERSION } from "./ShadowRuntimeTypes";
export type {
  ShadowExecutionResult,
  ShadowMetrics,
  ShadowMode,
  ShadowReplayRecord,
  ShadowReplayVersions,
  ShadowRuntimeInput,
  ShadowRuntimeInputValidation,
  ShadowRuntimeResult,
  ShadowStageDuration,
  ShadowTerminalOutcome,
} from "./ShadowRuntimeTypes";

export {
  cloneShadowMetrics,
  collectShadowMetrics,
  emptyShadowMetrics,
} from "./ShadowMetrics";

export {
  buildShadowReplayRecord,
  buildSkippedShadowReplay,
  cloneShadowReplayRecord,
} from "./ShadowReplay";

export {
  SHADOW_FORBIDDEN_CONTENT_ERROR,
  ShadowRuntime,
  createShadowRuntimeDependencies,
  createShadowRuntimeFromAiOsDeps,
  sanitizeShadowRuntimeResult,
  validateShadowRuntimeInput,
  type ShadowRuntimeDependencies,
} from "./ShadowRuntime";
export {
  disabledShadowInput,
  missingRuntimeInputShadowInput,
  runtimeOnlyInvalidGoalShadowInput,
  runtimeOnlyInvalidProfileShadowInput,
  runtimeOnlyValidShadowInput,
  shadowInputFromRuntime,
  transportMockAcceptedShadowInput,
  transportMockAwaitingValidationShadowInput,
  transportMockRetryShadowInput,
  transportMockTimeoutShadowInput,
  transportMockValidShadowInput,
} from "./fixtures";
