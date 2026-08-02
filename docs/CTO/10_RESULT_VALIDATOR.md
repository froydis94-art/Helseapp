# Result Validator Foundation

Status:  
Deterministic policy foundation — no real image analysis yet

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Architecture: [AI OS v2.0 Architecture](./04_AI_OS_V2_ARCHITECTURE.md)  
Related: [Migration Roadmap](./05_AI_OS_V2_MIGRATION_ROADMAP.md), [RenderPlan](./06_RENDER_PLAN.md), [Integration Harness](./08_AI_OS_V2_INTEGRATION_HARNESS.md)

## Purpose

`ResultValidator` decides whether a generated candidate should be **accepted**, **retried** with controlled adjustments, or **rejected**.

It evaluates typed `ValidationEvidence` against deterministic hard gates, acceptance thresholds, confidence rules, and a finite retry budget.

It does not calculate physiology, mutate `TransformationPlan` / `RenderPlan`, or call image providers.

## Architectural position

```
Candidate Image
→ Validation Evidence
→ ResultValidator
→ ValidationDecision
→ accept / retry / reject
```

Canonical AI OS v2 placement: after `ModelAdapter` produces a candidate, before user-facing result presentation. Controlled retries may return to formatter/adapter layers — never to physiology escalation.

## Current limitation

The current foundation does not inspect real image pixels.

It evaluates typed evidence supplied by fixtures, future vision adapters, or human review systems.

No network, vision model, Replicate/OpenAI/Google call, fetch, image bytes, Base64 payload, or production wiring is included.

## Validation dimensions

| Dimension | Intent |
| --- | --- |
| `identity` | Same-person / facial identity preservation |
| `anatomy` | Anatomical plausibility and limb/frame integrity |
| `plan_adherence` | Candidate follows approved TransformationPlan / RenderPlan intent |
| `photorealism` | Documentary realism without caricature |
| `pose_camera` | Pose and camera preservation |
| `safety` | Safety policy gate |

Evidence scores are conceptual values in `[0, 1]`.

## Hard gates

Critical floors (cannot accept below):

| Dimension | Hard gate |
| --- | --- |
| safety | `< 0.95` → **reject**, no automatic retry in this foundation |
| identity | `< 0.72` → retry if budget remains, else reject |
| anatomy | `< 0.75` → retry / reject |
| plan_adherence | `< 0.68` → retry / reject |
| pose_camera | `< 0.70` → retry / reject |
| photorealism | `< 0.65` → retry / reject |

Acceptance requires higher floors (identity/anatomy ≥ 0.82, plan ≥ 0.75, pose/camera ≥ 0.78, photorealism ≥ 0.72, safety ≥ 0.95) plus `overallScore ≥ 0.80` and no critical findings.

**Overall score cannot override a hard-gate failure.** Safety failures and critical identity/anatomy hard failures are never accepted.

Low confidence on critical dimensions (`identity`, `anatomy`, `safety`) also blocks acceptance.

## Overall score

Weighted average (declared once as `DIMENSION_WEIGHTS`):

| Dimension | Weight |
| --- | --- |
| identity | 0.25 |
| anatomy | 0.20 |
| plan_adherence | 0.20 |
| photorealism | 0.10 |
| pose_camera | 0.10 |
| safety | 0.15 |

The score is a **product heuristic**, not a scientific confidence interval or medical certainty metric. It is rounded consistently (four decimal places).

## Retry policy

- Finite attempt budget: `attempt >= 1`, `maxAttempts` in `1…5`
- Retry allowed only while `attempt < maxAttempts`
- Exhausted budget adds `retry_budget_exhausted` and rejects
- Adjustments map from failed dimensions only (stable order, no duplicates):
  - identity → `strengthen_identity_preservation`
  - anatomy → `strengthen_anatomy_constraints`
  - plan adherence → `strengthen_plan_adherence`
  - pose/camera → `strengthen_pose_camera_preservation`
  - photorealism → `strengthen_photorealism`
  - poor anatomy/plan + pronounced RenderPlan visibility → `reduce_visual_emphasis`
- **No** physiological escalation: no new regions, stronger muscle gain, lower BF target, larger weight change, timeline/skeletal/identity plan changes
- `switch_provider` / `switch_model_tier` types exist for later policy expansion but are **not** recommended automatically yet

## Evidence sources

| Source | Role |
| --- | --- |
| `deterministic_fixture` | Tests and dry-run policy fixtures |
| `human_review` | Future human QA evidence |
| `future_vision_adapter` | Future automated vision scoring adapters |

## What it proves

- deterministic decision policy
- retry-boundary enforcement
- hard safety and identity gates
- evidence validation (schema, uniqueness, score bounds, privacy scans)
- no transformation escalation via retry adjustments

## What it does not prove

- actual face similarity
- actual anatomical correctness
- real-image photorealism
- model quality
- provider quality
- production retry behavior
- medical accuracy

## Privacy

- no image bytes
- no Base64
- no URLs required
- no health payload
- no real user identity
- opaque candidate IDs

Evidence validation rejects URL-like strings, Base64-like payloads, Authorization/Bearer text, API-key-like content, and prompt-bearing fields.

## Known limitations

- no real vision adapter
- no production integration
- no provider retry orchestration
- no human-review UI
- no image fixtures
- thresholds are initial product policy

## Permanent rule

> Validation may reject or request a safer rendering attempt.  
> It may never strengthen the approved physiological transformation.
