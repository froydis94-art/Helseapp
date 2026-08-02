/**
 * Helseapp AI domain barrel exports.
 *
 * Pure TypeScript foundation for body transformation planning.
 * Not wired into the prompt pipeline or UI — import when integrating.
 *
 * Path note (DEMAND_001): modules live under `src/ai/` (established in 7ef296b)
 * rather than nesting a new `src/ai/domain/` folder, to keep the additive surface
 * stable. Logic is still a pure domain layer with no React/Replicate deps.
 *
 * DEMAND_002 notes:
 * - `confidence` / `confidenceScore` → `estimateReliabilityScore` + `estimateReliability`
 * - Input `ValidationResult<T>` lives in `./validation.ts`
 * - Stub image-check result renamed to `ValidatorCheckResult`
 */

export {
  BODY_PROFILE_SCHEMA_VERSION,
  resolveBodyFatPct,
  resolveSex,
} from "./BodyProfile";
export type {
  ActivityLevel,
  BodyFrame,
  BodyProfile,
  BodyType,
  FocusZone,
  NutritionQuality,
  SexOrPresentation,
  TrainingLevel,
} from "./BodyProfile";

export { TRANSFORMATION_GOAL_SCHEMA_VERSION } from "./TransformationGoal";
export type {
  EffortLevel,
  FatDirection,
  GoalOutcome,
  MuscleDirection,
  TransformationGoal,
} from "./TransformationGoal";

export {
  TRANSFORMATION_PLAN_SCHEMA_VERSION,
  TRANSFORM_RULES_VERSION,
} from "./TransformationPlan";
export type {
  EstimateReliability,
  HeuristicKgRange,
  RegionalChangeTarget,
  TimelineCheckpoint,
  TransformationPlan,
  VisualIntensity,
} from "./TransformationPlan";

export {
  TransformationEngine,
  toEstimateReliability,
} from "./TransformationEngine";

export type {
  PromptBuilder,
  PromptPackage,
  StructuredPromptOutput,
} from "./PromptBuilder";
export { StubPromptBuilder, buildPromptPackage } from "./PromptBuilder";

export {
  StubTransformationValidator,
  Validator,
  type TransformationValidator,
  type ValidationInput,
  type ValidatorCheckResult,
} from "./TransformationValidator";

export type {
  GoalPlanResult,
  MonthlyProjection,
  TimelineWeekRange,
} from "./GoalPlanner";
export { GoalPlanner } from "./GoalPlanner";

/** Provider-independent image generation boundary (stubs only — not wired to production). */
export type {
  AspectRatio,
  GenerationQuality,
  GenerationStyle,
  ImageGenerationRequest,
  ImageGenerationResult,
  ModelAdapter,
  ReplicateAdapterRequestOptions,
} from "./model";
export { ModelRegistry, ReplicateAdapter } from "./model";

export {
  TRANSFORM_PROGRESS_TAU,
  bfAtHorizon,
  normalizedTransformProgress,
  progressBand,
  transformProgress,
} from "./progressCurve";
export type { ProgressBand } from "./progressCurve";

export {
  GOAL_RANGES,
  PROFILE_RANGES,
  validateBodyProfile,
  validateTransformationGoal,
} from "./validation";
export type { NumericRange, ValidationResult } from "./validation";
