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

- Same Replicate provider / official model predictions endpoint family
- Default model remains `black-forest-labs/flux-kontext-pro`
- No moderation / billing / auth / account-trust changes
- Live path reuses the proven Flux Kontext Pro **request contract** from `lib/replicate.js` (Patch 022E-A)

---

## Provider Contract Parity

Patch **022E-A** fixes live-preview HTTP 502 (`live_preview_provider_failed`) caused by transport contract drift — not by Body Simulator / Anatomical / formatter failures.

### Legacy working contract (flag OFF)

`api/generate-future-you.js` → `generateWithReplicate` → `lib/replicate.js` `runPrediction` / `buildModelInput` for Flux:

| Field | Value |
| --- | --- |
| Model | `black-forest-labs/flux-kontext-pro` (code default) |
| Endpoint | `POST https://api.replicate.com/v1/models/{owner}/{name}/predictions` |
| Auth | `Authorization: Bearer <REPLICATE_API_TOKEN>` |
| Content-Type | `application/json` |
| Prefer | `wait=12` (capped; `CREATE_WAIT_SECONDS`) |
| Cancel-After | attempt budget seconds |
| Body | `{ input: { … } }` |
| Source image field | **`input_image`** (data URI) |
| Prompt | legacy reservedrift builders |
| Negative prompt | omitted for Flux |
| aspect_ratio | **`match_input_image`** |
| width / height | omitted |
| output_format | `png` |
| safety_tolerance | `2` |
| prompt_upsampling | on for long horizon (≥12m) and/or large BF delta (≥4) |

### Failing 022E contract (before 022E-A)

Live path used `AiOsRuntime` `transport_mock` → `ReplicateTransportAdapter` with formatter options that diverged:

| Field | Failing live value | Legacy |
| --- | --- | --- |
| aspect_ratio | **`3:4`** (forced via `formatterOptions.aspectRatio`) | `match_input_image` |
| prompt_upsampling | **omitted** | computed boolean |
| Prompt delivery | FluxFormatter + optional EXCLUSIONS appendix via transport | Flux `prompt` only |
| Transport stack | ReplicateTransportAdapter create/poll (+ AbortSignal create timeout) | `lib/replicate.js` create/poll |
| Failure message | generic `"Provider request failed."` | provider detail (still not structured) |

Body Simulator → Anatomical → formatter translation were already producing anatomical intent; only the final provider request contract was wrong.

### Root cause

Two stacked failures on the live path:

1. **Formatter enum leak (12‑month / pronounced magnitudes):** `BodySimulatorFormatterAdapter.anatomicalMagnitudePhrase` emitted the raw enum token `pronounced` into change descriptions. `validateFormattedImageRequest` rejected the prompt (`internal enum key leaked into prompt: pronounced`). AiOsRuntime never reached a healthy provider call; the live pipeline previously collapsed this to generic `live_preview_provider_failed` HTTP 502.
2. **Transport contract drift:** when formatting did succeed, live preview used `ReplicateTransportAdapter` with `aspect_ratio: "3:4"` (forced) and omitted `prompt_upsampling`, instead of the proven Flux Kontext Pro fields from `lib/replicate.js`.

### Corrected contract (flag ON, after 022E-A)

```
Public Future
→ Body Simulator → Anatomical → Formatter (anatomical prompt)
→ lib/replicate.js runFluxKontextProOnce / buildFluxKontextProInput
→ Replicate Flux Kontext Pro
→ result
```

- Anatomical prompt from Body Simulator formatter path (transformation authority unchanged)
- Provider body fields match legacy Flux: `prompt`, `input_image`, `aspect_ratio: match_input_image`, `output_format: png`, `safety_tolerance: 2`, `prompt_upsampling`
- Model unchanged: `black-forest-labs/flux-kontext-pro`
- Exactly one provider request; no cascade; no auto retry; no silent legacy transform fallback
- Structured safe diagnostics on failure: `providerHttpStatus`, `providerErrorCode`, `providerErrorCategory`, `providerModel`, `providerEndpointClass`, `providerInputFieldNames`, `providerResponseMessageSafe` (never token / Authorization / full image / data URI)

### Body Simulator remains authoritative

022E-A does **not** restore legacy reservedrift transformation intent. Coefficients / anatomical rules / BF-timeline-focus-effort-note priority are untouched. Only the provider transport contract is aligned.

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

## Neutral Anatomical Prompt Conditioning — Patch 022E-B

### Why

After 022E-A fixed transport contract parity, the live anatomical path reached Flux successfully and returned **E005** (provider sensitive-content flag). The same source image previously succeeded on the legacy Flux reservedrift path.

E005 therefore appeared only after the new anatomical prompt wording reached the provider — not because HelseApp prohibited underwear, and not because Body Simulator physiology changed.

### What 022E-B changes

Provider-facing prompt conditioning only:

| Layer | Change |
| --- | --- |
| Module | `src/ai/body-simulator/NeutralAnatomicalPromptConditioner.ts` |
| Wire-in | After FluxFormatter, before `runFluxKontextProOnce` / transport |
| Canonical anatomy | **Unchanged** (rules, BF delta, focus, magnitudes kept) |
| Body Simulator coefficients | **Unchanged** |
| Provider / model | **Unchanged** (`flux-kontext-pro`) |
| Provider moderation / safety bypass | **None** — external provider rules remain external |
| HelseApp clothing policy | **No regression** — ordinary adult underwear progress photos are not prohibited |

### Inspected prompt characteristics (repository, no paid calls)

Legacy slim path (`lib/visuellPrompt.js` `byggVisuellPrompt`):

- Short commanding English block
- Identity + clothing lock in one sentence
- Athletic / non-NSFW framing
- Zone and timeline sentences; fewer repeated `Preserve` lines

Anatomical FluxFormatter path (before 022E-B conditioning):

- Structured SOURCE / IDENTITY / SCENE / TRANSFORM / ANATOMY / REALISM sections
- Many repeated `Preserve …` lines
- Per-rule anatomical descriptions (`Apply anatomical subcutaneous fat on abdomen…`) with feature/region/priority metadata
- Longer character count and higher preservation-term repetition than legacy slim

Conditioned provider text (after 022E-B):

- Identity/preservation → transformation summary → compressed anatomical changes → realism
- One clothing phrase: `Preserve the subject's original clothing and coverage.`
- Midsection rules merged (fat + abdominal/oblique/waist definition)
- Max two neutral semantic support terms (`lean` / `defined` / `athletic`)
- Sensitive lexemes scrubbed from provider text only (`underwear`, `lingerie`, `sexy`, `erotic`, …)
- Optional notes: `defined abs` → `increase natural abdominal definition`; sexualized notes suppressed; stored canonical note unchanged

### Diagnostics (safe; no raw prompt / no image)

- `neutralPromptConditioningApplied`
- `providerPromptCharacterCount` / `WordCount` / `AnatomicalTermCount` / `SensitiveLexemeCount` / `PreservationTermCount`
- `providerPromptLexemeSuppressed` (machine-readable reasons)
- `removedReplacedTokenCategories`
- Control Room Live Future Preview Trace stage: **Neutral Prompt Conditioning** (counts + categories only)

### Manual retest (owner)

Do **not** run paid calls from Cursor. After deploy, with flag `=1`, retest BF 22→10 / 12 months / abs+thighs / strict. Expect:

- `neutralPromptConditioningApplied = true`
- `providerPromptSensitiveLexemeCount = 0`
- `providerRequestCount = 1`

If E005 persists: report provider error + prompt diagnostics; do **not** change Body Simulator physiology.

---

## Patch 022E-C — Provider Safety Attribution

### Why

After 022E-B, live anatomical preview still returned **E005** (provider sensitive-content flag) despite:

- `neutralPromptConditioningApplied = true`
- `providerPromptSensitiveLexemeCount = 0`
- Flux Kontext Pro transport parity from 022E-A

Ordinary adult underwear progress photos remain **allowed** by HelseApp product policy. Provider moderation remains external and was not weakened or bypassed.

### Legacy vs live contract comparison (repository inspection; no paid calls)

| Dimension | Legacy (flag OFF) | Live anatomical (flag ON, after 022E-C) |
| --- | --- | --- |
| Model | `black-forest-labs/flux-kontext-pro` (cascade may try Max/Dev on E005) | Same Pro model only — **one** request, no cascade |
| Endpoint | `replicate_official_model_predictions` | Same |
| Image field | `input_image` data URI via `toDataUri(buffer, mime)` | Same construction (`serializeImageDataUriLikeLegacy` / API `toDataUri`) |
| Image MIME / bytes | Client buffer + `mimeType` | Same buffer path when flag ON in `api/generate-future-you.js` |
| Image serialization drift | — | **None proven** (`serializationMatchesLegacy` when URI is legacy-shaped) |
| `aspect_ratio` | `match_input_image` | Same |
| `output_format` | `png` | Same |
| `safety_tolerance` | `2` | Same (not raised) |
| `prompt_upsampling` | long horizon / large BF delta | Same helper |
| Prompt | Slim athletic reservedrift (`byggVisuellPrompt`) | Neutral-conditioned anatomical intent |
| Negative / exclusions | Omitted for Flux | Omitted |
| E005 recovery | Cascade to alternate models | **None** (by design; no auto-retry / no fallback) |

### Prompt conditioning confirmation

Live path still applies `conditionAnatomicalProviderPrompt` before `runFluxKontextProOnce`.

022E-C bounded repairs to **provider-facing** wording only (canonical rules unchanged):

- Removed unnecessary **adult-status** framing (`same adult person` → `same person`)
- Removed **clothing coverage** meta (`clothing and coverage` → `clothing`)
- Compressed conditioned prompt to a single photographic space-joined block

Diagnostics prove:

- `promptConditioningApplied = true`
- `sensitiveLexemes = 0`
- conditioned prompt hash recorded (SHA-256 of provider text only)

### Best-supported E005 attribution (no paid isolation probe)

`ProviderSafetyAttributionDiagnostic` (`schemaVersion: 1`):

- **classification:** `likely_prompt_image_combination` when image + provider field parity hold, conditioning is applied, and sensitive lexeme count is zero
- **confidence:** `medium` (never `high` for E005 without a paid input/output isolation probe)
- **reasons (machine-readable):** include `e005_api_message_ambiguous_input_or_output`, `image_serialization_matches_legacy_toDataUri`, `provider_request_fields_match_legacy_flux_contract`, `neutral_prompt_conditioning_applied`, `provider_prompt_sensitive_lexeme_count_zero`, `legacy_generateWithReplicate_may_cascade_on_e005`, `live_path_single_request_no_cascade`

Unresolved differences (owner decision — not auto-changed):

- Prompt content still differs from legacy slim athletic framing
- Legacy path may cascade alternate models on E005; live path does not
- E005 message does not distinguish input vs output
- No paid provider attribution probe from Cursor

### Defects repaired

- Missing safe pre-request / E005 attribution diagnostic → `ProviderSafetyAttributionDiagnostic`
- Unnecessary provider-facing adult/coverage meta from 022E-B conditioner
- Conditioned prompt multi-paragraph verbosity vs legacy single block
- Control Room lacked read-only Provider Safety Attribution surface

### Confirmations

- No safety bypass / override button
- Provider moderation remains external
- `safety_tolerance` unchanged at `2`
- Model/provider unchanged
- Body Simulator physiology / Anatomical coefficients unchanged
- Ordinary adult underwear remains allowed by HelseApp product policy
- No clothing-morality or sexual-intent classifier introduced

### Manual retest (owner)

Do **not** run paid calls from Cursor. After deploy, with flag `=1`, retest BF 22→12 / 12 months / core-abs / strict using the same source image. Inspect:

- `providerSafetyAttribution.attribution.classification`
- `requestParity.*`
- prompt + image metrics
- `repairedDefects` / `unresolvedDifferences`

If success: stop prompt/safety churn and evaluate transformation quality.  
If E005 persists: remaining issue is likely outside authorized HelseApp repair (prompt-image combination under external moderation, and/or legacy cascade asymmetry) — owner decision required.

---

## Provider capability evaluation (022E-D)

Investigation-only report (no routing/provider implementation at the time):

→ [22E-D — Provider Capability & Fallback Evaluation](./22E_D_PROVIDER_CAPABILITY_EVALUATION.md)

Typed freeze: `src/ai/body-simulator/ProviderCapabilityEvaluationReport.ts`.

Historical finding (pre-022E-E): legacy `generateWithReplicate` may cascade to Max/Dev after E005; live Body Simulator path used one Flux Kontext Pro request and did not fall back. Ordered fallback was recommended; **implemented in Patch 022E-E** below.

---

## Patch 022E-E — Intelligent Flux Routing Restored

**Root cause:** Live Body Simulator preview was wired to `runFluxKontextProOnce()` (Pro only, 1 attempt) while legacy `generateWithReplicate` retained intelligent Flux cascade (`needsMaxEdit` / `isHighE005Risk`, Max-first, Dev recovery). That single-Pro routing regression made legitimate progress-photo E005s look like hard product failures even when sibling Flux models might accept the same anatomical intent.

### Canonical transform (unchanged authority)

```
Body Simulator → Anatomical → Formatter → NeutralAnatomicalPromptConditioner
→ Intelligent Flux Router (buildFluxAttemptPlan + runFluxKontextAnatomicalCascade)
→ Replicate
```

### Shared planner

`lib/replicate.js` `buildFluxAttemptPlan(...)` → `{ preferMax, highE005Risk, skipSiblingPremium, routingReason, attempts }`.

| Route | Order |
| --- | --- |
| Mild | Pro → Max → Dev |
| Demanding | Max → Pro → Dev |
| Demanding + high E005 risk | Max → Dev (**Pro skipped**) |

Owner fixture (thresholds unchanged): BF 22→12, fat decrease, strong, 12m, Core/abs → `needsMaxEdit=true`, `highE005Risk=true`, Max first, Pro skipped.

### Anatomical cascade (not legacy reservedrift)

`runFluxKontextAnatomicalCascade`:

- Uses the **supplied conditioned anatomical prompt** for every attempt (same prompt hash / same image bytes)
- Does **not** call `byggVisuellPrompt` / `composeGoalBrief` / Dev-strong / SDXL
- Max 3 sequential attempts; stop on first success
- Eligible failures match legacy (E005/safety, timeout, 5xx, missing model)
- Success on first attempt = 1 paid request

### Wiring

- `runLiveFuturePreview` → `runFluxKontextAnatomicalCascade` (API injects `fluxCascade`)
- Test adapters may still inject `fluxProvider` (single-call) or `fluxCascade`
- Public Goal Image on cascade success: `usedFallback: false` (no “Safety fallback” UX)
- Control Room Live Future Preview Trace includes read-only **Flux Routing** stage

### Diagnostics

`providerRoutingStrategy: "flux_ordered_fallback"`, `providerRoutingReason` (`mild` | `demanding` | `demanding_high_e005_risk`), `providerAttemptPlan`, `providerAttempts[]`, `providerRequestCount`, `providerFallbackUsed`, `providerSuccessfulModel`, `providerInitialModel`, `providerFinalOutcome`.

### Preserved

- NeutralAnatomicalPromptConditioner, ProviderSafetyAttributionDiagnostic (updated for attempt failure + logical success via fallback)
- `safety_tolerance: 2`; no moderation bypass
- Body Simulator physiology / Anatomical coefficients unchanged
- No public model selector; no SDXL for Future You body transforms

### Manual validation (owner)

Do **not** run paid calls from Cursor. After deploy with flag `=1`, retest BF 22→12 / 12 months / core-abs / strict and inspect Flux Routing diagnostics.

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
