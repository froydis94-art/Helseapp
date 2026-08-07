/**
 * Body-analysis foundation types (Demand 021).
 * Owner-approved future directions — contracts only, no analysis.
 */

/** Confidence for any reserved body-analysis observation or estimate. */
export type BodyAnalysisConfidence =
  | "high"
  | "medium"
  | "low"
  | "not_applicable";

/**
 * Structured, machine-readable confidence reasons.
 * Non-judgmental; missing evidence lowers confidence rather than fabricating values.
 */
export type BodyAnalysisConfidenceReason =
  | "whole_body_visible"
  | "front_view_available"
  | "side_view_available"
  | "back_view_available"
  | "even_lighting"
  | "known_camera_view"
  | "feet_outside_frame"
  | "strong_backlight"
  | "body_region_occluded"
  | "single_view_only";

export const ALLOWED_CONFIDENCE_REASONS: readonly BodyAnalysisConfidenceReason[] =
  Object.freeze([
    "whole_body_visible",
    "front_view_available",
    "side_view_available",
    "back_view_available",
    "even_lighting",
    "known_camera_view",
    "feet_outside_frame",
    "strong_backlight",
    "body_region_occluded",
    "single_view_only",
  ]);

/**
 * Reserved technical observation of a progress photo.
 * No vision request is performed in Demand 021.
 */
export interface BodyImageTechnicalObservation {
  status: "not_run" | "reserved_not_implemented";
  notes: string[];
}

/**
 * Reserved per-region observation — provenance required when populated later.
 */
export interface BodyRegionObservation {
  regionId: string;
  observation: string | null;
  confidence: BodyAnalysisConfidence;
  confidenceReasons: string[];
  /** Contract path or logical source id — never a filesystem path. */
  provenance: string;
  view: "front" | "side" | "back" | "unknown";
}

/**
 * Per-view evidence envelope — views must not silently merge.
 */
export interface BodyAnalysisEvidence {
  schemaVersion: 1;
  view: "front" | "side" | "back" | "unknown";
  sourceIds: string[];
  confidence: BodyAnalysisConfidence;
  confidenceReasons: string[];
  notes: string[];
}

export function createEmptyBodyAnalysisEvidence(
  view: BodyAnalysisEvidence["view"] = "unknown"
): BodyAnalysisEvidence {
  return {
    schemaVersion: 1,
    view,
    sourceIds: [],
    confidence: "not_applicable",
    confidenceReasons: [],
    notes: ["Body analysis evidence is reserved but not implemented."],
  };
}

export type BodyCompositionValueOrigin =
  | "user_estimate"
  | "device_measurement"
  | "professional_measurement"
  | "future_model_estimate"
  | "unknown";

/**
 * Primary purpose of Body Analysis (permanent product rule).
 */
export const BODY_ANALYSIS_PRIMARY_PURPOSE =
  "The primary purpose of Body Analysis is to improve realistic body simulation and longitudinal progress tracking." as const;

export const BODY_ANALYSIS_MAY_SUPPORT = Object.freeze([
  "better TransformationPlan inputs",
  "better body-region planning",
  "better identity and proportion preservation",
  "more consistent comparisons over time",
  "confidence-aware simulation decisions",
] as const);

/** Forbidden human-value / ranking outputs. */
export const BODY_ANALYSIS_FORBIDDEN_OUTPUTS = Object.freeze([
  "beauty_score",
  "attractiveness_score",
  "body_ranking",
  "ideal_body_ranking",
  "shame_based_label",
  "normal_versus_abnormal_judgment",
  "value_judgment_height_weight_shape",
  "competitive_user_ranking",
] as const);

export function bodyAnalysisProducesBeautyScores(): false {
  return false;
}

export function bodyAnalysisProducesBodyRankings(): false {
  return false;
}

export function bodyAnalysisProducesIdealBodyJudgments(): false {
  return false;
}

export function isAllowedConfidenceReason(reason: string): boolean {
  return (ALLOWED_CONFIDENCE_REASONS as readonly string[]).includes(reason);
}
