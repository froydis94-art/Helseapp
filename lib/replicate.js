const {
  byggTransformasjonsDetaljer,
} = require("./transformasjonLogikk");

const POLL_INTERVAL_MS = 2000;
// Per-attempt budget — short enough that Max hang + Dev still finish under cascade budget.
// Old 50s×3–4 could still hit client abort (170s) / Vercel (180s) when models stall in starting.
const ATTEMPT_POLL_TIMEOUT_MS = 35000;
// Cap Prefer: wait so create returns quickly for fail-fast / poll (not ~60s sync hold).
const CREATE_WAIT_SECONDS = 12;
// Whole Max→…→Dev cascade wall-clock budget (under Vercel 180s and client ~175s).
const CASCADE_BUDGET_MS = 155000;
// Do not start another model with less remaining than this.
const MIN_ATTEMPT_MS = 10000;

// Flux Kontext Pro = default for mild edits (cost control).
// Max = primary when body-comp change is demanding (better prompt adherence).
// Dev next. SDXL only as last emergency.
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
    ? "The waistline is markedly narrower and tighter; subcutaneous fat across the lower abdomen and torso is significantly and visibly reduced; abdominal muscles and core definition are sharply sculpted; love handles clearly reduced"
    : midDrop
      ? "The waistline is markedly narrower and tighter; subcutaneous fat across the lower abdomen and torso is significantly and visibly reduced; clearer core definition"
      : "noticeable fat loss around the waist, tighter midsection, milder soft belly tissue";
  const muscleLine = bigDrop
    ? "Clearer athletic muscle separation in the shoulders and arms, leaner overall silhouette compared to the original photo"
    : midDrop
      ? "clearer muscle separation in shoulders and arms, leaner athletic silhouette vs the original photo"
      : "slightly clearer arm/shoulder definition and a leaner silhouette vs the original";
  const strength = bigDrop
    ? "STRONG athletic"
    : midDrop
      ? "clear and obvious athletic"
      : "noticeable athletic";

  return [
    `${strength} fat-loss progress from about ${now}% toward about ${goal}% body fat`,
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
  const label = horizonInfo?.label || "the selected timeline";
  const months = Number(horizonInfo?.months) || 3;
  const extreme = leggTilEkstremeVisuelleMarkører(months, fat, bfGoal);
  if (extreme) {
    return `${extreme} Horizon force (${label}, ~${months} months): change magnitude must match this long timeline — not a near-copy.`;
  }
  if (fat === "increase") {
    const base =
      delta ||
      "realistic fuller softer physique with more soft mass — still the same person in a phone photo";
    return `${base}. Horizon realism (${label}): soft-tissue increase must look believable for that timeframe — not overnight bloating`;
  }
  if (fat === "maintain") {
    return `subtle realistic change in muscle shape while keeping similar body-fat softness — believable for ${label}`;
  }
  const now = Number(bfNow);
  const goal = Number(bfGoal);
  const abs =
    Number.isFinite(now) && Number.isFinite(goal) ? Math.abs(now - goal) : 0;
  if (months <= 3) {
    return `${horizonInfo.change}. Short timeline (${label}): prefer slightly tighter / subtle fat reduction / toning — still visibly different from the source.`;
  }
  if (abs >= 4) {
    const core = delta || horizonInfo.change;
    return `${core}. Horizon realism (${label}, ~${months} months): the fat-loss delta must look earned and photorealistic for that timeframe — motivating, not overnight magic or CGI`;
  }
  return `${horizonInfo.change} — keep progress believable for ${label} (~${months} months)`;
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
      return "much tighter waist, reduced love handles and lower-belly fat, firmer flatter midsection with clear upper-ab and oblique definition for ~16% body fat — natural photo abs, not CGI six-pack";
    }
    return "noticeably tighter waist, reduced love handles and lower-belly soft tissue, firmer midsection — realistic definition";
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

/**
 * Route demanding body-comp edits to Flux Kontext Max (~2× cost, stronger adherence).
 * Mild edits stay on Pro for cost control.
 */
function needsMaxEdit({
  fat = "decrease",
  bfNow,
  bfGoal,
  intensity = "moderate",
  zones,
  horizon,
  horizonDate,
  months,
} = {}) {
  const abs = Math.abs(fatDeltaPoints(bfNow, bfGoal));
  const zoneCount = Array.isArray(zones)
    ? zones.length
    : String(zones || "")
        .split(/[,\s]+/)
        .filter(Boolean).length;
  const m =
    Number.isFinite(Number(months)) && Number(months) > 0
      ? Number(months)
      : horizonToMonths(horizon, horizonDate);

  // Large BF jump either direction
  if ((fat === "decrease" || fat === "increase") && abs >= 4) return true;
  // Strict effort + meaningful change
  if (intensity === "strong" && abs >= 2) return true;
  // Strict + multi-zone focus on a real transform
  if (intensity === "strong" && fat !== "maintain" && zoneCount >= 4) return true;
  // High target BF increase (soft physique is hard for models)
  if (fat === "increase" && Number(bfGoal) >= 28) return true;
  // Long timeline with real body-comp change needs Max adherence
  if (m >= 12 && fat !== "maintain" && abs >= 2) return true;

  return false;
}

/** Approximate months for a horizon key or custom date (timeline must scale the prompt). */
function horizonToMonths(horizon = "12w", horizonDate = "") {
  const fixed = { "4w": 1, "8w": 2, "12w": 3, "24w": 6, "18m": 18 };
  if (horizon === "custom" && horizonDate) {
    const target = new Date(`${horizonDate}T12:00:00`);
    if (!Number.isNaN(target.getTime())) {
      const days = Math.max(7, Math.round((target - new Date()) / 86400000));
      return Math.max(0.25, Math.round((days / 30) * 10) / 10);
    }
  }
  return fixed[horizon] || 3;
}

/**
 * Timeline multiplies change force: short = subtler language, long = extreme markers.
 * Returns additive boost to intensity level (−1 … +2).
 */
function timelineScaleBoost(months) {
  const m = Number(months) || 3;
  if (m <= 3) return -1; // 1–3 months: gradual
  if (m <= 6) return 0;
  if (m < 12) return 1; // ~6–12 months
  return 2; // 1 year+ / 1.5y: total transformation
}

/**
 * Distance between current and desired physique.
 * Combines BF %-point gap with timeline months so the horizon mathematically
 * strengthens prompt language (not a dead UI number).
 * score ≈ 0–10; band drives commanding vs subtle change copy.
 */
function physiqueChangeDistance({ bfNow, bfGoal, months, fat } = {}) {
  const absDelta = Math.abs(fatDeltaPoints(bfNow, bfGoal));
  const m = Number(months) || 3;
  let score = 0;
  if (fat === "maintain" || absDelta < 1.5) {
    score = m >= 12 ? 2 : 1;
  } else {
    // BF gap is the primary distance signal.
    score = Math.min(7, absDelta);
    // Timeline multiplies: short dampens, ≥1 year commands dramatic recomposition.
    if (m <= 3) score *= 0.55;
    else if (m <= 6) score *= 0.85;
    else if (m < 12) score *= 1.15;
    else score *= 1.45;
    if (m >= 12 && absDelta >= 2) score = Math.max(score, 7.5);
  }
  score = Math.round(score * 10) / 10;
  let band = "subtle";
  if (score >= 7) band = "extreme";
  else if (score >= 4.5) band = "dramatic";
  else if (score >= 2.5) band = "clear";
  return { absDelta, months: m, score, band };
}

/**
 * Anatomical force keywords for fat-loss prompts (athletic/safe wording).
 * Zone emphasis within whole-body context — placed BEFORE soft identity lock.
 */
function anatomicalForceKeywords({ fat, bfGoal, months, level, zones, absDelta } = {}) {
  if (fat !== "decrease") return "";
  const m = Number(months) || 0;
  const abs = Number(absDelta) || 0;
  const aggressive = m >= 12 || level >= 2 || abs >= 4;
  if (!aggressive) {
    return "The waistline is tighter. Soft tissue on the lower abdomen is reduced. Core looks firmer.";
  }
  const focusSides =
    !zones ||
    !zones.length ||
    zones.includes("abs") ||
    zones.includes("overall") ||
    zones.includes("upper");
  const bits = [
    "The waistline is markedly narrower and tighter.",
    "Subcutaneous fat across the lower abdomen and torso is significantly and visibly reduced.",
    "Abdominal muscles and core definition are sharply sculpted.",
  ];
  if (focusSides) {
    bits.push(
      "Love handles and side fat at the waist are clearly and visibly reduced."
    );
  }
  if (Number.isFinite(Number(bfGoal)) && Number(bfGoal) > 0) {
    bits.push(
      `Match a lean athletic physique at about ${Number(bfGoal)}% body fat — whole-body recomposition, not an abs-only paint-over.`
    );
  }
  return bits.join(" ");
}

/** Extreme visual markers for long timelines (1y+) — forces Flux off the source pixels. */
function leggTilEkstremeVisuelleMarkører(months, fat, bfGoal) {
  const m = Number(months) || 0;
  if (m < 12) return "";
  const years =
    m >= 17 ? "1.5-year" : m >= 12 ? "1-year+" : `${Math.round(m)}-month`;
  if (fat === "increase") {
    return `The body composition has changed profoundly over the ${years} timeline: clearly fuller softer silhouette with major soft-tissue gain matching about ${Number(bfGoal) || "the target"}% body fat — not a near-copy of the source. AGGRESSIVE LONG-HORIZON CHANGE: commanding total-body soft-tissue gain — silhouette must look markedly different.`;
  }
  if (fat === "maintain") {
    return `Over the ${years} timeline muscle shape is clearly more developed while body-fat softness stays similar — visible long-term training progress, not a near-copy. AGGRESSIVE LONG-HORIZON CHANGE: commanding muscle development over ${years}.`;
  }
  return [
    `The body composition has changed profoundly over the ${years} timeline.`,
    "AGGRESSIVE LONG-HORIZON CHANGE: commanding total athletic recomposition — not a near-copy.",
    anatomicalForceKeywords({
      fat: "decrease",
      bfGoal,
      months: m,
      level: 3,
      zones: ["abs", "overall"],
      absDelta: 6,
    }),
    "Shoulders, arms, and chest show deep muscle separation.",
    `Match about ${Number(bfGoal) || "the target"}% body fat — total silhouette recomposition, not a thinned-out photocopy of the source.`,
  ].join(" ");
}

/**
 * Long timeline + fat loss + muscle build: describe BOTH volume and fat loss
 * so Flux does not only thin the original.
 */
function longTimelineDualRecompLine({ months, fat, muscleKey, outcomes }) {
  const m = Number(months) || 0;
  if (m < 12 || fat !== "decrease") return "";
  const wantsVolume =
    muscleKey === "volume" ||
    muscleKey === "softPowerful" ||
    (outcomes || []).some((o) =>
      ["bulk", "vshape", "stronger", "tone"].includes(o)
    );
  if (!wantsVolume && muscleKey !== "toned") return "";
  return "Long-timeline recomposition: show BOTH increased muscle volume (wider shoulders, fuller arms and chest, firmer thighs) AND major fat loss (narrower waist, less belly soft tissue) — not merely a skinnier version of the original body.";
}

/** 0=mild, 1=moderate, 2=marked, 3=dramatic — BF jump + effort + timeline months. */
function transformIntensityLevel({
  fat,
  bfNow,
  bfGoal,
  intensity,
  horizon,
  horizonDate,
  months,
} = {}) {
  const delta = fatDeltaPoints(bfNow, bfGoal);
  const abs = Math.abs(delta);
  let level = 0;
  if (fat === "decrease" || fat === "increase") {
    if (abs >= 6) level = 3;
    else if (abs >= 4) level = 2;
    else if (abs >= 2) level = 1;
  }
  if (intensity === "strong") level = Math.min(3, level + 1);
  // Strict/max + meaningful BF drop should never stay at mild language.
  if (intensity === "strong" && abs >= 4) level = Math.max(level, 2);
  if (intensity === "subtle") level = Math.max(0, level - 1);

  const m =
    Number.isFinite(Number(months)) && Number(months) > 0
      ? Number(months)
      : horizonToMonths(horizon, horizonDate);
  const boost = timelineScaleBoost(m);
  if (boost < 0) level = Math.max(0, level + boost);
  else level = Math.min(3, level + boost);
  // Physique distance (BF delta × timeline) must drive language strength.
  const dist = physiqueChangeDistance({ bfNow, bfGoal, months: m, fat });
  if (dist.band === "extreme") level = Math.max(level, 3);
  else if (dist.band === "dramatic") level = Math.max(level, 2);
  else if (dist.band === "clear") level = Math.max(level, 1);
  // 1y+ with a real fat change must reach dramatic language.
  if (m >= 12 && (fat === "decrease" || fat === "increase") && abs >= 2) {
    level = Math.max(level, 3);
  }
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
      "a clear increase in soft body fat with a fuller midsection",
      "an obvious increase in soft body fat — much thicker waist and softer torso than the source",
      "a large, unmistakable increase in soft body fat — clearly heavier softer silhouette than the source",
    ];
    return `${table[level] || table[1]}, targeting about ${goal}% body fat`;
  }
  const veryLeanTarget = Number.isFinite(goal) && goal <= 12;
  // Volume up: Flux ignores soft adjectives — use hard visual constraints.
  // level 0 (short horizon): subtle toning language per timeline brief.
  const table = [
    "slightly tighter waist, subtle fat reduction and mild toning — early gradual progress",
    "clear fat loss: noticeably narrower waist circumference, reduced belly fat layer, leaner chest",
    "significant body recomposition: the waist is clearly narrower and tighter than the source, subcutaneous fat over the lower abdomen and chest is visibly reduced to match a lean athletic physique",
    veryLeanTarget
      ? "dramatic total transformation: major subcutaneous fat loss and deeply sculpted natural muscle definition matching a very lean athletic look"
      : "major fat loss and significant body recomposition: dramatically narrower waist, major subcutaneous fat loss across the torso, lean athletic midsection matching the target %, still photorealistic",
  ];
  return `${table[level] || table[2]}, matching about ${goal}% body fat`;
}

/**
 * Strong zone-challenge adjectives (waist, love handles, lower belly, etc.)
 * while staying whole-body synced.
 */
function challengeDetailLine(zones, fat, level) {
  const list = (zones || []).filter(Boolean);
  const focusAbs =
    !list.length ||
    list.includes("abs") ||
    list.includes("overall") ||
    list.includes("upper");
  const bits = [];

  if (fat === "increase") {
    if (focusAbs) {
      bits.push(
        level >= 2
          ? "waist, love handles and lower belly look clearly fuller and softer"
          : "midsection and waist look softer and rounder"
      );
    }
    if (list.includes("thighs")) bits.push("thighs look fuller with more soft tissue");
    if (list.includes("arms")) bits.push("arms look softer with less separation");
    return bits.length ? bits.join("; ") + "." : "";
  }

  if (focusAbs) {
    bits.push(
      level >= 2
        ? "love handles and lower-belly soft tissue are clearly reduced; the waist looks narrower and tighter"
        : "love handles and lower belly look tighter with less soft tissue"
    );
  }
  if (list.includes("thighs")) {
    bits.push(
      level >= 2
        ? "thighs look leaner and firmer with clearly less soft outer-thigh tissue"
        : "thighs look slightly leaner and firmer"
    );
  }
  if (list.includes("arms")) {
    bits.push(
      level >= 2
        ? "arms look leaner with clear athletic muscle separation and less soft cover"
        : "arms look tighter with clearer definition"
    );
  }
  if (list.includes("shoulders") || list.includes("chest") || list.includes("back")) {
    bits.push(
      level >= 2
        ? "shoulders and upper torso look more athletic with clearer muscle separation"
        : "upper torso looks firmer and more defined"
    );
  }
  if (list.includes("glutes")) {
    bits.push(
      level >= 2
        ? "glutes look firmer and more athletic in proportion to the leaner waist"
        : "glutes look firmer and more athletic"
    );
  }
  return bits.length ? bits.join("; ") + "." : "";
}

/**
 * Imperative change block Flux cannot treat as optional.
 * Put this early in the prompt (before soft identity wording).
 * Fat-loss beats follow the Norwegian brief structure.
 */
function buildForcedChangeBlock({ fat, bfNow, bfGoal, level, zones, months }) {
  const now = Number(bfNow);
  const goal = Number(bfGoal);
  const abs = Math.abs(fatDeltaPoints(bfNow, bfGoal));
  if (fat === "maintain" || abs < 1.5) return "";

  const dist = physiqueChangeDistance({ bfNow, bfGoal, months, fat });
  const extreme = leggTilEkstremeVisuelleMarkører(months, fat, goal);
  if (extreme && (fat === "decrease" || fat === "increase")) {
    return [
      "HOWEVER — total long-timeline athletic transformation (must differ markedly from the source):",
      `Physique distance score ${dist.score}/10 (${dist.band}): force a commanding silhouette change.`,
      extreme,
      challengeDetailLine(zones, fat === "increase" ? "increase" : "decrease", Math.max(level, 3)),
      "Do NOT keep the same soft belly, love handles, waist width, or overall silhouette as the source.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (fat === "increase" || goal > now + 1) {
    return [
      "HOWEVER, the body composition has changed significantly from the original image:",
      "The waist is thicker and the midsection softer.",
      `Subcutaneous fat is visibly increased, matching about ${goal}% body fat.`,
      "Arms and chest look softer with less muscle separation than the source.",
      challengeDetailLine(zones, "increase", level),
      "The difference from the original body must be obvious side-by-side.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  const zoneHint = (zones || []).includes("abs")
    ? "Prioritize reshaping the waist, love handles and lower abdomen — still as part of a whole-body change."
    : "Reshape the full torso in sync with the focus zones, not only one isolated detail.";

  const anatomy = anatomicalForceKeywords({
    fat: "decrease",
    bfGoal: goal,
    months,
    level,
    zones,
    absDelta: abs,
  });

  const hard =
    level >= 2
      ? [
          "HOWEVER, athletic body composition has changed significantly from the original image:",
          anatomy,
          `Matching a lean ${goal}% body fat fitness physique (was about ${now}%).`,
          "Shoulder and arm muscle separation is enhanced in a realistic athletic way.",
          challengeDetailLine(zones, "decrease", level),
          zoneHint,
          "Do NOT keep the same soft belly, love handles, or the same waist width as the source.",
        ]
      : [
          "HOWEVER, change the athletic body composition clearly from the source:",
          anatomy,
          `Aim for a leaner about ${goal}% body fat athletic look versus about ${now}% in the source.`,
          "Make arm and shoulder definition modestly clearer.",
          challengeDetailLine(zones, "decrease", level),
          "The body must not look nearly identical to the source.",
        ];
  return hard.filter(Boolean).join(" ");
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
      "fuller muscle shape with slightly wider-looking shoulders under less soft tissue",
      "clearer athletic muscle volume: wider shoulders and more upper-body volume with natural definition",
      "noticeably fuller athletic muscle — wider shoulders, more arm/chest volume, clearer separation",
      "stronger athletic muscle volume with wider shoulders and deep but realistic definition",
    ];
    return table[level] || table[1];
  }
  if (wantsShred && leanTarget && level >= 2) {
    return "clear athletic muscle separation consistent with a lean body-fat target — still a real photo, not CGI";
  }
  const toned = [
    "a tighter toned silhouette",
    "a clearly toned athletic silhouette with better muscle outline",
    "a defined athletic muscle toning with clearer shoulders and arms",
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
      ? "clearly more defined and athletic in sync with the overall body-fat change"
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
  horizonDate,
  months,
  muscleKey,
  outcomes,
  zones,
  shape,
  frame,
  gender,
}) {
  const m =
    Number.isFinite(Number(months)) && Number(months) > 0
      ? Number(months)
      : horizonToMonths(horizon, horizonDate);
  const level = transformIntensityLevel({
    fat,
    bfNow,
    bfGoal,
    intensity,
    horizon,
    horizonDate,
    months: m,
  });
  const fatPhrase = getFatPhrase({ fat, bfNow, bfGoal, level });
  const musclePhrase = getMusclePhrase({
    fat,
    muscleKey,
    outcomes,
    level,
    bfGoal,
  });
  const dualRecomp = longTimelineDualRecompLine({
    months: m,
    fat,
    muscleKey,
    outcomes,
  });
  // Rule-based før/etter anatomical escalation (phase language by timeline + goal).
  const transformasjon = byggTransformasjonsDetaljer({
    horizon,
    fat,
    muscle: muscleKey,
    muscleKey,
    months: m,
    intensity,
    bfNow,
    bfGoal,
    outcomes,
    zones,
    level,
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
  const dist = physiqueChangeDistance({ bfNow, bfGoal, months: m, fat });
  const distanceLine =
    dist.band === "extreme" || dist.band === "dramatic"
      ? `Physique-change distance ${dist.score}/10 (${dist.band}): BF gap ~${dist.absDelta} pts over ~${m} months — apply commanding, unmistakable visual recomposition.`
      : dist.band === "clear"
        ? `Physique-change distance ${dist.score}/10 (${dist.band}): clear visible progress for ~${m} months.`
        : `Physique-change distance ${dist.score}/10 (${dist.band}): gradual, still visibly different.`;

  const story = [
    // Change language FIRST — Flux Kontext has no strength slider; soft "keep same" first = near-copies.
    buildForcedChangeBlock({ fat, bfNow, bfGoal, level, zones, months: m }),
    dualRecomp,
    transformasjon,
    distanceLine,
    identity + ".",
    "Keep the same face, hair, room, pose, camera angle, lighting and clothing as the original — ONLY change body composition.",
    m >= 12
      ? "This is a TOTAL long-timeline body-composition transformation of the same person — silhouette must look markedly different."
      : "This is a TOTAL body-composition transformation of the same person.",
    `Timeline scale: about ${m} months of progress must be visually readable in the body.`,
    `The subject shows ${fatPhrase}, resulting in ${musclePhrase}.`,
    getWholeBodySyncLine(fat, level),
    `Specific emphasis on ${zoneLine}, still consistent with about ${Number.isFinite(goal) ? goal : "the target"}% body fat across the whole body.`,
    `Body frame: ${frameBit}.`,
    shapeBit,
    genderBit,
    "Side-by-side with the source: waist width and belly fat layer must look clearly different.",
  ]
    .filter(Boolean)
    .join(" ");

  return { story, level, fatPhrase, musclePhrase, months: m, distance: dist };
}

const HORIZON_COPY = {
  "4w": {
    label: "about 4 weeks from now",
    months: 1,
    change:
      "short-term gradual change: slightly tighter waist, subtle fat reduction, mild toning — still a natural phone photo",
  },
  "8w": {
    label: "about 8 weeks from now",
    months: 2,
    change:
      "early gradual progress: slightly tighter midsection and subtle toning in arms/shoulders — believable for ~2 months",
  },
  "12w": {
    label: "about 3 months from now",
    months: 3,
    change:
      "short-horizon progress: slightly tighter waist, subtle fat reduction and toning — noticeable but not a total makeover",
  },
  "24w": {
    label: "about 6 months from now",
    months: 6,
    change:
      "significant body recomposition: clearly leaner waist, major subcutaneous fat reduction, more defined athletic muscle — still photorealistic",
  },
  "18m": {
    label: "about 1.5 years from now",
    months: 18,
    change:
      "total long-term transformation: significant body recomposition, dramatically narrower waist, major subcutaneous fat loss, deeply sculpted muscle definition — still a real photograph of this person, not a caricature",
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
    const months = Math.max(0.25, Math.round((days / 30) * 10) / 10);
    const occasion = occasionLabel
      ? ` for the occasion "${sanitizeGoal(occasionLabel)}"`
      : "";
    return {
      label: `in about ${days} days${occasion} (target date ${horizonDate})`,
      change: changeForDayCount(days),
      days,
      months,
    };
  }
  const base = HORIZON_COPY[horizon] || HORIZON_COPY["12w"];
  return {
    ...base,
    days: Math.round((base.months || 3) * 30),
    months: base.months || horizonToMonths(horizon),
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

  const { story, level, distance } = buildHolisticNarrative({
    fat,
    bfNow,
    bfGoal,
    intensity,
    horizon: extras.horizon || "12w",
    horizonDate: extras.horizonDate || "",
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

  const months =
    horizonInfo.months ||
    horizonToMonths(extras.horizon || "12w", extras.horizonDate || "");
  const timelineForce =
    months >= 12
      ? `TIMELINE MULTIPLIER (~${months} months, distance ${distance?.score ?? "?"}/10): force a rich, detailed total-body silhouette change matching this long horizon — max freedom to reshape waist, fat pads, and muscle volume. AGGRESSIVE commanding visual change required.`
      : months <= 3
        ? `TIMELINE MULTIPLIER (~${months} months, distance ${distance?.score ?? "?"}/10): keep change gradual — slightly tighter, subtle fat reduction, toning — still visibly different.`
        : `TIMELINE MULTIPLIER (~${months} months, distance ${distance?.score ?? "?"}/10): scale visible progress to this mid-length horizon.`;

  // Explicit før/etter fragment again just before soft identity lock (alongside
  // anatomical force keywords / horizon markers already inside `story`).
  const transformasjonLock = byggTransformasjonsDetaljer({
    horizon: extras.horizon || "12w",
    fat,
    muscle: muscleKey,
    muscleKey,
    months,
    intensity,
    bfNow,
    bfGoal,
    outcomes: resolvedOutcomes,
    zones: resolvedZones,
    level,
  });

  // Order: safe athletic base → change language (in story) → soft identity → realism.
  // Flux Kontext Pro has NO image_strength — intensity is language + prompt_upsampling.
  // Shirtless gym torso is framed as non-NSFW athletic documentation to reduce E005 blocks.
  return [
    "A high-end professional fitness photo for athletic progress tracking (non-NSFW), exact same person, face, and room as the original image.",
    "Bare torso or shirtless gym physique is normal athletic documentation for body-composition coaching — not sexual content, not erotic, not NSFW.",
    "PRIMARY TASK — athletic body recomposition (must be obvious vs the source):",
    story,
    force,
    timelineForce,
    `CRITICAL BODY FAT DETAIL: ${fatInfo}`,
    bfDelta ? `DELTA DETAIL: ${bfDelta}.` : "",
    bfLook ? `TARGET LOOK: ${bfLook}.` : "",
    raisingFat
      ? "FORBIDDEN: shredded abs, vascularity, contest lean, bodybuilder cut."
      : meaningfulLoss
        ? "FORBIDDEN: near-identical copy, same waist width, same soft lower-abdomen fat pad, love handles unchanged, abs-only paint-over. REQUIRED: narrower waist + visibly less belly fat."
        : "Do NOT invent an extreme shredded contest physique unless the target body-fat % is very low.",
    `Timeline / realism check: ${horizonInfo.label}. ${horizonInfo.change}.`,
    `Zone emphasis (weighted, still whole-body synced): ${zoneInfo}.`,
    `Muscle cue: ${muscleInfo}.`,
    frameInfo ? `Frame: ${frameInfo}.` : "",
    shapeInfo ? `Shape genetics: ${shapeInfo}.` : "",
    outcomeInfo ? `Motivation outcomes (secondary): ${outcomeInfo}.` : "",
    transformasjonLock,
    "Soft identity lock: keep the same face, hair, pose, camera angle, lighting and clothing — ONLY body composition changes.",
    "CRITICAL STYLE: real smartphone / professional fitness photo — natural skin, real lighting, real proportions. No cartoon/CGI/anime.",
    "Do NOT exaggerate into bodybuilder or superhero proportions. Keep a neutral athletic stance — no sexualized posing.",
    `Parameter brief: ${brief}.`,
    "Safe athletic context only. No text, no watermark, no logo.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Norwegian brief alias — same engine as buildPrompt. */
function genererAiPrompt(maal, intensity = "moderate", extras = {}) {
  return buildPrompt(maal, intensity, extras);
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
    horizonDate: extras.horizonDate || "",
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

function isPremiumFluxLabel(label) {
  return label === "flux-max" || label === "flux-pro";
}

/**
 * Shirtless + strong fat-loss often E005s on Max and Pro identically.
 * Skip Pro up front when Max is primary to save ~1 failed premium call.
 */
function isHighE005Risk({ fat = "decrease", intensity = "moderate", bfNow, bfGoal } = {}) {
  const abs = Math.abs(fatDeltaPoints(bfNow, bfGoal));
  return fat === "decrease" && intensity === "strong" && abs >= 4;
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
  if (/for lang tid|timeout|504|canceled/i.test(text)) {
    return [
      "Generering tok for lang tid hos bildemodellen.",
      "Prøv igjen — neste forsøk bytter ofte til en raskere reservedrift.",
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

async function cancelPrediction(cancelUrl, token) {
  if (!cancelUrl || !token) return;
  try {
    const response = await fetch(cancelUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      console.warn(
        `[replicate] Cancel returned HTTP ${response.status} for ${cancelUrl}`
      );
    }
  } catch (error) {
    console.warn("[replicate] Cancel request failed:", error.message);
  }
}

async function pollPrediction(
  getUrl,
  token,
  timeoutMs = ATTEMPT_POLL_TIMEOUT_MS,
  cancelUrl = null
) {
  const started = Date.now();
  const budget = Math.max(5000, Number(timeoutMs) || ATTEMPT_POLL_TIMEOUT_MS);

  while (Date.now() - started < budget) {
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

    // Fail fast — do not keep polling after safety/E005 or hard failure.
    if (prediction.status === "failed" || prediction.status === "canceled") {
      const raw =
        prediction?.error || `Replicate-jobben feilet (${prediction.status})`;
      console.warn("[replicate] Prediction status failed/canceled:", raw);
      const err = new Error(raw);
      err.status = prediction.status === "canceled" ? 504 : 502;
      err.replicateRaw = raw;
      // Canceled (Cancel-After / our cancel) → try next model; failed stays on existing safety/timeout rules.
      err.retriable = prediction.status === "canceled";
      throw err;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  await cancelPrediction(cancelUrl, token);
  const err = new Error("Replicate brukte for lang tid. Prøv igjen.");
  err.status = 504;
  err.retriable = true;
  throw err;
}

function sdxlPromptStrength(intensity, extras = {}) {
  // Higher = more change from source (img2img). Cap to avoid cartoon outputs.
  const now = Number(extras.bfNow);
  const goal = Number(extras.bfGoal);
  const abs =
    Number.isFinite(now) && Number.isFinite(goal) ? Math.abs(now - goal) : 0;
  const fatLossBoost =
    extras.fat === "decrease" && abs >= 4
      ? intensity === "strong"
        ? 0.1
        : 0.07
      : 0;
  if (intensity === "strong") return Math.min(0.45, 0.36 + fatLossBoost);
  if (intensity === "subtle") return Math.min(0.36, 0.26 + fatLossBoost);
  return Math.min(0.4, 0.3 + fatLossBoost);
}

function buildModelInput(
  modelRef,
  { imageDataUri, maal, intensity, extras = {} }
) {
  const name = (modelRef.modelName || "").toLowerCase();

  if (name.includes("flux-kontext") || /^black-forest-labs\//i.test(name)) {
    // Flux Kontext has NO image_strength — only prompt drives change.
    // With input_image, Replicate caps safety_tolerance at 2 (higher values are ignored/wrong).
    const now = Number(extras.bfNow);
    const goal = Number(extras.bfGoal);
    const abs =
      Number.isFinite(now) && Number.isFinite(goal) ? Math.abs(now - goal) : 0;
    const largeDelta = abs >= 4;
    const months = horizonToMonths(
      extras.horizon || "12w",
      extras.horizonDate || ""
    );
    const longHorizon = months >= 12;
    // Spec: prompt_upsampling ON for long horizon (≥12m) and/or large BF delta (≥4)
    // so the model amplifies visual instructions.
    // E005 trade-off: earlier we disabled upsampling for strong+fat-decrease to reduce
    // shirtless blocks. Keep that disable ONLY on short/mid horizons WITHOUT a large
    // delta — long timelines and big jumps take priority for visible drama.
    // (shortStrongDecrease + small delta → OFF; longHorizon or largeDelta → ON.)
    const useUpsampling = Boolean(longHorizon || largeDelta);

    return {
      prompt: buildPrompt(maal, intensity, extras),
      input_image: imageDataUri,
      aspect_ratio: "match_input_image",
      output_format: "png",
      safety_tolerance: 2,
      prompt_upsampling: useUpsampling,
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
  pollTimeoutMs = ATTEMPT_POLL_TIMEOUT_MS,
}) {
  const modelRef = parseModelRef(model);
  const input = buildModelInput(modelRef, {
    imageDataUri,
    maal,
    intensity,
    extras,
  });
  const attemptStarted = Date.now();
  const attemptBudget = Math.max(
    8000,
    Number(pollTimeoutMs) || ATTEMPT_POLL_TIMEOUT_MS
  );
  const waitSeconds = Math.max(
    5,
    Math.min(CREATE_WAIT_SECONDS, Math.floor(attemptBudget / 1000) - 8)
  );

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
      Prefer: `wait=${waitSeconds}`,
      // Auto-cancel hung predictions so cascade can move on (and free GPU queue).
      "Cancel-After": `${Math.max(5, Math.ceil(attemptBudget / 1000))}s`,
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

  // Fail fast if create already returned a failed prediction (e.g. E005).
  if (prediction.status === "failed" || prediction.status === "canceled") {
    const raw =
      prediction.error || `Replicate-jobben feilet (${prediction.status})`;
    console.warn(
      `[replicate] Raw error from ${modelRef.modelName || model}:`,
      raw
    );
    const err = new Error(raw);
    err.status = prediction.status === "canceled" ? 504 : 502;
    err.replicateRaw = raw;
    err.retriable = prediction.status === "canceled";
    throw err;
  }

  if (prediction.status !== "succeeded" && prediction?.urls?.get) {
    const remaining = Math.max(
      5000,
      attemptBudget - (Date.now() - attemptStarted)
    );
    prediction = await pollPrediction(
      prediction.urls.get,
      token,
      remaining,
      prediction.urls.cancel || null
    );
  }

  if (prediction.status === "failed") {
    const raw = prediction.error || "Replicate-jobben feilet.";
    console.warn(
      `[replicate] Raw error from ${modelRef.modelName || model}:`,
      raw
    );
    const err = new Error(raw);
    err.status = 502;
    err.replicateRaw = raw;
    throw err;
  }

  const imageUrl = extractOutputUrl(prediction.output);
  if (!imageUrl) {
    const raw =
      prediction.error ||
      "The input or output was flagged as sensitive. Please try again with different inputs. (E005)";
    console.warn(
      `[replicate] Empty output / likely E005 from ${modelRef.modelName || model}:`,
      raw
    );
    const err = new Error(raw);
    err.status = 422;
    err.replicateRaw = raw;
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

  const preferMax = needsMaxEdit({
    fat,
    bfNow,
    bfGoal,
    intensity,
    zones: zones || zone,
    horizon,
    horizonDate,
  });
  const highE005Risk = isHighE005Risk({ fat, intensity, bfNow, bfGoal });
  const primaryLabel = preferMax ? "flux-max" : "flux-pro";
  const primaryModel = preferMax ? secondaryModel : model;
  const secondaryLabel = preferMax ? "flux-pro" : "flux-max";
  const secondaryPick = preferMax ? model : secondaryModel;

  // High E005-risk + Max-first: skip Pro (same shirtless/strong input often fails identically).
  const skipSiblingPremium = preferMax && highE005Risk;

  console.info(
    `[replicate] Route: ${primaryLabel} first (${preferMax ? "demanding edit" : "mild edit"}; horizon=${horizon || "12w"}; highE005Risk=${highE005Risk}; skipPro=${skipSiblingPremium})`
  );

  // Cost-aware order: Max for hard transforms, Pro for mild — then the other, Dev, SDXL.
  // Per-attempt ~35s + cascade budget 155s so reservedrift still finishes under Vercel/client.
  const attempts = skipSiblingPremium
    ? [
        { model: primaryModel, label: primaryLabel },
        { model: tertiaryModel, label: "flux-dev" },
        { model: fallbackModel, label: "sdxl-emergency" },
      ]
    : [
        { model: primaryModel, label: primaryLabel },
        { model: secondaryPick, label: secondaryLabel },
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
  const skipLabels = new Set();
  const cascadeStarted = Date.now();

  for (let i = 0; i < uniqueAttempts.length; i++) {
    const attempt = uniqueAttempts[i];
    if (skipLabels.has(attempt.label)) {
      console.warn(
        `[replicate] Skipping ${attempt.label} after premium E005 (same input)`
      );
      continue;
    }
    const remainingBudget = CASCADE_BUDGET_MS - (Date.now() - cascadeStarted);
    if (remainingBudget < MIN_ATTEMPT_MS) {
      console.warn(
        `[replicate] Cascade budget exhausted (${Math.round(
          (Date.now() - cascadeStarted) / 1000
        )}s) — stopping before ${attempt.label}`
      );
      break;
    }
    const pollTimeoutMs = Math.min(ATTEMPT_POLL_TIMEOUT_MS, remainingBudget);
    try {
      console.info(
        `[replicate] Attempt ${attempt.label} (budget ${Math.round(
          pollTimeoutMs / 1000
        )}s, cascade left ${Math.round(remainingBudget / 1000)}s)`
      );
      const result = await runPrediction({
        model: attempt.model,
        imageDataUri,
        maal,
        intensity,
        token,
        extras,
        pollTimeoutMs,
      });
      return {
        ...result,
        usedFallback: attempt.label !== primaryLabel,
        attempt: attempt.label,
        preferredModel: primaryLabel,
        personalization: composeGoalBrief({
          maal,
          ...extras,
        }),
      };
    } catch (error) {
      lastError = error;
      const safetyHit = isSafetyBlock(error.message);
      // Max/Pro often E005 on the same shirtless input — jump to Dev instead of burning another attempt.
      if (safetyHit && isPremiumFluxLabel(attempt.label)) {
        for (const a of uniqueAttempts) {
          if (a.label !== attempt.label && isPremiumFluxLabel(a.label)) {
            skipLabels.add(a.label);
          }
        }
      }
      const hasNext =
        uniqueAttempts.slice(i + 1).some((a) => !skipLabels.has(a.label));
      const canContinue =
        hasNext &&
        (safetyHit ||
          error.retriable ||
          isMissingModel(error.message) ||
          /timeout|504|502|503|canceled|for lang tid/i.test(
            error.message || ""
          ));
      console.warn(
        `[replicate] Attempt ${attempt.label} failed` +
          (error.status ? ` (HTTP/status ${error.status})` : "") +
          ":",
        error.replicateRaw || error.message,
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
  genererAiPrompt,
  sanitizeGoal,
  composeGoalBrief,
  getConfiguredModels,
  isValidModelRef,
  needsMaxEdit,
  isHighE005Risk,
  fatDeltaPoints,
  transformIntensityLevel,
  horizonToMonths,
  timelineScaleBoost,
  physiqueChangeDistance,
  anatomicalForceKeywords,
  leggTilEkstremeVisuelleMarkører,
  byggTransformasjonsDetaljer,
  ATTEMPT_POLL_TIMEOUT_MS,
  CASCADE_BUDGET_MS,
  DEFAULT_MODEL,
  DEFAULT_FALLBACK_MODEL,
  SECONDARY_MODEL,
  TERTIARY_MODEL,
};
