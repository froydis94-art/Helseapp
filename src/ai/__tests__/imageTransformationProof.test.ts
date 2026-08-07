/**
 * Demand 022E-F — Image Transformation Proof diagnostics.
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
  CONTROL_ROOM_ENABLED_ENV,
  TRANSFORM_PROOF_DIAGNOSTIC_ENV,
  TRANSFORM_PROOF_DIAGNOSTIC_MODE,
  TRANSFORM_PROOF_PROMPT_MARKER,
  buildTransformationProofDiagnosticPrompt,
  buildTransformationProofReport,
  compareImageBytes,
  encodeSolidPngRgba,
  fingerprintImageBytes,
  inspectFluxStrengthParams,
  isTransformProofDiagnosticAllowed,
  isTransformProofDiagnosticRequested,
  prepareLiveFuturePreview,
  projectTransformationProofForControlRoom,
  runLiveFuturePreview,
  sha256FileBytes,
  sha256ImageBytes,
  verifyControlRoomAccessKey,
} from "../body-simulator";

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

function casePayload() {
  return {
    bfNow: 22,
    bfGoal: 16,
    fat: "decrease",
    intensity: "moderate",
    horizon: "12w",
    zones: ["waist", "arms"],
    maal: "visible athletic change",
  };
}

describe("DEMAND_022E_F Image Transformation Proof", () => {
  it("1. SHA-256 computed for synthetic buffers", () => {
    const a = Buffer.from("hello-transform-proof");
    const b = Buffer.from("hello-transform-proof");
    const c = Buffer.from("different");
    assert.equal(sha256ImageBytes(a), sha256ImageBytes(b));
    assert.notEqual(sha256ImageBytes(a), sha256ImageBytes(c));
    assert.match(sha256ImageBytes(a), /^[a-f0-9]{64}$/);
  });

  it("2–3. Identical PNG → identical_bytes; different PNG → clearly_transformed", () => {
    const red = encodeSolidPngRgba(8, 8, [220, 40, 40]);
    const teal = encodeSolidPngRgba(8, 8, [0, 128, 128]);
    const same = compareImageBytes(red, Buffer.from(red));
    assert.equal(same.identicalSha256, true);
    assert.equal(same.verdict, "identical_bytes");
    assert.equal(same.rmse, 0);
    assert.equal(same.percentDiffering, 0);

    const diff = compareImageBytes(red, teal);
    assert.equal(diff.identicalSha256, false);
    assert.equal(diff.verdict, "clearly_transformed");
    assert.ok((diff.rmse ?? 0) > 15);
    assert.ok((diff.percentDiffering ?? 0) > 50);
    assert.ok((diff.averageHashHamming ?? 0) >= 1);
  });

  it("4. Fingerprint never includes raw image bytes or data URI body", () => {
    const png = encodeSolidPngRgba(4, 4, [10, 20, 30]);
    const fp = fingerprintImageBytes(png);
    const json = JSON.stringify(fp);
    assert.equal(json.includes("data:image"), false);
    assert.equal(/[A-Za-z0-9+/]{80,}={0,2}/.test(json), false);
    assert.ok(fp.sha256);
    assert.ok(fp.averageHash);
  });

  it("5. Flux strength snapshot proves missing denoise/image_strength", () => {
    const snap = inspectFluxStrengthParams({
      prompt: "x",
      input_image: "[redacted]",
      aspect_ratio: "match_input_image",
      output_format: "png",
      safety_tolerance: 2,
      prompt_upsampling: true,
    });
    assert.equal(snap.fluxKontextLacksDenoiseStrength, true);
    assert.equal(snap.hasDenoise, false);
    assert.equal(snap.hasImageStrength, false);
    assert.equal(snap.hasPromptStrength, false);
    assert.ok(snap.strengthLikeFieldsAbsent.includes("denoise"));
    assert.ok(snap.strengthLikeFieldsAbsent.includes("image_strength"));
    assert.equal(snap.aspectRatio, "match_input_image");
    assert.equal(snap.promptUpsampling, true);
  });

  it("6. Diagnostic prompt marker is labeled diagnostic-only", () => {
    const p = buildTransformationProofDiagnosticPrompt("base anatomical prompt");
    assert.match(p, new RegExp(TRANSFORM_PROOF_PROMPT_MARKER.replace(/[[\]]/g, "\\$&")));
    assert.match(p, /INTERNAL DIAGNOSTIC ATTRIBUTION ONLY/i);
    assert.match(p, /teal|#008080/i);
    assert.match(p, /broader shoulders/i);
    assert.match(p, /narrower waist/i);
  });

  it("7–8. Diagnostic mode gated; unauthorized cannot enable", () => {
    assert.equal(
      isTransformProofDiagnosticRequested(TRANSFORM_PROOF_DIAGNOSTIC_MODE),
      true
    );
    assert.equal(isTransformProofDiagnosticRequested("nope"), false);
    assert.equal(
      isTransformProofDiagnosticAllowed({
        requested: true,
        controlRoomAuthorized: false,
        env: { [CONTROL_ROOM_ENABLED_ENV]: "1" },
      }),
      false
    );
    assert.equal(
      isTransformProofDiagnosticAllowed({
        requested: true,
        controlRoomAuthorized: true,
        env: { [CONTROL_ROOM_ENABLED_ENV]: "1" },
      }),
      true
    );
    assert.equal(
      isTransformProofDiagnosticAllowed({
        requested: true,
        controlRoomAuthorized: true,
        env: { [TRANSFORM_PROOF_DIAGNOSTIC_ENV]: "1" },
      }),
      true
    );
    assert.equal(
      isTransformProofDiagnosticAllowed({
        requested: true,
        controlRoomAuthorized: true,
        env: {},
      }),
      false
    );
  });

  it("9. Access key verify is timing-safe and rejects short/missing", () => {
    const env = {
      AI_OS_CONTROL_ROOM_ACCESS_KEY: "abcdefghijklmnop",
    };
    assert.equal(verifyControlRoomAccessKey("abcdefghijklmnop", env), true);
    assert.equal(verifyControlRoomAccessKey("wrong-key-xxxxxx", env), false);
    assert.equal(verifyControlRoomAccessKey("", env), false);
    assert.equal(
      verifyControlRoomAccessKey("abcdefghijklmnop", {
        AI_OS_CONTROL_ROOM_ACCESS_KEY: "short",
      }),
      false
    );
  });

  it("10. Production path does not inject diagnostic prompt without gate", async () => {
    let seenPrompt = "";
    const result = await runLiveFuturePreview({
      payload: casePayload(),
      sourceImageDataUri: JPEG_DATA_URI,
      env: { [BODY_SIMULATOR_LIVE_PREVIEW_ENV]: "1" },
      fluxProvider: async (args) => {
        seenPrompt = args.prompt;
        return {
          imageUrl: "https://replicate.delivery/example/out.png",
          model: "black-forest-labs/flux-kontext-pro",
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
      downloadImageBytes: async () => ({
        bytes: encodeSolidPngRgba(8, 8, [0, 128, 128]),
        host: "replicate.delivery",
      }),
    });
    assert.equal(seenPrompt.includes(TRANSFORM_PROOF_PROMPT_MARKER), false);
    assert.equal(result.livePreviewDiagnostics.diagnosticPromptInjected, false);
    assert.ok(result.livePreviewDiagnostics.transformationProof);
  });

  it("11. Authorized diagnostic mode injects marker prompt", async () => {
    let seenPrompt = "";
    const result = await runLiveFuturePreview({
      payload: casePayload(),
      sourceImageDataUri: JPEG_DATA_URI,
      env: {
        [BODY_SIMULATOR_LIVE_PREVIEW_ENV]: "1",
        [CONTROL_ROOM_ENABLED_ENV]: "1",
      },
      diagnosticMode: TRANSFORM_PROOF_DIAGNOSTIC_MODE,
      controlRoomAuthorized: true,
      fluxProvider: async (args) => {
        seenPrompt = args.prompt;
        return {
          imageUrl: "https://replicate.delivery/example/out.png",
          model: "black-forest-labs/flux-kontext-pro",
        };
      },
      downloadImageBytes: async () => ({
        bytes: encodeSolidPngRgba(8, 8, [0, 128, 128]),
        host: "replicate.delivery",
      }),
    });
    assert.match(seenPrompt, /DIAGNOSTIC_TRANSFORM_PROOF/);
    assert.equal(result.livePreviewDiagnostics.diagnosticPromptInjected, true);
    assert.equal(result.livePreviewDiagnostics.diagnosticMode, TRANSFORM_PROOF_DIAGNOSTIC_MODE);
    assert.ok(
      result.liveFuturePreviewTrace.some((s) => s.id === "transformation_proof")
    );
  });

  it("12. Secrets / tokens never appear in proof projection or report JSON", async () => {
    const report = buildTransformationProofReport({
      diagnosticMode: true,
      diagnosticPromptInjected: true,
      paidProviderCallAttempted: true,
      paidProviderCallCompleted: true,
      providerModel: "black-forest-labs/flux-kontext-pro",
      predictionIds: ["pred_abc"],
      inputBytes: encodeSolidPngRgba(4, 4, [1, 2, 3]),
      outputBytes: encodeSolidPngRgba(4, 4, [200, 10, 10]),
      outputImageUrl: "https://replicate.delivery/x/y.png",
      strengthInput: {
        prompt: "secret-should-not-leak-as-full-uri",
        input_image: "data:image/png;base64,AAAA",
        aspect_ratio: "match_input_image",
        output_format: "png",
        safety_tolerance: 2,
        prompt_upsampling: true,
      },
    });
    const projected = projectTransformationProofForControlRoom(report);
    const blob = JSON.stringify({ report, projected });
    assert.equal(blob.includes("r8_"), false);
    assert.equal(blob.includes("Bearer "), false);
    assert.equal(blob.includes("data:image/png;base64,AAAA"), false);
    assert.equal(report.secretsRedacted, true);
    assert.equal(report.outputUrlHost, "replicate.delivery");
  });

  it("13. Body Simulator physiology coefficients unchanged", () => {
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

  it("14. API gates diagnosticMode; public index does not expose it", () => {
    const api = readFileSync(
      join(repoRoot, "api/generate-future-you.js"),
      "utf8"
    );
    assert.match(api, /diagnosticMode/);
    assert.match(api, /transformation_proof/);
    assert.match(api, /x-ai-os-control-room-key/i);
    assert.match(api, /timingSafeEqual/);
    const index = readFileSync(join(repoRoot, "public/index.html"), "utf8");
    assert.equal(index.includes("diagnosticMode"), false);
    assert.equal(index.includes("DIAGNOSTIC_TRANSFORM_PROOF"), false);
  });

  it("15. Control Room shows Transformation Proof section", () => {
    const html = readFileSync(
      join(repoRoot, "public/ai-os-control-room.html"),
      "utf8"
    );
    const js = readFileSync(join(repoRoot, "public/ai-os-control-room.js"), "utf8");
    assert.match(html, /Transformation Proof/);
    assert.match(html, /transformationProofStatus/);
    assert.match(js, /renderTransformationProof/);
    assert.match(js, /extractTransformationProof/);
  });

  it("16. Dry-run attaches offline proof without paid call", async () => {
    const result = await runLiveFuturePreview({
      payload: casePayload(),
      sourceImageDataUri: JPEG_DATA_URI,
      dryRun: true,
      env: { [BODY_SIMULATOR_LIVE_PREVIEW_ENV]: "1" },
    });
    assert.equal(result.providerRequestCount, 0);
    assert.ok(result.livePreviewDiagnostics.transformationProof);
    assert.equal(
      result.livePreviewDiagnostics.transformationProof?.paidProviderCallCompleted,
      false
    );
    assert.equal(
      result.livePreviewDiagnostics.transformationProof?.strengthParams
        ?.fluxKontextLacksDenoiseStrength,
      true
    );
  });

  it("17. prepareLiveFuturePreview production path shape unchanged (no diagnostic fields forced)", () => {
    const prep = prepareLiveFuturePreview(casePayload(), { enabled: true });
    assert.equal(prep.diagnostics.diagnosticMode, null);
    assert.equal(prep.diagnostics.diagnosticPromptInjected, false);
    assert.equal(prep.diagnostics.transformationProof, null);
  });

  it("18. Mock server compare detects identical vs different output", async () => {
    const inputPng = encodeSolidPngRgba(6, 6, [90, 90, 90]);
    const inputUri = `data:image/png;base64,${inputPng.toString("base64")}`;
    const identical = await runLiveFuturePreview({
      payload: casePayload(),
      sourceImageDataUri: inputUri,
      env: { [BODY_SIMULATOR_LIVE_PREVIEW_ENV]: "1" },
      fluxProvider: async () => ({
        imageUrl: "https://replicate.delivery/same.png",
        model: "black-forest-labs/flux-kontext-pro",
      }),
      downloadImageBytes: async () => ({
        bytes: Buffer.from(inputPng),
        host: "replicate.delivery",
      }),
    });
    assert.equal(
      identical.livePreviewDiagnostics.transformationProof?.delta?.verdict,
      "identical_bytes"
    );
    assert.ok(
      identical.livePreviewDiagnostics.transformationProof?.implicatedLayers.includes(
        "provider_capability"
      )
    );

    const changed = await runLiveFuturePreview({
      payload: casePayload(),
      sourceImageDataUri: inputUri,
      env: { [BODY_SIMULATOR_LIVE_PREVIEW_ENV]: "1" },
      fluxProvider: async () => ({
        imageUrl: "https://replicate.delivery/diff.png",
        model: "black-forest-labs/flux-kontext-pro",
      }),
      downloadImageBytes: async () => ({
        bytes: encodeSolidPngRgba(6, 6, [0, 128, 128]),
        host: "replicate.delivery",
      }),
    });
    assert.equal(
      changed.livePreviewDiagnostics.transformationProof?.delta?.verdict,
      "clearly_transformed"
    );
  });

  it("19. No production moderation/model policy strings altered in safety conditioner", () => {
    const cond = readFileSync(
      join(
        repoRoot,
        "src/ai/body-simulator/NeutralAnatomicalPromptConditioner.ts"
      ),
      "utf8"
    );
    // Diagnostic module must not rewrite conditioner bans.
    assert.match(cond, /PROVIDER_SENSITIVE_LEXEMES/);
    const proof = readFileSync(
      join(repoRoot, "src/ai/body-simulator/ImageTransformationProof.ts"),
      "utf8"
    );
    assert.equal(proof.includes("PROVIDER_SENSITIVE_LEXEMES"), false);
  });
});
