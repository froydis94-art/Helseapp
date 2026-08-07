/**
 * Account-trust gate and feature flags.
 * Defaults DISABLED — do not activate production enforcement without real auth.
 * Never trust a browser-supplied userId.
 */

import {
  areRequiredAgreementsCurrent,
  isSensitiveDataConsentActive,
} from "./agreements";
import { allowsAiGeneration } from "./enforcement";
import { isAdulthoodBasisSatisfied } from "./identity";
import { canActivateAccountPackage } from "./packages";
import { isApprovedPrivateStorageAvailable } from "./vault";
import {
  ACCOUNT_TRUST_SCHEMA_VERSION,
  MINIMUM_ACCOUNT_AGE,
  type AgreementAcceptance,
  type EnforcementStatus,
  type PersonalAccountTrustState,
  type TrustedSessionIdentity,
} from "./types";

/** Feature flag names only — never document or set production values here. */
export const ACCOUNT_TRUST_FEATURE_FLAG_NAMES = Object.freeze({
  ACCOUNT_TRUST_FRAMEWORK_ENABLED: "ACCOUNT_TRUST_FRAMEWORK_ENABLED",
  PERSONAL_PROGRESS_VAULT_ENABLED: "PERSONAL_PROGRESS_VAULT_ENABLED",
  IDENTITY_VERIFICATION_REQUIRED: "IDENTITY_VERIFICATION_REQUIRED",
} as const);

export type AccountTrustFeatureFlags = {
  frameworkEnabled: boolean;
  vaultEnabled: boolean;
  identityVerificationRequired: boolean;
};

export function parseAccountTrustFeatureFlags(
  env: Record<string, string | undefined> = {}
): AccountTrustFeatureFlags {
  return {
    frameworkEnabled: env.ACCOUNT_TRUST_FRAMEWORK_ENABLED === "1",
    vaultEnabled: env.PERSONAL_PROGRESS_VAULT_ENABLED === "1",
    identityVerificationRequired: env.IDENTITY_VERIFICATION_REQUIRED === "1",
  };
}

/**
 * Resolve a trusted user id from a server session only.
 * Browser-supplied identifiers are ignored.
 */
export function resolveTrustedUserId(input: {
  serverSession: TrustedSessionIdentity | null | undefined;
  browserSuppliedUserId?: string;
}): string | null {
  void input.browserSuppliedUserId;
  if (input.serverSession == null) return null;
  if (input.serverSession.source !== "authenticated_server_session") {
    return null;
  }
  if (!canActivateAccountPackage(input.serverSession.package)) {
    return null;
  }
  if (
    typeof input.serverSession.userId !== "string" ||
    input.serverSession.userId.length === 0
  ) {
    return null;
  }
  return input.serverSession.userId;
}

export function buildPersonalAccountTrustState(input: {
  userId: string;
  adulthoodBasis: PersonalAccountTrustState["adulthoodBasis"];
  personalAccountConfirmed: boolean;
  acceptanceHistory: ReadonlyArray<AgreementAcceptance>;
  enforcementStatus: EnforcementStatus;
  vaultFlagEnabled?: boolean;
}): PersonalAccountTrustState {
  const requiredAgreementsCurrent = areRequiredAgreementsCurrent(
    input.acceptanceHistory
  );
  const sensitiveDataConsentActive = isSensitiveDataConsentActive(
    input.acceptanceHistory
  );
  const adultOk = isAdulthoodBasisSatisfied(input.adulthoodBasis);
  const enforcementOk = allowsAiGeneration(input.enforcementStatus);
  const aiGenerationAllowed =
    adultOk &&
    input.personalAccountConfirmed &&
    requiredAgreementsCurrent &&
    enforcementOk;

  const vaultFlag = input.vaultFlagEnabled === true;
  // Storage is not approved in Demand 019 — privateVaultAllowed stays false.
  const privateVaultAllowed =
    aiGenerationAllowed &&
    sensitiveDataConsentActive &&
    vaultFlag &&
    isApprovedPrivateStorageAvailable();

  return {
    schemaVersion: ACCOUNT_TRUST_SCHEMA_VERSION,
    userId: input.userId,
    package: "personal",
    minimumAgeRequirement: MINIMUM_ACCOUNT_AGE,
    adulthoodBasis: input.adulthoodBasis,
    personalAccountConfirmed: input.personalAccountConfirmed,
    requiredAgreementsCurrent,
    sensitiveDataConsentActive,
    aiGenerationAllowed,
    privateVaultAllowed,
  };
}

export type TrustGateDecision =
  | {
      enforced: false;
      allowed: true;
      code: "framework_disabled";
      message: string;
    }
  | {
      enforced: true;
      allowed: true;
      code: "trust_ok";
      userId: string;
      state: PersonalAccountTrustState;
    }
  | {
      enforced: true;
      allowed: false;
      code:
        | "unauthenticated"
        | "agreements_incomplete"
        | "adult_requirement_unsatisfied"
        | "enforcement_blocked"
        | "package_not_personal"
        | "trust_state_invalid";
      message: string;
    };

/**
 * Server-side account-trust gate for personal AI generation.
 * When the framework flag is off (default), enforcement is disabled and the
 * caller must continue using existing preview confirmations.
 */
export function evaluateAccountTrustGate(input: {
  env?: Record<string, string | undefined>;
  serverSession: TrustedSessionIdentity | null | undefined;
  browserSuppliedUserId?: string;
  adulthoodBasis: PersonalAccountTrustState["adulthoodBasis"];
  personalAccountConfirmed: boolean;
  acceptanceHistory: ReadonlyArray<AgreementAcceptance>;
  enforcementStatus: EnforcementStatus;
}): TrustGateDecision {
  const flags = parseAccountTrustFeatureFlags(input.env ?? {});
  if (!flags.frameworkEnabled) {
    return {
      enforced: false,
      allowed: true,
      code: "framework_disabled",
      message:
        "Account trust framework is disabled. Existing preview confirmations remain required.",
    };
  }

  const userId = resolveTrustedUserId({
    serverSession: input.serverSession,
    browserSuppliedUserId: input.browserSuppliedUserId,
  });
  if (userId == null) {
    return {
      enforced: true,
      allowed: false,
      code: "unauthenticated",
      message: "Authenticated Personal account session is required.",
    };
  }

  if (
    input.serverSession != null &&
    !canActivateAccountPackage(input.serverSession.package)
  ) {
    return {
      enforced: true,
      allowed: false,
      code: "package_not_personal",
      message: "Only the Personal package is active.",
    };
  }

  const state = buildPersonalAccountTrustState({
    userId,
    adulthoodBasis: input.adulthoodBasis,
    personalAccountConfirmed: input.personalAccountConfirmed,
    acceptanceHistory: input.acceptanceHistory,
    enforcementStatus: input.enforcementStatus,
    vaultFlagEnabled: flags.vaultEnabled,
  });

  if (!isAdulthoodBasisSatisfied(input.adulthoodBasis)) {
    return {
      enforced: true,
      allowed: false,
      code: "adult_requirement_unsatisfied",
      message: "Adult account requirement is not satisfied.",
    };
  }

  if (!state.requiredAgreementsCurrent) {
    return {
      enforced: true,
      allowed: false,
      code: "agreements_incomplete",
      message: "Required agreement versions are not current.",
    };
  }

  if (!allowsAiGeneration(input.enforcementStatus)) {
    return {
      enforced: true,
      allowed: false,
      code: "enforcement_blocked",
      message: "Account enforcement status blocks AI generation.",
    };
  }

  if (!state.aiGenerationAllowed) {
    return {
      enforced: true,
      allowed: false,
      code: "trust_state_invalid",
      message: "Personal account trust state does not allow AI generation.",
    };
  }

  return {
    enforced: true,
    allowed: true,
    code: "trust_ok",
    userId,
    state,
  };
}

/**
 * Preview checkbox removal is only safe when every gate condition is proven.
 * Without real auth + persistence this always returns false.
 */
export function mayRemoveRepeatedPreviewCheckboxes(input: {
  stableAuthenticatedUserId: boolean;
  serverSideTrustState: boolean;
  agreementVersionsVerifiedServerSide: boolean;
  adultRequirementSatisfied: boolean;
  apiRejectsWithoutTrustState: boolean;
  testsProveBrowserCannotBypass: boolean;
}): boolean {
  return (
    input.stableAuthenticatedUserId &&
    input.serverSideTrustState &&
    input.agreementVersionsVerifiedServerSide &&
    input.adultRequirementSatisfied &&
    input.apiRejectsWithoutTrustState &&
    input.testsProveBrowserCannotBypass
  );
}

export function clientOnlyAcceptanceUnlocksServerGeneration(): false {
  return false;
}
