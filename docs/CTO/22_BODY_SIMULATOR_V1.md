# Transformation Engine / Body Simulator v1

Status:  
Deterministic provider-independent simulation foundation

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Related: [21 — Body Analysis Engine foundation](./21_BODY_ANALYSIS_ENGINE_FOUNDATION.md), [06 — RenderPlan](./06_RENDER_PLAN.md)

---

## Purpose

The Body Simulator exists to create realistic expected future body visualizations from structured user inputs, goals and timelines.

It converts structured facts, declared goals, optional Body Analysis artifacts and simulation settings into canonical **Body Simulator Transformation Rules**.

It may improve:

- TransformationPlan quality (future adapter)
- body-region planning
- consistency between generations
- body-composition simulation
- identity and proportion preservation
- longitudinal progress visualization

It must not produce beauty scores, attractiveness scores, body rankings, ideal-body comparisons, shame-based labels, medical diagnoses, or guaranteed results.

> Body Simulator Transformation Rules are the canonical representation of the expected body change.

Provider prompts remain derived artifacts created later by a formatter. Demand 022 does **not** wire the simulator into production generation.

---

## Product decisions

Owner-approved for v1:

| Topic | Decision |
| --- | --- |
| Goals | Five supported types (below) |
| Timeline | 4–52 weeks inclusive; reject outside; never silently change |
| Intensity | `conservative` \| `realistic` \| `ambitious`; default **realistic** |
| Regions | ~12 broad regions (not 40–60) |
| Medication | General user-reported effect fields only — no names/doses |
| Unrealistic targets | Moderate safely; preserve direction; disclose moderation |
| Body Analysis | Optional |
| Multi-view | Optional; one source image sufficient architecturally |

---

## Supported goals

- `weight_loss`
- `fat_loss_with_muscle_preservation`
- `muscle_gain`
- `body_recomposition`
- `general_fitness_improvement`

No normative language such as “ideal”, “best”, or “more attractive” body.

---

## Supported timelines

- Minimum: **4 weeks**
- Maximum: **52 weeks**
- Scaling uses shared diminishing returns (`transformProgress`, tau = 4 months), not pure linear ladders
- Equal inputs: 4w < 12w < 24w < 52w magnitude

---

## Simulation intensity

| Mode | Behavior |
| --- | --- |
| `conservative` | Lower end of plausible visual range |
| `realistic` | Default midpoint |
| `ambitious` | Upper end inside realism bounds; adds limitation text; never fantasy |

Intensity changes expected magnitude, not preservation, timeline bounds, or missing-input uncertainty.

---

## Profile inputs

- `ageYears` — account/profile input; never estimated from appearance
- `sexForPhysiology` — not visual gender; no presentation inference
- `heightCm` / `currentWeightKg` — nullable; unusual values not rejected
- `currentBodyFatPercent` + `bodyFatBasis` — origin remains explicit
- `trainingExperience` — missing lowers confidence (does not assume beginner)
- `evidence` — `Record<string, BodyAnalysisEvidence>`

---

## Activity and training inputs

General activity, resistance/cardio session counts, consistency, protein support, recovery support, and evidence.

Not medical assessments. No calorie prescriptions. No exercise prescriptions.

---

## Medication weight-effect inputs

`MedicationWeightEffectProfile`:

- `medicationMayAffectWeight`
- Reported directions for appetite, energy level, metabolism tendency, muscle building/preservation
- Evidence origin `user_declared` | `unknown`

Default when false: all `no_effect`, confidence `not_applicable`.

### User-reported effects versus verified facts

Medication-related effects are **user-reported bounded modifiers**, not verified pharmacological facts.

- No medicine name, brand, dose, prescription, or medical record identifiers
- Secondary influence only (`BODY_SIM_MED_MAX_*` caps)
- Never the primary source of transformation
- `unknown` fabricates no direction
- Provenance recorded for every applied modifier

---

## Broad body-region model

`face_and_neck`, `shoulders`, `chest_and_upper_torso`, `upper_back`, `arms`, `waist_and_flanks`, `abdomen`, `hips`, `glutes`, `thighs`, `lower_legs`, `whole_body`

Anatomical planning terms only — not sexual content. No automatic breast/buttock/groin enhancement. No skeletal redesign.

---

## Canonical Transformation Rules

Output type: `BodySimulatorTransformationRules` (`schemaVersion` 1).

Includes:

- goal requested/effective, timeline, intensity
- baseline completeness and missing inputs
- whole-body `SimulationRange` for weight / body-fat pp / muscle
- regional rules with fat/muscle direction, visual magnitude, visibility, confidence
- mandatory preservation map
- realism (moderation flags + `expectedVisualizationNotGuarantee: true`)
- provenance, confidence reasons, limitations, warnings

No prompts, image URLs, provider settings, or raw medical information.

`BodyAnalysisResult` is a **minimal optional stub** in the simulator (`null` or reserved shape). Full analysis remains Demand 021 reserved.

---

## Goal Engine

Deterministic direction mapping per goal type (fat/muscle/weight), without ideal-body language. Muscle under weight loss is uncertain; preservation is never guaranteed.

---

## Timeline Engine

Named coefficients in `BodySimulatorRules.ts` (version `BODY_SIMULATOR_RULES_VERSION`).

Uses shared `transformProgress(months)` for diminishing returns. Timeline is never silently clamped to another value — invalid timelines are rejected at validation.

---

## Realism constraints

Product simulation safeguards (not medical advice). Moderate extreme short-term muscle/fat/weight targets; preserve direction; set `requestedTargetModerated` and machine-readable reasons:

- `timeline_limits_requested_change`
- `muscle_gain_target_exceeds_v1_boundary`
- `fat_loss_target_exceeds_v1_boundary`
- `insufficient_baseline_information`
- `ambitious_intensity_bounded`
- `identity_preservation_boundary`
- `natural_proportion_boundary`

Prohibit identity-changing skeletal change, height change, unrelated facial transformation, hand/foot enlargement, superhero proportions, automatic age reduction/beautification.

---

## Regional rules

Conservative broad distribution weights. Visibility affects confidence, not worth. Unobserved regions keep lower confidence. Individual fat distribution varies — documented as a limitation.

---

## Identity preservation

Mandatory `preserve` for identity, face geometry, skin tone, hairstyle, personal style, pose, camera framing, clothing, clothing coverage, background, lighting character, age appearance, ethnicity appearance, body height, hand/foot scale, skeletal proportions.

---

## Original-presentation preservation

Original presentation is always preserved. The simulator does not judge why a photo was taken, clothing style, underwear style, or pose.

---

## Confidence and confidence reasons

Structured string reasons (evidence quality — not success probability or medical certainty). No fake numeric confidence percentage in v1. Low confidence does not auto-block simulation.

---

## Readiness

`ready` | `ready_with_limitations` | `insufficient_input`

Required: valid schema, goal, timeline 4–52, intensity, valid options/profile shape.

Optional: body fat, medication, Body Analysis, multi-view. One source image remains sufficient for downstream visualization.

---

## Validation philosophy

Validation protects **contract integrity**, not body normality.

Reject bad schema/goal/timeline/intensity/NaN/Infinity/negative height/non-positive weight/bad effect directions/data URIs/tokens/paths/missing preservation options/prompt-as-business-logic fields.

Do not reject unusual height, weight, proportions, disability, assistive devices, unknown BF%, medication use, or absent multi-view.

---

## Safe projection

`projectBodySimulatorRules` — JSON-safe diagnostic view for future inspector / formatter input / library metadata. Excludes images, secrets, medication names, provider tokens/responses. **Not wired** to production generation in Demand 022.

---

## Deterministic fixtures

25 fictional scenarios in `BodySimulatorFixtures.ts` covering intensity modes, goals, medication effect directions, missing/measured/reserved BF, single-view, multi-view reservation, partial visibility, non-standard pose, unusual proportions, and moderated unrealistic targets.

---

## No medical diagnosis

The simulator does not diagnose conditions, prescribe treatment, or map effects to named medicines.

---

## No body ranking

No beauty, attractiveness, ideal-body, or social-desirability scores.

---

## No guaranteed outcomes

`expectedVisualizationNotGuarantee: true` on every output. Ambitious mode is still an expected visualization bound.

---

## What remains unchanged

Demand 022 does **not** modify:

- public UI, Control Room, Experiment Lab
- image preview/generation APIs
- formatter, provider, transport, runtime, retry
- Replicate integration, auth, account trust, vault
- Guided Progress Photo Capture
- Personal Progress Library persistence
- Vercel config, legacy production prompts
- production feature flags

Legacy `TransformationPlan` / `TransformationEngine` remain sealed for production. Body Simulator rules are a parallel canonical output type for v1.

---

## Known limitations

- No production integration adapter yet
- Body Analysis not executed
- Visual body-fat estimation reserved
- Broad regions only
- Heuristic coefficients, not clinical models
- No sport-specific physique assumptions

---

## Owner-approved future directions

- Visual body-fat estimation is approved but **not implemented**
- Front / side / back analysis is approved but **not implemented**
- Body Analysis exists to improve simulation realism and progress tracking
- Medication effects are represented generally, not by medicine name

---

## Owner decisions still required

Do not resolve in this demand:

- body-fat vision provider/model
- body-fat calibration and acceptable error
- user-visible body-fat presentation
- whether multi-view becomes optional or required
- final multi-view capture workflow
- final provider/model for image generation
- final pricing and subscription placement
- final storage lifecycle
- whether users may manually correct future model observations
- detailed regional expansion beyond v1
- reference dataset and calibration-program implementation

---

## Next milestones

**Demand 022A — Body Simulator Integration Adapter**

- connect Body Simulator rules to existing TransformationPlan/RenderPlan path
- no public activation initially
- Shadow Runtime or Control Room only

**Demand 022B — First End-to-End Simulator Preview**

- one manually approved internal generation
- compare old versus Body Simulator rules
- no production cutover

**Demand 023 — Simulator Evaluation and Calibration v1**

Later roadmap:

- Demand 030 — Reference Dataset Manager
- Demand 031 — Comparator Engine
- Demand 032 — Evaluator AI
- Demand 033 — Regression Suite
- Demand 034 — Optimizer Suggestions

Optimizer suggestions may **never** change production code or simulator rules automatically without human approval.

---

## Code map

| Path | Role |
| --- | --- |
| `src/ai/body-simulator/BodySimulatorTypes.ts` | Input/output contracts |
| `src/ai/body-simulator/BodySimulatorRules.ts` | Named coefficients + modifiers |
| `src/ai/body-simulator/BodySimulatorEngine.ts` | Main simulation API |
| `src/ai/body-simulator/BodySimulatorValidation.ts` | Contract validation |
| `src/ai/body-simulator/BodySimulatorReadiness.ts` | Readiness |
| `src/ai/body-simulator/BodySimulatorProjection.ts` | Safe projection |
| `src/ai/body-simulator/BodySimulatorFixtures.ts` | 25 fixtures |
| `src/ai/body-simulator/index.ts` | Barrel |
| `src/ai/__tests__/bodySimulator.test.ts` | Tests 1–134 |
| `docs/CTO/22_BODY_SIMULATOR_V1.md` | This document |

Main API: `simulateBodyTransformation(input) → { ok: true, rules } | { ok: false, errors }`
