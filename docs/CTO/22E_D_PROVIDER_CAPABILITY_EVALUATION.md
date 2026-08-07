# Provider Capability & Fallback Evaluation

Status:  
Investigation & architecture recommendation (Demand 022E-D).  
**Ordered fallback (OPTION B) — IMPLEMENTED by Patch 022E-E** (`buildFluxAttemptPlan` + `runFluxKontextAnatomicalCascade`).

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Related: [22E — Anatomical Live Preview Integration](./22E_ANATOMICAL_LIVE_PREVIEW_INTEGRATION.md) (incl. 022E-C attribution), [22D — Anatomical Transformation Engine](./22D_ANATOMICAL_TRANSFORMATION_ENGINE.md), [22 — Body Simulator v1](./22_BODY_SIMULATOR_V1.md), [17 — Internal AI Image Preview](./17_INTERNAL_AI_IMAGE_PREVIEW.md), [11 — Replicate Transport Adapter](./11_REPLICATE_TRANSPORT_ADAPTER.md)

Typed report: `src/ai/body-simulator/ProviderCapabilityEvaluationReport.ts` (`schemaVersion: 1`)

---

## Context

After 022E-A/B/C, Body Simulator + Anatomical rules reach Flux Kontext Pro with a proven transport contract and neutral prompt conditioning. Some legitimate adult progress-photo inputs still return provider **E005**. This demand evaluates whether the **provider/model architecture** (including legacy cascade asymmetry) is appropriate — without changing routing, models, moderation, physiology, or prompts.

---

## Confirmed pipeline state

From repository + sealed prior demands (no paid calls in 022E-D):

- Body Simulator executes correctly
- Anatomical Transformation Engine executes correctly
- BF deltas, timeline, effort, focus-zone mapping work
- Canonical anatomical rules are generated; formatter consumes them
- Neutral provider prompt conditioning is active; sensitive lexeme count can be `0`
- Live request contract matches legacy Flux Kontext Pro fields (`input_image`, `aspect_ratio: match_input_image`, `safety_tolerance: 2`, …)
- Provider may still return E005 for some legitimate adult progress-photo inputs
- HelseApp does **not** prohibit ordinary adult underwear progress photos
- Provider moderation remains external

---

## Provider inventory

Only providers/models **implemented in this repository** are listed. No web pricing browse. No invented vendors.

| ID | Provider | Model | Primary files | Status / usage |
| --- | --- | --- | --- | --- |
| replicate-flux-kontext-pro | Replicate | `black-forest-labs/flux-kontext-pro` | `lib/replicate.js`, transport adapter, `api/generate-future-you.js`, AI OS preview | **Current primary** (Vercel Future You default; live Body Simulator; AI OS default) |
| replicate-flux-kontext-max | Replicate | `black-forest-labs/flux-kontext-max` | `lib/replicate.js` | Legacy cascade (demanding primary / premium sibling) |
| replicate-flux-kontext-dev | Replicate | `black-forest-labs/flux-kontext-dev` | `lib/replicate.js`, `lib/visuellPrompt.js` | Legacy cascade recovery (`dev` / `devStrong` prompt variants) |
| replicate-sdxl | Replicate | `stability-ai/sdxl:7762fd07…` | `lib/replicate.js` | Legacy emergency slot; **skipped / never success** for Future You body transforms |
| openai-images-edits | OpenAI | `gpt-image-1` (default) | `server/lib/imageProviders.js`, `server/index.js` | Expo/local Express only — **not** Vercel Future You |
| replicate-transport-adapter-ai-os | Replicate | Pro default (`AI_OS_V2_REPLICATE_MODEL` override) | `src/ai/transport/*`, Control Room preview | Internal single-cycle preview / transport foundation |

Full field-level inventory (endpoint, image field, timeouts, tests) is frozen in `buildProviderInventory()`.

---

## Legacy generation cascade

Path (flag **OFF**):

```
public Future UI
→ api/generate-future-you.js
→ generateWithReplicate (lib/replicate.js)
→ needsMaxEdit / isHighE005Risk route
→ ordered attempts (cascade budget 155s, ~35s/attempt)
→ returned imageUrl or friendly error
```

### Exact model order

Constants (`lib/replicate.js:24-28`):

- Pro = `black-forest-labs/flux-kontext-pro`
- Max = `black-forest-labs/flux-kontext-max`
- Dev = `black-forest-labs/flux-kontext-dev`
- SDXL versioned fallback constant (not returned as success for body transforms)

| Route | Attempt order |
| --- | --- |
| Mild (`needsMaxEdit` false) | Pro → Max → Dev (`dev`) → Dev (`devStrong`) → [SDXL only if not body transform] |
| Demanding (`needsMaxEdit` true) | Max → Pro → Dev → Dev-strong → [SDXL…] |
| Demanding + high E005 risk (`fat=decrease`, `intensity=strong`, BF Δ≥4) | Max → Dev → Dev-strong (**Pro sibling skipped up front**) |

`needsMaxEdit` (`lib/replicate.js:335-367`): large BF Δ≥4, strong+Δ≥2, strong+≥4 zones, fat increase to BF≥28, or ≥12 months with Δ≥2. Comment notes Max is ~2× cost with stronger adherence.

### E005 / fallback facts

| Question | Answer | Evidence |
| --- | --- | --- |
| Does E005 trigger cascade continuation? | **Yes** | `isSafetyBlock` → `safetyHit` → `canContinue` (`lib/replicate.js:1548-1550`, `2320-2347`) |
| Does fallback change model? | **Yes** | Next entry in `uniqueAttempts` |
| Does fallback change provider? | **No** | Still Replicate |
| Do prompts change between attempts? | **Yes for Dev** | `promptVariant: "dev" \| "devStrong"` → `byggVisuellPrompt` force lines (`lib/visuellPrompt.js:427-434`) |
| Do image bytes change? | **No** | Same `imageDataUri` for all attempts |
| Does `safety_tolerance` change? | **No for Flux** | Always `2` in `buildModelInput` / `buildFluxKontextProInput` |
| Does request contract change? | **Yes if SDXL reached** | Flux uses `input_image`; SDXL uses `image` + `negative_prompt` + `prompt_strength` — but body transforms skip/reject SDXL |

Typed freeze: `LegacyGenerationCascadeReport` via `buildLegacyGenerationCascadeReport()`.

---

## Body Simulator live provider path

Path (flag **ON** = `BODY_SIMULATOR_LIVE_PREVIEW_ENABLED=1`) — **after 022E-E**:

```
Public Future
→ PublicFutureToBodySimulatorAdapter
→ Body Simulator → Anatomical Engine
→ BodySimulatorFormatterAdapter → FluxFormatter
→ NeutralAnatomicalPromptConditioner
→ buildFluxAttemptPlan + runFluxKontextAnatomicalCascade (lib/replicate.js)
→ ordered Flux Max/Pro/Dev (max 3; same anatomical prompt)
→ result or structured error
```

| Dimension | Live (flag ON, 022E-E) |
| --- | --- |
| Provider | Replicate |
| Model | Ordered Flux family via `buildFluxAttemptPlan` (mild: Pro-first; demanding: Max-first; high E005 risk: Max→Dev, Pro skipped) |
| Attempts | **≤3** sequential |
| Fallback | **Ordered Flux** (eligible failures only) |
| Auto retry | **None** (no same-model loop) |
| Silent legacy reservedrift recovery | **None** (`api/generate-future-you.js` live `catch` returns JSON error; does not call `generateWithReplicate`) |
| E005 handling | Continue cascade when eligible; all-fail → `live_preview_provider_failed` + attribution |
| Contract | Proven Flux fields via `buildFluxKontextProInput` (`safety_tolerance: 2`); same prompt/image across attempts |

Historical (022E-D evidence of pre-fix regression): `runFluxKontextProOnce` was Pro-only / no cascade. Kept as a helper; live path now injects `fluxCascade: runFluxKontextAnatomicalCascade`.

---

## E005 comparison

### Part 4 — asymmetry statement

> “The legacy path may appear more tolerant because it can fall through to another model after Flux Kontext Pro returns E005, while the Body Simulator live path stops after one Flux Kontext Pro request.”

**Proven TRUE** with code evidence:

1. Legacy continues on safety/E005: `lib/replicate.js:2320-2347` (`safetyHit && isPremiumFluxLabel` skips sibling premium; `canContinue` includes `safetyHit`).
2. Live helper has no cascade: `lib/replicate.js:2040-2105` (`runFluxKontextProOnce`).
3. Live API catch does not recover via `generateWithReplicate`: `api/generate-future-you.js:145-187`.
4. Pipeline enforces one provider request: `LiveFuturePreviewPipeline.ts:1050`.

### Attribution update (post-cascade inspection)

Prior (022E-C): `likely_prompt_image_combination` / medium — when image+field parity hold and sensitive lexemes are zero.

**Updated interpretation:** `unknown_confounded_by_cascade_asymmetry_with_model_specific_moderation_hypothesis` (confidence **medium**).

- Not a proven HelseApp **pipeline defect** (parity holds).
- Not proven as a **provider-wide** input ban (cascade stays on Replicate Flux family).
- Legacy vs live outcome comparisons are **confounded** by cascade asymmetry until a paid **single-model** isolation experiment runs.
- Owner should not prohibit underwear to “fix” one model’s external moderation.

---

## Provider capability matrix

Qualitative ratings only. **Unknown** unless supported by repo behavior, tests, or project docs. No external performance claims.

| Capability | Flux Pro | Flux Max | Flux Dev | SDXL | OpenAI gpt-image-1 |
| --- | --- | --- | --- | --- | --- |
| Image-to-image editing | Excellent | Excellent | Excellent | Acceptable | Good |
| Identity / pose / clothing / background preserve | Unknown | Unknown | Unknown | Unknown | Unknown |
| Fine BF / muscle edit quality | Unknown | Unknown | Unknown | Unknown | Unknown |
| Photorealism | Unknown | Unknown | Unknown | **Poor** (cartoon risk documented) | Unknown |
| Low no-op tendency | Unknown | Unknown | Unknown | Unknown | Unknown |
| Adult progress-photo suitability (product fit) | Acceptable | Acceptable | Acceptable | Poor | Unknown |
| Underwear reliability under provider moderation | Unknown | Unknown | Unknown | Unknown | Unknown |
| Latency | Unknown | Unknown | Unknown | Unknown | Unknown |
| Cost (repo-relative only) | Good (default / cost control) | Acceptable (~2× vs Pro in code comment) | Unknown | Unknown | Unknown |
| Implementation maturity | Excellent | Good | Good | Acceptable | Acceptable |
| Fallback suitability | Acceptable | Good | Good | **Poor** | Unknown |
| Production suitability (Future You body) | Good | Acceptable | Acceptable | **Poor** | Unknown (not on Vercel path) |

---

## Model roles

Recommendation only — **routing unchanged**.

| Model | Role | Rationale |
| --- | --- | --- |
| Flux Kontext Pro | primary | Code default + live path + AI OS default |
| Flux Kontext Max | fallback | Legacy demanding / premium sibling |
| Flux Kontext Dev | fallback | Legacy E005 recovery candidate |
| SDXL | unsuitable | Cartoon risk; skipped for body transforms |
| OpenAI gpt-image-1 | diagnostic_only | Expo server only; no live Body Simulator contract |

---

## Architecture options

| Option | Summary | Complexity | Notes |
| --- | --- | --- | --- |
| **A — Single model** | One model for all body transforms | Low | Current live path; fragile on external E005 |
| **B — Ordered fallback** | Primary → eligible failure → next approved model | Medium | Matches legacy cascade shape; each model keeps own policy |
| **C — Transformation-aware routing** | Route by fat-loss / muscle / magnitude | High | Partial legacy via `needsMaxEdit`; needs calibration |
| **D — Provider/moderation fallback** | Different provider after refusal | High | OpenAI exists only on Expo server; premature |

Comparison dimensions (complexity, quality consistency, cost, latency, observability, lock-in, moderation reliability, operational risk) are encoded in `architectureOptions` on the typed report.

---

## Recommended architecture

**OPTION B — Ordered fallback** — **IMPLEMENTED by 022E-E**.

022E-D recommended this architecture without implementing it. Patch 022E-E restores intelligent Flux routing on the live anatomical path via shared `buildFluxAttemptPlan` + `runFluxKontextAnatomicalCascade` (same conditioned anatomical prompt; max 3 attempts; no SDXL / no Dev-strong reservedrift; no moderation bypass).

Reasons (original 022E-D):

1. Legacy already demonstrates E005 continuation to alternate Flux models under their own moderation.
2. Live single-Pro path made external refusals look like product hard-fails even when siblings might accept.
3. Preserves one primary on the success path; improves reliability without weakening HelseApp or provider safety.
4. Lower complexity than C/D before manual single-model evidence exists.

Fallback must **never** be designed or marketed as a moderation bypass.

---

## Risks

- Multiple paid attempts → higher cost/latency on failure paths
- Quality variance across Pro / Max / Dev for the same anatomical intent
- Observability debt if attempt labels are not surfaced
- Mis-framing fallback as “safety bypass” (forbidden)
- Cross-provider (Option D) contract/billing/UX risk if chosen too early
- Prohibiting ordinary underwear to please one model would violate product policy

---

## Moderation boundary

- Provider safety remains **external** and respected
- No HelseApp moderation override / bypass button
- `safety_tolerance` remains `2` in code (not raised by this demand)
- Fallback (if later approved) may only invoke another model/provider under **its own** normal policy and terms

---

## HelseApp product-policy requirements

Preserved owner-approved requirements:

- Adult-only; account users 18+
- Ordinary adult progress photography may include underwear
- Visible torso acceptable
- Body-transformation intent is not inherently sexual
- No pornography generation
- No sexual-intent inference from body type or clothing alone
- Provider safety external and respected

If a provider cannot support this use case, that is a **provider suitability** problem — not an automatic product-policy change.

---

## Manual provider evaluation plan

**Do not run from Cursor.** Owner-run only. Max **3** paid requests initially (one per candidate).

### Candidates

1. `black-forest-labs/flux-kontext-pro` (current primary)
2. `black-forest-labs/flux-kontext-max`
3. `black-forest-labs/flux-kontext-dev`

### Fixed case

| Field | Value |
| --- | --- |
| Source image | Same file for all three |
| Body Simulator rules | Same canonical output (flag ON path prep; or freeze anatomical prompt text) |
| Current BF | 22 |
| Target BF | 12 |
| Timeline | 12 months |
| Focus | Core / abs |
| Effort | Strict / max (`strong`) |
| Models | **One at a time** — no cascade |

### Evaluation criteria

- request accepted
- identity preservation
- visible fat reduction
- abdominal definition
- natural proportions
- clothing preservation
- background preservation
- artifacts
- latency
- failure classification (incl. E005 vs success)

### Template (copy per run)

```
Date:
Operator:
Source image id/hash:
Model:
Trace id:
Accepted (Y/N):
Failure class / E005 (Y/N):
Identity (1–5):
Fat reduction (1–5):
Abs definition (1–5):
Proportions (1–5):
Clothing (1–5):
Background (1–5):
Artifacts (none/mild/severe):
Latency (s):
Notes:
```

---

## Provider-neutral future architecture

Recommended principle (not implemented):

```
Body Simulator / Anatomical (provider-agnostic)
→ provider-neutral formatter contract (FormattedImageRequest / proven field map)
→ provider selector (owner policy; outside Body Simulator)
→ provider-specific adapter (Replicate Flux / future OpenAI / …)
→ transport
```

Body Simulator must **never** know which provider/model generates the image. Today the live bridge injects `runFluxKontextProOnce` at the API/pipeline edge — keep provider knowledge at that edge only. Do **not** implement a selector in 022E-D.

---

## Owner decisions required

Do **not** take automatically:

- changing primary provider or model
- enabling fallback / multiple paid attempts on the live path
- pricing assumptions
- provider moderation configuration
- production cutover
- removing Flux Kontext Pro
- selecting a new external provider

---

## Next milestone

1. Owner runs the **manual single-model** experiment (3 candidates max).
2. If Pro accepts and quality is good → keep Option A operationally; stop prompt/safety churn.
3. If Pro E005s but Max/Dev accept under own policy → owner may authorize a later demand to implement **Option B** with attempt diagnostics (still no safety bypass).
4. If all Replicate Flux candidates refuse legitimate underwear progress photos → treat as provider suitability; only then evaluate Option D with an explicit adapter demand.
5. Transformation quality calibration remains Demand **023** territory after a stable accepted provider path.

---

## Confirmations (022E-D)

- 022E-D itself: investigation/docs only (no routing implementation at the time)
- No moderation weakening; `safety_tolerance` unchanged
- No Body Simulator / Anatomical physiology or coefficient changes
- No paid provider requests from this demand
- No env var changes
- No new dependencies

## Follow-up (022E-E)

- Ordered fallback **IMPLEMENTED** on the live Body Simulator path (see [22E Anatomical Live Preview Integration — Patch 022E-E](./22E_ANATOMICAL_LIVE_PREVIEW_INTEGRATION.md#patch-022e-e--intelligent-flux-routing-restored))
