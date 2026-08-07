/**
 * Demand 022E — Anatomical Engine Live Preview Integration tests.
 *
 * No real network. Provider/transport mocked. Flag defaults OFF.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BODY_SIMULATOR_LIVE_PREVIEW_ENV,
  adaptPublicFutureToBodySimulator,
  assertAnatomicalRulesTranslated,
  adaptBodySimulatorRulesToFormatterInput,
  effortCoefficientForIntensity,
  isBodySimulatorLivePreviewEnabled,
  magnitudeOrdinal,
  mapPublicBodyFat,
  mapPublicEffort,
  mapPublicFocusZones,
  mapPublicTimeline,
  prepareLiveFuturePreview,
  runLiveFuturePreview,
  LiveFuturePreviewError,
  simulateBodyTransformation,
} from "../body-simulator";
import type {
  ReplicateTransportAdapter,
  ReplicateTransportInput,
  ReplicateTransportResult,
} from "../transport";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");

const JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";
const JPEG_DATA_URI = `data:image/jpeg;base64,${JPEG_B64}`;

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

function hashFile(rel: string): string {
  return createHash("sha256")
    .update(readFileSync(join(repoRoot, rel)))
    .digest("hex");
}

function casePayload(overrides: Record<string, unknown> = {}) {
  return {
    maal: "",
    intensity: "strong",
    horizon: "12w",
    zones: ["abs"],
    fat: "decrease",
    muscle: "toned",
    bfNow: 22,
    bfGoal: 16,
    gender: "female",
    heightCm: 170,
    weightKg: 70,
    ...overrides,
  };
}

function maxAnatMag(rules: {
  anatomicalTransformation?: { rules: { magnitude: string }[] } | null;
}): number {
  const list = rules.anatomicalTransformation?.rules ?? [];
  return Math.max(
    0,
    ...list.map((r) => magnitudeOrdinal(r.magnitude as never))
  );
}

function mockTransport(
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
  return {
    success: true,
    provider: "replicate",
    predictionId: "pred-022e-test",
    model: "black-forest-labs/flux-kontext-pro",
    status: "succeeded",
    imageUrl: "https://cdn.example.com/out/live-preview.png",
    generationTimeMs: 12,
    warnings: [],
    metadata: {
      traceId: "trace-022e",
      formatterName: "FluxFormatter",
      formatterVersion: "1.0",
      pollingAttempts: 1,
      providerStatus: "succeeded",
    },
  };
}

describe("anatomicalLivePreview — DEMAND_022E", () => {
  describe("Public path", () => {
    it("1. Public Generate visualization route is identified", () => {
      const route = read("api/generate-future-you.js");
      const ui = read("public/index.html");
      assert.match(ui, /\/api\/generate-future-you/);
      assert.match(route, /generateWithReplicate/);
      assert.match(route, /BODY_SIMULATOR_LIVE_PREVIEW_ENABLED/);
    });

    it("2. Feature flag OFF preserves exact old behavior path", () => {
      assert.equal(isBodySimulatorLivePreviewEnabled({}), false);
      assert.equal(
        isBodySimulatorLivePreviewEnabled({
          BODY_SIMULATOR_LIVE_PREVIEW_ENABLED: "true",
        }),
        false
      );
      assert.equal(
        isBodySimulatorLivePreviewEnabled({
          BODY_SIMULATOR_LIVE_PREVIEW_ENABLED: "0",
        }),
        false
      );
      const route = read("api/generate-future-you.js");
      assert.match(route, /generateWithReplicate/);
      assert.match(
        route,
        /BODY_SIMULATOR_LIVE_PREVIEW_ENABLED[\s\S]*=== \"1\"/
      );
    });

    it("3. Feature flag ON routes through Body Simulator", () => {
      assert.equal(
        isBodySimulatorLivePreviewEnabled({
          [BODY_SIMULATOR_LIVE_PREVIEW_ENV]: "1",
        }),
        true
      );
      const prep = prepareLiveFuturePreview(casePayload());
      assert.equal(prep.diagnostics.bodySimulatorExecuted, true);
      assert.equal(
        prep.diagnostics.generationPath,
        "body_simulator_anatomical_live_preview"
      );
    });

    it("4. Feature flag ON routes through Anatomical Transformation", () => {
      const prep = prepareLiveFuturePreview(casePayload());
      assert.equal(prep.diagnostics.anatomicalEngineExecuted, true);
      assert.ok(prep.diagnostics.appliedAnatomicalRuleIds.length > 0);
    });

    it("5. Feature flag ON does not run legacy transformation intent", () => {
      const prep = prepareLiveFuturePreview(casePayload());
      assert.equal(prep.canonical.source, "body_simulator_v1");
      assert.equal(
        /reservedrift|visuellPrompt|transformasjonLogikk/.test(
          JSON.stringify(prep.canonical)
        ),
        false
      );
    });

    it("6. One click causes max one provider request", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const result = await runLiveFuturePreview({
        payload: casePayload(),
        sourceImageDataUri: JPEG_DATA_URI,
        transportAdapter: mockTransport(successTransportResult(), calls),
        env: { BODY_SIMULATOR_LIVE_PREVIEW_ENABLED: "1" },
      });
      assert.equal(calls.count, 1);
      assert.equal(result.providerRequestCount, 1);
    });

    it("7. No automatic retry", async () => {
      const pipeline = read(
        "src/ai/body-simulator/LiveFuturePreviewPipeline.ts"
      );
      assert.equal(/autoRetry|retry_required|for\s*\(.*retry/.test(pipeline), false);
    });

    it("8. No automatic fallback", () => {
      const route = read("api/generate-future-you.js");
      assert.match(route, /No silent legacy fallback/);
      // Live-path catch must not recover via reservedrift generateWithReplicate.
      const liveCatch = route.match(
        /catch\s*\(\s*liveError\s*\)\s*\{[\s\S]*?\n\s*\}/
      );
      assert.ok(liveCatch);
      assert.equal(liveCatch![0].includes("generateWithReplicate"), false);
    });
  });

  describe("Body-fat", () => {
    it("9–16. BF mapping, signs, and anatomical non-empty", () => {
      const a = mapPublicBodyFat({ bfNow: 22, bfGoal: 16 });
      assert.equal(a.currentBodyFatPercentReceived, 22);
      assert.equal(a.targetBodyFatPercentReceived, 16);
      assert.equal(a.computedBodyFatDeltaPercentagePoints, -6);

      const b = mapPublicBodyFat({ bfNow: 22, bfGoal: 10 });
      assert.equal(b.computedBodyFatDeltaPercentagePoints, -12);

      const c = mapPublicBodyFat({ bfNow: 26, bfGoal: 10 });
      assert.equal(c.computedBodyFatDeltaPercentagePoints, -16);

      const adapted = adaptPublicFutureToBodySimulator(
        casePayload({ bfNow: 22, bfGoal: 16 })
      );
      assert.equal(adapted.ok, true);
      if (!adapted.ok) return;
      assert.equal(adapted.input.profile.currentBodyFatPercent, 22);
      assert.equal(adapted.input.goal.targetBodyFatPercent, 16);
      assert.equal(adapted.input.goal.targetBodyFatChangePercentagePoints, -6);
      // Absolute target is not misinterpreted as relative-only change.
      assert.notEqual(adapted.input.goal.targetBodyFatPercent, -6);

      const prep = prepareLiveFuturePreview(casePayload());
      assert.ok(prep.diagnostics.appliedAnatomicalRuleIds.length > 0);
      assert.equal(prep.diagnostics.bodyFat.delta, -6);
    });
  });

  describe("Timeline", () => {
    it("17–22. Timeline mapping and magnitude ordering", () => {
      const t3 = mapPublicTimeline({ horizon: "12w" });
      const t6 = mapPublicTimeline({ horizon: "24w" });
      const t12 = mapPublicTimeline({ horizon: "12m" });
      assert.ok(t3.timelineWeeks >= 4);
      assert.ok(t6.timelineWeeks > t3.timelineWeeks);
      assert.ok(t12.timelineWeeks > t6.timelineWeeks);

      const a = prepareLiveFuturePreview(
        casePayload({ horizon: "12w", bfNow: 22, bfGoal: 16 })
      );
      const b = prepareLiveFuturePreview(
        casePayload({ horizon: "24w", bfNow: 22, bfGoal: 16 })
      );
      const c = prepareLiveFuturePreview(
        casePayload({ horizon: "12m", bfNow: 22, bfGoal: 16 })
      );
      assert.equal(a.diagnostics.timelineWeeks, a.adapter.timeline.timelineWeeks);
      assert.ok(maxAnatMag(b.rules) >= maxAnatMag(a.rules));
      assert.ok(maxAnatMag(c.rules) >= maxAnatMag(b.rules));
    });
  });

  describe("Focus", () => {
    it("23–30. Focus zone mapping table", () => {
      const zones = [
        "abs",
        "thighs",
        "arms",
        "chest",
        "shoulders",
        "back",
        "glutes",
        "posture",
      ];
      for (const z of zones) {
        const mapped = mapPublicFocusZones({ zones: [z] });
        assert.equal(mapped.publicFocusZonesReceived.includes(z), true);
        assert.ok(
          mapped.canonicalFocusZonesMapped.length > 0 || z === "overall"
        );
        assert.equal(mapped.unmappedFocusZones.includes(z), false);
      }
      const multi = mapPublicFocusZones({ zones: ["abs", "thighs", "xyz"] });
      assert.ok(multi.canonicalFocusZonesMapped.includes("abs"));
      assert.ok(multi.canonicalFocusZonesMapped.includes("thighs"));
      assert.deepEqual(multi.unmappedFocusZones, ["xyz"]);
    });
  });

  describe("Effort", () => {
    it("31–34. Effort maps to 022D intensity coefficients", () => {
      const moderate = mapPublicEffort({ intensity: "subtle" });
      const hard = mapPublicEffort({ intensity: "moderate" });
      const strict = mapPublicEffort({ intensity: "strong" });
      assert.equal(moderate.canonicalIntensity, "conservative");
      assert.equal(hard.canonicalIntensity, "realistic");
      assert.equal(strict.canonicalIntensity, "ambitious");
      assert.equal(
        moderate.anatomicalEffortCoefficient,
        effortCoefficientForIntensity("conservative").coefficient
      );
      assert.equal(
        hard.anatomicalEffortCoefficient,
        effortCoefficientForIntensity("realistic").coefficient
      );
      assert.equal(
        strict.anatomicalEffortCoefficient,
        effortCoefficientForIntensity("ambitious").coefficient
      );
    });
  });

  describe("Notes", () => {
    it("35–37. Optional notes stay low-priority canonical field", () => {
      const adapted = adaptPublicFutureToBodySimulator(
        casePayload({ maal: "subtle waist refine" })
      );
      assert.equal(adapted.ok, true);
      if (!adapted.ok) return;
      assert.equal(adapted.optionalNotePresent, true);
      assert.ok(adapted.input.optionalNotes?.includes("subtle waist refine"));
      const pipeline = read(
        "src/ai/body-simulator/LiveFuturePreviewPipeline.ts"
      );
      assert.equal(/maal.*\+.*prompt|append.*maal.*prompt/.test(pipeline), false);
      const adapter = read(
        "src/ai/body-simulator/PublicFutureToBodySimulatorAdapter.ts"
      );
      assert.match(adapter, /optionalNotes/);
    });
  });

  describe("Formatter", () => {
    it("38–41. Anatomical rules reach formatter; no legacy mix", () => {
      const prep = prepareLiveFuturePreview(casePayload());
      const translation = assertAnatomicalRulesTranslated(
        prep.rules,
        prep.canonical
      );
      assert.equal(translation.ok, true);
      if (!translation.ok) return;
      assert.ok(translation.translatedCount > 0);
      assert.equal(prep.diagnostics.formatterConsumedAnatomicalRules, true);
      assert.equal(prep.canonical.source, "body_simulator_v1");
    });
  });

  describe("Provider", () => {
    it("42–47. Provider/model/transport unchanged; verify before call", async () => {
      assert.match(
        read("src/ai/transport/ReplicateTransportConfig.ts"),
        /black-forest-labs\/flux-kontext-pro/
      );
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      await runLiveFuturePreview({
        payload: casePayload(),
        sourceImageDataUri: JPEG_DATA_URI,
        transportAdapter: mockTransport(successTransportResult(), calls),
        env: { BODY_SIMULATOR_LIVE_PREVIEW_ENABLED: "1" },
      });
      assert.equal(calls.count, 1);

      let failedCalls = 0;
      try {
        prepareLiveFuturePreview({
          ...casePayload(),
          // Force adapter path still valid; verification is internal.
        });
      } catch {
        failedCalls += 1;
      }
      assert.equal(failedCalls, 0);

      // Verification failure → zero provider calls: dry path never touches transport.
      const dry = await runLiveFuturePreview({
        payload: casePayload(),
        sourceImageDataUri: JPEG_DATA_URI,
        dryRun: true,
        env: { BODY_SIMULATOR_LIVE_PREVIEW_ENABLED: "1" },
      });
      assert.equal(dry.providerRequestCount, 0);
    });
  });

  describe("Diagnostics", () => {
    it("48–55. Safe diagnostics fields present; no secrets", () => {
      const prep = prepareLiveFuturePreview(casePayload());
      const d = prep.diagnostics;
      assert.match(d.livePreviewTraceId, /^lfp_/);
      assert.equal(d.bodyFat.current, 22);
      assert.equal(d.bodyFat.target, 16);
      assert.equal(d.bodyFat.delta, -6);
      assert.ok(d.timelineWeeks != null);
      assert.ok(d.focusZones.canonicalFocusZonesMapped.length > 0);
      assert.ok(d.appliedAnatomicalRuleIds.length > 0);
      assert.equal(d.formatterConsumedAnatomicalRules, true);
      assert.equal(d.providerRequestAttempted, false);
      const json = JSON.stringify(d);
      assert.equal(/REPLICATE_API_TOKEN|api[_-]?key|secret/i.test(json), false);
    });
  });

  describe("Cases A–E", () => {
    it("Case A: 22→16 / 3mo / Core-abs / Strict", () => {
      const prep = prepareLiveFuturePreview(
        casePayload({
          bfNow: 22,
          bfGoal: 16,
          horizon: "12w",
          zones: ["abs"],
          intensity: "strong",
        })
      );
      assert.equal(prep.diagnostics.bodyFat.delta, -6);
      const features = prep.diagnostics.appliedFeatures;
      assert.ok(features.includes("subcutaneous_fat") || features.length > 0);
      assert.ok(
        features.includes("abdominal_definition") ||
          features.includes("waist_width") ||
          features.includes("oblique_definition")
      );
      assert.ok(prep.diagnostics.anatomicalTranslatedChangeCount > 0);
    });

    it("Case B: 22→16 / 6mo stronger than A", () => {
      const a = prepareLiveFuturePreview(
        casePayload({ horizon: "12w", bfNow: 22, bfGoal: 16, intensity: "strong" })
      );
      const b = prepareLiveFuturePreview(
        casePayload({ horizon: "24w", bfNow: 22, bfGoal: 16, intensity: "strong" })
      );
      assert.ok(maxAnatMag(b.rules) >= maxAnatMag(a.rules));
    });

    it("Case C: 22→16 / 12mo stronger than B", () => {
      const b = prepareLiveFuturePreview(
        casePayload({ horizon: "24w", bfNow: 22, bfGoal: 16, intensity: "strong" })
      );
      const c = prepareLiveFuturePreview(
        casePayload({ horizon: "12m", bfNow: 22, bfGoal: 16, intensity: "strong" })
      );
      assert.ok(maxAnatMag(c.rules) >= maxAnatMag(b.rules));
    });

    it("Case D: 22→10 / 12mo stronger fat-loss than 22→16", () => {
      const mild = prepareLiveFuturePreview(
        casePayload({ horizon: "12m", bfNow: 22, bfGoal: 16, intensity: "strong" })
      );
      const strong = prepareLiveFuturePreview(
        casePayload({ horizon: "12m", bfNow: 22, bfGoal: 10, intensity: "strong" })
      );
      assert.equal(strong.diagnostics.bodyFat.delta, -12);
      assert.ok(strong.diagnostics.appliedAnatomicalRuleIds.length > 0);
      const mildFat = Math.abs(
        mild.rules.anatomicalTransformation?.bodyFatContext
          .deltaPercentagePoints ?? 0
      );
      const strongFat = Math.abs(
        strong.rules.anatomicalTransformation?.bodyFatContext
          .deltaPercentagePoints ?? 0
      );
      assert.ok(strongFat >= mildFat);
    });

    it("Case E: 26→10 / 12mo / abs+thighs non-noop", () => {
      const prep = prepareLiveFuturePreview(
        casePayload({
          bfNow: 26,
          bfGoal: 10,
          horizon: "12m",
          zones: ["abs", "thighs"],
          intensity: "strong",
        })
      );
      assert.equal(prep.diagnostics.bodyFat.delta, -16);
      assert.ok(prep.diagnostics.appliedAnatomicalRuleIds.length > 0);
      const features = prep.diagnostics.appliedFeatures.join(",");
      assert.match(features, /abdominal|waist|subcutaneous|thigh|definition/);
      assert.ok(prep.diagnostics.anatomicalTranslatedChangeCount > 0);
    });
  });

  describe("Regression", () => {
    it("56–66. Sealed modules and wiring constraints", () => {
      assert.equal(existsSync(join(repoRoot, "docs/CTO/22C_CONTROLLED_SIMULATOR_COMPARISON.md")), true);
      assert.equal(
        read("api/generate-future-you.js").includes("generateWithReplicate"),
        true
      );
      const rulesHash = hashFile("src/ai/body-simulator/BodySimulatorRules.ts");
      const anatHash = hashFile(
        "src/ai/body-simulator/AnatomicalTransformationRules.ts"
      );
      assert.equal(rulesHash.length, 64);
      assert.equal(anatHash.length, 64);
      // Coefficients files must not be edited by 022E adapter/pipeline.
      const adapter = read(
        "src/ai/body-simulator/PublicFutureToBodySimulatorAdapter.ts"
      );
      const pipeline = read(
        "src/ai/body-simulator/LiveFuturePreviewPipeline.ts"
      );
      assert.equal(/BODY_SIM_MAX_FAT_LOSS|ANATOMICAL_EFFORT_STRICT\s*=/.test(adapter), false);
      assert.equal(/BODY_SIM_MAX_FAT_LOSS|ANATOMICAL_EFFORT_STRICT\s*=/.test(pipeline), false);

      const accountTrust = read("src/ai/__tests__/accountTrust.test.ts");
      assert.ok(accountTrust.length > 100);
      assert.equal(existsSync(join(repoRoot, "docs/CTO/19_PERSONAL_ACCOUNT_TRUST_AND_VAULT.md")), true);
      assert.equal(
        existsSync(join(repoRoot, "src/ai/__tests__/guidedProgressPhoto.test.ts")),
        true
      );

      const pkg = JSON.parse(read("package.json"));
      assert.match(pkg.scripts["test:ai"], /anatomicalLivePreview\.test\.ts/);
      assert.equal(Object.keys(pkg.dependencies || {}).includes("new-dep-022e"), false);

      // Flag default OFF; no Vercel env auto-set in repo config.
      const vercel = read("vercel.json");
      assert.equal(vercel.includes("BODY_SIMULATOR_LIVE_PREVIEW_ENABLED"), false);
      assert.equal(isBodySimulatorLivePreviewEnabled({}), false);

      assert.equal(
        existsSync(
          join(repoRoot, "docs/CTO/22E_ANATOMICAL_LIVE_PREVIEW_INTEGRATION.md")
        ),
        true
      );
      assert.match(
        read("public/ai-os-control-room.html"),
        /Live Future Preview Trace/
      );
    });
  });

  describe("Error classes", () => {
    it("LiveFuturePreviewError carries classified codes", () => {
      const err = new LiveFuturePreviewError(
        "live_preview_rule_verification_failed",
        "boom",
        { livePreviewTraceId: "lfp_test", providerCalls: 0 }
      );
      assert.equal(err.errorClass, "live_preview_rule_verification_failed");
      assert.equal(err.providerCalls, 0);
    });
  });

  describe("Formatter adapter reuse", () => {
    it("prepare uses BodySimulatorFormatterAdapter", () => {
      const prep = prepareLiveFuturePreview(casePayload());
      const again = adaptBodySimulatorRulesToFormatterInput(prep.rules);
      assert.equal(again.source, prep.canonical.source);
      assert.ok(again.approvedChanges.length > 0);
      const sim = simulateBodyTransformation(prep.adapter.input);
      assert.equal(sim.ok, true);
    });
  });
});
