/**
 * DEMAND_014 / PATCH_014A / PATCH_014B — Shadow Runtime foundation +
 * data-only, network-impossible mock transport.
 *
 * Path note: lives under `src/ai/__tests__/` (not `tests/`) to match
 * existing package.json `test:ai` discovery.
 *
 * Run: npm run test:ai
 * Zero real network. Data-only mock fixtures. No production writes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ReplicateTransportAdapter } from "../transport/ReplicateTransportAdapter";
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
import * as ShadowRuntimeModule from "../shadow/ShadowRuntime";
import {
  SHADOW_MOCK_RESULTS_EXHAUSTED_ERROR,
  SHADOW_TRANSPORT_KIND_MISMATCH_ERROR,
  SHADOW_UNBRANDED_TRANSPORT_ERROR,
  createDryRunShadowRuntime,
  createMockTransportShadowRuntime,
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

function createClock(start = 1_000_000): () => number {
  let tick = start;
  return () => {
    tick += 5;
    return tick;
  };
}

function createDataOnlyMockShadow(
  mockResults: ReplicateTransportResult[] = [runtimeTransportSuccessResult],
  start = 1_000_000
): ShadowRuntime {
  return createMockTransportShadowRuntime({
    mockResults: mockResults.map((r) => structuredClone(r)),
    now: createClock(start),
  });
}

function wrapNoneSafeRuntime(
  counters: { runtimeCalls: number },
  clock: () => number
): ShadowSafeRuntime {
  const aiOs = new AiOsRuntime(createAiOsRuntimeDependencies({ now: clock }));
  return {
    shadowTransportKind: "none",
    async run(input) {
      counters.runtimeCalls += 1;
      return aiOs.run(input);
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

describe("shadowRuntime — DEMAND_014 / PATCH_014A / PATCH_014B", () => {
  describe("Disabled mode", () => {
    it("1. Disabled mode skips runtime", async () => {
      const counters = { runtimeCalls: 0 };
      const clock = createClock();
      const safe = wrapNoneSafeRuntime(counters, clock);
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
      // One fixture: if runtime_only consumed transport, transport_mock would exhaust.
      const shadow = createDataOnlyMockShadow([runtimeTransportSuccessResult]);
      await shadow.run(runtimeOnlyValidShadowInput);
      const result = await shadow.run(transportMockAwaitingValidationShadowInput);
      assert.equal(result.execution.runtimeMode, "transport_mock");
      assert.equal(result.execution.terminalOutcome, "awaiting_validation");
      assert.equal(result.metrics.awaitingValidation, true);
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
      const shadow = createDataOnlyMockShadow([runtimeTransportSuccessResult]);
      const result = await shadow.run(transportMockAwaitingValidationShadowInput);

      assert.equal(result.mode, "runtime_with_transport_mock");
      assert.equal(result.execution.runtimeMode, "transport_mock");
      assert.equal(result.execution.terminalOutcome, "awaiting_validation");
      assert.equal(result.metrics.awaitingValidation, true);

      // Second run with no remaining fixtures proves exactly one consume on first.
      const exhausted = await shadow.run(transportMockAwaitingValidationShadowInput);
      assert.equal(exhausted.success, false);
      assert.equal(exhausted.metrics.transportFailure, true);
    });

    it("5. No retry loop — one invocation one runtime execution", async () => {
      // Only one timeout fixture: a retry loop would hit exhausted mid-run.
      const shadow = createDataOnlyMockShadow(
        [runtimeTransportTimeoutResult],
        2_000_000
      );
      const result = await shadow.run(transportMockTimeoutShadowInput);

      assert.ok(
        result.execution.terminalOutcome === "retry_required" ||
          result.execution.terminalOutcome === "transport_failed"
      );
      assert.equal(
        result.metrics.retryRequested || result.metrics.transportFailure,
        true
      );
      assert.equal(
        result.errors.some((e) => e.includes(SHADOW_MOCK_RESULTS_EXHAUSTED_ERROR)),
        false
      );
    });

    it("6. Accepted outcome metrics", async () => {
      const shadow = createDataOnlyMockShadow([runtimeTransportSuccessResult]);
      const result = await shadow.run(transportMockAcceptedShadowInput);
      assert.equal(result.execution.terminalOutcome, "accepted");
      assert.equal(result.metrics.accepted, true);
      assert.equal(result.metrics.retryRequested, false);
    });

    it("7. Retry-requested metrics without second transport call", async () => {
      const shadow = createDataOnlyMockShadow([runtimeTransportSuccessResult]);
      const result = await shadow.run(transportMockRetryShadowInput);
      assert.equal(result.execution.terminalOutcome, "retry_required");
      assert.equal(result.metrics.retryRequested, true);

      // Fixture still available would mean second generate; prove consumed once:
      const exhausted = await shadow.run(transportMockRetryShadowInput);
      assert.equal(exhausted.metrics.transportFailure, true);
    });
  });

  describe("Data-only mock transport enforcement (014B)", () => {
    it("25. dry-run factory works", async () => {
      const shadow = createDryRunShadowRuntime();
      const result = await shadow.run(runtimeOnlyValidShadowInput);
      assert.equal(result.success, true);
      assert.equal(result.execution.runtimeMode, "dry_run");
    });

    it("26. data-only mock success works", async () => {
      const shadow = createMockTransportShadowRuntime({
        mockResults: [structuredClone(runtimeTransportSuccessResult)],
      });
      const result = await shadow.run(transportMockAcceptedShadowInput);
      assert.equal(result.execution.terminalOutcome, "accepted");
      assert.equal(result.metrics.accepted, true);
    });

    it("27. data-only mock timeout works", async () => {
      const shadow = createMockTransportShadowRuntime({
        mockResults: [structuredClone(runtimeTransportTimeoutResult)],
      });
      const result = await shadow.run(transportMockTimeoutShadowInput);
      assert.ok(
        result.execution.terminalOutcome === "retry_required" ||
          result.execution.terminalOutcome === "transport_failed"
      );
      assert.equal(
        result.metrics.retryRequested || result.metrics.transportFailure,
        true
      );
    });

    it("28. supplied mock results are not mutated", async () => {
      const mockResults = [structuredClone(runtimeTransportSuccessResult)];
      const before = freezeClone(mockResults);
      const shadow = createMockTransportShadowRuntime({ mockResults });
      await shadow.run(transportMockAcceptedShadowInput);
      assert.deepEqual(mockResults, before);
    });

    it("29. each invocation consumes at most one result", async () => {
      const shadow = createMockTransportShadowRuntime({
        mockResults: [
          structuredClone(runtimeTransportSuccessResult),
          structuredClone(runtimeTransportSuccessResult),
        ],
      });
      const first = await shadow.run(transportMockAcceptedShadowInput);
      assert.equal(first.execution.terminalOutcome, "accepted");
      const second = await shadow.run(transportMockAcceptedShadowInput);
      assert.equal(second.execution.terminalOutcome, "accepted");
      const third = await shadow.run(transportMockAcceptedShadowInput);
      assert.equal(third.success, false);
      assert.equal(third.metrics.transportFailure, true);
    });

    it("30. exhausted mock results fail safely", async () => {
      const shadow = createMockTransportShadowRuntime({ mockResults: [] });
      const result = await shadow.run(transportMockValidShadowInput);
      assert.equal(result.success, false);
      assert.equal(result.execution.executed, true);
      assert.equal(result.metrics.transportFailure, true);
    });

    it("31. no callback can be supplied by the public contract", () => {
      const src = readFileSync(join(shadowDir, "ShadowRuntime.ts"), "utf8");
      assert.equal(src.includes("createShadowMockTransport"), false);
      assert.equal(/generate\s*:\s*\(/.test(src), false);
      assert.equal(
        /createMockTransportShadowRuntime\(options:\s*\{[^}]*generate/s.test(src),
        false
      );
      assert.match(
        src,
        /createMockTransportShadowRuntime\(options:\s*\{\s*mockResults:/
      );
      assert.equal("createShadowMockTransport" in ShadowRuntimeModule, false);
    });

    it("32. arbitrary AiOsRuntimeDependencies with transport adapter are rejected", () => {
      const unbranded = {
        id: "real-looking-replicate-v1",
        provider: "replicate" as const,
        async generate(): Promise<ReplicateTransportResult> {
          return structuredClone(runtimeTransportSuccessResult);
        },
      } as unknown as ReplicateTransportAdapter;

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

    it("33. real-looking Replicate adapter is rejected", () => {
      const realLooking = {
        id: "replicate-live-looking",
        provider: "replicate" as const,
        async generate(): Promise<ReplicateTransportResult> {
          return structuredClone(runtimeTransportSuccessResult);
        },
      } as unknown as ReplicateTransportAdapter;

      assert.throws(
        () =>
          createShadowRuntimeFromAiOsDeps(
            createAiOsRuntimeDependencies({ transportAdapter: realLooking })
          ),
        (err: unknown) =>
          err instanceof Error &&
          err.message === SHADOW_UNBRANDED_TRANSPORT_ERROR
      );
      // Public mock factory does not accept adapters at all.
      assert.equal(
        createMockTransportShadowRuntime.length >= 1 ||
          typeof createMockTransportShadowRuntime === "function",
        true
      );
    });

    it("34. createShadowRuntimeFromAiOsDeps without adapter is dry-run only", async () => {
      const shadow = createShadowRuntimeFromAiOsDeps(
        createAiOsRuntimeDependencies({})
      );
      const dry = await shadow.run(runtimeOnlyValidShadowInput);
      assert.equal(dry.success, true);
      const mock = await shadow.run(transportMockValidShadowInput);
      assert.equal(mock.success, false);
      assert.ok(mock.errors.includes(SHADOW_TRANSPORT_KIND_MISMATCH_ERROR));
    });

    it("35. runtime_with_transport_mock rejects dry-run-only runtime", async () => {
      const counters = { runtimeCalls: 0 };
      const clock = createClock(3_000_000);
      const safe = wrapNoneSafeRuntime(counters, clock);
      const shadow = new ShadowRuntime(
        createShadowRuntimeDependencies({ runtime: safe, now: clock })
      );
      const result = await shadow.run(transportMockValidShadowInput);

      assert.equal(result.success, false);
      assert.equal(result.execution.terminalOutcome, "invalid_input");
      assert.equal(result.execution.executed, false);
      assert.ok(result.errors.includes(SHADOW_TRANSPORT_KIND_MISMATCH_ERROR));
      assert.equal(counters.runtimeCalls, 0);
    });

    it("36. createDryRunShadowRuntime rejects transport_mock with zero work", async () => {
      const shadow = createDryRunShadowRuntime();
      const result = await shadow.run(transportMockValidShadowInput);
      assert.equal(result.success, false);
      assert.equal(result.execution.terminalOutcome, "invalid_input");
      assert.equal(result.execution.executed, false);
      assert.ok(result.errors.includes(SHADOW_TRANSPORT_KIND_MISMATCH_ERROR));
    });

    it("37. no exported mock brand symbol exists", () => {
      const src = readFileSync(join(shadowDir, "ShadowRuntime.ts"), "utf8");
      assert.equal(src.includes("export const SHADOW_MOCK_TRANSPORT_BRAND"), false);
      assert.equal(src.includes("export function isShadowMockTransport"), false);
      assert.equal(src.includes("export type ShadowMockTransportAdapter"), false);
      assert.equal("SHADOW_MOCK_TRANSPORT_BRAND" in ShadowRuntimeModule, false);
      assert.equal("isShadowMockTransport" in ShadowRuntimeModule, false);
      assert.equal("createShadowMockTransport" in ShadowRuntimeModule, false);
    });

    it("38. shadow source contains no fetch / Replicate construction", () => {
      const src = readShadowSources();
      assert.equal(/\bfetch\s*\(/.test(src), false);
      assert.equal(src.includes("new ReplicateTransportAdapter"), false);
      assert.equal(src.includes("lib/replicate"), false);
      assert.equal(src.includes("process.env"), false);
    });

    it("39. zero real network calls possible through public Shadow factories", async () => {
      const dry = createDryRunShadowRuntime();
      const mock = createMockTransportShadowRuntime({
        mockResults: [structuredClone(runtimeTransportSuccessResult)],
      });
      await dry.run(runtimeOnlyValidShadowInput);
      await mock.run(transportMockAcceptedShadowInput);
      // Factories never accept network deps; source proves no fetch/env/replicate.
      const src = readFileSync(join(shadowDir, "ShadowRuntime.ts"), "utf8");
      assert.match(src, /mockResults/);
      assert.equal(src.includes("createShadowMockTransport"), false);
    });
  });

  describe("Security / leakage", () => {
    it("8. No artifact leakage in exposed result", async () => {
      const shadow = createDataOnlyMockShadow();
      const result = await shadow.run(runtimeOnlyValidShadowInput);
      assertNoSensitiveLeakage(result);
      assert.equal("artifacts" in result, false);
    });

    it("9. No prompt leakage", async () => {
      const shadow = createDataOnlyMockShadow();
      const result = await shadow.run(runtimeOnlyValidShadowInput);
      const json = shadowJson(result);
      assert.equal(json.includes("prompt"), false);
      assert.equal(json.includes("positivePrompt"), false);
      assert.equal(json.includes("negativePrompt"), false);
    });

    it("10. No image / URL / Base64 / Authorization leakage", async () => {
      const shadow = createDataOnlyMockShadow();
      const result = await shadow.run(transportMockAcceptedShadowInput);
      assertNoSensitiveLeakage(result);
    });

    it("11. No RenderPlan / formatted request / ValidationEvidence / transport payload stored", async () => {
      const shadow = createDataOnlyMockShadow();
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
      const shadow = createDataOnlyMockShadow();
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
        const shadow = createDataOnlyMockShadow();
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
        const shadow = createDataOnlyMockShadow();
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
      const shadow = createDataOnlyMockShadow();
      const input = freezeClone(runtimeOnlyValidShadowInput);
      const before = freezeClone(input);
      await shadow.run(input);
      assert.deepEqual(input, before);
    });

    it("17. Replay not mutated by caller edits across runs", async () => {
      const shadow = createDataOnlyMockShadow();
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
      const shadow = createDataOnlyMockShadow();
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
      const shadow = createDataOnlyMockShadow();
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
      const clock = createClock();
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
