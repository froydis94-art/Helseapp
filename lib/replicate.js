const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120000;

const DEFAULT_MODEL = "black-forest-labs/flux-kontext-pro";
// Official SDXL on Replicate supports img2img via `image` + `prompt_strength`.
const DEFAULT_FALLBACK_MODEL = "stability-ai/sdxl";

/** Soften user goals so Replicate's safety filter (E005) is less likely to trip. */
function sanitizeGoal(maal) {
  return String(maal || "")
    .replace(/mage(?:muskel|r)?|abs|six[\s-]?pack/gi, "core fitness")
    .replace(/nak(en|ent)|nude|sexy|hot|erotic/gi, "athletic")
    .replace(/muskel(?:er|masse)?|shredded|bulking|bodybuilding/gi, "athletic tone")
    .replace(/fett(?:prosent)?|body\s*fat/gi, "fitness condition")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
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
    "Keep the exact same clothing type, colors, and coverage. Do not remove clothes. Do not make clothing more revealing.",
    "Preserve accessories (watch, necklace, rings) and natural skin texture.",
    "Improve only tasteful athletic cues: posture, healthy conditioning, and athletic fitness look.",
    "Photorealistic result, natural indoor lighting, sharp detail, no beauty-filter plastic skin.",
    "No text, no watermark, no logo, no nudity, family-friendly.",
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
    "Keep original clothing exactly as worn in the photo.",
    "Natural lighting, realistic skin, sharp details.",
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
  return /could not be found|404|not found|does not exist/i.test(
    String(message || "")
  );
}

function friendlyError(message) {
  const text = String(message || "");
  if (isSafetyBlock(text)) {
    return [
      "Sikkerhetsfilteret stoppet bildet.",
      "Bar overkropp/undertøy blir ofte blokkert av Flux.",
      "Prøv bilde i t-skjorte/shorts, eller vent — appen prøver reservedriftsmodell automatisk.",
    ].join(" ");
  }
  return text;
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

function buildModelInput(model, { imageDataUri, maal, intensity }) {
  if (model.includes("flux-kontext")) {
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
  if (!model.includes("/")) {
    const err = new Error(
      'Modell må være "eier/modellnavn", f.eks. black-forest-labs/flux-kontext-pro'
    );
    err.status = 500;
    throw err;
  }

  const input = buildModelInput(model, { imageDataUri, maal, intensity });
  const createUrl = `https://api.replicate.com/v1/models/${model}/predictions`;
  const createResponse = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({ input }),
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

  return { imageUrl, model };
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
      fallbackError.message = friendlyError(
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
