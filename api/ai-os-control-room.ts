/**
 * AI OS Control Room API — authorized fixture-only dry-run inspection.
 *
 * Feature flag: AI_OS_CONTROL_ROOM_ENABLED === "1"
 * Access key: AI_OS_CONTROL_ROOM_ACCESS_KEY (header X-AI-OS-Control-Room-Key)
 *
 * Disabled by default. No CORS wildcard. No provider network. No secrets returned.
 *
 * Implemented as TypeScript: Vercel natively bundles TS serverless functions and
 * local TS imports. Existing production APIs remain plain JS; Control Room keeps
 * service logic in src/ai/control-room.
 */

import { createHash, timingSafeEqual } from "node:crypto";

const ACCESS_HEADER = "x-ai-os-control-room-key";
const ACCESS_HEADER_CANONICAL = "X-AI-OS-Control-Room-Key";
const MIN_ACCESS_KEY_LENGTH = 24;

export const CONTROL_ROOM_RESPONSE_META = {
  service: "ai-os-control-room",
  apiVersion: "1.1",
} as const;

type ControlRoomResponseMeta = typeof CONTROL_ROOM_RESPONSE_META;

/** Local intersection — avoids editing shared ControlRoomTypes for meta. */
type ControlRoomApiResponse = {
  ok: boolean;
  enabled: boolean;
  code?: string;
  message?: string;
  scenarios?: unknown[];
  result?: unknown;
};

type ControlRoomHttpResponse = ControlRoomApiResponse & {
  meta: ControlRoomResponseMeta;
};

type ControlRoomConfigurationStatus =
  | "disabled"
  | "missing_access_key"
  | "ready";

type ControlRoomRuntimeModule = {
  ControlRoomService: new () => {
    listScenarios(): unknown[];
    runScenario(scenarioId: string): Promise<unknown>;
  };
  ControlRoomServiceError: new (...args: unknown[]) => { code?: string };
  listControlRoomScenarios(): unknown[];
};

async function loadControlRoomModule(): Promise<ControlRoomRuntimeModule> {
  return (await import("../src/ai/control-room/index")) as ControlRoomRuntimeModule;
}

const ALLOWED_SCENARIO_IDS = new Set<string>([
  "balanced_recomposition_12w",
  "upper_body_definition_8w",
  "gradual_fat_loss_16w",
  "athletic_strength_24w",
]);

type HeaderBag =
  | Record<string, string | string[] | undefined>
  | {
      get?(name: string): string | null | undefined;
      entries?(): IterableIterator<[string, string]> | Iterable<[string, string]>;
      forEach?(
        callback: (value: string, key: string) => void
      ): void;
      [key: string]: unknown;
    };

type VercelLikeRequest = {
  method?: string;
  headers?: HeaderBag;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelLikeResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): VercelLikeResponse;
  json(body: unknown): void;
  end(): void;
};

function readEnv(name: string): string | undefined {
  if (typeof process === "undefined" || process.env == null) return undefined;
  const value = process.env[name];
  return typeof value === "string" ? value : undefined;
}

function isControlRoomEnabled(): boolean {
  return readEnv("AI_OS_CONTROL_ROOM_ENABLED") === "1";
}

function getConfiguredAccessKey(): string | undefined {
  const key = readEnv("AI_OS_CONTROL_ROOM_ACCESS_KEY");
  if (key == null || key.length < MIN_ACCESS_KEY_LENGTH) return undefined;
  return key;
}

function getControlRoomConfigurationStatus(): ControlRoomConfigurationStatus {
  if (!isControlRoomEnabled()) return "disabled";
  if (getConfiguredAccessKey() == null) return "missing_access_key";
  return "ready";
}

function normalizeHeaderToken(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : undefined;
  }
  return undefined;
}

/**
 * Resolve X-AI-OS-Control-Room-Key from Node / Vercel / Headers-like objects.
 * Does not log header values.
 */
function resolveControlRoomAccessHeader(
  headers: HeaderBag | undefined
): string | undefined {
  if (headers == null) return undefined;

  const target = ACCESS_HEADER;

  if (typeof headers.get === "function") {
    const viaGet =
      normalizeHeaderToken(headers.get(ACCESS_HEADER_CANONICAL)) ??
      normalizeHeaderToken(headers.get(ACCESS_HEADER)) ??
      normalizeHeaderToken(headers.get(target));
    if (viaGet != null) return viaGet;
  }

  const asRecord = headers as Record<string, unknown>;
  const direct =
    normalizeHeaderToken(asRecord[ACCESS_HEADER_CANONICAL]) ??
    normalizeHeaderToken(asRecord[ACCESS_HEADER]) ??
    normalizeHeaderToken(asRecord[target]);
  if (direct != null) return direct;

  if (typeof headers.entries === "function") {
    try {
      for (const entry of headers.entries()) {
        const key = entry?.[0];
        const value = entry?.[1];
        if (typeof key === "string" && key.toLowerCase() === target) {
          const resolved = normalizeHeaderToken(value);
          if (resolved != null) return resolved;
        }
      }
    } catch {
      // Fall through to Object.keys iteration.
    }
  }

  if (typeof headers.forEach === "function") {
    let found: string | undefined;
    try {
      headers.forEach((value, key) => {
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

  for (const key of Object.keys(asRecord)) {
    if (key.toLowerCase() === target) {
      const resolved = normalizeHeaderToken(asRecord[key]);
      if (resolved != null) return resolved;
    }
  }

  return undefined;
}

function digestAccessKey(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function timingSafeStringEqual(provided: string, expected: string): boolean {
  const providedDigest = digestAccessKey(provided);
  const expectedDigest = digestAccessKey(expected);
  return timingSafeEqual(providedDigest, expectedDigest);
}

/** Exported for unit tests only — not part of the HTTP contract. */
export {
  digestAccessKey,
  timingSafeStringEqual,
  resolveControlRoomAccessHeader,
  getControlRoomConfigurationStatus,
};

function isAuthorized(req: VercelLikeRequest): boolean {
  const expected = getConfiguredAccessKey();
  if (expected == null) return false;
  const provided = resolveControlRoomAccessHeader(req.headers);
  if (provided == null || provided.length === 0) return false;
  return timingSafeStringEqual(provided, expected);
}

function setSecurityHeaders(res: VercelLikeResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function withMeta(body: ControlRoomApiResponse): ControlRoomHttpResponse {
  return {
    ...body,
    meta: { ...CONTROL_ROOM_RESPONSE_META },
  };
}

function send(
  res: VercelLikeResponse,
  status: number,
  body: ControlRoomApiResponse
): void {
  setSecurityHeaders(res);
  res.status(status).json(withMeta(body));
}

function disabledResponse(res: VercelLikeResponse): void {
  send(res, 404, {
    ok: false,
    enabled: false,
    code: "control_room_disabled",
    message: "Control Room is disabled.",
  });
}

function unauthorizedResponse(res: VercelLikeResponse): void {
  send(res, 401, {
    ok: false,
    enabled: true,
    code: "unauthorized",
    message: "Unauthorized.",
  });
}

function parseJsonBody(body: unknown): Record<string, unknown> | null {
  if (body == null) return null;
  if (typeof body === "string") {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return null;
}

function hasQueryAccessKey(req: VercelLikeRequest): boolean {
  if (!req.query) return false;
  const keys = Object.keys(req.query);
  return keys.some((key) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return (
      normalized === "key" ||
      normalized === "accesskey" ||
      normalized === "aioscontrolroomkey" ||
      normalized.includes("accesskey")
    );
  });
}

async function handleGet(
  res: VercelLikeResponse,
  controlRoomModule: ControlRoomRuntimeModule
): Promise<void> {
  const service = new controlRoomModule.ControlRoomService();
  send(res, 200, {
    ok: true,
    enabled: true,
    scenarios: service.listScenarios(),
  });
}

async function handlePost(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
  controlRoomModule: ControlRoomRuntimeModule
): Promise<void> {
  if (hasQueryAccessKey(req)) {
    send(res, 400, {
      ok: false,
      enabled: true,
      code: "invalid_request",
      message: "Invalid request.",
    });
    return;
  }

  const body = parseJsonBody(req.body);
  if (body == null) {
    send(res, 400, {
      ok: false,
      enabled: true,
      code: "invalid_request",
      message: "Invalid request.",
    });
    return;
  }

  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "scenarioId") {
    send(res, 400, {
      ok: false,
      enabled: true,
      code: "invalid_request",
      message: "Invalid request.",
    });
    return;
  }

  if (
    Object.prototype.hasOwnProperty.call(body, "accessKey") ||
    Object.prototype.hasOwnProperty.call(body, "key") ||
    Object.prototype.hasOwnProperty.call(body, "token")
  ) {
    send(res, 400, {
      ok: false,
      enabled: true,
      code: "invalid_request",
      message: "Invalid request.",
    });
    return;
  }

  const scenarioId = body.scenarioId;
  if (typeof scenarioId !== "string" || !ALLOWED_SCENARIO_IDS.has(scenarioId)) {
    send(res, 404, {
      ok: false,
      enabled: true,
      code: "scenario_not_found",
      message: "Scenario was not found.",
    });
    return;
  }

  const service = new controlRoomModule.ControlRoomService();
  try {
    const result = await service.runScenario(scenarioId);
    send(res, 200, {
      ok: true,
      enabled: true,
      scenarios: controlRoomModule.listControlRoomScenarios(),
      result,
    });
  } catch (error) {
    if (error instanceof controlRoomModule.ControlRoomServiceError) {
      if (error.code === "scenario_not_found") {
        send(res, 404, {
          ok: false,
          enabled: true,
          code: "scenario_not_found",
          message: "Scenario was not found.",
        });
        return;
      }
      if (error.code === "unsafe_result") {
        send(res, 500, {
          ok: false,
          enabled: true,
          code: "unsafe_result",
          message: "Unsafe result.",
        });
        return;
      }
      send(res, 500, {
        ok: false,
        enabled: true,
        code: "runtime_failure",
        message: "Runtime failure.",
      });
      return;
    }
    send(res, 500, {
      ok: false,
      enabled: true,
      code: "runtime_failure",
      message: "Runtime failure.",
    });
  }
}

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse
): Promise<void> {
  try {
    const method = (req.method ?? "GET").toUpperCase();

    if (method === "OPTIONS") {
      setSecurityHeaders(res);
      // Same-origin only — deliberately omit cross-origin allow headers.
      res.status(204).end();
      return;
    }

    const configurationStatus = getControlRoomConfigurationStatus();

    if (configurationStatus === "disabled") {
      disabledResponse(res);
      return;
    }

    // missing_access_key and wrong submitted key both look identical externally.
    if (configurationStatus === "missing_access_key" || !isAuthorized(req)) {
      unauthorizedResponse(res);
      return;
    }

    if (method !== "GET" && method !== "POST") {
      send(res, 405, {
        ok: false,
        enabled: true,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
      return;
    }

    let controlRoomModule: ControlRoomRuntimeModule;
    try {
      controlRoomModule = await loadControlRoomModule();
    } catch {
      send(res, 500, {
        ok: false,
        enabled: true,
        code: "runtime_failure",
        message: "Runtime failure.",
      });
      return;
    }

    if (method === "GET") {
      await handleGet(res, controlRoomModule);
      return;
    }

    await handlePost(req, res, controlRoomModule);
  } catch {
    send(res, 500, {
      ok: false,
      enabled: true,
      code: "runtime_failure",
      message: "Runtime failure.",
    });
  }
}
