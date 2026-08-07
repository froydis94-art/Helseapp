/**
 * Subscription package registry — Personal is the only active package.
 * Couple/Family/Friends/Coach/Group are reserved identifiers only.
 */

import type { AccountPackage } from "./types";

export const ACTIVE_ACCOUNT_PACKAGE: AccountPackage = "personal";

export const RESERVED_ACCOUNT_PACKAGES: ReadonlyArray<AccountPackage> =
  Object.freeze([
    "couple_reserved",
    "family_reserved",
    "friends_challenge_reserved",
    "coach_reserved",
    "group_reserved",
  ]);

export const ACCOUNT_PACKAGE_RULES = Object.freeze({
  everyParticipantHasOwnAccount: true,
  noSharedLogin: true,
  noSharedPrivateImageVault: true,
  groupDiscountsMayConnectSeparateAccountsLater: true,
  imageSharingMustBeSeparateAndExplicit: true,
  groupBillingImplemented: false,
  invitationsImplemented: false,
  leaderboardsImplemented: false,
  sharedProgressImplemented: false,
  sharedImageGalleriesImplemented: false,
  coachAccessImplemented: false,
  familyAccessImplemented: false,
});

export function isActiveAccountPackage(
  packageId: AccountPackage
): packageId is "personal" {
  return packageId === "personal";
}

export function isReservedAccountPackage(packageId: AccountPackage): boolean {
  return RESERVED_ACCOUNT_PACKAGES.includes(packageId);
}

export function canActivateAccountPackage(packageId: AccountPackage): boolean {
  return isActiveAccountPackage(packageId);
}

export function assertPersonalPackageOnly(
  packageId: AccountPackage
): asserts packageId is "personal" {
  if (!canActivateAccountPackage(packageId)) {
    throw new Error(
      `Package "${packageId}" is reserved and cannot be activated in Demand 019.`
    );
  }
}
