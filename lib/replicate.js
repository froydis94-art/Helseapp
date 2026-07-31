const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120000;

// Flux Kontext Pro = photorealistic identity-preserving edits (quality bar).
// Max secondary. Dev next. SDXL only as last emergency with LOW strength.
const DEFAULT_MODEL = "black-forest-labs/flux-kontext-pro";
const SECONDARY_MODEL = "black-forest-labs/flux-kontext-max";
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

/** Notes must not override chip choices (e.g. "volum" vs Slank/tonet). */
function scrubNoteConflicts(notes, { fat, muscle }) {
  let text = String(notes || "");
  if (muscle === "toned") {
    text = text.replace(
      /\b(volum|volume|bulk|bulky|masse|massebygging|bodybuilder|huge|massive)\b/gi,
      ""
    );
  }
  if (fat === "decrease") {
    text = text.replace(/\b(bulk|bulk phase|massefase|øke fett)\b/gi, "");
  }
  return text.replace(/\s+/g, " ").replace(/^[,.\s]+|[,.\s]+$/g, "").trim();
}

const HORIZON_COPY = {
  "4w": {
    label: "about 4 weeks from now",
    change:
      "subtle but real early progress: slightly tighter waist and a bit more muscle tone — still a natural phone photo",
  },
  "8w": {
    label: "about 8 weeks from now",
    change:
      "clear realistic progress: leaner midsection and more defined arms/shoulders without looking exaggerated",
  },
  "12w": {
    label: "about 3 months from now",
    change:
      "noticeable realistic fitness progress: flatter stomach, clearer muscle definition, healthier athletic shape",
  },
  "24w": {
    label: "about 6 months from now",
    change:
      "strong but believable recomposition: clearly leaner waist and more defined athletic muscle while staying photorealistic",
  },
  "18m": {
    label: "about 1.5 years from now",
    change:
      "motivating long-term athletic progress: leaner and more developed physique that still looks like a real photograph of this person — not a comic or bodybuilder caricature",
  },
};

const FAT_COPY = {
  decrease:
    "reduce soft body fat modestly and realistically, especially around the waist",
  maintain: "keep body-fat level similar while improving muscle shape",
  increase:
    "add modest healthy mass with thicker muscle, still looking natural",
};

const MUSCLE_COPY = {
  toned:
    "lean toned athletic muscle with clean natural definition — not bulky, not bodybuilder, not exaggerated",
  volume:
    "slightly fuller natural muscle volume in the target zones — still realistic, not cartoonish hypertrophy",
};

const ZONE_COPY = {
  overall: "improve the full-body athletic silhouette in a realistic way",
  abs: "focus on a flatter tighter midsection with firmer natural abs — no carved CGI six-pack",
  upper:
    "focus on more defined natural arms, shoulders and chest — keep proportions believable",
  lower: "focus on stronger natural glutes and legs with realistic shape",
  posture:
    "improve upright athletic posture with open shoulders, plus a modestly fitter body",
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
  const safeGoal = scrubNoteConflicts(
    scrubClothingConflict(sanitizeGoal(maal)),
    { fat, muscle }
  );
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
 * Photorealistic Flux Kontext edit — identity first, realistic progress second.
 */
function buildPrompt(maal, intensity = "moderate", extras = {}) {
  const { brief, horizonInfo, fatInfo, muscleInfo, zoneInfo } =
    composeGoalBrief({
      maal,
      ...extras,
    });

  const force =
    intensity === "strong"
      ? "Apply a clearly visible, motivating fitness change that is still photorealistic and matches the selected parameters."
      : intensity === "subtle"
        ? "Apply a modest but noticeable realistic fitness upgrade matching the selected parameters."
        : "Apply an obvious, motivating but natural fitness upgrade matching the selected parameters.";

  return [
    "Edit this real photograph of a real person into a photorealistic fitness progress photo.",
    `Timeline: ${horizonInfo.label}. ${horizonInfo.change}.`,
    `${zoneInfo}.`,
    `${fatInfo}.`,
    `${muscleInfo}.`,
    force,
    "The progress should be easy to spot next to the original, especially in the selected focus zones.",
    "CRITICAL STYLE: must look like a real smartphone photo — natural skin texture, real lighting, real proportions.",
    "Do NOT make it look like a cartoon, comic, illustration, anime, CGI, 3D render, video-game character, or stylized art.",
    "Do NOT exaggerate muscles into bodybuilder or superhero proportions.",
    "Keep the same face, hair, facial hair, age, skin tone, pose, camera angle, framing, background, and exact clothing/skin coverage. Do not add clothes.",
    `Goal parameters: ${brief}.`,
    "No text, no watermark, no logo.",
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
      ? "clear realistic"
      : intensity === "subtle"
        ? "modest realistic"
        : "noticeable realistic";

  return [
    `Photorealistic smartphone photo of the exact same person ${horizonInfo.label}, ${amount} athletic progress.`,
    `${zoneInfo}. ${fatInfo}. ${muscleInfo}.`,
    `Parameters: ${brief}.`,
    "Natural skin, real proportions, same face and pose and background and clothing.",
    "Not a cartoon, comic, illustration, CGI, or stylized artwork.",
  ].join(" ");
}

function buildNegativePrompt() {
  return [
    "cartoon",
    "comic",
    "comic book",
    "illustration",
    "drawing",
    "anime",
    "manga",
    "3d render",
    "cgi",
    "plastic skin",
    "video game character",
    "low poly",
    "stylized",
    "pop art",
    "painting",
    "airbrushed",
    "glowing skin",
    "metallic",
    "bodybuilder caricature",
    "exaggerated muscles",
    "superhero physique",
    "different person",
    "face change",
    "face obscured",
    "blacked out face",
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

function sdxlPromptStrength(intensity) {
  // Keep LOW — high strength caused cartoon/comic outputs.
  if (intensity === "strong") return 0.32;
  if (intensity === "subtle") return 0.22;
  return 0.27;
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
      safety_tolerance: 5,
      // Upsampling can invent stylized/cartoon looks — keep off.
      prompt_upsampling: false,
    };
  }

  return {
    prompt: buildImg2ImgPrompt(maal, intensity, extras),
    negative_prompt: buildNegativePrompt(),
    image: imageDataUri,
    prompt_strength: sdxlPromptStrength(intensity),
    num_inference_steps: 35,
    guidance_scale: 6,
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

  // Prefer Flux for photorealism. SDXL last with low strength (high strength = cartoons).
  const attempts = [
    { model, label: "flux-pro" },
    { model: secondaryModel, label: "flux-max" },
    { model: tertiaryModel, label: "flux-dev" },
    { model: fallbackModel, label: "sdxl-emergency" },
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
        (isSafetyBlock(error.message) ||
          isMissingModel(error.message) ||
          /timeout|504|502|503/i.test(error.message || ""));
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
