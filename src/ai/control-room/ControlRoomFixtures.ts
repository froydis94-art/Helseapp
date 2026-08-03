/**
 * Control Room fictional scenarios — fixture-only, no real persons or images.
 */

import { BODY_PROFILE_SCHEMA_VERSION } from "../BodyProfile";
import { TRANSFORMATION_GOAL_SCHEMA_VERSION } from "../TransformationGoal";
import type { AiOsRuntimeInput } from "../runtime/AiOsRuntimeTypes";
import type {
  ControlRoomScenarioId,
  ControlRoomScenarioSummary,
} from "./ControlRoomTypes";

interface ControlRoomScenarioRecord {
  summary: ControlRoomScenarioSummary;
  runtimeInput: AiOsRuntimeInput;
}

const SCENARIOS: readonly ControlRoomScenarioRecord[] = [
  {
    summary: {
      id: "balanced_recomposition_12w",
      title: "Balanced recomposition (12 weeks)",
      description:
        "A moderate, balanced body-recomposition scenario with gradual fat reduction and modest muscle development.",
      timelineWeeks: 12,
      focusZones: ["waist", "shoulders"],
      direction: "recomposition",
    },
    runtimeInput: {
      mode: "dry_run",
      profile: {
        schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
        sex: "female",
        age: 32,
        heightCm: 168,
        weightKg: 70,
        bodyFatPct: 29,
        trainingLevel: "intermediate",
        trainingAgeYears: 2,
        activityLevel: "moderate",
        nutritionQuality: "good",
      },
      goal: {
        schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
        fatDirection: "decrease",
        muscleDirection: "increase",
        targetBodyFatPct: 25,
        targetWeightKg: 66,
        timelineWeeks: 12,
        effortLevel: "moderate",
        focusZones: ["waist", "shoulders"],
        musclePriority: 0.45,
        fatLossPriority: 0.65,
        outcomes: ["recomp"],
      },
      formatterOptions: {
        aspectRatio: "3:4",
        seed: 101,
        quality: "standard",
      },
    },
  },
  {
    summary: {
      id: "upper_body_definition_8w",
      title: "Upper-body definition (8 weeks)",
      description:
        "A conservative upper-body definition scenario emphasizing shoulders and back without extreme targets.",
      timelineWeeks: 8,
      focusZones: ["shoulders", "back", "arms"],
      direction: "upper_body_definition",
    },
    runtimeInput: {
      mode: "dry_run",
      profile: {
        schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
        sex: "male",
        age: 29,
        heightCm: 180,
        weightKg: 82,
        bodyFatPct: 22,
        trainingLevel: "intermediate",
        trainingAgeYears: 4,
        activityLevel: "active",
        nutritionQuality: "good",
      },
      goal: {
        schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
        fatDirection: "decrease",
        muscleDirection: "increase",
        targetBodyFatPct: 18,
        targetWeightKg: 79,
        timelineWeeks: 8,
        effortLevel: "moderate",
        focusZones: ["shoulders", "back", "arms"],
        musclePriority: 0.7,
        fatLossPriority: 0.5,
        outcomes: ["toned", "vshape"],
      },
      formatterOptions: {
        aspectRatio: "3:4",
        seed: 202,
        quality: "standard",
        styleOverride: "natural_athletic",
      },
    },
  },
  {
    summary: {
      id: "gradual_fat_loss_16w",
      title: "Gradual fat loss (16 weeks)",
      description:
        "A gradual and physiologically conservative fat-loss scenario with light muscle maintenance.",
      timelineWeeks: 16,
      focusZones: ["waist", "core"],
      direction: "fat_loss",
    },
    runtimeInput: {
      mode: "dry_run",
      profile: {
        schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
        sex: "female",
        age: 41,
        heightCm: 165,
        weightKg: 78,
        bodyFatPct: 34,
        trainingLevel: "beginner",
        trainingAgeYears: 1,
        activityLevel: "light",
        nutritionQuality: "fair",
      },
      goal: {
        schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
        fatDirection: "decrease",
        muscleDirection: "maintain",
        targetBodyFatPct: 28,
        targetWeightKg: 72,
        timelineWeeks: 16,
        effortLevel: "moderate",
        focusZones: ["waist", "core"],
        musclePriority: 0.25,
        fatLossPriority: 0.8,
        outcomes: ["fat_loss"],
      },
      formatterOptions: {
        aspectRatio: "3:4",
        seed: 303,
        quality: "standard",
        styleOverride: "source_faithful",
      },
    },
  },
  {
    summary: {
      id: "athletic_strength_24w",
      title: "Athletic strength (24 weeks)",
      description:
        "A longer athletic-strength scenario focused on shoulders, legs, and back without extreme muscle growth.",
      timelineWeeks: 24,
      focusZones: ["shoulders", "legs", "back"],
      direction: "athletic_strength",
    },
    runtimeInput: {
      mode: "dry_run",
      profile: {
        schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
        sex: "male",
        age: 35,
        heightCm: 175,
        weightKg: 76,
        bodyFatPct: 18,
        trainingLevel: "advanced",
        trainingAgeYears: 8,
        activityLevel: "very_active",
        nutritionQuality: "excellent",
      },
      goal: {
        schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
        fatDirection: "maintain",
        muscleDirection: "increase",
        targetBodyFatPct: 16,
        targetWeightKg: 78,
        timelineWeeks: 24,
        effortLevel: "high",
        focusZones: ["shoulders", "legs", "back"],
        musclePriority: 0.75,
        fatLossPriority: 0.3,
        outcomes: ["stronger", "athletic_performance"],
      },
      formatterOptions: {
        aspectRatio: "3:4",
        seed: 404,
        quality: "high",
        styleOverride: "documentary_fitness",
      },
    },
  },
];

const SCENARIO_IDS: readonly ControlRoomScenarioId[] = SCENARIOS.map(
  (s) => s.summary.id
);

function cloneScenario(
  record: ControlRoomScenarioRecord
): {
  summary: ControlRoomScenarioSummary;
  runtimeInput: AiOsRuntimeInput;
} {
  return {
    summary: structuredClone(record.summary),
    runtimeInput: structuredClone(record.runtimeInput),
  };
}

/** Public summaries for all allowlisted Control Room scenarios. */
export function listControlRoomScenarios(): ControlRoomScenarioSummary[] {
  return SCENARIOS.map((record) => structuredClone(record.summary));
}

/** Resolve one allowlisted scenario as fresh clones, or null if unknown. */
export function getControlRoomScenario(
  id: ControlRoomScenarioId
): {
  summary: ControlRoomScenarioSummary;
  runtimeInput: AiOsRuntimeInput;
} | null {
  const record = SCENARIOS.find((entry) => entry.summary.id === id);
  if (!record) return null;
  return cloneScenario(record);
}

/** Stable allowlisted scenario id list (cloned). */
export function listControlRoomScenarioIds(): ControlRoomScenarioId[] {
  return [...SCENARIO_IDS];
}
