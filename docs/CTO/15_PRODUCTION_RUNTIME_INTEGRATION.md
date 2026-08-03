# Production Runtime Integration Foundation

Status:  
Server-side migration control foundation — no route wiring and no v2 cutover

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Architecture: [AI OS v2.0 Architecture](./04_AI_OS_V2_ARCHITECTURE.md)  
Related: [Shadow Runtime](./14_SHADOW_RUNTIME.md), [AI OS Runtime](./13_AI_OS_RUNTIME.md), [Migration Roadmap](./05_AI_OS_V2_MIGRATION_ROADMAP.md)

## Purpose

The Production Runtime Gateway is the server-side control boundary that will later govern migration from the legacy image-generation pipeline to AI OS v2.

It evaluates deployment policy, kill-switch state, and deterministic sampling. The existing legacy pipeline remains the user-visible production owner. Optional Shadow observation is dry-run only and may never change the image returned to the user.

## Architectural position

```
Production request
→ ProductionRuntimeGateway
→ legacy ownership decision
→ optional safe Shadow dry run
→ production-safe telemetry
```

The gateway does not replace production generation. It returns a policy decision and optional allowlisted telemetry. Callers that later wire this foundation must still execute the existing legacy path for the user-visible result.

## Current production ownership

- existing legacy route remains unchanged
- existing legacy provider call remains unchanged
- existing image returned to the user remains unchanged
- gateway does not execute legacy generation
- gateway is not connected to a production route yet

Identified production entry (unchanged by this demand):

- Vercel serverless: `api/generate-future-you.js` → `generateWithReplicate` in `lib/replicate.js`
- Express local/dev: `server/index.js` `POST /api/generate-future-you`
- Client caller: `src/api/generateFutureYou.js`

## Supported modes

Operational in this foundation:

- `legacy_only` — policy returns legacy ownership; no Shadow
- `legacy_with_shadow_dry_run` — legacy ownership plus optional network-free Shadow dry run when sampled

Reserved contracts only (rejected by policy until an explicit promotion demand):

- `v2_dry_run_internal`
- `v2_live_disabled`

## Feature flags

Variable names only (never log or serialize raw deployment values):

- `AI_OS_PRODUCTION_MODE`
- `AI_OS_GLOBAL_KILL_SWITCH`
- `AI_OS_SHADOW_SAMPLE_BPS`
- `AI_OS_SHADOW_TIMEOUT_MS`

Safe defaults: `legacy_only`, kill switch off, sampling `0`, timeout `1500` ms.

## Sampling

Deterministic request sampling uses basis points from `0` to `10000`:

- `0` = no Shadow
- `10000` = all eligible requests
- bucket = stable hash of `requestId` mapped to `0..9999`
- no randomness
- stable request buckets
- no user identity in telemetry
- sampling does not affect user result

## Kill switch

When `AI_OS_GLOBAL_KILL_SWITCH` is exactly `"1"`, policy immediately collapses to `legacy_only` with `runShadowDryRun: false`. No Shadow invocation occurs.

## Fail-open behavior

All Shadow and AI OS failures preserve legacy service:

- invalid configuration
- unsupported mode
- invalid request context
- missing Shadow dependency
- Shadow timeout
- Shadow exception
- invalid Shadow result
- telemetry projection failure
- global kill switch

Gateway `success` remains `true` whenever legacy can continue. Shadow failure must never block the existing production path.

## Telemetry

Allowlisted projection fields only:

- `schemaVersion`
- `productionRulesVersion`
- `shadowRulesVersion`
- `runtimeRulesVersion`
- `runtimeMode` (`dry_run` or `null`)
- `terminalOutcome`
- `stageCount`
- `totalDurationMs`
- `stageDurationBuckets`
- `flags` (execution / outcome booleans)

Telemetry is currently returned only as a safe in-memory projection and is not persisted or logged.

## Security

Production gateway results must not contain:

- no prompt
- no image
- no URL
- no Base64
- no token
- no raw runtime result
- no replay
- no trace ID
- no health payload
- no user identity

Permanent decision invariants:

- `legacyRequired === true`
- `userVisibleOwner === "legacy"`
- `v2ProviderTrafficAllowed === false`

## What it proves

- migration policy can be evaluated safely
- deterministic sampling works
- kill switch works
- Shadow failure cannot block legacy
- safe telemetry can be projected
- legacy remains production owner

## What it does not prove

- production route integration
- real Shadow execution in Vercel
- live v2 provider traffic
- AI OS image quality
- production persistence
- real observability pipeline
- billing controls for v2 traffic
- production cutover readiness

## Known limitations

- no route wiring
- no persistence
- no live v2 transport
- no user-facing v2 result
- no provider comparison
- no canary output
- no rollback automation
- no operational dashboard

## Promotion prerequisites

Before any live v2 provider traffic:

- explicit CTO demand
- billing cap
- sampling cap
- provider kill switch
- privacy review
- retention policy
- observability
- production incident rollback plan
- confirmed GitHub Quality Gate

## Permanent rules

> Legacy remains the user-visible production owner until an explicit promotion
> demand changes that authority.

> Production migration must fail open to the stable legacy path.

> No shadow or v2 provider traffic may occur without an explicit billing and
> sampling policy.
