/**
 * TransformationGoal — desired end-state physique and visual direction.
 *
 * Paired with BodyProfile as input to TransformationEngine and GoalPlanner.
 * Pure types only; no I/O or AI calls.
 */

/**
 * Relative priority for building muscle vs. losing fat.
 * Numeric scale: 0 = none, 1 = maximum emphasis within the plan horizon.
 */
export type PriorityScore = number;

/**
 * Preferred visual presentation for future imagery / coaching tone.
 * Stubbed for PromptBuilder; engine may map style to intensity caps.
 */
export type VisualStyle =
  | "natural"
  | "athletic"
  | "lean"
  | "muscular"
  | "soft_toned"
  | "competition_lean";

/**
 * Planning horizon for the transformation.
 * Prefer `weeks` for engine math; `label` is optional human-facing metadata.
 */
export interface TransformationTimeline {
  /** Duration in weeks (primary unit for rate calculations). */
  weeks: number;

  /** Optional display label (e.g. "3 months"). */
  label?: string;
}

/**
 * Target body outcomes the user wants the engine / planner to aim for.
 *
 * Fields may be partially specified; consumers should treat missing numeric
 * targets as "derive from goalType + timeline" when wired later.
 */
export interface TransformationGoal {
  /**
   * Desired body-fat percentage at the end of the timeline.
   * Same units as BodyProfile.bodyFat (percent, not fraction).
   */
  targetBodyFat: number;

  /**
   * Desired body weight in kilograms at the end of the timeline.
   * Optional when the plan is primarily recomp / BF%-driven.
   */
  targetWeight?: number;

  /**
   * Emphasis on muscle gain (0–1). Higher values raise muscle-gain estimates
   * and protein recommendations within physiological ceilings.
   */
  musclePriority: PriorityScore;

  /**
   * Emphasis on fat loss (0–1). Higher values raise fat-loss rate estimates
   * and may lower muscle-gain estimates (trade-off).
   */
  fatLossPriority: PriorityScore;

  /** Preferred look / coaching visual direction. */
  visualStyle: VisualStyle;

  /** Desired or requested timeline for the transformation. */
  timeline: TransformationTimeline;
}
