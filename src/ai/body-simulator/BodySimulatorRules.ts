/**
 * Body Simulator v1 — named coefficients and modifiers (Demand 022).
 *
 * Versioned location for all simulation heuristics. Every constant has a
 * descriptive name, purpose comment, and regression coverage.
 *
 * Rules version: BODY_SIMULATOR_RULES_VERSION in BodySimulatorTypes.ts
 */

import {
  BODY_SIMULATOR_RULES_VERSION,
  type BodySimulationGoalType,
  type BodySimulationIntensity,
  type BodySimulatorRegion,
  type ReportedEffectDirection,
} from "./BodySimulatorTypes";

export { BODY_SIMULATOR_RULES_VERSION };

// ─── Timeline (diminishing returns; not pure linear) ─────────────────────────
// Uses shared transformProgress(months) = 1 - exp(-months / tau) with tau=4.
// Magnitude scale maps progress fraction into a relative visual change factor.

/** Weeks per month for converting timelineWeeks → months (shared convention). */
export const BODY_SIM_WEEKS_PER_MONTH = 4.345;

/**
 * Relative visual-magnitude scale applied to timeline progress fraction.
 * Purpose: convert 0…1 progress into a bounded relative change factor.
 */
export const BODY_SIM_TIMELINE_MAGNITUDE_SCALE = 1.0;

/**
 * Minimum relative magnitude floor so very short timelines still produce a
 * non-zero but clearly smaller change than longer horizons.
 */
export const BODY_SIM_TIMELINE_MIN_RELATIVE_MAGNITUDE = 0.12;

// ─── Intensity multipliers (expected / range width) ──────────────────────────

/** Conservative expected multiplier — lower end of plausible visual range. */
export const BODY_SIM_INTENSITY_CONSERVATIVE_EXPECTED = 0.7;

/** Realistic expected multiplier — default midpoint of v1 range. */
export const BODY_SIM_INTENSITY_REALISTIC_EXPECTED = 1.0;

/** Ambitious expected multiplier — upper end, still inside realism bounds. */
export const BODY_SIM_INTENSITY_AMBITIOUS_EXPECTED = 1.25;

/** Conservative range half-width factor around expected. */
export const BODY_SIM_INTENSITY_CONSERVATIVE_SPREAD = 0.15;

/** Realistic range half-width factor around expected. */
export const BODY_SIM_INTENSITY_REALISTIC_SPREAD = 0.25;

/** Ambitious range half-width factor around expected (still bounded). */
export const BODY_SIM_INTENSITY_AMBITIOUS_SPREAD = 0.3;

// ─── Realism boundaries (product safeguards, not medical advice) ─────────────

/**
 * Max fat-loss percentage-points per week (absolute magnitude) before moderation.
 * Purpose: prevent extreme short-term fat-loss visualization targets.
 */
export const BODY_SIM_MAX_FAT_LOSS_PP_PER_WEEK = 0.35;

/**
 * Absolute max fat-loss percentage-points over any v1 timeline.
 */
export const BODY_SIM_MAX_FAT_LOSS_PP_ABSOLUTE = 12;

/**
 * Max muscle-gain kg per week before moderation.
 * Purpose: prevent extreme short-term muscle-gain visualization targets.
 */
export const BODY_SIM_MAX_MUSCLE_GAIN_KG_PER_WEEK = 0.12;

/**
 * Absolute max muscle-gain kg over any v1 timeline.
 */
export const BODY_SIM_MAX_MUSCLE_GAIN_KG_ABSOLUTE = 6;

/**
 * Max weight-loss kg per week (signed magnitude) before moderation.
 */
export const BODY_SIM_MAX_WEIGHT_LOSS_KG_PER_WEEK = 0.75;

/**
 * Absolute max weight-loss kg over any v1 timeline.
 */
export const BODY_SIM_MAX_WEIGHT_LOSS_KG_ABSOLUTE = 25;

/**
 * Max weight-gain kg per week before moderation (muscle-gain contexts).
 */
export const BODY_SIM_MAX_WEIGHT_GAIN_KG_PER_WEEK = 0.35;

/**
 * Absolute max weight-gain kg over any v1 timeline.
 */
export const BODY_SIM_MAX_WEIGHT_GAIN_KG_ABSOLUTE = 12;

// ─── Default simulation magnitudes when targets are incomplete ───────────────

/** Default weekly fat-loss pp for weight_loss / fat_loss goals (before timeline). */
export const BODY_SIM_DEFAULT_FAT_LOSS_PP_PER_WEEK = 0.12;

/** Default weekly muscle-gain kg for muscle_gain goals (beginner baseline). */
export const BODY_SIM_DEFAULT_MUSCLE_GAIN_KG_PER_WEEK = 0.06;

/** Default weekly weight-loss kg when weight target missing (weight_loss). */
export const BODY_SIM_DEFAULT_WEIGHT_LOSS_KG_PER_WEEK = 0.35;

/** Modest fat-loss pp/week for general_fitness_improvement. */
export const BODY_SIM_GENERAL_FITNESS_FAT_LOSS_PP_PER_WEEK = 0.04;

/** Modest muscle-gain kg/week for general_fitness_improvement. */
export const BODY_SIM_GENERAL_FITNESS_MUSCLE_KG_PER_WEEK = 0.02;

/** Modest weight-change kg/week for general_fitness (slight decrease). */
export const BODY_SIM_GENERAL_FITNESS_WEIGHT_KG_PER_WEEK = 0.08;

/** Recomposition default fat-loss pp/week. */
export const BODY_SIM_RECOMP_FAT_LOSS_PP_PER_WEEK = 0.08;

/** Recomposition default muscle-gain kg/week. */
export const BODY_SIM_RECOMP_MUSCLE_KG_PER_WEEK = 0.03;

// ─── Training experience modifiers (muscle gain) ─────────────────────────────

/** Beginner muscle-gain rate factor (higher relative adaptation). */
export const BODY_SIM_MUSCLE_RATE_BEGINNER = 1.0;

/** Intermediate muscle-gain rate factor. */
export const BODY_SIM_MUSCLE_RATE_INTERMEDIATE = 0.75;

/** Advanced muscle-gain rate factor (reduced vs beginner). */
export const BODY_SIM_MUSCLE_RATE_ADVANCED = 0.5;

/** Missing experience: neutral rate + confidence reduction (not beginner assume). */
export const BODY_SIM_MUSCLE_RATE_NOT_PROVIDED = 0.7;

// ─── Activity / consistency modifiers ────────────────────────────────────────

/** High training consistency support factor for ranges. */
export const BODY_SIM_CONSISTENCY_HIGH = 1.1;

/** Moderate training consistency support factor. */
export const BODY_SIM_CONSISTENCY_MODERATE = 1.0;

/** Low training consistency support factor. */
export const BODY_SIM_CONSISTENCY_LOW = 0.85;

/** Not-provided consistency: slight reduction + confidence drop. */
export const BODY_SIM_CONSISTENCY_NOT_PROVIDED = 0.9;

/** Protein likely_high muscle-support factor. */
export const BODY_SIM_PROTEIN_HIGH = 1.08;

/** Protein likely_adequate muscle-support factor. */
export const BODY_SIM_PROTEIN_ADEQUATE = 1.0;

/** Protein likely_low muscle-support factor. */
export const BODY_SIM_PROTEIN_LOW = 0.88;

/** Recovery strong muscle-support factor. */
export const BODY_SIM_RECOVERY_STRONG = 1.08;

/** Recovery moderate muscle-support factor. */
export const BODY_SIM_RECOVERY_MODERATE = 1.0;

/** Recovery limited muscle-support factor. */
export const BODY_SIM_RECOVERY_LIMITED = 0.88;

// ─── Medication modifiers (secondary, bounded; never primary) ────────────────

/**
 * Max absolute medication influence on fat/weight expected magnitude.
 * Purpose: ensure med effects cannot dominate goal/timeline/activity.
 */
export const BODY_SIM_MED_MAX_WEIGHT_FAT_INFLUENCE = 0.12;

/**
 * Max absolute medication influence on muscle expected magnitude.
 */
export const BODY_SIM_MED_MAX_MUSCLE_INFLUENCE = 0.1;

/** Appetite slight_decrease → fat-loss support adder. */
export const BODY_SIM_MED_APPETITE_SLIGHT_DECREASE = 0.04;

/** Appetite moderate_decrease → fat-loss support adder. */
export const BODY_SIM_MED_APPETITE_MODERATE_DECREASE = 0.07;

/** Appetite strong_decrease → fat-loss support adder (still capped). */
export const BODY_SIM_MED_APPETITE_STRONG_DECREASE = 0.1;

/** Appetite slight_increase → fat-loss reduction. */
export const BODY_SIM_MED_APPETITE_SLIGHT_INCREASE = -0.04;

/** Appetite moderate_increase → fat-loss reduction. */
export const BODY_SIM_MED_APPETITE_MODERATE_INCREASE = -0.07;

/** Appetite strong_increase → fat-loss reduction (capped). */
export const BODY_SIM_MED_APPETITE_STRONG_INCREASE = -0.1;

/** Energy slight_decrease → adherence penalty. */
export const BODY_SIM_MED_ENERGY_SLIGHT_DECREASE = -0.03;

/** Energy moderate/strong decrease → adherence penalty. */
export const BODY_SIM_MED_ENERGY_MODERATE_DECREASE = -0.05;

/** Energy slight_increase → adherence support. */
export const BODY_SIM_MED_ENERGY_SLIGHT_INCREASE = 0.03;

/** Energy moderate/strong increase → adherence support. */
export const BODY_SIM_MED_ENERGY_MODERATE_INCREASE = 0.05;

/**
 * Metabolism tendency influence scale — intentionally smaller than goal/timeline.
 * Never described as measured metabolic rate.
 */
export const BODY_SIM_MED_METABOLISM_SCALE = 0.5;

/** Muscle building/preservation slight_increase support. */
export const BODY_SIM_MED_MUSCLE_SLIGHT_INCREASE = 0.04;

/** Muscle building/preservation moderate/strong increase support. */
export const BODY_SIM_MED_MUSCLE_MODERATE_INCREASE = 0.07;

/** Muscle building/preservation slight_decrease penalty. */
export const BODY_SIM_MED_MUSCLE_SLIGHT_DECREASE = -0.04;

/** Muscle building/preservation moderate/strong decrease penalty. */
export const BODY_SIM_MED_MUSCLE_MODERATE_DECREASE = -0.07;

// ─── Regional relative visual weights (conservative broad distribution) ──────

/**
 * Relative fat-visual emphasis by region for fat-loss oriented goals.
 * Not an individual fat-distribution prediction.
 */
export const BODY_SIM_REGION_FAT_WEIGHT: Readonly<
  Record<BodySimulatorRegion, number>
> = Object.freeze({
  face_and_neck: 0.45,
  shoulders: 0.35,
  chest_and_upper_torso: 0.55,
  upper_back: 0.4,
  arms: 0.4,
  waist_and_flanks: 1.0,
  abdomen: 1.0,
  hips: 0.75,
  glutes: 0.65,
  thighs: 0.7,
  lower_legs: 0.3,
  whole_body: 0.85,
});

/**
 * Relative muscle-visual emphasis by region for muscle-gain oriented goals.
 * Broad whole-body development — no sport-specific physique assumptions.
 */
export const BODY_SIM_REGION_MUSCLE_WEIGHT: Readonly<
  Record<BodySimulatorRegion, number>
> = Object.freeze({
  face_and_neck: 0.15,
  shoulders: 0.85,
  chest_and_upper_torso: 0.9,
  upper_back: 0.85,
  arms: 0.8,
  waist_and_flanks: 0.35,
  abdomen: 0.45,
  hips: 0.4,
  glutes: 0.75,
  thighs: 0.85,
  lower_legs: 0.55,
  whole_body: 0.8,
});

/** Base visual magnitude scale for regional rules (relative_scale units). */
export const BODY_SIM_REGION_VISUAL_BASE = 0.55;

/** Cap on regional visual magnitude expected value. */
export const BODY_SIM_REGION_VISUAL_MAX = 1.0;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function intensityExpectedMultiplier(
  intensity: BodySimulationIntensity
): number {
  switch (intensity) {
    case "conservative":
      return BODY_SIM_INTENSITY_CONSERVATIVE_EXPECTED;
    case "ambitious":
      return BODY_SIM_INTENSITY_AMBITIOUS_EXPECTED;
    case "realistic":
    default:
      return BODY_SIM_INTENSITY_REALISTIC_EXPECTED;
  }
}

export function intensitySpread(
  intensity: BodySimulationIntensity
): number {
  switch (intensity) {
    case "conservative":
      return BODY_SIM_INTENSITY_CONSERVATIVE_SPREAD;
    case "ambitious":
      return BODY_SIM_INTENSITY_AMBITIOUS_SPREAD;
    case "realistic":
    default:
      return BODY_SIM_INTENSITY_REALISTIC_SPREAD;
  }
}

export function muscleRateForExperience(
  experience: "beginner" | "intermediate" | "advanced" | "not_provided"
): number {
  switch (experience) {
    case "beginner":
      return BODY_SIM_MUSCLE_RATE_BEGINNER;
    case "intermediate":
      return BODY_SIM_MUSCLE_RATE_INTERMEDIATE;
    case "advanced":
      return BODY_SIM_MUSCLE_RATE_ADVANCED;
    case "not_provided":
    default:
      return BODY_SIM_MUSCLE_RATE_NOT_PROVIDED;
  }
}

export function consistencyFactor(
  consistency: "low" | "moderate" | "high" | "not_provided"
): number {
  switch (consistency) {
    case "high":
      return BODY_SIM_CONSISTENCY_HIGH;
    case "moderate":
      return BODY_SIM_CONSISTENCY_MODERATE;
    case "low":
      return BODY_SIM_CONSISTENCY_LOW;
    case "not_provided":
    default:
      return BODY_SIM_CONSISTENCY_NOT_PROVIDED;
  }
}

export function proteinFactor(
  protein: "likely_low" | "likely_adequate" | "likely_high" | "not_provided"
): number {
  switch (protein) {
    case "likely_high":
      return BODY_SIM_PROTEIN_HIGH;
    case "likely_adequate":
      return BODY_SIM_PROTEIN_ADEQUATE;
    case "likely_low":
      return BODY_SIM_PROTEIN_LOW;
    case "not_provided":
    default:
      return 1.0;
  }
}

export function recoveryFactor(
  recovery: "limited" | "moderate" | "strong" | "not_provided"
): number {
  switch (recovery) {
    case "strong":
      return BODY_SIM_RECOVERY_STRONG;
    case "moderate":
      return BODY_SIM_RECOVERY_MODERATE;
    case "limited":
      return BODY_SIM_RECOVERY_LIMITED;
    case "not_provided":
    default:
      return 1.0;
  }
}

/**
 * Map reported appetite direction to a bounded fat/weight modifier.
 * Positive = supports fat/weight loss magnitude; negative = reduces it.
 */
export function appetiteModifier(direction: ReportedEffectDirection): number {
  switch (direction) {
    case "slight_decrease":
      return BODY_SIM_MED_APPETITE_SLIGHT_DECREASE;
    case "moderate_decrease":
      return BODY_SIM_MED_APPETITE_MODERATE_DECREASE;
    case "strong_decrease":
      return BODY_SIM_MED_APPETITE_STRONG_DECREASE;
    case "slight_increase":
      return BODY_SIM_MED_APPETITE_SLIGHT_INCREASE;
    case "moderate_increase":
      return BODY_SIM_MED_APPETITE_MODERATE_INCREASE;
    case "strong_increase":
      return BODY_SIM_MED_APPETITE_STRONG_INCREASE;
    case "no_effect":
    case "unknown":
    default:
      return 0;
  }
}

export function energyModifier(direction: ReportedEffectDirection): number {
  switch (direction) {
    case "slight_decrease":
      return BODY_SIM_MED_ENERGY_SLIGHT_DECREASE;
    case "moderate_decrease":
    case "strong_decrease":
      return BODY_SIM_MED_ENERGY_MODERATE_DECREASE;
    case "slight_increase":
      return BODY_SIM_MED_ENERGY_SLIGHT_INCREASE;
    case "moderate_increase":
    case "strong_increase":
      return BODY_SIM_MED_ENERGY_MODERATE_INCREASE;
    case "no_effect":
    case "unknown":
    default:
      return 0;
  }
}

/**
 * Metabolism tendency: decrease → slight fat-loss support; increase → opposite.
 * Scaled down so it never rivals goal/timeline/activity.
 */
export function metabolismModifier(direction: ReportedEffectDirection): number {
  const raw = appetiteModifier(direction); // same direction semantics for tendency
  return raw * BODY_SIM_MED_METABOLISM_SCALE;
}

export function muscleMedModifier(direction: ReportedEffectDirection): number {
  switch (direction) {
    case "slight_increase":
      return BODY_SIM_MED_MUSCLE_SLIGHT_INCREASE;
    case "moderate_increase":
    case "strong_increase":
      return BODY_SIM_MED_MUSCLE_MODERATE_INCREASE;
    case "slight_decrease":
      return BODY_SIM_MED_MUSCLE_SLIGHT_DECREASE;
    case "moderate_decrease":
    case "strong_decrease":
      return BODY_SIM_MED_MUSCLE_MODERATE_DECREASE;
    case "no_effect":
    case "unknown":
    default:
      return 0;
  }
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Goal primary fat direction for regional mapping. */
export function goalPrimaryFatDirection(
  goal: BodySimulationGoalType
): "decrease" | "stable_or_unknown" | "mixed" {
  switch (goal) {
    case "weight_loss":
    case "fat_loss_with_muscle_preservation":
    case "body_recomposition":
      return "decrease";
    case "muscle_gain":
      return "stable_or_unknown";
    case "general_fitness_improvement":
      return "mixed";
    default:
      return "mixed";
  }
}

/** Goal primary muscle direction for regional mapping. */
export function goalPrimaryMuscleDirection(
  goal: BodySimulationGoalType
): "increase" | "stable" | "mixed" {
  switch (goal) {
    case "muscle_gain":
    case "body_recomposition":
      return "increase";
    case "fat_loss_with_muscle_preservation":
      return "stable";
    case "weight_loss":
    case "general_fitness_improvement":
      return "mixed";
    default:
      return "mixed";
  }
}
