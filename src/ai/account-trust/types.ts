/**
 * Personal Account Trust domain contracts (Demand 019).
 *
 * Foundation only — no production enforcement without real auth + persistence.
 * Never store identity-document images, national IDs, or verification secrets.
 */

export const ACCOUNT_TRUST_SCHEMA_VERSION = 1 as const;
export const MINIMUM_ACCOUNT_AGE = 18 as const;

export type AccountPackage =
  | "personal"
  | "couple_reserved"
  | "family_reserved"
  | "friends_challenge_reserved"
  | "coach_reserved"
  | "group_reserved";

export type LegalReviewStatus =
  | "draft_requires_legal_review"
  | "approved_for_release";

export type AgreementId =
  | "terms_of_service"
  | "privacy_notice"
  | "responsible_ai_use"
  | "sensitive_data_consent";

export interface AgreementVersion {
  agreementId: AgreementId;
  version: string;
  effectiveAt: string | null;
  lastUpdated: string;
  legalReviewStatus: LegalReviewStatus;
  required: boolean;
  summary: string;
  fullDraft: string;
}

export interface AgreementAcceptance {
  userId: string;
  agreementId: AgreementId;
  version: string;
  acceptedAt: string;
  withdrawnAt: string | null;
  evidence: {
    method: "explicit_action";
    locale: string;
  };
}

export type AdulthoodBasis =
  | "identity_provider_verified"
  | "account_attestation"
  | "not_verified";

export interface PersonalAccountTrustState {
  schemaVersion: typeof ACCOUNT_TRUST_SCHEMA_VERSION;
  userId: string;
  package: "personal";
  minimumAgeRequirement: typeof MINIMUM_ACCOUNT_AGE;
  adulthoodBasis: AdulthoodBasis;
  personalAccountConfirmed: boolean;
  requiredAgreementsCurrent: boolean;
  sensitiveDataConsentActive: boolean;
  aiGenerationAllowed: boolean;
  privateVaultAllowed: boolean;
}

export type EnforcementStatus =
  | "active"
  | "warned"
  | "temporarily_restricted"
  | "locked_pending_review"
  | "permanently_suspended";

export type EnforcementSeverity =
  | "minor"
  | "repeated"
  | "severe"
  | "apparently_unlawful";

export type DocumentedLossRecoveryStatus =
  | "not_applicable"
  | "legal_review_required"
  | "externally_handled";

export type AppealReviewStatus =
  | "none"
  | "pending_review"
  | "under_human_review"
  | "resolved_restored"
  | "resolved_restricted"
  | "resolved_suspended";

export interface EnforcementRecord {
  schemaVersion: 1;
  userId: string;
  status: EnforcementStatus;
  enforcementSeverity: EnforcementSeverity;
  reasonCategory: string;
  policyVersion: string;
  recordedAt: string;
  reviewingActorType: "system" | "human_reviewer" | "none";
  appealStatus: AppealReviewStatus;
  documentedLossRecoveryStatus: DocumentedLossRecoveryStatus;
  /** Never store explicit image content or reporter identity. */
  notesSafeSummary?: string;
}

export type DeletionState =
  | "requested"
  | "scheduled"
  | "completed"
  | "partially_retained_for_legal_obligation";

export type ProgressImageSource =
  | "ai_generated_progress_visualization"
  | "user_progress_photo";

export interface PersonalProgressImage {
  schemaVersion: 1;
  imageId: string;
  ownerUserId: string;
  createdAt: string;
  source: ProgressImageSource;
  scenarioId: string | null;
  timelineDate: string;
  privateStorageKey: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  byteLength: number;
  aiGenerated: boolean;
  disclaimerVersion: string;
  transformationMetadataId: string | null;
  deletedAt: string | null;
}

export type VaultPostGenerationChoice = "discard" | "save_privately";

export type SensitiveConsentWithdrawalMode =
  | "future_processing_only"
  | "withdraw_and_delete_vault";

export interface ProgressComparisonReservation {
  schemaVersion: 1;
  status: "reserved_not_implemented";
  supports: {
    twoImageCompare: true;
    captureDates: true;
    scenarioId: true;
    safeTransformationMetadata: true;
    userNotes: true;
    bodyScoring: false;
    medicalAssessment: false;
    publicShare: false;
    groupShare: false;
  };
}

/** Server-resolved session identity — never accept browser-supplied userId. */
export interface TrustedSessionIdentity {
  userId: string;
  source: "authenticated_server_session";
  package: AccountPackage;
}

export interface IdentityVerificationResult {
  verified: boolean;
  adulthoodBasis: "identity_provider_verified" | "not_verified";
  providerName: string;
  verifiedAt: string | null;
}

/**
 * Reserved interface — no BankID or other provider is integrated in Demand 019.
 */
export interface IdentityVerificationProvider {
  readonly name: string;
  verifyAdultIdentity(
    session: TrustedSessionIdentity
  ): Promise<IdentityVerificationResult>;
}
