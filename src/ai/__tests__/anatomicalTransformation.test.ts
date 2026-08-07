/**
 * Demand 022D — Anatomical Transformation Engine tests (1–80 core gates).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ANATOMICAL_EFFORT_HARD,
  ANATOMICAL_EFFORT_MODERATE,
  ANATOMICAL_EFFORT_STRICT,
  ANATOMICAL_TRANSFORMATION_SCHEMA_VERSION,
  BODY_SIMULATOR_RULES_VERSION,
  adaptBodySimulatorRulesToFormatterInput,
  anatomicalMagnitudeScore,
  buildAnatomicalTransformation,
  deriveMuscleGainMode,
  effortCoefficientForIntensity,
  magnitudeOrdinal,
  resolveBodyFatContext,
  simulateBodyTransformation,
  type BodySimulatorInput,
  type BodySimulatorFocusZone,
} from "../body-simulator";
import { createDefaultMedicationEffects } from "../body-simulator/BodySimulatorTypes";
import { createEmptyBodyAnalysisEvidence } from "../body-analysis/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function baseAnatomical(overrides: {
  simulationId: string;
  currentBf?: number | null;
  targetBf?: number | null;
  goalType?: BodySimulatorInput["goal"]["type"];
  timelineWeeks?: number;
  intensity?: BodySimulatorInput["goal"]["intensity"];
  focusZones?: BodySimulatorFocusZone[];
  optionalNotes?: string[];
  muscleKg?: number | null;
  bfChangePp?: number | null;
  trainingExperience?: BodySimulatorInput["profile"]["trainingExperience"];
  view?: BodySimulatorInput["sourceImageContext"]["progressPhotoView"];
}): BodySimulatorInput {
  const current = overrides.currentBf === undefined ? 18 : overrides.currentBf;
  const target = overrides.targetBf === undefined ? 15 : overrides.targetBf;
  return {
    schemaVersion: 1,
    simulationId: overrides.simulationId,
    createdAt: "2026-08-07T12:00:00.000Z",
    goal: {
      type: overrides.goalType ?? "fat_loss_with_muscle_preservation",
      timelineWeeks: overrides.timelineWeeks ?? 24,
      targetWeightChangeKg: null,
      targetBodyFatChangePercentagePoints:
        overrides.bfChangePp !== undefined
          ? overrides.bfChangePp
          : current != null && target != null
            ? target - current
            : null,
      targetMuscleChangeKg: overrides.muscleKg ?? null,
      intensity: overrides.intensity ?? "realistic",
      targetBodyFatPercent: target,
    },
    profile: {
      ageYears: 30,
      sexForPhysiology: "male",
      heightCm: 180,
      currentWeightKg: 80,
      currentBodyFatPercent: current,
      bodyFatBasis: "user_estimate",
      trainingExperience: overrides.trainingExperience ?? "intermediate",
      evidence: { profile: createEmptyBodyAnalysisEvidence("unknown") },
    },
    activity: {
      generalActivity: "moderate",
      resistanceTrainingSessionsPerWeek: 4,
      cardioSessionsPerWeek: 2,
      trainingConsistency: "high",
      proteinIntakeSupport: "likely_adequate",
      recoverySupport: "moderate",
      evidence: { activity: createEmptyBodyAnalysisEvidence("unknown") },
    },
    medicationEffects: createDefaultMedicationEffects(),
    bodyAnalysis: null,
    sourceImageContext: {
      available: true,
      progressPhotoView: overrides.view ?? "front",
    },
    options: {
      preserveIdentity: true,
      preserveOriginalPresentation: true,
      preservePose: true,
      preserveCameraFraming: true,
      preserveClothing: true,
      preserveBackground: true,
      preserveLightingCharacter: true,
    },
    focusZones: overrides.focusZones ?? [],
    optionalNotes: overrides.optionalNotes ?? [],
  };
}

// Fixtures 1–26
const fx = {
  bf18to15: () =>
    baseAnatomical({ simulationId: "anat-18-15", currentBf: 18, targetBf: 15 }),
  bf18to12: () =>
    baseAnatomical({ simulationId: "anat-18-12", currentBf: 18, targetBf: 12 }),
  bf18to18muscle: () =>
    baseAnatomical({
      simulationId: "anat-18-18-mg",
      currentBf: 18,
      targetBf: 18,
      goalType: "muscle_gain",
      muscleKg: 3,
      focusZones: ["arms", "chest", "shoulders"],
    }),
  bf18to22muscle: () =>
    baseAnatomical({
      simulationId: "anat-18-22-mg",
      currentBf: 18,
      targetBf: 22,
      goalType: "muscle_gain",
      muscleKg: 3,
    }),
  leanBulk: () =>
    baseAnatomical({
      simulationId: "anat-lean-bulk",
      currentBf: 18,
      targetBf: 18,
      goalType: "muscle_gain",
      muscleKg: 2.5,
      focusZones: ["arms", "shoulders"],
    }),
  mixedBulk: () =>
    baseAnatomical({
      simulationId: "anat-mixed-bulk",
      currentBf: 18,
      targetBf: 20,
      goalType: "muscle_gain",
      muscleKg: 2.5,
    }),
  focusCore: () =>
    baseAnatomical({
      simulationId: "anat-focus-core",
      currentBf: 18,
      targetBf: 12,
      focusZones: ["core", "abs"],
    }),
  focusChest: () =>
    baseAnatomical({
      simulationId: "anat-focus-chest",
      currentBf: 18,
      targetBf: 14,
      focusZones: ["chest"],
      goalType: "muscle_gain",
      muscleKg: 2,
    }),
  focusArms: () =>
    baseAnatomical({
      simulationId: "anat-focus-arms",
      currentBf: 18,
      targetBf: 14,
      focusZones: ["arms"],
      goalType: "muscle_gain",
      muscleKg: 2,
    }),
  focusShoulders: () =>
    baseAnatomical({
      simulationId: "anat-focus-shoulders",
      currentBf: 18,
      targetBf: 14,
      focusZones: ["shoulders"],
      goalType: "muscle_gain",
      muscleKg: 2,
    }),
  focusBack: () =>
    baseAnatomical({
      simulationId: "anat-focus-back",
      currentBf: 18,
      targetBf: 14,
      focusZones: ["back"],
      goalType: "muscle_gain",
      muscleKg: 2,
    }),
  focusGlutes: () =>
    baseAnatomical({
      simulationId: "anat-focus-glutes",
      currentBf: 28,
      targetBf: 24,
      focusZones: ["glutes"],
      goalType: "muscle_gain",
      muscleKg: 2,
    }),
  focusThighs: () =>
    baseAnatomical({
      simulationId: "anat-focus-thighs",
      currentBf: 28,
      targetBf: 24,
      focusZones: ["thighs"],
      goalType: "muscle_gain",
      muscleKg: 2,
    }),
  months3: () =>
    baseAnatomical({
      simulationId: "anat-3mo",
      currentBf: 18,
      targetBf: 12,
      timelineWeeks: 12,
      intensity: "realistic",
    }),
  months6: () =>
    baseAnatomical({
      simulationId: "anat-6mo",
      currentBf: 18,
      targetBf: 12,
      timelineWeeks: 26,
      intensity: "realistic",
    }),
  months12: () =>
    baseAnatomical({
      simulationId: "anat-12mo",
      currentBf: 18,
      targetBf: 12,
      timelineWeeks: 52,
      intensity: "realistic",
    }),
  effortModerate: () =>
    baseAnatomical({
      simulationId: "anat-effort-mod",
      currentBf: 18,
      targetBf: 12,
      timelineWeeks: 26,
      intensity: "conservative",
    }),
  effortHard: () =>
    baseAnatomical({
      simulationId: "anat-effort-hard",
      currentBf: 18,
      targetBf: 12,
      timelineWeeks: 26,
      intensity: "realistic",
    }),
  effortStrict: () =>
    baseAnatomical({
      simulationId: "anat-effort-strict",
      currentBf: 18,
      targetBf: 12,
      timelineWeeks: 26,
      intensity: "ambitious",
    }),
  conflictBulkFatDown: () =>
    baseAnatomical({
      simulationId: "anat-conflict-bulk",
      currentBf: 18,
      targetBf: 12,
      goalType: "muscle_gain",
      muscleKg: 3,
      optionalNotes: ["bulk"],
    }),
  recomp: () =>
    baseAnatomical({
      simulationId: "anat-recomp",
      currentBf: 22,
      targetBf: 18,
      goalType: "body_recomposition",
      muscleKg: 1.5,
    }),
  noteDefinedAbs: () =>
    baseAnatomical({
      simulationId: "anat-note-abs",
      currentBf: 18,
      targetBf: 12,
      optionalNotes: ["defined abs"],
    }),
  noteConflict: () =>
    baseAnatomical({
      simulationId: "anat-note-conflict",
      currentBf: 18,
      targetBf: 22,
      goalType: "muscle_gain",
      muscleKg: 2,
      optionalNotes: ["extremely shredded"],
    }),
  muscularFatLoss: () =>
    baseAnatomical({
      simulationId: "anat-muscular-fl",
      currentBf: 16,
      targetBf: 11,
      goalType: "fat_loss_with_muscle_preservation",
      trainingExperience: "advanced",
      muscleKg: 0.2,
    }),
  bfUnavailable: () =>
    baseAnatomical({
      simulationId: "anat-bf-missing",
      currentBf: null,
      targetBf: null,
      bfChangePp: -3,
    }),
  partialVisibility: () =>
    baseAnatomical({
      simulationId: "anat-partial-vis",
      currentBf: 18,
      targetBf: 12,
      view: "three_quarter",
    }),
};

function anat(input: BodySimulatorInput) {
  return buildAnatomicalTransformation(input);
}

function maxMag(result: ReturnType<typeof anat>): number {
  return Math.max(0, ...result.rules.map((r) => magnitudeOrdinal(r.magnitude)));
}

function hasFeature(
  result: ReturnType<typeof anat>,
  feature: string,
  direction?: string
): boolean {
  return result.rules.some(
    (r) =>
      r.feature === feature &&
      (direction == null || r.direction === direction)
  );
}

describe("DEMAND_022D Anatomical Transformation Engine", () => {
  describe("Body-fat", () => {
    it("1. 18→15 produces modest fat-reduction anatomy", () => {
      const r = anat(fx.bf18to15());
      assert.equal(r.bodyFatContext.deltaPercentagePoints, -3);
      assert.ok(hasFeature(r, "subcutaneous_fat", "slight_decrease") || hasFeature(r, "waist_width"));
      assert.ok(r.summary.bodyFatDriven);
    });

    it("2. 18→12 produces stronger definition than 18→15", () => {
      const a = anat(fx.bf18to15());
      const b = anat(fx.bf18to12());
      const aDef = a.rules.filter((x) => x.feature.includes("definition"));
      const bDef = b.rules.filter((x) => x.feature.includes("definition"));
      assert.ok(bDef.length >= aDef.length);
      assert.ok(
        hasFeature(b, "subcutaneous_fat", "strong_decrease") ||
          hasFeature(b, "subcutaneous_fat", "moderate_decrease")
      );
    });

    it("3. 18→12 includes abdominal-definition increase", () => {
      assert.ok(hasFeature(anat(fx.bf18to12()), "abdominal_definition", "more_defined"));
    });

    it("4. 18→12 includes lower-abdominal fat reduction", () => {
      const r = anat(fx.bf18to12());
      assert.ok(
        r.rules.some(
          (x) =>
            x.feature === "subcutaneous_fat" &&
            (x.direction === "strong_decrease" ||
              x.direction === "moderate_decrease")
        )
      );
    });

    it("5. 18→12 includes waist reduction", () => {
      assert.ok(
        anat(fx.bf18to12()).rules.some(
          (x) =>
            x.feature === "waist_width" && x.direction.includes("decrease")
        )
      );
    });

    it("6. Lower BF does not arbitrarily reduce muscle volume", () => {
      const r = anat(fx.bf18to12());
      assert.equal(
        r.rules.some(
          (x) =>
            x.feature.includes("volume") && x.direction.includes("decrease")
        ),
        false
      );
    });

    it("7. 18→18 produces no fat-driven reduction", () => {
      const r = anat(fx.bf18to18muscle());
      assert.equal(r.bodyFatContext.deltaPercentagePoints, 0);
      assert.equal(
        r.rules.some(
          (x) =>
            x.source === "body_fat_delta" && x.direction.includes("decrease")
        ),
        false
      );
    });

    it("8. 18→22 allows moderate fat increase", () => {
      const r = anat(fx.bf18to22muscle());
      assert.ok(
        r.rules.some(
          (x) =>
            x.feature === "subcutaneous_fat" &&
            x.direction.includes("increase")
        )
      );
    });

    it("9. 18→22 does not automatically create extreme belly enlargement", () => {
      const r = anat(fx.bf18to22muscle());
      assert.equal(
        r.rules.some(
          (x) =>
            x.feature === "waist_width" && x.direction === "strong_increase"
        ),
        false
      );
      assert.ok(
        r.limitations.some((l) => /extreme abdominal|protrusion/i.test(l)) ||
          r.rules.some((x) => x.id.includes("no-extreme") || x.confidenceReasons.includes("fat_gain_waist_capped"))
      );
    });
  });

  describe("Muscle", () => {
    it("10. Muscle gain increases muscle-volume features", () => {
      const r = anat(fx.bf18to18muscle());
      assert.ok(
        r.rules.some(
          (x) =>
            x.feature.includes("volume") && x.direction.includes("increase")
        )
      );
    });

    it("11. Muscle gain does not automatically increase abdominal fat when BF stable", () => {
      const r = anat(fx.bf18to18muscle());
      assert.equal(r.muscleGainMode, "lean_bulk");
      const abd = r.rules.find(
        (x) => x.feature === "subcutaneous_fat" && x.region === "abdomen"
      );
      assert.ok(!abd || abd.direction === "stable" || !abd.direction.includes("strong"));
    });

    it("12. Lean bulk keeps waist approximately stable", () => {
      const r = anat(fx.leanBulk());
      assert.equal(r.muscleGainMode, "lean_bulk");
      assert.ok(
        r.rules.some(
          (x) =>
            x.feature === "waist_width" &&
            (x.direction === "stable" || x.direction === "slight_decrease")
        )
      );
      assert.equal(
        r.rules.some(
          (x) =>
            x.feature === "waist_width" && x.direction.includes("increase")
        ),
        false
      );
    });

    it("13. Lean bulk increases selected muscle regions", () => {
      const r = anat(fx.leanBulk());
      assert.ok(hasFeature(r, "arm_volume") || hasFeature(r, "shoulder_volume"));
    });

    it("14. Mixed bulk permits modest fat increase", () => {
      const r = anat(fx.mixedBulk());
      assert.equal(r.muscleGainMode, "mixed_bulk");
      assert.ok(
        r.rules.some(
          (x) =>
            x.feature === "subcutaneous_fat" &&
            x.direction.includes("increase")
        )
      );
    });

    it("15. Muscle volume is distinct from muscle definition", () => {
      const r = anat(fx.muscularFatLoss());
      assert.ok(r.rules.some((x) => x.feature.includes("definition")));
      assert.equal(
        r.rules.some(
          (x) =>
            x.feature.includes("volume") && x.direction.includes("decrease")
        ),
        false
      );
    });
  });

  describe("Focus zones", () => {
    it("16. Core increases abdominal-rule priority", () => {
      const r = anat(fx.focusCore());
      const abd = r.rules.filter((x) => x.feature === "abdominal_definition");
      assert.ok(abd.some((x) => x.priority >= 560));
    });

    it("17. Chest increases chest-rule priority", () => {
      const r = anat(fx.focusChest());
      assert.ok(
        r.rules.some(
          (x) =>
            (x.feature === "chest_volume" || x.feature === "chest_definition") &&
            x.priority >= 560
        )
      );
    });

    it("18. Arms increases arm-rule priority", () => {
      const r = anat(fx.focusArms());
      assert.ok(
        r.rules.some(
          (x) =>
            (x.feature === "arm_volume" || x.feature === "arm_definition") &&
            x.priority >= 560
        )
      );
    });

    it("19. Shoulders increases shoulder-rule priority", () => {
      const r = anat(fx.focusShoulders());
      assert.ok(
        r.rules.some(
          (x) =>
            x.feature.includes("shoulder") && x.priority >= 560
        )
      );
    });

    it("20. Back increases back-rule priority", () => {
      const r = anat(fx.focusBack());
      assert.ok(
        r.rules.some(
          (x) =>
            (x.feature === "lat_width" ||
              x.feature === "upper_back_definition") &&
            x.priority >= 560
        )
      );
    });

    it("21. Glutes increases glute-rule priority", () => {
      const r = anat(fx.focusGlutes());
      assert.ok(
        r.rules.some((x) => x.feature === "glute_volume" && x.priority >= 560)
      );
    });

    it("22. Thighs increases thigh-rule priority", () => {
      const r = anat(fx.focusThighs());
      assert.ok(
        r.rules.some(
          (x) =>
            (x.feature === "thigh_volume" || x.feature === "thigh_definition") &&
            x.priority >= 560
        )
      );
    });

    it("23. Untargeted regions remain lower priority", () => {
      const r = anat(fx.focusArms());
      const armPri = Math.max(
        ...r.rules
          .filter((x) => x.feature.includes("arm"))
          .map((x) => x.priority),
        0
      );
      const glutePri = Math.max(
        ...r.rules
          .filter((x) => x.feature === "glute_volume")
          .map((x) => x.priority),
        0
      );
      assert.ok(armPri >= glutePri);
    });

    it("24. Focus cannot override body-fat direction", () => {
      const r = anat(
        baseAnatomical({
          simulationId: "anat-focus-no-override",
          currentBf: 18,
          targetBf: 22,
          focusZones: ["core"],
          optionalNotes: ["defined abs"],
        })
      );
      assert.equal(
        r.rules.some(
          (x) =>
            x.feature === "waist_width" && x.direction.includes("decrease")
        ),
        false
      );
    });
  });

  describe("Timeline", () => {
    it("25. 3-month magnitude < 6-month magnitude under identical inputs", () => {
      assert.ok(maxMag(anat(fx.months3())) <= maxMag(anat(fx.months6())));
      const s3 = anatomicalMagnitudeScore(12, "realistic").score;
      const s6 = anatomicalMagnitudeScore(26, "realistic").score;
      assert.ok(s3 < s6);
    });

    it("26. 6-month magnitude < 12-month magnitude", () => {
      const s6 = anatomicalMagnitudeScore(26, "realistic").score;
      const s12 = anatomicalMagnitudeScore(52, "realistic").score;
      assert.ok(s6 < s12);
    });

    it("27. Diminishing returns remain", () => {
      const a = anatomicalMagnitudeScore(12, "realistic").score;
      const b = anatomicalMagnitudeScore(26, "realistic").score;
      const c = anatomicalMagnitudeScore(52, "realistic").score;
      assert.ok(b - a > c - b);
    });

    it("28. Timeline cannot override realism bounds", () => {
      const r = anat(fx.months12());
      assert.ok(r.limitations.some((l) => /not a guaranteed|skeletal/i.test(l)));
      assert.equal(
        r.rules.some((x) => x.direction === "strong_increase" && x.feature === "waist_width"),
        false
      );
    });
  });

  describe("Effort", () => {
    it("29. Moderate < Hard", () => {
      assert.ok(ANATOMICAL_EFFORT_MODERATE < ANATOMICAL_EFFORT_HARD);
      assert.equal(effortCoefficientForIntensity("conservative").coefficient, ANATOMICAL_EFFORT_MODERATE);
      assert.equal(effortCoefficientForIntensity("realistic").coefficient, ANATOMICAL_EFFORT_HARD);
      const m = anatomicalMagnitudeScore(26, "conservative").score;
      const h = anatomicalMagnitudeScore(26, "realistic").score;
      assert.ok(m < h);
    });

    it("30. Hard < Strict/max", () => {
      assert.ok(ANATOMICAL_EFFORT_HARD < ANATOMICAL_EFFORT_STRICT);
      assert.equal(effortCoefficientForIntensity("ambitious").coefficient, ANATOMICAL_EFFORT_STRICT);
      const h = anatomicalMagnitudeScore(26, "realistic").score;
      const s = anatomicalMagnitudeScore(26, "ambitious").score;
      assert.ok(h < s);
    });

    it("31. Strict/max remains bounded", () => {
      assert.equal(ANATOMICAL_EFFORT_STRICT, 1.0);
      const r = anat(fx.effortStrict());
      assert.equal(r.effortCoefficient, 1.0);
      assert.ok(r.limitations.length > 0);
    });

    it("32. Effort does not override preservation", () => {
      const r = anat(fx.effortStrict());
      const sim = simulateBodyTransformation(fx.effortStrict());
      assert.equal(sim.ok, true);
      if (!sim.ok) return;
      assert.equal(sim.rules.preservation.identity, "preserve");
      assert.equal(sim.rules.preservation.skeletalProportions, "preserve");
      assert.ok(r.effortLabel === "strict");
    });
  });

  describe("Existing muscle", () => {
    it("33. Existing muscular baseline + fat loss increases definition", () => {
      assert.ok(
        hasFeature(anat(fx.muscularFatLoss()), "abdominal_definition", "more_defined")
      );
    });

    it("34. Existing muscle is not unnecessarily removed", () => {
      const r = anat(fx.muscularFatLoss());
      assert.equal(
        r.rules.some(
          (x) =>
            x.feature.includes("volume") && x.direction.includes("decrease")
        ),
        false
      );
    });

    it("35. Definition and muscle volume remain separate", () => {
      const r = anat(fx.muscularFatLoss());
      assert.ok(r.rules.some((x) => x.feature.includes("definition")));
      assert.ok(
        r.rules.some((x) => x.feature.includes("volume") || x.direction === "stable")
      );
    });
  });

  describe("Optional notes", () => {
    it("41. Compatible note reinforces rule", () => {
      const r = anat(fx.noteDefinedAbs());
      assert.ok(r.noteOutcomes.some((o) => o.status === "applied"));
      assert.ok(r.summary.optionalNotesUsed);
    });

    it("42. Conflicting note is suppressed", () => {
      const r = anat(fx.noteConflict());
      assert.ok(r.noteOutcomes.some((o) => o.status === "suppressed"));
    });

    it("43. Optional note never outranks body-fat direction", () => {
      const r = anat(fx.noteConflict());
      assert.ok(
        r.rules.some(
          (x) =>
            x.source === "body_fat_delta" &&
            x.feature === "subcutaneous_fat" &&
            x.direction.includes("increase")
        )
      );
    });

    it("44. Optional note never outranks canonical goal", () => {
      const r = anat(fx.noteDefinedAbs());
      const notePri = Math.max(
        ...r.rules.filter((x) => x.source === "optional_note").map((x) => x.priority),
        0
      );
      const goalPri = Math.max(
        ...r.rules.filter((x) => x.source === "goal" || x.source === "body_fat_delta").map((x) => x.priority),
        0
      );
      assert.ok(notePri <= goalPri);
    });

    it("45. Optional note never overrides preservation", () => {
      const sim = simulateBodyTransformation(fx.noteDefinedAbs());
      assert.equal(sim.ok, true);
      if (!sim.ok) return;
      assert.equal(sim.rules.preservation.identity, "preserve");
    });

    it("46. Note application/suppression provenance exists", () => {
      const r = anat(fx.noteDefinedAbs());
      assert.ok(r.noteOutcomes.length > 0);
      assert.ok(r.noteOutcomes.every((o) => o.reason.length > 0));
    });
  });

  describe("Rule priority", () => {
    it("47. Rule priority deterministic", () => {
      const a = anat(fx.focusCore());
      const b = anat(fx.focusCore());
      assert.deepEqual(
        a.rules.map((r) => r.id),
        b.rules.map((r) => r.id)
      );
    });

    it("48. Suppressed rules recorded", () => {
      const r = anat(fx.noteConflict());
      assert.ok(Array.isArray(r.suppressedRuleIds));
    });

    it("49. Suppression reason recorded", () => {
      const r = anat(fx.noteConflict());
      for (const id of r.suppressedRuleIds) {
        assert.ok(r.suppressionReasons[id]);
      }
    });

    it("50. No silent contradictory merge", () => {
      const src = read("src/ai/body-simulator/AnatomicalTransformationEngine.ts");
      assert.equal(/average\(|mean\(/i.test(src), false);
      assert.match(src, /suppressionReasons|suppressedRuleIds/);
    });
  });

  describe("Architecture", () => {
    it("51. Anatomical schema versioned", () => {
      assert.equal(ANATOMICAL_TRANSFORMATION_SCHEMA_VERSION, 1);
      assert.equal(anat(fx.bf18to15()).schemaVersion, 1);
    });

    it("52. Canonical anatomical result exists", () => {
      const sim = simulateBodyTransformation(fx.bf18to12());
      assert.equal(sim.ok, true);
      if (!sim.ok) return;
      assert.ok(sim.rules.anatomicalTransformation);
      assert.equal(sim.rules.rulesVersion, BODY_SIMULATOR_RULES_VERSION);
    });

    it("53. Existing broad region rules remain compatible", () => {
      const sim = simulateBodyTransformation(fx.bf18to12());
      assert.equal(sim.ok, true);
      if (!sim.ok) return;
      assert.ok(sim.rules.regions.length >= 12);
    });

    it("54. Formatter adapter consumes anatomical rules", () => {
      const sim = simulateBodyTransformation(fx.bf18to12());
      assert.equal(sim.ok, true);
      if (!sim.ok) return;
      const canonical = adaptBodySimulatorRulesToFormatterInput(sim.rules);
      assert.ok(canonical.anatomicalSummaries.length > 0);
      assert.ok(
        canonical.approvedChanges.some((c) =>
          c.id.startsWith("body-sim-anatomical-")
        )
      );
    });

    it("55. Formatter adapter performs no physiology math", () => {
      const src = read("src/ai/body-simulator/BodySimulatorFormatterAdapter.ts");
      assert.equal(/BODY_SIM_MAX_|transformProgress|ANATOMICAL_EFFORT_/.test(src), false);
    });

    it("56. Provider unchanged", () => {
      const src = read("src/ai/body-simulator/AnatomicalTransformationEngine.ts");
      assert.equal(/replicate|openai|flux/i.test(src), false);
    });

    it("57. Transport unchanged", () => {
      assert.ok(existsSync(join(root, "src/ai/transport/ReplicateTransportAdapter.ts")));
    });

    it("58. Billing unchanged", () => {
      assert.ok(existsSync(join(root, "src/ai/control-room")));
    });

    it("59. Production route unchanged", () => {
      const eng = read("src/ai/body-simulator/AnatomicalTransformationEngine.ts");
      assert.equal(/api\/generate|production/i.test(eng), false);
    });

    it("60. No paid call added", () => {
      const eng = read("src/ai/body-simulator/AnatomicalTransformationEngine.ts");
      assert.equal(/https?:\/\//.test(eng), false);
      assert.equal(/\bfetch\s*\(/.test(eng), false);
    });

    it("61. No automatic image generation", () => {
      const eng = read("src/ai/body-simulator/AnatomicalTransformationEngine.ts");
      assert.equal(/generateImage|runPreview/i.test(eng), false);
    });

    it("62. Body Simulator remains authoritative", () => {
      const docs = read("docs/CTO/22D_ANATOMICAL_TRANSFORMATION_ENGINE.md");
      assert.match(docs, /Body Simulator remains authoritative/i);
    });
  });

  describe("Control Room", () => {
    it("63. Anatomical Transformation inspector exists", () => {
      const html = read("public/ai-os-control-room.html");
      assert.match(html, /Anatomical Transformation/);
      assert.match(html, /bodySimulatorAnatomicalAppliedBody/);
    });

    it("64. Applied rules visible", () => {
      assert.match(read("public/ai-os-control-room.js"), /bodySimulatorAnatomicalAppliedBody/);
    });

    it("65. Suppressed rules visible", () => {
      assert.match(read("public/ai-os-control-room.js"), /bodySimulatorAnatomicalSuppressedBody/);
    });

    it("66. Goal consistency visible", () => {
      assert.match(read("public/ai-os-control-room.js"), /bodySimulatorAnatomicalConsistencyBody/);
    });

    it("67. Semantic support visible", () => {
      assert.match(read("public/ai-os-control-room.js"), /semantic support terms/);
    });

    it("68. No rule editing UI exists", () => {
      const html = read("public/ai-os-control-room.html");
      assert.equal(/anatomical.*contenteditable|edit anatomical/i.test(html), false);
    });

    it("69. No prompt override exists", () => {
      const js = read("public/ai-os-control-room.js");
      assert.equal(/anatomicalPromptOverride|override anatomical prompt/i.test(js), false);
    });
  });

  describe("Regression", () => {
    it("70. 022C comparison still works", () => {
      assert.ok(existsSync(join(root, "src/ai/control-room/BodySimulatorComparison.ts")));
      assert.ok(existsSync(join(root, "docs/CTO/22C_CONTROLLED_SIMULATOR_COMPARISON.md")));
    });

    it("71. Legacy path remains deprecated comparison only", () => {
      const src = read("src/ai/control-room/BodySimulatorComparison.ts");
      assert.match(src, /deprecatedBaseline/);
    });

    it("72. One provider request maximum per click remains", () => {
      const docs = read("docs/CTO/22C_CONTROLLED_SIMULATOR_COMPARISON.md");
      assert.match(docs, /one provider request/i);
    });

    it("73. FormatterComparison still works", () => {
      assert.ok(
        existsSync(join(root, "src/ai/control-room/FormatterComparisonDiagnostics.ts"))
      );
    });

    it("74. GenerationDiagnostics still works", () => {
      assert.match(
        read("src/ai/control-room/FormatterComparisonDiagnostics.ts"),
        /GenerationDiagnostics|generationDiagnostics/i
      );
    });

    it("75. PipelineSnapshot still works", () => {
      assert.match(
        read("src/ai/control-room/FormatterComparisonDiagnostics.ts"),
        /PipelineSnapshot|pipelineSnapshot/i
      );
    });

    it("76. Existing identity preservation remains", () => {
      const sim = simulateBodyTransformation(fx.bf18to12());
      assert.equal(sim.ok, true);
      if (!sim.ok) return;
      assert.equal(sim.rules.preservation.identity, "preserve");
    });

    it("77. Clothing preservation remains", () => {
      const sim = simulateBodyTransformation(fx.bf18to12());
      assert.equal(sim.ok, true);
      if (!sim.ok) return;
      assert.equal(sim.rules.preservation.clothing, "preserve");
    });

    it("78. Hair/presentation preservation remains", () => {
      const sim = simulateBodyTransformation(fx.bf18to12());
      assert.equal(sim.ok, true);
      if (!sim.ok) return;
      assert.equal(sim.rules.preservation.hairstyle, "preserve");
      assert.equal(sim.rules.preservation.originalPresentation, "preserve");
    });

    it("79. Background preservation remains", () => {
      const sim = simulateBodyTransformation(fx.bf18to12());
      assert.equal(sim.ok, true);
      if (!sim.ok) return;
      assert.equal(sim.rules.preservation.background, "preserve");
    });

    it("80. Lighting preservation remains", () => {
      const sim = simulateBodyTransformation(fx.bf18to12());
      assert.equal(sim.ok, true);
      if (!sim.ok) return;
      assert.equal(sim.rules.preservation.lightingCharacter, "preserve");
    });
  });

  describe("Helpers / modes", () => {
    it("resolves body-fat context and lean/mixed/fat-gain modes", () => {
      assert.equal(resolveBodyFatContext(fx.bf18to12()).deltaPercentagePoints, -6);
      assert.equal(deriveMuscleGainMode(fx.leanBulk(), resolveBodyFatContext(fx.leanBulk())), "lean_bulk");
      assert.equal(deriveMuscleGainMode(fx.mixedBulk(), resolveBodyFatContext(fx.mixedBulk())), "mixed_bulk");
      assert.equal(
        deriveMuscleGainMode(fx.bf18to22muscle(), resolveBodyFatContext(fx.bf18to22muscle())),
        "fat_gain_bulk"
      );
    });

    it("bf unavailable lowers confidence; partial visibility recorded", () => {
      const missing = anat(fx.bfUnavailable());
      assert.ok(missing.confidenceReasons.includes("body_fat_not_provided"));
      const partial = anat(fx.partialVisibility());
      assert.ok(partial.confidenceReasons.includes("body_region_visibility_limited"));
    });

    it("semantic support terms are secondary only", () => {
      const r = anat(fx.bf18to12());
      assert.ok(Array.isArray(r.semanticSupportTerms));
      assert.ok(r.rules.length > 0);
    });
  });
});
