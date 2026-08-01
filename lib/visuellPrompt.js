/**
 * Slim visual prompt builder for Flux Kontext image generation.
 *
 * ONLY timeline + main goal (fat/muscle direction) + focus zones (+ brief BF target)
 * drive the image prompt. Training plan, sleep, steps, Tempo, medicine, pace,
 * BMI essays, frame/shape monologues, outcomes lists, dual-recomp novels, etc.
 * stay out of this path — they can still live in the dashboard / holistic engine.
 *
 * Re-enable variables one-by-one later if a specific cue proves necessary.
 * Flag: VISUAL_PROMPT_SLIM (default ON). Set to "0" to use the old holistic engine.
 */

const HORIZON_MONTHS = {
  "4w": 1,
  "8w": 2,
  "12w": 3,
  "24w": 6,
  "18m": 18,
};

const ZONE_LABELS = {
  overall: "full athletic silhouette",
  abs: "waist and midsection",
  glutes: "glutes",
  thighs: "thighs",
  arms: "arms",
  chest: "chest",
  shoulders: "shoulders",
  back: "upper back",
  upper: "arms, shoulders and chest",
  lower: "glutes and legs",
  posture: "upright athletic posture",
};

/**
 * @param {string} [horizon]
 * @param {string} [horizonDate]
 * @returns {number}
 */
function resolveMonths(horizon = "12w", horizonDate = "") {
  if (horizon === "custom" && horizonDate) {
    const target = new Date(`${horizonDate}T12:00:00`);
    if (!Number.isNaN(target.getTime())) {
      const days = Math.max(7, Math.round((target - new Date()) / 86400000));
      return Math.max(0.25, Math.round((days / 30) * 10) / 10);
    }
  }
  return HORIZON_MONTHS[horizon] || 3;
}

/**
 * @param {string[]|string} zones
 * @returns {string[]}
 */
function normalizeZones(zones) {
  let list = [];
  if (Array.isArray(zones)) list = zones.map(String);
  else if (typeof zones === "string" && zones.trim()) {
    list = zones.split(/[,\s]+/).filter(Boolean);
  }
  list = list.filter((z) => ZONE_LABELS[z]);
  return list.length ? [...new Set(list)] : [];
}

/**
 * Map fat + muscle chips to one visual goal mode.
 * @returns {"fatLoss"|"muscleBuild"|"softGain"|"maintain"}
 */
function resolveMainGoal(fat = "decrease", muscle = "toned") {
  if (fat === "increase") return "softGain";
  if (fat === "maintain") {
    return muscle === "volume" || muscle === "softPowerful"
      ? "muscleBuild"
      : "maintain";
  }
  // fat decrease — toned/tighten vs volume hypertrophy
  if (muscle === "volume" || muscle === "softPowerful") return "muscleBuild";
  return "fatLoss";
}

/**
 * One short BF encoding for the goal (not a full profile dump).
 * @returns {string}
 */
function briefBfPhrase(bfGoal) {
  const goal = Number(bfGoal);
  if (!Number.isFinite(goal) || goal <= 0) return "";
  if (goal < 12) return `lean ~${goal}% body fat physique`;
  if (goal < 16) return `lean athletic ~${goal}% body fat physique`;
  if (goal < 20) return `athletic ~${goal}% body fat physique`;
  if (goal < 28) return `softer athletic ~${goal}% body fat look`;
  return `softer fuller physique near ~${goal}% body fat`;
}

/**
 * BF %-point gap used to keep large drops from collapsing into near-zero language.
 * @returns {number}
 */
function absBfDelta(bfNow, bfGoal) {
  const now = Number(bfNow);
  const goal = Number(bfGoal);
  if (!Number.isFinite(now) || !Number.isFinite(goal) || now <= 0 || goal <= 0) {
    return 0;
  }
  return Math.round(Math.abs(now - goal) * 10) / 10;
}

/** Exact Frøydis calibration copy — ~3 months (12w). */
const TIMELINE_CALIBRATION_3MO =
  "A clearly visible reduction in surface body fat, noticeably tighter waistline, early but distinct muscle definition.";

/** Exact Frøydis calibration copy — ~6 months (24w). */
const TIMELINE_CALIBRATION_6MO =
  "A significant and highly noticeable body transformation, clearly sculpted midsection, distinct muscle separation across the chest and arms.";

/** Proportion lock for targets over 6 months (months > 6) — stops disproportionate arm swelling. */
const PROPORTION_LOCK_OVER_6MO =
  "anatomically correct athletic build, natural and balanced body proportions, muscle growth is strictly proportionate to the original skeletal structure, no exaggerated or unnatural swelling of the arms.";

/** Photorealism lock — all horizons (blocks cartoon / plastic / CGI SDXL-style drift). */
const PHOTOREALISM_LOCK =
  "photorealistic photograph, natural skin texture, real pores, no cartoon, no illustration, no CGI, no plastic skin, preserve face identity sharply.";

/**
 * Extra force when Flux Dev runs after Max/Pro E005 (Dev under-edits / identity lock wins).
 * Still athletic / non-NSFW — demands visible change without sexualized language.
 */
const DEV_CHANGE_FORCE =
  "MUST differ from the input photo: visible waist and body-fat recomposition required — not a near-copy. Photorealistic photograph of a real person, not illustration.";

/** Second Dev pass — slightly stronger change language if first Dev was too conservative. */
const DEV_STRONG_CHANGE_FORCE =
  "CRITICAL: side-by-side difference from the source must be obvious at a glance — narrower waist, less soft midsection tissue, clearer athletic outline. Keep the exact same face sharply. Photorealistic photograph only — never cartoon, melted, or plastic skin.";

/**
 * ~3 months bucket (covers 12w = 3 and nearby custom dates).
 * @param {number} months
 */
function isAbout3Months(months) {
  const m = Number(months) || 0;
  return m > 2 && m <= 4;
}

/**
 * ~6 months bucket (covers 24w = 6 and nearby custom dates).
 * @param {number} months
 */
function isAbout6Months(months) {
  const m = Number(months) || 0;
  return m > 4 && m <= 6;
}

/**
 * Exact timeline calibration sentence for the API prompt (3mo / 6mo).
 * Empty for other horizons (1–2mo, >6mo use intensity + proportion lock instead).
 * @param {number} months
 * @returns {string}
 */
function timelineCalibrationLine(months) {
  if (isAbout3Months(months)) return TIMELINE_CALIBRATION_3MO;
  if (isAbout6Months(months)) return TIMELINE_CALIBRATION_6MO;
  return "";
}

/**
 * Anatomical proportion lock for mål over 6 måneder (months > 6).
 * @param {number} months
 * @returns {string}
 */
function proportionLockLine(months) {
  const m = Number(months) || 0;
  return m > 6 ? PROPORTION_LOCK_OVER_6MO : "";
}

/**
 * Timeline + BF-delta intensity for visual language.
 * Scale: short noticeable → short clear (≥4pp) → mid clear → mid strong (≥4pp) → long dramatic.
 * Large BF delta (≥4pp) never collapses to toning-only on short horizons.
 * @returns {"noticeable"|"clear"|"strong"|"dramatic"}
 */
function visualIntensity(months, absDelta = 0) {
  const m = Number(months) || 3;
  const abs = Number(absDelta) || 0;
  const large = abs >= 4;
  if (m >= 12) return "dramatic";
  if (m <= 3) return large ? "clear" : "noticeable";
  // mid (~6mo and <12)
  return large ? "strong" : "clear";
}

/**
 * Timeline-scaled anatomical change lines (rich but short).
 * Scale: ~3mo / ~6mo use exact calibration sentences (no slight/subtle/gradual);
 * ≥12mo most dramatic + proportion lock injected separately.
 * Never use "barely perceptible" / toning-only for fat-loss with a real BF target.
 */
function mainGoalLines(mode, months, bfGoal, bfNow) {
  const m = Number(months) || 3;
  const bf = briefBfPhrase(bfGoal);
  const bfClause = bf ? ` — ${bf}` : "";
  const abs = absBfDelta(bfNow, bfGoal);
  const intensity = visualIntensity(m, abs);
  const calibration = timelineCalibrationLine(m);
  const deltaCue =
    abs >= 4
      ? ` Required change: about ${abs} percentage points of body fat vs the source — must be obvious side-by-side.`
      : abs >= 2
        ? ` Required change: about ${abs} percentage points vs the source — visibly different, not a near-copy.`
        : " Output must look clearly different from the source — not a near-copy.";

  if (mode === "softGain") {
    if (intensity === "dramatic") {
      return `Profound soft-tissue gain over ~${m} months: fuller softer midsection, thicker waist, softer arms/chest${bfClause}. Silhouette must look clearly heavier than the source.${deltaCue}`;
    }
    if (intensity === "noticeable") {
      return `Noticeable soft-tissue increase over ~${m} months: fuller midsection, softer thicker waist${bfClause}.${deltaCue}`;
    }
    if (intensity === "strong") {
      return `Clear strong soft-tissue increase over ~${m} months: fuller softer abdomen, thicker waist, softer arms/chest${bfClause}. Markedly heavier than early months.${deltaCue}`;
    }
    return `Clear soft-tissue increase over ~${m} months: fuller softer abdomen and thicker waist${bfClause}.${deltaCue}`;
  }

  if (mode === "maintain") {
    return `Keep body-fat softness similar over ~${m} months; only muscle-shape refinement${bfClause}.`;
  }

  // Fat-loss / muscle-build: push exact 3mo / 6mo calibration into the API prompt.
  if (calibration && (mode === "fatLoss" || mode === "muscleBuild")) {
    const lead =
      mode === "muscleBuild"
        ? `Athletic muscle development over ~${m} months${bfClause}.`
        : `Athletic fat-loss recomposition over ~${m} months${bfClause}.`;
    return [lead, calibration, deltaCue.trim()].join(" ");
  }

  if (mode === "muscleBuild") {
    if (intensity === "dramatic") {
      return [
        `Dramatic athletic muscle build over ~${m} months${bfClause}.`,
        "Wider shoulders, fuller arms and chest, broader upper-back line, upright posture.",
        "If fat loss is also active: narrower waist with less soft belly tissue — not merely thinner.",
        deltaCue.trim(),
      ].join(" ");
    }
    if (intensity === "noticeable") {
      return [
        `Noticeable muscle development over ~${m} months${bfClause}.`,
        "Visibly fuller shoulders, firmer arms, early upper-body athletic shape.",
        deltaCue.trim(),
      ].join(" ");
    }
    if (intensity === "strong") {
      return [
        `Clear strong muscle development over ~${m} months${bfClause}.`,
        "Wider shoulders, fuller arms and chest, firmer athletic outline — clearly stronger than a 3-month look.",
        deltaCue.trim(),
      ].join(" ");
    }
    return [
      `Clear muscle development over ~${m} months${bfClause}.`,
      "Wider shoulders, fuller arms/chest, firmer athletic outline.",
      deltaCue.trim(),
    ].join(" ");
  }

  // fatLoss / tighten (default) — commanding anatomical lines at scaled intensity
  if (intensity === "dramatic") {
    return [
      `Dramatic athletic fat-loss recomposition over ~${m} months${bfClause}.`,
      "Markedly narrower waist; subcutaneous fat on lower abdomen and flanks significantly reduced.",
      "Clearer natural muscle separation in shoulders and arms — photorealistic, not contest CGI.",
      deltaCue.trim(),
    ].join(" ");
  }
  if (intensity === "noticeable") {
    return [
      `Noticeable athletic fat-loss progress over ~${m} months${bfClause}.`,
      "Waist visibly narrower; lower-abdomen soft tissue reduced; flanks tighter; early firmer midsection.",
      "Clearer shoulder/arm outline — meaningful recomposition, not toning-only.",
      deltaCue.trim(),
    ].join(" ");
  }
  if (intensity === "strong") {
    return [
      `Clear strong athletic fat-loss recomposition over ~${m} months${bfClause}.`,
      "Waist clearly narrower than the source; lower-abdomen and flank soft tissue substantially reduced.",
      "Firmer flatter midsection; clearer natural muscle outline in shoulders and arms.",
      "Stronger visible change than early months — still photorealistic, not contest CGI.",
      deltaCue.trim(),
    ].join(" ");
  }
  // clear — short horizon + large BF delta (≥4pp), or mid without large delta
  return [
    `Clear athletic fat-loss recomposition over ~${m} months${bfClause}.`,
    "Waist clearly narrower; lower-abdomen and flank soft tissue visibly reduced; firmer midsection.",
    "Clearer natural shoulder/arm outline — meaningful body change, not light toning.",
    deltaCue.trim(),
  ].join(" ");
}

/**
 * Concise zone emphasis (one short clause).
 */
function zoneLine(zones, mode) {
  const list = normalizeZones(zones);
  if (!list.length) {
    return "Reshape the full athletic silhouette in sync with the goal — whole-body consistent.";
  }
  const labels = list.map((z) => ZONE_LABELS[z] || z);
  const focus = labels.join(", ");
  if (mode === "softGain") {
    return `Focus emphasis: ${focus} — softer and fuller there, still whole-body consistent.`;
  }
  if (mode === "muscleBuild") {
    return `Focus emphasis: ${focus} — fuller athletic muscle shape there, still whole-body consistent.`;
  }
  if (mode === "maintain") {
    return `Focus emphasis: ${focus} — shape refinement only.`;
  }
  return `Focus emphasis: ${focus} — visibly leaner and tighter there (waist/soft tissue must change), still whole-body consistent.`;
}

/**
 * Build a short commanding English Flux prompt.
 *
 * Allowed drivers: horizon/months, fat, muscle, zones, optional brief bfGoal.
 * Everything else (medicine, BMI, pace, outcomes essays, shape/frame novels) is ignored here.
 *
 * @param {object} opts
 * @param {string} [opts.horizon]
 * @param {string} [opts.horizonDate]
 * @param {string} [opts.fat] — decrease | increase | maintain
 * @param {string} [opts.muscle] — toned | volume | softPowerful
 * @param {string[]|string} [opts.zones]
 * @param {number|string} [opts.months]
 * @param {number|string} [opts.bfNow] — scales change force with bfGoal (large delta ≥4pp)
 * @param {number|string} [opts.bfGoal] — brief goal encoding + delta vs bfNow
 * @param {string} [opts.promptVariant] — "" | "dev" | "devStrong" (Flux Dev cascade)
 * @returns {{ prompt: string, months: number, mode: string, zones: string[], intensity: string, promptVariant: string }}
 */
function byggVisuellPrompt({
  horizon = "12w",
  horizonDate = "",
  fat = "decrease",
  muscle = "toned",
  zones = [],
  months,
  bfNow,
  bfGoal,
  promptVariant = "",
} = {}) {
  const m =
    Number.isFinite(Number(months)) && Number(months) > 0
      ? Number(months)
      : resolveMonths(horizon, horizonDate);
  const mode = resolveMainGoal(fat, muscle);
  const zoneList = normalizeZones(zones);
  const abs = absBfDelta(bfNow, bfGoal);
  const intensity = visualIntensity(m, abs);
  // Exact 3mo/6mo sentences live inside mainGoalLines; proportion lock is separate for >6mo.
  const proportionLock = proportionLockLine(m);
  const variant = String(promptVariant || "").trim();
  const devForce =
    variant === "devStrong"
      ? DEV_STRONG_CHANGE_FORCE
      : variant === "dev"
        ? DEV_CHANGE_FORCE
        : "";

  const prompt = [
    // Minimal fixed identity + athletic framing (non-NSFW).
    "Professional fitness progress photo (non-NSFW athletic documentation). Exact same person, face, hair, room, pose, camera angle, lighting and clothing as the original — ONLY body composition changes.",
    "Bare torso / shirtless gym physique is normal athletic coaching documentation — not sexual, not erotic.",
    // Timeline + main goal (commanding, short) — intensity scales with months + BF delta.
    mainGoalLines(mode, m, bfGoal, bfNow),
    proportionLock,
    zoneLine(zoneList, mode),
    // Dev after Max/Pro E005: identity lock often wins — force visible recomposition.
    devForce,
    PHOTOREALISM_LOCK,
    "Safe athletic context only. No text, watermark, or logo.",
  ]
    .filter(Boolean)
    .join(" ");

  return { prompt, months: m, mode, zones: zoneList, intensity, promptVariant: variant };
}

/**
 * Whether the live app should use the slim builder (default ON).
 * Set VISUAL_PROMPT_SLIM=0 to fall back to the holistic engine.
 */
function isSlimVisualPromptEnabled() {
  const raw = String(process.env.VISUAL_PROMPT_SLIM ?? "1").trim();
  return raw !== "0" && raw.toLowerCase() !== "false" && raw !== "off";
}

module.exports = {
  byggVisuellPrompt,
  isSlimVisualPromptEnabled,
  resolveMonths,
  resolveMainGoal,
  normalizeZones,
  briefBfPhrase,
  absBfDelta,
  visualIntensity,
  timelineCalibrationLine,
  proportionLockLine,
  TIMELINE_CALIBRATION_3MO,
  TIMELINE_CALIBRATION_6MO,
  PROPORTION_LOCK_OVER_6MO,
  PHOTOREALISM_LOCK,
  DEV_CHANGE_FORCE,
  DEV_STRONG_CHANGE_FORCE,
};
