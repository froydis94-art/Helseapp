const crypto = require("crypto");
const {
  generateWithReplicate,
  runFluxKontextAnatomicalCascade,
  CASCADE_BUDGET_MS,
  FUNCTION_SOFT_DEADLINE_MS,
  MIN_ATTEMPT_MS,
  friendlyError,
} = require("../lib/replicate");

const CONTROL_ROOM_ACCESS_HEADER = "x-ai-os-control-room-key";
const TRANSFORM_PROOF_DIAGNOSTIC_MODE = "transformation_proof";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-AI-OS-Control-Room-Key"
  );
}

function readHeader(req, name) {
  const headers = req?.headers || {};
  const lower = name.toLowerCase();
  const direct = headers[lower] ?? headers[name];
  if (typeof direct === "string") return direct;
  if (Array.isArray(direct) && typeof direct[0] === "string") return direct[0];
  return "";
}

/** Mirror Control Room access-key gate (header only; never accept body key). */
function verifyControlRoomAccessKey(req) {
  const expected = String(process.env.AI_OS_CONTROL_ROOM_ACCESS_KEY || "").trim();
  const presented = String(readHeader(req, CONTROL_ROOM_ACCESS_HEADER) || "").trim();
  if (!expected || expected.length < 16 || !presented) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(presented, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isTransformProofDiagnosticEnvEnabled() {
  return (
    process.env.BODY_SIMULATOR_TRANSFORM_PROOF_DIAGNOSTIC === "1" ||
    process.env.AI_OS_CONTROL_ROOM_ENABLED === "1"
  );
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

function jsonError(res, status, body) {
  if (res.headersSent) return res;
  return res.status(status).json(body);
}

/**
 * Race work against a soft deadline so we return JSON before Vercel kills the
 * function with an HTML 504/502 gateway page (which breaks client response.json()).
 */
function raceWithSoftDeadline(workPromise, softMs, makeTimeoutError) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(makeTimeoutError());
    }, Math.max(1000, softMs));
  });
  return Promise.race([workPromise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function handler(req, res) {
  setCors(res);
  // Always prefer JSON error bodies — never let an uncaught throw become HTML.
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return jsonError(res, 405, { error: "Kun POST er tillatt." });
  }

  const requestStarted = Date.now();
  const softDeadlineMs = FUNCTION_SOFT_DEADLINE_MS;

  const remainingSoftMs = () =>
    Math.max(0, softDeadlineMs - (Date.now() - requestStarted));

  const makeSoftTimeoutError = (errorClass = "generate_soft_timeout") => {
    const err = new Error(
      friendlyError(
        "Generering tok for lang tid hos bildemodellen. Prøv igjen.",
        { anatomical: isBodySimulatorLivePreviewEnabled() }
      )
    );
    err.status = 504;
    err.errorClass = errorClass;
    err.retriable = true;
    return err;
  };

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
      return jsonError(res, 400, {
        error: "Mangler bilde. Send imageBase64 fra appen.",
      });
    }

    const raw = String(imageBase64).replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(raw, "base64");
    const mimeType = req.body?.mimeType || "image/jpeg";

    if (!imageBuffer.length) {
      return jsonError(res, 400, { error: "Tomt bilde." });
    }

    // Demand 022E-F — gated transformation-proof diagnostic (Control Room key).
    // Never enabled by public Future UI; not a production prompt calibration path.
    const diagnosticModeRaw = req.body?.diagnosticMode;
    const diagnosticRequested =
      diagnosticModeRaw === TRANSFORM_PROOF_DIAGNOSTIC_MODE;
    if (diagnosticRequested) {
      if (
        Object.prototype.hasOwnProperty.call(req.body || {}, "accessKey") ||
        Object.prototype.hasOwnProperty.call(req.body || {}, "key") ||
        Object.prototype.hasOwnProperty.call(req.body || {}, "token")
      ) {
        return jsonError(res, 400, {
          error: "Invalid request.",
          errorClass: "invalid_request",
        });
      }
      if (!verifyControlRoomAccessKey(req) || !isTransformProofDiagnosticEnvEnabled()) {
        return jsonError(res, 401, {
          error: "Unauthorized.",
          errorClass: "transform_proof_unauthorized",
        });
      }
    }

    // Demand 022E — single live Body Simulator / Anatomical path when flag ON
    // (or when authorized transformation-proof diagnostic is requested).
    // No dual provider requests. No silent legacy fallback on failure.
    if (isBodySimulatorLivePreviewEnabled() || diagnosticRequested) {
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
        const live = await raceWithSoftDeadline(
          runtime.runLiveFuturePreview({
            payload: publicPayload,
            sourceImageDataUri: toDataUri(imageBuffer, mimeType),
            mimeType,
            env: process.env,
            diagnosticMode: diagnosticRequested
              ? TRANSFORM_PROOF_DIAGNOSTIC_MODE
              : null,
            controlRoomAuthorized: diagnosticRequested
              ? verifyControlRoomAccessKey(req)
              : false,
            // Inject intelligent Flux ordered fallback (022E-E).
            // Same anatomical prompt across Max/Pro/Dev; no legacy reservedrift.
            // Shrink cascade wall-clock near soft deadline so Max+Dev fit before
            // Vercel platform HTML timeout pages.
            fluxCascade: (args) => {
              const cascadeBudgetMs = Math.min(
                CASCADE_BUDGET_MS,
                Math.max(MIN_ATTEMPT_MS, remainingSoftMs() - 5000)
              );
              return runFluxKontextAnatomicalCascade({
                ...args,
                cascadeBudgetMs,
              });
            },
          }),
          remainingSoftMs(),
          () => makeSoftTimeoutError("live_preview_timeout")
        );

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
          transformationProof:
            live.livePreviewDiagnostics?.transformationProof || null,
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
        const safeMessage = friendlyError(
          liveError?.message || "Live Future preview failed.",
          { anatomical: true }
        );
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
        return jsonError(res, status, {
          error: safeMessage,
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
          transformationProof:
            liveError?.diagnostics?.transformationProof || null,
        });
      }
    }

    const generated = await raceWithSoftDeadline(
      generateWithReplicate({
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
      }),
      remainingSoftMs(),
      () => makeSoftTimeoutError("generate_soft_timeout")
    );

    return res.status(200).json({
      ok: true,
      ...generated,
      disclaimer:
        "Realistic motivational visualization from your parameters (especially body-fat %) — not a medical prediction or flattering ideal.",
    });
  } catch (error) {
    console.error("[generate-future-you]", error);
    const status = error.status || 500;
    return jsonError(res, status, {
      error: friendlyError(error.message || "Ukjent serverfeil", {
        anatomical: isBodySimulatorLivePreviewEnabled(),
      }),
      errorClass: error.errorClass || null,
    });
  }
}

handler.config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
  // Pro plan: keep 180s. Soft deadline (~165s) returns JSON before platform HTML kill.
  // Hobby/lower plans that cap below 180s still need owner to raise maxDuration in Vercel.
  maxDuration: 180,
};

module.exports = handler;
