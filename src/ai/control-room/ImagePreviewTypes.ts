/**
 * AI OS Internal Image Preview contracts — authorized paid-provider visual lab.
 *
 * JSON-serializable, secret-safe projection shapes. Source image bytes and
 * provider tokens never appear in results.
 */

export const IMAGE_PREVIEW_SCHEMA_VERSION = 1 as const;
export const IMAGE_PREVIEW_RULES_VERSION = "1.0" as const;

export type ImagePreviewScenarioId =
  | "balanced_recomposition_12w"
  | "upper_body_definition_8w"
  | "gradual_fat_loss_16w"
  | "athletic_strength_24w";

export type ImagePreviewMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface ImagePreviewRequestMetadata {
  scenarioId: ImagePreviewScenarioId;
  billingConfirmed: true;
  requestId: string;
}

export interface ImagePreviewProviderSummary {
  providerFamily: string;
  model: string;
  predictionId?: string;
  status: string;
  durationMs: number;
}

export interface ImagePreviewValidationSummary {
  accepted: boolean;
  decision: string;
  warnings: string[];
  rejectionReasons: string[];
}

export interface ImagePreviewSafetyStatus {
  internalOnly: true;
  explicitBillingConfirmation: true;
  requestCapApplied: true;
  sourceImagePersisted: false;
  generatedImagePersistedByHelseApp: false;
  legacyProductionChanged: false;
  publicCutoverEnabled: false;
}

export interface ImagePreviewFormattedRequestSummary {
  formatterName: string;
  formatterVersion: string;
  providerFamily: string;
  model: string;
  aspectRatio?: string;
  positivePrompt: string;
  negativePrompt: string;
}

export interface ImagePreviewStageView {
  stage: string;
  label: string;
  success: boolean;
  durationMs: number;
  warningsCount: number;
  errorsCount: number;
}

export interface ImagePreviewResult {
  schemaVersion: typeof IMAGE_PREVIEW_SCHEMA_VERSION;

  success: boolean;
  scenarioId: ImagePreviewScenarioId;
  requestId: string;

  source: {
    mimeType: ImagePreviewMimeType;
    byteLength: number;
  };

  generatedImage: {
    url: string;
    expiresOrIsTemporary: true;
  } | null;

  runtime: {
    mode: string;
    terminalOutcome: string;
    traceId: string;
    stages: ImagePreviewStageView[];
    versions: Record<string, string | null>;
  };

  artifacts: {
    transformationPlan: unknown;
    visualDirection: unknown;
    renderPlan: unknown;
    formattedRequestSummary: ImagePreviewFormattedRequestSummary;
  } | null;

  provider: ImagePreviewProviderSummary | null;
  validation: ImagePreviewValidationSummary | null;
  safety: ImagePreviewSafetyStatus;

  warnings: string[];
  errors: string[];
}

export interface ImagePreviewApiSuccess {
  ok: true;
  enabled: true;
  result: ImagePreviewResult;
}

export interface ImagePreviewApiFailure {
  ok: false;
  enabled: boolean;
  code:
    | "preview_disabled"
    | "unauthorized"
    | "method_not_allowed"
    | "invalid_request"
    | "invalid_image"
    | "image_too_large"
    | "billing_confirmation_required"
    | "preview_rate_limited"
    | "scenario_not_found"
    | "runtime_failure"
    | "provider_failure"
    | "validation_rejected"
    | "unsafe_result";
  message: string;
  diagnostic?: string;
}

export type ImagePreviewApiResponse =
  | ImagePreviewApiSuccess
  | ImagePreviewApiFailure;

export const IMAGE_PREVIEW_FORBIDDEN_CONTENT_ERROR =
  "Image preview projection contained forbidden content." as const;

export const IMAGE_PREVIEW_SAFETY_STATUS: ImagePreviewSafetyStatus = {
  internalOnly: true,
  explicitBillingConfirmation: true,
  requestCapApplied: true,
  sourceImagePersisted: false,
  generatedImagePersistedByHelseApp: false,
  legacyProductionChanged: false,
  publicCutoverEnabled: false,
};

export const IMAGE_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;

export const IMAGE_PREVIEW_ACCEPTED_MIME: readonly ImagePreviewMimeType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
