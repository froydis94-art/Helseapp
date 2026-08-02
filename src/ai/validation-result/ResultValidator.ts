/**
 * ResultValidator — deterministic accept / retry / reject policy.
 *
 * Foundation only: evaluates typed ValidationEvidence. No vision, network,
 * provider calls, image bytes, or mutation of TransformationPlan / RenderPlan.
 */

import type { RenderPlan } from "../render/RenderPlan";
import {
  RESULT_VALIDATOR_RULES_VERSION,
  type RetryAdjustment,
  type ValidationDecision,
  type ValidationFailureCode,
  type ValidationFinding,
  type ValidationOutcome,
} from "./ValidationDecision";
import {
  REQUIRED_VALIDATION_DIMENSIONS,
  VALIDATION_EVIDENCE_SCHEMA_VERSION,
  type DimensionEvidence,
  type ValidationDimension,
  type ValidationEvidence,
} from "./ValidationEvidence";

export interface ResultValidatorInput {
  evidence: ValidationEvidence;
  renderPlan: RenderPlan;
  attempt: number;
  maxAttempts: number;
}

export interface EvidenceValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Declared once — overall score is a weighted average of dimension scores. */
export const DIMENSION_WEIGHTS: Readonly<Record<ValidationDimension, number>> = {
  identity: 0.25,
  anatomy: 0.2,
  plan_adherence: 0.2,
  photorealism: 0.1,
  pose_camera: 0.1,
  safety: 0.15,
};

/** Hard-gate floors: failure below these cannot be accepted. */
export const HARD_GATE_THRESHOLDS: Readonly<Record<ValidationDimension, number>> =
  {
    safety: 0.95,
    identity: 0.72,
    anatomy: 0.75,
    plan_adherence: 0.68,
    pose_camera: 0.7,
    photorealism: 0.65,
  };

/** Acceptance floors: all must be met (plus overall) to accept. */
export const ACCEPTANCE_THRESHOLDS: Readonly<
  Record<ValidationDimension, number>
> = {
  safety: 0.95,
  identity: 0.82,
  anatomy: 0.82,
  plan_adherence: 0.75,
  pose_camera: 0.78,
  photorealism: 0.72,
};

export const OVERALL_ACCEPTANCE_THRESHOLD = 0.8;

/** Critical dimensions where low evidence confidence blocks acceptance. */
export const CRITICAL_CONFIDENCE_DIMENSIONS: readonly ValidationDimension[] = [
  "identity",
  "anatomy",
  "safety",
] as const;

export const MIN_ATTEMPT = 1;
export const MIN_MAX_ATTEMPTS = 1;
export const MAX_MAX_ATTEMPTS = 5;
export const DEFAULT_VALIDATOR_ATTEMPT = 1;
export const DEFAULT_VALIDATOR_MAX_ATTEMPTS = 3;

const ADJUSTMENT_ORDER: readonly RetryAdjustment[] = [
  "strengthen_identity_preservation",
  "strengthen_anatomy_constraints",
  "strengthen_plan_adherence",
  "strengthen_pose_camera_preservation",
  "strengthen_photorealism",
  "reduce_visual_emphasis",
] as const;

const DIMENSION_FAILURE_CODE: Readonly<
  Record<ValidationDimension, ValidationFailureCode>
> = {
  identity: "identity_failure",
  anatomy: "anatomy_failure",
  plan_adherence: "plan_adherence_failure",
  photorealism: "photorealism_failure",
  pose_camera: "pose_camera_failure",
  safety: "safety_failure",
};

const DIMENSION_ADJUSTMENT: Readonly<
  Partial<Record<ValidationDimension, RetryAdjustment>>
> = {
  identity: "strengthen_identity_preservation",
  anatomy: "strengthen_anatomy_constraints",
  plan_adherence: "strengthen_plan_adherence",
  pose_camera: "strengthen_pose_camera_preservation",
  photorealism: "strengthen_photorealism",
};

const FORBIDDEN_CONTENT_PATTERNS: RegExp[] = [
  /data:image\//i,
  /\bBearer\b/i,
  /\bAuthorization\b/i,
  /REPLICATE_API_TOKEN/i,
  /\bapi[_-]?key\b/i,
  /https?:\/\//i,
  /(?:[A-Za-z0-9+/]{80,}={0,2})/,
];

const FORBIDDEN_KEY_NAMES = new Set([
  "prompt",
  "negativeprompt",
  "negative_prompt",
  "authorization",
  "apikey",
  "api_key",
  "token",
  "password",
  "secret",
  "base64",
  "imagebytes",
  "image_bytes",
  "rawimage",
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringLooksForbidden(text: string): boolean {
  for (const pattern of FORBIDDEN_CONTENT_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

function scanValue(
  value: unknown,
  keyHint: string | undefined,
  errors: string[]
): void {
  if (keyHint) {
    const normalized = keyHint.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
    if (FORBIDDEN_KEY_NAMES.has(normalized) || normalized.includes("prompt")) {
      errors.push(`Forbidden field name detected: ${keyHint}`);
    }
  }

  // Optional fields may be omitted; required structures are checked separately.
  if (value === undefined) {
    return;
  }

  if (typeof value === "string") {
    if (stringLooksForbidden(value)) {
      errors.push(
        keyHint
          ? `Forbidden content in ${keyHint}`
          : "Forbidden content in evidence string"
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      scanValue(value[i], keyHint ? `${keyHint}[${i}]` : `[${i}]`, errors);
    }
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>
    )) {
      scanValue(nested, keyHint ? `${keyHint}.${key}` : key, errors);
    }
  }
}

function isValidDimension(value: unknown): value is ValidationDimension {
  return (
    typeof value === "string" &&
    (REQUIRED_VALIDATION_DIMENSIONS as readonly string[]).includes(value)
  );
}

/**
 * Structural and privacy validation for ValidationEvidence.
 * Does not throw for expected invalid payloads.
 */
export function validateValidationEvidence(
  evidence: ValidationEvidence
): EvidenceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (evidence == null || typeof evidence !== "object") {
    return { valid: false, errors: ["Evidence payload is required"], warnings };
  }

  if (evidence.schemaVersion !== VALIDATION_EVIDENCE_SCHEMA_VERSION) {
    errors.push(
      `Unsupported evidence schemaVersion: ${String(evidence.schemaVersion)}`
    );
  }

  if (!evidence.candidate || typeof evidence.candidate !== "object") {
    errors.push("candidate is required");
  } else if (!isNonEmptyString(evidence.candidate.candidateId)) {
    errors.push("candidateId must be a non-empty string");
  }

  if (!evidence.metadata || typeof evidence.metadata !== "object") {
    errors.push("metadata is required");
  } else {
    if (!isNonEmptyString(evidence.metadata.validatorInputVersion)) {
      errors.push("metadata.validatorInputVersion must be non-empty");
    }
    if (!isNonEmptyString(evidence.metadata.transformationRulesVersion)) {
      errors.push("metadata.transformationRulesVersion must be non-empty");
    }
    if (!isNonEmptyString(evidence.metadata.renderPlanRulesVersion)) {
      errors.push("metadata.renderPlanRulesVersion must be non-empty");
    }
  }

  if (!Array.isArray(evidence.dimensions)) {
    errors.push("dimensions must be an array");
  } else {
    const seen = new Set<ValidationDimension>();
    for (let i = 0; i < evidence.dimensions.length; i++) {
      const dim = evidence.dimensions[i];
      if (!dim || typeof dim !== "object") {
        errors.push(`dimensions[${i}] must be an object`);
        continue;
      }
      if (!isValidDimension(dim.dimension)) {
        errors.push(`dimensions[${i}].dimension is invalid`);
      } else if (seen.has(dim.dimension)) {
        errors.push(`Duplicate dimension: ${dim.dimension}`);
      } else {
        seen.add(dim.dimension);
      }

      if (typeof dim.score !== "number" || !Number.isFinite(dim.score)) {
        errors.push(`dimensions[${i}].score must be a finite number`);
      } else if (dim.score < 0 || dim.score > 1) {
        errors.push(`dimensions[${i}].score must be between 0 and 1`);
      }

      if (
        dim.confidence !== "low" &&
        dim.confidence !== "medium" &&
        dim.confidence !== "high"
      ) {
        errors.push(`dimensions[${i}].confidence is invalid`);
      }

      if (
        dim.source !== "deterministic_fixture" &&
        dim.source !== "human_review" &&
        dim.source !== "future_vision_adapter"
      ) {
        errors.push(`dimensions[${i}].source is invalid`);
      }

      if (!Array.isArray(dim.findings)) {
        errors.push(`dimensions[${i}].findings must be an array`);
      } else {
        for (let j = 0; j < dim.findings.length; j++) {
          if (!isNonEmptyString(dim.findings[j])) {
            errors.push(
              `dimensions[${i}].findings[${j}] must be a non-empty string`
            );
          }
        }
      }

      if (!Array.isArray(dim.warnings)) {
        errors.push(`dimensions[${i}].warnings must be an array`);
      } else {
        for (let j = 0; j < dim.warnings.length; j++) {
          if (!isNonEmptyString(dim.warnings[j])) {
            errors.push(
              `dimensions[${i}].warnings[${j}] must be a non-empty string`
            );
          }
        }
      }
    }

    for (const required of REQUIRED_VALIDATION_DIMENSIONS) {
      if (!seen.has(required)) {
        errors.push(`Missing required dimension: ${required}`);
      }
    }
  }

  scanValue(evidence, undefined, errors);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/** Round overall score consistently (4 decimal places). */
export function roundOverallScore(score: number): number {
  return Math.round(score * 1e4) / 1e4;
}

export function computeOverallScore(
  scores: Readonly<Record<ValidationDimension, number>>
): number {
  let total = 0;
  for (const dimension of REQUIRED_VALIDATION_DIMENSIONS) {
    total += scores[dimension] * DIMENSION_WEIGHTS[dimension];
  }
  return roundOverallScore(total);
}

function dimensionMap(
  dimensions: DimensionEvidence[]
): Map<ValidationDimension, DimensionEvidence> {
  const map = new Map<ValidationDimension, DimensionEvidence>();
  for (const dim of dimensions) {
    map.set(dim.dimension, dim);
  }
  return map;
}

function finding(
  code: ValidationFailureCode,
  severity: ValidationFinding["severity"],
  message: string,
  dimension?: ValidationDimension
): ValidationFinding {
  const result: ValidationFinding = { code, severity, message };
  if (dimension !== undefined) {
    result.dimension = dimension;
  }
  return result;
}

function hardGateMessage(dimension: ValidationDimension, score: number): string {
  switch (dimension) {
    case "safety":
      return `Safety score ${score} is below the required hard-gate threshold of ${HARD_GATE_THRESHOLDS.safety}.`;
    case "identity":
      return `Facial identity similarity is below the required hard-gate threshold (${HARD_GATE_THRESHOLDS.identity}).`;
    case "anatomy":
      return `Anatomical consistency is below the required hard-gate threshold (${HARD_GATE_THRESHOLDS.anatomy}).`;
    case "plan_adherence":
      return `Plan adherence is below the required hard-gate threshold (${HARD_GATE_THRESHOLDS.plan_adherence}).`;
    case "pose_camera":
      return `Pose and camera preservation is below the required hard-gate threshold (${HARD_GATE_THRESHOLDS.pose_camera}).`;
    case "photorealism":
      return `Photorealism is below the required hard-gate threshold (${HARD_GATE_THRESHOLDS.photorealism}).`;
  }
}

function acceptanceMessage(
  dimension: ValidationDimension,
  score: number
): string {
  return `${dimension} score ${score} is below the acceptance threshold of ${ACCEPTANCE_THRESHOLDS[dimension]}.`;
}

function sortAdjustments(adjustments: RetryAdjustment[]): RetryAdjustment[] {
  const unique = [...new Set(adjustments)];
  return ADJUSTMENT_ORDER.filter((item) => unique.includes(item));
}

function buildAdjustments(
  failedDimensions: ValidationDimension[],
  renderPlan: RenderPlan
): RetryAdjustment[] {
  const adjustments: RetryAdjustment[] = [];
  for (const dimension of failedDimensions) {
    const mapped = DIMENSION_ADJUSTMENT[dimension];
    if (mapped) {
      adjustments.push(mapped);
    }
  }

  const anatomyOrPlanPoor =
    failedDimensions.includes("anatomy") ||
    failedDimensions.includes("plan_adherence");
  if (
    anatomyOrPlanPoor &&
    renderPlan.transformation.changeVisibility === "pronounced"
  ) {
    adjustments.push("reduce_visual_emphasis");
  }

  return sortAdjustments(adjustments);
}

function budgetAllowsRetry(attempt: number, maxAttempts: number): boolean {
  return attempt < maxAttempts;
}

function buildDecisionBase(
  input: ResultValidatorInput,
  outcome: ValidationOutcome,
  overallScore: number,
  dimensionScores: Partial<Record<ValidationDimension, number>>,
  findings: ValidationFinding[],
  failedForRetry: ValidationDimension[],
  retryReason?: string
): ValidationDecision {
  const { evidence, attempt, maxAttempts } = input;
  const remainingAttempts = Math.max(0, maxAttempts - attempt);
  const decision: ValidationDecision = {
    rulesVersion: RESULT_VALIDATOR_RULES_VERSION,
    outcome,
    candidateId: evidence.candidate?.candidateId ?? "",
    overallScore,
    dimensionScores,
    findings,
    metadata: {
      attempt,
      maxAttempts,
      evidenceSchemaVersion:
        evidence.schemaVersion ?? VALIDATION_EVIDENCE_SCHEMA_VERSION,
      transformationRulesVersion:
        evidence.metadata?.transformationRulesVersion ?? "",
      renderPlanRulesVersion: evidence.metadata?.renderPlanRulesVersion ?? "",
    },
  };

  if (outcome === "retry") {
    decision.retry = {
      allowed: true,
      adjustments: buildAdjustments(failedForRetry, input.renderPlan),
      reason:
        retryReason ??
        "Controlled retry recommended for dimensions below policy thresholds.",
      nextAttempt: attempt + 1,
      remainingAttempts,
    };
  } else if (outcome === "reject" && findings.some((f) => f.code === "retry_budget_exhausted")) {
    decision.retry = {
      allowed: false,
      adjustments: [],
      reason: "Retry budget exhausted; no further automatic attempts.",
      nextAttempt: attempt + 1,
      remainingAttempts: 0,
    };
  }

  return decision;
}

/**
 * Deterministic candidate evaluation. Pure: does not mutate evidence or plan.
 */
export function evaluateCandidate(
  input: ResultValidatorInput
): ValidationDecision {
  const evidenceCheck = validateValidationEvidence(input.evidence);
  const attemptValid =
    Number.isInteger(input.attempt) && input.attempt >= MIN_ATTEMPT;
  const maxAttemptsValid =
    Number.isInteger(input.maxAttempts) &&
    input.maxAttempts >= MIN_MAX_ATTEMPTS &&
    input.maxAttempts <= MAX_MAX_ATTEMPTS;
  const attemptExceedsMax =
    attemptValid && maxAttemptsValid && input.attempt > input.maxAttempts;

  if (
    !evidenceCheck.valid ||
    !attemptValid ||
    !maxAttemptsValid ||
    attemptExceedsMax
  ) {
    const findings: ValidationFinding[] = [
      finding(
        "invalid_evidence",
        "critical",
        !evidenceCheck.valid
          ? evidenceCheck.errors[0] ?? "Validation evidence is invalid."
          : attemptExceedsMax
            ? "attempt cannot exceed maxAttempts."
            : "Attempt or maxAttempts is outside the allowed finite retry budget."
      ),
    ];
    if (!evidenceCheck.valid) {
      for (const missing of evidenceCheck.errors) {
        if (missing.startsWith("Missing required dimension:")) {
          findings.push(
            finding(
              "missing_required_dimension",
              "critical",
              missing
            )
          );
        }
      }
    }
    return buildDecisionBase(
      input,
      "reject",
      0,
      {},
      findings,
      []
    );
  }

  const byDimension = dimensionMap(input.evidence.dimensions);
  const dimensionScores = {} as Record<ValidationDimension, number>;
  for (const dimension of REQUIRED_VALIDATION_DIMENSIONS) {
    dimensionScores[dimension] = byDimension.get(dimension)!.score;
  }
  const overallScore = computeOverallScore(dimensionScores);

  const findings: ValidationFinding[] = [];
  const hardGateFailed: ValidationDimension[] = [];

  // Critical hard gate: safety — reject, no automatic retry in this foundation.
  if (dimensionScores.safety < HARD_GATE_THRESHOLDS.safety) {
    findings.push(
      finding(
        "safety_failure",
        "critical",
        hardGateMessage("safety", dimensionScores.safety),
        "safety"
      )
    );
    return buildDecisionBase(
      input,
      "reject",
      overallScore,
      dimensionScores,
      findings,
      []
    );
  }

  const hardGateOrder: ValidationDimension[] = [
    "identity",
    "anatomy",
    "plan_adherence",
    "pose_camera",
    "photorealism",
  ];

  for (const dimension of hardGateOrder) {
    if (dimensionScores[dimension] < HARD_GATE_THRESHOLDS[dimension]) {
      hardGateFailed.push(dimension);
      findings.push(
        finding(
          DIMENSION_FAILURE_CODE[dimension],
          "critical",
          hardGateMessage(dimension, dimensionScores[dimension]),
          dimension
        )
      );
    }
  }

  if (hardGateFailed.length > 0) {
    if (budgetAllowsRetry(input.attempt, input.maxAttempts)) {
      return buildDecisionBase(
        input,
        "retry",
        overallScore,
        dimensionScores,
        findings,
        hardGateFailed,
        "Hard-gate failure requires another controlled generation attempt."
      );
    }
    findings.push(
      finding(
        "retry_budget_exhausted",
        "critical",
        "Retry budget exhausted without an acceptable candidate."
      )
    );
    return buildDecisionBase(
      input,
      "reject",
      overallScore,
      dimensionScores,
      findings,
      hardGateFailed
    );
  }

  // Low-confidence evidence on critical dimensions blocks acceptance.
  const lowConfidenceDims: ValidationDimension[] = [];
  for (const dimension of CRITICAL_CONFIDENCE_DIMENSIONS) {
    const entry = byDimension.get(dimension)!;
    if (entry.confidence === "low") {
      lowConfidenceDims.push(dimension);
    }
  }
  if (lowConfidenceDims.length > 0) {
    findings.push(
      finding(
        "low_evidence_confidence",
        "warning",
        `Low evidence confidence on critical dimension(s): ${lowConfidenceDims.join(", ")}.`,
        lowConfidenceDims[0]
      )
    );
    const failedForRetry = [...lowConfidenceDims];
    if (budgetAllowsRetry(input.attempt, input.maxAttempts)) {
      return buildDecisionBase(
        input,
        "retry",
        overallScore,
        dimensionScores,
        findings,
        failedForRetry,
        "Low evidence confidence on a critical dimension requires another attempt or higher-confidence review."
      );
    }
    findings.push(
      finding(
        "retry_budget_exhausted",
        "critical",
        "Retry budget exhausted without an acceptable candidate."
      )
    );
    return buildDecisionBase(
      input,
      "reject",
      overallScore,
      dimensionScores,
      findings,
      failedForRetry
    );
  }

  const belowAcceptance: ValidationDimension[] = [];
  for (const dimension of REQUIRED_VALIDATION_DIMENSIONS) {
    if (dimensionScores[dimension] < ACCEPTANCE_THRESHOLDS[dimension]) {
      belowAcceptance.push(dimension);
      findings.push(
        finding(
          DIMENSION_FAILURE_CODE[dimension],
          "warning",
          acceptanceMessage(dimension, dimensionScores[dimension]),
          dimension
        )
      );
    }
  }

  const overallOk = overallScore >= OVERALL_ACCEPTANCE_THRESHOLD;
  const hasCritical = findings.some((f) => f.severity === "critical");

  if (
    belowAcceptance.length === 0 &&
    overallOk &&
    !hasCritical
  ) {
    return buildDecisionBase(
      input,
      "accept",
      overallScore,
      dimensionScores,
      findings,
      []
    );
  }

  // Borderline: no hard-gate failure, but acceptance not fully met.
  const retryDims =
    belowAcceptance.length > 0
      ? belowAcceptance
      : (["photorealism"] as ValidationDimension[]);

  if (budgetAllowsRetry(input.attempt, input.maxAttempts)) {
    return buildDecisionBase(
      input,
      "retry",
      overallScore,
      dimensionScores,
      findings,
      retryDims,
      "Borderline scores require another controlled generation attempt."
    );
  }

  findings.push(
    finding(
      "retry_budget_exhausted",
      "critical",
      "Retry budget exhausted without an acceptable candidate."
    )
  );
  return buildDecisionBase(
    input,
    "reject",
    overallScore,
    dimensionScores,
    findings,
    retryDims
  );
}

/**
 * Optional helper for fixture / dry-run evaluation.
 * Does not alter the AI OS v2 harness pipeline.
 */
export function runResultValidatorFixture(
  evidence: ValidationEvidence,
  renderPlan: RenderPlan,
  attempt: number = DEFAULT_VALIDATOR_ATTEMPT,
  maxAttempts: number = DEFAULT_VALIDATOR_MAX_ATTEMPTS
): ValidationDecision {
  return evaluateCandidate({
    evidence,
    renderPlan,
    attempt,
    maxAttempts,
  });
}
