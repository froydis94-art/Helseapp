const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120000;

// Flux Kontext = best identity lock for “future you”.
// SDXL = permissive fallback when Flux safety-blocks physique/skin photos.
const DEFAULT_MODEL = "black-forest-labs/flux-kontext-pro";
const DEFAULT_FALLBACK_MODEL =
  "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc";

/**
 * Model choice is owned by code (Flux primary, SDXL fallback).
 * Vercel REPLICATE_MODEL is ignored unless REPLICATE_ALLOW_MODEL_ENV=1.
 * Also rejects token-like mistakes (r8_...).
 */
function isValidModelRef(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/^r8_/i.test(raw)) return false;
  if (/^[a-f0-9]{64}$/i.test(raw)) return true;
  if (/^[^/]+\/[^:]+:[a-f0-9]{64}$/i.test(raw)) return true;
  if (/^[^/\s]+\/[^/\s]+$/i.test(raw)) return true;
  return false;
}

function envModelOverrideAllowed() {
  return String(process.env.REPLICATE_ALLOW_MODEL_ENV || "").trim() === "1";
}

function resolveModel(envValue, fallback) {
  if (!envModelOverrideAllowed()) return fallback;
  return isValidModelRef(envValue) ? String(envValue).trim() : fallback;
}

function getConfiguredModels() {
  const allowEnv = envModelOverrideAllowed();
  return {
    model: resolveModel(process.env.REPLICATE_MODEL, DEFAULT_MODEL),
    fallbackModel: resolveModel(
      process.env.REPLICATE_FALLBACK_MODEL,
      DEFAULT_FALLBACK_MODEL
    ),
    modelFromEnv: allowEnv && isValidModelRef(process.env.REPLICATE_MODEL),
    ignoredEnvModel:
      Boolean(process.env.REPLICATE_MODEL) &&
      (!allowEnv || !isValidModelRef(process.env.REPLICATE_MODEL)),
  };
}
/** Soften only explicit NSFW wording — keep fitness body language intact (abs, muscle, skin). */
function sanitizeGoal(maal) {
  return String(maal || "")
    .replace(/\b(nude|naked|porn|xxx|erotic|sexual)\b/gi, "athletic")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

/**
 * Flux Kontext works best with clear edit instructions:
 * say what to change AND what to keep unchanged.
 */
function buildPrompt(maal, intensity = "moderate") {
  const safeGoal = sanitizeGoal(maal) || "healthy athletic fitness progress";

  const editLine =
    intensity === "strong"
      ? `Make a clear but realistic fitness-progress edit that reflects this goal: ${safeGoal}.`
      : intensity === "subtle"
        ? `Make a subtle, realistic fitness-progress edit that reflects this goal: ${safeGoal}.`
        : `Make a moderate, realistic fitness-progress edit that reflects this goal: ${safeGoal}.`;

  return [
    editLine,
    "Keep the same person: identical face, facial features, hair, age, skin tone, and identity.",
    "Keep the same pose, camera angle, framing, crop, and background.",
    "Preserve the same clothing or bare-skin presentation as in the original photo — physique progress photos with visible skin/torso are allowed and expected.",
    "Do not censor, cover up, or add clothing that was not in the original image.",
    "Preserve accessories (watch, necklace, rings) and natural skin texture.",
    "Improve athletic cues: posture, muscle definition, conditioning — photorealistic, natural lighting.",
    "No text, no watermark, no logo. Not sexualized; fitness context only.",
  ].join(" ");
}

function buildImg2ImgPrompt(maal, intensity = "moderate") {
  const safeGoal = sanitizeGoal(maal) || "healthy athletic fitness progress";
  const amount =
    intensity === "strong"
      ? "clear but still realistic"
      : intensity === "subtle"
        ? "very subtle"
        : "moderate";

  return [
    `Photorealistic smartphone photo of the exact same person, ${amount} athletic fitness improvement: ${safeGoal}.`,
    "Must keep identical face, beard, hair, age, skin tone, body shape baseline, pose, crop, and the same room background.",
    "Keep the same underwear/clothing exactly as in the source. Do not invent shirts, shoes, jewelry, or props.",
    "Only gently improve conditioning and posture. Realistic skin pores, natural lighting, no stylization.",
  ].join(" ");
}

function buildNegativePrompt() {
  return [
    "3d render",
    "cgi",
    "plastic skin",
    "video game character",
    "anime",
    "cartoon",
    "painting",
    "overcooked",
    "glowing skin",
    "metallic",
    "orange tint",
    "different person",
    "face change",
    "extra limbs",
    "deformed hands",
    "new clothing",
    "tank top",
    "shoes",
    "blurry",
    "low quality",
    "text",
    "watermark",
    "logo",
    "nsfw",
    "sexual",
    "erotic",
  ].join(", ");
}

function toDataUri(imageBuffer, mimeType) {
  const mime = mimeType || "image/jpeg";
  return `data:${mime};base64,${imageBuffer.toString("base64")}`;
}

function extractOutputUrl(output) {
  if (!output) return null;
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length) {
    return extractOutputUrl(output[0]);
  }
  if (typeof output === "object" && output.url) return output.url;
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSafetyBlock(message) {
  return /sensitive|E005|flagged|nsfw|safety/i.test(String(message || ""));
}

function isMissingModel(message) {
  return /could not be found|404|not found|does not exist|specified version/i.test(
    String(message || "")
  );
}

function friendlyError(message) {
  const text = String(message || "");
  if (isSafetyBlock(text)) {
    return [
      "Sikkerhetsfilteret stoppet denne kjøringen.",
      "Prøv igjen — appen bytter automatisk til en mer tillatende modell for kroppsbilder.",
    ].join(" ");
  }
  if (isMissingModel(text)) {
    return [
      "Replicate fant ikke modell/versjon.",
      "Sjekk REPLICATE_MODEL / REPLICATE_FALLBACK_MODEL, eller prøv igjen om litt.",
    ].join(" ");
  }
  return text;
}

function parseModelRef(model) {
  const raw = String(model || "").trim();
  if (!raw) {
    const err = new Error("Mangler modellnavn");
    err.status = 500;
    throw err;
  }

  // owner/name:64hexversion
  const versioned = raw.match(/^([^/]+\/[^:]+):([a-f0-9]{64})$/i);
  if (versioned) {
    return { kind: "version", modelName: versioned[1], version: versioned[2] };
  }

  // bare 64-char version id
  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return { kind: "version", modelName: null, version: raw };
  }

  if (!raw.includes("/")) {
    const err = new Error(
      'Modell må være "eier/modellnavn" eller "eier/modell:versjon"'
    );
    err.status = 500;
    throw err;
  }

  // Official models (BFL Flux family) use /v1/models/.../predictions
  if (/^black-forest-labs\//i.test(raw)) {
    return { kind: "official", modelName: raw, version: null };
  }

  // Known community fallback without version — pin latest known SDXL version
  if (raw === "stability-ai/sdxl") {
    return {
      kind: "version",
      modelName: raw,
      version:
        "7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
    };
  }

  // Default: treat as official-style path (works for some hosted models)
  return { kind: "official", modelName: raw, version: null };
}

async function pollPrediction(getUrl, token) {
  const started = Date.now();

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const response = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const prediction = await response.json();

    if (!response.ok) {
      const err = new Error(
        prediction?.detail || `Replicate polling feilet (${response.status})`
      );
      err.status = response.status;
      throw err;
    }

    if (prediction.status === "succeeded") return prediction;

    if (prediction.status === "failed" || prediction.status === "canceled") {
      const err = new Error(
        prediction?.error || `Replicate-jobben feilet (${prediction.status})`
      );
      err.status = 502;
      throw err;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  const err = new Error("Replicate brukte for lang tid. Prøv igjen.");
  err.status = 504;
  throw err;
}

function buildModelInput(modelRef, { imageDataUri, maal, intensity }) {
  const name = (modelRef.modelName || "").toLowerCase();
  if (name.includes("flux-kontext") || /^black-forest-labs\//i.test(name)) {
    return {
      prompt: buildPrompt(maal, intensity),
      input_image: imageDataUri,
      aspect_ratio: "match_input_image",
      output_format: "png",
      // Max allowed with image inputs on BFL/Replicate
      safety_tolerance: 2,
      prompt_upsampling: true,
    };
  }

  // SDXL fallback only — keep strength LOW or identity collapses into plastic CGI.
  return {
    prompt: buildImg2ImgPrompt(maal, intensity),
    negative_prompt: buildNegativePrompt(),
    image: imageDataUri,
    prompt_strength:
      intensity === "strong" ? 0.28 : intensity === "subtle" ? 0.18 : 0.22,
    num_inference_steps: 35,
    guidance_scale: 5.5,
    apply_watermark: false,
  };
}

async function runPrediction({ model, imageDataUri, maal, intensity, token }) {
  const modelRef = parseModelRef(model);
  const input = buildModelInput(modelRef, { imageDataUri, maal, intensity });

  let createUrl;
  let body;
  if (modelRef.kind === "version") {
    createUrl = "https://api.replicate.com/v1/predictions";
    body = { version: modelRef.version, input };
  } else {
    createUrl = `https://api.replicate.com/v1/models/${modelRef.modelName}/predictions`;
    body = { input };
  }

  const createResponse = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify(body),
  });

  let prediction = await createResponse.json();

  if (!createResponse.ok) {
    const detail =
      typeof prediction?.detail === "string"
        ? prediction.detail
        : JSON.stringify(prediction?.detail || prediction);
    const err = new Error(
      detail ||
        `Replicate feilet (${createResponse.status}). Sjekk token, kreditt og modell.`
    );
    err.status = createResponse.status;
    throw err;
  }

  if (
    prediction.status !== "succeeded" &&
    prediction?.urls?.get &&
    prediction.status !== "failed"
  ) {
    prediction = await pollPrediction(prediction.urls.get, token);
  }

  if (prediction.status === "failed") {
    const err = new Error(prediction.error || "Replicate-jobben feilet.");
    err.status = 502;
    throw err;
  }

  const imageUrl = extractOutputUrl(prediction.output);
  if (!imageUrl) {
    const err = new Error(
      "The input or output was flagged as sensitive. Please try again with different inputs. (E005)"
    );
    err.status = 422;
    throw err;
  }

  return { imageUrl, model: modelRef.modelName || model };
}

async function generateWithReplicate({
  imageBuffer,
  mimeType,
  maal,
  intensity,
  token = process.env.REPLICATE_API_TOKEN,
  model,
  fallbackModel,
}) {
  const configured = getConfiguredModels();
  model = model || configured.model;
  fallbackModel = fallbackModel || configured.fallbackModel;

  if (!token) {
    const err = new Error(
      "REPLICATE_API_TOKEN mangler. Sett den som miljøvariabel i Vercel/skyen."
    );
    err.status = 503;
    throw err;
  }

  if (configured.ignoredEnvModel) {
    console.warn(
      "[replicate] Ignoring REPLICATE_MODEL from env. Using code default:",
      configured.model,
      "(set REPLICATE_ALLOW_MODEL_ENV=1 to override)"
    );
  }

  const imageDataUri = toDataUri(imageBuffer, mimeType);

  try {
    return await runPrediction({
      model,
      imageDataUri,
      maal,
      intensity,
      token,
    });
  } catch (primaryError) {
    const shouldFallback =
      fallbackModel &&
      fallbackModel !== model &&
      (isSafetyBlock(primaryError.message) || isMissingModel(primaryError.message));

    if (!shouldFallback) {
      primaryError.message = friendlyError(primaryError.message);
      throw primaryError;
    }

    console.warn(
      `[replicate] Primary model blocked (${model}). Falling back to ${fallbackModel}.`,
      primaryError.message
    );

    try {
      const result = await runPrediction({
        model: fallbackModel,
        imageDataUri,
        maal,
        intensity,
        token,
      });
      return {
        ...result,
        usedFallback: true,
        primaryError: primaryError.message,
      };
    } catch (fallbackError) {
      const primaryWasSafety = isSafetyBlock(primaryError.message);
      fallbackError.message = primaryWasSafety
        ? [
            friendlyError(primaryError.message),
            "Reservedrift feilet også:",
            friendlyError(fallbackError.message),
          ].join(" ")
        : friendlyError(
            `${fallbackError.message} (også etter reservedriftsmodell)`
          );
      throw fallbackError;
    }
  }
}

module.exports = {
  generateWithReplicate,
  buildPrompt,
  sanitizeGoal,
  getConfiguredModels,
  isValidModelRef,
  DEFAULT_MODEL,
  DEFAULT_FALLBACK_MODEL,
};
