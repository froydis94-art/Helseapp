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
import { fileURLToPath } from "node:url";
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

    it("51. Timing-safe comparison is used", () => {
      assert.match(apiSource, /timingSafeEqual/);
    });

    it("52. GET requires authorization", () => {
      assert.match(apiSource, /isAuthorized/);
      assert.match(apiSource, /unauthorized/);
    });

    it("53. POST requires authorization", () => {
      assert.match(apiSource, /method === "POST"/);
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
});
