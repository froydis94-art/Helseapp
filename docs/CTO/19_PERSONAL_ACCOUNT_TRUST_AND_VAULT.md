# Personal Account Trust, Consent and Private Progress Vault

Status:  
Foundation — legal review and infrastructure gates required

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Related: [Internal AI Image Preview](./17_INTERNAL_AI_IMAGE_PREVIEW.md)

## Product decisions

- One Personal account belongs to one adult (minimum age 18).
- Accounts must not be shared.
- Required agreements are accepted once during onboarding (when real auth exists), not before every AI request.
- Terms, privacy acknowledgement, Responsible AI Use, and sensitive-data consent are separate records.
- Generated images default to discard; private Vault save is opt-in per image.
- Saved images remain private to the Personal account.
- No group sharing, shared vaults, or shared logins in this demand.
- Misuse follows warning → temporary restriction → permanent suspension; severe cases may lock pending human review.
- All user-facing legal copy is draft: `legalReviewStatus: "draft_requires_legal_review"`.
- Account enforcement and Vault persistence stay disabled until approved auth and private storage exist.

## Personal account rule

A Personal account represents one person. Package identifier `personal` is the only active package. Couple, Family, Friends Challenge, Coach and Group exist only as reserved package identifiers.

## Minimum age

Minimum account age is **18**. Adulthood must not be estimated from height, weight, body type, facial appearance, ethnicity, youthful appearance, clothing, or pose.

## Identity verification versus attestation

Preferred basis: `identity_provider_verified`.  
Development fallback: `account_attestation` — must not be labelled identity verification.  
`IdentityVerificationProvider` is reserved; no BankID or other provider is integrated in Demand 019.  
Image-level adult confirmation in Control Room preview remains until a real server-side account gate is proven.

## Agreement separation

Four visibly separate agreements:

| ID | Purpose | Required |
| --- | --- | --- |
| `terms_of_service` | Contractual account use | yes |
| `privacy_notice` | Receipt acknowledgement (not blanket processing consent) | yes |
| `responsible_ai_use` | Personal account + misuse rules | yes |
| `sensitive_data_consent` | Optional Vault storage + longitudinal comparison | no (opt-in) |

Presentation layers: short summary, expandable full draft, version, last updated, legal-review badge. No pre-checked boxes. Acceptance requires `explicit_action`.

## Responsible AI Use draft

Draft copy covers personal account use, image rights, lawful use, prohibited misuse, account measures (warning / restriction / suspension; severe lockdown pending review), refund eligibility under subscription terms and applicable consumer law, cooperation with authorities where required or permitted by applicable law, and responsibility for documented losses from intentional misuse to the extent permitted by applicable law.

## AI visualization disclaimer

Reusable copy (version `1.0-draft`):

> AI-generated images are expected future visualizations based on the information and scenario provided. They are not medical predictions, guaranteed outcomes or promises of actual results.

Intended surfaces: first AI-use onboarding, beside first generated result, image metadata/details, later export/share. Not an obstructive modal on every generation.

## Sensitive-data consent

Separate from Terms. Explicit, withdrawable, and as easy to withdraw as to grant. Withdrawal blocks new Vault saves; deleting existing images is a separate informed choice (`future_processing_only` vs `withdraw_and_delete_vault`).

## Private Progress Vault

Opt-in private timeline for the account owner. Metadata contract: `PersonalProgressImage`.  
**Infrastructure status:** `blocked_pending_approved_private_storage`.  
No local disk persistence on Vercel, no `public/` object storage, no `localStorage` / `sessionStorage` / cookie image persistence. Contracts and disabled UI only until an approved private-storage provider exists.

## Image lifecycle

Default after generation: **Discard after this session**.  
Optional: **Save privately to my progress timeline** (requires sensitive-data consent + approved storage + per-image Save). Temporary generation remains available without permanent HelseApp storage.

## Comparison over time

`ProgressComparisonReservation` reserves private two-image compare with dates, scenario, safe transformation metadata, and user notes. No body scoring, medical assessment, public share, or group share in this demand.

## Data export

User export of own timeline is a stated security requirement. Not implemented against real storage until a provider is approved.

## Consent withdrawal

Withdrawal always blocks new optional Vault saves. Modes:

1. Withdraw future processing only  
2. Withdraw and delete all Vault images  

Existing images are not silently deleted without informing the user.

## Account deletion

Deletion states: `requested` → `scheduled` → `completed` | `partially_retained_for_legal_obligation`.  
Offers account closure, Vault deletion, optional progress data deletion/anonymization, agreement retention only where legally necessary, subscription cancellation delegated to subscription rules. Do not claim immediate deletion from provider backups unless verified.

## Misuse enforcement

Versioned state machine (`EnforcementStatus`):

- `active` → `warned` → `temporarily_restricted` → `permanently_suspended` (default)
- Severe / apparently unlawful: `locked_pending_review` → human review → active / temporarily_restricted / permanently_suspended

Records reason category, policy version, timestamp, reviewing actor type, appeal/review status. `documentedLossRecoveryStatus` reserved.

## Warnings and suspension

Default sequence is warning-first. Permanent suspension for repeated misuse follows restriction. Permanent suspension without review is not automatic for severe cases — they enter lockdown pending review.

## Severe-case review

Human reviewer may restore, temporarily restrict, or permanently suspend. No automatic criminal determination, authority contact, or financial penalties.

## Refund-language limitation

Refund eligibility following suspension is determined under the subscription terms and applicable consumer law. No blanket “no refunds under any circumstances” language.

## Cooperation with authorities

HelseApp may preserve relevant records and cooperate with competent authorities where required or permitted by applicable law. Not every violation is reported; prosecution is not automatic.

## No automatic penalties

No automatic contractual fines, debt collection, criminal penalties, or total liability transfer away from HelseApp.

## Legal-review requirement

Every user-facing legal document metadata includes:

`legalReviewStatus: "draft_requires_legal_review"`

Final legal copy requires qualified Norwegian/EU counsel before public launch.

## Security model

- data minimization and purpose limitation
- private-by-default Vault design
- least-privilege / owner-scoped authorization
- no secret logging; no image-content logging; no analytics image payloads
- no browser persistent private-image storage
- no browser-supplied `userId` as authority
- Cache-Control: no-store expected for future trust/private-data APIs
- audit-friendly append-only acceptance versioning
- safe structured errors; no national ID storage

## Threat model

| Threat | Mitigation in this foundation |
| --- | --- |
| Account sharing | Personal-only package rule; agreements forbid sharing |
| Cross-account image access | Owner-scoped authorization contract rejects mismatches |
| Insecure direct-object references | No public object URLs; private storage keys only |
| Stolen sessions | Real session validation deferred to approved auth |
| Forged acceptance requests | Server must resolve userId; client-only acceptance cannot unlock |
| Replay of acceptance | Append-only records + version matching (persistence TBD) |
| Public object URLs | Explicitly rejected by Vault contracts |
| Accidental analytics capture | Images forbidden in analytics contracts |
| Account deletion gaps | Documented deletion states; no false backup claims |
| Unauthorized internal access | No employee access except documented operational need |

## Feature flags

Names only (default disabled; do not set on Vercel from this demand):

- `ACCOUNT_TRUST_FRAMEWORK_ENABLED`
- `PERSONAL_PROGRESS_VAULT_ENABLED`
- `IDENTITY_VERIFICATION_REQUIRED`

Enabled only when the value is exactly `1`.

## Infrastructure dependencies

Inspected repository state (Demand 019):

| Capability | Found |
| --- | --- |
| Auth provider for personal users | **None** (Control Room access key only) |
| Stable personal user IDs | **No** |
| Age / identity verification | **No** (preview adult checkbox only) |
| Trusted user sessions | **No** |
| Account database | **No** |
| Private object storage | **No** |
| Encryption / ACL for Vault | **No** |
| Account deletion / export | **No** |
| Subscription system | **No** |
| Personal onboarding UI | Scaffolding only (`public/personal-account-trust.html`) |
| Preview confirmations | Adult + consent + billing (kept) |
| Preview API personal account resolution | **No** |

**Implementation mode:** feature-gated scaffold / blocked dependency  
Do not claim production readiness. Do not activate enforcement without real auth + persistence.

## Reserved subscription packages

Active: `personal`  

Reserved only:

- `couple_reserved`
- `family_reserved`
- `friends_challenge_reserved`
- `coach_reserved`
- `group_reserved`

Future rule: every participant has their own account and private identity; no shared login or shared private image vault; image sharing must always be separate and explicit.

## What remains unchanged

- `api/generate-future-you.js` production image flow
- `lib/replicate.js`
- Provider moderation
- Control Room auth and paid preview confirmations
- AI Experiment Lab behavior
- No paid provider requests added by this demand
- No Vercel env var changes

## Manual verification checklist

- [ ] Legal drafts show draft-requires-legal-review badge
- [ ] Four agreements are separate; sensitive consent not inside Terms
- [ ] No checkbox pre-checked on scaffolding page
- [ ] Vault Save unavailable without storage
- [ ] Control Room adult/consent/billing checkboxes still present
- [ ] Feature flags default disabled
- [ ] `npm run typecheck` / `test:ai` / `harness:ai` pass

## Next milestone

Demand 020 — Guided Progress Photo Capture

Future button:

“How to take the perfect progress photo”

It will contain:

- one neutral illustration
- five short capture rules
- one good-light example
- one poor-light example
- no long legal text
- guidance only, not a judgment of the user

## Module map

- `src/ai/account-trust/` — contracts, agreements, identity, packages, enforcement, vault, trust gate
- `src/ai/__tests__/accountTrust.test.ts` — tests 1–50
- `public/personal-account-trust.html` — disabled UI scaffolding
