/**
 * Runtime validation for BodyProfile and TransformationGoal.
 *
 * Rejects invalid input — never silently repairs. Warnings are for unusual
 * but still allowed values.
 */

import {
  BODY_PROFILE_SCHEMA_VERSION,
  type ActivityLevel,
  type BodyFrame,
  type BodyProfile,
  type BodyType,
  type FocusZone,
  type NutritionQuality,
  type SexOrPresentation,
  type TrainingLevel,
} from "./BodyProfile";
import {
  TRANSFORMATION_GOAL_SCHEMA_VERSION,
  type EffortLevel,
  type FatDirection,
  type GoalOutcome,
  type MuscleDirection,
  type TransformationGoal,
} from "./TransformationGoal";

/**
 * Discriminated validation result.
 * `ok: true` carries the original value unchanged (no repair).
 */
export type ValidationResult<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

/** Inclusive numeric range used by validators. */
export interface NumericRange {
  min: number;
  max: number;
}

/** Shared allowed ranges (single source — do not duplicate elsewhere). */
export const PROFILE_RANGES = {
  age: { min: 13, max: 100 } satisfies NumericRange,
  heightCm: { min: 120, max: 230 } satisfies NumericRange,
  weightKg: { min: 30, max: 300 } satisfies NumericRange,
  bodyFat: { min: 3, max: 60 } satisfies NumericRange,
  bmi: { min: 10, max: 80 } satisfies NumericRange,
  trainingAgeYears: { min: 0, max: 80 } satisfies NumericRange,
} as const;

export const GOAL_RANGES = {
  timelineWeeks: { min: 4, max: 104 } satisfies NumericRange,
  musclePriority: { min: 0, max: 1 } satisfies NumericRange,
  fatLossPriority: { min: 0, max: 1 } satisfies NumericRange,
  targetBodyFatPct: { min: 3, max: 60 } satisfies NumericRange,
  targetWeightKg: { min: 30, max: 300 } satisfies NumericRange,
} as const;

const SEX_VALUES: readonly SexOrPresentation[] = [
  "female",
  "male",
  "unspecified",
];
const FRAME_VALUES: readonly BodyFrame[] = [
  "small",
  "medium",
  "average",
  "large",
];
const BODY_TYPE_VALUES: readonly BodyType[] = [
  "ectomorph",
  "mesomorph",
  "endomorph",
  "athletic",
  "average",
  "soft",
];
const TRAINING_LEVEL_VALUES: readonly TrainingLevel[] = [
  "beginner",
  "novice",
  "intermediate",
  "advanced",
  "elite",
];
const ACTIVITY_LEVEL_VALUES: readonly ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
];
const NUTRITION_VALUES: readonly NutritionQuality[] = [
  "poor",
  "fair",
  "good",
  "excellent",
];
const FOCUS_ZONE_VALUES: readonly FocusZone[] = [
  "shoulders",
  "chest",
  "arms",
  "back",
  "core",
  "waist",
  "glutes",
  "legs",
  "full_body",
];
const FAT_DIRECTIONS: readonly FatDirection[] = [
  "decrease",
  "maintain",
  "increase",
];
const MUSCLE_DIRECTIONS: readonly MuscleDirection[] = [
  "increase",
  "maintain",
  "decrease",
];
const EFFORT_VALUES: readonly EffortLevel[] = [
  "low",
  "moderate",
  "high",
  "very_high",
];
const OUTCOME_VALUES: readonly GoalOutcome[] = [
  "fat_loss",
  "muscle_gain",
  "recomp",
  "maintenance",
  "athletic_performance",
  "toned",
  "stronger",
  "vshape",
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function pushRangeError(
  errors: string[],
  field: string,
  value: number,
  range: NumericRange
): void {
  errors.push(
    `${field} must be between ${range.min} and ${range.max} (received ${value}).`
  );
}

/**
 * Validate a numeric field when present.
 * Returns true if the value is usable (finite + in range).
 */
function checkOptionalNumber(
  field: string,
  value: unknown,
  range: NumericRange,
  errors: string[],
  warnings: string[],
  unusual?: { low?: number; high?: number; message: string }
): void {
  if (value === undefined) return;
  if (value === null) {
    errors.push(`${field} must be a finite number when provided (received null).`);
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(
      `${field} must be a finite number (received ${String(value)}).`
    );
    return;
  }
  if (value < range.min || value > range.max) {
    pushRangeError(errors, field, value, range);
    return;
  }
  if (
    unusual &&
    ((unusual.low != null && value < unusual.low) ||
      (unusual.high != null && value > unusual.high))
  ) {
    warnings.push(unusual.message);
  }
}

function checkEnum<T extends string>(
  field: string,
  value: unknown,
  allowed: readonly T[],
  errors: string[]
): void {
  if (value === undefined) return;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    errors.push(
      `${field} must be one of: ${allowed.join(", ")} (received ${String(value)}).`
    );
  }
}

function checkStringArray(
  field: string,
  value: unknown,
  errors: string[]
): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    errors.push(`${field} must be an array of strings when provided.`);
  }
}

/**
 * Validate a BodyProfile. Does not mutate or repair input.
 */
export function validateBodyProfile(
  input: unknown
): ValidationResult<BodyProfile> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      errors: ["BodyProfile must be a non-null object."],
      warnings,
    };
  }

  const profile = input as BodyProfile;

  if (profile.schemaVersion !== BODY_PROFILE_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${BODY_PROFILE_SCHEMA_VERSION} (received ${String(profile.schemaVersion)}).`
    );
  }

  checkOptionalNumber(
    "age",
    profile.age,
    PROFILE_RANGES.age,
    errors,
    warnings,
    {
      low: 16,
      high: 80,
      message: "age is unusual but within allowed range.",
    }
  );
  checkOptionalNumber(
    "heightCm",
    profile.heightCm,
    PROFILE_RANGES.heightCm,
    errors,
    warnings,
    {
      low: 140,
      high: 210,
      message: "heightCm is unusual but within allowed range.",
    }
  );
  checkOptionalNumber(
    "weightKg",
    profile.weightKg,
    PROFILE_RANGES.weightKg,
    errors,
    warnings,
    {
      low: 40,
      high: 200,
      message: "weightKg is unusual but within allowed range.",
    }
  );
  checkOptionalNumber(
    "bodyFatPct",
    profile.bodyFatPct,
    PROFILE_RANGES.bodyFat,
    errors,
    warnings,
    {
      low: 5,
      high: 45,
      message: "bodyFatPct is unusual but within allowed range.",
    }
  );
  checkOptionalNumber(
    "bodyFat",
    profile.bodyFat,
    PROFILE_RANGES.bodyFat,
    errors,
    warnings
  );
  checkOptionalNumber("bmi", profile.bmi, PROFILE_RANGES.bmi, errors, warnings);
  checkOptionalNumber(
    "trainingAgeYears",
    profile.trainingAgeYears,
    PROFILE_RANGES.trainingAgeYears,
    errors,
    warnings
  );

  if (profile.sex !== undefined) {
    checkEnum("sex", profile.sex, SEX_VALUES, errors);
  }
  if (profile.gender !== undefined) {
    const genderAllowed = [...SEX_VALUES, "nonbinary"] as const;
    checkEnum("gender", profile.gender, genderAllowed, errors);
  }
  checkEnum("frame", profile.frame, FRAME_VALUES, errors);
  checkEnum("bodyType", profile.bodyType, BODY_TYPE_VALUES, errors);
  checkEnum("trainingLevel", profile.trainingLevel, TRAINING_LEVEL_VALUES, errors);
  checkEnum("activityLevel", profile.activityLevel, ACTIVITY_LEVEL_VALUES, errors);
  checkEnum(
    "nutritionQuality",
    profile.nutritionQuality,
    NUTRITION_VALUES,
    errors
  );
  checkStringArray("limitations", profile.limitations, errors);

  if (
    isFiniteNumber(profile.bodyFatPct) &&
    isFiniteNumber(profile.bodyFat) &&
    profile.bodyFatPct !== profile.bodyFat
  ) {
    warnings.push(
      "bodyFatPct and deprecated bodyFat both set to different values; prefer bodyFatPct."
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }
  return { ok: true, value: profile, warnings };
}

/**
 * Validate a TransformationGoal. Does not mutate or repair input.
 */
export function validateTransformationGoal(
  input: unknown
): ValidationResult<TransformationGoal> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      errors: ["TransformationGoal must be a non-null object."],
      warnings,
    };
  }

  const goal = input as TransformationGoal;

  if (goal.schemaVersion !== TRANSFORMATION_GOAL_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${TRANSFORMATION_GOAL_SCHEMA_VERSION} (received ${String(goal.schemaVersion)}).`
    );
  }

  if (goal.fatDirection === undefined) {
    errors.push("fatDirection is required.");
  } else {
    checkEnum("fatDirection", goal.fatDirection, FAT_DIRECTIONS, errors);
  }

  if (goal.muscleDirection === undefined) {
    errors.push("muscleDirection is required.");
  } else {
    checkEnum(
      "muscleDirection",
      goal.muscleDirection,
      MUSCLE_DIRECTIONS,
      errors
    );
  }

  checkOptionalNumber(
    "targetBodyFatPct",
    goal.targetBodyFatPct,
    GOAL_RANGES.targetBodyFatPct,
    errors,
    warnings,
    {
      low: 5,
      high: 40,
      message: "targetBodyFatPct is unusual but within allowed range.",
    }
  );
  checkOptionalNumber(
    "targetWeightKg",
    goal.targetWeightKg,
    GOAL_RANGES.targetWeightKg,
    errors,
    warnings
  );
  checkOptionalNumber(
    "timelineWeeks",
    goal.timelineWeeks,
    GOAL_RANGES.timelineWeeks,
    errors,
    warnings,
    {
      low: 8,
      high: 52,
      message: "timelineWeeks is unusual but within allowed range.",
    }
  );
  checkOptionalNumber(
    "musclePriority",
    goal.musclePriority,
    GOAL_RANGES.musclePriority,
    errors,
    warnings
  );
  checkOptionalNumber(
    "fatLossPriority",
    goal.fatLossPriority,
    GOAL_RANGES.fatLossPriority,
    errors,
    warnings
  );

  checkEnum("effortLevel", goal.effortLevel, EFFORT_VALUES, errors);
  checkEnum(
    "nutritionQuality",
    goal.nutritionQuality,
    NUTRITION_VALUES,
    errors
  );

  if (goal.focusZones !== undefined) {
    if (!Array.isArray(goal.focusZones)) {
      errors.push("focusZones must be an array when provided.");
    } else {
      const seen = new Set<string>();
      for (const zone of goal.focusZones) {
        if (!(FOCUS_ZONE_VALUES as readonly string[]).includes(zone)) {
          errors.push(`focusZones contains unknown zone: ${String(zone)}.`);
        }
        if (seen.has(zone)) {
          errors.push(`focusZones must not contain duplicates (${zone}).`);
        }
        seen.add(zone);
      }
    }
  }

  if (goal.outcomes !== undefined) {
    if (!Array.isArray(goal.outcomes)) {
      errors.push("outcomes must be an array when provided.");
    } else {
      for (const outcome of goal.outcomes) {
        if (!(OUTCOME_VALUES as readonly string[]).includes(outcome)) {
          errors.push(`outcomes contains unknown value: ${String(outcome)}.`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }
  return { ok: true, value: goal, warnings };
}
