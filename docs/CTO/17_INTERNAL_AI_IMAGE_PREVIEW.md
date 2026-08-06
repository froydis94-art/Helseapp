# Internal AI OS v2 Image Preview

Status:  
Internal paid-provider visual-quality laboratory

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Architecture: [AI OS v2.0 Architecture](./04_AI_OS_V2_ARCHITECTURE.md)  
Related: [AI OS Runtime](./13_AI_OS_RUNTIME.md), [Replicate Transport Adapter](./11_REPLICATE_TRANSPORT_ADAPTER.md), [Result Validator](./10_RESULT_VALIDATOR.md), [AI OS Control Room](./16_AI_OS_CONTROL_ROOM.md)

## Purpose

Give an authorized developer a controlled way to generate **one** AI OS v2
preview image from an allowlisted fictional scenario plus a temporary source
photograph, then inspect plans, formatter output, stages, validation, and
provider metadata side by side with the source.

This is an internal visual-quality laboratory. It is not public production
generation, onboarding, wearable integration, medical prediction, batch
generation, automatic retry experimentation, or a production cutover.

## Architecture

```
Control Room browser
→ authorized internal preview API
→ allowlisted fictional scenario
→ temporary source image validation
→ AiOsRuntime (transport_mock + injected ReplicateTransportAdapter)
→ TransformationPlan
→ VisualDirection
→ RenderPlan
→ Provider Formatter
→ one provider request
→ ResultValidator (provisional evidence until vision adapter exists)
→ safe preview projection
→ Control Room image comparison
```

Runtime note: AI OS Runtime currently exposes `dry_run` and `transport_mock`.
Internal live preview uses `transport_mock` with a real (or test-fake)
`ReplicateTransportAdapter`. That is the supported single-cycle live contract —
no parallel runtime is invented.

Production ownership remains:

`api/generate-future-you.js` → `lib/replicate.js` → existing image flow

Preview uses a separate endpoint only: `api/ai-os-image-preview.ts`.

## Feature flags

Document names only (never values):

- `AI_OS_IMAGE_PREVIEW_ENABLED`
- `AI_OS_IMAGE_PREVIEW_MAX_REQUESTS_PER_HOUR`
- `AI_OS_IMAGE_PREVIEW_MODEL`
- `REPLICATE_API_TOKEN`
- `AI_OS_CONTROL_ROOM_ACCESS_KEY`

Enabled only when `AI_OS_IMAGE_PREVIEW_ENABLED` is exactly `1`. Default is
disabled. Preview stays off until the owner manually adds the flag.

Hourly cap defaults to `3` (min `1`, max `10`; invalid → `3`).

Model uses transport default unless `AI_OS_IMAGE_PREVIEW_MODEL` is a valid
owner/name override. The browser never supplies a model name.

Authentication reuses the Control Room access key header
`X-AI-OS-Control-Room-Key` (SHA-256 timing-safe compare). No second browser key
system.

## Privacy model

- no database storage
- no filesystem persistence
- no HelseApp object-storage upload
- no logs containing image content or Base64
- no analytics
- no cache of source images
- no request-body logging of images
- no source image in error responses or telemetry
- no `localStorage` / `sessionStorage` for images
- browser image state cleared on Lock and page refresh

## Billing guard

Generate requires an explicit checkbox:

> I understand that this creates one paid AI provider request.

The POST body must include `billingConfirmed: true` as a literal boolean.
Missing, `false`, `"true"`, or numeric truthy values are rejected. No provider
request starts before this check succeeds.

## Request cap

Best-effort in-memory hourly cap keyed by a SHA-256 digest of the access
context (never the raw key, never raw IP in responses/logs).

Serverless instances may each keep separate memory. This is a billing guard,
not strong distributed security.

Also enforced in the browser:

- one Generate request in flight
- no parallel Generate clicks
- no automatic retry
- no batch endpoint
- exactly one provider output per accepted request

Exceeded cap → HTTP `429` / `preview_rate_limited`.

## Source-image lifecycle

1. Browser selects JPEG/PNG/WebP.
2. Canvas redraw (max long edge 1600, JPEG ~0.85, no upscale) strips EXIF.
3. Data URI held in memory only.
4. POST to internal preview API after billing confirmation.
5. Server re-validates MIME, magic bytes, and ≤ 5 MB decoded size.
6. Image is passed once into AI OS transport as `data_uri`.
7. Browser clears on Lock/refresh; server does not persist.

Rejected: SVG, GIF, HEIC (no converter), PDF, video, multiple images, remote
URL, malformed Base64, empty, oversized, MIME mismatch.

## Generated-image lifecycle

- one temporary HTTPS provider URL may appear in the authorized preview result
- marked `expiresOrIsTemporary: true`
- openable in a new tab when HTTPS
- no download/share/gallery persistence by HelseApp
- not returned when projection sanitizer detects unsafe content

## Provider processing notice

The source image may be transmitted only to:

browser → HelseApp internal preview API → configured AI provider

The external provider may process the source image according to its own
configured retention and privacy terms. Do not claim zero provider retention
unless proven by provider configuration.

## Validation behavior

After the single transport call, ResultValidator runs with provisional
deterministic evidence (preview laboratory). Real vision analysis is deferred.
Acceptance or rejection is projected safely. Validation rejection does not
trigger another provider call.

## No automatic retry

Even when RetryOrchestrator would recommend retry:

- Demand 017 makes at most one provider request
- retry decisions are informational only
- the browser must not silently retry
- the operator may manually submit a new paid request after reviewing the result

## What remains unchanged

- `api/generate-future-you.js`
- `lib/replicate.js`
- `lib/visuellPrompt.js`
- `lib/transformasjonLogikk.js`
- `public/index.html`
- Control Room dry-run unlock and scenario dry-run
- ProductionRuntimeGateway / Shadow Runtime ownership
- public HelseApp user experience

## What this milestone proves

- AI OS v2 can drive one authorized internal live preview
- Control Room can compare source vs generated output
- plans, formatter prompts, stages, validation, and safety are inspectable
- billing confirmation and request cap gate paid traffic
- production generation path stays untouched
- preview defaults to disabled

## What this milestone does not prove

- final identity / anatomy / realism quality for public release
- production cutover readiness
- distributed rate limiting
- real vision-based ResultValidator evidence
- provider retention configuration
- unlimited or batch preview capacity

## Manual activation

Owner actions required (not automated by this demand):

1. Set Production env `AI_OS_IMAGE_PREVIEW_ENABLED=1`.
2. Ensure `AI_OS_CONTROL_ROOM_ACCESS_KEY` and `REPLICATE_API_TOKEN` are set.
3. Optionally set `AI_OS_IMAGE_PREVIEW_MAX_REQUESTS_PER_HOUR` and
   `AI_OS_IMAGE_PREVIEW_MODEL`.
4. Redeploy Production.
5. Unlock Control Room, select scenario, upload photo, confirm billing, Generate.

Do not automatically create or alter Vercel environment variables from agents.

## Manual verification checklist

- Control Room unlock still works
- Dry-run scenario still works
- Preview returns disabled without the flag
- With flag: one confirmed request produces one preview
- Source cleared on Lock
- No secrets visible in UI JSON
- No automatic retry after provider/validation failure

## Vercel runtime packaging (PATCH 017A)

Vercel Node cannot execute the `../src/**` TypeScript AI OS graph via runtime
`import()` / `require()` of `.ts` barrels (`ERR_UNSUPPORTED_DIR_IMPORT` on paths
such as `../runtime`). Internal preview therefore ships a **prebundled CJS**
artifact:

`src/ai/control-room/imagePreviewRuntime.bundle.cjs`

Built with:

`npm run build:ai-image-preview-runtime`

`api/ai-os-image-preview.ts` requires that artifact only after feature flag,
auth, billing confirmation, and request validation. Auth/disabled paths return
identified JSON without loading the heavy graph. Rebuild and commit the bundle
whenever `ImagePreviewService` or its AI OS dependency graph changes.

Safe authorized `diagnostic` values on failure responses:

- `module_load_failed`
- `module_shape_invalid`
- `service_construct_failed`
- `runtime_execute_failed`
- `provider_failure`
- `provider_timeout`
- `provider_invalid_input`
- `provider_auth_error`
- `provider_http_error`
- `token_missing`
- `validation_failed`
- `projection_failed`

Missing / empty `REPLICATE_API_TOKEN` maps to HTTP `502` / `provider_failure`
with diagnostic `token_missing` (not an opaque `runtime_failure`).

Preview provider wiring (PATCH 017B):

- Vercel function `maxDuration: 120` and `bodyParser.sizeLimit: 10mb`
- Preview transport create timeout `60s`, total timeout `120s` (data-URI upload budget)
- Replicate create uses `Prefer: wait` capped below create timeout
- Transport failure codes map to the diagnostics above (still one provider call, no retry)

## Known limitations

- provisional ResultValidator evidence (no vision adapter yet)
- in-memory rate cap is per serverless instance
- Vercel request body size may constrain large uploads (browser compresses first;
  API raises the parser limit to 10mb for preview)
- preview runtime is prebundled CJS (rebuild after AI OS graph changes)
- paid provider verification still requires owner browser confirmation

## Next milestone

Demand 018 — Preview Evaluation and Prompt Calibration

Demand 018 will focus on:

- side-by-side quality scoring
- identity preservation review
- anatomy review
- realism review
- prompt and formatter calibration
- no public cutover

Permanent rules:

> Internal preview may make one explicitly confirmed provider request.

> Internal preview may never silently retry, batch, persist personal images, or
> replace production generation.
