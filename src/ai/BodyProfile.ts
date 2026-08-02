/**
 * BodyProfile — typed snapshot of current physique / training context.
 *
 * Domain input for TransformationEngine and GoalPlanner.
 * Pure types only — no I/O, prompts, or model calls.
 *
 * Optionality: only values the product already collects (or can derive)
 * should be treated as commonly present. Uncertain measurements stay optional.
 */

/** Schema version for forward-compatible profile payloads. */
export const BODY_PROFILE_SCHEMA_VERSION = 1 as const;

/**
 * Sex / presentation values already used by the app (male/female)
 * plus a soft unspecified fallback when unknown.
 */
export type SexOrPresentation = "female" | "male" | "unspecified";

/**
 * Skeletal frame keys aligned with existing FRAME_COPY usage
 * (`small` | `average` | `large`). `medium` kept as alias-friendly input.
 */
export type BodyFrame = "small" | "medium" | "average" | "large";

/** Broad appearance / somatotype prior (soft signal only). */
export type BodyType =
  | "ectomorph"
  | "mesomorph"
  | "endomorph"
  | "athletic"
  | "average"
  | "soft";

/** Resistance-training experience band. */
export type TrainingLevel =
  | "beginner"
  | "novice"
  | "intermediate"
  | "advanced"
  | "elite";

/** Habitual daily activity outside structured training. */
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

/** Self-reported diet quality. */
export type NutritionQuality = "poor" | "fair" | "good" | "excellent";

/** Regions the user wants emphasized. */
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

/**
 * Current-state body and lifestyle profile.
 *
 * Anthropometrics may be partial — engine/planner must tolerate missing BF%,
 * age, training age, etc., and emit assumptions / warnings instead of inventing facts.
 */
export interface BodyProfile {
  /** Payload schema version. */
  schemaVersion: typeof BODY_PROFILE_SCHEMA_VERSION;

  /** Sex / presentation already used by the app. */
  sex?: SexOrPresentation;

  /**
   * @deprecated Prefer `sex`. Kept for early foundation callers.
   */
  gender?: SexOrPresentation | "nonbinary";

  /** Age in whole years when available. */
  age?: number;

  /** Standing height in centimetres. */
  heightCm?: number;

  /** Current body weight in kilograms. */
  weightKg?: number;

  /** Current body-fat percentage (e.g. 22 = 22%). Prefer this name. */
  bodyFatPct?: number;

  /**
   * @deprecated Prefer `bodyFatPct`.
   */
  bodyFat?: number;

  /** BMI when provided or derived elsewhere. */
  bmi?: number;

  /** Skeletal frame classification. */
  frame?: BodyFrame;

  /** Broad body-type prior. */
  bodyType?: BodyType;

  /** Resistance-training experience band. */
  trainingLevel?: TrainingLevel;

  /** Years of consistent structured training. */
  trainingAgeYears?: number;

  /** Habitual non-training activity. */
  activityLevel?: ActivityLevel;

  /** Self-reported nutrition quality / profile. */
  nutritionQuality?: NutritionQuality;

  /** Free-text or structured limitation notes. */
  limitations?: string[];
}

/** Resolve effective BF% from either field name. */
export function resolveBodyFatPct(profile: BodyProfile): number | undefined {
  const v = profile.bodyFatPct ?? profile.bodyFat;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Resolve sex/presentation from either field name. */
export function resolveSex(profile: BodyProfile): SexOrPresentation {
  const raw = profile.sex ?? profile.gender;
  if (raw === "female" || raw === "male") return raw;
  return "unspecified";
}
