/**
 * DEMAND_012 — Deterministic Retry Orchestrator foundation tests.
 *
 * Run: npm run test:ai
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ReplicateTransportFailure } from "../transport/ReplicateTransportTypes";
import type { ValidationDecision } from "../validation-result/ValidationDecision";
import { RESULT_VALIDATOR_RULES_VERSION } from "../validation-result/ValidationDecision";
import {
  RETRY_ORCHESTRATOR_RULES_VERSION,
  acceptedValidationDecisionFixture,
  candidateMismatchStateFixture,
  createInitialRetryState,
  evaluateRetryTransition,
  exhaustedRetryStateFixture,
  initialRetryStateFixture,
  isRetryableTransportFailure,
  nonRetryableAuthFailureFixture,
  retryValidationDecisionFixture,
  retryableTimeoutFailureFixture,
  safetyRejectDecisionFixture,
  transportSuccessFixture,
  unsupportedAdjustmentDecisionFixture,
  validateRetryAdjustments,
  validateRetryAttemptState,
  type RetryAttemptState,
} from "../retry";

const __dirname = dirname(fileURLToPath(import.meta.url));
const retryDir = join(__dirname, "..", "retry");
const packageJsonPath = join(__dirname, "..", "..", "..", "package.json");

function freezeClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertUnchanged<T>(original: T, snapshot: T): void {
  assert.deepEqual(original, snapshot);
}

function failure(
  partial: Partial<ReplicateTransportFailure> & {
    error: ReplicateTransportFailure["error"];
  }
): ReplicateTransportFailure {
  return {
    success: false,
    provider: "replicate",
    imageUrl: null,
    generationTimeMs: 10,
    warnings: [],
    metadata: { traceId: "trace-test", pollingAttempts: 0 },
    ...partial,
  };
}

function decision(
  partial: Partial<ValidationDecision> &
    Pick<ValidationDecision, "outcome" | "candidateId">
): ValidationDecision {
  return {
    rulesVersion: RESULT_VALIDATOR_RULES_VERSION,
    overallScore: 0.7,
    dimensionScores: {},
    findings: [],
    metadata: {
      attempt: 1,
      maxAttempts: 3,
      evidenceSchemaVersion: 1,
      transformationRulesVersion: "1.0",
      renderPlanRulesVersion: "1.0",
    },
    ...partial,
  };
}

describe("Retry Orchestrator foundation", () => {
  describe("State", () => {
    it("1. Initial state is deterministic", () => {
      assert.deepEqual(createInitialRetryState(), createInitialRetryState());
      assert.deepEqual(createInitialRetryState(3), initialRetryStateFixture);
    });

    it("2. Default maxAttempts is 3", () => {
      assert.equal(createInitialRetryState().maxAttempts, 3);
      assert.equal(createInitialRetryState().attempt, 1);
    });

    it("3. Invalid maxAttempts is rejected", () => {
      assert.throws(() => createInitialRetryState(0));
      assert.throws(() => createInitialRetryState(6));
      assert.throws(() => createInitialRetryState(1.5));
      assert.throws(() => createInitialRetryState(NaN));
    });

    it("4. attempt > maxAttempts is invalid", () => {
      const state = createInitialRetryState(2);
      state.attempt = 3;
      const result = validateRetryAttemptState(state);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("attempt")));
    });

    it("5. Negative counters are invalid", () => {
      const state = createInitialRetryState();
      state.transportAttempts = -1;
      assert.equal(validateRetryAttemptState(state).valid, false);
      state.transportAttempts = 0;
      state.validationAttempts = -2;
      assert.equal(validateRetryAttemptState(state).valid, false);
    });

    it("6. Duplicate history sequence is invalid", () => {
      const state = createInitialRetryState();
      state.history = [
        {
          sequence: 1,
          attempt: 1,
          stage: "transport",
          action: "await_validation",
          reasonCode: "transport_success_requires_validation",
          appliedAdjustments: [],
        },
        {
          sequence: 1,
          attempt: 1,
          stage: "validation",
          action: "accept_candidate",
          reasonCode: "validation_accepted",
          appliedAdjustments: [],
        },
      ];
      assert.equal(validateRetryAttemptState(state).valid, false);
    });

    it("7. Non-increasing history sequence is invalid", () => {
      const state = createInitialRetryState();
      state.history = [
        {
          sequence: 2,
          attempt: 1,
          stage: "transport",
          action: "await_validation",
          reasonCode: "transport_success_requires_validation",
          appliedAdjustments: [],
        },
        {
          sequence: 1,
          attempt: 1,
          stage: "validation",
          action: "accept_candidate",
          reasonCode: "validation_accepted",
          appliedAdjustments: [],
        },
      ];
      assert.equal(validateRetryAttemptState(state).valid, false);
    });

    it("8. Duplicate applied adjustments are invalid", () => {
      const state = createInitialRetryState();
      state.appliedAdjustments = [
        "strengthen_identity_preservation",
        "strengthen_identity_preservation",
      ];
      assert.equal(validateRetryAttemptState(state).valid, false);
    });

    it("9. State is JSON serializable", () => {
      const state = createInitialRetryState();
      const roundTrip = JSON.parse(JSON.stringify(state));
      assert.deepEqual(roundTrip, state);
    });

    it("10. Inputs are not mutated", () => {
      const state = createInitialRetryState();
      const snap = freezeClone(state);
      const transport = freezeClone(transportSuccessFixture);
      evaluateRetryTransition({
        state,
        transportResult: transportSuccessFixture,
      });
      assertUnchanged(state, snap);
      assertUnchanged(transportSuccessFixture, transport);
    });
  });

  describe("Transport", () => {
    it("11. Successful transport returns await_validation", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: transportSuccessFixture,
      });
      assert.equal(decisionResult.action, "await_validation");
      assert.equal(
        decisionResult.reasonCode,
        "transport_success_requires_validation"
      );
      assert.equal(decisionResult.terminal, false);
      assert.equal(decisionResult.rulesVersion, RETRY_ORCHESTRATOR_RULES_VERSION);
    });

    it("12. Successful transport is never accepted automatically", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: transportSuccessFixture,
      });
      assert.notEqual(decisionResult.action, "accept_candidate");
      assert.notEqual(decisionResult.terminalOutcome, "accepted");
    });

    it("13. Transport success increments transportAttempts", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: transportSuccessFixture,
      });
      assert.equal(decisionResult.nextState.transportAttempts, 1);
      assert.equal(decisionResult.nextState.attempt, 1);
      assert.equal(
        decisionResult.nextState.lastPredictionId,
        "prediction-fixture-001"
      );
    });

    it("14. Retryable timeout retries with budget remaining", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: retryableTimeoutFailureFixture,
      });
      assert.equal(decisionResult.action, "retry_same_provider");
      assert.equal(decisionResult.reasonCode, "transport_retryable_failure");
      assert.equal(decisionResult.terminal, false);
      assert.equal(decisionResult.nextState.attempt, 2);
      assert.equal(decisionResult.metadata.transportRetryable, true);
    });

    it("15. Retryable rate limit retries", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: failure({
          error: {
            code: "provider_rate_limited",
            message: "Rate limited.",
            retryable: true,
            httpStatus: 429,
          },
        }),
      });
      assert.equal(decisionResult.action, "retry_same_provider");
    });

    it("16. Retryable provider unavailable retries", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: failure({
          error: {
            code: "provider_unavailable",
            message: "Unavailable.",
            retryable: true,
            httpStatus: 503,
          },
        }),
      });
      assert.equal(decisionResult.action, "retry_same_provider");
    });

    it("17. Provider retryable flag alone cannot override policy", () => {
      const bad = failure({
        error: {
          code: "provider_auth_error",
          message: "Auth failed.",
          retryable: true,
          httpStatus: 401,
        },
      });
      assert.equal(isRetryableTransportFailure(bad), false);
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: bad,
      });
      assert.equal(decisionResult.action, "stop_transport_failure");
      assert.equal(decisionResult.reasonCode, "transport_non_retryable_failure");
    });

    it("18. Non-retryable auth failure stops", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: nonRetryableAuthFailureFixture,
      });
      assert.equal(decisionResult.action, "stop_transport_failure");
      assert.equal(decisionResult.terminal, true);
      assert.equal(decisionResult.terminalOutcome, "transport_failed");
    });

    it("19. Missing token failure stops", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: failure({
          error: {
            code: "missing_token",
            message: "Token missing.",
            retryable: false,
          },
        }),
      });
      assert.equal(decisionResult.action, "stop_transport_failure");
    });

    it("20. Invalid request failure stops", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: failure({
          error: {
            code: "invalid_request",
            message: "Invalid request.",
            retryable: false,
          },
        }),
      });
      assert.equal(decisionResult.action, "stop_transport_failure");
    });

    it("21. Invalid provider response stops", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: failure({
          error: {
            code: "invalid_provider_response",
            message: "Bad response.",
            retryable: false,
          },
        }),
      });
      assert.equal(decisionResult.action, "stop_transport_failure");
    });

    it("22. Retryable failure with exhausted budget stops", () => {
      const decisionResult = evaluateRetryTransition({
        state: exhaustedRetryStateFixture,
        transportResult: retryableTimeoutFailureFixture,
      });
      assert.equal(decisionResult.action, "stop_budget_exhausted");
      assert.equal(decisionResult.terminalOutcome, "retry_budget_exhausted");
      assert.equal(decisionResult.terminal, true);
    });

    it("23. Attempt never exceeds maxAttempts", () => {
      const decisionResult = evaluateRetryTransition({
        state: exhaustedRetryStateFixture,
        transportResult: retryableTimeoutFailureFixture,
      });
      assert.equal(
        decisionResult.nextState.attempt,
        exhaustedRetryStateFixture.maxAttempts
      );
      assert.ok(
        decisionResult.nextState.attempt <= decisionResult.nextState.maxAttempts
      );
    });

    it("24. Transport retry adds no visual adjustment", () => {
      const state = createInitialRetryState();
      state.appliedAdjustments = ["strengthen_photorealism"];
      const decisionResult = evaluateRetryTransition({
        state,
        transportResult: retryableTimeoutFailureFixture,
      });
      assert.deepEqual(decisionResult.approvedAdjustments, []);
      assert.deepEqual(decisionResult.nextState.appliedAdjustments, [
        "strengthen_photorealism",
      ]);
    });

    it("25. Transport retry does not switch provider", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: retryableTimeoutFailureFixture,
      });
      assert.equal(decisionResult.action, "retry_same_provider");
      assert.equal(
        decisionResult.approvedAdjustments.includes("switch_provider"),
        false
      );
    });

    it("26. Transport retry does not switch model", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: retryableTimeoutFailureFixture,
      });
      assert.equal(
        decisionResult.approvedAdjustments.includes("switch_model_tier"),
        false
      );
    });
  });

  describe("Validation", () => {
    it("27. Accepted decision returns accepted terminal outcome", () => {
      const state = createInitialRetryState();
      state.lastCandidateId = "candidate-fixture-001";
      const decisionResult = evaluateRetryTransition({
        state,
        validationDecision: acceptedValidationDecisionFixture,
      });
      assert.equal(decisionResult.action, "accept_candidate");
      assert.equal(decisionResult.terminal, true);
      assert.equal(decisionResult.terminalOutcome, "accepted");
      assert.equal(decisionResult.reasonCode, "validation_accepted");
    });

    it("28. Safety rejection always stops", () => {
      const state = createInitialRetryState();
      state.lastCandidateId = "candidate-fixture-001";
      const decisionResult = evaluateRetryTransition({
        state,
        validationDecision: safetyRejectDecisionFixture,
      });
      assert.equal(decisionResult.action, "stop_safety_failure");
      assert.equal(decisionResult.reasonCode, "safety_rejected");
      assert.equal(decisionResult.terminal, true);
      assert.equal(decisionResult.terminalOutcome, "rejected");
    });

    it("29. General reject stops", () => {
      const state = createInitialRetryState();
      state.lastCandidateId = "candidate-fixture-001";
      const decisionResult = evaluateRetryTransition({
        state,
        validationDecision: decision({
          outcome: "reject",
          candidateId: "candidate-fixture-001",
          findings: [
            {
              code: "identity_failure",
              dimension: "identity",
              severity: "critical",
              message: "Identity failed.",
            },
          ],
        }),
      });
      assert.equal(decisionResult.action, "reject_candidate");
      assert.equal(decisionResult.reasonCode, "validation_rejected");
      assert.equal(decisionResult.terminal, true);
    });

    it("30. Retry decision retries when budget remains", () => {
      const state = createInitialRetryState();
      state.lastCandidateId = "candidate-fixture-001";
      const decisionResult = evaluateRetryTransition({
        state,
        validationDecision: retryValidationDecisionFixture,
      });
      assert.equal(decisionResult.action, "retry_same_provider");
      assert.equal(decisionResult.reasonCode, "validation_retry_requested");
      assert.equal(decisionResult.terminal, false);
    });

    it("31. Retry decision applies only allowlisted adjustments", () => {
      const state = createInitialRetryState();
      state.lastCandidateId = "candidate-fixture-001";
      const decisionResult = evaluateRetryTransition({
        state,
        validationDecision: retryValidationDecisionFixture,
      });
      assert.deepEqual(decisionResult.approvedAdjustments, [
        "strengthen_identity_preservation",
      ]);
      assert.deepEqual(decisionResult.nextState.appliedAdjustments, [
        "strengthen_identity_preservation",
      ]);
    });

    it("32. Unsupported switch_provider causes invalid_state", () => {
      const state = createInitialRetryState();
      state.lastCandidateId = "candidate-fixture-001";
      const decisionResult = evaluateRetryTransition({
        state,
        validationDecision: unsupportedAdjustmentDecisionFixture,
      });
      assert.equal(decisionResult.action, "invalid_state");
      assert.equal(decisionResult.reasonCode, "unsupported_adjustment");
      assert.equal(decisionResult.terminalOutcome, "invalid_state");
    });

    it("33. Unsupported switch_model_tier causes invalid_state", () => {
      const state = createInitialRetryState();
      state.lastCandidateId = "candidate-fixture-001";
      const decisionResult = evaluateRetryTransition({
        state,
        validationDecision: decision({
          outcome: "retry",
          candidateId: "candidate-fixture-001",
          retry: {
            allowed: true,
            adjustments: ["switch_model_tier"],
            reason: "tier switch",
            nextAttempt: 2,
            remainingAttempts: 2,
          },
        }),
      });
      assert.equal(decisionResult.action, "invalid_state");
      assert.equal(decisionResult.reasonCode, "unsupported_adjustment");
    });

    it("34. Retry with exhausted budget stops", () => {
      const decisionResult = evaluateRetryTransition({
        state: exhaustedRetryStateFixture,
        validationDecision: {
          ...retryValidationDecisionFixture,
          metadata: {
            ...retryValidationDecisionFixture.metadata,
            attempt: 3,
            maxAttempts: 3,
          },
        },
      });
      assert.equal(decisionResult.action, "stop_budget_exhausted");
      assert.equal(decisionResult.terminalOutcome, "retry_budget_exhausted");
      assert.equal(
        decisionResult.nextState.attempt,
        exhaustedRetryStateFixture.attempt
      );
      assert.deepEqual(
        decisionResult.nextState.appliedAdjustments,
        exhaustedRetryStateFixture.appliedAdjustments
      );
    });

    it("35. Validation retry increments validationAttempts", () => {
      const state = createInitialRetryState();
      state.lastCandidateId = "candidate-fixture-001";
      const decisionResult = evaluateRetryTransition({
        state,
        validationDecision: retryValidationDecisionFixture,
      });
      assert.equal(decisionResult.nextState.validationAttempts, 1);
    });

    it("36. Validation retry increments attempt once", () => {
      const state = createInitialRetryState();
      state.lastCandidateId = "candidate-fixture-001";
      const decisionResult = evaluateRetryTransition({
        state,
        validationDecision: retryValidationDecisionFixture,
      });
      assert.equal(decisionResult.nextState.attempt, 2);
    });

    it("37. Adjustment order is stable", () => {
      const validated = validateRetryAdjustments([
        "strengthen_photorealism",
        "strengthen_identity_preservation",
        "reduce_visual_emphasis",
        "strengthen_anatomy_constraints",
      ]);
      assert.deepEqual(validated.approved, [
        "strengthen_identity_preservation",
        "strengthen_anatomy_constraints",
        "strengthen_photorealism",
        "reduce_visual_emphasis",
      ]);
    });

    it("38. Duplicate adjustments are deduplicated in transition output", () => {
      const state = createInitialRetryState();
      state.lastCandidateId = "candidate-fixture-001";
      const decisionResult = evaluateRetryTransition({
        state,
        validationDecision: decision({
          outcome: "retry",
          candidateId: "candidate-fixture-001",
          retry: {
            allowed: true,
            adjustments: [
              "strengthen_identity_preservation",
              "strengthen_identity_preservation",
              "strengthen_anatomy_constraints",
            ],
            reason: "dupes",
            nextAttempt: 2,
            remainingAttempts: 2,
          },
        }),
      });
      assert.equal(decisionResult.action, "retry_same_provider");
      assert.deepEqual(decisionResult.approvedAdjustments, [
        "strengthen_identity_preservation",
        "strengthen_anatomy_constraints",
      ]);
    });

    it("39. Existing applied adjustments are preserved", () => {
      const state = createInitialRetryState();
      state.lastCandidateId = "candidate-fixture-001";
      state.appliedAdjustments = ["reduce_visual_emphasis"];
      const decisionResult = evaluateRetryTransition({
        state,
        validationDecision: retryValidationDecisionFixture,
      });
      assert.deepEqual(decisionResult.nextState.appliedAdjustments, [
        "strengthen_identity_preservation",
        "reduce_visual_emphasis",
      ]);
    });

    it("40. Candidate mismatch returns invalid_state", () => {
      const decisionResult = evaluateRetryTransition({
        state: candidateMismatchStateFixture,
        validationDecision: decision({
          outcome: "accept",
          candidateId: "candidate-fixture-OTHER",
        }),
      });
      assert.equal(decisionResult.action, "invalid_state");
      assert.equal(decisionResult.reasonCode, "candidate_mismatch");
      assert.equal(decisionResult.terminal, true);
    });

    it("41. Matching candidate proceeds", () => {
      const decisionResult = evaluateRetryTransition({
        state: candidateMismatchStateFixture,
        validationDecision: acceptedValidationDecisionFixture,
      });
      assert.equal(decisionResult.action, "accept_candidate");
    });

    it("42. Validation success cannot override candidate mismatch", () => {
      const decisionResult = evaluateRetryTransition({
        state: candidateMismatchStateFixture,
        validationDecision: {
          ...acceptedValidationDecisionFixture,
          candidateId: "candidate-fixture-mismatch",
        },
      });
      assert.equal(decisionResult.reasonCode, "candidate_mismatch");
      assert.notEqual(decisionResult.action, "accept_candidate");
    });
  });

  describe("Ambiguous input and history", () => {
    it("43. Both transport and validation input is rejected", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: transportSuccessFixture,
        validationDecision: acceptedValidationDecisionFixture,
      });
      assert.equal(decisionResult.action, "invalid_state");
      assert.equal(decisionResult.reasonCode, "invalid_input");
    });

    it("44. Neither transport nor validation input is rejected", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
      });
      assert.equal(decisionResult.action, "invalid_state");
      assert.equal(decisionResult.reasonCode, "missing_validation_decision");
    });

    it("45. Each transition adds exactly one history entry", () => {
      const state = createInitialRetryState();
      const before = state.history.length;
      const decisionResult = evaluateRetryTransition({
        state,
        transportResult: transportSuccessFixture,
      });
      assert.equal(decisionResult.nextState.history.length, before + 1);
    });

    it("46. History input is not mutated", () => {
      const state: RetryAttemptState = {
        ...createInitialRetryState(),
        history: [
          {
            sequence: 1,
            attempt: 1,
            stage: "transport",
            action: "await_validation",
            reasonCode: "transport_success_requires_validation",
            appliedAdjustments: [],
          },
        ],
      };
      const snap = freezeClone(state.history);
      evaluateRetryTransition({
        state,
        transportResult: retryableTimeoutFailureFixture,
      });
      assert.deepEqual(state.history, snap);
    });

    it("47. History contains no image URL", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: transportSuccessFixture,
      });
      const serialized = JSON.stringify(decisionResult.nextState.history);
      assert.equal(/https?:\/\//i.test(serialized), false);
      assert.equal(serialized.includes("opaque-image-ref"), false);
    });

    it("48. History contains no prompt", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: transportSuccessFixture,
      });
      const serialized = JSON.stringify(decisionResult.nextState.history);
      assert.equal(/prompt/i.test(serialized), false);
    });

    it("49. History contains no token", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: nonRetryableAuthFailureFixture,
      });
      const serialized = JSON.stringify(decisionResult.nextState.history);
      assert.equal(/token|Bearer|r8_/i.test(serialized), false);
    });

    it("50. History contains no raw provider error", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: nonRetryableAuthFailureFixture,
      });
      for (const entry of decisionResult.nextState.history) {
        assert.equal("message" in entry, false);
        assert.equal("raw" in entry, false);
        assert.ok(entry.transportErrorCode === "provider_auth_error");
      }
    });
  });

  describe("Security and quality gate wiring", () => {
    it("51. Decision contains no Base64", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: transportSuccessFixture,
      });
      const serialized = JSON.stringify(decisionResult);
      assert.equal(/data:image\/|;base64,/i.test(serialized), false);
    });

    it("52. Decision contains no Authorization text", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: nonRetryableAuthFailureFixture,
      });
      assert.equal(/Authorization/i.test(JSON.stringify(decisionResult)), false);
    });

    it("53. Decision contains no API token", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: transportSuccessFixture,
      });
      assert.equal(/REPLICATE_API_TOKEN|r8_/i.test(JSON.stringify(decisionResult)), false);
    });

    it("54. Decision contains no source image", () => {
      const decisionResult = evaluateRetryTransition({
        state: createInitialRetryState(),
        transportResult: transportSuccessFixture,
      });
      assert.equal(/sourceImage|source_image/i.test(JSON.stringify(decisionResult)), false);
    });

    it("55. Retry source contains no fetch", () => {
      const files = readdirSync(retryDir).filter((f) => f.endsWith(".ts"));
      for (const file of files) {
        const src = readFileSync(join(retryDir, file), "utf8");
        assert.equal(/\bfetch\s*\(/.test(src), false, file);
        assert.equal(/globalThis\.fetch/.test(src), false, file);
      }
    });

    it("56. Retry source does not import lib/replicate.js", () => {
      const files = readdirSync(retryDir).filter((f) => f.endsWith(".ts"));
      for (const file of files) {
        const src = readFileSync(join(retryDir, file), "utf8");
        assert.equal(src.includes("lib/replicate"), false, file);
      }
    });

    it("57. Retry source does not import UI or Terra files", () => {
      const files = readdirSync(retryDir).filter((f) => f.endsWith(".ts"));
      for (const file of files) {
        const src = readFileSync(join(retryDir, file), "utf8");
        assert.equal(src.includes("App.js"), false, file);
        assert.equal(/from ["'].*terra/i.test(src), false, file);
        assert.equal(/from ["'][^"']*expo/i.test(src), false, file);
        assert.equal(/require\(["'][^"']*expo/i.test(src), false, file);
      }
    });

    it("58. Retry source does not mutate RenderPlan", () => {
      const files = readdirSync(retryDir).filter((f) => f.endsWith(".ts"));
      for (const file of files) {
        const src = readFileSync(join(retryDir, file), "utf8");
        assert.equal(src.includes("buildRenderPlan"), false, file);
        assert.equal(src.includes("TransformationEngine"), false, file);
        assert.equal(/RenderPlan\s*=/.test(src), false, file);
      }
    });

    it("59. Existing ResultValidator tests remain listed in test:ai", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        scripts: { "test:ai": string };
      };
      assert.ok(pkg.scripts["test:ai"].includes("resultValidator.test.ts"));
    });

    it("60. Existing transport tests remain listed in test:ai", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        scripts: { "test:ai": string };
      };
      assert.ok(
        pkg.scripts["test:ai"].includes("replicateTransportAdapter.test.ts")
      );
    });

    it("61. Existing AI harness script remains defined", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        scripts: Record<string, string>;
      };
      assert.ok(pkg.scripts["harness:ai"]);
      assert.ok(pkg.scripts["test:ai"].includes("aiOsV2Harness.test.ts"));
    });

    it("62. Full AI Quality Gate commands remain valid", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        scripts: Record<string, string>;
      };
      assert.ok(pkg.scripts.typecheck);
      assert.ok(pkg.scripts["test:ai"]);
      assert.ok(pkg.scripts["harness:ai"]);
      assert.ok(pkg.scripts["test:ai"].includes("retryOrchestrator.test.ts"));
    });
  });
});
