/**
 * Front-loaded visual progress along a Future You timeline.
 *
 * Physiological rationale (NO/EN):
 *   Fettap / fat loss: often mer synlig tidlig, deretter avtagende — ikke «dobbel» senere.
 *   Muskel / muscle: newbie gains early, then asymptotic slowing.
 *   So 3 → 6 → 12 months is front-loaded progress, NOT a 1× → 2× → 4× visual-force ladder.
 *
 * Formula — exponential approach toward the goal (diminishing returns):
 *   progress(months) = 1 - Math.exp(-months / tau)
 *
 * tau = 4 months calibrates roughly:
 *   3 mo  ≈ 0.53  (clearly visible — ~half the total visual journey)
 *   6 mo  ≈ 0.78
 *   12 mo ≈ 0.95  (near goal; small increment from 6→12)
 *
 * Interim body fat for prompts:
 *   bfAtHorizon = bfNow + (bfGoal - bfNow) * progress(months)
 * e.g. 22% → 16%: ~19% at 3mo, ~17% at 6mo, ~16.3% at 12mo — not full goal at 3mo,
 * but 3mo copy must still demand an obvious side-by-side difference (Flux under-edits).
 */

/** Time constant (months). Do not “double force”; approach the asymptote. */
const TRANSFORM_PROGRESS_TAU = 4;

/**
 * Fraction of the total visual journey completed at `months` (0…1).
 * @param {number|string} months
 * @param {number} [tau=TRANSFORM_PROGRESS_TAU]
 * @returns {number}
 */
function transformProgress(months, tau = TRANSFORM_PROGRESS_TAU) {
  const m = Math.max(0, Number(months) || 0);
  const t = Number(tau);
  const tauSafe = Number.isFinite(t) && t > 0 ? t : TRANSFORM_PROGRESS_TAU;
  const p = 1 - Math.exp(-m / tauSafe);
  return Math.round(Math.min(1, Math.max(0, p)) * 1000) / 1000;
}

/**
 * Interpolated BF% at this horizon (for prompt encoding — not a medical claim).
 * @param {number|string} bfNow
 * @param {number|string} bfGoal
 * @param {number|string} months
 * @returns {number|null}
 */
function bfAtHorizon(bfNow, bfGoal, months) {
  const now = Number(bfNow);
  const goal = Number(bfGoal);
  if (!Number.isFinite(now) || !Number.isFinite(goal) || now <= 0 || goal <= 0) {
    return null;
  }
  const p = transformProgress(months);
  const bf = now + (goal - now) * p;
  return Math.round(bf * 10) / 10;
}

/**
 * Discrete prompt band from the continuous progress curve.
 * Replaces the old changeForce doubling (1/2/4) — bands are labels only, not multipliers.
 *
 * @param {number|string} months
 * @returns {"early"|"mid"|"nearGoal"}
 */
function progressBand(months) {
  const p = transformProgress(months);
  // ~3mo (p≈0.53) early; ~6mo (p≈0.78) mid; ~12mo (p≈0.95) nearGoal
  if (p < 0.65) return "early";
  if (p < 0.88) return "mid";
  return "nearGoal";
}

/**
 * Muscle-volume “how built” scale — same curve (early newbie gains emphasized).
 * @param {number|string} months
 * @returns {number} 0…1
 */
function muscleBuildProgress(months) {
  return transformProgress(months);
}

/**
 * Legacy discrete ladder values kept for call-site compat (NOT multipliers).
 * early→1, mid→2, nearGoal→4 — do not interpret as 1×/2×/4× visual force.
 * @param {number|string} months
 * @returns {1|2|4}
 */
function legacyForceFromProgress(months) {
  const band = progressBand(months);
  if (band === "nearGoal") return 4;
  if (band === "mid") return 2;
  return 1;
}

module.exports = {
  TRANSFORM_PROGRESS_TAU,
  transformProgress,
  bfAtHorizon,
  progressBand,
  muscleBuildProgress,
  legacyForceFromProgress,
};
