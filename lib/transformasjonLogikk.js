/**
 * Rule-based anatomical escalation ("før/etter") for Flux prompts.
 *
 * Injects phase-specific transformation details the model otherwise forgets,
 * so long-horizon Max edits do not return near-unchanged copies.
 *
 * Athletic / documentation wording only — avoid NSFW-triggering language (E005).
 * Keep this module concise: callers must inject the result ONCE (not twice).
 */

/** @typedef {"early"|"mid"|"long"|"extended"} TransformPhase */

/**
 * Map timeline months to a visual training phase.
 * Short = milder language; ≥12 months / 1–1.5y = full before/after escalation.
 * @param {number|string} months
 * @returns {TransformPhase}
 */
function phaseForMonths(months) {
  const m = Number(months) || 3;
  if (m <= 3) return "early";
  if (m < 12) return "mid";
  if (m < 17) return "long";
  return "extended";
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
  if (phase === "extended" || m >= 17) return "after about 1.5 years of consistent training";
  if (phase === "long" || m >= 12) return "after about 12+ months of consistent training";
  if (phase === "mid") return `after about ${Math.round(m) || 6} months of training`;
  return `after about ${Math.round(m) || 2} months of early training`;
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
      `FØR/ETTER (muscle, early phase ${horizonLabel}): shoulders look only slightly fuller; upper-back outline is faintly wider; posture is a touch more upright — mild athletic development.`,
    ];
  }
  if (phase === "mid") {
    return [
      `FØR/ETTER (muscle, mid phase ${horizonLabel}): visibly wider shoulder caps, clearer deltoid roundness, a broader upper-back outline, and a more upright athletic posture — readable training progress vs the source.`,
    ];
  }
  const years =
    phase === "extended"
      ? "1.5-year before/after athletic transformation"
      : "12+ month before/after athletic transformation";
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
    return [
      `FØR/ETTER (fat loss, early phase ${horizonLabel}): midsection is only slightly flatter; waist a bit tighter; soft lower-abdomen tissue mildly reduced — early tighten, still clearly different from the source.`,
    ];
  }
  if (phase === "mid") {
    return [
      `FØR/ETTER (fat loss, mid phase ${horizonLabel}): flatter midsection, clearer waist taper, reduced soft tissue at the flanks and lower belly; early muscle outlines under thinner cover${bfHint} — not a near-identical silhouette.`,
    ];
  }
  if (compact) {
    return [
      `FØR/ETTER FAT LOSS (${phase === "extended" ? "1.5-year" : "12+ month"} athletic cut, ${horizonLabel}): flatter midsection, narrower waist, less soft tissue at flanks and lower belly${bfHint} — silhouette recomposed, not a near-copy.`,
    ];
  }
  return [
    `FØR/ETTER FAT LOSS (${phase === "extended" ? "1.5-year" : "12+ month"} athletic cut, ${horizonLabel}): the midsection is markedly flatter with far less soft subcutaneous cover${bfHint}.`,
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
  if (!isLongPhase(phase)) {
    return [
      `FØR/ETTER (recomp, ${horizonLabel}): show both slightly fuller muscle shape AND a tighter waist — not only thinner, not only bigger.`,
    ];
  }
  return [
    `FØR/ETTER DUAL RECOMPOSITION (${horizonLabel}): BOTH increased muscle volume (wider back line, fuller shoulders, upright posture) AND fat loss (flatter midsection, narrower waist, less flank soft tissue) — never a merely skinnier photocopy of the source.`,
  ];
}

/**
 * Build English Flux prompt fragments for anatomical before/after escalation.
 * Designed to be injected once into the prompt stack.
 *
 * @param {object} opts
 * @param {string} [opts.horizon] — horizon key (e.g. "18m", "12w")
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
      `ANATOMICAL PHASE (early ~${monthsN} months): mild but specific silhouette cues — still visibly different from the source.`
    );
  }

  if (softGain) {
    bits.push(...softGainDetails(phase, horizonLabel, { bfGoal }));
  } else if (loseFat && buildMuscle) {
    // Cap: one dual-recomp line + compact muscle/fat cues (avoid 3–4 waist/abs repeats).
    bits.push(...dualRecompDetails(phase, horizonLabel));
    if (isLongPhase(phase)) {
      bits.push(...muscleBuildDetails(phase, horizonLabel, { compact: true }));
      bits.push(...fatLossDetails(phase, horizonLabel, { bfGoal, compact: true }));
    }
  } else if (loseFat) {
    bits.push(...fatLossDetails(phase, horizonLabel, { bfGoal }));
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
};
