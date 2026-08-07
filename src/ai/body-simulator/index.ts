/**
 * Body Simulator v1 — public barrel (Demand 022).
 *
 * Deterministic provider-independent Transformation Engine.
 * Not wired into production generation, formatters, or providers.
 */

export {
  BODY_SIMULATION_GOAL_TYPES,
  BODY_SIMULATION_INTENSITIES,
  BODY_SIMULATOR_CONFIDENCE_REASONS,
  BODY_SIMULATOR_FORBIDDEN_OUTPUTS,
  BODY_SIMULATOR_INPUT_SCHEMA_VERSION,
  BODY_SIMULATOR_PRIMARY_PURPOSE,
  BODY_SIMULATOR_REGIONS,
  BODY_SIMULATOR_RULES_SCHEMA_VERSION,
  BODY_SIMULATOR_RULES_VERSION,
  BODY_SIMULATOR_TIMELINE_MAX_WEEKS,
  BODY_SIMULATOR_TIMELINE_MIN_WEEKS,
  DEFAULT_BODY_SIMULATION_INTENSITY,
  REPORTED_EFFECT_DIRECTIONS,
  createDefaultMedicationEffects,
  createReservedBodyAnalysisStub,
} from "./BodySimulatorTypes";

export type {
  BodyAnalysisResult,
  BodyAnalysisResultStub,
  BodySimulationGoalType,
  BodySimulationIntensity,
  BodySimulatorActivityProfile,
  BodySimulatorConfidenceReason,
  BodySimulatorInput,
  BodySimulatorProfile,
  BodySimulatorReadiness,
  BodySimulatorRegion,
  BodySimulatorRegionRule,
  BodySimulatorSimulateResult,
  BodySimulatorTransformationRules,
  BodySimulatorValidationError,
  BodySimulatorValidationErrorCode,
  MedicationWeightEffectProfile,
  ModerationReason,
  RegionFatChange,
  RegionMuscleChange,
  ReportedEffectDirection,
  SimulationRange,
  TransformationRuleProvenance,
} from "./BodySimulatorTypes";

export {
  BODY_SIM_DEFAULT_FAT_LOSS_PP_PER_WEEK,
  BODY_SIM_DEFAULT_MUSCLE_GAIN_KG_PER_WEEK,
  BODY_SIM_INTENSITY_AMBITIOUS_EXPECTED,
  BODY_SIM_INTENSITY_CONSERVATIVE_EXPECTED,
  BODY_SIM_INTENSITY_REALISTIC_EXPECTED,
  BODY_SIM_MAX_FAT_LOSS_PP_ABSOLUTE,
  BODY_SIM_MAX_FAT_LOSS_PP_PER_WEEK,
  BODY_SIM_MAX_MUSCLE_GAIN_KG_ABSOLUTE,
  BODY_SIM_MAX_MUSCLE_GAIN_KG_PER_WEEK,
  BODY_SIM_MED_MAX_MUSCLE_INFLUENCE,
  BODY_SIM_MED_MAX_WEIGHT_FAT_INFLUENCE,
  BODY_SIM_MED_METABOLISM_SCALE,
  BODY_SIM_MUSCLE_RATE_ADVANCED,
  BODY_SIM_MUSCLE_RATE_BEGINNER,
  BODY_SIM_WEEKS_PER_MONTH,
  appetiteModifier,
  energyModifier,
  intensityExpectedMultiplier,
  metabolismModifier,
  muscleMedModifier,
  muscleRateForExperience,
} from "./BodySimulatorRules";

export {
  assessBodySimulatorReadiness,
  buildBodySimulatorTransformationRules,
  computeTimelineMagnitude,
  simulateBodyTransformation,
} from "./BodySimulatorEngine";

export { validateBodySimulatorInput } from "./BodySimulatorValidation";

export {
  projectBodySimulatorRules,
  serializeBodySimulatorProjection,
} from "./BodySimulatorProjection";
export type { BodySimulatorSafeProjection } from "./BodySimulatorProjection";

export {
  BODY_SIMULATOR_FIXTURE_BUILDERS,
  fixtureAdvancedMuscleGain24w,
  fixtureAmbitiousWeightLoss12w,
  fixtureBeginnerMuscleGain24w,
  fixtureConservativeWeightLoss12w,
  fixtureDeviceMeasuredBodyFat,
  fixtureFatLossMusclePreservation,
  fixtureFutureVisualBodyFatReserved,
  fixtureGeneralFitnessLimitedBaseline,
  fixtureMedAppetiteDecrease,
  fixtureMedAppetiteIncrease,
  fixtureMedEnergyDecrease,
  fixtureMedEnergyIncrease,
  fixtureMedMetabolismDecrease,
  fixtureMedMetabolismIncrease,
  fixtureMedMusclePreservation,
  fixtureMissingBodyFat,
  fixtureMultiViewReservation,
  fixtureNoMedicationEffect,
  fixtureNonStandardPose,
  fixturePartialBodyVisibility,
  fixtureRealisticWeightLoss12w,
  fixtureRecomposition16w,
  fixtureSingleFrontView,
  fixtureUnrealisticTargetModerated,
  fixtureUnusualProportions,
  getBodySimulatorFixtureById,
  listBodySimulatorFixtures,
} from "./BodySimulatorFixtures";
