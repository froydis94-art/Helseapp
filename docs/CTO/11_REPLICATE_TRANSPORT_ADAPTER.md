# Replicate Transport Adapter

Status:  
Server-side transport foundation — disabled and not production-integrated

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Architecture: [AI OS v2.0 Architecture](./04_AI_OS_V2_ARCHITECTURE.md)  
Related: [Model Adapter](./02_MODEL_ADAPTER.md), [Provider Formatter](./07_PROVIDER_FORMATTER.md), [Result Validator](./10_RESULT_VALIDATOR.md), [Migration Roadmap](./05_AI_OS_V2_MIGRATION_ROADMAP.md)

## Purpose

`ReplicateTransportAdapter` transports an already approved and formatted image request (`FormattedImageRequest`) plus a protected source-image reference to Replicate, then normalizes the provider response into a safe transport result.

It does not calculate physiology, own prompts, mutate `RenderPlan`, or decide whether a candidate image is acceptable.

## Architectural position

```
TransformationPlan
→ VisualDirection
→ RenderPlan
→ ProviderFormatter
→ FormattedImageRequest
→ ReplicateTransportAdapter
→ Candidate Image
→ future Validation Evidence
→ ResultValidator
```

## Responsibilities

- server-side authentication
- request transport
- timeout and abort handling
- polling
- provider status normalization
- safe result normalization
- safe transport error categories

## Forbidden responsibilities

- physiology
- visual direction
- RenderPlan creation
- prompt ownership
- provider selection
- transformation escalation
- result acceptance
- automatic controlled retry
- UI behavior

## Existing legacy pipeline

- `lib/replicate.js` remains unchanged
- current production generation remains unchanged
- existing `ReplicateAdapter` stub remains unchanged
- no route imports the new transport adapter
- no cutover occurs in Demand 011

## Feature flag

```
AI_OS_V2_REPLICATE_ENABLED=1
```

Setting the flag does **not** activate production traffic by itself because no production route is connected to this adapter yet.

Config defaults to `enabled: false`. Missing env flag means disabled. Missing token means the adapter short-circuits with `missing_token` and performs zero fetch calls.

## Required server environment

Variable names only (never commit real values):

- `AI_OS_V2_REPLICATE_ENABLED`
- `REPLICATE_API_TOKEN`
- `AI_OS_V2_REPLICATE_MODEL`
- `AI_OS_V2_REPLICATE_CREATE_TIMEOUT_MS`
- `AI_OS_V2_REPLICATE_TOTAL_TIMEOUT_MS`
- `AI_OS_V2_REPLICATE_POLL_INTERVAL_MS`
- `AI_OS_V2_REPLICATE_MAX_POLL_ATTEMPTS`

Default model family reference: `black-forest-labs/flux-kontext-pro` (no cascade in this demand).

## Prompt / negative mapping

Flux Kontext Pro does not expose a separate `negative_prompt` input field.

When a formatted negative prompt is present, the transport appends a labeled `EXCLUSIONS` section to the positive prompt. This is provider capability adaptation only — exclusions are never weakened or removed. Approved transformation text is preserved as formatted.

Source image maps once to `input_image`. Supported aspect ratios and seeds pass through when present. Quality knobs are omitted rather than invented.

## Security

- token server-side only
- source image never logged
- prompt never logged
- provider payload not retained on the result
- polling URL host allowlist: `https://api.replicate.com/v1/predictions/...`
- no arbitrary redirects
- no raw provider errors (sanitized ≤ 200 characters)
- no Base64 / data URI in output metadata
- results never include API token, Authorization headers, or full prompts

## Timeout and abort model

- create timeout
- total timeout
- max polling attempts
- caller cancellation via `AbortSignal`
- abort-aware sleep between polls
- no automatic network retry yet

## Error model

| Code | Meaning | Typical retryable |
| --- | --- | --- |
| `adapter_disabled` | Feature flag off | false |
| `missing_token` | Server token absent | false |
| `invalid_request` | Transport input invalid | false |
| `unsupported_source_image` | Source image kind/policy reject | false |
| `request_aborted` | Caller abort | true |
| `request_timeout` | Create/total timeout | true |
| `provider_rate_limited` | HTTP 429 | true |
| `provider_auth_error` | HTTP 401/403 | false |
| `provider_validation_error` | HTTP 400/422 | false |
| `provider_unavailable` | HTTP 5xx | true |
| `provider_failed` | Provider failed/canceled prediction | false |
| `invalid_provider_response` | Unusable payload / untrusted poll URL / bad image output | false |
| `polling_exhausted` | Max poll attempts | true |
| `unknown_transport_error` | Unexpected failure | false unless clearly transient |

Retryability is advisory for a future Retry Orchestrator. This adapter does not auto-retry.

## Testing

Mocked-fetch unit tests cover config, validation, mapping, disabled/missing-token short circuits, HTTP mapping, polling security, abort/timeout, and serialization hygiene.

Zero real Replicate / internet traffic in tests.

## What it proves

- safe transport abstraction
- provider normalization
- server secret isolation
- abort and timeout behavior
- polling security

## What it does not prove

- actual Replicate model quality
- production route integration
- real provider latency
- real billing behavior
- image validation quality
- retry orchestration
- storage or retention behavior

## Known limitations

- one approved model family
- no model cascade
- no route
- no production feature flag wiring
- no webhook
- no result-validator integration
- no observability pipeline
- no provider fallback

## Permanent rule

> The transport adapter may deliver an approved request.  
> It may never redefine the transformation or decide whether the resulting image is acceptable.
