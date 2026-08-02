/**
 * DEMAND_003B — End-to-end planning → prompt contract tests.
 *
 * Run: npm run test:ai
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BODY_PROFILE_SCHEMA_VERSION,
  type BodyProfile,
} from "../BodyProfile";
import {
  TRANSFORMATION_GOAL_SCHEMA_VERSION,
  type TransformationGoal,
} from "../TransformationGoal";
import { TransformationEngine } from "../TransformationEngine";
import { GoalPlanner } from "../GoalPlanner";
import { buildPromptPackage } from "../PromptBuilder";
import { transformProgress } from "../progressCurve";
import {
  validateBodyProfile,
  validateTransformationGoal,
} from "../validation";

const require = createRequire(import.meta.url);
const jsCurve = require("../../../lib/transformProgress.js") as {
  transformProgress: (months: number) => number;
};

const here = dirname(fileURLToPath(import.meta.url));
const promptBuilderSource = readFileSync(
  join(here, "../PromptBuilder.ts"),
  "utf8"
);

function baseProfile(overrides: Partial<BodyProfile> = {}): BodyProfile {
  return {
    schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
    sex: "female",
    age: 32,
    heightCm: 168,
    weightKg: 70,
    bodyFatPct: 28,
    trainingLevel: "intermediate",
    trainingAgeYears: 2,
    activityLevel: "moderate",
    nutritionQuality: "good",
    ...overrides,
  };
}

function baseGoal(overrides: Partial<TransformationGoal> = {}): TransformationGoal {
  return {
    schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
    fatDirection: "decrease",
    muscleDirection: "increase",
    targetBodyFatPct: 22,
    targetWeightKg: 65,
    timelineWeeks: 24,
    effortLevel: "moderate",
    focusZones: ["waist", "glutes"],
    musclePriority: 0.5,
    fatLossPriority: 0.7,
    ...overrides,
  };
}

describe("pipelineContract — shared progress TS vs JS", () => {
  it("matches lib/transformProgress.js at 1/3/6/12 months within 0.001", () => {
    for (const months of [1, 3, 6, 12]) {
      const ts = transformProgress(months);
      const js = jsCurve.transformProgress(months);
      assert.ok(
        Math.abs(ts - js) <= 0.001,
        `month ${months}: ts=${ts} js=${js}`
      );
    }
  });
});

describe("pipelineContract — end-to-end planning → prompt", () => {
  const engine = new TransformationEngine();

  it("1. validated profile + goal produce a TransformationPlan", () => {
    const profileResult = validateBodyProfile(baseProfile());
    const goalResult = validateTransformationGoal(baseGoal());
    assert.equal(profileResult.ok, true);
    assert.equal(goalResult.ok, true);
    if (!profileResult.ok || !goalResult.ok) return;
    const plan = engine.compute(profileResult.value, goalResult.value);
    assert.equal(plan.schemaVersion, 1);
    assert.ok(typeof plan.progress === "number");
    assert.ok(typeof plan.rulesVersion === "string");
    assert.ok(plan.effectiveTimelineWeeks >= 4);
  });

  it("2. the same plan can produce a PromptPackage", () => {
    const plan = engine.compute(baseProfile(), baseGoal());
    const pkg = buildPromptPackage(baseProfile(), baseGoal(), plan);
    assert.ok(pkg.primaryPrompt.length > 0);
    assert.ok(pkg.negativePrompt.length > 0);
    assert.ok(pkg.identityConstraints.length > 0);
    assert.ok(pkg.anatomyConstraints.length > 0);
    assert.ok(pkg.transformationInstructions.length > 0);
  });

  it("3. identical deterministic inputs match excluding generatedAt", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const a = engine.compute(profile, goal);
    const b = engine.compute(profile, goal);
    assert.deepEqual({ ...a, generatedAt: "fixed" }, { ...b, generatedAt: "fixed" });
  });

  it("4. PromptBuilder source has no provider/API/fetch coupling", () => {
    const forbidden = ["Replicate", "Flux", "SDXL", "API token", "apiToken", "fetch("];
    for (const term of forbidden) {
      assert.equal(
        promptBuilderSource.includes(term),
        false,
        `PromptBuilder must not contain "${term}"`
      );
    }
  });

  it("5. prompt includes identity preservation", () => {
    const plan = engine.compute(baseProfile(), baseGoal());
    const pkg = buildPromptPackage(baseProfile(), baseGoal(), plan);
    assert.ok(pkg.primaryPrompt.startsWith("Edit this exact source photograph. Keep the same person."));
    assert.ok(pkg.primaryPrompt.includes("PRESERVE:"));
    assert.ok(
      pkg.identityConstraints.some((c) => /same person|identity/i.test(c))
    );
  });

  it("6. prompt includes only selected/calculated transformation regions", () => {
    const goal = baseGoal({ focusZones: ["waist", "glutes"] });
    const plan = engine.compute(baseProfile(), goal);
    const pkg = buildPromptPackage(baseProfile(), goal, plan);
    const regions = plan.regionalTargets.map((r) => r.region);
    assert.deepEqual(regions.sort(), ["glutes", "waist"]);
    for (const region of regions) {
      assert.ok(
        pkg.primaryPrompt.includes(region) ||
          pkg.transformationInstructions.some((t) => t.includes(region)),
        `expected region ${region} in prompt package`
      );
    }
    assert.equal(pkg.primaryPrompt.includes("shoulders"), false);
  });

  it("7. missing body-fat data does not invent percentages", () => {
    const profile = baseProfile({ bodyFatPct: undefined, bodyFat: undefined });
    const goal = baseGoal({ targetBodyFatPct: undefined });
    const plan = engine.compute(profile, goal);
    assert.equal(plan.currentBodyFatPct, null);
    assert.equal(plan.targetBodyFatPct, null);
    assert.equal(plan.interimBodyFatPct, null);
    assert.equal(plan.expectedBodyFatPct, null);
    const pkg = buildPromptPackage(profile, goal, plan);
    assert.ok(/do not invent a numeric body-fat/i.test(pkg.primaryPrompt));
    assert.equal(/\b\d{1,2}(\.\d)?%\b/.test(pkg.primaryPrompt), false);
  });

  it("8. long timeline remains anatomically constrained", () => {
    const plan = engine.compute(
      baseProfile(),
      baseGoal({ timelineWeeks: 52 })
    );
    const pkg = buildPromptPackage(baseProfile(), baseGoal({ timelineWeeks: 52 }), plan);
    assert.equal(plan.effectiveTimelineWeeks, 52);
    assert.ok(pkg.anatomyConstraints.length >= 3);
    assert.ok(pkg.primaryPrompt.includes("REALISM:"));
    assert.ok(pkg.negativePrompt.includes("distorted anatomy"));
    assert.ok(pkg.negativePrompt.includes("disproportionate muscles"));
  });

  it("9. front-loaded checkpoints reach the exact final target", () => {
    const planner = new GoalPlanner();
    const result = planner.plan(
      baseProfile({ bodyFatPct: 28, weightKg: 70 }),
      baseGoal({
        targetBodyFatPct: 22,
        targetWeightKg: 64,
        timelineWeeks: 26,
      })
    );
    const last = result.monthlyCheckpoints[result.monthlyCheckpoints.length - 1];
    assert.equal(last.progress, 1);
    assert.equal(last.bodyFatPercent, 22);
    assert.equal(last.weightKg, 64);
    if (result.monthlyCheckpoints.length >= 3) {
      const a = result.monthlyCheckpoints[0].progress;
      const b = result.monthlyCheckpoints[1].progress;
      const c = result.monthlyCheckpoints[result.monthlyCheckpoints.length - 1].progress;
      const d = result.monthlyCheckpoints[result.monthlyCheckpoints.length - 2].progress;
      assert.ok(b - a >= c - d - 1e-9);
    }
  });

  it("10. invalid raw input cannot enter via validation", () => {
    const badProfile = validateBodyProfile(baseProfile({ bodyFatPct: 1 }));
    const badGoal = validateTransformationGoal(baseGoal({ musclePriority: 2 }));
    assert.equal(badProfile.ok, false);
    assert.equal(badGoal.ok, false);
    // Pipeline gate: only ok values are passed to engine in production wiring.
    if (badProfile.ok || badGoal.ok) {
      assert.fail("invalid input must not validate as ok");
    }
  });

  it("11. PromptPackage metadata matches the TransformationPlan", () => {
    const plan = engine.compute(baseProfile(), baseGoal());
    const pkg = buildPromptPackage(baseProfile(), baseGoal(), plan);
    assert.equal(pkg.metadata.rulesVersion, plan.rulesVersion);
    assert.equal(pkg.metadata.visualIntensity, plan.visualIntensity);
    assert.equal(pkg.metadata.estimateReliability, plan.estimateReliability);
  });

  it("12. building a prompt does not mutate the plan object", () => {
    const plan = engine.compute(baseProfile(), baseGoal());
    const snapshot = structuredClone(plan);
    Object.freeze(plan);
    Object.freeze(plan.regionalTargets);
    Object.freeze(plan.assumptions);
    Object.freeze(plan.warnings);
    Object.freeze(plan.timelineCheckpoints);
    buildPromptPackage(baseProfile(), baseGoal(), plan);
    assert.deepEqual(plan, snapshot);
  });
});
