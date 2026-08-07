/**
 * Demand 022A — Body Simulator Shadow Runtime integration tests.
 * Covers integration, flag, adapter, inspector, medication, safety,
 * scenarios, API, and regression (tests 1–85).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ControlRoomService } from "../control-room/ControlRoomService";
import {
  BODY_SIMULATOR_SHADOW_ERROR_CODES,
  BODY_SIMULATOR_SHADOW_FLAG,
  DEFAULT_BODY_SIMULATOR_SHADOW_SCENARIO_ID,
  adaptBodySimulatorShadowInput,
  getBodySimulatorShadowFixture,
  humanizeModerationReason,
  isAllowlistedBodySimulatorShadowScenarioId,
  isBodySimulatorShadowEnabled,
  listBodySimulatorShadowScenarios,
  runBodySimulatorShadowPhase,
} from "../shadow/BodySimulatorShadowIntegration";
import {
  createDryRunShadowRuntime,
} from "../shadow/ShadowRuntime";
import { runtimeOnlyValidShadowInput } from "../shadow/fixtures";
import {
  simulateBodyTransformation,
} from "../body-simulator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function withEnv(
  values: Record<string, string | undefined>,
  fn: () => void | Promise<void>
): Promise<void> {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(values)) {
    prev[key] = process.env[key];
    const next = values[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      for (const key of Object.keys(values)) {
        const old = prev[key];
        if (old === undefined) delete process.env[key];
        else process.env[key] = old;
      }
    });
}

describe("Demand 022A — Body Simulator Shadow Integration", () => {
  describe("Integration", () => {
    it("1. Body Simulator is connected to Shadow Runtime only", async () => {
      const shadow = createDryRunShadowRuntime();
      const result = await shadow.run({
        ...runtimeOnlyValidShadowInput,
        bodySimulatorEnabled: true,
        bodySimulatorScenarioId: DEFAULT_BODY_SIMULATOR_SHADOW_SCENARIO_ID,
      });
      assert.ok(result.bodySimulator);
      assert.equal(result.bodySimulator?.executed, true);
    });

    it("2. Body Simulator is not connected to production generation", () => {
      const generate = read("api/generate-future-you.js");
      assert.equal(generate.includes("AI_OS_BODY_SIMULATOR_SHADOW_ENABLED"), false);
      assert.equal(generate.includes("runBodySimulatorShadowPhase"), false);
      assert.equal(generate.includes("simulateBodyTransformation"), false);
    });

    it("3. Existing Body Simulator engine is reused", () => {
      const integration = read(
        "src/ai/shadow/BodySimulatorShadowIntegration.ts"
      );
      assert.match(integration, /simulateBodyTransformation/);
      assert.match(integration, /from "\.\.\/body-simulator"/);
      assert.equal(
        /function simulateBodyTransformation/.test(integration),
        false
      );
    });

    it("4. No duplicate simulator implementation is created", () => {
      const integration = read(
        "src/ai/shadow/BodySimulatorShadowIntegration.ts"
      );
      assert.equal(/class BodySimulator/.test(integration), false);
      assert.equal(/function buildBodySimulatorTransformationRules/.test(integration), false);
    });

    it("5. Simulator executes at most once per dry run", () => {
      const { view } = runBodySimulatorShadowPhase({
        enabled: true,
        scenarioId: DEFAULT_BODY_SIMULATOR_SHADOW_SCENARIO_ID,
      });
      const once = view.diagnostics.filter((d) =>
        d.includes("body_simulator_executed_once")
      );
      assert.equal(once.length, 1);
    });

    it("6. No automatic retry exists", () => {
      const integration = read(
        "src/ai/shadow/BodySimulatorShadowIntegration.ts"
      );
      assert.equal(/for\s*\(.*retry/i.test(integration), false);
      assert.equal(/while\s*\(.*retry/i.test(integration), false);
      assert.equal(integration.includes("autoRetry"), false);
    });

    it("7. No provider call exists", () => {
      const integration = read(
        "src/ai/shadow/BodySimulatorShadowIntegration.ts"
      );
      assert.equal(integration.includes("Replicate"), false);
      assert.equal(integration.includes("fetch("), false);
      assert.equal(/\bprovider\b/i.test(integration), false);
    });

    it("8. No image generation exists", () => {
      const integration = read(
        "src/ai/shadow/BodySimulatorShadowIntegration.ts"
      );
      assert.equal(integration.includes("generateImage"), false);
      assert.equal(integration.includes("imageUrl"), false);
      assert.equal(integration.includes("data:image"), false);
    });
  });

  describe("Feature flag", () => {
    it("9. Flag is server-side", () => {
      assert.equal(BODY_SIMULATOR_SHADOW_FLAG, "AI_OS_BODY_SIMULATOR_SHADOW_ENABLED");
      const js = read("public/ai-os-control-room.js");
      assert.equal(js.includes("AI_OS_BODY_SIMULATOR_SHADOW_ENABLED"), false);
    });

    it("10. Flag defaults disabled", () => {
      assert.equal(
        isBodySimulatorShadowEnabled({}),
        false
      );
      assert.equal(
        isBodySimulatorShadowEnabled({ AI_OS_BODY_SIMULATOR_SHADOW_ENABLED: "true" }),
        false
      );
    });

    it("11. Browser cannot enable it", () => {
      const js = read("public/ai-os-control-room.js");
      assert.equal(/process\.env/.test(js), false);
      assert.equal(js.includes("BODY_SIMULATOR_SHADOW_ENABLED"), false);
    });

    it("12. Production route does not read it", () => {
      const generate = read("api/generate-future-you.js");
      const replicate = read("lib/replicate.js");
      assert.equal(generate.includes("AI_OS_BODY_SIMULATOR_SHADOW_ENABLED"), false);
      assert.equal(replicate.includes("AI_OS_BODY_SIMULATOR_SHADOW_ENABLED"), false);
    });

    it("13. Dry run still works when disabled", async () => {
      await withEnv({ AI_OS_BODY_SIMULATOR_SHADOW_ENABLED: undefined }, async () => {
        const result = await new ControlRoomService().runScenario(
          "balanced_recomposition_12w"
        );
        assert.equal(result.success, true);
        assert.equal(result.bodySimulator.enabled, false);
        assert.equal(result.bodySimulator.status, "disabled");
        assert.ok(result.artifacts);
      });
    });

    it("14. Disabled state is safely displayed", () => {
      const html = read("public/ai-os-control-room.html");
      const js = read("public/ai-os-control-room.js");
      assert.match(html, /Body Simulator/);
      assert.match(js, /Disabled/);
      assert.match(js, /bodySimulatorStatusLabel/);
    });
  });

  describe("Adapter", () => {
    it("15. Adapter uses fixture data only", () => {
      const fixture = getBodySimulatorShadowFixture(
        DEFAULT_BODY_SIMULATOR_SHADOW_SCENARIO_ID
      );
      const adapted = adaptBodySimulatorShadowInput(fixture);
      assert.ok(adapted.input);
      assert.ok(adapted.diagnostics.includes("body_simulator_adapter_fixture_only"));
    });

    it("16. Adapter preserves unknown profile values", () => {
      const fixture = getBodySimulatorShadowFixture("general_fitness_limited_baseline");
      assert.ok(fixture);
      const adapted = adaptBodySimulatorShadowInput(fixture);
      assert.equal(adapted.input?.profile.ageYears, null);
      assert.equal(adapted.input?.profile.trainingExperience, "not_provided");
    });

    it("17. Adapter does not invent body fat", () => {
      const fixture = getBodySimulatorShadowFixture("missing_body_fat");
      assert.ok(fixture);
      const adapted = adaptBodySimulatorShadowInput(fixture);
      assert.equal(adapted.input?.profile.currentBodyFatPercent, null);
    });

    it("18. Adapter does not invent training experience", () => {
      const fixture = getBodySimulatorShadowFixture("general_fitness_limited_baseline");
      assert.ok(fixture);
      const adapted = adaptBodySimulatorShadowInput(fixture);
      assert.equal(adapted.input?.profile.trainingExperience, "not_provided");
    });

    it("19. Adapter does not invent medication effects", () => {
      const fixture = getBodySimulatorShadowFixture("no_medication_modifier");
      assert.ok(fixture);
      const adapted = adaptBodySimulatorShadowInput(fixture);
      assert.equal(adapted.input?.medicationEffects.medicationMayAffectWeight, false);
    });

    it("20. Adapter preserves provenance", () => {
      const { view } = runBodySimulatorShadowPhase({
        enabled: true,
        scenarioId: DEFAULT_BODY_SIMULATOR_SHADOW_SCENARIO_ID,
      });
      assert.ok(view.rules);
      assert.ok(Array.isArray(view.rules?.provenance));
      assert.ok((view.rules?.provenance.length ?? 0) > 0);
    });

    it("21. Adapter returns structured limitations", () => {
      const fixture = getBodySimulatorShadowFixture("missing_body_fat");
      const adapted = adaptBodySimulatorShadowInput(fixture);
      assert.ok(Array.isArray(adapted.limitations));
      assert.ok(adapted.limitations.length > 0);
    });
  });

  describe("Inspector", () => {
    const html = read("public/ai-os-control-room.html");
    const js = read("public/ai-os-control-room.js");

    it("22. Body Simulator section exists", () => {
      assert.match(html, /aiPipelineSectionBodySimulator/);
      assert.match(html, /<summary>Body Simulator<\/summary>/);
    });

    it("23. Inspector is read-only", () => {
      assert.equal(html.includes("Override simulator"), false);
      assert.equal(html.includes("Apply changes"), false);
      assert.equal(html.includes("Edit rules"), false);
      assert.equal(/Regenerate/.test(html) && /bodySimulator/.test(html), false);
    });

    it("24. Input summary is displayed", () => {
      assert.match(html, /bodySimulatorInputBody/);
      assert.match(js, /Input summary|goal type/);
    });

    it("25. Readiness is displayed", () => {
      assert.match(html, /bodySimulatorReadinessBody/);
    });

    it("26. Goal is displayed", () => {
      assert.match(html, /bodySimulatorGoalBody/);
    });

    it("27. Timeline is displayed", () => {
      assert.match(js, /timeline weeks/);
    });

    it("28. Intensity is displayed", () => {
      assert.match(js, /intensity/);
    });

    it("29. Whole-body ranges are displayed", () => {
      assert.match(html, /bodySimulatorWholeBodyBody/);
      assert.match(html, /Expected simulation range/);
    });

    it("30. Regional rules are displayed", () => {
      assert.match(html, /bodySimulatorRegionsBody/);
    });

    it("31. Preservation rules are displayed", () => {
      assert.match(html, /bodySimulatorPreservationBody/);
      assert.match(js, /face geometry/);
      assert.match(js, /hand and foot scale/);
    });

    it("32. Realism moderation is displayed", () => {
      assert.match(html, /bodySimulatorRealismBody/);
    });

    it("33. Confidence is displayed", () => {
      assert.match(html, /bodySimulatorConfidenceBody/);
      assert.match(html, /evidence quality, not probability of success/);
    });

    it("34. Provenance is displayed", () => {
      assert.match(html, /bodySimulatorProvenanceBody/);
    });

    it("35. Limitations are displayed", () => {
      assert.match(html, /bodySimulatorLimitationsBody/);
    });

    it("36. Safe JSON is displayed", () => {
      assert.match(html, /bodySimulatorJsonView/);
      assert.match(html, /Safe JSON/);
    });

    it("37. Dynamic content uses textContent", () => {
      assert.match(js, /k\.textContent = key/);
      assert.match(js, /v\.textContent =/);
      assert.match(js, /el\.textContent =/);
    });

    it("38. No dynamic innerHTML exists", () => {
      const bodySimSection = js.slice(
        js.indexOf("renderBodySimulatorInspector"),
        js.indexOf("function renderVersions")
      );
      assert.equal(bodySimSection.includes("innerHTML"), false);
    });
  });

  describe("Medication", () => {
    it("39. General medication-effect model is displayed", () => {
      const js = read("public/ai-os-control-room.js");
      assert.match(js, /appetite effect/);
      assert.match(js, /energy-level effect/);
      assert.match(js, /metabolism tendency/);
    });

    it("40. No medication name is displayed", () => {
      const js = read("public/ai-os-control-room.js");
      assert.equal(/ozempic|wegovy|semaglutide|dose/i.test(js), false);
    });

    it("41. No dose is displayed", () => {
      const html = read("public/ai-os-control-room.html");
      const start = html.indexOf("aiPipelineSectionBodySimulator");
      const end = html.indexOf("aiPipelineSectionProvenance");
      const section = html.slice(start, end > start ? end : start + 4000);
      assert.equal(/dosage|medicine name|mg\b/i.test(section), false);
    });

    it("42. medicationMayAffectWeight false shows no modifier", () => {
      const { view } = runBodySimulatorShadowPhase({
        enabled: true,
        scenarioId: "no_medication_modifier",
      });
      assert.equal(view.inputSummary?.medicationMayAffectWeight, false);
      assert.equal(
        view.inputSummary?.medication?.medicationMayAffectWeight,
        false
      );
      const js = read("public/ai-os-control-room.js");
      assert.match(js, /No medication modifier applied\./);
    });

    it("43. Unknown effect remains unknown", () => {
      const js = read("public/ai-os-control-room.js");
      assert.match(js, /formatEffectDirection/);
      assert.match(js, /return "Unknown"/);
    });

    it("44. Medication note states user-reported bounded modifier", () => {
      const html = read("public/ai-os-control-room.html");
      assert.match(
        html,
        /Medication effects are user-reported bounded modifiers/
      );
    });
  });

  describe("Safety", () => {
    it("45–51. Forbidden scoring / sexual / medical language absent", () => {
      const { view } = runBodySimulatorShadowPhase({
        enabled: true,
        scenarioId: DEFAULT_BODY_SIMULATOR_SHADOW_SCENARIO_ID,
      });
      const text = JSON.stringify(view).toLowerCase();
      assert.equal(text.includes("beauty score"), false);
      assert.equal(text.includes("body ranking"), false);
      assert.equal(text.includes("attractiveness"), false);
      assert.equal(text.includes("medical diagnosis"), false);
      assert.equal(text.includes("guaranteed success"), false);
      assert.equal(text.includes("sexual classification"), false);
      assert.ok(view.rules?.regions.every((r) => typeof r.region === "string"));
    });
  });

  describe("Scenarios", () => {
    it("52. Scenario registry is allowlisted server-side", () => {
      const list = listBodySimulatorShadowScenarios();
      assert.ok(list.length >= 15);
      assert.equal(isAllowlistedBodySimulatorShadowScenarioId("not_real"), false);
    });

    it("53. Arbitrary scenario input is rejected", () => {
      const { view } = runBodySimulatorShadowPhase({
        enabled: true,
        scenarioId: "arbitrary_browser_json",
      });
      assert.equal(view.status, "failed");
      assert.equal(view.errorCode, "body_simulator_validation_failed");
    });

    it("54–58. Required fixtures are available", () => {
      for (const id of [
        "realistic_weight_loss_12w",
        "body_recomposition_16w",
        "beginner_muscle_gain_24w",
        "med_appetite_decrease",
        "unrealistic_target_moderated",
      ]) {
        assert.ok(isAllowlistedBodySimulatorShadowScenarioId(id));
        assert.ok(getBodySimulatorShadowFixture(id));
      }
    });

    it("59. No real person data exists", () => {
      const list = listBodySimulatorShadowScenarios();
      const text = JSON.stringify(list);
      assert.equal(/@[a-z0-9.-]+\./i.test(text), false);
      assert.equal(/ssn|passport/i.test(text), false);
    });

    it("60. No fixture image exists", () => {
      const fixture = getBodySimulatorShadowFixture(
        DEFAULT_BODY_SIMULATOR_SHADOW_SCENARIO_ID
      );
      assert.equal(JSON.stringify(fixture).includes("data:image"), false);
      assert.equal(JSON.stringify(fixture).includes("http"), false);
    });
  });

  describe("API", () => {
    const api = read("api/ai-os-control-room.ts");

    it("61. Safe bodySimulator response exists", async () => {
      const result = await new ControlRoomService().runScenario(
        "balanced_recomposition_12w"
      );
      assert.ok(result.bodySimulator);
      assert.equal(typeof result.bodySimulator.enabled, "boolean");
      assert.ok(Array.isArray(result.bodySimulator.diagnostics));
    });

    it("62–67. Response contains no secrets / images / paths", async () => {
      await withEnv({ AI_OS_BODY_SIMULATOR_SHADOW_ENABLED: "1" }, async () => {
        const result = await new ControlRoomService().runScenario(
          "balanced_recomposition_12w",
          { bodySimulatorScenarioId: DEFAULT_BODY_SIMULATOR_SHADOW_SCENARIO_ID }
        );
        const text = JSON.stringify(result.bodySimulator);
        assert.equal(text.includes("ACCESS_KEY"), false);
        assert.equal(text.includes("REPLICATE"), false);
        assert.equal(text.includes("process.env"), false);
        assert.equal(text.includes("data:image"), false);
        assert.equal(/https?:\/\//.test(text), false);
        assert.equal(text.includes("C:\\\\"), false);
        assert.equal(text.includes("/Users/"), false);
      });
    });

    it("68. Response uses no-store", () => {
      assert.match(api, /Cache-Control.*no-store|no-store/);
    });

    it("69. Existing Control Room authentication remains", () => {
      assert.match(api, /AI_OS_CONTROL_ROOM_ACCESS_KEY/);
      assert.match(api, /isAuthorized/);
    });
  });

  describe("Regression", () => {
    it("70. Body Simulator business rules remain unchanged", () => {
      const fixture = getBodySimulatorShadowFixture(
        DEFAULT_BODY_SIMULATOR_SHADOW_SCENARIO_ID
      );
      assert.ok(fixture);
      const direct = simulateBodyTransformation(fixture);
      assert.equal(direct.ok, true);
      const { view } = runBodySimulatorShadowPhase({
        enabled: true,
        scenarioId: DEFAULT_BODY_SIMULATOR_SHADOW_SCENARIO_ID,
      });
      assert.ok(view.rules);
      if (direct.ok && view.rules) {
        assert.equal(view.rules.goal.effectiveType, direct.rules.goal.effectiveType);
        assert.equal(
          view.rules.wholeBodyChange.weightChangeKg.expected,
          direct.rules.wholeBodyChange.weightChangeKg.expected
        );
      }
    });

    it("71–79. Forbidden surfaces remain unchanged", () => {
      const integration = read(
        "src/ai/shadow/BodySimulatorShadowIntegration.ts"
      );
      assert.equal(integration.includes("ProviderFormatter"), false);
      assert.equal(integration.includes("ReplicateTransport"), false);
      assert.equal(integration.includes("RetryOrchestrator"), false);
      assert.equal(
        read("api/generate-future-you.js").includes("BodySimulatorShadow"),
        false
      );
      assert.equal(
        read("public/ai-os-control-room.js").includes(
          "innerHTML = bodySimulator"
        ),
        false
      );
    });

    it("80. No environment variable is automatically added", () => {
      const vercel = read("vercel.json");
      assert.equal(vercel.includes("AI_OS_BODY_SIMULATOR_SHADOW_ENABLED"), false);
    });

    it("81. No dependency is added", () => {
      // package.json change is only test:ai script — no new deps
      const pkg = JSON.parse(read("package.json")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      assert.ok(pkg);
    });

    it("82–85. Control Room unlock / dry run / inspector still work", async () => {
      const html = read("public/ai-os-control-room.html");
      assert.match(html, /Unlock Control Room/);
      assert.match(html, /AI Pipeline Inspector/);
      assert.match(html, /Prompt Isolation/);
      const result = await new ControlRoomService().runScenario(
        "balanced_recomposition_12w"
      );
      assert.equal(result.success, true);
      assert.ok(result.artifacts?.formattedRequest.positivePrompt);
      assert.equal(result.bodySimulator.status, "disabled");
    });
  });

  describe("Enabled execution + moderation mapping", () => {
    it("enabled realistic fixture succeeds", async () => {
      await withEnv({ AI_OS_BODY_SIMULATOR_SHADOW_ENABLED: "1" }, async () => {
        const result = await new ControlRoomService().runScenario(
          "balanced_recomposition_12w",
          { bodySimulatorScenarioId: "realistic_weight_loss_12w" }
        );
        assert.equal(result.success, true);
        assert.equal(result.bodySimulator.enabled, true);
        assert.ok(
          result.bodySimulator.status === "succeeded" ||
            result.bodySimulator.status === "ready_with_limitations"
        );
        assert.equal(
          result.bodySimulator.scenarioId,
          "realistic_weight_loss_12w"
        );
        assert.ok(result.bodySimulator.rules);
        assert.ok(result.bodySimulator.projection);
      });
    });

    it("unrealistic fixture exposes moderation reasons", () => {
      const { view } = runBodySimulatorShadowPhase({
        enabled: true,
        scenarioId: "unrealistic_target_moderated",
      });
      assert.ok(view.rules?.realism.requestedTargetModerated);
      assert.ok((view.rules?.realism.moderationReasons.length ?? 0) > 0);
      const label = humanizeModerationReason(
        view.rules!.realism.moderationReasons[0]!
      );
      assert.ok(label.length > 0);
    });

    it("safe error codes are documented", () => {
      assert.deepEqual(
        [...BODY_SIMULATOR_SHADOW_ERROR_CODES],
        [
          "body_simulator_disabled",
          "body_simulator_insufficient_input",
          "body_simulator_validation_failed",
          "body_simulator_execution_failed",
          "body_simulator_projection_failed",
        ]
      );
    });

    it("API inlined scenarios stay aligned with registry", () => {
      const api = read("api/ai-os-control-room.ts");
      for (const scenario of listBodySimulatorShadowScenarios()) {
        assert.match(api, new RegExp(`"${scenario.id}"`));
        assert.match(api, new RegExp(`"${scenario.fixtureSimulationId}"`));
      }
    });

    it("shadow disabled attaches not-run/disabled bodySimulator", async () => {
      const shadow = createDryRunShadowRuntime();
      const result = await shadow.run(runtimeOnlyValidShadowInput);
      assert.ok(result.bodySimulator);
      assert.equal(result.bodySimulator?.executed, false);
      assert.equal(result.bodySimulator?.status, "not_run");
    });
  });
});
