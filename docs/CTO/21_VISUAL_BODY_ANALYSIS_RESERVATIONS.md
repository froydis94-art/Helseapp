# Visual Body Analysis Reservations

Status:  
Demand 021 preparation — migration-safe contracts only

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Related: [Personal Progress Library](./19_PERSONAL_ACCOUNT_TRUST_AND_VAULT.md), [Guided Progress Photo Capture](./20_GUIDED_PROGRESS_PHOTO_CAPTURE.md)

## Roadmap status (owner-approved)

### Visual body-fat estimation

**Approved future direction — not implemented.**  
Roadmap status: `approved_future_direction`

Do not list this product direction as undecided. Only implementation choices remain open.

### Front / side / back analysis

**Approved future direction — not implemented.**  
Roadmap status: `approved_future_direction`

Do not list this product direction as undecided. Only implementation choices remain open.

## Purpose of Demand 021 reservations

Prepare typed, migration-safe contracts so later owner-approved demands can implement analysis without rewriting domain models.

Demand 021 must **not**:

- calculate a real visual body-fat estimate
- select a provider or model
- perform a vision request
- expose an estimated percentage to users
- treat an estimate as a measurement
- claim medical or clinical accuracy
- add front/side/back capture UI
- require three images
- store images
- merge multi-view observations without provenance

## Visual body-fat estimation contract

Module: `src/ai/body-analysis/VisualBodyFatEstimate.ts`

Type: `VisualBodyFatEstimate`

Default Demand 021 state:

- `status: "not_run"`
- `estimatedPercent: null`
- `uncertainty.lowerPercent / upperPercent: null`
- `confidence: "not_applicable"`
- `origin: "unknown"`
- empty `evidenceSourceIds`
- null model metadata
- limitation: visual estimation reserved but not implemented

### Permanent rules

- Never return a single estimate without an uncertainty interval (when status is `estimated`).
- Never present a visual estimate as a measured fact.
- Keep visual estimates distinct from:
  - `user_estimate`
  - `device_measurement`
  - `professional_measurement`
- Never use for medical diagnosis or claim clinical accuracy.
- Never silently overwrite a user- or device-supplied value.
- Preserve source and confidence of every value.
- No estimate is generated in Demand 021.
- No fake fixture may contain a realistic estimated percentage.
- No provider/model selected now.
- No user-visible wording finalized now.
- No subscription-tier decision now.

### Still open (requires later owner approval)

- provider/model
- calibration dataset
- validation methodology
- acceptable error range
- uncertainty presentation
- whether users see the estimate
- whether users can correct or reject it
- which value takes priority when estimates and measurements disagree

## Multi-view analysis contract

Module: `src/ai/body-analysis/MultiViewBodyAnalysis.ts`

Approved views: `front` | `side` | `back`

Types:

- `ProgressPhotoView`
- `MultiViewBodyAnalysisImage`
- `MultiViewBodyAnalysisInput`
- `MultiViewBodyAnalysisReadiness`

### Permanent rules

- Front, side and back are the approved future directions.
- Demand 021 does not add capture UI or require three images.
- Demand 021 does not decide optional vs mandatory multi-view.
- Single-image analysis remains architecturally possible.
- Each view retains separate evidence, confidence and limitations.
- Observations from different views must not be merged without provenance.
- Image references are logical placeholders only.
- Browser-supplied storage keys are never authoritative.
- No images stored; no vision request; no provider or subscription tier selected.

### Still open (requires later owner approval)

- whether front/side/back is optional or required
- whether the same session must capture all views
- capture order
- alignment guidance
- storage lifecycle
- which subscription includes multi-view
- how conflicting observations between views are resolved

## Module map

- `src/ai/body-analysis/types.ts`
- `src/ai/body-analysis/VisualBodyFatEstimate.ts`
- `src/ai/body-analysis/MultiViewBodyAnalysis.ts`
- `src/ai/body-analysis/index.ts`
- `src/ai/__tests__/bodyAnalysisReservations.test.ts`

## What remains unchanged

- AI OS generation pipeline
- provider / transport / formatter behavior
- Control Room
- Guided Progress Photo Capture UI (reserved modes remain docs-only)
- Personal Progress Library persistence (still disabled)
- No paid provider calls
