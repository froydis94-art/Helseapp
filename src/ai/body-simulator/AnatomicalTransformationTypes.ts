/**
 * Anatomical Transformation Engine v2 — contracts (Demand 022D).
 *
 * Canonical intent describes WHAT anatomical change should occur
 * (region / feature / direction / magnitude), not aesthetic labels.
 */

import type { BodyAnalysisConfidence } from "../body-analysis/types";
import type { BodySimulatorRegion } from "./BodySimulatorTypes";

export const ANATOMICAL_TRANSFORMATION_SCHEMA_VERSION = 1 as const;

export type AnatomicalChangeDirection =
  | "strong_decrease"
  | "moderate_decrease"
  | "slight_decrease"
  | "stable"
  | "slight_increase"
  | "moderate_increase"
  | "strong_increase"
  | "more_defined"
  | "less_defined"
  | "unknown";

export type AnatomicalMagnitude =
  | "subtle"
  | "moderate"
  | "clear"
  | "pronounced";

export type AnatomicalFeature =
  | "subcutaneous_fat"
  | "waist_width"
  | "abdominal_definition"
  | "oblique_definition"
  | "serratus_definition"
  | "chest_definition"
  | "chest_volume"
  | "shoulder_definition"
  | "shoulder_volume"
  | "arm_definition"
  | "arm_volume"
  | "upper_back_definition"
  | "lat_width"
  | "glute_volume"
  | "thigh_definition"
  | "thigh_volume"
  | "lower_leg_definition"
  | "whole_body_definition"
  | "whole_body_muscle_volume";

export type AnatomicalRuleSource =
  | "body_fat_delta"
  | "goal"
  | "focus_zone"
  | "timeline"
  | "effort"
  | "training"
  | "optional_note"
  | "realism_constraint"
  | "derived";

export type AnatomicalSuppressionReason =
  | "lower_priority_conflict"
  | "body_fat_direction_conflict"
  | "goal_conflict"
  | "realism_boundary"
  | "preservation_boundary"
  | "optional_note_conflict";

export type MuscleGainMode =
  | "lean_bulk"
  | "mixed_bulk"
  | "fat_gain_bulk"
  | "not_applicable";

export type BodySimulatorFocusZone =
  | "core"
  | "abs"
  | "chest"
  | "arms"
  | "shoulders"
  | "upper_body"
  | "back"
  | "glutes"
  | "thighs"
  | "posture";

export const BODY_SIMULATOR_FOCUS_ZONES: readonly BodySimulatorFocusZone[] =
  Object.freeze([
    "core",
    "abs",
    "chest",
    "arms",
    "shoulders",
    "upper_body",
    "back",
    "glutes",
    "thighs",
    "posture",
  ]);

export type GoalConsistencySeverity = "info" | "warning";

export interface GoalConsistencyIssue {
  code: string;
  severity: GoalConsistencySeverity;
  message: string;
  suggestedInterpretation: string | null;
}

export interface AnatomicalTransformationRule {
  id: string;
  region: BodySimulatorRegion;
  feature: AnatomicalFeature;
  direction: AnatomicalChangeDirection;
  magnitude: AnatomicalMagnitude;
  /** Higher wins when resolving same-feature conflicts. */
  priority: number;
  source: AnatomicalRuleSource;
  confidence: BodyAnalysisConfidence;
  confidenceReasons: string[];
  limitations: string[];
}

export interface OptionalNoteOutcome {
  note: string;
  status: "applied" | "partially_applied" | "suppressed";
  reason: string;
}

export interface AnatomicalTransformationResult {
  schemaVersion: typeof ANATOMICAL_TRANSFORMATION_SCHEMA_VERSION;

  rules: AnatomicalTransformationRule[];

  appliedRuleIds: string[];

  suppressedRuleIds: string[];

  /** ruleId → suppression reason code */
  suppressionReasons: Record<string, AnatomicalSuppressionReason | string>;

  conflicts: GoalConsistencyIssue[];

  summary: {
    bodyFatDriven: boolean;
    muscleDriven: boolean;
    focusZoneDriven: boolean;
    optionalNotesUsed: boolean;
  };

  muscleGainMode: MuscleGainMode;

  bodyFatContext: {
    currentPercent: number | null;
    targetPercent: number | null;
    deltaPercentagePoints: number | null;
  };

  focusZones: BodySimulatorFocusZone[];

  optionalNotesPresent: boolean;

  noteOutcomes: OptionalNoteOutcome[];

  /** Secondary formatter-support metadata only — never canonical intent. */
  semanticSupportTerms: string[];

  effortLabel: "moderate" | "hard" | "strict";

  effortCoefficient: number;

  timelineWeeks: number;

  confidence: BodyAnalysisConfidence;

  confidenceReasons: string[];

  limitations: string[];
}
