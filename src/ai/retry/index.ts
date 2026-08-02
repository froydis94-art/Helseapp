/**
 * Retry Orchestrator foundation barrel exports.
 */

export { RETRY_ORCHESTRATOR_RULES_VERSION } from "./RetryOrchestratorTypes";
export type {
  RetryAction,
  RetryAttemptState,
  RetryHistoryEntry,
  RetryOrchestratorDecision,
  RetryOrchestratorInput,
  RetryOrchestratorStage,
  RetryReasonCode,
  RetryStateValidationResult,
  RetryTerminalOutcome,
} from "./RetryOrchestratorTypes";

export {
  createInitialRetryState,
  evaluateRetryTransition,
  validateRetryAttemptState,
} from "./RetryOrchestrator";

export {
  APPROVED_RETRY_ADJUSTMENTS,
  DEFERRED_RETRY_ADJUSTMENTS,
  NON_RETRYABLE_TRANSPORT_CODES,
  RETRYABLE_TRANSPORT_CODES,
  isApprovedRetryAdjustment,
  isDeferredRetryAdjustment,
  isRetryableTransportFailure,
  mergeAppliedAdjustments,
  validateRetryAdjustments,
} from "./RetryPolicy";

export {
  acceptedValidationDecisionFixture,
  candidateMismatchStateFixture,
  exhaustedRetryStateFixture,
  initialRetryStateFixture,
  nonRetryableAuthFailureFixture,
  retryValidationDecisionFixture,
  retryableTimeoutFailureFixture,
  safetyRejectDecisionFixture,
  transportSuccessFixture,
  unsupportedAdjustmentDecisionFixture,
} from "./fixtures";
