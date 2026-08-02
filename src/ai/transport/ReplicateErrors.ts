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

export function isAbortError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const e = err as { name?: string; code?: string };
  return e.name === "AbortError" || e.code === "ABORT_ERR";
}
