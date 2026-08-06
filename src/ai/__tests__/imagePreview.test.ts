/**
 * DEMAND_017 — Internal AI OS v2 Image Preview tests.
 *
 * Run: npm run test:ai
 * Zero real Replicate / paid provider traffic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

import {
  IMAGE_PREVIEW_SAFETY_STATUS,
  IMAGE_PREVIEW_SCHEMA_VERSION,
  ImagePreviewService,
  ImagePreviewServiceError,
  buildProvisionalPreviewEvidence,
  consumePreviewRateLimit,
  createPreviewRateLimitStore,
  digestAccessKey,
  parsePreviewMaxRequestsPerHour,
  sanitizeImagePreviewProjection,
  timingSafeStringEqual,
  validateImagePreviewProjection,
  validatePreviewSourceImage,
  type ImagePreviewResult,
} from "../control-room";
import {
  RUNTIME_FIXTURE_PREDICTION_ID,
  runtimeTransportSuccessResult,
} from "../runtime";
import type {
  ReplicateTransportAdapter,
  ReplicateTransportInput,
  ReplicateTransportResult,
} from "../transport";
import {
  unsafeCandidateEvidence,
} from "../validation-result";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
const apiPath = join(repoRoot, "api", "ai-os-image-preview.ts");
const apiJsPath = join(repoRoot, "api", "ai-os-image-preview.js");
const controlRoomApiPath = join(repoRoot, "api", "ai-os-control-room.ts");
const imageRoutePath = join(repoRoot, "api", "generate-future-you.js");
const replicatePath = join(repoRoot, "lib", "replicate.js");
const indexHtmlPath = join(repoRoot, "public", "index.html");
const uiHtmlPath = join(repoRoot, "public", "ai-os-control-room.html");
const uiCssPath = join(repoRoot, "public", "ai-os-control-room.css");
const uiJsPath = join(repoRoot, "public", "ai-os-control-room.js");
const packageJsonPath = join(repoRoot, "package.json");
const docsPath = join(repoRoot, "docs", "CTO", "17_INTERNAL_AI_IMAGE_PREVIEW.md");
const workflowPath = join(repoRoot, ".github", "workflows", "ai-quality-gate.yml");

const TEST_KEY = "control-room-access-key-24chars!";
const GENERATED_HTTPS = "https://cdn.example.com/out/preview-result.png";

/** Minimal valid 1×1 JPEG. */
const JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";
const JPEG_DATA_URI = `data:image/jpeg;base64,${JPEG_B64}`;

/** Minimal valid 1×1 PNG. */
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_DATA_URI = `data:image/png;base64,${PNG_B64}`;

/** Minimal valid 1×1 WebP. */
const WEBP_B64 =
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";
const WEBP_DATA_URI = `data:image/webp;base64,${WEBP_B64}`;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function createFakeTransport(
  result: ReplicateTransportResult,
  calls: { count: number; inputs: ReplicateTransportInput[] }
): ReplicateTransportAdapter {
  return {
    id: "replicate-transport-v1",
    provider: "replicate",
    async generate(input: ReplicateTransportInput) {
      calls.count += 1;
      calls.inputs.push(input);
      return structuredClone(result);
    },
  } as ReplicateTransportAdapter;
}

function successTransportResult(): ReplicateTransportResult {
  const base = structuredClone(runtimeTransportSuccessResult);
  if (!base.success) {
    throw new Error("expected success fixture");
  }
  return {
    success: true,
    provider: "replicate",
    predictionId: RUNTIME_FIXTURE_PREDICTION_ID,
    model: "black-forest-labs/flux-kontext-pro",
    status: "succeeded",
    imageUrl: GENERATED_HTTPS,
    generationTimeMs: base.generationTimeMs,
    warnings: [...base.warnings],
    metadata: { ...base.metadata },
  };
}

type MockResponseState = {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  ended: boolean;
};

function createMockResponse(): {
  res: {
    setHeader(name: string, value: string): void;
    status(code: number): unknown;
    json(body: unknown): void;
    end(): void;
  };
  state: MockResponseState;
} {
  const state: MockResponseState = {
    statusCode: 200,
    body: null,
    headers: {},
    ended: false,
  };
  const res = {
    setHeader(name: string, value: string) {
      state.headers[name] = value;
    },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
    },
    end() {
      state.ended = true;
    },
  };
  return { res, state };
}

type PreviewApiHelpers = {
  default: (
    req: unknown,
    res: {
      setHeader(name: string, value: string): void;
      status(code: number): unknown;
      json(body: unknown): void;
      end(): void;
    }
  ) => Promise<void>;
  digestAccessKey: (value: string) => Buffer;
  timingSafeStringEqual: (a: string, b: string) => boolean;
  resolveControlRoomAccessHeader: (headers: unknown) => string | undefined;
  PREVIEW_RESPONSE_META: { service: string; apiVersion: string };
  rateBuckets: Map<string, number[]>;
  loadImagePreviewServiceModule: () => Promise<unknown>;
};

async function loadPreviewApi(): Promise<PreviewApiHelpers> {
  const href = pathToFileURL(apiPath).href;
  const imported = (await import(href)) as Record<string, unknown>;
  const live =
    typeof imported.default === "function"
      ? (imported.default as unknown as PreviewApiHelpers)
      : (imported as unknown as PreviewApiHelpers);
  assert.equal(typeof live.default, "function");
  return live;
}

async function withPreviewEnv(
  values: {
    enabled?: string | undefined;
    accessKey?: string | undefined;
    maxPerHour?: string | undefined;
  },
  run: () => Promise<void>
): Promise<void> {
  const prev = {
    enabled: process.env.AI_OS_IMAGE_PREVIEW_ENABLED,
    accessKey: process.env.AI_OS_CONTROL_ROOM_ACCESS_KEY,
    max: process.env.AI_OS_IMAGE_PREVIEW_MAX_REQUESTS_PER_HOUR,
  };
  try {
    if (values.enabled === undefined) {
      delete process.env.AI_OS_IMAGE_PREVIEW_ENABLED;
    } else {
      process.env.AI_OS_IMAGE_PREVIEW_ENABLED = values.enabled;
    }
    if (values.accessKey === undefined) {
      delete process.env.AI_OS_CONTROL_ROOM_ACCESS_KEY;
    } else {
      process.env.AI_OS_CONTROL_ROOM_ACCESS_KEY = values.accessKey;
    }
    if (values.maxPerHour === undefined) {
      delete process.env.AI_OS_IMAGE_PREVIEW_MAX_REQUESTS_PER_HOUR;
    } else {
      process.env.AI_OS_IMAGE_PREVIEW_MAX_REQUESTS_PER_HOUR = values.maxPerHour;
    }
    await run();
  } finally {
    if (prev.enabled === undefined) delete process.env.AI_OS_IMAGE_PREVIEW_ENABLED;
    else process.env.AI_OS_IMAGE_PREVIEW_ENABLED = prev.enabled;
    if (prev.accessKey === undefined) {
      delete process.env.AI_OS_CONTROL_ROOM_ACCESS_KEY;
    } else {
      process.env.AI_OS_CONTROL_ROOM_ACCESS_KEY = prev.accessKey;
    }
    if (prev.max === undefined) {
      delete process.env.AI_OS_IMAGE_PREVIEW_MAX_REQUESTS_PER_HOUR;
    } else {
      process.env.AI_OS_IMAGE_PREVIEW_MAX_REQUESTS_PER_HOUR = prev.max;
    }
  }
}

function containsSensitive(value: unknown): boolean {
  const text = JSON.stringify(value);
  return (
    /data:image\//i.test(text) ||
    /REPLICATE_API_TOKEN/i.test(text) ||
    /\br8_/i.test(text) ||
    /\bBearer\b/i.test(text) ||
    /AI_OS_CONTROL_ROOM_ACCESS_KEY/i.test(text)
  );
}

describe("imagePreview — DEMAND_017", () => {
  describe("Authentication and flags", () => {
    it("1. Preview disabled by default", async () => {
      const api = await loadPreviewApi();
      await withPreviewEnv({ enabled: undefined, accessKey: TEST_KEY }, async () => {
        const { res, state } = createMockResponse();
        await api.default({ method: "POST", headers: {} }, res);
        assert.equal(state.statusCode, 404);
        const body = state.body as { code?: string; enabled?: boolean };
        assert.equal(body.code, "preview_disabled");
        assert.equal(body.enabled, false);
      });
    });

    it('2. Exact "1" enables preview', async () => {
      const api = await loadPreviewApi();
      await withPreviewEnv({ enabled: "true", accessKey: TEST_KEY }, async () => {
        const { res, state } = createMockResponse();
        await api.default(
          {
            method: "POST",
            headers: { "x-ai-os-control-room-key": TEST_KEY },
            body: {
              scenarioId: "balanced_recomposition_12w",
              billingConfirmed: true,
              sourceImageDataUri: JPEG_DATA_URI,
            },
          },
          res
        );
        assert.equal(state.statusCode, 404);
        assert.equal((state.body as { code?: string }).code, "preview_disabled");
      });
      await withPreviewEnv({ enabled: "1", accessKey: TEST_KEY }, async () => {
        const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
        const fake = createFakeTransport(successTransportResult(), calls);
        const original = api.loadImagePreviewServiceModule;
        api.loadImagePreviewServiceModule = async () => ({
          ImagePreviewService: class {
            async runPreview() {
              const service = new ImagePreviewService({
                transportAdapter: fake,
                env: {
                  REPLICATE_API_TOKEN: "test-token-not-real",
                },
              });
              return service.runPreview({
                scenarioId: "balanced_recomposition_12w",
                billingConfirmed: true,
                sourceImageDataUri: JPEG_DATA_URI,
              });
            }
          },
          ImagePreviewServiceError,
        });
        try {
          api.rateBuckets.clear();
          const { res, state } = createMockResponse();
          await api.default(
            {
              method: "POST",
              headers: { "x-ai-os-control-room-key": TEST_KEY },
              body: {
                scenarioId: "balanced_recomposition_12w",
                billingConfirmed: true,
                sourceImageDataUri: JPEG_DATA_URI,
              },
            },
            res
          );
          assert.equal(state.statusCode, 200);
          assert.equal((state.body as { ok?: boolean }).ok, true);
        } finally {
          api.loadImagePreviewServiceModule = original;
        }
      });
    });

    it("3. Correct Control Room key succeeds", async () => {
      assert.equal(timingSafeStringEqual(TEST_KEY, TEST_KEY), true);
    });

    it("4. Incorrect key fails", async () => {
      const api = await loadPreviewApi();
      await withPreviewEnv({ enabled: "1", accessKey: TEST_KEY }, async () => {
        const { res, state } = createMockResponse();
        await api.default(
          {
            method: "POST",
            headers: { "x-ai-os-control-room-key": "wrong-key-value-xxxxxxxx" },
            body: {
              scenarioId: "balanced_recomposition_12w",
              billingConfirmed: true,
              sourceImageDataUri: JPEG_DATA_URI,
            },
          },
          res
        );
        assert.equal(state.statusCode, 401);
        assert.equal((state.body as { code?: string }).code, "unauthorized");
      });
    });

    it("5. Query key rejected", async () => {
      const api = await loadPreviewApi();
      await withPreviewEnv({ enabled: "1", accessKey: TEST_KEY }, async () => {
        const { res, state } = createMockResponse();
        await api.default(
          {
            method: "POST",
            headers: { "x-ai-os-control-room-key": TEST_KEY },
            query: { accessKey: TEST_KEY },
            body: {
              scenarioId: "balanced_recomposition_12w",
              billingConfirmed: true,
              sourceImageDataUri: JPEG_DATA_URI,
            },
          },
          res
        );
        assert.equal(state.statusCode, 400);
        assert.equal((state.body as { code?: string }).code, "invalid_request");
      });
    });

    it("6. Body key rejected", async () => {
      const api = await loadPreviewApi();
      await withPreviewEnv({ enabled: "1", accessKey: TEST_KEY }, async () => {
        const { res, state } = createMockResponse();
        await api.default(
          {
            method: "POST",
            headers: { "x-ai-os-control-room-key": TEST_KEY },
            body: {
              scenarioId: "balanced_recomposition_12w",
              billingConfirmed: true,
              sourceImageDataUri: JPEG_DATA_URI,
              accessKey: TEST_KEY,
            },
          },
          res
        );
        assert.equal(state.statusCode, 400);
      });
    });

    it("7. Cookie key ignored", async () => {
      const api = await loadPreviewApi();
      await withPreviewEnv({ enabled: "1", accessKey: TEST_KEY }, async () => {
        const { res, state } = createMockResponse();
        await api.default(
          {
            method: "POST",
            headers: {
              cookie: `X-AI-OS-Control-Room-Key=${TEST_KEY}`,
            },
            body: {
              scenarioId: "balanced_recomposition_12w",
              billingConfirmed: true,
              sourceImageDataUri: JPEG_DATA_URI,
            },
          },
          res
        );
        assert.equal(state.statusCode, 401);
      });
    });

    it("8. Fixed-length SHA-256 comparison retained", () => {
      const a = digestAccessKey("short");
      const b = digestAccessKey("a-much-longer-access-key-value");
      assert.equal(a.length, 32);
      assert.equal(b.length, 32);
      assert.equal(a.length, b.length);
      const previewSrc = read(apiPath);
      const controlSrc = read(controlRoomApiPath);
      assert.match(previewSrc, /createHash\("sha256"\)/);
      assert.match(controlSrc, /createHash\("sha256"\)/);
      assert.match(previewSrc, /timingSafeEqual/);
      assert.match(controlSrc, /timingSafeEqual/);
    });
  });

  describe("Image input", () => {
    it("9. JPEG accepted", () => {
      const v = validatePreviewSourceImage(JPEG_DATA_URI);
      assert.equal(v.mimeType, "image/jpeg");
      assert.ok(v.byteLength > 0);
    });

    it("10. PNG accepted", () => {
      const v = validatePreviewSourceImage(PNG_DATA_URI);
      assert.equal(v.mimeType, "image/png");
    });

    it("11. WebP accepted", () => {
      const v = validatePreviewSourceImage(WEBP_DATA_URI);
      assert.equal(v.mimeType, "image/webp");
    });

    it("12. SVG rejected", () => {
      assert.throws(
        () =>
          validatePreviewSourceImage(
            "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg=="
          ),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError && err.code === "invalid_image"
      );
    });

    it("13. GIF rejected", () => {
      assert.throws(
        () =>
          validatePreviewSourceImage(
            "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          ),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError && err.code === "invalid_image"
      );
    });

    it("14. Remote browser URL rejected", () => {
      assert.throws(
        () => validatePreviewSourceImage("https://cdn.example.com/photo.jpg"),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError && err.code === "invalid_image"
      );
    });

    it("15. Empty image rejected", () => {
      assert.throws(
        () => validatePreviewSourceImage("data:image/jpeg;base64,"),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError && err.code === "invalid_image"
      );
    });

    it("16. Malformed Base64 rejected", () => {
      assert.throws(
        () =>
          validatePreviewSourceImage(
            "data:image/jpeg;base64,@@@not-valid-base64@@@"
          ),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError && err.code === "invalid_image"
      );
    });

    it("17. Over-5-MB image rejected", () => {
      const big = Buffer.alloc(5 * 1024 * 1024 + 100, 0xff);
      // JPEG magic
      big[0] = 0xff;
      big[1] = 0xd8;
      big[2] = 0xff;
      const uri = `data:image/jpeg;base64,${big.toString("base64")}`;
      assert.throws(
        () => validatePreviewSourceImage(uri),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError && err.code === "image_too_large"
      );
    });

    it("18. MIME mismatch rejected", () => {
      // PNG bytes with JPEG declaration
      assert.throws(
        () => validatePreviewSourceImage(`data:image/jpeg;base64,${PNG_B64}`),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError && err.code === "invalid_image"
      );
    });

    it("19. Source image never appears in response", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), calls),
      });
      const result = await service.runPreview({
        scenarioId: "balanced_recomposition_12w",
        billingConfirmed: true,
        sourceImageDataUri: JPEG_DATA_URI,
      });
      const json = JSON.stringify(result);
      assert.equal(/data:image\//i.test(json), false);
      assert.equal(json.includes(JPEG_B64.slice(0, 40)), false);
    });
  });

  describe("Billing", () => {
    it("20. Missing confirmation rejected", async () => {
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), {
          count: 0,
          inputs: [],
        }),
      });
      await assert.rejects(
        () =>
          service.runPreview({
            scenarioId: "balanced_recomposition_12w",
            billingConfirmed: undefined,
            sourceImageDataUri: JPEG_DATA_URI,
          }),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError &&
          err.code === "billing_confirmation_required"
      );
    });

    it("21. false rejected", async () => {
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), {
          count: 0,
          inputs: [],
        }),
      });
      await assert.rejects(
        () =>
          service.runPreview({
            scenarioId: "balanced_recomposition_12w",
            billingConfirmed: false,
            sourceImageDataUri: JPEG_DATA_URI,
          }),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError &&
          err.code === "billing_confirmation_required"
      );
    });

    it('22. string "true" rejected', async () => {
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), {
          count: 0,
          inputs: [],
        }),
      });
      await assert.rejects(
        () =>
          service.runPreview({
            scenarioId: "balanced_recomposition_12w",
            billingConfirmed: "true",
            sourceImageDataUri: JPEG_DATA_URI,
          }),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError &&
          err.code === "billing_confirmation_required"
      );
    });

    it("23. literal true accepted", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), calls),
      });
      const result = await service.runPreview({
        scenarioId: "balanced_recomposition_12w",
        billingConfirmed: true,
        sourceImageDataUri: JPEG_DATA_URI,
      });
      assert.equal(result.success, true);
    });

    it("24. Provider is never called before confirmation", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), calls),
      });
      await assert.rejects(() =>
        service.runPreview({
          scenarioId: "balanced_recomposition_12w",
          billingConfirmed: false,
          sourceImageDataUri: JPEG_DATA_URI,
        })
      );
      assert.equal(calls.count, 0);
    });
  });

  describe("Request limits", () => {
    it("25. Request cap applies", () => {
      assert.equal(parsePreviewMaxRequestsPerHour(undefined), 3);
      assert.equal(parsePreviewMaxRequestsPerHour("0"), 3);
      assert.equal(parsePreviewMaxRequestsPerHour("11"), 3);
      assert.equal(parsePreviewMaxRequestsPerHour("5"), 5);
      const store = createPreviewRateLimitStore();
      const first = consumePreviewRateLimit("k1", 2, 1000, store);
      assert.equal(first.allowed, true);
    });

    it("26. Exceeded cap returns 429", async () => {
      const api = await loadPreviewApi();
      await withPreviewEnv(
        { enabled: "1", accessKey: TEST_KEY, maxPerHour: "1" },
        async () => {
          api.rateBuckets.clear();
          const original = api.loadImagePreviewServiceModule;
          api.loadImagePreviewServiceModule = async () => ({
            ImagePreviewService: class {
              async runPreview() {
                return {
                  schemaVersion: IMAGE_PREVIEW_SCHEMA_VERSION,
                  success: true,
                  scenarioId: "balanced_recomposition_12w",
                  requestId: "test",
                  source: { mimeType: "image/jpeg", byteLength: 10 },
                  generatedImage: {
                    url: GENERATED_HTTPS,
                    expiresOrIsTemporary: true,
                  },
                  runtime: {
                    mode: "transport_mock",
                    terminalOutcome: "awaiting_validation",
                    traceId: "t",
                    stages: [],
                    versions: {},
                  },
                  artifacts: null,
                  provider: null,
                  validation: null,
                  safety: { ...IMAGE_PREVIEW_SAFETY_STATUS },
                  warnings: [],
                  errors: [],
                } satisfies ImagePreviewResult;
              }
            },
            ImagePreviewServiceError,
          });
          try {
            const first = createMockResponse();
            await api.default(
              {
                method: "POST",
                headers: { "x-ai-os-control-room-key": TEST_KEY },
                body: {
                  scenarioId: "balanced_recomposition_12w",
                  billingConfirmed: true,
                  sourceImageDataUri: JPEG_DATA_URI,
                },
              },
              first.res
            );
            assert.equal(first.state.statusCode, 200);
            const second = createMockResponse();
            await api.default(
              {
                method: "POST",
                headers: { "x-ai-os-control-room-key": TEST_KEY },
                body: {
                  scenarioId: "balanced_recomposition_12w",
                  billingConfirmed: true,
                  sourceImageDataUri: JPEG_DATA_URI,
                },
              },
              second.res
            );
            assert.equal(second.state.statusCode, 429);
            assert.equal(
              (second.state.body as { code?: string }).code,
              "preview_rate_limited"
            );
          } finally {
            api.loadImagePreviewServiceModule = original;
            api.rateBuckets.clear();
          }
        }
      );
    });

    it("27. Only one provider call per accepted request", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), calls),
      });
      await service.runPreview({
        scenarioId: "balanced_recomposition_12w",
        billingConfirmed: true,
        sourceImageDataUri: JPEG_DATA_URI,
      });
      assert.equal(calls.count, 1);
    });

    it("28. Output count is exactly one", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), calls),
      });
      const result = await service.runPreview({
        scenarioId: "upper_body_definition_8w",
        billingConfirmed: true,
        sourceImageDataUri: JPEG_DATA_URI,
      });
      assert.ok(result.generatedImage);
      assert.equal(result.generatedImage?.expiresOrIsTemporary, true);
      assert.equal(
        JSON.stringify(result).match(/https:\/\/cdn\.example\.com/g)?.length,
        1
      );
    });

    it("29. No automatic retry occurs", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const failing: ReplicateTransportResult = {
        success: false,
        provider: "replicate",
        imageUrl: null,
        generationTimeMs: 10,
        error: {
          code: "request_timeout",
          message: "timeout",
          retryable: true,
        },
        warnings: [],
        metadata: { traceId: "t", pollingAttempts: 1 },
      };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(failing, calls),
      });
      await assert.rejects(
        () =>
          service.runPreview({
            scenarioId: "balanced_recomposition_12w",
            billingConfirmed: true,
            sourceImageDataUri: JPEG_DATA_URI,
          }),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError &&
          err.code === "provider_timeout"
      );
      assert.equal(calls.count, 1);
    });

    it("29b. Transport timeout/validation/auth map to specific preview codes", async () => {
      const cases: Array<{
        transportCode:
          | "request_timeout"
          | "provider_validation_error"
          | "provider_auth_error"
          | "provider_unavailable"
          | "provider_failed"
          | "invalid_provider_response"
          | "unknown_transport_error";
        code: string;
        message?: string;
      }> = [
        { transportCode: "request_timeout", code: "provider_timeout" },
        {
          transportCode: "provider_validation_error",
          code: "provider_invalid_input",
        },
        { transportCode: "provider_auth_error", code: "provider_auth_error" },
        { transportCode: "provider_unavailable", code: "provider_http_error" },
        {
          transportCode: "provider_failed",
          code: "provider_safety_blocked",
          message: "The input or output was flagged as sensitive. (E005)",
        },
        {
          transportCode: "invalid_provider_response",
          code: "provider_invalid_response",
        },
        {
          transportCode: "unknown_transport_error",
          code: "provider_network_error",
        },
      ];
      for (const item of cases) {
        const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
        const failing: ReplicateTransportResult = {
          success: false,
          provider: "replicate",
          imageUrl: null,
          generationTimeMs: 10,
          error: {
            code: item.transportCode,
            message: item.message ?? "x",
            retryable: false,
          },
          warnings: [],
          metadata: { traceId: "t", pollingAttempts: 0 },
        };
        const service = new ImagePreviewService({
          transportAdapter: createFakeTransport(failing, calls),
        });
        await assert.rejects(
          () =>
            service.runPreview({
              scenarioId: "balanced_recomposition_12w",
              billingConfirmed: true,
              sourceImageDataUri: JPEG_DATA_URI,
            }),
          (err: unknown) =>
            err instanceof ImagePreviewServiceError && err.code === item.code
        );
        assert.equal(calls.count, 1);
      }
    });

    it("29c. Real transport adapter called once with data_uri input_image contract", async () => {
      let postCount = 0;
      let createUrl = "";
      let createBody: {
        input?: {
          input_image?: string;
          prompt?: string;
          aspect_ratio?: string;
          output_format?: string;
          safety_tolerance?: number;
        };
      } = {};
      let preferHeader = "";
      let cancelAfterHeader = "";
      const fakeFetch = (async (
        input: string | URL | Request,
        init?: RequestInit
      ) => {
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method === "POST") {
          postCount += 1;
          createUrl = String(input);
          createBody = JSON.parse(String(init?.body ?? "{}")) as typeof createBody;
          const headers = new Headers(init?.headers);
          preferHeader = headers.get("Prefer") ?? "";
          cancelAfterHeader = headers.get("Cancel-After") ?? "";
          return new Response(
            JSON.stringify({
              id: "pred_contract_once",
              status: "succeeded",
              output: GENERATED_HTTPS,
              urls: {
                get: "https://api.replicate.com/v1/predictions/pred_contract_once",
              },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("{}", { status: 500 });
      }) as typeof fetch;

      const service = new ImagePreviewService({
        env: {
          REPLICATE_API_TOKEN: "test-token-not-a-real-secret",
        },
        transportDependencies: {
          fetchFn: fakeFetch,
          now: () => 1_700_000_000_000,
          sleep: async () => undefined,
        },
      });

      const result = await service.runPreview({
        scenarioId: "balanced_recomposition_12w",
        billingConfirmed: true,
        sourceImageDataUri: JPEG_DATA_URI,
      });

      assert.equal(postCount, 1);
      assert.match(
        createUrl,
        /^https:\/\/api\.replicate\.com\/v1\/models\/black-forest-labs\/flux-kontext-pro\/predictions$/
      );
      assert.equal(createBody.input?.input_image, JPEG_DATA_URI);
      assert.equal(typeof createBody.input?.prompt, "string");
      assert.ok((createBody.input?.prompt?.length ?? 0) > 0);
      assert.equal(createBody.input?.aspect_ratio, "3:4");
      assert.equal(createBody.input?.output_format, "png");
      assert.equal(createBody.input?.safety_tolerance, 2);
      assert.match(preferHeader, /^wait=\d+$/);
      const waitSec = Number(preferHeader.replace("wait=", ""));
      assert.ok(Number.isFinite(waitSec) && waitSec >= 1 && waitSec <= 12);
      assert.match(cancelAfterHeader, /^\d+s$/);
      assert.equal(result.success, true);
      assert.equal(result.generatedImage?.url, GENERATED_HTTPS);
    });
  });

  describe("AI OS execution", () => {
    it("30–34. Existing AI OS layers used via runtime", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), calls),
      });
      const result = await service.runPreview({
        scenarioId: "gradual_fat_loss_16w",
        billingConfirmed: true,
        sourceImageDataUri: JPEG_DATA_URI,
      });
      assert.ok(result.artifacts?.transformationPlan);
      assert.ok(result.artifacts?.visualDirection);
      assert.ok(result.artifacts?.renderPlan);
      assert.ok(result.artifacts?.formattedRequestSummary);
      assert.equal(
        result.artifacts?.formattedRequestSummary.formatterName,
        "FluxFormatter"
      );
      assert.equal(result.runtime.mode, "transport_mock");
      assert.equal(calls.count, 1);
      assert.equal(calls.inputs[0]?.sourceImage.kind, "data_uri");
    });

    it("35. Legacy prompt logic is not imported", () => {
      const serviceSrc = read(
        join(repoRoot, "src/ai/control-room/ImagePreviewService.ts")
      );
      const apiSrc = read(apiPath);
      assert.equal(serviceSrc.includes("visuellPrompt"), false);
      assert.equal(serviceSrc.includes("transformasjonLogikk"), false);
      assert.equal(apiSrc.includes("visuellPrompt"), false);
    });

    it("36. lib/replicate.js is not imported", () => {
      const serviceSrc = read(
        join(repoRoot, "src/ai/control-room/ImagePreviewService.ts")
      );
      const apiSrc = read(apiPath);
      assert.equal(serviceSrc.includes("lib/replicate"), false);
      assert.equal(apiSrc.includes("lib/replicate"), false);
    });

    it("37. Production gateway is not invoked", () => {
      const serviceSrc = read(
        join(repoRoot, "src/ai/control-room/ImagePreviewService.ts")
      );
      assert.equal(serviceSrc.includes("ProductionRuntimeGateway"), false);
      assert.equal(serviceSrc.includes("evaluateProductionRuntimePolicy"), false);
    });

    it("38. Shadow Runtime is not invoked", () => {
      const serviceSrc = read(
        join(repoRoot, "src/ai/control-room/ImagePreviewService.ts")
      );
      assert.equal(serviceSrc.includes("ShadowRuntime"), false);
    });

    it("39. ResultValidator runs", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      let evidenceBuilt = false;
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), calls),
        buildValidationEvidence: (predictionId, model) => {
          evidenceBuilt = true;
          return buildProvisionalPreviewEvidence(predictionId, model);
        },
      });
      const result = await service.runPreview({
        scenarioId: "athletic_strength_24w",
        billingConfirmed: true,
        sourceImageDataUri: JPEG_DATA_URI,
      });
      assert.equal(evidenceBuilt, true);
      assert.ok(result.validation);
      assert.equal(result.validation?.accepted, true);
      assert.ok(
        result.runtime.versions.resultValidatorRulesVersion != null ||
          result.warnings.some((w) => /ResultValidator/i.test(w))
      );
    });

    it("40. Validation rejection is safe", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), calls),
        buildValidationEvidence: (predictionId) => ({
          ...structuredClone(unsafeCandidateEvidence),
          candidate: { candidateId: predictionId },
        }),
      });
      await assert.rejects(
        () =>
          service.runPreview({
            scenarioId: "balanced_recomposition_12w",
            billingConfirmed: true,
            sourceImageDataUri: JPEG_DATA_URI,
          }),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError &&
          err.code === "validation_rejected"
      );
      assert.equal(calls.count, 1);
    });
  });

  describe("Projection", () => {
    it("41–48. Safe projection invariants", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), calls),
      });
      const result = await service.runPreview({
        scenarioId: "balanced_recomposition_12w",
        billingConfirmed: true,
        sourceImageDataUri: JPEG_DATA_URI,
      });
      assert.equal(result.generatedImage?.url, GENERATED_HTTPS);
      assert.equal(containsSensitive(result), false);
      assert.deepEqual(result.safety, IMAGE_PREVIEW_SAFETY_STATUS);
      assert.equal(result.schemaVersion, IMAGE_PREVIEW_SCHEMA_VERSION);
      assert.doesNotThrow(() => JSON.stringify(result));
      const check = validateImagePreviewProjection(result);
      assert.equal(check.valid, true);
    });

    it("49. Unsafe nested content invalidates result", () => {
      const unsafe: ImagePreviewResult = {
        schemaVersion: IMAGE_PREVIEW_SCHEMA_VERSION,
        success: true,
        scenarioId: "balanced_recomposition_12w",
        requestId: "r1",
        source: { mimeType: "image/jpeg", byteLength: 10 },
        generatedImage: {
          url: GENERATED_HTTPS,
          expiresOrIsTemporary: true,
        },
        runtime: {
          mode: "transport_mock",
          terminalOutcome: "accepted",
          traceId: "t",
          stages: [],
          versions: {},
        },
        artifacts: {
          transformationPlan: { leak: "data:image/jpeg;base64,AAAA" },
          visualDirection: {},
          renderPlan: {},
          formattedRequestSummary: {
            formatterName: "FluxFormatter",
            formatterVersion: "1.0",
            providerFamily: "flux",
            model: "m",
            positivePrompt: "p",
            negativePrompt: "",
          },
        },
        provider: null,
        validation: null,
        safety: { ...IMAGE_PREVIEW_SAFETY_STATUS },
        warnings: [],
        errors: [],
      };
      const sanitized = sanitizeImagePreviewProjection(unsafe);
      assert.equal(sanitized.success, false);
      assert.equal(sanitized.generatedImage, null);
      assert.equal(sanitized.artifacts, null);
    });
  });

  describe("UI source", () => {
    it("50–64. Control Room preview UI contracts", () => {
      const html = read(uiHtmlPath);
      const js = read(uiJsPath);
      const css = read(uiCssPath);
      assert.equal(js.includes("localStorage"), false);
      assert.equal(js.includes("sessionStorage"), false);
      assert.equal(/document\.cookie/.test(js), false);
      assert.equal(js.includes("innerHTML"), false);
      assert.equal(/https?:\/\/cdn\.|googleapis|analytics/i.test(html), false);
      assert.match(html, /script src="\.\/ai-os-control-room\.js"/);
      assert.equal((html.match(/<script/g) || []).length, 1);
      assert.match(html, /previewBillingCheckbox/);
      assert.match(html, /previewPrivacyNotice|Privacy:/);
      assert.match(js, /toDataURL\("image\/jpeg"/);
      assert.match(js, /drawImage/);
      assert.match(js, /PREVIEW_MAX_LONG_EDGE|1600/);
      assert.match(js, /previewBillingCheckbox\.checked/);
      assert.match(js, /clearPreviewState/);
      assert.match(html, /AI OS PREVIEW/);
      assert.equal(/share|twitter|facebook|download/i.test(html), false);
      assert.equal(/public production generation/i.test(html), false);
      assert.match(html, /Internal preview only/);
      assert.match(css, /preview-compare/);
      assert.match(js, /previewInFlight/);
    });
  });

  describe("Architecture", () => {
    it("65. Existing production route unchanged", () => {
      assert.equal(existsSync(imageRoutePath), true);
      // Spot-check: still owns generate-future-you path, no preview import.
      const route = read(imageRoutePath);
      assert.equal(route.includes("ai-os-image-preview"), false);
      assert.equal(route.includes("ImagePreviewService"), false);
    });

    it("66. lib/replicate.js unchanged by preview", () => {
      const replicate = read(replicatePath);
      assert.equal(replicate.includes("ImagePreview"), false);
      assert.equal(replicate.includes("ai-os-image-preview"), false);
    });

    it("67. public/index.html unchanged by preview", () => {
      const index = read(indexHtmlPath);
      assert.equal(index.includes("ai-os-image-preview"), false);
      assert.equal(index.includes("Internal image preview"), false);
    });

    it("68. No batch endpoint", () => {
      assert.equal(existsSync(join(repoRoot, "api", "ai-os-image-preview-batch.ts")), false);
      const apiSrc = read(apiPath);
      assert.equal(/batch/i.test(apiSrc), false);
    });

    it("69. No automatic retry", () => {
      const serviceSrc = read(
        join(repoRoot, "src/ai/control-room/ImagePreviewService.ts")
      );
      assert.match(serviceSrc, /Do not auto-retry/);
      const js = read(uiJsPath);
      assert.equal(/setTimeout\([^)]*generatePreview/i.test(js), false);
    });

    it("70. No provider call in dry-run Control Room GET", () => {
      const controlApi = read(controlRoomApiPath);
      assert.equal(controlApi.includes("ReplicateTransportAdapter"), false);
      assert.equal(controlApi.includes("AI_OS_IMAGE_PREVIEW"), false);
    });

    it("71. Existing Control Room unlock still works", () => {
      assert.equal(existsSync(controlRoomApiPath), true);
      const html = read(uiHtmlPath);
      assert.match(html, /Unlock Control Room/);
      assert.match(html, /Run AI OS dry run/);
    });

    it("72. package.json test:ai includes imagePreview", () => {
      const pkg = JSON.parse(read(packageJsonPath)) as {
        scripts: Record<string, string>;
      };
      assert.match(pkg.scripts["test:ai"], /imagePreview\.test\.ts/);
    });

    it("73. Harness script remains present", () => {
      const pkg = JSON.parse(read(packageJsonPath)) as {
        scripts: Record<string, string>;
      };
      assert.equal(typeof pkg.scripts["harness:ai"], "string");
      assert.equal(
        existsSync(join(repoRoot, "scripts", "run-ai-os-v2-harness.ts")),
        true
      );
    });

    it("74. GitHub AI Quality Gate remains valid", () => {
      assert.equal(existsSync(workflowPath), true);
      const wf = read(workflowPath);
      assert.match(wf, /test:ai/);
      assert.match(wf, /typecheck/);
      assert.match(wf, /harness:ai/);
    });
  });

  describe("API surface", () => {
    it("meta identity and security headers", async () => {
      const api = await loadPreviewApi();
      assert.equal(api.PREVIEW_RESPONSE_META.service, "ai-os-image-preview");
      assert.equal(api.PREVIEW_RESPONSE_META.apiVersion, "1.0");
      await withPreviewEnv({ enabled: undefined }, async () => {
        const { res, state } = createMockResponse();
        await api.default({ method: "GET" }, res);
        assert.equal(state.headers["Cache-Control"], "no-store");
        assert.equal(state.headers["X-Content-Type-Options"], "nosniff");
        assert.equal(state.headers["Referrer-Policy"], "no-referrer");
        const body = state.body as { meta?: { service?: string } };
        assert.equal(body.meta?.service, "ai-os-image-preview");
      });
    });

    it("no JS shim sibling", () => {
      assert.equal(existsSync(apiJsPath), false);
      assert.equal(existsSync(apiPath), true);
    });

    it("docs exist", () => {
      assert.equal(existsSync(docsPath), true);
      const docs = read(docsPath);
      assert.match(docs, /Internal AI OS v2 Image Preview/);
      assert.match(docs, /Demand 018/);
      assert.match(docs, /AI_OS_IMAGE_PREVIEW_ENABLED/);
      assert.match(docs, /imagePreviewRuntime\.bundle\.cjs/);
      assert.match(docs, /ERR_UNSUPPORTED_DIR_IMPORT|prebundled CJS/);
    });
  });

  describe("PATCH 017A — bundled runtime load", () => {
    const bundlePath = join(
      repoRoot,
      "src",
      "ai",
      "control-room",
      "imagePreviewRuntime.bundle.cjs"
    );

    it("prebundled CJS runtime exists and exports service surface", () => {
      assert.equal(existsSync(bundlePath), true);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bundled = require(bundlePath) as {
        ImagePreviewService?: unknown;
        ImagePreviewServiceError?: unknown;
      };
      assert.equal(typeof bundled.ImagePreviewService, "function");
      assert.equal(typeof bundled.ImagePreviewServiceError, "function");
    });

    it("API does not dynamic-import TypeScript ImagePreviewService", () => {
      const apiSrc = read(apiPath);
      // Strip block comments so historical failure notes do not false-positive.
      const codeOnly = apiSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      assert.equal(
        /import\s*\(\s*["'][^"']*ImagePreviewService["']\s*\)/.test(codeOnly),
        false
      );
      assert.match(
        codeOnly,
        /require\(["']\.\.\/src\/ai\/control-room\/imagePreviewRuntime\.bundle\.cjs["']\)/
      );
    });

    it("missing REPLICATE_API_TOKEN maps to provider_failure (not opaque 500)", async () => {
      await assert.rejects(
        () =>
          new ImagePreviewService({
            env: { REPLICATE_API_TOKEN: "" },
          }).runPreview({
            scenarioId: "balanced_recomposition_12w",
            billingConfirmed: true,
            sourceImageDataUri: JPEG_DATA_URI,
          }),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError && err.code === "missing_token"
      );

      const api = await loadPreviewApi();
      await withPreviewEnv({ enabled: "1", accessKey: TEST_KEY }, async () => {
        const original = api.loadImagePreviewServiceModule;
        api.loadImagePreviewServiceModule = async () => ({
          ImagePreviewService: class {
            async runPreview() {
              return new ImagePreviewService({
                env: { REPLICATE_API_TOKEN: undefined },
              }).runPreview({
                scenarioId: "balanced_recomposition_12w",
                billingConfirmed: true,
                sourceImageDataUri: JPEG_DATA_URI,
              });
            }
          },
          ImagePreviewServiceError,
        });
        const prevToken = process.env.REPLICATE_API_TOKEN;
        try {
          delete process.env.REPLICATE_API_TOKEN;
          api.rateBuckets.clear();
          const { res, state } = createMockResponse();
          await api.default(
            {
              method: "POST",
              headers: { "x-ai-os-control-room-key": TEST_KEY },
              body: {
                scenarioId: "balanced_recomposition_12w",
                billingConfirmed: true,
                sourceImageDataUri: JPEG_DATA_URI,
              },
            },
            res
          );
          assert.equal(state.statusCode, 502);
          const body = state.body as {
            code?: string;
            diagnostic?: string;
            meta?: { service?: string };
          };
          assert.equal(body.code, "provider_failure");
          assert.equal(body.diagnostic, "token_missing");
          assert.equal(body.meta?.service, "ai-os-image-preview");
          assert.equal(containsSensitive(body), false);
        } finally {
          api.loadImagePreviewServiceModule = original;
          if (prevToken === undefined) delete process.env.REPLICATE_API_TOKEN;
          else process.env.REPLICATE_API_TOKEN = prevToken;
        }
      });
    });

    it("API exposes maxDuration and 10mb bodyParser for data-URI preview", async () => {
      const api = await loadPreviewApi();
      const cfg = (
        api as {
          config?: {
            maxDuration?: number;
            api?: { bodyParser?: { sizeLimit?: string } };
          };
        }
      ).config;
      assert.equal(cfg?.maxDuration, 120);
      assert.equal(cfg?.api?.bodyParser?.sizeLimit, "10mb");
      const apiSrc = read(apiPath);
      assert.match(apiSrc, /maxDuration:\s*120/);
      assert.match(apiSrc, /sizeLimit:\s*["']10mb["']/);
    });

    it("real bundle loader + mocked fetch returns HTTP 200 valid JSON", async () => {
      const api = await loadPreviewApi();
      const prevFetch = globalThis.fetch;
      const prevToken = process.env.REPLICATE_API_TOKEN;
      const fakeFetch = (async (
        _input: string | URL | Request,
        init?: RequestInit
      ) => {
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method === "POST") {
          return new Response(
            JSON.stringify({
              id: "pred_preview_bundle_ok",
              status: "succeeded",
              output: GENERATED_HTTPS,
              model: "black-forest-labs/flux-kontext-pro",
              urls: {
                get: "https://api.replicate.com/v1/predictions/pred_preview_bundle_ok",
              },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            id: "pred_preview_bundle_ok",
            status: "succeeded",
            output: GENERATED_HTTPS,
            model: "black-forest-labs/flux-kontext-pro",
            urls: {
              get: "https://api.replicate.com/v1/predictions/pred_preview_bundle_ok",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }) as typeof fetch;

      await withPreviewEnv({ enabled: "1", accessKey: TEST_KEY }, async () => {
        process.env.REPLICATE_API_TOKEN = "test-token-not-a-real-secret";
        globalThis.fetch = fakeFetch;
        api.rateBuckets.clear();
        try {
          // Intentionally use the default loader (real CJS bundle) — no stub.
          const { res, state } = createMockResponse();
          await api.default(
            {
              method: "POST",
              headers: { "x-ai-os-control-room-key": TEST_KEY },
              body: {
                scenarioId: "balanced_recomposition_12w",
                billingConfirmed: true,
                sourceImageDataUri: JPEG_DATA_URI,
              },
            },
            res
          );
          assert.equal(state.statusCode, 200);
          const body = state.body as {
            ok?: boolean;
            result?: ImagePreviewResult;
            meta?: { service?: string };
          };
          assert.equal(body.ok, true);
          assert.equal(body.meta?.service, "ai-os-image-preview");
          assert.ok(body.result);
          assert.equal(body.result?.success, true);
          assert.equal(body.result?.generatedImage?.url, GENERATED_HTTPS);
          assert.equal(containsSensitive(body), false);
          assert.doesNotThrow(() => JSON.stringify(body));
        } finally {
          globalThis.fetch = prevFetch;
          if (prevToken === undefined) delete process.env.REPLICATE_API_TOKEN;
          else process.env.REPLICATE_API_TOKEN = prevToken;
          api.rateBuckets.clear();
        }
      });
    });

    it("UI surfaces allowlisted preview diagnostics via textContent path", () => {
      const js = read(uiJsPath);
      assert.match(js, /runtime_execute_failed:\s*true/);
      assert.match(js, /provider_failure:\s*true/);
      assert.match(js, /provider_timeout:\s*true/);
      assert.match(js, /provider_invalid_input:\s*true/);
      assert.match(js, /provider_auth_error:\s*true/);
      assert.match(js, /provider_http_error:\s*true/);
      assert.match(js, /token_missing:\s*true/);
      assert.match(js, /validation_failed:\s*true/);
      assert.match(js, /module_load_failed:\s*true/);
      assert.match(js, /Diagnostic:\s*"\s*\+\s*String\(diagnostic\)/);
      assert.match(js, /formatPreviewFailure/);
      assert.match(js, /safeDiagnostic\(payload\)/);
      assert.equal(js.includes("innerHTML"), false);
    });

    it("module_load_failed diagnostic is returned when loader throws", async () => {
      const api = await loadPreviewApi();
      await withPreviewEnv({ enabled: "1", accessKey: TEST_KEY }, async () => {
        const original = api.loadImagePreviewServiceModule;
        api.loadImagePreviewServiceModule = async () => {
          const err = new Error("Directory import is not supported");
          err.name = "Error";
          (err as Error & { code?: string }).code = "ERR_UNSUPPORTED_DIR_IMPORT";
          throw err;
        };
        try {
          api.rateBuckets.clear();
          const { res, state } = createMockResponse();
          await api.default(
            {
              method: "POST",
              headers: { "x-ai-os-control-room-key": TEST_KEY },
              body: {
                scenarioId: "balanced_recomposition_12w",
                billingConfirmed: true,
                sourceImageDataUri: JPEG_DATA_URI,
              },
            },
            res
          );
          assert.equal(state.statusCode, 500);
          const body = state.body as {
            code?: string;
            diagnostic?: string;
          };
          assert.equal(body.code, "runtime_failure");
          assert.equal(body.diagnostic, "module_load_failed");
        } finally {
          api.loadImagePreviewServiceModule = original;
        }
      });
    });
  });
});
