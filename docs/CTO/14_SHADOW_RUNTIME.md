# Shadow Runtime Foundation

Status:  
Observation foundation — not production-integrated

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Architecture: [AI OS v2.0 Architecture](./04_AI_OS_V2_ARCHITECTURE.md)  
Related: [AI OS Runtime](./13_AI_OS_RUNTIME.md), [Retry Orchestrator](./12_RETRY_ORCHESTRATOR.md), [Result Validator](./10_RESULT_VALIDATOR.md), [Replicate Transport Adapter](./11_REPLICATE_TRANSPORT_ADAPTER.md), [Migration Roadmap](./05_AI_OS_V2_MIGRATION_ROADMAP.md)

## Purpose

Shadow Runtime executes the complete AI OS Runtime pipeline **without replacing production**.

It exists only for:

- architecture verification
- quality measurement
- deterministic replay
- future production rollout preparation

Shadow Runtime is an observer. Never the production owner.

## Architecture

```
Legacy Request
→ Legacy Pipeline
→ User receives current result

Same Request (parallel observation)
→ AI OS Runtime (via Shadow Runtime)
→ Shadow Result
→ Metrics only
→ Discard
```

No user sees Shadow output. Legacy production generation, UI, Expo, App.js, and `lib/replicate.js` remain unchanged.

Shadow calls existing `AiOsRuntime`. It does not reimplement TransformationEngine, VisualDirector, RenderPlan, ProviderFormatter, transport, ResultValidator, or RetryOrchestrator.

## Execution modes

| Mode | Behavior |
| --- | --- |
| `disabled` | Return immediately. Zero runtime invocations. |
| `runtime_only` | Run AI OS Runtime once in `dry_run`. Collect metrics. Discard artifacts. |
| `runtime_with_transport_mock` | Run AI OS Runtime once in `transport_mock`. Collect metrics. Discard artifacts. |

One shadow invocation performs at most one `AiOsRuntime.run` call. Shadow never performs an automatic retry loop or a second transport attempt.

## Metrics

Collect only architecture telemetry:

- runtime duration
- stage durations
- stage count
- outcome flags (`retryRequested`, `accepted`, `rejected`, `awaitingValidation`, `transportFailure`)
- runtime mode
- runtime / formatter / validator / retry version stamps

Never collect prompts, images, URLs, tokens, body measurements, health payloads, plans, formatted requests, validation evidence, or transport payloads.

## Replay

Replay records store:

- `traceId`
- runtime version
- runtime mode
- terminal outcome
- stage sequence
- version stamps
- metrics

Replay MUST NOT store:

- image / Base64
- prompt
- URL
- token
- body measurements
- health payload
- RenderPlan
- TransformationPlan
- formatted request
- ValidationEvidence
- transport payload

Replay is architecture telemetry only. Records are JSON-serializable.

## Security

Shadow results are sanitized more strictly than internal runtime results:

- no Base64 / `data:image/`
- no Authorization / Bearer
- no API tokens (`r8_`, `sk-`, `REPLICATE_API_TOKEN`)
- no `http://` / `https://` URLs (no output-image URL exception)
- no stack traces
- no health payloads
- artifacts discarded before exposure

Log and observability views must use this safe shadow surface — never dump raw `AiOsRuntimeResult` artifacts.

## What it proves

- AI OS Runtime can be observed beside production without replacing it
- metrics and replay can be collected without leaking sensitive content
- one shadow invocation maps to one runtime execution
- transport_mock still performs at most one transport call
- disabled mode performs zero runtime work

## What it does not prove

- production route behavior
- real Replicate billing
- user-facing UI
- persistence / retention
- automatic controlled retry loops
- production privacy lifecycle
- cutover readiness without an explicit promotion demand

## Known limitations

- observation only — not production-wired
- dry_run and transport_mock only
- no production writes
- no image storage
- no user-facing results
- no automatic retries
- no physiology / prompt / formatter / RenderPlan mutation
- no legacy pipeline replacement

## Future Production Activation

Shadow Runtime may later support comparison against legacy results and gated rollout metrics. Activation requires an explicit CTO demand. Until then:

- no public API route
- no feature-flag cutover
- no Vercel / Expo / App.js wiring
- no replacement of the legacy Replicate flow

## Permanent rule

> Shadow Runtime may observe every AI decision.
> Shadow Runtime may never replace production until explicitly promoted.
