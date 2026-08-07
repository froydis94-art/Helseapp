/**
 * Body Simulator v1 — deterministic Transformation Engine (Demand 022).
 *
 * Converts structured inputs into canonical BodySimulatorTransformationRules.
 * No prompts, provider calls, images, or medical diagnosis.
 */

import type { BodyAnalysisConfidence } from "../body-analysis/types";
import { transformProgress } from "../progressCurve";
import { assessBodySimulatorReadiness } from "./BodySimulatorReadiness";
import {
  BODY_SIM_DEFAULT_FAT_LOSS_PP_PER_WEEK,
  BODY_SIM_DEFAULT_MUSCLE_GAIN_KG_PER_WEEK,
  BODY_SIM_DEFAULT_WEIGHT_LOSS_KG_PER_WEEK,
  BODY_SIM_GENERAL_FITNESS_FAT_LOSS_PP_PER_WEEK,
  BODY_SIM_GENERAL_FITNESS_MUSCLE_KG_PER_WEEK,
  BODY_SIM_GENERAL_FITNESS_WEIGHT_KG_PER_WEEK,
  BODY_SIM_MAX_FAT_LOSS_PP_ABSOLUTE,
  BODY_SIM_MAX_FAT_LOSS_PP_PER_WEEK,
  BODY_SIM_MAX_MUSCLE_GAIN_KG_ABSOLUTE,
  BODY_SIM_MAX_MUSCLE_GAIN_KG_PER_WEEK,
  BODY_SIM_MAX_WEIGHT_GAIN_KG_ABSOLUTE,
  BODY_SIM_MAX_WEIGHT_GAIN_KG_PER_WEEK,
  BODY_SIM_MAX_WEIGHT_LOSS_KG_ABSOLUTE,
  BODY_SIM_MAX_WEIGHT_LOSS_KG_PER_WEEK,
  BODY_SIM_MED_MAX_MUSCLE_INFLUENCE,
  BODY_SIM_MED_MAX_WEIGHT_FAT_INFLUENCE,
  BODY_SIM_RECOMP_FAT_LOSS_PP_PER_WEEK,
  BODY_SIM_RECOMP_MUSCLE_KG_PER_WEEK,
  BODY_SIM_REGION_FAT_WEIGHT,
  BODY_SIM_REGION_MUSCLE_WEIGHT,
  BODY_SIM_REGION_VISUAL_BASE,
  BODY_SIM_REGION_VISUAL_MAX,
  BODY_SIM_TIMELINE_MAGNITUDE_SCALE,
  BODY_SIM_TIMELINE_MIN_RELATIVE_MAGNITUDE,
  BODY_SIM_WEEKS_PER_MONTH,
  appetiteModifier,
  clamp,
  consistencyFactor,
  energyModifier,
  goalPrimaryFatDirection,
  goalPrimaryMuscleDirection,
  intensityExpectedMultiplier,
  intensitySpread,
  metabolismModifier,
  muscleMedModifier,
  muscleRateForExperience,
  proteinFactor,
  recoveryFactor,
  round3,
} from "./BodySimulatorRules";
import {
  BODY_SIMULATOR_REGIONS,
  BODY_SIMULATOR_RULES_SCHEMA_VERSION,
  BODY_SIMULATOR_RULES_VERSION,
  type BodySimulatorInput,
  type BodySimulatorRegion,
  type BodySimulatorRegionRule,
  type BodySimulatorSimulateResult,
  type BodySimulatorTransformationRules,
  type ModerationReason,
  type RegionFatChange,
  type RegionMuscleChange,
  type SimulationRange,
  type TransformationRuleProvenance,
} from "./BodySimulatorTypes";
import { validateBodySimulatorInput } from "./BodySimulatorValidation";

export interface TimelineMagnitudeResult {
  /** Relative 0…1+ magnitude from diminishing-returns progress. */
  relativeMagnitude: number;
  progressFraction: number;
  months: number;
}

/**
 * Timeline magnitude with diminishing returns (shared transformProgress).
 * Equal inputs: 4w < 12w < 24w < 52w; not pure linear across the full range.
 */
export function computeTimelineMagnitude(timelineWeeks: number): TimelineMagnitudeResult {
  const months = timelineWeeks / BODY_SIM_WEEKS_PER_MONTH;
  const progressFraction = transformProgress(months);
  const relativeMagnitude = Math.max(
    BODY_SIM_TIMELINE_MIN_RELATIVE_MAGNITUDE,
    progressFraction * BODY_SIM_TIMELINE_MAGNITUDE_SCALE
  );
  return { relativeMagnitude, progressFraction, months };
}

function rangeFromExpected(
  expected: number | null,
  unit: SimulationRange["unit"],
  origin: SimulationRange["origin"],
  spreadFactor: number
): SimulationRange {
  if (expected == null || !Number.isFinite(expected)) {
    return {
      lower: null,
      expected: null,
      upper: null,
      unit,
      origin: "unknown",
    };
  }
  const abs = Math.abs(expected);
  const spread = abs * spreadFactor;
  const sign = expected === 0 ? 1 : Math.sign(expected);
  // Preserve direction: lower is closer to zero for loss (negative expected)
  if (expected < 0) {
    return {
      lower: round3(expected - spread), // more negative
      expected: round3(expected),
      upper: round3(Math.min(0, expected + spread)), // less negative
      unit,
      origin,
    };
  }
  if (expected > 0) {
    return {
      lower: round3(Math.max(0, expected - spread)),
      expected: round3(expected),
      upper: round3(expected + spread),
      unit,
      origin,
    };
  }
  return {
    lower: round3(-spread * sign),
    expected: 0,
    upper: round3(spread),
    unit,
    origin,
  };
}

function moderateLossMagnitude(
  requested: number,
  timelineWeeks: number,
  perWeekMax: number,
  absoluteMax: number,
  exceedReason: ModerationReason = "fat_loss_target_exceeds_v1_boundary"
): { value: number; moderated: boolean; reasons: ModerationReason[] } {
  // requested is negative for loss
  const absRequested = Math.abs(requested);
  const timelineCap = perWeekMax * timelineWeeks;
  const cap = Math.min(timelineCap, absoluteMax);
  if (absRequested <= cap) {
    return { value: requested, moderated: false, reasons: [] };
  }
  const reasons: ModerationReason[] = ["timeline_limits_requested_change"];
  if (absRequested > cap) {
    reasons.push(exceedReason);
  }
  return {
    value: -cap,
    moderated: true,
    reasons,
  };
}

function moderateGainMagnitude(
  requested: number,
  timelineWeeks: number,
  perWeekMax: number,
  absoluteMax: number,
  reasonCode: ModerationReason
): { value: number; moderated: boolean; reasons: ModerationReason[] } {
  const timelineCap = perWeekMax * timelineWeeks;
  const cap = Math.min(timelineCap, absoluteMax);
  if (requested <= cap) {
    return { value: requested, moderated: false, reasons: [] };
  }
  const reasons: ModerationReason[] = [
    "timeline_limits_requested_change",
    reasonCode,
  ];
  return { value: cap, moderated: true, reasons };
}

function clampMed(influence: number, maxAbs: number): number {
  return clamp(influence, -maxAbs, maxAbs);
}

function fatChangeLabel(
  goal: BodySimulatorInput["goal"]["type"],
  magnitude: number
): RegionFatChange {
  const dir = goalPrimaryFatDirection(goal);
  if (dir === "decrease") {
    if (magnitude >= 0.75) return "strong_decrease";
    if (magnitude >= 0.45) return "moderate_decrease";
    if (magnitude >= 0.2) return "slight_decrease";
    return "slight_decrease";
  }
  if (dir === "stable_or_unknown") {
    return magnitude < 0.2 ? "stable" : "slight_increase";
  }
  // mixed / general fitness
  if (magnitude >= 0.35) return "slight_decrease";
  return "stable";
}

function muscleChangeLabel(
  goal: BodySimulatorInput["goal"]["type"],
  magnitude: number,
  muscleKg: number | null
): RegionMuscleChange {
  const dir = goalPrimaryMuscleDirection(goal);
  if (dir === "stable") {
    return muscleKg != null && muscleKg > 0.15 ? "slight_increase" : "stable";
  }
  if (dir === "increase") {
    if (magnitude >= 0.75) return "strong_increase";
    if (magnitude >= 0.45) return "moderate_increase";
    if (magnitude >= 0.2) return "slight_increase";
    return "slight_increase";
  }
  // mixed
  if (muscleKg != null && muscleKg < -0.1) return "slight_decrease";
  if (muscleKg != null && muscleKg > 0.15) return "slight_increase";
  return "stable";
}

function regionVisibility(
  region: BodySimulatorRegion,
  view: BodySimulatorInput["sourceImageContext"]["progressPhotoView"],
  available: boolean
): BodySimulatorRegionRule["visibility"] {
  if (!available) return "not_assessable";
  if (view === "unknown") return "unknown";
  // Conservative: face less assessable from back; lower legs may be partial
  if (view === "back" && region === "face_and_neck") return "not_visible";
  if (view === "front" && region === "upper_back") return "partially_visible";
  if (region === "lower_legs") return "partially_visible";
  if (region === "whole_body") {
    return view === "three_quarter" ? "partially_visible" : "available";
  }
  return "available";
}

function buildConfidenceReasons(input: BodySimulatorInput): string[] {
  const reasons: string[] = [];
  if (input.profile.heightCm != null) {
    reasons.push("user_declared_height_available");
  }
  if (input.profile.currentWeightKg != null) {
    reasons.push("user_declared_weight_available");
  }
  if (input.profile.currentBodyFatPercent == null) {
    reasons.push("body_fat_not_provided");
  } else if (
    input.profile.bodyFatBasis === "device_measurement" ||
    input.profile.bodyFatBasis === "professional_measurement"
  ) {
    reasons.push("body_fat_measurement_available");
  } else if (input.profile.bodyFatBasis === "user_estimate") {
    reasons.push("body_fat_user_estimate_only");
  }
  if (input.profile.trainingExperience === "not_provided") {
    reasons.push("training_experience_missing");
  } else {
    reasons.push("training_experience_available");
  }
  reasons.push("timeline_within_supported_range");
  const view = input.sourceImageContext.progressPhotoView;
  if (view === "front") reasons.push("front_view_available");
  if (view === "side") reasons.push("side_view_available");
  if (view === "back") reasons.push("back_view_available");
  if (
    input.sourceImageContext.available &&
    (view === "front" || view === "side" || view === "back" || view === "three_quarter")
  ) {
    reasons.push("single_view_only");
  }
  if (input.medicationEffects.medicationMayAffectWeight) {
    reasons.push("medication_effect_user_reported");
    if (
      input.medicationEffects.appetite === "unknown" ||
      input.medicationEffects.energyLevel === "unknown" ||
      input.medicationEffects.metabolismTendency === "unknown" ||
      input.medicationEffects.muscleBuildingOrPreservation === "unknown"
    ) {
      reasons.push("medication_effect_unknown");
    }
  }
  // Pass through reserved analysis confidence reasons without inventing facts.
  if (input.bodyAnalysis?.confidenceReasons?.includes("strong_backlight")) {
    reasons.push("strong_backlight");
  }
  if (input.bodyAnalysis?.confidenceReasons?.includes("whole_body_visible")) {
    reasons.push("whole_body_visible");
  }
  return reasons;
}

function overallConfidence(
  reasons: string[],
  missingInputs: string[]
): BodyAnalysisConfidence {
  if (missingInputs.length >= 4 || reasons.includes("limited_baseline_data")) {
    return "low";
  }
  if (
    reasons.includes("body_fat_not_provided") ||
    reasons.includes("training_experience_missing") ||
    reasons.includes("target_required_moderation")
  ) {
    return "medium";
  }
  if (
    reasons.includes("body_fat_measurement_available") &&
    reasons.includes("user_declared_weight_available") &&
    reasons.includes("training_experience_available")
  ) {
    return "high";
  }
  return "medium";
}

/**
 * Core simulation: validated input → Transformation Rules.
 */
export function buildBodySimulatorTransformationRules(
  input: BodySimulatorInput
): BodySimulatorTransformationRules {
  const provenance: TransformationRuleProvenance[] = [];
  const moderationReasons: ModerationReason[] = [];
  const limitations: string[] = [];
  const warnings: string[] = [];

  const timelineWeeks = input.goal.timelineWeeks;
  const intensity = input.goal.intensity;
  const goalType = input.goal.type;

  provenance.push({
    rulePath: "goal.effectiveType",
    source: "goal",
    sourcePath: "goal.type",
  });
  provenance.push({
    rulePath: "goal.timelineWeeks",
    source: "timeline",
    sourcePath: "goal.timelineWeeks",
  });

  const { relativeMagnitude } = computeTimelineMagnitude(timelineWeeks);
  const intensityMul = intensityExpectedMultiplier(intensity);
  const spread = intensitySpread(intensity);

  if (intensity === "ambitious") {
    limitations.push(
      "Ambitious intensity is an upper-bound expected visualization within v1 realism constraints, not a guarantee."
    );
    moderationReasons.push("ambitious_intensity_bounded");
  }

  // Identity / proportion boundaries always recorded as active constraints
  provenance.push({
    rulePath: "preservation.identity",
    source: "realism_constraint",
    sourcePath: "options.preserveIdentity",
  });
  moderationReasons.push("identity_preservation_boundary");
  moderationReasons.push("natural_proportion_boundary");

  const experienceRate = muscleRateForExperience(input.profile.trainingExperience);
  const consist = consistencyFactor(input.activity.trainingConsistency);
  const protein = proteinFactor(input.activity.proteinIntakeSupport);
  const recovery = recoveryFactor(input.activity.recoverySupport);
  const muscleSupport = experienceRate * consist * protein * recovery;

  provenance.push({
    rulePath: "wholeBodyChange.muscleChangeKg",
    source: "activity",
    sourcePath: "activity.trainingConsistency",
  });
  provenance.push({
    rulePath: "wholeBodyChange.muscleChangeKg",
    source: "profile",
    sourcePath: "profile.trainingExperience",
  });

  // Medication secondary modifiers
  let medFatMod = 0;
  let medMuscleMod = 0;
  let medEnergyMod = 0;
  if (input.medicationEffects.medicationMayAffectWeight) {
    medFatMod = clampMed(
      appetiteModifier(input.medicationEffects.appetite) +
        metabolismModifier(input.medicationEffects.metabolismTendency),
      BODY_SIM_MED_MAX_WEIGHT_FAT_INFLUENCE
    );
    medEnergyMod = clampMed(
      energyModifier(input.medicationEffects.energyLevel),
      BODY_SIM_MED_MAX_WEIGHT_FAT_INFLUENCE
    );
    medMuscleMod = clampMed(
      muscleMedModifier(input.medicationEffects.muscleBuildingOrPreservation) +
        medEnergyMod * 0.5,
      BODY_SIM_MED_MAX_MUSCLE_INFLUENCE
    );
    if (medFatMod !== 0) {
      provenance.push({
        rulePath: "wholeBodyChange.weightChangeKg",
        source: "medication_effect",
        sourcePath: "medicationEffects.appetite",
      });
      provenance.push({
        rulePath: "wholeBodyChange.bodyFatChangePercentagePoints",
        source: "medication_effect",
        sourcePath: "medicationEffects.metabolismTendency",
      });
    }
    if (medMuscleMod !== 0) {
      provenance.push({
        rulePath: "wholeBodyChange.muscleChangeKg",
        source: "medication_effect",
        sourcePath: "medicationEffects.muscleBuildingOrPreservation",
      });
    }
    if (medEnergyMod !== 0) {
      provenance.push({
        rulePath: "wholeBodyChange.muscleChangeKg",
        source: "medication_effect",
        sourcePath: "medicationEffects.energyLevel",
      });
    }
    warnings.push(
      "Medication-related effects are user-reported bounded modifiers, not verified medical facts."
    );
  }

  const medFatFactor = 1 + medFatMod + medEnergyMod * 0.25;
  const medMuscleFactor = 1 + medMuscleMod;

  // ── Goal mapping → expected signed changes ────────────────────────────────
  let expectedWeight: number | null = null;
  let expectedFatPp: number | null = null;
  let expectedMuscle: number | null = null;
  let weightOrigin: SimulationRange["origin"] = "deterministic_simulation";
  let fatOrigin: SimulationRange["origin"] = "deterministic_simulation";
  let muscleOrigin: SimulationRange["origin"] = "deterministic_simulation";
  let targetModerated = false;

  const applyFatLossTarget = (raw: number) => {
    // raw should be negative for loss
    const signed = raw > 0 ? -raw : raw;
    const mod = moderateLossMagnitude(
      signed,
      timelineWeeks,
      BODY_SIM_MAX_FAT_LOSS_PP_PER_WEEK,
      BODY_SIM_MAX_FAT_LOSS_PP_ABSOLUTE
    );
    if (mod.moderated) {
      targetModerated = true;
      for (const r of mod.reasons) {
        if (!moderationReasons.includes(r)) moderationReasons.push(r);
      }
      fatOrigin = "bounded_user_target";
    } else {
      fatOrigin = "user_target";
    }
    return mod.value * intensityMul * medFatFactor;
  };

  const applyMuscleGainTarget = (raw: number) => {
    const signed = Math.abs(raw);
    const mod = moderateGainMagnitude(
      signed,
      timelineWeeks,
      BODY_SIM_MAX_MUSCLE_GAIN_KG_PER_WEEK,
      BODY_SIM_MAX_MUSCLE_GAIN_KG_ABSOLUTE,
      "muscle_gain_target_exceeds_v1_boundary"
    );
    if (mod.moderated) {
      targetModerated = true;
      for (const r of mod.reasons) {
        if (!moderationReasons.includes(r)) moderationReasons.push(r);
      }
      muscleOrigin = "bounded_user_target";
    } else {
      muscleOrigin = "user_target";
    }
    return mod.value * intensityMul * muscleSupport * medMuscleFactor;
  };

  const applyWeightLossTarget = (raw: number) => {
    const signed = raw > 0 ? -raw : raw;
    const mod = moderateLossMagnitude(
      signed,
      timelineWeeks,
      BODY_SIM_MAX_WEIGHT_LOSS_KG_PER_WEEK,
      BODY_SIM_MAX_WEIGHT_LOSS_KG_ABSOLUTE
    );
    if (mod.moderated) {
      targetModerated = true;
      for (const r of mod.reasons) {
        if (!moderationReasons.includes(r)) moderationReasons.push(r);
      }
      weightOrigin = "bounded_user_target";
    } else {
      weightOrigin = "user_target";
    }
    return mod.value * intensityMul * medFatFactor;
  };

  const applyWeightGainTarget = (raw: number) => {
    const signed = Math.abs(raw);
    const mod = moderateGainMagnitude(
      signed,
      timelineWeeks,
      BODY_SIM_MAX_WEIGHT_GAIN_KG_PER_WEEK,
      BODY_SIM_MAX_WEIGHT_GAIN_KG_ABSOLUTE,
      "muscle_gain_target_exceeds_v1_boundary"
    );
    if (mod.moderated) {
      targetModerated = true;
      for (const r of mod.reasons) {
        if (!moderationReasons.includes(r)) moderationReasons.push(r);
      }
      weightOrigin = "bounded_user_target";
    } else {
      weightOrigin = "user_target";
    }
    return mod.value * intensityMul;
  };

  // Baseline defaults from goal × timeline magnitude
  const timelineScale = relativeMagnitude;

  switch (goalType) {
    case "weight_loss": {
      if (input.goal.targetWeightChangeKg != null) {
        expectedWeight = applyWeightLossTarget(input.goal.targetWeightChangeKg);
      } else {
        expectedWeight =
          -BODY_SIM_DEFAULT_WEIGHT_LOSS_KG_PER_WEEK *
          timelineWeeks *
          timelineScale *
          intensityMul *
          medFatFactor;
        weightOrigin = "deterministic_simulation";
      }
      if (input.goal.targetBodyFatChangePercentagePoints != null) {
        expectedFatPp = applyFatLossTarget(
          input.goal.targetBodyFatChangePercentagePoints
        );
      } else {
        expectedFatPp =
          -BODY_SIM_DEFAULT_FAT_LOSS_PP_PER_WEEK *
          timelineWeeks *
          timelineScale *
          intensityMul *
          medFatFactor;
        fatOrigin = "deterministic_simulation";
      }
      if (input.goal.targetMuscleChangeKg != null) {
        expectedMuscle = input.goal.targetMuscleChangeKg * intensityMul * muscleSupport * medMuscleFactor;
        // Cap muscle loss assumption
        if (expectedMuscle < -2) {
          expectedMuscle = -2;
          targetModerated = true;
          moderationReasons.push("natural_proportion_boundary");
        }
        muscleOrigin = "bounded_user_target";
      } else {
        // Do not assume all lost weight is fat; small uncertain muscle change
        expectedMuscle = round3(
          -0.05 * timelineScale * (1 / muscleSupport) * intensityMul
        );
        muscleOrigin = "deterministic_simulation";
        warnings.push(
          "Muscle change under weight loss is uncertain; preservation is not guaranteed."
        );
      }
      break;
    }
    case "fat_loss_with_muscle_preservation": {
      if (input.goal.targetBodyFatChangePercentagePoints != null) {
        expectedFatPp = applyFatLossTarget(
          input.goal.targetBodyFatChangePercentagePoints
        );
      } else {
        expectedFatPp =
          -BODY_SIM_DEFAULT_FAT_LOSS_PP_PER_WEEK *
          timelineWeeks *
          timelineScale *
          intensityMul *
          medFatFactor;
      }
      if (input.goal.targetWeightChangeKg != null) {
        expectedWeight = applyWeightLossTarget(input.goal.targetWeightChangeKg);
      } else {
        expectedWeight =
          -BODY_SIM_DEFAULT_WEIGHT_LOSS_KG_PER_WEEK *
          0.85 *
          timelineWeeks *
          timelineScale *
          intensityMul *
          medFatFactor;
      }
      if (input.goal.targetMuscleChangeKg != null) {
        expectedMuscle = applyMuscleGainTarget(
          Math.max(0, input.goal.targetMuscleChangeKg)
        );
      } else {
        expectedMuscle = round3(
          0.02 * timelineWeeks * timelineScale * intensityMul * muscleSupport * medMuscleFactor
        );
        if (muscleSupport < 0.9) {
          expectedMuscle = 0;
          warnings.push(
            "Limited training/recovery evidence reduces confidence in muscle preservation."
          );
        }
      }
      break;
    }
    case "muscle_gain": {
      if (input.goal.targetMuscleChangeKg != null) {
        expectedMuscle = applyMuscleGainTarget(input.goal.targetMuscleChangeKg);
      } else {
        expectedMuscle =
          BODY_SIM_DEFAULT_MUSCLE_GAIN_KG_PER_WEEK *
          timelineWeeks *
          timelineScale *
          intensityMul *
          muscleSupport *
          medMuscleFactor;
      }
      if (input.goal.targetWeightChangeKg != null) {
        expectedWeight = applyWeightGainTarget(input.goal.targetWeightChangeKg);
      } else {
        expectedWeight = round3(expectedMuscle * 1.15);
        weightOrigin = "deterministic_simulation";
      }
      if (input.goal.targetBodyFatChangePercentagePoints != null) {
        const bf = input.goal.targetBodyFatChangePercentagePoints;
        expectedFatPp = bf * intensityMul;
        fatOrigin = "user_target";
      } else {
        expectedFatPp = round3(0.3 * timelineScale * intensityMul);
        fatOrigin = "deterministic_simulation";
      }
      break;
    }
    case "body_recomposition": {
      if (input.goal.targetBodyFatChangePercentagePoints != null) {
        expectedFatPp = applyFatLossTarget(
          input.goal.targetBodyFatChangePercentagePoints
        );
      } else {
        expectedFatPp =
          -BODY_SIM_RECOMP_FAT_LOSS_PP_PER_WEEK *
          timelineWeeks *
          timelineScale *
          intensityMul *
          medFatFactor;
      }
      if (input.goal.targetMuscleChangeKg != null) {
        expectedMuscle = applyMuscleGainTarget(input.goal.targetMuscleChangeKg);
      } else {
        expectedMuscle =
          BODY_SIM_RECOMP_MUSCLE_KG_PER_WEEK *
          timelineWeeks *
          timelineScale *
          intensityMul *
          muscleSupport *
          medMuscleFactor;
      }
      if (input.goal.targetWeightChangeKg != null) {
        // May be loss, stable, or slight gain — preserve sign after bound
        const raw = input.goal.targetWeightChangeKg;
        if (raw < 0) {
          expectedWeight = applyWeightLossTarget(raw);
        } else if (raw > 0) {
          expectedWeight = applyWeightGainTarget(raw);
        } else {
          expectedWeight = 0;
          weightOrigin = "user_target";
        }
      } else {
        expectedWeight = round3(
          (expectedFatPp ?? 0) * 0.4 + (expectedMuscle ?? 0) * 0.5
        );
        weightOrigin = "deterministic_simulation";
      }
      limitations.push(
        "Recomposition focuses on composition and shape, not scale weight alone."
      );
      break;
    }
    case "general_fitness_improvement": {
      if (input.goal.targetBodyFatChangePercentagePoints != null) {
        expectedFatPp = applyFatLossTarget(
          input.goal.targetBodyFatChangePercentagePoints
        );
      } else {
        expectedFatPp =
          -BODY_SIM_GENERAL_FITNESS_FAT_LOSS_PP_PER_WEEK *
          timelineWeeks *
          timelineScale *
          intensityMul *
          medFatFactor;
      }
      if (input.goal.targetMuscleChangeKg != null) {
        expectedMuscle = applyMuscleGainTarget(input.goal.targetMuscleChangeKg);
      } else {
        expectedMuscle =
          BODY_SIM_GENERAL_FITNESS_MUSCLE_KG_PER_WEEK *
          timelineWeeks *
          timelineScale *
          intensityMul *
          muscleSupport *
          medMuscleFactor;
      }
      if (input.goal.targetWeightChangeKg != null) {
        expectedWeight =
          input.goal.targetWeightChangeKg < 0
            ? applyWeightLossTarget(input.goal.targetWeightChangeKg)
            : applyWeightGainTarget(input.goal.targetWeightChangeKg);
      } else {
        expectedWeight =
          -BODY_SIM_GENERAL_FITNESS_WEIGHT_KG_PER_WEEK *
          timelineWeeks *
          timelineScale *
          intensityMul *
          medFatFactor;
      }
      limitations.push(
        "General fitness uses modest visual changes when targets are incomplete."
      );
      break;
    }
  }

  // Round
  if (expectedWeight != null) expectedWeight = round3(expectedWeight);
  if (expectedFatPp != null) expectedFatPp = round3(expectedFatPp);
  if (expectedMuscle != null) expectedMuscle = round3(expectedMuscle);

  // Cap ambitious so it cannot exceed realism absolute caps
  if (intensity === "ambitious") {
    if (expectedFatPp != null && expectedFatPp < -BODY_SIM_MAX_FAT_LOSS_PP_ABSOLUTE) {
      expectedFatPp = -BODY_SIM_MAX_FAT_LOSS_PP_ABSOLUTE;
      targetModerated = true;
    }
    if (expectedMuscle != null && expectedMuscle > BODY_SIM_MAX_MUSCLE_GAIN_KG_ABSOLUTE) {
      expectedMuscle = BODY_SIM_MAX_MUSCLE_GAIN_KG_ABSOLUTE;
      targetModerated = true;
    }
  }

  const missingInputs: string[] = [];
  if (input.profile.currentWeightKg == null) missingInputs.push("currentWeightKg");
  if (input.profile.currentBodyFatPercent == null) {
    missingInputs.push("currentBodyFatPercent");
  }
  if (input.profile.heightCm == null) missingInputs.push("heightCm");
  if (input.profile.trainingExperience === "not_provided") {
    missingInputs.push("trainingExperience");
  }
  if (input.profile.ageYears == null) missingInputs.push("ageYears");

  if (missingInputs.length >= 3) {
    if (!moderationReasons.includes("insufficient_baseline_information")) {
      moderationReasons.push("insufficient_baseline_information");
    }
  }

  let sourceCompleteness: "high" | "medium" | "low" = "medium";
  if (missingInputs.length === 0) sourceCompleteness = "high";
  else if (missingInputs.length >= 3) sourceCompleteness = "low";

  const confidenceReasons = buildConfidenceReasons(input);
  if (targetModerated) {
    confidenceReasons.push("target_required_moderation");
  }
  if (sourceCompleteness === "low") {
    confidenceReasons.push("limited_baseline_data");
  }

  // Strip duplicate identity/proportion reasons from user-facing moderation
  // but keep them as provenance — for realism.moderationReasons prefer
  // actionable ones; still include identity/natural when moderated or always?
  // Demand: preferred moderation reasons list includes them. Keep unique list
  // but for non-moderated runs, remove identity/natural/ambitious from
  // moderationReasons unless they applied as actual moderation events.
  const actionableModeration: string[] = [];
  for (const r of moderationReasons) {
    if (
      r === "identity_preservation_boundary" ||
      r === "natural_proportion_boundary"
    ) {
      // Always active constraints — record once in limitations, not as
      // "requested target moderated" unless target was moderated.
      continue;
    }
    if (r === "ambitious_intensity_bounded" && intensity === "ambitious") {
      actionableModeration.push(r);
      continue;
    }
    if (!actionableModeration.includes(r)) actionableModeration.push(r);
  }
  // Always document preservation boundaries in provenance; if target moderated
  // also surface identity/natural in moderation reasons list.
  if (targetModerated) {
    if (!actionableModeration.includes("identity_preservation_boundary")) {
      actionableModeration.push("identity_preservation_boundary");
    }
    if (!actionableModeration.includes("natural_proportion_boundary")) {
      actionableModeration.push("natural_proportion_boundary");
    }
  }

  const wbConfidence = overallConfidence(confidenceReasons, missingInputs);

  const weightRange = rangeFromExpected(
    expectedWeight,
    "kg",
    weightOrigin,
    spread
  );
  const fatRange = rangeFromExpected(
    expectedFatPp,
    "percentage_points",
    fatOrigin,
    spread
  );
  const muscleRange = rangeFromExpected(
    expectedMuscle,
    "kg",
    muscleOrigin,
    spread
  );

  // Regional rules
  const fatDir = goalPrimaryFatDirection(goalType);
  const muscleDir = goalPrimaryMuscleDirection(goalType);
  const regions: BodySimulatorRegionRule[] = BODY_SIMULATOR_REGIONS.map(
    (region) => {
      const fatW = BODY_SIM_REGION_FAT_WEIGHT[region];
      const musW = BODY_SIM_REGION_MUSCLE_WEIGHT[region];
      let visualExpected = BODY_SIM_REGION_VISUAL_BASE * timelineScale * intensityMul;
      if (fatDir === "decrease") {
        visualExpected *= 0.55 * fatW + 0.45 * (muscleDir === "increase" ? musW : 0.5);
      } else if (muscleDir === "increase") {
        visualExpected *= 0.7 * musW + 0.3 * fatW;
      } else {
        visualExpected *= 0.5 * (fatW + musW);
      }
      visualExpected = clamp(
        round3(visualExpected),
        0.05,
        BODY_SIM_REGION_VISUAL_MAX
      );
      const visSpread = visualExpected * spread;
      const visibility = regionVisibility(
        region,
        input.sourceImageContext.progressPhotoView,
        input.sourceImageContext.available
      );
      const regionReasons: string[] = [];
      let conf: BodyAnalysisConfidence = wbConfidence;
      if (visibility === "available") {
        regionReasons.push("body_region_visible");
      } else if (
        visibility === "partially_visible" ||
        visibility === "not_visible"
      ) {
        regionReasons.push("body_region_occluded");
        conf = conf === "high" ? "medium" : "low";
      } else {
        regionReasons.push("body_region_occluded");
        conf = "low";
      }

      return {
        region,
        fatChange: fatChangeLabel(goalType, fatW * timelineScale),
        muscleChange: muscleChangeLabel(
          goalType,
          musW * timelineScale,
          expectedMuscle
        ),
        visualMagnitude: {
          lower: round3(Math.max(0, visualExpected - visSpread)),
          expected: visualExpected,
          upper: round3(
            Math.min(BODY_SIM_REGION_VISUAL_MAX, visualExpected + visSpread)
          ),
        },
        preserveNaturalProportions: true as const,
        visibility,
        confidence: conf,
        confidenceReasons: regionReasons,
        provenanceSourcePaths: [
          "goal.type",
          "goal.timelineWeeks",
          "goal.intensity",
        ],
      };
    }
  );

  limitations.push(
    "Individual fat distribution varies; regional magnitudes are conservative planning estimates."
  );
  limitations.push(
    "Body Simulator output is an expected visualization, not a medical prediction or guaranteed outcome."
  );
  if (input.bodyAnalysis == null) {
    limitations.push("Body Analysis was not supplied and remains optional in v1.");
  } else if (input.bodyAnalysis.status !== "not_run") {
    provenance.push({
      rulePath: "confidence.overall",
      source: "body_analysis",
      sourcePath: "bodyAnalysis.status",
    });
  }

  // Medication cannot dominate: primary magnitude from goal/timeline
  // (enforced by BODY_SIM_MED_MAX_* caps)

  return {
    schemaVersion: BODY_SIMULATOR_RULES_SCHEMA_VERSION,
    simulationId: input.simulationId,
    generatedAt: input.createdAt,
    rulesVersion: BODY_SIMULATOR_RULES_VERSION,
    goal: {
      requestedType: goalType,
      effectiveType: goalType,
      timelineWeeks,
      intensity,
    },
    baseline: {
      sourceCompleteness,
      bodyFatBasis: input.profile.bodyFatBasis,
      missingInputs,
    },
    wholeBodyChange: {
      weightChangeKg: weightRange,
      bodyFatChangePercentagePoints: fatRange,
      muscleChangeKg: muscleRange,
      confidence: wbConfidence,
      confidenceReasons: [...confidenceReasons],
    },
    regions,
    preservation: {
      identity: "preserve",
      originalPresentation: "preserve",
      pose: "preserve",
      cameraFraming: "preserve",
      clothing: "preserve",
      clothingCoverage: "preserve",
      background: "preserve",
      lightingCharacter: "preserve",
      ageAppearance: "preserve",
      ethnicityAppearance: "preserve",
      personalStyle: "preserve",
      faceGeometry: "preserve",
      skinTone: "preserve",
      hairstyle: "preserve",
      bodyHeight: "preserve",
      handAndFootScale: "preserve",
      skeletalProportions: "preserve",
    },
    realism: {
      requestedTargetModerated: targetModerated,
      moderationReasons: targetModerated
        ? actionableModeration.filter((r) => r !== "ambitious_intensity_bounded").length > 0
          ? actionableModeration
          : [...actionableModeration]
        : actionableModeration.filter(
            (r) =>
              r === "ambitious_intensity_bounded" ||
              r === "insufficient_baseline_information"
          ),
      unrealisticChangePrevented: targetModerated,
      expectedVisualizationNotGuarantee: true,
    },
    provenance,
    confidence: {
      overall: wbConfidence,
      reasons: confidenceReasons,
    },
    limitations,
    warnings,
  };
}

/**
 * Main API: validate → simulate → Transformation Rules.
 */
export function simulateBodyTransformation(
  input: unknown
): BodySimulatorSimulateResult {
  const errors = validateBodySimulatorInput(input);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const rules = buildBodySimulatorTransformationRules(input as BodySimulatorInput);
  return { ok: true, rules };
}

export { assessBodySimulatorReadiness };
