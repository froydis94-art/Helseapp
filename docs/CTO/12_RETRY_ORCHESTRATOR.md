# Retry Orchestrator Foundation

Status:  
Deterministic orchestration policy — not production-integrated

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Architecture: [AI OS v2.0 Architecture](./04_AI_OS_V2_ARCHITECTURE.md)  
Related: [Result Validator](./10_RESULT_VALIDATOR.md), [Replicate Transport Adapter](./11_REPLICATE_TRANSPORT_ADAPTER.md), [Migration Roadmap](./05_AI_OS_V2_MIGRATION_ROADMAP.md)

## Purpose

`RetryOrchestrator` coordinates safe transitions after transport and validation outcomes.

It decides whether the system may accept a candidate, reject it, await validation, retry the same provider with approved adjustments, or stop because the budget or safety policy is exhausted.

It does not call providers, analyze images, rewrite prompts, or mutate `TransformationPlan` / `RenderPlan`.

## Architectural position

```
FormattedImageRequest
→ TransportAdapter
→ Candidate Image
→ ValidationEvidence
→ ResultValidator
→ RetryOrchestrator
→ accept / retry safely / reject
```

Canonical AI OS v2 placement: after `ResultValidator` produces a `ValidationDecision`, or after transport returns a typed result awaiting validation. Controlled retries may later return to formatter/adapter layers — never to physiology escalation.

## Responsibilities

- retry-state ownership
- finite attempt budget
- transport failure policy
- validation decision transitions
- approved adjustment allowlist
- terminal outcome policy
- safe transition history

## Forbidden responsibilities

- physiology
- TransformationPlan mutation
- RenderPlan mutation
- prompt rewriting
- network calls
- image analysis
- provider switching
- model-tier switching
- UI behavior
- production activation

## Transport retry policy

Approved retryable transport error codes (HelseApp policy):

- `request_aborted`
- `request_timeout`
- `provider_rate_limited`
- `provider_unavailable`
- `polling_exhausted`

Non-retryable in this foundation:

- `adapter_disabled`
- `missing_token`
- `invalid_request`
- `unsupported_source_image`
- `provider_auth_error`
- `provider_validation_error`
- `invalid_provider_response`
- `provider_failed`
- `unknown_transport_error`

Both must permit retry:

1. HelseApp policy (code in the approved retryable list)
2. transport `error.retryable === true`

A provider flag alone must not override HelseApp policy. Successful transport never auto-accepts a candidate — it transitions to `await_validation`.

## Validation retry policy

- `ResultValidator` owns the validation outcome (`accept` / `retry` / `reject`)
- `RetryOrchestrator` respects that outcome without re-scoring evidence
- safety rejection (`safety_failure`) is terminal regardless of remaining budget
- unsupported adjustments (`switch_provider`, `switch_model_tier`) are rejected
- retries never escalate physiology, add regions, or strengthen transformation intensity

## Attempt state

| Field | Role |
| --- | --- |
| `attempt` | Current attempt number (`>= 1`) |
| `maxAttempts` | Finite budget (`1…5`, default `3`) |
| `transportAttempts` | Completed transport evaluations |
| `validationAttempts` | Completed validation evaluations |
| `appliedAdjustments` | Accumulated allowlisted adjustments |
| `history` | Safe transition metadata (append-only copies) |

## Adjustment allowlist

Approved in this foundation:

- `strengthen_identity_preservation`
- `strengthen_anatomy_constraints`
- `strengthen_plan_adherence`
- `strengthen_pose_camera_preservation`
- `strengthen_photorealism`
- `reduce_visual_emphasis`

Deferred (type exists, rejected here):

- `switch_provider`
- `switch_model_tier`

Forbidden permanently:

- `increase_visual_emphasis` (must never be introduced)
- new body regions
- physiological target changes (BF, muscle, timeline, skeletal, identity plan)

## History

History stores safe transition metadata only: sequence, attempt, stage, action, reason code, opaque IDs, transport error code, validation outcome, and applied adjustments.

No prompt, image, token, URL, raw provider payload, full validation findings, or health data.

Each transition adds exactly one history entry. Previous history arrays are never mutated in place.

## What it proves

- finite deterministic retry state
- transport and validation policy separation
- no automatic acceptance after HTTP / provider success
- no retry escalation of physiology
- safe terminal outcomes

## What it does not prove

- real image quality
- real ValidationEvidence generation
- production request rebuilding
- provider fallback
- model switching
- production billing safeguards
- real retry latency
- production observability

## Known limitations

- one-provider retry only
- no RetryRequestBuilder
- no formatter adjustment application
- no production route
- no image analysis
- no shadow mode
- no billing guard

## Permanent rule

> Retry may make an approved request safer or more faithful.  
> Retry may never make the physiological transformation stronger.
