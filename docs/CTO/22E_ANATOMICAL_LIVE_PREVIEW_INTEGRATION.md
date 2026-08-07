# Anatomical Engine Live Preview Integration

Status:  
Feature-flagged live Future generation integration

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Related: [22 — Body Simulator v1](./22_BODY_SIMULATOR_V1.md), [22A — Shadow Integration](./22A_BODY_SIMULATOR_SHADOW_INTEGRATION.md), [22B — First End-to-End Preview](./22B_FIRST_END_TO_END_PREVIEW.md), [22C — Controlled Simulator Comparison](./22C_CONTROLLED_SIMULATOR_COMPARISON.md), [22D — Anatomical Transformation Engine](./22D_ANATOMICAL_TRANSFORMATION_ENGINE.md), [17 — Internal AI Image Preview](./17_INTERNAL_AI_IMAGE_PREVIEW.md)

---

## Why this exists

Manual public-page tests after Demand 022D continued to show near-no-op body-fat reductions, weak timeline response, and weak focus-zone response.

022D intentionally left the production generation path unchanged. The public Future button still used legacy reservedrift prompt construction in `lib/replicate.js`.

022E connects the Anatomical Transformation Engine to the **real** Future generation path behind a server-side feature flag so the owner can test whether anatomical rules actually reach the provider.

This is controlled live-preview — **not** a permanent production cutover.

---

## Current public path before 022E

Repository inspection found:

| Step | Location |
| --- | --- |
| Public Future form | `public/index.html` (Fremtid tab) |
| Generate click handler | `#run` → `fetch(.../api/generate-future-you)` |
| Request payload | `maal`, `intensity`, `horizon`, `zones`, `fat`, `muscle`, `bfNow`, `bfGoal`, `imageBase64`, … |
| API route | `api/generate-future-you.js` |
| Transformation contract | Legacy reservedrift: `lib/replicate.js` + `lib/visuellPrompt.js` + `lib/transformasjonLogikk.js` |
| Formatter path | Custom prompt builders inside `lib/replicate.js` (not FluxFormatter) |
| Provider path | Replicate via `lib/replicate.js` |
| Body Simulator | Did **not** participate |
| Anatomical Engine | Did **not** participate |
| Ownership | Legacy reservedrift owned transformation intent |

---

## Feature flag

`BODY_SIMULATOR_LIVE_PREVIEW_ENABLED`

- Server-authoritative
- Enabled only when value is exactly `1`
- Default **OFF** when absent
- Browser cannot enable it
- No Vercel env auto-set by this demand
- When OFF: public route calls `generateWithReplicate` exactly as before
- When ON: only the Future visualization generation path uses Body Simulator + Anatomical

---

## Live path when flag ON

```
Public Future payload
→ PublicFutureToBodySimulatorAdapter
→ Body Simulator v1
→ Anatomical Transformation Engine v2
→ canonical rule verification
→ BodySimulatorFormatterAdapter
→ existing FluxFormatter (via AiOsRuntime)
→ existing Replicate transport
→ existing public response shape
```

Rules:

- One path only (no dual generation)
- Maximum one provider request
- No automatic retry
- No silent legacy fallback on failure

---

## Public Future adapter

Module: `src/ai/body-simulator/PublicFutureToBodySimulatorAdapter.ts`

Maps only fields already supplied by the user/profile:

- current / target body-fat %
- fat / muscle direction → goal type
- timeline (horizon)
- focus zones
- effort / intensity
- optional notes (`maal`)
- height / weight / age / sex when present
- medication toggle when present

Uses `null` / `not_provided` when absent. No inventing, prompt parsing, vision, or NLP.

---

## Body-fat mapping

Absolute current and target → delta = target − current.

Examples:

| Current | Target | Delta |
| --- | --- | --- |
| 22 | 16 | −6 |
| 22 | 10 | −12 |
| 26 | 10 | −16 |

Diagnostics: `currentBodyFatPercentReceived`, `targetBodyFatPercentReceived`, `computedBodyFatDeltaPercentagePoints`.

---

## Timeline mapping

| Public UI | Horizon key | Months | Canonical weeks |
| --- | --- | --- | --- |
| 3 months | `12w` | 3 | ≈ `3 × BODY_SIM_WEEKS_PER_MONTH` (clamped 4–52) |
| 6 months | `24w` | 6 | ≈ 6 months |
| 12 months | `12m` | 12 | ≈ 12 months |

Diagnostics: `timelineSource`, `timelineWeeks`, `timelineScalingCoefficient`.

---

## Focus-zone mapping

Explicit table (`PUBLIC_FOCUS_ZONE_MAP`):

| Public zone | Canonical focusZones |
| --- | --- |
| abs / core | abs, core |
| glutes | glutes |
| thighs | thighs |
| arms | arms |
| chest | chest |
| shoulders / upper | shoulders, upper_body |
| back | back |
| posture | posture |

Unmapped zones emit diagnostic warnings and are not silently dropped from diagnostics.

---

## Effort mapping

| Public UI | Payload | Intensity | Anatomical effort (022D) |
| --- | --- | --- | --- |
| Moderate | `subtle` | conservative | 0.70 |
| Hard | `moderate` | realistic | 0.85 |
| Strict / max | `strong` | ambitious | 1.00 |

---

## Optional notes mapping

`maal` (and optionalNotes array) → Body Simulator `optionalNotes` only.

Low priority in Anatomical Engine. Disposition from `noteOutcomes`: applied / partially_applied / suppressed / none.

Notes do not append body-change instructions outside the canonical path.

---

## Canonical verification

Before any provider call, verify:

- Body Simulator schema
- Anatomical schema
- BF current/target/delta consistency
- Timeline mapping
- Focus mapping diagnostics
- Preservation identity
- Applied anatomical rules
- Formatter translated anatomical changes
- No legacy transform source mix

Failure → `body_simulator_live_preview_verification_failed` (or `anatomical_rules_not_translated`) and **zero** provider calls.

---

## Anatomical formatter translation

`BodySimulatorFormatterAdapter` remains translate-only.

Typed assertion: when meaningful anatomical rules exist, approvedChanges must include `body-sim-anatomical-*` entries (or anatomical sourcePlanField). Keyword hacks against English prompt strings are not used.

---

## Live trace diagnostics

`LiveBodySimulatorDiagnostics` (safe, no secrets):

- livePreviewEnabled, livePreviewTraceId
- bodySimulatorExecuted, anatomicalEngineExecuted
- bodyFat current/target/delta
- timelineWeeks / effort / focusZones
- appliedAnatomicalRuleIds, appliedFeatures, suppressedRuleIds
- semanticSupportTerms
- formatterConsumedAnatomicalRules, promptContainsAnatomicalIntent
- providerRequestAttempted / providerRequestCount
- generationPath

`livePreviewTraceId` is a logical id (`lfp_…`) — no user id / PII.

---

## Failure classification

| Class | Meaning |
| --- | --- |
| `live_preview_adapter_failed` | Public → simulator adapter failed |
| `live_preview_body_simulator_failed` | Simulator validation / execution failed |
| `live_preview_anatomical_engine_failed` | Anatomical result missing |
| `live_preview_rule_verification_failed` | Pre-provider verification failed |
| `live_preview_formatter_translation_failed` | Formatter adapter failed |
| `live_preview_provider_failed` | Provider/transport failed |
| `body_simulator_live_preview_verification_failed` | Aggregate verification stop |
| `anatomical_rules_not_translated` | Meaningful rules → zero anatomical translation |

No automatic fallback. No automatic retry.

---

## No automatic fallback

When the flag is ON and the live path fails, the API returns a structured error. It does **not** call `generateWithReplicate` as a recovery path.

---

## Provider unchanged

- Same Replicate transport adapter family
- Default model remains `black-forest-labs/flux-kontext-pro`
- No moderation / billing / auth / account-trust changes
- No Replicate transport core redesign

---

## No permanent cutover

Flag defaults OFF. Legacy reservedrift remains the public path until the owner explicitly enables the flag.

---

## Public UI marker

No safe existing developer-only display mechanism was found on the public Future page.

Therefore the public UI does **not** show “Body Simulator preview: active”.

Owner verification:

1. Network response fields: `bodySimulatorPreviewActive`, `livePreviewTraceId`, `livePreviewDiagnostics`
2. Control Room → **Live Future Preview Trace** (read-only stage view)

---

## Control Room: Live Future Preview Trace

Read-only stages:

Public Future Input → Body Simulator Input → Body Fat Delta → Timeline Mapping → Focus Mapping → Anatomical Rules → Formatter Translation → Provider Attempt → Outcome

Uses `textContent` / DOM helpers. No editing.

On Control Room dry-run, stages may be synthesized from Body Simulator anatomical projection (zero provider calls). Public live generations return the full trace in the API response.

---

## Manual retest plan

Do **not** execute paid provider calls automatically from Cursor.

After deploy is green, owner manually sets:

```
BODY_SIMULATOR_LIVE_PREVIEW_ENABLED=1
```

for the Vercel environment that serves [https://helseapp-2.vercel.app](https://helseapp-2.vercel.app).

Inspect deploy config and set the flag on the correct scope (**Production** if that URL is the Production deployment; otherwise the Preview scope that maps to that URL).

Retest A–E with the same source image; after each run inspect Live Future Preview Trace / response diagnostics for BF, timeline, focus, non-empty anatomical rules, formatter consumption, and one provider call.

---

## Rollback

```
BODY_SIMULATOR_LIVE_PREVIEW_ENABLED=0
```

(or remove the variable)

No code rollback required. Legacy path resumes immediately.

---

## Next milestone

If manual retest proves the new pipeline visibly responds to body-fat / timeline / focus:

→ **Demand 023 — Simulator Evaluation & Calibration v1**

If images remain near-identical:

Do **not** jump to calibration. First diagnose:

- formatter translation too weak
- provider/model conditioning ignores translated rules
- image-to-image strength too conservative
- preservation weighting dominates transformation

Those become an explicit owner-reviewed patch.
