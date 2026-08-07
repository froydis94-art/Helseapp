/**
 * Body-analysis reservations (Demand 021 preparation).
 * Owner-approved future directions — contracts only, no analysis.
 */

/** Confidence for any reserved body-analysis observation or estimate. */
export type BodyAnalysisConfidence =
  | "high"
  | "medium"
  | "low"
  | "not_applicable";

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
  /** Contract path or logical source id — never a filesystem path. */
  provenance: string;
}

export type BodyCompositionValueOrigin =
  | "user_estimate"
  | "device_measurement"
  | "professional_measurement"
  | "future_model_estimate"
  | "unknown";
