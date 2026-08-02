/**
 * GoalPlanner — deterministic nutrition / timeline recommendations.
 *
 * Given BodyProfile + TransformationGoal, produces a typed schedule of
 * monthly body-fat and weight expectations plus calorie / protein targets.
 * Heuristic only — not medical advice. No AI calls or I/O.
 *
 * ## Documented heuristics
 *
 * 1. **Timeline:** Prefer goal.timeline.weeks; clamp 8–52. If target BF% delta
 *    is large relative to safe weekly fat-loss rate, extend toward the clamp.
 *
 * 2. **Calories:** Mifflin–St Jeor BMR × activity multiplier, then surplus/deficit
 *    from priorities (±10–18%). Floor at BMR × 1.05 for safety conservatism.
 *
 * 3. **Protein:** ~1.6–2.2 g/kg body weight scaled by musclePriority and
 *    training level (higher when building or advanced).
 *
 * 4. **Monthly curves:** Linear interpolation from current → expected end
 *    weight / BF% over recommended months (simple; ignores water/glycogen noise).
 */

import type {
  ActivityLevel,
  BodyProfile,
  Gender,
  TrainingLevel,
} from "./BodyProfile";
import type { TransformationGoal } from "./TransformationGoal";

/** One month of projected composition along the plan. */
export interface MonthlyProjection {
  /** 1-based month index within the recommended timeline. */
  month: number;

  /** Expected body-fat percentage at end of this month. */
  bodyFatPercent: number;

  /** Expected body weight (kg) at end of this month. */
  weightKg: number;
}

/**
 * Strongly typed output of GoalPlanner.plan().
 */
export interface GoalPlanResult {
  /** Recommended planning horizon in weeks (clamped / adjusted). */
  recommendedTimeline: number;

  /** Recommended daily energy intake (kcal). */
  recommendedCalories: number;

  /** Recommended daily protein (grams). */
  recommendedProtein: number;

  /** Expected body-fat % at the end of each month. */
  expectedBodyFatEachMonth: number[];

  /** Expected weight (kg) at the end of each month. */
  expectedWeightEachMonth: number[];

  /** Optional richer month rows (same series as the arrays above). */
  monthlyProjections: MonthlyProjection[];

  /** Notes explaining adjustments. */
  notes: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function activityFactor(level: ActivityLevel): number {
  switch (level) {
    case "sedentary":
      return 1.2;
    case "light":
      return 1.375;
    case "moderate":
      return 1.55;
    case "active":
      return 1.725;
    case "very_active":
      return 1.9;
    default:
      return 1.55;
  }
}

/**
 * Mifflin–St Jeor BMR (kcal/day).
 * nonbinary / unspecified use an average of male/female equations.
 */
function estimateBmr(profile: BodyProfile): number {
  const { weightKg, heightCm, age } = profile;
  const male = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  const female = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  return bmrForGender(profile.gender, male, female);
}

function bmrForGender(gender: Gender, male: number, female: number): number {
  if (gender === "male") return male;
  if (gender === "female") return female;
  return (male + female) / 2;
}

function proteinPerKg(
  musclePriority: number,
  level: TrainingLevel
): number {
  let g = 1.6 + clamp(musclePriority, 0, 1) * 0.5;
  if (level === "advanced" || level === "elite") g += 0.1;
  if (level === "beginner") g -= 0.05;
  return clamp(g, 1.4, 2.2);
}

/**
 * Builds conservative calorie, protein, and monthly composition trajectories.
 */
export class GoalPlanner {
  /**
   * Compute a GoalPlanResult from profile + goal.
   */
  plan(profile: BodyProfile, goal: TransformationGoal): GoalPlanResult {
    const notes: string[] = [];

    const targetBf = clamp(goal.targetBodyFat, 5, 50);
    const bfDelta = Math.max(0, profile.bodyFat - targetBf);

    // ~0.5% BW / week fat loss as a planning-safe average.
    const safeWeeklyFatFrac = 0.005;
    const minWeeksForFat =
      bfDelta > 0
        ? Math.ceil(
            ((bfDelta / 100) * profile.weightKg) /
              (profile.weightKg * safeWeeklyFatFrac)
          )
        : 8;

    const requested = goal.timeline?.weeks ?? profile.timelineWeeks ?? 12;
    let recommendedTimeline = clamp(
      Math.max(requested, minWeeksForFat),
      8,
      52
    );
    if (recommendedTimeline > requested) {
      notes.push(
        `Timeline extended from ${requested} to ${recommendedTimeline} weeks for safer fat-loss pacing.`
      );
    } else if (requested !== recommendedTimeline) {
      notes.push(
        `Timeline clamped to ${recommendedTimeline} weeks (allowed range 8–52).`
      );
    }

    const bmr = estimateBmr(profile);
    const tdee = bmr * activityFactor(profile.activityLevel);

    const fatPri = clamp(goal.fatLossPriority, 0, 1);
    const musPri = clamp(goal.musclePriority, 0, 1);
    // Net adjustment: deficit when fat prioritized, surplus when muscle dominates.
    const net = musPri - fatPri;
    const calorieAdjust = 1 + net * 0.14; // ±14% at extremes
    let recommendedCalories = Math.round(tdee * calorieAdjust);
    const calorieFloor = Math.round(bmr * 1.05);
    if (recommendedCalories < calorieFloor) {
      recommendedCalories = calorieFloor;
      notes.push(
        "Calories raised to a conservative floor (~1.05 × BMR)."
      );
    }

    // Nutrition quality nudges adherence realism, not a hard rule.
    if (profile.nutritionQuality === "poor") {
      recommendedCalories = Math.round(recommendedCalories * 0.98);
      notes.push("Nutrition quality marked poor; slight calorie trim applied.");
    }

    const recommendedProtein = Math.round(
      profile.weightKg * proteinPerKg(musPri, profile.trainingLevel)
    );

    // End-state weight: prefer explicit targetWeight; else BF%-driven lean-mass hold.
    const currentFatKg = (profile.bodyFat / 100) * profile.weightKg;
    const leanKg = profile.weightKg - currentFatKg;
    const endWeightFromBf = leanKg / (1 - targetBf / 100);
    // Mild lean-mass change expectation from priorities (very small for planner curve).
    const leanAdjust =
      musPri * 1.5 * (recommendedTimeline / 16) -
      fatPri * 0.3 * (recommendedTimeline / 16);
    const derivedEndWeight = endWeightFromBf + leanAdjust;
    const endWeight = clamp(
      goal.targetWeight ?? derivedEndWeight,
      profile.weightKg * 0.75,
      profile.weightKg * 1.15
    );

    const endBf =
      goal.targetWeight != null && goal.targetWeight > 0
        ? // If weight target given without matching BF math, still trend BF toward targetBf.
          targetBf
        : targetBf;

    const monthCount = Math.max(1, Math.ceil(recommendedTimeline / 4.345));
    const expectedBodyFatEachMonth: number[] = [];
    const expectedWeightEachMonth: number[] = [];
    const monthlyProjections: MonthlyProjection[] = [];

    for (let m = 1; m <= monthCount; m++) {
      const t = m / monthCount;
      const bodyFatPercent = round(
        profile.bodyFat + (endBf - profile.bodyFat) * t,
        1
      );
      const weightKg = round(
        profile.weightKg + (endWeight - profile.weightKg) * t,
        1
      );
      expectedBodyFatEachMonth.push(bodyFatPercent);
      expectedWeightEachMonth.push(weightKg);
      monthlyProjections.push({ month: m, bodyFatPercent, weightKg });
    }

    return {
      recommendedTimeline,
      recommendedCalories,
      recommendedProtein,
      expectedBodyFatEachMonth,
      expectedWeightEachMonth,
      monthlyProjections,
      notes,
    };
  }
}
