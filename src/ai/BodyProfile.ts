/**
 * BodyProfile — typed snapshot of a user's current physique and training context.
 *
 * Used as the primary input to TransformationEngine and GoalPlanner.
 * All categorical fields use string unions for compile-time safety.
 * This module is pure data types; it performs no I/O or AI calls.
 */

/** Biological / presentation sex used for heuristic body-composition formulas. */
export type Gender = "female" | "male" | "nonbinary" | "unspecified";

/** Skeletal frame size relative to height (wrist/ankle heuristic class). */
export type BodyFrame = "small" | "medium" | "large";

/**
 * Broad somatotype / appearance category.
 * Used only as a soft prior for visual intensity and muscle-gain ceilings.
 */
export type BodyType =
  | "ectomorph"
  | "mesomorph"
  | "endomorph"
  | "athletic"
  | "average"
  | "soft";

/** Current resistance-training experience band. */
export type TrainingLevel =
  | "beginner"
  | "novice"
  | "intermediate"
  | "advanced"
  | "elite";

/** Primary transformation objective. */
export type GoalType =
  | "fat_loss"
  | "muscle_gain"
  | "recomp"
  | "maintenance"
  | "athletic_performance";

/** Regions the user wants emphasized in planning / future visuals. */
export type FocusZone =
  | "shoulders"
  | "chest"
  | "arms"
  | "back"
  | "core"
  | "waist"
  | "glutes"
  | "legs"
  | "full_body";

/** Habitual daily activity outside structured training. */
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

/** Self-reported diet quality (affects calorie / protein recommendations). */
export type NutritionQuality =
  | "poor"
  | "fair"
  | "good"
  | "excellent";

/** How hard the user intends to push (training + adherence). */
export type EffortLevel = "low" | "moderate" | "high" | "very_high";

/**
 * Current-state body and lifestyle profile for transformation planning.
 *
 * Assumptions shared by consumers:
 * - Anthropometrics are self-reported or measured; BMI is expected to be
 *   consistent with heightCm / weightKg when both are present.
 * - bodyFat is percent body fat (e.g. 22 = 22%), not a fraction.
 * - trainingAgeYears is years of consistent training, not calendar age.
 */
export interface BodyProfile {
  /** Gender used for sex-specific composition heuristics. */
  gender: Gender;

  /** Age in whole years. */
  age: number;

  /** Standing height in centimetres. */
  heightCm: number;

  /** Current body weight in kilograms. */
  weightKg: number;

  /** Current body-fat percentage (0–60 typical range). */
  bodyFat: number;

  /** Body mass index; may be precomputed or derived from height/weight. */
  bmi: number;

  /** Skeletal frame classification. */
  frame: BodyFrame;

  /** Broad body-type prior. */
  bodyType: BodyType;

  /** Resistance-training experience band. */
  trainingLevel: TrainingLevel;

  /** Years of consistent structured training. */
  trainingAgeYears: number;

  /** Primary goal category. */
  goalType: GoalType;

  /** Body regions to prioritize. */
  focusZones: FocusZone[];

  /** Habitual non-training activity. */
  activityLevel: ActivityLevel;

  /** Self-reported nutrition quality. */
  nutritionQuality: NutritionQuality;

  /** User-requested planning horizon in weeks. */
  timelineWeeks: number;

  /** Intended effort / adherence intensity. */
  effortLevel: EffortLevel;

  /**
   * Free-text or structured limitation notes (injuries, equipment, medical).
   * Empty array means none declared.
   */
  limitations: string[];
}
