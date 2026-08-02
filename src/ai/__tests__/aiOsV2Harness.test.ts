/**
 * DEMAND_008 — AI OS v2 non-production integration harness tests.
 *
 * Run: npm run test:ai
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type AiOsV2HarnessReport,
  type HarnessStage,
  invalidPriorityFixture,
  missingBodyFatFixture,
  runAiOsV2Harness,
  sanitizeHarnessReport,
  shortTimelineFixture,
  validRecompositionFixture,
} from "../harness";

const __dirname = dirname(fileURLToPath(import.meta.url));
const harnessDir = join(__dirname, "..", "harness");

const EXPECTED_STAGES: HarnessStage[] = [
  "input_validation",
  "transformation_plan",
  "visual_direction",
  "render_plan",
  "render_plan_validation",
  "provider_formatting",
  "formatted_request_validation",
  "completed",
];

function normalizeReport(report: AiOsV2HarnessReport): AiOsV2HarnessReport {
  const clone = structuredClone(report) as AiOsV2HarnessReport;
  clone.stages = clone.stages.map((stage) => ({
    ...stage,
    durationMs: 0,
  }));
  if (clone.artifacts?.transformationPlan) {
    clone.artifacts.transformationPlan.generatedAt = "<normalized>";
  }
  return clone;
}

function readHarnessSources(): string {
  const files = readdirSync(harnessDir).filter((name) => name.endsWith(".ts"));
  return files
    .map((name) => readFileSync(join(harnessDir, name), "utf8"))
    .join("\n");
}

describe("aiOsV2Harness — DEMAND_008", () => {
  it("1. valid fixture completes successfully", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    assert.equal(report.success, true);
    assert.equal(report.errors.length, 0);
  });

  it("2. all expected stages appear in stable order", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    assert.deepEqual(
      report.stages.map((s) => s.stage),
      EXPECTED_STAGES
    );
    assert.equal(report.stages.every((s) => s.success), true);
  });

  it("3. same fixture produces the same trace ID", () => {
    const a = runAiOsV2Harness(validRecompositionFixture);
    const b = runAiOsV2Harness(validRecompositionFixture);
    assert.equal(a.traceId, b.traceId);
    assert.match(a.traceId, /^aiosv2-[a-f0-9]{12}$/);
  });

  it("4. same fixture produces equivalent business artifacts ignoring durations", () => {
    const a = normalizeReport(runAiOsV2Harness(validRecompositionFixture));
    const b = normalizeReport(runAiOsV2Harness(validRecompositionFixture));
    assert.deepEqual(a, b);
  });

  it("5. raw input is not mutated", () => {
    const input = structuredClone(validRecompositionFixture);
    const before = structuredClone(input);
    runAiOsV2Harness(input);
    assert.deepEqual(input, before);
  });

  it("6. TransformationPlan is produced", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    assert.ok(report.artifacts?.transformationPlan);
    assert.equal(typeof report.artifacts?.transformationPlan?.rulesVersion, "string");
  });

  it("7. VisualDirection is produced", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    assert.ok(report.artifacts?.visualDirection);
    assert.equal(
      typeof report.artifacts?.visualDirection?.changeVisibility,
      "string"
    );
  });

  it("8. RenderPlan is produced", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    assert.ok(report.artifacts?.renderPlan);
    assert.equal(
      report.artifacts?.renderPlan?.source.operation,
      "edit_source_image"
    );
  });

  it("9. FormattedImageRequest is produced", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    assert.ok(report.artifacts?.formattedRequest);
    assert.equal(report.artifacts?.formattedRequest?.providerFamily, "flux");
    assert.ok(
      (report.artifacts?.formattedRequest?.prompt.length ?? 0) > 0
    );
  });

  it("10. RenderPlan validation passes", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    const stage = report.stages.find((s) => s.stage === "render_plan_validation");
    assert.ok(stage);
    assert.equal(stage?.success, true);
  });

  it("11. formatted request validation passes", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    const stage = report.stages.find(
      (s) => s.stage === "formatted_request_validation"
    );
    assert.ok(stage);
    assert.equal(stage?.success, true);
  });

  it("12. approved change IDs survive into report summary", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    const ids = report.summary.approvedChangeIds ?? [];
    assert.ok(ids.length > 0);
    assert.equal(report.summary.approvedChangeCount, ids.length);
    const artifactIds =
      report.artifacts?.renderPlan?.transformation.approvedChanges.map(
        (c) => c.id
      ) ?? [];
    assert.deepEqual(ids, artifactIds);
  });

  it("13. formatter metadata appears in version summary", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    assert.equal(report.versions.formatterName, "FluxFormatter");
    assert.equal(typeof report.versions.formatterVersion, "string");
    assert.ok((report.versions.formatterVersion ?? "").length > 0);
  });

  it("14. missing body-fat fixture creates no invented percentages", () => {
    const report = runAiOsV2Harness(missingBodyFatFixture);
    assert.equal(report.success, true);
    const plan = report.artifacts?.transformationPlan;
    assert.ok(plan);
    assert.equal(plan?.currentBodyFatPct, null);
    assert.equal(plan?.targetBodyFatPct, null);
    assert.equal(plan?.interimBodyFatPct, null);
    assert.equal(plan?.expectedBodyFatPct, null);
    for (const checkpoint of plan?.timelineCheckpoints ?? []) {
      assert.equal(checkpoint.expectedBodyFatPct, null);
    }
  });

  it("15. invalid priority fixture fails during input validation", () => {
    const report = runAiOsV2Harness(invalidPriorityFixture);
    assert.equal(report.success, false);
    assert.deepEqual(
      report.stages.map((s) => s.stage),
      ["input_validation"]
    );
    assert.equal(report.stages[0]?.success, false);
    assert.ok(report.errors.some((e) => /musclePriority/i.test(e)));
  });

  it("16. invalid input does not reach TransformationEngine", () => {
    const report = runAiOsV2Harness(invalidPriorityFixture);
    assert.equal(
      report.stages.some((s) => s.stage === "transformation_plan"),
      false
    );
    assert.equal(report.artifacts?.transformationPlan, undefined);
  });

  it("17. unsupported aspect ratio returns formatter warning, not silent replacement", () => {
    const report = runAiOsV2Harness({
      ...validRecompositionFixture,
      formatterOptions: { aspectRatio: "21:9" },
    });
    assert.equal(report.success, true);
    assert.equal(report.artifacts?.formattedRequest?.aspectRatio, undefined);
    assert.ok(
      (report.summary.formatterWarningCodes ?? []).includes(
        "unsupported_aspect_ratio"
      )
    );
  });

  it("18. invalid seed returns formatter warning, not silent clamping", () => {
    const report = runAiOsV2Harness({
      ...validRecompositionFixture,
      formatterOptions: { seed: -3 },
    });
    assert.equal(report.success, true);
    assert.equal(report.artifacts?.formattedRequest?.seed, undefined);
    assert.ok(
      (report.summary.formatterWarningCodes ?? []).includes("provider_limitation")
    );
  });

  it("19. report contains no Base64", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    const json = JSON.stringify(report);
    assert.equal(/data:image\//i.test(json), false);
    assert.equal(/(?:[A-Za-z0-9+/]{80,}={0,2})/.test(json), false);
  });

  it("20. report contains no URLs", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    const json = JSON.stringify(report);
    assert.equal(/https?:\/\//i.test(json), false);
  });

  it("21. report contains no authorization text", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    const json = JSON.stringify(report);
    assert.equal(/\bAuthorization\b/i.test(json), false);
    assert.equal(/\bBearer\b/i.test(json), false);
  });

  it("22. report contains no API token names", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    const json = JSON.stringify(report);
    assert.equal(/REPLICATE_API_TOKEN/i.test(json), false);
    assert.equal(/\bapi[_-]?key\b/i.test(json), false);
  });

  it("23. report is JSON serializable", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    const json = JSON.stringify(report);
    const parsed = JSON.parse(json) as AiOsV2HarnessReport;
    assert.equal(parsed.success, true);
    assert.equal(parsed.traceId, report.traceId);
  });

  it("24. sanitizeHarnessReport rejects unsafe inserted content", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    const unsafe: AiOsV2HarnessReport = {
      ...report,
      warnings: [...report.warnings, "see https://evil.example/leak"],
    };
    const sanitized = sanitizeHarnessReport(unsafe);
    assert.equal(sanitized.success, false);
    assert.ok(
      sanitized.errors.some((e) =>
        e.includes("forbidden sensitive or transport content")
      )
    );
  });

  it("25. stage durations are non-negative", () => {
    const report = runAiOsV2Harness(validRecompositionFixture);
    for (const stage of report.stages) {
      assert.ok(stage.durationMs >= 0);
      assert.equal(Number.isFinite(stage.durationMs), true);
    }
  });

  it("26. timing differences do not affect trace ID", () => {
    const a = runAiOsV2Harness(validRecompositionFixture);
    const b = runAiOsV2Harness(validRecompositionFixture);
    assert.equal(a.traceId, b.traceId);
    // Durations may differ; business identity must not.
    assert.deepEqual(normalizeReport(a).summary, normalizeReport(b).summary);
  });

  it("27. no fetch or network implementation exists in harness source", () => {
    const source = readHarnessSources();
    assert.equal(/\bfetch\s*\(/.test(source), false);
    assert.equal(/\baxios\b/.test(source), false);
    assert.equal(/\bhttp\.request\b/.test(source), false);
    assert.equal(/\bhttps\.request\b/.test(source), false);
    assert.equal(/from\s+["']node:https["']/.test(source), false);
    assert.equal(/from\s+["']node:http["']/.test(source), false);
  });

  it("28. harness does not import production Replicate files", () => {
    const source = readHarnessSources();
    assert.equal(/lib\/replicate/.test(source), false);
    assert.equal(/visuellPrompt/.test(source), false);
    assert.equal(/transformasjonLogikk/.test(source), false);
  });

  it("29. harness does not call ModelAdapter.generate()", () => {
    const source = readHarnessSources();
    assert.equal(/ModelAdapter/.test(source), false);
    assert.equal(/\.generate\s*\(/.test(source), false);
    assert.equal(/from\s+["'].*model["']/.test(source), false);
  });

  it("30. short timeline fixture remains valid and surfaces warning behavior", () => {
    const report = runAiOsV2Harness(shortTimelineFixture);
    assert.equal(report.success, true);
    assert.equal(report.summary.effectiveTimelineWeeks, 4);
    assert.ok(
      report.warnings.some((w) => /timelineWeeks is unusual/i.test(w)) ||
        report.stages.some((s) =>
          s.warnings.some((w) => /timelineWeeks is unusual/i.test(w))
        )
    );
  });
});
