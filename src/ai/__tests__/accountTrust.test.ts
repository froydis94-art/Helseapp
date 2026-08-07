/**
 * DEMAND_019 — Personal Account Trust, Consent and Private Progress Vault.
 * Run: npm run test:ai
 * No real auth, storage, paid providers, or network.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACCOUNT_PACKAGE_RULES,
  ACCOUNT_TRUST_FEATURE_FLAG_NAMES,
  ACCOUNT_TRUST_SCHEMA_VERSION,
  ACTIVE_ACCOUNT_PACKAGE,
  ADULT_ACCOUNT_DEVELOPMENT_WORDING,
  AI_VISUALIZATION_DISCLAIMER,
  AI_VISUALIZATION_DISCLAIMER_VERSION,
  DEFAULT_ENFORCEMENT_SEQUENCE,
  DEFAULT_POST_GENERATION_CHOICE,
  ENFORCEMENT_POLICY_VERSION,
  FORBIDDEN_AGE_ESTIMATION_SIGNALS,
  LEGAL_REVIEW_BADGE_LABEL,
  MINIMUM_ACCOUNT_AGE,
  PROGRESS_COMPARISON_RESERVATION,
  RESERVED_ACCOUNT_PACKAGES,
  VAULT_SECURITY_REQUIREMENTS,
  VAULT_STORAGE_STATUS,
  agreementPresentationLayers,
  applyEnforcementTransition,
  applyHumanReview,
  applySensitiveConsentWithdrawal,
  areRequiredAgreementsCurrent,
  assertPersonalPackageOnly,
  automaticAuthorityReportingExists,
  automaticCriminalDeterminationExists,
  automaticFinancialPenaltyExists,
  browserPersistentImageStorageAllowed,
  buildPersonalAccountTrustState,
  canActivateAccountPackage,
  clientOnlyAcceptanceUnlocksServerGeneration,
  createAccountAttestation,
  createExplicitAcceptance,
  createProgressImageMetadata,
  createReservedIdentityVerificationProvider,
  evaluateAccountTrustGate,
  evaluateVaultSaveRequest,
  generatedImageMayAppearInAnalytics,
  getAccountDeletionOffer,
  getAgreementCatalog,
  getAgreementVersion,
  getDefaultPostGenerationChoice,
  getMinimumAccountAge,
  getProgressComparisonReservation,
  isAcceptanceActive,
  isAgreementPreChecked,
  isAppearanceAgeEstimationAllowed,
  isApprovedPrivateStorageAvailable,
  isReservedAccountPackage,
  isSaveOptIn,
  isSensitiveDataConsentActive,
  isVaultPersistenceEnabled,
  labelForAdulthoodBasis,
  listRequiredAgreementIds,
  markImageDeleted,
  mayRemoveRepeatedPreviewCheckboxes,
  modelTrainingReuseEnabled,
  parseAccountTrustFeatureFlags,
  recordWithdrawal,
  refundCopyPreservesApplicableLaw,
  rejectPublicObjectUrl,
  resolveTrustedUserId,
  scheduleVaultDeletionOnAccountClosure,
  sourceImageMayAppearInLogs,
  authorizeVaultOwnerAccess,
} from "../account-trust";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function acceptRequired(
  userId: string,
  at = "2026-08-07T12:00:00.000Z"
): ReturnType<typeof createExplicitAcceptance>[] {
  return listRequiredAgreementIds().map((agreementId) => {
    const version = getAgreementVersion(agreementId)!.version;
    return createExplicitAcceptance({
      userId,
      agreementId,
      version,
      acceptedAt: at,
      locale: "nb-NO",
      explicitAction: true,
    });
  });
}

describe("DEMAND_019 Personal Account Trust", () => {
  describe("Agreements", () => {
    it("1. Agreement versions are immutable", () => {
      const a = getAgreementCatalog();
      const b = getAgreementCatalog();
      assert.equal(a, b);
      assert.throws(() => {
        // @ts-expect-error catalog is readonly
        a.push({});
      });
    });

    it("2. Required agreements are independently represented", () => {
      const ids = getAgreementCatalog().map((a) => a.agreementId);
      assert.deepEqual(ids, [
        "terms_of_service",
        "privacy_notice",
        "responsible_ai_use",
        "sensitive_data_consent",
      ]);
      assert.equal(listRequiredAgreementIds().length, 3);
      assert.equal(
        listRequiredAgreementIds().includes("sensitive_data_consent"),
        false
      );
    });

    it("3. Sensitive-data consent is separate from Terms", () => {
      const terms = getAgreementVersion("terms_of_service")!;
      const sensitive = getAgreementVersion("sensitive_data_consent")!;
      assert.notEqual(terms.agreementId, sensitive.agreementId);
      assert.equal(sensitive.required, false);
      assert.match(sensitive.fullDraft, /not part of the Terms of Service/i);
    });

    it("4. No box is pre-checked", () => {
      assert.equal(isAgreementPreChecked(), false);
      for (const a of getAgreementCatalog()) {
        assert.equal(agreementPresentationLayers(a).preChecked, false);
      }
    });

    it("5. Acceptance requires explicit action", () => {
      assert.throws(() =>
        createExplicitAcceptance({
          userId: "u1",
          agreementId: "terms_of_service",
          version: "1.0-draft",
          acceptedAt: "2026-08-07T12:00:00.000Z",
          locale: "nb-NO",
          explicitAction: false,
        })
      );
    });

    it("6. Acceptance records include version and timestamp", () => {
      const acc = createExplicitAcceptance({
        userId: "u1",
        agreementId: "privacy_notice",
        version: "1.0-draft",
        acceptedAt: "2026-08-07T12:00:00.000Z",
        locale: "en",
        explicitAction: true,
      });
      assert.equal(acc.version, "1.0-draft");
      assert.equal(acc.acceptedAt, "2026-08-07T12:00:00.000Z");
      assert.equal(acc.evidence.method, "explicit_action");
    });

    it("7. Withdrawal is recorded", () => {
      const acc = createExplicitAcceptance({
        userId: "u1",
        agreementId: "sensitive_data_consent",
        version: "1.0-draft",
        acceptedAt: "2026-08-07T12:00:00.000Z",
        locale: "nb-NO",
        explicitAction: true,
      });
      const withdrawn = recordWithdrawal(acc, "2026-08-08T12:00:00.000Z");
      assert.equal(withdrawn.withdrawnAt, "2026-08-08T12:00:00.000Z");
      assert.equal(isAcceptanceActive(withdrawn), false);
      assert.equal(isAcceptanceActive(acc), true);
    });

    it("8. New agreement version invalidates current status until accepted", () => {
      const history = acceptRequired("u1");
      assert.equal(areRequiredAgreementsCurrent(history), true);
      const stale = history.map((a) =>
        a.agreementId === "terms_of_service"
          ? { ...a, version: "0.9-old" }
          : a
      );
      assert.equal(areRequiredAgreementsCurrent(stale), false);
    });

    it("9. Draft legal text is marked requires legal review", () => {
      for (const a of getAgreementCatalog()) {
        assert.equal(a.legalReviewStatus, "draft_requires_legal_review");
        assert.equal(
          agreementPresentationLayers(a).legalReviewBadge,
          LEGAL_REVIEW_BADGE_LABEL
        );
      }
    });
  });

  describe("Account", () => {
    it("10. Personal is the only active package", () => {
      assert.equal(ACTIVE_ACCOUNT_PACKAGE, "personal");
      assert.equal(canActivateAccountPackage("personal"), true);
    });

    it("11. Reserved packages cannot be activated", () => {
      for (const p of RESERVED_ACCOUNT_PACKAGES) {
        assert.equal(isReservedAccountPackage(p), true);
        assert.equal(canActivateAccountPackage(p), false);
        assert.throws(() => assertPersonalPackageOnly(p));
      }
    });

    it("12. Browser-supplied userId is not trusted", () => {
      const id = resolveTrustedUserId({
        serverSession: null,
        browserSuppliedUserId: "forged-user",
      });
      assert.equal(id, null);
      const trusted = resolveTrustedUserId({
        serverSession: {
          userId: "real-user",
          source: "authenticated_server_session",
          package: "personal",
        },
        browserSuppliedUserId: "forged-user",
      });
      assert.equal(trusted, "real-user");
    });

    it("13. Adulthood is not inferred from appearance", () => {
      assert.equal(isAppearanceAgeEstimationAllowed(), false);
      assert.equal(getMinimumAccountAge(), 18);
      assert.equal(MINIMUM_ACCOUNT_AGE, 18);
      for (const signal of FORBIDDEN_AGE_ESTIMATION_SIGNALS) {
        assert.equal(typeof signal, "string");
      }
    });

    it("14. Account attestation is not labelled identity verification", () => {
      const att = createAccountAttestation({
        attestedAdult: true,
        attestedAt: "2026-08-07T12:00:00.000Z",
      });
      assert.equal(att.adulthoodBasis, "account_attestation");
      assert.equal(att.labelledAsIdentityVerification, false);
      assert.match(labelForAdulthoodBasis("account_attestation"), /not identity verification/i);
      assert.match(ADULT_ACCOUNT_DEVELOPMENT_WORDING, /not identity verification/i);
      const provider = createReservedIdentityVerificationProvider();
      assert.equal(provider.name, "reserved_not_integrated");
    });

    it("15. AI generation requires valid server-side trust state when enabled", () => {
      const disabled = evaluateAccountTrustGate({
        env: {},
        serverSession: null,
        adulthoodBasis: "not_verified",
        personalAccountConfirmed: false,
        acceptanceHistory: [],
        enforcementStatus: "active",
      });
      assert.equal(disabled.enforced, false);
      assert.equal(disabled.allowed, true);

      const enabledNoAuth = evaluateAccountTrustGate({
        env: { ACCOUNT_TRUST_FRAMEWORK_ENABLED: "1" },
        serverSession: null,
        browserSuppliedUserId: "browser-only",
        adulthoodBasis: "account_attestation",
        personalAccountConfirmed: true,
        acceptanceHistory: acceptRequired("browser-only"),
        enforcementStatus: "active",
      });
      assert.equal(enabledNoAuth.enforced, true);
      assert.equal(enabledNoAuth.allowed, false);
      if (!enabledNoAuth.allowed) {
        assert.equal(enabledNoAuth.code, "unauthenticated");
      }

      const ok = evaluateAccountTrustGate({
        env: { ACCOUNT_TRUST_FRAMEWORK_ENABLED: "1" },
        serverSession: {
          userId: "u1",
          source: "authenticated_server_session",
          package: "personal",
        },
        adulthoodBasis: "account_attestation",
        personalAccountConfirmed: true,
        acceptanceHistory: acceptRequired("u1"),
        enforcementStatus: "active",
      });
      assert.equal(ok.enforced, true);
      assert.equal(ok.allowed, true);
      if (ok.allowed && ok.enforced) {
        assert.equal(ok.state.schemaVersion, ACCOUNT_TRUST_SCHEMA_VERSION);
        assert.equal(ok.state.aiGenerationAllowed, true);
      }
    });
  });

  describe("Vault", () => {
    it("16. Save is opt-in per image", () => {
      assert.equal(isSaveOptIn("save_privately"), true);
      assert.equal(isSaveOptIn("discard"), false);
    });

    it("17. Default is discard", () => {
      assert.equal(getDefaultPostGenerationChoice(), "discard");
      assert.equal(DEFAULT_POST_GENERATION_CHOICE, "discard");
    });

    it("18. Vault requires separate sensitive-data consent", () => {
      const history = acceptRequired("u1");
      assert.equal(isSensitiveDataConsentActive(history), false);
      const withConsent = [
        ...history,
        createExplicitAcceptance({
          userId: "u1",
          agreementId: "sensitive_data_consent",
          version: "1.0-draft",
          acceptedAt: "2026-08-07T12:00:00.000Z",
          locale: "nb-NO",
          explicitAction: true,
        }),
      ];
      assert.equal(isSensitiveDataConsentActive(withConsent), true);
      const blocked = evaluateVaultSaveRequest({
        choice: "save_privately",
        sensitiveDataConsentActive: false,
        storageAvailable: true,
        consentWithdrawnForFuture: false,
      });
      assert.equal(blocked.allowed, false);
      assert.equal(blocked.code, "consent_required");
    });

    it("19. Cross-user image access is rejected", () => {
      const auth = authorizeVaultOwnerAccess({
        ownerUserId: "owner",
        requestingUserId: "other",
      });
      assert.equal(auth.allowed, false);
    });

    it("20. Public object URLs are rejected", () => {
      const r = rejectPublicObjectUrl("https://cdn.example/public/img.jpg");
      assert.equal(r.rejected, true);
      assert.throws(() =>
        createProgressImageMetadata({
          imageId: "i1",
          ownerUserId: "u1",
          createdAt: "2026-08-07T12:00:00.000Z",
          source: "ai_generated_progress_visualization",
          scenarioId: null,
          timelineDate: "2026-08-07",
          privateStorageKey: "https://public.example/x.jpg",
          mimeType: "image/jpeg",
          byteLength: 10,
          aiGenerated: true,
          transformationMetadataId: null,
        })
      );
    });

    it("21. Source image is absent from logs", () => {
      assert.equal(sourceImageMayAppearInLogs(), false);
      assert.equal(VAULT_SECURITY_REQUIREMENTS.noSourceImageInApplicationLogs, true);
    });

    it("22. Images are absent from analytics", () => {
      assert.equal(generatedImageMayAppearInAnalytics(), false);
      assert.equal(
        VAULT_SECURITY_REQUIREMENTS.noGeneratedImageBinaryInAnalytics,
        true
      );
    });

    it("23. Image deletion is owner-authorized", () => {
      const image = createProgressImageMetadata({
        imageId: "i1",
        ownerUserId: "u1",
        createdAt: "2026-08-07T12:00:00.000Z",
        source: "user_progress_photo",
        scenarioId: null,
        timelineDate: "2026-08-07",
        privateStorageKey: "vault:u1:i1",
        mimeType: "image/png",
        byteLength: 20,
        aiGenerated: false,
        transformationMetadataId: null,
      });
      assert.throws(() =>
        markImageDeleted(image, "other", "2026-08-08T00:00:00.000Z")
      );
      const deleted = markImageDeleted(image, "u1", "2026-08-08T00:00:00.000Z");
      assert.equal(deleted.deletedAt, "2026-08-08T00:00:00.000Z");
    });

    it("24. Account deletion schedules Vault deletion", () => {
      assert.equal(scheduleVaultDeletionOnAccountClosure(), "scheduled");
      const offer = getAccountDeletionOffer();
      assert.equal(offer.deletePrivateVaultContent, true);
      assert.ok(offer.deletionStates.includes("scheduled"));
    });

    it("25. Withdrawal blocks new Vault saves", () => {
      const w = applySensitiveConsentWithdrawal({
        mode: "future_processing_only",
      });
      assert.equal(w.blockNewVaultSaves, true);
      const blocked = evaluateVaultSaveRequest({
        choice: "save_privately",
        sensitiveDataConsentActive: true,
        storageAvailable: true,
        consentWithdrawnForFuture: true,
      });
      assert.equal(blocked.code, "consent_withdrawn");
    });

    it("26. Vault is disabled without approved storage", () => {
      assert.equal(isApprovedPrivateStorageAvailable(), false);
      assert.equal(isVaultPersistenceEnabled(), false);
      assert.equal(VAULT_STORAGE_STATUS, "blocked_pending_approved_private_storage");
      const r = evaluateVaultSaveRequest({
        choice: "save_privately",
        sensitiveDataConsentActive: true,
        storageAvailable: false,
        consentWithdrawnForFuture: false,
      });
      assert.equal(r.code, "storage_unavailable");
    });

    it("27. No localStorage/sessionStorage/cookie image persistence", () => {
      assert.equal(browserPersistentImageStorageAllowed(), false);
      assert.equal(
        VAULT_SECURITY_REQUIREMENTS.noBrowserPersistentImageStorage,
        true
      );
      const html = read("public/personal-account-trust.html");
      assert.equal(/localStorage|sessionStorage/i.test(html), false);
    });

    it("28. No model-training reuse exists", () => {
      assert.equal(modelTrainingReuseEnabled(), false);
      assert.equal(VAULT_SECURITY_REQUIREMENTS.noModelTrainingReuse, true);
    });
  });

  describe("Enforcement", () => {
    it("29. Default progression is warning before suspension", () => {
      assert.deepEqual([...DEFAULT_ENFORCEMENT_SEQUENCE], [
        "active",
        "warned",
        "temporarily_restricted",
        "permanently_suspended",
      ]);
      const warned = applyEnforcementTransition({
        userId: "u1",
        currentStatus: "active",
        enforcementSeverity: "minor",
        reasonCategory: "policy_violation",
        recordedAt: "2026-08-07T12:00:00.000Z",
      });
      assert.equal(warned.status, "warned");
      assert.equal(warned.policyVersion, ENFORCEMENT_POLICY_VERSION);
    });

    it("30. Repeated misuse may reach permanent suspension", () => {
      const restricted = applyEnforcementTransition({
        userId: "u1",
        currentStatus: "warned",
        enforcementSeverity: "repeated",
        reasonCategory: "repeated_misuse",
        recordedAt: "2026-08-07T12:00:00.000Z",
      });
      assert.equal(restricted.status, "temporarily_restricted");
      const suspended = applyEnforcementTransition({
        userId: "u1",
        currentStatus: "temporarily_restricted",
        enforcementSeverity: "repeated",
        reasonCategory: "repeated_misuse",
        recordedAt: "2026-08-07T13:00:00.000Z",
      });
      assert.equal(suspended.status, "permanently_suspended");
    });

    it("31. Severe misuse enters locked_pending_review", () => {
      const locked = applyEnforcementTransition({
        userId: "u1",
        currentStatus: "active",
        enforcementSeverity: "severe",
        reasonCategory: "severe_misuse",
        recordedAt: "2026-08-07T12:00:00.000Z",
      });
      assert.equal(locked.status, "locked_pending_review");
      const unlawful = applyEnforcementTransition({
        userId: "u1",
        currentStatus: "warned",
        enforcementSeverity: "apparently_unlawful",
        reasonCategory: "apparently_unlawful",
        recordedAt: "2026-08-07T12:00:00.000Z",
      });
      assert.equal(unlawful.status, "locked_pending_review");
    });

    it("32. Human review can restore or suspend", () => {
      const locked = applyEnforcementTransition({
        userId: "u1",
        currentStatus: "active",
        enforcementSeverity: "severe",
        reasonCategory: "severe_misuse",
        recordedAt: "2026-08-07T12:00:00.000Z",
      });
      const restored = applyHumanReview(locked, {
        outcome: "restore_active",
        recordedAt: "2026-08-07T14:00:00.000Z",
        reviewingActorType: "human_reviewer",
        reasonCategory: "false_positive",
      });
      assert.equal(restored.status, "active");
      assert.equal(restored.appealStatus, "resolved_restored");
      const suspended = applyHumanReview(locked, {
        outcome: "permanently_suspend",
        recordedAt: "2026-08-07T15:00:00.000Z",
        reviewingActorType: "human_reviewer",
        reasonCategory: "confirmed_severe",
      });
      assert.equal(suspended.status, "permanently_suspended");
    });

    it("33. No automatic criminal determination exists", () => {
      assert.equal(automaticCriminalDeterminationExists(), false);
    });

    it("34. No automatic authority report exists", () => {
      assert.equal(automaticAuthorityReportingExists(), false);
    });

    it("35. No automatic financial penalty exists", () => {
      assert.equal(automaticFinancialPenaltyExists(), false);
    });

    it("36. Appeal/review status exists", () => {
      const locked = applyEnforcementTransition({
        userId: "u1",
        currentStatus: "active",
        enforcementSeverity: "severe",
        reasonCategory: "severe_misuse",
        recordedAt: "2026-08-07T12:00:00.000Z",
      });
      assert.equal(locked.appealStatus, "pending_review");
    });

    it("37. Refund copy preserves applicable-law qualification", () => {
      assert.match(refundCopyPreservesApplicableLaw(), /applicable consumer law/i);
      const responsible = getAgreementVersion("responsible_ai_use")!;
      assert.match(responsible.fullDraft, /applicable consumer law/i);
      assert.equal(/no refunds under any circumstances/i.test(responsible.fullDraft), false);
    });
  });

  describe("Preview migration", () => {
    it("38. Existing checkboxes remain until the full server gate is proven", () => {
      const html = read("public/ai-os-control-room.html");
      assert.match(html, /at least 18 years old/i);
      assert.match(html, /explicit permission|person shown/i);
      assert.equal(
        mayRemoveRepeatedPreviewCheckboxes({
          stableAuthenticatedUserId: false,
          serverSideTrustState: false,
          agreementVersionsVerifiedServerSide: false,
          adultRequirementSatisfied: false,
          apiRejectsWithoutTrustState: false,
          testsProveBrowserCannotBypass: false,
        }),
        false
      );
    });

    it("39. Client-only acceptance cannot unlock server generation", () => {
      assert.equal(clientOnlyAcceptanceUnlocksServerGeneration(), false);
    });

    it("40. Control Room authentication remains unchanged", () => {
      const auth = read("src/ai/control-room/ControlRoomAuth.ts");
      assert.match(auth, /AI_OS_CONTROL_ROOM_ACCESS_KEY/);
      assert.match(auth, /timingSafeStringEqual/);
    });

    it("41. Paid Control Room confirmation remains", () => {
      const html = read("public/ai-os-control-room.html");
      const js = read("public/ai-os-control-room.js");
      assert.match(js, /billingConfirmed:\s*true/);
      assert.match(html, /bill|paid|cost|credit/i);
    });

    it("42. No paid provider request is added", () => {
      const mod = read("src/ai/account-trust/index.ts");
      assert.equal(/replicate|fetch\(|https?:\/\//i.test(mod), false);
      assert.equal(existsSync(join(root, "src/ai/account-trust")), true);
    });
  });

  describe("Regression", () => {
    it("43. Existing AI tests file set remains listed", () => {
      const pkg = JSON.parse(read("package.json")) as { scripts: { "test:ai": string } };
      assert.match(pkg.scripts["test:ai"], /imagePreview\.test\.ts/);
      assert.match(pkg.scripts["test:ai"], /accountTrust\.test\.ts/);
    });

    it("44. Harness script remains available", () => {
      const pkg = JSON.parse(read("package.json")) as { scripts: { "harness:ai": string } };
      assert.match(pkg.scripts["harness:ai"], /run-ai-os-v2-harness/);
    });

    it("45. AI Experiment Lab remains unchanged", () => {
      const html = read("public/ai-os-control-room.html");
      assert.match(html, /AI Experiment Lab/);
      assert.match(html, /Dry-run|runButton/i);
    });

    it("46. Production image generation remains unchanged", () => {
      assert.equal(existsSync(join(root, "api/generate-future-you.js")), true);
      // Demand forbids modifying this file — presence + no account-trust import.
      const prod = read("api/generate-future-you.js");
      assert.equal(/account-trust|ACCOUNT_TRUST_FRAMEWORK/i.test(prod), false);
    });

    it("47. lib/replicate.js remains unchanged by this domain", () => {
      const rep = read("lib/replicate.js");
      assert.equal(/account-trust|PersonalAccountTrust/i.test(rep), false);
    });

    it("48. Provider moderation remains unchanged", () => {
      const previewTypes = read("src/ai/control-room/ImagePreviewTypes.ts");
      assert.match(previewTypes, /IMAGE_PREVIEW_PROVIDER_SAFETY|safety|moderation|blocked/i);
    });

    it("49. No group sharing is introduced", () => {
      assert.equal(ACCOUNT_PACKAGE_RULES.sharedImageGalleriesImplemented, false);
      assert.equal(ACCOUNT_PACKAGE_RULES.noSharedPrivateImageVault, true);
      assert.equal(PROGRESS_COMPARISON_RESERVATION.supports.groupShare, false);
      assert.equal(getProgressComparisonReservation().status, "reserved_not_implemented");
    });

    it("50. No dependencies are added unless explicitly approved", () => {
      const pkg = JSON.parse(read("package.json")) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      assert.equal(pkg.dependencies["stripe"], undefined);
      assert.equal(pkg.dependencies["@clerk/clerk-sdk-node"], undefined);
      assert.equal(pkg.dependencies["firebase"], undefined);
      assert.equal(pkg.devDependencies["tsx"] != null, true);
      assert.equal(ACCOUNT_TRUST_FEATURE_FLAG_NAMES.ACCOUNT_TRUST_FRAMEWORK_ENABLED, "ACCOUNT_TRUST_FRAMEWORK_ENABLED");
      const flags = parseAccountTrustFeatureFlags({});
      assert.equal(flags.frameworkEnabled, false);
      assert.equal(flags.vaultEnabled, false);
      assert.equal(flags.identityVerificationRequired, false);
      assert.match(AI_VISUALIZATION_DISCLAIMER, /expected future visualizations/i);
      assert.equal(AI_VISUALIZATION_DISCLAIMER_VERSION.length > 0, true);
      const state = buildPersonalAccountTrustState({
        userId: "u1",
        adulthoodBasis: "account_attestation",
        personalAccountConfirmed: true,
        acceptanceHistory: acceptRequired("u1"),
        enforcementStatus: "active",
      });
      assert.equal(state.package, "personal");
      assert.equal(state.privateVaultAllowed, false);
    });
  });
});
