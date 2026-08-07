# Anatomical Transformation Engine v2

Status:  
Canonical anatomical body-change layer

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Related: [22 — Body Simulator v1](./22_BODY_SIMULATOR_V1.md), [22A — Shadow Integration](./22A_BODY_SIMULATOR_SHADOW_INTEGRATION.md), [22B — First End-to-End Preview](./22B_FIRST_END_TO_END_PREVIEW.md), [22C — Controlled Simulator Comparison](./22C_CONTROLLED_SIMULATOR_COMPARISON.md)

---

## Why this exists

Manual testing of Body Simulator preview paths showed:

- identity preservation strong
- presentation preservation strong (hair, clothing, background, lighting)
- timeline had some visible effect
- body-fat reductions were too visually weak
- muscle gain sometimes became generalized fat/body gain
- focus zones were weak
- optional notes could dominate structured intent
- contradictory goal combinations were not clearly surfaced

Demand 022D addresses these weaknesses in the Body Simulator layer — not through prompt hacks.

> Body Simulator remains authoritative. The formatter remains a translator. The image model never decides the transformation.

---

## Architecture

```
BodySimulatorInput
  (+ optional focusZones, optionalNotes, targetBodyFatPercent)
→ Body Simulator whole-body + broad regional rules (compatibility)
→ Anatomical Transformation Engine v2
→ AnatomicalTransformationResult on BodySimulatorTransformationRules
→ BodySimulatorFormatterAdapter (translate anatomical → approvedChanges)
→ existing formatter / preview / shadow inspection
```

Broad `regions` remain for migration compatibility.  
`anatomicalTransformation` is the higher-detail canonical representation.

---

## Anatomical rule contract

Schema: `ANATOMICAL_TRANSFORMATION_SCHEMA_VERSION = 1`

Each `AnatomicalTransformationRule` carries:

- region / feature / direction / magnitude
- deterministic priority
- source (`body_fat_delta` | `goal` | `focus_zone` | …)
- confidence + limitations

Result includes applied/suppressed rule IDs, suppression reasons, goal-consistency issues, semantic support terms, muscle-gain mode, and body-fat context.

---

## Body-fat-driven anatomy

When `currentBodyFatPercent` and absolute `targetBodyFatPercent` (or change pp) are available:

`delta = target − current`

Examples:

| Delta | Anatomical intent |
| --- | --- |
| 18→15 (~−3 pp) | Modest fat/waist reduction + slight definition |
| 18→12 (~−6 pp) | Clearer fat reduction, waist, abs/oblique/chest/shoulder definition |
| 18→18 | No fat-driven change; muscle/focus may still apply |
| 18→22 | Modest fat/waist fullness; no extreme belly enlargement |

Body-fat % remains a simulation input with explicit provenance — not medical truth.

---

## Existing muscle and definition

When body-fat decreases and muscle loss is not the primary goal:

- reveal / increase definition
- do **not** arbitrarily shrink muscle volume
- distinguish **visibility** (definition) from **volume**

Avoid synthetic etched abs / exaggerated six-pack carving.

---

## Muscle-volume model

Muscle gain targets volume features on:

shoulders, chest, upper back, arms, glutes, thighs, lower legs

Rules:

- no skeletal widening / height / hand-foot change
- no automatic abdominal fat unless BF target supports it

---

## Lean bulk

`MuscleGainMode = lean_bulk` when muscle increase is requested and body-fat is maintained or reduced.

Expected: muscle volume up; waist approximately stable; no large belly.

---

## Mixed bulk

`mixed_bulk` when muscle increase + modest BF increase.

`fat_gain_bulk` when substantial BF increase is explicit — still realism-bounded.

Neutral IDs only — no stigma in UI copy.

---

## Focus zones

Mapped features receive a material priority boost.

Focus cannot override body-fat direction or preservation.  
Posture does not alter skeletal structure in v2.

---

## Timeline scaling

Preserves 4–52 week architecture and diminishing returns (`transformProgress`).

Approx guidance after effort scaling:

- ~3 months → subtle–moderate
- ~6 months → moderate
- ~12 months → clear–pronounced

Named coefficients; regression-tested. Not a guarantee.

---

## Effort scaling

Body Simulator intensity maps to anatomical effort coefficients:

| Intensity | Effort label | Coefficient |
| --- | --- | --- |
| conservative | moderate | 0.70 |
| realistic | hard | 0.85 |
| ambitious | strict | 1.00 |

Cannot break realism, preservation, timeline caps, or BF consistency.

---

## Goal consistency

`GoalConsistencyValidator` returns `info` | `warning` issues.

Example: muscle gain + meaningful BF decrease → warning suggesting lean bulk / recomposition.

Never blocks. No shame-based wording.

---

## Optional-note priority

Canonical structured order:

1. realism  
2. preservation  
3. body-fat inputs  
4. goal  
5. timeline  
6. focus zones  
7. training  
8. effort  
9. medication (bounded)  
10. optional notes  

Notes may reinforce; cannot reverse BF/timeline/preservation/goal/extremes.  
Outcomes: applied / partially_applied / suppressed + reason.

---

## Rule conflict resolution

Same feature → winner by:

safety/realism → body-fat → goal → focus → timeline → effort → notes

Never silent average. Keep suppressed IDs + reasons:

`lower_priority_conflict` | `body_fat_direction_conflict` | `goal_conflict` | `realism_boundary` | `preservation_boundary` | `optional_note_conflict`

---

## Semantic support terms

`semanticSupportTerms: string[]` (lean, defined, muscular, athletic, recomposition, …)

Secondary formatter metadata only — never canonical intent.

---

## Formatter adapter boundary

Translate-only:

- anatomical rules → natural-language `approvedChanges`
- preserve priority / magnitude / provenance

Must not recalculate physiology, invent flattering anatomy, or raise intensity.

Broad region mapping remains deprecated fallback for missing anatomical blocks only.

---

## Confidence

Evidence quality only (BF basis, visibility, analysis availability, contradictions).

Does not penalize unusual proportions, size, muscularity, thinness, or disability.

---

## Realism boundaries

- lower BF reveals definition rather than removing muscle
- muscle gain increases muscle volume, not generic fat volume
- BF increase ≠ extreme abdominal protrusion
- lean bulk keeps controlled waist change
- focus emphasis stays proportional
- no synthetic etched anatomy / stage conditioning unless future approved constraints allow

---

## Control Room inspection

Read-only **Anatomical Transformation** section:

- inputs (BF current/target/delta, goal, timeline, effort, focus, notes)
- applied rules
- suppressed rules + reasons
- goal consistency
- semantic support
- summary flags

`textContent` only. No edit / apply / prompt override.

Shadow dry-run exposes the full chain without paid provider calls.

---

## Known limitations

- Anatomical granularity is v2 (not 40–60 micro-regions)
- Coefficients are product heuristics pending real-world calibration (Demand 023)
- Visual BF estimation still reserved (Demand 021)
- Posture focus does not change skeleton
- Optional notes use lightweight keyword reinforcement, not NLP

---

## What remains unchanged

- Replicate transport / provider / model
- production generation route
- billing, auth, account trust
- Personal Progress Library
- Guided Progress Photo Capture
- 022C comparison physiology coefficients (beyond anatomical attachment)
- no automatic paid image generation

---

## Owner decisions still open

Do not decide here:

- final anatomical granularity beyond v2
- exact calibration coefficients after real-world testing
- automatic visual body-fat estimation model/provider
- whether anatomical regions expand to 40–60 later
- production cutover
- durable calibration data
- AI evaluator
- pricing

---

## Next milestone

After manual re-test:

**Demand 023 — Simulator Evaluation & Calibration v1**

Do not implement Demand 023 here.
