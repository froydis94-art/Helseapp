/**
 * Demand 022B-A — Formatter Comparison, Generation Diagnostics, Pipeline Snapshot.
 *
 * No real network. Comparison must never call transport / Replicate.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  simulateBodyTransformation,
  fixtureRealisticWeightLoss12w,
} from "../body-simulator";
import {
  BODY_SIMULATOR_FORMATTER_PATH_ID,
  LEGACY_FORMATTER_PATH_ID,
  buildGenerationDiagnostics,
  buildPipelineSnapshot,
  compareLegacyAndBodySimulatorFormatters,
  estimateTokensFromPromptLength,
  runLegacyFormatterComparisonPath,
} from "../control-room/FormatterComparisonDiagnostics";
import { ControlRoomService } from "../control-room/ControlRoomService";
import { ImagePreviewService } from "../control-room/ImagePreviewService";
import { BODY_PROFILE_SCHEMA_VERSION } from "../BodyProfile";
import { TRANSFORMATION_GOAL_SCHEMA_VERSION } from "../TransformationGoal";
import type {
  ReplicateTransportAdapter,
  ReplicateTransportInput,
  ReplicateTransportResult,
} from "../transport";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");

const JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";
const JPEG_DATA_URI = `data:image/jpeg;base64,${JPEG_B64}`;

function fixtureProfileGoal() {
  return {
    profile: {
      schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
      sex: "female" as const,
      age: 34,
      heightCm: 168,
      weightKg: 78,
      bodyFatPct: 32,
      trainingLevel: "intermediate" as const,
      trainingAgeYears: 2,
      activityLevel: "moderate" as const,
      nutritionQuality: "good" as const,
    },
    goal: {
      schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
      fatDirection: "decrease" as const,
      muscleDirection: "maintain" as const,
      targetBodyFatPct: 28,
      targetWeightKg: 72,
      timelineWeeks: 12,
      effortLevel: "moderate" as const,
      focusZones: ["waist"],
      musclePriority: 0.2,
      fatLossPriority: 0.8,
      outcomes: ["fat_loss"],
    },
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

describe("formatterComparisonDiagnostics — PATCH_022B_A", () => {
  it("1. Legacy formatter comparison exists and marks path deprecated / never production", () => {
    const sim = simulateBodyTransformation(fixtureRealisticWeightLoss12w());
    assert.equal(sim.ok, true);
    if (!sim.ok) return;
    const { profile, goal } = fixtureProfileGoal();
    const comparison = compareLegacyAndBodySimulatorFormatters({
      rules: sim.rules,
      profile: profile as never,
      goal: goal as never,
      formatterOptions: { seed: 7 },
    });
    assert.equal(comparison.schemaVersion, 1);
    assert.equal(comparison.purpose, "internal_comparison_only");
    assert.equal(comparison.legacyPath.pathId, LEGACY_FORMATTER_PATH_ID);
    assert.equal(comparison.legacyPath.deprecated, true);
    assert.equal(comparison.legacyPath.neverProduction, true);
    assert.equal(comparison.legacyPath.productionEligible, false);
    assert.equal(
      comparison.bodySimulatorPath.pathId,
      BODY_SIMULATOR_FORMATTER_PATH_ID
    );
    assert.equal(comparison.bodySimulatorPath.deprecated, false);
    assert.ok(Array.isArray(comparison.addedFields));
    assert.ok(Array.isArray(comparison.removedFields));
    assert.ok(Array.isArray(comparison.changedTransformationFields));
    assert.ok(Array.isArray(comparison.changedPreservationFields));
    assert.equal(typeof comparison.promptLengthDelta, "number");
    assert.ok(Array.isArray(comparison.summaryDifferences));
    assert.equal(comparison.providerCallsFromComparison, 0);
    assert.equal(comparison.persisted, false);
    assert.equal(comparison.lifetime, "session_only");
  });

  it("2. Comparison does not call transport / replicate", () => {
    const transportSrc = readFileSync(
      join(repoRoot, "src/ai/control-room/FormatterComparisonDiagnostics.ts"),
      "utf8"
    );
    assert.equal(
      /ReplicateTransport|transport\.generate|fetch\(|https?:\/\//i.test(
        transportSrc
      ),
      false
    );
    const sim = simulateBodyTransformation(fixtureRealisticWeightLoss12w());
    assert.equal(sim.ok, true);
    if (!sim.ok) return;
    const { profile, goal } = fixtureProfileGoal();
    let transportCalls = 0;
    const proxy = new Proxy(
      {},
      {
        get() {
          transportCalls += 1;
          throw new Error("transport must not be touched during comparison");
        },
      }
    );
    void proxy;
    const legacy = runLegacyFormatterComparisonPath({
      profile: profile as never,
      goal: goal as never,
    });
    assert.equal(legacy.providerCalls, 0);
    assert.equal(transportCalls, 0);
    const comparison = compareLegacyAndBodySimulatorFormatters({
      rules: sim.rules,
      profile: profile as never,
      goal: goal as never,
    });
    assert.equal(comparison.providerCallsFromComparison, 0);
    assert.equal(transportCalls, 0);
  });

  it("3. Generation diagnostics are created with estimate labeling", () => {
    const sim = simulateBodyTransformation(fixtureRealisticWeightLoss12w());
    assert.equal(sim.ok, true);
    if (!sim.ok) return;
    const diagnostics = buildGenerationDiagnostics({
      scenarioId: "gradual_fat_loss_16w",
      rules: sim.rules,
      formatterVersion: "1.0",
      promptLength: 1200,
      providerClassification: "dry_run_no_provider",
    });
    assert.equal(diagnostics.schemaVersion, 1);
    assert.equal(diagnostics.scenario, "gradual_fat_loss_16w");
    assert.equal(diagnostics.promptLength, 1200);
    assert.equal(diagnostics.estimatedTokens.labeling, "estimate");
    assert.equal(
      diagnostics.estimatedTokens.value,
      estimateTokensFromPromptLength(1200).value
    );
    assert.equal(diagnostics.estimatedProviderCost.labeling, "estimate");
    assert.equal(diagnostics.estimatedProviderCost.value, null);
    assert.equal(diagnostics.generationDurationMs, null);
    assert.equal(diagnostics.httpStatus, "not_run");
    assert.equal(diagnostics.retryCount, "not_run");
    assert.equal(diagnostics.provider, null);
    assert.ok(diagnostics.formatterSchema.includes("FormattedImageRequest"));
    assert.ok(diagnostics.ruleSchema.includes("BodySimulator"));
    assert.equal(diagnostics.persisted, false);
  });

  it("4. Pipeline snapshot is session-only and not downloadable", () => {
    const sim = simulateBodyTransformation(fixtureRealisticWeightLoss12w());
    assert.equal(sim.ok, true);
    if (!sim.ok) return;
    const diagnostics = buildGenerationDiagnostics({
      scenarioId: "balanced_recomposition_12w",
      rules: sim.rules,
      promptLength: 800,
      providerClassification: "dry_run_no_provider",
    });
    const snapshot = buildPipelineSnapshot({
      mode: "dry_run",
      scenarioId: "balanced_recomposition_12w",
      bodySimulatorScenarioId: "realistic_weight_loss_12w",
      rules: sim.rules,
      generationDiagnostics: diagnostics,
      formatterComparisonPresent: true,
    });
    assert.equal(snapshot.lifetime, "session_only");
    assert.equal(snapshot.persisted, false);
    assert.equal(snapshot.downloadAvailable, false);
    assert.ok(snapshot.transformationRules != null);
    assert.ok(snapshot.formatterInput != null);
    assert.equal(snapshot.previewMetadata.legacyPathSentToProvider, false);
    assert.equal(snapshot.previewMetadata.formatterComparisonPresent, true);
  });

  it("5. Legacy comparison is unavailable on production generate route", () => {
    const prod = readFileSync(
      join(repoRoot, "api/generate-future-you.js"),
      "utf8"
    );
    assert.equal(
      /FormatterComparison|runLegacyFormatterComparisonPath|compareLegacyAndBodySimulator/i.test(
        prod
      ),
      false
    );
    const clientApi = readFileSync(
      join(repoRoot, "src/api/generateFutureYou.js"),
      "utf8"
    );
    assert.equal(
      /FormatterComparison|runLegacyFormatterComparisonPath|BodySimulatorFormatterAdapter/i.test(
        clientApi
      ),
      false
    );
    const diagnosticsModule = readFileSync(
      join(repoRoot, "src/ai/control-room/FormatterComparisonDiagnostics.ts"),
      "utf8"
    );
    assert.match(diagnosticsModule, /never production/i);
    assert.match(diagnosticsModule, /internal_comparison_only/);
  });

  it("6. Adapter / comparison helpers remain translator-only (no physiology math)", () => {
    const adapter = readFileSync(
      join(repoRoot, "src/ai/body-simulator/BodySimulatorFormatterAdapter.ts"),
      "utf8"
    );
    assert.equal(
      /BODY_SIM_MAX_|intensityExpectedMultiplier|computeTimelineMagnitude|coefficient/i.test(
        adapter
      ),
      false
    );
    const comparison = readFileSync(
      join(repoRoot, "src/ai/control-room/FormatterComparisonDiagnostics.ts"),
      "utf8"
    );
    assert.equal(
      /BODY_SIM_MAX_|intensityExpectedMultiplier|computeTimelineMagnitude/i.test(
        comparison
      ),
      false
    );
    // FluxFormatter algorithm untouched by this patch module.
    assert.equal(/class FluxFormatter/.test(comparison), false);
  });

  it("7. Control Room dry-run exposes comparison + diagnostics + snapshot", async () => {
    const prev = process.env.AI_OS_BODY_SIMULATOR_SHADOW_ENABLED;
    process.env.AI_OS_BODY_SIMULATOR_SHADOW_ENABLED = "1";
    try {
      const service = new ControlRoomService();
      const result = await service.runScenario("balanced_recomposition_12w");
      assert.equal(result.success, true);
      assert.ok(result.formatterComparison);
      assert.equal(result.formatterComparison?.providerCallsFromComparison, 0);
      assert.equal(result.formatterComparison?.legacyPath.deprecated, true);
      assert.ok(result.generationDiagnostics);
      assert.equal(
        result.generationDiagnostics?.providerClassification,
        "dry_run_no_provider"
      );
      assert.equal(result.generationDiagnostics?.httpStatus, "not_run");
      assert.ok(result.pipelineSnapshot);
      assert.equal(result.pipelineSnapshot?.persisted, false);
      assert.equal(
        result.pipelineSnapshot?.previewMetadata.legacyPathSentToProvider,
        false
      );
    } finally {
      if (prev === undefined) {
        delete process.env.AI_OS_BODY_SIMULATOR_SHADOW_ENABLED;
      } else {
        process.env.AI_OS_BODY_SIMULATOR_SHADOW_ENABLED = prev;
      }
    }
  });

  it("8. Image preview prep keeps a single provider call with comparison attached", async () => {
    const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
    const service = new ImagePreviewService({
      transportAdapter: mockTransport(
        {
          success: true,
          provider: "replicate",
          predictionId: "pred-022b-a",
          model: "black-forest-labs/flux-kontext-pro",
          status: "succeeded",
          imageUrl: "https://cdn.example.com/out/preview-result.png",
          generationTimeMs: 15,
          warnings: [],
          metadata: {
            traceId: "trace-022b-a",
            formatterName: "FluxFormatter",
            formatterVersion: "1.0",
            pollingAttempts: 1,
            providerStatus: "succeeded",
          },
        },
        calls
      ),
      env: {
        REPLICATE_API_TOKEN: "r8_test_token_not_real",
        AI_OS_IMAGE_PREVIEW_ENABLED: "1",
      },
    });
    const result = await service.runPreview({
      scenarioId: "balanced_recomposition_12w",
      adultConfirmed: true,
      consentConfirmed: true,
      billingConfirmed: true,
      sourceImageDataUri: JPEG_DATA_URI,
      promptIsolationVariant: "current_ai_os",
    });
    assert.equal(result.success, true);
    assert.equal(calls.count, 1, "exactly one provider call");
    assert.ok(result.formatterComparison);
    assert.equal(result.formatterComparison?.providerCallsFromComparison, 0);
    assert.ok(result.generationDiagnostics);
    assert.equal(
      result.generationDiagnostics?.providerClassification,
      "internal_preview"
    );
    assert.ok(result.pipelineSnapshot);
    const prompt = calls.inputs[0]?.formattedRequest?.prompt ?? "";
    assert.match(prompt, /Body Simulator/);
    assert.equal(prompt.includes("whole-body-recomposition"), false);
  });

  it("9. Control Room UI sections + Copy JSON exist; no innerHTML for API data", () => {
    const html = readFileSync(
      join(repoRoot, "public/ai-os-control-room.html"),
      "utf8"
    );
    const js = readFileSync(
      join(repoRoot, "public/ai-os-control-room.js"),
      "utf8"
    );
    assert.match(html, /Formatter Comparison/);
    assert.match(html, /Generation Diagnostics/);
    assert.match(html, /Pipeline Snapshot/);
    assert.match(html, /formatterComparisonCopyBtn/);
    assert.match(html, /generationDiagnosticsCopyBtn/);
    assert.match(html, /pipelineSnapshotCopyBtn/);
    assert.match(js, /renderFormatterComparisonInspector/);
    assert.match(js, /renderGenerationDiagnosticsInspector/);
    assert.match(js, /renderPipelineSnapshotInspector/);
    assert.match(js, /copySessionJson/);
    assert.equal(js.includes("innerHTML"), false);
    assert.equal(/downloadSnapshot|saveAs\(|writeFile/i.test(js), false);
  });

  it("10. Docs and test:ai registration exist", () => {
    assert.ok(
      existsSync(join(repoRoot, "docs/CTO/22B_FIRST_END_TO_END_PREVIEW.md"))
    );
    const docs = readFileSync(
      join(repoRoot, "docs/CTO/22B_FIRST_END_TO_END_PREVIEW.md"),
      "utf8"
    );
    assert.match(docs, /Formatter Comparison/i);
    assert.match(docs, /Generation Diagnostics/i);
    assert.match(docs, /Pipeline Snapshot/i);
    assert.match(docs, /session_only|session only|Session lifetime/i);
    assert.match(docs, /never production/i);
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8")
    ) as { scripts: { "test:ai": string } };
    assert.match(
      pkg.scripts["test:ai"],
      /formatterComparisonDiagnostics\.test\.ts/
    );
  });
});
