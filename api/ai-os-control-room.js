/**
 * AI OS Control Room API — authorized fixture-only dry-run inspection.
 *
 * Feature flag: AI_OS_CONTROL_ROOM_ENABLED === "1"
 * Access key: AI_OS_CONTROL_ROOM_ACCESS_KEY (header X-AI-OS-Control-Room-Key)
 *
 * Disabled by default. No CORS wildcard. No provider network. No secrets returned.
 */

const crypto = require("crypto");

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

async function loadControlRoomModule() {
  const imported = await import("../src/ai/control-room/index");
  // CJS/tsx dynamic-import interop may nest named exports under `.default`.
  if (
    imported != null &&
    typeof imported === "object" &&
    typeof imported.ControlRoomService !== "function" &&
    imported.default != null &&
    typeof imported.default === "object" &&
    typeof imported.default.ControlRoomService === "function"
  ) {
    return imported.default;
  }
  return imported;
}

function readEnv(name) {
  if (typeof process === "undefined" || process.env == null) return undefined;
  const value = process.env[name];
  return typeof value === "string" ? value : undefined;
}

function isControlRoomEnabled() {
  return readEnv("AI_OS_CONTROL_ROOM_ENABLED") === "1";
}

function getConfiguredAccessKey() {
  const key = readEnv("AI_OS_CONTROL_ROOM_ACCESS_KEY");
  if (key == null || key.length < MIN_ACCESS_KEY_LENGTH) return undefined;
  return key;
}

function getControlRoomConfigurationStatus() {
  if (!isControlRoomEnabled()) return "disabled";
  if (getConfiguredAccessKey() == null) return "missing_access_key";
  return "ready";
}

function normalizeHeaderToken(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : undefined;
  }
  return undefined;
}

function resolveControlRoomAccessHeader(headers) {
  if (headers == null) return undefined;
  const target = ACCESS_HEADER;

  if (typeof headers.get === "function") {
    const viaGet =
      normalizeHeaderToken(headers.get(ACCESS_HEADER_CANONICAL)) ??
      normalizeHeaderToken(headers.get(ACCESS_HEADER)) ??
      normalizeHeaderToken(headers.get(target));
    if (viaGet != null) return viaGet;
  }

  const asRecord = headers;
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
    let found;
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

function digestAccessKey(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function timingSafeStringEqual(provided, expected) {
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

function setSecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function withMeta(body) {
  return {
    ...body,
    meta: { ...CONTROL_ROOM_RESPONSE_META },
  };
}

function send(res, status, body) {
  setSecurityHeaders(res);
  res.status(status).json(withMeta(body));
}

function disabledResponse(res) {
  send(res, 404, {
    ok: false,
    enabled: false,
    code: "control_room_disabled",
    message: "Control Room is disabled.",
  });
}

function unauthorizedResponse(res) {
  send(res, 401, {
    ok: false,
    enabled: true,
    code: "unauthorized",
    message: "Unauthorized.",
  });
}

function parseJsonBody(body) {
  if (body == null) return null;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
  if (typeof body === "object" && !Array.isArray(body)) {
    return body;
  }
  return null;
}

function hasQueryAccessKey(req) {
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

async function handleGet(res, controlRoomModule) {
  const service = new controlRoomModule.ControlRoomService();
  send(res, 200, {
    ok: true,
    enabled: true,
    scenarios: service.listScenarios(),
  });
}

async function handlePost(req, res, controlRoomModule) {
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

async function handler(req, res) {
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

    let controlRoomModule;
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

    await handlePost(safeReq, res, controlRoomModule);
  } catch {
    send(res, 500, {
      ok: false,
      enabled: true,
      code: "runtime_failure",
      message: "Runtime failure.",
    });
  }
}

module.exports = handler;
module.exports.default = handler;
module.exports.CONTROL_ROOM_RESPONSE_META = CONTROL_ROOM_RESPONSE_META;
module.exports.digestAccessKey = digestAccessKey;
module.exports.timingSafeStringEqual = timingSafeStringEqual;
module.exports.resolveControlRoomAccessHeader = resolveControlRoomAccessHeader;
module.exports.getControlRoomConfigurationStatus = getControlRoomConfigurationStatus;
