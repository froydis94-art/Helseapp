# AI OS Runtime Foundation

Status:  
Single-cycle orchestration foundation — not production-integrated

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Architecture: [AI OS v2.0 Architecture](./04_AI_OS_V2_ARCHITECTURE.md)  
Related: [Integration Harness](./08_AI_OS_V2_INTEGRATION_HARNESS.md), [Result Validator](./10_RESULT_VALIDATOR.md), [Replicate Transport Adapter](./11_REPLICATE_TRANSPORT_ADAPTER.md), [Retry Orchestrator](./12_RETRY_ORCHESTRATOR.md), [Migration Roadmap](./05_AI_OS_V2_MIGRATION_ROADMAP.md)

## Purpose

AI OS Runtime is the controlled entry point that coordinates existing AI OS v2 layers into one orchestration cycle.

It orders stages, injects dependencies, records safe trace metadata, and returns a sanitizable `AiOsRuntimeResult`. It does not own physiology, prompts, validation scores, or retry policy.

## Architectural position

```
Validated input
→ TransformationEngine
→ VisualDirector
→ RenderPlan
→ ProviderFormatter
→ optional Transport
→ optional ResultValidator
→ RetryOrchestrator
→ RuntimeResult
```

Canonical AI OS v2 placement: after domain validation and before any future production route or shadow executor. The runtime calls existing layers; it does not replace them.

## Runtime modes

| Mode | Behavior |
| --- | --- |
| `dry_run` | Deterministic pipeline through formatted request validation. No transport. No ResultValidator. No RetryOrchestrator. |
| `transport_mock` | Same pipeline, then exactly one injected transport call, RetryOrchestrator transitions, and optional ResultValidator when evidence is supplied. |

No production mode exists yet. No public API route, feature flag, or Vercel wiring is introduced by this foundation.

## Responsibilities

- layer ordering
- stage boundaries
- single-cycle execution
- dependency injection
- safe runtime result
- trace metadata
- controlled branching (`dry_run` / `transport_mock`)

## Forbidden responsibilities

- physiology
- prompt ownership
- image analysis
- ValidationEvidence creation
- retry policy
- network retry loops
- provider selection
- model-tier selection
- UI behavior
- production activation

## Single-cycle rule

One runtime invocation may make at most one transport call.

A `retry_required` result must be handled by a future caller or shadow runtime, not looped internally. The runtime never performs an automatic second transport attempt.

## Dry-run mode

`dry_run` executes:

1. runtime + domain input validation  
2. TransformationEngine  
3. VisualDirector  
4. RenderPlanBuilder + RenderPlan validation  
5. FluxFormatter + formatted request validation  

Terminal outcome: `dry_run_complete`.

Artifacts include TransformationPlan, VisualDirection, RenderPlan, and FormattedImageRequest. No transport, validation decision, or retry decision.

Dry-run is deterministic except for stage `durationMs` values.

## Transport-mock mode

`transport_mock` requires:

- an injected `ReplicateTransportAdapter` dependency  
- a `sourceImage`  
- no `process.env` reads inside the runtime  

After formatting:

1. Invoke transport exactly once.  
2. Pass the transport result to `RetryOrchestrator`.  
3. On transport failure: return `retry_required` or `transport_failed` / `rejected` per orchestrator decision — without a second transport call.  
4. On transport success: require `await_validation`. Provider success is never automatic acceptance.  
5. Without `validationEvidence`: return `awaiting_validation`.  
6. With evidence: require `candidateId === predictionId`, call `ResultValidator`, then `RetryOrchestrator`, and return `accepted` / `retry_required` / `rejected`.

## Candidate identity

Candidate identity maps as:

`candidateId = transportResult.predictionId`

Image URLs must never be used as candidate identity. A mismatch yields `invalid_runtime_state` without calling ResultValidator or a validation retry transition.

## Sanitization

`RuntimeSanitizer.sanitizeAiOsRuntimeResult` deep-clones the result, redacts unsafe strings to `[REDACTED_RUNTIME_CONTENT]`, sets `success` to false, sets `terminalOutcome` to `invalid_runtime_state`, and adds exactly one error:

`Runtime result contained forbidden sensitive or transport content.`

Unsafe patterns include `data:image/`, Authorization/Bearer, `REPLICATE_API_TOKEN`, API-key-like text, `http://` / `https://`, long Base64-like strings, stack traces, and token-like `r8_` / `sk-` values.

Sanitization is deterministic and idempotent. It does not mutate the original result.

## What it proves

- all core contracts can be orchestrated through one boundary
- no layer bypass
- provider success is not acceptance
- validation and retry policy remain separate
- single transport call per invocation
- safe stage ordering

## What it does not prove

- production route behavior
- real image-quality analysis
- production retry loop
- real Replicate billing
- shadow execution
- user-facing UI
- persistence
- observability
- production privacy lifecycle

## Known limitations

- dry-run and mocked transport only
- no real vision adapter
- no production route
- no shadow mode
- no storage
- no retry request builder
- no automatic second attempt
- no provider fallback

## Permanent rule

> Runtime coordinates approved layers.  
> Runtime may never bypass, duplicate, or redefine their authority.
