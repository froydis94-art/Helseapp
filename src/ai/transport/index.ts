/**
 * Server-side Replicate transport layer (disabled by default).
 *
 * Not production-integrated. Never exports API tokens.
 */

export type {
  ReplicateCreatePredictionBody,
  ReplicatePredictionStatus,
  ReplicateSourceImage,
  ReplicateTransportErrorCode,
  ReplicateTransportFailure,
  ReplicateTransportInput,
  ReplicateTransportInputValidation,
  ReplicateTransportResult,
  ReplicateTransportSuccess,
} from "./ReplicateTransportTypes";

export {
  DEFAULT_CREATE_TIMEOUT_MS,
  DEFAULT_MAX_POLL_ATTEMPTS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_REPLICATE_API_BASE_URL,
  DEFAULT_REPLICATE_TRANSPORT_CONFIG,
  DEFAULT_REPLICATE_TRANSPORT_MODEL,
  DEFAULT_TOTAL_TIMEOUT_MS,
  createReplicateTransportConfigFromEnv,
  isValidReplicateTransportModel,
  toSafeReplicateTransportConfigView,
} from "./ReplicateTransportConfig";
export type { ReplicateTransportConfig } from "./ReplicateTransportConfig";

export {
  MAX_SAFE_PROVIDER_ERROR_LENGTH,
  isAbortError,
  isTimeoutLikeFetchError,
  mapHttpStatusToTransportError,
  sanitizeProviderErrorMessage,
} from "./ReplicateErrors";

export {
  extractReplicateImageUrl,
  normalizeHttpFailure,
  normalizeReplicateFailure,
  normalizeReplicateStatus,
  parsePredictionPayload,
} from "./ReplicateResponseNormalizer";
export type { ReplicatePredictionPayload } from "./ReplicateResponseNormalizer";

export {
  MAX_DATA_URI_CHARS,
  NEGATIVE_PROMPT_APPENDIX_LABEL,
  ReplicateTransportAdapter,
  buildReplicateCreatePredictionBody,
  isAllowedReplicatePollUrl,
  validateReplicateTransportInput,
} from "./ReplicateTransportAdapter";
export type { ReplicateTransportDependencies } from "./ReplicateTransportAdapter";
