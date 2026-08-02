/**
 * Helseapp AI architecture barrel exports.
 *
 * Pure TypeScript foundation for body transformation planning.
 * Not wired into the app yet — import from `src/ai` when integrating.
 *
 * Modules:
 * - BodyProfile / TransformationGoal — inputs
 * - TransformationEngine / TransformationPlan — physique delta estimates
 * - GoalPlanner — calories, protein, monthly trajectories
 * - PromptBuilder / Validator — stubs for future prompt & QA layers
 */

export type {
  ActivityLevel,
  BodyFrame,
  BodyProfile,
  BodyType,
  EffortLevel,
  FocusZone,
  Gender,
  GoalType,
  NutritionQuality,
  TrainingLevel,
} from "./BodyProfile";

export type {
  PriorityScore,
  TransformationGoal,
  TransformationTimeline,
  VisualStyle,
} from "./TransformationGoal";

export type {
  TransformationPlan,
  VisualIntensity,
} from "./TransformationPlan";

export { TransformationEngine } from "./TransformationEngine";

export type { PromptBuilderContext } from "./PromptBuilder";
export { PromptBuilder } from "./PromptBuilder";

export type { ValidationInput, ValidationResult } from "./Validator";
export { Validator } from "./Validator";

export type { GoalPlanResult, MonthlyProjection } from "./GoalPlanner";
export { GoalPlanner } from "./GoalPlanner";
