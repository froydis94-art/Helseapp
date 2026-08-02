/**
 * Normalize Replicate prediction payloads into safe transport results.
 *
 * Accepts only HTTPS image URLs. Never returns tokens, prompts, or raw payloads.
 */

import {
  mapHttpStatusToTransportError,
  sanitizeProviderErrorMessage,
} from "./ReplicateErrors";
import type {
  ReplicatePredictionStatus,
  ReplicateTransportErrorCode,
  ReplicateTransportFailure,
} from "./ReplicateTransportTypes";

/** Minimal provider prediction fields we read. */
export interface ReplicatePredictionPayload {
  id?: unknown;
  status?: unknown;
  output?: unknown;
  error?: unknown;
  urls?: { get?: unknown };
  metrics?: { predict_time?: unknown };
}

export function normalizeReplicateStatus(
  value: unknown
): ReplicatePredictionStatus | null {
  if (typeof value !== "string") return null;
  switch (value) {
    case "starting":
    case "processing":
    case "succeeded":
    case "failed":
    case "canceled":
      return value;
    default:
      return null;
  }
}

function isHttpsImageUrl(value: string): boolean {
  if (!value.startsWith("https://")) return false;
  if (value.startsWith("https://api.replicate.com/")) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}

/**
 * Extract a single HTTPS image URL from provider output.
 * Rejects data URIs, http, empty, and poll API URLs.
 */
export function extractReplicateImageUrl(output: unknown): string | null {
  if (typeof output === "string") {
    const t = output.trim();
    if (t.startsWith("data:")) return null;
    if (t.startsWith("http://")) return null;
    return isHttpsImageUrl(t) ? t : null;
  }

  if (Array.isArray(output)) {
    for (const item of output) {
      const found = extractReplicateImageUrl(item);
      if (found) return found;
    }
    return null;
  }

  if (output != null && typeof output === "object") {
    const rec = output as Record<string, unknown>;
    for (const key of ["url", "image", "image_url", "href"] as const) {
      if (typeof rec[key] === "string") {
        const found = extractReplicateImageUrl(rec[key]);
        if (found) return found;
      }
    }
  }

  return null;
}

export function normalizeReplicateFailure(args: {
  code: ReplicateTransportErrorCode;
  message: string;
  retryable: boolean;
  traceId: string;
  generationTimeMs: number;
  httpStatus?: number;
  predictionId?: string;
  model?: string;
  status?: ReplicatePredictionStatus;
  pollingAttempts?: number;
  providerStatus?: string;
  warnings?: string[];
  providerError?: unknown;
}): ReplicateTransportFailure {
  const message =
    args.providerError !== undefined
      ? sanitizeProviderErrorMessage(args.providerError)
      : sanitizeProviderErrorMessage(args.message);

  const failure: ReplicateTransportFailure = {
    success: false,
    provider: "replicate",
    imageUrl: null,
    generationTimeMs: Math.max(0, args.generationTimeMs),
    error: {
      code: args.code,
      message: message.slice(0, 200),
      retryable: args.retryable,
    },
    warnings: args.warnings ?? [],
    metadata: {
      traceId: args.traceId,
      pollingAttempts: args.pollingAttempts ?? 0,
    },
  };

  if (args.httpStatus !== undefined) {
    failure.error.httpStatus = args.httpStatus;
  }
  if (args.predictionId !== undefined) {
    failure.predictionId = args.predictionId;
  }
  if (args.model !== undefined) {
    failure.model = args.model;
  }
  if (args.status !== undefined) {
    failure.status = args.status;
  }
  if (args.providerStatus !== undefined) {
    failure.metadata.providerStatus = args.providerStatus;
  }

  return failure;
}

export function normalizeHttpFailure(
  httpStatus: number,
  traceId: string,
  generationTimeMs: number,
  bodyText?: string,
  extras?: {
    predictionId?: string;
    model?: string;
    pollingAttempts?: number;
  }
): ReplicateTransportFailure {
  const mapped = mapHttpStatusToTransportError(httpStatus);
  const sanitizedBody = bodyText
    ? sanitizeProviderErrorMessage(bodyText)
    : mapped.message;
  return normalizeReplicateFailure({
    code: mapped.code,
    message: sanitizedBody,
    retryable: mapped.retryable,
    traceId,
    generationTimeMs,
    httpStatus,
    predictionId: extras?.predictionId,
    model: extras?.model,
    pollingAttempts: extras?.pollingAttempts,
    providerStatus: String(httpStatus),
  });
}

export function parsePredictionPayload(
  raw: unknown
): ReplicatePredictionPayload | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  return raw as ReplicatePredictionPayload;
}
