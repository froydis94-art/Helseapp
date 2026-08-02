/**
 * DEMAND_011 — Server-side Replicate transport adapter tests (mocked fetch only).
 *
 * Run: npm run test:ai
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FLUX_FORMATTER_VERSION, type FormattedImageRequest } from "../formatters";
import {
  DEFAULT_CREATE_TIMEOUT_MS,
  DEFAULT_MAX_POLL_ATTEMPTS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_REPLICATE_API_BASE_URL,
  DEFAULT_REPLICATE_TRANSPORT_CONFIG,
  DEFAULT_REPLICATE_TRANSPORT_MODEL,
  DEFAULT_TOTAL_TIMEOUT_MS,
  MAX_DATA_URI_CHARS,
  NEGATIVE_PROMPT_APPENDIX_LABEL,
  ReplicateTransportAdapter,
  buildReplicateCreatePredictionBody,
  createReplicateTransportConfigFromEnv,
  extractReplicateImageUrl,
  isAllowedReplicatePollUrl,
  sanitizeProviderErrorMessage,
  toSafeReplicateTransportConfigView,
  validateReplicateTransportInput,
  type ReplicateTransportConfig,
  type ReplicateTransportInput,
  type ReplicateTransportResult,
} from "../transport";
import { resolveOfficialReplicateApiBaseUrl } from "../transport/ReplicateTransportAdapter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const transportDir = join(__dirname, "..", "transport");
const packageJsonPath = join(__dirname, "..", "..", "..", "package.json");
const packageLockPath = join(__dirname, "..", "..", "..", "package-lock.json");

const FAKE_TOKEN = "r8_TEST_TOKEN_DO_NOT_LEAK_1234567890";
const IMAGE_HTTPS = "https://cdn.example.com/out/result.png";
const SOURCE_HTTPS = "https://cdn.example.com/source/in.jpg";
const SMALL_JPEG_DATA_URI =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";

function sampleFormatted(
  overrides: Partial<FormattedImageRequest> = {}
): FormattedImageRequest {
  return {
    providerFamily: "flux",
    prompt: [
      "SOURCE: Edit this exact source photograph.",
      "IDENTITY: Keep the same person.",
      "SCENE: Preserve pose and lighting.",
      "TRANSFORM: Reduce soft tissue at the waist moderately.",
      "ANATOMY: Preserve skeletal frame.",
      "REALISM: Photorealistic documentary fitness photo.",
    ].join("\n"),
    negativePrompt: "identity drift\nimpossible anatomy",
    sourceOperation: "edit_source_image",
    aspectRatio: "3:4",
    seed: 42,
    quality: "standard",
    style: "natural_athletic",
    warnings: [],
    metadata: {
      formatterName: "FluxFormatter",
      formatterVersion: FLUX_FORMATTER_VERSION,
      renderPlanSchemaVersion: 1,
      renderPlanRulesVersion: "1.0",
      transformationRulesVersion: "1.0",
      visualDirectionRulesVersion: "1.0",
      estimateReliability: "medium",
    },
    ...overrides,
  };
}

function sampleInput(
  overrides: Partial<ReplicateTransportInput> = {}
): ReplicateTransportInput {
  return {
    formattedRequest: sampleFormatted(),
    sourceImage: { kind: "https_url", value: SOURCE_HTTPS },
    traceId: "trace-demand-011-safe",
    ...overrides,
  };
}

function enabledConfig(
  overrides: Partial<ReplicateTransportConfig> = {}
): ReplicateTransportConfig {
  return {
    ...DEFAULT_REPLICATE_TRANSPORT_CONFIG,
    enabled: true,
    apiToken: FAKE_TOKEN,
    pollIntervalMs: 1,
    createTimeoutMs: 5_000,
    totalTimeoutMs: 5_000,
    maxPollAttempts: 5,
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(status: number, body: string): Response {
  return new Response(body, { status });
}

function assertNoSecrets(result: ReplicateTransportResult, prompt: string): void {
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(FAKE_TOKEN), false);
  assert.equal(/Authorization/i.test(serialized), false);
  assert.equal(/Bearer\s+r8_/i.test(serialized), false);
  assert.equal(serialized.includes(SOURCE_HTTPS), false);
  assert.equal(serialized.includes("data:image/"), false);
  assert.equal(serialized.includes(prompt), false);
  assert.equal(/stack|at Object\.|Error: /i.test(serialized) && serialized.includes("    at "), false);
}

describe("DEMAND_011 Replicate transport adapter", () => {
  describe("configuration", () => {
    it("1. adapter config is disabled by default", () => {
      assert.equal(DEFAULT_REPLICATE_TRANSPORT_CONFIG.enabled, false);
      const fromEmpty = createReplicateTransportConfigFromEnv({});
      assert.equal(fromEmpty.enabled, false);
    });

    it('2. exact feature flag "1" enables config', () => {
      const cfg = createReplicateTransportConfigFromEnv({
        AI_OS_V2_REPLICATE_ENABLED: "1",
      });
      assert.equal(cfg.enabled, true);
      const almost = createReplicateTransportConfigFromEnv({
        AI_OS_V2_REPLICATE_ENABLED: "true",
      });
      assert.equal(almost.enabled, false);
    });

    it("3. missing token is represented safely as null", () => {
      const cfg = createReplicateTransportConfigFromEnv({
        AI_OS_V2_REPLICATE_ENABLED: "1",
      });
      assert.equal(cfg.apiToken, null);
    });

    it("4. token never appears in safe config JSON serialization", () => {
      const cfg = createReplicateTransportConfigFromEnv({
        AI_OS_V2_REPLICATE_ENABLED: "1",
        REPLICATE_API_TOKEN: FAKE_TOKEN,
      });
      const safe = toSafeReplicateTransportConfigView(cfg);
      const json = JSON.stringify(safe);
      assert.equal(json.includes(FAKE_TOKEN), false);
      assert.equal(json.includes("apiToken"), false);
      assert.equal(safe.hasApiToken, true);
    });

    it("5. invalid model override falls back safely", () => {
      const cfg = createReplicateTransportConfigFromEnv({
        AI_OS_V2_REPLICATE_MODEL: "https://evil.example/model",
      });
      assert.equal(cfg.model, DEFAULT_REPLICATE_TRANSPORT_MODEL);
    });

    it("6. token-like model override is rejected", () => {
      const cfg = createReplicateTransportConfigFromEnv({
        AI_OS_V2_REPLICATE_MODEL: "r8_abcdefghijklmnopqrstuvwxyz012345",
      });
      assert.equal(cfg.model, DEFAULT_REPLICATE_TRANSPORT_MODEL);
    });

    it("7. timeout overrides respect safe bounds", () => {
      const ok = createReplicateTransportConfigFromEnv({
        AI_OS_V2_REPLICATE_CREATE_TIMEOUT_MS: "12000",
        AI_OS_V2_REPLICATE_POLL_INTERVAL_MS: "2000",
        AI_OS_V2_REPLICATE_TOTAL_TIMEOUT_MS: "45000",
        AI_OS_V2_REPLICATE_MAX_POLL_ATTEMPTS: "30",
      });
      assert.equal(ok.createTimeoutMs, 12000);
      assert.equal(ok.pollIntervalMs, 2000);
      assert.equal(ok.totalTimeoutMs, 45000);
      assert.equal(ok.maxPollAttempts, 30);

      const bad = createReplicateTransportConfigFromEnv({
        AI_OS_V2_REPLICATE_CREATE_TIMEOUT_MS: "999999",
        AI_OS_V2_REPLICATE_POLL_INTERVAL_MS: "0",
        AI_OS_V2_REPLICATE_TOTAL_TIMEOUT_MS: "not-a-number",
        AI_OS_V2_REPLICATE_MAX_POLL_ATTEMPTS: "-1",
      });
      assert.equal(bad.createTimeoutMs, DEFAULT_CREATE_TIMEOUT_MS);
      assert.equal(bad.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS);
      assert.equal(bad.totalTimeoutMs, DEFAULT_TOTAL_TIMEOUT_MS);
      assert.equal(bad.maxPollAttempts, DEFAULT_MAX_POLL_ATTEMPTS);
    });
  });

  describe("input validation", () => {
    it("8. valid HTTPS source image is accepted", () => {
      const v = validateReplicateTransportInput(sampleInput());
      assert.equal(v.valid, true);
    });

    it("9. valid JPEG data URI is accepted", () => {
      const v = validateReplicateTransportInput(
        sampleInput({
          sourceImage: { kind: "data_uri", value: SMALL_JPEG_DATA_URI },
        })
      );
      assert.equal(v.valid, true);
    });

    it("10. HTTP source image is rejected", () => {
      const v = validateReplicateTransportInput(
        sampleInput({
          sourceImage: {
            kind: "https_url",
            value: "http://cdn.example.com/in.jpg",
          },
        })
      );
      assert.equal(v.valid, false);
    });

    it("11. SVG data URI is rejected", () => {
      const v = validateReplicateTransportInput(
        sampleInput({
          sourceImage: {
            kind: "data_uri",
            value: "data:image/svg+xml;base64,PHN2Zy8+",
          },
        })
      );
      assert.equal(v.valid, false);
    });

    it("12. unsupported source type is rejected", () => {
      const v = validateReplicateTransportInput(
        sampleInput({
          sourceImage: {
            kind: "ftp" as unknown as "https_url",
            value: SOURCE_HTTPS,
          },
        })
      );
      assert.equal(v.valid, false);
    });

    it("13. oversized data URI is rejected", () => {
      const huge =
        "data:image/jpeg;base64," + "A".repeat(MAX_DATA_URI_CHARS);
      const v = validateReplicateTransportInput(
        sampleInput({
          sourceImage: { kind: "data_uri", value: huge },
        })
      );
      assert.equal(v.valid, false);
    });

    it("14. empty trace ID is rejected", () => {
      const v = validateReplicateTransportInput(sampleInput({ traceId: "  " }));
      assert.equal(v.valid, false);
    });

    it("15. sensitive trace content is rejected", () => {
      const v = validateReplicateTransportInput(
        sampleInput({ traceId: `Bearer ${FAKE_TOKEN}` })
      );
      assert.equal(v.valid, false);
    });

    it("16. source image value never appears in returned errors", () => {
      const secret = "https://cdn.example.com/secret-source-XYZ.jpg";
      const v = validateReplicateTransportInput(
        sampleInput({
          sourceImage: {
            kind: "https_url",
            value: "http://insecure.example/x.jpg",
          },
        })
      );
      const joined = v.errors.join(" ");
      assert.equal(joined.includes("http://insecure.example"), false);
      assert.equal(joined.includes(secret), false);
      assert.match(joined, /Source image reference is invalid/i);
    });
  });

  describe("request mapping", () => {
    it("17. formatted prompt is preserved", () => {
      const input = sampleInput();
      const body = buildReplicateCreatePredictionBody(enabledConfig(), input);
      assert.ok(String(body.input.prompt).includes("TRANSFORM:"));
      assert.ok(String(body.input.prompt).startsWith(input.formattedRequest.prompt));
    });

    it("18. approved transformations are not rewritten", () => {
      const input = sampleInput();
      const original = input.formattedRequest.prompt;
      buildReplicateCreatePredictionBody(enabledConfig(), input);
      assert.equal(input.formattedRequest.prompt, original);
      assert.ok(original.includes("Reduce soft tissue at the waist moderately."));
    });

    it("19. negative exclusions survive mapping", () => {
      const input = sampleInput();
      const body = buildReplicateCreatePredictionBody(enabledConfig(), input);
      const prompt = String(body.input.prompt);
      assert.ok(prompt.includes(NEGATIVE_PROMPT_APPENDIX_LABEL));
      assert.ok(prompt.includes("identity drift"));
      assert.ok(prompt.includes("impossible anatomy"));
      assert.equal("negative_prompt" in body.input, false);
    });

    it("20. source image is mapped once", () => {
      const input = sampleInput();
      const body = buildReplicateCreatePredictionBody(enabledConfig(), input);
      assert.equal(body.input.input_image, SOURCE_HTTPS);
      assert.equal("image" in body.input, false);
    });

    it("21. aspect ratio is mapped only when supported", () => {
      const ok = buildReplicateCreatePredictionBody(
        enabledConfig(),
        sampleInput({ formattedRequest: sampleFormatted({ aspectRatio: "3:4" }) })
      );
      assert.equal(ok.input.aspect_ratio, "3:4");

      const badFormatted = sampleFormatted();
      (badFormatted as { aspectRatio?: string }).aspectRatio = "21:9";
      // builder still omits unsupported if somehow present
      const body = buildReplicateCreatePredictionBody(
        enabledConfig(),
        sampleInput({ formattedRequest: badFormatted })
      );
      assert.equal("aspect_ratio" in body.input, false);
    });

    it("22. invalid options are not invented", () => {
      const body = buildReplicateCreatePredictionBody(
        enabledConfig(),
        sampleInput({
          formattedRequest: sampleFormatted({
            seed: undefined,
            aspectRatio: undefined,
            quality: "high",
          }),
        })
      );
      assert.equal("seed" in body.input, false);
      assert.equal("aspect_ratio" in body.input, false);
      assert.equal("prompt_strength" in body.input, false);
      assert.equal("num_inference_steps" in body.input, false);
      assert.equal("prompt_upsampling" in body.input, false);
    });

    it("23. token is absent from body", () => {
      const body = buildReplicateCreatePredictionBody(enabledConfig(), sampleInput());
      assert.equal(JSON.stringify(body).includes(FAKE_TOKEN), false);
    });

    it("24. trace ID is absent from provider prompt and body", () => {
      const input = sampleInput({ traceId: "trace-should-not-leak" });
      const body = buildReplicateCreatePredictionBody(enabledConfig(), input);
      assert.equal(JSON.stringify(body).includes("trace-should-not-leak"), false);
    });

    it("25. input objects are not mutated", () => {
      const input = sampleInput();
      const before = JSON.stringify(input);
      buildReplicateCreatePredictionBody(enabledConfig(), input);
      assert.equal(JSON.stringify(input), before);
    });
  });

  describe("disabled and missing token", () => {
    it("26/27. disabled adapter returns adapter_disabled with zero fetch", async () => {
      let fetches = 0;
      const adapter = new ReplicateTransportAdapter(
        { ...DEFAULT_REPLICATE_TRANSPORT_CONFIG, enabled: false },
        {
          fetchFn: (async () => {
            fetches += 1;
            return jsonResponse(200, {});
          }) as typeof fetch,
        }
      );
      const result = await adapter.generate(sampleInput());
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error.code, "adapter_disabled");
        assert.equal(result.error.retryable, false);
      }
      assert.equal(fetches, 0);
    });

    it("28/29. missing token returns missing_token with zero fetch", async () => {
      let fetches = 0;
      const adapter = new ReplicateTransportAdapter(
        enabledConfig({ apiToken: null }),
        {
          fetchFn: (async () => {
            fetches += 1;
            return jsonResponse(200, {});
          }) as typeof fetch,
        }
      );
      const result = await adapter.generate(sampleInput());
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error.code, "missing_token");
      }
      assert.equal(fetches, 0);
    });
  });

  describe("create request", () => {
    it("30. successful immediate prediction returns normalized success", async () => {
      const adapter = new ReplicateTransportAdapter(enabledConfig(), {
        fetchFn: (async (_url, init) => {
          const headers = new Headers(init?.headers);
          assert.equal(headers.get("Authorization"), `Bearer ${FAKE_TOKEN}`);
          return jsonResponse(201, {
            id: "pred_immediate",
            status: "succeeded",
            output: IMAGE_HTTPS,
            urls: { get: "https://api.replicate.com/v1/predictions/pred_immediate" },
          });
        }) as typeof fetch,
        now: () => 1000,
        sleep: async () => undefined,
      });
      const input = sampleInput();
      const result = await adapter.generate(input);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.imageUrl, IMAGE_HTTPS);
        assert.equal(result.provider, "replicate");
        assert.equal(result.status, "succeeded");
        assert.equal(result.predictionId, "pred_immediate");
      }
      assertNoSecrets(result, input.formattedRequest.prompt);
    });

    it("31. successful array output uses first valid HTTPS image", async () => {
      const adapter = new ReplicateTransportAdapter(enabledConfig(), {
        fetchFn: (async () =>
          jsonResponse(201, {
            id: "pred_arr",
            status: "succeeded",
            output: ["http://bad.example/x.png", IMAGE_HTTPS],
          })) as typeof fetch,
        now: () => 1,
        sleep: async () => undefined,
      });
      const result = await adapter.generate(sampleInput());
      assert.equal(result.success, true);
      if (result.success) assert.equal(result.imageUrl, IMAGE_HTTPS);
    });

    it("32. invalid output returns invalid_provider_response", async () => {
      const adapter = new ReplicateTransportAdapter(enabledConfig(), {
        fetchFn: (async () =>
          jsonResponse(201, {
            id: "pred_bad",
            status: "succeeded",
            output: "data:image/png;base64,AAAA",
          })) as typeof fetch,
        now: () => 1,
        sleep: async () => undefined,
      });
      const result = await adapter.generate(sampleInput());
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error.code, "invalid_provider_response");
      }
    });

    it("33. Authorization header is present only in mocked fetch call", async () => {
      let sawAuth = false;
      const adapter = new ReplicateTransportAdapter(enabledConfig(), {
        fetchFn: (async (_url, init) => {
          const headers = new Headers(init?.headers);
          sawAuth = headers.get("Authorization") === `Bearer ${FAKE_TOKEN}`;
          return jsonResponse(201, {
            id: "pred_auth",
            status: "succeeded",
            output: IMAGE_HTTPS,
          });
        }) as typeof fetch,
        now: () => 1,
        sleep: async () => undefined,
      });
      const result = await adapter.generate(sampleInput());
      assert.equal(sawAuth, true);
      assert.equal(JSON.stringify(result).includes(FAKE_TOKEN), false);
    });

    it("34/35/36. token, source image, and prompt never appear in result", async () => {
      const input = sampleInput({
        sourceImage: { kind: "data_uri", value: SMALL_JPEG_DATA_URI },
      });
      const adapter = new ReplicateTransportAdapter(enabledConfig(), {
        fetchFn: (async () =>
          jsonResponse(201, {
            id: "pred_sec",
            status: "succeeded",
            output: IMAGE_HTTPS,
          })) as typeof fetch,
        now: () => 1,
        sleep: async () => undefined,
      });
      const result = await adapter.generate(input);
      assertNoSecrets(result, input.formattedRequest.prompt);
      assert.equal(JSON.stringify(result).includes(SMALL_JPEG_DATA_URI), false);
    });
  });

  describe("HTTP errors", () => {
    async function httpCase(status: number, body = "raw provider boom") {
      const adapter = new ReplicateTransportAdapter(enabledConfig(), {
        fetchFn: (async () => textResponse(status, body)) as typeof fetch,
        now: () => 1,
        sleep: async () => undefined,
      });
      return adapter.generate(sampleInput());
    }

    it("37. 401 maps to provider_auth_error", async () => {
      const r = await httpCase(401);
      assert.equal(r.success, false);
      if (!r.success) {
        assert.equal(r.error.code, "provider_auth_error");
        assert.equal(r.error.retryable, false);
      }
    });

    it("38. 403 maps to provider_auth_error", async () => {
      const r = await httpCase(403);
      assert.equal(r.success, false);
      if (!r.success) assert.equal(r.error.code, "provider_auth_error");
    });

    it("39. 429 maps to provider_rate_limited and retryable true", async () => {
      const r = await httpCase(429);
      assert.equal(r.success, false);
      if (!r.success) {
        assert.equal(r.error.code, "provider_rate_limited");
        assert.equal(r.error.retryable, true);
      }
    });

    it("40. 400 maps to provider_validation_error", async () => {
      const r = await httpCase(400);
      assert.equal(r.success, false);
      if (!r.success) assert.equal(r.error.code, "provider_validation_error");
    });

    it("41. 422 maps to provider_validation_error", async () => {
      const r = await httpCase(422);
      assert.equal(r.success, false);
      if (!r.success) assert.equal(r.error.code, "provider_validation_error");
    });

    it("42. 500 maps to provider_unavailable and retryable true", async () => {
      const r = await httpCase(500);
      assert.equal(r.success, false);
      if (!r.success) {
        assert.equal(r.error.code, "provider_unavailable");
        assert.equal(r.error.retryable, true);
      }
    });

    it("43. unknown non-2xx is normalized safely", async () => {
      const r = await httpCase(418);
      assert.equal(r.success, false);
      if (!r.success) assert.equal(r.error.code, "provider_failed");
    });

    it("44. raw provider error is truncated and sanitized", () => {
      const long = "x".repeat(500) + ` Bearer ${FAKE_TOKEN}`;
      const sanitized = sanitizeProviderErrorMessage(long);
      assert.ok(sanitized.length <= 200);
      assert.equal(sanitized.includes(FAKE_TOKEN), false);
    });
  });

  describe("polling", () => {
    it("45. starting → processing → succeeded returns success", async () => {
      let calls = 0;
      const adapter = new ReplicateTransportAdapter(
        enabledConfig({ maxPollAttempts: 5, pollIntervalMs: 1 }),
        {
          fetchFn: (async () => {
            calls += 1;
            if (calls === 1) {
              return jsonResponse(201, {
                id: "pred_poll",
                status: "starting",
                urls: {
                  get: "https://api.replicate.com/v1/predictions/pred_poll",
                },
              });
            }
            if (calls === 2) {
              return jsonResponse(200, {
                id: "pred_poll",
                status: "processing",
              });
            }
            return jsonResponse(200, {
              id: "pred_poll",
              status: "succeeded",
              output: IMAGE_HTTPS,
            });
          }) as typeof fetch,
          now: () => 1000,
          sleep: async () => undefined,
        }
      );
      const result = await adapter.generate(sampleInput());
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.imageUrl, IMAGE_HTTPS);
        assert.ok(result.metadata.pollingAttempts >= 1);
      }
    });

    it("46. failed polling returns provider_failed", async () => {
      let calls = 0;
      const adapter = new ReplicateTransportAdapter(
        enabledConfig({ pollIntervalMs: 1 }),
        {
          fetchFn: (async () => {
            calls += 1;
            if (calls === 1) {
              return jsonResponse(201, {
                id: "pred_fail",
                status: "processing",
                urls: {
                  get: "https://api.replicate.com/v1/predictions/pred_fail",
                },
              });
            }
            return jsonResponse(200, {
              id: "pred_fail",
              status: "failed",
              error: "something went wrong internally with secrets r8_ABCDEF",
            });
          }) as typeof fetch,
          now: () => 1,
          sleep: async () => undefined,
        }
      );
      const result = await adapter.generate(sampleInput());
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error.code, "provider_failed");
        assert.equal(result.error.message.includes("r8_ABCDEF"), false);
      }
    });

    it("47. canceled polling returns provider_failed", async () => {
      let calls = 0;
      const adapter = new ReplicateTransportAdapter(
        enabledConfig({ pollIntervalMs: 1 }),
        {
          fetchFn: (async () => {
            calls += 1;
            if (calls === 1) {
              return jsonResponse(201, {
                id: "pred_cancel",
                status: "starting",
                urls: {
                  get: "https://api.replicate.com/v1/predictions/pred_cancel",
                },
              });
            }
            return jsonResponse(200, {
              id: "pred_cancel",
              status: "canceled",
            });
          }) as typeof fetch,
          now: () => 1,
          sleep: async () => undefined,
        }
      );
      const result = await adapter.generate(sampleInput());
      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.error.code, "provider_failed");
    });

    it("48. untrusted polling host is rejected", async () => {
      const adapter = new ReplicateTransportAdapter(enabledConfig(), {
        fetchFn: (async () =>
          jsonResponse(201, {
            id: "pred_host",
            status: "starting",
            urls: { get: "https://evil.example/v1/predictions/pred_host" },
          })) as typeof fetch,
        now: () => 1,
        sleep: async () => undefined,
      });
      const result = await adapter.generate(sampleInput());
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error.code, "invalid_provider_response");
      }
    });

    it("49. HTTP polling URL is rejected", async () => {
      assert.equal(
        isAllowedReplicatePollUrl(
          "http://api.replicate.com/v1/predictions/abc"
        ),
        false
      );
      const adapter = new ReplicateTransportAdapter(enabledConfig(), {
        fetchFn: (async () =>
          jsonResponse(201, {
            id: "pred_http",
            status: "starting",
            urls: { get: "http://api.replicate.com/v1/predictions/pred_http" },
          })) as typeof fetch,
        now: () => 1,
        sleep: async () => undefined,
      });
      const result = await adapter.generate(sampleInput());
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error.code, "invalid_provider_response");
      }
    });

    it("50. polling URL with credentials is rejected", async () => {
      assert.equal(
        isAllowedReplicatePollUrl(
          "https://user:pass@api.replicate.com/v1/predictions/abc"
        ),
        false
      );
    });

    it("51. max polling attempts returns polling_exhausted", async () => {
      let calls = 0;
      const adapter = new ReplicateTransportAdapter(
        enabledConfig({ maxPollAttempts: 2, pollIntervalMs: 1, totalTimeoutMs: 60_000 }),
        {
          fetchFn: (async () => {
            calls += 1;
            if (calls === 1) {
              return jsonResponse(201, {
                id: "pred_ex",
                status: "processing",
                urls: { get: "https://api.replicate.com/v1/predictions/pred_ex" },
              });
            }
            return jsonResponse(200, {
              id: "pred_ex",
              status: "processing",
            });
          }) as typeof fetch,
          now: () => 1,
          sleep: async () => undefined,
        }
      );
      const result = await adapter.generate(sampleInput());
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error.code, "polling_exhausted");
        assert.equal(result.error.retryable, true);
        assert.equal(result.metadata.pollingAttempts, 2);
      }
    });

    it("52. total timeout returns request_timeout", async () => {
      const adapter = new ReplicateTransportAdapter(
        enabledConfig({
          maxPollAttempts: 50,
          pollIntervalMs: 1,
          totalTimeoutMs: 20,
          createTimeoutMs: 20,
        }),
        {
          fetchFn: (async (_url, init) => {
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(() => resolve(), 200);
              const onAbort = (): void => {
                clearTimeout(timer);
                const err = new Error("aborted");
                err.name = "AbortError";
                reject(err);
              };
              if (init?.signal?.aborted) {
                onAbort();
                return;
              }
              init?.signal?.addEventListener("abort", onAbort, { once: true });
            });
            return jsonResponse(201, {
              id: "pred_to",
              status: "succeeded",
              output: IMAGE_HTTPS,
            });
          }) as typeof fetch,
          now: () => Date.now(),
          sleep: async () => undefined,
        }
      );
      const result = await adapter.generate(sampleInput());
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error.code, "request_timeout");
        assert.equal(result.error.retryable, true);
      }
    });

    it("53. caller abort returns request_aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      const adapter = new ReplicateTransportAdapter(enabledConfig(), {
        fetchFn: (async (_url, init) => {
          if (init?.signal?.aborted) {
            const err = new Error("aborted");
            err.name = "AbortError";
            throw err;
          }
          return jsonResponse(201, {
            id: "pred_ab",
            status: "succeeded",
            output: IMAGE_HTTPS,
          });
        }) as typeof fetch,
        now: () => 1,
        sleep: async () => undefined,
      });
      const result = await adapter.generate(
        sampleInput({ abortSignal: controller.signal })
      );
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error.code, "request_aborted");
        assert.equal(result.error.retryable, true);
      }
    });

    it("54. sleep is abort-aware", async () => {
      const controller = new AbortController();
      const adapter = new ReplicateTransportAdapter(
        enabledConfig({ pollIntervalMs: 50, maxPollAttempts: 5 }),
        {
          fetchFn: (async () =>
            jsonResponse(201, {
              id: "pred_sleep",
              status: "processing",
              urls: {
                get: "https://api.replicate.com/v1/predictions/pred_sleep",
              },
            })) as typeof fetch,
          now: () => 1,
          sleep: async (_ms, signal) => {
            controller.abort();
            if (signal?.aborted || controller.signal.aborted) {
              const err = new Error("aborted");
              err.name = "AbortError";
              throw err;
            }
          },
        }
      );
      const result = await adapter.generate(
        sampleInput({ abortSignal: controller.signal })
      );
      assert.equal(result.success, false);
      if (!result.success) {
        assert.ok(
          result.error.code === "request_aborted" ||
            result.error.code === "request_timeout"
        );
      }
    });

    it("55. stable polling count is reported", async () => {
      let calls = 0;
      const adapter = new ReplicateTransportAdapter(
        enabledConfig({ maxPollAttempts: 3, pollIntervalMs: 1 }),
        {
          fetchFn: (async () => {
            calls += 1;
            if (calls === 1) {
              return jsonResponse(201, {
                id: "pred_count",
                status: "processing",
                urls: {
                  get: "https://api.replicate.com/v1/predictions/pred_count",
                },
              });
            }
            if (calls < 4) {
              return jsonResponse(200, {
                id: "pred_count",
                status: "processing",
              });
            }
            return jsonResponse(200, {
              id: "pred_count",
              status: "succeeded",
              output: IMAGE_HTTPS,
            });
          }) as typeof fetch,
          now: () => 1,
          sleep: async () => undefined,
        }
      );
      const result = await adapter.generate(sampleInput());
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.metadata.pollingAttempts, 3);
      }
    });
  });

  describe("apiBaseUrl allowlist (CTO PATCH 011A)", () => {
    async function generateWithBaseUrl(apiBaseUrl: string): Promise<{
      result: ReplicateTransportResult;
      fetches: number;
      requestedUrls: string[];
    }> {
      let fetches = 0;
      const requestedUrls: string[] = [];
      const adapter = new ReplicateTransportAdapter(
        enabledConfig({ apiBaseUrl }),
        {
          fetchFn: (async (url) => {
            fetches += 1;
            requestedUrls.push(String(url));
            return jsonResponse(201, {
              id: "pred_base",
              status: "succeeded",
              output: IMAGE_HTTPS,
            });
          }) as typeof fetch,
          now: () => 1,
          sleep: async () => undefined,
        }
      );
      const result = await adapter.generate(sampleInput());
      return { result, fetches, requestedUrls };
    }

    function assertInvalidBaseConfig(
      result: ReplicateTransportResult,
      rejectedUrl: string
    ): void {
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error.code, "invalid_request");
        assert.equal(result.error.retryable, false);
        assert.equal(
          result.error.message,
          "Replicate transport configuration is invalid."
        );
      }
      const serialized = JSON.stringify(result);
      if (rejectedUrl) {
        assert.equal(serialized.includes(rejectedUrl), false);
      }
      assert.equal(serialized.includes(FAKE_TOKEN), false);
      assert.equal(/Authorization/i.test(serialized), false);
    }

    it("exact official base URL is accepted", async () => {
      assert.equal(
        resolveOfficialReplicateApiBaseUrl(DEFAULT_REPLICATE_API_BASE_URL),
        DEFAULT_REPLICATE_API_BASE_URL
      );
      const { result, fetches, requestedUrls } = await generateWithBaseUrl(
        DEFAULT_REPLICATE_API_BASE_URL
      );
      assert.equal(result.success, true);
      assert.equal(fetches, 1);
      assert.equal(
        requestedUrls[0],
        `${DEFAULT_REPLICATE_API_BASE_URL}/models/${DEFAULT_REPLICATE_TRANSPORT_MODEL}/predictions`
      );
    });

    it("official base URL with one trailing slash is normalized and accepted", async () => {
      const withSlash = `${DEFAULT_REPLICATE_API_BASE_URL}/`;
      assert.equal(
        resolveOfficialReplicateApiBaseUrl(withSlash),
        DEFAULT_REPLICATE_API_BASE_URL
      );
      const { result, fetches, requestedUrls } =
        await generateWithBaseUrl(withSlash);
      assert.equal(result.success, true);
      assert.equal(fetches, 1);
      assert.equal(
        requestedUrls[0],
        `${DEFAULT_REPLICATE_API_BASE_URL}/models/${DEFAULT_REPLICATE_TRANSPORT_MODEL}/predictions`
      );
      assert.equal(requestedUrls[0].includes("//models"), false);
    });

    it("malicious hostname performs zero fetch calls", async () => {
      const evil = "https://evil.example/v1";
      assert.equal(resolveOfficialReplicateApiBaseUrl(evil), null);
      const { result, fetches } = await generateWithBaseUrl(evil);
      assert.equal(fetches, 0);
      assertInvalidBaseConfig(result, evil);
    });

    it("Replicate-looking subdomain performs zero fetch calls", async () => {
      const evil = "https://evil.api.replicate.com/v1";
      assert.equal(resolveOfficialReplicateApiBaseUrl(evil), null);
      const { result, fetches } = await generateWithBaseUrl(evil);
      assert.equal(fetches, 0);
      assertInvalidBaseConfig(result, evil);
    });

    it("HTTP URL performs zero fetch calls", async () => {
      const evil = "http://api.replicate.com/v1";
      assert.equal(resolveOfficialReplicateApiBaseUrl(evil), null);
      const { result, fetches } = await generateWithBaseUrl(evil);
      assert.equal(fetches, 0);
      assertInvalidBaseConfig(result, evil);
    });

    it("URL containing credentials performs zero fetch calls", async () => {
      const evil = "https://user:pass@api.replicate.com/v1";
      assert.equal(resolveOfficialReplicateApiBaseUrl(evil), null);
      const { result, fetches } = await generateWithBaseUrl(evil);
      assert.equal(fetches, 0);
      assertInvalidBaseConfig(result, evil);
    });

    it("URL containing query or fragment performs zero fetch calls", async () => {
      const withQuery = "https://api.replicate.com/v1?x=1";
      const withHash = "https://api.replicate.com/v1#leak";
      assert.equal(resolveOfficialReplicateApiBaseUrl(withQuery), null);
      assert.equal(resolveOfficialReplicateApiBaseUrl(withHash), null);

      const queryCase = await generateWithBaseUrl(withQuery);
      assert.equal(queryCase.fetches, 0);
      assertInvalidBaseConfig(queryCase.result, withQuery);

      const hashCase = await generateWithBaseUrl(withHash);
      assert.equal(hashCase.fetches, 0);
      assertInvalidBaseConfig(hashCase.result, withHash);
    });

    it("custom port performs zero fetch calls", async () => {
      const evil = "https://api.replicate.com:8443/v1";
      assert.equal(resolveOfficialReplicateApiBaseUrl(evil), null);
      const { result, fetches } = await generateWithBaseUrl(evil);
      assert.equal(fetches, 0);
      assertInvalidBaseConfig(result, evil);
    });

    it("invalid URL never appears in returned result and token is absent", async () => {
      const evil = "https://attacker.example/exfil/v1";
      const { result, fetches } = await generateWithBaseUrl(evil);
      assert.equal(fetches, 0);
      assertInvalidBaseConfig(result, evil);
      assert.equal(JSON.stringify(result).includes("attacker.example"), false);
      assertNoSecrets(result, sampleInput().formattedRequest.prompt);
    });

    it("malformed and non-/v1 paths are rejected with zero fetch", async () => {
      const cases = [
        "not-a-url",
        "https://api.replicate.com/v2",
        "https://api.replicate.com/v1/extra",
        "https://api.replicate.com/",
        "",
      ];
      for (const evil of cases) {
        assert.equal(resolveOfficialReplicateApiBaseUrl(evil), null);
        const { result, fetches } = await generateWithBaseUrl(evil);
        assert.equal(fetches, 0, evil);
        assertInvalidBaseConfig(result, evil);
      }
    });
  });

  describe("security and source hygiene", () => {
    it("56. no result contains secrets, prompts, or stack traces", async () => {
      const input = sampleInput();
      const adapter = new ReplicateTransportAdapter(enabledConfig(), {
        fetchFn: (async () =>
          jsonResponse(201, {
            id: "pred_safe",
            status: "succeeded",
            output: IMAGE_HTTPS,
            error: null,
          })) as typeof fetch,
        now: () => 1,
        sleep: async () => undefined,
      });
      const result = await adapter.generate(input);
      assertNoSecrets(result, input.formattedRequest.prompt);
    });

    it("57. transport source does not import lib/replicate, UI, Terra, or ResultValidator orchestration", () => {
      const files = readdirSync(transportDir).filter((f) => f.endsWith(".ts"));
      for (const file of files) {
        const src = readFileSync(join(transportDir, file), "utf8");
        assert.equal(src.includes("lib/replicate"), false, file);
        assert.equal(src.includes("App.js"), false, file);
        assert.equal(/from ["'].*terra/i.test(src), false, file);
        assert.equal(src.includes("validation-result"), false, file);
        assert.equal(src.includes("evaluateCandidate"), false, file);
      }
    });

    it("58. transport source contains no console.log of sensitive inputs", () => {
      const files = readdirSync(transportDir).filter((f) => f.endsWith(".ts"));
      for (const file of files) {
        const src = readFileSync(join(transportDir, file), "utf8");
        assert.equal(/console\.(log|debug|info|warn|error)\s*\(/.test(src), false, file);
      }
    });

    it("59. package.json includes replicateTransportAdapter.test.ts in test:ai", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        scripts: { "test:ai": string };
      };
      assert.ok(
        pkg.scripts["test:ai"].includes("replicateTransportAdapter.test.ts")
      );
    });

    it("60. extractReplicateImageUrl rejects poll API URLs and http", () => {
      assert.equal(
        extractReplicateImageUrl("https://api.replicate.com/v1/predictions/x"),
        null
      );
      assert.equal(extractReplicateImageUrl("http://cdn.example.com/a.png"), null);
      assert.equal(extractReplicateImageUrl(IMAGE_HTTPS), IMAGE_HTTPS);
    });

    it("61. package-lock remains dependency-free of replicate SDK and github gate scripts intact", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        scripts: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      assert.ok(pkg.scripts.typecheck);
      assert.ok(pkg.scripts["test:ai"]);
      assert.ok(pkg.scripts["harness:ai"]);
      const deps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };
      assert.equal("replicate" in deps, false);
      // lockfile exists and is not required to change for this demand
      assert.equal(readFileSync(packageLockPath, "utf8").length > 0, true);
    });
  });
});
