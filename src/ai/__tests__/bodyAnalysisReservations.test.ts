/**
 * Demand 021 — Body Analysis Engine foundation reservations.
 * Tests 67–84: approved directions, defaults, purpose, no judgment outputs.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_CONFIDENCE_REASONS,
  ALL_PROGRESS_PHOTO_VIEWS,
  BODY_ANALYSIS_FORBIDDEN_OUTPUTS,
  BODY_ANALYSIS_MAY_SUPPORT,
  BODY_ANALYSIS_PRIMARY_PURPOSE,
  DEFAULT_VISUAL_BODY_FAT_ESTIMATE,
  MULTI_VIEW_BODY_ANALYSIS_ROADMAP_LABEL,
  MULTI_VIEW_BODY_ANALYSIS_ROADMAP_STATUS,
  NON_VISUAL_BODY_FAT_ORIGINS,
  VISUAL_BODY_FAT_ROADMAP_LABEL,
  VISUAL_BODY_FAT_ROADMAP_STATUS,
  assessMultiViewBodyAnalysisReadiness,
  bodyAnalysisProducesBeautyScores,
  bodyAnalysisProducesBodyRankings,
  bodyAnalysisProducesIdealBodyJudgments,
  createDefaultVisualBodyFatEstimate,
  createEmptyMultiViewBodyAnalysisInput,
  createReservedViewPlaceholder,
  isAllowedConfidenceReason,
  isMultiViewBodyAnalysisImplemented,
  isMultiViewRequiredInDemand021,
  isVisualBodyFatEstimationImplemented,
  keepViewObservationsSeparate,
  mergeViewObservationsSilentlyAllowed,
  visualBodyFatEstimateHasRequiredUncertaintyShape,
  visualBodyFatEstimateIsMeasurement,
} from "../body-analysis";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("DEMAND_021 Body Analysis Engine foundation", () => {
  const docs = read("docs/CTO/21_BODY_ANALYSIS_ENGINE_FOUNDATION.md");

  // 67
  it("67. Visual body-fat estimation is marked approved_future_direction", () => {
    assert.equal(VISUAL_BODY_FAT_ROADMAP_STATUS, "approved_future_direction");
    assert.match(VISUAL_BODY_FAT_ROADMAP_LABEL, /Approved future capability/i);
    assert.match(docs, /Visual body-fat estimation/);
    assert.match(docs, /approved future capability/i);
  });

  // 68
  it("68. Default visual body-fat status is not_run", () => {
    assert.equal(createDefaultVisualBodyFatEstimate().status, "not_run");
    assert.equal(DEFAULT_VISUAL_BODY_FAT_ESTIMATE.status, "not_run");
  });

  // 69
  it("69. Default estimated percentage is null", () => {
    assert.equal(createDefaultVisualBodyFatEstimate().estimatedPercent, null);
  });

  // 70
  it("70. Visual estimate includes an uncertainty contract", () => {
    const e = createDefaultVisualBodyFatEstimate();
    assert.ok("uncertainty" in e);
    assert.equal(e.uncertainty.lowerPercent, null);
    assert.equal(e.uncertainty.upperPercent, null);
    assert.equal(visualBodyFatEstimateHasRequiredUncertaintyShape(e), true);
  });

  // 71
  it("71. Visual estimate includes confidence reasons", () => {
    const e = createDefaultVisualBodyFatEstimate();
    assert.ok(Array.isArray(e.confidenceReasons));
    assert.deepEqual(e.confidenceReasons, []);
  });

  // 72
  it("72. Visual estimate remains separate from declared and measured values", () => {
    assert.ok(NON_VISUAL_BODY_FAT_ORIGINS.includes("user_estimate"));
    assert.ok(NON_VISUAL_BODY_FAT_ORIGINS.includes("device_measurement"));
    assert.ok(NON_VISUAL_BODY_FAT_ORIGINS.includes("professional_measurement"));
    const e = createDefaultVisualBodyFatEstimate();
    assert.equal(
      (NON_VISUAL_BODY_FAT_ORIGINS as readonly string[]).includes(e.origin),
      false
    );
  });

  // 73
  it("73. No real visual body-fat estimate is produced", () => {
    assert.equal(isVisualBodyFatEstimationImplemented(), false);
    assert.equal(visualBodyFatEstimateIsMeasurement(), false);
    const e = createDefaultVisualBodyFatEstimate();
    assert.equal(e.estimatedPercent, null);
    assert.equal(e.status, "not_run");
    assert.equal(/estimatedPercent:\s*[0-9]+/.test(docs), false);
    assert.match(
      e.limitations[0] ?? "",
      /approved as a future capability but is not implemented/i
    );
  });

  // 74
  it("74. Front, side and back are approved view identifiers", () => {
    assert.deepEqual([...ALL_PROGRESS_PHOTO_VIEWS], ["front", "side", "back"]);
    assert.equal(
      MULTI_VIEW_BODY_ANALYSIS_ROADMAP_STATUS,
      "approved_future_direction"
    );
    assert.match(
      MULTI_VIEW_BODY_ANALYSIS_ROADMAP_LABEL,
      /Approved future capability/i
    );
  });

  // 75
  it("75. Single-view analysis remains possible", () => {
    const readiness = assessMultiViewBodyAnalysisReadiness(
      createEmptyMultiViewBodyAnalysisInput()
    );
    assert.equal(readiness.singleViewAnalysisPossible, true);
    assert.match(
      readiness.limitations.join(" "),
      /Single-image analysis remains architecturally possible/i
    );
  });

  // 76
  it("76. Multi-view is not required in Demand 021", () => {
    assert.equal(isMultiViewRequiredInDemand021(), false);
    assert.equal(isMultiViewBodyAnalysisImplemented(), false);
    const readiness = assessMultiViewBodyAnalysisReadiness(
      createEmptyMultiViewBodyAnalysisInput()
    );
    assert.equal(readiness.multiViewAnalysisPossible, false);
    assert.match(readiness.limitations.join(" "), /not required in Demand 021/i);
  });

  // 77
  it("77. Views retain separate evidence and provenance", () => {
    const front = createReservedViewPlaceholder("front");
    const side = createReservedViewPlaceholder("side");
    assert.equal(front.evidence.view, "front");
    assert.equal(side.evidence.view, "side");
    assert.notEqual(front.evidence, side.evidence);
    const kept = keepViewObservationsSeparate([front, side]);
    assert.equal(kept[0]?.evidence.view, "front");
    assert.equal(kept[1]?.evidence.view, "side");
  });

  // 78
  it("78. Conflicting view observations are not silently merged", () => {
    assert.equal(mergeViewObservationsSilentlyAllowed(), false);
  });

  // 79
  it("79. Body Analysis purpose includes simulation realism", () => {
    assert.match(BODY_ANALYSIS_PRIMARY_PURPOSE, /realistic body simulation/i);
    assert.match(docs, /simulation realism|realistic body simulation/i);
    assert.ok(
      BODY_ANALYSIS_MAY_SUPPORT.some((s) => /TransformationPlan/i.test(s))
    );
  });

  // 80
  it("80. Body Analysis purpose includes longitudinal progress tracking", () => {
    assert.match(
      BODY_ANALYSIS_PRIMARY_PURPOSE,
      /longitudinal progress tracking/i
    );
    assert.match(docs, /longitudinal progress tracking/i);
  });

  // 81
  it("81. No beauty score exists", () => {
    assert.equal(bodyAnalysisProducesBeautyScores(), false);
    assert.ok(BODY_ANALYSIS_FORBIDDEN_OUTPUTS.includes("beauty_score"));
    assert.equal(/beauty[_ ]score/i.test(docs) && /must not/i.test(docs), true);
  });

  // 82
  it("82. No body ranking exists", () => {
    assert.equal(bodyAnalysisProducesBodyRankings(), false);
    assert.ok(BODY_ANALYSIS_FORBIDDEN_OUTPUTS.includes("body_ranking"));
  });

  // 83
  it("83. No ideal-body judgment exists", () => {
    assert.equal(bodyAnalysisProducesIdealBodyJudgments(), false);
    assert.ok(BODY_ANALYSIS_FORBIDDEN_OUTPUTS.includes("ideal_body_ranking"));
  });

  // 84
  it("84. Confidence reasons are structured and non-judgmental", () => {
    for (const reason of ALLOWED_CONFIDENCE_REASONS) {
      assert.equal(isAllowedConfidenceReason(reason), true);
      assert.equal(/ugly|fat|shame|attractive|ideal/i.test(reason), false);
    }
    assert.equal(isAllowedConfidenceReason("looks_bad"), false);
    const e = createDefaultVisualBodyFatEstimate();
    assert.deepEqual(e.confidenceReasons, []);
  });

  it("documentation uses Approved product directions — not undecided", () => {
    assert.match(docs, /## Approved product directions/);
    assert.equal(/undecided product direction/i.test(docs), false);
    assert.match(docs, /Still open \(implementation decisions\)/);
  });

  it("no capture UI or vision wiring introduced by reservation modules", () => {
    const index = read("src/ai/body-analysis/index.ts");
    assert.equal(/replicate|fetch\(|vision|openai/i.test(index), false);
    const html = read("public/index.html");
    assert.equal(/MultiViewBodyAnalysis|VisualBodyFatEstimate/.test(html), false);
  });
});
