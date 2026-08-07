/**
 * Visual body-fat estimation — approved future capability, not implemented.
 *
 * Distinct from user_estimate, device_measurement, and professional_measurement.
 * Never treat estimates as measured facts or medical diagnosis.
 */

import type { BodyAnalysisConfidence } from "./types";

export const VISUAL_BODY_FAT_ESTIMATE_SCHEMA_VERSION = 1 as const;

export type VisualBodyFatEstimateStatus =
  | "not_run"
  | "estimated"
  | "insufficient_input"
  | "not_supported";

export interface VisualBodyFatEstimate {
  schemaVersion: typeof VISUAL_BODY_FAT_ESTIMATE_SCHEMA_VERSION;

  status: VisualBodyFatEstimateStatus;

  estimatedPercent: number | null;

  uncertainty: {
    lowerPercent: number | null;
    upperPercent: number | null;
  };

  confidence: BodyAnalysisConfidence;

  confidenceReasons: string[];

  origin: "future_model_estimate" | "unknown";

  evidenceSourceIds: string[];

  modelMetadata: {
    providerId: string | null;
    modelId: string | null;
    modelVersion: string | null;
    calibrationVersion: string | null;
  };

  limitations: string[];
}

export function createDefaultVisualBodyFatEstimate(): VisualBodyFatEstimate {
  return {
    schemaVersion: VISUAL_BODY_FAT_ESTIMATE_SCHEMA_VERSION,
    status: "not_run",
    estimatedPercent: null,
    uncertainty: {
      lowerPercent: null,
      upperPercent: null,
    },
    confidence: "not_applicable",
    confidenceReasons: [],
    origin: "unknown",
    evidenceSourceIds: [],
    modelMetadata: {
      providerId: null,
      modelId: null,
      modelVersion: null,
      calibrationVersion: null,
    },
    limitations: [
      "Visual body-fat estimation is approved as a future capability but is not implemented.",
    ],
  };
}

/** Frozen Demand 021 default snapshot. */
export const DEFAULT_VISUAL_BODY_FAT_ESTIMATE: Readonly<VisualBodyFatEstimate> =
  Object.freeze(createDefaultVisualBodyFatEstimate());

/** Demand 021 does not generate estimates. */
export function isVisualBodyFatEstimationImplemented(): false {
  return false;
}

/**
 * Future rule: never return a single estimate without an uncertainty interval.
 * Demand 021 defaults always satisfy this (all null / not_run).
 */
export function visualBodyFatEstimateHasRequiredUncertaintyShape(
  estimate: VisualBodyFatEstimate
): boolean {
  if (estimate.status !== "estimated") {
    return true;
  }
  return (
    estimate.estimatedPercent != null &&
    estimate.uncertainty.lowerPercent != null &&
    estimate.uncertainty.upperPercent != null
  );
}

export function visualBodyFatEstimateIsMeasurement(): false {
  return false;
}

export const VISUAL_BODY_FAT_ROADMAP_STATUS =
  "approved_future_direction" as const;

export const VISUAL_BODY_FAT_ROADMAP_LABEL =
  "Approved future capability — not implemented." as const;

/** Origins that must stay distinct from visual model estimates. */
export const NON_VISUAL_BODY_FAT_ORIGINS = [
  "user_estimate",
  "device_measurement",
  "professional_measurement",
] as const;
