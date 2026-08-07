/**
 * Personal Progress Library — domain collection over the Private Progress Vault.
 *
 * Library = user-facing/domain collection (photos, AI visuals, future measurements…).
 * Vault = secure storage and authorization layer underneath.
 * Timeline = reserved future chronological UI (not implemented here).
 *
 * Patch 019A: contracts and naming only — no persistence activation.
 */

import type { PersonalProgressImage } from "./types";
import { isApprovedPrivateStorageAvailable } from "./vault";

export const PERSONAL_PROGRESS_LIBRARY_SCHEMA_VERSION = 1 as const;

export type PersonalProgressItemType =
  | "progress_photo"
  | "ai_future_visualization"
  | "measurement_record"
  | "body_analysis_report"
  | "user_note"
  | "reserved_future_item";

export interface PersonalProgressLibraryItem {
  schemaVersion: typeof PERSONAL_PROGRESS_LIBRARY_SCHEMA_VERSION;

  itemId: string;
  /** Server-resolved owner — never trust browser-supplied userId. */
  ownerUserId: string;

  itemType: PersonalProgressItemType;

  createdAt: string;
  effectiveDate: string;

  title: string | null;
  userNote: string | null;

  privacy: {
    visibility: "private_owner_only";
    shareable: false;
    groupAccessible: false;
    coachAccessible: false;
  };

  storage: {
    persisted: boolean;
    privateStorageKey: string | null;
    mimeType: "image/jpeg" | "image/png" | "image/webp" | null;
    byteLength: number | null;
  };

  provenance: {
    source:
      | "user_upload"
      | "ai_generated"
      | "user_entered"
      | "system_generated";
    scenarioId: string | null;
    transformationMetadataId: string | null;
    disclaimerVersion: string | null;
  };

  lifecycle: {
    deletedAt: string | null;
    deletionStatus: "active" | "requested" | "scheduled" | "completed";
  };
}

export interface PersonalProgressLibraryCapabilities {
  saveProgressPhoto: boolean;
  saveAiVisualization: boolean;
  saveMeasurementRecord: boolean;
  saveBodyAnalysisReport: boolean;
  saveUserNote: boolean;

  compareImages: false;
  timelineUi: false;
  sharing: false;
  groupAccess: false;
  coachAccess: false;
}

/**
 * Reserved query shape for Demand 021 Timeline — no implementation, no side effects.
 */
export interface PersonalProgressTimelineQuery {
  /** Server-derived; never authoritative from the browser. */
  ownerUserId: string;
  itemTypes: PersonalProgressItemType[];
  fromDate: string | null;
  toDate: string | null;
  limit: number;
  cursor: string | null;
}

/**
 * Reserved export request — no processing, archives, or private URLs in this patch.
 */
export interface PersonalProgressDataExportRequest {
  requestedByUserId: string;
  scope:
    | "library_metadata"
    | "library_images"
    | "agreements"
    | "complete_account_export";
  requestedAt: string;
}

export const LIBRARY_SAVE_LABEL =
  "Save privately to my Personal Progress Library" as const;

export const LIBRARY_DISCARD_LABEL = "Discard after this session" as const;

function mapImageSourceToItemType(
  source: PersonalProgressImage["source"]
): Extract<
  PersonalProgressItemType,
  "progress_photo" | "ai_future_visualization"
> {
  if (source === "user_progress_photo") {
    return "progress_photo";
  }
  return "ai_future_visualization";
}

function mapImageSourceToProvenance(
  source: PersonalProgressImage["source"]
): PersonalProgressLibraryItem["provenance"]["source"] {
  if (source === "user_progress_photo") {
    return "user_upload";
  }
  return "ai_generated";
}

/**
 * Deterministic adapter: Demand 019 PersonalProgressImage → Library item.
 * No database migration is implied — foundation contracts only.
 */
export function toPersonalProgressLibraryItem(
  image: PersonalProgressImage
): PersonalProgressLibraryItem {
  return {
    schemaVersion: PERSONAL_PROGRESS_LIBRARY_SCHEMA_VERSION,
    itemId: image.imageId,
    ownerUserId: image.ownerUserId,
    itemType: mapImageSourceToItemType(image.source),
    createdAt: image.createdAt,
    effectiveDate: image.timelineDate,
    title: null,
    userNote: null,
    privacy: {
      visibility: "private_owner_only",
      shareable: false,
      groupAccessible: false,
      coachAccessible: false,
    },
    storage: {
      persisted: image.deletedAt === null,
      privateStorageKey: image.privateStorageKey,
      mimeType: image.mimeType,
      byteLength: image.byteLength,
    },
    provenance: {
      source: mapImageSourceToProvenance(image.source),
      scenarioId: image.scenarioId,
      transformationMetadataId: image.transformationMetadataId,
      disclaimerVersion: image.disclaimerVersion,
    },
    lifecycle: {
      deletedAt: image.deletedAt,
      deletionStatus: image.deletedAt === null ? "active" : "completed",
    },
  };
}

/**
 * Saving capabilities require approved private storage.
 * Comparison / Timeline / sharing / group / coach stay false in this foundation.
 */
export function getPersonalProgressLibraryCapabilities(): PersonalProgressLibraryCapabilities {
  const storageOk = isApprovedPrivateStorageAvailable();
  return {
    saveProgressPhoto: storageOk,
    saveAiVisualization: storageOk,
    saveMeasurementRecord: false,
    saveBodyAnalysisReport: false,
    saveUserNote: false,
    compareImages: false,
    timelineUi: false,
    sharing: false,
    groupAccess: false,
    coachAccess: false,
  };
}

/** Contract-only: Timeline is reserved — calling this performs no I/O. */
export function isPersonalProgressTimelineImplemented(): false {
  return false;
}

/** Contract-only: export processing is reserved — calling this performs no I/O. */
export function isPersonalProgressDataExportImplemented(): false {
  return false;
}

export function libraryItemRejectsBrowserOwnerAuthority(): true {
  return true;
}

export function libraryMetadataMayContainDataUri(): false {
  return false;
}

export function libraryMetadataMayContainProviderToken(): false {
  return false;
}

export function libraryContractIncludesPublicObjectUrl(): false {
  return false;
}
