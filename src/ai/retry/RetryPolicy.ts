/**
 * Retry policy — transport retryability and adjustment allowlist.
 *
 * Retry may never escalate physiology or introduce increase_visual_emphasis.
 */

import type { ReplicateTransportErrorCode } from "../transport/ReplicateTransportTypes";
import type { ReplicateTransportFailure } from "../transport/ReplicateTransportTypes";
import type { RetryAdjustment } from "../validation-result/ValidationDecision";

/** HelseApp-approved retryable transport error codes. */
export const RETRYABLE_TRANSPORT_CODES: readonly ReplicateTransportErrorCode[] = [
  "request_aborted",
  "request_timeout",
  "provider_rate_limited",
  "provider_unavailable",
  "polling_exhausted",
] as const;

/** Explicitly non-retryable in this foundation. */
export const NON_RETRYABLE_TRANSPORT_CODES: readonly ReplicateTransportErrorCode[] =
  [
    "adapter_disabled",
    "missing_token",
    "invalid_request",
    "unsupported_source_image",
    "provider_auth_error",
    "provider_validation_error",
    "invalid_provider_response",
    "provider_failed",
    "unknown_transport_error",
  ] as const;

/** Adjustments this foundation may approve. */
export const APPROVED_RETRY_ADJUSTMENTS: readonly RetryAdjustment[] = [
  "strengthen_identity_preservation",
  "strengthen_anatomy_constraints",
  "strengthen_plan_adherence",
  "strengthen_pose_camera_preservation",
  "strengthen_photorealism",
  "reduce_visual_emphasis",
] as const;

/** Deferred — available on the type, rejected by this foundation. */
export const DEFERRED_RETRY_ADJUSTMENTS: readonly RetryAdjustment[] = [
  "switch_provider",
  "switch_model_tier",
] as const;

const APPROVED_SET = new Set<string>(APPROVED_RETRY_ADJUSTMENTS);
const DEFERRED_SET = new Set<string>(DEFERRED_RETRY_ADJUSTMENTS);

const RETRYABLE_SET = new Set<ReplicateTransportErrorCode>(
  RETRYABLE_TRANSPORT_CODES
);

/**
 * Requires both HelseApp policy membership and the transport retryable flag.
 * A provider flag alone must not override policy.
 */
export function isRetryableTransportFailure(
  result: ReplicateTransportFailure
): boolean {
  return (
    RETRYABLE_SET.has(result.error.code) && result.error.retryable === true
  );
}

export function isApprovedRetryAdjustment(
  adjustment: string
): adjustment is RetryAdjustment {
  return APPROVED_SET.has(adjustment);
}

export function isDeferredRetryAdjustment(adjustment: string): boolean {
  return DEFERRED_SET.has(adjustment);
}

/**
 * Validate and normalize retry adjustments.
 * Stable order, no duplicates, unsupported rejected with errors (never silent).
 */
export function validateRetryAdjustments(adjustments: RetryAdjustment[]): {
  valid: boolean;
  approved: RetryAdjustment[];
  rejected: RetryAdjustment[];
  errors: string[];
} {
  const errors: string[] = [];
  const rejected: RetryAdjustment[] = [];
  const seen = new Set<RetryAdjustment>();
  const approvedUnordered: RetryAdjustment[] = [];

  if (!Array.isArray(adjustments)) {
    return {
      valid: false,
      approved: [],
      rejected: [],
      errors: ["adjustments must be an array"],
    };
  }

  for (const raw of adjustments) {
    if (typeof raw !== "string") {
      errors.push("adjustment must be a string");
      continue;
    }
    if (DEFERRED_SET.has(raw)) {
      rejected.push(raw as RetryAdjustment);
      errors.push(`unsupported adjustment: ${raw}`);
      continue;
    }
    if (!APPROVED_SET.has(raw)) {
      rejected.push(raw as RetryAdjustment);
      errors.push(`unsupported adjustment: ${raw}`);
      continue;
    }
    const adj = raw as RetryAdjustment;
    if (seen.has(adj)) {
      errors.push(`duplicate adjustment: ${adj}`);
      continue;
    }
    seen.add(adj);
    approvedUnordered.push(adj);
  }

  const approved = APPROVED_RETRY_ADJUSTMENTS.filter((a) =>
    approvedUnordered.includes(a)
  );

  // Duplicates are reported but do not invalidate — approved output is deduped.
  return {
    valid: rejected.length === 0,
    approved,
    rejected,
    errors,
  };
}

/** Merge existing + newly approved adjustments with stable allowlist order. */
export function mergeAppliedAdjustments(
  existing: readonly RetryAdjustment[],
  newlyApproved: readonly RetryAdjustment[]
): RetryAdjustment[] {
  const set = new Set<RetryAdjustment>();
  for (const a of existing) {
    if (APPROVED_SET.has(a)) set.add(a);
  }
  for (const a of newlyApproved) {
    if (APPROVED_SET.has(a)) set.add(a);
  }
  return APPROVED_RETRY_ADJUSTMENTS.filter((a) => set.has(a));
}
