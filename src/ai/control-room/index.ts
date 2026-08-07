/**
 * AI OS Control Room barrel exports.
 */

export {
  CONTROL_ROOM_FORBIDDEN_CONTENT_ERROR,
  CONTROL_ROOM_RULES_VERSION,
  CONTROL_ROOM_SAFETY_STATUS,
  CONTROL_ROOM_SCHEMA_VERSION,
} from "./ControlRoomTypes";
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
} from "./ControlRoomTypes";

export {
  getControlRoomScenario,
  listControlRoomScenarioIds,
  listControlRoomScenarios,
} from "./ControlRoomFixtures";

export {
  ControlRoomProjectionError,
  projectControlRoomResult,
  sanitizeControlRoomProjection,
  validateControlRoomProjection,
} from "./ControlRoomProjection";

export {
  ControlRoomService,
  ControlRoomServiceError,
  buildControlRoomFailureShell,
} from "./ControlRoomService";

export {
  FORMATTER_COMPARISON_SCHEMA_VERSION,
  GENERATION_DIAGNOSTICS_SCHEMA_VERSION,
  PIPELINE_SNAPSHOT_SCHEMA_VERSION,
  LEGACY_FORMATTER_PATH_ID,
  BODY_SIMULATOR_FORMATTER_PATH_ID,
  TOKEN_ESTIMATE_CHARS_PER_TOKEN,
  buildFormatterComparison,
  buildGenerationDiagnostics,
  buildPipelineSnapshot,
  compareLegacyAndBodySimulatorFormatters,
  estimateProviderCostPlaceholder,
  estimateTokensFromPromptLength,
  runBodySimulatorFormatterComparisonPath,
  runLegacyFormatterComparisonPath,
} from "./FormatterComparisonDiagnostics";
export type {
  EstimatedMetric,
  FormatterComparison,
  FormatterPathFormatterSummary,
  FormatterPathId,
  FormatterPathPromptSummary,
  FormatterPathSide,
  GenerationDiagnostics,
  LegacyFormatterComparisonRun,
  PipelineSnapshot,
} from "./FormatterComparisonDiagnostics";

export {
  IMAGE_PREVIEW_ACCEPTED_MIME,
  IMAGE_PREVIEW_FORBIDDEN_CONTENT_ERROR,
  IMAGE_PREVIEW_MAX_BYTES,
  IMAGE_PREVIEW_RULES_VERSION,
  IMAGE_PREVIEW_SAFETY_STATUS,
  IMAGE_PREVIEW_SCHEMA_VERSION,
} from "./ImagePreviewTypes";
export type {
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
} from "./ImagePreviewTypes";

export {
  ImagePreviewProjectionError,
  previewStageLabel,
  projectImagePreviewResult,
  sanitizeImagePreviewProjection,
  validateImagePreviewProjection,
} from "./ImagePreviewProjection";

export {
  ImagePreviewService,
  ImagePreviewServiceError,
  buildProvisionalPreviewEvidence,
  getImagePreviewSafetyStatus,
  mapTransportFailureToPreviewError,
  validatePreviewSourceImage,
} from "./ImagePreviewService";

export {
  CONTROL_ROOM_ACCESS_HEADER,
  CONTROL_ROOM_ACCESS_HEADER_CANONICAL,
  MIN_CONTROL_ROOM_ACCESS_KEY_LENGTH,
  buildAccessContextRateKey,
  digestAccessKey,
  getConfiguredControlRoomAccessKey,
  isControlRoomAccessAuthorized,
  resolveControlRoomAccessHeader,
  timingSafeStringEqual,
} from "./ControlRoomAuth";

export {
  DEFAULT_PREVIEW_MAX_REQUESTS_PER_HOUR,
  MAX_PREVIEW_MAX_REQUESTS_PER_HOUR,
  MIN_PREVIEW_MAX_REQUESTS_PER_HOUR,
  PREVIEW_RATE_WINDOW_MS,
  consumePreviewRateLimit,
  createPreviewRateLimitStore,
  getDefaultPreviewRateLimitStore,
  parsePreviewMaxRequestsPerHour,
  resetDefaultPreviewRateLimitStore,
} from "./ControlRoomRateLimit";
