/**
 * Demand 022 — Body Simulator v1 tests (1–134).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BODY_SIMULATION_GOAL_TYPES,
  BODY_SIMULATOR_FIXTURE_BUILDERS,
  BODY_SIMULATOR_FORBIDDEN_OUTPUTS,
  BODY_SIMULATOR_INPUT_SCHEMA_VERSION,
  BODY_SIMULATOR_PRIMARY_PURPOSE,
  BODY_SIMULATOR_REGIONS,
  BODY_SIMULATOR_RULES_SCHEMA_VERSION,
  BODY_SIMULATOR_RULES_VERSION,
  BODY_SIMULATOR_TIMELINE_MAX_WEEKS,
  BODY_SIMULATOR_TIMELINE_MIN_WEEKS,
  BODY_SIM_INTENSITY_AMBITIOUS_EXPECTED,
  BODY_SIM_INTENSITY_CONSERVATIVE_EXPECTED,
  BODY_SIM_INTENSITY_REALISTIC_EXPECTED,
  BODY_SIM_MAX_MUSCLE_GAIN_KG_ABSOLUTE,
  BODY_SIM_MED_MAX_MUSCLE_INFLUENCE,
  BODY_SIM_MED_MAX_WEIGHT_FAT_INFLUENCE,
  BODY_SIM_MED_METABOLISM_SCALE,
  BODY_SIM_MUSCLE_RATE_ADVANCED,
  BODY_SIM_MUSCLE_RATE_BEGINNER,
  DEFAULT_BODY_SIMULATION_INTENSITY,
  assessBodySimulatorReadiness,
  computeTimelineMagnitude,
  createDefaultMedicationEffects,
  fixtureAdvancedMuscleGain24w,
  fixtureAmbitiousWeightLoss12w,
  fixtureBeginnerMuscleGain24w,
  fixtureConservativeWeightLoss12w,
  fixtureDeviceMeasuredBodyFat,
  fixtureGeneralFitnessLimitedBaseline,
  fixtureMedAppetiteDecrease,
  fixtureMedAppetiteIncrease,
  fixtureMissingBodyFat,
  fixtureNoMedicationEffect,
  fixtureRealisticWeightLoss12w,
  fixtureSingleFrontView,
  fixtureUnrealisticTargetModerated,
  fixtureUnusualProportions,
  intensityExpectedMultiplier,
  listBodySimulatorFixtures,
  metabolismModifier,
  appetiteModifier,
  muscleRateForExperience,
  projectBodySimulatorRules,
  serializeBodySimulatorProjection,
  simulateBodyTransformation,
  validateBodySimulatorInput,
  type BodySimulatorInput,
} from "../body-simulator";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const simDir = join(root, "src", "ai", "body-simulator");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function readSim(file: string): string {
  return readFileSync(join(simDir, file), "utf8");
}

function mustOk(input: BodySimulatorInput) {
  const result = simulateBodyTransformation(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("expected ok");
  return result.rules;
}

function withTimeline(weeks: number, base = fixtureRealisticWeightLoss12w()) {
  const input = structuredClone(base);
  input.simulationId = `tl-${weeks}`;
  input.goal.timelineWeeks = weeks;
  input.goal.targetWeightChangeKg = null;
  input.goal.targetBodyFatChangePercentagePoints = null;
  input.goal.targetMuscleChangeKg = null;
  return input;
}

function absExpected(rules: ReturnType<typeof mustOk>) {
  return Math.abs(rules.wholeBodyChange.weightChangeKg.expected ?? 0);
}

describe("DEMAND_022 Body Simulator v1", () => {
  // ── Architecture ──────────────────────────────────────────────────────────
  describe("Architecture", () => {
    it("1. Input schema is versioned", () => {
      assert.equal(BODY_SIMULATOR_INPUT_SCHEMA_VERSION, 1);
      assert.equal(fixtureRealisticWeightLoss12w().schemaVersion, 1);
    });

    it("2. Output rules schema is versioned", () => {
      assert.equal(BODY_SIMULATOR_RULES_SCHEMA_VERSION, 1);
      const rules = mustOk(fixtureRealisticWeightLoss12w());
      assert.equal(rules.schemaVersion, 1);
      assert.equal(rules.rulesVersion, BODY_SIMULATOR_RULES_VERSION);
    });

    it("3. Transformation Rules are canonical", () => {
      assert.match(BODY_SIMULATOR_PRIMARY_PURPOSE, /Body Simulator/);
      const docs = read("docs/CTO/22_BODY_SIMULATOR_V1.md");
      assert.match(docs, /canonical/i);
      const constitution = read("docs/CTO/00_AI_CONSTITUTION.md");
      assert.match(
        constitution,
        /Body Simulator Transformation Rules are the canonical/
      );
    });

    it("4. No prompt is produced by the engine", () => {
      const rules = mustOk(fixtureRealisticWeightLoss12w());
      const json = JSON.stringify(rules);
      assert.equal("prompt" in rules, false);
      assert.equal(json.includes("negativePrompt"), false);
      assert.equal(/write a prompt|system prompt/i.test(json), false);
    });

    it("5. No provider field exists in canonical rules", () => {
      const rules = mustOk(fixtureRealisticWeightLoss12w());
      const json = JSON.stringify(rules);
      assert.equal(/"provider"|"modelId"|"replicate"|"openai"/i.test(json), false);
    });

    it("6. No provider implementation is added", () => {
      for (const f of [
        "BodySimulatorEngine.ts",
        "BodySimulatorRules.ts",
        "BodySimulatorValidation.ts",
      ]) {
        const src = readSim(f);
        assert.equal(/from ["'][^"']*replicate/i.test(src), false, f);
        assert.equal(/from ["'][^"']*openai/i.test(src), false, f);
        assert.equal(/\bfetch\s*\(/.test(src), false, f);
      }
    });

    it("7. No paid request is added", () => {
      const eng = readSim("BodySimulatorEngine.ts");
      assert.equal(/https?:\/\//.test(eng), false);
      assert.equal(/api\.replicate|api\.openai/i.test(eng), false);
    });

    it("8. No image generation is executed", () => {
      const eng = readSim("BodySimulatorEngine.ts");
      assert.equal(/generateImage|createPrediction|sharp\(/i.test(eng), false);
    });
  });

  // ── Goals ─────────────────────────────────────────────────────────────────
  describe("Goals", () => {
    it("9. All five approved goal types are supported", () => {
      assert.equal(BODY_SIMULATION_GOAL_TYPES.length, 5);
      for (const type of BODY_SIMULATION_GOAL_TYPES) {
        const input = fixtureRealisticWeightLoss12w();
        input.goal.type = type;
        input.simulationId = `goal-${type}`;
        assert.equal(simulateBodyTransformation(input).ok, true);
      }
    });

    it("10. Unsupported goal is rejected", () => {
      const input = fixtureRealisticWeightLoss12w() as BodySimulatorInput & {
        goal: { type: string };
      };
      (input.goal as { type: string }).type = "ideal_body";
      const result = simulateBodyTransformation(input);
      assert.equal(result.ok, false);
    });

    it("11. Weight-loss direction is correct", () => {
      const rules = mustOk(fixtureRealisticWeightLoss12w());
      assert.ok((rules.wholeBodyChange.weightChangeKg.expected ?? 0) < 0);
      assert.ok(
        (rules.wholeBodyChange.bodyFatChangePercentagePoints.expected ?? 0) < 0
      );
    });

    it("12. Fat-loss-with-preservation direction is correct", () => {
      const input = fixtureRealisticWeightLoss12w();
      input.goal.type = "fat_loss_with_muscle_preservation";
      input.goal.targetMuscleChangeKg = 0.5;
      const rules = mustOk(input);
      assert.ok(
        (rules.wholeBodyChange.bodyFatChangePercentagePoints.expected ?? 0) < 0
      );
      assert.ok((rules.wholeBodyChange.muscleChangeKg.expected ?? 0) >= 0);
    });

    it("13. Muscle-gain direction is correct", () => {
      const rules = mustOk(fixtureBeginnerMuscleGain24w());
      assert.ok((rules.wholeBodyChange.muscleChangeKg.expected ?? 0) > 0);
    });

    it("14. Recomposition supports fat decrease and muscle stability/increase", () => {
      const input = fixtureRealisticWeightLoss12w();
      input.goal.type = "body_recomposition";
      input.goal.timelineWeeks = 16;
      input.goal.targetMuscleChangeKg = 1;
      const rules = mustOk(input);
      assert.ok(
        (rules.wholeBodyChange.bodyFatChangePercentagePoints.expected ?? 0) < 0
      );
      assert.ok((rules.wholeBodyChange.muscleChangeKg.expected ?? 0) >= 0);
    });

    it("15. General fitness uses modest change when targets incomplete", () => {
      const rules = mustOk(fixtureGeneralFitnessLimitedBaseline());
      const w = Math.abs(rules.wholeBodyChange.weightChangeKg.expected ?? 0);
      const weightLossNullTargets = withTimeline(12);
      weightLossNullTargets.goal.type = "weight_loss";
      const wl = absExpected(mustOk(weightLossNullTargets));
      assert.ok(w < wl);
      assert.ok(w < 3);
    });
  });

  // ── Timeline ──────────────────────────────────────────────────────────────
  describe("Timeline", () => {
    it("16. Four weeks is accepted", () => {
      assert.equal(simulateBodyTransformation(withTimeline(4)).ok, true);
    });

    it("17. Fifty-two weeks is accepted", () => {
      assert.equal(simulateBodyTransformation(withTimeline(52)).ok, true);
    });

    it("18. Below four weeks is rejected", () => {
      const r = simulateBodyTransformation(withTimeline(3));
      assert.equal(r.ok, false);
    });

    it("19. Above fifty-two weeks is rejected", () => {
      const r = simulateBodyTransformation(withTimeline(53));
      assert.equal(r.ok, false);
    });

    it("20. Twelve weeks yields more change than four weeks under equal input", () => {
      const a = absExpected(mustOk(withTimeline(4)));
      const b = absExpected(mustOk(withTimeline(12)));
      assert.ok(b > a);
    });

    it("21. Twenty-four weeks yields more change than twelve weeks", () => {
      const a = absExpected(mustOk(withTimeline(12)));
      const b = absExpected(mustOk(withTimeline(24)));
      assert.ok(b > a);
    });

    it("22. Timeline scaling includes diminishing returns", () => {
      const m4 = computeTimelineMagnitude(4).relativeMagnitude;
      const m12 = computeTimelineMagnitude(12).relativeMagnitude;
      const m24 = computeTimelineMagnitude(24).relativeMagnitude;
      const m52 = computeTimelineMagnitude(52).relativeMagnitude;
      assert.ok(m4 < m12 && m12 < m24 && m24 < m52);
      // Not pure linear: gain 12→24 vs 4→12
      const early = m12 - m4;
      const later = m24 - m12;
      assert.ok(later < early);
      assert.equal(BODY_SIMULATOR_TIMELINE_MIN_WEEKS, 4);
      assert.equal(BODY_SIMULATOR_TIMELINE_MAX_WEEKS, 52);
    });

    it("23. Timeline is not silently changed", () => {
      const rules = mustOk(withTimeline(17));
      assert.equal(rules.goal.timelineWeeks, 17);
    });
  });

  // ── Intensity ─────────────────────────────────────────────────────────────
  describe("Intensity", () => {
    it("24. Realistic is the default", () => {
      assert.equal(DEFAULT_BODY_SIMULATION_INTENSITY, "realistic");
      assert.equal(
        intensityExpectedMultiplier("realistic"),
        BODY_SIM_INTENSITY_REALISTIC_EXPECTED
      );
    });

    it("25. Conservative produces lower expected magnitude", () => {
      const c = absExpected(mustOk(fixtureConservativeWeightLoss12w()));
      const r = absExpected(mustOk(fixtureRealisticWeightLoss12w()));
      assert.ok(c < r);
      assert.ok(
        BODY_SIM_INTENSITY_CONSERVATIVE_EXPECTED <
          BODY_SIM_INTENSITY_REALISTIC_EXPECTED
      );
    });

    it("26. Ambitious produces higher bounded magnitude", () => {
      const base = fixtureRealisticWeightLoss12w();
      base.goal.targetWeightChangeKg = null;
      base.goal.targetBodyFatChangePercentagePoints = null;
      const realistic = structuredClone(base);
      realistic.goal.intensity = "realistic";
      const ambitious = structuredClone(base);
      ambitious.goal.intensity = "ambitious";
      ambitious.simulationId = "amb-cmp";
      assert.ok(absExpected(mustOk(ambitious)) > absExpected(mustOk(realistic)));
      assert.ok(
        BODY_SIM_INTENSITY_AMBITIOUS_EXPECTED >
          BODY_SIM_INTENSITY_REALISTIC_EXPECTED
      );
    });

    it("27. Ambitious cannot exceed realism constraints", () => {
      const rules = mustOk(fixtureAmbitiousWeightLoss12w());
      const fat = Math.abs(
        rules.wholeBodyChange.bodyFatChangePercentagePoints.expected ?? 0
      );
      assert.ok(fat <= 12);
      assert.ok(
        rules.limitations.some((l) => /ambitious/i.test(l))
      );
    });

    it("28. Intensity cannot override preservation rules", () => {
      const rules = mustOk(fixtureAmbitiousWeightLoss12w());
      assert.equal(rules.preservation.identity, "preserve");
      assert.equal(rules.preservation.clothing, "preserve");
      assert.equal(rules.preservation.skeletalProportions, "preserve");
    });
  });

  // ── Profile ───────────────────────────────────────────────────────────────
  describe("Profile", () => {
    it("29. Age is never inferred from appearance", () => {
      const eng = readSim("BodySimulatorEngine.ts");
      assert.equal(/estimateAge|ageFrom|apparentAge\s*=/i.test(eng), false);
      const input = fixtureRealisticWeightLoss12w();
      input.profile.ageYears = null;
      const rules = mustOk(input);
      assert.equal(JSON.stringify(rules).includes("estimatedAge"), false);
    });

    it("30. Sex-for-physiology is not treated as visual gender", () => {
      const types = readSim("BodySimulatorTypes.ts");
      assert.match(types, /sexForPhysiology/);
      assert.equal(/visualGender|genderPresentation/.test(types), false);
    });

    it("31. Height may remain unknown", () => {
      const input = fixtureRealisticWeightLoss12w();
      input.profile.heightCm = null;
      assert.equal(simulateBodyTransformation(input).ok, true);
    });

    it("32. Body fat may remain unknown", () => {
      assert.equal(simulateBodyTransformation(fixtureMissingBodyFat()).ok, true);
      const rules = mustOk(fixtureMissingBodyFat());
      assert.ok(rules.confidence.reasons.includes("body_fat_not_provided"));
    });

    it("33. Measured and user-estimated body fat remain distinguishable", () => {
      const measured = mustOk(fixtureDeviceMeasuredBodyFat());
      const estimated = mustOk(fixtureRealisticWeightLoss12w());
      assert.equal(measured.baseline.bodyFatBasis, "device_measurement");
      assert.equal(estimated.baseline.bodyFatBasis, "user_estimate");
    });

    it("34. Future visual estimate does not overwrite measured data", () => {
      const input = fixtureDeviceMeasuredBodyFat();
      input.profile.bodyFatBasis = "device_measurement";
      input.profile.currentBodyFatPercent = 28.5;
      input.bodyAnalysis = {
        schemaVersion: 1,
        status: "not_run",
        observations: [],
        confidence: "not_applicable",
        confidenceReasons: [],
        limitations: [],
      };
      const rules = mustOk(input);
      assert.equal(rules.baseline.bodyFatBasis, "device_measurement");
    });

    it("35. Unusual proportions are not rejected", () => {
      const result = simulateBodyTransformation(fixtureUnusualProportions());
      assert.equal(result.ok, true);
      const errors = validateBodySimulatorInput(fixtureUnusualProportions());
      assert.equal(errors.length, 0);
    });
  });

  // ── Activity ──────────────────────────────────────────────────────────────
  describe("Activity", () => {
    it("36. Training experience affects muscle-gain range conservatively", () => {
      const beginner = mustOk(fixtureBeginnerMuscleGain24w());
      const advanced = mustOk(fixtureAdvancedMuscleGain24w());
      assert.ok(
        (beginner.wholeBodyChange.muscleChangeKg.expected ?? 0) >
          (advanced.wholeBodyChange.muscleChangeKg.expected ?? 0)
      );
    });

    it("37. Advanced training does not receive novice gain assumptions", () => {
      assert.ok(BODY_SIM_MUSCLE_RATE_ADVANCED < BODY_SIM_MUSCLE_RATE_BEGINNER);
      assert.equal(muscleRateForExperience("advanced"), BODY_SIM_MUSCLE_RATE_ADVANCED);
    });

    it("38. Missing experience lowers confidence", () => {
      const input = fixtureBeginnerMuscleGain24w();
      input.profile.trainingExperience = "not_provided";
      const rules = mustOk(input);
      assert.ok(rules.confidence.reasons.includes("training_experience_missing"));
    });

    it("39. Training consistency affects confidence/range", () => {
      const high = fixtureBeginnerMuscleGain24w();
      high.activity.trainingConsistency = "high";
      high.simulationId = "cons-high";
      const low = fixtureBeginnerMuscleGain24w();
      low.activity.trainingConsistency = "low";
      low.simulationId = "cons-low";
      assert.ok(
        (mustOk(high).wholeBodyChange.muscleChangeKg.expected ?? 0) >
          (mustOk(low).wholeBodyChange.muscleChangeKg.expected ?? 0)
      );
    });

    it("40. No exercise prescription is produced", () => {
      const json = JSON.stringify(mustOk(fixtureRealisticWeightLoss12w()));
      assert.equal(/do \d+ sets|prescribe.*exercise|workout plan/i.test(json), false);
    });

    it("41. No calorie prescription is produced", () => {
      const json = JSON.stringify(mustOk(fixtureRealisticWeightLoss12w()));
      assert.equal(/kcal|calorie prescription|eat \d+/i.test(json), false);
    });
  });

  // ── Medication ────────────────────────────────────────────────────────────
  describe("Medication", () => {
    it("42. medicationMayAffectWeight false applies no modifier", () => {
      const rules = mustOk(fixtureNoMedicationEffect());
      assert.equal(
        rules.provenance.some((p) => p.source === "medication_effect"),
        false
      );
    });

    it("43. Appetite decrease applies only a bounded modifier", () => {
      const base = absExpected(mustOk(fixtureNoMedicationEffect()));
      const dec = absExpected(mustOk(fixtureMedAppetiteDecrease()));
      assert.ok(dec >= base);
      assert.ok(Math.abs(dec - base) / Math.max(base, 0.01) <= 0.2);
      assert.ok(BODY_SIM_MED_MAX_WEIGHT_FAT_INFLUENCE <= 0.15);
    });

    it("44. Appetite increase applies only a bounded modifier", () => {
      const base = absExpected(mustOk(fixtureNoMedicationEffect()));
      const inc = absExpected(mustOk(fixtureMedAppetiteIncrease()));
      assert.ok(inc <= base);
    });

    it("45. Energy decrease may reduce training-support assumption", () => {
      assert.ok(appetiteModifier("moderate_decrease") > 0);
      const input = fixtureMedAppetiteDecrease();
      input.medicationEffects = createDefaultMedicationEffects();
      input.medicationEffects.medicationMayAffectWeight = true;
      input.medicationEffects.energyLevel = "moderate_decrease";
      input.medicationEffects.evidence.confidence = "low";
      const rules = mustOk(input);
      assert.ok(rules.provenance.some((p) => p.source === "medication_effect"));
    });

    it("46. Energy increase may modestly support activity assumption", () => {
      const input = fixtureNoMedicationEffect();
      input.medicationEffects.medicationMayAffectWeight = true;
      input.medicationEffects.energyLevel = "moderate_increase";
      input.medicationEffects.evidence.confidence = "low";
      const rules = mustOk(input);
      assert.ok(rules.provenance.some((p) => p.sourcePath.includes("energyLevel")));
    });

    it("47. Metabolism tendency has lower influence than goal/timeline/activity", () => {
      assert.ok(BODY_SIM_MED_METABOLISM_SCALE < 1);
      assert.ok(
        Math.abs(metabolismModifier("moderate_decrease")) <
          Math.abs(appetiteModifier("moderate_decrease"))
      );
    });

    it("48. Muscle-preservation effect remains bounded", () => {
      assert.ok(BODY_SIM_MED_MAX_MUSCLE_INFLUENCE <= 0.15);
    });

    it("49. Unknown effect does not fabricate direction", () => {
      const input = fixtureNoMedicationEffect();
      input.medicationEffects.medicationMayAffectWeight = true;
      input.medicationEffects.appetite = "unknown";
      input.medicationEffects.evidence.confidence = "low";
      const rules = mustOk(input);
      assert.ok(rules.confidence.reasons.includes("medication_effect_unknown"));
      assert.equal(appetiteModifier("unknown"), 0);
    });

    it("50. Medication effect retains user-declared provenance", () => {
      const rules = mustOk(fixtureMedAppetiteDecrease());
      assert.ok(
        rules.provenance.some(
          (p) =>
            p.source === "medication_effect" &&
            p.sourcePath.includes("appetite")
        )
      );
      assert.equal(
        fixtureMedAppetiteDecrease().medicationEffects.evidence.origin,
        "user_declared"
      );
    });

    it("51. No medication name exists", () => {
      const types = readSim("BodySimulatorTypes.ts");
      assert.equal(/medicationName|drugName|brandName/i.test(types), false);
      const json = JSON.stringify(mustOk(fixtureMedAppetiteDecrease()));
      assert.equal(/ozempic|wegovy|metformin|semaglutide/i.test(json), false);
    });

    it("52. No dose field exists", () => {
      const types = readSim("BodySimulatorTypes.ts");
      assert.equal(/\bdose\b|dosage|mg\b|prescription/i.test(types), false);
    });

    it("53. No treatment recommendation exists", () => {
      const json = JSON.stringify(mustOk(fixtureMedAppetiteDecrease()));
      assert.equal(
        /start medication|stop medication|consult your doctor|treatment plan/i.test(
          json
        ),
        false
      );
    });

    it("54. Medication cannot dominate the simulation", () => {
      assert.ok(BODY_SIM_MED_MAX_WEIGHT_FAT_INFLUENCE < 0.25);
      const base = fixtureRealisticWeightLoss12w();
      base.goal.targetWeightChangeKg = null;
      const noMed = structuredClone(base);
      noMed.medicationEffects = createDefaultMedicationEffects();
      const strong = structuredClone(base);
      strong.simulationId = "med-dom";
      strong.medicationEffects = createDefaultMedicationEffects();
      strong.medicationEffects.medicationMayAffectWeight = true;
      strong.medicationEffects.appetite = "strong_decrease";
      strong.medicationEffects.metabolismTendency = "strong_decrease";
      strong.medicationEffects.evidence.confidence = "low";
      const a = absExpected(mustOk(noMed));
      const b = absExpected(mustOk(strong));
      assert.ok(b / Math.max(a, 0.01) < 1.25);
    });
  });

  // ── Regions ───────────────────────────────────────────────────────────────
  describe("Regions", () => {
    it("55. Broad v1 region list exists", () => {
      assert.ok(BODY_SIMULATOR_REGIONS.length >= 10);
      assert.ok(BODY_SIMULATOR_REGIONS.length <= 15);
    });

    it("56. Detailed 40–60-region model is not implemented", () => {
      assert.ok(BODY_SIMULATOR_REGIONS.length < 20);
      assert.equal(
        BODY_SIMULATOR_REGIONS.includes("inner_thigh" as never),
        false
      );
    });

    it("57. Every output region is unique", () => {
      const rules = mustOk(fixtureRealisticWeightLoss12w());
      const ids = rules.regions.map((r) => r.region);
      assert.equal(new Set(ids).size, ids.length);
    });

    it("58. Region visibility affects confidence", () => {
      const rules = mustOk(fixtureSingleFrontView());
      const upperBack = rules.regions.find((r) => r.region === "upper_back");
      assert.ok(upperBack);
      assert.ok(
        upperBack!.visibility === "partially_visible" ||
          upperBack!.confidence !== "high"
      );
    });

    it("59. Region names are not treated as sexual", () => {
      const eng = readSim("BodySimulatorEngine.ts");
      assert.equal(/sexualiz|erotic|sexy|attractive butt/i.test(eng), false);
    });

    it("60. No attractiveness-driven body-part enhancement exists", () => {
      const json = JSON.stringify(mustOk(fixtureRealisticWeightLoss12w()));
      assert.equal(/enhance breasts|beautify|glute enhancement/i.test(json), false);
    });

    it("61. Natural proportions are preserved", () => {
      const rules = mustOk(fixtureRealisticWeightLoss12w());
      assert.ok(rules.regions.every((r) => r.preserveNaturalProportions === true));
    });

    it("62. Unseen regions retain uncertainty", () => {
      const input = fixtureRealisticWeightLoss12w();
      input.sourceImageContext.progressPhotoView = "back";
      const rules = mustOk(input);
      const face = rules.regions.find((r) => r.region === "face_and_neck");
      assert.ok(face);
      assert.ok(
        face!.visibility === "not_visible" || face!.confidence === "low"
      );
    });
  });

  // ── Realism ───────────────────────────────────────────────────────────────
  describe("Realism", () => {
    it("63. Extreme short-term muscle target is moderated", () => {
      const rules = mustOk(fixtureUnrealisticTargetModerated());
      assert.equal(rules.realism.requestedTargetModerated, true);
      assert.ok(
        (rules.wholeBodyChange.muscleChangeKg.expected ?? 0) <=
          BODY_SIM_MAX_MUSCLE_GAIN_KG_ABSOLUTE
      );
    });

    it("64. Extreme short-term fat-loss target is moderated", () => {
      const rules = mustOk(fixtureUnrealisticTargetModerated());
      assert.ok(
        rules.realism.moderationReasons.includes(
          "fat_loss_target_exceeds_v1_boundary"
        ) ||
          rules.realism.moderationReasons.includes(
            "timeline_limits_requested_change"
          ) ||
          rules.realism.moderationReasons.includes(
            "muscle_gain_target_exceeds_v1_boundary"
          )
      );
    });

    it("65. Requested direction remains preserved", () => {
      const rules = mustOk(fixtureUnrealisticTargetModerated());
      assert.equal(rules.goal.requestedType, "muscle_gain");
      assert.equal(rules.goal.effectiveType, "muscle_gain");
      assert.ok((rules.wholeBodyChange.muscleChangeKg.expected ?? 0) > 0);
    });

    it("66. Moderation reason is recorded", () => {
      const rules = mustOk(fixtureUnrealisticTargetModerated());
      assert.ok(rules.realism.moderationReasons.length > 0);
    });

    it("67. Identity-changing skeletal changes are prohibited", () => {
      const rules = mustOk(fixtureRealisticWeightLoss12w());
      assert.equal(rules.preservation.skeletalProportions, "preserve");
    });

    it("68. Height change is prohibited", () => {
      const rules = mustOk(fixtureRealisticWeightLoss12w());
      assert.equal(rules.preservation.bodyHeight, "preserve");
    });

    it("69. Unrelated face change is prohibited", () => {
      const rules = mustOk(fixtureRealisticWeightLoss12w());
      assert.equal(rules.preservation.faceGeometry, "preserve");
      assert.equal(rules.preservation.identity, "preserve");
    });

    it("70. Hand/foot enlargement is prohibited", () => {
      const rules = mustOk(fixtureRealisticWeightLoss12w());
      assert.equal(rules.preservation.handAndFootScale, "preserve");
    });

    it("71. Superhero proportions are prohibited", () => {
      const json = JSON.stringify(mustOk(fixtureAmbitiousWeightLoss12w()));
      assert.equal(/superhero|caricature/i.test(json), false);
      assert.equal(
        mustOk(fixtureAmbitiousWeightLoss12w()).preservation
          .skeletalProportions,
        "preserve"
      );
    });

    it("72. Expected visualization is not marked as guarantee", () => {
      const rules = mustOk(fixtureRealisticWeightLoss12w());
      assert.equal(rules.realism.expectedVisualizationNotGuarantee, true);
    });
  });

  // ── Preservation ──────────────────────────────────────────────────────────
  describe("Preservation", () => {
    it("73. Identity preservation is mandatory", () => {
      assert.equal(mustOk(fixtureRealisticWeightLoss12w()).preservation.identity, "preserve");
    });
    it("74. Original presentation preservation is mandatory", () => {
      assert.equal(
        mustOk(fixtureRealisticWeightLoss12w()).preservation.originalPresentation,
        "preserve"
      );
    });
    it("75. Pose preservation is mandatory", () => {
      assert.equal(mustOk(fixtureRealisticWeightLoss12w()).preservation.pose, "preserve");
    });
    it("76. Camera framing preservation is mandatory", () => {
      assert.equal(
        mustOk(fixtureRealisticWeightLoss12w()).preservation.cameraFraming,
        "preserve"
      );
    });
    it("77. Clothing preservation is mandatory", () => {
      assert.equal(
        mustOk(fixtureRealisticWeightLoss12w()).preservation.clothing,
        "preserve"
      );
    });
    it("78. Clothing coverage preservation is mandatory", () => {
      assert.equal(
        mustOk(fixtureRealisticWeightLoss12w()).preservation.clothingCoverage,
        "preserve"
      );
    });
    it("79. Background preservation is mandatory", () => {
      assert.equal(
        mustOk(fixtureRealisticWeightLoss12w()).preservation.background,
        "preserve"
      );
    });
    it("80. Lighting-character preservation is mandatory", () => {
      assert.equal(
        mustOk(fixtureRealisticWeightLoss12w()).preservation.lightingCharacter,
        "preserve"
      );
    });
    it("81. Personal style preservation is mandatory", () => {
      assert.equal(
        mustOk(fixtureRealisticWeightLoss12w()).preservation.personalStyle,
        "preserve"
      );
    });
    it("82. Age appearance preservation is mandatory", () => {
      assert.equal(
        mustOk(fixtureRealisticWeightLoss12w()).preservation.ageAppearance,
        "preserve"
      );
    });
    it("83. No clothing judgment exists", () => {
      const json = JSON.stringify(mustOk(fixtureRealisticWeightLoss12w()));
      assert.equal(/inappropriate clothing|immodest|slutty/i.test(json), false);
    });
    it("84. No pose judgment exists", () => {
      const json = JSON.stringify(mustOk(fixtureNonStandardPoseSafe()));
      assert.equal(/bad pose|unflattering pose/i.test(json), false);
    });
  });

  // ── Confidence ────────────────────────────────────────────────────────────
  describe("Confidence", () => {
    it("85. Confidence has structured reasons", () => {
      const rules = mustOk(fixtureRealisticWeightLoss12w());
      assert.ok(Array.isArray(rules.confidence.reasons));
      assert.ok(rules.confidence.reasons.length > 0);
    });

    it("86. Missing body-fat value lowers confidence without fabricating a value", () => {
      const rules = mustOk(fixtureMissingBodyFat());
      assert.ok(rules.confidence.reasons.includes("body_fat_not_provided"));
      assert.equal(rules.baseline.bodyFatBasis, "not_provided");
    });

    it("87. Single-view input is supported", () => {
      assert.equal(simulateBodyTransformation(fixtureSingleFrontView()).ok, true);
      const rules = mustOk(fixtureSingleFrontView());
      assert.ok(rules.confidence.reasons.includes("front_view_available"));
    });

    it("88. Partial visibility creates limitations", () => {
      const input = fixtureRealisticWeightLoss12w();
      input.sourceImageContext.progressPhotoView = "three_quarter";
      const rules = mustOk(input);
      const whole = rules.regions.find((r) => r.region === "whole_body");
      assert.ok(whole?.visibility === "partially_visible");
    });

    it("89. Strong backlight creates a confidence reason", () => {
      const input = fixtureRealisticWeightLoss12w();
      input.bodyAnalysis = {
        schemaVersion: 1,
        status: "reserved_not_implemented",
        observations: [],
        confidence: "low",
        confidenceReasons: ["strong_backlight"],
        limitations: [],
      };
      const rules = mustOk(input);
      assert.ok(rules.confidence.reasons.includes("strong_backlight"));
    });

    it("90. Confidence is not represented as fake numeric precision", () => {
      const rules = mustOk(fixtureRealisticWeightLoss12w());
      assert.equal(typeof rules.confidence.overall, "string");
      assert.equal("confidencePercent" in rules.confidence, false);
      assert.equal("probability" in rules.confidence, false);
    });

    it("91. Low confidence does not automatically block simulation", () => {
      const readiness = assessBodySimulatorReadiness(
        fixtureGeneralFitnessLimitedBaseline()
      );
      assert.equal(readiness.ready, true);
      assert.equal(simulateBodyTransformation(fixtureGeneralFitnessLimitedBaseline()).ok, true);
    });
  });

  // ── Readiness ─────────────────────────────────────────────────────────────
  describe("Readiness", () => {
    it("92. Complete fixture is ready", () => {
      const r = assessBodySimulatorReadiness(fixtureRealisticWeightLoss12w());
      assert.equal(r.ready, true);
      assert.ok(r.status === "ready" || r.status === "ready_with_limitations");
    });

    it("93. Limited fixture may be ready_with_limitations", () => {
      const r = assessBodySimulatorReadiness(
        fixtureGeneralFitnessLimitedBaseline()
      );
      assert.equal(r.ready, true);
      assert.equal(r.status, "ready_with_limitations");
    });

    it("94. Required missing goal produces insufficient_input", () => {
      const input = fixtureRealisticWeightLoss12w() as BodySimulatorInput & {
        goal: { type: string };
      };
      (input.goal as { type: string }).type = "not_a_goal";
      const r = assessBodySimulatorReadiness(input);
      assert.equal(r.status, "insufficient_input");
      assert.equal(r.ready, false);
    });

    it("95. Body Analysis is optional", () => {
      const input = fixtureRealisticWeightLoss12w();
      input.bodyAnalysis = null;
      assert.equal(assessBodySimulatorReadiness(input).ready, true);
    });

    it("96. Body-fat percentage is optional", () => {
      assert.equal(
        assessBodySimulatorReadiness(fixtureMissingBodyFat()).ready,
        true
      );
    });

    it("97. Medication effects are optional", () => {
      assert.equal(
        assessBodySimulatorReadiness(fixtureNoMedicationEffect()).ready,
        true
      );
    });

    it("98. Multi-view is optional", () => {
      assert.equal(
        assessBodySimulatorReadiness(fixtureSingleFrontView()).ready,
        true
      );
    });

    it("99. One image remains sufficient architecturally", () => {
      const docs = read("docs/CTO/22_BODY_SIMULATOR_V1.md");
      assert.match(docs, /one source image|single.*image|One source image/i);
    });
  });

  // ── Safety ────────────────────────────────────────────────────────────────
  describe("Safety", () => {
    it("100. No beauty score exists", () => {
      assert.ok(BODY_SIMULATOR_FORBIDDEN_OUTPUTS.includes("beauty_score"));
      const json = JSON.stringify(mustOk(fixtureRealisticWeightLoss12w()));
      assert.equal(/beauty_score|beautyScore/i.test(json), false);
    });
    it("101. No attractiveness score exists", () => {
      const json = JSON.stringify(mustOk(fixtureRealisticWeightLoss12w()));
      assert.equal(/attractiveness/i.test(json), false);
    });
    it("102. No body ranking exists", () => {
      const json = JSON.stringify(mustOk(fixtureRealisticWeightLoss12w()));
      assert.equal(/body_ranking|bodyRank/i.test(json), false);
    });
    it("103. No ideal-body judgment exists", () => {
      const json = JSON.stringify(mustOk(fixtureRealisticWeightLoss12w()));
      assert.equal(/ideal_body|ideal body/i.test(json), false);
    });
    it("104. No medical diagnosis exists", () => {
      const json = JSON.stringify(mustOk(fixtureMedAppetiteDecrease()));
      assert.equal(/diagnos|obesity class|ICD-/i.test(json), false);
    });
    it("105. No age estimation exists", () => {
      const eng = readSim("BodySimulatorEngine.ts");
      assert.equal(/estimat(?:e|ing) age/i.test(eng), false);
    });
    it("106. No ethnicity estimation exists", () => {
      const rules = mustOk(fixtureRealisticWeightLoss12w());
      assert.equal(rules.preservation.ethnicityAppearance, "preserve");
      assert.equal(JSON.stringify(rules).includes("estimatedEthnicity"), false);
    });
    it("107. No sexual-intent inference exists", () => {
      const eng = readSim("BodySimulatorEngine.ts");
      assert.equal(/sexual intent|pornograph/i.test(eng), false);
    });
    it("108. No guaranteed result exists", () => {
      const rules = mustOk(fixtureRealisticWeightLoss12w());
      assert.equal(rules.realism.expectedVisualizationNotGuarantee, true);
      assert.equal(/guaranteed result/i.test(JSON.stringify(rules)), false);
    });
  });

  // ── Projection ────────────────────────────────────────────────────────────
  describe("Projection", () => {
    it("109. Projection is JSON serializable", () => {
      const rules = mustOk(fixtureRealisticWeightLoss12w());
      const s = serializeBodySimulatorProjection(rules);
      assert.doesNotThrow(() => JSON.parse(s));
    });
    it("110. Projection retains provenance", () => {
      const p = projectBodySimulatorRules(mustOk(fixtureRealisticWeightLoss12w()));
      assert.ok(Array.isArray(p.provenance));
      assert.ok(p.provenance.length > 0);
    });
    it("111. Projection retains confidence", () => {
      const p = projectBodySimulatorRules(mustOk(fixtureRealisticWeightLoss12w()));
      assert.ok(p.confidence.overall);
      assert.ok(p.confidence.reasons.length > 0);
    });
    it("112. Projection retains unknown values", () => {
      const p = projectBodySimulatorRules(mustOk(fixtureMissingBodyFat()));
      assert.ok(p.baseline.missingInputs.includes("currentBodyFatPercent"));
    });
    it("113. Projection contains no image", () => {
      const s = serializeBodySimulatorProjection(
        mustOk(fixtureRealisticWeightLoss12w())
      );
      assert.equal(/data:image|imageBytes|base64,/i.test(s), false);
    });
    it("114. Projection contains no image URL", () => {
      const s = serializeBodySimulatorProjection(
        mustOk(fixtureRealisticWeightLoss12w())
      );
      assert.equal(/https?:\/\/.*\.(png|jpg|webp)/i.test(s), false);
    });
    it("115. Projection contains no provider token", () => {
      const s = serializeBodySimulatorProjection(
        mustOk(fixtureRealisticWeightLoss12w())
      );
      assert.equal(/r8_|sk-|bearer /i.test(s), false);
    });
    it("116. Projection contains no access key", () => {
      const s = serializeBodySimulatorProjection(
        mustOk(fixtureRealisticWeightLoss12w())
      );
      assert.equal(/access_key|api_key|apiKey/i.test(s), false);
    });
    it("117. Projection contains no medication name", () => {
      const s = serializeBodySimulatorProjection(
        mustOk(fixtureMedAppetiteDecrease())
      );
      assert.equal(/ozempic|wegovy|medicineName/i.test(s), false);
    });
    it("118. Projection contains no raw provider response", () => {
      const s = serializeBodySimulatorProjection(
        mustOk(fixtureRealisticWeightLoss12w())
      );
      assert.equal(/rawProvider|prediction\.output|logs\.stderr/i.test(s), false);
    });
  });

  // ── Regression / unchanged production surface ─────────────────────────────
  describe("Regression", () => {
    it("119. Body Analysis contracts remain importable", () => {
      const types = read("src/ai/body-analysis/types.ts");
      assert.match(types, /BodyAnalysisEvidence/);
      assert.match(types, /BodyAnalysisConfidence/);
    });

    it("120. Formatter remains unchanged by body-simulator imports", () => {
      for (const f of ["BodySimulatorEngine.ts", "index.ts"]) {
        const src = readSim(f);
        assert.equal(/from ["'][^"']*formatters/.test(src), false, f);
        assert.equal(src.includes("FluxFormatter"), false, f);
      }
    });

    it("121. Provider remains unchanged by body-simulator imports", () => {
      assert.equal(readSim("BodySimulatorEngine.ts").includes("ReplicateAdapter"), false);
    });

    it("122. Transport remains unchanged by body-simulator imports", () => {
      assert.equal(readSim("BodySimulatorEngine.ts").includes("transport"), false);
    });

    it("123. Runtime behavior remains unchanged by body-simulator imports", () => {
      assert.equal(readSim("BodySimulatorEngine.ts").includes("AiOsRuntime"), false);
    });

    it("124. Retry behavior remains unchanged by body-simulator imports", () => {
      assert.equal(readSim("BodySimulatorEngine.ts").includes("RetryOrchestrator"), false);
    });

    it("125. Control Room remains unchanged by body-simulator imports", () => {
      assert.equal(readSim("BodySimulatorEngine.ts").includes("control-room"), false);
    });

    it("126. AI Experiment Lab UI remains unchanged", () => {
      assert.equal(existsSync(join(simDir, "ExperimentLab.tsx")), false);
      assert.equal(readSim("index.ts").includes("public/"), false);
    });

    it("127. Guided Progress Photo Capture remains unchanged by imports", () => {
      assert.equal(
        readSim("BodySimulatorEngine.ts").includes("guided-progress-photo"),
        false
      );
    });

    it("128. Account Trust remains unchanged by imports", () => {
      assert.equal(readSim("BodySimulatorEngine.ts").includes("account-trust"), false);
    });

    it("129. Personal Progress Library remains unchanged by imports", () => {
      assert.equal(
        readSim("BodySimulatorEngine.ts").includes("PersonalProgressLibrary"),
        false
      );
    });

    it("130. Production image generation remains unchanged by imports", () => {
      assert.equal(
        readSim("BodySimulatorEngine.ts").includes("ProductionRuntime"),
        false
      );
    });

    it("131. Legacy production prompt files not referenced", () => {
      const eng = readSim("BodySimulatorEngine.ts");
      assert.equal(/PromptBuilder|buildPromptPackage/.test(eng), false);
    });

    it("132. No environment variable is added", () => {
      const pkg = read("package.json");
      // body-simulator sources must not read process.env for providers
      for (const f of [
        "BodySimulatorEngine.ts",
        "BodySimulatorRules.ts",
        "BodySimulatorValidation.ts",
        "BodySimulatorFixtures.ts",
      ]) {
        assert.equal(readSim(f).includes("process.env"), false, f);
      }
      assert.ok(pkg.includes("bodySimulator.test.ts"));
    });

    it("133. No dependency is added", () => {
      const pkg = JSON.parse(read("package.json")) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      // Core AI deps remain tsx/typescript/esbuild only in dev
      assert.ok(pkg.devDependencies.tsx);
      assert.equal("openai" in pkg.dependencies, false);
      assert.equal("replicate" in pkg.dependencies, false);
    });

    it("134. No automatic training system is added", () => {
      const eng = readSim("BodySimulatorEngine.ts");
      assert.equal(/trainModel|fine-?tune|calibrationJob/i.test(eng), false);
    });

    it("fixtures: all 25 fictional scenarios exist", () => {
      assert.equal(BODY_SIMULATOR_FIXTURE_BUILDERS.length, 25);
      assert.equal(listBodySimulatorFixtures().length, 25);
      for (const f of listBodySimulatorFixtures()) {
        assert.equal(simulateBodyTransformation(f).ok, true, f.simulationId);
      }
    });

    it("coefficients: named constants exist with comments", () => {
      const rules = readSim("BodySimulatorRules.ts");
      assert.match(rules, /BODY_SIM_INTENSITY_REALISTIC_EXPECTED/);
      assert.match(rules, /BODY_SIM_MAX_MUSCLE_GAIN_KG_PER_WEEK/);
      assert.match(rules, /Purpose:/);
      assert.match(rules, /BODY_SIMULATOR_RULES_VERSION/);
    });
  });
});

/** Local helper for pose judgment test without exporting extra fixture. */
function fixtureNonStandardPoseSafe(): BodySimulatorInput {
  const f = fixtureRealisticWeightLoss12w();
  f.simulationId = "fixture-nonstandard-pose-test";
  f.sourceImageContext.progressPhotoView = "unknown";
  return f;
}
