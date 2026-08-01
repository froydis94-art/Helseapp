/**
 * Rule-based anatomical escalation ("før/etter") for Flux prompts.
 *
 * Injects phase-specific transformation details the model otherwise forgets,
 * so long-horizon Max edits do not return near-unchanged copies.
 *
 * Athletic / anatomical wording only — avoid NSFW-triggering language (E005).
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
 * Long term: wider latissimus / back line, marked shoulders, posture (chest out, shoulders back).
 * @param {TransformPhase} phase
 * @param {string} horizonLabel
 * @returns {string[]}
 */
function muscleBuildDetails(phase, horizonLabel) {
  if (phase === "early") {
    return [
      `FØR/ETTER (muscle, early phase ${horizonLabel}): shoulders look only slightly fuller; upper-back outline is faintly wider; posture is a touch more upright — mild athletic development, not a finished physique.`,
    ];
  }
  if (phase === "mid") {
    return [
      `FØR/ETTER (muscle, mid phase ${horizonLabel}): visibly wider shoulder caps, clearer deltoid roundness, a broader upper-back / latissimus outline, and a more upright athletic posture (chest slightly forward, shoulders settled back) — readable training progress vs the source.`,
    ];
  }
  // long / extended — full escalation
  const years =
    phase === "extended"
      ? "1.5-year before/after athletic transformation"
      : "12+ month before/after athletic transformation";
  return [
    `FØR/ETTER MUSCLE BUILD (${years}, ${horizonLabel}): the back line is clearly wider through the latissimus dorsi — a broader V-shaped upper-back silhouette vs the source.`,
    "Deltoids are markedly fuller and more three-dimensional; shoulder width reads as athletic, not the same narrow outline as the source photo.",
    "Posture has changed: chest carried more open/forward, scapulae settled, shoulders held back — upright athletic stance, still a natural phone photo.",
    "Upper-arm and chest muscle volume is clearly increased under the skin; trapezius and upper-back thickness support the wider back line.",
    "Do NOT return a near-copy with the same shoulder width, same flat upper-back outline, or same rounded forward-shoulder posture as the source.",
  ];
}

/**
 * Fat-loss / tighten anatomical details by phase.
 * Long term: flatter midsection, defined waist, visible muscle insertions/attachments.
 * @param {TransformPhase} phase
 * @param {string} horizonLabel
 * @param {{ bfGoal?: number|string }} opts
 * @returns {string[]}
 */
function fatLossDetails(phase, horizonLabel, { bfGoal } = {}) {
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
      `FØR/ETTER (fat loss, mid phase ${horizonLabel}): flatter midsection, clearly defined waist taper, reduced love-handle and lower-belly soft tissue; early muscle outlines appear under thinner cover${bfHint} — not a near-identical silhouette.`,
    ];
  }
  return [
    `FØR/ETTER FAT LOSS (${phase === "extended" ? "1.5-year" : "12+ month"} athletic cut, ${horizonLabel}): the midsection is markedly flatter; abdominal wall sits closer to the muscle with far less soft subcutaneous cover${bfHint}.`,
    "Waist is clearly defined and narrower — a sharp athletic waistline vs the source, with love handles and flank soft tissue visibly reduced.",
    "Muscle insertions and attachments are readable: deltoid–arm junction, serratus/oblique outline at the ribcage, and natural upper-abdominal separations where lean cover allows — athletic anatomy, not eroticized detail.",
    "Torso soft-tissue thickness is reduced evenly (chest, sides, lower abdomen) so the whole silhouette looks recomposed, not an abs-only paint-over.",
    "Do NOT keep the same soft belly pad, same waist width, or same midsection thickness as the source.",
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
 * Dual recomp (muscle build + fat loss) — long horizons need both volume and cut cues.
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
    `FØR/ETTER DUAL RECOMPOSITION (${horizonLabel}): show BOTH increased muscle volume (wider latissimus/back line, marked shoulders, fuller arms and chest, chest-out / shoulders-back posture) AND major fat loss (flatter midsection, defined waist, visible muscle insertions) — never a merely skinnier photocopy of the source.`,
  ];
}

/**
 * Build English Flux prompt fragments for anatomical before/after escalation.
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
      `ANATOMICAL PHASE ESCALATION (${horizon || "long"} ~${monthsN} months): describe a finished before/after training transformation — rich anatomical detail, never vague "make him fit".`
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
    bits.push(...dualRecompDetails(phase, horizonLabel));
    bits.push(...muscleBuildDetails(phase, horizonLabel));
    bits.push(...fatLossDetails(phase, horizonLabel, { bfGoal }));
  } else if (loseFat) {
    bits.push(...fatLossDetails(phase, horizonLabel, { bfGoal }));
    // Long tighten still benefits from light posture / insertion cues
    if (isLongPhase(phase)) {
      bits.push(
        "Long-horizon tighten also shows clearer muscle insertions at shoulders and midsection, with a more upright athletic posture (chest open, shoulders back) — still the same person."
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

  // Zone hint (optional, athletic only)
  const zoneList = Array.isArray(zones) ? zones.filter(Boolean) : [];
  if (isLongPhase(phase) && zoneList.includes("back") && buildMuscle) {
    bits.push(
      "Zone focus — back: emphasize the wider latissimus flare and thicker upper-back line as a primary før/etter marker."
    );
  }
  if (
    isLongPhase(phase) &&
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
