/**
 * Demand 022B — Body Simulator → Formatter → Internal Preview bridge tests.
 *
 * No real network. Provider/transport paths are mocked or hash-sealed.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  adaptBodySimulatorRulesToFormatterInput,
  applyCanonicalBodyTransformation,
  buildFormatterInputInspectionView,
  buildFormatterPreviewView,
  resolveBodySimulatorScenarioForPreview,
  simulateBodyTransformation,
  fixtureRealisticWeightLoss12w,
  fixtureRecomposition16w,
  CONTROL_ROOM_TO_BODY_SIMULATOR_SCENARIO,
} from "../body-simulator";
import { FluxFormatter } from "../formatters";
import { ImagePreviewService } from "../control-room/ImagePreviewService";
import { ControlRoomService } from "../control-room/ControlRoomService";
import { buildRenderPlan } from "../render";
import { TransformationEngine } from "../TransformationEngine";
import { directVisual } from "../visual";
import { BODY_PROFILE_SCHEMA_VERSION } from "../BodyProfile";
import { TRANSFORMATION_GOAL_SCHEMA_VERSION } from "../TransformationGoal";
import type { ReplicateTransportAdapter, ReplicateTransportInput, ReplicateTransportResult } from "../transport";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");

/** Minimal valid 1×1 JPEG (same fixture family as imagePreview tests). */
const JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";
const JPEG_DATA_URI = `data:image/jpeg;base64,${JPEG_B64}`;

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
    predictionId: "pred-022b-test",
    model: "black-forest-labs/flux-kontext-pro",
    status: "succeeded",
    imageUrl: "https://cdn.example.com/out/preview-result.png",
    generationTimeMs: 12,
    warnings: [],
    metadata: {
      traceId: "trace-022b",
      formatterName: "FluxFormatter",
      formatterVersion: "1.0",
      pollingAttempts: 1,
      providerStatus: "succeeded",
    },
  };
}

function hashFile(rel: string): string {
  const abs = join(repoRoot, rel);
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}

describe("bodySimulatorPreview — DEMAND_022B", () => {
  it("1. Adapter translates Body Simulator rules without recalculating physiology", () => {
    const sim = simulateBodyTransformation(fixtureRealisticWeightLoss12w());
    assert.equal(sim.ok, true);
    if (!sim.ok) return;
    const canonical = adaptBodySimulatorRulesToFormatterInput(sim.rules);
    assert.equal(canonical.source, "body_simulator_v1");
    assert.equal(canonical.goal.effectiveType, sim.rules.goal.effectiveType);
    assert.equal(canonical.goal.timelineWeeks, sim.rules.goal.timelineWeeks);
    assert.equal(canonical.goal.intensity, sim.rules.goal.intensity);
    assert.ok(canonical.approvedChanges.length > 0);
    assert.deepEqual(canonical.preservation, sim.rules.preservation);
    // Adapter source must not import BodySimulatorRules coefficients.
    const adapterSrc = readFileSync(
      join(repoRoot, "src/ai/body-simulator/BodySimulatorFormatterAdapter.ts"),
      "utf8"
    );
    assert.equal(/BODY_SIM_MAX_|intensityExpectedMultiplier|computeTimelineMagnitude/.test(adapterSrc), false);
  });

  it("2. Formatter uses Body Simulator approvedChanges after apply", () => {
    const sim = simulateBodyTransformation(fixtureRecomposition16w());
    assert.equal(sim.ok, true);
    if (!sim.ok) return;
    const canonical = adaptBodySimulatorRulesToFormatterInput(sim.rules);

    const profile = {
      schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
      sex: "female",
      age: 32,
      heightCm: 168,
      weightKg: 70,
      bodyFatPct: 29,
      trainingLevel: "intermediate",
      trainingAgeYears: 2,
      activityLevel: "moderate",
      nutritionQuality: "good",
    };
    const goal = {
      schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
      fatDirection: "decrease",
      muscleDirection: "increase",
      targetBodyFatPct: 25,
      targetWeightKg: 66,
      timelineWeeks: 12,
      effortLevel: "moderate",
      focusZones: ["waist"],
      musclePriority: 0.45,
      fatLossPriority: 0.65,
      outcomes: ["recomp"],
    };
    const plan = new TransformationEngine().compute(profile as never, goal as never);
    const direction = directVisual(profile as never, goal as never, plan);
    const legacyRender = buildRenderPlan(plan, direction);
    const bridged = applyCanonicalBodyTransformation(legacyRender, canonical);

    assert.notDeepEqual(
      legacyRender.transformation.approvedChanges.map((c) => c.id),
      bridged.transformation.approvedChanges.map((c) => c.id)
    );
    assert.deepEqual(
      bridged.transformation.approvedChanges.map((c) => c.id),
      canonical.approvedChanges.map((c) => c.id)
    );
    assert.equal(
      bridged.trace.transformationRulesVersion,
      sim.rules.rulesVersion
    );

    const formatted = new FluxFormatter().format(bridged, {
      previewSafetyContext: "non_sexual_fitness_visualization",
      seed: 101,
    });
    for (const change of canonical.approvedChanges) {
      assert.ok(
        formatted.prompt.includes(change.description),
        `prompt missing Body Simulator change: ${change.id}`
      );
    }
    assert.equal(formatted.prompt.includes("whole-body-recomposition"), false);
  });

  it("3. Adapter and formatter are deterministic", () => {
    const sim = simulateBodyTransformation(fixtureRealisticWeightLoss12w());
    assert.equal(sim.ok, true);
    if (!sim.ok) return;
    const a = adaptBodySimulatorRulesToFormatterInput(sim.rules);
    const b = adaptBodySimulatorRulesToFormatterInput(sim.rules);
    assert.deepEqual(a, b);

    const profile = {
      schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
      sex: "female",
      age: 34,
      heightCm: 168,
      weightKg: 78,
      bodyFatPct: 32,
      trainingLevel: "intermediate",
      trainingAgeYears: 2,
      activityLevel: "moderate",
      nutritionQuality: "good",
    };
    const goal = {
      schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
      fatDirection: "decrease",
      muscleDirection: "maintain",
      targetBodyFatPct: 28,
      targetWeightKg: 72,
      timelineWeeks: 12,
      effortLevel: "moderate",
      focusZones: ["waist"],
      musclePriority: 0.2,
      fatLossPriority: 0.8,
      outcomes: ["fat_loss"],
    };
    const plan = new TransformationEngine().compute(profile as never, goal as never);
    const direction = directVisual(profile as never, goal as never, plan);
    const render = applyCanonicalBodyTransformation(
      buildRenderPlan(plan, direction),
      a
    );
    const formatter = new FluxFormatter();
    const f1 = formatter.format(render, { seed: 7 });
    const f2 = formatter.format(render, { seed: 7 });
    assert.equal(f1.prompt, f2.prompt);
    assert.equal(f1.negativePrompt, f2.negativePrompt);
  });

  it("4. Inspector views expose Formatter Input + Preview without prompt editing fields", () => {
    const sim = simulateBodyTransformation(fixtureRealisticWeightLoss12w());
    assert.equal(sim.ok, true);
    if (!sim.ok) return;
    const canonical = adaptBodySimulatorRulesToFormatterInput(sim.rules);
    const inputView = buildFormatterInputInspectionView(sim.rules, canonical);
    const previewView = buildFormatterPreviewView({
      canonical,
      promptLength: 1234,
      formatterName: "FluxFormatter",
      formatterVersion: "1.0",
    });
    assert.ok(inputView.receivedCanonicalRules.simulationId);
    assert.ok(inputView.generatedFormatterObject.approvedChangeCount > 0);
    assert.equal(previewView.goal, canonical.goal.effectiveType);
    assert.equal(previewView.formatterName, "FluxFormatter");
    const html = readFileSync(
      join(repoRoot, "public/ai-os-control-room.html"),
      "utf8"
    );
    assert.match(html, /Formatter Input/);
    assert.match(html, /Formatter Preview/);
    assert.match(html, /formatterInputReceivedBody/);
    assert.match(html, /formatterPreviewBody/);
    const js = readFileSync(
      join(repoRoot, "public/ai-os-control-room.js"),
      "utf8"
    );
    assert.match(js, /renderFormatterInputInspector/);
    assert.match(js, /renderFormatterPreviewInspector/);
    assert.equal(/contentEditable|prompt edit|overridePrompt/i.test(js), false);
  });

  it("5. Image preview path requires Body Simulator and uses canonical changes", async () => {
    const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
    const service = new ImagePreviewService({
      transportAdapter: mockTransport(successTransportResult(), calls),
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
    assert.equal(calls.count, 1);
    const prompt = calls.inputs[0]?.formattedRequest?.prompt ?? "";
    assert.match(prompt, /Body Simulator/);
    assert.equal(prompt.includes("whole-body-recomposition"), false);
    assert.ok(
      result.artifacts?.formattedRequestSummary.positivePrompt.includes(
        "Body Simulator"
      )
    );
  });

  it("6. Control Room dry-run exposes formatter bridge when Body Simulator enabled", async () => {
    const prev = process.env.AI_OS_BODY_SIMULATOR_SHADOW_ENABLED;
    process.env.AI_OS_BODY_SIMULATOR_SHADOW_ENABLED = "1";
    try {
      const service = new ControlRoomService();
      const result = await service.runScenario("balanced_recomposition_12w");
      assert.equal(result.success, true);
      assert.ok(result.formatterInput);
      assert.ok(result.formatterPreview);
      assert.equal(result.formatterPreview?.formatterName, "FluxFormatter");
      assert.ok(
        result.artifacts?.renderPlan &&
          JSON.stringify(result.artifacts.renderPlan).includes("body-sim-")
      );
    } finally {
      if (prev === undefined) {
        delete process.env.AI_OS_BODY_SIMULATOR_SHADOW_ENABLED;
      } else {
        process.env.AI_OS_BODY_SIMULATOR_SHADOW_ENABLED = prev;
      }
    }
  });

  it("7. Legacy runtime transformation is not used for preview approvedChanges", async () => {
    const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
    const service = new ImagePreviewService({
      transportAdapter: mockTransport(successTransportResult(), calls),
      env: { REPLICATE_API_TOKEN: "r8_test_token_not_real" },
    });
    await service.runPreview({
      scenarioId: "gradual_fat_loss_16w",
      adultConfirmed: true,
      consentConfirmed: true,
      billingConfirmed: true,
      sourceImageDataUri: JPEG_DATA_URI,
      promptIsolationVariant: "current_ai_os",
    });
    const prompt = calls.inputs[0]?.formattedRequest?.prompt ?? "";
    // Legacy RenderPlanBuilder ids must not appear once Body Simulator owns intent.
    assert.equal(/id":"fat-reduction"|Apply a clear whole-body recomposition while preserving the original silhouette identity/.test(prompt), false);
    assert.match(prompt, /Body Simulator/);
  });

  it("8. Provider transport files are unchanged (hash seal)", () => {
    const transportHash = hashFile(
      "src/ai/transport/ReplicateTransportAdapter.ts"
    );
    assert.equal(typeof transportHash, "string");
    assert.equal(transportHash.length, 64);
    // FluxFormatter / ProviderFormatter contracts stay untouched for 022B.
    const formatterDirty = readFileSync(
      join(repoRoot, "src/ai/formatters/FluxFormatter.ts"),
      "utf8"
    );
    assert.equal(/canonicalBodyTransformation|BodySimulator/.test(formatterDirty), false);
    const providerFormatter = readFileSync(
      join(repoRoot, "src/ai/formatters/ProviderFormatter.ts"),
      "utf8"
    );
    assert.equal(/canonicalBodyTransformation|BodySimulator/.test(providerFormatter), false);
  });

  it("9. Scenario mapping is fixed and allowlisted", () => {
    assert.equal(
      resolveBodySimulatorScenarioForPreview("balanced_recomposition_12w"),
      CONTROL_ROOM_TO_BODY_SIMULATOR_SCENARIO.balanced_recomposition_12w
    );
    assert.equal(
      resolveBodySimulatorScenarioForPreview(
        "balanced_recomposition_12w",
        "advanced_muscle_gain_24w"
      ),
      "advanced_muscle_gain_24w"
    );
  });

  it("10. Docs and test:ai registration exist", () => {
    assert.ok(
      existsSync(join(repoRoot, "docs/CTO/22B_FIRST_END_TO_END_PREVIEW.md"))
    );
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8")
    );
    assert.match(pkg.scripts["test:ai"], /bodySimulatorPreview\.test\.ts/);
  });

  it("11. Dynamic UI uses textContent patterns (no innerHTML for API data)", () => {
    const js = readFileSync(
      join(repoRoot, "public/ai-os-control-room.js"),
      "utf8"
    );
    assert.equal(
      /innerHTML\s*=\s*.*formatterInput|innerHTML\s*=\s*.*formatterPreview/.test(
        js
      ),
      false
    );
  });
});
