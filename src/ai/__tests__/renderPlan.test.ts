/**
 * DEMAND_006B — RenderPlan foundation tests.
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
import type { TransformationPlan } from "../TransformationPlan";
import { directVisual } from "../visual";
import type { VisualDirection } from "../visual/VisualDirection";
import {
  buildRenderPlan,
  validateRenderPlan,
  type RenderPlan,
} from "../render";

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

function withIntensity(
  plan: TransformationPlan,
  visualIntensity: TransformationPlan["visualIntensity"]
): TransformationPlan {
  return { ...plan, visualIntensity };
}

function stringifyPlan(plan: RenderPlan): string {
  return JSON.stringify(plan);
}

const PROVIDER_TERMS =
  /\b(replicate|flux|sdxl|openai|imagen|denoise|prompt strength|inference steps)\b/i;

describe("renderPlan — DEMAND_006B", () => {
  const engine = new TransformationEngine();

  it("1. same plan and direction produce identical RenderPlan", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const a = buildRenderPlan(plan, direction);
    const b = buildRenderPlan(plan, direction);
    assert.deepEqual(a, b);
  });

  it("2. inputs are not mutated", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const planBefore = structuredClone(plan);
    const directionBefore = structuredClone(direction);
    buildRenderPlan(plan, direction);
    assert.deepEqual(plan, planBefore);
    assert.deepEqual(direction, directionBefore);
  });

  it("3. required preservation flags are true", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const render = buildRenderPlan(plan, direction);
    assert.equal(render.source.preserveSourceComposition, true);
    assert.equal(render.identity.preservePerson, true);
    assert.equal(render.identity.preserveFace, true);
    assert.equal(render.identity.preserveApparentAge, true);
    assert.equal(render.identity.preserveHair, true);
    assert.equal(render.identity.preserveSkinTone, true);
    assert.equal(render.identity.preserveDistinctiveFeatures, true);
    assert.equal(render.scene.preservePose, true);
    assert.equal(render.scene.preserveCameraPerspective, true);
    assert.equal(render.scene.preserveLighting, true);
    assert.equal(render.scene.preserveClothing, true);
    assert.equal(render.scene.preserveAccessories, true);
    assert.equal(render.scene.preserveBackground, true);
    assert.equal(render.anatomy.preserveSkeletalFrame, true);
  });

  it("4. RenderPlan contains no provider names", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const render = buildRenderPlan(plan, direction);
    assert.equal(PROVIDER_TERMS.test(stringifyPlan(render)), false);
  });

  it("5. RenderPlan contains no network/API fields", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const render = buildRenderPlan(plan, direction);
    const raw = stringifyPlan(render);
    assert.equal(/\b(url|endpoint|authorization|apiKey|api_key|headers|fetch)\b/i.test(raw), false);
    assert.equal(/https?:\/\//i.test(raw), false);
  });

  it("6. missing body-fat data does not create invented percentages", () => {
    const profile = baseProfile({ bodyFatPct: undefined, bodyFat: undefined });
    const goal = baseGoal({ targetBodyFatPct: undefined });
    const plan = engine.compute(profile, goal);
    assert.equal(plan.currentBodyFatPct, null);
    assert.equal(plan.interimBodyFatPct, null);
    const direction = directVisual(profile, goal, plan);
    const render = buildRenderPlan(plan, direction);
    const joined = [
      ...render.transformation.approvedChanges.map((c) => c.description),
      ...render.anatomy.constraints,
      ...render.realism.constraints,
      ...render.exclusions,
    ].join("\n");
    assert.equal(/\b\d+(\.\d+)?\s*%/.test(joined), false);
    assert.equal(/body-fat appearance near/i.test(joined), false);
  });

  it("7. missing fat or muscle estimates do not create fake changes", () => {
    const profile = baseProfile();
    const goal = baseGoal({
      fatDirection: "maintain",
      muscleDirection: "maintain",
      fatLossPriority: 0,
      musclePriority: 0,
      focusZones: [],
    });
    const plan = engine.compute(profile, goal);
    const stripped: TransformationPlan = {
      ...plan,
      estimatedFatLossKg: null,
      estimatedMuscleGainKg: null,
      estimatedFatChangeKg: null,
      estimatedLeanMassChangeKg: null,
      waistChangeCm: null,
      regionalTargets: [],
    };
    const direction = directVisual(profile, goal, stripped);
    const render = buildRenderPlan(stripped, direction);
    assert.equal(render.transformation.approvedChanges.length, 0);
  });

  it("8. only plan.regionalTargets become regional RenderChanges", () => {
    const profile = baseProfile();
    const goal = baseGoal({ focusZones: ["waist", "glutes"] });
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const render = buildRenderPlan(plan, direction);
    const regional = render.transformation.approvedChanges.filter(
      (c) => c.kind === "regional_change"
    );
    const regions = regional.map((c) => c.region).sort();
    const planRegions = plan.regionalTargets.map((r) => r.region).sort();
    assert.deepEqual(regions, planRegions);
  });

  it("9. unselected regions are not introduced", () => {
    const profile = baseProfile();
    const goal = baseGoal({ focusZones: ["waist", "glutes"] });
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const render = buildRenderPlan(plan, direction);
    const regional = render.transformation.approvedChanges.filter(
      (c) => c.kind === "regional_change"
    );
    for (const forbidden of ["shoulders", "chest", "arms", "back", "legs"]) {
      assert.equal(
        regional.some((c) => c.region === forbidden),
        false
      );
    }
  });

  it("10. change ids are unique", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const render = buildRenderPlan(plan, direction);
    const ids = render.transformation.approvedChanges.map((c) => c.id);
    assert.equal(ids.length, new Set(ids).size);
  });

  it("11. duplicate direction exclusions are deduplicated", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const dirty: VisualDirection = {
      ...direction,
      exclusions: [...direction.exclusions, "cartoon", " cartoon ", "cartoon"],
    };
    const render = buildRenderPlan(plan, dirty);
    const counts = new Map<string, number>();
    for (const ex of render.exclusions) {
      counts.set(ex, (counts.get(ex) ?? 0) + 1);
    }
    for (const n of counts.values()) {
      assert.equal(n, 1);
    }
  });

  it("12. stable ordering is preserved", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const a = buildRenderPlan(plan, direction);
    const b = buildRenderPlan(plan, direction);
    assert.deepEqual(
      a.transformation.approvedChanges.map((c) => c.id),
      b.transformation.approvedChanges.map((c) => c.id)
    );
    const ids = a.transformation.approvedChanges.map((c) => c.id);
    const orderRank = (id: string): number => {
      if (id === "whole-body-recomposition") return 0;
      if (id.startsWith("fat-")) return 1;
      if (id === "waist-change") return 2;
      if (id === "muscle-development") return 3;
      if (id.startsWith("region-")) return 4;
      return 5;
    };
    for (let i = 1; i < ids.length; i++) {
      assert.ok(orderRank(ids[i - 1]) <= orderRank(ids[i]));
    }
  });

  it("13. subtle direction maps to restrained visibility", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = withIntensity(engine.compute(profile, goal), "subtle");
    const direction = directVisual(profile, goal, plan);
    assert.equal(direction.changeVisibility, "restrained");
    const render = buildRenderPlan(plan, direction);
    assert.equal(render.transformation.changeVisibility, "restrained");
  });

  it("14. dramatic direction maps to pronounced visibility", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = withIntensity(engine.compute(profile, goal), "dramatic");
    const direction = directVisual(profile, goal, plan);
    assert.equal(direction.changeVisibility, "pronounced");
    const render = buildRenderPlan(plan, direction);
    assert.equal(render.transformation.changeVisibility, "pronounced");
  });

  it("15. anatomy constraints preserve the skeletal frame", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const render = buildRenderPlan(plan, direction);
    assert.equal(render.anatomy.preserveSkeletalFrame, true);
    assert.ok(
      render.anatomy.constraints.some((c) =>
        /skeletal frame/i.test(c)
      )
    );
  });

  it("16. RenderChange descriptions avoid kg/cm/provider terms", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const render = buildRenderPlan(plan, direction);
    const joined = render.transformation.approvedChanges
      .map((c) => c.description)
      .join("\n");
    assert.equal(/\bkg\b/i.test(joined), false);
    assert.equal(/\bcm\b/i.test(joined), false);
    assert.equal(/prompt strength/i.test(joined), false);
    assert.equal(/denoise/i.test(joined), false);
    assert.equal(PROVIDER_TERMS.test(joined), false);
  });

  it("17. validateRenderPlan accepts a valid plan", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const render = buildRenderPlan(plan, direction);
    const result = validateRenderPlan(render);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it("18. validateRenderPlan rejects duplicate change ids", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const render = buildRenderPlan(plan, direction);
    const first = render.transformation.approvedChanges[0];
    assert.ok(first);
    const bad: RenderPlan = {
      ...render,
      transformation: {
        ...render.transformation,
        approvedChanges: [
          ...render.transformation.approvedChanges,
          { ...first, description: "duplicate id clone" },
        ],
      },
    };
    const result = validateRenderPlan(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /duplicate approvedChange id/i.test(e)));
  });

  it("19. validateRenderPlan rejects provider keywords", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const render = buildRenderPlan(plan, direction);
    const bad: RenderPlan = {
      ...render,
      realism: {
        ...render.realism,
        constraints: [...render.realism.constraints, "Use Flux for rendering"],
      },
    };
    const result = validateRenderPlan(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /flux/i.test(e)));
  });

  it("20. validateRenderPlan rejects URL-like strings", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const render = buildRenderPlan(plan, direction);
    const bad: RenderPlan = {
      ...render,
      exclusions: [...render.exclusions, "https://example.com/image.png"],
    };
    const result = validateRenderPlan(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /URL-like/i.test(e)));
  });

  it("21. validateRenderPlan rejects Base64-like strings", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const render = buildRenderPlan(plan, direction);
    const bad: RenderPlan = {
      ...render,
      exclusions: [
        ...render.exclusions,
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
      ],
    };
    const result = validateRenderPlan(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /Base64-like/i.test(e)));
  });

  it("22. trace metadata matches source TransformationPlan and VisualDirection", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const render = buildRenderPlan(plan, direction);
    assert.equal(render.trace.transformationRulesVersion, plan.rulesVersion);
    assert.equal(
      render.trace.visualDirectionRulesVersion,
      direction.metadata.rulesVersion
    );
    assert.equal(
      render.trace.transformationPlanSchemaVersion,
      plan.schemaVersion
    );
    assert.equal(render.trace.renderPlanSchemaVersion, render.schemaVersion);
    assert.equal(render.trace.estimateReliability, plan.estimateReliability);
    assert.equal(
      render.transformation.visualIntensity,
      plan.visualIntensity
    );
  });

  it("23. no prompt text is required to build a RenderPlan", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const render = buildRenderPlan(plan, direction);
    assert.equal(typeof render.schemaVersion, "number");
    assert.ok(Array.isArray(render.transformation.approvedChanges));
    // Contract is structured fields only — no prompt/package requirement.
    assert.equal(
      Object.prototype.hasOwnProperty.call(render, "prompt"),
      false
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(render, "positivePrompt"),
      false
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(render, "negativePrompt"),
      false
    );
  });

  it("24. existing public AI exports remain importable", async () => {
    const ai = await import("../index");
    assert.equal(typeof ai.buildRenderPlan, "function");
    assert.equal(typeof ai.validateRenderPlan, "function");
    assert.equal(typeof ai.buildPromptPackage, "function");
    assert.equal(typeof ai.directVisual, "function");
    assert.equal(typeof ai.TransformationEngine, "function");
    assert.ok(ai.RENDER_PLAN_SCHEMA_VERSION === 1);
  });
});
