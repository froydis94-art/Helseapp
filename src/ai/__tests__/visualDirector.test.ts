/**
 * DEMAND_005 — Visual Director layer tests.
 *
 * Run: npm run test:ai
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
import type { TransformationPlan } from "../TransformationPlan";
import {
  buildDirectedPromptPackage,
  buildPromptPackage,
} from "../PromptBuilder";
import { directVisual } from "../visual";

const here = dirname(fileURLToPath(import.meta.url));
const visualDirectorSource = readFileSync(
  join(here, "../visual/VisualDirector.ts"),
  "utf8"
);
const visualDirectionSource = readFileSync(
  join(here, "../visual/VisualDirection.ts"),
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

function clonePlan(plan: TransformationPlan): TransformationPlan {
  return structuredClone(plan);
}

function withIntensity(
  plan: TransformationPlan,
  visualIntensity: TransformationPlan["visualIntensity"]
): TransformationPlan {
  return { ...plan, visualIntensity };
}

describe("visualDirector — DEMAND_005", () => {
  const engine = new TransformationEngine();

  it("1. same inputs produce identical VisualDirection", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const a = directVisual(profile, goal, plan);
    const b = directVisual(profile, goal, plan);
    assert.deepEqual(a, b);
  });

  it("2. inputs and TransformationPlan are not mutated", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const profileBefore = structuredClone(profile);
    const goalBefore = structuredClone(goal);
    const planBefore = clonePlan(plan);
    directVisual(profile, goal, plan);
    assert.deepEqual(profile, profileBefore);
    assert.deepEqual(goal, goalBefore);
    assert.deepEqual(plan, planBefore);
  });

  it("3. subtle plan maps to restrained visibility", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = withIntensity(engine.compute(profile, goal), "subtle");
    const direction = directVisual(profile, goal, plan);
    assert.equal(direction.changeVisibility, "restrained");
  });

  it("4. dramatic plan maps to pronounced visibility", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = withIntensity(engine.compute(profile, goal), "dramatic");
    const direction = directVisual(profile, goal, plan);
    assert.equal(direction.changeVisibility, "pronounced");
  });

  it("5. missing body-fat information does not create invented percentages", () => {
    const profile = baseProfile({ bodyFatPct: undefined, bodyFat: undefined });
    const goal = baseGoal({ targetBodyFatPct: undefined });
    const plan = engine.compute(profile, goal);
    assert.equal(plan.currentBodyFatPct, null);
    assert.equal(plan.interimBodyFatPct, null);
    const direction = directVisual(profile, goal, plan);
    const joined = [
      ...direction.emphasisInstructions,
      ...direction.photographicInstructions,
      ...direction.realismConstraints,
    ].join("\n");
    assert.equal(/\b\d+(\.\d+)?\s*%/.test(joined), false);
    assert.equal(/body-fat appearance near/i.test(joined), false);
  });

  it("6. unselected regions are not introduced", () => {
    const profile = baseProfile();
    const goal = baseGoal({ focusZones: ["waist", "glutes"] });
    const plan = engine.compute(profile, goal);
    const regions = plan.regionalTargets.map((r) => r.region);
    assert.deepEqual([...regions].sort(), ["glutes", "waist"]);
    const direction = directVisual(profile, goal, plan);
    const joined = direction.emphasisInstructions.join("\n");
    for (const forbidden of ["shoulders", "chest", "arms", "back", "legs"]) {
      assert.equal(
        new RegExp(`\\bRegion ${forbidden}\\b`).test(joined),
        false,
        `must not invent region ${forbidden}`
      );
    }
    for (const region of regions) {
      assert.ok(joined.includes(`Region ${region}:`));
    }
  });

  it("7. pose remains preserved by default", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    assert.equal(direction.preserve.pose, true);
    assert.equal(direction.postureTreatment, "preserve_exactly");
  });

  it("8. posture emphasis is not enabled without explicit plan support", () => {
    const profile = baseProfile();
    const goal = baseGoal({ focusZones: ["waist"] });
    const plan = engine.compute(profile, goal);
    assert.equal(
      plan.regionalTargets.some(
        (r) => /posture/i.test(r.region) || (r.note != null && /posture/i.test(r.note))
      ),
      false
    );
    const direction = directVisual(profile, goal, plan);
    assert.equal(direction.postureTreatment, "preserve_exactly");
  });

  it("9. no gender-based visual stereotypes are introduced", () => {
    const goal = baseGoal();
    const female = directVisual(baseProfile({ sex: "female" }), goal, engine.compute(baseProfile({ sex: "female" }), goal));
    const male = directVisual(baseProfile({ sex: "male" }), goal, engine.compute(baseProfile({ sex: "male" }), goal));
    const joined = [
      ...female.photographicInstructions,
      ...female.emphasisInstructions,
      ...male.photographicInstructions,
      ...male.emphasisInstructions,
    ]
      .join("\n")
      .toLowerCase();
    for (const term of [
      "feminine",
      "masculine",
      "sexy",
      "hourglass",
      "manly",
      "ladylike",
      "for women",
      "for men",
    ]) {
      assert.equal(joined.includes(term), false, `stereotype term: ${term}`);
    }
  });

  it("10. no sweat, oil, tanning, veins, or stage-lighting instructions appear", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = withIntensity(engine.compute(profile, goal), "dramatic");
    const direction = directVisual(profile, goal, plan);
    const joined = [
      ...direction.photographicInstructions,
      ...direction.emphasisInstructions,
      ...direction.realismConstraints,
      ...direction.exclusions,
    ]
      .join("\n")
      .toLowerCase();
    for (const term of [
      "sweat",
      "oil",
      "tanning",
      "tan ",
      "veins",
      "stage lighting",
      "competition conditioning",
      "cosmetic retouching",
    ]) {
      assert.equal(joined.includes(term), false, `forbidden: ${term}`);
    }
  });

  it("11. VisualDirection contains no provider or model names", () => {
    const blob = `${visualDirectorSource}\n${visualDirectionSource}`;
    for (const term of [
      "Replicate",
      "Flux",
      "SDXL",
      "OpenAI",
      "Imagen",
      "fetch(",
      "apiKey",
      "API_KEY",
    ]) {
      assert.equal(blob.includes(term), false, `must not contain ${term}`);
    }
    const profile = baseProfile();
    const goal = baseGoal();
    const direction = directVisual(profile, goal, engine.compute(profile, goal));
    const serialized = JSON.stringify(direction);
    for (const term of ["Replicate", "Flux", "SDXL", "OpenAI", "Imagen"]) {
      assert.equal(serialized.includes(term), false);
    }
  });

  it("12. Directed PromptPackage includes SOURCE, PRESERVE, CHANGE, and REALISM", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const pkg = buildDirectedPromptPackage(profile, goal, plan, direction);
    assert.ok(pkg.primaryPrompt.includes("SOURCE:"));
    assert.ok(pkg.primaryPrompt.includes("PRESERVE:"));
    assert.ok(pkg.primaryPrompt.includes("CHANGE:"));
    assert.ok(pkg.primaryPrompt.includes("REALISM:"));
  });

  it("13. Directed prompt preserves identity and skeletal frame", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const pkg = buildDirectedPromptPackage(profile, goal, plan, direction);
    assert.ok(/keep the same person/i.test(pkg.primaryPrompt));
    assert.ok(/skeletal frame/i.test(pkg.primaryPrompt));
    assert.ok(direction.preserve.identity);
    assert.ok(direction.preserve.skeletalFrame);
  });

  it("14. Negative prompt includes exclusions from VisualDirection", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const pkg = buildDirectedPromptPackage(profile, goal, plan, direction);
    for (const exclusion of direction.exclusions) {
      assert.ok(
        pkg.negativePrompt.includes(exclusion),
        `missing exclusion: ${exclusion}`
      );
    }
  });

  it("15. PromptBuilder does not alter the TransformationPlan", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const before = clonePlan(plan);
    const direction = directVisual(profile, goal, plan);
    buildDirectedPromptPackage(profile, goal, plan, direction);
    buildPromptPackage(profile, goal, plan);
    assert.deepEqual(plan, before);
  });

  it("16. PromptPackage metadata matches the source plan", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const direction = directVisual(profile, goal, plan);
    const pkg = buildDirectedPromptPackage(profile, goal, plan, direction);
    assert.equal(pkg.metadata.rulesVersion, plan.rulesVersion);
    assert.equal(pkg.metadata.visualIntensity, plan.visualIntensity);
    assert.equal(pkg.metadata.estimateReliability, plan.estimateReliability);
    assert.equal(
      pkg.primaryPrompt.toLowerCase().includes("estimate reliability"),
      false
    );
    assert.equal(
      pkg.primaryPrompt.toLowerCase().includes("reliability"),
      false
    );
  });

  it("17. Existing buildPromptPackage continues to work", () => {
    const profile = baseProfile();
    const goal = baseGoal();
    const plan = engine.compute(profile, goal);
    const pkg = buildPromptPackage(profile, goal, plan);
    assert.ok(pkg.primaryPrompt.length > 0);
    assert.ok(pkg.negativePrompt.length > 0);
    assert.ok(pkg.primaryPrompt.includes("PRESERVE:"));
    assert.ok(pkg.primaryPrompt.includes("CHANGE:"));
    assert.ok(pkg.primaryPrompt.includes("REALISM:"));
    assert.ok(pkg.identityConstraints.length > 0);
  });
});
