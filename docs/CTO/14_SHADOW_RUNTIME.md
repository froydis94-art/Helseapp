# Shadow Runtime Foundation

Status:  
Observation foundation — not production-integrated  
Transport: **mock-only, data-only fixtures** (network-impossible by construction)

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

Shadow calls existing `AiOsRuntime` through an **internal** shadow-safe wrapper built only by the factories. Direct runtime injection is unavailable. It does not reimplement TransformationEngine, VisualDirector, RenderPlan, ProviderFormatter, transport, ResultValidator, or RetryOrchestrator.

## Construction (PATCH 014C) + mock-only transport (014A / 014B)

Safe factories are the **only** supported construction path:

- `createDryRunShadowRuntime` → kind `"none"` (disabled + `runtime_only`), sealed `productionCapability: "dry_run_shadow_v1"`
- `createMockTransportShadowRuntime({ mockResults, now })` → kind `"mock"`, declarative fixture queue only, sealed `productionCapability: "mock_shadow_v1"`

`productionCapability` is assigned only through the module-private construction token. Callers cannot forge a dry-run capability on a mock or structural `{ run }` object. ProductionRuntimeGateway (PATCH 015A) accepts only `"dry_run_shadow_v1"`.

Direct construction is unavailable:

- `ShadowRuntime` construction requires a **module-private construction token** (TypeScript `private` constructor is impractical for module-level factories; token is never exported)
- Callers cannot `new ShadowRuntime(...)` with an injected `run` callback or fake safe runtime
- `ShadowSafeRuntime` and usable `ShadowRuntimeDependencies` are **not** public contracts
- `createShadowRuntimeDependencies` is not a construction API (throws if invoked)

Transport shadowing is **mock-only** and **data-only**. Real provider shadow traffic is structurally unavailable.

Avoiding duplicate billing is enforced **by construction**, not convention:

- Factories alone attach internal `shadowTransportKind: "none" | "mock"`
- Mock transport is driven only by immutable `ReplicateTransportResult` fixtures (`ShadowMockTransportScript`) — the only mock transport input
- No caller-supplied `generate` callback, `fetch`, network dependency, runtime dependency, or real `ReplicateTransportAdapter` is accepted
- Shadow internally constructs a data-only adapter that clones the next fixture (or fails safely when exhausted)
- Brand / construction tokens are **module-private** — never exported, never accepted from callers
- Mode/kind mismatch returns `invalid_input` with **zero** runtime calls and **zero** transport calls
- Shadow code never creates a real `ReplicateTransportAdapter`, never reads `process.env`, never adds feature flags or production wiring

`createShadowRuntimeFromAiOsDeps` is deprecated for unsafe use: **any** `transportAdapter` (branded or otherwise) throws `SHADOW_UNBRANDED_TRANSPORT_ERROR`. Without an adapter it yields dry-run shadow only. `runtime_with_transport_mock` is constructible only through the data-only mock-results factory.

Future **real** shadow traffic (live provider observation) requires a **separate explicit CTO demand** with billing controls and sampling policy. Until then, real Replicate traffic through Shadow is forbidden.

## Execution modes

| Mode | Behavior | Required `shadowTransportKind` |
| --- | --- | --- |
| `disabled` | Return immediately. Zero runtime invocations. | any |
| `runtime_only` | Run AI OS Runtime once in `dry_run`. Collect metrics. Discard artifacts. | `"none"` or `"mock"` |
| `runtime_with_transport_mock` | Run AI OS Runtime once in `transport_mock` with data-only fixtures. Collect metrics. Discard artifacts. | `"mock"` exactly |

One shadow invocation performs at most one `AiOsRuntime.run` call and consumes at most one mock transport result. Shadow never performs an automatic retry loop or a second transport attempt.

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
- transport_mock still performs at most one transport call — and only via data-only fixtures
- disabled mode performs zero runtime work
- caller-supplied transport functions, run callbacks, and real adapters cannot open provider traffic through Shadow
- ShadowRuntime construction is factory-only (module-private construction token)

## What it does not prove

- production route behavior
- real Replicate billing
- user-facing UI
- persistence / retention
- automatic controlled retry loops
- production privacy lifecycle
- cutover readiness without an explicit promotion demand
- live provider shadow observation (not supported; separate CTO demand required)

## Known limitations

- observation only — not production-wired
- dry_run and transport_mock only (data-only mock fixtures required)
- no real provider shadow traffic
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
- no real provider shadow traffic without a separate billing/sampling demand

## Permanent rule

> Shadow Runtime may observe every AI decision.
> Shadow Runtime may never replace production until explicitly promoted.
> Shadow Runtime may never open real provider traffic until explicitly demanded with billing controls.
