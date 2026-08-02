/**
 * ValidationDecision — accept / retry / reject outcome from ResultValidator.
 *
 * Retry recommendations must never escalate approved physiology.
 */

import type { ValidationDimension } from "./ValidationEvidence";

export const RESULT_VALIDATOR_RULES_VERSION = "1.0" as const;

export type ValidationOutcome = "accept" | "retry" | "reject";

export type ValidationSeverity = "info" | "warning" | "critical";

export type ValidationFailureCode =
  | "missing_required_dimension"
  | "invalid_evidence"
  | "identity_failure"
  | "anatomy_failure"
  | "plan_adherence_failure"
  | "photorealism_failure"
  | "pose_camera_failure"
  | "safety_failure"
  | "low_evidence_confidence"
  | "retry_budget_exhausted";

export type RetryAdjustment =
  | "strengthen_identity_preservation"
  | "strengthen_anatomy_constraints"
  | "strengthen_plan_adherence"
  | "strengthen_pose_camera_preservation"
  | "strengthen_photorealism"
  | "reduce_visual_emphasis"
  | "switch_model_tier"
  | "switch_provider";

export interface ValidationFinding {
  code: ValidationFailureCode;
  dimension?: ValidationDimension;
  severity: ValidationSeverity;
  message: string;
}

export interface RetryRecommendation {
  allowed: boolean;

  adjustments: RetryAdjustment[];

  reason: string;

  nextAttempt: number;

  remainingAttempts: number;
}

export interface ValidationDecision {
  rulesVersion: typeof RESULT_VALIDATOR_RULES_VERSION;

  outcome: ValidationOutcome;

  candidateId: string;

  /** Product heuristic quality score — not a scientific confidence interval. */
  overallScore: number;

  dimensionScores: Partial<Record<ValidationDimension, number>>;

  findings: ValidationFinding[];

  retry?: RetryRecommendation;

  metadata: {
    attempt: number;
    maxAttempts: number;
    evidenceSchemaVersion: number;
    transformationRulesVersion: string;
    renderPlanRulesVersion: string;
  };
}
