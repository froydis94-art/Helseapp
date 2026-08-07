/**
 * Patch 022E-E — Intelligent Flux Routing for Body Simulator Live Preview.
 *
 * No real network. No paid provider calls.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  prepareLiveFuturePreview,
  runLiveFuturePreview,
  LiveFuturePreviewError,
} from "../body-simulator";

const requireFromTest = createRequire(import.meta.url);
const replicate = requireFromTest("../../../lib/replicate.js") as {
  buildFluxAttemptPlan: (args: Record<string, unknown>) => {
    preferMax: boolean;
    highE005Risk: boolean;
    skipSiblingPremium: boolean;
    primaryLabel: string;
    routingReason: string;
    attempts: Array<{ model: string; label: string }>;
  };
  runFluxKontextAnatomicalCascade: (args: Record<string, unknown>) => Promise<{
    imageUrl: string;
    model: string;
    attempt?: string;
    providerRequestCount?: number;
    providerFallbackUsed?: boolean;
    providerSuccessfulModel?: string | null;
    providerAttemptPlan?: string[];
    providerAttempts?: Array<{
      label: string;
      outcome: string;
      promptHash?: string | null;
    }>;
    providerRoutingReason?: string;
    promptHash?: string | null;
  }>;
  needsMaxEdit: (args: Record<string, unknown>) => boolean;
  isHighE005Risk: (args: Record<string, unknown>) => boolean;
  DEFAULT_MODEL: string;
  SECONDARY_MODEL: string;
  TERTIARY_MODEL: string;
};

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

const JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";
const JPEG_DATA_URI = `data:image/jpeg;base64,${JPEG_B64}`;

const OWNER_DEMANDING = {
  bfNow: 22,
  bfGoal: 12,
  fat: "decrease",
  intensity: "strong",
  zones: ["abs", "core"],
  horizon: "12m",
};

const MILD = {
  bfNow: 22,
  bfGoal: 21,
  fat: "decrease",
  intensity: "moderate",
  zones: ["abs"],
  horizon: "12w",
};

describe("PATCH_022E_E Intelligent Flux Routing", () => {
  it("1. Regression evidence: former live helper was Pro-once; legacy had cascade", () => {
    const once = read("lib/replicate.js");
    assert.match(once, /async function runFluxKontextProOnce/);
    assert.match(once, /No cascade, no retry/);
    assert.match(once, /async function generateWithReplicate/);
    assert.match(once, /function needsMaxEdit/);
    assert.match(once, /function isHighE005Risk/);
    assert.match(once, /function buildFluxAttemptPlan/);
    assert.match(once, /async function runFluxKontextAnatomicalCascade/);
  });

  it("2–4. Owner fixture 22→12 strong 12m abs: needsMaxEdit + highE005 + Max first, Pro skipped", () => {
    assert.equal(replicate.needsMaxEdit(OWNER_DEMANDING), true);
    assert.equal(replicate.isHighE005Risk(OWNER_DEMANDING), true);
    const plan = replicate.buildFluxAttemptPlan(OWNER_DEMANDING);
    assert.equal(plan.preferMax, true);
    assert.equal(plan.highE005Risk, true);
    assert.equal(plan.skipSiblingPremium, true);
    assert.equal(plan.routingReason, "demanding_high_e005_risk");
    assert.equal(plan.attempts[0].label, "flux-max");
    assert.equal(plan.attempts[0].model, replicate.SECONDARY_MODEL);
    assert.deepEqual(
      plan.attempts.map((a) => a.label),
      ["flux-max", "flux-dev"]
    );
    assert.equal(
      plan.attempts.some((a) => a.label === "flux-pro"),
      false
    );
  });

  it("5. Mild 22→21 moderate 3m: Pro first", () => {
    const plan = replicate.buildFluxAttemptPlan(MILD);
    assert.equal(plan.preferMax, false);
    assert.equal(plan.highE005Risk, false);
    assert.equal(plan.routingReason, "mild");
    assert.equal(plan.attempts[0].label, "flux-pro");
    assert.equal(plan.attempts[0].model, replicate.DEFAULT_MODEL);
    assert.deepEqual(
      plan.attempts.map((a) => a.label),
      ["flux-pro", "flux-max", "flux-dev"]
    );
  });

  it("6. Demanding without high E005 risk: Max → Pro → Dev", () => {
    const plan = replicate.buildFluxAttemptPlan({
      bfNow: 22,
      bfGoal: 19,
      fat: "decrease",
      intensity: "strong",
      zones: ["abs"],
      horizon: "12w",
    });
    assert.equal(plan.preferMax, true);
    assert.equal(plan.highE005Risk, false);
    assert.equal(plan.routingReason, "demanding");
    assert.deepEqual(
      plan.attempts.map((a) => a.label),
      ["flux-max", "flux-pro", "flux-dev"]
    );
  });

  it("7. Max E005 → Dev success (2 calls, no Pro, same prompt hash, fallbackUsed)", async () => {
    const calls: Array<{ model: string; label: string; prompt: string }> = [];
    const prompt = "canonical anatomical conditioned prompt for hash test";
    const result = await replicate.runFluxKontextAnatomicalCascade({
      imageDataUri: JPEG_DATA_URI,
      prompt,
      token: "r8_test_not_real",
      ...OWNER_DEMANDING,
      runAttempt: async (args: {
        model: string;
        label: string;
        prompt?: string;
      }) => {
        calls.push({
          model: args.model,
          label: args.label,
          prompt: String(args.prompt || prompt),
        });
        if (args.label === "flux-max") {
          const err = new Error(
            "The input or output was flagged as sensitive. Please try again with different inputs. (E005)"
          ) as Error & { status: number };
          err.status = 422;
          throw err;
        }
        return {
          imageUrl: "https://cdn.example.com/dev-ok.png",
          model: replicate.TERTIARY_MODEL,
          inputFieldNames: [
            "prompt",
            "input_image",
            "aspect_ratio",
            "output_format",
            "safety_tolerance",
            "prompt_upsampling",
          ],
        };
      },
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].label, "flux-max");
    assert.equal(calls[1].label, "flux-dev");
    assert.equal(
      calls.some((c) => c.label === "flux-pro"),
      false
    );
    assert.equal(result.providerRequestCount, 2);
    assert.equal(result.providerFallbackUsed, true);
    assert.equal(result.providerSuccessfulModel, replicate.TERTIARY_MODEL);
    assert.equal(result.providerRoutingReason, "demanding_high_e005_risk");
    const hash = createHash("sha256").update(prompt, "utf8").digest("hex");
    assert.equal(result.promptHash, hash);
    assert.ok(
      result.providerAttempts?.every((a) => a.promptHash === hash)
    );
    assert.equal(calls[0].prompt, calls[1].prompt);
  });

  it("8. Max success → Dev never called; requestCount=1", async () => {
    const labels: string[] = [];
    const result = await replicate.runFluxKontextAnatomicalCascade({
      imageDataUri: JPEG_DATA_URI,
      prompt: "same anatomical prompt",
      token: "r8_test_not_real",
      ...OWNER_DEMANDING,
      runAttempt: async (args: { label: string; model: string }) => {
        labels.push(args.label);
        return {
          imageUrl: "https://cdn.example.com/max-ok.png",
          model: args.model,
        };
      },
    });
    assert.deepEqual(labels, ["flux-max"]);
    assert.equal(result.providerRequestCount, 1);
    assert.equal(result.providerFallbackUsed, false);
    assert.equal(result.attempt, "flux-max");
  });

  it("9. Mild Pro success = 1 paid request", async () => {
    const labels: string[] = [];
    const result = await replicate.runFluxKontextAnatomicalCascade({
      imageDataUri: JPEG_DATA_URI,
      prompt: "mild anatomical prompt",
      token: "r8_test_not_real",
      ...MILD,
      runAttempt: async (args: { label: string; model: string }) => {
        labels.push(args.label);
        return {
          imageUrl: "https://cdn.example.com/pro-ok.png",
          model: args.model,
        };
      },
    });
    assert.deepEqual(labels, ["flux-pro"]);
    assert.equal(result.providerRequestCount, 1);
    assert.equal(result.providerFallbackUsed, false);
  });

  it("10. All attempts fail → bounded structured failure", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        replicate.runFluxKontextAnatomicalCascade({
          imageDataUri: JPEG_DATA_URI,
          prompt: "fail all",
          token: "r8_test_not_real",
          ...OWNER_DEMANDING,
          runAttempt: async () => {
            calls += 1;
            const err = new Error(
              "The input or output was flagged as sensitive. (E005)"
            ) as Error & { status: number };
            err.status = 422;
            throw err;
          },
        }),
      (err: Error & {
        providerFinalOutcome?: string;
        providerRequestCount?: number;
        providerAttempts?: unknown[];
        status?: number;
      }) => {
        assert.equal(err.providerFinalOutcome, "all_attempts_failed");
        assert.equal(err.providerRequestCount, 2); // max+dev plan
        assert.ok(Array.isArray(err.providerAttempts));
        assert.ok(typeof err.status === "number");
        return true;
      }
    );
    assert.equal(calls, 2);
  });

  it("11. Prompt hash integrity across attempts (demanding Max→Pro→Dev)", async () => {
    const prompt = "identical anatomical intent across models";
    const hashes: Array<string | null | undefined> = [];
    await replicate.runFluxKontextAnatomicalCascade({
      imageDataUri: JPEG_DATA_URI,
      prompt,
      token: "r8_test",
      bfNow: 22,
      bfGoal: 19,
      fat: "decrease",
      intensity: "strong",
      zones: ["abs"],
      horizon: "12w",
      runAttempt: async (args: { label: string; model: string }) => {
        if (args.label !== "flux-dev") {
          const err = new Error("timeout 504") as Error & {
            status: number;
            retriable: boolean;
          };
          err.status = 504;
          err.retriable = true;
          throw err;
        }
        return {
          imageUrl: "https://cdn.example.com/ok.png",
          model: args.model,
        };
      },
    }).then((r) => {
      for (const a of r.providerAttempts || []) hashes.push(a.promptHash);
      assert.equal(new Set(hashes).size, 1);
      assert.equal(
        hashes[0],
        createHash("sha256").update(prompt, "utf8").digest("hex")
      );
    });
  });

  it("12. Anatomical cascade never builds legacy transform prompts", () => {
    const src = read("lib/replicate.js");
    const start = src.indexOf("async function runFluxKontextAnatomicalCascade");
    const end = src.indexOf("async function generateWithReplicate");
    const body = src.slice(start, end);
    assert.equal(/byggVisuellPrompt\s*\(/.test(body), false);
    assert.equal(/composeGoalBrief\s*\(/.test(body), false);
    assert.equal(/promptVariant/.test(body), false);
    assert.match(body, /buildFluxKontextProInput/);
    assert.match(body, /buildFluxAttemptPlan/);
  });

  it("13–15. Live pipeline wires cascade; public usedFallback false; Control Room Flux Routing stage", async () => {
    const result = await runLiveFuturePreview({
      payload: {
        maal: "",
        intensity: "strong",
        horizon: "12m",
        zones: ["abs", "core"],
        fat: "decrease",
        muscle: "toned",
        bfNow: 22,
        bfGoal: 12,
        gender: "female",
      },
      sourceImageDataUri: JPEG_DATA_URI,
      env: {
        BODY_SIMULATOR_LIVE_PREVIEW_ENABLED: "1",
        REPLICATE_API_TOKEN: "r8_test_not_real",
      },
      fluxCascade: async (args) => {
        assert.ok(String(args.prompt || "").length > 20);
        return {
          imageUrl: "https://cdn.example.com/cascade-ok.png",
          model: replicate.SECONDARY_MODEL,
          attempt: "flux-max",
          inputFieldNames: [
            "prompt",
            "input_image",
            "aspect_ratio",
            "output_format",
            "safety_tolerance",
            "prompt_upsampling",
          ],
          providerRoutingStrategy: "flux_ordered_fallback",
          providerRoutingReason: "demanding_high_e005_risk",
          providerAttemptPlan: ["flux-max", "flux-dev"],
          providerAttempts: [
            {
              model: replicate.SECONDARY_MODEL,
              label: "flux-max",
              outcome: "success",
            },
          ],
          providerRequestCount: 1,
          providerFallbackUsed: false,
          providerSuccessfulModel: replicate.SECONDARY_MODEL,
          providerInitialModel: replicate.SECONDARY_MODEL,
          providerFinalOutcome: "success",
        };
      },
    });

    assert.equal(result.usedFallback, false);
    assert.equal(
      result.livePreviewDiagnostics.providerRoutingStrategy,
      "flux_ordered_fallback"
    );
    assert.equal(
      result.livePreviewDiagnostics.providerRoutingReason,
      "demanding_high_e005_risk"
    );
    assert.deepEqual(result.livePreviewDiagnostics.providerAttemptPlan, [
      "flux-max",
      "flux-dev",
    ]);
    const fluxStage = result.liveFuturePreviewTrace.find(
      (s) => s.id === "flux_routing"
    );
    assert.ok(fluxStage);
    assert.equal(fluxStage!.label, "Flux Routing");
    assert.equal(fluxStage!.values.strategy, "flux_ordered_fallback");

    const route = read("api/generate-future-you.js");
    assert.match(route, /fluxCascade:\s*runFluxKontextAnatomicalCascade/);
    assert.equal(/fluxProvider:\s*runFluxKontextProOnce/.test(route), false);
  });

  it("16. Fallback success attribution notes attempt failure + logical success", async () => {
    const result = await runLiveFuturePreview({
      payload: {
        maal: "",
        intensity: "strong",
        horizon: "12m",
        zones: ["abs"],
        fat: "decrease",
        muscle: "toned",
        bfNow: 22,
        bfGoal: 12,
      },
      sourceImageDataUri: JPEG_DATA_URI,
      env: {
        BODY_SIMULATOR_LIVE_PREVIEW_ENABLED: "1",
        REPLICATE_API_TOKEN: "r8_test_not_real",
      },
      fluxCascade: async () => ({
        imageUrl: "https://cdn.example.com/dev-after-max.png",
        model: replicate.TERTIARY_MODEL,
        attempt: "flux-dev",
        inputFieldNames: [
          "prompt",
          "input_image",
          "aspect_ratio",
          "output_format",
          "safety_tolerance",
          "prompt_upsampling",
        ],
        providerRoutingStrategy: "flux_ordered_fallback",
        providerRoutingReason: "demanding_high_e005_risk",
        providerAttemptPlan: ["flux-max", "flux-dev"],
        providerAttempts: [
          {
            model: replicate.SECONDARY_MODEL,
            label: "flux-max",
            outcome: "failed",
            eligibleFailure: true,
          },
          {
            model: replicate.TERTIARY_MODEL,
            label: "flux-dev",
            outcome: "success",
          },
        ],
        providerRequestCount: 2,
        providerFallbackUsed: true,
        providerSuccessfulModel: replicate.TERTIARY_MODEL,
        providerInitialModel: replicate.SECONDARY_MODEL,
        providerFinalOutcome: "success",
      }),
    });
    assert.equal(result.usedFallback, false);
    assert.equal(result.livePreviewDiagnostics.providerFallbackUsed, true);
    assert.equal(result.providerRequestCount, 2);
    const reasons =
      result.livePreviewDiagnostics.providerSafetyAttribution?.attribution
        .reasons || [];
    assert.ok(
      reasons.includes("primary_attempt_failed_eligible_fallback_succeeded") ||
        reasons.includes("live_path_flux_ordered_fallback_logical_success")
    );
  });

  it("17. Cascade all-fail surfaces live_preview_provider_failed with attempt count", async () => {
    await assert.rejects(
      () =>
        runLiveFuturePreview({
          payload: {
            maal: "",
            intensity: "strong",
            horizon: "12m",
            zones: ["abs"],
            fat: "decrease",
            bfNow: 22,
            bfGoal: 12,
          },
          sourceImageDataUri: JPEG_DATA_URI,
          env: {
            BODY_SIMULATOR_LIVE_PREVIEW_ENABLED: "1",
            REPLICATE_API_TOKEN: "r8_test_not_real",
          },
          fluxCascade: async () => {
            const err = new Error("All flux attempts failed") as Error & {
              status: number;
              providerRequestCount: number;
              providerFinalOutcome: string;
              providerAttempts: Array<{ label: string; outcome: string }>;
              providerAttemptPlan: string[];
              providerRoutingReason: string;
            };
            err.status = 502;
            err.providerRequestCount = 2;
            err.providerFinalOutcome = "all_attempts_failed";
            err.providerAttemptPlan = ["flux-max", "flux-dev"];
            err.providerRoutingReason = "demanding_high_e005_risk";
            err.providerAttempts = [
              { label: "flux-max", outcome: "failed" },
              { label: "flux-dev", outcome: "failed" },
            ];
            throw err;
          },
        }),
      (err: unknown) => {
        assert.ok(err instanceof LiveFuturePreviewError);
        assert.equal(err.errorClass, "live_preview_provider_failed");
        assert.equal(err.providerCalls, 2);
        assert.equal(
          err.diagnostics?.providerFinalOutcome,
          "all_attempts_failed"
        );
        return true;
      }
    );
  });

  it("18. Neutral conditioner + anatomical path preserved (no SDXL on live cascade)", () => {
    const prep = prepareLiveFuturePreview(
      {
        maal: "",
        intensity: "strong",
        horizon: "12m",
        zones: ["abs", "core"],
        fat: "decrease",
        bfNow: 22,
        bfGoal: 12,
      },
      { nowMs: 1_700_000_200_000, simulationId: "lfp022eeroute01" }
    );
    assert.equal(prep.diagnostics.bodySimulatorExecuted, true);
    assert.equal(prep.diagnostics.anatomicalEngineExecuted, true);
    assert.equal(prep.canonical.source, "body_simulator_v1");

    const cascade = read("lib/replicate.js");
    const start = cascade.indexOf("async function runFluxKontextAnatomicalCascade");
    const end = cascade.indexOf("async function generateWithReplicate");
    assert.equal(/sdxl/i.test(cascade.slice(start, end)), false);

    const docs = read("docs/CTO/22E_ANATOMICAL_LIVE_PREVIEW_INTEGRATION.md");
    assert.match(docs, /Patch 022E-E/);
    const cap = read("docs/CTO/22E_D_PROVIDER_CAPABILITY_EVALUATION.md");
    assert.match(cap, /IMPLEMENTED by 022E-E|IMPLEMENTED by Patch 022E-E/i);
  });

  it("19. safety_tolerance unchanged; no moderation bypass", () => {
    const replicateSrc = read("lib/replicate.js");
    assert.match(replicateSrc, /safety_tolerance:\s*2/);
    assert.equal(/safety_tolerance\s*[:=]\s*[3-9]/.test(replicateSrc), false);
    const pipeline = read("src/ai/body-simulator/LiveFuturePreviewPipeline.ts");
    assert.equal(
      /moderation bypass|evade.*e005|disable_safety_checker/i.test(pipeline),
      false
    );
  });

  it("20. Shared planner used by legacy generateWithReplicate", () => {
    const src = read("lib/replicate.js");
    const legacyStart = src.indexOf("async function generateWithReplicate");
    const legacyBody = src.slice(legacyStart);
    assert.match(legacyBody, /buildFluxAttemptPlan\s*\(/);
    assert.match(legacyBody, /flux-dev-strong/);
  });
});
