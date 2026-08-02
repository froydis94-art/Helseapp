/**
 * TransformationEngine — deterministic BodyProfile + TransformationGoal → TransformationPlan.
 *
 * Pure TypeScript heuristics. No prompts, Replicate, fetch, or UI.
 * Reuses the front-loaded diminishing-returns curve from `progressCurve`
 * (ported from `lib/transformProgress.js`).
 */

import {
  resolveBodyFatPct,
  resolveSex,
  type BodyProfile,
  type FocusZone,
} from "./BodyProfile";
import type { EffortLevel, TransformationGoal } from "./TransformationGoal";
import type {
  EstimateReliability,
  HeuristicKgRange,
  RegionalChangeTarget,
  TimelineCheckpoint,
  TransformationPlan,
  VisualIntensity,
} from "./TransformationPlan";
import { TRANSFORM_RULES_VERSION } from "./TransformationPlan";
import {
  bfAtHorizon,
  progressBand,
  transformProgress,
} from "./progressCurve";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** ±15% heuristic band around a positive magnitude estimate. */
function heuristicRange(magnitude: number): HeuristicKgRange {
  const center = Math.abs(magnitude);
  return {
    min: round(center * 0.85, 2),
    max: round(center * 1.15, 2),
  };
}

/**
 * Map heuristic score → band.
 * Product score only — not a statistical/medical CI.
 */
export function toEstimateReliability(score: number): EstimateReliability {
  if (score < 0.55) return "low";
  if (score < 0.75) return "medium";
  return "high";
}

function effortMultiplier(effort: EffortLevel | undefined): number {
  switch (effort) {
    case "low":
      return 0.55;
    case "moderate":
      return 0.8;
    case "high":
      return 1.0;
    case "very_high":
      return 1.1;
    default:
      return 0.8;
  }
}

function detectConflicts(
  profile: BodyProfile,
  goal: TransformationGoal,
  bfNow: number | undefined
): string[] {
  const warnings: string[] = [];

  if (
    goal.fatDirection === "decrease" &&
    goal.muscleDirection === "decrease"
  ) {
    warnings.push(
      "Both fat and muscle directions are decrease — plan may look like overall mass loss; confirm intent."
    );
  }

  if (
    goal.fatDirection === "increase" &&
    goal.outcomes?.includes("fat_loss")
  ) {
    warnings.push(
      "Conflict: fatDirection is increase but outcomes include fat_loss."
    );
  }

  if (
    goal.muscleDirection === "decrease" &&
    goal.outcomes?.some((o) => o === "muscle_gain" || o === "stronger")
  ) {
    warnings.push(
      "Conflict: muscleDirection is decrease but outcomes request muscle gain/strength."
    );
  }

  if (
    bfNow != null &&
    goal.targetBodyFatPct != null &&
    goal.fatDirection === "decrease" &&
    goal.targetBodyFatPct >= bfNow
  ) {
    warnings.push(
      "Conflict: fat decrease requested but targetBodyFatPct is at or above current BF%."
    );
  }

  if (
    bfNow != null &&
    goal.targetBodyFatPct != null &&
    goal.fatDirection === "increase" &&
    goal.targetBodyFatPct <= bfNow
  ) {
    warnings.push(
      "Conflict: fat increase requested but targetBodyFatPct is at or below current BF%."
    );
  }

  if (
    profile.weightKg != null &&
    goal.targetWeightKg != null &&
    goal.fatDirection === "decrease" &&
    goal.targetWeightKg > profile.weightKg * 1.02
  ) {
    warnings.push(
      "Conflict: fat decrease with a higher targetWeightKg than current weight."
    );
  }

  if (goal.timelineWeeks != null && goal.timelineWeeks < 4) {
    warnings.push(
      "Timeline under 4 weeks is too short for meaningful body-composition claims."
    );
  }

  if (
    bfNow != null &&
    goal.targetBodyFatPct != null &&
    Math.abs(bfNow - goal.targetBodyFatPct) >= 12 &&
    (goal.timelineWeeks ?? 12) < 16
  ) {
    warnings.push(
      "Large BF% delta on a short timeline — estimates are directional only."
    );
  }

  return warnings;
}

function pickVisualIntensity(
  absFatKg: number,
  absLeanKg: number,
  progress: number
): VisualIntensity {
  const score = (absFatKg * 1.1 + absLeanKg * 2.2) * progress;
  if (score < 0.5) return "subtle";
  if (score < 1.2) return "moderate";
  if (score < 2.4) return "noticeable";
  return "dramatic";
}

function buildRegionalTargets(
  focusZones: FocusZone[] | undefined,
  fatChangeKg: number | null,
  leanChangeKg: number | null
): RegionalChangeTarget[] {
  const zones =
    focusZones && focusZones.length > 0
      ? focusZones
      : (["full_body"] as FocusZone[]);

  const fatMag =
    fatChangeKg == null ? 0 : clamp(fatChangeKg / 8, -1, 1);
  const leanMag =
    leanChangeKg == null ? 0 : clamp(leanChangeKg / 4, -1, 1);

  return zones.map((region) => {
    let magnitude = 0;
    if (region === "waist" || region === "core") {
      magnitude = round(-Math.abs(fatMag) * (fatChangeKg != null && fatChangeKg < 0 ? 1 : 0.3), 3);
      if (fatChangeKg != null && fatChangeKg > 0) magnitude = round(Math.abs(fatMag) * 0.6, 3);
    } else if (region === "full_body") {
      magnitude = round(leanMag - fatMag * 0.5, 3);
    } else {
      magnitude = round(leanMag * 0.85 - fatMag * 0.25, 3);
    }
    return { region, magnitude };
  });
}

function buildCheckpoints(
  bfNow: number | undefined,
  bfGoal: number | undefined,
  startWeight: number | undefined,
  goalWeightKg: number | undefined
): TimelineCheckpoint[] {
  // Product ladder horizons (aligned with Future You 3 / 6 / 12 months).
  return [3, 6, 12].map((months) => {
    const w = round(months * 4.345, 1);
    const progress = transformProgress(months);
    const expectedBodyFatPct =
      bfNow != null && bfGoal != null
        ? bfAtHorizon(bfNow, bfGoal, months)
        : null;
    let expectedWeightKg: number | null = null;
    if (startWeight != null && goalWeightKg != null) {
      expectedWeightKg = round(
        startWeight + (goalWeightKg - startWeight) * progress,
        1
      );
    }
    return {
      weeks: w,
      months,
      progress,
      expectedBodyFatPct,
      expectedWeightKg,
      band: progressBand(months),
    };
  });
}

/**
 * Deterministic transformation estimator.
 */
export class TransformationEngine {
  /**
   * Compute a TransformationPlan from current profile and desired goal.
   */
  compute(profile: BodyProfile, goal: TransformationGoal): TransformationPlan {
    const assumptions: string[] = [];
    const bfNow = resolveBodyFatPct(profile);
    const warnings = detectConflicts(profile, goal, bfNow);

    const rawWeeks = goal.timelineWeeks ?? 12;
    const weeks = clamp(Math.round(rawWeeks), 4, 52);
    if (rawWeeks !== weeks) {
      warnings.push(
        `Timeline adjusted from ${rawWeeks} to ${weeks} weeks for realistic estimates.`
      );
      assumptions.push("Timeline clamped to 4–52 weeks.");
    }

    const months = weeks / 4.345;
    const progress = transformProgress(months);
    assumptions.push(
      "Uses front-loaded diminishing-returns curve (tau=4 months) aligned with lib/transformProgress.js."
    );

    const effort = effortMultiplier(goal.effortLevel);
    const sex = resolveSex(profile);

    // --- Fat change (signed) ---
    let estimatedFatChangeKg: number | null = null;
    if (profile.weightKg == null) {
      assumptions.push(
        "weightKg missing — fat-mass change left null (no invented weight)."
      );
    } else if (bfNow == null && goal.targetBodyFatPct == null) {
      assumptions.push(
        "bodyFatPct missing — fat-mass change left null."
      );
    } else {
      const weeklyFracBase =
        (bfNow ?? 22) >= 30
          ? 0.0085
          : (bfNow ?? 22) >= 22
            ? 0.007
            : (bfNow ?? 22) >= 15
              ? 0.0055
              : 0.0035;

      if (goal.fatDirection === "maintain") {
        estimatedFatChangeKg = 0;
      } else if (goal.fatDirection === "decrease") {
        // Target at/above current BF% → no fat-loss estimate (conflict already warned).
        if (
          bfNow != null &&
          goal.targetBodyFatPct != null &&
          goal.targetBodyFatPct >= bfNow
        ) {
          estimatedFatChangeKg = 0;
        } else {
          // Asymptotic full-journey loss, then scale by diminishing-returns progress.
          const fullLoss =
            profile.weightKg * weeklyFracBase * effort * 52 * 0.55;
          let loss = fullLoss * progress;

          if (bfNow != null && goal.targetBodyFatPct != null) {
            const currentFatKg = (bfNow / 100) * profile.weightKg;
            const leanKg = profile.weightKg - currentFatKg;
            const targetBf = clamp(goal.targetBodyFatPct, 5, 50);
            if (targetBf < bfNow) {
              const targetWeightForBf = leanKg / (1 - targetBf / 100);
              const fatLossToTarget = Math.max(
                0,
                profile.weightKg - targetWeightForBf
              );
              loss = Math.min(loss, fatLossToTarget * progress * 1.02);
            }
          }
          estimatedFatChangeKg = -round(clamp(loss, 0, profile.weightKg * 0.25));
        }
      } else {
        // increase
        const gain = profile.weightKg * 0.004 * effort * 52 * 0.5 * progress;
        estimatedFatChangeKg = round(clamp(gain, 0, profile.weightKg * 0.2));
      }
    }

    // --- Lean mass change (signed) ---
    let estimatedLeanMassChangeKg: number | null = null;
    const sexFactor = sex === "female" ? 0.65 : sex === "male" ? 1.0 : 0.8;
    const levelFactor =
      profile.trainingLevel === "beginner"
        ? 1.45
        : profile.trainingLevel === "novice"
          ? 1.2
          : profile.trainingLevel === "advanced"
            ? 0.65
            : profile.trainingLevel === "elite"
              ? 0.4
              : 1.0;
    const ageYears = profile.trainingAgeYears ?? 0;
    const ageDamp = clamp(1 / (1 + ageYears * 0.08), 0.55, 1);
    const monthlyCap = 0.25 * sexFactor * levelFactor * ageDamp * effort;

    if (goal.muscleDirection === "maintain") {
      estimatedLeanMassChangeKg = 0;
    } else if (goal.muscleDirection === "increase") {
      let gain = monthlyCap * 12 * progress;
      if (goal.fatDirection === "decrease") gain *= 0.55;
      if (profile.limitations && profile.limitations.length > 0) {
        gain *= 0.9;
        warnings.push(
          "Declared limitations present; lean-gain estimate reduced slightly."
        );
      }
      estimatedLeanMassChangeKg = round(clamp(gain, 0, 8));
      assumptions.push(
        "Lean-gain ceilings are conservative heuristics, not measured hypertrophy."
      );
    } else {
      // decrease — rare; small residual lean loss under aggressive cut
      const loss =
        goal.fatDirection === "decrease" ? monthlyCap * 4 * progress * 0.35 : 0;
      estimatedLeanMassChangeKg = -round(clamp(loss, 0, 3));
    }

    if (profile.trainingLevel === "advanced" || profile.trainingLevel === "elite") {
      warnings.push(
        "Advanced training level: lean-gain estimates use diminishing returns."
      );
    }

    // --- Expected end BF% / weight ---
    let expectedBodyFatPct: number | null = null;
    if (bfNow != null && goal.targetBodyFatPct != null) {
      expectedBodyFatPct = bfAtHorizon(bfNow, goal.targetBodyFatPct, months);
    } else if (bfNow != null && goal.fatDirection === "maintain") {
      expectedBodyFatPct = bfNow;
    } else if (bfNow == null) {
      assumptions.push("expectedBodyFatPct null — current BF% unavailable.");
    }

    let expectedWeightKg: number | null = null;
    if (profile.weightKg != null) {
      if (goal.targetWeightKg != null) {
        expectedWeightKg = round(
          profile.weightKg +
            (goal.targetWeightKg - profile.weightKg) * progress,
          1
        );
      } else if (
        estimatedFatChangeKg != null &&
        estimatedLeanMassChangeKg != null
      ) {
        expectedWeightKg = round(
          profile.weightKg + estimatedFatChangeKg + estimatedLeanMassChangeKg,
          1
        );
      } else {
        assumptions.push(
          "expectedWeightKg partially unsupported — missing composition deltas."
        );
      }
    }

    // Waist: only when fat loss is estimated; else null (no invented cm).
    let waistChangeCm: number | null = null;
    if (estimatedFatChangeKg != null && estimatedFatChangeKg < 0) {
      waistChangeCm = round(estimatedFatChangeKg * 0.85, 1); // negative
      assumptions.push(
        "waistChangeCm is a rough morphometric proxy (~0.85 cm per kg fat), not a measurement."
      );
    } else if (estimatedFatChangeKg == null) {
      waistChangeCm = null;
      assumptions.push("waistChangeCm null — insufficient fat-change inputs.");
    } else {
      waistChangeCm = null;
      assumptions.push("waistChangeCm null — no fat-loss delta to map to waist.");
    }

    const regionalTargets = buildRegionalTargets(
      goal.focusZones,
      estimatedFatChangeKg,
      estimatedLeanMassChangeKg
    );

    const absFat = Math.abs(estimatedFatChangeKg ?? 0);
    const absLean = Math.abs(estimatedLeanMassChangeKg ?? 0);
    const visualIntensity = pickVisualIntensity(absFat, absLean, progress);

    let reliabilityScore = 0.72;
    if (bfNow == null) reliabilityScore -= 0.12;
    if (profile.weightKg == null) reliabilityScore -= 0.15;
    if (profile.heightCm == null) reliabilityScore -= 0.03;
    if (weeks < 8) reliabilityScore -= 0.1;
    if (warnings.some((w) => w.startsWith("Conflict"))) reliabilityScore -= 0.12;
    if (profile.nutritionQuality === "poor") reliabilityScore -= 0.06;
    reliabilityScore = round(clamp(reliabilityScore, 0.3, 0.9), 2);
    const estimateReliability = toEstimateReliability(reliabilityScore);

    if (reliabilityScore < 0.55) {
      warnings.push(
        "Estimate reliability is limited; treat estimates as directional only."
      );
    }

    const timelineCheckpoints = buildCheckpoints(
      bfNow,
      goal.targetBodyFatPct,
      profile.weightKg,
      goal.targetWeightKg
    );

    const currentBodyFatPct = bfNow ?? null;
    const targetBodyFatPct = goal.targetBodyFatPct ?? null;
    const interimBodyFatPct = expectedBodyFatPct;

    let estimatedFatLossKg: HeuristicKgRange | null = null;
    if (estimatedFatChangeKg != null && estimatedFatChangeKg < 0) {
      estimatedFatLossKg = heuristicRange(estimatedFatChangeKg);
      assumptions.push(
        "estimatedFatLossKg is a ±15% heuristic band around the signed fat-change estimate."
      );
    }

    let estimatedMuscleGainKg: HeuristicKgRange | null = null;
    if (estimatedLeanMassChangeKg != null && estimatedLeanMassChangeKg > 0) {
      estimatedMuscleGainKg = heuristicRange(estimatedLeanMassChangeKg);
      assumptions.push(
        "estimatedMuscleGainKg is a ±15% heuristic band around the lean-gain estimate."
      );
    }

    return {
      schemaVersion: 1,
      rulesVersion: TRANSFORM_RULES_VERSION,
      progress,
      currentBodyFatPct,
      targetBodyFatPct,
      interimBodyFatPct,
      estimatedFatChangeKg,
      estimatedFatLossKg,
      estimatedLeanMassChangeKg,
      estimatedMuscleGainKg,
      expectedWeightKg,
      expectedBodyFatPct,
      waistChangeCm,
      regionalTargets,
      visualIntensity,
      estimateReliabilityScore: reliabilityScore,
      estimateReliability,
      assumptions,
      warnings,
      timelineCheckpoints,
      effectiveTimelineWeeks: weeks,
      generatedAt: new Date().toISOString(),
    };
  }
}
