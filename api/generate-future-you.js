const {
  generateWithReplicate,
  runFluxKontextAnatomicalCascade,
} = require("../lib/replicate");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/**
 * Demand 022E — server-authoritative live preview flag.
 * Enabled only when env is exactly "1". Default OFF when absent.
 * Browser cannot enable this.
 */
function isBodySimulatorLivePreviewEnabled() {
  return process.env.BODY_SIMULATOR_LIVE_PREVIEW_ENABLED === "1";
}

function loadLiveFuturePreviewRuntime() {
  // Lazy-load bundled AI OS graph only when flag is ON (Vercel Node cannot
  // resolve src TypeScript barrel imports at runtime).
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require("../src/ai/body-simulator/liveFuturePreviewRuntime.bundle.cjs");
}

function toDataUri(imageBuffer, mimeType) {
  const mime = mimeType || "image/jpeg";
  return `data:${mime};base64,${imageBuffer.toString("base64")}`;
}

async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Kun POST er tillatt." });
  }

  try {
    const maal = String(req.body?.maal || "").trim() || "visible athletic body transformation";
    const intensity = String(req.body?.intensity || "moderate").trim();
    const horizon = String(req.body?.horizon || "8w").trim();
    const focus = String(req.body?.focus || "overall").trim();
    const zone = String(req.body?.zone || "").trim();
    const zones = Array.isArray(req.body?.zones)
      ? req.body.zones.map(String)
      : String(req.body?.zones || "")
          .split(",")
          .map((z) => z.trim())
          .filter(Boolean);
    const fat = String(req.body?.fat || "decrease").trim();
    const muscle = String(req.body?.muscle || "toned").trim();
    const gender = String(req.body?.gender || "").trim();
    const frame = String(req.body?.frame || "average").trim();
    const shape = String(req.body?.shape || "").trim();
    const outcomes = Array.isArray(req.body?.outcomes)
      ? req.body.outcomes.map(String)
      : String(req.body?.outcomes || "")
          .split(",")
          .map((z) => z.trim())
          .filter(Boolean);
    const bmi = req.body?.bmi;
    const bmiAdjusted = req.body?.bmiAdjusted;
    const bfNow = req.body?.bfNow;
    const bfGoal = req.body?.bfGoal;
    const medicine = Boolean(req.body?.medicine);
    const paceLabel = String(req.body?.paceLabel || "").trim();
    const goalTitle = String(req.body?.goalTitle || "").trim();
    const horizonDate = String(req.body?.horizonDate || "").trim();
    const occasionLabel = String(req.body?.occasionLabel || "").trim();
    const heightCm = req.body?.heightCm;
    const weightKg = req.body?.weightKg;
    const ageYears = req.body?.ageYears;

    const imageBase64 = req.body?.imageBase64;
    if (!imageBase64) {
      return res.status(400).json({
        error: "Mangler bilde. Send imageBase64 fra appen.",
      });
    }

    const raw = String(imageBase64).replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(raw, "base64");
    const mimeType = req.body?.mimeType || "image/jpeg";

    if (!imageBuffer.length) {
      return res.status(400).json({ error: "Tomt bilde." });
    }

    // Demand 022E — single live Body Simulator / Anatomical path when flag ON.
    // No dual provider requests. No silent legacy fallback on failure.
    if (isBodySimulatorLivePreviewEnabled()) {
      const runtime = loadLiveFuturePreviewRuntime();
      const publicPayload = {
        maal,
        intensity,
        horizon,
        horizonDate,
        focus,
        zone,
        zones: zones.length ? zones : zone ? [zone] : [],
        fat,
        muscle,
        gender,
        bfNow,
        bfGoal,
        medicine,
        bmi,
        heightCm,
        weightKg,
        ageYears,
        goalTitle,
      };

      try {
        const live = await runtime.runLiveFuturePreview({
          payload: publicPayload,
          sourceImageDataUri: toDataUri(imageBuffer, mimeType),
          mimeType,
          env: process.env,
          // Inject intelligent Flux ordered fallback (022E-E).
          // Same anatomical prompt across Max/Pro/Dev; no legacy reservedrift.
          fluxCascade: runFluxKontextAnatomicalCascade,
        });

        return res.status(200).json({
          ok: true,
          imageUrl: live.imageUrl,
          attempt: live.attempt,
          // Public UX: cascade success is a normal Goal Image (not "Safety fallback").
          usedFallback: false,
          model: live.model,
          livePreviewTraceId: live.livePreviewTraceId,
          livePreviewDiagnostics: live.livePreviewDiagnostics,
          liveFuturePreviewTrace: live.liveFuturePreviewTrace,
          providerSafetyAttribution:
            live.livePreviewDiagnostics?.providerSafetyAttribution || null,
          bodySimulatorPreviewActive: true,
          disclaimer: live.disclaimer,
        });
      } catch (liveError) {
        const errorClass =
          liveError?.errorClass || "live_preview_provider_failed";
        const status = liveError?.status || 500;
        const providerDiagnostics =
          liveError?.providerDiagnostics ||
          liveError?.diagnostics?.providerDiagnostics ||
          null;
        const providerSafetyAttribution =
          liveError?.diagnostics?.providerSafetyAttribution || null;
        console.error(
          "[generate-future-you] live-preview",
          errorClass,
          providerDiagnostics?.providerErrorCategory || "",
          providerDiagnostics?.providerHttpStatus ?? "",
          providerDiagnostics?.providerResponseMessageSafe ||
            liveError?.message ||
            "",
          providerSafetyAttribution?.attribution?.classification || "",
          providerSafetyAttribution?.attribution?.confidence || ""
        );
        return res.status(status).json({
          error: liveError?.message || "Live Future preview failed.",
          errorClass,
          livePreviewTraceId: liveError?.livePreviewTraceId || null,
          livePreviewDiagnostics: liveError?.diagnostics || null,
          providerRequestCount: liveError?.providerCalls ?? 0,
          // Safe structured provider diagnostics (no tokens / image / Authorization).
          providerHttpStatus: providerDiagnostics?.providerHttpStatus ?? null,
          providerErrorCode: providerDiagnostics?.providerErrorCode ?? null,
          providerErrorCategory:
            providerDiagnostics?.providerErrorCategory ?? null,
          providerModel: providerDiagnostics?.providerModel ?? null,
          providerEndpointClass:
            providerDiagnostics?.providerEndpointClass ?? null,
          providerInputFieldNames:
            providerDiagnostics?.providerInputFieldNames ?? null,
          providerResponseMessageSafe:
            providerDiagnostics?.providerResponseMessageSafe ?? null,
          // Patch 022E-C — E005 attribution (no raw image / no bypass).
          providerSafetyAttribution,
        });
      }
    }

    const generated = await generateWithReplicate({
      imageBuffer,
      mimeType,
      maal,
      intensity,
      horizon,
      focus,
      zone,
      zones: zones.length ? zones : zone ? [zone] : [],
      fat,
      muscle,
      gender,
      frame,
      shape,
      outcomes,
      bmi,
      bmiAdjusted,
      bfNow,
      bfGoal,
      medicine,
      paceLabel,
      goalTitle,
      horizonDate,
      occasionLabel,
    });

    return res.status(200).json({
      ok: true,
      ...generated,
      disclaimer:
        "Realistic motivational visualization from your parameters (especially body-fat %) — not a medical prediction or flattering ideal.",
    });
  } catch (error) {
    console.error("[generate-future-you]", error);
    return res.status(error.status || 500).json({
      error: error.message || "Ukjent serverfeil",
    });
  }
}

handler.config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
  maxDuration: 180,
};

module.exports = handler;
