# 21 — Body Analysis Engine foundation

**Status:** Demand 021 preparation — migration-safe architecture only  
**Activation:** none (no analysis, no UI, no storage, no vision provider)

---

## Approved product directions

These directions are **owner-approved**. They must **not** be listed as undecided.

1. **Visual body-fat estimation** — approved future capability, **not implemented**.
2. **Front / side / back analysis** — approved future capability, **not implemented**.
3. **Body Analysis exists to improve simulation realism and longitudinal progress tracking.**

Demand 021 prepares typed contracts and defaults only. It does **not** activate these features.

---

## Primary purpose (permanent product rule)

> The primary purpose of Body Analysis is to improve realistic body simulation and longitudinal progress tracking.

Body Analysis **may** support:

- better TransformationPlan inputs
- better body-region planning
- better identity and proportion preservation
- more consistent comparisons over time
- confidence-aware simulation decisions

Body Analysis **must not** produce:

- beauty scores
- attractiveness scores
- body rankings
- ideal-body rankings
- shame-based labels
- normal-versus-abnormal judgments
- value judgments about height, weight, shape or proportions
- competitive ranking between users

Operational readiness and confidence are allowed. Human-value judgments are not.

---

## Visual body-fat estimation reservation

**Roadmap:** Approved future capability — not implemented.

### Contract

`VisualBodyFatEstimate` with:

- `status`: `not_run` | `estimated` | `insufficient_input` | `not_supported`
- `estimatedPercent`: `number | null`
- `uncertainty`: `{ lowerPercent, upperPercent }`
- `confidence` + `confidenceReasons: string[]`
- `origin`: `future_model_estimate` | `unknown`
- `evidenceSourceIds`, `modelMetadata`, `limitations`

### Demand 021 default

```ts
{
  status: "not_run",
  estimatedPercent: null,
  uncertainty: { lowerPercent: null, upperPercent: null },
  confidence: "not_applicable",
  confidenceReasons: [],
  origin: "unknown",
  evidenceSourceIds: [],
  modelMetadata: {
    providerId: null,
    modelId: null,
    modelVersion: null,
    calibrationVersion: null
  },
  limitations: [
    "Visual body-fat estimation is approved as a future capability but is not implemented."
  ]
}
```

### Permanent rules

- Visual estimation is separate from user-declared body-fat percentage
- Visual estimation is separate from device measurement
- Visual estimation is separate from professional measurement
- Estimates must never overwrite declared or measured values
- Provenance must always be preserved
- A future estimate must include uncertainty and confidence
- A future estimate must never be presented as a medical measurement
- No clinical-accuracy claim is allowed
- No estimate is generated in Demand 021
- No provider or model is selected in Demand 021
- No user-visible percentage is added in Demand 021
- No fake realistic estimate is placed in fixtures

---

## Multi-view body analysis reservation

**Roadmap:** Approved future capability — not implemented.

Front, side and back photographs are approved future analysis inputs.

### Contracts

- `ProgressPhotoView`: `front` | `side` | `back`
- `MultiViewBodyAnalysisImage` (per view, with separate `evidence`)
- `MultiViewBodyAnalysisInput`
- `MultiViewBodyAnalysisReadiness`

### Permanent rules

- Single-image analysis remains architecturally possible
- Demand 021 does not require three images
- Demand 021 does not add capture UI
- Demand 021 does not add storage
- Demand 021 does not call a vision provider
- Each view keeps separate evidence and confidence
- Observations from different views retain provenance
- Conflicting observations must not be silently merged
- Browser-supplied storage identifiers are never authoritative
- No subscription tier is selected in Demand 021

---

## Confidence reasons

Preferred shape: `confidenceReasons: string[]`

Allowed structured examples:

- `whole_body_visible`
- `front_view_available`
- `side_view_available`
- `back_view_available`
- `even_lighting`
- `known_camera_view`
- `feet_outside_frame`
- `strong_backlight`
- `body_region_occluded`
- `single_view_only`

Rules:

- use structured machine-readable reasons
- do not use insulting or judgmental language
- do not claim certainty from confidence alone
- missing evidence lowers confidence rather than fabricating values

---

## Still open (implementation decisions)

Only these remain unresolved — **not** product direction:

- provider and model
- calibration and acceptable error
- uncertainty presentation
- whether multi-view is optional or required
- capture workflow
- user correction workflow
- subscription and pricing
- storage lifecycle

Also still open where listed in the owner brief:

- validation dataset
- resolution of conflicting observations
- data-retention period

---

## Code map

| Path | Role |
|------|------|
| `src/ai/body-analysis/types.ts` | Confidence, evidence, purpose, forbidden outputs |
| `src/ai/body-analysis/VisualBodyFatEstimate.ts` | Visual BF estimate contract + default |
| `src/ai/body-analysis/MultiViewBodyAnalysis.ts` | Front/side/back contracts + readiness |
| `src/ai/__tests__/bodyAnalysisReservations.test.ts` | Tests 67–84 |

---

## Related

- [19 — Personal Progress Library](./19_PERSONAL_PROGRESS_LIBRARY.md)
- [20 — Guided Progress Photo Capture](./20_GUIDED_PROGRESS_PHOTO_CAPTURE.md)
