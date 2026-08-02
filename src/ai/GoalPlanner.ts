/**
 * GoalPlanner — recommendation objects only (not medical advice).
 *
 * Returns timeline ranges and monthly checkpoints. Calorie/protein fields
 * are null until the product adopts accepted formulas in-repo
 * (DEMAND_001: do not invent nutrition math as product truth).
 */

import { resolveBodyFatPct, type BodyProfile } from "./BodyProfile";
import type { TransformationGoal } from "./TransformationGoal";
import { normalizedTransformProgress } from "./progressCurve";

/** One month checkpoint along a recommended trajectory. */
export interface MonthlyProjection {
  month: number;
  bodyFatPercent: number | null;
  weightKg: number | null;
  progress: number;
}

/** Inclusive week range for a recommended horizon. */
export interface TimelineWeekRange {
  minWeeks: number;
  maxWeeks: number;
  /** Midpoint suggestion inside the range. */
  suggestedWeeks: number;
}

export interface GoalPlanResult {
  /** Recommended timeline as a range (not a false single point). */
  recommendedTimelineWeeks: TimelineWeekRange;

  /** Monthly checkpoints (diminishing-returns aware when BF known). */
  monthlyCheckpoints: MonthlyProjection[];

  /**
   * Daily calories — null until an accepted in-repo formula is adopted.
   */
  recommendedCaloriesKcal: number | null;

  /**
   * Daily protein grams — null until an accepted in-repo formula is adopted.
   */
  recommendedProteinG: number | null;

  assumptions: string[];
  warnings: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Builds timeline / checkpoint recommendations. No medical advice.
 */
export class GoalPlanner {
  plan(profile: BodyProfile, goal: TransformationGoal): GoalPlanResult {
    const assumptions: string[] = [];
    const warnings: string[] = [];

    const bfNow = resolveBodyFatPct(profile);
    const requested = goal.timelineWeeks ?? 12;

    let minWeeks = 8;
    let maxWeeks = 52;
    if (bfNow != null && goal.targetBodyFatPct != null) {
      const delta = Math.abs(bfNow - goal.targetBodyFatPct);
      // ~0.5% BW/week rough pacing → weeks ≈ delta / 0.5 when framed as BF points
      const paceWeeks = Math.ceil(delta / 0.5);
      minWeeks = clamp(Math.max(8, Math.floor(paceWeeks * 0.75)), 8, 40);
      maxWeeks = clamp(Math.max(minWeeks + 4, Math.ceil(paceWeeks * 1.35)), 12, 52);
    }

    const suggestedWeeks = clamp(requested, minWeeks, maxWeeks);
    if (requested < minWeeks) {
      warnings.push(
        `Requested ${requested} weeks is below the conservative range; suggested ${suggestedWeeks}.`
      );
    }

    assumptions.push(
      "Calorie/protein recommendations are null — no product-accepted nutrition formula is wired in-repo yet."
    );

    const monthCount = Math.max(1, Math.ceil(suggestedWeeks / 4.345));
    const endBf = goal.targetBodyFatPct;
    const endWeight = goal.targetWeightKg ?? null;
    const monthlyCheckpoints: MonthlyProjection[] = [];

    // Front-loaded curve normalized so the final month hits progress=1 / final target.
    for (let m = 1; m <= monthCount; m++) {
      const progress = normalizedTransformProgress(m, monthCount);
      const bodyFatPercent =
        bfNow != null && endBf != null
          ? round(bfNow + (endBf - bfNow) * progress, 1)
          : bfNow != null && goal.fatDirection === "maintain"
            ? bfNow
            : null;
      let weightKg: number | null = null;
      if (profile.weightKg != null && endWeight != null) {
        weightKg = round(
          profile.weightKg + (endWeight - profile.weightKg) * progress,
          1
        );
      }
      monthlyCheckpoints.push({
        month: m,
        bodyFatPercent,
        weightKg,
        progress,
      });
    }

    if (bfNow == null) {
      assumptions.push(
        "BF% unknown — monthly bodyFatPercent checkpoints may be null."
      );
    }

    return {
      recommendedTimelineWeeks: {
        minWeeks,
        maxWeeks,
        suggestedWeeks,
      },
      monthlyCheckpoints,
      recommendedCaloriesKcal: null,
      recommendedProteinG: null,
      assumptions,
      warnings,
    };
  }
}
