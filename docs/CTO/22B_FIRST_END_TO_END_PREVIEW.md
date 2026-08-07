# First End-to-End Body Simulator Preview

Status:  
Internal preview bridge — no production cutover

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Related: [22 — Body Simulator v1](./22_BODY_SIMULATOR_V1.md), [22A — Shadow Integration](./22A_BODY_SIMULATOR_SHADOW_INTEGRATION.md), [17 — Internal AI Image Preview](./17_INTERNAL_AI_IMAGE_PREVIEW.md), [07 — Provider Formatter](./07_PROVIDER_FORMATTER.md)

---

## Purpose

Demand 022B connects canonical Body Simulator v1 Transformation Rules to the existing formatter and internal preview pipeline so Control Room can run one manually confirmed internal preview:

```
Scenario
→ Body Analysis (fixture / reserved stub)
→ Body Simulator v1
→ Formatter adapter (translate only)
→ Provider Formatter (FluxFormatter)
→ Replicate transport (unchanged)
→ Internal Preview projection
```

This does not activate production generation or public HelseApp UI.

---

## Architecture

Body Simulator remains the authority for transformation intent.

The adapter (`BodySimulatorFormatterAdapter`) translates `BodySimulatorTransformationRules` into `CanonicalBodyTransformation` (approvedChanges, visibility, preservation passthrough). It does not recalculate physiology, moderation, confidence, or regional magnitudes.

`AiOsRuntime` accepts optional `canonicalBodyTransformation`. When present, it replaces `RenderPlan.transformation` before formatting. Identity / scene / anatomy / exclusions stay on the existing RenderPlan preservation surface.

FluxFormatter, Replicate transport, billing, timeouts, retry, authentication, and Vercel runtime are unchanged.

---

## Pipeline

### Internal preview (`Generate Internal Preview`)

Always:

1. Control Room auth + billing / adult / consent gates (unchanged)
2. Allowlisted Control Room scenario
3. Mapped Body Simulator fixture (or explicit allowlisted override)
4. Body Simulator simulate once
5. Adapter → `canonicalBodyTransformation`
6. AiOsRuntime `transport_mock` with injected transport
7. Formatter + one provider call
8. Provisional ResultValidator + safe projection

No alternate path. No legacy TransformationEngine fallback for transformation intent on this path. Body Simulator failure fails the preview (`body_simulator_failed` → API `runtime_failure` + diagnostic).

### Control Room dry-run

When `AI_OS_BODY_SIMULATOR_SHADOW_ENABLED=1` and Body Simulator succeeds:

- dry-run formatter path also receives canonical rules
- API returns `formatterInput` + `formatterPreview`
- Pipeline Inspector shows **Formatter Input** and **Formatter Preview**

When the shadow flag is off, dry-run keeps the legacy transformation path and formatter bridge fields are `null`.

---

## Formatter adapter

Path: `src/ai/body-simulator/BodySimulatorFormatterAdapter.ts`

Responsibilities:

- map intensity → changeVisibility (`conservative`→`restrained`, `realistic`→`clear`, `ambitious`→`pronounced`)
- format whole-body / regional rules into `RenderChange` descriptions using simulator-produced values only
- pass preservation map through unchanged
- build inspector + preview view models

Forbidden:

- coefficient math
- timeline re-scaling
- confidence re-scoring
- moderation re-decisions
- prompt editing

---

## Scenario mapping

| Control Room / Preview scenario | Default Body Simulator fixture |
| --- | --- |
| `balanced_recomposition_12w` | `body_recomposition_16w` |
| `upper_body_definition_8w` | `fat_loss_muscle_preservation` |
| `gradual_fat_loss_16w` | `realistic_weight_loss_12w` |
| `athletic_strength_24w` | `advanced_muscle_gain_24w` |

Optional override: allowlisted `bodySimulatorScenarioId` (Control Room dry-run already; preview accepts the same field in the service input).

---

## Inspection

### Formatter Input (Pipeline Inspector)

Read-only:

- received canonical rules
- generated formatter object
- preservation metadata
- summary

Uses `textContent` / DOM helpers — never `innerHTML` for API data. No prompt edit controls.

### Formatter Preview (Pipeline Inspector)

Read-only:

- Goal, Timeline, Intensity
- Whole-body summary
- Regional summaries
- Preservation summary
- Prompt length
- Formatter name / version

---

## Formatter Comparison (Demand 022B-A)

Internal, read-only side-by-side comparison when the Body Simulator formatter path is used (Control Room dry-run with shadow enabled, or internal preview prep):

```
Legacy Formatter → Prompt Summary → Formatter Summary
Body Simulator Formatter → Prompt Summary → Formatter Summary
```

`FormatterComparison` includes:

- added / removed fields
- changed transformation fields
- changed preservation fields
- prompt length delta
- summary differences
- `providerCallsFromComparison: 0` (invariant)

### Legacy comparison (deprecated, internal, never production)

- The legacy TransformationEngine → RenderPlan → FluxFormatter path is **deprecated**.
- It runs **in-memory only** for comparison.
- It is **never** sent to a provider.
- It is **never** a production generate path (`api/generate-future-you.js` does not use it).
- No second provider request and no second image generation are performed for comparison.

---

## Generation Diagnostics (Demand 022B-A)

`GenerationDiagnostics` (session payload) includes:

| Field | Notes |
| --- | --- |
| Body Simulator version | Rules version from simulator output |
| Formatter version / schema | FluxFormatter metadata + schema label |
| Rule schema | Body Simulator rules schema label |
| Scenario / Timeline / Intensity | From Body Simulator rules when present |
| Prompt length | Characters (positive + negative) |
| Estimated tokens | Heuristic estimate (`labeling: "estimate"`) |
| Estimated provider cost | Placeholder estimate — no billing API |
| Generation duration / Provider / Model / HTTP status / Retry count | Populated on internal preview; dry-run uses `null` / `not_run` |
| Warnings / Limitations | From simulator + comparison notes |
| Provider classification | e.g. `dry_run_no_provider`, `internal_preview` |
| Timestamp | ISO |

No API keys or secrets are included.

---

## Pipeline Snapshot (Demand 022B-A)

Internal session-only structure:

```
Transformation Rules
→ Formatter Input
→ Formatter Output
→ Prompt
→ Generation Diagnostics
→ Preview metadata
```

### Session lifetime

- Exists only in-memory / Control Room (or preview) response payload for the current session.
- **Not** persisted to disk or DB.
- No download button (Copy JSON is available).
- No filesystem writes of snapshots.
- Cleared when Control Room is locked / session state reset.

---

## Feature flags

| Flag | Role |
| --- | --- |
| `AI_OS_IMAGE_PREVIEW_ENABLED=1` | Enables internal paid preview endpoint (existing) |
| `AI_OS_BODY_SIMULATOR_SHADOW_ENABLED=1` | Enables Body Simulator on Control Room dry-run + inspector bridge (existing) |
| `AI_OS_CONTROL_ROOM_ACCESS_KEY` | Existing Control Room auth |
| `REPLICATE_API_TOKEN` | Existing provider token for paid preview |

Internal preview always runs Body Simulator when the preview path is invoked (no extra flag). Do **not** auto-set Vercel env from this demand — owner configures manually.

Recommended: set Body Simulator shadow + Image Preview on **Preview** first.

---

## What remains unchanged

- Body Simulator v1 business rules / coefficients
- AI Body Analysis / Account Trust / Guided Progress Photo Capture
- FluxFormatter implementation / ProviderFormatter contracts
- Replicate adapter / transport / retry / auth / billing / timeouts
- Production generation route (`api/generate-future-you.js`)
- Public HelseApp UI

---

## Manual verification checklist (owner)

Agent does **not** execute a real paid Replicate call.

1. Unlock Control Room with access key.
2. Confirm Body Simulator status card appears (Disabled without shadow flag).
3. Set `AI_OS_BODY_SIMULATOR_SHADOW_ENABLED=1` on the target Vercel env (Preview recommended).
4. Run one allowlisted dry-run scenario.
5. Confirm Pipeline Inspector: **Body Simulator** ✓, **Formatter Input** ✓, **Formatter Preview** ✓.
6. Confirm **Formatter Comparison**, **Generation Diagnostics**, and **Pipeline Snapshot** sections populate (legacy marked deprecated; Copy JSON works; no download).
7. Confirm Provider Formatter section still shows FluxFormatter output (no raw prompt editing).
8. With `AI_OS_IMAGE_PREVIEW_ENABLED=1` + `REPLICATE_API_TOKEN` set, select an approved fixture, confirm adult/consent/billing, generate **one** internal preview.
9. Verify pipeline order intent: Body Simulator → Formatter → Provider → Preview (prompt contains Body Simulator wording; no legacy silhouette-recomposition id). Comparison must not cause a second provider call.
10. Lock Control Room — runtime inspector state clears (session snapshot cleared).

---

## Known limitations

- Control Room scenario ↔ Body Simulator fixture mapping is approximate (timelines may differ, e.g. 12w Control Room → 16w recomposition fixture).
- Body Analysis remains a reserved stub inside Body Simulator fixtures.
- Prompt Isolation Lab minimal diagnostic can still bypass structured sections when that variant is selected (pre-existing lab behavior).
- ResultValidator still uses provisional evidence for preview.

---

## Out of scope / future work

- Calibration
- Visual body-fat estimation
- Multi-view generation
- Personal Library
- Production rollout / cutover
- Prompt optimisation
- AI retraining
- Changing Body Simulator coefficients

See also: [22C — Controlled Legacy vs Body Simulator Generation](./22C_CONTROLLED_SIMULATOR_COMPARISON.md) (manual A/B generation comparison).

---

## Code map

| Path | Role |
| --- | --- |
| `src/ai/body-simulator/BodySimulatorFormatterAdapter.ts` | Translate-only adapter + inspector views |
| `src/ai/control-room/FormatterComparisonDiagnostics.ts` | 022B-A comparison / diagnostics / snapshot builders |
| `src/ai/runtime/AiOsRuntime.ts` / `AiOsRuntimeTypes.ts` | Optional canonical apply before format |
| `src/ai/control-room/ImagePreviewService.ts` | Preview pipeline wiring + prep diagnostics |
| `src/ai/control-room/ControlRoomService.ts` | Dry-run + formatter bridge + diagnostics |
| `public/ai-os-control-room.*` | Formatter Input / Preview / Comparison / Diagnostics UI |
| `api/ai-os-image-preview.ts` | Maps `body_simulator_failed` safely |
| `src/ai/__tests__/bodySimulatorPreview.test.ts` | Focused 022B tests |
| `src/ai/__tests__/formatterComparisonDiagnostics.test.ts` | Focused 022B-A tests |
| `docs/CTO/22B_FIRST_END_TO_END_PREVIEW.md` | This document |
