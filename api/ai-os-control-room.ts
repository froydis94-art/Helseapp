/**
 * AI OS Control Room API — authorized fixture-only dry-run inspection.
 *
 * Feature flag: AI_OS_CONTROL_ROOM_ENABLED === "1"
 * Access key: AI_OS_CONTROL_ROOM_ACCESS_KEY (header X-AI-OS-Control-Room-Key)
 *
 * Disabled by default. No CORS wildcard. No provider network. No secrets returned.
 *
 * PATCH 016F: TypeScript entry so Vercel compiles the Control Room graph.
 * Lazy-loads only ./_control-room-runtime (never raw src/ai control-room TypeScript).
 */

// CJS crypto require kept for broad Vercel Node compatibility (PATCH 016D).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const crypto = require("crypto") as typeof import("crypto");

const ACCESS_HEADER = "x-ai-os-control-room-key";
const ACCESS_HEADER_CANONICAL = "X-AI-OS-Control-Room-Key";
const MIN_ACCESS_KEY_LENGTH = 24;

const CONTROL_ROOM_RESPONSE_META = {
  service: "ai-os-control-room",
  apiVersion: "1.1",
};

const ALLOWED_SCENARIO_IDS = new Set([
  "balanced_recomposition_12w",
  "upper_body_definition_8w",
  "gradual_fat_loss_16w",
  "athletic_strength_24w",
]);

type ControlRoomModuleShape = {
  ControlRoomService: new () => {
    runScenario(id: string): Promise<unknown>;
  };
  ControlRoomServiceError: new (
    code: string,
    message: string
  ) => Error & { code: string };
  listControlRoomScenarios: () => unknown[];
};

type VercelLikeResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void; end(): void };
  json?(body: unknown): void;
  end?(): void;
};

/**
 * Lazy load after feature-flag + authorization.
 * Literal require of the local compiled bridge only (PATCH 016F).
 */
function loadControlRoomModule(): unknown {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./_control-room-runtime");
}

/**
 * Accept only proven module shapes:
 * A) named CJS/TS exports
 * B) one default object containing the same exports
 */
function normalizeControlRoomModule(
  imported: unknown
): ControlRoomModuleShape | null {
  if (imported == null || typeof imported !== "object") {
    return null;
  }

  const record = imported as Record<string, unknown>;

  if (
    typeof record.ControlRoomService === "function" &&
    typeof record.ControlRoomServiceError === "function" &&
    typeof record.listControlRoomScenarios === "function"
  ) {
    return {
      ControlRoomService: record.ControlRoomService as ControlRoomModuleShape["ControlRoomService"],
      ControlRoomServiceError:
        record.ControlRoomServiceError as ControlRoomModuleShape["ControlRoomServiceError"],
      listControlRoomScenarios:
        record.listControlRoomScenarios as ControlRoomModuleShape["listControlRoomScenarios"],
    };
  }

  const nested = record.default;
  if (
    nested != null &&
    typeof nested === "object" &&
    typeof (nested as Record<string, unknown>).ControlRoomService ===
      "function" &&
    typeof (nested as Record<string, unknown>).ControlRoomServiceError ===
      "function" &&
    typeof (nested as Record<string, unknown>).listControlRoomScenarios ===
      "function"
  ) {
    const n = nested as Record<string, unknown>;
    return {
      ControlRoomService: n.ControlRoomService as ControlRoomModuleShape["ControlRoomService"],
      ControlRoomServiceError:
        n.ControlRoomServiceError as ControlRoomModuleShape["ControlRoomServiceError"],
      listControlRoomScenarios:
        n.listControlRoomScenarios as ControlRoomModuleShape["listControlRoomScenarios"],
    };
  }

  return null;
}

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

function getControlRoomConfigurationStatus():
  | "disabled"
  | "missing_access_key"
  | "ready" {
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

function resolveControlRoomAccessHeader(headers: unknown): string | undefined {
  if (headers == null) return undefined;
  const target = ACCESS_HEADER;

  const headersObj = headers as {
    get?: (name: string) => unknown;
    entries?: () => IterableIterator<[string, unknown]> | Array<[string, unknown]>;
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
      // Fall through to Object.keys iteration.
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

function digestAccessKey(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function timingSafeStringEqual(provided: string, expected: string): boolean {
  const providedDigest = digestAccessKey(provided);
  const expectedDigest = digestAccessKey(expected);
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
}

function isAuthorized(req) {
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

function withMeta<T extends Record<string, unknown>>(body: T): T & {
  meta: typeof CONTROL_ROOM_RESPONSE_META;
} {
  return {
    ...body,
    meta: { ...CONTROL_ROOM_RESPONSE_META },
  };
}

function send(
  res: VercelLikeResponse,
  status: number,
  body: Record<string, unknown>
): void {
  setSecurityHeaders(res);
  const payload = withMeta(body);
  const statusResult = res.status(status);
  if (typeof statusResult.json === "function") {
    statusResult.json(payload);
    return;
  }
  if (typeof res.json === "function") {
    res.json(payload);
  }
}

function sendRuntimeFailure(
  res: VercelLikeResponse,
  diagnostic: string
): void {
  send(res, 500, {
    ok: false,
    enabled: true,
    code: "runtime_failure",
    message: "Runtime failure.",
    diagnostic,
  });
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
      const parsed = JSON.parse(body) as unknown;
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

function hasQueryAccessKey(req: { query?: Record<string, unknown> }): boolean {
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

/**
 * Authorized GET: list scenarios only — no ControlRoomService construct,
 * no AiOsRuntime, no scenario execution.
 */
function handleGet(
  res: VercelLikeResponse,
  controlRoomModule: ControlRoomModuleShape
): void {
  if (typeof controlRoomModule.listControlRoomScenarios !== "function") {
    sendRuntimeFailure(res, "module_shape_invalid");
    return;
  }

  let scenarios: unknown;
  try {
    scenarios = controlRoomModule.listControlRoomScenarios();
  } catch {
    sendRuntimeFailure(res, "scenario_list_failed");
    return;
  }

  send(res, 200, {
    ok: true,
    enabled: true,
    scenarios,
  });
}

async function handlePost(
  req: { body?: unknown; query?: Record<string, unknown> },
  res: VercelLikeResponse,
  controlRoomModule: ControlRoomModuleShape
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

  if (typeof controlRoomModule.ControlRoomService !== "function") {
    sendRuntimeFailure(res, "module_shape_invalid");
    return;
  }

  let service: { runScenario(id: string): Promise<unknown> };
  try {
    service = new controlRoomModule.ControlRoomService();
  } catch {
    sendRuntimeFailure(res, "service_construct_failed");
    return;
  }

  try {
    const result = await service.runScenario(scenarioId);
    let scenarios: unknown;
    try {
      scenarios = controlRoomModule.listControlRoomScenarios();
    } catch {
      sendRuntimeFailure(res, "scenario_list_failed");
      return;
    }
    send(res, 200, {
      ok: true,
      enabled: true,
      scenarios,
      result,
    });
  } catch (error) {
    if (
      error != null &&
      typeof error === "object" &&
      error instanceof controlRoomModule.ControlRoomServiceError
    ) {
      const typed = error as Error & { code: string };
      if (typed.code === "scenario_not_found") {
        send(res, 404, {
          ok: false,
          enabled: true,
          code: "scenario_not_found",
          message: "Scenario was not found.",
        });
        return;
      }
      if (typed.code === "unsafe_result") {
        send(res, 500, {
          ok: false,
          enabled: true,
          code: "unsafe_result",
          message: "Unsafe result.",
        });
        return;
      }
      sendRuntimeFailure(res, "scenario_run_failed");
      return;
    }
    sendRuntimeFailure(res, "scenario_run_failed");
  }
}

async function handler(
  req: { method?: string; headers?: unknown; body?: unknown; query?: Record<string, unknown> } | null | undefined,
  res: VercelLikeResponse
): Promise<void> {
  try {
    const safeReq =
      req != null && typeof req === "object" ? req : { method: "GET" };
    const method =
      typeof safeReq.method === "string" ? safeReq.method.toUpperCase() : "GET";

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
    if (configurationStatus === "missing_access_key" || !isAuthorized(safeReq)) {
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

    let loaded: unknown;
    try {
      // Call through exports so tests can stub the loader without reloading the handler.
      loaded = (
        module.exports as { loadControlRoomModule: () => unknown }
      ).loadControlRoomModule();
    } catch {
      sendRuntimeFailure(res, "module_load_failed");
      return;
    }

    const controlRoomModule = normalizeControlRoomModule(loaded);
    if (controlRoomModule == null) {
      sendRuntimeFailure(res, "module_shape_invalid");
      return;
    }

    if (method === "GET") {
      handleGet(res, controlRoomModule);
      return;
    }

    await handlePost(safeReq, res, controlRoomModule);
  } catch {
    // Unexpected authorized-path failure — keep diagnostic in the allowlisted set.
    sendRuntimeFailure(res, "scenario_run_failed");
  }
}

module.exports = handler;
module.exports.default = handler;
module.exports.CONTROL_ROOM_RESPONSE_META = CONTROL_ROOM_RESPONSE_META;
module.exports.digestAccessKey = digestAccessKey;
module.exports.timingSafeStringEqual = timingSafeStringEqual;
module.exports.resolveControlRoomAccessHeader = resolveControlRoomAccessHeader;
module.exports.getControlRoomConfigurationStatus =
  getControlRoomConfigurationStatus;
module.exports.loadControlRoomModule = loadControlRoomModule;
module.exports.normalizeControlRoomModule = normalizeControlRoomModule;
