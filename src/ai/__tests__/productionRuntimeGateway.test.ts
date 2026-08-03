/**
 * DEMAND_015 — Production Runtime Integration Foundation.
 *
 * Path note: lives under `src/ai/__tests__/` to match package.json `test:ai`.
 * Run: npm run test:ai
 * Zero real network. No production route wiring. No live provider traffic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ShadowRuntimeInput, ShadowRuntimeResult } from "../shadow";
import {
  PRODUCTION_FORBIDDEN_CONTENT_WARNING,
  PRODUCTION_RUNTIME_RULES_VERSION,
  ProductionRuntimeGateway,
  REDACTED_PRODUCTION_CONTENT,
  calculateProductionSampleBucket,
  createProductionRuntimeConfigFromEnv,
  createProductionRuntimeGatewayDependencies,
  evaluateProductionRuntimePolicy,
  failedShadowDryRunResultFixture,
  fullSamplingProductionConfig,
  invalidSensitiveRequestContext,
  killSwitchProductionConfig,
  legacyOnlyProductionConfig,
  projectProductionTelemetry,
  safeShadowDryRunResultFixture,
  sanitizeProductionGatewayResult,
  shadowDryRunProductionConfig,
  unsafeShadowResultFixture,
  validProductionGatewayInput,
  validProductionRequestContext,
  validateProductionRequestContext,
  validateProductionTelemetry,
  zeroSamplingProductionConfig,
  type ProductionGatewayInput,
  type ProductionGatewayResult,
  type ProductionRuntimeConfig,
  type ProductionTelemetry,
} from "../production";

const __dirname = dirname(fileURLToPath(import.meta.url));
const productionDir = join(__dirname, "..", "production");
const packageJsonPath = join(__dirname, "..", "..", "..", "package.json");
const repoRoot = join(__dirname, "..", "..", "..");

function freezeClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readProductionSources(): string {
  const files = readdirSync(productionDir).filter((f) => f.endsWith(".ts"));
  return files
    .map((f) => readFileSync(join(productionDir, f), "utf8"))
    .join("\n");
}

function createMockShadow(options?: {
  result?: ShadowRuntimeResult;
  delayMs?: number;
  throwError?: boolean;
  onRun?: (input: ShadowRuntimeInput) => void;
}): {
  run(input: ShadowRuntimeInput): Promise<ShadowRuntimeResult>;
  calls: ShadowRuntimeInput[];
} {
  const calls: ShadowRuntimeInput[] = [];
  return {
    calls,
    async run(input: ShadowRuntimeInput): Promise<ShadowRuntimeResult> {
      calls.push(structuredClone(input));
      options?.onRun?.(input);
      if (options?.throwError) {
        throw new Error("mock shadow boom");
      }
      if (options?.delayMs != null && options.delayMs > 0) {
        await new Promise((r) => setTimeout(r, options.delayMs));
      }
      return structuredClone(
        options?.result ?? safeShadowDryRunResultFixture
      );
    },
  };
}

describe("DEMAND_015 Production Runtime Integration Foundation", () => {
  describe("Configuration", () => {
    it("1. Default mode is legacy_only", () => {
      const config = createProductionRuntimeConfigFromEnv({});
      assert.equal(config.mode, "legacy_only");
    });

    it("2. Default sampling is zero", () => {
      const config = createProductionRuntimeConfigFromEnv({});
      assert.equal(config.shadowSampleRateBasisPoints, 0);
    });

    it("3. Exact supported mode is accepted", () => {
      const config = createProductionRuntimeConfigFromEnv({
        AI_OS_PRODUCTION_MODE: "legacy_with_shadow_dry_run",
      });
      assert.equal(config.mode, "legacy_with_shadow_dry_run");
    });

    it("4. Unsupported mode falls back safely", () => {
      const config = createProductionRuntimeConfigFromEnv({
        AI_OS_PRODUCTION_MODE: "v2_live_disabled",
      });
      assert.equal(config.mode, "legacy_only");
    });

    it('5. Kill switch requires exact "1"', () => {
      assert.equal(
        createProductionRuntimeConfigFromEnv({
          AI_OS_GLOBAL_KILL_SWITCH: "1",
        }).globalKillSwitch,
        true
      );
      assert.equal(
        createProductionRuntimeConfigFromEnv({
          AI_OS_GLOBAL_KILL_SWITCH: "true",
        }).globalKillSwitch,
        false
      );
      assert.equal(
        createProductionRuntimeConfigFromEnv({
          AI_OS_GLOBAL_KILL_SWITCH: "yes",
        }).globalKillSwitch,
        false
      );
    });

    it("6. Sampling accepts 0", () => {
      assert.equal(
        createProductionRuntimeConfigFromEnv({
          AI_OS_SHADOW_SAMPLE_BPS: "0",
        }).shadowSampleRateBasisPoints,
        0
      );
    });

    it("7. Sampling accepts 10000", () => {
      assert.equal(
        createProductionRuntimeConfigFromEnv({
          AI_OS_SHADOW_SAMPLE_BPS: "10000",
        }).shadowSampleRateBasisPoints,
        10000
      );
    });

    it("8. Sampling rejects negative values", () => {
      assert.equal(
        createProductionRuntimeConfigFromEnv({
          AI_OS_SHADOW_SAMPLE_BPS: "-1",
        }).shadowSampleRateBasisPoints,
        0
      );
    });

    it("9. Sampling rejects values above 10000", () => {
      assert.equal(
        createProductionRuntimeConfigFromEnv({
          AI_OS_SHADOW_SAMPLE_BPS: "10001",
        }).shadowSampleRateBasisPoints,
        0
      );
    });

    it("10. Sampling rejects decimals", () => {
      assert.equal(
        createProductionRuntimeConfigFromEnv({
          AI_OS_SHADOW_SAMPLE_BPS: "12.5",
        }).shadowSampleRateBasisPoints,
        0
      );
    });

    it("11. Timeout uses safe bounds", () => {
      assert.equal(
        createProductionRuntimeConfigFromEnv({}).shadowTimeoutMs,
        1500
      );
      assert.equal(
        createProductionRuntimeConfigFromEnv({
          AI_OS_SHADOW_TIMEOUT_MS: "100",
        }).shadowTimeoutMs,
        100
      );
      assert.equal(
        createProductionRuntimeConfigFromEnv({
          AI_OS_SHADOW_TIMEOUT_MS: "5000",
        }).shadowTimeoutMs,
        5000
      );
      assert.equal(
        createProductionRuntimeConfigFromEnv({
          AI_OS_SHADOW_TIMEOUT_MS: "99",
        }).shadowTimeoutMs,
        1500
      );
      assert.equal(
        createProductionRuntimeConfigFromEnv({
          AI_OS_SHADOW_TIMEOUT_MS: "5001",
        }).shadowTimeoutMs,
        1500
      );
    });

    it("12. Environment values are not exposed", () => {
      const config = createProductionRuntimeConfigFromEnv({
        AI_OS_PRODUCTION_MODE: "legacy_only",
        REPLICATE_API_TOKEN: "r8_should_not_leak",
        EXTRA_SECRET: "nope",
      });
      const json = JSON.stringify(config);
      assert.equal(json.includes("r8_"), false);
      assert.equal(json.includes("EXTRA_SECRET"), false);
      assert.equal(json.includes("REPLICATE"), false);
      assert.deepEqual(Object.keys(config).sort(), [
        "globalKillSwitch",
        "mode",
        "shadowSampleRateBasisPoints",
        "shadowTimeoutMs",
      ]);
    });
  });

  describe("Policy", () => {
    it("13. Legacy is always required", () => {
      const configs: ProductionRuntimeConfig[] = [
        legacyOnlyProductionConfig,
        shadowDryRunProductionConfig,
        killSwitchProductionConfig,
        zeroSamplingProductionConfig,
        fullSamplingProductionConfig,
        { ...shadowDryRunProductionConfig, mode: "v2_dry_run_internal" },
      ];
      for (const config of configs) {
        const d = evaluateProductionRuntimePolicy(
          config,
          validProductionRequestContext
        );
        assert.equal(d.legacyRequired, true);
      }
    });

    it("14. User-visible owner is always legacy", () => {
      const d = evaluateProductionRuntimePolicy(
        shadowDryRunProductionConfig,
        validProductionRequestContext
      );
      assert.equal(d.userVisibleOwner, "legacy");
    });

    it("15. v2 provider traffic is always false", () => {
      const d = evaluateProductionRuntimePolicy(
        shadowDryRunProductionConfig,
        validProductionRequestContext
      );
      assert.equal(d.v2ProviderTrafficAllowed, false);
    });

    it("16. Kill switch disables Shadow", () => {
      const d = evaluateProductionRuntimePolicy(
        killSwitchProductionConfig,
        validProductionRequestContext
      );
      assert.equal(d.action, "disable_v2");
      assert.equal(d.reasonCode, "global_kill_switch");
      assert.equal(d.runShadowDryRun, false);
      assert.equal(d.effectiveMode, "legacy_only");
    });

    it("17. legacy_only skips Shadow", () => {
      const d = evaluateProductionRuntimePolicy(
        legacyOnlyProductionConfig,
        validProductionRequestContext
      );
      assert.equal(d.action, "use_legacy_only");
      assert.equal(d.reasonCode, "default_legacy_policy");
      assert.equal(d.runShadowDryRun, false);
    });

    it("18. 0 BPS selects no requests", () => {
      const d = evaluateProductionRuntimePolicy(
        zeroSamplingProductionConfig,
        validProductionRequestContext
      );
      assert.equal(d.action, "skip_shadow");
      assert.equal(d.reasonCode, "shadow_sample_not_selected");
      assert.equal(d.runShadowDryRun, false);
    });

    it("19. 10000 BPS selects all valid requests", () => {
      const d = evaluateProductionRuntimePolicy(
        fullSamplingProductionConfig,
        validProductionRequestContext
      );
      assert.equal(d.action, "use_legacy_with_shadow");
      assert.equal(d.reasonCode, "shadow_dry_run_enabled");
      assert.equal(d.runShadowDryRun, true);
    });

    it("20. Sampling is deterministic", () => {
      const a = calculateProductionSampleBucket("req_stable_xyz");
      const b = calculateProductionSampleBucket("req_stable_xyz");
      const c = calculateProductionSampleBucket("req_other_abc");
      assert.equal(a, b);
      assert.notEqual(a, c);
    });

    it("21. Same requestId maps to same bucket", () => {
      assert.equal(
        calculateProductionSampleBucket(validProductionRequestContext.requestId),
        calculateProductionSampleBucket(validProductionRequestContext.requestId)
      );
    });

    it("22. Bucket is between 0 and 9999", () => {
      for (const id of [
        "a",
        "req_1",
        "zzzz",
        validProductionRequestContext.requestId,
        "0",
        "bucket-edge-case-999",
      ]) {
        const bucket = calculateProductionSampleBucket(id);
        assert.ok(bucket >= 0 && bucket <= 9999);
        assert.equal(Number.isInteger(bucket), true);
      }
    });

    it("23. Invalid context falls back to legacy", () => {
      const d = evaluateProductionRuntimePolicy(shadowDryRunProductionConfig, {
        requestId: "",
        routeId: "route_ok",
        authenticated: false,
      });
      assert.equal(d.effectiveMode, "legacy_only");
      assert.equal(d.legacyRequired, true);
      assert.equal(d.runShadowDryRun, false);
      assert.equal(d.userVisibleOwner, "legacy");
      assert.equal(d.v2ProviderTrafficAllowed, false);
      assert.ok(d.errors.length > 0);
    });

    it("24. Sensitive request ID is rejected safely", () => {
      const validation = validateProductionRequestContext(
        invalidSensitiveRequestContext
      );
      assert.equal(validation.valid, false);
      const d = evaluateProductionRuntimePolicy(
        shadowDryRunProductionConfig,
        invalidSensitiveRequestContext
      );
      assert.equal(d.runShadowDryRun, false);
      assert.equal(d.legacyRequired, true);
      assert.equal(JSON.stringify(d).includes("https://"), false);
    });

    it("25. Unsupported reserved mode is rejected", () => {
      const d = evaluateProductionRuntimePolicy(
        {
          ...legacyOnlyProductionConfig,
          mode: "v2_dry_run_internal",
        },
        validProductionRequestContext
      );
      assert.equal(d.action, "reject_unsupported_mode");
      assert.equal(d.reasonCode, "unsupported_mode");
      assert.equal(d.effectiveMode, "legacy_only");
      assert.equal(d.runShadowDryRun, false);
    });

    it("26. Policy input is not mutated", () => {
      const config = freezeClone(shadowDryRunProductionConfig);
      const context = freezeClone(validProductionRequestContext);
      const beforeConfig = freezeClone(config);
      const beforeContext = freezeClone(context);
      evaluateProductionRuntimePolicy(config, context);
      assert.deepEqual(config, beforeConfig);
      assert.deepEqual(context, beforeContext);
    });
  });

  describe("Gateway", () => {
    it("27. Gateway never executes legacy generation", async () => {
      let legacyExecuted = false;
      const gateway = new ProductionRuntimeGateway(
        createProductionRuntimeGatewayDependencies({
          config: legacyOnlyProductionConfig,
        })
      );
      const result = await gateway.evaluate(validProductionGatewayInput);
      assert.equal(result.legacy.executedByGateway, false);
      assert.equal(legacyExecuted, false);
    });

    it("28. Gateway returns legacy ownership", async () => {
      const gateway = new ProductionRuntimeGateway(
        createProductionRuntimeGatewayDependencies({
          config: shadowDryRunProductionConfig,
          shadowRuntime: createMockShadow(),
        })
      );
      const result = await gateway.evaluate(validProductionGatewayInput);
      assert.equal(result.legacy.required, true);
      assert.equal(result.legacy.owner, "existing_legacy_pipeline");
      assert.equal(result.decision.userVisibleOwner, "legacy");
    });

    it("29. No-shadow policy performs zero Shadow calls", async () => {
      const mock = createMockShadow();
      const gateway = new ProductionRuntimeGateway(
        createProductionRuntimeGatewayDependencies({
          config: legacyOnlyProductionConfig,
          shadowRuntime: mock,
        })
      );
      await gateway.evaluate(validProductionGatewayInput);
      assert.equal(mock.calls.length, 0);
    });

    it("30. Selected Shadow performs exactly one call", async () => {
      const mock = createMockShadow();
      const gateway = new ProductionRuntimeGateway(
        createProductionRuntimeGatewayDependencies({
          config: fullSamplingProductionConfig,
          shadowRuntime: mock,
        })
      );
      await gateway.evaluate(validProductionGatewayInput);
      assert.equal(mock.calls.length, 1);
    });

    it("31. Gateway forces runtime_only Shadow mode", async () => {
      const mock = createMockShadow();
      const gateway = new ProductionRuntimeGateway(
        createProductionRuntimeGatewayDependencies({
          config: fullSamplingProductionConfig,
          shadowRuntime: mock,
        })
      );
      await gateway.evaluate(validProductionGatewayInput);
      assert.equal(mock.calls[0]?.mode, "runtime_only");
    });

    it("32. transport mock mode is rejected", async () => {
      const mock = createMockShadow();
      const gateway = new ProductionRuntimeGateway(
        createProductionRuntimeGatewayDependencies({
          config: fullSamplingProductionConfig,
          shadowRuntime: mock,
        })
      );
      const input: ProductionGatewayInput = {
        requestContext: { ...validProductionRequestContext },
        shadowRuntimeInput: {
          mode: "runtime_with_transport_mock",
          runtimeInput: validProductionGatewayInput.shadowRuntimeInput
            ?.runtimeInput,
        },
      };
      const result = await gateway.evaluate(input);
      assert.equal(mock.calls.length, 0);
      assert.equal(result.shadow.executed, false);
      assert.equal(result.success, true);
      assert.equal(result.legacy.required, true);
    });

    it("33. Missing Shadow dependency fails open", async () => {
      const gateway = new ProductionRuntimeGateway(
        createProductionRuntimeGatewayDependencies({
          config: fullSamplingProductionConfig,
        })
      );
      const result = await gateway.evaluate(validProductionGatewayInput);
      assert.equal(result.success, true);
      assert.equal(result.shadow.requested, true);
      assert.equal(result.shadow.executed, false);
      assert.equal(result.legacy.required, true);
      assert.equal(result.decision.userVisibleOwner, "legacy");
    });

    it("34. Shadow timeout fails open", async () => {
      const mock = createMockShadow({ delayMs: 250 });
      const gateway = new ProductionRuntimeGateway(
        createProductionRuntimeGatewayDependencies({
          config: { ...fullSamplingProductionConfig, shadowTimeoutMs: 50 },
          shadowRuntime: mock,
        })
      );
      const result = await gateway.evaluate(validProductionGatewayInput);
      assert.equal(result.success, true);
      assert.equal(result.shadow.executed, false);
      assert.equal(result.legacy.required, true);
      assert.ok(result.warnings.length > 0);
    });

    it("35. Shadow exception fails open", async () => {
      const mock = createMockShadow({ throwError: true });
      const gateway = new ProductionRuntimeGateway(
        createProductionRuntimeGatewayDependencies({
          config: fullSamplingProductionConfig,
          shadowRuntime: mock,
        })
      );
      const result = await gateway.evaluate(validProductionGatewayInput);
      assert.equal(result.success, true);
      assert.equal(result.legacy.required, true);
      assert.equal(result.shadow.success, false);
      assert.equal(JSON.stringify(result).includes("mock shadow boom"), false);
    });

    it("36. Shadow failure does not block legacy", async () => {
      const mock = createMockShadow({
        result: failedShadowDryRunResultFixture,
      });
      const gateway = new ProductionRuntimeGateway(
        createProductionRuntimeGatewayDependencies({
          config: fullSamplingProductionConfig,
          shadowRuntime: mock,
        })
      );
      const result = await gateway.evaluate(validProductionGatewayInput);
      assert.equal(result.success, true);
      assert.equal(result.legacy.required, true);
      assert.equal(result.decision.userVisibleOwner, "legacy");
      assert.equal(result.shadow.success, false);
    });

    it("37. Kill switch performs zero Shadow calls", async () => {
      const mock = createMockShadow();
      const gateway = new ProductionRuntimeGateway(
        createProductionRuntimeGatewayDependencies({
          config: killSwitchProductionConfig,
          shadowRuntime: mock,
        })
      );
      await gateway.evaluate(validProductionGatewayInput);
      assert.equal(mock.calls.length, 0);
    });

    it("38. Gateway performs no retry loop", async () => {
      const mock = createMockShadow({
        result: failedShadowDryRunResultFixture,
      });
      const gateway = new ProductionRuntimeGateway(
        createProductionRuntimeGatewayDependencies({
          config: fullSamplingProductionConfig,
          shadowRuntime: mock,
        })
      );
      await gateway.evaluate(validProductionGatewayInput);
      assert.equal(mock.calls.length, 1);
    });

    it("39. Gateway performs no transport call", async () => {
      const sources = readProductionSources();
      assert.equal(sources.includes("ReplicateTransportAdapter"), false);
      assert.equal(/\bfetch\s*\(/.test(sources), false);
      const mock = createMockShadow();
      const gateway = new ProductionRuntimeGateway(
        createProductionRuntimeGatewayDependencies({
          config: fullSamplingProductionConfig,
          shadowRuntime: mock,
        })
      );
      const result = await gateway.evaluate(validProductionGatewayInput);
      assert.equal(result.decision.v2ProviderTrafficAllowed, false);
      assert.equal(mock.calls[0]?.mode, "runtime_only");
    });

    it("40. Gateway does not mutate input", async () => {
      const input = freezeClone(validProductionGatewayInput);
      const before = freezeClone(input);
      const gateway = new ProductionRuntimeGateway(
        createProductionRuntimeGatewayDependencies({
          config: fullSamplingProductionConfig,
          shadowRuntime: createMockShadow(),
        })
      );
      await gateway.evaluate(input);
      assert.deepEqual(input, before);
    });

    it("41. Gateway result is JSON serializable", async () => {
      const gateway = new ProductionRuntimeGateway(
        createProductionRuntimeGatewayDependencies({
          config: fullSamplingProductionConfig,
          shadowRuntime: createMockShadow(),
        })
      );
      const result = await gateway.evaluate(validProductionGatewayInput);
      const roundTrip = JSON.parse(JSON.stringify(result));
      assert.deepEqual(roundTrip, JSON.parse(JSON.stringify(result)));
    });
  });

  describe("Telemetry", () => {
    it("42. Safe Shadow metrics project correctly", () => {
      const telemetry = projectProductionTelemetry(
        safeShadowDryRunResultFixture
      );
      assert.equal(telemetry.schemaVersion, 1);
      assert.equal(
        telemetry.productionRulesVersion,
        PRODUCTION_RUNTIME_RULES_VERSION
      );
      assert.equal(telemetry.runtimeMode, "dry_run");
      assert.equal(telemetry.stageCount, 5);
      assert.equal(telemetry.flags.shadowExecuted, true);
      assert.equal(telemetry.flags.shadowSucceeded, true);
    });

    it("43. Raw Shadow result is not returned", async () => {
      const gateway = new ProductionRuntimeGateway(
        createProductionRuntimeGatewayDependencies({
          config: fullSamplingProductionConfig,
          shadowRuntime: createMockShadow(),
        })
      );
      const result = await gateway.evaluate(validProductionGatewayInput);
      const json = JSON.stringify(result);
      assert.equal(json.includes('"replay"'), false);
      assert.equal(json.includes("stageDurations"), false);
      assert.equal(result.shadow.telemetry != null, true);
    });

    it("44. Replay is not returned", () => {
      const telemetry = projectProductionTelemetry(
        safeShadowDryRunResultFixture
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(telemetry, "replay"),
        false
      );
      assert.equal(JSON.stringify(telemetry).includes("shadow-trace"), false);
    });

    it("45. Trace ID is not returned", () => {
      const telemetry = projectProductionTelemetry(
        safeShadowDryRunResultFixture
      );
      assert.equal(JSON.stringify(telemetry).includes("traceId"), false);
      assert.equal(
        JSON.stringify(telemetry).includes("shadow-trace-fixture"),
        false
      );
    });

    it("46. Stage names are not retained if contract does not require them", () => {
      const telemetry = projectProductionTelemetry(
        safeShadowDryRunResultFixture
      );
      const json = JSON.stringify(telemetry);
      assert.equal(json.includes("validate_input"), false);
      assert.equal(json.includes("transformation_engine"), false);
      assert.equal(json.includes("stageDurations"), false);
    });

    it("47. Durations are bucketed", () => {
      const telemetry = projectProductionTelemetry(
        safeShadowDryRunResultFixture
      );
      const sum =
        telemetry.stageDurationBuckets.under100ms +
        telemetry.stageDurationBuckets.from100To499ms +
        telemetry.stageDurationBuckets.from500To999ms +
        telemetry.stageDurationBuckets.atLeast1000ms;
      assert.equal(sum, 5);
      assert.equal(telemetry.stageDurationBuckets.under100ms, 5);
    });

    it("48. Negative durations are clamped", () => {
      const shadow: ShadowRuntimeResult = structuredClone(
        safeShadowDryRunResultFixture
      );
      shadow.metrics.runtimeDurationMs = -50;
      shadow.metrics.stageDurations = [
        { stage: "validate_input", durationMs: -10 },
      ];
      shadow.metrics.stageCount = 1;
      const telemetry = projectProductionTelemetry(shadow);
      assert.equal(telemetry.totalDurationMs, 0);
      assert.equal(telemetry.stageDurationBuckets.under100ms, 1);
    });

    it("49. URLs are rejected", () => {
      const bad: ProductionTelemetry = {
        ...projectProductionTelemetry(safeShadowDryRunResultFixture),
        runtimeRulesVersion: "https://evil.example/v1",
      };
      assert.equal(validateProductionTelemetry(bad).valid, false);
    });

    it("50. Base64 is rejected", () => {
      const bad: ProductionTelemetry = {
        ...projectProductionTelemetry(safeShadowDryRunResultFixture),
        shadowRulesVersion:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
      };
      assert.equal(validateProductionTelemetry(bad).valid, false);
    });

    it("51. Authorization is rejected", () => {
      const bad: ProductionTelemetry = {
        ...projectProductionTelemetry(safeShadowDryRunResultFixture),
        runtimeRulesVersion: "Authorization Bearer abc",
      };
      assert.equal(validateProductionTelemetry(bad).valid, false);
    });

    it("52. Token-like values are rejected", () => {
      const bad: ProductionTelemetry = {
        ...projectProductionTelemetry(safeShadowDryRunResultFixture),
        shadowRulesVersion: "r8_abcdefghijklmnopqrstuvwxyz012345",
      };
      assert.equal(validateProductionTelemetry(bad).valid, false);
    });

    it("53. Prompt-like fields are rejected", () => {
      const bad = {
        ...projectProductionTelemetry(safeShadowDryRunResultFixture),
        prompt: "do a transformation",
      } as ProductionTelemetry & { prompt: string };
      assert.equal(validateProductionTelemetry(bad).valid, false);
    });

    it("54. Health fields are rejected", () => {
      const bad = {
        ...projectProductionTelemetry(safeShadowDryRunResultFixture),
        health: { steps: 1000 },
      } as ProductionTelemetry & { health: { steps: number } };
      assert.equal(validateProductionTelemetry(bad).valid, false);
    });

    it("55. Telemetry projection is deterministic", () => {
      const a = projectProductionTelemetry(safeShadowDryRunResultFixture);
      const b = projectProductionTelemetry(safeShadowDryRunResultFixture);
      assert.deepEqual(a, b);
    });

    it("56. Projection does not mutate Shadow result", () => {
      const shadow = freezeClone(safeShadowDryRunResultFixture);
      const before = freezeClone(shadow);
      projectProductionTelemetry(shadow);
      assert.deepEqual(shadow, before);
    });
  });

  describe("Sanitization", () => {
    function safeGatewayResult(): ProductionGatewayResult {
      return {
        success: true,
        decision: evaluateProductionRuntimePolicy(
          fullSamplingProductionConfig,
          validProductionRequestContext
        ),
        legacy: {
          required: true,
          executedByGateway: false,
          owner: "existing_legacy_pipeline",
        },
        shadow: {
          requested: true,
          executed: true,
          success: true,
          terminalOutcome: "dry_run_complete",
          telemetry: projectProductionTelemetry(safeShadowDryRunResultFixture),
        },
        warnings: [],
        errors: [],
      };
    }

    it("57. Safe gateway result remains equivalent", () => {
      const result = safeGatewayResult();
      const sanitized = sanitizeProductionGatewayResult(result);
      assert.equal(sanitized.success, result.success);
      assert.equal(sanitized.decision.legacyRequired, true);
      assert.deepEqual(
        sanitized.shadow.telemetry,
        result.shadow.telemetry
      );
    });

    it("58. Nested URL is redacted", () => {
      const result = safeGatewayResult();
      result.warnings.push("see https://evil.example/x");
      const sanitized = sanitizeProductionGatewayResult(result);
      assert.ok(
        sanitized.warnings.some((w) => w === REDACTED_PRODUCTION_CONTENT)
      );
      assert.equal(JSON.stringify(sanitized).includes("https://evil"), false);
    });

    it("59. Token is redacted", () => {
      const result = safeGatewayResult();
      result.errors.push("r8_abcdefghijklmnopqrstuvwxyz012345");
      const sanitized = sanitizeProductionGatewayResult(result);
      assert.ok(
        sanitized.errors.some((e) => e === REDACTED_PRODUCTION_CONTENT)
      );
      assert.equal(JSON.stringify(sanitized).includes("r8_"), false);
    });

    it("60. Original result is not mutated", () => {
      const result = safeGatewayResult();
      result.warnings.push("https://evil.example/y");
      const before = freezeClone(result);
      sanitizeProductionGatewayResult(result);
      assert.deepEqual(result, before);
    });

    it("61. Sanitization is idempotent", () => {
      const result = safeGatewayResult();
      result.warnings.push("https://evil.example/z");
      const once = sanitizeProductionGatewayResult(result);
      const twice = sanitizeProductionGatewayResult(once);
      assert.deepEqual(once, twice);
    });

    it("62. Legacy ownership survives sanitization", () => {
      const result = safeGatewayResult();
      result.warnings.push("https://evil.example/leg");
      const sanitized = sanitizeProductionGatewayResult(result);
      assert.equal(sanitized.legacy.required, true);
      assert.equal(sanitized.legacy.executedByGateway, false);
      assert.equal(sanitized.legacy.owner, "existing_legacy_pipeline");
      assert.equal(sanitized.decision.userVisibleOwner, "legacy");
      assert.equal(sanitized.decision.legacyRequired, true);
    });

    it("63. v2ProviderTrafficAllowed remains false", () => {
      const result = safeGatewayResult();
      result.warnings.push("Bearer token");
      const sanitized = sanitizeProductionGatewayResult(result);
      assert.equal(sanitized.decision.v2ProviderTrafficAllowed, false);
    });

    it("64. Unsafe telemetry is removed", () => {
      const result = safeGatewayResult();
      result.shadow.telemetry = {
        ...projectProductionTelemetry(unsafeShadowResultFixture),
        runtimeRulesVersion: "https://unsafe.example/runtime",
      };
      const sanitized = sanitizeProductionGatewayResult(result);
      assert.equal(sanitized.shadow.telemetry, null);
    });

    it("65. Safe warning is added once", () => {
      const result = safeGatewayResult();
      result.warnings.push("https://evil.example/once");
      const once = sanitizeProductionGatewayResult(result);
      const twice = sanitizeProductionGatewayResult(once);
      const count = twice.warnings.filter(
        (w) => w === PRODUCTION_FORBIDDEN_CONTENT_WARNING
      ).length;
      assert.equal(count, 1);
    });
  });

  describe("Architecture", () => {
    it("66. Production source contains no fetch", () => {
      const sources = readProductionSources();
      assert.equal(/\bfetch\s*\(/.test(sources), false);
      assert.equal(sources.includes("globalThis.fetch"), false);
    });

    it("67. Production source does not import lib/replicate.js", () => {
      const sources = readProductionSources();
      assert.equal(sources.includes("lib/replicate"), false);
      assert.equal(sources.includes("visuellPrompt"), false);
    });

    it("68. Production source does not import UI", () => {
      const sources = readProductionSources();
      assert.equal(/from\s+["']react["']/.test(sources), false);
      assert.equal(/from\s+["']react-native["']/.test(sources), false);
      assert.equal(/from\s+["']expo(\/[^"']*)?["']/.test(sources), false);
      assert.equal(/require\(\s*["']expo/.test(sources), false);
      assert.equal(/from\s+["'].*App\.js["']/.test(sources), false);
    });

    it("69. Production source does not import Terra", () => {
      const sources = readProductionSources();
      assert.equal(/from\s+["'][^"']*terra[^"']*["']/i.test(sources), false);
      assert.equal(/require\(\s*["'][^"']*terra[^"']*["']\s*\)/i.test(sources), false);
      assert.equal(/\bimport\s+.*\bterra\b/i.test(sources), false);
    });

    it("70. Production source does not read REPLICATE_API_TOKEN", () => {
      const sources = readProductionSources();
      assert.equal(
        /process\.env\.REPLICATE_API_TOKEN/.test(sources),
        false
      );
      assert.equal(
        /env\s*\[\s*["']REPLICATE_API_TOKEN["']\s*\]/.test(sources),
        false
      );
    });

    it("71. Production source does not construct ReplicateTransportAdapter", () => {
      const sources = readProductionSources();
      assert.equal(sources.includes("ReplicateTransportAdapter"), false);
      assert.equal(sources.includes("new Replicate"), false);
    });

    it("72. Production source does not alter TransformationPlan", () => {
      const sources = readProductionSources();
      assert.equal(sources.includes("TransformationEngine"), false);
      assert.equal(/mutate.*TransformationPlan/i.test(sources), false);
    });

    it("73. Production source does not alter RenderPlan", () => {
      const sources = readProductionSources();
      assert.equal(sources.includes("buildRenderPlan"), false);
      assert.equal(sources.includes("RenderPlanBuilder"), false);
    });

    it("74. No production route was modified", () => {
      const route = readFileSync(
        join(repoRoot, "api", "generate-future-you.js"),
        "utf8"
      );
      assert.equal(route.includes("ProductionRuntime"), false);
      assert.equal(route.includes("src/ai/production"), false);
      const sources = readProductionSources();
      assert.equal(sources.includes("generate-future-you"), false);
      assert.equal(sources.includes("generateWithReplicate"), false);
    });

    it("75. Existing Shadow tests pass", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      assert.ok(pkg.scripts["test:ai"].includes("shadowRuntime.test.ts"));
    });

    it("76. Existing Runtime tests pass", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      assert.ok(pkg.scripts["test:ai"].includes("aiOsRuntime.test.ts"));
    });

    it("77. Existing transport tests pass", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      assert.ok(
        pkg.scripts["test:ai"].includes("replicateTransportAdapter.test.ts")
      );
    });

    it("78. Existing AI harness passes", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      assert.ok(typeof pkg.scripts["harness:ai"] === "string");
      assert.ok(pkg.scripts["harness:ai"].includes("run-ai-os-v2-harness"));
    });

    it("79. Full GitHub AI Quality Gate commands remain valid", () => {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      assert.ok(pkg.scripts.typecheck.includes("tsc"));
      assert.ok(pkg.scripts["test:ai"].includes("productionRuntimeGateway.test.ts"));
      assert.ok(typeof pkg.scripts["harness:ai"] === "string");
    });
  });
});
