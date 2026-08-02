/**
 * TransformationEngine — deterministic BodyProfile + TransformationGoal → TransformationPlan.
 *
 * Uses transparent, conservative physiology heuristics (not ML).
 * Does NOT generate image prompts, call APIs, or perform I/O.
 *
 * ## Documented assumptions
 *
 * 1. **Rate ceilings (conservative weekly max under high effort):**
 *    - Fat loss: ~0.5–0.9% of body weight / week depending on BF% and effort
 *      (higher BF% allows slightly faster loss; advanced trainees slightly slower).
 *    - Muscle gain: ~0.15–0.35 kg / month equivalent, scaled by training level
 *      (beginners higher; advanced near floor). Simultaneous cut reduces gain.
 *
 * 2. **Diminishing returns:** Training level and training age reduce muscle-gain
 *    multipliers. Very lean individuals get reduced fat-loss rates.
 *
 * 3. **Effort multipliers:** low 0.55, moderate 0.8, high 1.0, very_high 1.1
 *    (capped; does not unlock unsafe rates).
 *
 * 4. **Priority trade-off:** High fatLossPriority reduces muscle-gain estimates;
 *    high musclePriority reduces fat-loss rate slightly when both are high.
 *
 * 5. **Visual deltas:** Circumference / percent changes are rough morphometrics
 *    derived from fat/muscle mass deltas — illustrative, not clinical.
 *
 * 6. **No medical advice:** Outputs are planning heuristics for product UX.
 */

import type { BodyProfile, EffortLevel, TrainingLevel } from "./BodyProfile";
import type { TransformationGoal } from "./TransformationGoal";
import type { TransformationPlan, VisualIntensity } from "./TransformationPlan";

/** Clamp a number into [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round to `digits` decimal places for stable plan output. */
function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Effort → rate multiplier. Caps aggressiveness so "very_high" is only +10%.
 */
function effortMultiplier(effort: EffortLevel): number {
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

/**
 * Muscle-gain potential by training level (relative to intermediate = 1.0).
 * Encodes diminishing returns for advanced trainees.
 */
function trainingGainFactor(level: TrainingLevel): number {
  switch (level) {
    case "beginner":
      return 1.45;
    case "novice":
      return 1.2;
    case "intermediate":
      return 1.0;
    case "advanced":
      return 0.65;
    case "elite":
      return 0.4;
    default:
      return 1.0;
  }
}

/**
 * Extra dampening from years under the bar (soft asymptotic curve).
 */
function trainingAgeDampener(years: number): number {
  const y = Math.max(0, years);
  // Approaches ~0.55 after many years; gentle early on.
  return clamp(1 / (1 + y * 0.08), 0.55, 1);
}

/**
 * Weekly fat-loss rate as fraction of body weight (conservative).
 */
function weeklyFatLossFraction(
  bodyFat: number,
  effort: EffortLevel,
  fatLossPriority: number
): number {
  const base =
    bodyFat >= 30 ? 0.0085 : bodyFat >= 22 ? 0.007 : bodyFat >= 15 ? 0.0055 : 0.0035;
  const priority = clamp(fatLossPriority, 0, 1);
  return base * effortMultiplier(effort) * (0.55 + 0.45 * priority);
}

/**
 * Monthly muscle-gain ceiling in kg before cut/priority adjustments.
 */
function monthlyMuscleGainKg(
  profile: BodyProfile,
  musclePriority: number
): number {
  const sexFactor =
    profile.gender === "female" ? 0.65 : profile.gender === "male" ? 1.0 : 0.8;
  const baseMonthly = 0.25 * sexFactor;
  const level = trainingGainFactor(profile.trainingLevel);
  const ageDamp = trainingAgeDampener(profile.trainingAgeYears);
  const priority = clamp(musclePriority, 0, 1);
  const effort = effortMultiplier(profile.effortLevel);
  return baseMonthly * level * ageDamp * effort * (0.4 + 0.6 * priority);
}

function pickVisualIntensity(
  fatLossKg: number,
  muscleKg: number,
  weeks: number
): VisualIntensity {
  const score = (fatLossKg * 1.1 + muscleKg * 2.2) / Math.max(weeks / 4, 1);
  if (score < 0.6) return "subtle";
  if (score < 1.4) return "moderate";
  if (score < 2.6) return "noticeable";
  return "dramatic";
}

/**
 * Deterministic transformation estimator.
 *
 * @example
 * ```ts
 * const engine = new TransformationEngine();
 * const plan = engine.compute(profile, goal);
 * ```
 */
export class TransformationEngine {
  /**
   * Compute a TransformationPlan from current profile and desired goal.
   *
   * Timeline is taken from `goal.timeline.weeks`, falling back to
   * `profile.timelineWeeks`, then clamped to 4–52 weeks.
   */
  compute(profile: BodyProfile, goal: TransformationGoal): TransformationPlan {
    const warnings: string[] = [];

    const rawWeeks =
      goal.timeline?.weeks ?? profile.timelineWeeks ?? 12;
    const weeks = clamp(Math.round(rawWeeks), 4, 52);
    if (rawWeeks !== weeks) {
      warnings.push(
        `Timeline adjusted from ${rawWeeks} to ${weeks} weeks for realistic estimates.`
      );
    }

    const months = weeks / 4.345; // average weeks per month

    // --- Fat loss ---
    const weeklyFrac = weeklyFatLossFraction(
      profile.bodyFat,
      profile.effortLevel,
      goal.fatLossPriority
    );
    let estimatedFatLossKg = profile.weightKg * weeklyFrac * weeks;

    // Cap by target BF% when it implies less loss than the rate ceiling.
    const currentFatKg = (profile.bodyFat / 100) * profile.weightKg;
    const targetBf = clamp(goal.targetBodyFat, 5, 50);
    if (targetBf >= profile.bodyFat) {
      estimatedFatLossKg = 0;
      if (goal.fatLossPriority > 0.3) {
        warnings.push(
          "Target body fat is at or above current; fat-loss estimate set to 0."
        );
      }
    } else {
      // Approximate lean mass held constant for BF% target mass check.
      const leanKg = profile.weightKg - currentFatKg;
      const targetWeightForBf = leanKg / (1 - targetBf / 100);
      const fatLossToTarget = Math.max(0, profile.weightKg - targetWeightForBf);
      estimatedFatLossKg = Math.min(estimatedFatLossKg, fatLossToTarget * 1.05);
    }

    // Soft trade-off when heavily prioritizing muscle in a deficit context.
    if (goal.musclePriority > 0.7 && goal.fatLossPriority > 0.5) {
      estimatedFatLossKg *= 0.9;
      warnings.push(
        "High muscle and fat-loss priorities together; fat-loss rate reduced ~10%."
      );
    }

    // --- Muscle gain ---
    let estimatedMuscleGainKg =
      monthlyMuscleGainKg(profile, goal.musclePriority) * months;

    // Cutting blunts hypertrophy (priority-weighted).
    const cutSeverity = clamp(goal.fatLossPriority, 0, 1);
    estimatedMuscleGainKg *= 1 - 0.45 * cutSeverity;

    if (profile.trainingLevel === "advanced" || profile.trainingLevel === "elite") {
      warnings.push(
        "Advanced training level: muscle-gain estimates use diminishing returns."
      );
    }

    if (profile.limitations.length > 0) {
      estimatedMuscleGainKg *= 0.9;
      estimatedFatLossKg *= 0.95;
      warnings.push(
        "Declared limitations present; rates reduced slightly for conservatism."
      );
    }

    estimatedFatLossKg = round(clamp(estimatedFatLossKg, 0, profile.weightKg * 0.25));
    estimatedMuscleGainKg = round(clamp(estimatedMuscleGainKg, 0, 8));

    // --- Morphometric proxies (illustrative) ---
    // Rough: ~1 cm waist per ~0.7–1.0 kg fat in typical android distribution.
    const waistReductionCm = round(
      clamp(estimatedFatLossKg * 0.85, 0, 20)
    );
    const focusBoost = (zone: string) =>
      profile.focusZones.includes(zone as never) ? 1.15 : 1;

    const shoulderIncreasePercent = round(
      clamp(estimatedMuscleGainKg * 1.1 * focusBoost("shoulders"), 0, 8)
    );
    const chestIncreasePercent = round(
      clamp(estimatedMuscleGainKg * 1.0 * focusBoost("chest"), 0, 8)
    );
    const armIncreasePercent = round(
      clamp(estimatedMuscleGainKg * 1.25 * focusBoost("arms"), 0, 10)
    );

    const visualIntensity = pickVisualIntensity(
      estimatedFatLossKg,
      estimatedMuscleGainKg,
      weeks
    );

    // --- Confidence ---
    let confidence = 0.78;
    if (weeks < 8) confidence -= 0.12;
    if (weeks > 40) confidence -= 0.05;
    if (Math.abs(profile.bodyFat - targetBf) > 15) confidence -= 0.1;
    if (profile.nutritionQuality === "poor") confidence -= 0.08;
    if (profile.effortLevel === "low") confidence -= 0.06;
    if (goal.visualStyle === "competition_lean") confidence -= 0.08;
    confidence = round(clamp(confidence, 0.35, 0.92), 2);

    if (confidence < 0.55) {
      warnings.push(
        "Confidence is limited; treat estimates as directional only."
      );
    }

    return {
      estimatedFatLossKg,
      estimatedMuscleGainKg,
      waistReductionCm,
      shoulderIncreasePercent,
      chestIncreasePercent,
      armIncreasePercent,
      visualIntensity,
      confidenceScore: confidence,
      warnings,
      sourceProfile: profile,
      sourceGoal: goal,
      effectiveTimelineWeeks: weeks,
      generatedAt: new Date().toISOString(),
    };
  }
}
