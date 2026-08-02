/**
 * TransformationPlan — structured engine output (not prompt prose).
 *
 * Calculations + visual-edit instructions as typed fields.
 * Downstream PromptBuilder may later turn this into text; the plan itself
 * must remain model-agnostic.
 */

/** Schema version for plan payloads. */
export const TRANSFORMATION_PLAN_SCHEMA_VERSION = 1 as const;

/** Discrete visual change intensity for presentation layers. */
export type VisualIntensity = "subtle" | "moderate" | "noticeable" | "dramatic";

/**
 * Heuristic product reliability band for estimates.
 *
 * NOT a statistical confidence interval, medical certainty, or scientific CI.
 * Derived from input completeness / conflict heuristics only.
 */
export type EstimateReliability = "low" | "medium" | "high";

/** Normalized regional change (−1…1 typical; magnitude is relative, not cm). */
export interface RegionalChangeTarget {
  /** Region id (may match FocusZone or a finer key). */
  region: string;

  /**
   * Signed relative magnitude.
   * Positive ≈ growth / fullness; negative ≈ reduction / tightening.
   */
  magnitude: number;

  /** Optional note for adapters (never prompt prose required). */
  note?: string;
}

/** Checkpoint along the timeline (diminishing-returns aware). */
export interface TimelineCheckpoint {
  /** Weeks from start. */
  weeks: number;

  /** Approximate months (weeks / 4.345). */
  months: number;

  /** Front-loaded progress fraction 0…1 (see progressCurve). */
  progress: number;

  /** Expected BF% at this checkpoint when estimable; else null. */
  expectedBodyFatPct: number | null;

  /** Expected weight kg when estimable; else null. */
  expectedWeightKg: number | null;

  /** Band label aligned with lib/transformProgress. */
  band: "early" | "mid" | "nearGoal";
}

/**
 * Estimated transformation outcomes for a profile + goal.
 *
 * Prefer ranges, nullables, assumptions, and warnings over false precision.
 */
export interface TransformationPlan {
  schemaVersion: typeof TRANSFORMATION_PLAN_SCHEMA_VERSION;

  /**
   * Signed fat-mass change (kg). Negative = loss, positive = gain.
   * Null when weight/BF inputs are insufficient.
   */
  estimatedFatChangeKg: number | null;

  /**
   * Signed lean-mass change (kg). Positive = gain.
   * Null when inputs are insufficient.
   */
  estimatedLeanMassChangeKg: number | null;

  /** Expected end weight (kg), or null when unsupported. */
  expectedWeightKg: number | null;

  /** Expected end body-fat %, or null when unsupported. */
  expectedBodyFatPct: number | null;

  /**
   * Expected waist change (cm). Negative = smaller waist.
   * Null when unsupported (do not invent precision).
   */
  waistChangeCm: number | null;

  /** Regional change targets with normalized magnitudes. */
  regionalTargets: RegionalChangeTarget[];

  /** How visually obvious the change should appear. */
  visualIntensity: VisualIntensity;

  /**
   * Heuristic product reliability score in 0…1.
   *
   * Renamed from DEMAND_001 `confidence` / `confidenceScore`.
   * This is NOT a statistical, medical, or scientific confidence interval —
   * only an internal product score from input completeness and conflict checks.
   */
  estimateReliabilityScore: number;

  /**
   * Discrete band for `estimateReliabilityScore`.
   * low < 0.55 ≤ medium < 0.75 ≤ high.
   */
  estimateReliability: EstimateReliability;

  /** Explicit modeling assumptions. */
  assumptions: string[];

  /** Conflict / risk / data-quality warnings. */
  warnings: string[];

  /** Diminishing-return checkpoints (typically 3 / 6 / 12 months). */
  timelineCheckpoints: TimelineCheckpoint[];

  /** Effective timeline used for estimates (weeks), after clamps. */
  effectiveTimelineWeeks: number;

  /** ISO-8601 generation timestamp. */
  generatedAt: string;
}
