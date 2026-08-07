/**
 * Multi-view body analysis — approved future capability (front / side / back).
 * Demand 021: migration-safe contracts only. No capture UI, storage, or vision.
 */

import {
  createEmptyBodyAnalysisEvidence,
  type BodyAnalysisEvidence,
  type BodyImageTechnicalObservation,
  type BodyRegionObservation,
} from "./types";

export type ProgressPhotoView = "front" | "side" | "back";

export const ALL_PROGRESS_PHOTO_VIEWS: readonly ProgressPhotoView[] =
  Object.freeze(["front", "side", "back"]);

export interface MultiViewBodyAnalysisImage {
  view: ProgressPhotoView;
  /** Logical placeholder only — never a browser-authoritative storage key. */
  imageReference: string | null;
  technicalObservation: BodyImageTechnicalObservation | null;
  bodyRegions: BodyRegionObservation[];
  availability: "provided" | "missing" | "not_assessable";
  evidence: BodyAnalysisEvidence;
}

export interface MultiViewBodyAnalysisInput {
  schemaVersion: 1;
  front: MultiViewBodyAnalysisImage | null;
  side: MultiViewBodyAnalysisImage | null;
  back: MultiViewBodyAnalysisImage | null;
}

export interface MultiViewBodyAnalysisReadiness {
  suppliedViews: ProgressPhotoView[];
  missingViews: ProgressPhotoView[];

  /**
   * Architectural capability: single-image analysis remains possible later.
   * Demand 021 does not run analysis.
   */
  singleViewAnalysisPossible: boolean;
  /**
   * Demand 021 does not require or activate multi-view analysis.
   */
  multiViewAnalysisPossible: boolean;

  limitations: string[];
}

export const MULTI_VIEW_BODY_ANALYSIS_ROADMAP_STATUS =
  "approved_future_direction" as const;

export const MULTI_VIEW_BODY_ANALYSIS_ROADMAP_LABEL =
  "Approved future capability — not implemented." as const;

export function createEmptyMultiViewBodyAnalysisInput(): MultiViewBodyAnalysisInput {
  return {
    schemaVersion: 1,
    front: null,
    side: null,
    back: null,
  };
}

export function assessMultiViewBodyAnalysisReadiness(
  input: MultiViewBodyAnalysisInput
): MultiViewBodyAnalysisReadiness {
  const suppliedViews: ProgressPhotoView[] = [];
  for (const view of ALL_PROGRESS_PHOTO_VIEWS) {
    const slot = input[view];
    if (slot != null && slot.availability === "provided") {
      suppliedViews.push(view);
    }
  }
  const missingViews = ALL_PROGRESS_PHOTO_VIEWS.filter(
    (v) => !suppliedViews.includes(v)
  );
  return {
    suppliedViews,
    missingViews: [...missingViews],
    // Architecture allows single-view later; Demand 021 does not execute it.
    singleViewAnalysisPossible: true,
    // Multi-view is not required and not activated in Demand 021.
    multiViewAnalysisPossible: false,
    limitations: [
      "Front / side / back analysis is approved as a future capability but is not implemented.",
      "No vision request is made in Demand 021.",
      "Single-image analysis remains architecturally possible.",
      "Multi-view is not required in Demand 021.",
      "Observations from different views must not be merged without provenance.",
    ],
  };
}

export function isMultiViewBodyAnalysisImplemented(): false {
  return false;
}

export function isMultiViewRequiredInDemand021(): false {
  return false;
}

/**
 * Conflicting per-view observations must not be silently merged.
 * Demand 021 returns separate view bags only.
 */
export function mergeViewObservationsSilentlyAllowed(): false {
  return false;
}

export function keepViewObservationsSeparate(
  views: MultiViewBodyAnalysisImage[]
): ReadonlyArray<MultiViewBodyAnalysisImage> {
  return views.map((v) => ({
    ...v,
    evidence: { ...v.evidence, sourceIds: [...v.evidence.sourceIds] },
    bodyRegions: v.bodyRegions.map((r) => ({ ...r })),
  }));
}

/** Placeholder observation factory — always not_run / empty. */
export function createReservedViewPlaceholder(
  view: ProgressPhotoView
): MultiViewBodyAnalysisImage {
  return {
    view,
    imageReference: null,
    technicalObservation: {
      status: "not_run",
      notes: [
        "Multi-view analysis is approved as a future capability but is not implemented.",
      ],
    },
    bodyRegions: [],
    availability: "missing",
    evidence: createEmptyBodyAnalysisEvidence(view),
  };
}
