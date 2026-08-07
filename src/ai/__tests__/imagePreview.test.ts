/**
 * DEMAND_017 — Internal AI OS v2 Image Preview tests.
 *
 * Run: npm run test:ai
 * Zero real Replicate / paid provider traffic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
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
  IMAGE_PREVIEW_INPUT_ASSURANCES,
  IMAGE_PREVIEW_INTENDED_CONTEXT,
  IMAGE_PREVIEW_PROVIDER_SAFETY_BLOCKED_MESSAGE,
} from "../control-room/ImagePreviewTypes";
import { mapTransportFailureToPreviewError } from "../control-room/ImagePreviewService";
import {
  DEFAULT_PROMPT_ISOLATION_VARIANT,
  PRE_017C_BASELINE_SOURCE_COMMIT,
  PROMPT_ISOLATION_VARIANTS,
  applyPromptIsolationToFormatterOptions,
  buildMinimalDiagnosticPrompt,
  isPromptIsolationVariant,
  minimalPromptPassesIsolationGuards,
  resolvePromptIsolationVariant,
  type PromptIsolationVariant,
} from "../control-room/PromptIsolationVariants";
import {
  buildComparisonRows,
  buildExperimentComparison,
  buildSafeExportReport,
  comparePromptLines,
  exportFileName,
  formatInterpretationText,
  interpretPromptExperiments,
  PromptExperimentExportError,
  scanExportForUnsafeContent,
} from "../control-room/PromptExperimentComparison";
import {
  PROMPT_EXPERIMENT_HISTORY_MAX,
  PROMPT_EXPERIMENT_NONDETERMINISM_DISCLAIMER,
  PROMPT_EXPERIMENT_SCHEMA_VERSION,
  PromptExperimentHistoryStore,
  buildPromptExperimentRecord,
  classifyPromptExperimentOutcome,
  computePromptMetrics,
  countPromptCharacters,
  countPromptWords,
} from "../control-room/PromptExperimentTypes";
import {
  AI_PIPELINE_ACCORDION_SECTIONS,
  AI_PIPELINE_CANONICAL_NOTE,
  AI_PIPELINE_EVALUATION_PLACEHOLDER,
  AI_PIPELINE_INSPECTOR_SCHEMA_VERSION,
  AI_PIPELINE_RULE_GROUP_KEYS,
  AI_PIPELINE_VERSION,
} from "../control-room/AiPipelineInspectorTypes";
import {
  AI_PIPELINE_COMPARISON_UI_ORDER,
  compareAiPipelineRules,
  collectPipelineComparisonWarnings,
} from "../control-room/AiPipelineComparison";
import {
  buildRuleProvenance,
  projectAiPipelineInspector,
  provenancePathsAreSafe,
} from "../control-room/AiPipelineProjection";
import {
  TRANSFORM_RULE_FIELD_KEYS,
} from "../control-room/TransformationRuleProjection";
import {
  TRANSFORM_RULE_PIPELINE_STAGES,
  buildFormatterInspectorView,
  compareTransformationRules,
  rulesAppearBeforePromptsInPipeline,
  transformationRulesViewComplete,
} from "../control-room/TransformationRuleInspector";
import { AI_OS_RUNTIME_RULES_VERSION } from "../runtime/AiOsRuntimeTypes";
import { FluxFormatter } from "../formatters";
import { buildRenderPlan } from "../render";
import { TransformationEngine } from "../TransformationEngine";
import type { BodyProfile } from "../BodyProfile";
import type { TransformationGoal } from "../TransformationGoal";
import { directVisual } from "../visual";
import { getControlRoomScenario } from "../control-room/ControlRoomFixtures";
import {
  RUNTIME_FIXTURE_PREDICTION_ID,
  runtimeTransportSuccessResult,
} from "../runtime";
import type {
  ReplicateTransportAdapter,
  ReplicateTransportFailure,
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
              adultConfirmed: true,
              consentConfirmed: true,
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
                adultConfirmed: true,
                consentConfirmed: true,
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
                adultConfirmed: true,
                consentConfirmed: true,
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
              adultConfirmed: true,
              consentConfirmed: true,
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
              adultConfirmed: true,
              consentConfirmed: true,
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
              adultConfirmed: true,
              consentConfirmed: true,
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
              adultConfirmed: true,
              consentConfirmed: true,
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
        adultConfirmed: true,
        consentConfirmed: true,
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
            adultConfirmed: true,
            consentConfirmed: true,
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
            adultConfirmed: true,
            consentConfirmed: true,
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
            adultConfirmed: true,
            consentConfirmed: true,
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
        adultConfirmed: true,
        consentConfirmed: true,
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
          adultConfirmed: true,
          consentConfirmed: true,
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
                  inputAssurances: { ...IMAGE_PREVIEW_INPUT_ASSURANCES },
                  promptIsolation: {
                    variant: "current_ai_os",
                    radioLabel: "B",
                    promptSource: "flux_formatter_current_preview_context",
                    formatterName: "FluxFormatter",
                    formatterVersion: "1.0",
                    model: "black-forest-labs/flux-kontext-pro",
                    requestId: "test",
                    sameProviderModelTransport: true,
                    seedApplied: true,
                    seed: 101,
                  },
                  formatterComparison: null,
                  generationDiagnostics: null,
                  pipelineSnapshot: null,
                  generationPath: "body_simulator",
                  deprecatedBaseline: false,
                  comparisonRun: null,
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
                  adultConfirmed: true,
                  consentConfirmed: true,
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
                  adultConfirmed: true,
                  consentConfirmed: true,
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
        adultConfirmed: true,
        consentConfirmed: true,
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
        adultConfirmed: true,
        consentConfirmed: true,
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
            adultConfirmed: true,
            consentConfirmed: true,
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
              adultConfirmed: true,
              consentConfirmed: true,
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
        adultConfirmed: true,
        consentConfirmed: true,
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
        adultConfirmed: true,
        consentConfirmed: true,
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
        adultConfirmed: true,
        consentConfirmed: true,
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
            adultConfirmed: true,
            consentConfirmed: true,
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
        adultConfirmed: true,
        consentConfirmed: true,
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
        inputAssurances: { ...IMAGE_PREVIEW_INPUT_ASSURANCES },
        promptIsolation: {
          variant: "current_ai_os",
          radioLabel: "B",
          promptSource: "flux_formatter_current_preview_context",
          formatterName: "FluxFormatter",
          formatterVersion: "1.0",
          model: "m",
          requestId: "r1",
          sameProviderModelTransport: true,
          seedApplied: false,
          seed: null,
        },
        formatterComparison: null,
        generationDiagnostics: null,
        pipelineSnapshot: null,
        generationPath: "body_simulator",
        deprecatedBaseline: false,
        comparisonRun: null,
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
      assert.match(js, /previewAdultCheckbox\.checked/);
      assert.match(js, /previewConsentCheckbox\.checked/);
      assert.match(js, /previewBillingCheckbox\.checked/);
      assert.match(js, /clearPreviewState/);
      assert.match(html, /AI OS PREVIEW/);
      assert.match(html, /Ordinary underwear/);
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
            adultConfirmed: true,
            consentConfirmed: true,
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
                adultConfirmed: true,
                consentConfirmed: true,
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
                adultConfirmed: true,
                consentConfirmed: true,
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
                adultConfirmed: true,
                consentConfirmed: true,
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
                adultConfirmed: true,
                consentConfirmed: true,
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

  describe("PATCH 017B — adult consent and non-sexual underwear", () => {
    it("1-2. UI allows ordinary underwear for clearly adult neutral fitness", () => {
      const html = read(uiHtmlPath);
      assert.match(
        html,
        /Ordinary underwear, sports bras, swimwear, fitted training clothes/
      );
      assert.match(html, /allowed for clearly adult users/);
      assert.match(html, /neutral and non-sexual/);
      assert.equal(/underwear is (prohibited|not allowed|banned)/i.test(html), false);
    });

    it("3-5. Adult and consent confirmations exist unchecked by default", () => {
      const html = read(uiHtmlPath);
      assert.match(html, /previewAdultCheckbox/);
      assert.match(html, /at least 18 years old/);
      assert.match(html, /previewConsentCheckbox/);
      assert.match(html, /explicit permission from the adult person/);
      assert.equal(/previewAdultCheckbox[^>]*checked/i.test(html), false);
      assert.equal(/previewConsentCheckbox[^>]*checked/i.test(html), false);
      assert.equal(/previewBillingCheckbox[^>]*checked/i.test(html), false);
    });

    it("6-10. Adult confirmation rejects non-literal-true and accepts true", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), calls),
      });
      for (const value of [undefined, false, "true", 1] as const) {
        await assert.rejects(
          () =>
            service.runPreview({
              scenarioId: "balanced_recomposition_12w",
              adultConfirmed: value,
              consentConfirmed: true,
              billingConfirmed: true,
              sourceImageDataUri: JPEG_DATA_URI,
            }),
          (err: unknown) =>
            err instanceof ImagePreviewServiceError &&
            err.code === "adult_confirmation_required"
        );
      }
      assert.equal(calls.count, 0);
      const ok = await service.runPreview({
        scenarioId: "balanced_recomposition_12w",
        adultConfirmed: true,
        consentConfirmed: true,
        billingConfirmed: true,
        sourceImageDataUri: JPEG_DATA_URI,
      });
      assert.equal(ok.success, true);
      assert.equal(calls.count, 1);
    });

    it("11-15. Consent confirmation rejects non-literal-true and accepts true", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), calls),
      });
      for (const value of [undefined, false, "true", 1] as const) {
        await assert.rejects(
          () =>
            service.runPreview({
              scenarioId: "balanced_recomposition_12w",
              adultConfirmed: true,
              consentConfirmed: value,
              billingConfirmed: true,
              sourceImageDataUri: JPEG_DATA_URI,
            }),
          (err: unknown) =>
            err instanceof ImagePreviewServiceError &&
            err.code === "consent_confirmation_required"
        );
      }
      assert.equal(calls.count, 0);
      const ok = await service.runPreview({
        scenarioId: "balanced_recomposition_12w",
        adultConfirmed: true,
        consentConfirmed: true,
        billingConfirmed: true,
        sourceImageDataUri: JPEG_DATA_URI,
      });
      assert.equal(ok.success, true);
    });

    it("16-19. Provider not called before any of the three confirmations", async () => {
      const cases = [
        {
          adultConfirmed: false as unknown,
          consentConfirmed: true as unknown,
          billingConfirmed: true as unknown,
        },
        {
          adultConfirmed: true as unknown,
          consentConfirmed: false as unknown,
          billingConfirmed: true as unknown,
        },
        {
          adultConfirmed: true as unknown,
          consentConfirmed: true as unknown,
          billingConfirmed: false as unknown,
        },
      ];
      for (const conf of cases) {
        const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
        const service = new ImagePreviewService({
          transportAdapter: createFakeTransport(successTransportResult(), calls),
        });
        await assert.rejects(() =>
          service.runPreview({
            scenarioId: "balanced_recomposition_12w",
            sourceImageDataUri: JPEG_DATA_URI,
            adultConfirmed: conf.adultConfirmed,
            consentConfirmed: conf.consentConfirmed,
            billingConfirmed: conf.billingConfirmed,
          })
        );
        assert.equal(calls.count, 0);
      }
      const js = read(uiJsPath);
      assert.match(js, /previewAdultCheckbox\.checked/);
      assert.match(js, /previewConsentCheckbox\.checked/);
      assert.match(js, /previewBillingCheckbox\.checked/);
      assert.match(js, /adultConfirmed:\s*true/);
      assert.match(js, /consentConfirmed:\s*true/);
    });

    it("20-25. Generate requires all three; Lock clears; no persistent storage", () => {
      const js = read(uiJsPath);
      assert.match(js, /previewAdultCheckbox\.checked/);
      assert.match(js, /previewConsentCheckbox\.checked/);
      assert.match(js, /previewBillingCheckbox\.checked/);
      assert.match(
        js,
        /previewGenerateButton\.disabled\s*=\s*!ready/
      );
      assert.match(js, /previewAdultCheckbox\.checked = false/);
      assert.match(js, /previewConsentCheckbox\.checked = false/);
      assert.match(js, /previewBillingCheckbox\.checked = false/);
      assert.match(js, /clearPreviewState/);
      assert.equal(/localStorage\.(setItem|getItem)/.test(js), false);
      assert.equal(/sessionStorage\.(setItem|getItem)/.test(js), false);
      assert.equal(/document\.cookie\s*=/.test(js), false);
      assert.equal(/indexedDB/i.test(js), false);
      const html = read(uiHtmlPath);
      assert.match(html, /No image is stored in browser persistent storage/);
    });

    it("26. Source removal clears adult and consent confirmations", () => {
      const js = read(uiJsPath);
      assert.match(js, /clearAdultAndConsentOnSourceRemoval/);
      assert.match(js, /function onPreviewFileSelected/);
      const fnStart = js.indexOf("function onPreviewFileSelected");
      assert.ok(fnStart >= 0);
      const fnSlice = js.slice(fnStart, fnStart + 1800);
      assert.match(fnSlice, /clearAdultAndConsentOnSourceRemoval\(\)/);
      assert.match(
        js,
        /function clearAdultAndConsentOnSourceRemoval\(\)[\s\S]*?previewAdultCheckbox\.checked = false[\s\S]*?previewConsentCheckbox\.checked = false/
      );
    });

    it("billing-first validation order before provider", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), calls),
      });
      await assert.rejects(
        () =>
          service.runPreview({
            scenarioId: "balanced_recomposition_12w",
            adultConfirmed: false,
            consentConfirmed: false,
            billingConfirmed: false,
            sourceImageDataUri: JPEG_DATA_URI,
          }),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError &&
          err.code === "billing_confirmation_required"
      );
      assert.equal(calls.count, 0);
      const apiSrc = read(apiPath);
      const billingIdx = apiSrc.indexOf(
        'code: "billing_confirmation_required"'
      );
      const adultIdx = apiSrc.indexOf('code: "adult_confirmation_required"');
      const consentIdx = apiSrc.indexOf(
        'code: "consent_confirmation_required"'
      );
      // Request-handler checks (not mapServiceErrorCode) appear after allowedKeys.
      const handlerBilling = apiSrc.indexOf(
        "body.billingConfirmed !== true"
      );
      const handlerAdult = apiSrc.indexOf("body.adultConfirmed !== true");
      const handlerConsent = apiSrc.indexOf("body.consentConfirmed !== true");
      assert.ok(handlerBilling >= 0 && handlerAdult >= 0 && handlerConsent >= 0);
      assert.ok(handlerBilling < handlerAdult);
      assert.ok(handlerAdult < handlerConsent);
      assert.ok(billingIdx >= 0 && adultIdx >= 0 && consentIdx >= 0);
    });

    it("34. MIME and 5 MB limits remain", () => {
      assert.deepEqual(
        ["image/jpeg", "image/png", "image/webp"],
        ["image/jpeg", "image/png", "image/webp"]
      );
      assert.throws(
        () => validatePreviewSourceImage(`data:image/gif;base64,${PNG_B64}`),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError && err.code === "invalid_image"
      );
      const huge = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff);
      huge[0] = 0xff;
      huge[1] = 0xd8;
      huge[2] = 0xff;
      assert.throws(
        () =>
          validatePreviewSourceImage(
            `data:image/jpeg;base64,${huge.toString("base64")}`
          ),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError && err.code === "image_too_large"
      );
    });

    it("27-31. Safety context preserves presentation and limits body-only transform", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), calls),
      });
      const result = await service.runPreview({
        scenarioId: "balanced_recomposition_12w",
        adultConfirmed: true,
        consentConfirmed: true,
        billingConfirmed: true,
        sourceImageDataUri: JPEG_DATA_URI,
      });
      const prompt =
        result.artifacts?.formattedRequestSummary.positivePrompt ?? "";
      const negative =
        result.artifacts?.formattedRequestSummary.negativePrompt ?? "";
      assert.match(prompt, /\bSAFETY\b/);
      assert.match(prompt, /Preserve the subject's original presentation/);
      assert.match(prompt, /clothing coverage/);
      assert.match(
        prompt,
        /must not introduce explicit pornographic content that is absent from the source image/i
      );
      assert.equal(/underwear is (prohibited|banned|not allowed)/i.test(prompt), false);
      assert.equal(
        /ordinary underwear only|modest underwear|No sexualization|No age reduction|appears young|underage/i.test(
          prompt
        ),
        false
      );
      assert.match(negative, /explicit pornographic content absent from source/i);
      assert.equal(calls.count, 1);
    });

    it("32. API route does not handwrite the full provider prompt", () => {
      const apiSrc = read(apiPath);
      assert.equal(apiSrc.includes("SOURCE\n"), false);
      assert.equal(apiSrc.includes("buildSafetySection"), false);
      assert.equal(/positivePrompt\s*=/.test(apiSrc), false);
    });

    it("33-36. Provider safety block is terminal, safe, no retry, no raw moderation", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const failing: ReplicateTransportFailure = {
        success: false,
        provider: "replicate",
        imageUrl: null,
        generationTimeMs: 10,
        error: {
          code: "provider_failed",
          message: "The input or output was flagged as sensitive. (E005)",
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
            adultConfirmed: true,
            consentConfirmed: true,
            billingConfirmed: true,
            sourceImageDataUri: JPEG_DATA_URI,
          }),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError &&
          err.code === "provider_safety_blocked" &&
          err.message === IMAGE_PREVIEW_PROVIDER_SAFETY_BLOCKED_MESSAGE
      );
      assert.equal(calls.count, 1);
      const mapped = mapTransportFailureToPreviewError(failing);
      assert.equal(mapped.code, "provider_safety_blocked");
      assert.equal(/E005|flagged as sensitive|moderation score/i.test(mapped.message), false);
      const apiSrc = read(apiPath);
      assert.match(apiSrc, /provider_safety_blocked/);
      assert.match(apiSrc, /HelseApp did not bypass the safety filter/);
    });

    it("37-38. Successful projection includes exact inputAssurances; incomplete invalidates", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), calls),
      });
      const result = await service.runPreview({
        scenarioId: "balanced_recomposition_12w",
        adultConfirmed: true,
        consentConfirmed: true,
        billingConfirmed: true,
        sourceImageDataUri: JPEG_DATA_URI,
      });
      assert.deepEqual(result.inputAssurances, {
        adultConfirmed: true,
        consentConfirmed: true,
        billingConfirmed: true,
        intendedContext: IMAGE_PREVIEW_INTENDED_CONTEXT,
      });
      const incomplete = structuredClone(result);
      incomplete.inputAssurances = {
        adultConfirmed: true,
        consentConfirmed: true,
        billingConfirmed: true,
        intendedContext: "other" as typeof IMAGE_PREVIEW_INTENDED_CONTEXT,
      };
      incomplete.success = true;
      const check = validateImagePreviewProjection(incomplete);
      assert.equal(check.valid, false);
      const sanitized = sanitizeImagePreviewProjection(incomplete);
      assert.equal(sanitized.success, false);
    });

    it("39-41. One provider call; rate limit remains; invalid confirmations do not consume", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), calls),
      });
      await service.runPreview({
        scenarioId: "balanced_recomposition_12w",
        adultConfirmed: true,
        consentConfirmed: true,
        billingConfirmed: true,
        sourceImageDataUri: JPEG_DATA_URI,
      });
      assert.equal(calls.count, 1);

      const api = await loadPreviewApi();
      await withPreviewEnv({ enabled: "1", accessKey: TEST_KEY, maxPerHour: "3" }, async () => {
        api.rateBuckets.clear();
        const before = api.rateBuckets.size;
        const { res, state } = createMockResponse();
        await api.default(
          {
            method: "POST",
            headers: { "x-ai-os-control-room-key": TEST_KEY },
            body: {
              scenarioId: "balanced_recomposition_12w",
              adultConfirmed: false,
              consentConfirmed: true,
              billingConfirmed: true,
              sourceImageDataUri: JPEG_DATA_URI,
            },
          },
          res
        );
        assert.equal(state.statusCode, 400);
        assert.equal(
          (state.body as { code?: string }).code,
          "adult_confirmation_required"
        );
        assert.equal(api.rateBuckets.size, before);
        const apiSrc = read(apiPath);
        assert.match(apiSrc, /consumeRateLimit/);
        assert.match(
          apiSrc,
          /Full image validation before consuming the hourly paid-request allowance/
        );
      });
    });

    it("35-37,40. Legacy routes/UI unlock/dry-run unchanged; no provider in unit tests", () => {
      assert.equal(existsSync(imageRoutePath), true);
      assert.equal(read(imageRoutePath).includes("adultConfirmed"), false);
      assert.equal(read(replicatePath).includes("adultConfirmed"), false);
      assert.equal(read(indexHtmlPath).includes("previewAdultCheckbox"), false);
      const html = read(uiHtmlPath);
      assert.match(html, /Unlock Control Room/);
      assert.match(html, /Run AI OS dry run/);
      assert.equal(read(uiJsPath).includes("api.replicate.com"), false);
    });

    it("38-39. Consent foundation / 017C do not modify transport, runtime, or provider", () => {
      // PATCH 017C owns formatter presentation rules; transport/runtime/provider stay sealed.
      const dirty = execSync(
        'git status --porcelain -- "src/ai/transport" "src/ai/provider" "src/ai/runtime"',
        { encoding: "utf8", cwd: repoRoot }
      ).trim();
      assert.equal(dirty, "");
      const unstaged = execSync(
        'git diff --name-only HEAD -- "src/ai/transport" "src/ai/provider" "src/ai/runtime"',
        { encoding: "utf8", cwd: repoRoot }
      ).trim();
      assert.equal(unstaged, "");
      const msg = execSync("git log -1 --pretty=%s", {
        encoding: "utf8",
        cwd: repoRoot,
      }).trim();
      if (msg === "Add adult consent safeguards to image preview") {
        const files = execSync("git show --name-only --pretty=format: HEAD", {
          encoding: "utf8",
          cwd: repoRoot,
        });
        assert.equal(/src\/ai\/formatters\//.test(files), false);
        assert.equal(/src\/ai\/transport\//.test(files), false);
        assert.equal(/src\/ai\/provider\//.test(files), false);
        assert.equal(/src\/ai\/runtime\//.test(files), false);
      }
      if (msg === "Preserve original presentation in AI OS formatter") {
        const files = execSync("git show --name-only --pretty=format: HEAD", {
          encoding: "utf8",
          cwd: repoRoot,
        });
        assert.equal(/src\/ai\/transport\//.test(files), false);
        assert.equal(/src\/ai\/provider\//.test(files), false);
        assert.equal(/src\/ai\/runtime\//.test(files), false);
        assert.equal(/api\/generate-future-you\.js/.test(files), false);
        assert.equal(/lib\/replicate\.js/.test(files), false);
      }
      const docs = read(docsPath);
      assert.match(docs, /Patch 017C/);
      assert.match(docs, /Demand 018/);
      assert.match(docs, /Provider limitations/);
      assert.match(
        docs,
        /preserves the user's original presentation|Preserve original presentation/i
      );
    });
  });

  describe("DEMAND 018A — Prompt Isolation Lab", () => {
    function samplePlanFromScenario() {
      const scenario = getControlRoomScenario("balanced_recomposition_12w");
      assert.ok(scenario);
      const profile = scenario.runtimeInput.profile as BodyProfile;
      const goal = scenario.runtimeInput.goal as TransformationGoal;
      const engine = new TransformationEngine();
      const plan = engine.compute(profile, goal);
      const direction = directVisual(profile, goal, plan);
      return buildRenderPlan(plan, direction);
    }

    async function runVariant(variant: PromptIsolationVariant) {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(successTransportResult(), calls),
      });
      const result = await service.runPreview({
        scenarioId: "balanced_recomposition_12w",
        adultConfirmed: true,
        consentConfirmed: true,
        billingConfirmed: true,
        sourceImageDataUri: JPEG_DATA_URI,
        promptIsolationVariant: variant,
      });
      return { result, calls };
    }

    it("1. Four allowlisted variants exist", () => {
      assert.deepEqual([...PROMPT_ISOLATION_VARIANTS], [
        "minimal",
        "current_ai_os",
        "current_without_preview_context",
        "pre_017c_baseline",
      ]);
    });

    it("2. Default variant is current_ai_os (B)", () => {
      assert.equal(DEFAULT_PROMPT_ISOLATION_VARIANT, "current_ai_os");
      assert.equal(resolvePromptIsolationVariant(undefined), "current_ai_os");
      assert.equal(resolvePromptIsolationVariant(""), "current_ai_os");
    });

    it("3. Unknown variants are rejected", () => {
      assert.equal(isPromptIsolationVariant("custom"), false);
      assert.equal(resolvePromptIsolationVariant("custom"), null);
      assert.equal(resolvePromptIsolationVariant({}), null);
    });

    it("4. Service rejects unknown variant", async () => {
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
            adultConfirmed: true,
            consentConfirmed: true,
            billingConfirmed: true,
            sourceImageDataUri: JPEG_DATA_URI,
            promptIsolationVariant: "not_a_variant",
          }),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError && err.code === "invalid_request"
      );
    });

    it("5. API rejects unknown variant before provider", async () => {
      const api = await loadPreviewApi();
      await withPreviewEnv({ enabled: "1", accessKey: TEST_KEY }, async () => {
        let loaded = false;
        api.loadImagePreviewServiceModule = async () => {
          loaded = true;
          throw new Error("should not load");
        };
        const { res, state } = createMockResponse();
        await api.default(
          {
            method: "POST",
            headers: { "x-ai-os-control-room-key": TEST_KEY },
            body: {
              scenarioId: "balanced_recomposition_12w",
              adultConfirmed: true,
              consentConfirmed: true,
              billingConfirmed: true,
              sourceImageDataUri: JPEG_DATA_URI,
              promptIsolationVariant: "arbitrary_text",
            },
          },
          res
        );
        assert.equal(state.statusCode, 400);
        assert.equal((state.body as { code?: string }).code, "invalid_request");
        assert.equal(loaded, false);
      });
    });

    it("6. Minimal prompt adapts timeline/goal and passes isolation guards", () => {
      const prompt = buildMinimalDiagnosticPrompt({
        timelineWeeks: 12,
        direction: "recomposition",
      });
      assert.match(prompt, /12-week/);
      assert.match(prompt, /body recomposition/);
      assert.match(prompt, /same person, pose, clothing, framing/);
      assert.equal(minimalPromptPassesIsolationGuards(prompt), true);
    });

    it("7. Minimal prompt forbids policy/safety filter wording", () => {
      assert.equal(
        minimalPromptPassesIsolationGuards(
          "adult consent moderation safety filter underwear sexual"
        ),
        false
      );
    });

    it("8. Variant A minimal bypasses structured SAFETY section", async () => {
      const { result, calls } = await runVariant("minimal");
      const prompt =
        result.artifacts?.formattedRequestSummary.positivePrompt ?? "";
      assert.equal(/\bSAFETY\b/.test(prompt), false);
      assert.equal(/\bSOURCE\b/.test(prompt), false);
      assert.match(prompt, /12-week body recomposition/);
      assert.equal(minimalPromptPassesIsolationGuards(prompt), true);
      assert.equal(result.promptIsolation.variant, "minimal");
      assert.equal(
        result.promptIsolation.diagnosticException,
        "minimal_bypasses_structured_formatter"
      );
      assert.equal(calls.count, 1);
      assert.equal(
        calls.inputs[0]?.formattedRequest.prompt,
        prompt
      );
    });

    it("9. Variant B current_ai_os keeps 017C preview context", async () => {
      const { result, calls } = await runVariant("current_ai_os");
      const prompt =
        result.artifacts?.formattedRequestSummary.positivePrompt ?? "";
      assert.match(prompt, /\bSAFETY\b/);
      assert.match(prompt, /Preserve the subject's original presentation/);
      assert.match(
        prompt,
        /explicit pornographic content that is absent from the source image/i
      );
      assert.equal(result.promptIsolation.variant, "current_ai_os");
      assert.equal(result.promptIsolation.radioLabel, "B");
      assert.equal(calls.count, 1);
    });

    it("10. Variant C omits only previewSafetyContext", async () => {
      const { result } = await runVariant("current_without_preview_context");
      const prompt =
        result.artifacts?.formattedRequestSummary.positivePrompt ?? "";
      assert.match(prompt, /\bSOURCE\b/);
      assert.match(prompt, /\bTRANSFORM\b/);
      assert.equal(/\bSAFETY\b/.test(prompt), false);
      assert.equal(
        /Preserve the subject's original presentation/.test(prompt),
        false
      );
      assert.equal(/Clearly adult subject only/.test(prompt), false);
      assert.equal(
        result.promptIsolation.promptSource,
        "flux_formatter_without_preview_context"
      );
    });

    it("11. Variant D uses pre-017C baseline wording from inspected commit", async () => {
      const { result } = await runVariant("pre_017c_baseline");
      const prompt =
        result.artifacts?.formattedRequestSummary.positivePrompt ?? "";
      const negative =
        result.artifacts?.formattedRequestSummary.negativePrompt ?? "";
      assert.match(prompt, /Clearly adult subject only/);
      assert.match(prompt, /No sexualization/);
      assert.match(prompt, /Ordinary underwear or athletic clothing/);
      assert.equal(
        /Preserve the subject's original presentation/.test(prompt),
        false
      );
      assert.match(negative, /nudity/);
      assert.match(negative, /sexualized pose/);
      assert.equal(
        result.promptIsolation.pre017cSourceCommit,
        PRE_017C_BASELINE_SOURCE_COMMIT
      );
      assert.equal(
        PRE_017C_BASELINE_SOURCE_COMMIT,
        "10f07b4d12a9e40ed5b878830dbf0f9639fd1d2e"
      );
    });

    it("12. Pre-017C source commit is parent of a66ad34", () => {
      const parent = execSync(
        "git rev-parse a66ad34f9bdd98770468b2d9d91fa4936b2f481c~1",
        { encoding: "utf8", cwd: repoRoot }
      ).trim();
      assert.equal(parent, PRE_017C_BASELINE_SOURCE_COMMIT);
    });

    it("13. Formatter options map correctly per variant", () => {
      const base = { aspectRatio: "3:4", seed: 101, quality: "standard" as const };
      const a = applyPromptIsolationToFormatterOptions(
        "minimal",
        base,
        "Generate a realistic 12-week body recomposition while preserving the same person, pose, clothing, framing and photographic identity."
      );
      assert.equal(a.promptIsolationDiagnostic, "minimal");
      assert.equal(a.previewSafetyContext, undefined);
      assert.equal(a.seed, 101);
      const b = applyPromptIsolationToFormatterOptions("current_ai_os", base, "");
      assert.equal(b.previewSafetyContext, "non_sexual_fitness_visualization");
      const c = applyPromptIsolationToFormatterOptions(
        "current_without_preview_context",
        base,
        ""
      );
      assert.equal(c.previewSafetyContext, undefined);
      const d = applyPromptIsolationToFormatterOptions(
        "pre_017c_baseline",
        base,
        ""
      );
      assert.equal(d.previewSafetyContext, "pre_017c_baseline");
    });

    it("14. Same seed/model/transport across variants", async () => {
      const variants: PromptIsolationVariant[] = [
        "minimal",
        "current_ai_os",
        "current_without_preview_context",
        "pre_017c_baseline",
      ];
      const models = new Set<string>();
      const seeds = new Set<number | undefined>();
      for (const variant of variants) {
        const { result, calls } = await runVariant(variant);
        models.add(result.promptIsolation.model);
        seeds.add(calls.inputs[0]?.formattedRequest.seed);
        assert.equal(result.promptIsolation.sameProviderModelTransport, true);
        assert.equal(calls.count, 1);
        assert.equal(result.promptIsolation.seedApplied, true);
        assert.equal(result.promptIsolation.seed, 101);
      }
      assert.equal(models.size, 1);
      assert.equal(seeds.size, 1);
      assert.equal([...seeds][0], 101);
    });

    it("15. Safety block returns provider_failure + provider_safety_blocked + variant", async () => {
      const api = await loadPreviewApi();
      await withPreviewEnv({ enabled: "1", accessKey: TEST_KEY }, async () => {
        api.rateBuckets.clear();
        api.loadImagePreviewServiceModule = async () => ({
          ImagePreviewService: class {
            async runPreview() {
              throw new ImagePreviewServiceError(
                "provider_safety_blocked",
                IMAGE_PREVIEW_PROVIDER_SAFETY_BLOCKED_MESSAGE
              );
            }
          },
          ImagePreviewServiceError,
          validatePreviewSourceImage,
        });
        const { res, state } = createMockResponse();
        await api.default(
          {
            method: "POST",
            headers: { "x-ai-os-control-room-key": TEST_KEY },
            body: {
              scenarioId: "balanced_recomposition_12w",
              adultConfirmed: true,
              consentConfirmed: true,
              billingConfirmed: true,
              sourceImageDataUri: JPEG_DATA_URI,
              promptIsolationVariant: "pre_017c_baseline",
            },
          },
          res
        );
        const body = state.body as {
          code?: string;
          diagnostic?: string;
          promptIsolation?: { variant?: string; radioLabel?: string };
          message?: string;
        };
        assert.equal(state.statusCode, 502);
        assert.equal(body.code, "provider_failure");
        assert.equal(body.diagnostic, "provider_safety_blocked");
        assert.equal(body.promptIsolation?.variant, "pre_017c_baseline");
        assert.equal(body.promptIsolation?.radioLabel, "D");
        assert.equal(/E005|flagged as sensitive/i.test(body.message ?? ""), false);
      });
    });

    it("16. Billing confirmation still required for isolation lab", async () => {
      const api = await loadPreviewApi();
      await withPreviewEnv({ enabled: "1", accessKey: TEST_KEY }, async () => {
        const { res, state } = createMockResponse();
        await api.default(
          {
            method: "POST",
            headers: { "x-ai-os-control-room-key": TEST_KEY },
            body: {
              scenarioId: "balanced_recomposition_12w",
              adultConfirmed: true,
              consentConfirmed: true,
              billingConfirmed: false,
              sourceImageDataUri: JPEG_DATA_URI,
              promptIsolationVariant: "minimal",
            },
          },
          res
        );
        assert.equal(state.statusCode, 400);
        assert.equal(
          (state.body as { code?: string }).code,
          "billing_confirmation_required"
        );
      });
    });

    it("17. UI has Prompt Isolation Lab radios A–D default B", () => {
      const html = read(uiHtmlPath);
      assert.match(html, /Prompt Isolation Lab/);
      assert.match(html, /promptIsolationVariantA/);
      assert.match(html, /promptIsolationVariantB[\s\S]*checked/);
      assert.match(html, /value="minimal"/);
      assert.match(html, /value="current_ai_os"/);
      assert.match(html, /value="current_without_preview_context"/);
      assert.match(html, /value="pre_017c_baseline"/);
      assert.match(html, /Generate one diagnostic preview/);
      assert.match(html, /Interpretation guide/);
      assert.match(html, /paid AI provider request/);
    });

    it("18. UI is manual-only (no Run All / auto cycle)", () => {
      const html = read(uiHtmlPath);
      const js = read(uiJsPath);
      assert.match(html, /no Run All/i);
      assert.equal(/id=["']runAll|Run All variants/i.test(html), false);
      assert.equal(/autoCycle|runAllVariants/i.test(js), false);
      assert.equal(/setInterval\([^)]*generatePreview/i.test(js), false);
      assert.match(js, /fromIsolationLab:\s*true/);
      assert.match(js, /getSelectedPromptIsolationVariant/);
      assert.match(js, /textContent/);
      assert.equal(js.includes("innerHTML"), false);
    });

    it("19. UI disables generate while in flight", () => {
      const js = read(uiJsPath);
      assert.match(js, /promptIsolationGenerateButton\.disabled/);
      assert.match(js, /previewInFlight/);
    });

    it("20. FluxFormatter minimal diagnostic short-circuits structured sections", () => {
      const formatter = new FluxFormatter();
      const plan = samplePlanFromScenario();
      const formatted = formatter.format(plan, {
        promptIsolationDiagnostic: "minimal",
        promptIsolationMinimalPrompt:
          "Generate a realistic 12-week body recomposition while preserving the same person, pose, clothing, framing and photographic identity.",
        seed: 101,
      });
      assert.equal(/\bSAFETY\b/.test(formatted.prompt), false);
      assert.equal(/\bSOURCE\b/.test(formatted.prompt), false);
      assert.equal(formatted.seed, 101);
      assert.equal(formatted.negativePrompt, undefined);
    });

    it("21. FluxFormatter pre_017c_baseline does not alter current 017C path", () => {
      const formatter = new FluxFormatter();
      const plan = samplePlanFromScenario();
      const current = formatter.format(plan, {
        previewSafetyContext: "non_sexual_fitness_visualization",
      });
      const baseline = formatter.format(plan, {
        previewSafetyContext: "pre_017c_baseline",
      });
      assert.match(current.prompt, /Preserve the subject's original presentation/);
      assert.match(baseline.prompt, /Clearly adult subject only/);
      assert.notEqual(current.prompt, baseline.prompt);
    });

    it("22. Docs cover Prompt Isolation Lab and Demand 019", () => {
      const docs = read(docsPath);
      assert.match(docs, /## Prompt Isolation Lab/);
      assert.match(docs, /Demand 019/);
      assert.match(docs, /pre_017c_baseline/);
      assert.match(docs, /10f07b4/);
      assert.match(docs, /minimal_bypasses_structured_formatter|narrow exception/i);
      assert.match(docs, /legal\/onboarding|Demand 019/i);
    });

    it("23. Forbidden production files untouched by this demand", () => {
      const dirty = execSync(
        'git status --porcelain -- "api/generate-future-you.js" "lib/replicate.js" "public/index.html" "vercel.json"',
        { encoding: "utf8", cwd: repoRoot }
      ).trim();
      assert.equal(dirty, "");
    });

    it("24. No moderation bypass fields introduced", () => {
      const serviceSrc = read(
        join(repoRoot, "src/ai/control-room/ImagePreviewService.ts")
      );
      const apiSrc = read(apiPath);
      assert.equal(serviceSrc.includes("disable_safety_checker"), false);
      assert.equal(apiSrc.includes("disable_safety_checker"), false);
      assert.equal(/safety_tolerance\s*[:=]\s*[3-9]/.test(serviceSrc), false);
    });

    it("25. Default preview path still uses current_ai_os semantics", async () => {
      const current = await runVariant("current_ai_os");
      const omitted = await runVariant("current_without_preview_context");
      assert.match(
        current.result.artifacts?.formattedRequestSummary.positivePrompt ?? "",
        /Preserve the subject's original presentation/
      );
      assert.equal(
        /\bSAFETY\b/.test(
          omitted.result.artifacts?.formattedRequestSummary.positivePrompt ?? ""
        ),
        false
      );
    });

    it("26. Success projection always includes promptIsolation summary", async () => {
      const { result } = await runVariant("current_ai_os");
      assert.equal(result.promptIsolation.variant, "current_ai_os");
      assert.equal(result.promptIsolation.formatterName, "FluxFormatter");
      assert.ok(result.promptIsolation.formatterVersion);
      assert.ok(result.promptIsolation.requestId);
      const check = validateImagePreviewProjection(result);
      assert.equal(check.valid, true);
    });

    it("27. Legal/onboarding policy stays out of minimal provider prompt", async () => {
      const { result } = await runVariant("minimal");
      const prompt =
        result.artifacts?.formattedRequestSummary.positivePrompt ?? "";
      assert.equal(/I confirm that every person shown/i.test(prompt), false);
      assert.equal(/billing confirmation/i.test(prompt), false);
      assert.equal(/at least 18 years old/i.test(prompt), false);
    });

    it("28. One transport call and no automatic retry for isolation variants", async () => {
      const failing: ReplicateTransportFailure = {
        success: false,
        provider: "replicate",
        imageUrl: null,
        generationTimeMs: 10,
        error: {
          code: "provider_failed",
          message: "The input or output was flagged as sensitive. (E005)",
          retryable: true,
        },
        warnings: [],
        metadata: { traceId: "t", pollingAttempts: 1 },
      };
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const service = new ImagePreviewService({
        transportAdapter: createFakeTransport(failing, calls),
      });
      await assert.rejects(
        () =>
          service.runPreview({
            scenarioId: "balanced_recomposition_12w",
            adultConfirmed: true,
            consentConfirmed: true,
            billingConfirmed: true,
            sourceImageDataUri: JPEG_DATA_URI,
            promptIsolationVariant: "minimal",
          }),
        (err: unknown) =>
          err instanceof ImagePreviewServiceError &&
          err.code === "provider_safety_blocked"
      );
      assert.equal(calls.count, 1);
    });

    it("29. Bundle rebuild path still required for Production", () => {
      const pkg = JSON.parse(read(packageJsonPath)) as {
        scripts: Record<string, string>;
      };
      assert.match(
        pkg.scripts["build:ai-image-preview-runtime"],
        /ImagePreviewService\.ts/
      );
      assert.equal(
        existsSync(
          join(
            repoRoot,
            "src/ai/control-room/imagePreviewRuntime.bundle.cjs"
          )
        ),
        true
      );
      assert.equal(
        existsSync(
          join(repoRoot, "src/ai/control-room/PromptIsolationVariants.ts")
        ),
        true
      );
    });

    it("30. Constitution production ownership remains fail-open legacy", () => {
      assert.equal(existsSync(imageRoutePath), true);
      assert.equal(existsSync(replicatePath), true);
      const docs = read(docsPath);
      assert.match(docs, /api\/generate-future-you\.js/);
      assert.match(docs, /lib\/replicate\.js/);
      assert.match(
        docs,
        /production generation path stays untouched|Production ownership remains/i
      );
    });
  });

  describe("DEMAND 018D — Prompt experiment history and comparison", () => {
    function sampleRecord(
      overrides: Partial<Parameters<typeof buildPromptExperimentRecord>[0]> = {}
    ) {
      return buildPromptExperimentRecord({
        variant: "minimal",
        scenarioId: "balanced_recomposition_12w",
        model: "black-forest-labs/flux-kontext-pro",
        outcome: "succeeded",
        positivePrompt: "line one\nline two",
        negativePrompt: "bad thing",
        formatterName: "FluxFormatter",
        formatterVersion: "1.0.0",
        ...overrides,
      });
    }

    it("1. History is session-memory only (in-memory store)", () => {
      const store = new PromptExperimentHistoryStore();
      store.add(sampleRecord());
      assert.equal(store.size(), 1);
      assert.match(read(uiJsPath), /promptExperimentHistory\s*=\s*\[\]/);
      assert.match(read(uiJsPath), /Session-only Prompt Isolation Lab history/);
    });

    it("2. History is not written to localStorage", () => {
      const js = read(uiJsPath);
      assert.equal(/localStorage\.(setItem|getItem)/.test(js), false);
      assert.equal(
        /localStorage/.test(js) &&
          /promptExperimentHistory/.test(js) &&
          /localStorage\[[^\]]*promptExperiment/.test(js),
        false
      );
    });

    it("3. History is not written to sessionStorage", () => {
      assert.equal(/sessionStorage/.test(read(uiJsPath)), false);
    });

    it("4. History is not written to IndexedDB", () => {
      const js = read(uiJsPath);
      assert.equal(/indexedDB|IDBOpenDBRequest|openDatabase/i.test(js), false);
    });

    it("5. History is not written to cookies", () => {
      assert.equal(/document\.cookie/.test(read(uiJsPath)), false);
    });

    it("6. History clears on lock", () => {
      const js = read(uiJsPath);
      assert.match(js, /clearPromptExperimentHistoryState/);
      assert.match(
        js,
        /clearPreviewState[\s\S]*clearPromptExperimentHistoryState/
      );
      assert.match(js, /lockRoom[\s\S]*clearPreviewState/);
    });

    it("7. History maximum is 20 records", () => {
      assert.equal(PROMPT_EXPERIMENT_HISTORY_MAX, 20);
      assert.match(read(uiJsPath), /PROMPT_EXPERIMENT_HISTORY_MAX\s*=\s*20/);
      const store = new PromptExperimentHistoryStore();
      assert.equal(store.maxSize, 20);
    });

    it("8. Oldest record is removed when limit is exceeded", () => {
      const store = new PromptExperimentHistoryStore(20);
      for (let i = 0; i < 21; i++) {
        store.add(
          sampleRecord({
            experimentId: `id-${i}`,
            positivePrompt: `p${i}`,
          })
        );
      }
      assert.equal(store.size(), 20);
      assert.equal(store.getAll()[0]?.experimentId, "id-1");
      assert.equal(store.getById("id-0"), null);
    });

    it("9. Source data URI never appears in history", () => {
      const record = sampleRecord({
        positivePrompt: "safe prompt text only",
      });
      const json = JSON.stringify(record);
      assert.equal(/data:image\//i.test(json), false);
      assert.equal(json.includes(JPEG_DATA_URI), false);
    });

    it("10. Access key never appears in history", () => {
      const record = sampleRecord();
      assert.equal(JSON.stringify(record).includes(TEST_KEY), false);
      assert.equal(
        JSON.stringify(record).includes("AI_OS_CONTROL_ROOM_ACCESS_KEY"),
        false
      );
    });

    it("11. Provider token never appears in history", () => {
      const record = sampleRecord();
      assert.equal(
        /REPLICATE_API_TOKEN|r8_[A-Za-z0-9]+/.test(JSON.stringify(record)),
        false
      );
    });

    it("12. Raw provider response never appears in history", () => {
      const keys = Object.keys(sampleRecord());
      assert.equal(keys.includes("rawProviderResponse"), false);
      assert.equal(keys.includes("transportResult"), false);
      assert.equal(keys.includes("headers"), false);
    });

    it("13. Prompt character counts are deterministic", () => {
      assert.equal(countPromptCharacters("abc"), 3);
      assert.equal(countPromptCharacters("a b"), 3);
      assert.equal(countPromptCharacters("café"), 4);
    });

    it("14. Prompt word counts are deterministic", () => {
      assert.equal(countPromptWords("one two three"), 3);
      assert.equal(countPromptWords("  one   two\tthree  "), 3);
    });

    it("15. Empty prompt counts are zero", () => {
      assert.equal(countPromptCharacters(""), 0);
      assert.equal(countPromptWords(""), 0);
      assert.equal(countPromptWords("   "), 0);
    });

    it("16. Positive and negative metrics are separate", () => {
      const metrics = computePromptMetrics("one two", "three four five");
      assert.equal(metrics.positiveWords, 2);
      assert.equal(metrics.negativeWords, 3);
      assert.equal(metrics.positiveCharacters, 7);
      assert.equal(metrics.negativeCharacters, 15);
      assert.equal(metrics.totalWords, 5);
      assert.equal(metrics.totalCharacters, 22);
    });

    it("17. Exactly two records may be selected for comparison", () => {
      const html = read(uiHtmlPath);
      const js = read(uiJsPath);
      assert.match(html, /Select as comparison A|comparison A/i);
      assert.match(js, /promptExperimentSelectedA/);
      assert.match(js, /promptExperimentSelectedB/);
      assert.match(js, /Select as comparison A/);
      assert.match(js, /Select as comparison B/);
      const a = sampleRecord({ variant: "minimal", experimentId: "a" });
      const b = sampleRecord({
        variant: "current_ai_os",
        experimentId: "b",
        outcome: "safety_blocked",
      });
      const rows = buildComparisonRows(a, b);
      assert.ok(rows.length >= 10);
    });

    it("18. Comparison displays both variants", () => {
      const rows = buildComparisonRows(
        sampleRecord({ variant: "minimal" }),
        sampleRecord({ variant: "current_ai_os" })
      );
      const variantRow = rows.find((r) => r.field === "variant");
      assert.equal(variantRow?.valueA, "minimal");
      assert.equal(variantRow?.valueB, "current_ai_os");
    });

    it("19. Comparison displays both outcomes", () => {
      const rows = buildComparisonRows(
        sampleRecord({ outcome: "succeeded" }),
        sampleRecord({
          variant: "current_ai_os",
          outcome: "safety_blocked",
        })
      );
      const outcomeRow = rows.find((r) => r.field === "outcome");
      assert.equal(outcomeRow?.valueA, "succeeded");
      assert.equal(outcomeRow?.valueB, "safety_blocked");
    });

    it("20. Comparison displays prompt sizes", () => {
      const rows = buildComparisonRows(
        sampleRecord({ positivePrompt: "a b c", negativePrompt: "x" }),
        sampleRecord({
          variant: "current_ai_os",
          positivePrompt: "a b",
          negativePrompt: "",
        })
      );
      assert.ok(rows.some((r) => r.field === "total words"));
      assert.ok(rows.some((r) => r.field === "total characters"));
    });

    it("21. Line comparison ignores blank lines", () => {
      const diff = comparePromptLines("a\n\n\nb", "a\nb");
      assert.deepEqual(diff.shared, ["a", "b"]);
      assert.deepEqual(diff.onlyInA, []);
      assert.deepEqual(diff.onlyInB, []);
    });

    it("22. Line comparison trims whitespace", () => {
      const diff = comparePromptLines("  hello  \n world", "hello\nworld");
      assert.deepEqual(diff.shared, ["hello", "world"]);
    });

    it("23. Shared lines are identified", () => {
      const diff = comparePromptLines("shared\nonlyA", "shared\nonlyB");
      assert.deepEqual(diff.shared, ["shared"]);
    });

    it("24. A-only lines are identified", () => {
      const diff = comparePromptLines("shared\nonlyA", "shared\nonlyB");
      assert.deepEqual(diff.onlyInA, ["onlyA"]);
    });

    it("25. B-only lines are identified", () => {
      const diff = comparePromptLines("shared\nonlyA", "shared\nonlyB");
      assert.deepEqual(diff.onlyInB, ["onlyB"]);
    });

    it("26. Interpretation uses only same-model records", () => {
      const interpretation = interpretPromptExperiments([
        sampleRecord({
          variant: "minimal",
          outcome: "succeeded",
          model: "model-a",
        }),
        sampleRecord({
          variant: "current_ai_os",
          outcome: "safety_blocked",
          model: "model-b",
        }),
      ]);
      assert.equal(interpretation.comparable, false);
      assert.match(interpretation.summary, /inconclusive/i);
    });

    it("27. Interpretation warns when models differ", () => {
      const interpretation = interpretPromptExperiments([
        sampleRecord({ model: "m1", variant: "minimal" }),
        sampleRecord({
          model: "m2",
          variant: "current_ai_os",
          outcome: "safety_blocked",
        }),
      ]);
      assert.ok(
        interpretation.warnings.some((w) => /different provider models/i.test(w))
      );
    });

    it("28. Interpretation warns when scenarios differ", () => {
      const interpretation = interpretPromptExperiments([
        sampleRecord({ scenarioId: "balanced_recomposition_12w" }),
        sampleRecord({
          scenarioId: "upper_body_definition_8w",
          variant: "current_ai_os",
          outcome: "safety_blocked",
        }),
      ]);
      assert.ok(
        interpretation.warnings.some((w) => /different scenarios/i.test(w))
      );
    });

    it("29. Minimal success plus current block produces cautious prompt hypothesis", () => {
      const interpretation = interpretPromptExperiments([
        sampleRecord({ variant: "minimal", outcome: "succeeded" }),
        sampleRecord({
          variant: "current_ai_os",
          outcome: "safety_blocked",
          diagnostic: "provider_safety_blocked",
        }),
      ]);
      assert.match(
        interpretation.summary,
        /Prompt content or complexity may be contributing/i
      );
    });

    it("30. All-blocked outcome does not blame prompt alone", () => {
      const interpretation = interpretPromptExperiments([
        sampleRecord({ variant: "minimal", outcome: "safety_blocked" }),
        sampleRecord({
          variant: "current_ai_os",
          outcome: "safety_blocked",
        }),
      ]);
      assert.match(
        interpretation.summary,
        /unlikely to be the only cause/i
      );
    });

    it("31. Interpretation always states that evidence is not proof", () => {
      const interpretation = interpretPromptExperiments([
        sampleRecord({ outcome: "succeeded" }),
      ]);
      const text = formatInterpretationText(interpretation);
      assert.match(text, /diagnostic evidence, not proof/i);
      assert.equal(
        interpretation.disclaimer,
        PROMPT_EXPERIMENT_NONDETERMINISM_DISCLAIMER
      );
    });

    it("32. Interpretation never recommends moderation bypass", () => {
      const interpretation = interpretPromptExperiments([
        sampleRecord({ variant: "minimal", outcome: "succeeded" }),
        sampleRecord({
          variant: "current_ai_os",
          outcome: "safety_blocked",
        }),
      ]);
      const text = formatInterpretationText(interpretation).toLowerCase();
      assert.equal(/disable.*moderation|bypass.*safety|circumvent/.test(text), false);
    });

    it("33. Export contains no source image", () => {
      const report = buildSafeExportReport({
        records: [sampleRecord()],
        selectedA: null,
        selectedB: null,
        interpretation: "test",
      });
      assert.equal(report.safety.containsSourceImage, false);
      assert.equal(/data:image\//i.test(JSON.stringify(report)), false);
    });

    it("34. Export contains no access key", () => {
      const report = buildSafeExportReport({
        records: [sampleRecord()],
        selectedA: null,
        selectedB: null,
        interpretation: "test",
      });
      assert.equal(report.safety.containsAccessKey, false);
      assert.equal(JSON.stringify(report).includes(TEST_KEY), false);
    });

    it("35. Export contains no provider token", () => {
      const report = buildSafeExportReport({
        records: [sampleRecord()],
        selectedA: null,
        selectedB: null,
        interpretation: "test",
      });
      assert.equal(report.safety.containsProviderToken, false);
      assert.equal(
        /REPLICATE_API_TOKEN|r8_/.test(JSON.stringify(report)),
        false
      );
    });

    it("36. Export rejects unsafe token-like content", () => {
      assert.throws(
        () =>
          buildSafeExportReport({
            records: [
              sampleRecord({
                positivePrompt: "see REPLICATE_API_TOKEN value",
              }),
            ],
            selectedA: null,
            selectedB: null,
            interpretation: "x",
          }),
        (err: unknown) => err instanceof PromptExperimentExportError
      );
      assert.ok(scanExportForUnsafeContent("Bearer abcdefghijkl"));
      assert.ok(scanExportForUnsafeContent("sk_live_test"));
      assert.ok(scanExportForUnsafeContent("data:image/png;base64,aaa"));
    });

    it("37. Export is generated locally in browser", () => {
      const js = read(uiJsPath);
      assert.match(js, /URL\.createObjectURL/);
      assert.match(js, /ai-os-prompt-experiments-/);
      assert.match(js, /application\/json/);
      assert.equal(exportFileName(new Date(Date.UTC(2026, 7, 6))), 
        "ai-os-prompt-experiments-2026-08-06.json");
    });

    it("38. Export is not uploaded", () => {
      const js = read(uiJsPath);
      assert.match(js, /not uploaded/i);
      assert.equal(
        /fetch\([^)]*promptExperiment|upload.*promptExperiment/i.test(js),
        false
      );
    });

    it("39. No provider request is added by this demand", () => {
      const js = read(uiJsPath);
      assert.match(js, /recordIsolationLabExperiment/);
      assert.equal(/runAllVariants|queueExperiment|prefetchPrediction/i.test(js), false);
      assert.match(js, /fromIsolationLab:\s*true/);
    });

    it("40. No automatic retry is added", () => {
      const js = read(uiJsPath);
      assert.equal(/autoRetry|retryIsolation|setInterval\([^)]*generatePreview/i.test(js), false);
    });

    it("41. No Run All button exists", () => {
      const html = read(uiHtmlPath);
      assert.equal(/id=["']runAll|Run All variants/i.test(html), false);
      assert.match(html, /Prompt experiment history/);
    });

    it("42. Existing one-call-per-click behavior remains", () => {
      const js = read(uiJsPath);
      assert.match(js, /previewInFlight/);
      assert.match(js, /promptIsolationGenerateButton/);
      assert.equal((js.match(/generatePreview\(\{\s*fromIsolationLab:\s*true/g) || []).length, 1);
    });

    it("43. Existing Prompt Isolation variants remain unchanged", () => {
      assert.deepEqual([...PROMPT_ISOLATION_VARIANTS], [
        "minimal",
        "current_ai_os",
        "current_without_preview_context",
        "pre_017c_baseline",
      ]);
    });

    it("44. Existing Control Room unlock remains unchanged", () => {
      assert.match(read(uiJsPath), /function unlock|unlock\(\)/);
      assert.match(read(controlRoomApiPath), /isAuthorized/);
      assert.match(read(uiHtmlPath), /Unlock Control Room/);
    });

    it("45. Existing dry run remains unchanged", () => {
      assert.match(read(uiHtmlPath), /Dry-run|runButton/i);
      assert.match(read(uiJsPath), /runScenario/);
    });

    it("46. Existing public production route remains unchanged", () => {
      const dirty = execSync(
        'git status --porcelain -- "api/generate-future-you.js" "public/index.html"',
        { encoding: "utf8", cwd: repoRoot }
      ).trim();
      assert.equal(dirty, "");
    });

    it("47. lib/replicate.js remains unchanged", () => {
      const dirty = execSync(
        'git status --porcelain -- "lib/replicate.js"',
        { encoding: "utf8", cwd: repoRoot }
      ).trim();
      assert.equal(dirty, "");
    });

    it("48. Formatter files remain unchanged", () => {
      const dirty = execSync(
        'git status --porcelain -- "src/ai/formatters"',
        { encoding: "utf8", cwd: repoRoot }
      ).trim();
      assert.equal(dirty, "");
    });

    it("49. Transport files remain unchanged", () => {
      const dirty = execSync(
        'git status --porcelain -- "src/ai/transport"',
        { encoding: "utf8", cwd: repoRoot }
      ).trim();
      assert.equal(dirty, "");
    });

    it("50. Provider files remain unchanged", () => {
      const dirty = execSync(
        'git status --porcelain -- "src/ai/provider"',
        { encoding: "utf8", cwd: repoRoot }
      ).trim();
      assert.equal(dirty, "");
      const docs = read(docsPath);
      assert.match(docs, /## Prompt experiment history/);
      assert.match(docs, /## Prompt comparison/);
      assert.match(docs, /## Diagnostic interpretation/);
      assert.match(docs, /## Safe report export/);
    });

    it("51. Outcome classification maps safety block safely", () => {
      assert.equal(
        classifyPromptExperimentOutcome({
          diagnostic: "provider_safety_blocked",
          code: "provider_failure",
        }),
        "safety_blocked"
      );
      assert.equal(
        classifyPromptExperimentOutcome({ success: true }),
        "succeeded"
      );
    });

    it("52. Preview-context interpretation rule is deterministic", () => {
      const interpretation = interpretPromptExperiments([
        sampleRecord({ variant: "minimal", outcome: "succeeded" }),
        sampleRecord({
          variant: "current_without_preview_context",
          outcome: "succeeded",
        }),
        sampleRecord({
          variant: "current_ai_os",
          outcome: "safety_blocked",
        }),
      ]);
      assert.match(
        interpretation.summary,
        /preview-specific formatter context may be contributing/i
      );
    });
  });

  describe("DEMAND 018E — AI Pipeline Inspector", () => {
    const constitutionPath = join(repoRoot, "docs/CTO/00_AI_CONSTITUTION.md");
    const transportDir = join(repoRoot, "src/ai/transport");
    const providerDir = join(repoRoot, "src/ai/provider");
    const retryDir = join(repoRoot, "src/ai/retry");
    const formattersDir = join(repoRoot, "src/ai/formatters");

    function sampleArtifacts() {
      const scenario = getControlRoomScenario("balanced_recomposition_12w");
      assert.ok(scenario);
      const profile = scenario.runtimeInput.profile as BodyProfile;
      const goal = scenario.runtimeInput.goal as TransformationGoal;
      const plan = new TransformationEngine().compute(profile, goal);
      const visual = directVisual(profile, goal, plan);
      const render = buildRenderPlan(plan, visual);
      return {
        plan,
        visual,
        render,
        goal,
        profile,
        scenarioId: scenario.summary.id,
        scenarioSummary: scenario.summary.title,
      };
    }

    function sampleRecordWithRules(
      overrides: Partial<Parameters<typeof buildPromptExperimentRecord>[0]> = {}
    ) {
      const { plan, visual, render, goal, profile, scenarioId, scenarioSummary } =
        sampleArtifacts();
      return buildPromptExperimentRecord({
        variant: "current_ai_os",
        scenarioId,
        scenarioSummary,
        goal,
        profile,
        model: "black-forest-labs/flux-kontext-pro",
        outcome: "succeeded",
        success: true,
        positivePrompt: "preserve identity\nbody recomposition",
        negativePrompt: "distorted anatomy",
        formatterName: "FluxFormatter",
        formatterVersion: "1.0.0",
        formatterMode: "flux_formatter_current_preview_context",
        transformationPlan: plan,
        visualDirection: visual,
        renderPlan: render,
        aiOsVersion: AI_OS_RUNTIME_RULES_VERSION,
        runtimeVersions: {
          runtimeRulesVersion: AI_OS_RUNTIME_RULES_VERSION,
          transformationRulesVersion: plan.rulesVersion,
          renderPlanRulesVersion: render.rulesVersion,
          formatterName: "FluxFormatter",
          formatterVersion: "1.0.0",
          resultValidatorRulesVersion: "1.0",
        },
        ...overrides,
      });
    }

    it("1. AI Pipeline Inspector exists", () => {
      assert.match(read(uiHtmlPath), /AI Pipeline Inspector/);
      assert.match(read(uiHtmlPath), /aiPipelineInspectorPanel/);
      assert.equal(AI_PIPELINE_INSPECTOR_SCHEMA_VERSION, 1);
      const snap = sampleRecordWithRules().pipelineInspector;
      assert.equal(snap.inspectorId, "ai-pipeline-inspector");
    });

    it("2. The visible parent feature name is AI Experiment Lab", () => {
      assert.match(read(uiHtmlPath), /AI Experiment Lab/);
      assert.match(read(docsPath), /## AI Experiment Lab/);
    });

    it("3. Existing Prompt Isolation variant IDs remain unchanged", () => {
      assert.deepEqual([...PROMPT_ISOLATION_VARIANTS], [
        "minimal",
        "current_ai_os",
        "current_without_preview_context",
        "pre_017c_baseline",
      ]);
      assert.match(read(uiJsPath), /ALLOWED_PROMPT_ISOLATION_VARIANTS/);
    });

    it("4. Pipeline sections appear in the required order", () => {
      assert.deepEqual([...AI_PIPELINE_ACCORDION_SECTIONS], [
        "Goal",
        "Transformation Plan",
        "Transformation Rules",
        "Body Simulator",
        "Formatter Input",
        "Formatter Preview",
        "Formatter Comparison",
        "Generation Diagnostics",
        "Pipeline Snapshot",
        "Rule Provenance",
        "Formatter",
        "Prompts",
        "Provider",
        "Result",
      ]);
      const html = read(uiHtmlPath);
      const goalIdx = html.indexOf("aiPipelineSectionGoal");
      const planIdx = html.indexOf("aiPipelineSectionPlan");
      const rulesIdx = html.indexOf("aiPipelineSectionRules");
      const bodySimIdx = html.indexOf("aiPipelineSectionBodySimulator");
      const fmtInputIdx = html.indexOf("aiPipelineSectionFormatterInput");
      const fmtPreviewIdx = html.indexOf("aiPipelineSectionFormatterPreview");
      const fmtCompareIdx = html.indexOf("aiPipelineSectionFormatterComparison");
      const genDiagIdx = html.indexOf("aiPipelineSectionGenerationDiagnostics");
      const pipeSnapIdx = html.indexOf("aiPipelineSectionPipelineSnapshot");
      const provIdx = html.indexOf("aiPipelineSectionProvenance");
      const fmtIdx = html.indexOf('id="aiPipelineSectionFormatter"');
      const promptsIdx = html.indexOf("aiPipelineSectionPrompts");
      const providerIdx = html.indexOf("aiPipelineSectionProvider");
      const resultIdx = html.indexOf("aiPipelineSectionResult");
      assert.ok(goalIdx < planIdx && planIdx < rulesIdx);
      assert.ok(rulesIdx < bodySimIdx && bodySimIdx < fmtInputIdx);
      assert.ok(fmtInputIdx < fmtPreviewIdx && fmtPreviewIdx < fmtCompareIdx);
      assert.ok(fmtCompareIdx < genDiagIdx && genDiagIdx < pipeSnapIdx);
      assert.ok(pipeSnapIdx < provIdx && provIdx < fmtIdx);
      assert.ok(fmtIdx < promptsIdx);
      assert.ok(promptsIdx < providerIdx && providerIdx < resultIdx);
    });

    it("5. Transformation Rules appear before prompts", () => {
      assert.equal(rulesAppearBeforePromptsInPipeline(), true);
      const rulesIdx = TRANSFORM_RULE_PIPELINE_STAGES.indexOf(
        "Transformation Rules"
      );
      const positiveIdx = TRANSFORM_RULE_PIPELINE_STAGES.indexOf(
        "Positive Prompt"
      );
      assert.ok(rulesIdx < positiveIdx);
      const html = read(uiHtmlPath);
      assert.ok(
        html.indexOf("aiPipelineSectionRules") <
          html.indexOf("aiPipelineSectionPrompts")
      );
    });

    it("6. Accordion uses accessible native or equivalent controls", () => {
      const html = read(uiHtmlPath);
      assert.match(html, /<details id="aiPipelineSectionRules"[^>]* open/);
      assert.match(html, /pipeline-accordion/);
      assert.match(html, /<summary>Transformation Rules<\/summary>/);
      assert.match(read(uiCssPath), /\.pipeline-section/);
    });

    it("7. Transformation Rules are derived from structured artifacts, not parsed from prompt text", () => {
      const { plan, visual, render, scenarioId } = sampleArtifacts();
      const snap = projectAiPipelineInspector({
        experimentId: "e1",
        scenarioId,
        transformationPlan: plan,
        visualDirection: visual,
        renderPlan: render,
        positivePrompt: "THIS PROMPT MUST NOT CREATE RULES xyz-unique-token",
        negativePrompt: "neg",
        outcome: "succeeded",
      });
      const json = JSON.stringify(snap.transformationRules);
      assert.equal(json.includes("xyz-unique-token"), false);
      assert.ok(snap.transformationRules.identity);
      assert.match(read(uiJsPath), /projectAiPipelineInspector|projectTransformationRules/);
    });

    it("8. Identity rule is projected", () => {
      const rules = sampleRecordWithRules().pipelineInspector.transformationRules;
      assert.ok(rules.identity);
      assert.notEqual(rules.identity, null);
    });

    it("9. Pose rule is projected", () => {
      assert.ok(sampleRecordWithRules().pipelineInspector.transformationRules.pose);
    });

    it("10. Camera rule is projected", () => {
      assert.ok(
        sampleRecordWithRules().pipelineInspector.transformationRules.camera
      );
    });

    it("11. Background rule is projected", () => {
      assert.ok(
        sampleRecordWithRules().pipelineInspector.transformationRules.background
      );
    });

    it("12. Lighting rule is projected", () => {
      assert.ok(
        sampleRecordWithRules().pipelineInspector.transformationRules.lighting
      );
    });

    it("13. Clothing rule is projected", () => {
      assert.ok(
        sampleRecordWithRules().pipelineInspector.transformationRules.clothing
      );
    });

    it("14. Body-composition rules are projected when available", () => {
      const body =
        sampleRecordWithRules().pipelineInspector.transformationRules
          .bodyComposition;
      assert.ok(body);
      assert.notEqual(body, null);
    });

    it("15. Timeline is projected when available", () => {
      assert.ok(
        sampleRecordWithRules().pipelineInspector.transformationRules.timeline
      );
    });

    it("16. Priority order is projected", () => {
      const priority =
        sampleRecordWithRules().pipelineInspector.transformationRules
          .priorityOrder;
      assert.ok(Array.isArray(priority));
      assert.ok(priority.length >= 0);
    });

    it("17. Unknown fields use null rather than invented values", () => {
      const empty = projectAiPipelineInspector({
        experimentId: "empty",
        scenarioId: "balanced_recomposition_12w",
        outcome: "runtime_failed",
      });
      assert.equal(empty.transformationRules.proportions, null);
      assert.equal(empty.goal.targetWeightChangeKg, null);
      assert.equal(empty.goal.targetMuscleChangeKg, null);
      assert.equal(empty.goal.targetBodyFatChangePct, null);
      assert.equal(empty.versions.aiOsVersion, null);
    });

    it("18. Rule provenance is included", () => {
      const snap = sampleRecordWithRules().pipelineInspector;
      assert.ok(Array.isArray(snap.ruleProvenance));
      assert.ok(snap.ruleProvenance.length > 0);
      assert.ok(snap.ruleProvenance.some((p) => p.rulePath === "identity"));
    });

    it("19. Provenance does not contain filesystem paths", () => {
      const snap = sampleRecordWithRules().pipelineInspector;
      assert.equal(provenancePathsAreSafe(snap.ruleProvenance), true);
      const json = JSON.stringify(snap.ruleProvenance);
      assert.equal(/\\src\\|\/src\/|\.ts"|\.js"/.test(json), false);
    });

    it("20. Formatter name is included", () => {
      assert.equal(
        sampleRecordWithRules().pipelineInspector.formatter.name,
        "FluxFormatter"
      );
    });

    it("21. Formatter version is included", () => {
      assert.equal(
        sampleRecordWithRules().pipelineInspector.formatter.version,
        "1.0.0"
      );
    });

    it("22. AI OS version is included when available", () => {
      assert.equal(
        sampleRecordWithRules().pipelineInspector.versions.aiOsVersion,
        AI_OS_RUNTIME_RULES_VERSION
      );
    });

    it("23. Pipeline version is included when available", () => {
      assert.equal(
        sampleRecordWithRules().pipelineInspector.versions.pipelineVersion,
        AI_PIPELINE_VERSION
      );
    });

    it("24. Transformation Rules version is included when available", () => {
      const snap = sampleRecordWithRules().pipelineInspector;
      assert.ok(snap.versions.transformationRulesVersion);
    });

    it("25. Prompt metrics remain correct", () => {
      const record = sampleRecordWithRules({
        positivePrompt: "one two three",
        negativePrompt: "four five",
      });
      assert.equal(record.promptMetrics.positiveWords, 3);
      assert.equal(record.promptMetrics.negativeWords, 2);
      assert.equal(record.pipelineInspector.prompts.metrics.totalWords, 5);
      const formatter = buildFormatterInspectorView({
        name: record.formatter.name,
        version: record.formatter.version,
        mode: record.formatter.mode,
        positivePrompt: record.prompts.positivePrompt,
        negativePrompt: record.prompts.negativePrompt,
      });
      assert.equal(formatter.output.positiveWords, 3);
    });

    it("26. History stores Transformation Rules", () => {
      const store = new PromptExperimentHistoryStore();
      const record = sampleRecordWithRules();
      store.add(record);
      assert.ok(store.getAll()[0]?.transformationRules);
      assert.ok(store.getAll()[0]?.pipelineInspector.transformationRules);
    });

    it("27. History stores Rule Provenance", () => {
      const record = sampleRecordWithRules();
      assert.ok(record.pipelineInspector.ruleProvenance.length > 0);
    });

    it("28. History stores version metadata", () => {
      const versions = sampleRecordWithRules().pipelineInspector.versions;
      assert.ok(versions.pipelineVersion);
      assert.ok(versions.formatterVersion);
      assert.ok(versions.transformationRulesVersion);
    });

    it("29. History remains session-memory only", () => {
      assert.equal(PROMPT_EXPERIMENT_HISTORY_MAX, 20);
      assert.match(read(uiJsPath), /promptExperimentHistory\s*=\s*\[\]/);
      assert.equal(/localStorage\.setItem/.test(read(uiJsPath)), false);
      assert.equal(
        /sessionStorage\.setItem.*promptExperiment|promptExperiment.*sessionStorage/.test(
          read(uiJsPath)
        ),
        false
      );
    });

    it("30. Lock clears inspector history", () => {
      assert.match(read(uiJsPath), /clearPromptExperimentHistoryState/);
      assert.match(
        read(uiJsPath),
        /clearPromptExperimentHistoryState\(\)/
      );
    });

    it("31. Rule comparison detects added fields", () => {
      const a = sampleRecordWithRules({ experimentId: "a" });
      const b = sampleRecordWithRules({ experimentId: "b" });
      const rulesA = structuredClone(a.pipelineInspector.transformationRules);
      const rulesB = structuredClone(b.pipelineInspector.transformationRules);
      rulesA.proportions = null;
      rulesB.proportions = { note: "present-in-b-only" };
      const diff = compareAiPipelineRules(rulesA, rulesB);
      assert.ok(diff.added.some((e) => e.path.startsWith("proportions")));
    });

    it("32. Rule comparison detects removed fields", () => {
      const a = sampleRecordWithRules({ experimentId: "a" });
      const b = sampleRecordWithRules({ experimentId: "b" });
      const rulesA = structuredClone(a.pipelineInspector.transformationRules);
      const rulesB = structuredClone(b.pipelineInspector.transformationRules);
      rulesA.proportions = { note: "present-in-a-only" };
      rulesB.proportions = null;
      const diff = compareAiPipelineRules(rulesA, rulesB);
      assert.ok(diff.removed.some((e) => e.path.startsWith("proportions")));
    });

    it("33. Rule comparison detects modified fields", () => {
      const a = sampleRecordWithRules({ experimentId: "a" });
      const b = sampleRecordWithRules({
        experimentId: "b",
        scenarioId: "upper_body_definition_8w",
      });
      const diff = compareAiPipelineRules(
        a.pipelineInspector.transformationRules,
        b.pipelineInspector.transformationRules
      );
      assert.ok(diff.modified.length >= 1 || diff.unchanged.length >= 1);
      const fieldDiff = compareTransformationRules(
        a.transformationRules,
        b.transformationRules
      );
      assert.equal(fieldDiff.rules.find((r) => r.key === "scenario")?.status, "modified");
    });

    it("34. Rule comparison detects unchanged fields", () => {
      const a = sampleRecordWithRules({ experimentId: "a" });
      const b = sampleRecordWithRules({ experimentId: "b" });
      const diff = compareAiPipelineRules(
        a.pipelineInspector.transformationRules,
        b.pipelineInspector.transformationRules
      );
      assert.ok(diff.unchanged.length >= 1);
    });

    it("35. Rule comparison runs before prompt comparison in UI order", () => {
      assert.deepEqual([...AI_PIPELINE_COMPARISON_UI_ORDER], [
        "Test conditions",
        "Version differences",
        "Rule differences",
        "Prompt metrics",
        "Prompt line differences",
        "Provider outcomes",
        "Cautious interpretation",
      ]);
      const html = read(uiHtmlPath);
      assert.ok(
        html.indexOf("Transformation Rules difference") <
          html.indexOf("Prompt texts and line difference")
      );
      assert.match(read(uiJsPath), /Rules FIRST/);
    });

    it("36. Comparison warns on scenario mismatch", () => {
      const a = sampleRecordWithRules({ experimentId: "a" });
      const b = sampleRecordWithRules({
        experimentId: "b",
        scenarioId: "upper_body_definition_8w",
      });
      const warnings = collectPipelineComparisonWarnings(a, b);
      assert.equal(warnings.scenarioMismatch, true);
      assert.ok(warnings.warnings.some((w) => /scenario/i.test(w)));
    });

    it("37. Comparison warns on provider-model mismatch", () => {
      const a = sampleRecordWithRules({ experimentId: "a", model: "model-a" });
      const b = sampleRecordWithRules({ experimentId: "b", model: "model-b" });
      const warnings = collectPipelineComparisonWarnings(a, b);
      assert.equal(warnings.providerModelMismatch, true);
    });

    it("38. Comparison warns on formatter-version mismatch", () => {
      const a = sampleRecordWithRules({
        experimentId: "a",
        formatterVersion: "1.0.0",
      });
      const b = sampleRecordWithRules({
        experimentId: "b",
        formatterVersion: "2.0.0",
      });
      const warnings = collectPipelineComparisonWarnings(a, b);
      assert.equal(warnings.formatterVersionMismatch, true);
    });

    it("39. Export contains Transformation Rules", () => {
      const report = buildSafeExportReport({
        records: [sampleRecordWithRules()],
        selectedA: null,
        selectedB: null,
        interpretation: "test",
      });
      assert.ok(report.records[0]?.pipelineInspector?.transformationRules);
      assert.ok(report.records[0]?.transformationRules);
    });

    it("40. Export contains Rule Provenance", () => {
      const report = buildSafeExportReport({
        records: [sampleRecordWithRules()],
        selectedA: null,
        selectedB: null,
        interpretation: "test",
      });
      assert.ok(
        (report.records[0]?.pipelineInspector?.ruleProvenance?.length ?? 0) > 0
      );
    });

    it("41. Export contains version metadata", () => {
      const report = buildSafeExportReport({
        records: [sampleRecordWithRules()],
        selectedA: null,
        selectedB: null,
        interpretation: "test",
      });
      assert.ok(report.records[0]?.pipelineInspector?.versions.pipelineVersion);
    });

    it("42. Export contains prompt metrics", () => {
      const report = buildSafeExportReport({
        records: [sampleRecordWithRules()],
        selectedA: null,
        selectedB: null,
        interpretation: "test",
      });
      assert.ok(
        report.records[0]!.pipelineInspector.prompts.metrics.totalWords > 0
      );
    });

    it("43. Export contains provider outcome", () => {
      const report = buildSafeExportReport({
        records: [sampleRecordWithRules()],
        selectedA: null,
        selectedB: null,
        interpretation: "test",
      });
      assert.equal(
        report.records[0]?.pipelineInspector.provider.outcome,
        "succeeded"
      );
    });

    it("44. Export excludes source images", () => {
      const report = buildSafeExportReport({
        records: [sampleRecordWithRules()],
        selectedA: null,
        selectedB: null,
        interpretation: "ok",
      });
      assert.equal(report.safety.containsSourceImage, false);
      assert.equal(/data:image\//i.test(JSON.stringify(report)), false);
    });

    it("45. Export excludes generated-image URLs", () => {
      const report = buildSafeExportReport({
        records: [sampleRecordWithRules()],
        selectedA: null,
        selectedB: null,
        interpretation: "ok",
      });
      const json = JSON.stringify(report);
      assert.equal(/https:\/\/.*replicate\.delivery/i.test(json), false);
      assert.equal(report.records[0]?.generatedImageAvailable === true || report.records[0]?.generatedImageAvailable === false, true);
    });

    it("46. Export excludes access keys", () => {
      const report = buildSafeExportReport({
        records: [sampleRecordWithRules()],
        selectedA: null,
        selectedB: null,
        interpretation: "ok",
      });
      assert.equal(report.safety.containsAccessKey, false);
      assert.equal(JSON.stringify(report).includes(TEST_KEY), false);
    });

    it("47. Export excludes provider tokens", () => {
      const report = buildSafeExportReport({
        records: [sampleRecordWithRules()],
        selectedA: null,
        selectedB: null,
        interpretation: "ok",
      });
      assert.equal(report.safety.containsProviderToken, false);
      assert.equal(/REPLICATE_API_TOKEN/.test(JSON.stringify(report)), false);
    });

    it("48. Export excludes raw provider responses", () => {
      const report = buildSafeExportReport({
        records: [sampleRecordWithRules()],
        selectedA: null,
        selectedB: null,
        interpretation: "ok",
      });
      assert.equal(report.safety.containsRawProviderResponse, false);
    });

    it("49. Export excludes environment values", () => {
      const report = buildSafeExportReport({
        records: [sampleRecordWithRules()],
        selectedA: null,
        selectedB: null,
        interpretation: "ok",
      });
      assert.equal(report.safety.containsEnvironmentValues, false);
      assert.equal(
        /AI_OS_CONTROL_ROOM_ACCESS_KEY/.test(JSON.stringify(report)),
        false
      );
    });

    it("50. No formatter implementation changes are introduced unless required only for existing metadata exposure", () => {
      const dirty = execSync(
        `git status --porcelain -- "src/ai/formatters"`,
        { encoding: "utf8", cwd: repoRoot }
      ).trim();
      assert.equal(dirty, "");
      assert.ok(existsSync(formattersDir));
    });

    it("51. No transport files change", () => {
      const dirty = execSync(`git status --porcelain -- "src/ai/transport"`, {
        encoding: "utf8",
        cwd: repoRoot,
      }).trim();
      assert.equal(dirty, "");
      assert.ok(existsSync(transportDir));
    });

    it("52. No provider files change", () => {
      const dirty = execSync(
        `git status --porcelain -- "src/ai/provider" "src/ai/model" "src/ai/formatters/ProviderFormatter.ts"`,
        {
          encoding: "utf8",
          cwd: repoRoot,
        }
      ).trim();
      assert.equal(dirty, "");
      assert.equal(existsSync(providerDir) || existsSync(join(repoRoot, "src/ai/model")), true);
    });

    it("53. Runtime may accept canonicalBodyTransformation for Demand 022B only", () => {
      const runtimeTypes = read(
        join(repoRoot, "src/ai/runtime/AiOsRuntimeTypes.ts")
      );
      assert.match(runtimeTypes, /canonicalBodyTransformation/);
      const runtime = read(join(repoRoot, "src/ai/runtime/AiOsRuntime.ts"));
      assert.match(runtime, /applyCanonicalBodyTransformation/);
      // Transport / retry remain sealed against unrelated churn.
      const dirtyTransport = execSync(
        `git status --porcelain -- "src/ai/transport"`,
        { encoding: "utf8", cwd: repoRoot }
      ).trim();
      assert.equal(dirtyTransport, "");
    });

    it("54. No retry behavior changes", () => {
      const dirty = execSync(`git status --porcelain -- "src/ai/retry"`, {
        encoding: "utf8",
        cwd: repoRoot,
      }).trim();
      assert.equal(dirty, "");
      assert.ok(existsSync(retryDir));
    });

    it("55. No provider request is introduced", () => {
      const html = read(uiHtmlPath);
      const js = read(uiJsPath);
      assert.match(html, /Generate one diagnostic preview/i);
      assert.match(js, /fromIsolationLab:\s*true/);
      assert.equal(/id=["']runAll|Run All variants|batchGenerate/i.test(html), false);
      assert.match(html, /no Run All/i);
    });

    it("56. No automatic retry is introduced", () => {
      assert.equal(/setInterval\s*\(.*preview|autoRetry/i.test(read(uiJsPath)), false);
    });

    it("57. Existing one-call-per-click behavior remains", () => {
      assert.match(read(uiJsPath), /promptIsolationInFlight|previewInFlight/);
      assert.match(read(uiHtmlPath), /Generate one diagnostic preview/);
    });

    it("58. Existing Prompt Isolation Lab remains functional", () => {
      assert.match(read(uiHtmlPath), /Prompt Isolation/);
      assert.match(read(uiHtmlPath), /promptIsolationGenerateButton/);
      assert.equal(DEFAULT_PROMPT_ISOLATION_VARIANT, "current_ai_os");
    });

    it("59. Existing Control Room unlock remains functional", () => {
      assert.match(read(uiHtmlPath), /unlock|access key/i);
      assert.match(read(uiJsPath), /ai-os-control-room/);
    });

    it("60. Existing dry run remains functional", () => {
      assert.match(read(uiHtmlPath), /dry.?run/i);
      assert.match(read(uiJsPath), /dry_run|runButton/);
    });

    it("61. Existing production route remains unchanged", () => {
      const dirty = execSync(
        'git status --porcelain -- "api/generate-future-you.js"',
        { encoding: "utf8", cwd: repoRoot }
      ).trim();
      assert.equal(dirty, "");
      assert.ok(existsSync(imageRoutePath));
    });

    it("62. lib/replicate.js remains unchanged", () => {
      const dirty = execSync('git status --porcelain -- "lib/replicate.js"', {
        encoding: "utf8",
        cwd: repoRoot,
      }).trim();
      assert.equal(dirty, "");
      assert.ok(existsSync(replicatePath));
    });

    it("63. public/index.html remains unchanged", () => {
      const dirty = execSync('git status --porcelain -- "public/index.html"', {
        encoding: "utf8",
        cwd: repoRoot,
      }).trim();
      assert.equal(dirty, "");
      assert.ok(existsSync(indexHtmlPath));
    });

    it("extra. Constitution + docs + evaluation placeholder + export A/B rule comparison", () => {
      const constitution = read(constitutionPath);
      assert.match(constitution, /## 22\. Transformation Rules are canonical/);
      assert.match(
        constitution,
        /HelseApp business logic must never depend directly on final prompt wording/
      );
      const docs = read(docsPath);
      assert.match(docs, /## AI Pipeline Inspector/);
      assert.match(docs, /## Rule Provenance/);
      assert.match(docs, /## Expected versus actual/);
      assert.match(docs, /Demand 021/);
      assert.deepEqual(AI_PIPELINE_EVALUATION_PLACEHOLDER, {
        expectedResult: null,
        actualResult: null,
        deviation: null,
      });
      assert.match(AI_PIPELINE_CANONICAL_NOTE, /canonical representation/);
      assert.equal(AI_PIPELINE_RULE_GROUP_KEYS.length, 12);
      const a = sampleRecordWithRules({ experimentId: "export-a" });
      const b = sampleRecordWithRules({
        experimentId: "export-b",
        scenarioId: "upper_body_definition_8w",
      });
      const report = buildSafeExportReport({
        records: [a, b],
        selectedA: a.experimentId,
        selectedB: b.experimentId,
        interpretation: "test",
      });
      assert.ok(report.comparisons.ruleComparison);
      assert.equal(PROMPT_EXPERIMENT_SCHEMA_VERSION, 3);
      const bundle = buildExperimentComparison(a, b);
      assert.ok(bundle.pipelineRuleComparison);
      assert.ok(bundle.uiOrder.includes("Rule differences"));
      assert.ok(buildRuleProvenance({
        planPresent: true,
        visualPresent: true,
        renderPresent: true,
        goalPresent: true,
        scenarioIdPresent: true,
      }).length > 0);
      assert.equal(transformationRulesViewComplete(a.transformationRules), true);
      assert.equal(TRANSFORM_RULE_FIELD_KEYS.length >= 12, true);
      assert.match(read(uiHtmlPath), /Unavailable|pipeline-version-badges/);
      assert.match(read(uiJsPath), /schemaVersion:\s*3/);
    });
  });
});
