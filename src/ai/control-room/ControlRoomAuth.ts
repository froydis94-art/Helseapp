/**
 * Shared Control Room access-key helpers (SHA-256 timing-safe compare).
 *
 * Used by the internal image-preview API. The Control Room API route keeps its
 * own audited copy so unlock behavior stays stable (Demand 017).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const crypto = require("crypto") as typeof import("crypto");

export const CONTROL_ROOM_ACCESS_HEADER = "x-ai-os-control-room-key";
export const CONTROL_ROOM_ACCESS_HEADER_CANONICAL =
  "X-AI-OS-Control-Room-Key";
export const MIN_CONTROL_ROOM_ACCESS_KEY_LENGTH = 24;

export function digestAccessKey(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

export function timingSafeStringEqual(
  provided: string,
  expected: string
): boolean {
  const providedDigest = digestAccessKey(provided);
  const expectedDigest = digestAccessKey(expected);
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
}

function normalizeHeaderToken(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : undefined;
  }
  return undefined;
}

export function resolveControlRoomAccessHeader(
  headers: unknown
): string | undefined {
  if (headers == null) return undefined;
  const target = CONTROL_ROOM_ACCESS_HEADER;

  const headersObj = headers as {
    get?: (name: string) => unknown;
    entries?: () => IterableIterator<[string, unknown]> | Array<[string, unknown]>;
    forEach?: (cb: (value: unknown, key: string) => void) => void;
    [key: string]: unknown;
  };

  if (typeof headersObj.get === "function") {
    const viaGet =
      normalizeHeaderToken(
        headersObj.get(CONTROL_ROOM_ACCESS_HEADER_CANONICAL)
      ) ??
      normalizeHeaderToken(headersObj.get(CONTROL_ROOM_ACCESS_HEADER)) ??
      normalizeHeaderToken(headersObj.get(target));
    if (viaGet != null) return viaGet;
  }

  const direct =
    normalizeHeaderToken(headersObj[CONTROL_ROOM_ACCESS_HEADER_CANONICAL]) ??
    normalizeHeaderToken(headersObj[CONTROL_ROOM_ACCESS_HEADER]) ??
    normalizeHeaderToken(headersObj[target]);
  if (direct != null) return direct;

  if (typeof headersObj.entries === "function") {
    try {
      for (const entry of headersObj.entries() as Iterable<[string, unknown]>) {
        const key = entry?.[0];
        const value = entry?.[1];
        if (typeof key === "string" && key.toLowerCase() === target) {
          const resolved = normalizeHeaderToken(value);
          if (resolved != null) return resolved;
        }
      }
    } catch {
      // Fall through.
    }
  }

  if (typeof headersObj.forEach === "function") {
    let found: string | undefined;
    try {
      headersObj.forEach((value, key) => {
        if (found != null) return;
        if (typeof key === "string" && key.toLowerCase() === target) {
          found = normalizeHeaderToken(value);
        }
      });
    } catch {
      found = undefined;
    }
    if (found != null) return found;
  }

  for (const key of Object.keys(headersObj)) {
    if (key.toLowerCase() === target) {
      const resolved = normalizeHeaderToken(headersObj[key]);
      if (resolved != null) return resolved;
    }
  }

  return undefined;
}

export function getConfiguredControlRoomAccessKey(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  const key = env.AI_OS_CONTROL_ROOM_ACCESS_KEY;
  if (typeof key !== "string" || key.length < MIN_CONTROL_ROOM_ACCESS_KEY_LENGTH) {
    return undefined;
  }
  return key;
}

export function isControlRoomAccessAuthorized(
  headers: unknown,
  env: Record<string, string | undefined> = process.env
): boolean {
  const expected = getConfiguredControlRoomAccessKey(env);
  if (expected == null) return false;
  const provided = resolveControlRoomAccessHeader(headers);
  if (provided == null || provided.length === 0) return false;
  return timingSafeStringEqual(provided, expected);
}

/** Stable anonymous rate-limit key from access context (never the raw key). */
export function buildAccessContextRateKey(
  headers: unknown
): string | undefined {
  const provided = resolveControlRoomAccessHeader(headers);
  if (provided == null || provided.length === 0) return undefined;
  return digestAccessKey(provided).toString("hex");
}
