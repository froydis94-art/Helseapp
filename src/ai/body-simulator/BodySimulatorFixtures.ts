/**
 * Body Simulator v1 — fictional deterministic fixtures (Demand 022).
 * No real person data, images, medicine names, or beauty scores.
 */

import { createEmptyBodyAnalysisEvidence } from "../body-analysis/types";
import {
  BODY_SIMULATOR_INPUT_SCHEMA_VERSION,
  createDefaultMedicationEffects,
  createReservedBodyAnalysisStub,
  type BodySimulatorInput,
  type MedicationWeightEffectProfile,
  type ReportedEffectDirection,
} from "./BodySimulatorTypes";

function baseInput(
  overrides: Partial<BodySimulatorInput> & {
    simulationId: string;
    goal?: Partial<BodySimulatorInput["goal"]> &
      Pick<BodySimulatorInput["goal"], "type" | "timelineWeeks">;
  }
): BodySimulatorInput {
  const goalType = overrides.goal?.type ?? "weight_loss";
  const timelineWeeks = overrides.goal?.timelineWeeks ?? 12;
  const goalOverride = overrides.goal;
  return {
    schemaVersion: BODY_SIMULATOR_INPUT_SCHEMA_VERSION,
    simulationId: overrides.simulationId,
    createdAt: overrides.createdAt ?? "2026-01-15T12:00:00.000Z",
    goal: {
      type: goalType,
      timelineWeeks,
      // Use undefined-check so explicit null targets stay null (?? would replace null).
      targetWeightChangeKg:
        goalOverride && "targetWeightChangeKg" in goalOverride
          ? goalOverride.targetWeightChangeKg ?? null
          : -6,
      targetBodyFatChangePercentagePoints:
        goalOverride && "targetBodyFatChangePercentagePoints" in goalOverride
          ? goalOverride.targetBodyFatChangePercentagePoints ?? null
          : -3,
      targetMuscleChangeKg:
        goalOverride && "targetMuscleChangeKg" in goalOverride
          ? goalOverride.targetMuscleChangeKg ?? null
          : null,
      intensity: goalOverride?.intensity ?? "realistic",
    },
    profile: overrides.profile ?? {
      ageYears: 34,
      sexForPhysiology: "female",
      heightCm: 168,
      currentWeightKg: 78,
      currentBodyFatPercent: 32,
      bodyFatBasis: "user_estimate",
      trainingExperience: "intermediate",
      evidence: {
        profile: createEmptyBodyAnalysisEvidence("unknown"),
      },
    },
    activity: overrides.activity ?? {
      generalActivity: "moderate",
      resistanceTrainingSessionsPerWeek: 3,
      cardioSessionsPerWeek: 2,
      trainingConsistency: "moderate",
      proteinIntakeSupport: "likely_adequate",
      recoverySupport: "moderate",
      evidence: {
        activity: createEmptyBodyAnalysisEvidence("unknown"),
      },
    },
    medicationEffects:
      overrides.medicationEffects ?? createDefaultMedicationEffects(),
    bodyAnalysis:
      overrides.bodyAnalysis === undefined ? null : overrides.bodyAnalysis,
    sourceImageContext: overrides.sourceImageContext ?? {
      available: true,
      progressPhotoView: "front",
    },
    options: overrides.options ?? {
      preserveIdentity: true,
      preserveOriginalPresentation: true,
      preservePose: true,
      preserveCameraFraming: true,
      preserveClothing: true,
      preserveBackground: true,
      preserveLightingCharacter: true,
    },
  };
}

function med(
  directionField: keyof Pick<
    MedicationWeightEffectProfile,
    | "appetite"
    | "energyLevel"
    | "metabolismTendency"
    | "muscleBuildingOrPreservation"
  >,
  direction: ReportedEffectDirection
): MedicationWeightEffectProfile {
  const m = createDefaultMedicationEffects();
  m.medicationMayAffectWeight = true;
  m.appetite = "no_effect";
  m.energyLevel = "no_effect";
  m.metabolismTendency = "no_effect";
  m.muscleBuildingOrPreservation = "no_effect";
  m[directionField] = direction;
  m.evidence = {
    origin: "user_declared",
    confidence: "low",
    notes: ["User-reported physiological tendency only."],
  };
  return m;
}

/** 1. Realistic 12-week weight loss. */
export function fixtureRealisticWeightLoss12w(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-realistic-wl-12w",
    goal: {
      type: "weight_loss",
      timelineWeeks: 12,
      intensity: "realistic",
      targetWeightChangeKg: -6,
      targetBodyFatChangePercentagePoints: -3,
      targetMuscleChangeKg: null,
    },
  });
}

/** 2. Conservative 12-week weight loss. */
export function fixtureConservativeWeightLoss12w(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-conservative-wl-12w",
    goal: {
      type: "weight_loss",
      timelineWeeks: 12,
      intensity: "conservative",
      targetWeightChangeKg: -6,
      targetBodyFatChangePercentagePoints: -3,
      targetMuscleChangeKg: null,
    },
  });
}

/** 3. Ambitious 12-week weight loss with bounded moderation. */
export function fixtureAmbitiousWeightLoss12w(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-ambitious-wl-12w",
    goal: {
      type: "weight_loss",
      timelineWeeks: 12,
      intensity: "ambitious",
      targetWeightChangeKg: -20,
      targetBodyFatChangePercentagePoints: -12,
      targetMuscleChangeKg: null,
    },
  });
}

/** 4. Fat loss with muscle preservation. */
export function fixtureFatLossMusclePreservation(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-fl-preserve",
    goal: {
      type: "fat_loss_with_muscle_preservation",
      timelineWeeks: 16,
      intensity: "realistic",
      targetWeightChangeKg: -5,
      targetBodyFatChangePercentagePoints: -4,
      targetMuscleChangeKg: 0.5,
    },
  });
}

/** 5. Beginner muscle gain over 24 weeks. */
export function fixtureBeginnerMuscleGain24w(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-beginner-mg-24w",
    goal: {
      type: "muscle_gain",
      timelineWeeks: 24,
      intensity: "realistic",
      targetWeightChangeKg: 4,
      targetBodyFatChangePercentagePoints: 1,
      targetMuscleChangeKg: 3,
    },
    profile: {
      ageYears: 28,
      sexForPhysiology: "male",
      heightCm: 178,
      currentWeightKg: 72,
      currentBodyFatPercent: 18,
      bodyFatBasis: "user_estimate",
      trainingExperience: "beginner",
      evidence: { profile: createEmptyBodyAnalysisEvidence("unknown") },
    },
  });
}

/** 6. Advanced muscle gain over 24 weeks. */
export function fixtureAdvancedMuscleGain24w(): BodySimulatorInput {
  const f = fixtureBeginnerMuscleGain24w();
  f.simulationId = "fixture-advanced-mg-24w";
  f.profile = {
    ...f.profile,
    trainingExperience: "advanced",
    currentWeightKg: 85,
    currentBodyFatPercent: 14,
  };
  return f;
}

/** 7. Body recomposition over 16 weeks. */
export function fixtureRecomposition16w(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-recomp-16w",
    goal: {
      type: "body_recomposition",
      timelineWeeks: 16,
      intensity: "realistic",
      targetWeightChangeKg: -1,
      targetBodyFatChangePercentagePoints: -3,
      targetMuscleChangeKg: 1.5,
    },
  });
}

/** 8. General fitness with limited baseline data. */
export function fixtureGeneralFitnessLimitedBaseline(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-fitness-limited",
    goal: {
      type: "general_fitness_improvement",
      timelineWeeks: 12,
      intensity: "realistic",
      targetWeightChangeKg: null,
      targetBodyFatChangePercentagePoints: null,
      targetMuscleChangeKg: null,
    },
    profile: {
      ageYears: null,
      sexForPhysiology: "not_provided",
      heightCm: null,
      currentWeightKg: null,
      currentBodyFatPercent: null,
      bodyFatBasis: "not_provided",
      trainingExperience: "not_provided",
      evidence: {},
    },
    activity: {
      generalActivity: "not_provided",
      resistanceTrainingSessionsPerWeek: null,
      cardioSessionsPerWeek: null,
      trainingConsistency: "not_provided",
      proteinIntakeSupport: "not_provided",
      recoverySupport: "not_provided",
      evidence: {},
    },
  });
}

/** 9. Medication: appetite decrease. */
export function fixtureMedAppetiteDecrease(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-med-appetite-dec",
    medicationEffects: med("appetite", "moderate_decrease"),
  });
}

/** 10. Medication: appetite increase. */
export function fixtureMedAppetiteIncrease(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-med-appetite-inc",
    medicationEffects: med("appetite", "moderate_increase"),
  });
}

/** 11. Medication: energy decrease. */
export function fixtureMedEnergyDecrease(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-med-energy-dec",
    medicationEffects: med("energyLevel", "moderate_decrease"),
  });
}

/** 12. Medication: energy increase. */
export function fixtureMedEnergyIncrease(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-med-energy-inc",
    medicationEffects: med("energyLevel", "moderate_increase"),
  });
}

/** 13. Medication: metabolism decrease. */
export function fixtureMedMetabolismDecrease(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-med-metab-dec",
    medicationEffects: med("metabolismTendency", "moderate_decrease"),
  });
}

/** 14. Medication: metabolism increase. */
export function fixtureMedMetabolismIncrease(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-med-metab-inc",
    medicationEffects: med("metabolismTendency", "moderate_increase"),
  });
}

/** 15. Medication: muscle preservation. */
export function fixtureMedMusclePreservation(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-med-muscle-pres",
    goal: {
      type: "fat_loss_with_muscle_preservation",
      timelineWeeks: 12,
      intensity: "realistic",
      targetWeightChangeKg: -5,
      targetBodyFatChangePercentagePoints: -3,
      targetMuscleChangeKg: null,
    },
    medicationEffects: med("muscleBuildingOrPreservation", "moderate_increase"),
  });
}

/** 16. No medication effect. */
export function fixtureNoMedicationEffect(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-no-med",
    medicationEffects: createDefaultMedicationEffects(),
  });
}

/** 17. Missing body-fat percentage. */
export function fixtureMissingBodyFat(): BodySimulatorInput {
  const f = baseInput({ simulationId: "fixture-missing-bf" });
  f.profile = {
    ...f.profile,
    currentBodyFatPercent: null,
    bodyFatBasis: "not_provided",
  };
  return f;
}

/** 18. Device-measured body-fat percentage. */
export function fixtureDeviceMeasuredBodyFat(): BodySimulatorInput {
  const f = baseInput({ simulationId: "fixture-device-bf" });
  f.profile = {
    ...f.profile,
    currentBodyFatPercent: 28.5,
    bodyFatBasis: "device_measurement",
  };
  return f;
}

/** 19. Future visual body-fat estimate reserved but not executed. */
export function fixtureFutureVisualBodyFatReserved(): BodySimulatorInput {
  const f = baseInput({ simulationId: "fixture-visual-bf-reserved" });
  f.profile = {
    ...f.profile,
    currentBodyFatPercent: 30,
    bodyFatBasis: "future_visual_estimate",
  };
  f.bodyAnalysis = createReservedBodyAnalysisStub();
  return f;
}

/** 20. Single front-view input. */
export function fixtureSingleFrontView(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-single-front",
    sourceImageContext: { available: true, progressPhotoView: "front" },
  });
}

/** 21. Multi-view reservation without provider analysis. */
export function fixtureMultiViewReservation(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-multiview-reserved",
    bodyAnalysis: {
      schemaVersion: 1,
      status: "reserved_not_implemented",
      observations: [],
      confidence: "not_applicable",
      confidenceReasons: ["front_view_available", "side_view_available"],
      limitations: [
        "Multi-view analysis is approved as a future capability but is not implemented.",
      ],
    },
    sourceImageContext: { available: true, progressPhotoView: "front" },
  });
}

/** 22. Partial-body visibility. */
export function fixturePartialBodyVisibility(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-partial-visibility",
    sourceImageContext: {
      available: true,
      progressPhotoView: "three_quarter",
    },
  });
}

/** 23. Adaptive or non-standard pose. */
export function fixtureNonStandardPose(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-nonstandard-pose",
    sourceImageContext: { available: true, progressPhotoView: "unknown" },
  });
}

/** 24. Unusual proportions accepted without judgment. */
export function fixtureUnusualProportions(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-unusual-proportions",
    profile: {
      ageYears: 41,
      sexForPhysiology: "intersex_or_other",
      heightCm: 145,
      currentWeightKg: 110,
      currentBodyFatPercent: 42,
      bodyFatBasis: "user_estimate",
      trainingExperience: "beginner",
      evidence: { profile: createEmptyBodyAnalysisEvidence("unknown") },
    },
  });
}

/** 25. Unrealistic requested target moderated safely. */
export function fixtureUnrealisticTargetModerated(): BodySimulatorInput {
  return baseInput({
    simulationId: "fixture-unrealistic-moderated",
    goal: {
      type: "muscle_gain",
      timelineWeeks: 4,
      intensity: "ambitious",
      targetWeightChangeKg: 20,
      targetBodyFatChangePercentagePoints: -15,
      targetMuscleChangeKg: 15,
    },
  });
}

export const BODY_SIMULATOR_FIXTURE_BUILDERS = Object.freeze([
  fixtureRealisticWeightLoss12w,
  fixtureConservativeWeightLoss12w,
  fixtureAmbitiousWeightLoss12w,
  fixtureFatLossMusclePreservation,
  fixtureBeginnerMuscleGain24w,
  fixtureAdvancedMuscleGain24w,
  fixtureRecomposition16w,
  fixtureGeneralFitnessLimitedBaseline,
  fixtureMedAppetiteDecrease,
  fixtureMedAppetiteIncrease,
  fixtureMedEnergyDecrease,
  fixtureMedEnergyIncrease,
  fixtureMedMetabolismDecrease,
  fixtureMedMetabolismIncrease,
  fixtureMedMusclePreservation,
  fixtureNoMedicationEffect,
  fixtureMissingBodyFat,
  fixtureDeviceMeasuredBodyFat,
  fixtureFutureVisualBodyFatReserved,
  fixtureSingleFrontView,
  fixtureMultiViewReservation,
  fixturePartialBodyVisibility,
  fixtureNonStandardPose,
  fixtureUnusualProportions,
  fixtureUnrealisticTargetModerated,
] as const);

export function listBodySimulatorFixtures(): BodySimulatorInput[] {
  return BODY_SIMULATOR_FIXTURE_BUILDERS.map((fn) => fn());
}

export function getBodySimulatorFixtureById(
  simulationId: string
): BodySimulatorInput | null {
  return (
    listBodySimulatorFixtures().find((f) => f.simulationId === simulationId) ??
    null
  );
}
