/**
 * AI OS Control Room API — authorized fixture-only dry-run inspection.
 *
 * Feature flag: AI_OS_CONTROL_ROOM_ENABLED === "1"
 * Access key: AI_OS_CONTROL_ROOM_ACCESS_KEY (header X-AI-OS-Control-Room-Key)
 *
 * Disabled by default. No CORS wildcard. No provider network. No secrets returned.
 *
 * Vercel Node for this project cannot execute ../src TypeScript modules at
 * runtime (dynamic import yields module_load_failed; module-scope
 * require/import yields FUNCTION_INVOCATION_FAILED). GET unlock therefore
 * uses inlined scenario summaries kept identical to ControlRoomFixtures
 * (enforced by tests). POST still loads ControlRoomService via a literal
 * dynamic import after validation (bundler-traceable; may still fail if the
 * TS graph is absent).
 *
 * No api-to-api bridge, no control-room barrel, no JS shim primary route.
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

/**
 * Exact public summaries from ControlRoomFixtures.listControlRoomScenarios().
 * Inlined so GET unlock boots without loading the src/ TypeScript graph on Vercel.
 * Must stay byte-identical to fixture summaries (see controlRoom.test.ts).
 */
const CONTROL_ROOM_SCENARIO_SUMMARIES = [
  {
    id: "balanced_recomposition_12w",
    title: "Balanced recomposition (12 weeks)",
    description:
      "A moderate, balanced body-recomposition scenario with gradual fat reduction and modest muscle development.",
    timelineWeeks: 12,
    focusZones: ["waist", "shoulders"],
    direction: "recomposition",
  },
  {
    id: "upper_body_definition_8w",
    title: "Upper-body definition (8 weeks)",
    description:
      "A conservative upper-body definition scenario emphasizing shoulders and back without extreme targets.",
    timelineWeeks: 8,
    focusZones: ["shoulders", "back", "arms"],
    direction: "upper_body_definition",
  },
  {
    id: "gradual_fat_loss_16w",
    title: "Gradual fat loss (16 weeks)",
    description:
      "A gradual and physiologically conservative fat-loss scenario with light muscle maintenance.",
    timelineWeeks: 16,
    focusZones: ["waist", "core"],
    direction: "fat_loss",
  },
  {
    id: "athletic_strength_24w",
    title: "Athletic strength (24 weeks)",
    description:
      "A longer athletic-strength scenario focused on shoulders, legs, and back without extreme muscle growth.",
    timelineWeeks: 24,
    focusZones: ["shoulders", "legs", "back"],
    direction: "athletic_strength",
  },
] as const;

const ALLOWED_SCENARIO_IDS = new Set(
  CONTROL_ROOM_SCENARIO_SUMMARIES.map((s) => s.id)
);

type ControlRoomServiceModuleShape = {
  ControlRoomService: new () => {
    runScenario(id: string): Promise<unknown>;
  };
  ControlRoomServiceError: new (
    code: string,
    message: string
  ) => Error & { code: string };
};

type VercelLikeResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void; end(): void };
  json?(body: unknown): void;
  end?(): void;
};

function cloneScenarioSummaries(): unknown[] {
  return CONTROL_ROOM_SCENARIO_SUMMARIES.map((summary) => ({
    id: summary.id,
    title: summary.title,
    description: summary.description,
    timelineWeeks: summary.timelineWeeks,
    focusZones: [...summary.focusZones],
    direction: summary.direction,
  }));
}

/**
 * Mutable helpers so tests can stub list/load without reloading the handler.
 * GET list is inlined (no src import). POST service uses literal dynamic import.
 */
const apiHelpers = {
  async loadControlRoomFixturesModule(): Promise<unknown> {
    return {
      listControlRoomScenarios: cloneScenarioSummaries,
    };
  },

  async listScenariosForGet(): Promise<unknown[]> {
    const imported = await apiHelpers.loadControlRoomFixturesModule();
    const listFn = resolveListControlRoomScenarios(imported);
    if (typeof listFn !== "function") {
      const err = new Error("fixtures_shape_invalid");
      err.name = "ControlRoomFixturesShapeError";
      throw err;
    }
    return listFn();
  },

  async loadControlRoomServiceModule(): Promise<unknown> {
    // Literal path for bundler tracing. Not evaluated on GET / unauthorized boot.
    return import("../src/ai/control-room/ControlRoomService");
  },

  normalizeControlRoomServiceModule(
    imported: unknown
  ): ControlRoomServiceModuleShape | null {
    return normalizeControlRoomServiceModule(imported);
  },
};

function resolveListControlRoomScenarios(
  imported: unknown
): (() => unknown[]) | null {
  if (imported == null || typeof imported !== "object") return null;
  const record = imported as Record<string, unknown>;
  if (typeof record.listControlRoomScenarios === "function") {
    return record.listControlRoomScenarios as () => unknown[];
  }
  const nested = record.default;
  if (
    nested != null &&
    typeof nested === "object" &&
    typeof (nested as Record<string, unknown>).listControlRoomScenarios ===
      "function"
  ) {
    return (nested as Record<string, unknown>)
      .listControlRoomScenarios as () => unknown[];
  }
  return null;
}

/**
 * Accept only proven module shapes:
 * A) named exports with ControlRoomService + ControlRoomServiceError
 * B) one default object containing the same exports
 */
function normalizeControlRoomServiceModule(
  imported: unknown
): ControlRoomServiceModuleShape | null {
  if (imported == null || typeof imported !== "object") {
    return null;
  }

  const record = imported as Record<string, unknown>;

  if (
    typeof record.ControlRoomService === "function" &&
    typeof record.ControlRoomServiceError === "function"
  ) {
    return {
      ControlRoomService:
        record.ControlRoomService as ControlRoomServiceModuleShape["ControlRoomService"],
      ControlRoomServiceError:
        record.ControlRoomServiceError as ControlRoomServiceModuleShape["ControlRoomServiceError"],
    };
  }

  const nested = record.default;
  if (
    nested != null &&
    typeof nested === "object" &&
    typeof (nested as Record<string, unknown>).ControlRoomService ===
      "function" &&
    typeof (nested as Record<string, unknown>).ControlRoomServiceError ===
      "function"
  ) {
    const n = nested as Record<string, unknown>;
    return {
      ControlRoomService:
        n.ControlRoomService as ControlRoomServiceModuleShape["ControlRoomService"],
      ControlRoomServiceError:
        n.ControlRoomServiceError as ControlRoomServiceModuleShape["ControlRoomServiceError"],
    };
  }

  return null;
}

function isControlRoomServiceError(
  error: unknown,
  ErrorCtor: ControlRoomServiceModuleShape["ControlRoomServiceError"]
): error is Error & { code: string } {
  if (error instanceof ErrorCtor) {
    return typeof (error as Error & { code?: unknown }).code === "string";
  }
  return (
    error != null &&
    typeof error === "object" &&
    (error as Error).name === "ControlRoomServiceError" &&
    typeof (error as { code?: unknown }).code === "string"
  );
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

function isAuthorized(req: { headers?: unknown }): boolean {
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
 * Authorized GET: list inlined fixture summaries only —
 * no ControlRoomService construct, no AiOsRuntime, no scenario execution.
 */
async function handleGet(res: VercelLikeResponse): Promise<void> {
  let imported: unknown;
  try {
    imported = await apiHelpers.loadControlRoomFixturesModule();
  } catch {
    sendRuntimeFailure(res, "module_load_failed");
    return;
  }

  const listFn = resolveListControlRoomScenarios(imported);
  if (typeof listFn !== "function") {
    sendRuntimeFailure(res, "module_shape_invalid");
    return;
  }

  let scenarios: unknown;
  try {
    scenarios = listFn();
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

  let loaded: unknown;
  try {
    loaded = await apiHelpers.loadControlRoomServiceModule();
  } catch {
    sendRuntimeFailure(res, "module_load_failed");
    return;
  }

  const controlRoomModule = apiHelpers.normalizeControlRoomServiceModule(loaded);
  if (controlRoomModule == null) {
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
      scenarios = await apiHelpers.listScenariosForGet();
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
    if (isControlRoomServiceError(error, controlRoomModule.ControlRoomServiceError)) {
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

    if (method === "GET") {
      await handleGet(res);
      return;
    }

    await handlePost(safeReq, res);
  } catch {
    // Unexpected authorized-path failure — keep diagnostic in the allowlisted set.
    sendRuntimeFailure(res, "scenario_run_failed");
  }
}

(handler as unknown as { default: typeof handler }).default = handler;
(handler as unknown as { CONTROL_ROOM_RESPONSE_META: typeof CONTROL_ROOM_RESPONSE_META }).CONTROL_ROOM_RESPONSE_META =
  CONTROL_ROOM_RESPONSE_META;
(handler as unknown as { digestAccessKey: typeof digestAccessKey }).digestAccessKey =
  digestAccessKey;
(handler as unknown as { timingSafeStringEqual: typeof timingSafeStringEqual }).timingSafeStringEqual =
  timingSafeStringEqual;
(handler as unknown as {
  resolveControlRoomAccessHeader: typeof resolveControlRoomAccessHeader;
}).resolveControlRoomAccessHeader = resolveControlRoomAccessHeader;
(handler as unknown as {
  getControlRoomConfigurationStatus: typeof getControlRoomConfigurationStatus;
}).getControlRoomConfigurationStatus = getControlRoomConfigurationStatus;

Object.defineProperty(handler, "listScenariosForGet", {
  configurable: true,
  enumerable: true,
  get() {
    return apiHelpers.listScenariosForGet.bind(apiHelpers);
  },
  set(fn: typeof apiHelpers.listScenariosForGet) {
    apiHelpers.listScenariosForGet = fn;
  },
});
Object.defineProperty(handler, "loadControlRoomFixturesModule", {
  configurable: true,
  enumerable: true,
  get() {
    return apiHelpers.loadControlRoomFixturesModule.bind(apiHelpers);
  },
  set(fn: typeof apiHelpers.loadControlRoomFixturesModule) {
    apiHelpers.loadControlRoomFixturesModule = fn;
  },
});
Object.defineProperty(handler, "loadControlRoomServiceModule", {
  configurable: true,
  enumerable: true,
  get() {
    return apiHelpers.loadControlRoomServiceModule.bind(apiHelpers);
  },
  set(fn: typeof apiHelpers.loadControlRoomServiceModule) {
    apiHelpers.loadControlRoomServiceModule = fn;
  },
});
Object.defineProperty(handler, "normalizeControlRoomServiceModule", {
  configurable: true,
  enumerable: true,
  get() {
    return apiHelpers.normalizeControlRoomServiceModule.bind(apiHelpers);
  },
  set(fn: typeof apiHelpers.normalizeControlRoomServiceModule) {
    apiHelpers.normalizeControlRoomServiceModule = fn;
  },
});

module.exports = handler;
module.exports.default = handler;
module.exports.CONTROL_ROOM_RESPONSE_META = CONTROL_ROOM_RESPONSE_META;
module.exports.digestAccessKey = digestAccessKey;
module.exports.timingSafeStringEqual = timingSafeStringEqual;
module.exports.resolveControlRoomAccessHeader = resolveControlRoomAccessHeader;
module.exports.getControlRoomConfigurationStatus =
  getControlRoomConfigurationStatus;
module.exports.normalizeControlRoomServiceModule =
  normalizeControlRoomServiceModule;
