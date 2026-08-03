/**
 * Runtime result sanitizer — redacts sensitive / transport content.
 *
 * Deterministic and idempotent. Does not mutate the input.
 */

import type { AiOsRuntimeResult } from "./AiOsRuntimeTypes";

export const REDACTED_RUNTIME_CONTENT = "[REDACTED_RUNTIME_CONTENT]";

export const RUNTIME_FORBIDDEN_CONTENT_ERROR =
  "Runtime result contained forbidden sensitive or transport content.";

const FORBIDDEN_SENSITIVE_PATTERNS: RegExp[] = [
  /data:image\//i,
  /\bBearer\b/i,
  /\bAuthorization\b/i,
  /REPLICATE_API_TOKEN/i,
  /\bapi[_-]?key\b/i,
  /https?:\/\//i,
  /\bat\s+\S+\s+\([^)]+\.\w+:\d+:\d+\)/i,
  /(?:[A-Za-z0-9+/]{80,}={0,2})/,
  /\br8_[A-Za-z0-9]+/i,
  /\bsk-[A-Za-z0-9]+/i,
];

function stringMatchesForbidden(text: string): boolean {
  for (const pattern of FORBIDDEN_SENSITIVE_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

function containsForbiddenContent(value: unknown): boolean {
  if (typeof value === "string") {
    return stringMatchesForbidden(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsForbiddenContent(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((nested) =>
      containsForbiddenContent(nested)
    );
  }
  return false;
}

function redactForbiddenStrings(value: unknown): void {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (typeof item === "string") {
        if (stringMatchesForbidden(item)) {
          value[i] = REDACTED_RUNTIME_CONTENT;
        }
      } else {
        redactForbiddenStrings(item);
      }
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const nested = record[key];
      if (typeof nested === "string") {
        if (stringMatchesForbidden(nested)) {
          record[key] = REDACTED_RUNTIME_CONTENT;
        }
      } else {
        redactForbiddenStrings(nested);
      }
    }
  }
}

/**
 * Deep-clone and redact unsafe strings from a runtime result.
 * Marks the result failed with invalid_runtime_state when redaction occurs.
 */
export function sanitizeAiOsRuntimeResult(
  result: AiOsRuntimeResult
): AiOsRuntimeResult {
  const clone = structuredClone(result) as AiOsRuntimeResult;
  if (!containsForbiddenContent(clone)) {
    return clone;
  }

  redactForbiddenStrings(clone);
  clone.success = false;
  clone.terminalOutcome = "invalid_runtime_state";
  if (!clone.errors.includes(RUNTIME_FORBIDDEN_CONTENT_ERROR)) {
    clone.errors = [...clone.errors, RUNTIME_FORBIDDEN_CONTENT_ERROR];
  }
  return clone;
}
