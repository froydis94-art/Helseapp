/**
 * Body Simulator v1 — input/output contracts (Demand 022).
 *
 * Deterministic, provider-independent Transformation Rules.
 * No prompts, provider fields, image data, or medical diagnosis.
 */

import type {
  BodyAnalysisConfidence,
  BodyAnalysisEvidence,
} from "../body-analysis/types";
import type {
  AnatomicalTransformationResult,
  BodySimulatorFocusZone,
} from "./AnatomicalTransformationTypes";

/** Input schema version — bump only with a versioned migration. */
export const BODY_SIMULATOR_INPUT_SCHEMA_VERSION = 1 as const;

/** Output Transformation Rules schema version. */
export const BODY_SIMULATOR_RULES_SCHEMA_VERSION = 1 as const;

/**
 * Physiology / simulation coefficient rules version (traceability).
 * Bump when BodySimulatorRules heuristics change materially.
 * Anatomical Transformation (022D) attaches without changing v1 physiology version.
 */
export const BODY_SIMULATOR_RULES_VERSION = "1.0" as const;

export type BodySimulationGoalType =
  | "weight_loss"
  | "fat_loss_with_muscle_preservation"
  | "muscle_gain"
  | "body_recomposition"
  | "general_fitness_improvement";

export const BODY_SIMULATION_GOAL_TYPES: readonly BodySimulationGoalType[] =
  Object.freeze([
    "weight_loss",
    "fat_loss_with_muscle_preservation",
    "muscle_gain",
    "body_recomposition",
    "general_fitness_improvement",
  ]);

export type BodySimulationIntensity =
  | "conservative"
  | "realistic"
  | "ambitious";

export const BODY_SIMULATION_INTENSITIES: readonly BodySimulationIntensity[] =
  Object.freeze(["conservative", "realistic", "ambitious"]);

/** Default intensity when product layers omit an explicit choice. */
export const DEFAULT_BODY_SIMULATION_INTENSITY: BodySimulationIntensity =
  "realistic";

export const BODY_SIMULATOR_TIMELINE_MIN_WEEKS = 4 as const;
export const BODY_SIMULATOR_TIMELINE_MAX_WEEKS = 52 as const;

export type ReportedEffectDirection =
  | "strong_decrease"
  | "moderate_decrease"
  | "slight_decrease"
  | "no_effect"
  | "slight_increase"
  | "moderate_increase"
  | "strong_increase"
  | "unknown";

export const REPORTED_EFFECT_DIRECTIONS: readonly ReportedEffectDirection[] =
  Object.freeze([
    "strong_decrease",
    "moderate_decrease",
    "slight_decrease",
    "no_effect",
    "slight_increase",
    "moderate_increase",
    "strong_increase",
    "unknown",
  ]);

export type BodySimulatorRegion =
  | "face_and_neck"
  | "shoulders"
  | "chest_and_upper_torso"
  | "upper_back"
  | "arms"
  | "waist_and_flanks"
  | "abdomen"
  | "hips"
  | "glutes"
  | "thighs"
  | "lower_legs"
  | "whole_body";

export const BODY_SIMULATOR_REGIONS: readonly BodySimulatorRegion[] =
  Object.freeze([
    "face_and_neck",
    "shoulders",
    "chest_and_upper_torso",
    "upper_back",
    "arms",
    "waist_and_flanks",
    "abdomen",
    "hips",
    "glutes",
    "thighs",
    "lower_legs",
    "whole_body",
  ]);

/**
 * Minimal optional Body Analysis stub.
 * Full analysis remains Demand 021 reserved / not implemented.
 * Accepts null or a reserved shape without running analysis.
 */
export interface BodyAnalysisResultStub {
  schemaVersion: 1;
  status: "not_run" | "reserved_not_implemented" | "unavailable";
  /** Reserved — never a fabricated measurement in Demand 022. */
  observations: unknown[];
  confidence: BodyAnalysisConfidence;
  confidenceReasons: string[];
  limitations: string[];
}

export type BodyAnalysisResult = BodyAnalysisResultStub;

export interface BodySimulatorProfile {
  ageYears: number | null;

  sexForPhysiology:
    | "female"
    | "male"
    | "intersex_or_other"
    | "not_provided";

  heightCm: number | null;
  currentWeightKg: number | null;

  currentBodyFatPercent: number | null;

  bodyFatBasis:
    | "user_estimate"
    | "device_measurement"
    | "professional_measurement"
    | "future_visual_estimate"
    | "not_provided";

  trainingExperience:
    | "beginner"
    | "intermediate"
    | "advanced"
    | "not_provided";

  evidence: Record<string, BodyAnalysisEvidence>;
}

export interface BodySimulatorActivityProfile {
  generalActivity:
    | "very_low"
    | "low"
    | "moderate"
    | "high"
    | "very_high"
    | "not_provided";

  resistanceTrainingSessionsPerWeek: number | null;
  cardioSessionsPerWeek: number | null;

  trainingConsistency:
    | "low"
    | "moderate"
    | "high"
    | "not_provided";

  proteinIntakeSupport:
    | "likely_low"
    | "likely_adequate"
    | "likely_high"
    | "not_provided";

  recoverySupport:
    | "limited"
    | "moderate"
    | "strong"
    | "not_provided";

  evidence: Record<string, BodyAnalysisEvidence>;
}

export interface MedicationWeightEffectProfile {
  medicationMayAffectWeight: boolean;

  appetite: ReportedEffectDirection;
  energyLevel: ReportedEffectDirection;
  metabolismTendency: ReportedEffectDirection;
  muscleBuildingOrPreservation: ReportedEffectDirection;

  evidence: {
    origin: "user_declared" | "unknown";
    confidence: "not_applicable" | "low" | "medium" | "high";
    notes: string[];
  };
}

export interface BodySimulatorInput {
  schemaVersion: typeof BODY_SIMULATOR_INPUT_SCHEMA_VERSION;

  simulationId: string;
  createdAt: string;

  goal: {
    type: BodySimulationGoalType;
    timelineWeeks: number;

    targetWeightChangeKg: number | null;
    targetBodyFatChangePercentagePoints: number | null;
    targetMuscleChangeKg: number | null;

    intensity: BodySimulationIntensity;

    /**
     * Absolute target body-fat % when known (Demand 022D).
     * Optional for migration safety; when set with currentBodyFatPercent,
     * drives anatomical body-fat delta.
     */
    targetBodyFatPercent?: number | null;
  };

  profile: BodySimulatorProfile;

  activity: BodySimulatorActivityProfile;

  medicationEffects: MedicationWeightEffectProfile;

  bodyAnalysis: BodyAnalysisResult | null;

  sourceImageContext: {
    available: boolean;
    progressPhotoView:
      | "front"
      | "side"
      | "back"
      | "three_quarter"
      | "unknown";
  };

  options: {
    preserveIdentity: true;
    preserveOriginalPresentation: true;
    preservePose: true;
    preserveCameraFraming: true;
    preserveClothing: true;
    preserveBackground: true;
    preserveLightingCharacter: true;
  };

  /** Optional focus zones (Demand 022D). Absent → empty. */
  focusZones?: readonly BodySimulatorFocusZone[];

  /** Optional free-text notes (Demand 022D). Lowest structured priority. */
  optionalNotes?: readonly string[];
}

export interface SimulationRange {
  lower: number | null;
  expected: number | null;
  upper: number | null;
  unit: "kg" | "percentage_points" | "relative_scale";
  origin:
    | "user_target"
    | "deterministic_simulation"
    | "bounded_user_target"
    | "unknown";
}

export type RegionFatChange =
  | "strong_decrease"
  | "moderate_decrease"
  | "slight_decrease"
  | "stable"
  | "slight_increase"
  | "moderate_increase"
  | "unknown";

export type RegionMuscleChange =
  | "moderate_decrease"
  | "slight_decrease"
  | "stable"
  | "slight_increase"
  | "moderate_increase"
  | "strong_increase"
  | "unknown";

export interface BodySimulatorRegionRule {
  region: BodySimulatorRegion;

  fatChange: RegionFatChange;
  muscleChange: RegionMuscleChange;

  visualMagnitude: {
    lower: number;
    expected: number;
    upper: number;
  };

  preserveNaturalProportions: true;

  visibility:
    | "available"
    | "partially_visible"
    | "not_visible"
    | "not_assessable"
    | "unknown";

  confidence: BodyAnalysisConfidence;
  confidenceReasons: string[];
  provenanceSourcePaths: string[];
}

export interface TransformationRuleProvenance {
  rulePath: string;
  source:
    | "goal"
    | "profile"
    | "activity"
    | "medication_effect"
    | "body_analysis"
    | "timeline"
    | "realism_constraint"
    | "derived";
  sourcePath: string;
}

export type ModerationReason =
  | "timeline_limits_requested_change"
  | "muscle_gain_target_exceeds_v1_boundary"
  | "fat_loss_target_exceeds_v1_boundary"
  | "insufficient_baseline_information"
  | "ambitious_intensity_bounded"
  | "identity_preservation_boundary"
  | "natural_proportion_boundary";

export interface BodySimulatorTransformationRules {
  schemaVersion: typeof BODY_SIMULATOR_RULES_SCHEMA_VERSION;

  simulationId: string;
  generatedAt: string;

  rulesVersion: typeof BODY_SIMULATOR_RULES_VERSION | string;

  goal: {
    requestedType: BodySimulationGoalType;
    effectiveType: BodySimulationGoalType;
    timelineWeeks: number;
    intensity: BodySimulationIntensity;
  };

  baseline: {
    sourceCompleteness: "high" | "medium" | "low";
    bodyFatBasis: BodySimulatorProfile["bodyFatBasis"];
    missingInputs: string[];
  };

  wholeBodyChange: {
    weightChangeKg: SimulationRange;
    bodyFatChangePercentagePoints: SimulationRange;
    muscleChangeKg: SimulationRange;
    confidence: BodyAnalysisConfidence;
    confidenceReasons: string[];
  };

  regions: BodySimulatorRegionRule[];

  /**
   * Higher-detail canonical anatomical transformation (Demand 022D).
   * Broad `regions` remain for compatibility; anatomical is authoritative detail.
   */
  anatomicalTransformation: AnatomicalTransformationResult;

  preservation: {
    identity: "preserve";
    originalPresentation: "preserve";
    pose: "preserve";
    cameraFraming: "preserve";
    clothing: "preserve";
    clothingCoverage: "preserve";
    background: "preserve";
    lightingCharacter: "preserve";
    ageAppearance: "preserve";
    ethnicityAppearance: "preserve";
    personalStyle: "preserve";
    faceGeometry: "preserve";
    skinTone: "preserve";
    hairstyle: "preserve";
    bodyHeight: "preserve";
    handAndFootScale: "preserve";
    skeletalProportions: "preserve";
  };

  realism: {
    requestedTargetModerated: boolean;
    moderationReasons: string[];
    unrealisticChangePrevented: boolean;
    expectedVisualizationNotGuarantee: true;
  };

  provenance: TransformationRuleProvenance[];

  confidence: {
    overall: BodyAnalysisConfidence;
    reasons: string[];
  };

  limitations: string[];
  warnings: string[];
}

export interface BodySimulatorReadiness {
  ready: boolean;
  status: "ready" | "ready_with_limitations" | "insufficient_input";
  missingRequiredInputs: string[];
  optionalMissingInputs: string[];
  limitations: string[];
}

export type BodySimulatorValidationErrorCode =
  | "unsupported_schema_version"
  | "unsupported_goal"
  | "timeline_below_minimum"
  | "timeline_above_maximum"
  | "invalid_intensity"
  | "invalid_number"
  | "invalid_height"
  | "invalid_weight"
  | "invalid_effect_direction"
  | "forbidden_content"
  | "invalid_options"
  | "missing_simulation_id"
  | "invalid_input_shape";

export interface BodySimulatorValidationError {
  code: BodySimulatorValidationErrorCode | string;
  path: string;
  message: string;
}

export type BodySimulatorSimulateResult =
  | { ok: true; rules: BodySimulatorTransformationRules }
  | { ok: false; errors: BodySimulatorValidationError[] };

/** Preferred structured confidence reason identifiers (Demand 022). */
export const BODY_SIMULATOR_CONFIDENCE_REASONS = Object.freeze([
  "user_declared_height_available",
  "user_declared_weight_available",
  "body_fat_measurement_available",
  "body_fat_user_estimate_only",
  "body_fat_not_provided",
  "training_experience_available",
  "training_experience_missing",
  "whole_body_visible",
  "front_view_available",
  "side_view_available",
  "back_view_available",
  "single_view_only",
  "body_region_visible",
  "body_region_occluded",
  "strong_backlight",
  "timeline_within_supported_range",
  "target_required_moderation",
  "medication_effect_user_reported",
  "medication_effect_unknown",
  "limited_baseline_data",
] as const);

export type BodySimulatorConfidenceReason =
  (typeof BODY_SIMULATOR_CONFIDENCE_REASONS)[number];

export const BODY_SIMULATOR_PRIMARY_PURPOSE =
  "The Body Simulator exists to create realistic expected future body visualizations from structured user inputs, goals and timelines." as const;

export const BODY_SIMULATOR_FORBIDDEN_OUTPUTS = Object.freeze([
  "beauty_score",
  "attractiveness_score",
  "body_ranking",
  "ideal_body_ranking",
  "shame_based_label",
  "normal_versus_abnormal_judgment",
  "medical_diagnosis",
  "guaranteed_result",
  "social_desirability_score",
] as const);

export function createDefaultMedicationEffects(): MedicationWeightEffectProfile {
  return {
    medicationMayAffectWeight: false,
    appetite: "no_effect",
    energyLevel: "no_effect",
    metabolismTendency: "no_effect",
    muscleBuildingOrPreservation: "no_effect",
    evidence: {
      origin: "user_declared",
      confidence: "not_applicable",
      notes: [],
    },
  };
}

export function createReservedBodyAnalysisStub(): BodyAnalysisResultStub {
  return {
    schemaVersion: 1,
    status: "not_run",
    observations: [],
    confidence: "not_applicable",
    confidenceReasons: [],
    limitations: [
      "Body Analysis is optional in Body Simulator v1 and is not executed.",
    ],
  };
}
