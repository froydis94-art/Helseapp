# Controlled Legacy vs Body Simulator Generation

Status:  
Internal manual comparison — no production rollout

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Related: [22 — Body Simulator v1](./22_BODY_SIMULATOR_V1.md), [22A — Shadow Integration](./22A_BODY_SIMULATOR_SHADOW_INTEGRATION.md), [22B — First End-to-End Preview](./22B_FIRST_END_TO_END_PREVIEW.md), [22D — Anatomical Transformation Engine](./22D_ANATOMICAL_TRANSFORMATION_ENGINE.md), [17 — Internal AI Image Preview](./17_INTERNAL_AI_IMAGE_PREVIEW.md)

---

## Purpose

Demand 022C adds a controlled internal comparison mode so the owner can generate and compare:

- **A — Legacy** transformation path (deprecated baseline)
- **B — Body Simulator** transformation path (default)

under otherwise equivalent generation conditions, answering whether Body Simulator produces a more faithful, realistic, and useful future-body visualization than the legacy path.

Every provider request must be explicitly initiated by the owner. No automatic pair generation. No production cutover.

---

## Experimental principle

For a valid comparison, A and B must use the same:

- source image
- Control Room session
- selected high-level scenario
- provider family / model
- image dimensions / output count
- transport / timeout / retry policy
- source-image processing contract
- preservation baseline

Only the transformation source may differ.

---

## Legacy baseline

- Explicitly marked deprecated (`deprecatedBaseline: true`)
- Control Room / internal preview only
- Never public production; never default production; never auto-selected
- Uses the existing pre-Body-Simulator transformation intent path (TransformationEngine → RenderPlan → FluxFormatter)
- `bodySimulatorRules: null` in diagnostics
- Same provider/model as the Body Simulator comparison when the owner keeps conditions fixed
- Maximum one provider request per manual click

---

## Body Simulator path

```
Fixture / canonical input
→ Body Simulator v1
→ verified canonical Transformation Rules
→ BodySimulatorFormatterAdapter (translate only)
→ existing formatter
→ existing provider
→ preview
```

Body Simulator remains authoritative on its path. Formatter must not recalculate magnitude, timeline, confidence, moderation, or remove preservation. No legacy fallback on Body Simulator failure.

Canonical rule verification runs **before** any provider call. On failure: `body_simulator_rule_verification_failed` and zero provider calls.

---

## Same-condition requirements

Comparability requires matching source fingerprint/selection id, scenario, provider, model, dimensions, and output count. Warnings are shown when conditions differ. Non-comparable pairs must not claim causal conclusions.

---

## One provider request per click

Hard rule:

> one manual click = maximum one provider request

No automatic retry, alternate-path retry, other-variant generation, or speculative pre-generation. Billing confirmation remains required. No Run Both / Generate pair / Auto compare / Batch compare.

---

## Source-image session fingerprint

Preferred: SHA-256 over source file bytes via browser Web Crypto **before** upload. Store only the fingerprint in memory.

Fallback: opaque `sourceImageSelectionId` when Web Crypto is unavailable (documented limitation).

Not identity verification. No face recognition. Not sent to analytics. Not persisted.

---

## Comparison history

`BodySimulatorComparisonRun` (schemaVersion 1) lives in browser memory only:

- no database / localStorage / sessionStorage / IndexedDB / cookies
- clear on Control Room lock and page refresh
- maximum 20 runs
- never store source binary, data URI, access key, or provider token
- generated image URL used only for existing session preview display

---

## Side-by-side result inspection

Owner selects Legacy A + Body Simulator B. When both succeeded, display images (existing preview URL behavior), path labels, scenario, provider/model, duration, formatter version, prompt length, warnings, and limitations. Neutral labels only (“Legacy result” / “Body Simulator result”). No public share/export.

---

## Manual evaluation

Six categories (1–5 or Not assessable), optional internal note:

1. Identity preservation  
2. Body-change realism  
3. Transformation matches intended goal  
4. Natural proportions  
5. Clothing/presentation preservation  
6. Overall usefulness  

Session only. Not sent to provider or analytics. No automatic training or rule change. Evaluates simulator quality, not the person’s body. No beauty/attractiveness categories.

---

## Calibration observation contract

`SimulatorCalibrationObservation` (schemaVersion 1) is a current-session preview contract only.

Do not persist, upload, train on, or automatically modify simulator coefficients. Demand 023 may introduce durable calibration with separate owner approval.

---

## Privacy

Preserves Control Room access key, adult/consent/image-rights confirmations, billing confirmation, rate limits, and provider moderation. No new content classification (age/attractiveness/sexuality/ethnicity/medical analysis from images). Source and generated images are not persisted by HelseApp.

---

## No persistence

Comparison history, evaluations, fingerprints, and calibration observations are session memory only.

---

## No automatic model training

Manual evaluation and calibration observation never auto-train models or alter Body Simulator coefficients.

---

## No production cutover

`api/generate-future-you.js` and public HelseApp UI remain unchanged. Legacy path cannot become a production generate path.

---

## Manual verification checklist

Agent does **not** execute paid Replicate calls.

1. Unlock Control Room; select a source image and scenario.
2. Choose **Legacy**, confirm billing, generate once.
3. Keep the same source/scenario/settings; choose **Body Simulator**, confirm billing, generate once.
4. Select Legacy A + Body Simulator B; confirm comparable.
5. Inspect side-by-side, complete manual evaluation, review FormatterComparison / GenerationDiagnostics / PipelineSnapshot / calibration preview.
6. Lock Control Room — comparison session clears.

---

## Known limitations

- Source fingerprint uses original file bytes; canvas recompression does not change the fingerprint key for pairing within a selection.
- If Web Crypto is unavailable, opaque `sourceImageSelectionId` is used instead of SHA-256.
- Width/height may be null in run records when the provider does not return dimensions; null===null still matches for comparability.
- Prompt Isolation Lab continues to use the Body Simulator path for its diagnostic runs (separate lab).

---

## Next milestone

**Demand 023 — Simulator Evaluation & Calibration v1**

Demand 023 may introduce:

- durable consented calibration cases
- reference-result metadata
- systematic evaluation
- comparator metrics
- regression test sets

It must not automatically retrain or change production simulator behavior without separate owner approval.

---

## Code map

| Path | Role |
| --- | --- |
| `src/ai/control-room/BodySimulatorComparison.ts` | Paths, verification, comparability, calibration contract |
| `src/ai/control-room/ImagePreviewService.ts` | `generationPath` wiring + one provider call |
| `api/ai-os-image-preview.ts` | Allowlisted `generationPath` |
| `public/ai-os-control-room.*` | Generation Comparison UI (session only) |
| `src/ai/__tests__/bodySimulatorComparison.test.ts` | Focused 022C tests |
| `docs/CTO/22C_CONTROLLED_SIMULATOR_COMPARISON.md` | This document |
