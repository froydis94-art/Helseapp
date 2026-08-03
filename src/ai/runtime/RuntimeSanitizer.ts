/**
 * Runtime result sanitizer — redacts sensitive / transport content.
 *
 * Deterministic and idempotent. Does not mutate the input.
 *
 * Exactly one path may retain a validated HTTPS output image URL:
 * `artifacts.transportResult.imageUrl` when transportResult.success === true.
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

const SENSITIVE_NON_URL_PATTERNS: RegExp[] = [
  /data:image\//i,
  /\bBearer\b/i,
  /\bAuthorization\b/i,
  /REPLICATE_API_TOKEN/i,
  /\bapi[_-]?key\b/i,
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

/**
 * Validated successful transport output image URL — the only HTTPS URL allowed
 * in an internal runtime result. Not a broad URL allowlist.
 */
function isValidatedOutputImageUrl(value: string): boolean {
  if (!value.startsWith("https://")) return false;
  if (value.startsWith("https://api.replicate.com/")) return false;
  for (const pattern of SENSITIVE_NON_URL_PATTERNS) {
    if (pattern.test(value)) return false;
  }
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return false;
    if (u.username !== "" || u.password !== "") return false;
    if (u.hash !== "") return false;
    if (u.hostname === "api.replicate.com") return false;
    return true;
  } catch {
    return false;
  }
}

function isAllowedImageUrlPath(path: readonly string[]): boolean {
  return (
    path.length === 3 &&
    path[0] === "artifacts" &&
    path[1] === "transportResult" &&
    path[2] === "imageUrl"
  );
}

interface WalkContext {
  transportResultSuccess: boolean | null;
}

function stringIsForbiddenAtPath(
  text: string,
  path: readonly string[],
  ctx: WalkContext
): boolean {
  if (
    isAllowedImageUrlPath(path) &&
    ctx.transportResultSuccess === true &&
    isValidatedOutputImageUrl(text)
  ) {
    return false;
  }
  return stringMatchesForbidden(text);
}

function containsForbiddenContent(
  value: unknown,
  path: readonly string[] = [],
  ctx: WalkContext = { transportResultSuccess: null }
): boolean {
  if (typeof value === "string") {
    return stringIsForbiddenAtPath(value, path, ctx);
  }
  if (Array.isArray(value)) {
    return value.some((item, index) =>
      containsForbiddenContent(item, [...path, String(index)], ctx)
    );
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record).some((key) => {
      const nested = record[key];
      const nextPath = [...path, key];
      let nextCtx = ctx;
      if (
        path.length === 1 &&
        path[0] === "artifacts" &&
        key === "transportResult" &&
        nested !== null &&
        typeof nested === "object"
      ) {
        nextCtx = {
          transportResultSuccess:
            (nested as { success?: unknown }).success === true,
        };
      }
      return containsForbiddenContent(nested, nextPath, nextCtx);
    });
  }
  return false;
}

function redactForbiddenStrings(
  value: unknown,
  path: readonly string[] = [],
  ctx: WalkContext = { transportResultSuccess: null }
): void {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const nextPath = [...path, String(i)];
      if (typeof item === "string") {
        if (stringIsForbiddenAtPath(item, nextPath, ctx)) {
          value[i] = REDACTED_RUNTIME_CONTENT;
        }
      } else {
        redactForbiddenStrings(item, nextPath, ctx);
      }
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const nested = record[key];
      const nextPath = [...path, key];
      let nextCtx = ctx;
      if (
        path.length === 1 &&
        path[0] === "artifacts" &&
        key === "transportResult" &&
        nested !== null &&
        typeof nested === "object"
      ) {
        nextCtx = {
          transportResultSuccess:
            (nested as { success?: unknown }).success === true,
        };
      }
      if (typeof nested === "string") {
        if (stringIsForbiddenAtPath(nested, nextPath, nextCtx)) {
          record[key] = REDACTED_RUNTIME_CONTENT;
        }
      } else {
        redactForbiddenStrings(nested, nextPath, nextCtx);
      }
    }
  }
}

/**
 * Deep-clone and redact unsafe strings from a runtime result.
 * Marks the result failed with invalid_runtime_state when redaction occurs.
 *
 * A validated HTTPS `artifacts.transportResult.imageUrl` on a successful
 * transport result is preserved and does not alone invalidate the result.
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
