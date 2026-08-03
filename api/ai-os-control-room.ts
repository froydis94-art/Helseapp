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

import { timingSafeEqual } from "node:crypto";

import {
  ControlRoomService,
  ControlRoomServiceError,
  listControlRoomScenarios,
  type ControlRoomApiResponse,
  type ControlRoomScenarioId,
} from "../src/ai/control-room";

const ACCESS_HEADER = "x-ai-os-control-room-key";
const MIN_ACCESS_KEY_LENGTH = 24;

const ALLOWED_SCENARIO_IDS = new Set<string>([
  "balanced_recomposition_12w",
  "upper_body_definition_8w",
  "gradual_fat_loss_16w",
  "athletic_strength_24w",
]);

type VercelLikeRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
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

function headerValue(
  headers: VercelLikeRequest["headers"],
  name: string
): string | undefined {
  if (!headers) return undefined;
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === "string" ? raw : undefined;
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    // Spend comparable work without revealing length details to callers.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

function isAuthorized(req: VercelLikeRequest): boolean {
  const expected = getConfiguredAccessKey();
  if (expected == null) return false;
  const provided = headerValue(req.headers, ACCESS_HEADER);
  if (provided == null || provided.length === 0) return false;
  return timingSafeStringEqual(provided, expected);
}

function setSecurityHeaders(res: VercelLikeResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function send(
  res: VercelLikeResponse,
  status: number,
  body: ControlRoomApiResponse
): void {
  setSecurityHeaders(res);
  res.status(status).json(body);
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

async function handleGet(res: VercelLikeResponse): Promise<void> {
  const service = new ControlRoomService();
  send(res, 200, {
    ok: true,
    enabled: true,
    scenarios: service.listScenarios(),
  });
}

async function handlePost(
  req: VercelLikeRequest,
  res: VercelLikeResponse
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

  const service = new ControlRoomService();
  try {
    const result = await service.runScenario(
      scenarioId as ControlRoomScenarioId
    );
    send(res, 200, {
      ok: true,
      enabled: true,
      scenarios: listControlRoomScenarios(),
      result,
    });
  } catch (error) {
    if (error instanceof ControlRoomServiceError) {
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
  const method = (req.method ?? "GET").toUpperCase();

  if (method === "OPTIONS") {
    setSecurityHeaders(res);
    // Same-origin only — deliberately omit cross-origin allow headers.
    res.status(204).end();
    return;
  }

  if (!isControlRoomEnabled()) {
    disabledResponse(res);
    return;
  }

  if (!isAuthorized(req)) {
    unauthorizedResponse(res);
    return;
  }

  if (method === "GET") {
    await handleGet(res);
    return;
  }

  if (method === "POST") {
    await handlePost(req, res);
    return;
  }

  send(res, 405, {
    ok: false,
    enabled: true,
    code: "method_not_allowed",
    message: "Method not allowed.",
  });
}
