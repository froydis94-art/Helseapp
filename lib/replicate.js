const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120000;

// SDXL first: physique / visible skin is a core use case and must not be blocked.
// Flux can be enabled via REPLICATE_MODEL when identity lock matters more than skin tolerance.
const DEFAULT_MODEL =
  "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc";
const DEFAULT_FALLBACK_MODEL = "black-forest-labs/flux-kontext-pro";

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
      ? "noticeable"
      : intensity === "subtle"
        ? "subtle"
        : "moderate";

  return [
    `Photorealistic fitness progress photo of the same person, ${amount} athletic improvement toward: ${safeGoal}.`,
    "Same face, hair, body proportions, pose, room, and camera framing.",
    "Keep the original outfit or bare-skin physique presentation exactly as in the source photo.",
    "Visible skin, torso, and athletic body photos are allowed in a fitness progress context.",
    "Natural lighting, realistic skin texture, sharp details. Not sexualized.",
  ].join(" ");
}

function buildNegativePrompt() {
  return [
    "nude",
    "nudity",
    "nsfw",
    "sexual",
    "erotic",
    "different person",
    "face change",
    "extra limbs",
    "deformed hands",
    "blurry",
    "low quality",
    "text",
    "watermark",
    "logo",
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

  // SDXL img2img — keep prompt_strength low so the person stays recognizable
  return {
    prompt: buildImg2ImgPrompt(maal, intensity),
    negative_prompt: buildNegativePrompt(),
    image: imageDataUri,
    prompt_strength:
      intensity === "strong" ? 0.48 : intensity === "subtle" ? 0.32 : 0.4,
    num_inference_steps: 40,
    guidance_scale: 7,
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
  model = process.env.REPLICATE_MODEL || DEFAULT_MODEL,
  fallbackModel = process.env.REPLICATE_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL,
}) {
  if (!token) {
    const err = new Error(
      "REPLICATE_API_TOKEN mangler. Sett den som miljøvariabel i Vercel/skyen."
    );
    err.status = 503;
    throw err;
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
  DEFAULT_MODEL,
  DEFAULT_FALLBACK_MODEL,
};
