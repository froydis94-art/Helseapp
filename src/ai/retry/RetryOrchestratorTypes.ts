/**
 * Retry Orchestrator contracts — deterministic transition policy foundation.
 *
 * No image bytes, prompts, tokens, provider payloads, or plan mutation.
 */

import type { ReplicateTransportErrorCode } from "../transport/ReplicateTransportTypes";
import type { ReplicateTransportResult } from "../transport/ReplicateTransportTypes";
import type {
  RetryAdjustment,
  ValidationDecision,
  ValidationOutcome,
} from "../validation-result/ValidationDecision";

export const RETRY_ORCHESTRATOR_RULES_VERSION = "1.0" as const;

export type RetryOrchestratorStage =
  | "transport"
  | "awaiting_validation"
  | "validation"
  | "completed";

export type RetryTerminalOutcome =
  | "accepted"
  | "rejected"
  | "transport_failed"
  | "retry_budget_exhausted"
  | "invalid_state";

export type RetryAction =
  | "accept_candidate"
  | "reject_candidate"
  | "retry_same_provider"
  | "stop_transport_failure"
  | "stop_safety_failure"
  | "stop_budget_exhausted"
  | "await_validation"
  | "invalid_state";

export type RetryReasonCode =
  | "transport_success_requires_validation"
  | "transport_non_retryable_failure"
  | "transport_retryable_failure"
  | "validation_accepted"
  | "validation_retry_requested"
  | "validation_rejected"
  | "safety_rejected"
  | "retry_budget_exhausted"
  | "inconsistent_attempt_state"
  | "missing_validation_decision"
  | "candidate_mismatch"
  | "unsupported_adjustment"
  | "invalid_input";

export interface RetryAttemptState {
  attempt: number;
  maxAttempts: number;

  transportAttempts: number;
  validationAttempts: number;

  lastCandidateId?: string;
  lastPredictionId?: string;

  appliedAdjustments: RetryAdjustment[];

  history: RetryHistoryEntry[];
}

export interface RetryHistoryEntry {
  sequence: number;

  attempt: number;

  stage: RetryOrchestratorStage;

  action: RetryAction;

  reasonCode: RetryReasonCode;

  candidateId?: string;

  transportErrorCode?: ReplicateTransportErrorCode;

  validationOutcome?: ValidationOutcome;

  appliedAdjustments: RetryAdjustment[];
}

export interface RetryOrchestratorInput {
  state: RetryAttemptState;

  transportResult?: ReplicateTransportResult;

  validationDecision?: ValidationDecision;
}

export interface RetryOrchestratorDecision {
  rulesVersion: typeof RETRY_ORCHESTRATOR_RULES_VERSION;

  action: RetryAction;

  reasonCode: RetryReasonCode;

  terminal: boolean;

  terminalOutcome?: RetryTerminalOutcome;

  nextState: RetryAttemptState;

  approvedAdjustments: RetryAdjustment[];

  metadata: {
    currentAttempt: number;
    maxAttempts: number;
    remainingAttempts: number;
    transportRetryable?: boolean;
    validationOutcome?: ValidationOutcome;
  };

  warnings: string[];
  errors: string[];
}

export interface RetryStateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
