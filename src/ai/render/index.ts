/**
 * RenderPlan barrel — provider-neutral structured rendering contract.
 *
 * Foundation only — not wired to production UI or image providers.
 */

export type {
  RenderChange,
  RenderChangeDirection,
  RenderChangeKind,
  RenderOperation,
  RenderPlan,
  RenderPlanValidationResult,
} from "./RenderPlan";

export {
  RENDER_PLAN_RULES_VERSION,
  RENDER_PLAN_SCHEMA_VERSION,
} from "./RenderPlan";

export { buildRenderPlan, validateRenderPlan } from "./RenderPlanBuilder";
