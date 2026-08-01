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
 * Timeline-scaled anatomical change lines (rich but short).
 * short ≤3mo subtle; mid clearer; ≥12mo dramatic.
 */
function mainGoalLines(mode, months, bfGoal) {
  const m = Number(months) || 3;
  const bf = briefBfPhrase(bfGoal);
  const bfClause = bf ? ` — ${bf}` : "";

  if (mode === "softGain") {
    if (m >= 12) {
      return `Profound soft-tissue gain over ~${m} months: fuller softer midsection, thicker waist, softer arms/chest${bfClause}. Silhouette must look clearly heavier than the source.`;
    }
    if (m <= 3) {
      return `Subtle soft-tissue increase over ~${m} months: slightly fuller midsection and softer waist${bfClause}.`;
    }
    return `Clear soft-tissue increase over ~${m} months: fuller softer abdomen and thicker waist${bfClause}.`;
  }

  if (mode === "maintain") {
    return `Keep body-fat softness similar over ~${m} months; only subtle muscle-shape refinement${bfClause}.`;
  }

  if (mode === "muscleBuild") {
    if (m >= 12) {
      return [
        `Dramatic athletic muscle build over ~${m} months${bfClause}.`,
        "Wider shoulders, fuller arms and chest, broader upper-back line, upright posture.",
        "If fat loss is also active: narrower waist with less soft belly tissue — not merely thinner.",
      ].join(" ");
    }
    if (m <= 3) {
      return `Subtle muscle development over ~${m} months: slightly fuller shoulders and firmer arms${bfClause}.`;
    }
    return `Clear muscle development over ~${m} months: wider shoulders, fuller arms/chest, firmer athletic outline${bfClause}.`;
  }

  // fatLoss / tighten (default)
  if (m >= 12) {
    return [
      `Dramatic athletic fat-loss recomposition over ~${m} months${bfClause}.`,
      "Markedly narrower waist; subcutaneous fat on lower abdomen and flanks significantly reduced.",
      "Clearer natural muscle separation in shoulders and arms — photorealistic, not contest CGI.",
    ].join(" ");
  }
  if (m <= 3) {
    return `Subtle fat-loss progress over ~${m} months: slightly tighter waist, mild midsection tighten, light toning${bfClause}.`;
  }
  return `Clear fat-loss progress over ~${m} months: narrower waist, reduced lower-belly soft tissue, leaner athletic silhouette${bfClause}.`;
}

/**
 * Concise zone emphasis (one short clause).
 */
function zoneLine(zones, mode) {
  const list = normalizeZones(zones);
  if (!list.length) return "Emphasize the full athletic silhouette in sync with the goal.";
  const labels = list.map((z) => ZONE_LABELS[z] || z);
  const focus = labels.join(", ");
  if (mode === "softGain") {
    return `Focus emphasis: ${focus} — softer and fuller there, still whole-body consistent.`;
  }
  if (mode === "muscleBuild") {
    return `Focus emphasis: ${focus} — fuller athletic muscle shape there, still whole-body consistent.`;
  }
  if (mode === "maintain") {
    return `Focus emphasis: ${focus} — subtle shape refinement only.`;
  }
  return `Focus emphasis: ${focus} — leaner and tighter there, still whole-body consistent.`;
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
 * @param {number|string} [opts.bfNow] — unused in prose (kept for API symmetry)
 * @param {number|string} [opts.bfGoal] — brief goal encoding only
 * @returns {{ prompt: string, months: number, mode: string, zones: string[] }}
 */
function byggVisuellPrompt({
  horizon = "12w",
  horizonDate = "",
  fat = "decrease",
  muscle = "toned",
  zones = [],
  months,
  bfGoal,
} = {}) {
  const m =
    Number.isFinite(Number(months)) && Number(months) > 0
      ? Number(months)
      : resolveMonths(horizon, horizonDate);
  const mode = resolveMainGoal(fat, muscle);
  const zoneList = normalizeZones(zones);

  const prompt = [
    // Minimal fixed identity + athletic framing (non-NSFW).
    "Professional fitness progress photo (non-NSFW athletic documentation). Exact same person, face, hair, room, pose, camera angle, lighting and clothing as the original — ONLY body composition changes.",
    "Bare torso / shirtless gym physique is normal athletic coaching documentation — not sexual, not erotic.",
    // Timeline + main goal (commanding, short).
    mainGoalLines(mode, m, bfGoal),
    zoneLine(zoneList, mode),
    "Photorealistic smartphone / studio fitness photo. Natural skin and proportions. No cartoon, CGI, bodybuilder caricature, or sexualized posing.",
    "Safe athletic context only. No text, watermark, or logo.",
  ]
    .filter(Boolean)
    .join(" ");

  return { prompt, months: m, mode, zones: zoneList };
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
};
