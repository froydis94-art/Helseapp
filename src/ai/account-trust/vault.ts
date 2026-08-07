/**
 * Private Progress Vault contracts — disabled without approved private storage.
 * Never persist images to local disk, public/, or browser storage from this module.
 */

import { AI_VISUALIZATION_DISCLAIMER_VERSION } from "./agreements";
import type {
  DeletionState,
  PersonalProgressImage,
  ProgressComparisonReservation,
  SensitiveConsentWithdrawalMode,
  VaultPostGenerationChoice,
} from "./types";

export const DEFAULT_POST_GENERATION_CHOICE: VaultPostGenerationChoice =
  "discard";

export const VAULT_STORAGE_STATUS = "blocked_pending_approved_private_storage" as const;

export const PROGRESS_COMPARISON_RESERVATION: ProgressComparisonReservation =
  Object.freeze({
    schemaVersion: 1 as const,
    status: "reserved_not_implemented" as const,
    supports: Object.freeze({
      twoImageCompare: true as const,
      captureDates: true as const,
      scenarioId: true as const,
      safeTransformationMetadata: true as const,
      userNotes: true as const,
      bodyScoring: false as const,
      medicalAssessment: false as const,
      publicShare: false as const,
      groupShare: false as const,
    }),
  });

export const VAULT_SECURITY_REQUIREMENTS = Object.freeze({
  privateByDefault: true,
  ownerScopedAuthorization: true,
  noPredictablePublicObjectUrl: true,
  shortLivedSignedAccessUrlWhenRequired: true,
  encryptionInTransit: true,
  encryptionAtRestSupportedByPlatform: true,
  noSourceImageInApplicationLogs: true,
  noGeneratedImageBinaryInAnalytics: true,
  noCrossUserAccess: true,
  noGroupAccess: true,
  noEmployeeAccessExceptDocumentedNeed: true,
  accessEventsAuditableWherePermitted: true,
  accountDeletionSchedulesPrivateImageDeletion: true,
  userCanDeleteIndividualImage: true,
  userCanExportOwnTimeline: true,
  noModelTrainingReuse: true,
  noAdvertisingUse: true,
  noFacialRecognitionIdentificationUse: true,
  noLocalFilesystemPersistenceOnVercel: true,
  noPublicDirectoryStorage: true,
  noBrowserPersistentImageStorage: true,
});

export function getDefaultPostGenerationChoice(): VaultPostGenerationChoice {
  return DEFAULT_POST_GENERATION_CHOICE;
}

export function isSaveOptIn(choice: VaultPostGenerationChoice): boolean {
  return choice === "save_privately";
}

export function isApprovedPrivateStorageAvailable(): false {
  return false;
}

export function isVaultPersistenceEnabled(): false {
  return false;
}

export function rejectPublicObjectUrl(url: string): {
  rejected: true;
  reason: "public_object_url_not_allowed";
} {
  void url;
  return { rejected: true, reason: "public_object_url_not_allowed" };
}

export function authorizeVaultOwnerAccess(input: {
  ownerUserId: string;
  requestingUserId: string;
}): { allowed: boolean; reason?: string } {
  if (input.ownerUserId !== input.requestingUserId) {
    return { allowed: false, reason: "cross_user_access_rejected" };
  }
  return { allowed: true };
}

export function createProgressImageMetadata(input: {
  imageId: string;
  ownerUserId: string;
  createdAt: string;
  source: PersonalProgressImage["source"];
  scenarioId: string | null;
  timelineDate: string;
  privateStorageKey: string;
  mimeType: PersonalProgressImage["mimeType"];
  byteLength: number;
  aiGenerated: boolean;
  transformationMetadataId: string | null;
}): PersonalProgressImage {
  if (/^https?:\/\//i.test(input.privateStorageKey)) {
    throw new Error("Public object URLs are not allowed as privateStorageKey.");
  }
  return {
    schemaVersion: 1,
    imageId: input.imageId,
    ownerUserId: input.ownerUserId,
    createdAt: input.createdAt,
    source: input.source,
    scenarioId: input.scenarioId,
    timelineDate: input.timelineDate,
    privateStorageKey: input.privateStorageKey,
    mimeType: input.mimeType,
    byteLength: input.byteLength,
    aiGenerated: input.aiGenerated,
    disclaimerVersion: AI_VISUALIZATION_DISCLAIMER_VERSION,
    transformationMetadataId: input.transformationMetadataId,
    deletedAt: null,
  };
}

export function evaluateVaultSaveRequest(input: {
  choice: VaultPostGenerationChoice;
  sensitiveDataConsentActive: boolean;
  storageAvailable: boolean;
  consentWithdrawnForFuture: boolean;
}): {
  allowed: boolean;
  code:
    | "ok_discard"
    | "ok_save"
    | "default_discard"
    | "consent_required"
    | "storage_unavailable"
    | "consent_withdrawn"
    | "save_not_selected";
} {
  if (input.choice === "discard") {
    return { allowed: true, code: "ok_discard" };
  }
  if (input.consentWithdrawnForFuture) {
    return { allowed: false, code: "consent_withdrawn" };
  }
  if (!input.sensitiveDataConsentActive) {
    return { allowed: false, code: "consent_required" };
  }
  if (!input.storageAvailable) {
    return { allowed: false, code: "storage_unavailable" };
  }
  if (!isSaveOptIn(input.choice)) {
    return { allowed: false, code: "save_not_selected" };
  }
  return { allowed: true, code: "ok_save" };
}

export function markImageDeleted(
  image: PersonalProgressImage,
  requestingUserId: string,
  deletedAt: string
): PersonalProgressImage {
  const auth = authorizeVaultOwnerAccess({
    ownerUserId: image.ownerUserId,
    requestingUserId,
  });
  if (!auth.allowed) {
    throw new Error("Image deletion requires owner authorization.");
  }
  return { ...image, deletedAt };
}

export function scheduleVaultDeletionOnAccountClosure(): DeletionState {
  return "scheduled";
}

export function applySensitiveConsentWithdrawal(input: {
  mode: SensitiveConsentWithdrawalMode;
}): {
  blockNewVaultSaves: true;
  deleteExistingImages: boolean;
  informUserRequired: true;
} {
  return {
    blockNewVaultSaves: true,
    deleteExistingImages: input.mode === "withdraw_and_delete_vault",
    informUserRequired: true,
  };
}

export function modelTrainingReuseEnabled(): false {
  return false;
}

export function browserPersistentImageStorageAllowed(): false {
  return false;
}

export function sourceImageMayAppearInLogs(): false {
  return false;
}

export function generatedImageMayAppearInAnalytics(): false {
  return false;
}

export function getProgressComparisonReservation(): ProgressComparisonReservation {
  return PROGRESS_COMPARISON_RESERVATION;
}

export type AccountDeletionOffer = {
  accountClosure: true;
  agreementRecordRetentionOnlyWhereLegallyNecessary: true;
  deletePrivateVaultContent: true;
  deleteOrAnonymizeOptionalProgressData: true;
  cancellationDelegatedToSubscriptionRules: true;
  claimImmediateProviderBackupDeletion: false;
  deletionStates: ReadonlyArray<DeletionState>;
};

export function getAccountDeletionOffer(): AccountDeletionOffer {
  return {
    accountClosure: true,
    agreementRecordRetentionOnlyWhereLegallyNecessary: true,
    deletePrivateVaultContent: true,
    deleteOrAnonymizeOptionalProgressData: true,
    cancellationDelegatedToSubscriptionRules: true,
    claimImmediateProviderBackupDeletion: false,
    deletionStates: [
      "requested",
      "scheduled",
      "completed",
      "partially_retained_for_legal_obligation",
    ],
  };
}
