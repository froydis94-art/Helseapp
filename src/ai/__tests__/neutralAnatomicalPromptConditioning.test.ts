/**
 * Patch 022E-B — Neutral Anatomical Prompt Conditioning tests (1–28).
 *
 * No real network. No paid provider calls.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import {
  BODY_SIMULATOR_LIVE_PREVIEW_ENV,
  CLOTHING_COVERAGE_PRESERVATION_PHRASE,
  adaptBodySimulatorRulesToFormatterInput,
  conditionAnatomicalProviderPrompt,
  conditionOptionalNoteForProvider,
  effortCoefficientForIntensity,
  isBodySimulatorLivePreviewEnabled,
  measureProviderPromptDiagnostics,
  prepareLiveFuturePreview,
  runLiveFuturePreview,
  sha256FileBytes,
} from "../body-simulator";
import { AiOsRuntime, createAiOsRuntimeDependencies } from "../runtime";
import { BODY_PROFILE_SCHEMA_VERSION } from "../BodyProfile";
import { TRANSFORMATION_GOAL_SCHEMA_VERSION } from "../TransformationGoal";
import type {
  ReplicateTransportAdapter,
  ReplicateTransportInput,
  ReplicateTransportResult,
} from "../transport";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const requireFromTest = createRequire(import.meta.url);
const legacyVisuell = requireFromTest("../../../lib/visuellPrompt.js") as {
  byggVisuellPrompt: (opts: Record<string, unknown>) => { prompt: string };
};

const JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";
const JPEG_DATA_URI = `data:image/jpeg;base64,${JPEG_B64}`;

const RULES_HASH = createHash("sha256")
  .update(readFileSync(join(repoRoot, "src/ai/body-simulator/BodySimulatorRules.ts")))
  .digest("hex");
const ANAT_RULES_HASH = createHash("sha256")
  .update(
    readFileSync(
      join(repoRoot, "src/ai/body-simulator/AnatomicalTransformationRules.ts")
    )
  )
  .digest("hex");

function casePayload(overrides: Record<string, unknown> = {}) {
  return {
    maal: "",
    intensity: "strong",
    horizon: "12m",
    zones: ["abs", "thighs"],
    fat: "decrease",
    muscle: "toned",
    bfNow: 22,
    bfGoal: 10,
    gender: "female",
    heightCm: 170,
    weightKg: 70,
    ...overrides,
  };
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
    predictionId: "pred-022eb-test",
    model: "black-forest-labs/flux-kontext-pro",
    status: "succeeded",
    imageUrl: "https://cdn.example.com/out/live-preview.png",
    generationTimeMs: 12,
    warnings: [],
    metadata: {
      traceId: "trace-022eb",
      formatterName: "FluxFormatter",
      formatterVersion: "1.0",
      pollingAttempts: 1,
      providerStatus: "succeeded",
    },
  };
}

async function formatRawAnatomicalPrompt(payload: Record<string, unknown> = {}) {
  const prep = prepareLiveFuturePreview(casePayload(payload), {
    nowMs: 1_700_000_000_000,
    livePreviewTraceId: "lfp_022eb_format",
    simulationId: "lfp022ebformat01",
  });
  const bf = prep.diagnostics.bodyFat;
  const runtime = new AiOsRuntime(
    createAiOsRuntimeDependencies({
      now: () => 1_700_000_000_000,
    })
  );
  const formatResult = await runtime.run({
    mode: "dry_run",
    profile: {
      schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
      sex: "female",
      age: 30,
      heightCm: 170,
      weightKg: 70,
      bodyFatPct: bf.current ?? 22,
      trainingLevel: "intermediate",
      trainingAgeYears: 2,
      activityLevel: "moderate",
      nutritionQuality: "good",
    } as never,
    goal: {
      schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
      fatDirection: "decrease",
      muscleDirection: "increase",
      ...(bf.target != null ? { targetBodyFatPct: bf.target } : {}),
      timelineWeeks: prep.diagnostics.timelineWeeks ?? 12,
      effortLevel: "high",
      focusZones: ["waist"],
      musclePriority: 0.5,
      fatLossPriority: 0.7,
      outcomes: ["fat_loss"],
    } as never,
    canonicalBodyTransformation: prep.canonical,
    formatterOptions: { quality: "standard" },
  });
  assert.equal(formatResult.success, true);
  const prompt =
    typeof formatResult.artifacts.formattedRequest?.prompt === "string"
      ? formatResult.artifacts.formattedRequest.prompt
      : "";
  assert.ok(prompt.length > 0, "raw anatomical formatter prompt missing");
  return { prep, prompt };
}

describe("neutralAnatomicalPromptConditioning — PATCH_022E_B", () => {
  describe("PART 1 inspect legacy vs anatomical", () => {
    it("documents exact length/term differences (no guess)", async () => {
      const legacy = legacyVisuell.byggVisuellPrompt({
        horizon: "12m",
        fat: "decrease",
        muscle: "toned",
        zones: ["abs", "thighs"],
        bfNow: 22,
        bfGoal: 10,
      });
      const { prompt: anatomicalRaw } = await formatRawAnatomicalPrompt();
      const legacyMetrics = measureProviderPromptDiagnostics(legacy.prompt);
      const anatMetrics = measureProviderPromptDiagnostics(anatomicalRaw);

      assert.ok(anatomicalRaw.length > 0);
      assert.ok(legacy.prompt.length > 0);
      // Documented characteristic: anatomical FluxFormatter path is longer
      // and repeats Preserve / anatomical feature phrases more than slim legacy.
      assert.ok(
        anatMetrics.providerPromptCharacterCount >
          legacyMetrics.providerPromptCharacterCount
      );
      assert.ok(
        anatMetrics.providerPromptPreservationTermCount >=
          legacyMetrics.providerPromptPreservationTermCount
      );
      assert.match(legacy.prompt, /clothing/i);
      assert.match(anatomicalRaw, /Preserve/i);
      assert.match(anatomicalRaw, /anatomical|subcutaneous|abdomen|abdominal/i);
    });
  });

  describe("Canonical unchanged (1–5)", () => {
    it("1–5. Canonical anatomy, BF delta, timeline, focus, muscle rules unchanged", async () => {
      assert.equal(
        sha256FileBytes(
          readFileSync(
            join(repoRoot, "src/ai/body-simulator/BodySimulatorRules.ts")
          )
        ),
        RULES_HASH
      );
      assert.equal(
        sha256FileBytes(
          readFileSync(
            join(
              repoRoot,
              "src/ai/body-simulator/AnatomicalTransformationRules.ts"
            )
          )
        ),
        ANAT_RULES_HASH
      );

      const prep = prepareLiveFuturePreview(casePayload(), {
        nowMs: 1_700_000_000_111,
        simulationId: "lfp022ebcanon01",
      });
      const rulesBefore = structuredClone(prep.rules);
      const { prompt } = await formatRawAnatomicalPrompt();
      const conditioned = conditionAnatomicalProviderPrompt({
        formattedPrompt: prompt,
        canonical: prep.canonical,
        anatomicalRules: prep.rules.anatomicalTransformation?.rules ?? [],
        optionalNotes: prep.adapter.input.optionalNotes ?? [],
      });

      assert.deepEqual(prep.rules, rulesBefore);
      assert.equal(prep.diagnostics.bodyFat.delta, -12);
      assert.ok((prep.diagnostics.timelineWeeks ?? 0) >= 40);
      assert.ok(prep.diagnostics.focusZones.canonicalFocusZonesMapped.includes("abs"));
      assert.ok(
        prep.diagnostics.focusZones.canonicalFocusZonesMapped.includes("thighs")
      );
      assert.ok(
        (prep.rules.anatomicalTransformation?.rules ?? []).some(
          (r) =>
            r.feature === "whole_body_muscle_volume" ||
            r.feature.endsWith("_volume") ||
            r.feature.includes("definition")
        )
      );
      assert.equal(
        effortCoefficientForIntensity("ambitious").coefficient,
        1
      );
      assert.ok(conditioned.conditionedPrompt.length > 0);
      // Adapter translation still matches pre-conditioning canonical.
      const again = adaptBodySimulatorRulesToFormatterInput(prep.rules);
      assert.deepEqual(
        again.approvedChanges.map((c) => c.id),
        prep.canonical.approvedChanges.map((c) => c.id)
      );
    });
  });

  describe("Provider prompt conditioning (6–23)", () => {
    it("6–8. Shorter/equal prompt; duplicates merged; preservation not repeated", async () => {
      const { prep, prompt } = await formatRawAnatomicalPrompt();
      const conditioned = conditionAnatomicalProviderPrompt({
        formattedPrompt: prompt,
        canonical: prep.canonical,
        anatomicalRules: prep.rules.anatomicalTransformation?.rules ?? [],
      });
      assert.ok(
        conditioned.diagnostics.providerPromptCharacterCount <=
          conditioned.diagnostics.originalProviderPromptCharacterCount
      );
      assert.ok(
        conditioned.diagnostics.removedReplacedTokenCategories.includes(
          "midsection_merged"
        ) ||
          conditioned.diagnostics.removedReplacedTokenCategories.includes(
            "midsection_duplicates_merged"
          ) ||
          /midsection/i.test(conditioned.conditionedPrompt)
      );
      const preserveHits = (
        conditioned.conditionedPrompt.match(/\bPreserve\b/gi) || []
      ).length;
      assert.ok(preserveHits <= 2);
      const clothingHits = (
        conditioned.conditionedPrompt.match(/clothing and coverage/gi) || []
      ).length;
      assert.equal(clothingHits, 1);
    });

    it("9–16. Sensitive lexemes not emitted", async () => {
      const { prep, prompt } = await formatRawAnatomicalPrompt({
        maal: "more sexy erotic sensual lingerie underwear breasts buttocks groin",
      });
      // Canonical note remains stored.
      assert.ok(
        (prep.adapter.input.optionalNotes ?? []).some((n) => /sexy/i.test(n))
      );
      const conditioned = conditionAnatomicalProviderPrompt({
        formattedPrompt: `${prompt}\nDo not make the underwear sexual or expose groin or breasts.`,
        canonical: prep.canonical,
        anatomicalRules: prep.rules.anatomicalTransformation?.rules ?? [],
        optionalNotes: prep.adapter.input.optionalNotes ?? [],
      });
      const p = conditioned.conditionedPrompt.toLowerCase();
      for (const term of [
        "underwear",
        "lingerie",
        "groin",
        "breasts",
        "buttocks",
        "sexy",
        "erotic",
        "sensual",
      ]) {
        assert.equal(
          new RegExp(`\\b${term}\\b`, "i").test(p),
          false,
          `unexpected lexeme: ${term}`
        );
      }
      assert.equal(conditioned.diagnostics.providerPromptSensitiveLexemeCount, 0);
      assert.ok(conditioned.diagnostics.providerPromptLexemeSuppressed.length > 0);
    });

    it("17–18. Optional notes neutralized / sexualized suppressed", () => {
      const abs = conditionOptionalNoteForProvider("defined abs");
      assert.equal(abs.disposition, "neutralized");
      assert.equal(abs.providerText, "increase natural abdominal definition");

      const sexy = conditionOptionalNoteForProvider("more sexy");
      assert.equal(sexy.disposition, "suppressed");
      assert.equal(sexy.providerText, null);
      assert.ok(
        sexy.suppressions.some((s) => s.term === "sexy")
      );
    });

    it("19–23. Meaningful anatomy + clothing/identity/pose preservation", async () => {
      const { prep, prompt } = await formatRawAnatomicalPrompt();
      const conditioned = conditionAnatomicalProviderPrompt({
        formattedPrompt: prompt,
        canonical: prep.canonical,
        anatomicalRules: prep.rules.anatomicalTransformation?.rules ?? [],
        optionalNotes: ["defined abs"],
      });
      const p = conditioned.conditionedPrompt;
      assert.match(p, /midsection|abdominal/i);
      assert.match(p, /thigh/i);
      assert.match(p, new RegExp(CLOTHING_COVERAGE_PRESERVATION_PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(p, /identity|same adult person/i);
      assert.match(p, /pose/i);
      assert.match(p, /lighting/i);
      assert.match(p, /background/i);
      assert.equal(conditioned.diagnostics.neutralPromptConditioningApplied, true);
    });
  });

  describe("Live path wiring (24–28)", () => {
    it("24–26. Provider/model unchanged; one request; no auto-retry", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const result = await runLiveFuturePreview({
        payload: casePayload({ maal: "defined abs" }),
        sourceImageDataUri: JPEG_DATA_URI,
        transportAdapter: mockTransport(successTransportResult(), calls),
        env: { [BODY_SIMULATOR_LIVE_PREVIEW_ENV]: "1" },
      });
      assert.equal(calls.count, 1);
      assert.equal(result.providerRequestCount, 1);
      assert.equal(result.model, "black-forest-labs/flux-kontext-pro");
      assert.equal(
        result.livePreviewDiagnostics.neutralPromptConditioningApplied,
        true
      );
      assert.equal(
        result.livePreviewDiagnostics.providerPromptSensitiveLexemeCount,
        0
      );
      const sent = calls.inputs[0]?.formattedRequest?.prompt ?? "";
      assert.match(sent, /abdominal|midsection/i);
      assert.equal(/\b(underwear|sexy|erotic|lingerie)\b/i.test(sent), false);
      assert.match(sent, /clothing and coverage/i);

      const pipeline = readFileSync(
        join(repoRoot, "src/ai/body-simulator/LiveFuturePreviewPipeline.ts"),
        "utf8"
      );
      assert.equal(/autoRetry|retry_required/.test(pipeline), false);
    });

    it("27–28. Feature flag OFF preserves legacy path; ON enables conditioning", () => {
      assert.equal(isBodySimulatorLivePreviewEnabled({}), false);
      assert.equal(
        isBodySimulatorLivePreviewEnabled({
          BODY_SIMULATOR_LIVE_PREVIEW_ENABLED: "0",
        }),
        false
      );
      assert.equal(
        isBodySimulatorLivePreviewEnabled({
          [BODY_SIMULATOR_LIVE_PREVIEW_ENV]: "1",
        }),
        true
      );
      const route = readFileSync(
        join(repoRoot, "api/generate-future-you.js"),
        "utf8"
      );
      assert.match(route, /generateWithReplicate/);
      assert.match(route, /BODY_SIMULATOR_LIVE_PREVIEW_ENABLED[\s\S]*=== \"1\"/);
      // Conditioner is live-path only — not imported by legacy replicate builders.
      const replicate = readFileSync(join(repoRoot, "lib/replicate.js"), "utf8");
      assert.equal(
        /NeutralAnatomicalPromptConditioner/.test(replicate),
        false
      );
    });
  });

  describe("Policy regression", () => {
    it("does not ban underwear or add sexual classifiers in conditioner", () => {
      const src = readFileSync(
        join(
          repoRoot,
          "src/ai/body-simulator/NeutralAnatomicalPromptConditioner.ts"
        ),
        "utf8"
      );
      assert.equal(/clothing morality|exposure classifier|sexual.?intent/i.test(src), false);
      assert.equal(/prohibit.*underwear|ban.*underwear/i.test(src), false);
      // Guard list may include the token for provider text scrubbing only.
      assert.match(src, /provider_false_positive_risk/);
    });
  });
});
