/**
 * Patch 022E-C — Provider Safety Attribution Diagnostic & bounded repair tests (1–27).
 *
 * No real network. No paid provider calls.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BODY_SIMULATOR_LIVE_PREVIEW_ENV,
  CLOTHING_COVERAGE_PRESERVATION_PHRASE,
  PROVIDER_SAFETY_ATTRIBUTION_SCHEMA_VERSION,
  buildProviderSafetyAttributionDiagnostic,
  conditionAnatomicalProviderPrompt,
  hashProviderPromptSafe,
  inspectSourceImageDataUriSafe,
  isBodySimulatorLivePreviewEnabled,
  isE005SensitiveProviderMessage,
  prepareLiveFuturePreview,
  projectProviderSafetyAttributionForControlRoom,
  runLiveFuturePreview,
  serializeImageDataUriLikeLegacy,
  sha256FileBytes,
} from "../body-simulator";
import type {
  ReplicateTransportAdapter,
  ReplicateTransportInput,
  ReplicateTransportResult,
} from "../transport";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");

const RULES_HASH = createHash("sha256")
  .update(readFileSync(join(repoRoot, "src/ai/body-simulator/BodySimulatorRules.ts")))
  .digest("hex");
const ANAT_RULES_HASH = createHash("sha256")
  .update(
    readFileSync(
      join(repoRoot, "src/ai/body-simulator/AnatomicalTransformationRules.ts")
    )
  )
  .digest("hex");

const JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";
const JPEG_DATA_URI = `data:image/jpeg;base64,${JPEG_B64}`;

function casePayload(overrides: Record<string, unknown> = {}) {
  return {
    maal: "",
    intensity: "strong",
    horizon: "12m",
    zones: ["abs", "thighs"],
    fat: "decrease",
    muscle: "toned",
    bfNow: 22,
    bfGoal: 12,
    gender: "female",
    heightCm: 170,
    weightKg: 70,
    ...overrides,
  };
}

function mockTransport(
  result: ReplicateTransportResult,
  calls: { count: number; inputs: ReplicateTransportInput[] }
): ReplicateTransportAdapter {
  return {
    id: "replicate-transport-v1",
    provider: "replicate",
    async generate(input: ReplicateTransportInput) {
      calls.count += 1;
      calls.inputs.push(input);
      return structuredClone(result);
    },
  } as ReplicateTransportAdapter;
}

function successTransportResult(): ReplicateTransportResult {
  return {
    success: true,
    provider: "replicate",
    predictionId: "pred-022ec-test",
    model: "black-forest-labs/flux-kontext-pro",
    status: "succeeded",
    imageUrl: "https://cdn.example.com/out/live-preview.png",
    generationTimeMs: 12,
    warnings: [],
    metadata: {
      traceId: "trace-022ec",
      formatterName: "FluxFormatter",
      formatterVersion: "1.0",
      pollingAttempts: 1,
      providerStatus: "succeeded",
    },
  };
}

function e005TransportResult(): ReplicateTransportResult {
  return {
    success: false,
    provider: "replicate",
    predictionId: "pred-022ec-e005",
    model: "black-forest-labs/flux-kontext-pro",
    status: "failed",
    imageUrl: null,
    generationTimeMs: 8,
    warnings: [],
    error: {
      code: "provider_failed",
      message:
        "The input or output was flagged as sensitive. Please try again with different inputs. (E005)",
      retryable: false,
    },
    metadata: {
      traceId: "trace-022ec-e005",
      pollingAttempts: 1,
      providerStatus: "failed",
    },
  };
}

describe("providerSafetyAttribution — PATCH_022E_C", () => {
  it("1–3. Live anatomical path still uses Body Simulator + Anatomical + BF delta", async () => {
    const prep = prepareLiveFuturePreview(casePayload(), {
      nowMs: 1_700_000_100_000,
      simulationId: "lfp022eccanon01",
    });
    assert.equal(prep.diagnostics.bodySimulatorExecuted, true);
    assert.equal(prep.diagnostics.anatomicalEngineExecuted, true);
    assert.equal(prep.diagnostics.bodyFat.current, 22);
    assert.equal(prep.diagnostics.bodyFat.target, 12);
    assert.equal(prep.diagnostics.bodyFat.delta, -10);
    assert.ok((prep.diagnostics.appliedAnatomicalRuleIds?.length ?? 0) > 0);
    assert.equal(prep.canonical.source, "body_simulator_v1");
  });

  it("4–6. Provider/model unchanged; moderation not weakened; no safety bypass", async () => {
    const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
    const result = await runLiveFuturePreview({
      payload: casePayload(),
      sourceImageDataUri: JPEG_DATA_URI,
      transportAdapter: mockTransport(successTransportResult(), calls),
      env: { [BODY_SIMULATOR_LIVE_PREVIEW_ENV]: "1" },
    });
    assert.equal(result.model, "black-forest-labs/flux-kontext-pro");
    assert.equal(result.livePreviewDiagnostics.providerModel, "black-forest-labs/flux-kontext-pro");

    const pipeline = readFileSync(
      join(repoRoot, "src/ai/body-simulator/LiveFuturePreviewPipeline.ts"),
      "utf8"
    );
    const conditioner = readFileSync(
      join(repoRoot, "src/ai/body-simulator/NeutralAnatomicalPromptConditioner.ts"),
      "utf8"
    );
    const attribution = readFileSync(
      join(repoRoot, "src/ai/body-simulator/ProviderSafetyAttributionDiagnostic.ts"),
      "utf8"
    );
    assert.equal(/safety_tolerance\s*[:=]\s*[3-9]/.test(pipeline), false);
    assert.equal(/disable_safety_checker|bypass.*moderation|evade.*e005/i.test(pipeline), false);
    assert.equal(/disable_safety_checker|safety bypass|bypass button/i.test(attribution), false);
    assert.equal(/weaken.*moderation|circumvent.*e005/i.test(conditioner), false);
    assert.match(
      readFileSync(join(repoRoot, "public/ai-os-control-room.html"), "utf8"),
      /No safety bypass/
    );
  });

  it("7–8. Ordinary adult underwear not prohibited; no clothing-morality classifier", () => {
    const files = [
      "src/ai/body-simulator/NeutralAnatomicalPromptConditioner.ts",
      "src/ai/body-simulator/ProviderSafetyAttributionDiagnostic.ts",
      "src/ai/body-simulator/LiveFuturePreviewPipeline.ts",
      "src/ai/body-simulator/PublicFutureToBodySimulatorAdapter.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(join(repoRoot, rel), "utf8");
      assert.equal(
        /prohibit.*underwear|ban.*underwear|clothing morality|sexual.?intent classifier|exposure classifier/i.test(
          src
        ),
        false,
        rel
      );
    }
  });

  it("9–12. Legacy image contract comparable; MIME/size safe; no raw image logged", () => {
    const buf = Buffer.from(JPEG_B64, "base64");
    const legacyUri = serializeImageDataUriLikeLegacy(buf, "image/jpeg");
    assert.equal(legacyUri, JPEG_DATA_URI);
    const inspected = inspectSourceImageDataUriSafe(JPEG_DATA_URI);
    assert.equal(inspected.mimeType, "image/jpeg");
    assert.equal(inspected.byteLength, buf.length);
    assert.equal(inspected.serializationMatchesLegacy, true);
    assert.equal(inspected.fieldName, "input_image");
    assert.equal(inspected.dataUriPrefix, "data:image/jpeg;base64,");
    assert.equal(inspected.dataUriPrefix.includes(JPEG_B64), false);

    const attributionSrc = readFileSync(
      join(repoRoot, "src/ai/body-simulator/ProviderSafetyAttributionDiagnostic.ts"),
      "utf8"
    );
    const pipelineSrc = readFileSync(
      join(repoRoot, "src/ai/body-simulator/LiveFuturePreviewPipeline.ts"),
      "utf8"
    );
    assert.equal(/console\.(log|info|warn|error)\([^\)]*sourceImageDataUri/.test(pipelineSrc), false);
    assert.match(attributionSrc, /Never includes raw image|Never returns raw image/i);
  });

  it("13–16. Field parity, conditioning, sensitive lexemes, repetition metrics reported", async () => {
    const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
    const result = await runLiveFuturePreview({
      payload: casePayload(),
      sourceImageDataUri: JPEG_DATA_URI,
      transportAdapter: mockTransport(successTransportResult(), calls),
      env: { [BODY_SIMULATOR_LIVE_PREVIEW_ENV]: "1" },
    });
    const d = result.livePreviewDiagnostics;
    assert.equal(d.neutralPromptConditioningApplied, true);
    assert.equal(d.providerPromptSensitiveLexemeCount, 0);
    assert.ok(Array.isArray(d.providerInputFieldNames));
    assert.ok(d.providerInputFieldNames.includes("input_image"));
    assert.ok(d.providerInputFieldNames.includes("safety_tolerance"));
    assert.ok(d.providerSafetyAttribution);
    assert.equal(
      d.providerSafetyAttribution?.schemaVersion,
      PROVIDER_SAFETY_ATTRIBUTION_SCHEMA_VERSION
    );
    assert.equal(d.providerSafetyAttribution?.requestParity.promptConditioningApplied, true);
    assert.equal(d.providerSafetyAttribution?.promptMetrics.sensitiveLexemes, 0);
    assert.ok(
      typeof d.providerSafetyAttribution?.promptMetrics.preservationSentenceCount ===
        "number"
    );
    assert.ok(
      typeof d.providerSafetyAttribution?.promptMetrics.anatomyInstructionCount ===
        "number"
    );
    assert.ok(d.conditionedPromptHash);
    assert.equal(
      d.conditionedPromptHash,
      hashProviderPromptSafe(calls.inputs[0]?.formattedRequest?.prompt || "")
    );
    const sent = calls.inputs[0]?.formattedRequest?.prompt ?? "";
    assert.match(sent, new RegExp(CLOTHING_COVERAGE_PRESERVATION_PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(/\bcoverage\b/i.test(sent), false);
    assert.equal(/\badult\b/i.test(sent), false);
  });

  it("17–18. Attribution may be indeterminate; never unsupported high certainty on E005", async () => {
    const empty = buildProviderSafetyAttributionDiagnostic({});
    assert.equal(empty.attribution.classification, "indeterminate");
    assert.ok(["low", "medium", "high"].includes(empty.attribution.confidence));

    const e005 = buildProviderSafetyAttributionDiagnostic({
      providerError: {
        code: "provider_prediction_failed",
        category: "provider_prediction_failed",
        httpStatus: 422,
        safeMessage:
          "The input or output was flagged as sensitive. Please try again with different inputs. (E005)",
      },
      sourceImageDataUri: JPEG_DATA_URI,
      providerPrompt: "Preserve the same person. Preserve clothing. Reduce midsection fat.",
      promptConditioningApplied: true,
      model: "black-forest-labs/flux-kontext-pro",
      providerInputFieldNames: [
        "prompt",
        "input_image",
        "aspect_ratio",
        "output_format",
        "safety_tolerance",
        "prompt_upsampling",
      ],
      aspectRatio: "match_input_image",
      outputFormat: "png",
      safetyTolerance: 2,
      imageContractMatchesLegacy: true,
    });
    assert.ok(
      [
        "likely_prompt_image_combination",
        "likely_input_related",
        "likely_output_related",
        "provider_behavior_changed",
        "indeterminate",
      ].includes(e005.attribution.classification)
    );
    // Hard rule: E005 isolation without paid probe must not claim high.
    assert.notEqual(e005.attribution.confidence, "high");
    assert.ok(e005.attribution.reasons.includes("e005_api_message_ambiguous_input_or_output"));
    assert.ok(isE005SensitiveProviderMessage(e005.providerError.safeMessage));
  });

  it("19. Allowed integration defect repaired (adult/coverage meta removed)", async () => {
    const prep = prepareLiveFuturePreview(casePayload(), {
      nowMs: 1_700_000_100_111,
      simulationId: "lfp022ecrepair01",
    });
    const conditioned = conditionAnatomicalProviderPrompt({
      formattedPrompt:
        "Preserve the clothing. Clearly adult subject only. Preserve existing clothing coverage. Apply anatomical subcutaneous fat on abdomen.",
      canonical: prep.canonical,
      anatomicalRules: prep.rules.anatomicalTransformation?.rules ?? [],
    });
    assert.equal(/\badult\b/i.test(conditioned.conditionedPrompt), false);
    assert.equal(/\bcoverage\b/i.test(conditioned.conditionedPrompt), false);
    assert.match(conditioned.conditionedPrompt, /clothing/i);
    assert.equal(CLOTHING_COVERAGE_PRESERVATION_PHRASE.includes("coverage"), false);

    const diag = buildProviderSafetyAttributionDiagnostic({
      providerError: {
        safeMessage: "flagged as sensitive (E005)",
        httpStatus: 422,
        category: "provider_prediction_failed",
        code: "E005",
      },
      sourceImageDataUri: JPEG_DATA_URI,
      providerPrompt: conditioned.conditionedPrompt,
      promptConditioningApplied: true,
      imageContractMatchesLegacy: true,
    });
    assert.ok(
      diag.repairedDefects.includes("removed_provider_facing_adult_status_framing")
    );
    assert.ok(
      diag.repairedDefects.includes("removed_provider_facing_clothing_coverage_meta")
    );
  });

  it("20–21. Canonical physiology + anatomical coefficients unchanged", () => {
    assert.equal(
      sha256FileBytes(
        readFileSync(join(repoRoot, "src/ai/body-simulator/BodySimulatorRules.ts"))
      ),
      RULES_HASH
    );
    assert.equal(
      sha256FileBytes(
        readFileSync(
          join(repoRoot, "src/ai/body-simulator/AnatomicalTransformationRules.ts")
        )
      ),
      ANAT_RULES_HASH
    );
  });

  it("22–24. One provider request; no automatic retry; no automatic fallback", async () => {
    const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
    await assert.rejects(
      () =>
        runLiveFuturePreview({
          payload: casePayload(),
          sourceImageDataUri: JPEG_DATA_URI,
          transportAdapter: mockTransport(e005TransportResult(), calls),
          env: { [BODY_SIMULATOR_LIVE_PREVIEW_ENV]: "1" },
        }),
      (err: unknown) => {
        assert.ok(err && typeof err === "object");
        const e = err as {
          errorClass?: string;
          providerCalls?: number;
          diagnostics?: { providerSafetyAttribution?: { attribution: { classification: string } } };
        };
        assert.equal(e.errorClass, "live_preview_provider_failed");
        assert.equal(e.providerCalls, 1);
        assert.ok(e.diagnostics?.providerSafetyAttribution);
        return true;
      }
    );
    assert.equal(calls.count, 1);

    const pipeline = readFileSync(
      join(repoRoot, "src/ai/body-simulator/LiveFuturePreviewPipeline.ts"),
      "utf8"
    );
    // Behavioral: no auto-retry machinery (comment text may mention fallback).
    assert.equal(/\bautoRetry\b|\bretry_required\b/.test(pipeline), false);
    const route = readFileSync(join(repoRoot, "api/generate-future-you.js"), "utf8");
    assert.match(route, /No silent legacy fallback/);
    // Between live catch and the flag-OFF legacy call there must be no recovery call.
    const catchIdx = route.indexOf("catch (liveError)");
    const legacyIdx = route.lastIndexOf("generateWithReplicate({");
    assert.ok(catchIdx > 0 && legacyIdx > catchIdx);
    const between = route.slice(catchIdx, legacyIdx);
    assert.equal(/generateWithReplicate\s*\(/.test(between), false);
  });

  it("25–26. Feature flag OFF preserves legacy; ON preserves Body Simulator", () => {
    assert.equal(isBodySimulatorLivePreviewEnabled({}), false);
    assert.equal(
      isBodySimulatorLivePreviewEnabled({
        BODY_SIMULATOR_LIVE_PREVIEW_ENABLED: "0",
      }),
      false
    );
    assert.equal(
      isBodySimulatorLivePreviewEnabled({
        [BODY_SIMULATOR_LIVE_PREVIEW_ENV]: "1",
      }),
      true
    );
    const route = readFileSync(join(repoRoot, "api/generate-future-you.js"), "utf8");
    assert.match(route, /generateWithReplicate/);
    assert.match(route, /BODY_SIMULATOR_LIVE_PREVIEW_ENABLED[\s\S]*=== \"1\"/);
    assert.match(route, /providerSafetyAttribution/);
  });

  it("27. Provider errors remain safely classified + Control Room projection safe", async () => {
    const calls = { count: 0, inputs: [] as ReplicateTransportInput[] };
    let caught: unknown = null;
    try {
      await runLiveFuturePreview({
        payload: casePayload(),
        sourceImageDataUri: JPEG_DATA_URI,
        transportAdapter: mockTransport(e005TransportResult(), calls),
        env: { [BODY_SIMULATOR_LIVE_PREVIEW_ENV]: "1" },
      });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught);
    const e = caught as {
      providerDiagnostics?: { providerErrorCategory?: string; providerResponseMessageSafe?: string };
      diagnostics?: { providerSafetyAttribution?: ReturnType<typeof buildProviderSafetyAttributionDiagnostic> };
    };
    assert.equal(
      e.providerDiagnostics?.providerErrorCategory,
      "provider_prediction_failed"
    );
    const safe = e.providerDiagnostics?.providerResponseMessageSafe || "";
    assert.ok(safe.length > 0);
    assert.equal(/r8_|Bearer\s+\S+|data:image\/[^;]+;base64,[A-Za-z0-9+/]{40,}/i.test(safe), false);

    const attr = e.diagnostics?.providerSafetyAttribution;
    assert.ok(attr);
    const projected = projectProviderSafetyAttributionForControlRoom(attr);
    assert.equal(projected.available, true);
    assert.ok(projected.classification);
    assert.equal(String(JSON.stringify(projected)).includes(JPEG_B64), false);

    const html = readFileSync(
      join(repoRoot, "public/ai-os-control-room.html"),
      "utf8"
    );
    assert.match(html, /Provider Safety Attribution/);
    assert.match(html, /providerSafetyAttributionBody/);
  });
});
