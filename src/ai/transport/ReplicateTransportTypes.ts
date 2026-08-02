/**
 * Server-side Replicate transport contracts.
 *
 * Transport only — no physiology, prompt ownership, or result acceptance.
 * Results must never include tokens, source images, prompts, or raw payloads.
 */

import type { FormattedImageRequest } from "../formatters/ProviderFormatter";

export type ReplicatePredictionStatus =
  | "starting"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

export type ReplicateTransportErrorCode =
  | "adapter_disabled"
  | "missing_token"
  | "invalid_request"
  | "unsupported_source_image"
  | "request_aborted"
  | "request_timeout"
  | "provider_rate_limited"
  | "provider_auth_error"
  | "provider_validation_error"
  | "provider_unavailable"
  | "provider_failed"
  | "invalid_provider_response"
  | "polling_exhausted"
  | "unknown_transport_error";

export interface ReplicateSourceImage {
  value: string;
  kind: "https_url" | "data_uri";
  contentType?: "image/jpeg" | "image/png" | "image/webp";
}

export interface ReplicateTransportInput {
  formattedRequest: FormattedImageRequest;
  sourceImage: ReplicateSourceImage;
  traceId: string;
  abortSignal?: AbortSignal;
}

export interface ReplicateTransportSuccess {
  success: true;
  provider: "replicate";
  predictionId: string;
  model: string;
  status: "succeeded";
  imageUrl: string;
  generationTimeMs: number;
  warnings: string[];
  metadata: {
    traceId: string;
    formatterName: string;
    formatterVersion: string;
    pollingAttempts: number;
    providerStatus: string;
  };
}

export interface ReplicateTransportFailure {
  success: false;
  provider: "replicate";
  predictionId?: string;
  model?: string;
  status?: ReplicatePredictionStatus;
  imageUrl: null;
  generationTimeMs: number;
  error: {
    code: ReplicateTransportErrorCode;
    message: string;
    retryable: boolean;
    httpStatus?: number;
  };
  warnings: string[];
  metadata: {
    traceId: string;
    pollingAttempts: number;
    providerStatus?: string;
  };
}

export type ReplicateTransportResult =
  | ReplicateTransportSuccess
  | ReplicateTransportFailure;

export interface ReplicateTransportInputValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ReplicateCreatePredictionBody {
  model: string;
  input: Record<string, unknown>;
}
