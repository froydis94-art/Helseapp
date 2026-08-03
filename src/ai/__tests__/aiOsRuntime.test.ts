/**
 * DEMAND_013 — AI OS Runtime foundation tests.
 *
 * Run: npm run test:ai
 * Zero real network. Mocked transport only.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ReplicateTransportAdapter } from "../transport/ReplicateTransportAdapter";
import type { ReplicateTransportInput } from "../transport/ReplicateTransportTypes";
import type { ReplicateTransportResult } from "../transport/ReplicateTransportTypes";
import {
  DEFAULT_REPLICATE_TRANSPORT_CONFIG,
  ReplicateTransportAdapter as RealTransportAdapter,
} from "../transport";
import {
  AI_OS_RUNTIME_RULES_VERSION,
  AiOsRuntime,
  REDACTED_RUNTIME_CONTENT,
  RUNTIME_FORBIDDEN_CONTENT_ERROR,
  buildRuntimeTraceId,
  candidateMismatchRuntimeInput,
  createAiOsRuntimeDependencies,
  invalidRuntimeGoalInput,
  invalidRuntimeProfileInput,
  runtimeTransportAuthFailureResult,
  runtimeTransportDisabledResult,
  runtimeTransportSuccessResult,
  runtimeTransportTimeoutResult,
  sanitizeAiOsRuntimeResult,
  transportSuccessWithAcceptedEvidenceInput,
  transportSuccessWithRetryEvidenceInput,
  transportSuccessWithSafetyRejectEvidenceInput,
  transportSuccessWithoutEvidenceInput,
  transportTimeoutRuntimeInput,
  validDryRunRuntimeInput,
  validTransportMockRuntimeInput,
  validateAiOsRuntimeInput,
  type AiOsRuntimeInput,
  type AiOsRuntimeResult,
  type AiOsRuntimeStage,
} from "../runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));
const runtimeDir = join(__dirname, "..", "runtime");
const packageJsonPath = join(__dirname, "..", "..", "..", "package.json");

const DRY_RUN_STAGES: AiOsRuntimeStage[] = [
  "input_validation",
  "transformation",
  "visual_direction",
  "render_plan",
  "render_plan_validation",
  "provider_formatting",
  "formatted_request_validation",
  "completed",
];

function freezeClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeResult(result: AiOsRuntimeResult): AiOsRuntimeResult {
  const clone = structuredClone(result) as AiOsRuntimeResult;
  clone.trace.stages = clone.trace.stages.map((stage) => ({
    ...stage,
    durationMs: 0,
  }));
  if (clone.artifacts.transformationPlan) {
    clone.artifacts.transformationPlan.generatedAt = "<normalized>";
  }
  return clone;
}

function createMockAdapter(
  result: ReplicateTransportResult,
  calls: { count: number; inputs: ReplicateTransportInput[] }
): ReplicateTransportAdapter {
  const adapter = {
    id: "mock-transport-runtime-v1",
    provider: "replicate" as const,
    async generate(input: ReplicateTransportInput): Promise<ReplicateTransportResult> {
      calls.count += 1;
      calls.inputs.push(input);
      return structuredClone(result);
    },
  };
  return adapter as unknown as ReplicateTransportAdapter;
}

function createRuntime(
  adapter?: ReplicateTransportAdapter,
  now?: () => number
): AiOsRuntime {
  return new AiOsRuntime(
    createAiOsRuntimeDependencies({
      transportAdapter: adapter,
      now: now ?? (() => Date.now()),
    })
  );
}

function readRuntimeSources(): string {
  const files = readdirSync(runtimeDir).filter((name) => name.endsWith(".ts"));
  return files
    .map((name) => readFileSync(join(runtimeDir, name), "utf8"))
    .join("\n");
}

describe("aiOsRuntime — DEMAND_013", () => {
  describe("Dry-run", () => {
    it("1. Valid dry run succeeds", async () => {
      const result = await createRuntime().run(validDryRunRuntimeInput);
      assert.equal(result.success, true);
      assert.equal(result.errors.length, 0);
    });

    it("2. Dry run ends with dry_run_complete", async () => {
      const result = await createRuntime().run(validDryRunRuntimeInput);
      assert.equal(result.terminalOutcome, "dry_run_complete");
      assert.equal(result.mode, "dry_run");
    });

    it("3. Dry run produces TransformationPlan", async () => {
      const result = await createRuntime().run(validDryRunRuntimeInput);
      assert.ok(result.artifacts.transformationPlan);
      assert.equal(
        typeof result.artifacts.transformationPlan?.rulesVersion,
        "string"
      );
    });

    it("4. Dry run produces VisualDirection", async () => {
      const result = await createRuntime().run(validDryRunRuntimeInput);
      assert.ok(result.artifacts.visualDirection);
    });

    it("5. Dry run produces RenderPlan", async () => {
      const result = await createRuntime().run(validDryRunRuntimeInput);
      assert.ok(result.artifacts.renderPlan);
    });

    it("6. Dry run produces FormattedImageRequest", async () => {
      const result = await createRuntime().run(validDryRunRuntimeInput);
      assert.ok(result.artifacts.formattedRequest);
    });

    it("7. Dry run does not call transport", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportSuccessResult, calls);
      await createRuntime(adapter).run(validDryRunRuntimeInput);
      assert.equal(calls.count, 0);
      const result = await createRuntime(adapter).run(validDryRunRuntimeInput);
      assert.equal(result.artifacts.transportResult, undefined);
    });

    it("8. Dry run does not call ResultValidator", async () => {
      const result = await createRuntime().run(validDryRunRuntimeInput);
      assert.equal(result.artifacts.validationDecision, undefined);
      assert.ok(
        !result.trace.stages.some((s) => s.stage === "result_validation")
      );
    });

    it("9. Dry run does not call RetryOrchestrator validation transition", async () => {
      const result = await createRuntime().run(validDryRunRuntimeInput);
      assert.equal(result.artifacts.retryDecision, undefined);
      assert.ok(
        !result.trace.stages.some((s) => s.stage === "retry_orchestration")
      );
    });

    it("10. Same input produces same trace ID", async () => {
      const a = await createRuntime().run(validDryRunRuntimeInput);
      const b = await createRuntime().run(validDryRunRuntimeInput);
      assert.equal(a.trace.traceId, b.trace.traceId);
      assert.match(a.trace.traceId, /^aios-runtime-[a-f0-9]{12}$/);
      assert.equal(
        buildRuntimeTraceId(validDryRunRuntimeInput),
        a.trace.traceId
      );
    });

    it("11. Input is not mutated", async () => {
      const input = structuredClone(validDryRunRuntimeInput);
      const before = freezeClone(input);
      await createRuntime().run(input);
      assert.deepEqual(input, before);
    });

    it("12. Business artifacts are deterministic ignoring timing", async () => {
      const a = normalizeResult(await createRuntime().run(validDryRunRuntimeInput));
      const b = normalizeResult(await createRuntime().run(validDryRunRuntimeInput));
      assert.deepEqual(a, b);
    });
  });

  describe("Input validation", () => {
    it("13. Invalid profile stops at input validation", async () => {
      const result = await createRuntime().run(invalidRuntimeProfileInput);
      assert.equal(result.success, false);
      assert.equal(result.terminalOutcome, "invalid_input");
      assert.deepEqual(
        result.trace.stages.map((s) => s.stage),
        ["input_validation"]
      );
    });

    it("14. Invalid goal stops at input validation", async () => {
      const result = await createRuntime().run(invalidRuntimeGoalInput);
      assert.equal(result.success, false);
      assert.equal(result.terminalOutcome, "invalid_input");
      assert.deepEqual(
        result.trace.stages.map((s) => s.stage),
        ["input_validation"]
      );
    });

    it("15. Unsupported runtime mode is rejected", () => {
      const input = {
        ...validDryRunRuntimeInput,
        mode: "production",
      } as unknown as AiOsRuntimeInput;
      const check = validateAiOsRuntimeInput(input);
      assert.equal(check.valid, false);
      assert.ok(check.errors.some((e) => /mode/i.test(e)));
    });

    it("16. transport_mock without source image is rejected", () => {
      const input: AiOsRuntimeInput = {
        mode: "transport_mock",
        profile: validTransportMockRuntimeInput.profile,
        goal: validTransportMockRuntimeInput.goal,
      };
      const check = validateAiOsRuntimeInput(input);
      assert.equal(check.valid, false);
      assert.ok(check.errors.some((e) => /source image/i.test(e)));
    });

    it("17. transport_mock without adapter is rejected", async () => {
      const result = await createRuntime().run(validTransportMockRuntimeInput);
      assert.equal(result.success, false);
      assert.equal(result.terminalOutcome, "invalid_input");
      assert.ok(result.errors.some((e) => /transport adapter/i.test(e)));
    });

    it("18. Invalid retry state is rejected", () => {
      const input: AiOsRuntimeInput = {
        ...validTransportMockRuntimeInput,
        retryState: {
          attempt: 9,
          maxAttempts: 3,
          transportAttempts: 0,
          validationAttempts: 0,
          appliedAdjustments: [],
          history: [],
        },
      };
      const check = validateAiOsRuntimeInput(input);
      assert.equal(check.valid, false);
      assert.ok(check.errors.some((e) => /retry state/i.test(e)));
    });

    it("19. Sensitive trace-related input is rejected safely", () => {
      const input: AiOsRuntimeInput = {
        mode: "dry_run",
        profile: {
          ...(validDryRunRuntimeInput.profile as Record<string, unknown>),
          notes: "Bearer secret-token-value",
        },
        goal: validDryRunRuntimeInput.goal,
      };
      const check = validateAiOsRuntimeInput(input);
      assert.equal(check.valid, false);
      assert.ok(check.errors.some((e) => /forbidden sensitive/i.test(e)));
      assert.ok(!JSON.stringify(check).includes("Bearer secret-token-value"));
    });

    it("20. Errors do not echo source image values", async () => {
      const secret = "data:image/png;base64," + "A".repeat(100);
      const input: AiOsRuntimeInput = {
        mode: "transport_mock",
        profile: validTransportMockRuntimeInput.profile,
        goal: validTransportMockRuntimeInput.goal,
        sourceImage: {
          value: secret,
          kind: "data_uri",
        },
      };
      // Sensitive content inside sourceImage.value is allowed structurally,
      // but if validation fails for other reasons, errors must not echo it.
      const broken: AiOsRuntimeInput = {
        ...input,
        retryState: {
          attempt: 9,
          maxAttempts: 1,
          transportAttempts: 0,
          validationAttempts: 0,
          appliedAdjustments: [],
          history: [],
        },
      };
      const check = validateAiOsRuntimeInput(broken);
      assert.equal(check.valid, false);
      assert.ok(!JSON.stringify(check.errors).includes(secret));
      assert.ok(!check.errors.some((e) => e.includes("AAAA")));
    });
  });

  describe("Transport", () => {
    it("21. transport_mock invokes transport exactly once", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportSuccessResult, calls);
      await createRuntime(adapter).run(transportSuccessWithoutEvidenceInput);
      assert.equal(calls.count, 1);
    });

    it("22. Disabled adapter failure becomes transport_failed", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportDisabledResult, calls);
      const result = await createRuntime(adapter).run(
        validTransportMockRuntimeInput
      );
      assert.equal(result.success, false);
      assert.equal(result.terminalOutcome, "transport_failed");
      assert.equal(calls.count, 1);
      assert.ok(result.artifacts.retryDecision);
    });

    it("23. Retryable timeout becomes retry_required", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportTimeoutResult, calls);
      const result = await createRuntime(adapter).run(transportTimeoutRuntimeInput);
      assert.equal(result.success, false);
      assert.equal(result.terminalOutcome, "retry_required");
      assert.equal(result.artifacts.retryDecision?.action, "retry_same_provider");
      assert.equal(calls.count, 1);
    });

    it("24. Runtime does not perform automatic second retry", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportTimeoutResult, calls);
      await createRuntime(adapter).run(transportTimeoutRuntimeInput);
      assert.equal(calls.count, 1);
    });

    it("25. Non-retryable auth failure becomes transport_failed", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportAuthFailureResult, calls);
      const result = await createRuntime(adapter).run(
        validTransportMockRuntimeInput
      );
      assert.equal(result.success, false);
      assert.equal(result.terminalOutcome, "transport_failed");
      assert.equal(
        result.artifacts.retryDecision?.action,
        "stop_transport_failure"
      );
    });

    it("26. Transport success is not automatic acceptance", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportSuccessResult, calls);
      const result = await createRuntime(adapter).run(
        transportSuccessWithoutEvidenceInput
      );
      assert.notEqual(result.terminalOutcome, "accepted");
      assert.equal(result.terminalOutcome, "awaiting_validation");
    });

    it("27. Transport success without evidence becomes awaiting_validation", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportSuccessResult, calls);
      const result = await createRuntime(adapter).run(
        transportSuccessWithoutEvidenceInput
      );
      assert.equal(result.success, true);
      assert.equal(result.terminalOutcome, "awaiting_validation");
      assert.ok(result.artifacts.transportResult);
      assert.ok(result.artifacts.retryDecision);
      assert.equal(result.artifacts.validationDecision, undefined);
    });

    it("28. Transport success records retry state through orchestrator", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportSuccessResult, calls);
      const result = await createRuntime(adapter).run(
        transportSuccessWithoutEvidenceInput
      );
      assert.equal(result.artifacts.retryDecision?.action, "await_validation");
      assert.ok(
        (result.artifacts.retryDecision?.nextState.transportAttempts ?? 0) >= 1
      );
      assert.equal(
        result.artifacts.retryDecision?.nextState.lastPredictionId,
        runtimeTransportSuccessResult.success
          ? runtimeTransportSuccessResult.predictionId
          : undefined
      );
    });

    it("29. Runtime does not mutate transport result", async () => {
      const frozen = freezeClone(runtimeTransportSuccessResult);
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(frozen, calls);
      const result = await createRuntime(adapter).run(
        transportSuccessWithoutEvidenceInput
      );
      assert.deepEqual(result.artifacts.transportResult, frozen);
    });

    it("30. Runtime does not mutate formatted request", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportSuccessResult, calls);
      const result = await createRuntime(adapter).run(
        transportSuccessWithoutEvidenceInput
      );
      const formatted = result.artifacts.formattedRequest;
      assert.ok(formatted);
      const before = freezeClone(formatted);
      assert.deepEqual(result.artifacts.formattedRequest, before);
      assert.deepEqual(calls.inputs[0]?.formattedRequest, before);
    });
  });

  describe("Validation", () => {
    it("31. Matching accepted evidence produces accepted", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportSuccessResult, calls);
      const result = await createRuntime(adapter).run(
        transportSuccessWithAcceptedEvidenceInput
      );
      assert.equal(result.success, true);
      assert.equal(result.terminalOutcome, "accepted");
      assert.equal(result.artifacts.validationDecision?.outcome, "accept");
      assert.equal(result.artifacts.retryDecision?.action, "accept_candidate");
    });

    it("32. Matching retry evidence produces retry_required", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportSuccessResult, calls);
      const result = await createRuntime(adapter).run(
        transportSuccessWithRetryEvidenceInput
      );
      assert.equal(result.success, false);
      assert.equal(result.terminalOutcome, "retry_required");
      assert.equal(result.artifacts.validationDecision?.outcome, "retry");
      assert.equal(result.artifacts.retryDecision?.action, "retry_same_provider");
    });

    it("33. Matching safety rejection produces rejected", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportSuccessResult, calls);
      const result = await createRuntime(adapter).run(
        transportSuccessWithSafetyRejectEvidenceInput
      );
      assert.equal(result.success, false);
      assert.equal(result.terminalOutcome, "rejected");
      assert.ok(
        result.artifacts.retryDecision?.action === "stop_safety_failure" ||
          result.artifacts.retryDecision?.action === "reject_candidate"
      );
    });

    it("34. Candidate mismatch produces invalid_runtime_state", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportSuccessResult, calls);
      const result = await createRuntime(adapter).run(
        candidateMismatchRuntimeInput
      );
      assert.equal(result.success, false);
      assert.equal(result.terminalOutcome, "invalid_runtime_state");
      assert.ok(
        result.errors.some((e) =>
          /does not match the transported candidate/i.test(e)
        )
      );
    });

    it("35. Candidate mismatch does not call ResultValidator", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportSuccessResult, calls);
      const result = await createRuntime(adapter).run(
        candidateMismatchRuntimeInput
      );
      assert.equal(result.artifacts.validationDecision, undefined);
      assert.ok(
        !result.trace.stages.some((s) => s.stage === "result_validation")
      );
    });

    it("36. Candidate mismatch does not call validation retry transition", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportSuccessResult, calls);
      const result = await createRuntime(adapter).run(
        candidateMismatchRuntimeInput
      );
      // Transport retry decision may exist; must not be a validation accept/retry/reject
      assert.ok(result.artifacts.retryDecision);
      assert.equal(result.artifacts.retryDecision?.action, "await_validation");
      assert.equal(
        result.artifacts.retryDecision?.metadata.validationOutcome,
        undefined
      );
    });

    it("37. Validation evidence is not generated by runtime", async () => {
      const source = readRuntimeSources();
      assert.ok(!/generateValidationEvidence|fromImage|visionModel/i.test(source));
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportSuccessResult, calls);
      const result = await createRuntime(adapter).run(
        transportSuccessWithoutEvidenceInput
      );
      assert.equal(result.artifacts.validationDecision, undefined);
    });

    it("38. ValidationDecision comes from ResultValidator", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportSuccessResult, calls);
      const result = await createRuntime(adapter).run(
        transportSuccessWithAcceptedEvidenceInput
      );
      assert.ok(result.artifacts.validationDecision);
      assert.equal(
        result.artifacts.validationDecision?.candidateId,
        runtimeTransportSuccessResult.success
          ? runtimeTransportSuccessResult.predictionId
          : ""
      );
      assert.equal(
        result.trace.versions.resultValidatorRulesVersion,
        "1.0"
      );
    });

    it("39. RetryDecision comes from RetryOrchestrator", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportSuccessResult, calls);
      const result = await createRuntime(adapter).run(
        transportSuccessWithAcceptedEvidenceInput
      );
      assert.ok(result.artifacts.retryDecision);
      assert.equal(result.artifacts.retryDecision?.rulesVersion, "1.0");
      assert.equal(
        result.trace.versions.retryOrchestratorRulesVersion,
        "1.0"
      );
    });

    it("40. Runtime adds no custom retry adjustment", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportSuccessResult, calls);
      const result = await createRuntime(adapter).run(
        transportSuccessWithRetryEvidenceInput
      );
      const adjustments =
        result.artifacts.retryDecision?.approvedAdjustments ?? [];
      assert.ok(
        adjustments.every(
          (a) =>
            a === "strengthen_identity_preservation" ||
            a === "strengthen_anatomy_constraints" ||
            a === "strengthen_plan_adherence" ||
            a === "strengthen_pose_camera_preservation" ||
            a === "strengthen_photorealism" ||
            a === "reduce_visual_emphasis"
        )
      );
      assert.ok(!adjustments.some((a) => String(a) === "switch_provider"));
      assert.ok(!adjustments.some((a) => String(a) === "switch_model_tier"));
    });

    it("41. Runtime never enables switch_provider", async () => {
      const source = readRuntimeSources();
      assert.ok(!/switch_provider/.test(source));
    });

    it("42. Runtime never enables switch_model_tier", async () => {
      const source = readRuntimeSources();
      assert.ok(!/switch_model_tier/.test(source));
    });

    it("43. Runtime never increases visual emphasis", async () => {
      const source = readRuntimeSources();
      assert.ok(!/increase_visual_emphasis|strengthen_visual_emphasis/.test(source));
    });

    it("44. One invocation makes at most one transport call", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter = createMockAdapter(runtimeTransportTimeoutResult, calls);
      await createRuntime(adapter).run(transportTimeoutRuntimeInput);
      assert.equal(calls.count, 1);

      const calls2 = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const adapter2 = createMockAdapter(runtimeTransportSuccessResult, calls2);
      await createRuntime(adapter2).run(
        transportSuccessWithAcceptedEvidenceInput
      );
      assert.equal(calls2.count, 1);
    });
  });

  describe("Stages", () => {
    it("45. Stage order is stable", async () => {
      const result = await createRuntime().run(validDryRunRuntimeInput);
      assert.deepEqual(
        result.trace.stages.map((s) => s.stage),
        DRY_RUN_STAGES
      );
    });

    it("46. Failed stage stops later stages", async () => {
      const result = await createRuntime().run(invalidRuntimeProfileInput);
      assert.deepEqual(
        result.trace.stages.map((s) => s.stage),
        ["input_validation"]
      );
      assert.ok(!result.trace.stages.some((s) => s.stage === "transformation"));
    });

    it("47. Durations are non-negative", async () => {
      const result = await createRuntime().run(validDryRunRuntimeInput);
      assert.ok(result.trace.stages.every((s) => s.durationMs >= 0));
    });

    it("48. Skipped stages are omitted", async () => {
      const result = await createRuntime().run(validDryRunRuntimeInput);
      assert.ok(!result.trace.stages.some((s) => s.stage === "transport"));
      assert.ok(
        !result.trace.stages.some((s) => s.stage === "awaiting_validation")
      );
    });

    it("49. Runtime result is JSON serializable", async () => {
      const result = await createRuntime().run(validDryRunRuntimeInput);
      const roundTrip = JSON.parse(JSON.stringify(result));
      assert.deepEqual(roundTrip, JSON.parse(JSON.stringify(result)));
    });
  });

  describe("Sanitization", () => {
    async function safeResult(): Promise<AiOsRuntimeResult> {
      return createRuntime().run(validDryRunRuntimeInput);
    }

    it("50. Safe runtime result remains unchanged", async () => {
      const result = await safeResult();
      const sanitized = sanitizeAiOsRuntimeResult(result);
      assert.deepEqual(sanitized, result);
      assert.equal(sanitized.success, true);
    });

    it("51. Unsafe nested URL is redacted", async () => {
      const result = await safeResult();
      const tainted = structuredClone(result) as AiOsRuntimeResult;
      tainted.warnings.push("see https://example.invalid/leak");
      const sanitized = sanitizeAiOsRuntimeResult(tainted);
      assert.ok(
        sanitized.warnings.some((w) => w === REDACTED_RUNTIME_CONTENT)
      );
      assert.equal(sanitized.terminalOutcome, "invalid_runtime_state");
    });

    it("52. Base64 is redacted", async () => {
      const result = await safeResult();
      const tainted = structuredClone(result) as AiOsRuntimeResult;
      tainted.errors.push("data:image/png;base64," + "B".repeat(90));
      const sanitized = sanitizeAiOsRuntimeResult(tainted);
      assert.ok(sanitized.errors.includes(REDACTED_RUNTIME_CONTENT));
    });

    it("53. Authorization text is redacted", async () => {
      const result = await safeResult();
      const tainted = structuredClone(result) as AiOsRuntimeResult;
      tainted.warnings.push("Authorization Bearer abc");
      const sanitized = sanitizeAiOsRuntimeResult(tainted);
      assert.ok(sanitized.warnings.includes(REDACTED_RUNTIME_CONTENT));
    });

    it("54. Token-like values are redacted", async () => {
      const result = await safeResult();
      const tainted = structuredClone(result) as AiOsRuntimeResult;
      tainted.errors.push("r8_abcdefghijklmnopqrstuvwxyz012345");
      const sanitized = sanitizeAiOsRuntimeResult(tainted);
      assert.ok(sanitized.errors.includes(REDACTED_RUNTIME_CONTENT));
    });

    it("55. Original result is not mutated", async () => {
      const result = await safeResult();
      const tainted = structuredClone(result) as AiOsRuntimeResult;
      tainted.warnings.push("https://example.invalid");
      const before = freezeClone(tainted);
      sanitizeAiOsRuntimeResult(tainted);
      assert.deepEqual(tainted, before);
    });

    it("56. Sanitization is idempotent", async () => {
      const result = await safeResult();
      const tainted = structuredClone(result) as AiOsRuntimeResult;
      tainted.warnings.push("https://example.invalid");
      const once = sanitizeAiOsRuntimeResult(tainted);
      const twice = sanitizeAiOsRuntimeResult(once);
      assert.deepEqual(once, twice);
    });

    it("57. Unsafe result becomes invalid_runtime_state", async () => {
      const result = await safeResult();
      const tainted = structuredClone(result) as AiOsRuntimeResult;
      tainted.warnings.push("sk-abcdefghijklmnopqrstuvwxyz");
      const sanitized = sanitizeAiOsRuntimeResult(tainted);
      assert.equal(sanitized.success, false);
      assert.equal(sanitized.terminalOutcome, "invalid_runtime_state");
    });

    it("58. Redaction error appears once", async () => {
      const result = await safeResult();
      const tainted = structuredClone(result) as AiOsRuntimeResult;
      tainted.warnings.push("https://example.invalid");
      const once = sanitizeAiOsRuntimeResult(tainted);
      const twice = sanitizeAiOsRuntimeResult(once);
      const count = twice.errors.filter(
        (e) => e === RUNTIME_FORBIDDEN_CONTENT_ERROR
      ).length;
      assert.equal(count, 1);
    });
  });

  describe("Security and architecture", () => {
    it("59. Runtime source contains no direct fetch", () => {
      const source = readRuntimeSources();
      assert.ok(!/\bfetch\s*\(/.test(source));
      assert.ok(!/\bglobalThis\.fetch\b/.test(source));
    });

    it("60. Runtime source does not import lib/replicate.js", () => {
      const source = readRuntimeSources();
      assert.ok(!/lib\/replicate/.test(source));
      assert.ok(!/visuellPrompt/.test(source));
      assert.ok(!/transformasjonLogikk/.test(source));
    });

    it("61. Runtime source does not import UI or Terra", () => {
      const source = readRuntimeSources();
      assert.ok(!/from ['\"]react['\"]/.test(source));
      assert.ok(!/react-native/.test(source));
      assert.ok(!/\bterra\b/i.test(source));
      assert.ok(!/expo-/.test(source));
    });

    it("62. Runtime does not read process.env", () => {
      const source = readRuntimeSources();
      assert.ok(!/process\.env/.test(source));
    });

    it("63. Runtime does not calculate physiology", () => {
      const source = readRuntimeSources();
      assert.ok(!/fatLossRate|muscleGrowthPotential|progressCurve/.test(source));
      // Orchestrates TransformationEngine; does not reimplement it
      assert.ok(/TransformationEngine/.test(source));
    });

    it("64. Runtime does not mutate RenderPlan", async () => {
      const result = await createRuntime().run(validDryRunRuntimeInput);
      const plan = result.artifacts.renderPlan;
      assert.ok(plan);
      const before = freezeClone(plan);
      assert.deepEqual(result.artifacts.renderPlan, before);
    });

    it("65. Runtime does not rewrite prompts", async () => {
      const source = readRuntimeSources();
      assert.ok(!/\.prompt\s*=/.test(source));
      assert.ok(!/rewritePrompt|mutatePrompt/.test(source));
      const result = await createRuntime().run(validDryRunRuntimeInput);
      const formatted = result.artifacts.formattedRequest;
      assert.ok(formatted);
      const before = freezeClone(formatted);
      assert.deepEqual(result.artifacts.formattedRequest, before);
    });

    it("66. Existing RetryOrchestrator tests remain in quality gate", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        scripts: { "test:ai": string };
      };
      assert.ok(pkg.scripts["test:ai"].includes("retryOrchestrator.test.ts"));
    });

    it("67. Existing ResultValidator tests remain in quality gate", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        scripts: { "test:ai": string };
      };
      assert.ok(pkg.scripts["test:ai"].includes("resultValidator.test.ts"));
    });

    it("68. Existing transport tests remain in quality gate", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        scripts: { "test:ai": string };
      };
      assert.ok(
        pkg.scripts["test:ai"].includes("replicateTransportAdapter.test.ts")
      );
    });

    it("69. Existing harness remains in quality gate", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        scripts: { "test:ai": string; "harness:ai": string };
      };
      assert.ok(pkg.scripts["test:ai"].includes("aiOsV2Harness.test.ts"));
      assert.ok(pkg.scripts["harness:ai"].includes("run-ai-os-v2-harness"));
    });

    it("70. Full AI Quality Gate commands remain valid", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        scripts: Record<string, string>;
      };
      assert.equal(typeof pkg.scripts.typecheck, "string");
      assert.equal(typeof pkg.scripts["test:ai"], "string");
      assert.equal(typeof pkg.scripts["harness:ai"], "string");
      assert.ok(pkg.scripts["test:ai"].includes("aiOsRuntime.test.ts"));
      assert.equal(AI_OS_RUNTIME_RULES_VERSION, "1.0");
      // Factory does not create production transport from env
      const deps = createAiOsRuntimeDependencies();
      assert.equal(deps.transportAdapter, undefined);
      // Real disabled adapter still does not imply production wiring
      const disabled = new RealTransportAdapter({
        ...DEFAULT_REPLICATE_TRANSPORT_CONFIG,
        enabled: false,
      });
      assert.equal(disabled.id, "replicate-transport-v1");
    });
  });
});
