/**
 * TransformationGoal — desired end-state direction for planning.
 *
 * Paired with BodyProfile as input to TransformationEngine / GoalPlanner.
 * Pure types only.
 */

import type { FocusZone, NutritionQuality } from "./BodyProfile";

/** Schema version for goal payloads. */
export const TRANSFORMATION_GOAL_SCHEMA_VERSION = 1 as const;

/** Desired soft-tissue / fat direction. */
export type FatDirection = "decrease" | "maintain" | "increase";

/** Desired lean-mass / muscle direction. */
export type MuscleDirection = "increase" | "maintain" | "decrease";

/** How hard the user intends to push (training + adherence). */
export type EffortLevel = "low" | "moderate" | "high" | "very_high";

/** High-level outcome labels (product priorities, not medical claims). */
export type GoalOutcome =
  | "fat_loss"
  | "muscle_gain"
  | "recomp"
  | "maintenance"
  | "athletic_performance"
  | "toned"
  | "stronger"
  | "vshape";

/**
 * Target outcomes the engine should aim toward.
 * Partial goals are valid — missing numerics must not be invented as certainty.
 */
export interface TransformationGoal {
  /** Payload schema version. */
  schemaVersion: typeof TRANSFORMATION_GOAL_SCHEMA_VERSION;

  /** Desired body-fat percentage when known. */
  targetBodyFatPct?: number;

  /** Desired body weight (kg) when known. */
  targetWeightKg?: number;

  /** Fat soft-tissue direction. */
  fatDirection: FatDirection;

  /** Muscle / lean-mass direction. */
  muscleDirection: MuscleDirection;

  /** Regions to prioritize in regional targets. */
  focusZones?: FocusZone[];

  /** Requested planning horizon in weeks. */
  timelineWeeks?: number;

  /** Intended effort / adherence intensity. */
  effortLevel?: EffortLevel;

  /**
   * Relative muscle-gain priority in [0, 1].
   * Product heuristic weight — not a physiological constant.
   */
  musclePriority?: number;

  /**
   * Relative fat-loss priority in [0, 1].
   * Product heuristic weight — not a physiological constant.
   */
  fatLossPriority?: number;

  /** Outcome / priority labels. */
  outcomes?: GoalOutcome[];

  /** Optional nutrition quality override for planning notes. */
  nutritionQuality?: NutritionQuality;
}
