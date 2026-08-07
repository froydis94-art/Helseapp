/**
 * Shared Control Room access-key helpers for Vercel API routes.
 *
 * Consolidated so api/ai-os-control-room.ts and api/ai-os-image-preview.ts
 * do not redeclare the same top-level constants when typechecked together.
 */

import { createHash, timingSafeEqual } from "crypto";

export const ACCESS_HEADER = "x-ai-os-control-room-key";
export const ACCESS_HEADER_CANONICAL = "X-AI-OS-Control-Room-Key";
export const MIN_ACCESS_KEY_LENGTH = 24;

export type VercelLikeResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void; end(): void };
  json?(body: unknown): void;
  end?(): void;
};

export function readEnv(name: string): string | undefined {
  if (typeof process === "undefined" || process.env == null) return undefined;
  const value = process.env[name];
  return typeof value === "string" ? value : undefined;
}

export function getConfiguredAccessKey(): string | undefined {
  const key = readEnv("AI_OS_CONTROL_ROOM_ACCESS_KEY");
  if (key == null || key.length < MIN_ACCESS_KEY_LENGTH) return undefined;
  return key;
}

export function digestAccessKey(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function timingSafeStringEqual(
  provided: string,
  expected: string
): boolean {
  const providedDigest = digestAccessKey(provided);
  const expectedDigest = digestAccessKey(expected);
  return timingSafeEqual(providedDigest, expectedDigest);
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
  const target = ACCESS_HEADER;

  const headersObj = headers as {
    get?: (name: string) => unknown;
    entries?: () =>
      | IterableIterator<[string, unknown]>
      | Array<[string, unknown]>;
    forEach?: (cb: (value: unknown, key: string) => void) => void;
    [key: string]: unknown;
  };

  if (typeof headersObj.get === "function") {
    const viaGet =
      normalizeHeaderToken(headersObj.get(ACCESS_HEADER_CANONICAL)) ??
      normalizeHeaderToken(headersObj.get(ACCESS_HEADER)) ??
      normalizeHeaderToken(headersObj.get(target));
    if (viaGet != null) return viaGet;
  }

  const direct =
    normalizeHeaderToken(headersObj[ACCESS_HEADER_CANONICAL]) ??
    normalizeHeaderToken(headersObj[ACCESS_HEADER]) ??
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

export function isAuthorized(req: { headers?: unknown }): boolean {
  const expected = getConfiguredAccessKey();
  if (expected == null) return false;
  const provided = resolveControlRoomAccessHeader(req.headers);
  if (provided == null || provided.length === 0) return false;
  return timingSafeStringEqual(provided, expected);
}
