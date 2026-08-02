/**
 * TransformationPlan — deterministic output of TransformationEngine.
 *
 * Describes estimated physique deltas and confidence metadata for a given
 * BodyProfile + TransformationGoal. Pure data; no prompts or I/O.
 */

import type { BodyProfile } from "./BodyProfile";
import type { TransformationGoal } from "./TransformationGoal";

/**
 * Discrete visual change intensity for downstream presentation layers.
 * Engine maps continuous heuristics into this band.
 */
export type VisualIntensity = "subtle" | "moderate" | "noticeable" | "dramatic";

/**
 * Estimated transformation outcomes over the goal timeline.
 *
 * Conventions:
 * - Mass deltas are in kg (positive = gain / loss as named).
 * - Circumference / percent fields are signed in the direction named
 *   (e.g. waistReductionCm > 0 means a smaller waist).
 * - confidenceScore is 0–1 (higher = more trustworthy estimate).
 */
export interface TransformationPlan {
  /** Estimated fat mass lost over the timeline (kg). Always >= 0. */
  estimatedFatLossKg: number;

  /** Estimated lean/muscle mass gained over the timeline (kg). Always >= 0. */
  estimatedMuscleGainKg: number;

  /** Estimated reduction in waist circumference (cm). Always >= 0. */
  waistReductionCm: number;

  /**
   * Estimated relative increase in shoulder breadth / deltoid fullness (%).
   * Always >= 0. Conservative; not a circumference in cm.
   */
  shoulderIncreasePercent: number;

  /**
   * Estimated relative increase in chest circumference / fullness (%).
   * Always >= 0.
   */
  chestIncreasePercent: number;

  /**
   * Estimated relative increase in upper-arm circumference / fullness (%).
   * Always >= 0.
   */
  armIncreasePercent: number;

  /**
   * Band describing how visually obvious the change should appear.
   * Derived from combined deltas and timeline length.
   */
  visualIntensity: VisualIntensity;

  /**
   * Heuristic confidence in the estimates (0–1).
   * Lowered by extreme goals, short timelines, advanced trainees, or limitations.
   */
  confidenceScore: number;

  /**
   * Human-readable caveats (e.g. aggressive cut, plateau risk).
   * Empty when no issues detected.
   */
  warnings: string[];

  /**
   * Optional echo of the profile used to produce this plan.
   * Useful for debugging; not required by consumers.
   */
  sourceProfile?: BodyProfile;

  /**
   * Optional echo of the goal used to produce this plan.
   */
  sourceGoal?: TransformationGoal;

  /**
   * Timeline weeks the estimates were computed for
   * (may differ from user request if clamped).
   */
  effectiveTimelineWeeks?: number;

  /**
   * ISO-8601 timestamp when the plan was generated (set by engine).
   */
  generatedAt?: string;
}
