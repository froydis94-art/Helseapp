/**
 * Versioned agreement catalog and acceptance/withdrawal state machine.
 * All user-facing legal drafts require counsel review before public launch.
 */

import type {
  AgreementAcceptance,
  AgreementId,
  AgreementVersion,
  LegalReviewStatus,
} from "./types";

export const AI_VISUALIZATION_DISCLAIMER_VERSION = "1.0-draft" as const;

export const AI_VISUALIZATION_DISCLAIMER =
  "AI-generated images are expected future visualizations based on the information and scenario provided. They are not medical predictions, guaranteed outcomes or promises of actual results.";

export const LEGAL_REVIEW_BADGE_LABEL =
  "Draft — requires legal review" as const;

const DRAFT_STATUS: LegalReviewStatus = "draft_requires_legal_review";

const DRAFT_LAST_UPDATED = "2026-08-07";

/** Immutable catalog snapshot. New text requires a new version entry. */
const AGREEMENT_CATALOG: ReadonlyArray<AgreementVersion> = Object.freeze([
  Object.freeze({
    agreementId: "terms_of_service" as const,
    version: "1.0-draft",
    effectiveAt: null,
    lastUpdated: DRAFT_LAST_UPDATED,
    legalReviewStatus: DRAFT_STATUS,
    required: true,
    summary:
      "Contractual rules for using a Personal HelseApp account, to the extent permitted by applicable law.",
    fullDraft: [
      "HelseApp Terms of Service (draft)",
      "",
      "This draft describes contractual account use for a Personal account.",
      "It is not final legal advice and is not approved for public launch.",
      "",
      "Account use is personal. Accounts must not be shared.",
      "Uploaders are responsible for having the necessary rights to submitted images.",
      "Service availability and remedies are subject to applicable consumer law.",
      "Refund eligibility following suspension is determined under the subscription terms and applicable consumer law.",
      "Nothing in this draft removes statutory consumer rights where they apply.",
      "HelseApp remains responsible for providing the service with reasonable care, to the extent required by applicable law.",
    ].join("\n"),
  }),
  Object.freeze({
    agreementId: "privacy_notice" as const,
    version: "1.0-draft",
    effectiveAt: null,
    lastUpdated: DRAFT_LAST_UPDATED,
    legalReviewStatus: DRAFT_STATUS,
    required: true,
    summary:
      "Acknowledgement that you have received the Privacy Notice. This is not consent to every processing operation.",
    fullDraft: [
      "HelseApp Privacy Notice acknowledgement (draft)",
      "",
      "By acknowledging this notice you confirm receipt of privacy information",
      "about how HelseApp may process account and progress data.",
      "This acknowledgement is not consent for every processing activity.",
      "Optional sensitive-data processing requires a separate consent.",
      "Final privacy wording requires Norwegian/EU counsel review before launch.",
    ].join("\n"),
  }),
  Object.freeze({
    agreementId: "responsible_ai_use" as const,
    version: "1.0-draft",
    effectiveAt: null,
    lastUpdated: DRAFT_LAST_UPDATED,
    legalReviewStatus: DRAFT_STATUS,
    required: true,
    summary:
      "Responsible AI use rules for a Personal account, including misuse measures that may apply.",
    fullDraft: [
      "HelseApp Responsible AI Use Agreement (draft)",
      "",
      "Personal account:",
      "This account is personal and may only be used by its registered account holder.",
      "",
      "Image rights:",
      "I will upload only images of myself, or content I am legally entitled and authorized to use.",
      "",
      "Lawful use:",
      "I am responsible for ensuring that my use complies with applicable law.",
      "",
      "Prohibited misuse:",
      "I will not use HelseApp to create unlawful, non-consensual, exploitative or otherwise prohibited content.",
      "",
      "Account measures:",
      "Misuse may result in a warning, temporary restriction or permanent account suspension. Severe cases may be restricted immediately pending review.",
      "",
      "Refund qualification:",
      "Refund eligibility following suspension is determined under the subscription terms and applicable consumer law.",
      "",
      "Cooperation:",
      "HelseApp may preserve relevant records and cooperate with competent authorities where required or permitted by applicable law.",
      "",
      "Loss caused by intentional misuse:",
      "A user may be responsible for documented losses caused by intentional misuse, to the extent permitted by applicable law.",
    ].join("\n"),
  }),
  Object.freeze({
    agreementId: "sensitive_data_consent" as const,
    version: "1.0-draft",
    effectiveAt: null,
    lastUpdated: DRAFT_LAST_UPDATED,
    legalReviewStatus: DRAFT_STATUS,
    required: false,
    summary:
      "Optional, withdrawable consent for private Vault storage and longitudinal comparison of body progress images.",
    fullDraft: [
      "HelseApp Sensitive Data Consent (draft)",
      "",
      "This separate consent covers optional storage and longitudinal comparison",
      "of body images and related sensitive progress data in your Personal Progress Vault.",
      "It is not part of the Terms of Service.",
      "Consent is explicit, opt-in, and as easy to withdraw as it is to grant.",
      "Withdrawal may block future Vault saves; deleting existing images is a separate informed choice.",
      "No model-training reuse occurs without a future separate optional consent.",
      "Final wording requires Norwegian/EU counsel review before public launch.",
    ].join("\n"),
  }),
]);

/** Frozen catalog — treat as immutable after publication of a version. */
export function getAgreementCatalog(): ReadonlyArray<AgreementVersion> {
  return AGREEMENT_CATALOG;
}

export function getAgreementVersion(
  agreementId: AgreementId,
  version?: string
): AgreementVersion | undefined {
  if (version != null) {
    return AGREEMENT_CATALOG.find(
      (a) => a.agreementId === agreementId && a.version === version
    );
  }
  const matches = AGREEMENT_CATALOG.filter((a) => a.agreementId === agreementId);
  return matches[matches.length - 1];
}

export function listRequiredAgreementIds(): AgreementId[] {
  return AGREEMENT_CATALOG.filter((a) => a.required).map((a) => a.agreementId);
}

export function isAgreementPreChecked(): false {
  return false;
}

export function createExplicitAcceptance(input: {
  userId: string;
  agreementId: AgreementId;
  version: string;
  acceptedAt: string;
  locale: string;
  explicitAction: boolean;
}): AgreementAcceptance {
  if (!input.explicitAction) {
    throw new Error("Acceptance requires explicit_action.");
  }
  if (!input.userId || !input.acceptedAt || !input.locale) {
    throw new Error("Acceptance requires userId, acceptedAt, and locale.");
  }
  const version = getAgreementVersion(input.agreementId, input.version);
  if (version == null) {
    throw new Error("Unknown agreement version.");
  }
  return {
    userId: input.userId,
    agreementId: input.agreementId,
    version: input.version,
    acceptedAt: input.acceptedAt,
    withdrawnAt: null,
    evidence: {
      method: "explicit_action",
      locale: input.locale,
    },
  };
}

export function recordWithdrawal(
  acceptance: AgreementAcceptance,
  withdrawnAt: string
): AgreementAcceptance {
  return {
    ...acceptance,
    withdrawnAt,
  };
}

export function isAcceptanceActive(acceptance: AgreementAcceptance): boolean {
  return acceptance.withdrawnAt == null;
}

/**
 * Append-only acceptance history: current if latest non-withdrawn acceptance
 * matches the latest catalog version for each required agreement.
 */
export function areRequiredAgreementsCurrent(
  history: ReadonlyArray<AgreementAcceptance>
): boolean {
  for (const id of listRequiredAgreementIds()) {
    const latest = getAgreementVersion(id);
    if (latest == null) return false;
    const active = [...history]
      .reverse()
      .find((a) => a.agreementId === id && a.withdrawnAt == null);
    if (active == null || active.version !== latest.version) {
      return false;
    }
  }
  return true;
}

export function isSensitiveDataConsentActive(
  history: ReadonlyArray<AgreementAcceptance>
): boolean {
  const latest = getAgreementVersion("sensitive_data_consent");
  if (latest == null) return false;
  const active = [...history]
    .reverse()
    .find(
      (a) =>
        a.agreementId === "sensitive_data_consent" && a.withdrawnAt == null
    );
  return active != null && active.version === latest.version;
}

export function legalReviewBadgeFor(
  status: LegalReviewStatus
): string | null {
  if (status === "draft_requires_legal_review") {
    return LEGAL_REVIEW_BADGE_LABEL;
  }
  return null;
}

export function agreementPresentationLayers(agreement: AgreementVersion): {
  summary: string;
  fullDraft: string;
  version: string;
  lastUpdated: string;
  legalReviewBadge: string | null;
  preChecked: false;
} {
  return {
    summary: agreement.summary,
    fullDraft: agreement.fullDraft,
    version: agreement.version,
    lastUpdated: agreement.lastUpdated,
    legalReviewBadge: legalReviewBadgeFor(agreement.legalReviewStatus),
    preChecked: false,
  };
}
