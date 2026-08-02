/**
 * Deterministic retry orchestrator fixtures.
 * Fictional opaque IDs only — no real URLs, tokens, images, or health data.
 */

import type {
  ReplicateTransportFailure,
  ReplicateTransportSuccess,
} from "../transport/ReplicateTransportTypes";
import type { ValidationDecision } from "../validation-result/ValidationDecision";
import { RESULT_VALIDATOR_RULES_VERSION } from "../validation-result/ValidationDecision";
import { createInitialRetryState } from "./RetryOrchestrator";
import type { RetryAttemptState } from "./RetryOrchestratorTypes";

const DECISION_META = {
  attempt: 1,
  maxAttempts: 3,
  evidenceSchemaVersion: 1,
  transformationRulesVersion: "1.0",
  renderPlanRulesVersion: "1.0",
} as const;

export const initialRetryStateFixture: RetryAttemptState =
  createInitialRetryState(3);

export const transportSuccessFixture: ReplicateTransportSuccess = {
  success: true,
  provider: "replicate",
  predictionId: "prediction-fixture-001",
  model: "fixture-model-family",
  status: "succeeded",
  imageUrl: "opaque-image-ref-fixture-001",
  generationTimeMs: 1200,
  warnings: [],
  metadata: {
    traceId: "trace-fixture-001",
    formatterName: "FluxFormatter",
    formatterVersion: "1.0",
    pollingAttempts: 1,
    providerStatus: "succeeded",
  },
};

export const retryableTimeoutFailureFixture: ReplicateTransportFailure = {
  success: false,
  provider: "replicate",
  imageUrl: null,
  generationTimeMs: 800,
  error: {
    code: "request_timeout",
    message: "Request timed out.",
    retryable: true,
  },
  warnings: [],
  metadata: {
    traceId: "trace-fixture-timeout-001",
    pollingAttempts: 0,
  },
};

export const nonRetryableAuthFailureFixture: ReplicateTransportFailure = {
  success: false,
  provider: "replicate",
  imageUrl: null,
  generationTimeMs: 50,
  error: {
    code: "provider_auth_error",
    message: "Provider authentication failed.",
    retryable: false,
    httpStatus: 401,
  },
  warnings: [],
  metadata: {
    traceId: "trace-fixture-auth-001",
    pollingAttempts: 0,
  },
};

export const acceptedValidationDecisionFixture: ValidationDecision = {
  rulesVersion: RESULT_VALIDATOR_RULES_VERSION,
  outcome: "accept",
  candidateId: "candidate-fixture-001",
  overallScore: 0.9,
  dimensionScores: {
    identity: 0.92,
    anatomy: 0.9,
    plan_adherence: 0.88,
    photorealism: 0.86,
    pose_camera: 0.9,
    safety: 0.99,
  },
  findings: [],
  metadata: { ...DECISION_META },
};

export const retryValidationDecisionFixture: ValidationDecision = {
  rulesVersion: RESULT_VALIDATOR_RULES_VERSION,
  outcome: "retry",
  candidateId: "candidate-fixture-001",
  overallScore: 0.7,
  dimensionScores: {
    identity: 0.6,
    anatomy: 0.88,
    plan_adherence: 0.85,
    photorealism: 0.8,
    pose_camera: 0.85,
    safety: 0.98,
  },
  findings: [
    {
      code: "identity_failure",
      dimension: "identity",
      severity: "critical",
      message: "Identity below hard gate.",
    },
  ],
  retry: {
    allowed: true,
    adjustments: ["strengthen_identity_preservation"],
    reason: "Identity hard-gate failure with budget remaining.",
    nextAttempt: 2,
    remainingAttempts: 2,
  },
  metadata: { ...DECISION_META },
};

export const safetyRejectDecisionFixture: ValidationDecision = {
  rulesVersion: RESULT_VALIDATOR_RULES_VERSION,
  outcome: "reject",
  candidateId: "candidate-fixture-001",
  overallScore: 0.5,
  dimensionScores: {
    identity: 0.9,
    anatomy: 0.9,
    plan_adherence: 0.9,
    photorealism: 0.9,
    pose_camera: 0.9,
    safety: 0.5,
  },
  findings: [
    {
      code: "safety_failure",
      dimension: "safety",
      severity: "critical",
      message: "Safety hard-gate failure.",
    },
  ],
  metadata: { ...DECISION_META },
};

export const unsupportedAdjustmentDecisionFixture: ValidationDecision = {
  rulesVersion: RESULT_VALIDATOR_RULES_VERSION,
  outcome: "retry",
  candidateId: "candidate-fixture-001",
  overallScore: 0.7,
  dimensionScores: {
    identity: 0.6,
    anatomy: 0.88,
    plan_adherence: 0.85,
    photorealism: 0.8,
    pose_camera: 0.85,
    safety: 0.98,
  },
  findings: [
    {
      code: "identity_failure",
      dimension: "identity",
      severity: "critical",
      message: "Identity below hard gate.",
    },
  ],
  retry: {
    allowed: true,
    adjustments: ["switch_provider"],
    reason: "Unsupported provider switch request.",
    nextAttempt: 2,
    remainingAttempts: 2,
  },
  metadata: { ...DECISION_META },
};

export const exhaustedRetryStateFixture: RetryAttemptState = {
  attempt: 3,
  maxAttempts: 3,
  transportAttempts: 2,
  validationAttempts: 2,
  lastCandidateId: "candidate-fixture-001",
  lastPredictionId: "prediction-fixture-001",
  appliedAdjustments: ["strengthen_identity_preservation"],
  history: [
    {
      sequence: 1,
      attempt: 1,
      stage: "transport",
      action: "await_validation",
      reasonCode: "transport_success_requires_validation",
      appliedAdjustments: [],
    },
    {
      sequence: 2,
      attempt: 1,
      stage: "validation",
      action: "retry_same_provider",
      reasonCode: "validation_retry_requested",
      candidateId: "candidate-fixture-001",
      validationOutcome: "retry",
      appliedAdjustments: ["strengthen_identity_preservation"],
    },
  ],
};

/** State whose lastCandidateId will not match a mismatched decision. */
export const candidateMismatchStateFixture: RetryAttemptState = {
  attempt: 1,
  maxAttempts: 3,
  transportAttempts: 1,
  validationAttempts: 0,
  lastCandidateId: "candidate-fixture-001",
  lastPredictionId: "prediction-fixture-001",
  appliedAdjustments: [],
  history: [],
};
