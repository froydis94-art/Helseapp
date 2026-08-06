/**
 * Safe transport error helpers — sanitize messages, map HTTP statuses.
 */

import type { ReplicateTransportErrorCode } from "./ReplicateTransportTypes";

export const MAX_SAFE_PROVIDER_ERROR_LENGTH = 200;

export function sanitizeProviderErrorMessage(raw: unknown): string {
  let text = "";
  if (typeof raw === "string") {
    text = raw;
  } else if (raw != null && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    if (typeof rec.detail === "string") text = rec.detail;
    else if (typeof rec.message === "string") text = rec.message;
    else if (typeof rec.error === "string") text = rec.error;
    else text = "Provider error";
  } else if (raw != null) {
    text = String(raw);
  }

  text = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  text = text.replace(/r8_[A-Za-z0-9]+/gi, "[redacted]");
  text = text.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  text = text.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "[redacted]");
  if (text.length === 0) text = "Provider error";
  if (text.length > MAX_SAFE_PROVIDER_ERROR_LENGTH) {
    text = `${text.slice(0, MAX_SAFE_PROVIDER_ERROR_LENGTH - 1)}…`;
  }
  return text;
}

export function mapHttpStatusToTransportError(
  status: number
): { code: ReplicateTransportErrorCode; retryable: boolean; message: string } {
  if (status === 401 || status === 403) {
    return {
      code: "provider_auth_error",
      retryable: false,
      message: "Provider authentication failed.",
    };
  }
  if (status === 429) {
    return {
      code: "provider_rate_limited",
      retryable: true,
      message: "Provider rate limited the request.",
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: "provider_validation_error",
      retryable: false,
      message: "Provider rejected the request as invalid.",
    };
  }
  if (status >= 500 && status <= 599) {
    return {
      code: "provider_unavailable",
      retryable: true,
      message: "Provider is temporarily unavailable.",
    };
  }
  return {
    code: "provider_failed",
    retryable: false,
    message: "Provider request failed.",
  };
}

/**
 * True when the error (or its cause chain) is an abort.
 * Node/undici often wraps AbortSignal aborts as TypeError: fetch failed
 * with cause AbortError — checking only the outer name misses those.
 */
export function isAbortError(err: unknown): boolean {
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current != null && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const e = current as { name?: string; code?: string; cause?: unknown };
    if (
      e.name === "AbortError" ||
      e.code === "ABORT_ERR" ||
      e.code === "ERR_ABORT" ||
      e.code === "UND_ERR_ABORTED"
    ) {
      return true;
    }
    current = e.cause;
  }
  return false;
}

/**
 * True when the error looks like a connect/headers/body timeout from fetch/undici.
 * Used so timeout-like TypeError: fetch failed maps to request_timeout instead of
 * opaque unknown_transport_error.
 */
export function isTimeoutLikeFetchError(err: unknown): boolean {
  if (isAbortError(err)) return true;
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current != null && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const e = current as {
      name?: string;
      code?: string;
      message?: string;
      cause?: unknown;
    };
    if (
      e.name === "TimeoutError" ||
      e.code === "UND_ERR_CONNECT_TIMEOUT" ||
      e.code === "UND_ERR_HEADERS_TIMEOUT" ||
      e.code === "UND_ERR_BODY_TIMEOUT" ||
      e.code === "ETIMEDOUT" ||
      e.code === "ESOCKETTIMEDOUT"
    ) {
      return true;
    }
    if (
      typeof e.message === "string" &&
      /timed?\s*out|timeout|HeadersTimeout|BodyTimeout|ConnectTimeout/i.test(
        e.message
      )
    ) {
      return true;
    }
    current = e.cause;
  }
  return false;
}
