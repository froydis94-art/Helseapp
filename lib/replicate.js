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
function scrubNoteConflicts(notes, { fat, muscle, bfGoal }) {
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
  if (fat === "increase" || (Number(bfGoal) >= 28)) {
    text = text.replace(
      /\b(shred(ded|de)?|ripped|cut|lean|leaner|vascular|six[- ]?pack|abs|toned|definition|definerte|slank|slankere)\b/gi,
      ""
    );
  }
  return text.replace(/\s+/g, " ").replace(/^[,.\s]+|[,.\s]+$/g, "").trim();
}

/** Rough visual cue for a body-fat % — must dominate conflicting "shred/lean" goals. */
function bodyFatLook(bf) {
  const n = Number(bf);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 12) {
    return "very low body fat with clear muscle separation and little soft tissue — still a real person, not CGI";
  }
  if (n < 18) {
    return "athletic lean body fat: some soft tissue remains, natural muscle shape visible but not extreme shredded contest look";
  }
  if (n < 25) {
    return "average soft body fat: rounded midsection and softer muscle outlines, not ripped or vascular";
  }
  if (n < 32) {
    return "higher soft body fat: fuller waist/abdomen and softer arms/chest with less muscle separation — do NOT look shredded or bodybuilder-lean";
  }
  if (n < 40) {
    return "high soft body fat (~35%): clearly soft midsection, thicker waist, soft limbs, limited muscle definition — realistic everyday body, never shredded";
  }
  return "very high soft body fat (~40%+): visibly soft and fuller abdomen/waist and torso, soft arms, no six-pack, no shredded look, no lean athlete physique — match a realistic high-body-fat appearance";
}

const LEAN_OUTCOMES = new Set([
  "leaner",
  "shred",
  "lighter",
  "flatMid",
  "endurance",
  "tone",
]);

function resolveOutcomesAgainstFat(outcomes, fat, bfNow, bfGoal) {
  let list = normalizeOutcomes(outcomes);
  const goal = Number(bfGoal);
  const now = Number(bfNow);
  const raisingFat =
    fat === "increase" ||
    (Number.isFinite(goal) && Number.isFinite(now) && goal > now + 1);
  const highFatGoal = Number.isFinite(goal) && goal >= 28;

  if (raisingFat || highFatGoal) {
    list = list.filter((o) => !LEAN_OUTCOMES.has(o));
    if (!list.length) list = ["stronger", "health"];
  }
  if (fat === "decrease" || (Number.isFinite(goal) && Number.isFinite(now) && goal < now - 1)) {
    list = list.filter((o) => o !== "bulk");
  }
  return list;
}

function fatDirectionCopy(fat, bfNow, bfGoal) {
  const look = bodyFatLook(bfGoal);
  if (fat === "increase") {
    return look
      ? `INCREASE body fat toward about ${Number(bfGoal)}%: ${look}. Soft adipose must be visibly higher than the source photo — prioritize this over any lean/shred/tone wording`
      : "increase soft body fat realistically with a fuller softer midsection — not a leaner physique";
  }
  if (fat === "maintain") {
    return look
      ? `KEEP body fat near about ${Number(bfGoal) || Number(bfNow)}%: ${look}`
      : "keep body-fat level similar while improving muscle shape modestly";
  }
  return look
    ? `REDUCE body fat toward about ${Number(bfGoal)}%: ${look}. Soft tissue reduction must stay photorealistic — no extreme shredded contest look unless the target % is very low`
    : "reduce soft body fat modestly and realistically, especially around the waist";
}

function horizonChangeForFat(horizonInfo, fat, bfGoal) {
  if (fat === "increase") {
    const look = bodyFatLook(bfGoal);
    return look
      ? `realistic change matching higher body fat: ${look}`
      : "realistic fuller softer physique with more soft mass — still the same person in a phone photo";
  }
  if (fat === "maintain") {
    return "subtle realistic change in muscle shape while keeping similar body-fat softness";
  }
  return horizonInfo.change;
}

function zoneCopyForFat(zone, fat) {
  if (fat === "increase" && zone === "abs") {
    return "fuller softer midsection with natural soft abdominal tissue — not flat abs, not a six-pack";
  }
  if (fat === "increase" && (zone === "chest" || zone === "arms" || zone === "shoulders" || zone === "back")) {
    return `softer fuller ${zone} with less muscle separation — keep proportions believable and photorealistic`;
  }
  return ZONE_COPY[zone];
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
    "increase soft body fat realistically with a fuller softer midsection and less muscle definition — not leaner, not shredded",
};

const MUSCLE_COPY = {
  toned:
    "natural muscle under realistic soft tissue for the target body-fat level — not bulky, not bodybuilder, not exaggerated",
  volume:
    "slightly fuller natural muscle volume under realistic soft tissue for the target body-fat — still realistic, not cartoonish hypertrophy",
  softPowerful:
    "solid and powerful build with a softer, bulkier physique under higher body fat — muscle present but covered by soft tissue, never shredded or vascular",
};

const FRAME_COPY = {
  narrow:
    "naturally narrower bone frame — keep limbs and joints looking slender; do not invent a wider skeleton",
  average: "average bone frame — keep natural skeletal proportions",
  wide:
    "naturally wider bone frame — keep a solid silhouette without cartoon bulk",
};

const SHAPE_COPY = {
  ecto:
    "ectomorph-lean starting silhouette (narrower shoulders/hips, slender limbs) — improve fitness while preserving that bone structure",
  meso:
    "mesomorph athletic V-taper tendency (broader shoulders, narrower waist) — enhance definition while keeping identity",
  endo:
    "endomorph-solid starting silhouette (stockier midsection tendency) — improve fitness realistically without changing bone structure",
  hourglass:
    "hourglass proportions (shoulders and hips similar width, defined waist) — keep that silhouette recognizable",
  pear:
    "pear / triangle proportions (hips/thighs fuller than shoulders) — keep lower-body structure recognizable while improving fitness",
  apple:
    "apple / upper-body-dominant proportions (fuller midsection relative to hips) — improve midsection realistically without changing bone structure",
  rectangle:
    "rectangular / column proportions (shoulders, waist, hips similar width) — keep even silhouette, add subtle athletic definition",
  spoon:
    "spoon / pear-variant proportions with fuller outer hips — keep that hip structure recognizable",
  athletic:
    "balanced athletic proportions — keep identity and skeletal structure while improving fitness",
};

const OUTCOME_COPY = {
  stronger: "look stronger and more capable in a natural athletic way",
  leaner: "look leaner with less soft fat, still photorealistic",
  tone: "more toned / tighter muscle appearance without bulk",
  bulk: "slightly more muscle volume in a natural, non-exaggerated way",
  shred: "more shredded definition while staying like a real photo of this person",
  lighter: "visually lighter / less heavy appearance in a realistic way",
  performance: "more athletic performance-ready physique cues (upright, capable)",
  endurance: "leaner endurance-athlete cues without extreme thinness",
  curves: "slightly more feminine athletic curves while keeping identity",
  vshape: "slightly clearer V-taper (shoulders vs waist) without caricature",
  confidence: "healthier, more confident athletic presence in the photo",
  balance:
    "more balanced upper-to-lower body proportions while preserving bone structure",
  hourglassFx:
    "subtly enhanced hourglass silhouette (shoulders/hips vs waist) without changing identity",
  flatMid: "tighter flatter midsection in a realistic photorealistic way",
  health: "healthier athletic presence with natural strength cues",
};

const ZONE_COPY = {
  overall: "improve the full-body athletic silhouette in a realistic way",
  abs: "flatter tighter midsection with firmer natural abs — no carved CGI six-pack",
  glutes: "stronger, more athletic glute shape with realistic proportions",
  thighs: "stronger, more athletic thighs with realistic shape",
  arms: "more defined natural arms (biceps/triceps) — keep proportions believable",
  chest: "fuller, more athletic chest — still photorealistic",
  shoulders:
    "more defined natural shoulders and upper torso — keep proportions believable",
  back: "stronger, more athletic upper/mid back definition — keep proportions believable",
  upper:
    "more defined natural arms, shoulders and chest — keep proportions believable",
  lower: "stronger natural glutes and legs with realistic shape",
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

function normalizeZones(focus, zone) {
  let list = [];
  if (Array.isArray(zone)) list = zone.map(String);
  else if (typeof zone === "string" && zone.trim()) {
    list = zone.split(/[,\s]+/).filter(Boolean);
  }
  list = list.filter((z) => ZONE_COPY[z]);
  if (list.length) return [...new Set(list)];

  const legacy = {
    overall: ["overall"],
    cardio: ["overall"],
    core: ["abs"],
    strength: ["arms", "chest"],
    posture: ["posture"],
  };
  return legacy[focus] || ["abs"];
}

function normalizeOutcomes(outcomes) {
  let list = [];
  if (Array.isArray(outcomes)) list = outcomes.map(String);
  else if (typeof outcomes === "string" && outcomes.trim()) {
    list = outcomes.split(/[,\s]+/).filter(Boolean);
  }
  list = list.filter((o) => OUTCOME_COPY[o]);
  return list.length ? [...new Set(list)] : ["stronger"];
}

function deriveMuscleFromOutcomes(outcomes, muscle) {
  if (muscle === "volume" || muscle === "toned") return muscle;
  const list = normalizeOutcomes(outcomes);
  if (list.includes("bulk") || list.includes("vshape")) return "volume";
  return "toned";
}

function composeGoalBrief({
  maal,
  horizon = "12w",
  focus = "overall",
  zone,
  zones,
  fat = "decrease",
  muscle = "toned",
  gender = "",
  frame = "average",
  shape = "",
  outcomes,
  bmi,
  bmiAdjusted,
  bfNow,
  bfGoal,
  medicine = false,
  paceLabel = "",
  goalTitle = "",
  horizonDate = "",
  occasionLabel = "",
}) {
  const resolvedOutcomes = resolveOutcomesAgainstFat(
    outcomes,
    fat,
    bfNow,
    bfGoal
  );
  const resolvedMuscle = deriveMuscleFromOutcomes(resolvedOutcomes, muscle);
  const goalBf = Number(bfGoal);
  const highSoftFat =
    fat === "increase" || (Number.isFinite(goalBf) && goalBf > 30);
  // High BF% overrides shredded/athletic muscle look (Gemini-style guard).
  let muscleKey = resolvedMuscle;
  let muscleInfo;
  if (highSoftFat) {
    muscleKey = "softPowerful";
    muscleInfo = MUSCLE_COPY.softPowerful;
  } else if (Number.isFinite(goalBf) && goalBf >= 25) {
    muscleKey = "volume";
    muscleInfo = MUSCLE_COPY.volume;
  } else {
    muscleInfo = MUSCLE_COPY[muscleKey] || MUSCLE_COPY.toned;
  }
  const safeGoal = scrubNoteConflicts(
    scrubClothingConflict(sanitizeGoal(maal)),
    { fat, muscle: highSoftFat ? "volume" : muscleKey, bfGoal }
  );
  const horizonInfo = resolveHorizonInfo({
    horizon,
    horizonDate,
    occasionLabel,
  });
  horizonInfo.change = horizonChangeForFat(horizonInfo, fat, bfGoal);
  const resolvedZones = normalizeZones(focus, zones || zone);
  const fatInfo = fatDirectionCopy(fat, bfNow, bfGoal);
  const frameInfo = FRAME_COPY[frame] || FRAME_COPY.average;
  let shapeInfo = SHAPE_COPY[shape] || "";
  if (shapeInfo && highSoftFat) {
    shapeInfo = `${shapeInfo}. Soft tissue volume increases with the body-fat target — do not keep a lean V-taper / shredded look`;
  }
  const outcomeInfo = resolvedOutcomes
    .map((o) => OUTCOME_COPY[o])
    .filter(Boolean)
    .join("; ");
  const zoneInfo = resolvedZones
    .map((z) => zoneCopyForFat(z, fat) || ZONE_COPY[z])
    .filter(Boolean)
    .join("; ");
  const bfLook = bodyFatLook(bfGoal);

  const parts = [
    `deadline: ${horizonInfo.label}`,
    `PRIORITY body-fat appearance: ${fatInfo}`,
    `muscle style: ${muscleInfo}`,
    `body frame: ${frameInfo}`,
    `target zones: ${zoneInfo || ZONE_COPY.overall}`,
  ];
  if (Number.isFinite(goalBf) && goalBf > 0) {
    parts.push(`body fat around ${goalBf}%`);
  }
  if (bfLook) {
    parts.push(`visual body-fat target must match: ${bfLook}`);
  }
  if (shapeInfo) {
    parts.push(
      `preserve bone-structure body shape (${shape}): ${shapeInfo}`
    );
  }
  if (outcomeInfo) {
    parts.push(
      `secondary motivation outcomes (never override body-fat %): ${outcomeInfo}`
    );
  }
  if (gender === "male" || gender === "female") {
    parts.push(`present as ${gender} physique cues matching the source photo`);
  }
  const bfA = Number(bfNow);
  const bfB = Number(bfGoal);
  if (Number.isFinite(bfA) && Number.isFinite(bfB) && bfA > 0 && bfB > 0) {
    parts.push(
      `body-fat change from about ${bfA}% toward about ${bfB}% — the photo must look like ~${bfB}% body fat`
    );
  }
  const bmiN = Number(bmi);
  if (Number.isFinite(bmiN) && bmiN > 0) {
    const adj = Number(bmiAdjusted);
    parts.push(
      Number.isFinite(adj) && adj !== bmiN
        ? `BMI about ${bmiN} (frame-adjusted ~${adj}) — motivational context only`
        : `BMI about ${bmiN} — motivational context only`
    );
  }
  if (medicine && fat === "decrease") {
    parts.push(
      "pace may reflect medically assisted weight-loss timelines — still keep the photo realistic"
    );
  }
  if (safeGoal) parts.push(`user notes: ${safeGoal}`);
  if (goalTitle) parts.push(`plan name: ${sanitizeGoal(goalTitle)}`);
  if (paceLabel) parts.push(`pace status: ${sanitizeGoal(paceLabel)}`);

  return {
    brief: parts.join(". "),
    horizonInfo,
    fatInfo,
    muscleInfo,
    frameInfo,
    shapeInfo,
    outcomeInfo,
    zoneInfo: zoneInfo || ZONE_COPY.overall,
    resolvedZones,
    resolvedOutcomes,
    bfLook,
    safeGoal,
    fat,
    bfGoal: bfB,
  };
}

/**
 * Photorealistic Flux Kontext edit — identity first, realistic parameter match second.
 */
function buildPrompt(maal, intensity = "moderate", extras = {}) {
  const {
    brief,
    horizonInfo,
    fatInfo,
    muscleInfo,
    zoneInfo,
    shapeInfo,
    outcomeInfo,
    frameInfo,
    bfLook,
    fat,
    bfGoal,
  } = composeGoalBrief({
    maal,
    ...extras,
  });

  const raisingFat = fat === "increase" || Number(bfGoal) >= 28;
  const force = raisingFat
    ? intensity === "strong"
      ? "Apply a clearly visible, realistic body-fat increase matching the target % — softer fuller midsection, still photorealistic."
      : "Apply a noticeable realistic increase in soft body fat matching the selected % — not leaner."
    : intensity === "strong"
      ? "Apply a clearly visible, motivating but realistic body change that matches the selected body-fat % and parameters."
      : intensity === "subtle"
        ? "Apply a modest but noticeable realistic change matching the selected body-fat % and parameters."
        : "Apply an obvious, motivating but natural change matching the selected body-fat % and parameters.";

  return [
    "Edit this real photograph of a real person into a photorealistic future photo that matches the user's numeric body-fat goal.",
    `CRITICAL BODY FAT: ${fatInfo}`,
    bfLook ? `The result MUST look like: ${bfLook}.` : "",
    raisingFat
      ? "FORBIDDEN for this request: shredded abs, vascularity, contest lean, bodybuilder cut, low body-fat athlete look."
      : "Do NOT invent an extreme shredded contest physique unless the target body-fat % is very low.",
    `Timeline: ${horizonInfo.label}. ${horizonInfo.change}.`,
    `${zoneInfo}.`,
    `${muscleInfo}.`,
    frameInfo ? `${frameInfo}.` : "",
    shapeInfo
      ? `Keep the same underlying body-shape genetics: ${shapeInfo}.`
      : "",
    outcomeInfo
      ? `Secondary outcomes only (body-fat % wins if conflict): ${outcomeInfo}.`
      : "",
    force,
    "REALISM RULE: the change must be believable for this person and the chosen body-fat percentage — prioritize realistic soft-tissue appearance over motivational flattery.",
    "The progress should be easy to spot next to the original, especially in the selected focus zones, while staying true to the body-fat target.",
    "CRITICAL STYLE: must look like a real smartphone photo — natural skin texture, real lighting, real proportions.",
    "Do NOT make it look like a cartoon, comic, illustration, anime, CGI, 3D render, video-game character, or stylized art.",
    "Do NOT exaggerate muscles into bodybuilder or superhero proportions.",
    "Keep the same face, hair, facial hair, age, skin tone, pose, camera angle, framing, background, and exact clothing/skin coverage. Do not add clothes.",
    `Goal parameters: ${brief}.`,
    "No text, no watermark, no logo.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildImg2ImgPrompt(maal, intensity = "moderate", extras = {}) {
  const { brief, horizonInfo, fatInfo, muscleInfo, zoneInfo, shapeInfo, outcomeInfo, bfLook, fat, bfGoal } =
    composeGoalBrief({
      maal,
      ...extras,
    });
  const raisingFat = fat === "increase" || Number(bfGoal) >= 28;
  const amount =
    intensity === "strong"
      ? "clear realistic"
      : intensity === "subtle"
        ? "modest realistic"
        : "noticeable realistic";

  return [
    `Photorealistic smartphone photo of the exact same person ${horizonInfo.label}, ${amount} change matching body-fat goal.`,
    `${fatInfo}.`,
    bfLook ? `Must look like: ${bfLook}.` : "",
    raisingFat
      ? "Not shredded, not lean athlete, not low body fat."
      : "",
    `${zoneInfo}. ${muscleInfo}.`,
    shapeInfo ? `Preserve body-shape genetics: ${shapeInfo}.` : "",
    outcomeInfo ? `Secondary outcomes: ${outcomeInfo}.` : "",
    `Parameters: ${brief}.`,
    "Natural skin, real proportions, same face and pose and background and clothing.",
    "Not a cartoon, comic, illustration, CGI, or stylized artwork.",
  ]
    .filter(Boolean)
    .join(" ");
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
  zones,
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
    zones,
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
