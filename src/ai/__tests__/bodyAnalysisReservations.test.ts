/**
 * Demand 021 preparation — visual body-fat + multi-view reservations.
 * No vision, no estimates, no storage, no UI.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALL_PROGRESS_PHOTO_VIEWS,
  DEFAULT_VISUAL_BODY_FAT_ESTIMATE,
  MULTI_VIEW_BODY_ANALYSIS_ROADMAP_LABEL,
  MULTI_VIEW_BODY_ANALYSIS_ROADMAP_STATUS,
  NON_VISUAL_BODY_FAT_ORIGINS,
  VISUAL_BODY_FAT_ROADMAP_LABEL,
  VISUAL_BODY_FAT_ROADMAP_STATUS,
  assessMultiViewBodyAnalysisReadiness,
  createDefaultVisualBodyFatEstimate,
  createEmptyMultiViewBodyAnalysisInput,
  createReservedViewPlaceholder,
  isMultiViewBodyAnalysisImplemented,
  isVisualBodyFatEstimationImplemented,
  visualBodyFatEstimateHasRequiredUncertaintyShape,
  visualBodyFatEstimateIsMeasurement,
} from "../body-analysis";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("DEMAND_021 body-analysis reservations", () => {
  const docs = read("docs/CTO/21_VISUAL_BODY_ANALYSIS_RESERVATIONS.md");

  it("visual body-fat default is not_run with nulls", () => {
    const e = createDefaultVisualBodyFatEstimate();
    assert.equal(e.status, "not_run");
    assert.equal(e.estimatedPercent, null);
    assert.equal(e.uncertainty.lowerPercent, null);
    assert.equal(e.uncertainty.upperPercent, null);
    assert.equal(e.confidence, "not_applicable");
    assert.equal(e.origin, "unknown");
    assert.deepEqual(e.evidenceSourceIds, []);
    assert.equal(e.modelMetadata.providerId, null);
    assert.equal(e.modelMetadata.modelId, null);
    assert.match(e.limitations[0] ?? "", /reserved but not implemented/i);
    assert.equal(DEFAULT_VISUAL_BODY_FAT_ESTIMATE.status, "not_run");
  });

  it("visual estimation is not implemented and is not a measurement", () => {
    assert.equal(isVisualBodyFatEstimationImplemented(), false);
    assert.equal(visualBodyFatEstimateIsMeasurement(), false);
    assert.equal(VISUAL_BODY_FAT_ROADMAP_STATUS, "approved_future_direction");
    assert.equal(
      VISUAL_BODY_FAT_ROADMAP_LABEL,
      "Approved future direction — not implemented."
    );
  });

  it("visual estimate stays distinct from user/device/professional origins", () => {
    assert.ok(NON_VISUAL_BODY_FAT_ORIGINS.includes("user_estimate"));
    assert.ok(NON_VISUAL_BODY_FAT_ORIGINS.includes("device_measurement"));
    assert.ok(NON_VISUAL_BODY_FAT_ORIGINS.includes("professional_measurement"));
    const e = createDefaultVisualBodyFatEstimate();
    assert.equal(
      (NON_VISUAL_BODY_FAT_ORIGINS as readonly string[]).includes(e.origin),
      false
    );
  });

  it("estimated status would require uncertainty interval shape", () => {
    const okDefault = createDefaultVisualBodyFatEstimate();
    assert.equal(visualBodyFatEstimateHasRequiredUncertaintyShape(okDefault), true);
    assert.equal(
      visualBodyFatEstimateHasRequiredUncertaintyShape({
        ...okDefault,
        status: "estimated",
        estimatedPercent: 18,
        uncertainty: { lowerPercent: null, upperPercent: null },
        origin: "future_model_estimate",
      }),
      false
    );
    assert.equal(
      visualBodyFatEstimateHasRequiredUncertaintyShape({
        ...okDefault,
        status: "estimated",
        estimatedPercent: 18,
        uncertainty: { lowerPercent: 15, upperPercent: 21 },
        origin: "future_model_estimate",
        confidence: "low",
      }),
      true
    );
  });

  it("no realistic estimated percentage in Demand 021 defaults or docs fixtures", () => {
    const e = createDefaultVisualBodyFatEstimate();
    assert.equal(e.estimatedPercent, null);
    assert.equal(/estimatedPercent:\s*[0-9]+/.test(docs), false);
  });

  it("multi-view supports front side back only as approved directions", () => {
    assert.deepEqual([...ALL_PROGRESS_PHOTO_VIEWS], ["front", "side", "back"]);
    assert.equal(isMultiViewBodyAnalysisImplemented(), false);
    assert.equal(MULTI_VIEW_BODY_ANALYSIS_ROADMAP_STATUS, "approved_future_direction");
    assert.equal(
      MULTI_VIEW_BODY_ANALYSIS_ROADMAP_LABEL,
      "Approved future direction — not implemented."
    );
  });

  it("empty multi-view input reports all views missing and no analysis possible", () => {
    const input = createEmptyMultiViewBodyAnalysisInput();
    const readiness = assessMultiViewBodyAnalysisReadiness(input);
    assert.deepEqual(readiness.suppliedViews, []);
    assert.deepEqual(readiness.missingViews, ["front", "side", "back"]);
    assert.equal(readiness.singleViewAnalysisPossible, false);
    assert.equal(readiness.multiViewAnalysisPossible, false);
    assert.ok(readiness.limitations.length > 0);
  });

  it("reserved view placeholders do not store image references", () => {
    const front = createReservedViewPlaceholder("front");
    assert.equal(front.view, "front");
    assert.equal(front.imageReference, null);
    assert.equal(front.availability, "missing");
    assert.equal(front.bodyRegions.length, 0);
    assert.equal(front.technicalObservation?.status, "not_run");
  });

  it("documentation lists both directions as approved — not undecided", () => {
    assert.match(docs, /Approved future direction — not implemented/);
    assert.match(docs, /Visual body-fat estimation/);
    assert.match(docs, /Front \/ side \/ back/);
    assert.equal(/undecided product direction/i.test(docs), false);
    assert.match(docs, /Still open \(requires later owner approval\)/);
  });

  it("no capture UI or vision wiring introduced by reservation modules", () => {
    const index = read("src/ai/body-analysis/index.ts");
    assert.equal(/replicate|fetch\(|vision|openai/i.test(index), false);
    const html = read("public/index.html");
    assert.equal(/MultiViewBodyAnalysis|VisualBodyFatEstimate/.test(html), false);
  });
});
