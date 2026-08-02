/**
 * progressCurve — TypeScript adapter for `lib/transformProgress.js`.
 *
 * Ports the front-loaded diminishing-returns formula so the domain layer
 * stays free of CommonJS / Node `require` coupling. Keep tau and math in
 * sync with the JS module when either side changes.
 *
 * Formula: progress(months) = 1 - exp(-months / tau)
 * With tau = 4: ~3mo≈0.53, ~6mo≈0.78, ~12mo≈0.95.
 */

/** Time constant in months (matches TRANSFORM_PROGRESS_TAU in lib). */
export const TRANSFORM_PROGRESS_TAU = 4;

/**
 * Fraction of the total visual / composition journey completed at `months` (0…1).
 * Mirrors `lib/transformProgress.js` — keep tau/math in sync (verified by tests).
 */
export function transformProgress(
  months: number,
  tau: number = TRANSFORM_PROGRESS_TAU
): number {
  const m = Math.max(0, Number(months) || 0);
  const t = Number(tau);
  const tauSafe = Number.isFinite(t) && t > 0 ? t : TRANSFORM_PROGRESS_TAU;
  const p = 1 - Math.exp(-m / tauSafe);
  return Math.round(Math.min(1, Math.max(0, p)) * 1000) / 1000;
}

/**
 * Front-loaded progress normalized so `month === totalMonths` maps to 1.
 * Used by GoalPlanner so the final monthly checkpoint hits the final target.
 */
export function normalizedTransformProgress(
  month: number,
  totalMonths: number,
  tau: number = TRANSFORM_PROGRESS_TAU
): number {
  const total = Math.max(0, Number(totalMonths) || 0);
  if (total <= 0) return 1;
  const denom = transformProgress(total, tau);
  if (denom <= 0) return 1;
  const raw = transformProgress(month, tau);
  return Math.round(Math.min(1, Math.max(0, raw / denom)) * 1000) / 1000;
}

/**
 * Interpolated body-fat % at a horizon (null when inputs are unusable).
 */
export function bfAtHorizon(
  bfNow: number,
  bfGoal: number,
  months: number
): number | null {
  const now = Number(bfNow);
  const goal = Number(bfGoal);
  if (!Number.isFinite(now) || !Number.isFinite(goal) || now <= 0 || goal <= 0) {
    return null;
  }
  const p = transformProgress(months);
  return Math.round((now + (goal - now) * p) * 10) / 10;
}

/** Discrete band labels matching lib/transformProgress.progressBand. */
export type ProgressBand = "early" | "mid" | "nearGoal";

export function progressBand(months: number): ProgressBand {
  const p = transformProgress(months);
  if (p < 0.65) return "early";
  if (p < 0.88) return "mid";
  return "nearGoal";
}
