/**
 * Adult account model — no appearance-based age estimation.
 * IdentityVerificationProvider is reserved; no provider is integrated here.
 */

import {
  MINIMUM_ACCOUNT_AGE,
  type AdulthoodBasis,
  type IdentityVerificationProvider,
  type IdentityVerificationResult,
  type TrustedSessionIdentity,
} from "./types";

export const ADULT_ACCOUNT_DEVELOPMENT_WORDING =
  "Adulthood is based on account attestation during development. This is not identity verification." as const;

export const IDENTITY_VERIFICATION_PREFERRED_WORDING =
  "Preferred adulthood basis is identity_provider_verified when an approved provider is integrated." as const;

/** Appearance / body signals that must never be used to estimate age. */
export const FORBIDDEN_AGE_ESTIMATION_SIGNALS = Object.freeze([
  "height",
  "weight",
  "body_type",
  "facial_appearance",
  "ethnicity",
  "youthful_appearance",
  "clothing",
  "pose",
] as const);

export function getMinimumAccountAge(): typeof MINIMUM_ACCOUNT_AGE {
  return MINIMUM_ACCOUNT_AGE;
}

export function isAppearanceAgeEstimationAllowed(): false {
  return false;
}

export function labelForAdulthoodBasis(basis: AdulthoodBasis): string {
  switch (basis) {
    case "identity_provider_verified":
      return "Identity provider verified adult";
    case "account_attestation":
      return "Account attestation (not identity verification)";
    case "not_verified":
      return "Not verified";
  }
}

export function isAdulthoodBasisSatisfied(basis: AdulthoodBasis): boolean {
  return (
    basis === "identity_provider_verified" || basis === "account_attestation"
  );
}

/**
 * Create development-time adulthood attestation.
 * Must not be labelled as identity verification.
 */
export function createAccountAttestation(input: {
  attestedAdult: boolean;
  attestedAt: string;
}): {
  adulthoodBasis: AdulthoodBasis;
  personalAccountConfirmed: boolean;
  attestedAt: string;
  labelledAsIdentityVerification: false;
} {
  if (!input.attestedAdult) {
    return {
      adulthoodBasis: "not_verified",
      personalAccountConfirmed: false,
      attestedAt: input.attestedAt,
      labelledAsIdentityVerification: false,
    };
  }
  return {
    adulthoodBasis: "account_attestation",
    personalAccountConfirmed: true,
    attestedAt: input.attestedAt,
    labelledAsIdentityVerification: false,
  };
}

/**
 * Reserved provider stub — throws if called without a real integration.
 * Demand 019 forbids integrating BankID or other providers.
 */
export class ReservedIdentityVerificationProvider
  implements IdentityVerificationProvider
{
  readonly name = "reserved_not_integrated";

  async verifyAdultIdentity(
    _session: TrustedSessionIdentity
  ): Promise<IdentityVerificationResult> {
    return {
      verified: false,
      adulthoodBasis: "not_verified",
      providerName: this.name,
      verifiedAt: null,
    };
  }
}

export function createReservedIdentityVerificationProvider(): IdentityVerificationProvider {
  return new ReservedIdentityVerificationProvider();
}
