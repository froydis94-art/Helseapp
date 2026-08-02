/**
 * Non-production AI OS v2 harness fixtures.
 * Fictional generic test data only — no real user identity.
 */

import { BODY_PROFILE_SCHEMA_VERSION } from "../BodyProfile";
import { TRANSFORMATION_GOAL_SCHEMA_VERSION } from "../TransformationGoal";
import type { AiOsV2HarnessInput } from "./AiOsV2Harness";
/* Fixtures depend on harness contracts only (types); no circular runtime import. */

/** Valid moderate 24-week recomposition case. */
export const validRecompositionFixture: AiOsV2HarnessInput = {
  profile: {
    schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
    sex: "female",
    age: 34,
    heightCm: 170,
    weightKg: 72,
    bodyFatPct: 30,
    trainingLevel: "intermediate",
    trainingAgeYears: 3,
    activityLevel: "moderate",
    nutritionQuality: "good",
  },
  goal: {
    schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
    fatDirection: "decrease",
    muscleDirection: "increase",
    targetBodyFatPct: 24,
    targetWeightKg: 67,
    timelineWeeks: 24,
    effortLevel: "moderate",
    focusZones: ["waist", "shoulders"],
    musclePriority: 0.5,
    fatLossPriority: 0.7,
    outcomes: ["recomp"],
  },
  formatterOptions: {
    aspectRatio: "3:4",
    seed: 11,
    quality: "standard",
  },
};

/**
 * Valid fixture with unknown current and target body-fat.
 * Pipeline must remain valid without inventing BF percentages.
 * Uses muscle-forward focus (no waist) so regional magnitudes stay non-zero
 * when fat estimates are unavailable — avoids near-zero regional copy.
 */
export const missingBodyFatFixture: AiOsV2HarnessInput = {
  profile: {
    schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
    sex: "male",
    age: 28,
    heightCm: 178,
    weightKg: 80,
    trainingLevel: "beginner",
    trainingAgeYears: 1,
    activityLevel: "active",
    nutritionQuality: "good",
  },
  goal: {
    schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
    fatDirection: "maintain",
    muscleDirection: "increase",
    timelineWeeks: 24,
    effortLevel: "high",
    focusZones: ["shoulders", "chest"],
    musclePriority: 0.9,
    fatLossPriority: 0.1,
  },
};

/** Raw goal with invalid priority (outside [0, 1]) — must fail input validation. */
export const invalidPriorityFixture: AiOsV2HarnessInput = {
  profile: {
    schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
    sex: "female",
    age: 30,
    heightCm: 165,
    weightKg: 68,
    bodyFatPct: 27,
    trainingLevel: "novice",
    activityLevel: "light",
  },
  goal: {
    schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
    fatDirection: "decrease",
    muscleDirection: "increase",
    timelineWeeks: 16,
    effortLevel: "moderate",
    focusZones: ["waist"],
    musclePriority: 1.5,
    fatLossPriority: 0.5,
  },
};

/**
 * Borderline short timeline (validation-allowed minimum).
 * Demonstrates unusual-timeline warning and short-horizon planning.
 */
export const shortTimelineFixture: AiOsV2HarnessInput = {
  profile: {
    schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
    sex: "unspecified",
    age: 36,
    heightCm: 172,
    weightKg: 75,
    bodyFatPct: 26,
    trainingLevel: "intermediate",
    trainingAgeYears: 4,
    activityLevel: "moderate",
    nutritionQuality: "good",
  },
  goal: {
    schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
    fatDirection: "decrease",
    muscleDirection: "maintain",
    targetBodyFatPct: 22,
    timelineWeeks: 4,
    effortLevel: "high",
    focusZones: ["waist"],
    fatLossPriority: 0.8,
    musclePriority: 0.2,
  },
};
