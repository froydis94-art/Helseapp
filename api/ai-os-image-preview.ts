/**
 * AI OS Internal Image Preview API — one paid provider preview (flagged).
 *
 * Feature flag: AI_OS_IMAGE_PREVIEW_ENABLED === "1"
 * Access key: AI_OS_CONTROL_ROOM_ACCESS_KEY (header X-AI-OS-Control-Room-Key)
 *
 * Disabled by default. No CORS wildcard. No secrets returned.
 * Auth helpers are duplicated (not imported from Control Room route) so the
 * existing Control Room unlock path stays untouched.
 *
 * Vercel Node cannot runtime-load the src TypeScript AI OS graph (dynamic
 * import of the service module fails with ERR_UNSUPPORTED_DIR_IMPORT on
 * barrel paths like ../runtime). The AI OS preview graph is therefore
 * build-bundled to a single CJS artifact and required only after
 * auth/flag/validation — never at cold-start module scope.
 *
 * No api sibling runtime bridge. No JS shim. No legacy Replicate helper bypass.
 */

// CJS crypto require kept for broad Vercel Node compatibility.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const crypto = require("crypto") as typeof import("crypto");

const ACCESS_HEADER = "x-ai-os-control-room-key";
const ACCESS_HEADER_CANONICAL = "X-AI-OS-Control-Room-Key";
const MIN_ACCESS_KEY_LENGTH = 24;

const PREVIEW_RESPONSE_META = {
  service: "ai-os-image-preview",
  apiVersion: "1.0",
};

const DEFAULT_MAX_PER_HOUR = 3;
const MIN_MAX_PER_HOUR = 1;
const MAX_MAX_PER_HOUR = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;

/** Best-effort in-memory hourly cap (per serverless instance). */
const rateBuckets = new Map<string, number[]>();

const ALLOWED_SCENARIO_IDS = new Set([
  "balanced_recomposition_12w",
  "upper_body_definition_8w",
  "gradual_fat_loss_16w",
  "athletic_strength_24w",
]);

type ImagePreviewServiceModuleShape = {
  ImagePreviewService: new (deps?: unknown) => {
    runPreview(input: {
      scenarioId: string;
      billingConfirmed: unknown;
      sourceImageDataUri: unknown;
    }): Promise<unknown>;
  };
  ImagePreviewServiceError: new (
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

const apiHelpers = {
  /**
   * Load the prebundled ImagePreviewService graph (CJS).
   * Stubbable in tests. Never dynamic-imports TypeScript under ../src.
   */
  async loadImagePreviewServiceModule(): Promise<unknown> {
    // Literal path so Vercel NFT includes the prebundled CJS graph.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("../src/ai/control-room/imagePreviewRuntime.bundle.cjs");
  },

  normalizeImagePreviewServiceModule(
    imported: unknown
  ): ImagePreviewServiceModuleShape | null {
    return normalizeImagePreviewServiceModule(imported);
  },
};

function normalizeImagePreviewServiceModule(
  imported: unknown
): ImagePreviewServiceModuleShape | null {
  if (imported == null || typeof imported !== "object") return null;
  const record = imported as Record<string, unknown>;

  if (
    typeof record.ImagePreviewService === "function" &&
    typeof record.ImagePreviewServiceError === "function"
  ) {
    return {
      ImagePreviewService:
        record.ImagePreviewService as ImagePreviewServiceModuleShape["ImagePreviewService"],
      ImagePreviewServiceError:
        record.ImagePreviewServiceError as ImagePreviewServiceModuleShape["ImagePreviewServiceError"],
    };
  }

  const nested = record.default;
  if (
    nested != null &&
    typeof nested === "object" &&
    typeof (nested as Record<string, unknown>).ImagePreviewService ===
      "function" &&
    typeof (nested as Record<string, unknown>).ImagePreviewServiceError ===
      "function"
  ) {
    const n = nested as Record<string, unknown>;
    return {
      ImagePreviewService:
        n.ImagePreviewService as ImagePreviewServiceModuleShape["ImagePreviewService"],
      ImagePreviewServiceError:
        n.ImagePreviewServiceError as ImagePreviewServiceModuleShape["ImagePreviewServiceError"],
    };
  }

  return null;
}

function isImagePreviewServiceError(
  error: unknown,
  ErrorCtor: ImagePreviewServiceModuleShape["ImagePreviewServiceError"]
): error is Error & { code: string } {
  if (error instanceof ErrorCtor) {
    return typeof (error as Error & { code?: unknown }).code === "string";
  }
  return (
    error != null &&
    typeof error === "object" &&
    (error as Error).name === "ImagePreviewServiceError" &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

function readEnv(name: string): string | undefined {
  if (typeof process === "undefined" || process.env == null) return undefined;
  const value = process.env[name];
  return typeof value === "string" ? value : undefined;
}

function isPreviewEnabled(): boolean {
  return readEnv("AI_OS_IMAGE_PREVIEW_ENABLED") === "1";
}

function getConfiguredAccessKey(): string | undefined {
  const key = readEnv("AI_OS_CONTROL_ROOM_ACCESS_KEY");
  if (key == null || key.length < MIN_ACCESS_KEY_LENGTH) return undefined;
  return key;
}

function parseMaxRequestsPerHour(): number {
  const raw = readEnv("AI_OS_IMAGE_PREVIEW_MAX_REQUESTS_PER_HOUR");
  if (raw === undefined || raw === "") return DEFAULT_MAX_PER_HOUR;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return DEFAULT_MAX_PER_HOUR;
  if (n < MIN_MAX_PER_HOUR || n > MAX_MAX_PER_HOUR) return DEFAULT_MAX_PER_HOUR;
  return n;
}

function digestAccessKey(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function timingSafeStringEqual(provided: string, expected: string): boolean {
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

function isAuthorized(req: { headers?: unknown }): boolean {
  const expected = getConfiguredAccessKey();
  if (expected == null) return false;
  const provided = resolveControlRoomAccessHeader(req.headers);
  if (provided == null || provided.length === 0) return false;
  return timingSafeStringEqual(provided, expected);
}

function rateKeyFromHeaders(headers: unknown): string | undefined {
  const provided = resolveControlRoomAccessHeader(headers);
  if (provided == null || provided.length === 0) return undefined;
  return digestAccessKey(provided).toString("hex");
}

function consumeRateLimit(rateKey: string, limit: number, nowMs: number): boolean {
  const windowStart = nowMs - RATE_WINDOW_MS;
  const existing = rateBuckets.get(rateKey) ?? [];
  const recent = existing.filter((ts) => ts > windowStart);
  if (recent.length >= limit) {
    rateBuckets.set(rateKey, recent);
    return false;
  }
  recent.push(nowMs);
  rateBuckets.set(rateKey, recent);
  return true;
}

function setSecurityHeaders(res: VercelLikeResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function withMeta<T extends Record<string, unknown>>(body: T): T & {
  meta: typeof PREVIEW_RESPONSE_META;
} {
  return {
    ...body,
    meta: { ...PREVIEW_RESPONSE_META },
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

function disabledResponse(res: VercelLikeResponse): void {
  send(res, 404, {
    ok: false,
    enabled: false,
    code: "preview_disabled",
    message: "Image preview is disabled.",
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

function mapServiceErrorCode(code: string): {
  status: number;
  code: string;
  message: string;
  diagnostic?: string;
} {
  switch (code) {
    case "billing_confirmation_required":
      return {
        status: 400,
        code: "billing_confirmation_required",
        message: "Billing confirmation is required.",
      };
    case "invalid_image":
      return {
        status: 400,
        code: "invalid_image",
        message: "Invalid source image.",
      };
    case "image_too_large":
      return {
        status: 400,
        code: "image_too_large",
        message: "Image is too large.",
      };
    case "invalid_request":
      return {
        status: 400,
        code: "invalid_request",
        message: "Invalid request.",
      };
    case "scenario_not_found":
      return {
        status: 404,
        code: "scenario_not_found",
        message: "Scenario was not found.",
      };
    case "provider_failure":
      return {
        status: 502,
        code: "provider_failure",
        message: "Provider request failed.",
        diagnostic: "provider_failure",
      };
    case "provider_timeout":
      return {
        status: 502,
        code: "provider_failure",
        message: "Provider request timed out.",
        diagnostic: "provider_timeout",
      };
    case "provider_invalid_input":
      return {
        status: 502,
        code: "provider_failure",
        message: "Provider rejected the request input.",
        diagnostic: "provider_invalid_input",
      };
    case "provider_auth_error":
      return {
        status: 502,
        code: "provider_failure",
        message: "Provider authentication failed.",
        diagnostic: "provider_auth_error",
      };
    case "provider_http_error":
      return {
        status: 502,
        code: "provider_failure",
        message: "Provider HTTP request failed.",
        diagnostic: "provider_http_error",
      };
    case "provider_safety_blocked":
      return {
        status: 502,
        code: "provider_failure",
        message: "Provider safety filter blocked the request.",
        diagnostic: "provider_safety_blocked",
      };
    case "provider_invalid_response":
      return {
        status: 502,
        code: "provider_failure",
        message: "Provider returned an unusable response.",
        diagnostic: "provider_invalid_response",
      };
    case "provider_network_error":
      return {
        status: 502,
        code: "provider_failure",
        message: "Provider network request failed.",
        diagnostic: "provider_network_error",
      };
    case "missing_token":
      return {
        status: 502,
        code: "provider_failure",
        message: "Provider is not configured.",
        diagnostic: "token_missing",
      };
    case "validation_rejected":
      return {
        status: 422,
        code: "validation_rejected",
        message: "Validation rejected the candidate.",
        diagnostic: "validation_failed",
      };
    case "unsafe_result":
      return {
        status: 500,
        code: "unsafe_result",
        message: "Unsafe result.",
        diagnostic: "projection_failed",
      };
    case "runtime_failure":
      return {
        status: 500,
        code: "runtime_failure",
        message: "Runtime failure.",
        diagnostic: "runtime_execute_failed",
      };
    default:
      return {
        status: 500,
        code: "runtime_failure",
        message: "Runtime failure.",
        diagnostic: "runtime_execute_failed",
      };
  }
}

async function handlePost(
  req: { body?: unknown; query?: Record<string, unknown>; headers?: unknown },
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

  const allowedKeys = new Set([
    "scenarioId",
    "billingConfirmed",
    "sourceImageDataUri",
  ]);
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      send(res, 400, {
        ok: false,
        enabled: true,
        code: "invalid_request",
        message: "Invalid request.",
      });
      return;
    }
  }

  if (body.billingConfirmed !== true) {
    send(res, 400, {
      ok: false,
      enabled: true,
      code: "billing_confirmation_required",
      message: "Billing confirmation is required.",
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

  if (typeof body.sourceImageDataUri !== "string") {
    send(res, 400, {
      ok: false,
      enabled: true,
      code: "invalid_image",
      message: "Invalid source image.",
    });
    return;
  }

  const rateKey = rateKeyFromHeaders(req.headers);
  if (rateKey == null) {
    unauthorizedResponse(res);
    return;
  }

  const limit = parseMaxRequestsPerHour();
  if (!consumeRateLimit(rateKey, limit, Date.now())) {
    send(res, 429, {
      ok: false,
      enabled: true,
      code: "preview_rate_limited",
      message: "Preview rate limit exceeded.",
    });
    return;
  }

  let loaded: unknown;
  try {
    loaded = await apiHelpers.loadImagePreviewServiceModule();
  } catch {
    send(res, 500, {
      ok: false,
      enabled: true,
      code: "runtime_failure",
      message: "Runtime failure.",
      diagnostic: "module_load_failed",
    });
    return;
  }

  const previewModule = apiHelpers.normalizeImagePreviewServiceModule(loaded);
  if (previewModule == null) {
    send(res, 500, {
      ok: false,
      enabled: true,
      code: "runtime_failure",
      message: "Runtime failure.",
      diagnostic: "module_shape_invalid",
    });
    return;
  }

  let service: {
    runPreview(input: {
      scenarioId: string;
      billingConfirmed: unknown;
      sourceImageDataUri: unknown;
    }): Promise<unknown>;
  };
  try {
    service = new previewModule.ImagePreviewService();
  } catch {
    send(res, 500, {
      ok: false,
      enabled: true,
      code: "runtime_failure",
      message: "Runtime failure.",
      diagnostic: "service_construct_failed",
    });
    return;
  }

  try {
    const result = await service.runPreview({
      scenarioId,
      billingConfirmed: body.billingConfirmed,
      sourceImageDataUri: body.sourceImageDataUri,
    });
    send(res, 200, {
      ok: true,
      enabled: true,
      result,
    });
  } catch (error) {
    if (isImagePreviewServiceError(error, previewModule.ImagePreviewServiceError)) {
      const mapped = mapServiceErrorCode(error.code);
      // Safe category-only log — never tokens, prompts, or image bytes.
      console.warn(
        "[ai-os-image-preview]",
        mapped.diagnostic || mapped.code
      );
      send(res, mapped.status, {
        ok: false,
        enabled: true,
        code: mapped.code,
        message: mapped.message,
        ...(mapped.diagnostic ? { diagnostic: mapped.diagnostic } : {}),
      });
      return;
    }
    console.warn("[ai-os-image-preview]", "runtime_execute_failed");
    send(res, 500, {
      ok: false,
      enabled: true,
      code: "runtime_failure",
      message: "Runtime failure.",
      diagnostic: "runtime_execute_failed",
    });
  }
}

async function handler(
  req:
    | {
        method?: string;
        headers?: unknown;
        body?: unknown;
        query?: Record<string, unknown>;
      }
    | null
    | undefined,
  res: VercelLikeResponse
): Promise<void> {
  try {
    const safeReq =
      req != null && typeof req === "object" ? req : { method: "GET" };
    const method =
      typeof safeReq.method === "string" ? safeReq.method.toUpperCase() : "GET";

    if (method === "OPTIONS") {
      setSecurityHeaders(res);
      res.status(204).end();
      return;
    }

    if (!isPreviewEnabled()) {
      disabledResponse(res);
      return;
    }

    if (getConfiguredAccessKey() == null || !isAuthorized(safeReq)) {
      unauthorizedResponse(res);
      return;
    }

    if (method !== "POST") {
      send(res, 405, {
        ok: false,
        enabled: true,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
      return;
    }

    await handlePost(safeReq, res);
  } catch {
    send(res, 500, {
      ok: false,
      enabled: true,
      code: "runtime_failure",
      message: "Runtime failure.",
      diagnostic: "runtime_execute_failed",
    });
  }
}

/** Vercel Node config — large data-URI body + one Flux create/poll cycle. */
(handler as unknown as {
  config: {
    api: { bodyParser: { sizeLimit: string } };
    maxDuration: number;
  };
}).config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
  maxDuration: 120,
};

(handler as unknown as { default: typeof handler }).default = handler;
(handler as unknown as { PREVIEW_RESPONSE_META: typeof PREVIEW_RESPONSE_META }).PREVIEW_RESPONSE_META =
  PREVIEW_RESPONSE_META;
(handler as unknown as { digestAccessKey: typeof digestAccessKey }).digestAccessKey =
  digestAccessKey;
(handler as unknown as { timingSafeStringEqual: typeof timingSafeStringEqual }).timingSafeStringEqual =
  timingSafeStringEqual;
(handler as unknown as {
  resolveControlRoomAccessHeader: typeof resolveControlRoomAccessHeader;
}).resolveControlRoomAccessHeader = resolveControlRoomAccessHeader;
(handler as unknown as { rateBuckets: typeof rateBuckets }).rateBuckets =
  rateBuckets;

Object.defineProperty(handler, "loadImagePreviewServiceModule", {
  configurable: true,
  enumerable: true,
  get() {
    return apiHelpers.loadImagePreviewServiceModule.bind(apiHelpers);
  },
  set(fn: typeof apiHelpers.loadImagePreviewServiceModule) {
    apiHelpers.loadImagePreviewServiceModule = fn;
  },
});
Object.defineProperty(handler, "normalizeImagePreviewServiceModule", {
  configurable: true,
  enumerable: true,
  get() {
    return apiHelpers.normalizeImagePreviewServiceModule.bind(apiHelpers);
  },
  set(fn: typeof apiHelpers.normalizeImagePreviewServiceModule) {
    apiHelpers.normalizeImagePreviewServiceModule = fn;
  },
});

module.exports = handler;
module.exports.default = handler;
module.exports.config = (handler as unknown as { config: unknown }).config;
module.exports.PREVIEW_RESPONSE_META = PREVIEW_RESPONSE_META;
module.exports.digestAccessKey = digestAccessKey;
module.exports.timingSafeStringEqual = timingSafeStringEqual;
module.exports.resolveControlRoomAccessHeader = resolveControlRoomAccessHeader;
module.exports.normalizeImagePreviewServiceModule =
  normalizeImagePreviewServiceModule;
