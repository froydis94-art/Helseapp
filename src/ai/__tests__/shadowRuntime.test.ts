/**
 * DEMAND_014 / PATCH_014A — Shadow Runtime foundation + mock-only transport.
 *
 * Path note: lives under `src/ai/__tests__/` (not `tests/`) to match
 * existing package.json `test:ai` discovery.
 *
 * Run: npm run test:ai
 * Zero real network. Mocked transport only. No production writes.
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
  AiOsRuntime,
  createAiOsRuntimeDependencies,
  runtimeTransportSuccessResult,
  runtimeTransportTimeoutResult,
  validDryRunRuntimeInput,
} from "../runtime";
import {
  SHADOW_RUNTIME_RULES_VERSION,
  ShadowRuntime,
  collectShadowMetrics,
  createShadowRuntimeDependencies,
  createShadowRuntimeFromAiOsDeps,
  disabledShadowInput,
  missingRuntimeInputShadowInput,
  runtimeOnlyValidShadowInput,
  sanitizeShadowRuntimeResult,
  transportMockAcceptedShadowInput,
  transportMockAwaitingValidationShadowInput,
  transportMockRetryShadowInput,
  transportMockTimeoutShadowInput,
  transportMockValidShadowInput,
  validateShadowRuntimeInput,
  type ShadowRuntimeInput,
  type ShadowRuntimeResult,
} from "../shadow";
import {
  SHADOW_TRANSPORT_KIND_MISMATCH_ERROR,
  SHADOW_UNBRANDED_TRANSPORT_ERROR,
  createDryRunShadowRuntime,
  createMockTransportShadowRuntime,
  createShadowMockTransport,
  isShadowMockTransport,
  type ShadowMockTransportAdapter,
} from "../shadow/ShadowRuntime";
import type { ShadowSafeRuntime } from "../shadow/ShadowRuntimeTypes";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shadowDir = join(__dirname, "..", "shadow");
const packageJsonPath = join(__dirname, "..", "..", "..", "package.json");

function freezeClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeShadowResult(result: ShadowRuntimeResult): ShadowRuntimeResult {
  const clone = structuredClone(result);
  clone.metrics.runtimeDurationMs = 0;
  clone.metrics.stageDurations = clone.metrics.stageDurations.map((s) => ({
    ...s,
    durationMs: 0,
  }));
  if (clone.replay) {
    clone.replay.metrics = structuredClone(clone.metrics);
  }
  return clone;
}

function createTrackedMockTransport(
  result: ReplicateTransportResult,
  calls: { count: number; inputs: ReplicateTransportInput[] }
): ShadowMockTransportAdapter {
  return createShadowMockTransport({
    id: "mock-transport-shadow-v1",
    async generate(input: ReplicateTransportInput): Promise<ReplicateTransportResult> {
      calls.count += 1;
      calls.inputs.push(input);
      return structuredClone(result);
    },
  });
}

function createShadowWithTrackedMock(
  transportResult: ReplicateTransportResult
): {
  shadow: ShadowRuntime;
  calls: { count: number; inputs: ReplicateTransportInput[] };
} {
  const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
  let tick = 1_000_000;
  const clock = () => {
    tick += 5;
    return tick;
  };
  const mockTransport = createTrackedMockTransport(transportResult, calls);
  const shadow = createMockTransportShadowRuntime({
    mockTransport,
    now: clock,
  });
  return { shadow, calls };
}

function wrapTrackedSafeRuntime(
  kind: "none" | "mock",
  transportResult: ReplicateTransportResult,
  counters: { runtimeCalls: number; transportCalls: number },
  clock: () => number
): ShadowSafeRuntime {
  const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
  const adapter =
    kind === "mock"
      ? createTrackedMockTransport(transportResult, calls)
      : undefined;
  const aiOs = new AiOsRuntime(
    createAiOsRuntimeDependencies({
      transportAdapter: adapter,
      now: clock,
    })
  );
  return {
    shadowTransportKind: kind,
    async run(input) {
      counters.runtimeCalls += 1;
      const result = await aiOs.run(input);
      counters.transportCalls = calls.count;
      return result;
    },
  };
}

function shadowJson(result: ShadowRuntimeResult): string {
  return JSON.stringify(result);
}

function assertNoSensitiveLeakage(result: ShadowRuntimeResult): void {
  const json = shadowJson(result);
  assert.equal(/data:image\//i.test(json), false, "Base64/data URI leak");
  assert.equal(/\bAuthorization\b/i.test(json), false, "Authorization leak");
  assert.equal(/\bBearer\b/i.test(json), false, "Bearer leak");
  assert.equal(/https?:\/\//i.test(json), false, "URL leak");
  assert.equal(/REPLICATE_API_TOKEN/i.test(json), false);
  assert.equal(/\br8_/i.test(json), false, "token leak");
  assert.equal(/\bsk-/i.test(json), false, "token leak");
  assert.equal(/\bat\s+\S+\s+\([^)]+\.\w+:\d+:\d+\)/i.test(json), false, "stack leak");

  assert.equal(json.includes('"artifacts"'), false);
  assert.equal(json.includes('"transformationPlan"'), false);
  assert.equal(json.includes('"renderPlan"'), false);
  assert.equal(json.includes('"formattedRequest"'), false);
  assert.equal(json.includes('"transportResult"'), false);
  assert.equal(json.includes('"validationEvidence"'), false);
  assert.equal(json.includes('"visualDirection"'), false);
  assert.equal(json.includes('"prompt"'), false);
  assert.equal(json.includes('"positivePrompt"'), false);
  assert.equal(json.includes('"negativePrompt"'), false);
  assert.equal(json.includes('"imageUrl"'), false);
  assert.equal(json.includes('"healthContext"'), false);
  assert.equal(json.includes('"healthPayload"'), false);
}

function readShadowSources(): string {
  const files = readdirSync(shadowDir).filter((name) => name.endsWith(".ts"));
  return files.map((name) => readFileSync(join(shadowDir, name), "utf8")).join("\n");
}

describe("shadowRuntime — DEMAND_014 / PATCH_014A", () => {
  describe("Disabled mode", () => {
    it("1. Disabled mode skips runtime", async () => {
      const counters = { runtimeCalls: 0, transportCalls: 0 };
      let tick = 1_000_000;
      const clock = () => {
        tick += 1;
        return tick;
      };
      const safe = wrapTrackedSafeRuntime(
        "none",
        runtimeTransportSuccessResult,
        counters,
        clock
      );
      const shadow = new ShadowRuntime(
        createShadowRuntimeDependencies({ runtime: safe, now: clock })
      );
      const result = await shadow.run(disabledShadowInput);

      assert.equal(result.execution.skipped, true);
      assert.equal(result.execution.executed, false);
      assert.equal(result.success, true);
      assert.equal(result.mode, "disabled");
      assert.equal(result.execution.terminalOutcome, "skipped");
      assert.equal(counters.runtimeCalls, 0);
      assert.equal(counters.transportCalls, 0);
    });
  });

  describe("runtime_only", () => {
    it("2. Runtime_only executes dry_run", async () => {
      const shadow = createDryRunShadowRuntime();
      const result = await shadow.run(runtimeOnlyValidShadowInput);

      assert.equal(result.mode, "runtime_only");
      assert.equal(result.execution.executed, true);
      assert.equal(result.execution.runtimeMode, "dry_run");
      assert.equal(result.execution.terminalOutcome, "dry_run_complete");
      assert.equal(result.success, true);
      assert.equal(result.metrics.runtimeMode, "dry_run");
      assert.ok(result.metrics.stageCount > 0);
    });

    it("3. Runtime_only does not call transport", async () => {
      const { shadow, calls } = createShadowWithTrackedMock(
        runtimeTransportSuccessResult
      );
      await shadow.run(runtimeOnlyValidShadowInput);
      assert.equal(calls.count, 0);
    });

    it("2b. Runtime_only works with dry-run-safe factory", async () => {
      const shadow = createDryRunShadowRuntime();
      const result = await shadow.run(runtimeOnlyValidShadowInput);
      assert.equal(result.success, true);
      assert.equal(result.execution.runtimeMode, "dry_run");
    });
  });

  describe("transport_mock", () => {
    it("4. Transport_mock executes transport once", async () => {
      const { shadow, calls } = createShadowWithTrackedMock(
        runtimeTransportSuccessResult
      );
      const result = await shadow.run(transportMockAwaitingValidationShadowInput);

      assert.equal(result.mode, "runtime_with_transport_mock");
      assert.equal(result.execution.runtimeMode, "transport_mock");
      assert.equal(calls.count, 1);
      assert.equal(result.execution.terminalOutcome, "awaiting_validation");
      assert.equal(result.metrics.awaitingValidation, true);
    });

    it("5. No retry loop — one invocation one runtime execution", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      let runtimeCalls = 0;
      let tick = 2_000_000;
      const clock = () => {
        tick += 5;
        return tick;
      };
      const mockTransport = createTrackedMockTransport(
        runtimeTransportTimeoutResult,
        calls
      );
      const aiOs = new AiOsRuntime(
        createAiOsRuntimeDependencies({
          transportAdapter: mockTransport,
          now: clock,
        })
      );
      const safe: ShadowSafeRuntime = {
        shadowTransportKind: "mock",
        async run(input) {
          runtimeCalls += 1;
          return aiOs.run(input);
        },
      };
      const wrapped = new ShadowRuntime(
        createShadowRuntimeDependencies({ runtime: safe, now: clock })
      );
      const result = await wrapped.run(transportMockTimeoutShadowInput);

      assert.equal(runtimeCalls, 1);
      assert.equal(calls.count, 1);
      assert.ok(
        result.execution.terminalOutcome === "retry_required" ||
          result.execution.terminalOutcome === "transport_failed"
      );
      assert.equal(
        result.metrics.retryRequested || result.metrics.transportFailure,
        true
      );
    });

    it("6. Accepted outcome metrics", async () => {
      const { shadow, calls } = createShadowWithTrackedMock(
        runtimeTransportSuccessResult
      );
      const result = await shadow.run(transportMockAcceptedShadowInput);
      assert.equal(calls.count, 1);
      assert.equal(result.execution.terminalOutcome, "accepted");
      assert.equal(result.metrics.accepted, true);
      assert.equal(result.metrics.retryRequested, false);
    });

    it("7. Retry-requested metrics without second transport call", async () => {
      const { shadow, calls } = createShadowWithTrackedMock(
        runtimeTransportSuccessResult
      );
      const result = await shadow.run(transportMockRetryShadowInput);
      assert.equal(calls.count, 1);
      assert.equal(result.execution.terminalOutcome, "retry_required");
      assert.equal(result.metrics.retryRequested, true);
    });
  });

  describe("Mock-only transport enforcement (014A)", () => {
    it("25. runtime_with_transport_mock works with branded mock runtime", async () => {
      const { shadow, calls } = createShadowWithTrackedMock(
        runtimeTransportSuccessResult
      );
      const result = await shadow.run(transportMockValidShadowInput);
      assert.equal(result.execution.executed, true);
      assert.equal(result.execution.runtimeMode, "transport_mock");
      assert.equal(calls.count, 1);
    });

    it("26. runtime_with_transport_mock rejects dry-run-only runtime", async () => {
      const counters = { runtimeCalls: 0, transportCalls: 0 };
      let tick = 3_000_000;
      const clock = () => {
        tick += 1;
        return tick;
      };
      const safe = wrapTrackedSafeRuntime(
        "none",
        runtimeTransportSuccessResult,
        counters,
        clock
      );
      const shadow = new ShadowRuntime(
        createShadowRuntimeDependencies({ runtime: safe, now: clock })
      );
      const result = await shadow.run(transportMockValidShadowInput);

      assert.equal(result.success, false);
      assert.equal(result.execution.terminalOutcome, "invalid_input");
      assert.equal(result.execution.executed, false);
      assert.ok(result.errors.includes(SHADOW_TRANSPORT_KIND_MISMATCH_ERROR));
      assert.equal(counters.runtimeCalls, 0);
      assert.equal(counters.transportCalls, 0);
    });

    it("27. createDryRunShadowRuntime rejects transport_mock with zero work", async () => {
      const shadow = createDryRunShadowRuntime();
      const result = await shadow.run(transportMockValidShadowInput);
      assert.equal(result.success, false);
      assert.equal(result.execution.terminalOutcome, "invalid_input");
      assert.equal(result.execution.executed, false);
      assert.ok(result.errors.includes(SHADOW_TRANSPORT_KIND_MISMATCH_ERROR));
    });

    it("28. createShadowRuntimeFromAiOsDeps rejects unbranded transport", () => {
      const unbranded = {
        id: "real-looking-replicate-v1",
        provider: "replicate" as const,
        async generate(): Promise<ReplicateTransportResult> {
          return structuredClone(runtimeTransportSuccessResult);
        },
      } as unknown as ReplicateTransportAdapter;

      assert.equal(isShadowMockTransport(unbranded), false);
      assert.throws(
        () =>
          createShadowRuntimeFromAiOsDeps(
            createAiOsRuntimeDependencies({ transportAdapter: unbranded })
          ),
        (err: unknown) =>
          err instanceof Error &&
          err.message === SHADOW_UNBRANDED_TRANSPORT_ERROR
      );
    });

    it("29. real-looking adapter cannot enter createMockTransportShadowRuntime", () => {
      const realLooking = {
        id: "replicate-live-looking",
        provider: "replicate" as const,
        async generate(): Promise<ReplicateTransportResult> {
          return structuredClone(runtimeTransportSuccessResult);
        },
      } as unknown as ShadowMockTransportAdapter;

      assert.equal(isShadowMockTransport(realLooking), false);
      assert.throws(
        () => createMockTransportShadowRuntime({ mockTransport: realLooking }),
        (err: unknown) =>
          err instanceof Error &&
          err.message.includes("branded mock transport")
      );
    });

    it("30. createShadowRuntimeFromAiOsDeps accepts branded mock", async () => {
      const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
      const mockTransport = createTrackedMockTransport(
        runtimeTransportSuccessResult,
        calls
      );
      const shadow = createShadowRuntimeFromAiOsDeps(
        createAiOsRuntimeDependencies({ transportAdapter: mockTransport })
      );
      const result = await shadow.run(transportMockAcceptedShadowInput);
      assert.equal(result.execution.terminalOutcome, "accepted");
      assert.equal(calls.count, 1);
    });

    it("31. createShadowMockTransport brands explicitly", () => {
      const mock = createShadowMockTransport({
        async generate() {
          return structuredClone(runtimeTransportSuccessResult);
        },
      });
      assert.equal(isShadowMockTransport(mock), true);
    });
  });

  describe("Security / leakage", () => {
    it("8. No artifact leakage in exposed result", async () => {
      const { shadow } = createShadowWithTrackedMock(runtimeTransportSuccessResult);
      const result = await shadow.run(runtimeOnlyValidShadowInput);
      assertNoSensitiveLeakage(result);
      assert.equal("artifacts" in result, false);
    });

    it("9. No prompt leakage", async () => {
      const { shadow } = createShadowWithTrackedMock(runtimeTransportSuccessResult);
      const result = await shadow.run(runtimeOnlyValidShadowInput);
      const json = shadowJson(result);
      assert.equal(json.includes("prompt"), false);
      assert.equal(json.includes("positivePrompt"), false);
      assert.equal(json.includes("negativePrompt"), false);
    });

    it("10. No image / URL / Base64 / Authorization leakage", async () => {
      const { shadow } = createShadowWithTrackedMock(runtimeTransportSuccessResult);
      const result = await shadow.run(transportMockAcceptedShadowInput);
      assertNoSensitiveLeakage(result);
    });

    it("11. No RenderPlan / formatted request / ValidationEvidence / transport payload stored", async () => {
      const { shadow } = createShadowWithTrackedMock(runtimeTransportSuccessResult);
      const result = await shadow.run(transportMockAcceptedShadowInput);
      assertNoSensitiveLeakage(result);
      assert.ok(result.replay);
      const replayJson = JSON.stringify(result.replay);
      // Exact JSON keys only — version stamps like renderPlanRulesVersion are allowed.
      assert.equal(replayJson.includes('"renderPlan"'), false);
      assert.equal(replayJson.includes('"formattedRequest"'), false);
      assert.equal(replayJson.includes('"validationEvidence"'), false);
      assert.equal(replayJson.includes('"transportResult"'), false);
      assert.equal(replayJson.includes('"transformationPlan"'), false);
      assert.equal(replayJson.includes('"artifacts"'), false);
    });

    it("12. No health payload in shadow result", async () => {
      const { shadow } = createShadowWithTrackedMock(runtimeTransportSuccessResult);
      const result = await shadow.run(runtimeOnlyValidShadowInput);
      const json = shadowJson(result);
      assert.equal(json.includes("healthContext"), false);
      assert.equal(json.includes("healthPayload"), false);
      assert.equal(json.includes("terra"), false);
    });
  });

  describe("Replay and metrics determinism", () => {
    it("13. Replay deterministic (normalized durations)", async () => {
      const build = async () => {
        const { shadow } = createShadowWithTrackedMock(runtimeTransportSuccessResult);
        return normalizeShadowResult(await shadow.run(runtimeOnlyValidShadowInput));
      };
      const a = await build();
      const b = await build();
      assert.deepEqual(a.replay, b.replay);
      assert.equal(a.replay?.traceId, b.replay?.traceId);
      assert.deepEqual(a.replay?.stageSequence, b.replay?.stageSequence);
    });

    it("14. Metrics deterministic (normalized durations)", async () => {
      const build = async () => {
        const { shadow } = createShadowWithTrackedMock(runtimeTransportSuccessResult);
        return normalizeShadowResult(await shadow.run(runtimeOnlyValidShadowInput));
      };
      const a = await build();
      const b = await build();
      assert.deepEqual(a.metrics, b.metrics);
      assert.equal(a.metrics.shadowRulesVersion, SHADOW_RUNTIME_RULES_VERSION);
      assert.equal(typeof a.metrics.runtimeVersion, "string");
    });

    it("15. collectShadowMetrics ignores artifacts", () => {
      const runtimeLike = {
        success: true,
        mode: "dry_run" as const,
        terminalOutcome: "dry_run_complete" as const,
        trace: {
          traceId: "test-trace",
          rulesVersion: "1.0" as const,
          stages: [
            {
              stage: "transformation" as const,
              success: true,
              durationMs: 3,
              warnings: [],
              errors: [],
            },
          ],
          versions: { formatterVersion: "1.0" },
        },
        artifacts: {
          transformationPlan: { shouldNotAppear: true },
          formattedRequest: { prompt: "LEAK" },
        },
        warnings: [],
        errors: [],
      };
      const metrics = collectShadowMetrics(runtimeLike as never, 10);
      const json = JSON.stringify(metrics);
      assert.equal(json.includes("LEAK"), false);
      assert.equal(json.includes("transformationPlan"), false);
      assert.equal(metrics.stageCount, 1);
      assert.equal(metrics.formatterVersion, "1.0");
    });
  });

  describe("Mutation safety", () => {
    it("16. Runtime input not mutated", async () => {
      const { shadow } = createShadowWithTrackedMock(runtimeTransportSuccessResult);
      const input = freezeClone(runtimeOnlyValidShadowInput);
      const before = freezeClone(input);
      await shadow.run(input);
      assert.deepEqual(input, before);
    });

    it("17. Replay not mutated by caller edits across runs", async () => {
      const { shadow } = createShadowWithTrackedMock(runtimeTransportSuccessResult);
      const result = await shadow.run(runtimeOnlyValidShadowInput);
      assert.ok(result.replay);
      const originalTrace = result.replay.traceId;
      result.replay.traceId = "mutated";
      result.metrics.stageCount = 999;
      assert.equal(originalTrace.startsWith("aios-runtime-"), true);
      const again = await shadow.run(runtimeOnlyValidShadowInput);
      assert.equal(again.replay?.traceId, originalTrace);
      assert.notEqual(again.metrics.stageCount, 999);
    });

    it("18. JSON serializable", async () => {
      const { shadow } = createShadowWithTrackedMock(runtimeTransportSuccessResult);
      const result = await shadow.run(transportMockValidShadowInput);
      const json = JSON.stringify(result);
      const parsed = JSON.parse(json) as ShadowRuntimeResult;
      assert.equal(parsed.mode, "runtime_with_transport_mock");
      assert.equal(typeof parsed.metrics.stageCount, "number");
    });
  });

  describe("Validation and sanitize", () => {
    it("19. Missing runtimeInput fails validation", () => {
      const v = validateShadowRuntimeInput(missingRuntimeInputShadowInput);
      assert.equal(v.valid, false);
    });

    it("20. sanitizeShadowRuntimeResult is idempotent for clean results", async () => {
      const { shadow } = createShadowWithTrackedMock(runtimeTransportSuccessResult);
      const result = await shadow.run(runtimeOnlyValidShadowInput);
      const once = sanitizeShadowRuntimeResult(result);
      const twice = sanitizeShadowRuntimeResult(once);
      assert.deepEqual(normalizeShadowResult(once), normalizeShadowResult(twice));
    });

    it("21. Shadow rules version is 1.0", () => {
      assert.equal(SHADOW_RUNTIME_RULES_VERSION, "1.0");
    });
  });

  describe("Package wiring", () => {
    it("22. test:ai includes shadowRuntime.test.ts", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        scripts: { "test:ai": string };
      };
      assert.match(pkg.scripts["test:ai"], /shadowRuntime\.test\.ts/);
    });

    it("23. Shadow sources do not import production API or Expo", () => {
      const src = readShadowSources();
      assert.equal(src.includes("from \"expo"), false);
      assert.equal(src.includes("lib/replicate"), false);
      assert.equal(src.includes("lib/visuellPrompt"), false);
      assert.equal(src.includes("process.env"), false);
      assert.equal(src.includes("new ReplicateTransportAdapter"), false);
    });
  });

  describe("One invocation contract", () => {
    it("24. One shadow run → one runtime execution", async () => {
      let runtimeCalls = 0;
      let tick = 1_000_000;
      const clock = () => {
        tick += 5;
        return tick;
      };
      const aiOs = new AiOsRuntime(
        createAiOsRuntimeDependencies({ now: clock })
      );
      const safe: ShadowSafeRuntime = {
        shadowTransportKind: "none",
        async run(input) {
          runtimeCalls += 1;
          return aiOs.run(input);
        },
      };
      const shadow = new ShadowRuntime(
        createShadowRuntimeDependencies({ runtime: safe, now: clock })
      );
      await shadow.run({
        mode: "runtime_only",
        runtimeInput: structuredClone(validDryRunRuntimeInput),
      } satisfies ShadowRuntimeInput);
      assert.equal(runtimeCalls, 1);
    });
  });
});
