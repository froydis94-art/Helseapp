/**
 * RetryOrchestrator — pure deterministic transition evaluation.
 *
 * Coordinates safe continue / retry / accept / reject after transport or
 * validation outcomes. Never mutates plans, never calls network or vision.
 */

import type { ReplicateTransportResult } from "../transport/ReplicateTransportTypes";
import type {
  RetryAdjustment,
  ValidationDecision,
} from "../validation-result/ValidationDecision";
import {
  isRetryableTransportFailure,
  mergeAppliedAdjustments,
  validateRetryAdjustments,
  isApprovedRetryAdjustment,
  isDeferredRetryAdjustment,
} from "./RetryPolicy";
import {
  RETRY_ORCHESTRATOR_RULES_VERSION,
  type RetryAction,
  type RetryAttemptState,
  type RetryHistoryEntry,
  type RetryOrchestratorDecision,
  type RetryOrchestratorInput,
  type RetryReasonCode,
  type RetryStateValidationResult,
  type RetryTerminalOutcome,
} from "./RetryOrchestratorTypes";

const DEFAULT_MAX_ATTEMPTS = 3;
const MIN_MAX_ATTEMPTS = 1;
const MAX_MAX_ATTEMPTS = 5;

const FORBIDDEN_CONTENT_PATTERNS: RegExp[] = [
  /data:image\//i,
  /\bBearer\b/i,
  /\bAuthorization\b/i,
  /REPLICATE_API_TOKEN/i,
  /\bapi[_-]?key\b/i,
  /https?:\/\//i,
  /(?:[A-Za-z0-9+/]{80,}={0,2})/,
];

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0 && Number.isFinite(value);
}

function stringLooksForbidden(text: string): boolean {
  for (const pattern of FORBIDDEN_CONTENT_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

function cloneState(state: RetryAttemptState): RetryAttemptState {
  const next: RetryAttemptState = {
    attempt: state.attempt,
    maxAttempts: state.maxAttempts,
    transportAttempts: state.transportAttempts,
    validationAttempts: state.validationAttempts,
    appliedAdjustments: [...state.appliedAdjustments],
    history: state.history.map((entry) => ({
      ...entry,
      appliedAdjustments: [...entry.appliedAdjustments],
    })),
  };
  if (state.lastCandidateId !== undefined) {
    next.lastCandidateId = state.lastCandidateId;
  }
  if (state.lastPredictionId !== undefined) {
    next.lastPredictionId = state.lastPredictionId;
  }
  return next;
}

function nextSequence(history: readonly RetryHistoryEntry[]): number {
  let max = 0;
  for (const entry of history) {
    if (entry.sequence > max) max = entry.sequence;
  }
  return max + 1;
}

function remainingAttempts(attempt: number, maxAttempts: number): number {
  return Math.max(0, maxAttempts - attempt);
}

function buildDecision(args: {
  action: RetryAction;
  reasonCode: RetryReasonCode;
  terminal: boolean;
  terminalOutcome?: RetryTerminalOutcome;
  nextState: RetryAttemptState;
  approvedAdjustments?: RetryAdjustment[];
  transportRetryable?: boolean;
  validationOutcome?: ValidationDecision["outcome"];
  warnings?: string[];
  errors?: string[];
}): RetryOrchestratorDecision {
  const decision: RetryOrchestratorDecision = {
    rulesVersion: RETRY_ORCHESTRATOR_RULES_VERSION,
    action: args.action,
    reasonCode: args.reasonCode,
    terminal: args.terminal,
    nextState: args.nextState,
    approvedAdjustments: args.approvedAdjustments ?? [],
    metadata: {
      currentAttempt: args.nextState.attempt,
      maxAttempts: args.nextState.maxAttempts,
      remainingAttempts: remainingAttempts(
        args.nextState.attempt,
        args.nextState.maxAttempts
      ),
    },
    warnings: args.warnings ?? [],
    errors: args.errors ?? [],
  };
  if (args.terminalOutcome !== undefined) {
    decision.terminalOutcome = args.terminalOutcome;
  }
  if (args.transportRetryable !== undefined) {
    decision.metadata.transportRetryable = args.transportRetryable;
  }
  if (args.validationOutcome !== undefined) {
    decision.metadata.validationOutcome = args.validationOutcome;
  }
  return decision;
}

function appendHistory(
  state: RetryAttemptState,
  entry: Omit<RetryHistoryEntry, "sequence">
): RetryAttemptState {
  const next = cloneState(state);
  next.history = [
    ...next.history,
    {
      ...entry,
      sequence: nextSequence(next.history),
      appliedAdjustments: [...entry.appliedAdjustments],
    },
  ];
  return next;
}

/**
 * Create initial retry attempt state.
 * Invalid maxAttempts throws (programmer misuse) — never silently clamped.
 */
export function createInitialRetryState(
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS
): RetryAttemptState {
  if (
    !isInteger(maxAttempts) ||
    maxAttempts < MIN_MAX_ATTEMPTS ||
    maxAttempts > MAX_MAX_ATTEMPTS
  ) {
    throw new Error(
      `maxAttempts must be an integer between ${MIN_MAX_ATTEMPTS} and ${MAX_MAX_ATTEMPTS}`
    );
  }
  return {
    attempt: 1,
    maxAttempts,
    transportAttempts: 0,
    validationAttempts: 0,
    appliedAdjustments: [],
    history: [],
  };
}

/**
 * Structural validation for RetryAttemptState.
 */
export function validateRetryAttemptState(
  state: RetryAttemptState
): RetryStateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (state == null || typeof state !== "object") {
    return { valid: false, errors: ["state must be an object"], warnings };
  }

  if (!isInteger(state.attempt) || state.attempt < 1) {
    errors.push("attempt must be an integer >= 1");
  }
  if (
    !isInteger(state.maxAttempts) ||
    state.maxAttempts < MIN_MAX_ATTEMPTS ||
    state.maxAttempts > MAX_MAX_ATTEMPTS
  ) {
    errors.push(
      `maxAttempts must be an integer between ${MIN_MAX_ATTEMPTS} and ${MAX_MAX_ATTEMPTS}`
    );
  }
  if (
    isInteger(state.attempt) &&
    isInteger(state.maxAttempts) &&
    state.attempt > state.maxAttempts
  ) {
    errors.push("attempt must be <= maxAttempts");
  }

  if (!isNonNegativeInteger(state.transportAttempts)) {
    errors.push("transportAttempts must be a finite non-negative integer");
  }
  if (!isNonNegativeInteger(state.validationAttempts)) {
    errors.push("validationAttempts must be a finite non-negative integer");
  }

  if (
    isNonNegativeInteger(state.transportAttempts) &&
    isInteger(state.attempt) &&
    state.transportAttempts > state.attempt
  ) {
    errors.push("transportAttempts must be <= attempt");
  }
  if (
    isNonNegativeInteger(state.validationAttempts) &&
    isInteger(state.attempt) &&
    state.validationAttempts > state.attempt
  ) {
    errors.push("validationAttempts must be <= attempt");
  }

  if (!Array.isArray(state.appliedAdjustments)) {
    errors.push("appliedAdjustments must be an array");
  } else {
    const seenAdj = new Set<string>();
    for (const adj of state.appliedAdjustments) {
      if (typeof adj !== "string") {
        errors.push("appliedAdjustments entries must be strings");
        continue;
      }
      if (stringLooksForbidden(adj)) {
        errors.push("appliedAdjustments contain forbidden sensitive content");
      }
      if (isDeferredRetryAdjustment(adj) || !isApprovedRetryAdjustment(adj)) {
        errors.push(`unsupported applied adjustment: ${adj}`);
      }
      if (seenAdj.has(adj)) {
        errors.push(`duplicate applied adjustment: ${adj}`);
      }
      seenAdj.add(adj);
    }
  }

  if (!Array.isArray(state.history)) {
    errors.push("history must be an array");
  } else {
    const seenSeq = new Set<number>();
    let prevSeq = 0;
    for (const entry of state.history) {
      if (entry == null || typeof entry !== "object") {
        errors.push("history entry must be an object");
        continue;
      }
      if (!isInteger(entry.sequence) || entry.sequence < 1) {
        errors.push("history sequence values must be positive integers");
      } else {
        if (seenSeq.has(entry.sequence)) {
          errors.push("history sequence values must be unique");
        }
        seenSeq.add(entry.sequence);
        if (entry.sequence <= prevSeq) {
          errors.push("history sequence must be strictly increasing");
        }
        prevSeq = entry.sequence;
      }
      if (!isInteger(entry.attempt) || entry.attempt < 1) {
        errors.push("history attempt must be an integer >= 1");
      }
      if (
        isInteger(entry.attempt) &&
        isInteger(state.maxAttempts) &&
        entry.attempt > state.maxAttempts
      ) {
        errors.push("history attempt exceeds maxAttempts");
      }
      if (!Array.isArray(entry.appliedAdjustments)) {
        errors.push("history appliedAdjustments must be an array");
      }
      if (entry.candidateId !== undefined) {
        if (typeof entry.candidateId !== "string") {
          errors.push("history candidateId must be a string");
        } else if (stringLooksForbidden(entry.candidateId)) {
          errors.push("history contains forbidden sensitive content");
        }
      }
    }
  }

  if (state.lastCandidateId !== undefined) {
    if (typeof state.lastCandidateId !== "string") {
      errors.push("lastCandidateId must be a string");
    } else if (stringLooksForbidden(state.lastCandidateId)) {
      errors.push("lastCandidateId contains forbidden sensitive content");
    }
  }
  if (state.lastPredictionId !== undefined) {
    if (typeof state.lastPredictionId !== "string") {
      errors.push("lastPredictionId must be a string");
    } else if (stringLooksForbidden(state.lastPredictionId)) {
      errors.push("lastPredictionId contains forbidden sensitive content");
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function evaluateTransport(
  state: RetryAttemptState,
  transportResult: ReplicateTransportResult
): RetryOrchestratorDecision {
  if (transportResult.success === true) {
    let next = cloneState(state);
    next.transportAttempts = state.transportAttempts + 1;
    next.lastPredictionId = transportResult.predictionId;
    next = appendHistory(next, {
      attempt: next.attempt,
      stage: "awaiting_validation",
      action: "await_validation",
      reasonCode: "transport_success_requires_validation",
      appliedAdjustments: [...next.appliedAdjustments],
    });
    return buildDecision({
      action: "await_validation",
      reasonCode: "transport_success_requires_validation",
      terminal: false,
      nextState: next,
      approvedAdjustments: [],
    });
  }

  const retryable = isRetryableTransportFailure(transportResult);

  if (!retryable) {
    let next = cloneState(state);
    next.transportAttempts = state.transportAttempts + 1;
    if (transportResult.predictionId !== undefined) {
      next.lastPredictionId = transportResult.predictionId;
    }
    next = appendHistory(next, {
      attempt: next.attempt,
      stage: "transport",
      action: "stop_transport_failure",
      reasonCode: "transport_non_retryable_failure",
      transportErrorCode: transportResult.error.code,
      appliedAdjustments: [...next.appliedAdjustments],
    });
    return buildDecision({
      action: "stop_transport_failure",
      reasonCode: "transport_non_retryable_failure",
      terminal: true,
      terminalOutcome: "transport_failed",
      nextState: next,
      transportRetryable: false,
    });
  }

  if (state.attempt < state.maxAttempts) {
    let next = cloneState(state);
    next.transportAttempts = state.transportAttempts + 1;
    next.attempt = state.attempt + 1;
    if (transportResult.predictionId !== undefined) {
      next.lastPredictionId = transportResult.predictionId;
    }
    next = appendHistory(next, {
      attempt: state.attempt,
      stage: "transport",
      action: "retry_same_provider",
      reasonCode: "transport_retryable_failure",
      transportErrorCode: transportResult.error.code,
      appliedAdjustments: [...next.appliedAdjustments],
    });
    return buildDecision({
      action: "retry_same_provider",
      reasonCode: "transport_retryable_failure",
      terminal: false,
      nextState: next,
      approvedAdjustments: [],
      transportRetryable: true,
    });
  }

  let next = cloneState(state);
  next.transportAttempts = state.transportAttempts + 1;
  // do not increment attempt beyond maxAttempts
  if (transportResult.predictionId !== undefined) {
    next.lastPredictionId = transportResult.predictionId;
  }
  next = appendHistory(next, {
    attempt: next.attempt,
    stage: "transport",
    action: "stop_budget_exhausted",
    reasonCode: "retry_budget_exhausted",
    transportErrorCode: transportResult.error.code,
    appliedAdjustments: [...next.appliedAdjustments],
  });
  return buildDecision({
    action: "stop_budget_exhausted",
    reasonCode: "retry_budget_exhausted",
    terminal: true,
    terminalOutcome: "retry_budget_exhausted",
    nextState: next,
    transportRetryable: true,
  });
}

function hasSafetyFailure(decision: ValidationDecision): boolean {
  return decision.findings.some((f) => f.code === "safety_failure");
}

function evaluateValidation(
  state: RetryAttemptState,
  validationDecision: ValidationDecision
): RetryOrchestratorDecision {
  if (
    state.lastCandidateId !== undefined &&
    state.lastCandidateId !== validationDecision.candidateId
  ) {
    const next = appendHistory(cloneState(state), {
      attempt: state.attempt,
      stage: "completed",
      action: "invalid_state",
      reasonCode: "candidate_mismatch",
      candidateId: validationDecision.candidateId,
      validationOutcome: validationDecision.outcome,
      appliedAdjustments: [...state.appliedAdjustments],
    });
    return buildDecision({
      action: "invalid_state",
      reasonCode: "candidate_mismatch",
      terminal: true,
      terminalOutcome: "invalid_state",
      nextState: next,
      validationOutcome: validationDecision.outcome,
      errors: [
        `candidate mismatch: state.lastCandidateId=${state.lastCandidateId} decision.candidateId=${validationDecision.candidateId}`,
      ],
    });
  }

  if (validationDecision.outcome === "accept") {
    let next = cloneState(state);
    next.validationAttempts = state.validationAttempts + 1;
    next.lastCandidateId = validationDecision.candidateId;
    next = appendHistory(next, {
      attempt: next.attempt,
      stage: "completed",
      action: "accept_candidate",
      reasonCode: "validation_accepted",
      candidateId: validationDecision.candidateId,
      validationOutcome: "accept",
      appliedAdjustments: [...next.appliedAdjustments],
    });
    return buildDecision({
      action: "accept_candidate",
      reasonCode: "validation_accepted",
      terminal: true,
      terminalOutcome: "accepted",
      nextState: next,
      validationOutcome: "accept",
    });
  }

  if (validationDecision.outcome === "reject") {
    const safety = hasSafetyFailure(validationDecision);
    let next = cloneState(state);
    next.validationAttempts = state.validationAttempts + 1;
    next.lastCandidateId = validationDecision.candidateId;
    if (safety) {
      next = appendHistory(next, {
        attempt: next.attempt,
        stage: "completed",
        action: "stop_safety_failure",
        reasonCode: "safety_rejected",
        candidateId: validationDecision.candidateId,
        validationOutcome: "reject",
        appliedAdjustments: [...next.appliedAdjustments],
      });
      return buildDecision({
        action: "stop_safety_failure",
        reasonCode: "safety_rejected",
        terminal: true,
        terminalOutcome: "rejected",
        nextState: next,
        validationOutcome: "reject",
      });
    }
    next = appendHistory(next, {
      attempt: next.attempt,
      stage: "completed",
      action: "reject_candidate",
      reasonCode: "validation_rejected",
      candidateId: validationDecision.candidateId,
      validationOutcome: "reject",
      appliedAdjustments: [...next.appliedAdjustments],
    });
    return buildDecision({
      action: "reject_candidate",
      reasonCode: "validation_rejected",
      terminal: true,
      terminalOutcome: "rejected",
      nextState: next,
      validationOutcome: "reject",
    });
  }

  // outcome === "retry"
  if (state.attempt >= state.maxAttempts) {
    let next = cloneState(state);
    next.validationAttempts = state.validationAttempts + 1;
    next.lastCandidateId = validationDecision.candidateId;
    next = appendHistory(next, {
      attempt: next.attempt,
      stage: "completed",
      action: "stop_budget_exhausted",
      reasonCode: "retry_budget_exhausted",
      candidateId: validationDecision.candidateId,
      validationOutcome: "retry",
      appliedAdjustments: [...next.appliedAdjustments],
    });
    return buildDecision({
      action: "stop_budget_exhausted",
      reasonCode: "retry_budget_exhausted",
      terminal: true,
      terminalOutcome: "retry_budget_exhausted",
      nextState: next,
      validationOutcome: "retry",
    });
  }

  const recommended = validationDecision.retry?.adjustments ?? [];
  const validated = validateRetryAdjustments(recommended);
  if (validated.rejected.length > 0) {
    const next = appendHistory(cloneState(state), {
      attempt: state.attempt,
      stage: "completed",
      action: "invalid_state",
      reasonCode: "unsupported_adjustment",
      candidateId: validationDecision.candidateId,
      validationOutcome: "retry",
      appliedAdjustments: [...state.appliedAdjustments],
    });
    return buildDecision({
      action: "invalid_state",
      reasonCode: "unsupported_adjustment",
      terminal: true,
      terminalOutcome: "invalid_state",
      nextState: next,
      validationOutcome: "retry",
      errors: validated.errors,
    });
  }

  let next = cloneState(state);
  next.validationAttempts = state.validationAttempts + 1;
  next.attempt = state.attempt + 1;
  next.lastCandidateId = validationDecision.candidateId;
  next.appliedAdjustments = mergeAppliedAdjustments(
    state.appliedAdjustments,
    validated.approved
  );
  next = appendHistory(next, {
    attempt: state.attempt,
    stage: "validation",
    action: "retry_same_provider",
    reasonCode: "validation_retry_requested",
    candidateId: validationDecision.candidateId,
    validationOutcome: "retry",
    appliedAdjustments: [...next.appliedAdjustments],
  });
  return buildDecision({
    action: "retry_same_provider",
    reasonCode: "validation_retry_requested",
    terminal: false,
    nextState: next,
    approvedAdjustments: validated.approved,
    validationOutcome: "retry",
    warnings: validated.errors.filter((e) => e.startsWith("duplicate ")),
  });
}

/**
 * Evaluate one retry transition. Pure and deterministic — does not mutate input.
 */
export function evaluateRetryTransition(
  input: RetryOrchestratorInput
): RetryOrchestratorDecision {
  const stateValidation = validateRetryAttemptState(input.state);
  if (!stateValidation.valid) {
    const safe = cloneState(input.state);
    return buildDecision({
      action: "invalid_state",
      reasonCode: "inconsistent_attempt_state",
      terminal: true,
      terminalOutcome: "invalid_state",
      nextState: safe,
      errors: [...stateValidation.errors],
      warnings: [...stateValidation.warnings],
    });
  }

  const hasTransport = input.transportResult !== undefined;
  const hasValidation = input.validationDecision !== undefined;

  if (hasTransport && hasValidation) {
    const next = cloneState(input.state);
    return buildDecision({
      action: "invalid_state",
      reasonCode: "invalid_input",
      terminal: true,
      terminalOutcome: "invalid_state",
      nextState: next,
      errors: [
        "transportResult and validationDecision cannot both be supplied in one transition",
      ],
    });
  }

  if (!hasTransport && !hasValidation) {
    const next = cloneState(input.state);
    return buildDecision({
      action: "invalid_state",
      reasonCode: "missing_validation_decision",
      terminal: true,
      terminalOutcome: "invalid_state",
      nextState: next,
      errors: ["neither transportResult nor validationDecision was supplied"],
    });
  }

  if (hasTransport) {
    return evaluateTransport(input.state, input.transportResult!);
  }

  return evaluateValidation(input.state, input.validationDecision!);
}
