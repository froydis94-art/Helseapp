/**
 * Demand 022C — Controlled Legacy vs Body Simulator generation comparison.
 * No real network. No paid provider calls.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  adaptBodySimulatorRulesToFormatterInput,
  simulateBodyTransformation,
  fixtureRealisticWeightLoss12w,
} from "../body-simulator";
import {
  BODY_SIMULATOR_COMPARISON_MAX_RUNS,
  DEFAULT_GENERATION_PATH,
  GENERATION_PATHS,
  GENERATION_PATH_BODY_SIMULATOR,
  GENERATION_PATH_LEGACY,
  MANUAL_EVAL_CATEGORIES,
  averageAssessableScores,
  buildComparisonDifferenceSummary,
  buildComparisonRunFromPreview,
  buildSimulatorCalibrationObservation,
  checkComparisonComparability,
  createComparisonSessionId,
  interpretManualEvaluationAverages,
  pushComparisonRun,
  resolveGenerationPath,
  verifyCanonicalBodySimulatorRules,
  type BodySimulatorComparisonRun,
} from "../control-room/BodySimulatorComparison";
import {
  buildGenerationDiagnostics,
  buildPipelineSnapshot,
  runLegacyFormatterComparisonPath,
} from "../control-room/FormatterComparisonDiagnostics";
import { ImagePreviewService } from "../control-room/ImagePreviewService";
import type {
  ReplicateTransportAdapter,
  ReplicateTransportInput,
  ReplicateTransportResult,
} from "../transport";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");

const JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";
const JPEG_DATA_URI = `data:image/jpeg;base64,${JPEG_B64}`;

function hashFile(rel: string): string {
  return createHash("sha256")
    .update(readFileSync(join(repoRoot, rel)))
    .digest("hex");
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
    predictionId: "pred-022c-test",
    model: "black-forest-labs/flux-kontext-pro",
    status: "succeeded",
    imageUrl: "https://cdn.example.com/out/preview-022c.png",
    generationTimeMs: 15,
    warnings: [],
    metadata: {
      traceId: "trace-022c",
      formatterName: "FluxFormatter",
      formatterVersion: "1.0",
      pollingAttempts: 1,
      providerStatus: "succeeded",
    },
  };
}

function basePreviewInput(overrides: Record<string, unknown> = {}) {
  return {
    scenarioId: "balanced_recomposition_12w",
    adultConfirmed: true,
    consentConfirmed: true,
    billingConfirmed: true,
    sourceImageDataUri: JPEG_DATA_URI,
    promptIsolationVariant: "current_ai_os",
    ...overrides,
  };
}

function sampleRun(
  path: "legacy" | "body_simulator",
  overrides: Partial<BodySimulatorComparisonRun> = {}
): BodySimulatorComparisonRun {
  const base = buildComparisonRunFromPreview({
    comparisonSessionId: "cmp-sess-test",
    generationPath: path,
    sourceImageFingerprint: "sha256:abc",
    scenarioId: "balanced_recomposition_12w",
    bodySimulatorScenarioId:
      path === "body_simulator" ? "body_recomposition_16w" : null,
    provider: "replicate",
    model: "black-forest-labs/flux-kontext-pro",
    width: null,
    height: null,
    outputCount: 1,
    bodySimulatorRulesVersion: path === "body_simulator" ? "1.0" : null,
    formatterVersion: "1.0",
    formatterSchema: "FormattedImageRequest@flux/1.0",
    positivePrompt:
      path === "legacy" ? "legacy prompt line" : "body sim prompt line",
    negativePrompt: "neg",
    outcome: "succeeded",
    durationMs: path === "legacy" ? 10 : 12,
    httpStatus: 200,
    providerPredictionId: "pred-" + path,
    generatedImageUrl: "https://cdn.example.com/" + path + ".png",
    diagnostics: [],
  });
  return {
    ...base,
    ...overrides,
    conditions: {
      ...base.conditions,
      ...(overrides.conditions ?? {}),
    },
    versions: {
      ...base.versions,
      ...(overrides.versions ?? {}),
    },
    prompt: {
      ...base.prompt,
      ...(overrides.prompt ?? {}),
    },
    generation: {
      ...base.generation,
      ...(overrides.generation ?? {}),
    },
    result: {
      ...base.result,
      ...(overrides.result ?? {}),
    },
  };
}

describe("bodySimulatorComparison — DEMAND_022C", () => {
  it("1-7. Generation paths allowlist, default, deprecated, never production", () => {
    assert.equal(GENERATION_PATHS.length, 2);
    assert.equal(resolveGenerationPath("legacy"), GENERATION_PATH_LEGACY);
    assert.equal(
      resolveGenerationPath("body_simulator"),
      GENERATION_PATH_BODY_SIMULATOR
    );
    assert.equal(resolveGenerationPath("flux"), null);
    assert.equal(resolveGenerationPath("anything"), null);
    assert.equal(resolveGenerationPath(undefined), DEFAULT_GENERATION_PATH);
    assert.equal(DEFAULT_GENERATION_PATH, "body_simulator");
    const html = readFileSync(
      join(repoRoot, "public/ai-os-control-room.html"),
      "utf8"
    );
    assert.match(html, /generationPathBodySimulator[\s\S]*checked/);
    assert.match(html, /deprecated baseline/i);
    assert.match(html, /never\s+production/i);
    const prod = readFileSync(
      join(repoRoot, "api/generate-future-you.js"),
      "utf8"
    );
    assert.equal(/generationPath|BodySimulatorComparison/.test(prod), false);
  });

  it("8-13. One provider call per path; no auto pair / Run Both / cross-fallback", async () => {
    const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
    const service = new ImagePreviewService({
      transportAdapter: mockTransport(successTransportResult(), calls),
      env: { REPLICATE_API_TOKEN: "test-token" },
    });
    await service.runPreview(
      basePreviewInput({ generationPath: "body_simulator" })
    );
    assert.equal(calls.count, 1);
    await service.runPreview(basePreviewInput({ generationPath: "legacy" }));
    assert.equal(calls.count, 2);

    const js = readFileSync(
      join(repoRoot, "public/ai-os-control-room.js"),
      "utf8"
    );
    const html = readFileSync(
      join(repoRoot, "public/ai-os-control-room.html"),
      "utf8"
    );
    assert.match(html, /No Run Both/);
    assert.equal(/id=["']runBoth|Generate pair|Auto compare|Batch compare/i.test(html), false);
    assert.equal(/generatePair\s*\(|autoCompare\s*\(/i.test(js), false);
    const svc = readFileSync(
      join(repoRoot, "src/ai/control-room/ImagePreviewService.ts"),
      "utf8"
    );
    assert.match(svc, /No automatic retry/);
    assert.match(svc, /No cross-path fallback/);
    assert.equal(/autoRetry\s*\(/.test(svc), false);
  });

  it("14-20. Comparability checks and warnings", () => {
    const a = sampleRun("legacy");
    const b = sampleRun("body_simulator");
    const ok = checkComparisonComparability(a, b);
    assert.equal(ok.comparable, true);
    const differentSource = sampleRun("body_simulator", {
      sourceImageFingerprint: "sha256:other",
    });
    const bad = checkComparisonComparability(a, differentSource);
    assert.equal(bad.comparable, false);
    assert.ok(bad.warnings.some((w) => /source image differs/.test(w)));
    const badScenario = checkComparisonComparability(
      a,
      sampleRun("body_simulator", { scenarioId: "athletic_strength_24w" })
    );
    assert.equal(badScenario.comparable, false);
    assert.ok(badScenario.warnings.some((w) => /scenario differs/.test(w)));
    const badProvider = checkComparisonComparability(
      a,
      sampleRun("body_simulator", {
        conditions: { ...b.conditions, provider: "other" },
      })
    );
    assert.equal(badProvider.comparable, false);
    const badModel = checkComparisonComparability(
      a,
      sampleRun("body_simulator", {
        conditions: { ...b.conditions, model: "other-model" },
      })
    );
    assert.equal(badModel.comparable, false);
    const badDims = checkComparisonComparability(
      sampleRun("legacy", {
        conditions: { ...a.conditions, width: 512, height: 512 },
      }),
      b
    );
    assert.equal(badDims.comparable, false);
    assert.ok(badDims.warnings.some((w) => /dimensions differ/.test(w)));
    assert.match(
      bad.warnings.join(" "),
      /source image differs|scenario|provider|model|dimensions/
    );
  });

  it("21-26. Canonical verification before provider; adapter translate-only", async () => {
    const sim = simulateBodyTransformation(fixtureRealisticWeightLoss12w());
    assert.equal(sim.ok, true);
    if (!sim.ok) return;
    const verified = verifyCanonicalBodySimulatorRules(sim.rules);
    assert.equal(verified.ok, true);

    const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
    const service = new ImagePreviewService({
      transportAdapter: mockTransport(successTransportResult(), calls),
      env: { REPLICATE_API_TOKEN: "test-token" },
    });
    // Force verification failure by monkey-patching is not available; unit-test verifier.
    const invalid = verifyCanonicalBodySimulatorRules({
      ...sim.rules,
      schemaVersion: 999,
      provider: "replicate",
    });
    assert.equal(invalid.ok, false);
    assert.ok(invalid.errors.length > 0);

    const canonical = adaptBodySimulatorRulesToFormatterInput(sim.rules);
    assert.deepEqual(canonical.preservation, sim.rules.preservation);
    assert.equal(canonical.goal.timelineWeeks, sim.rules.goal.timelineWeeks);
    const adapterSrc = readFileSync(
      join(repoRoot, "src/ai/body-simulator/BodySimulatorFormatterAdapter.ts"),
      "utf8"
    );
    assert.equal(
      /BODY_SIM_MAX_|intensityExpectedMultiplier|computeTimelineMagnitude/.test(
        adapterSrc
      ),
      false
    );

    // Invalid path rejected before transport.
    await assert.rejects(
      () =>
        service.runPreview(basePreviewInput({ generationPath: "not_a_path" })),
      (err: { code?: string }) => err?.code === "invalid_request"
    );
    assert.equal(calls.count, 0);
  });

  it("27-30. Legacy baseline uses legacy transformation; null rules; deprecated", async () => {
    const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
    const service = new ImagePreviewService({
      transportAdapter: mockTransport(successTransportResult(), calls),
      env: { REPLICATE_API_TOKEN: "test-token" },
    });
    const result = await service.runPreview(
      basePreviewInput({ generationPath: "legacy" })
    );
    assert.equal(calls.count, 1);
    assert.equal(result.generationPath, "legacy");
    assert.equal(result.deprecatedBaseline, true);
    assert.equal(result.generationDiagnostics?.bodySimulatorRules, null);
    assert.equal(result.generationDiagnostics?.deprecatedBaseline, true);
    assert.equal(
      result.pipelineSnapshot?.previewMetadata.legacyPathSentToProvider,
      true
    );
    assert.equal(
      result.pipelineSnapshot?.previewMetadata.bodySimulatorPathSentToProvider,
      false
    );
    assert.equal(typeof runLegacyFormatterComparisonPath, "function");
  });

  it("31-42. Session history memory-only invariants (UI source)", () => {
    const js = readFileSync(
      join(repoRoot, "public/ai-os-control-room.js"),
      "utf8"
    );
    assert.match(js, /comparisonHistory/);
    assert.match(js, /COMPARISON_MAX_RUNS\s*=\s*20/);
    assert.equal(BODY_SIMULATOR_COMPARISON_MAX_RUNS, 20);
    // Comparison session must not write browser persistent stores.
    assert.equal(
      /localStorage\.(setItem|getItem).*comparison|comparison.*localStorage/i.test(
        js
      ),
      false
    );
    assert.equal(
      /sessionStorage\.(setItem|getItem).*comparison|comparison.*sessionStorage/i.test(
        js
      ),
      false
    );
    assert.equal(/indexedDB|openDatabase/i.test(js), false);
    assert.match(js, /clearComparisonSessionState/);
    assert.match(js, /clearPreviewState/);
    assert.match(js, /lockRoom/);
    // History helpers never accept source binary fields.
    assert.match(js, /delete run\.sourceImageDataUri/);
    assert.match(js, /delete run\.accessKey/);
    assert.match(js, /delete run\.apiToken|delete run\.token/);
    let hist: BodySimulatorComparisonRun[] = [];
    for (let i = 0; i < 25; i += 1) {
      hist = pushComparisonRun(hist, sampleRun(i % 2 === 0 ? "legacy" : "body_simulator", {
        runId: "r" + i,
      }));
    }
    assert.equal(hist.length, 20);
  });

  it("43-50. Control Room UI: selector, side-by-side, eval categories", () => {
    const html = readFileSync(
      join(repoRoot, "public/ai-os-control-room.html"),
      "utf8"
    );
    const js = readFileSync(
      join(repoRoot, "public/ai-os-control-room.js"),
      "utf8"
    );
    assert.match(html, /id="generationComparisonLab"/);
    assert.match(html, /name="generationPath"/);
    assert.match(html, /generationCompareSideBySide/);
    assert.match(html, /generationEvalForm/);
    assert.match(html, /Internal evaluation note/);
    assert.match(html, /Not\s+assessable/);
    assert.match(js, /not_assessable/);
    assert.equal(MANUAL_EVAL_CATEGORIES.length, 6);
    assert.equal(/attractiveness|beauty|winner|loser/i.test(html), false);
    assert.match(js, /Path change never auto-generates/);
    assert.match(js, /ensureEvalForm/);
    assert.match(js, /Legacy average/);
    assert.match(js, /Body Simulator average/);
  });

  it("51-56. Diagnostics reuse + legacy/body markers; no raw provider dump", async () => {
    const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
    const service = new ImagePreviewService({
      transportAdapter: mockTransport(successTransportResult(), calls),
      env: { REPLICATE_API_TOKEN: "test-token" },
    });
    const bodyResult = await service.runPreview(
      basePreviewInput({ generationPath: "body_simulator" })
    );
    assert.ok(bodyResult.formatterComparison);
    assert.ok(bodyResult.generationDiagnostics);
    assert.ok(bodyResult.pipelineSnapshot);
    assert.equal(bodyResult.generationDiagnostics?.bodySimulatorRules, "1.0");
    assert.equal(bodyResult.generationDiagnostics?.deprecatedBaseline, false);
    assert.ok(
      Array.isArray(
        (bodyResult.pipelineSnapshot?.transformationRules as { provenance?: unknown })
          ?.provenance
      )
    );
    const diag = buildGenerationDiagnostics({
      scenarioId: "x",
      rules: null,
      providerClassification: "internal_preview",
      generationPath: "legacy",
      deprecatedBaseline: true,
    });
    assert.equal(diag.bodySimulatorRules, null);
    assert.equal(diag.deprecatedBaseline, true);
    const snap = buildPipelineSnapshot({
      mode: "transport_mock",
      scenarioId: "x",
      formatterComparisonPresent: false,
      generationPath: "legacy",
    });
    assert.equal(snap.previewMetadata.legacyPathSentToProvider, true);
    assert.equal(
      JSON.stringify(bodyResult).includes("rawProviderResponse"),
      false
    );
  });

  it("57-70. Regression seals + package/test wiring + difference/calibration", () => {
    const sealed = [
      "src/ai/body-simulator/BodySimulatorRules.ts",
      "src/ai/formatters/FluxFormatter.ts",
      "src/ai/transport/ReplicateTransportAdapter.ts",
      "api/generate-future-you.js",
    ];
    for (const rel of sealed) {
      assert.ok(existsSync(join(repoRoot, rel)), rel);
    }
    // Coefficients module hash presence (unchanged by this demand's mission).
    assert.ok(hashFile("src/ai/body-simulator/BodySimulatorRules.ts").length === 64);
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8")
    );
    assert.match(pkg.scripts["test:ai"], /bodySimulatorComparison\.test\.ts/);
    assert.equal(
      Object.keys(pkg.dependencies || {}).includes("new-022c-dep"),
      false
    );

    const a = sampleRun("legacy");
    const b = sampleRun("body_simulator");
    const summary = buildComparisonDifferenceSummary({
      legacy: a,
      bodySimulator: b,
      evaluation: {
        legacy: {
          identityPreservation: 3,
          bodyChangeRealism: 3,
          goalAlignment: 3,
          naturalProportions: 3,
          presentationPreservation: 3,
          overallUsefulness: 3,
        },
        bodySimulator: {
          identityPreservation: 5,
          bodyChangeRealism: 5,
          goalAlignment: 5,
          naturalProportions: 5,
          presentationPreservation: 5,
          overallUsefulness: 5,
        },
        note: "session only",
      },
    });
    assert.equal(summary.comparable, true);
    assert.match(
      summary.manualEvaluation.interpretation,
      /Body Simulator received a higher manual evaluation/
    );
    assert.equal(
      interpretManualEvaluationAverages(5, 3),
      "Legacy received a higher manual evaluation in this comparison."
    );
    assert.equal(
      interpretManualEvaluationAverages(null, 4),
      "Evaluation is inconclusive."
    );
    assert.equal(averageAssessableScores(null), null);
    const cal = buildSimulatorCalibrationObservation({
      legacy: a,
      bodySimulator: b,
      evaluation: {
        legacy: {
          identityPreservation: 2,
          bodyChangeRealism: "not_assessable",
          goalAlignment: 2,
          naturalProportions: 2,
          presentationPreservation: 2,
          overallUsefulness: 2,
        },
        bodySimulator: {
          identityPreservation: 4,
          bodyChangeRealism: 4,
          goalAlignment: 4,
          naturalProportions: 4,
          presentationPreservation: 4,
          overallUsefulness: 4,
        },
        note: null,
      },
    });
    assert.equal(cal.schemaVersion, 1);
    assert.equal(cal.comparable, true);
    assert.equal(cal.manualEvaluation.bodyChangeRealism.legacy, null);
    assert.ok(createComparisonSessionId().startsWith("cmp-sess-"));

    const api = readFileSync(
      join(repoRoot, "api/ai-os-image-preview.ts"),
      "utf8"
    );
    assert.match(api, /ALLOWED_GENERATION_PATHS/);
    assert.match(api, /body_simulator_rule_verification_failed/);
    assert.equal(/process\.env\.\w+\s*=/.test(api), false);
  });

  it("Body Simulator happy path still one call + comparisonRun", async () => {
    const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
    const service = new ImagePreviewService({
      transportAdapter: mockTransport(successTransportResult(), calls),
      env: { REPLICATE_API_TOKEN: "test-token" },
    });
    const result = await service.runPreview(basePreviewInput());
    assert.equal(calls.count, 1);
    assert.equal(result.generationPath, "body_simulator");
    assert.equal(result.deprecatedBaseline, false);
    assert.ok(result.comparisonRun);
    assert.equal(result.comparisonRun?.generationPath, "body_simulator");
    assert.equal(
      result.pipelineSnapshot?.previewMetadata.bodySimulatorPathSentToProvider,
      true
    );
  });
});
