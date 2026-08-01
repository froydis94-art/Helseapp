/**
 * Rule-based anatomical escalation ("før/etter") for Flux prompts.
 *
 * Injects phase-specific transformation details the model otherwise forgets,
 * so long-horizon Max edits do not return near-unchanged copies.
 *
 * Athletic / documentation wording only — avoid NSFW-triggering language (E005).
 * Keep this module concise: callers must inject the result ONCE (not twice).
 */

/** Exact Frøydis calibration — ~3 months (changeForce 1). */
const TIMELINE_CALIBRATION_3MO =
  "A clearly visible reduction in surface body fat, noticeably tighter waistline, early but distinct muscle definition.";

/** Exact Frøydis calibration — ~6 months (changeForce 2, ~2× 3mo). */
const TIMELINE_CALIBRATION_6MO =
  "A significant and highly noticeable body transformation — roughly twice the visible change of a 3-month look: clearly sculpted midsection, distinct muscle separation across the chest and arms.";

/**
 * Top rung — ~12 months (changeForce 4, ~2× 6mo).
 * Former 18m / 1.5y dramatic language maps here.
 */
const TIMELINE_CALIBRATION_12MO =
  "A full athletic recomposition — roughly twice the visible change of a 6-month look: dramatically narrower waist, major soft-tissue loss across midsection and flanks, clear natural muscle separation and athletic outline — still a photorealistic photograph of this person, not a caricature.";

/** Proportion lock for mål over 6 måneder (months > 6). */
const PROPORTION_LOCK_OVER_6MO =
  "anatomically correct athletic build, natural and balanced body proportions, muscle growth is strictly proportionate to the original skeletal structure, no exaggerated or unnatural swelling of the arms.";

/** @typedef {"early"|"mid"|"long"|"extended"} TransformPhase */

/**
 * Map timeline months to a visual training phase.
 * Ladder: ~3mo early → ~6mo mid → ≥12mo long (legacy 18m treated as long top rung).
 * @param {number|string} months
 * @returns {TransformPhase}
 */
function phaseForMonths(months) {
  const m = Number(months) || 3;
  if (m <= 4) return "early";
  if (m <= 8) return "mid";
  // ≥12mo (and legacy 18m): same top-rung language
  if (m < 17) return "long";
  return "extended"; // same copy as long; kept for API compat
}

/**
 * @param {TransformPhase} phase
 * @returns {boolean}
 */
function isLongPhase(phase) {
  return phase === "long" || phase === "extended";
}

/**
 * Human-readable horizon label for prompt fragments.
 * @param {TransformPhase} phase
 * @param {number} months
 */
function phaseHorizonLabel(phase, months) {
  const m = Number(months) || 0;
  if (isLongPhase(phase) || m >= 12) {
    return "after about 12 months of consistent training";
  }
  if (phase === "mid") return `after about ${Math.round(m) || 6} months of training`;
  return `after about ${Math.round(m) || 3} months of early training`;
}

/**
 * Detect muscle-building / hypertrophy intent from muscle key / outcomes.
 * "toned" alone is tighten language (fat-loss path), not full hypertrophy dual-recomp.
 * @param {{ muscle?: string, muscleKey?: string, outcomes?: string[] }} opts
 */
function wantsMuscleBuild({ muscle, muscleKey, outcomes } = {}) {
  const key = String(muscleKey || muscle || "").toLowerCase();
  const list = Array.isArray(outcomes) ? outcomes.map(String) : [];
  if (
    key === "volume" ||
    key === "softpowerful" ||
    key === "bulk" ||
    key === "hypertrophy"
  ) {
    return true;
  }
  if (list.some((o) => ["bulk", "vshape", "stronger"].includes(o))) {
    return true;
  }
  return false;
}

/**
 * Fat-loss / tighten intent.
 * @param {{ fat?: string }} opts
 */
function wantsFatLoss({ fat } = {}) {
  return fat === "decrease";
}

/**
 * Soft-tissue gain (not the primary "tighten" path).
 * @param {{ fat?: string }} opts
 */
function wantsSoftGain({ fat } = {}) {
  return fat === "increase";
}

/**
 * Muscle-building anatomical details by phase.
 * Long term: wider back line, fuller shoulders, upright posture.
 * @param {TransformPhase} phase
 * @param {string} horizonLabel
 * @param {{ compact?: boolean }} opts
 * @returns {string[]}
 */
function muscleBuildDetails(phase, horizonLabel, { compact = false } = {}) {
  if (phase === "early") {
    return [
      `FØR/ETTER (muscle, early phase ${horizonLabel}): shoulders look fuller; upper-back outline is wider; posture is more upright — clear early athletic development.`,
    ];
  }
  if (phase === "mid") {
    return [
      `FØR/ETTER (muscle, mid phase ${horizonLabel}): visibly wider shoulder caps, clearer deltoid roundness, a broader upper-back outline, and a more upright athletic posture — readable training progress vs the source.`,
    ];
  }
  const years = "12-month before/after athletic transformation";
  if (compact) {
    return [
      `FØR/ETTER MUSCLE (${years}, ${horizonLabel}): wider upper-back / latissimus outline, fuller shoulders, upright posture (chest open, shoulders back) — not the same narrow outline as the source.`,
    ];
  }
  return [
    `FØR/ETTER MUSCLE BUILD (${years}, ${horizonLabel}): the back line is clearly wider through the latissimus — a broader V-shaped upper-back silhouette vs the source.`,
    "Deltoids are fuller and more three-dimensional; shoulder width reads as athletic, not the same narrow outline as the source photo.",
    "Posture has changed: chest carried more open, shoulders held back — upright athletic stance, still a natural phone photo.",
    "Do NOT return a near-copy with the same shoulder width or the same rounded forward-shoulder posture as the source.",
  ];
}

/**
 * Fat-loss / tighten anatomical details by phase.
 * Athletic documentation tone — avoid stacked sexualized midsection language.
 * @param {TransformPhase} phase
 * @param {string} horizonLabel
 * @param {{ bfGoal?: number|string, compact?: boolean }} opts
 * @returns {string[]}
 */
function fatLossDetails(phase, horizonLabel, { bfGoal, compact = false } = {}) {
  const goal = Number(bfGoal);
  const bfHint =
    Number.isFinite(goal) && goal > 0
      ? ` matching about ${goal}% body fat`
      : "";

  if (phase === "early") {
    // Exact ~3mo calibration (changeForce 1).
    return [
      `FØR/ETTER (fat loss, early phase ${horizonLabel}): ${TIMELINE_CALIBRATION_3MO}`,
    ];
  }
  if (phase === "mid") {
    // Exact ~6mo calibration (changeForce 2).
    return [
      `FØR/ETTER (fat loss, mid phase ${horizonLabel}): ${TIMELINE_CALIBRATION_6MO}${bfHint}`,
    ];
  }
  // Long / extended (≥12mo, changeForce 4) — former 18m drama lives here.
  if (compact) {
    return [
      `FØR/ETTER FAT LOSS (12-month athletic cut, ${horizonLabel}): ${TIMELINE_CALIBRATION_12MO}${bfHint}`,
    ];
  }
  return [
    `FØR/ETTER FAT LOSS (12-month athletic cut, ${horizonLabel}): ${TIMELINE_CALIBRATION_12MO}${bfHint}`,
    "Waist is clearly narrower and more defined vs the source; flank and lower-belly soft tissue is visibly reduced.",
    "Torso soft-tissue thickness is reduced evenly (chest, sides, lower abdomen) so the whole silhouette looks recomposed.",
    "Do NOT keep the same soft midsection pad, same waist width, or same torso thickness as the source.",
  ];
}

/**
 * Soft-gain (fat increase) phase language — keep athletic, non-vague.
 * @param {TransformPhase} phase
 * @param {string} horizonLabel
 * @param {{ bfGoal?: number|string }} opts
 * @returns {string[]}
 */
function softGainDetails(phase, horizonLabel, { bfGoal } = {}) {
  const goal = Number(bfGoal);
  const bfHint =
    Number.isFinite(goal) && goal > 0 ? ` toward about ${goal}% body fat` : "";
  if (!isLongPhase(phase)) {
    return [
      `FØR/ETTER (soft-tissue gain, ${horizonLabel}): midsection and waist look modestly fuller and softer${bfHint} — believable for the timeline, still visibly different from the source.`,
    ];
  }
  return [
    `FØR/ETTER SOFT-TISSUE GAIN (long horizon, ${horizonLabel}): clearly fuller softer silhouette with major soft-tissue increase across waist, lower abdomen, and torso${bfHint} — not a near-copy of the leaner source.`,
  ];
}

/**
 * Dual recomp (muscle build + fat loss) — one merged block (do not also dump full muscle+fat lists).
 * @param {TransformPhase} phase
 * @param {string} horizonLabel
 * @returns {string[]}
 */
function dualRecompDetails(phase, horizonLabel) {
  if (phase === "early") {
    return [
      `FØR/ETTER (recomp, ${horizonLabel}): ${TIMELINE_CALIBRATION_3MO} Show both fuller muscle shape AND a tighter waist — not only thinner, not only bigger.`,
    ];
  }
  if (phase === "mid") {
    return [
      `FØR/ETTER (recomp, ${horizonLabel}): ${TIMELINE_CALIBRATION_6MO} Show both fuller muscle shape AND a tighter waist — not only thinner, not only bigger.`,
    ];
  }
  return [
    `FØR/ETTER DUAL RECOMPOSITION (${horizonLabel}): ${TIMELINE_CALIBRATION_12MO} BOTH increased muscle volume (wider back line, fuller shoulders, upright posture) AND fat loss — never a merely skinnier photocopy of the source.`,
  ];
}

/**
 * Build English Flux prompt fragments for anatomical before/after escalation.
 * Designed to be injected once into the prompt stack.
 *
 * @param {object} opts
 * @param {string} [opts.horizon] — horizon key (e.g. "12m", "12w", legacy "18m")
 * @param {string} [opts.fat] — "decrease" | "increase" | "maintain"
 * @param {string} [opts.muscle] — muscle style key from UI
 * @param {string} [opts.muscleKey] — resolved muscle key
 * @param {number|string} [opts.months] — timeline in months
 * @param {string} [opts.intensity] — subtle | moderate | strong
 * @param {number|string} [opts.bfNow]
 * @param {number|string} [opts.bfGoal]
 * @param {string[]} [opts.outcomes]
 * @param {string[]} [opts.zones]
 * @param {number} [opts.level] — transform intensity 0–3
 * @returns {string} prompt fragment (may be empty for maintain + no muscle signal)
 */
function byggTransformasjonsDetaljer({
  horizon,
  fat = "decrease",
  muscle,
  muscleKey,
  months,
  intensity = "moderate",
  bfNow,
  bfGoal,
  outcomes,
  zones,
  level,
} = {}) {
  const m = Number(months);
  const monthsN = Number.isFinite(m) && m > 0 ? m : 3;
  const phase = phaseForMonths(monthsN);
  const horizonLabel = phaseHorizonLabel(phase, monthsN);
  const buildMuscle = wantsMuscleBuild({ muscle, muscleKey, outcomes });
  const loseFat = wantsFatLoss({ fat });
  const softGain = wantsSoftGain({ fat });
  const bits = [];

  // Header anchors the før/etter rule so Flux treats it as mandatory visual change.
  if (isLongPhase(phase)) {
    bits.push(
      `ANATOMICAL PHASE ESCALATION (${horizon || "long"} ~${monthsN} months): finished before/after training transformation — specific silhouette cues, never vague "make him fit".`
    );
  } else if (phase === "mid") {
    bits.push(
      `ANATOMICAL PHASE PROGRESS (~${monthsN} months): clear mid-timeline training changes — specific silhouette cues, not a near-copy.`
    );
  } else {
    bits.push(
      `ANATOMICAL PHASE (early ~${monthsN} months): clear, specific silhouette cues — visibly different from the source.`
    );
  }

  // Proportion lock for mål over 6 måneder (months > 6), including mid 7–11mo and long/extended.
  if (monthsN > 6) {
    bits.push(PROPORTION_LOCK_OVER_6MO);
  }

  if (softGain) {
    bits.push(...softGainDetails(phase, horizonLabel, { bfGoal }));
  } else if (loseFat && buildMuscle) {
    // Cap: one dual-recomp line + compact muscle/fat cues (avoid 3–4 waist/abs repeats).
    bits.push(...dualRecompDetails(phase, horizonLabel));
    if (isLongPhase(phase)) {
      bits.push(...muscleBuildDetails(phase, horizonLabel, { compact: true }));
      bits.push(
        ...fatLossDetails(phase, horizonLabel, {
          bfGoal,
          compact: true,
          months: monthsN,
        })
      );
    }
  } else if (loseFat) {
    bits.push(
      ...fatLossDetails(phase, horizonLabel, { bfGoal, months: monthsN })
    );
    if (isLongPhase(phase)) {
      bits.push(
        "Long-horizon tighten also shows clearer shoulder/midsection muscle outline and a more upright athletic posture — still the same person."
      );
    }
  } else if (buildMuscle || fat === "maintain") {
    bits.push(...muscleBuildDetails(phase, horizonLabel));
  }

  // Intensity nudge: strong effort on long horizons adds one commanding closer.
  const lvl = Number(level);
  if (
    isLongPhase(phase) &&
    (intensity === "strong" || (Number.isFinite(lvl) && lvl >= 3))
  ) {
    bits.push(
      "Commanding visual delta required: side-by-side with the source, back width, shoulder mass, waist definition, and midsection flatness must all read as a different training phase — not a lightly edited twin."
    );
  }

  // Zone hint (optional, athletic only) — skip if dual-recomp already covered midsection/back.
  const zoneList = Array.isArray(zones) ? zones.filter(Boolean) : [];
  const dualPath = loseFat && buildMuscle;
  if (
    isLongPhase(phase) &&
    !dualPath &&
    zoneList.includes("back") &&
    buildMuscle
  ) {
    bits.push(
      "Zone focus — back: emphasize the wider latissimus flare and thicker upper-back line as a primary før/etter marker."
    );
  }
  if (
    isLongPhase(phase) &&
    !dualPath &&
    (zoneList.includes("abs") || zoneList.includes("overall")) &&
    loseFat
  ) {
    bits.push(
      "Zone focus — midsection: flatter abdominal wall and defined waist are mandatory før/etter markers."
    );
  }

  return bits.filter(Boolean).join(" ");
}

module.exports = {
  byggTransformasjonsDetaljer,
  phaseForMonths,
  wantsMuscleBuild,
  wantsFatLoss,
  muscleBuildDetails,
  fatLossDetails,
  dualRecompDetails,
  TIMELINE_CALIBRATION_3MO,
  TIMELINE_CALIBRATION_6MO,
  TIMELINE_CALIBRATION_12MO,
  PROPORTION_LOCK_OVER_6MO,
};
