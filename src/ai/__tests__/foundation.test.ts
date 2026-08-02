/**
 * DEMAND_002 — AI foundation unit tests (node:test via tsx).
 *
 * Run: npm run test:ai
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
import {
  normalizedTransformProgress,
  transformProgress,
  TRANSFORM_PROGRESS_TAU,
} from "../progressCurve";
import {
  validateBodyProfile,
  validateTransformationGoal,
} from "../validation";

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

describe("validation — valid profile and goal", () => {
  it("accepts a valid BodyProfile", () => {
    const result = validateBodyProfile(baseProfile());
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.weightKg, 70);
      assert.ok(Array.isArray(result.warnings));
    }
  });

  it("accepts a valid TransformationGoal", () => {
    const result = validateTransformationGoal(baseGoal());
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.fatDirection, "decrease");
    }
  });
});

describe("validation — invalid body-fat values", () => {
  it("rejects bodyFatPct below range", () => {
    const result = validateBodyProfile(baseProfile({ bodyFatPct: 1 }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.includes("bodyFatPct")));
    }
  });

  it("rejects bodyFatPct above range", () => {
    const result = validateBodyProfile(baseProfile({ bodyFatPct: 70 }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.includes("bodyFatPct")));
    }
  });
});

describe("validation — invalid priority values", () => {
  it("rejects musclePriority outside 0–1", () => {
    const result = validateTransformationGoal(baseGoal({ musclePriority: 1.5 }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.includes("musclePriority")));
    }
  });

  it("rejects fatLossPriority outside 0–1", () => {
    const result = validateTransformationGoal(baseGoal({ fatLossPriority: -0.1 }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.includes("fatLossPriority")));
    }
  });
});

describe("validation — NaN / Infinity rejection", () => {
  it("rejects NaN weightKg", () => {
    const result = validateBodyProfile(baseProfile({ weightKg: Number.NaN }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.includes("weightKg")));
    }
  });

  it("rejects Infinity timelineWeeks", () => {
    const result = validateTransformationGoal(
      baseGoal({ timelineWeeks: Number.POSITIVE_INFINITY })
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.includes("timelineWeeks")));
    }
  });

  it("rejects duplicate focus zones", () => {
    const result = validateTransformationGoal(
      baseGoal({ focusZones: ["waist", "waist"] })
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.includes("duplicate")));
    }
  });
});

describe("TransformationEngine — scenarios", () => {
  const engine = new TransformationEngine();

  it("clamps short timelines upward to 4 weeks", () => {
    const plan = engine.compute(baseProfile(), baseGoal({ timelineWeeks: 2 }));
    assert.equal(plan.effectiveTimelineWeeks, 4);
    assert.ok(
      plan.warnings.some((w) => w.includes("Timeline adjusted"))
    );
  });

  it("applies diminishing returns for advanced trainees", () => {
    const beginner = engine.compute(
      baseProfile({ trainingLevel: "beginner", trainingAgeYears: 0 }),
      baseGoal({
        fatDirection: "maintain",
        muscleDirection: "increase",
        targetBodyFatPct: undefined,
      })
    );
    const advanced = engine.compute(
      baseProfile({ trainingLevel: "advanced", trainingAgeYears: 8 }),
      baseGoal({
        fatDirection: "maintain",
        muscleDirection: "increase",
        targetBodyFatPct: undefined,
      })
    );
    assert.ok(beginner.estimatedLeanMassChangeKg != null);
    assert.ok(advanced.estimatedLeanMassChangeKg != null);
    assert.ok(
      (beginner.estimatedLeanMassChangeKg as number) >
        (advanced.estimatedLeanMassChangeKg as number)
    );
    assert.ok(
      advanced.warnings.some((w) => w.includes("Advanced training level"))
    );
  });

  it("reduces lean estimates when limitations are present", () => {
    const plain = engine.compute(
      baseProfile({ limitations: undefined }),
      baseGoal({
        fatDirection: "maintain",
        muscleDirection: "increase",
        targetBodyFatPct: undefined,
      })
    );
    const limited = engine.compute(
      baseProfile({ limitations: ["knee pain"] }),
      baseGoal({
        fatDirection: "maintain",
        muscleDirection: "increase",
        targetBodyFatPct: undefined,
      })
    );
    assert.ok(plain.estimatedLeanMassChangeKg != null);
    assert.ok(limited.estimatedLeanMassChangeKg != null);
    assert.ok(
      (limited.estimatedLeanMassChangeKg as number) <
        (plain.estimatedLeanMassChangeKg as number)
    );
  });

  it("produces zero fat loss when target BF% is at/above current", () => {
    const plan = engine.compute(
      baseProfile({ bodyFatPct: 22 }),
      baseGoal({
        fatDirection: "decrease",
        targetBodyFatPct: 25,
        muscleDirection: "maintain",
      })
    );
    assert.equal(plan.estimatedFatChangeKg, 0);
    assert.ok(plan.warnings.some((w) => w.startsWith("Conflict")));
  });

  it("emits estimateReliabilityScore and band (not confidence)", () => {
    const plan = engine.compute(baseProfile(), baseGoal());
    assert.equal(typeof plan.estimateReliabilityScore, "number");
    assert.ok(
      plan.estimateReliability === "low" ||
        plan.estimateReliability === "medium" ||
        plan.estimateReliability === "high"
    );
    assert.equal(
      "confidence" in plan,
      false,
      "legacy confidence field must be gone"
    );
  });

  it("is deterministic for identical inputs (excluding generatedAt)", () => {
    const a = engine.compute(baseProfile(), baseGoal());
    const b = engine.compute(baseProfile(), baseGoal());
    assert.deepEqual(
      { ...a, generatedAt: "fixed" },
      { ...b, generatedAt: "fixed" }
    );
  });
});

describe("progress curve — front-loaded ordering and planner", () => {
  it("orders 3 < 6 < 12 month progress with shrinking gaps", () => {
    const p3 = transformProgress(3);
    const p6 = transformProgress(6);
    const p12 = transformProgress(12);
    assert.ok(p3 > 0.45 && p3 < 0.6, `3mo ~0.53 got ${p3}`);
    assert.ok(p6 > 0.7 && p6 < 0.85, `6mo ~0.78 got ${p6}`);
    assert.ok(p12 > 0.9 && p12 < 0.99, `12mo ~0.95 got ${p12}`);
    assert.ok(p6 - p3 > p12 - p6);
    assert.equal(TRANSFORM_PROGRESS_TAU, 4);
  });

  it("normalizes so final month progress is 1", () => {
    const total = 6;
    assert.equal(normalizedTransformProgress(total, total), 1);
    const mid = normalizedTransformProgress(3, total);
    assert.ok(mid > 0 && mid < 1);
    assert.ok(mid > transformProgress(3) / transformProgress(total) - 0.002);
  });

  it("GoalPlanner monthly progress is front-loaded and ends at target", () => {
    const planner = new GoalPlanner();
    const plan = planner.plan(
      baseProfile({ bodyFatPct: 28, weightKg: 70 }),
      baseGoal({
        targetBodyFatPct: 22,
        targetWeightKg: 64,
        timelineWeeks: 26,
      })
    );
    assert.ok(plan.monthlyCheckpoints.length >= 2);
    const first = plan.monthlyCheckpoints[0];
    const last =
      plan.monthlyCheckpoints[plan.monthlyCheckpoints.length - 1];
    assert.ok(first.progress < last.progress);
    assert.equal(last.progress, 1);
    assert.equal(last.bodyFatPercent, 22);
    assert.equal(last.weightKg, 64);
    // Front-loaded: early month-to-month gap ≥ late gap (when ≥3 checkpoints)
    if (plan.monthlyCheckpoints.length >= 3) {
      const a = plan.monthlyCheckpoints[0].progress;
      const b = plan.monthlyCheckpoints[1].progress;
      const c =
        plan.monthlyCheckpoints[plan.monthlyCheckpoints.length - 1].progress;
      const d =
        plan.monthlyCheckpoints[plan.monthlyCheckpoints.length - 2].progress;
      assert.ok(b - a >= c - d - 1e-9);
    }
    assert.equal(plan.recommendedCaloriesKcal, null);
    assert.equal(plan.recommendedProteinG, null);
  });
});
