const {
  byggTransformasjonsDetaljer,
} = require("./transformasjonLogikk");
const {
  byggVisuellPrompt,
  isSlimVisualPromptEnabled,
} = require("./visuellPrompt");

const POLL_INTERVAL_MS = 2000;
// Per-attempt budget — short enough that Max hang + Dev still finish under cascade budget.
// Old 50s×3–4 could still hit client abort (170s) / Vercel (180s) when models stall in starting.
const ATTEMPT_POLL_TIMEOUT_MS = 35000;
// Cap Prefer: wait so create returns quickly for fail-fast / poll (not ~60s sync hold).
const CREATE_WAIT_SECONDS = 12;
// Whole Max→…→Dev cascade wall-clock budget.
// Leave headroom under Vercel maxDuration 180s for Body Simulator prep + JSON response
// (cascade clock starts after anatomy/formatter work, so 155s was too tight and invited
// platform HTML 504 pages that the client could not parse as JSON).
const CASCADE_BUDGET_MS = 130000;
// Soft deadline used by the API to return structured JSON before Vercel kills the function.
const FUNCTION_SOFT_DEADLINE_MS = 165000;
// Do not start another model with less remaining than this.
const MIN_ATTEMPT_MS = 10000;

// Flux Kontext Pro = default for mild edits (cost control).
// Max = primary when body-comp change is demanding (better prompt adherence).
// Dev next (with stronger prompt after Max/Pro E005). Optional second Dev pass.
// SDXL is NOT returned as success for Future You body transforms (cartoons at high strength).
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
    return "lean athletic body fat (~14%): tighter waist, clear upper-core and oblique outline, sharper shoulder/arm separation, slightly leaner face — photorealistic, not contest shredded";
  }
  if (n < 19) {
    return "athletic lean body fat (~16–18%): visibly tighter waist than average, firmer flatter midsection with emerging core outline, clearer delts/arms, less soft tissue on stomach — still natural smartphone photo";
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

  // Fat loss — scale adjectives by percentage-point drop (athletic docs tone).
  const bigDrop = abs >= 6;
  const midDrop = abs >= 4;
  const waistLine = bigDrop
    ? "The waistline is clearly narrower; soft tissue across the lower abdomen and torso is visibly reduced; core outline is clearer; flank soft tissue reduced"
    : midDrop
      ? "The waistline is clearly narrower; soft tissue across the lower abdomen and torso is visibly reduced; clearer core outline"
      : "noticeable fat loss around the waist, tighter midsection, milder soft belly tissue";
  const muscleLine = bigDrop
    ? "Clearer athletic muscle outline in the shoulders and arms, leaner overall silhouette compared to the original photo"
    : midDrop
      ? "clearer muscle outline in shoulders and arms, leaner athletic silhouette vs the original photo"
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
    "leaner physique, visibly tighter waist, clearer natural core outline for the target %, clearer muscle outline in arms/shoulders — photorealistic, not bodybuilder caricature",
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
    const core = delta || horizonInfo.change;
    if (abs >= 4) {
      return `${core}. Short timeline (${label}): still apply clear waist/midsection fat-loss edits matching the ~${abs}pp delta — noticeable recomposition, not toning-only or a near-copy.`;
    }
    return `${core}. Short timeline (${label}): noticeable tighter waist and moderate fat reduction — visibly different from the source, not a near-copy.`;
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
      return "much tighter waist, reduced flank and lower-belly soft tissue, firmer flatter midsection with clear upper-core and oblique outline for ~16% body fat — natural photo, not CGI six-pack";
    }
    return "noticeably tighter waist, reduced flank and lower-belly soft tissue, firmer midsection — realistic definition";
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
  const fixed = {
    "4w": 1,
    "8w": 2,
    "12w": 3,
    "24w": 6,
    "12m": 12,
    "52w": 12,
    // Legacy: same months as 12m so old clients don't get 18mo drama by default
    "18m": 12,
  };
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
 * Timeline scales change via front-loaded progress (tau≈4), not 1×→2×→4× force.
 * early (~3mo, p≈0.53) / mid (~6mo, p≈0.78) / nearGoal (~12mo, p≈0.95).
 */
function timelineScaleBoost(months) {
  const m = Number(months) || 3;
  if (m <= 4) return -1; // ~3mo early band
  if (m <= 8) return 0; // ~6mo mid band
  return 2; // ~12mo+ near-goal band
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
  let progressFrac = 0.53;
  try {
    const { transformProgress } = require("./transformProgress");
    progressFrac = transformProgress(m);
  } catch (_) {
    // fallback approximate front-loaded fractions
    if (m <= 3) progressFrac = 0.53;
    else if (m <= 6) progressFrac = 0.78;
    else progressFrac = 0.95;
  }
  if (fat === "maintain" || absDelta < 1.5) {
    score = m >= 12 ? 2 : 1;
  } else {
    // BF gap × front-loaded progress (early months already carry ~half the visual journey).
    score = Math.min(7, absDelta * Math.max(0.45, progressFrac));
    // 3mo must stay commanding enough that Flux cannot under-edit to "no change".
    if (m > 2 && m <= 4 && absDelta >= 2) score = Math.max(score, 3.5);
    if (m >= 12 && absDelta >= 2) score = Math.max(score, 7.5);
  }
  score = Math.round(score * 10) / 10;
  let band = "subtle";
  if (score >= 7) band = "extreme";
  else if (score >= 4.5) band = "dramatic";
  else if (score >= 2.5) band = "clear";
  return { absDelta, months: m, score, band, progress: progressFrac };
}

/**
 * Anatomical force keywords for fat-loss prompts (athletic/safe wording).
 * Keep short — callers already add phase transformasjon + fat delta elsewhere.
 */
function anatomicalForceKeywords({ fat, bfGoal, months, level, zones, absDelta } = {}) {
  if (fat !== "decrease") return "";
  const m = Number(months) || 0;
  const abs = Number(absDelta) || 0;
  const strong = m >= 12 || level >= 2 || abs >= 4;
  if (!strong) {
    return "The waistline is tighter. Soft tissue on the lower abdomen is reduced. Core looks firmer.";
  }
  const focusSides =
    !zones ||
    !zones.length ||
    zones.includes("abs") ||
    zones.includes("overall") ||
    zones.includes("upper");
  const bits = [
    "The waistline is clearly narrower.",
    "Soft tissue across the lower abdomen and torso is visibly reduced.",
    "Core outline is firmer and clearer.",
  ];
  if (focusSides) {
    bits.push("Flank and side-waist soft tissue is clearly reduced.");
  }
  if (Number.isFinite(Number(bfGoal)) && Number(bfGoal) > 0) {
    bits.push(
      `Match a lean athletic physique at about ${Number(bfGoal)}% body fat — whole-body recomposition, not a midsection-only paint-over.`
    );
  }
  return bits.join(" ");
}

/** Long-timeline markers (12mo+) — short, non-stacked; transformasjon covers detail. */
function leggTilEkstremeVisuelleMarkører(months, fat, bfGoal) {
  const m = Number(months) || 0;
  if (m < 12) return "";
  const years = "12-month";
  if (fat === "increase") {
    return `LONG-HORIZON CHANGE (${years}): clearly fuller softer silhouette with major soft-tissue gain matching about ${Number(bfGoal) || "the target"}% body fat — silhouette must look markedly different from the source.`;
  }
  if (fat === "maintain") {
    return `LONG-HORIZON CHANGE (${years}): muscle shape clearly more developed while body-fat softness stays similar — visible long-term training progress, not a near-copy.`;
  }
  return [
    `LONG-HORIZON CHANGE (${years}): commanding athletic recomposition — not a near-copy.`,
    "Narrower waist, flatter midsection, less flank soft tissue; clearer shoulder and arm muscle outline.",
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
  // Short cue only — full dual-recomp detail lives in byggTransformasjonsDetaljer (once).
  return "Long-timeline recomposition: BOTH fuller muscle volume AND fat loss — not merely a skinnier version of the original body.";
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
  // level 0 (short horizon, small delta): still noticeable, never toning-only.
  const table = [
    "noticeably tighter waist, moderate fat reduction and firmer midsection — early visible progress",
    "clear fat loss: noticeably narrower waist circumference, reduced belly fat layer, leaner chest",
    "significant body recomposition: the waist is clearly narrower and tighter than the source, subcutaneous fat over the lower abdomen and chest is visibly reduced to match a lean athletic physique",
    veryLeanTarget
      ? "dramatic total transformation: major subcutaneous fat loss and deeply sculpted natural muscle definition matching a very lean athletic look"
      : "major fat loss and significant body recomposition: dramatically narrower waist, major subcutaneous fat loss across the torso, lean athletic midsection matching the target %, still photorealistic",
  ];
  return `${table[level] || table[2]}, matching about ${goal}% body fat`;
}

/**
 * Strong zone-challenge adjectives (waist, flanks, lower belly, etc.)
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
          ? "waist, flanks and lower belly look clearly fuller and softer"
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
        ? "flank and lower-belly soft tissue are clearly reduced; the waist looks narrower"
        : "flanks and lower belly look tighter with less soft tissue"
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
    // Keep short: phase transformasjon (injected once in the narrative) holds detail.
    return [
      "HOWEVER — long-timeline athletic transformation (must differ markedly from the source):",
      `Physique distance score ${dist.score}/10 (${dist.band}).`,
      extreme,
      challengeDetailLine(zones, fat === "increase" ? "increase" : "decrease", Math.max(level, 3)),
      "Do NOT keep the same soft midsection, flank soft tissue, waist width, or overall silhouette as the source.",
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
    ? "Prioritize reshaping the waist, flanks and lower abdomen — still as part of a whole-body change."
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
          challengeDetailLine(zones, "decrease", level),
          zoneHint,
          "Do NOT keep the same soft midsection, flank soft tissue, or the same waist width as the source.",
        ]
      : [
          "HOWEVER, change the athletic body composition clearly from the source:",
          anatomy,
          `Aim for a leaner about ${goal}% body fat athletic look versus about ${now}% in the source.`,
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
  // Rule-based før/etter anatomical escalation — inject ONCE (not again in buildPrompt).
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
  // Skip separate dual-recomp line when transformasjon already covers recomp.
  const dualRecomp = transformasjon
    ? ""
    : longTimelineDualRecompLine({
        months: m,
        fat,
        muscleKey,
        outcomes,
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
        : `Physique-change distance ${dist.score}/10 (${dist.band}): clear visible progress, still visibly different.`;

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
    "Side-by-side with the source: waist width and midsection soft-tissue layer must look clearly different.",
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
      "short-term noticeable change: visibly tighter waist, moderate fat reduction, early firming — still a natural phone photo",
  },
  "8w": {
    label: "about 8 weeks from now",
    months: 2,
    change:
      "early noticeable progress: tighter midsection, reduced lower-belly soft tissue, firmer arms/shoulders — believable for ~2 months",
  },
  // early band (~3mo, progress≈0.53) — front-loaded, must be clearly visible
  "12w": {
    label: "about 3 months from now",
    months: 3,
    change:
      "MUST be obviously different from the input photograph — not a near-copy. Clearly visible fat reduction across the midsection and flanks, a tighter narrower waist, early but distinct muscle definition in shoulders and arms.",
  },
  // mid band (~6mo, progress≈0.78) — further toward goal; diminishing returns vs 0→3
  "24w": {
    label: "about 6 months from now",
    months: 6,
    change:
      "Further progress toward the goal after the early front-loaded change: clearly sculpted midsection, distinct muscle separation across the chest and arms — refined continuation, not a doubled remake of the 3-month look.",
  },
  // near-goal band (~12mo, progress≈0.95); former 18m/1.5y drama maps here
  "12m": {
    label: "about 12 months from now",
    months: 12,
    change:
      "Near-goal refined athletic completion: dramatically narrower waist, major soft-tissue loss across midsection and flanks, clear natural muscle separation and athletic outline — polished finish, not exaggerated 4x arm growth — anatomically correct athletic build, natural and balanced body proportions, muscle growth is strictly proportionate to the original skeletal structure, no exaggerated or unnatural swelling of the arms — still a real photograph of this person, not a caricature",
  },
  "52w": {
    label: "about 12 months from now",
    months: 12,
    change:
      "Near-goal refined athletic completion: dramatically narrower waist, major soft-tissue loss across midsection and flanks, clear natural muscle separation and athletic outline — polished finish, not exaggerated 4x arm growth — anatomically correct athletic build, natural and balanced body proportions, muscle growth is strictly proportionate to the original skeletal structure, no exaggerated or unnatural swelling of the arms — still a real photograph of this person, not a caricature",
  },
  // Legacy key — same as 12m (UI no longer offers 1.5y as primary)
  "18m": {
    label: "about 12 months from now",
    months: 12,
    change:
      "Near-goal refined athletic completion: dramatically narrower waist, major soft-tissue loss across midsection and flanks, clear natural muscle separation and athletic outline — polished finish, not exaggerated 4x arm growth — anatomically correct athletic build, natural and balanced body proportions, muscle growth is strictly proportionate to the original skeletal structure, no exaggerated or unnatural swelling of the arms — still a real photograph of this person, not a caricature",
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
  return HORIZON_COPY["12m"].change;
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
 *
 * Default (VISUAL_PROMPT_SLIM=1): slim builder — only timeline, main goal
 * (fat/muscle), zones, and a brief BF target phrase. Holistic engine remains
 * below for VISUAL_PROMPT_SLIM=0 so variables can be re-enabled one-by-one.
 */
function buildPrompt(maal, intensity = "moderate", extras = {}) {
  if (isSlimVisualPromptEnabled()) {
    const { prompt } = byggVisuellPrompt({
      horizon: extras.horizon || "12w",
      horizonDate: extras.horizonDate || "",
      fat: extras.fat || "decrease",
      muscle: extras.muscle || "toned",
      zones: extras.zones || extras.zone || [],
      months: extras.months,
      bfNow: extras.bfNow,
      bfGoal: extras.bfGoal,
      promptVariant: extras.promptVariant || "",
    });
    return prompt;
  }
  return buildPromptHolistic(maal, intensity, extras);
}

/**
 * Legacy holistic Prompt Engine — unused when VISUAL_PROMPT_SLIM is ON (default).
 * Parameters form one synchronized body story; intensity is language + scale tables.
 * Kept so cues (BMI, medicine, outcomes, shape essays, etc.) can be re-enabled later.
 */
function buildPromptHolistic(maal, intensity = "moderate", extras = {}) {
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
      ? `TIMELINE PROGRESS (~${months} months, ~95% of journey, distance ${distance?.score ?? "?"}/10): near-goal refined athletic completion — reshape waist, soft-tissue pads, and muscle volume with clear visual delta. anatomically correct athletic build, natural and balanced body proportions, muscle growth is strictly proportionate to the original skeletal structure, no exaggerated or unnatural swelling of the arms.`
      : months > 4 && months <= 6
        ? `TIMELINE PROGRESS (~${months} months, ~78% of journey, distance ${distance?.score ?? "?"}/10): further progress after early front-loaded change — clearly sculpted midsection, distinct muscle separation across the chest and arms; not a doubled remake of 3 months.`
        : months > 2 && months <= 4
          ? `TIMELINE PROGRESS (~${months} months, ~53% of journey, distance ${distance?.score ?? "?"}/10): MUST be obviously different from the input photograph — clearly visible fat reduction, tighter narrower waist, early but distinct muscle definition. Not a near-copy.`
          : months <= 3
            ? `TIMELINE PROGRESS (~${months} months, distance ${distance?.score ?? "?"}/10): clear recomposition — narrower waist, reduced midsection soft tissue, early muscle outline — MUST differ obviously from the source.`
            : months > 6
              ? `TIMELINE PROGRESS (~${months} months, distance ${distance?.score ?? "?"}/10): strong mid-to-late progress toward the goal — diminishing returns after early months. anatomically correct athletic build, natural and balanced body proportions, muscle growth is strictly proportionate to the original skeletal structure, no exaggerated or unnatural swelling of the arms.`
              : `TIMELINE PROGRESS (~${months} months, distance ${distance?.score ?? "?"}/10): clear progress — scale visible change to this timeframe with front-loaded early gains.`;

  // Order: athletic base → change language (story includes transformasjon once) → soft identity → realism.
  // Do NOT re-inject byggTransformasjonsDetaljer here — duplicate anatomy lines raise E005 risk.
  return [
    "A high-end professional fitness photo for athletic progress tracking, exact same person, face, and room as the original image.",
    "Shirtless athletic progress photo is normal fitness documentation for body-composition coaching.",
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
        ? "FORBIDDEN: near-identical copy, same waist width, same soft midsection thickness, flank soft tissue unchanged, midsection-only paint-over. REQUIRED: narrower waist + visibly less midsection soft tissue."
        : "Do NOT invent an extreme shredded contest physique unless the target body-fat % is very low.",
    `Timeline / realism check: ${horizonInfo.label}. ${horizonInfo.change}.`,
    `Zone emphasis (weighted, still whole-body synced): ${zoneInfo}.`,
    `Muscle cue: ${muscleInfo}.`,
    frameInfo ? `Frame: ${frameInfo}.` : "",
    shapeInfo ? `Shape genetics: ${shapeInfo}.` : "",
    outcomeInfo ? `Motivation outcomes (secondary): ${outcomeInfo}.` : "",
    "Soft identity lock: keep the same face, hair, pose, camera angle, lighting and clothing — ONLY body composition changes.",
    "CRITICAL STYLE: real smartphone / professional fitness photo — natural skin, real lighting, real proportions. No cartoon/CGI/anime.",
    "Do NOT exaggerate into bodybuilder or superhero proportions. Keep a neutral athletic stance.",
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
  // Slim path for any img2img leftover — same isolated visual inputs (+ Dev variants).
  if (isSlimVisualPromptEnabled()) {
    const { prompt } = byggVisuellPrompt({
      horizon: extras.horizon || "12w",
      horizonDate: extras.horizonDate || "",
      fat: extras.fat || "decrease",
      muscle: extras.muscle || "toned",
      zones: extras.zones || extras.zone || [],
      months: extras.months,
      bfNow: extras.bfNow,
      bfGoal: extras.bfGoal,
      promptVariant: extras.promptVariant || "",
    });
    return prompt;
  }

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

/**
 * Shared pure Flux attempt planner (thresholds unchanged).
 * Returns ordered Max/Pro/Dev attempts (max 3). Does not include legacy
 * Dev-strong or SDXL slots — callers append those if needed.
 *
 * Mild: Pro → Max → Dev
 * Demanding: Max → Pro → Dev
 * Demanding + high E005 risk: Max → Dev (skip Pro)
 */
function buildFluxAttemptPlan({
  fat = "decrease",
  bfNow,
  bfGoal,
  intensity = "moderate",
  zones,
  horizon,
  horizonDate,
  months,
  model = DEFAULT_MODEL,
  secondaryModel = SECONDARY_MODEL,
  tertiaryModel = TERTIARY_MODEL,
} = {}) {
  const preferMax = needsMaxEdit({
    fat,
    bfNow,
    bfGoal,
    intensity,
    zones,
    horizon,
    horizonDate,
    months,
  });
  const highE005Risk = isHighE005Risk({ fat, intensity, bfNow, bfGoal });
  const skipSiblingPremium = preferMax && highE005Risk;

  const primaryLabel = preferMax ? "flux-max" : "flux-pro";
  const primaryModel = preferMax ? secondaryModel : model;
  const secondaryLabel = preferMax ? "flux-pro" : "flux-max";
  const secondaryPick = preferMax ? model : secondaryModel;

  const attempts = skipSiblingPremium
    ? [
        { model: primaryModel, label: primaryLabel },
        { model: tertiaryModel, label: "flux-dev" },
      ]
    : [
        { model: primaryModel, label: primaryLabel },
        { model: secondaryPick, label: secondaryLabel },
        { model: tertiaryModel, label: "flux-dev" },
      ];

  const routingReason = !preferMax
    ? "mild"
    : highE005Risk
      ? "demanding_high_e005_risk"
      : "demanding";

  return {
    preferMax,
    highE005Risk,
    skipSiblingPremium,
    primaryLabel,
    routingReason,
    attempts: attempts.filter((a) => a.model).slice(0, 3),
  };
}

function hashPromptSha256(prompt) {
  try {
    return require("crypto")
      .createHash("sha256")
      .update(String(prompt || ""), "utf8")
      .digest("hex");
  } catch {
    return null;
  }
}

function isEligibleCascadeFailure(error) {
  if (!error) return false;
  const message = error.message || "";
  return (
    isSafetyBlock(message) ||
    Boolean(error.retriable) ||
    isMissingModel(message) ||
    /timeout|504|502|503|canceled|for lang tid|emergency fallback skipped/i.test(
      message
    )
  );
}

function friendlyError(message, { anatomical = false } = {}) {
  const text = String(message || "");
  if (isSafetyBlock(text)) {
    return [
      "Sikkerhetsfilteret stoppet alle modellforsøk denne gangen.",
      "Prøv igjen med lavere innsats eller et annet bilde — systemet prøver flere modeller automatisk.",
    ].join(" ");
  }
  if (isMissingModel(text)) {
    return "Replicate fant ikke modell/versjon. Prøv igjen om litt.";
  }
  // Upstream/gateway HTML (Vercel/Replicate 502/504 pages) often surfaces as JSON parse noise.
  if (/Unexpected token|DOCTYPE|is not valid JSON|returnerte HTML/i.test(text)) {
    return [
      "Serveren eller bildemodellen svarte med en feilside (ofte tidsavbrudd).",
      "Prøv igjen — systemet prøver flere Flux-modeller automatisk når det er rom i tidsbudsjettet.",
    ].join(" ");
  }
  if (/for lang tid|timeout|504|canceled/i.test(text)) {
    if (anatomical) {
      return [
        "Generering tok for lang tid hos bildemodellen.",
        "Prøv igjen — systemet prøver flere Flux-modeller automatisk når det er rom i tidsbudsjettet.",
      ].join(" ");
    }
    return [
      "Generering tok for lang tid hos bildemodellen.",
      "Prøv igjen — neste forsøk bytter ofte til en raskere reservedrift.",
    ].join(" ");
  }
  if (/sdxl|nødfallback|cartoon|emergency fallback skipped/i.test(text)) {
    return [
      "Kunne ikke lage et fotorealistisk resultat denne gangen.",
      "Prøv igjen — vi viser ikke tegneserie-/nødfallback-bilder.",
    ].join(" ");
  }
  return text;
}

/**
 * Parse provider/gateway JSON safely. HTML error pages must never become
 * SyntaxError("Unexpected token '<'") leaked to the client.
 */
async function readResponseJson(response, label = "Replicate") {
  const text = await response.text();
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    const err = new Error(`${label} returnerte tomt svar (${response.status}).`);
    err.status = response.status || 502;
    err.retriable = true;
    throw err;
  }
  if (trimmed.startsWith("<") || /^<!DOCTYPE/i.test(trimmed)) {
    const timedOut =
      response.status === 504 ||
      response.status === 502 ||
      response.status === 503 ||
      /timeout|gateway|function invocation/i.test(trimmed);
    const err = new Error(
      timedOut
        ? "Generering tok for lang tid hos bildemodellen. Prøv igjen."
        : `${label} returnerte HTML i stedet for JSON (HTTP ${response.status}). Prøv igjen.`
    );
    err.status =
      response.status && response.status !== 200 ? response.status : 502;
    err.retriable = true;
    throw err;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const err = new Error(
      `${label} returnerte ugyldig JSON (HTTP ${response.status}). Prøv igjen.`
    );
    err.status =
      response.status && response.status !== 200 ? response.status : 502;
    err.retriable = true;
    throw err;
  }
}

/** Future You body transforms: never auto-succeed with SDXL (high strength → cartoons). */
function isBodyTransformEdit({ fat = "decrease", muscle = "toned" } = {}) {
  // Shirtless athletic progress edits — fat-loss / muscle paths that historically hit SDXL cartoons.
  return fat === "decrease" || muscle === "volume" || muscle === "softPowerful";
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
    const prediction = await readResponseJson(response, "Replicate poll");

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
  // Historical: SDXL high strength → cartoons/melted faces.
  // Kept only for rare non-body paths; body transforms skip SDXL entirely.
  // Cap very low if ever invoked.
  const now = Number(extras.bfNow);
  const goal = Number(extras.bfGoal);
  const abs =
    Number.isFinite(now) && Number.isFinite(goal) ? Math.abs(now - goal) : 0;
  const fatLossBoost =
    extras.fat === "decrease" && abs >= 4
      ? intensity === "strong"
        ? 0.04
        : 0.02
      : 0;
  if (intensity === "strong") return Math.min(0.28, 0.22 + fatLossBoost);
  if (intensity === "subtle") return Math.min(0.22, 0.18 + fatLossBoost);
  return Math.min(0.25, 0.2 + fatLossBoost);
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

/**
 * Proven Flux Kontext Pro create-prediction input contract (legacy Future You).
 * Source image field is always `input_image` (data URI). No width/height.
 * Used by reservedrift and by 022E live anatomical prompt delivery.
 */
function buildFluxKontextProInput({
  prompt,
  imageDataUri,
  bfNow,
  bfGoal,
  horizon,
  horizonDate,
}) {
  const now = Number(bfNow);
  const goal = Number(bfGoal);
  const abs =
    Number.isFinite(now) && Number.isFinite(goal) ? Math.abs(now - goal) : 0;
  const months = horizonToMonths(horizon || "12w", horizonDate || "");
  const useUpsampling = Boolean(months >= 12 || abs >= 4);

  return {
    prompt: String(prompt || "").trim(),
    input_image: imageDataUri,
    aspect_ratio: "match_input_image",
    output_format: "png",
    safety_tolerance: 2,
    prompt_upsampling: useUpsampling,
  };
}

function classifyProviderError(status, message) {
  const text = String(message || "");
  const code = Number(status) || 0;
  if (code === 401 || code === 403) return "provider_auth_failed";
  if (code === 404 || isMissingModel(text)) return "provider_model_not_found";
  if (code === 429) return "provider_rate_limited";
  if (code === 400 || code === 422) {
    if (/input|image|field|parameter|validation|invalid/i.test(text)) {
      return "provider_input_contract_failed";
    }
    return "provider_validation_failed";
  }
  if (
    code === 504 ||
    /for lang tid|timeout|timed out|canceled/i.test(text)
  ) {
    return "provider_timeout";
  }
  if (code >= 500 || /prediction|failed|E005|sensitive/i.test(text)) {
    return "provider_prediction_failed";
  }
  return "provider_unknown_failure";
}

function sanitizeProviderMessage(raw) {
  let text = String(raw || "Provider request failed.");
  text = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  text = text.replace(/r8_[A-Za-z0-9]+/gi, "[redacted]");
  text = text.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  text = text.replace(
    /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi,
    "[redacted]"
  );
  if (text.length > 200) text = `${text.slice(0, 199)}…`;
  return text || "Provider request failed.";
}

function attachProviderDiagnostics(err, {
  httpStatus,
  model,
  inputFieldNames,
  endpointClass = "replicate_official_model_predictions",
} = {}) {
  const status = httpStatus ?? err.status ?? null;
  const safe = sanitizeProviderMessage(err.replicateRaw || err.message);
  err.providerHttpStatus = status;
  err.providerErrorCode =
    err.code ||
    (status != null ? `http_${status}` : "provider_error");
  err.providerErrorCategory = classifyProviderError(status, safe);
  err.providerModel = model || DEFAULT_MODEL;
  err.providerEndpointClass = endpointClass;
  err.providerInputFieldNames = Array.isArray(inputFieldNames)
    ? inputFieldNames
    : [];
  err.providerResponseMessageSafe = safe;
  return err;
}

/**
 * Core create + poll using a prebuilt `input` object.
 * Exactly one create request (then optional poll of the same prediction).
 */
async function runPredictionWithInput({
  model,
  input,
  token,
  pollTimeoutMs = ATTEMPT_POLL_TIMEOUT_MS,
  modelLabel = "",
}) {
  const modelRef = parseModelRef(model);
  const attemptStarted = Date.now();
  const attemptBudget = Math.max(
    8000,
    Number(pollTimeoutMs) || ATTEMPT_POLL_TIMEOUT_MS
  );
  const waitSeconds = Math.max(
    5,
    Math.min(CREATE_WAIT_SECONDS, Math.floor(attemptBudget / 1000) - 8)
  );

  const promptForLog = String(input.prompt || "");
  const promptLogged =
    promptForLog.length > 4000
      ? `${promptForLog.slice(0, 4000)}…[truncated ${promptForLog.length} chars]`
      : promptForLog;
  console.log(
    `[replicate] Final prompt → ${modelLabel || modelRef.modelName || model} (${promptForLog.length} chars):`,
    promptLogged
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

  let prediction;
  try {
    prediction = await readResponseJson(createResponse, "Replicate create");
  } catch (parseErr) {
    throw attachProviderDiagnostics(parseErr, {
      httpStatus: parseErr.status || createResponse.status || 502,
      model: modelRef.modelName || model,
      inputFieldNames: Object.keys(input || {}),
    });
  }

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
    throw attachProviderDiagnostics(err, {
      httpStatus: createResponse.status,
      model: modelRef.modelName || model,
      inputFieldNames: Object.keys(input || {}),
    });
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
    throw attachProviderDiagnostics(err, {
      httpStatus: err.status,
      model: modelRef.modelName || model,
      inputFieldNames: Object.keys(input || {}),
    });
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
    throw attachProviderDiagnostics(err, {
      httpStatus: 502,
      model: modelRef.modelName || model,
      inputFieldNames: Object.keys(input || {}),
    });
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
    throw attachProviderDiagnostics(err, {
      httpStatus: 422,
      model: modelRef.modelName || model,
      inputFieldNames: Object.keys(input || {}),
    });
  }

  return {
    imageUrl,
    model: modelRef.modelName || model,
    attempt: modelLabel || "flux-pro",
    inputFieldNames: Object.keys(input || {}),
    providerRequestCount: 1,
    // Demand 022E-F — prediction id for transformation-proof diagnostics (no secrets).
    predictionId:
      typeof prediction?.id === "string" && prediction.id.trim()
        ? prediction.id.trim()
        : null,
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
  modelLabel = "",
}) {
  const modelRef = parseModelRef(model);
  const input = buildModelInput(modelRef, {
    imageDataUri,
    maal,
    intensity,
    extras,
  });
  return runPredictionWithInput({
    model,
    input,
    token,
    pollTimeoutMs,
    modelLabel,
  });
}

/**
 * Single Flux Kontext Pro prediction with a caller-supplied prompt.
 * Reuses the proven legacy transport contract. No cascade, no retry, no
 * legacy reservedrift prompt construction.
 */
async function runFluxKontextProOnce({
  imageDataUri,
  prompt,
  token = process.env.REPLICATE_API_TOKEN,
  model = DEFAULT_MODEL,
  pollTimeoutMs = ATTEMPT_POLL_TIMEOUT_MS,
  bfNow,
  bfGoal,
  horizon,
  horizonDate,
}) {
  if (!token) {
    const err = new Error(
      "REPLICATE_API_TOKEN mangler. Sett den som miljøvariabel i Vercel/skyen."
    );
    err.status = 503;
    throw attachProviderDiagnostics(err, {
      httpStatus: 503,
      model: model || DEFAULT_MODEL,
      inputFieldNames: [],
    });
  }

  const trimmedPrompt = String(prompt || "").trim();
  if (!trimmedPrompt) {
    const err = new Error("Prompt is required for Flux Kontext Pro.");
    err.status = 422;
    throw attachProviderDiagnostics(err, {
      httpStatus: 422,
      model: model || DEFAULT_MODEL,
      inputFieldNames: [],
    });
  }

  if (!imageDataUri || typeof imageDataUri !== "string") {
    const err = new Error("Source image data URI is required.");
    err.status = 422;
    throw attachProviderDiagnostics(err, {
      httpStatus: 422,
      model: model || DEFAULT_MODEL,
      inputFieldNames: [],
    });
  }

  const input = buildFluxKontextProInput({
    prompt: trimmedPrompt,
    imageDataUri,
    bfNow,
    bfGoal,
    horizon,
    horizonDate,
  });

  return runPredictionWithInput({
    model: model || DEFAULT_MODEL,
    input,
    token,
    pollTimeoutMs,
    modelLabel: "flux-pro-live-anatomical",
  });
}

/**
 * Anatomical live-path Flux cascade (Patch 022E-E).
 * Uses the caller-supplied conditioned anatomical prompt for every attempt.
 * Does NOT call byggVisuellPrompt / composeGoalBrief / legacy Dev prompt variants.
 * Same image bytes + same prompt across Max/Pro/Dev. Max 3 sequential attempts.
 */
async function runFluxKontextAnatomicalCascade({
  imageDataUri,
  prompt,
  token = process.env.REPLICATE_API_TOKEN,
  bfNow,
  bfGoal,
  intensity = "moderate",
  zones,
  fat = "decrease",
  horizon,
  horizonDate,
  months,
  pollTimeoutMs = ATTEMPT_POLL_TIMEOUT_MS,
  /** Optional wall-clock override (ms) so API can shrink budget near soft deadline. */
  cascadeBudgetMs = CASCADE_BUDGET_MS,
  /** Test-only: ({ model, label, input, pollTimeoutMs, token }) => result */
  runAttempt,
} = {}) {
  const routingMeta = () => ({
    providerRoutingStrategy: "flux_ordered_fallback",
    providerRoutingReason: null,
    providerAttemptPlan: [],
    providerAttempts: [],
    providerRequestCount: 0,
    providerFallbackUsed: false,
    providerSuccessfulModel: null,
    providerInitialModel: null,
    providerFinalOutcome: "not_started",
    preferMax: false,
    highE005Risk: false,
  });

  if (!token && typeof runAttempt !== "function") {
    const err = new Error(
      "REPLICATE_API_TOKEN mangler. Sett den som miljøvariabel i Vercel/skyen."
    );
    err.status = 503;
    Object.assign(err, routingMeta());
    throw attachProviderDiagnostics(err, {
      httpStatus: 503,
      model: DEFAULT_MODEL,
      inputFieldNames: [],
    });
  }

  const trimmedPrompt = String(prompt || "").trim();
  if (!trimmedPrompt) {
    const err = new Error("Prompt is required for Flux anatomical cascade.");
    err.status = 422;
    Object.assign(err, routingMeta());
    throw attachProviderDiagnostics(err, {
      httpStatus: 422,
      model: DEFAULT_MODEL,
      inputFieldNames: [],
    });
  }

  if (!imageDataUri || typeof imageDataUri !== "string") {
    const err = new Error("Source image data URI is required.");
    err.status = 422;
    Object.assign(err, routingMeta());
    throw attachProviderDiagnostics(err, {
      httpStatus: 422,
      model: DEFAULT_MODEL,
      inputFieldNames: [],
    });
  }

  const configured = getConfiguredModels();
  const plan = buildFluxAttemptPlan({
    fat,
    bfNow,
    bfGoal,
    intensity,
    zones,
    horizon,
    horizonDate,
    months,
    model: configured.model,
    secondaryModel: configured.secondaryModel,
    tertiaryModel: configured.tertiaryModel,
  });

  const input = buildFluxKontextProInput({
    prompt: trimmedPrompt,
    imageDataUri,
    bfNow,
    bfGoal,
    horizon,
    horizonDate,
  });
  const promptHash = hashPromptSha256(trimmedPrompt);
  const attemptPlanLabels = plan.attempts.map((a) => a.label);
  const initialModel = plan.attempts[0]?.model || null;

  console.info(
    `[replicate] Anatomical route: ${plan.primaryLabel} first (` +
      `${plan.preferMax ? "demanding" : "mild"}; reason=${plan.routingReason}; ` +
      `highE005Risk=${plan.highE005Risk}; skipPro=${plan.skipSiblingPremium}; ` +
      `plan=${attemptPlanLabels.join("→")})`
  );

  const attemptRunner =
    typeof runAttempt === "function"
      ? runAttempt
      : async ({ model, label, pollTimeoutMs: attemptPollMs }) =>
          runPredictionWithInput({
            model,
            input,
            token,
            pollTimeoutMs: attemptPollMs,
            modelLabel: `${label}-anatomical`,
          });

  const providerAttempts = [];
  let lastError = null;
  const skipLabels = new Set();
  const cascadeStarted = Date.now();
  const uniqueAttempts = plan.attempts;
  const wallBudget = Math.max(
    MIN_ATTEMPT_MS,
    Number(cascadeBudgetMs) || CASCADE_BUDGET_MS
  );

  for (let i = 0; i < uniqueAttempts.length; i++) {
    const attempt = uniqueAttempts[i];
    if (skipLabels.has(attempt.label)) {
      console.warn(
        `[replicate] Skipping ${attempt.label} after premium E005 (same input)`
      );
      providerAttempts.push({
        model: attempt.model,
        label: attempt.label,
        outcome: "skipped_sibling_premium",
        promptHash,
        eligibleFailure: false,
      });
      continue;
    }
    const remainingBudget = wallBudget - (Date.now() - cascadeStarted);
    if (remainingBudget < MIN_ATTEMPT_MS) {
      console.warn(
        `[replicate] Anatomical cascade budget exhausted — stopping before ${attempt.label}`
      );
      if (!lastError) {
        lastError = new Error(
          "Generering tok for lang tid hos bildemodellen. Prøv igjen."
        );
        lastError.status = 504;
        lastError.retriable = true;
      }
      break;
    }
    const attemptPollMs = Math.min(
      Number(pollTimeoutMs) || ATTEMPT_POLL_TIMEOUT_MS,
      remainingBudget
    );
    try {
      console.info(
        `[replicate] Anatomical attempt ${attempt.label} (budget ${Math.round(
          attemptPollMs / 1000
        )}s)`
      );
      const result = await attemptRunner({
        model: attempt.model,
        label: attempt.label,
        input,
        prompt: trimmedPrompt,
        imageDataUri,
        token,
        pollTimeoutMs: attemptPollMs,
      });
      if (!result?.imageUrl) {
        const err = new Error("Provider returned no image URL.");
        err.status = 502;
        throw err;
      }
      providerAttempts.push({
        model: result.model || attempt.model,
        label: attempt.label,
        outcome: "success",
        promptHash,
        predictionId: result.predictionId || null,
        eligibleFailure: false,
      });
      const fallbackUsed = attempt.label !== plan.primaryLabel;
      return {
        imageUrl: result.imageUrl,
        model: result.model || attempt.model,
        attempt: attempt.label,
        inputFieldNames:
          result.inputFieldNames || Object.keys(input || {}),
        usedFallback: fallbackUsed,
        preferredModel: plan.primaryLabel,
        providerRoutingStrategy: "flux_ordered_fallback",
        providerRoutingReason: plan.routingReason,
        providerAttemptPlan: attemptPlanLabels,
        providerAttempts,
        providerRequestCount: providerAttempts.filter(
          (a) => a.outcome === "success" || a.outcome === "failed"
        ).length,
        providerFallbackUsed: fallbackUsed,
        providerSuccessfulModel: result.model || attempt.model,
        providerInitialModel: initialModel,
        providerFinalOutcome: "success",
        preferMax: plan.preferMax,
        highE005Risk: plan.highE005Risk,
        promptHash,
        predictionId: result.predictionId || null,
        predictionIds: providerAttempts
          .map((a) => a.predictionId)
          .filter(Boolean),
      };
    } catch (error) {
      lastError = error;
      const safetyHit = isSafetyBlock(error.message);
      const eligible = isEligibleCascadeFailure(error);
      providerAttempts.push({
        model: attempt.model,
        label: attempt.label,
        outcome: "failed",
        promptHash,
        eligibleFailure: eligible,
        errorCategory:
          error.providerErrorCategory ||
          classifyProviderError(error.status, error.message),
        safeMessage: sanitizeProviderMessage(
          error.replicateRaw || error.message
        ),
      });
      if (safetyHit && isPremiumFluxLabel(attempt.label)) {
        for (const a of uniqueAttempts) {
          if (a.label !== attempt.label && isPremiumFluxLabel(a.label)) {
            skipLabels.add(a.label);
          }
        }
      }
      const hasNext = uniqueAttempts
        .slice(i + 1)
        .some((a) => !skipLabels.has(a.label));
      const canContinue = hasNext && eligible;
      console.warn(
        `[replicate] Anatomical attempt ${attempt.label} failed` +
          (error.status ? ` (HTTP/status ${error.status})` : "") +
          ":",
        error.replicateRaw || error.message,
        canContinue ? "→ trying next" : "→ stop"
      );
      if (!canContinue) break;
    }
  }

  const requestCount = providerAttempts.filter(
    (a) => a.outcome === "success" || a.outcome === "failed"
  ).length;
  const err =
    lastError ||
    new Error("Kunne ikke lage et fotorealistisk Future You-bilde. Prøv igjen.");
  err.status = lastError?.status || 502;
  err.message = friendlyError(err.message, { anatomical: true });
  err.providerRoutingStrategy = "flux_ordered_fallback";
  err.providerRoutingReason = plan.routingReason;
  err.providerAttemptPlan = attemptPlanLabels;
  err.providerAttempts = providerAttempts;
  err.providerRequestCount = requestCount;
  err.providerFallbackUsed = requestCount > 1;
  err.providerSuccessfulModel = null;
  err.providerInitialModel = initialModel;
  err.providerFinalOutcome = "all_attempts_failed";
  err.preferMax = plan.preferMax;
  err.highE005Risk = plan.highE005Risk;
  err.promptHash = promptHash;
  throw attachProviderDiagnostics(err, {
    httpStatus: err.status,
    model: lastError?.providerModel || initialModel || DEFAULT_MODEL,
    inputFieldNames: Object.keys(input || {}),
  });
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

  const plan = buildFluxAttemptPlan({
    fat,
    bfNow,
    bfGoal,
    intensity,
    zones: zones || zone,
    horizon,
    horizonDate,
    model,
    secondaryModel: configured.secondaryModel,
    tertiaryModel,
  });
  const preferMax = plan.preferMax;
  const highE005Risk = plan.highE005Risk;
  const skipSiblingPremium = plan.skipSiblingPremium;
  const primaryLabel = plan.primaryLabel;
  // Body transforms: never auto-succeed with SDXL (cartoons). Prefer second Dev pass.
  const skipSdxlEmergency = isBodyTransformEdit({ fat, muscle });

  console.info(
    `[replicate] Route: ${primaryLabel} first (${preferMax ? "demanding edit" : "mild edit"}; horizon=${horizon || "12w"}; highE005Risk=${highE005Risk}; skipPro=${skipSiblingPremium}; skipSdxl=${skipSdxlEmergency})`
  );

  // Shared Flux order from buildFluxAttemptPlan, then legacy Dev-strong (+ optional SDXL).
  // Per-attempt ~35s + cascade budget ~130s so reservedrift still finishes under Vercel/client.
  const attempts = [
    ...plan.attempts.map((a) =>
      a.label === "flux-dev" ? { ...a, promptVariant: "dev" } : { ...a }
    ),
    {
      model: tertiaryModel,
      label: "flux-dev-strong",
      promptVariant: "devStrong",
    },
    ...(skipSdxlEmergency
      ? []
      : [{ model: fallbackModel, label: "sdxl-emergency" }]),
  ];

  // Allow same model twice when labels differ (Dev → Dev-strong with different prompts).
  const seen = new Set();
  const uniqueAttempts = attempts.filter((a) => {
    if (!a.model) return false;
    const key = `${a.label}::${a.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
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
      const attemptExtras = {
        ...extras,
        promptVariant: attempt.promptVariant || extras.promptVariant || "",
      };
      const result = await runPrediction({
        model: attempt.model,
        imageDataUri,
        maal,
        intensity,
        token,
        extras: attemptExtras,
        pollTimeoutMs,
        modelLabel: attempt.label,
      });
      // Hard guard: never celebrate SDXL cartoons as a successful Future You result.
      if (
        attempt.label === "sdxl-emergency" ||
        String(attempt.label).includes("sdxl")
      ) {
        console.warn(
          "[replicate] SDXL produced output but is not returned as success for body transforms — treating as failure"
        );
        const err = new Error(
          "emergency fallback skipped — photorealistic Flux result required"
        );
        err.status = 502;
        err.retriable = false;
        throw err;
      }
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
      const canContinue = hasNext && isEligibleCascadeFailure(error);
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
    // Prefer a clear retry message when cascade ended without a photoreal Flux result.
    if (
      skipSdxlEmergency &&
      !isSafetyBlock(lastError.message) &&
      !/for lang tid|timeout|504/i.test(lastError.message || "")
    ) {
      lastError.message = [
        "Kunne ikke lage et fotorealistisk Future You-bilde denne gangen.",
        "Prøv igjen — tegneserie-/nødfallback brukes ikke lenger.",
      ].join(" ");
    } else {
      lastError.message = friendlyError(lastError.message);
    }
    throw lastError;
  }

  const err = new Error(
    skipSdxlEmergency
      ? "Kunne ikke lage et fotorealistisk Future You-bilde. Prøv igjen."
      : "Kunne ikke generere bilde."
  );
  err.status = 502;
  throw err;
}

module.exports = {
  generateWithReplicate,
  runFluxKontextProOnce,
  runFluxKontextAnatomicalCascade,
  buildFluxAttemptPlan,
  buildFluxKontextProInput,
  buildPrompt,
  buildPromptHolistic,
  genererAiPrompt,
  sanitizeGoal,
  composeGoalBrief,
  getConfiguredModels,
  isValidModelRef,
  needsMaxEdit,
  isHighE005Risk,
  isBodyTransformEdit,
  fatDeltaPoints,
  transformIntensityLevel,
  horizonToMonths,
  timelineScaleBoost,
  physiqueChangeDistance,
  anatomicalForceKeywords,
  leggTilEkstremeVisuelleMarkører,
  byggTransformasjonsDetaljer,
  byggVisuellPrompt,
  isSlimVisualPromptEnabled,
  classifyProviderError,
  sanitizeProviderMessage,
  ATTEMPT_POLL_TIMEOUT_MS,
  CASCADE_BUDGET_MS,
  FUNCTION_SOFT_DEADLINE_MS,
  MIN_ATTEMPT_MS,
  CREATE_WAIT_SECONDS,
  friendlyError,
  readResponseJson,
  DEFAULT_MODEL,
  DEFAULT_FALLBACK_MODEL,
  SECONDARY_MODEL,
  TERTIARY_MODEL,
};
