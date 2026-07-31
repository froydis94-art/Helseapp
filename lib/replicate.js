const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120000;

// Max follows edit prompts better than Pro/Dev for body morphs.
const DEFAULT_MODEL = "black-forest-labs/flux-kontext-max";
const SECONDARY_MODEL = "black-forest-labs/flux-kontext-pro";
const TERTIARY_MODEL = "black-forest-labs/flux-kontext-dev";
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
    tertiaryModel: TERTIARY_MODEL,
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
    .slice(0, 280);
}

/** Remove clothing instructions that fight the source photo. */
function scrubClothingConflict(text) {
  return String(text || "")
    .replace(
      /\b(i|in)\s+(treningstøy|treningsklær|gym\s*wear|workout\s*clothes|sportswear)\b/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

const HORIZON_COPY = {
  "4w": {
    label: "about 4 weeks from now",
    change:
      "clear early progress: tighter waist, firmer core, slightly more muscle tone",
  },
  "8w": {
    label: "about 8 weeks from now",
    change:
      "obvious mid-plan change: leaner midsection, thicker arms/shoulders, clearer athletic shape",
  },
  "12w": {
    label: "about 3 months from now",
    change:
      "strong transformation: flat tight stomach, visible muscle definition, broader athletic shoulders",
  },
  "24w": {
    label: "about 6 months from now",
    change:
      "major recomposition: much lower body fat, clearly bigger muscles, athletic V-taper",
  },
  "18m": {
    label: "about 1.5 years from now",
    change:
      "dramatic long-term goal physique: lean muscular athletic body with defined abs, thick arms, strong legs",
  },
};

const FAT_COPY = {
  decrease:
    "clearly reduce soft body fat, especially around the waist and midsection",
  maintain: "keep overall body-fat level similar while reshaping muscle",
  increase:
    "add healthy bulk/mass with thicker muscle, even if the frame looks fuller",
};

const MUSCLE_COPY = {
  toned: "lean, athletic, toned muscle with clean definition (not bulky)",
  volume: "increase muscle volume and thickness in the target zones",
};

const ZONE_COPY = {
  overall:
    "reshape the full body silhouette: waist, core, arms, chest, shoulders and legs",
  abs: "priority: flatten and tighten the stomach; reduce belly softness; show firmer abs/obliques",
  upper:
    "priority: thicker arms (biceps/triceps), broader shoulders, fuller chest",
  lower: "priority: stronger glutes and legs with clearer athletic shape",
  posture:
    "priority: taller open posture with lifted chest, plus a clearly fitter leaner body",
};

function changeForDayCount(days) {
  if (days <= 35) return HORIZON_COPY["4w"].change;
  if (days <= 70) return HORIZON_COPY["8w"].change;
  if (days <= 120) return HORIZON_COPY["12w"].change;
  if (days <= 220) return HORIZON_COPY["24w"].change;
  return HORIZON_COPY["18m"].change;
}

function resolveHorizonInfo({
  horizon = "12w",
  horizonDate = "",
  occasionLabel = "",
}) {
  if (horizon === "custom" && horizonDate) {
    const target = new Date(`${horizonDate}T12:00:00`);
    const now = new Date();
    const days = Number.isNaN(target.getTime())
      ? 90
      : Math.max(7, Math.round((target - now) / 86400000));
    const occasion = occasionLabel
      ? ` for the occasion "${sanitizeGoal(occasionLabel)}"`
      : "";
    return {
      label: `in about ${days} days${occasion} (target date ${horizonDate})`,
      change: changeForDayCount(days),
      days,
    };
  }
  return {
    ...(HORIZON_COPY[horizon] || HORIZON_COPY["12w"]),
    days: null,
  };
}

/** Map legacy focus values onto the new zone axis. */
function normalizeZone(focus, zone) {
  if (zone && ZONE_COPY[zone]) return zone;
  const legacy = {
    overall: "overall",
    cardio: "overall",
    core: "abs",
    strength: "upper",
    posture: "posture",
  };
  return legacy[focus] || "overall";
}

function composeGoalBrief({
  maal,
  horizon = "12w",
  focus = "overall",
  zone,
  fat = "decrease",
  muscle = "toned",
  paceLabel = "",
  goalTitle = "",
  horizonDate = "",
  occasionLabel = "",
}) {
  const safeGoal = scrubClothingConflict(sanitizeGoal(maal));
  const horizonInfo = resolveHorizonInfo({
    horizon,
    horizonDate,
    occasionLabel,
  });
  const resolvedZone = normalizeZone(focus, zone);
  const fatInfo = FAT_COPY[fat] || FAT_COPY.decrease;
  const muscleInfo = MUSCLE_COPY[muscle] || MUSCLE_COPY.toned;
  const zoneInfo = ZONE_COPY[resolvedZone] || ZONE_COPY.overall;

  const parts = [
    `deadline: ${horizonInfo.label}`,
    `body-fat direction: ${fatInfo}`,
    `muscle style: ${muscleInfo}`,
    `target zone: ${zoneInfo}`,
  ];
  if (safeGoal) parts.push(`user notes: ${safeGoal}`);
  if (goalTitle) parts.push(`plan name: ${sanitizeGoal(goalTitle)}`);
  if (paceLabel) parts.push(`pace status: ${sanitizeGoal(paceLabel)}`);

  return {
    brief: parts.join(". "),
    horizonInfo,
    fatInfo,
    muscleInfo,
    zoneInfo,
    resolvedZone,
    safeGoal,
  };
}

/**
 * Short edit-first prompt. Kontext freezes the body if "keep identical" dominates.
 */
function buildPrompt(maal, intensity = "moderate", extras = {}) {
  const { brief, horizonInfo, fatInfo, muscleInfo, zoneInfo } =
    composeGoalBrief({
      maal,
      ...extras,
    });

  const force =
    intensity === "strong"
      ? "Make a LARGE unmistakable body change. Do not return a near-copy of the original physique."
      : intensity === "subtle"
        ? "Make a clearly noticeable body upgrade."
        : "Make an obvious athletic body transformation.";

  return [
    `Transform this person's body. ${horizonInfo.change}.`,
    `${zoneInfo}.`,
    `${fatInfo}.`,
    `${muscleInfo}.`,
    force,
    "The waist/midsection and muscle shape must look clearly different from the source photo.",
    "Keep the same face, hair, facial hair, skin tone, pose, framing, background, and exact clothing/skin coverage. Do not add clothes.",
    `Details: ${brief}.`,
    "Photorealistic smartphone photo, natural lighting, no text, no watermark.",
  ].join(" ");
}

function buildImg2ImgPrompt(maal, intensity = "moderate", extras = {}) {
  const { brief, horizonInfo, fatInfo, muscleInfo, zoneInfo } =
    composeGoalBrief({
      maal,
      ...extras,
    });
  const amount =
    intensity === "strong"
      ? "dramatic unmistakable"
      : intensity === "subtle"
        ? "clearly noticeable"
        : "obvious";

  return [
    `Same person ${horizonInfo.label}, ${amount} fitness body transformation.`,
    `${zoneInfo}. ${fatInfo}. ${muscleInfo}.`,
    `Goal details: ${brief}.`,
    "Much leaner or more muscular silhouette as requested. Do not copy the original soft body shape.",
    "Identical face, hair, pose, crop, background, and same clothing/skin coverage.",
    "Photorealistic, natural lighting, realistic skin.",
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
    "identical body",
    "unchanged physique",
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

function sdxlPromptStrength(intensity) {
  // High enough to morph body; Flux Kontext often returns near-copies.
  if (intensity === "strong") return 0.72;
  if (intensity === "subtle") return 0.48;
  return 0.6;
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
      safety_tolerance: 6,
      prompt_upsampling: true,
    };
  }

  return {
    prompt: buildImg2ImgPrompt(maal, intensity, extras),
    negative_prompt: buildNegativePrompt(),
    image: imageDataUri,
    prompt_strength: sdxlPromptStrength(intensity),
    num_inference_steps: 45,
    guidance_scale: 8.5,
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
  zone,
  fat,
  muscle,
  paceLabel,
  goalTitle,
  horizonDate,
  occasionLabel,
  token = process.env.REPLICATE_API_TOKEN,
  model,
  fallbackModel,
}) {
  const configured = getConfiguredModels();
  model = model || configured.model;
  fallbackModel = fallbackModel || configured.fallbackModel;
  const secondaryModel = configured.secondaryModel;
  const tertiaryModel = configured.tertiaryModel;
  const extras = {
    horizon,
    focus,
    zone,
    fat,
    muscle,
    paceLabel,
    goalTitle,
    horizonDate,
    occasionLabel,
  };

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

  // Strong morphs: try Kontext Max/Pro, then SDXL (real body change), then Dev.
  // Flux Dev often returns near-identical physiques — put it last.
  const attempts = [
    { model, label: "flux-max" },
    { model: secondaryModel, label: "flux-pro" },
    { model: fallbackModel, label: "sdxl-morph" },
    { model: tertiaryModel, label: "flux-dev" },
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
        usedFallback: attempt.label !== "flux-max",
        attempt: attempt.label,
        personalization: composeGoalBrief({
          maal,
          ...extras,
        }),
      };
    } catch (error) {
      lastError = error;
      const canContinue = i < uniqueAttempts.length - 1;
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
  TERTIARY_MODEL,
};
