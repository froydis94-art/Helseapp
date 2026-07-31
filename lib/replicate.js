const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120000;

// Flux Kontext = realistic identity-preserving edits (the quality users liked).
const DEFAULT_MODEL = "black-forest-labs/flux-kontext-pro";
const SECONDARY_MODEL = "black-forest-labs/flux-kontext-dev";
const DEFAULT_FALLBACK_MODEL =
  "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc";

/**
 * Model choice is owned by code.
 * Vercel REPLICATE_MODEL is ignored unless REPLICATE_ALLOW_MODEL_ENV=1.
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
    secondaryModel: SECONDARY_MODEL,
    modelFromEnv: allowEnv && isValidModelRef(process.env.REPLICATE_MODEL),
    ignoredEnvModel:
      Boolean(process.env.REPLICATE_MODEL) &&
      (!allowEnv || !isValidModelRef(process.env.REPLICATE_MODEL)),
  };
}

/** Soften NSFW wording only — keep normal fitness language. */
function sanitizeGoal(maal) {
  return String(maal || "")
    .replace(/\b(nude|naked|porn|xxx|erotic|sexual)\b/gi, "athletic")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

const HORIZON_COPY = {
  "4w": {
    label: "about 4 weeks from now",
    change:
      "show early, believable progress — fresher posture and light conditioning, still clearly the same body stage",
  },
  "8w": {
    label: "about 8 weeks from now",
    change:
      "show clear but realistic mid-plan progress — better conditioning and athletic shape without extreme transformation",
  },
  "12w": {
    label: "about 3 months from now",
    change:
      "show strong but still realistic plan-completion progress — noticeably fitter athletic look while remaining the same person",
  },
  "24w": {
    label: "about 6 months from now",
    change:
      "show mature long-term athletic progress — solid fitness transformation that still looks natural and achievable",
  },
};

const FOCUS_COPY = {
  overall:
    "overall athletic fitness: posture, conditioning, and balanced physique",
  cardio: "cardio fitness cues: healthier endurance look, lighter conditioning, energetic posture",
  core: "core and midsection conditioning: tighter waistline and stronger core appearance",
  strength:
    "strength and muscle tone: clearer athletic muscle definition in a realistic way",
  posture:
    "posture and presence: taller stance, open shoulders, confident athletic carriage",
};

function composeGoalBrief({
  maal,
  horizon = "8w",
  focus = "overall",
  paceLabel = "",
  goalTitle = "",
}) {
  const safeGoal = sanitizeGoal(maal) || "healthy athletic fitness progress";
  const horizonInfo = HORIZON_COPY[horizon] || HORIZON_COPY["8w"];
  const focusInfo = FOCUS_COPY[focus] || FOCUS_COPY.overall;
  const parts = [
    safeGoal,
    `time horizon: ${horizonInfo.label}`,
    `visual focus: ${focusInfo}`,
  ];
  if (goalTitle) parts.push(`plan name: ${sanitizeGoal(goalTitle)}`);
  if (paceLabel) parts.push(`current pace status: ${sanitizeGoal(paceLabel)}`);
  return {
    brief: parts.join(". "),
    horizonInfo,
    focusInfo,
    safeGoal,
  };
}

/**
 * Personalized Flux Kontext prompt: user goal + horizon + focus + identity lock.
 * Never ask the model to add clothes — keep source outfit / skin coverage.
 */
function buildPrompt(maal, intensity = "moderate", extras = {}) {
  const { brief, horizonInfo } = composeGoalBrief({
    maal,
    ...extras,
  });

  const strength =
    intensity === "strong"
      ? "a clear but realistic improvement in athletic fitness appearance"
      : intensity === "subtle"
        ? "a subtle, realistic improvement in healthy fitness appearance"
        : "a moderate, realistic improvement in athletic fitness appearance";

  return [
    "Edit this exact person in the photo into a motivational fitness progress visualization of their future self.",
    `Timeline: ${horizonInfo.label}. ${horizonInfo.change}.`,
    "Keep the same face, hair, skin tone, body proportions, pose, camera angle, framing, and background.",
    "Keep the exact same clothing and skin coverage as in the original photo. Do not add a shirt, jacket, pants, shoes, or any new garments.",
    "Do not invent a different person. Do not change identity.",
    `Personalized goal brief: ${brief}.`,
    `Apply ${strength}.`,
    "Photorealistic, natural lighting, sharp detail, no text, no watermark, no logo.",
  ].join(" ");
}

function buildImg2ImgPrompt(maal, intensity = "moderate", extras = {}) {
  const { brief, horizonInfo } = composeGoalBrief({
    maal,
    ...extras,
  });
  const amount =
    intensity === "strong"
      ? "clear but still realistic"
      : intensity === "subtle"
        ? "very subtle"
        : "moderate";

  return [
    `Photorealistic smartphone photo of the exact same person ${horizonInfo.label}, ${amount} athletic fitness improvement.`,
    `Personalized goal brief: ${brief}.`,
    "Must keep identical face, beard, hair, age, skin tone, pose, crop, and the same room background.",
    "Keep the exact same clothing and skin coverage as the source photo. Do not add shirts, jackets, pants, or shoes.",
    "Realistic skin, natural lighting, no stylization.",
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
    "glowing skin",
    "metallic",
    "different person",
    "face change",
    "added clothing",
    "t-shirt",
    "shirt",
    "jacket",
    "extra limbs",
    "deformed hands",
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
      "Prøv igjen — systemet bytter automatisk modell.",
    ].join(" ");
  }
  if (isMissingModel(text)) {
    return "Replicate fant ikke modell/versjon. Prøv igjen om litt.";
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

  const versioned = raw.match(/^([^/]+\/[^:]+):([a-f0-9]{64})$/i);
  if (versioned) {
    return { kind: "version", modelName: versioned[1], version: versioned[2] };
  }

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

  if (/^black-forest-labs\//i.test(raw)) {
    return { kind: "official", modelName: raw, version: null };
  }

  if (raw === "stability-ai/sdxl") {
    return {
      kind: "version",
      modelName: raw,
      version:
        "7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
    };
  }

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

function buildModelInput(
  modelRef,
  { imageDataUri, maal, intensity, extras = {} }
) {
  const name = (modelRef.modelName || "").toLowerCase();

  if (name.includes("flux-kontext") || /^black-forest-labs\//i.test(name)) {
    return {
      prompt: buildPrompt(maal, intensity, extras),
      input_image: imageDataUri,
      aspect_ratio: "match_input_image",
      output_format: "png",
      safety_tolerance: 2,
      prompt_upsampling: false,
    };
  }

  return {
    prompt: buildImg2ImgPrompt(maal, intensity, extras),
    negative_prompt: buildNegativePrompt(),
    image: imageDataUri,
    prompt_strength:
      intensity === "strong" ? 0.26 : intensity === "subtle" ? 0.16 : 0.2,
    num_inference_steps: 35,
    guidance_scale: 5,
    apply_watermark: false,
  };
}

async function runPrediction({
  model,
  imageDataUri,
  maal,
  intensity,
  token,
  extras = {},
}) {
  const modelRef = parseModelRef(model);
  const input = buildModelInput(modelRef, {
    imageDataUri,
    maal,
    intensity,
    extras,
  });

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
  horizon,
  focus,
  paceLabel,
  goalTitle,
  token = process.env.REPLICATE_API_TOKEN,
  model,
  fallbackModel,
}) {
  const configured = getConfiguredModels();
  model = model || configured.model;
  fallbackModel = fallbackModel || configured.fallbackModel;
  const secondaryModel = configured.secondaryModel;
  const extras = { horizon, focus, paceLabel, goalTitle };

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
      configured.model
    );
  }

  const imageDataUri = toDataUri(imageBuffer, mimeType);
  const attempts = [
    { model, label: "flux-pro" },
    { model: secondaryModel, label: "flux-dev" },
    { model: fallbackModel, label: "sdxl-fallback" },
  ];

  const seen = new Set();
  const uniqueAttempts = attempts.filter((a) => {
    if (!a.model) return false;
    if (seen.has(a.model)) return false;
    seen.add(a.model);
    return true;
  });

  let lastError = null;

  for (let i = 0; i < uniqueAttempts.length; i++) {
    const attempt = uniqueAttempts[i];
    try {
      const result = await runPrediction({
        model: attempt.model,
        imageDataUri,
        maal,
        intensity,
        token,
        extras,
      });
      return {
        ...result,
        usedFallback: attempt.label !== "flux-pro",
        attempt: attempt.label,
        personalization: composeGoalBrief({
          maal,
          ...extras,
        }),
      };
    } catch (error) {
      lastError = error;
      const canContinue =
        i < uniqueAttempts.length - 1 &&
        (isSafetyBlock(error.message) || isMissingModel(error.message));
      console.warn(
        `[replicate] Attempt ${attempt.label} failed:`,
        error.message,
        canContinue ? "→ trying next" : "→ stop"
      );
      if (!canContinue) break;
    }
  }

  if (lastError) {
    lastError.message = friendlyError(lastError.message);
    throw lastError;
  }

  const err = new Error("Kunne ikke generere bilde.");
  err.status = 502;
  throw err;
}

module.exports = {
  generateWithReplicate,
  buildPrompt,
  sanitizeGoal,
  composeGoalBrief,
  getConfiguredModels,
  isValidModelRef,
  DEFAULT_MODEL,
  DEFAULT_FALLBACK_MODEL,
  SECONDARY_MODEL,
};
