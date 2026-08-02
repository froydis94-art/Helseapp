/**
 * Result Validator foundation barrel exports.
 */

export {
  REQUIRED_VALIDATION_DIMENSIONS,
  VALIDATION_EVIDENCE_SCHEMA_VERSION,
} from "./ValidationEvidence";
export type {
  CandidateImageReference,
  DimensionEvidence,
  EvidenceConfidence,
  EvidenceSource,
  ValidationDimension,
  ValidationEvidence,
} from "./ValidationEvidence";

export { RESULT_VALIDATOR_RULES_VERSION } from "./ValidationDecision";
export type {
  RetryAdjustment,
  RetryRecommendation,
  ValidationDecision,
  ValidationFailureCode,
  ValidationFinding,
  ValidationOutcome,
  ValidationSeverity,
} from "./ValidationDecision";

export {
  ACCEPTANCE_THRESHOLDS,
  CRITICAL_CONFIDENCE_DIMENSIONS,
  DEFAULT_VALIDATOR_ATTEMPT,
  DEFAULT_VALIDATOR_MAX_ATTEMPTS,
  DIMENSION_WEIGHTS,
  HARD_GATE_THRESHOLDS,
  MAX_MAX_ATTEMPTS,
  MIN_ATTEMPT,
  MIN_MAX_ATTEMPTS,
  OVERALL_ACCEPTANCE_THRESHOLD,
  computeOverallScore,
  evaluateCandidate,
  roundOverallScore,
  runResultValidatorFixture,
  validateValidationEvidence,
} from "./ResultValidator";
export type {
  EvidenceValidationResult,
  ResultValidatorInput,
} from "./ResultValidator";

export {
  acceptedCandidateEvidence,
  anatomyRetryEvidence,
  borderlineEvidence,
  identityRetryEvidence,
  invalidDuplicateDimensionEvidence,
  lowConfidenceIdentityEvidence,
  planAdherenceRetryEvidence,
  unsafeCandidateEvidence,
} from "./fixtures";
