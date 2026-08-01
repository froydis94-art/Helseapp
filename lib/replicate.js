const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 90000;

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
    return "very low body fat (~10%): deep muscle separation, dry midsection, still a real person — not CGI, not cartoon";
  }
  if (n < 16) {
    return "lean athletic body fat (~14%): tighter waist, clear upper-ab and oblique definition, sharper shoulder/arm separation, slightly leaner face — photorealistic, not contest shredded";
  }
  if (n < 19) {
    return "athletic lean body fat (~16–18%): visibly tighter waist than average, firmer flatter midsection with emerging ab outline, clearer delts/arms, less soft tissue on stomach — still natural smartphone photo";
  }
  if (n < 25) {
    return "average soft body fat (~20–24%): rounded softer midsection, milder muscle outlines, soft waist — not ripped";
  }
  if (n < 32) {
    return "higher soft body fat: fuller waist/abdomen and softer arms/chest with less muscle separation — do NOT look shredded or bodybuilder-lean";
  }
  if (n < 40) {
    return "high soft body fat (~35%): clearly soft midsection, thicker waist, soft limbs, limited muscle definition — realistic everyday body, never shredded";
  }
  return "very high soft body fat (~40%+): visibly soft and fuller abdomen/waist and torso, soft arms, no six-pack, no shredded look, no lean athlete physique — match a realistic high-body-fat appearance";
}

/** Translate numeric BF change into concrete before→after visual edits Flux can apply.
 *  Larger % jumps get stronger adjectives so Flux actually reshapes soft tissue.
 */
function bodyFatDeltaVisual(bfNow, bfGoal, fat) {
  const now = Number(bfNow);
  const goal = Number(bfGoal);
  if (!Number.isFinite(now) || !Number.isFinite(goal) || now <= 0 || goal <= 0) {
    return null;
  }
  const delta = Math.round((now - goal) * 10) / 10;
  const abs = Math.abs(delta);

  if (fat === "increase" || goal > now + 1) {
    const level = abs >= 8 ? "large" : abs >= 6 ? "clear" : abs >= 4 ? "noticeable" : "mild";
    return [
      `${level} INCREASE in soft body fat from ~${now}% to ~${goal}%`,
      "visibly fuller softer abdomen and thicker waist vs the source photo",
      "softer arms/chest with less muscle separation",
      "the output MUST look clearly softer/heavier than the input — not a near-copy",
    ].join("; ");
  }

  if (fat === "maintain" || abs < 1.5) {
    return `keep body-fat appearance near ~${goal}% with only subtle muscle-shape improvement`;
  }

  // Fat loss — scale adjectives by percentage-point drop.
  const bigDrop = abs >= 6;
  const midDrop = abs >= 4;
  const waistLine = bigDrop
    ? "Noticeable fat loss around the waist and lower abdomen, significantly tighter midsection, defined and chiseled abdominal muscles, reduced subcutaneous fat across the chest and torso"
    : midDrop
      ? "clear fat loss around the waist and lower abdomen, tighter midsection, firmer ab outline, reduced soft tissue on the torso"
      : "noticeable fat loss around the waist, tighter midsection, milder soft belly tissue";
  const muscleLine = bigDrop
    ? "Sharper muscle separation in the shoulders and arms, more athletic and leaner overall silhouette compared to the original photo"
    : midDrop
      ? "clearer muscle separation in shoulders and arms, leaner athletic silhouette vs the original photo"
      : "slightly clearer arm/shoulder definition and a leaner silhouette vs the original";
  const strength = bigDrop
    ? "STRONG"
    : midDrop
      ? "clear and obvious"
      : "noticeable";

  return [
    `${strength} fat-loss transformation from about ${now}% toward about ${goal}% body fat`,
    waistLine,
    muscleLine,
    `leaner athletic physique at about ${goal}% body fat`,
    "the output MUST be easy to tell apart from the source — do NOT return a near-identical copy",
  ].join("; ");
}

/** Identity lock + recomposition — keeps face while allowing body-comp change. */
function identityRecompositionLine(bfGoal, fat, absDelta) {
  const goal = Number(bfGoal);
  const pct = Number.isFinite(goal) ? ` at about ${goal}% body fat` : "";
  if (fat === "increase") {
    return `The exact same person from the original image, same face, same hair, same pose and lighting, but transformed with a softer fuller physique${pct}`;
  }
  if (fat === "maintain") {
    return `The exact same person from the original image, same face, same hair, same pose and lighting, with only subtle muscle-shape improvement${pct}`;
  }
  const leanWord =
    absDelta >= 6 ? "a clearly leaner athletic physique" : "a leaner athletic physique";
  return `The exact same person from the original image, same face, same hair, same pose and lighting, but transformed with ${leanWord}${pct}`;
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
  const delta = bodyFatDeltaVisual(bfNow, bfGoal, fat);
  if (fat === "increase") {
    return [
      look
        ? `INCREASE body fat toward about ${Number(bfGoal)}%: ${look}`
        : "increase soft body fat realistically with a fuller softer midsection — not a leaner physique",
      delta,
      "Soft adipose must be visibly higher than the source photo — prioritize this over any lean/shred/tone wording",
    ]
      .filter(Boolean)
      .join(". ");
  }
  if (fat === "maintain") {
    return look
      ? `KEEP body fat near about ${Number(bfGoal) || Number(bfNow)}%: ${look}`
      : "keep body-fat level similar while improving muscle shape modestly";
  }
  return [
    look
      ? `REDUCE body fat toward about ${Number(bfGoal)}%: ${look}`
      : "reduce soft body fat realistically, especially around the waist",
    delta,
    "leaner physique, visibly tighter waist, clearer natural ab definition for the target %, sharper muscle separation in arms/shoulders — photorealistic, not bodybuilder caricature",
  ]
    .filter(Boolean)
    .join(". ");
}

function horizonChangeForFat(horizonInfo, fat, bfNow, bfGoal) {
  const delta = bodyFatDeltaVisual(bfNow, bfGoal, fat);
  if (fat === "increase") {
    return delta || "realistic fuller softer physique with more soft mass — still the same person in a phone photo";
  }
  if (fat === "maintain") {
    return "subtle realistic change in muscle shape while keeping similar body-fat softness";
  }
  const now = Number(bfNow);
  const goal = Number(bfGoal);
  const abs =
    Number.isFinite(now) && Number.isFinite(goal) ? Math.abs(now - goal) : 0;
  if (abs >= 4) {
    return delta || horizonInfo.change;
  }
  return horizonInfo.change;
}

function zoneCopyForFat(zone, fat, bfGoal) {
  const goal = Number(bfGoal);
  if (fat === "increase" && zone === "abs") {
    return "fuller softer midsection with natural soft abdominal tissue — not flat abs, not a six-pack";
  }
  if (fat === "increase" && (zone === "chest" || zone === "arms" || zone === "shoulders" || zone === "back")) {
    return `softer fuller ${zone} with less muscle separation — keep proportions believable and photorealistic`;
  }
  if (fat === "decrease" && zone === "abs") {
    if (Number.isFinite(goal) && goal <= 16) {
      return "much tighter waist and firmer flatter midsection with clear upper-ab and oblique definition for ~16% body fat — natural photo abs, not CGI six-pack";
    }
    return "noticeably tighter waist and firmer midsection with reduced soft belly tissue — realistic definition";
  }
  if (fat === "decrease" && (zone === "arms" || zone === "shoulders" || zone === "chest" || zone === "back")) {
    return `leaner ${zone} with clearer natural muscle separation and less soft tissue — keep proportions believable`;
  }
  return ZONE_COPY[zone];
}

/**
 * Prompt Engine — translate all user parameters into one coherent visual story.
 * Flux Kontext has no denoising strength; intensity must come from language that
 * scales with BF delta, effort, horizon, and stays consistent across the whole body.
 */

function fatDeltaPoints(bfNow, bfGoal) {
  const now = Number(bfNow);
  const goal = Number(bfGoal);
  if (!Number.isFinite(now) || !Number.isFinite(goal)) return 0;
  return Math.round((now - goal) * 10) / 10;
}

/** 0=mild, 1=moderate, 2=marked, 3=dramatic — combined from BF jump + user effort + horizon. */
function transformIntensityLevel({ fat, bfNow, bfGoal, intensity, horizon }) {
  const delta = fatDeltaPoints(bfNow, bfGoal);
  const abs = Math.abs(delta);
  let level = 0;
  if (fat === "decrease" || fat === "increase") {
    if (abs >= 7) level = 3;
    else if (abs >= 4) level = 2;
    else if (abs >= 2) level = 1;
  }
  if (intensity === "strong") level = Math.min(3, level + 1);
  if (intensity === "subtle") level = Math.max(0, level - 1);
  if (horizon === "4w") level = Math.max(0, level - 1);
  if (horizon === "24w" || horizon === "18m") level = Math.min(3, level + 1);
  return level;
}

function getFatPhrase({ fat, bfNow, bfGoal, level }) {
  const now = Number(bfNow);
  const goal = Number(bfGoal);
  const abs = Math.abs(fatDeltaPoints(bfNow, bfGoal));
  if (fat === "maintain" || abs < 1.5) {
    return `similar body-fat softness near about ${goal || now}% with only subtle shape refinement`;
  }
  if (fat === "increase" || goal > now + 1) {
    const table = [
      "a mild increase in soft subcutaneous fat",
      "a moderate increase in soft body fat with a fuller midsection",
      "a clear increase in soft body fat — thicker waist and softer torso vs the source",
      "a large increase in soft body fat — obviously fuller softer silhouette vs the source",
    ];
    return `${table[level] || table[1]}, targeting about ${goal}% body fat`;
  }
  // Decrease — never jump to "shredded" unless target is very lean.
  const veryLeanTarget = Number.isFinite(goal) && goal <= 12;
  const table = [
    "a moderate reduction in subcutaneous fat — leaner silhouette and tighter waist",
    "a clear reduction in body fat — noticeably tighter midsection and less soft tissue on the torso",
    "a marked reduction in body fat — significantly tighter waist, firmer midsection, reduced soft tissue across chest and torso",
    veryLeanTarget
      ? "a dramatic fat reduction toward a very lean athletic look with sharp natural definition"
      : "a strong fat reduction — clearly leaner athletic silhouette, defined midsection appropriate for the target %, still photorealistic (not stage-shred caricature)",
  ];
  return `${table[level] || table[1]}, resulting in about ${goal}% body fat appearance`;
}

function getMusclePhrase({ fat, muscleKey, outcomes, level, bfGoal }) {
  if (fat === "increase" || Number(bfGoal) > 30) {
    return "a solid, softer, more powerful build with muscle present under soft tissue — never shredded or vascular";
  }
  const wantsVolume =
    muscleKey === "volume" ||
    (outcomes || []).includes("bulk") ||
    (outcomes || []).includes("vshape");
  const wantsShred = (outcomes || []).includes("shred");
  const leanTarget = Number(bfGoal) <= 16;

  if (wantsVolume) {
    const table = [
      "tighter fuller muscle shape under less soft tissue",
      "clearer athletic muscle volume with natural definition",
      "noticeably fuller athletic muscle with sharper separation",
      "stronger athletic muscle volume with deep but realistic definition",
    ];
    return table[level] || table[1];
  }
  if (wantsShred && leanTarget && level >= 2) {
    return "highly defined athletic muscle separation consistent with a lean body-fat target — still a real photo, not CGI";
  }
  const toned = [
    "a tighter toned silhouette",
    "a clearly toned athletic silhouette with better muscle outline",
    "a defined athletic muscle toning with sharper shoulders and arms",
    "a highly defined lean-athletic musculature matching the body-fat target",
  ];
  return toned[level] || toned[1];
}

function getZoneEmphasis(zones, fat, level) {
  const list = (zones || []).filter(Boolean);
  if (!list.length) return "the full athletic silhouette";
  const labels = list.map((z) => {
    if (z === "abs") return fat === "increase" ? "softer midsection" : "waist and midsection";
    if (z === "glutes") return "glutes";
    if (z === "thighs") return "thighs";
    if (z === "arms") return "arms";
    if (z === "chest") return "chest";
    if (z === "shoulders") return "shoulders";
    if (z === "back") return "back";
    if (z === "posture") return "upright posture";
    return z;
  });
  const focus = labels.join(", ");
  const boost =
    level >= 2
      ? "highly defined and sculpted in sync with the overall body-fat change"
      : "clearly improved in sync with the overall body-fat change";
  return `${focus} (${boost})`;
}

function getWholeBodySyncLine(fat, level) {
  if (fat === "increase") {
    return level >= 2
      ? "Whole-body sync: face, arms, chest, waist, and legs all look softer and fuller together — not only one body part."
      : "Whole-body sync: soft tissue increases consistently across torso and limbs, not only the stomach.";
  }
  if (fat === "maintain") {
    return "Whole-body sync: keep fat distribution similar while refining muscle shape evenly.";
  }
  return level >= 2
    ? "Whole-body sync: face slightly leaner, sharper shoulders/arms, tighter waist, firmer chest/torso, and legs that match the same lower body-fat — a TOTAL silhouette change, not an abs-only edit."
    : "Whole-body sync: midsection, arms, chest, and face all lean slightly together with the new body-fat level.";
}

function buildHolisticNarrative({
  fat,
  bfNow,
  bfGoal,
  intensity,
  horizon,
  muscleKey,
  outcomes,
  zones,
  shape,
  frame,
  gender,
}) {
  const level = transformIntensityLevel({
    fat,
    bfNow,
    bfGoal,
    intensity,
    horizon,
  });
  const fatPhrase = getFatPhrase({ fat, bfNow, bfGoal, level });
  const musclePhrase = getMusclePhrase({
    fat,
    muscleKey,
    outcomes,
    level,
    bfGoal,
  });
  const zoneLine = getZoneEmphasis(zones, fat, level);
  const shapeBit = SHAPE_COPY[shape]
    ? `Preserve bone-structure genetics (${shape}): ${SHAPE_COPY[shape]}. Soft tissue and definition change with body composition.`
    : "";
  const frameBit = FRAME_COPY[frame] || FRAME_COPY.average;
  const genderBit =
    gender === "male" || gender === "female"
      ? `Present as a ${gender} physique matching the source photo.`
      : "";
  const goal = Number(bfGoal);
  const identity = identityRecompositionLine(
    bfGoal,
    fat,
    Math.abs(fatDeltaPoints(bfNow, bfGoal))
  );

  const story = [
    identity + ".",
    "This is a TOTAL body-composition transformation of the same person (same lighting interaction style as the source).",
    `The subject shows ${fatPhrase}, resulting in ${musclePhrase}.`,
    getWholeBodySyncLine(fat, level),
    `Specific emphasis on ${zoneLine}, still consistent with about ${Number.isFinite(goal) ? goal : "the target"}% body fat across the whole body.`,
    `Body frame: ${frameBit}.`,
    shapeBit,
    genderBit,
    "Do NOT return a near-identical copy of the source. Soft-tissue change must be readable at a glance.",
  ]
    .filter(Boolean)
    .join(" ");

  return { story, level, fatPhrase, musclePhrase };
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
  horizonInfo.change = horizonChangeForFat(horizonInfo, fat, bfNow, bfGoal);
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
    .map((z) => zoneCopyForFat(z, fat, bfGoal) || ZONE_COPY[z])
    .filter(Boolean)
    .join("; ");
  const bfLook = bodyFatLook(bfGoal);
  const bfDelta = bodyFatDeltaVisual(bfNow, bfGoal, fat);

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
  if (bfDelta) {
    parts.push(`REQUIRED visual delta vs source photo: ${bfDelta}`);
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
    bfDelta,
    safeGoal,
    fat,
    bfNow: Number(bfNow),
    bfGoal: bfB,
    muscleKey,
    frame,
    shape,
    gender,
  };
}

/**
 * Photorealistic Flux Kontext edit.
 * Holistic Prompt Engine: parameters form one synchronized body story.
 * Flux has no denoising-strength knob — intensity is language + scale tables.
 */
function buildPrompt(maal, intensity = "moderate", extras = {}) {
  const briefData = composeGoalBrief({
    maal,
    ...extras,
    intensity,
  });
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
    bfDelta,
    fat,
    bfNow,
    bfGoal,
    muscleKey,
    resolvedZones,
    resolvedOutcomes,
    frame,
    shape,
    gender,
  } = briefData;

  const now = Number(bfNow);
  const goal = Number(bfGoal);
  const absDelta =
    Number.isFinite(now) && Number.isFinite(goal) ? Math.abs(now - goal) : 0;
  const raisingFat = fat === "increase" || goal >= 28;
  const meaningfulLoss = fat === "decrease" && absDelta >= 3;

  const { story, level } = buildHolisticNarrative({
    fat,
    bfNow,
    bfGoal,
    intensity,
    horizon: extras.horizon || "12w",
    muscleKey,
    outcomes: resolvedOutcomes,
    zones: resolvedZones,
    shape,
    frame,
    gender,
  });

  let force;
  if (raisingFat) {
    force =
      level >= 2
        ? "Apply a CLEARLY VISIBLE realistic body-fat increase matching the target % across the whole body. Do not output a near-copy."
        : "Apply a noticeable realistic increase in soft body fat matching the selected % — not leaner.";
  } else if (meaningfulLoss) {
    force =
      level >= 2
        ? "Apply a STRONGLY VISIBLE photorealistic fat-loss recomposition of the ENTIRE silhouette matching the target %. Difference from source must be obvious at a glance."
        : "Apply a clear visible fat-loss change matching the target % across midsection, arms, and torso — not an abs-only patch, not a near-copy.";
  } else {
    force =
      intensity === "strong"
        ? "Apply a clearly visible, motivating but realistic full-body change matching the selected parameters."
        : intensity === "subtle"
          ? "Apply a modest but noticeable realistic full-body change matching the selected parameters."
          : "Apply an obvious, motivating but natural full-body change matching the selected parameters.";
  }

  return [
    "Edit this real photograph of a real person into a photorealistic future photo.",
    "HOLISTIC TRANSFORM:",
    story,
    `CRITICAL BODY FAT DETAIL: ${fatInfo}`,
    bfDelta ? `DELTA DETAIL: ${bfDelta}.` : "",
    bfLook ? `TARGET LOOK: ${bfLook}.` : "",
    raisingFat
      ? "FORBIDDEN: shredded abs, vascularity, contest lean, bodybuilder cut."
      : meaningfulLoss
        ? "FORBIDDEN: near-identical copy, unchanged waist, abs-only edit with untouched arms/face/torso. Allowed: realistic athletic lean definition for the target %."
        : "Do NOT invent an extreme shredded contest physique unless the target body-fat % is very low.",
    `Timeline: ${horizonInfo.label}. ${horizonInfo.change}.`,
    `Zone emphasis (still whole-body synced): ${zoneInfo}.`,
    `Muscle cue: ${muscleInfo}.`,
    frameInfo ? `Frame: ${frameInfo}.` : "",
    shapeInfo ? `Shape genetics: ${shapeInfo}.` : "",
    outcomeInfo ? `Motivation outcomes (secondary): ${outcomeInfo}.` : "",
    force,
    "CRITICAL STYLE: real smartphone photo — natural skin, real lighting, real proportions. No cartoon/CGI/anime.",
    "Do NOT exaggerate into bodybuilder or superhero proportions.",
    "Keep identity: same recognizable face, hair, facial hair style, age, skin tone, pose, camera angle, framing, background, clothing/skin coverage. Do not add clothes.",
    `Parameter brief: ${brief}.`,
    "No text, no watermark, no logo.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildImg2ImgPrompt(maal, intensity = "moderate", extras = {}) {
  const briefData = composeGoalBrief({
    maal,
    ...extras,
    intensity,
  });
  const {
    brief,
    horizonInfo,
    fatInfo,
    muscleInfo,
    zoneInfo,
    shapeInfo,
    outcomeInfo,
    bfLook,
    bfDelta,
    fat,
    bfNow,
    bfGoal,
    muscleKey,
    resolvedZones,
    resolvedOutcomes,
    frame,
    shape,
    gender,
  } = briefData;

  const { story, level } = buildHolisticNarrative({
    fat,
    bfNow,
    bfGoal,
    intensity,
    horizon: extras.horizon || "12w",
    muscleKey,
    outcomes: resolvedOutcomes,
    zones: resolvedZones,
    shape,
    frame,
    gender,
  });
  const amount =
    level >= 2
      ? "clear strongly visible realistic"
      : intensity === "subtle"
        ? "modest realistic"
        : "noticeable realistic";

  return [
    `Photorealistic smartphone photo of the exact same person ${horizonInfo.label}, ${amount} full-body recomposition.`,
    story,
    `${fatInfo}.`,
    bfDelta ? `Transform: ${bfDelta}.` : "",
    bfLook ? `Must look like: ${bfLook}.` : "",
    `${zoneInfo}. ${muscleInfo}.`,
    shapeInfo ? `Shape: ${shapeInfo}.` : "",
    outcomeInfo ? `Outcomes: ${outcomeInfo}.` : "",
    `Parameters: ${brief}.`,
    "Natural skin, real proportions, same identity and pose and background and clothing.",
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

function sdxlPromptStrength(intensity, extras = {}) {
  // Keep moderate — high strength caused cartoon/comic outputs.
  // Nudge up slightly for meaningful fat-loss so SDXL emergency isn't a near-copy.
  const now = Number(extras.bfNow);
  const goal = Number(extras.bfGoal);
  const abs =
    Number.isFinite(now) && Number.isFinite(goal) ? Math.abs(now - goal) : 0;
  const fatLossBoost =
    extras.fat === "decrease" && abs >= 4 ? 0.06 : 0;
  if (intensity === "strong") return Math.min(0.4, 0.34 + fatLossBoost);
  if (intensity === "subtle") return Math.min(0.34, 0.24 + fatLossBoost);
  return Math.min(0.37, 0.29 + fatLossBoost);
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
    prompt_strength: sdxlPromptStrength(intensity, extras),
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
