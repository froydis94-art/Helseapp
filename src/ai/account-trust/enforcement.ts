/**
 * Misuse enforcement state machine.
 * Warning-first default; severe/apparently_unlawful → lockdown pending review.
 * No automatic criminal determination, authority contact, or financial penalties.
 */

import type {
  AppealReviewStatus,
  DocumentedLossRecoveryStatus,
  EnforcementRecord,
  EnforcementSeverity,
  EnforcementStatus,
} from "./types";

export const ENFORCEMENT_POLICY_VERSION = "1.0-draft" as const;

export const DEFAULT_ENFORCEMENT_SEQUENCE: ReadonlyArray<EnforcementStatus> =
  Object.freeze([
    "active",
    "warned",
    "temporarily_restricted",
    "permanently_suspended",
  ]);

export interface EnforcementTransitionInput {
  userId: string;
  currentStatus: EnforcementStatus;
  enforcementSeverity: EnforcementSeverity;
  reasonCategory: string;
  recordedAt: string;
  reviewingActorType?: EnforcementRecord["reviewingActorType"];
}

export interface HumanReviewDecision {
  outcome: "restore_active" | "temporarily_restrict" | "permanently_suspend";
  recordedAt: string;
  reviewingActorType: "human_reviewer";
  reasonCategory: string;
}

export function nextStatusForSeverity(
  current: EnforcementStatus,
  level: EnforcementSeverity
): EnforcementStatus {
  if (level === "severe" || level === "apparently_unlawful") {
    if (current === "permanently_suspended") return "permanently_suspended";
    return "locked_pending_review";
  }

  if (current === "permanently_suspended") return "permanently_suspended";
  if (current === "locked_pending_review") return "locked_pending_review";

  if (level === "repeated") {
    if (current === "active" || current === "warned") {
      return "temporarily_restricted";
    }
    if (current === "temporarily_restricted") {
      return "permanently_suspended";
    }
  }

  if (current === "active") return "warned";
  if (current === "warned") return "temporarily_restricted";
  if (current === "temporarily_restricted") return "permanently_suspended";
  return current;
}

export function applyEnforcementTransition(
  input: EnforcementTransitionInput
): EnforcementRecord {
  const next = nextStatusForSeverity(
    input.currentStatus,
    input.enforcementSeverity
  );
  const appeal: AppealReviewStatus =
    next === "locked_pending_review" ||
    next === "permanently_suspended" ||
    next === "temporarily_restricted"
      ? "pending_review"
      : "none";
  return {
    schemaVersion: 1,
    userId: input.userId,
    status: next,
    enforcementSeverity: input.enforcementSeverity,
    reasonCategory: input.reasonCategory,
    policyVersion: ENFORCEMENT_POLICY_VERSION,
    recordedAt: input.recordedAt,
    reviewingActorType: input.reviewingActorType ?? "system",
    appealStatus: appeal,
    documentedLossRecoveryStatus: "not_applicable",
  };
}

export function applyHumanReview(
  locked: EnforcementRecord,
  decision: HumanReviewDecision
): EnforcementRecord {
  if (locked.status !== "locked_pending_review") {
    throw new Error("Human review applies only from locked_pending_review.");
  }

  let status: EnforcementStatus;
  let appealStatus: AppealReviewStatus;
  if (decision.outcome === "restore_active") {
    status = "active";
    appealStatus = "resolved_restored";
  } else if (decision.outcome === "temporarily_restrict") {
    status = "temporarily_restricted";
    appealStatus = "resolved_restricted";
  } else {
    status = "permanently_suspended";
    appealStatus = "resolved_suspended";
  }

  return {
    schemaVersion: locked.schemaVersion,
    userId: locked.userId,
    status,
    enforcementSeverity: locked.enforcementSeverity,
    reasonCategory: decision.reasonCategory,
    policyVersion: locked.policyVersion,
    recordedAt: decision.recordedAt,
    reviewingActorType: decision.reviewingActorType,
    appealStatus,
    documentedLossRecoveryStatus: "legal_review_required",
  };
}

export function allowsAiGeneration(status: EnforcementStatus): boolean {
  return status === "active" || status === "warned";
}

export function automaticCriminalDeterminationExists(): false {
  return false;
}

export function automaticAuthorityReportingExists(): false {
  return false;
}

export function automaticFinancialPenaltyExists(): false {
  return false;
}

export function defaultDocumentedLossRecoveryStatus(): DocumentedLossRecoveryStatus {
  return "not_applicable";
}

export function refundCopyPreservesApplicableLaw(): string {
  return "Refund eligibility following suspension is determined under the subscription terms and applicable consumer law.";
}
