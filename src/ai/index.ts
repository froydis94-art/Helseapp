/**
 * Helseapp AI domain barrel exports.
 *
 * Pure TypeScript foundation for body transformation planning.
 * Not wired into the prompt pipeline or UI — import when integrating.
 *
 * Path note (DEMAND_001): modules live under `src/ai/` (established in 7ef296b)
 * rather than nesting a new `src/ai/domain/` folder, to keep the additive surface
 * stable. Logic is still a pure domain layer with no React/Replicate deps.
 *
 * DEMAND_002 notes:
 * - `confidence` / `confidenceScore` → `estimateReliabilityScore` + `estimateReliability`
 * - Input `ValidationResult<T>` lives in `./validation.ts`
 * - Stub image-check result renamed to `ValidatorCheckResult`
 */

export {
  BODY_PROFILE_SCHEMA_VERSION,
  resolveBodyFatPct,
  resolveSex,
} from "./BodyProfile";
export type {
  ActivityLevel,
  BodyFrame,
  BodyProfile,
  BodyType,
  FocusZone,
  NutritionQuality,
  SexOrPresentation,
  TrainingLevel,
} from "./BodyProfile";

export { TRANSFORMATION_GOAL_SCHEMA_VERSION } from "./TransformationGoal";
export type {
  EffortLevel,
  FatDirection,
  GoalOutcome,
  MuscleDirection,
  TransformationGoal,
} from "./TransformationGoal";

export {
  TRANSFORMATION_PLAN_SCHEMA_VERSION,
  TRANSFORM_RULES_VERSION,
} from "./TransformationPlan";
export type {
  EstimateReliability,
  HeuristicKgRange,
  RegionalChangeTarget,
  TimelineCheckpoint,
  TransformationPlan,
  VisualIntensity,
} from "./TransformationPlan";

export {
  TransformationEngine,
  toEstimateReliability,
} from "./TransformationEngine";

export type {
  PromptBuilder,
  PromptPackage,
  StructuredPromptOutput,
} from "./PromptBuilder";
export {
  StubPromptBuilder,
  buildDirectedPromptPackage,
  buildPromptPackage,
} from "./PromptBuilder";

/** Photographic presentation layer (foundation only — not production-integrated). */
export type {
  ChangeVisibility,
  PresentationStyle,
  PostureTreatment,
  TextureStyle,
  VisualDirection,
} from "./visual";
export {
  VISUAL_DIRECTOR_RULES_VERSION,
  VisualDirector,
  directVisual,
} from "./visual";

export {
  StubTransformationValidator,
  Validator,
  type TransformationValidator,
  type ValidationInput,
  type ValidatorCheckResult,
} from "./TransformationValidator";

export type {
  GoalPlanResult,
  MonthlyProjection,
  TimelineWeekRange,
} from "./GoalPlanner";
export { GoalPlanner } from "./GoalPlanner";

/** Provider-neutral structured rendering contract (foundation only — not production-integrated). */
export type {
  RenderChange,
  RenderChangeDirection,
  RenderChangeKind,
  RenderOperation,
  RenderPlan,
  RenderPlanValidationResult,
} from "./render";
export {
  RENDER_PLAN_RULES_VERSION,
  RENDER_PLAN_SCHEMA_VERSION,
  buildRenderPlan,
  validateRenderPlan,
} from "./render";

/** Provider-independent image generation boundary (stubs only — not wired to production). */
export type {
  AspectRatio,
  GenerationQuality,
  GenerationStyle,
  ImageGenerationRequest,
  ImageGenerationResult,
  ModelAdapter,
  ReplicateAdapterRequestOptions,
} from "./model";
export { ModelRegistry, ReplicateAdapter } from "./model";

/** Provider formatter layer (foundation only — not production-integrated). */
export type {
  FormatterCapability,
  FormatterOptions,
  FormatterWarning,
  FormattedImageRequest,
  FormattedRequestValidationResult,
  ProviderFamily,
  ProviderFormatter,
} from "./formatters";
export {
  FLUX_FORMATTER_VERSION,
  FluxFormatter,
  SUPPORTED_FORMATTER_ASPECT_RATIOS,
  fluxFormatter,
  toImageGenerationRequest,
  validateFormattedImageRequest,
} from "./formatters";

/** Non-production AI OS v2 dry-run integration harness. */
export type {
  AiOsV2HarnessInput,
  AiOsV2HarnessReport,
  HarnessStage,
  HarnessStageResult,
} from "./harness";
export {
  buildHarnessTraceId,
  invalidPriorityFixture,
  missingBodyFatFixture,
  runAiOsV2Harness,
  sanitizeHarnessReport,
  shortTimelineFixture,
  validRecompositionFixture,
} from "./harness";

/** Result Validator foundation (deterministic policy — no real vision). */
export type {
  CandidateImageReference,
  DimensionEvidence,
  EvidenceConfidence,
  EvidenceSource,
  EvidenceValidationResult,
  ResultValidatorInput,
  RetryAdjustment,
  RetryRecommendation,
  ValidationDecision,
  ValidationDimension,
  ValidationEvidence,
  ValidationFailureCode,
  ValidationFinding,
  ValidationOutcome,
  ValidationSeverity,
} from "./validation-result";
export {
  ACCEPTANCE_THRESHOLDS,
  CRITICAL_CONFIDENCE_DIMENSIONS,
  DEFAULT_VALIDATOR_ATTEMPT,
  DEFAULT_VALIDATOR_MAX_ATTEMPTS,
  DIMENSION_WEIGHTS,
  HARD_GATE_THRESHOLDS,
  MAX_MAX_ATTEMPTS,
  MIN_ATTEMPT,
  MIN_MAX_ATTEMPTS,
  OVERALL_ACCEPTANCE_THRESHOLD,
  REQUIRED_VALIDATION_DIMENSIONS,
  RESULT_VALIDATOR_RULES_VERSION,
  VALIDATION_EVIDENCE_SCHEMA_VERSION,
  acceptedCandidateEvidence,
  anatomyRetryEvidence,
  borderlineEvidence,
  computeOverallScore,
  evaluateCandidate,
  identityRetryEvidence,
  invalidDuplicateDimensionEvidence,
  lowConfidenceIdentityEvidence,
  planAdherenceRetryEvidence,
  roundOverallScore,
  runResultValidatorFixture,
  unsafeCandidateEvidence,
  validateValidationEvidence,
} from "./validation-result";

export {
  TRANSFORM_PROGRESS_TAU,
  bfAtHorizon,
  normalizedTransformProgress,
  progressBand,
  transformProgress,
} from "./progressCurve";
export type { ProgressBand } from "./progressCurve";

/** Server-side Replicate transport (disabled by default — not production-wired). */
export type {
  ReplicateCreatePredictionBody,
  ReplicatePredictionPayload,
  ReplicatePredictionStatus,
  ReplicateSourceImage,
  ReplicateTransportConfig,
  ReplicateTransportDependencies,
  ReplicateTransportErrorCode,
  ReplicateTransportFailure,
  ReplicateTransportInput,
  ReplicateTransportInputValidation,
  ReplicateTransportResult,
  ReplicateTransportSuccess,
} from "./transport";
export {
  DEFAULT_CREATE_TIMEOUT_MS,
  DEFAULT_MAX_POLL_ATTEMPTS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_REPLICATE_API_BASE_URL,
  DEFAULT_REPLICATE_TRANSPORT_CONFIG,
  DEFAULT_REPLICATE_TRANSPORT_MODEL,
  DEFAULT_TOTAL_TIMEOUT_MS,
  MAX_DATA_URI_CHARS,
  MAX_SAFE_PROVIDER_ERROR_LENGTH,
  NEGATIVE_PROMPT_APPENDIX_LABEL,
  ReplicateTransportAdapter,
  buildReplicateCreatePredictionBody,
  createReplicateTransportConfigFromEnv,
  extractReplicateImageUrl,
  isAllowedReplicatePollUrl,
  isValidReplicateTransportModel,
  mapHttpStatusToTransportError,
  normalizeHttpFailure,
  normalizeReplicateFailure,
  normalizeReplicateStatus,
  sanitizeProviderErrorMessage,
  toSafeReplicateTransportConfigView,
  validateReplicateTransportInput,
} from "./transport";

/** Retry Orchestrator foundation (deterministic policy — not production-wired). */
export type {
  RetryAction,
  RetryAttemptState,
  RetryHistoryEntry,
  RetryOrchestratorDecision,
  RetryOrchestratorInput,
  RetryOrchestratorStage,
  RetryReasonCode,
  RetryStateValidationResult,
  RetryTerminalOutcome,
} from "./retry";
export {
  APPROVED_RETRY_ADJUSTMENTS,
  DEFERRED_RETRY_ADJUSTMENTS,
  NON_RETRYABLE_TRANSPORT_CODES,
  RETRYABLE_TRANSPORT_CODES,
  RETRY_ORCHESTRATOR_RULES_VERSION,
  acceptedValidationDecisionFixture,
  candidateMismatchStateFixture,
  createInitialRetryState,
  evaluateRetryTransition,
  exhaustedRetryStateFixture,
  initialRetryStateFixture,
  isApprovedRetryAdjustment,
  isDeferredRetryAdjustment,
  isRetryableTransportFailure,
  mergeAppliedAdjustments,
  nonRetryableAuthFailureFixture,
  retryValidationDecisionFixture,
  retryableTimeoutFailureFixture,
  safetyRejectDecisionFixture,
  transportSuccessFixture,
  unsupportedAdjustmentDecisionFixture,
  validateRetryAdjustments,
  validateRetryAttemptState,
} from "./retry";

export {
  GOAL_RANGES,
  PROFILE_RANGES,
  validateBodyProfile,
  validateTransformationGoal,
} from "./validation";
export type { NumericRange, ValidationResult } from "./validation";

/** AI OS Runtime foundation (single-cycle orchestration — not production-wired). */
export type {
  AiOsRuntimeArtifacts,
  AiOsRuntimeDependencies,
  AiOsRuntimeInput,
  AiOsRuntimeInputValidation,
  AiOsRuntimeMode,
  AiOsRuntimeResult,
  AiOsRuntimeStage,
  AiOsRuntimeStageResult,
  AiOsRuntimeTerminalOutcome,
  AiOsRuntimeTrace,
} from "./runtime";
export {
  AI_OS_RUNTIME_RULES_VERSION,
  AiOsRuntime,
  REDACTED_RUNTIME_CONTENT,
  RUNTIME_FORBIDDEN_CONTENT_ERROR,
  RUNTIME_FIXTURE_PREDICTION_ID,
  acceptedRuntimeEvidence,
  buildRuntimeTraceId,
  candidateMismatchRuntimeInput,
  createAiOsRuntimeDependencies,
  invalidRuntimeGoalInput,
  invalidRuntimeProfileInput,
  mismatchedRuntimeEvidence,
  retryRuntimeEvidence,
  runtimeTransportAuthFailureResult,
  runtimeTransportDisabledResult,
  runtimeTransportSuccessResult,
  runtimeTransportTimeoutResult,
  safetyRejectRuntimeEvidence,
  sanitizeAiOsRuntimeResult,
  transportSuccessWithAcceptedEvidenceInput,
  transportSuccessWithRetryEvidenceInput,
  transportSuccessWithSafetyRejectEvidenceInput,
  transportSuccessWithoutEvidenceInput,
  transportTimeoutRuntimeInput,
  validDryRunRuntimeInput,
  validTransportMockRuntimeInput,
  validateAiOsRuntimeInput,
} from "./runtime";

/** Shadow Runtime foundation (observation only — not production-wired). */
export type {
  ShadowExecutionResult,
  ShadowMetrics,
  ShadowMode,
  ShadowReplayRecord,
  ShadowReplayVersions,
  ShadowRuntimeDependencies,
  ShadowRuntimeInput,
  ShadowRuntimeInputValidation,
  ShadowRuntimeResult,
  ShadowStageDuration,
  ShadowTerminalOutcome,
} from "./shadow";
export {
  SHADOW_FORBIDDEN_CONTENT_ERROR,
  SHADOW_RUNTIME_RULES_VERSION,
  ShadowRuntime,
  buildShadowReplayRecord,
  buildSkippedShadowReplay,
  cloneShadowMetrics,
  cloneShadowReplayRecord,
  collectShadowMetrics,
  createShadowRuntimeDependencies,
  createShadowRuntimeFromAiOsDeps,
  disabledShadowInput,
  emptyShadowMetrics,
  missingRuntimeInputShadowInput,
  runtimeOnlyInvalidGoalShadowInput,
  runtimeOnlyInvalidProfileShadowInput,
  runtimeOnlyValidShadowInput,
  sanitizeShadowRuntimeResult,
  shadowInputFromRuntime,
  transportMockAcceptedShadowInput,
  transportMockAwaitingValidationShadowInput,
  transportMockRetryShadowInput,
  transportMockTimeoutShadowInput,
  transportMockValidShadowInput,
  validateShadowRuntimeInput,
} from "./shadow";

/** Production Runtime Integration foundation (migration policy — not route-wired). */
export type {
  ProductionGatewayInput,
  ProductionGatewayResult,
  ProductionRequestContext,
  ProductionRequestValidation,
  ProductionRuntimeAction,
  ProductionRuntimeConfig,
  ProductionRuntimeDecision,
  ProductionRuntimeGatewayDependencies,
  ProductionRuntimeMode,
  ProductionRuntimeReasonCode,
  ProductionTelemetry,
} from "./production";
export {
  DEFAULT_PRODUCTION_RUNTIME_CONFIG,
  PRODUCTION_FORBIDDEN_CONTENT_WARNING,
  PRODUCTION_RUNTIME_RULES_VERSION,
  PRODUCTION_SHADOW_FAILURE_WARNING,
  PRODUCTION_SHADOW_INPUT_REJECTED_WARNING,
  PRODUCTION_SHADOW_TIMEOUT_WARNING,
  PRODUCTION_SHADOW_UNAVAILABLE_WARNING,
  PRODUCTION_TELEMETRY_UNSAFE_WARNING,
  ProductionRuntimeGateway,
  REDACTED_PRODUCTION_CONTENT,
  calculateProductionSampleBucket,
  createProductionRuntimeConfigFromEnv,
  createProductionRuntimeGatewayDependencies,
  evaluateProductionRuntimePolicy,
  failedShadowDryRunResultFixture,
  fullSamplingProductionConfig,
  invalidSensitiveRequestContext,
  killSwitchProductionConfig,
  legacyOnlyProductionConfig,
  projectProductionTelemetry,
  safeShadowDryRunResultFixture,
  sanitizeProductionGatewayResult,
  shadowDryRunProductionConfig,
  unsafeShadowResultFixture,
  validProductionGatewayInput,
  validProductionRequestContext,
  validateProductionRequestContext,
  validateProductionTelemetry,
  zeroSamplingProductionConfig,
} from "./production";

/** AI OS Control Room (authorized fixture-only dry-run inspection). */
export type {
  ControlRoomApiFailure,
  ControlRoomApiResponse,
  ControlRoomApiSuccess,
  ControlRoomArtifactProjection,
  ControlRoomRunRequest,
  ControlRoomRunResult,
  ControlRoomSafetyStatus,
  ControlRoomScenarioId,
  ControlRoomScenarioSummary,
  ControlRoomStageView,
  ImagePreviewApiFailure,
  ImagePreviewApiResponse,
  ImagePreviewApiSuccess,
  ImagePreviewFormattedRequestSummary,
  ImagePreviewMimeType,
  ImagePreviewProviderSummary,
  ImagePreviewRequestMetadata,
  ImagePreviewResult,
  ImagePreviewSafetyStatus,
  ImagePreviewScenarioId,
  ImagePreviewStageView,
  ImagePreviewValidationSummary,
} from "./control-room";
export {
  CONTROL_ROOM_FORBIDDEN_CONTENT_ERROR,
  CONTROL_ROOM_RULES_VERSION,
  CONTROL_ROOM_SAFETY_STATUS,
  CONTROL_ROOM_SCHEMA_VERSION,
  ControlRoomProjectionError,
  ControlRoomService,
  ControlRoomServiceError,
  IMAGE_PREVIEW_ACCEPTED_MIME,
  IMAGE_PREVIEW_FORBIDDEN_CONTENT_ERROR,
  IMAGE_PREVIEW_MAX_BYTES,
  IMAGE_PREVIEW_RULES_VERSION,
  IMAGE_PREVIEW_SAFETY_STATUS,
  IMAGE_PREVIEW_SCHEMA_VERSION,
  ImagePreviewProjectionError,
  ImagePreviewService,
  ImagePreviewServiceError,
  buildControlRoomFailureShell,
  buildProvisionalPreviewEvidence,
  getControlRoomScenario,
  getImagePreviewSafetyStatus,
  listControlRoomScenarioIds,
  listControlRoomScenarios,
  previewStageLabel,
  projectControlRoomResult,
  projectImagePreviewResult,
  sanitizeControlRoomProjection,
  sanitizeImagePreviewProjection,
  validateControlRoomProjection,
  validateImagePreviewProjection,
  validatePreviewSourceImage,
} from "./control-room";
