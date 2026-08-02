/**
 * ValidationEvidence — typed, provider-neutral evidence for ResultValidator.
 *
 * Foundation only: no image bytes, Base64, URLs, secrets, or vision calls.
 * Real image-analysis adapters may populate this contract later.
 */

export const VALIDATION_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type ValidationDimension =
  | "identity"
  | "anatomy"
  | "plan_adherence"
  | "photorealism"
  | "pose_camera"
  | "safety";

export type EvidenceSource =
  | "deterministic_fixture"
  | "human_review"
  | "future_vision_adapter";

export type EvidenceConfidence = "low" | "medium" | "high";

export interface DimensionEvidence {
  dimension: ValidationDimension;

  /** Heuristic quality score in [0, 1]. Not a scientific confidence interval. */
  score: number;

  confidence: EvidenceConfidence;

  source: EvidenceSource;

  findings: string[];

  warnings: string[];

  modelVersion?: string;
}

export interface CandidateImageReference {
  /** Opaque, non-sensitive candidate identifier. */
  candidateId: string;

  sourceImageId?: string;

  /** Optional trace metadata only — never a secret or transport payload. */
  provider?: string;

  model?: string;
}

export interface ValidationEvidence {
  schemaVersion: typeof VALIDATION_EVIDENCE_SCHEMA_VERSION;

  candidate: CandidateImageReference;

  dimensions: DimensionEvidence[];

  metadata: {
    validatorInputVersion: string;
    transformationRulesVersion: string;
    renderPlanRulesVersion: string;
  };
}

/** Required dimensions for a complete evidence payload. */
export const REQUIRED_VALIDATION_DIMENSIONS: readonly ValidationDimension[] = [
  "identity",
  "anatomy",
  "plan_adherence",
  "photorealism",
  "pose_camera",
  "safety",
] as const;
