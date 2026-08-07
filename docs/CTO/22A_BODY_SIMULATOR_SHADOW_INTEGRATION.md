# Body Simulator Shadow Runtime Integration

Status:  
Internal inspection only — no image generation

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Related: [22 — Body Simulator v1](./22_BODY_SIMULATOR_V1.md), [14 — Shadow Runtime](./14_SHADOW_RUNTIME.md), [16 — AI OS Control Room](./16_AI_OS_CONTROL_ROOM.md)

---

## Purpose

Demand 022A wires the existing Body Simulator v1 into the internal AI OS Shadow / Control Room dry-run path so owners can inspect fixture-only simulation results before any formatter, provider, or image step.

This is observation and inspection only. It does not activate production generation.

---

## Pipeline

```
Allowlisted Body Simulator fixture scenario
→ Body Analysis fixture or null (preserved from fixture)
→ BodySimulatorShadowInputAdapter
→ Body Simulator readiness
→ Body Simulator v1 (simulate once)
→ Canonical Transformation Rules
→ Safe projection
→ AI Pipeline Inspector (Body Simulator section)
→ Control Room status card
```

Existing AI OS dry-run phases (TransformationPlan → VisualDirection → RenderPlan → formatter dry-run) continue unchanged. Body Simulator failure must not activate provider fallback.

---

## Feature flag

Name: `AI_OS_BODY_SIMULATOR_SHADOW_ENABLED`

- Enabled only when value is exactly `1`
- Server-side only
- Default disabled when absent
- Browser cannot enable it
- No automatic Vercel env change
- Production generation routes do not read this flag

Owner must create the variable manually when testing is desired.

---

## Fixture-only input

Body Simulator Shadow uses an allowlisted server-side scenario registry mapping compact Control Room ids to existing Body Simulator fixtures.

Rejected:

- arbitrary browser JSON
- real user accounts
- uploaded images
- provider output
- prompt parsing

---

## Shadow input adapter

`adaptBodySimulatorShadowInput` clones allowlisted fixtures into `BodySimulatorInput`.

Rules:

- preserve unknowns as null / `not_provided`
- never invent body-fat, training experience, or medication effects
- `medicationMayAffectWeight: false` when the fixture says no effect
- preserve Body Analysis fixture or null
- return structured `missingInputs`, `limitations`, and `diagnostics`

---

## Simulator execution

`runBodySimulatorShadowPhase`:

1. Check feature flag
2. Resolve allowlisted scenario (default `realistic_weight_loss_12w`)
3. Adapt fixture
4. Assess readiness
5. Call `simulateBodyTransformation` once
6. Project with `projectBodySimulatorRules`

Statuses: `disabled` | `not_run` | `succeeded` | `ready_with_limitations` | `insufficient_input` | `failed`

ShadowRuntime attaches `bodySimulator` on every observation result. Failures are structured and never throw into provider paths.

---

## Control Room status

Status card label: **Body Simulator**

Displayed states:

- Disabled
- Not run
- Ready
- Ready with limitations
- Insufficient input
- Succeeded
- Failed

Execution wording only — never “medically validated”, “guaranteed”, or “trained”.

---

## Body Simulator Inspector

Read-only `<details>` section inside the AI Pipeline Inspector.

Subsections:

1. Simulator status
2. Input summary
3. Readiness
4. Goal and timeline
5. Whole-body change
6. Regional Transformation Rules
7. Medication-effect modifiers
8. Preservation rules
9. Realism moderation
10. Confidence
11. Provenance
12. Limitations and warnings
13. Safe JSON

All dynamic API content uses `textContent` (never `innerHTML` for runtime data). No edit / apply / override / regenerate / send-to-provider controls.

---

## Input summary

Compact fields:

- goal type, timeline weeks, intensity
- age / height / weight availability
- body-fat basis, training experience, activity sessions
- medicationMayAffectWeight
- source photo view
- Body Analysis available

Uses Available / Unavailable / Unknown / Not provided — no guessing.

---

## Readiness

Displays ready flag, status, missing required/optional inputs, and limitations from `assessBodySimulatorReadiness`.

---

## Whole-body ranges

Server-produced `SimulationRange` values only (lower / expected / upper / unit / origin) plus confidence.

Browser note:

> Expected simulation range — not a guaranteed outcome.

---

## Regional rules

All broad Body Simulator v1 regions with fat/muscle change, magnitude, visibility, confidence, reasons, and provenance paths.

No attractiveness reordering or sexual classification.

---

## Medication-effect modifiers

General user-reported model only. Note:

> Medication effects are user-reported bounded modifiers, not verified medical facts.

When `medicationMayAffectWeight` is false: “No medication modifier applied.” Unknown stays Unknown.

---

## Preservation rules

Every preservation key shown as Preserve, including face geometry, body height, hand/foot scale, and skeletal proportions.

---

## Realism moderation

Shows moderated / prevented flags and human-readable reason mappings. Machine-readable codes remain in Safe JSON.

---

## Confidence

Overall, whole-body, and per-region confidence with reasons.

> Confidence describes evidence quality, not probability of success.

No percentages. No medical confidence claims.

---

## Provenance

rulePath / source / sourcePath only. No filesystem paths, stack traces, or chain-of-thought.

---

## Safe API response

Control Room dry-run results include:

```ts
bodySimulator: {
  enabled: boolean;
  scenarioId: string | null;
  status: "disabled" | "not_run" | "succeeded" | "ready_with_limitations" | "insufficient_input" | "failed";
  inputSummary: { ... } | null;
  readiness: BodySimulatorReadiness | null;
  rules: BodySimulatorTransformationRules | null;
  projection: unknown | null;
  diagnostics: string[];
  errorCode: string | null;
}
```

GET unlock also returns `bodySimulatorEnabled` and allowlisted `bodySimulatorScenarios` when the flag is on.

`Cache-Control: no-store`. Existing Control Room auth unchanged.

---

## Error handling

Safe codes:

- `body_simulator_disabled`
- `body_simulator_insufficient_input`
- `body_simulator_validation_failed`
- `body_simulator_execution_failed`
- `body_simulator_projection_failed`

Safe HTTP + diagnostics only. No stack traces or secrets. Failure does not activate provider fallback.

---

## Privacy and security

- fixture-only fictional data
- no real PII
- no images or image URLs
- no access keys / tokens / env values
- no filesystem paths
- Lock clears displayed runtime state

---

## No provider call

Body Simulator Shadow never constructs transport adapters, never reads provider tokens, and never issues network generation requests.

---

## No image generation

No formatter-for-provider execution beyond the existing dry-run artifact inspection path, and no image bytes are produced by the Body Simulator phase.

---

## What remains unchanged

- Body Simulator v1 business rules / coefficients
- public HelseApp upload UI
- Guided Progress Photo Capture
- Account Trust / Personal Progress Library
- production generation route
- provider / transport / formatter / retry / Replicate / moderation / model config
- Vercel configuration and auth architecture

---

## Manual verification checklist

1. Control Room unlock works.
2. Body Simulator status shows Disabled without feature flag.
3. Existing dry run works while disabled.
4. With the owner-configured flag enabled, allowlisted scenarios appear.
5. One selected scenario runs once.
6. Body Simulator status becomes Succeeded or Ready with limitations.
7. Input summary appears.
8. Whole-body ranges appear.
9. Regional rules appear.
10. Medication effects appear only when applicable.
11. Moderation reasons appear for ambitious / unrealistic fixtures.
12. Preservation rules appear.
13. Confidence and provenance appear.
14. No provider request occurs.
15. No image is generated.
16. Locking Control Room clears displayed sensitive runtime state.

Manual env (do **not** auto-set):

```
AI_OS_BODY_SIMULATOR_SHADOW_ENABLED=1
```

Control Room deploys with the Vercel web app. Recommend setting the flag on **Preview** first for internal verification, then **Production** only if Production Control Room inspection is needed. Keep disabled by default.

---

## Next milestone

**Demand 022B — First End-to-End Body Simulator Preview**

May:

- connect canonical Body Simulator rules to the existing formatter path
- generate one manually confirmed internal preview
- compare legacy/current formatter path with Body Simulator input
- remain internal-only
- require explicit paid-request confirmation
- avoid production cutover

Do not implement Demand 022B in this demand.

---

## Code map

| Path | Role |
| --- | --- |
| `src/ai/shadow/BodySimulatorShadowIntegration.ts` | Flag, registry, adapter, execution, safe view |
| `src/ai/shadow/ShadowRuntime.ts` | Attaches `bodySimulator` on shadow observation |
| `src/ai/control-room/ControlRoomService.ts` | Dry-run integration |
| `api/ai-os-control-room.ts` | Allowlisted scenario POST/GET surface |
| `public/ai-os-control-room.*` | Status card + inspector UI |
| `src/ai/__tests__/bodySimulatorShadow.test.ts` | Focused 022A tests |
| `docs/CTO/22A_BODY_SIMULATOR_SHADOW_INTEGRATION.md` | This document |
