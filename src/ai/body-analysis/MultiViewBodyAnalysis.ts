/**
 * Multi-view body analysis — approved future direction (front / side / back).
 * Demand 021: migration-safe contracts only. No capture UI, storage, or vision.
 */

import type {
  BodyAnalysisConfidence,
  BodyImageTechnicalObservation,
  BodyRegionObservation,
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

  singleViewAnalysisPossible: boolean;
  multiViewAnalysisPossible: boolean;

  limitations: string[];
}

export const MULTI_VIEW_BODY_ANALYSIS_ROADMAP_STATUS =
  "approved_future_direction" as const;

export const MULTI_VIEW_BODY_ANALYSIS_ROADMAP_LABEL =
  "Approved future direction — not implemented." as const;

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
    singleViewAnalysisPossible: false,
    multiViewAnalysisPossible: false,
    limitations: [
      "Front / side / back analysis is reserved but not implemented.",
      "No vision request is made in Demand 021.",
      "Single-image analysis remains architecturally possible later.",
      "Observations from different views must not be merged without provenance.",
    ],
  };
}

export function isMultiViewBodyAnalysisImplemented(): false {
  return false;
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
      notes: ["Multi-view analysis is reserved but not implemented."],
    },
    bodyRegions: [],
    availability: "missing",
  };
}

export type { BodyAnalysisConfidence };
