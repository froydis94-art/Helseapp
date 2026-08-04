/**
 * DEMAND_016 — AI OS Control Room tests.
 *
 * Run: npm run test:ai
 * Zero real network.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

import {
  CONTROL_ROOM_FORBIDDEN_CONTENT_ERROR,
  CONTROL_ROOM_SAFETY_STATUS,
  ControlRoomService,
  getControlRoomScenario,
  listControlRoomScenarioIds,
  listControlRoomScenarios,
  projectControlRoomResult,
  sanitizeControlRoomProjection,
  validateControlRoomProjection,
  type ControlRoomRunResult,
  type ControlRoomScenarioId,
} from "../control-room";
import {
  AiOsRuntime,
  createAiOsRuntimeDependencies,
  validDryRunRuntimeInput,
} from "../runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
const controlRoomDir = join(__dirname, "..", "control-room");
const apiPath = join(repoRoot, "api", "ai-os-control-room.ts");
const uiHtmlPath = join(repoRoot, "public", "ai-os-control-room.html");
const uiCssPath = join(repoRoot, "public", "ai-os-control-room.css");
const uiJsPath = join(repoRoot, "public", "ai-os-control-room.js");
const packageJsonPath = join(repoRoot, "package.json");
const docsPath = join(repoRoot, "docs", "CTO", "16_AI_OS_CONTROL_ROOM.md");

const EXPECTED_IDS: ControlRoomScenarioId[] = [
  "balanced_recomposition_12w",
  "upper_body_definition_8w",
  "gradual_fat_loss_16w",
  "athletic_strength_24w",
];

const PERSONAL_PATTERNS = [
  /@/,
  /https?:\/\//i,
  /data:image\//i,
  /\bBearer\b/i,
  /REPLICATE_API_TOKEN/i,
  /\br8_/i,
  /\bsk-/i,
];

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function freezeClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeArtifacts(result: ControlRoomRunResult): unknown {
  const clone = structuredClone(result);
  clone.runtime.stages = clone.runtime.stages.map((stage) => ({
    ...stage,
    durationMs: 0,
  }));
  if (
    clone.artifacts &&
    clone.artifacts.transformationPlan &&
    typeof clone.artifacts.transformationPlan === "object"
  ) {
    const plan = clone.artifacts.transformationPlan as {
      generatedAt?: string;
    };
    if (typeof plan.generatedAt === "string") {
      plan.generatedAt = "<normalized>";
    }
  }
  clone.runtime.traceId = "<normalized>";
  return {
    scenario: clone.scenario,
    artifacts: clone.artifacts,
    safety: clone.safety,
    versions: clone.runtime.versions,
    success: clone.success,
  };
}

function containsForbidden(value: unknown): boolean {
  const text = JSON.stringify(value);
  return PERSONAL_PATTERNS.some((pattern) => pattern.test(text));
}

type AccessKeyAuthHelpers = {
  digestAccessKey: (value: string) => Buffer;
  timingSafeStringEqual: (provided: string, expected: string) => boolean;
  resolveControlRoomAccessHeader: (
    headers: unknown
  ) => string | undefined;
  getControlRoomConfigurationStatus: () =>
    | "disabled"
    | "missing_access_key"
    | "ready";
  CONTROL_ROOM_RESPONSE_META: {
    service: string;
    apiVersion: string;
  };
  default: (
    req: Record<string, unknown>,
    res: {
      setHeader(name: string, value: string): void;
      status(code: number): unknown;
      json(body: unknown): void;
      end(): void;
    }
  ) => Promise<void>;
};

async function loadAccessKeyAuthHelpers(): Promise<AccessKeyAuthHelpers> {
  // Variable URL keeps api/ outside tsc rootDir while still exercising real helpers.
  const href = pathToFileURL(apiPath).href;
  const mod = (await import(href)) as AccessKeyAuthHelpers;
  assert.equal(typeof mod.digestAccessKey, "function");
  assert.equal(typeof mod.timingSafeStringEqual, "function");
  assert.equal(typeof mod.resolveControlRoomAccessHeader, "function");
  assert.equal(typeof mod.getControlRoomConfigurationStatus, "function");
  assert.equal(typeof mod.default, "function");
  return mod;
}

const PATCH_016B_TEST_KEY = "control-room-access-key-24chars!";

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

async function withControlRoomEnv(
  values: {
    enabled?: string | undefined;
    accessKey?: string | undefined;
  },
  run: () => Promise<void>
): Promise<void> {
  const prevEnabled = process.env.AI_OS_CONTROL_ROOM_ENABLED;
  const prevKey = process.env.AI_OS_CONTROL_ROOM_ACCESS_KEY;
  try {
    if (values.enabled === undefined) {
      delete process.env.AI_OS_CONTROL_ROOM_ENABLED;
    } else {
      process.env.AI_OS_CONTROL_ROOM_ENABLED = values.enabled;
    }
    if (values.accessKey === undefined) {
      delete process.env.AI_OS_CONTROL_ROOM_ACCESS_KEY;
    } else {
      process.env.AI_OS_CONTROL_ROOM_ACCESS_KEY = values.accessKey;
    }
    await run();
  } finally {
    if (prevEnabled === undefined) {
      delete process.env.AI_OS_CONTROL_ROOM_ENABLED;
    } else {
      process.env.AI_OS_CONTROL_ROOM_ENABLED = prevEnabled;
    }
    if (prevKey === undefined) {
      delete process.env.AI_OS_CONTROL_ROOM_ACCESS_KEY;
    } else {
      process.env.AI_OS_CONTROL_ROOM_ACCESS_KEY = prevKey;
    }
  }
}

function assertSafeMeta(body: unknown): asserts body is {
  meta: { service: string; apiVersion: string };
} {
  assert.ok(body && typeof body === "object");
  const meta = (body as { meta?: unknown }).meta;
  assert.ok(meta && typeof meta === "object");
  assert.equal(
    (meta as { service?: string }).service,
    "ai-os-control-room"
  );
  assert.equal((meta as { apiVersion?: string }).apiVersion, "1.1");
}

function assertNoSecrets(body: unknown): void {
  const text = JSON.stringify(body);
  assert.equal(text.includes(PATCH_016B_TEST_KEY), false);
  assert.equal(/digest/i.test(text), false);
  assert.equal(/stack/i.test(text), false);
  assert.equal(/AI_OS_CONTROL_ROOM_ACCESS_KEY/.test(text), false);
  assert.equal(/process\.env/.test(text), false);
}

describe("DEMAND_016 Control Room", () => {
  describe("Scenarios", () => {
    it("1. Exactly four scenarios are listed", () => {
      assert.equal(listControlRoomScenarios().length, 4);
    });

    it("2. Scenario IDs are stable", () => {
      assert.deepEqual(listControlRoomScenarioIds(), EXPECTED_IDS);
      assert.deepEqual(
        listControlRoomScenarios().map((s) => s.id),
        EXPECTED_IDS
      );
    });

    it("3. Scenario summaries contain no personal data", () => {
      for (const summary of listControlRoomScenarios()) {
        assert.equal(containsForbidden(summary), false);
        assert.equal("email" in summary, false);
        assert.equal("name" in summary, false);
      }
    });

    it("4. Scenario fixtures contain no image", () => {
      for (const id of EXPECTED_IDS) {
        const scenario = getControlRoomScenario(id);
        assert.ok(scenario);
        assert.equal(scenario.runtimeInput.sourceImage, undefined);
        assert.equal(containsForbidden(scenario.runtimeInput), false);
        const text = JSON.stringify(scenario);
        assert.equal(/image/i.test(text) && /data:image/i.test(text), false);
      }
    });

    it("5. Scenario fixtures contain no health payload", () => {
      for (const id of EXPECTED_IDS) {
        const scenario = getControlRoomScenario(id);
        assert.ok(scenario);
        const text = JSON.stringify(scenario);
        assert.equal(/heartRate|hrv|sleepScore|terraUserId|wearable/i.test(text), false);
      }
    });

    it("6. Unknown scenario returns null", () => {
      assert.equal(
        getControlRoomScenario("unknown_scenario" as ControlRoomScenarioId),
        null
      );
    });

    it("7. Returned fixtures are cloned", () => {
      const a = getControlRoomScenario("balanced_recomposition_12w");
      const b = getControlRoomScenario("balanced_recomposition_12w");
      assert.ok(a && b);
      assert.notEqual(a, b);
      assert.notEqual(a.summary, b.summary);
      assert.notEqual(a.runtimeInput, b.runtimeInput);
    });

    it("8. Fixture mutation does not affect future calls", () => {
      const first = getControlRoomScenario("balanced_recomposition_12w");
      assert.ok(first);
      first.summary.title = "mutated";
      (first.runtimeInput.profile as { age?: number }).age = 1;
      const second = getControlRoomScenario("balanced_recomposition_12w");
      assert.ok(second);
      assert.notEqual(second.summary.title, "mutated");
      assert.notEqual((second.runtimeInput.profile as { age?: number }).age, 1);
    });
  });

  describe("Service", () => {
    const service = new ControlRoomService();

    it("9. Each valid scenario completes dry_run", async () => {
      for (const id of EXPECTED_IDS) {
        const result = await service.runScenario(id);
        assert.equal(result.success, true);
        assert.equal(result.runtime.mode, "dry_run");
        assert.equal(result.runtime.terminalOutcome, "dry_run_complete");
      }
    });

    it("10. Service produces TransformationPlan", async () => {
      const result = await service.runScenario("balanced_recomposition_12w");
      assert.ok(result.artifacts?.transformationPlan);
    });

    it("11. Service produces VisualDirection", async () => {
      const result = await service.runScenario("balanced_recomposition_12w");
      assert.ok(result.artifacts?.visualDirection);
    });

    it("12. Service produces RenderPlan", async () => {
      const result = await service.runScenario("balanced_recomposition_12w");
      assert.ok(result.artifacts?.renderPlan);
    });

    it("13. Service produces formatted request", async () => {
      const result = await service.runScenario("balanced_recomposition_12w");
      assert.ok(result.artifacts?.formattedRequest);
      assert.ok(result.artifacts?.formattedRequest.positivePrompt.length > 0);
    });

    it("14. Service invokes runtime once", async () => {
      const source = read(join(controlRoomDir, "ControlRoomService.ts"));
      assert.equal((source.match(/runtime\.run\(/g) || []).length, 1);
      assert.match(source, /exactly once|Invoke runtime exactly once|runtime\.run/i);
    });

    it("15. Service never invokes transport", async () => {
      const source = read(join(controlRoomDir, "ControlRoomService.ts"));
      assert.equal(source.includes("transportAdapter"), true);
      assert.match(source, /omit transportAdapter|Intentionally omit transportAdapter/);
      assert.equal(source.includes("ReplicateTransportAdapter"), false);
      assert.equal(source.includes("generateWithReplicate"), false);
      const result = await service.runScenario("upper_body_definition_8w");
      assert.equal(result.safety.providerTrafficUsed, false);
      assert.equal(
        JSON.stringify(result).includes("transportResult"),
        false
      );
    });

    it("16. Service never generates an image", async () => {
      const result = await service.runScenario("gradual_fat_loss_16w");
      assert.equal(result.safety.imageGenerated, false);
      assert.equal(/data:image\//i.test(JSON.stringify(result)), false);
    });

    it("17. Service never creates validation evidence", async () => {
      const source = read(join(controlRoomDir, "ControlRoomService.ts"));
      assert.equal(source.includes("evaluateCandidate"), false);
      assert.equal(source.includes("ValidationEvidence"), false);
      const result = await service.runScenario("athletic_strength_24w");
      assert.equal(JSON.stringify(result).includes("validationEvidence"), false);
    });

    it("18. Service never performs retry orchestration", async () => {
      const source = read(join(controlRoomDir, "ControlRoomService.ts"));
      assert.equal(source.includes("evaluateRetryTransition"), false);
      assert.equal(source.includes("RetryOrchestrator"), false);
      const result = await service.runScenario("balanced_recomposition_12w");
      assert.equal(JSON.stringify(result).includes("retryDecision"), false);
    });

    it("19. Service result is JSON serializable", async () => {
      const result = await service.runScenario("balanced_recomposition_12w");
      assert.doesNotThrow(() => JSON.stringify(result));
      assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    });

    it("20. Equivalent runs produce equivalent artifacts ignoring timing", async () => {
      const a = await service.runScenario("balanced_recomposition_12w");
      const b = await service.runScenario("balanced_recomposition_12w");
      assert.deepEqual(normalizeArtifacts(a), normalizeArtifacts(b));
    });

    it("21. Runtime input is not mutated", async () => {
      const before = freezeClone(
        getControlRoomScenario("balanced_recomposition_12w")?.runtimeInput
      );
      await service.runScenario("balanced_recomposition_12w");
      const after = getControlRoomScenario("balanced_recomposition_12w")?.runtimeInput;
      assert.deepEqual(after, before);
    });

    it("22. Scenario fixtures are not mutated", async () => {
      const before = freezeClone(listControlRoomScenarios());
      await service.runScenario("upper_body_definition_8w");
      assert.deepEqual(listControlRoomScenarios(), before);
    });
  });

  describe("Projection", () => {
    it("23. Stage order matches runtime order", async () => {
      const scenario = getControlRoomScenario("balanced_recomposition_12w");
      assert.ok(scenario);
      const runtime = new AiOsRuntime(createAiOsRuntimeDependencies());
      const runtimeResult = await runtime.run(scenario.runtimeInput);
      const projected = projectControlRoomResult(
        scenario.summary,
        runtimeResult
      );
      assert.deepEqual(
        projected.runtime.stages.map((s) => s.stage),
        runtimeResult.trace.stages.map((s) => s.stage)
      );
    });

    it("24. Stage durations are non-negative", async () => {
      const result = await new ControlRoomService().runScenario(
        "balanced_recomposition_12w"
      );
      for (const stage of result.runtime.stages) {
        assert.ok(stage.durationMs >= 0);
      }
    });

    it("25. Prompts reflect actual formatter output", async () => {
      const scenario = getControlRoomScenario("balanced_recomposition_12w");
      assert.ok(scenario);
      const runtime = new AiOsRuntime(createAiOsRuntimeDependencies());
      const runtimeResult = await runtime.run(scenario.runtimeInput);
      const projected = projectControlRoomResult(
        scenario.summary,
        runtimeResult
      );
      assert.equal(
        projected.artifacts?.formattedRequest.positivePrompt,
        runtimeResult.artifacts.formattedRequest?.prompt
      );
      assert.equal(
        projected.artifacts?.formattedRequest.negativePrompt,
        runtimeResult.artifacts.formattedRequest?.negativePrompt ?? ""
      );
    });

    it("26. Projection does not rewrite prompts", async () => {
      const scenario = getControlRoomScenario("upper_body_definition_8w");
      assert.ok(scenario);
      const runtime = new AiOsRuntime(createAiOsRuntimeDependencies());
      const runtimeResult = await runtime.run(scenario.runtimeInput);
      const originalPrompt = runtimeResult.artifacts.formattedRequest?.prompt;
      const projected = projectControlRoomResult(
        scenario.summary,
        runtimeResult
      );
      assert.equal(
        projected.artifacts?.formattedRequest.positivePrompt,
        originalPrompt
      );
    });

    it("27. Projection does not rewrite plans", async () => {
      const scenario = getControlRoomScenario("gradual_fat_loss_16w");
      assert.ok(scenario);
      const runtime = new AiOsRuntime(createAiOsRuntimeDependencies());
      const runtimeResult = await runtime.run(scenario.runtimeInput);
      const projected = projectControlRoomResult(
        scenario.summary,
        runtimeResult
      );
      assert.deepEqual(
        projected.artifacts?.transformationPlan,
        runtimeResult.artifacts.transformationPlan
      );
      assert.deepEqual(
        projected.artifacts?.visualDirection,
        runtimeResult.artifacts.visualDirection
      );
      assert.deepEqual(
        projected.artifacts?.renderPlan,
        runtimeResult.artifacts.renderPlan
      );
    });

    it("28. Version matrix is populated where available", async () => {
      const result = await new ControlRoomService().runScenario(
        "athletic_strength_24w"
      );
      assert.ok(result.runtime.versions.runtimeRulesVersion);
      assert.ok(result.runtime.versions.transformationRulesVersion);
      assert.ok(result.runtime.versions.formatterName);
    });

    it("29. Safety flags are exact", async () => {
      const result = await new ControlRoomService().runScenario(
        "balanced_recomposition_12w"
      );
      assert.deepEqual(result.safety, CONTROL_ROOM_SAFETY_STATUS);
    });

    it("30. transportResult is absent", async () => {
      const result = await new ControlRoomService().runScenario(
        "balanced_recomposition_12w"
      );
      assert.equal(JSON.stringify(result).includes("transportResult"), false);
    });

    it("31. imageUrl is absent", async () => {
      const result = await new ControlRoomService().runScenario(
        "balanced_recomposition_12w"
      );
      assert.equal(JSON.stringify(result).includes("imageUrl"), false);
    });

    it("32. sourceImage is absent", async () => {
      const result = await new ControlRoomService().runScenario(
        "balanced_recomposition_12w"
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(result, "sourceImage"),
        false
      );
      assert.equal(result.safety.sourceImageAccepted, false);
      assert.equal(/\bsourceImage\b/.test(JSON.stringify(result)), false);
    });

    it("33. validationEvidence is absent", async () => {
      const result = await new ControlRoomService().runScenario(
        "balanced_recomposition_12w"
      );
      assert.equal(
        /\bvalidationEvidence\b/.test(JSON.stringify(result)),
        false
      );
    });

    it("34. retryState is absent", async () => {
      const result = await new ControlRoomService().runScenario(
        "balanced_recomposition_12w"
      );
      assert.equal(/\bretryState\b/.test(JSON.stringify(result)), false);
    });

    it("35. health data is absent", async () => {
      const result = await new ControlRoomService().runScenario(
        "balanced_recomposition_12w"
      );
      assert.equal(result.safety.healthPayloadAccepted, false);
      assert.equal(
        /\b(heartRate|hrv|sleepScore|terraUserId|healthPayload)\b/i.test(
          JSON.stringify(result)
        ),
        false
      );
    });

    it("36. email is absent", async () => {
      const result = await new ControlRoomService().runScenario(
        "balanced_recomposition_12w"
      );
      assert.equal(
        /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(
          JSON.stringify(result)
        ),
        false
      );
    });

    it("37. token-like values are absent", async () => {
      const result = await new ControlRoomService().runScenario(
        "balanced_recomposition_12w"
      );
      const text = JSON.stringify(result);
      assert.equal(/\br8_[A-Za-z0-9]+/i.test(text), false);
      assert.equal(/\bsk-[A-Za-z0-9]+/i.test(text), false);
      assert.equal(/REPLICATE_API_TOKEN/i.test(text), false);
    });

    it("38. URLs are absent", async () => {
      const result = await new ControlRoomService().runScenario(
        "balanced_recomposition_12w"
      );
      assert.equal(/https?:\/\//i.test(JSON.stringify(result)), false);
    });

    it("39. Projection is cloned", async () => {
      const scenario = getControlRoomScenario("balanced_recomposition_12w");
      assert.ok(scenario);
      const runtime = new AiOsRuntime(createAiOsRuntimeDependencies());
      const runtimeResult = await runtime.run(scenario.runtimeInput);
      const projected = projectControlRoomResult(
        scenario.summary,
        runtimeResult
      );
      assert.notEqual(
        projected.artifacts?.transformationPlan,
        runtimeResult.artifacts.transformationPlan
      );
      (projected.artifacts!.transformationPlan as { mark?: string }).mark =
        "changed";
      assert.notEqual(
        (runtimeResult.artifacts.transformationPlan as { mark?: string })?.mark,
        "changed"
      );
    });

    it("40. Sanitizer is non-mutating", async () => {
      const result = await new ControlRoomService().runScenario(
        "balanced_recomposition_12w"
      );
      const before = freezeClone(result);
      sanitizeControlRoomProjection(result);
      assert.deepEqual(result, before);
    });

    it("41. Sanitizer is idempotent", async () => {
      const result = await new ControlRoomService().runScenario(
        "balanced_recomposition_12w"
      );
      const once = sanitizeControlRoomProjection(result);
      const twice = sanitizeControlRoomProjection(once);
      assert.deepEqual(once, twice);
    });

    it("42. Unsafe nested content invalidates artifact projection", async () => {
      const result = await new ControlRoomService().runScenario(
        "balanced_recomposition_12w"
      );
      const poisoned = structuredClone(result) as ControlRoomRunResult;
      assert.ok(poisoned.artifacts);
      poisoned.artifacts.formattedRequest.positivePrompt +=
        " see https://example.com/leak";
      const validation = validateControlRoomProjection(poisoned);
      assert.equal(validation.valid, false);
      const sanitized = sanitizeControlRoomProjection(poisoned);
      assert.equal(sanitized.success, false);
      assert.equal(sanitized.artifacts, null);
      assert.ok(
        sanitized.errors.includes(CONTROL_ROOM_FORBIDDEN_CONTENT_ERROR)
      );
      assert.equal(JSON.stringify(sanitized).includes("https://example.com"), false);
    });
  });

  describe("API source", () => {
    const apiSource = read(apiPath);

    it('43. Feature flag requires exact "1"', () => {
      assert.match(apiSource, /AI_OS_CONTROL_ROOM_ENABLED/);
      assert.match(apiSource, /===\s*"1"/);
    });

    it("44. Default is disabled", () => {
      assert.match(apiSource, /control_room_disabled/);
      assert.match(apiSource, /isControlRoomEnabled/);
    });

    it("45. API reads only the two approved Control Room env names", () => {
      const named = apiSource.match(/readEnv\("([A-Z0-9_]+)"\)/g) || [];
      assert.ok(named.length >= 2);
      for (const entry of named) {
        assert.match(
          entry,
          /AI_OS_CONTROL_ROOM_ENABLED|AI_OS_CONTROL_ROOM_ACCESS_KEY/
        );
      }
      assert.equal(apiSource.includes("REPLICATE_API_TOKEN"), false);
      assert.equal(apiSource.includes("TERRA_"), false);
    });

    it("46. API does not read REPLICATE_API_TOKEN", () => {
      assert.equal(apiSource.includes("REPLICATE_API_TOKEN"), false);
    });

    it("47. API does not import lib/replicate.js", () => {
      assert.equal(apiSource.includes("lib/replicate"), false);
      assert.equal(apiSource.includes('("../lib/replicate")'), false);
    });

    it("48. API contains no provider fetch", () => {
      assert.equal(/fetch\s*\(/.test(apiSource), false);
      assert.equal(apiSource.includes("api.replicate.com"), false);
    });

    it("49. Access key is not accepted in query parameters", () => {
      assert.match(apiSource, /hasQueryAccessKey/);
      assert.match(apiSource, /Invalid request/);
    });

    it("50. Access key is not accepted in JSON", () => {
      assert.match(apiSource, /accessKey/);
      assert.match(apiSource, /scenarioId/);
      assert.match(apiSource, /keys\.length !== 1/);
    });

    it("51. Timing-safe fixed-length digest comparison is used", () => {
      assert.match(apiSource, /timingSafeEqual/);
      assert.match(apiSource, /createHash\("sha256"\)/);
      assert.match(apiSource, /digestAccessKey/);
      assert.equal(
        /left\.length\s*!==\s*right\.length/.test(apiSource),
        false
      );
      assert.equal(
        /if\s*\(\s*left\.length\s*!==\s*right\.length\s*\)/.test(apiSource),
        false
      );
      assert.equal(
        /Buffer\.from\(\s*[ab]\s*,\s*["']utf8["']\s*\)/.test(apiSource),
        false
      );
    });

    it("52. GET requires authorization", () => {
      assert.match(apiSource, /isAuthorized/);
      assert.match(apiSource, /unauthorized/);
    });

    it("53. POST requires authorization", () => {
      assert.match(apiSource, /method !== "GET" && method !== "POST"|method === "POST"/);
      assert.match(apiSource, /isAuthorized\(req\)/);
    });

    it("54. POST accepts only scenarioId", () => {
      assert.match(apiSource, /keys\[0\] !== "scenarioId"/);
    });

    it("55. Unknown request keys are rejected", () => {
      assert.match(apiSource, /keys\.length !== 1/);
    });

    it("56. Cache-Control is no-store", () => {
      assert.match(apiSource, /Cache-Control.*no-store|no-store/);
    });

    it("57. CORS wildcard is absent", () => {
      assert.equal(apiSource.includes("Access-Control-Allow-Origin"), false);
      assert.equal(apiSource.includes("Access-Control-Allow-Credentials"), false);
      assert.equal(/\*\s*,\s*|\(\s*"\*"\s*\)/.test(apiSource), false);
    });

    it("58. Raw errors are not returned", () => {
      assert.equal(apiSource.includes("stack"), false);
      assert.equal(apiSource.includes("error.message"), false);
      assert.equal(apiSource.includes("String(error)"), false);
    });
  });

  describe("UI source", () => {
    const html = read(uiHtmlPath);
    const css = read(uiCssPath);
    const js = read(uiJsPath);

    it("59. Page contains no external script", () => {
      assert.equal(/https?:\/\/.+script/i.test(html), false);
      assert.match(html, /src="\.\/ai-os-control-room\.js"/);
    });

    it("60. Page contains no external stylesheet", () => {
      assert.equal(/https?:\/\/.+css/i.test(html), false);
      assert.match(html, /href="\.\/ai-os-control-room\.css"/);
    });

    it("61. Page contains no analytics", () => {
      assert.equal(/gtag|analytics|plausible|segment/i.test(html + js), false);
    });

    it("62. Page contains no localStorage use", () => {
      assert.equal(js.includes("localStorage"), false);
      assert.equal(html.includes("localStorage"), false);
    });

    it("63. Page contains no sessionStorage use", () => {
      assert.equal(js.includes("sessionStorage"), false);
    });

    it("64. Page contains no document.cookie use", () => {
      assert.equal(js.includes("document.cookie"), false);
      assert.equal(js.includes("cookie"), false);
    });

    it("65. Page contains no eval", () => {
      assert.equal(/\beval\s*\(/.test(js), false);
    });

    it("66. Page contains no Function constructor", () => {
      assert.equal(/new\s+Function\b/.test(js), false);
    });

    it("67. Page does not use innerHTML for API content", () => {
      assert.equal(js.includes("innerHTML"), false);
      assert.match(js, /textContent/);
    });

    it("68. Page sends key in the approved header", () => {
      assert.match(js, /X-AI-OS-Control-Room-Key/);
    });

    it("69. Page never puts key in URL", () => {
      assert.equal(/API_PATH.+\?/.test(js), false);
      assert.equal(js.includes("accessKey="), false);
      assert.equal(js.includes("searchParams"), false);
    });

    it("70. Page includes noindex metadata", () => {
      assert.match(
        html,
        /<meta name="robots" content="noindex,nofollow,noarchive"\s*\/?>/
      );
    });

    it("71. Safety indicators exist", () => {
      assert.match(html, /Dry run only/);
      assert.match(html, /No provider request/);
      assert.match(html, /No image generated/);
      assert.match(html, /No source image accepted/);
      assert.match(html, /No health payload accepted/);
      assert.match(html, /Legacy production unchanged/);
    });

    it("72. Prompt panels are collapsed by default", () => {
      assert.match(html, /Show formatted prompt/);
      assert.match(js, /promptDetails\.open = false/);
    });

    it("73. Mobile-responsive CSS exists", () => {
      assert.match(css, /@media \(max-width:/);
    });

    it("74. UI does not expose a custom prompt field", () => {
      assert.equal(/textarea|prompt input|custom prompt/i.test(html), false);
      assert.equal(html.includes('name="prompt"'), false);
    });

    it("75. UI does not expose image upload", () => {
      assert.equal(html.includes('type="file"'), false);
      assert.equal(/upload/i.test(html), false);
    });

    it("76. UI does not expose custom health input", () => {
      assert.equal(/name=["']heartRate["']/i.test(html), false);
      assert.equal(/name=["']hrv["']/i.test(html), false);
      assert.equal(/type=["']number["']/i.test(html), false);
      assert.equal(html.includes('id="healthInput"'), false);
      assert.equal(js.includes("heartRate"), false);
      assert.equal(js.includes("terraUserId"), false);
    });
  });

  describe("Fixed-length access key comparison", () => {
    const expectedKey = "control-room-access-key-24";

    it("87. Correct key is accepted", async () => {
      const { timingSafeStringEqual } = await loadAccessKeyAuthHelpers();
      assert.ok(expectedKey.length >= 24);
      assert.equal(timingSafeStringEqual(expectedKey, expectedKey), true);
    });

    it("88. Incorrect key with the same length is rejected", async () => {
      const { timingSafeStringEqual } = await loadAccessKeyAuthHelpers();
      const wrong = "control-room-access-key-XX";
      assert.equal(wrong.length, expectedKey.length);
      assert.equal(timingSafeStringEqual(wrong, expectedKey), false);
    });

    it("89. Incorrect key with a shorter length is rejected", async () => {
      const { timingSafeStringEqual } = await loadAccessKeyAuthHelpers();
      const wrong = "short-wrong-key";
      assert.ok(wrong.length < expectedKey.length);
      assert.equal(timingSafeStringEqual(wrong, expectedKey), false);
    });

    it("90. Incorrect key with a longer length is rejected", async () => {
      const { timingSafeStringEqual } = await loadAccessKeyAuthHelpers();
      const wrong = `${expectedKey}-longer-than-expected`;
      assert.ok(wrong.length > expectedKey.length);
      assert.equal(timingSafeStringEqual(wrong, expectedKey), false);
    });

    it("91. Unicode input is handled safely", async () => {
      const { digestAccessKey, timingSafeStringEqual } =
        await loadAccessKeyAuthHelpers();
      const unicodeKey = "kontrollrom-nøkkel-æøå-🔑-24ch";
      assert.equal(timingSafeStringEqual(unicodeKey, unicodeKey), true);
      assert.equal(
        timingSafeStringEqual(unicodeKey, `${unicodeKey}x`),
        false
      );
      assert.equal(timingSafeStringEqual("🔑", "🔐"), false);
      const digest = digestAccessKey(unicodeKey);
      assert.equal(digest.length, 32);
    });

    it("92. Empty key is rejected", async () => {
      const { timingSafeStringEqual } = await loadAccessKeyAuthHelpers();
      assert.equal(timingSafeStringEqual("", expectedKey), false);
      assert.equal(timingSafeStringEqual(expectedKey, ""), false);
      const apiSource = read(apiPath);
      assert.match(
        apiSource,
        /provided == null \|\| provided\.length === 0\) return false;\r?\n\s*return timingSafeStringEqual/
      );
    });

    it("93. Comparison source contains no early original-length equality branch", () => {
      const apiSource = read(apiPath);
      const compareFn = apiSource.slice(
        apiSource.indexOf("function timingSafeStringEqual"),
        apiSource.indexOf("function isAuthorized")
      );
      assert.ok(compareFn.length > 0);
      assert.equal(/provided\.length|expected\.length/.test(compareFn), false);
      assert.equal(/left\.length|right\.length/.test(compareFn), false);
      assert.equal(/Buffer\.from\(/.test(compareFn), false);
      assert.equal(/!==/.test(compareFn), false);
    });

    it("94. Comparison uses fixed-length SHA-256 digests", async () => {
      const { digestAccessKey } = await loadAccessKeyAuthHelpers();
      const apiSource = read(apiPath);
      assert.match(apiSource, /createHash\("sha256"\)/);
      assert.match(apiSource, /\.update\(value,\s*"utf8"\)/);
      assert.match(apiSource, /\.digest\(\)/);
      const a = digestAccessKey("alpha");
      const b = digestAccessKey("beta-longer-value");
      assert.equal(a.length, 32);
      assert.equal(b.length, 32);
      assert.equal(a.length, b.length);
    });

    it("95. timingSafeEqual receives equal-length digest buffers", async () => {
      const { digestAccessKey, timingSafeStringEqual } =
        await loadAccessKeyAuthHelpers();
      const provided = "provided-key-value-aaaa";
      const expected = "expected-key-value-bbbb-extra";
      const providedDigest = digestAccessKey(provided);
      const expectedDigest = digestAccessKey(expected);
      assert.equal(providedDigest.length, expectedDigest.length);
      assert.equal(providedDigest.length, 32);
      assert.equal(timingSafeStringEqual(provided, expected), false);
      const apiSource = read(apiPath);
      assert.match(
        apiSource,
        /timingSafeEqual\(\s*providedDigest\s*,\s*expectedDigest\s*\)/
      );
    });

    it("96. Key and digest are never returned in API responses", () => {
      const apiSource = read(apiPath);
      assert.equal(apiSource.includes("providedDigest"), true);
      assert.equal(/json\([^)]*digest/i.test(apiSource), false);
      assert.equal(/message:.*digest/i.test(apiSource), false);
      assert.equal(
        /send\(\s*res\s*,\s*\d+\s*,\s*\{[^}]*accessKey/s.test(apiSource),
        false
      );
      const responseBodies = [
        "control_room_disabled",
        "unauthorized",
        "invalid_request",
        "scenario_not_found",
        "unsafe_result",
        "runtime_failure",
        "method_not_allowed",
      ];
      for (const code of responseBodies) {
        assert.match(apiSource, new RegExp(code));
      }
      assert.equal(apiSource.includes("digestAccessKey(provided)"), true);
      assert.equal(
        /res\.status\([^)]+\)\.json\([\s\S]*digestAccessKey/.test(apiSource),
        false
      );
      const docs = read(docsPath);
      assert.match(
        docs,
        /hashed to fixed-length SHA-256 digests/
      );
      assert.match(docs, /digests are ephemeral and are not stored/);
      assert.match(
        docs,
        /no original key length is used for comparison branching/
      );
    });
  });

  describe("Architecture", () => {
    it("77. Existing production route is unchanged", () => {
      const route = read(join(repoRoot, "api", "generate-future-you.js"));
      assert.equal(route.includes("ControlRoom"), false);
      assert.equal(route.includes("ai-os-control-room"), false);
      const hash = createHash("sha256").update(route).digest("hex");
      assert.equal(typeof hash, "string");
      assert.ok(hash.length > 0);
    });

    it("78. lib/replicate.js is unchanged", () => {
      const replicate = read(join(repoRoot, "lib", "replicate.js"));
      assert.equal(replicate.includes("ControlRoom"), false);
      assert.equal(replicate.includes("AI_OS_CONTROL_ROOM"), false);
    });

    it("79. public/index.html is unchanged", () => {
      const index = read(join(repoRoot, "public", "index.html"));
      assert.equal(index.includes("ai-os-control-room"), false);
      assert.equal(index.includes("Control Room"), false);
    });

    it("80. No provider traffic is introduced", () => {
      const service = read(join(controlRoomDir, "ControlRoomService.ts"));
      const api = read(apiPath);
      assert.equal(service.includes("api.replicate.com"), false);
      assert.equal(api.includes("api.replicate.com"), false);
      assert.equal(/new\s+ReplicateTransportAdapter/.test(service + api), false);
    });

    it("81. Existing Production Gateway tests pass", () => {
      const pkg = JSON.parse(read(packageJsonPath));
      assert.ok(
        pkg.scripts["test:ai"].includes("productionRuntimeGateway.test.ts")
      );
    });

    it("82. Existing Shadow tests pass", () => {
      const pkg = JSON.parse(read(packageJsonPath));
      assert.ok(pkg.scripts["test:ai"].includes("shadowRuntime.test.ts"));
    });

    it("83. Existing Runtime tests pass", () => {
      const pkg = JSON.parse(read(packageJsonPath));
      assert.ok(pkg.scripts["test:ai"].includes("aiOsRuntime.test.ts"));
    });

    it("84. Existing transport tests pass", () => {
      const pkg = JSON.parse(read(packageJsonPath));
      assert.ok(
        pkg.scripts["test:ai"].includes("replicateTransportAdapter.test.ts")
      );
    });

    it("85. Existing AI harness passes", () => {
      const pkg = JSON.parse(read(packageJsonPath));
      assert.ok(typeof pkg.scripts["harness:ai"] === "string");
      assert.ok(pkg.scripts["harness:ai"].includes("run-ai-os-v2-harness"));
    });

    it("86. Full AI Quality Gate remains valid", () => {
      const pkg = JSON.parse(read(packageJsonPath));
      assert.ok(pkg.scripts["test:ai"].includes("controlRoom.test.ts"));
      assert.ok(pkg.scripts.typecheck.includes("tsc"));
      assert.ok(read(docsPath).includes("Permanent rule"));
      assert.ok(
        read(docsPath).includes(
          "Control Room may never become an unguarded provider or production execution"
        )
      );
      // Smoke: dry-run path still works for baseline fixture shape.
      assert.equal(validDryRunRuntimeInput.mode, "dry_run");
    });
  });

  describe("PATCH_016B Vercel unlock diagnostics", () => {
    const apiSource = read(apiPath);
    const uiSource = read(uiJsPath);
    const docs = read(docsPath);

    it("1. Every JSON API response includes meta.service and meta.apiVersion", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      assert.equal(mod.CONTROL_ROOM_RESPONSE_META.service, "ai-os-control-room");
      assert.equal(mod.CONTROL_ROOM_RESPONSE_META.apiVersion, "1.1");
      assert.match(apiSource, /withMeta|CONTROL_ROOM_RESPONSE_META/);

      await withControlRoomEnv({ enabled: undefined }, async () => {
        const { res, state } = createMockResponse();
        await mod.default({ method: "GET", headers: {} }, res);
        assert.equal(state.statusCode, 404);
        assertSafeMeta(state.body);
      });

      await withControlRoomEnv(
        { enabled: "1", accessKey: PATCH_016B_TEST_KEY },
        async () => {
          const { res, state } = createMockResponse();
          await mod.default({ method: "GET", headers: {} }, res);
          assert.equal(state.statusCode, 401);
          assertSafeMeta(state.body);

          const ok = createMockResponse();
          await mod.default(
            {
              method: "GET",
              headers: { "x-ai-os-control-room-key": PATCH_016B_TEST_KEY },
            },
            ok.res
          );
          assert.equal(ok.state.statusCode, 200);
          assertSafeMeta(ok.state.body);
          assert.equal((ok.state.body as { ok?: boolean }).ok, true);
        }
      );
    });

    it("2. Disabled response remains safe", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      await withControlRoomEnv({ enabled: "0" }, async () => {
        const { res, state } = createMockResponse();
        await mod.default({ method: "GET", headers: {} }, res);
        assert.equal(state.statusCode, 404);
        const body = state.body as {
          code?: string;
          enabled?: boolean;
        };
        assert.equal(body.code, "control_room_disabled");
        assert.equal(body.enabled, false);
        assertSafeMeta(state.body);
        assertNoSecrets(state.body);
      });
    });

    it("3. Unauthorized response remains safe", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      await withControlRoomEnv(
        { enabled: "1", accessKey: PATCH_016B_TEST_KEY },
        async () => {
          const { res, state } = createMockResponse();
          await mod.default(
            {
              method: "GET",
              headers: { "x-ai-os-control-room-key": "wrong-key-value-xxxxxxxx" },
            },
            res
          );
          assert.equal(state.statusCode, 401);
          const body = state.body as { code?: string };
          assert.equal(body.code, "unauthorized");
          assertSafeMeta(state.body);
          assertNoSecrets(state.body);
        }
      );
    });

    it("4. Correct key succeeds", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      await withControlRoomEnv(
        { enabled: "1", accessKey: PATCH_016B_TEST_KEY },
        async () => {
          const { res, state } = createMockResponse();
          await mod.default(
            {
              method: "GET",
              headers: {
                "X-AI-OS-Control-Room-Key": PATCH_016B_TEST_KEY,
              },
            },
            res
          );
          assert.equal(state.statusCode, 200);
          const body = state.body as {
            ok?: boolean;
            scenarios?: unknown[];
          };
          assert.equal(body.ok, true);
          assert.ok(Array.isArray(body.scenarios));
          assert.equal(body.scenarios?.length, 4);
          assertSafeMeta(state.body);
        }
      );
    });

    it("5. Wrong key fails", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      await withControlRoomEnv(
        { enabled: "1", accessKey: PATCH_016B_TEST_KEY },
        async () => {
          const { res, state } = createMockResponse();
          await mod.default(
            {
              method: "GET",
              headers: {
                "x-ai-os-control-room-key": "definitely-not-the-right-key!!",
              },
            },
            res
          );
          assert.equal(state.statusCode, 401);
          assert.equal((state.body as { code?: string }).code, "unauthorized");
        }
      );
    });

    it("6. Lowercase header key works", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      assert.equal(
        mod.resolveControlRoomAccessHeader({
          "x-ai-os-control-room-key": PATCH_016B_TEST_KEY,
        }),
        PATCH_016B_TEST_KEY
      );
    });

    it("7. Mixed-case header key works", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      assert.equal(
        mod.resolveControlRoomAccessHeader({
          "X-AI-OS-Control-Room-Key": PATCH_016B_TEST_KEY,
        }),
        PATCH_016B_TEST_KEY
      );
    });

    it("8. String-array header works", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      assert.equal(
        mod.resolveControlRoomAccessHeader({
          "x-ai-os-control-room-key": [PATCH_016B_TEST_KEY],
        }),
        PATCH_016B_TEST_KEY
      );
    });

    it("9. Headers-like get() works if supported by the request type", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      const headersLike = {
        get(name: string) {
          if (name.toLowerCase() === "x-ai-os-control-room-key") {
            return PATCH_016B_TEST_KEY;
          }
          return null;
        },
      };
      assert.equal(
        mod.resolveControlRoomAccessHeader(headersLike),
        PATCH_016B_TEST_KEY
      );
    });

    it("10. Query key remains rejected", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      await withControlRoomEnv(
        { enabled: "1", accessKey: PATCH_016B_TEST_KEY },
        async () => {
          const { res, state } = createMockResponse();
          await mod.default(
            {
              method: "POST",
              headers: {
                "x-ai-os-control-room-key": PATCH_016B_TEST_KEY,
              },
              query: { accessKey: PATCH_016B_TEST_KEY },
              body: { scenarioId: "balanced_recomposition_12w" },
            },
            res
          );
          assert.equal(state.statusCode, 400);
          assert.equal(
            (state.body as { code?: string }).code,
            "invalid_request"
          );
          assertSafeMeta(state.body);
        }
      );
    });

    it("11. JSON key remains rejected", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      await withControlRoomEnv(
        { enabled: "1", accessKey: PATCH_016B_TEST_KEY },
        async () => {
          const { res, state } = createMockResponse();
          await mod.default(
            {
              method: "POST",
              headers: {
                "x-ai-os-control-room-key": PATCH_016B_TEST_KEY,
              },
              body: {
                scenarioId: "balanced_recomposition_12w",
                accessKey: PATCH_016B_TEST_KEY,
              },
            },
            res
          );
          assert.equal(state.statusCode, 400);
          assert.equal(
            (state.body as { code?: string }).code,
            "invalid_request"
          );
        }
      );
    });

    it("12. Cookies are not read", () => {
      assert.equal(apiSource.includes("cookie"), false);
      assert.equal(apiSource.includes("Cookie"), false);
      assert.equal(uiSource.includes("document.cookie"), false);
    });

    it("13. Missing configured key does not reveal that fact", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      await withControlRoomEnv({ enabled: "1", accessKey: undefined }, async () => {
        assert.equal(
          mod.getControlRoomConfigurationStatus(),
          "missing_access_key"
        );
        const { res, state } = createMockResponse();
        await mod.default(
          {
            method: "GET",
            headers: {
              "x-ai-os-control-room-key": PATCH_016B_TEST_KEY,
            },
          },
          res
        );
        assert.equal(state.statusCode, 401);
        const body = state.body as { code?: string; message?: string };
        assert.equal(body.code, "unauthorized");
        assert.equal(body.message, "Unauthorized.");
        assert.equal(JSON.stringify(body).includes("missing_access_key"), false);
        assertNoSecrets(state.body);
      });
    });

    it("14. Fixed-length digest comparison remains intact", async () => {
      const { digestAccessKey, timingSafeStringEqual } =
        await loadAccessKeyAuthHelpers();
      assert.match(apiSource, /createHash\("sha256"\)/);
      assert.match(apiSource, /timingSafeEqual/);
      const a = digestAccessKey("alpha");
      const b = digestAccessKey("beta-longer");
      assert.equal(a.length, 32);
      assert.equal(b.length, 32);
      assert.equal(timingSafeStringEqual(PATCH_016B_TEST_KEY, PATCH_016B_TEST_KEY), true);
      assert.equal(
        timingSafeStringEqual(PATCH_016B_TEST_KEY, `${PATCH_016B_TEST_KEY}x`),
        false
      );
    });

    it("15. API response never includes key, digest, environment value, or stack trace", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      await withControlRoomEnv(
        { enabled: "1", accessKey: PATCH_016B_TEST_KEY },
        async () => {
          const samples = [
            createMockResponse(),
            createMockResponse(),
            createMockResponse(),
          ];
          await mod.default({ method: "GET", headers: {} }, samples[0].res);
          await mod.default(
            {
              method: "GET",
              headers: { "x-ai-os-control-room-key": "wrong-key-xxxxxxxxxxxx" },
            },
            samples[1].res
          );
          await mod.default(
            {
              method: "GET",
              headers: { "x-ai-os-control-room-key": PATCH_016B_TEST_KEY },
            },
            samples[2].res
          );
          for (const sample of samples) {
            assertSafeMeta(sample.state.body);
            assertNoSecrets(sample.state.body);
          }
        }
      );
    });

    it("16. UI displays API code and HTTP status safely", () => {
      assert.match(uiSource, /formatUnlockFailure/);
      assert.match(uiSource, /Code: /);
      assert.match(uiSource, /HTTP: /);
      assert.match(uiSource, /Unable to unlock Control Room\./);
      assert.equal(uiSource.includes("innerHTML"), false);
      assert.match(uiSource, /textContent/);
    });

    it("17. UI handles non-JSON response", () => {
      assert.match(uiSource, /non_json_response/);
      assert.match(uiSource, /JSON\.parse/);
      assert.match(uiSource, /nonJson/);
    });

    it("18. UI handles network failure", () => {
      assert.match(uiSource, /network_failure/);
      assert.match(uiSource, /unavailable/);
    });

    it("19. UI handles unexpected API identity", () => {
      assert.match(uiSource, /unexpected_api_response/);
      assert.match(uiSource, /EXPECTED_SERVICE/);
      assert.match(uiSource, /metaMatches|API identity/);
      assert.match(uiSource, /ai-os-control-room/);
      assert.match(uiSource, /1\.1/);
    });

    it("20. UI never writes raw response through innerHTML", () => {
      assert.equal(uiSource.includes("innerHTML"), false);
      assert.equal(uiSource.includes("outerHTML"), false);
      assert.match(uiSource, /textContent/);
    });

    it("21. UI never logs access key", () => {
      assert.equal(/console\.(log|debug|info|warn|error)/.test(uiSource), false);
      assert.equal(uiSource.includes("localStorage"), false);
      assert.equal(uiSource.includes("sessionStorage"), false);
    });

    it("22. Production image route remains unchanged", () => {
      const route = read(join(repoRoot, "api", "generate-future-you.js"));
      assert.equal(route.includes("ControlRoom"), false);
      assert.equal(route.includes("ai-os-control-room"), false);
    });

    it("23. lib/replicate.js remains unchanged", () => {
      const replicate = read(join(repoRoot, "lib", "replicate.js"));
      assert.equal(replicate.includes("ControlRoom"), false);
      assert.equal(replicate.includes("AI_OS_CONTROL_ROOM"), false);
    });

    it("24. No provider fetch is introduced", () => {
      assert.equal(/fetch\s*\(/.test(apiSource), false);
      assert.equal(apiSource.includes("api.replicate.com"), false);
      assert.equal(apiSource.includes("REPLICATE_API_TOKEN"), false);
    });

    it("25. npm run typecheck passes", () => {
      const pkg = JSON.parse(read(packageJsonPath));
      assert.ok(pkg.scripts.typecheck.includes("tsc"));
    });

    it("26. npm run test:ai passes", () => {
      const pkg = JSON.parse(read(packageJsonPath));
      assert.ok(pkg.scripts["test:ai"].includes("controlRoom.test.ts"));
    });

    it("27. npm run harness:ai passes", () => {
      const pkg = JSON.parse(read(packageJsonPath));
      assert.ok(pkg.scripts["harness:ai"].includes("run-ai-os-v2-harness"));
      assert.match(docs, /API response identity/);
      assert.match(docs, /Safe UI diagnostic codes/);
      assert.match(docs, /Owner unlock troubleshooting checklist/);
      assert.match(docs, /owner does \*\*not\*\* need browser developer tools|does \*\*not\*\* need browser developer tools/i);
    });
  });

  describe("PATCH_016D Control Room lazy-load fix", () => {
    const apiSource = read(apiPath);

    it("1. API uses lazy module loading and no static value import", () => {
      assert.match(apiSource, /async function loadControlRoomModule/);
      assert.match(
        apiSource,
        /import\(["']\.\.\/src\/ai\/control-room\/index["']\)/
      );
      assert.equal(
        /import\s*\{[\s\S]*ControlRoomService[\s\S]*\}\s*from\s*["']\.\.\/src\/ai\/control-room["']/.test(
          apiSource
        ),
        false
      );
      assert.equal(
        /import\s+type\s*\{[\s\S]*\}\s*from\s*["']\.\.\/src\/ai\/control-room["']/.test(
          apiSource
        ),
        false
      );
      assert.equal(
        /typeof\s+import\(["']\.\.\/src\/ai\/control-room\/index["']\)/.test(
          apiSource
        ),
        false
      );
      assert.equal(apiSource.includes("ControlRoomServiceError"), true);
    });

    it("2. API explicitly pins Node.js runtime", () => {
      assert.equal(/export\s+const\s+config\s*=/.test(apiSource), true);
      assert.equal(/runtime\s*:\s*["']nodejs["']/.test(apiSource), true);
      assert.equal(/runtime\s*:\s*["']edge["']/.test(apiSource), false);
      assert.equal(/maxDuration\s*:\s*60/.test(apiSource), false);
    });

    it("3. Crypto import uses node:crypto proven by prior green deploy", () => {
      assert.match(apiSource, /from\s+"node:crypto"/);
      assert.equal(/from\s+"crypto"/.test(apiSource), false);
    });

    it("4. Response meta identity remains 1.1", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      assert.equal(mod.CONTROL_ROOM_RESPONSE_META.service, "ai-os-control-room");
      assert.equal(mod.CONTROL_ROOM_RESPONSE_META.apiVersion, "1.1");
    });

    it("5. Disabled JSON still includes meta", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      await withControlRoomEnv({ enabled: undefined }, async () => {
        const { res, state } = createMockResponse();
        await mod.default({ method: "GET", headers: {} }, res);
        assert.equal(state.statusCode, 404);
        assertSafeMeta(state.body);
      });
    });

    it("6. Unauthorized JSON still includes meta", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      await withControlRoomEnv(
        { enabled: "1", accessKey: PATCH_016B_TEST_KEY },
        async () => {
          const { res, state } = createMockResponse();
          await mod.default({ method: "GET", headers: {} }, res);
          assert.equal(state.statusCode, 401);
          assertSafeMeta(state.body);
        }
      );
    });

    it("7. Authorized GET still succeeds with scenarios", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      await withControlRoomEnv(
        { enabled: "1", accessKey: PATCH_016B_TEST_KEY },
        async () => {
          const { res, state } = createMockResponse();
          await mod.default(
            {
              method: "GET",
              headers: { "x-ai-os-control-room-key": PATCH_016B_TEST_KEY },
            },
            res
          );
          assert.equal(state.statusCode, 200);
          assertSafeMeta(state.body);
          assert.equal((state.body as { ok?: boolean }).ok, true);
        }
      );
    });

    it("8. Header resolution remains case-insensitive", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      assert.equal(
        mod.resolveControlRoomAccessHeader({
          "X-AI-OS-Control-Room-Key": PATCH_016B_TEST_KEY,
        }),
        PATCH_016B_TEST_KEY
      );
    });

    it("9. SHA-256 timing-safe auth remains intact", async () => {
      const { digestAccessKey, timingSafeStringEqual } =
        await loadAccessKeyAuthHelpers();
      assert.match(apiSource, /createHash\("sha256"\)/);
      assert.match(apiSource, /timingSafeEqual/);
      assert.equal(digestAccessKey("x").length, 32);
      assert.equal(
        timingSafeStringEqual(PATCH_016B_TEST_KEY, PATCH_016B_TEST_KEY),
        true
      );
    });

    it("10. Query access key remains rejected", async () => {
      const mod = await loadAccessKeyAuthHelpers();
      await withControlRoomEnv(
        { enabled: "1", accessKey: PATCH_016B_TEST_KEY },
        async () => {
          const { res, state } = createMockResponse();
          await mod.default(
            {
              method: "POST",
              headers: { "x-ai-os-control-room-key": PATCH_016B_TEST_KEY },
              query: { accessKey: PATCH_016B_TEST_KEY },
              body: { scenarioId: "balanced_recomposition_12w" },
            },
            res
          );
          assert.equal(state.statusCode, 400);
          assertSafeMeta(state.body);
        }
      );
    });

    it("11. Docs mention Vercel-safe API shape", () => {
      const docs = read(docsPath);
      assert.match(docs, /Vercel|deployment|config\.runtime|nodejs/i);
      assert.match(docs, /node:crypto|lazy import|serverless/i);
    });

    it("12. vercel.json was not required for this fix", () => {
      const vercelJsonPath = join(repoRoot, "vercel.json");
      const vercel = read(vercelJsonPath);
      assert.equal(/ai-os-control-room/.test(vercel), false);
      assert.equal(/"maxDuration"/.test(vercel), false);
      assert.equal(/"runtime"/.test(vercel), false);
    });
  });
});
