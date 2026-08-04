# AI OS Control Room

Status:  
Authorized fixture-only developer inspection interface

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Architecture: [AI OS v2.0 Architecture](./04_AI_OS_V2_ARCHITECTURE.md)  
Related: [AI OS Runtime](./13_AI_OS_RUNTIME.md), [Integration Harness](./08_AI_OS_V2_INTEGRATION_HARNESS.md), [Production Runtime Integration](./15_PRODUCTION_RUNTIME_INTEGRATION.md)

## Purpose

Control Room is the first visible AI OS v2 milestone. It lets an authorized
developer run predefined fictional dry-run scenarios and inspect the resulting
architecture without generating an image or changing production generation.

## URL

`/ai-os-control-room.html`

Availability depends on the server feature flag and access key. The HTML shell
may load publicly, but no AI OS data is returned until server-side authorization
succeeds.

## Architecture

```
Browser Control Room
→ authorized Control Room API
→ allowlisted fictional scenario
→ AiOsRuntime dry_run
→ developer-safe projection
→ visual inspection
```

## What is visible

- TransformationPlan
- VisualDirection
- RenderPlan
- formatter output
- runtime stages
- versions
- safety status

## What is not executed

- provider transport
- image generation
- ResultValidator
- RetryOrchestrator
- legacy generation
- production gateway
- health integration

## Feature flag

Document variable names only:

- `AI_OS_CONTROL_ROOM_ENABLED`
- `AI_OS_CONTROL_ROOM_ACCESS_KEY`

Enabled only when `AI_OS_CONTROL_ROOM_ENABLED` is exactly `1`. Default is
disabled. Never include real values in documentation or source.

## Authentication model

- access key sent in header `X-AI-OS-Control-Room-Key`
- key kept in browser memory only
- submitted and configured keys are hashed to fixed-length SHA-256 digests
  before timing-safe comparison
- digests are ephemeral and are not stored
- no original key length is used for comparison branching
- no cookie
- no local storage
- no URL key
- no cross-origin access

This is an internal development gate, not the final admin-auth model.

## API response identity

Every JSON Control Room API response includes:

```json
{
  "meta": {
    "service": "ai-os-control-room",
    "apiVersion": "1.1"
  }
}
```

This proves the browser reached the intended API route, not a generic Vercel
HTML error page.

Unauthorized GET responses still return JSON with `code: "unauthorized"` and
the same `meta` object. OPTIONS may remain 204 without a JSON body.

## Safe UI diagnostic codes

When unlock fails, the page shows a safe diagnostic block using `textContent`
only (never `innerHTML`):

- safe API `code` (or UI codes such as `non_json_response`,
  `network_failure`, `unexpected_api_response`)
- HTTP status (or `unavailable` for network failure)
- optional safe API message
- whether response identity metadata matched

The owner does **not** need browser developer tools.

Diagnostics never show:

- the access key
- key length
- digests / hashes
- environment values
- stack traces
- raw HTML or full raw server bodies
- request / response headers

## Owner unlock troubleshooting checklist

1. Save both Production environment variables
   (`AI_OS_CONTROL_ROOM_ENABLED=1` and `AI_OS_CONTROL_ROOM_ACCESS_KEY`).
2. Redeploy Production.
3. Open `/ai-os-control-room.html`.
4. Enter the access key and unlock.
5. If it fails, copy only the on-page **Code** and **HTTP** status.
6. Never share the access key.

## Fixture-only constraint

Four allowlisted fictional scenarios:

1. `balanced_recomposition_12w`
2. `upper_body_definition_8w`
3. `gradual_fat_loss_16w`
4. `athletic_strength_24w`

Custom profiles, goals, images, health payloads, and arbitrary formatter options
are deferred so the first visual milestone stays deterministic and safe.

## Security

- no image
- no health payload
- no real user
- no provider traffic
- no secret projection
- no persistence
- no logging of artifacts
- no third-party scripts

## Visual sections

- Access status bar
- Access unlock / lock panel
- Scenario selector
- Pipeline overview
- TransformationPlan
- VisualDirection
- RenderPlan highlights
- Provider Formatter (prompts collapsed by default)
- Version matrix
- Safety panel
- Raw developer projection (collapsible)

## What it proves

- runtime pipeline is visibly inspectable
- core layers agree on contracts
- plans and prompts can be reviewed side by side
- stage order is correct
- provider traffic remains off
- production remains unchanged

## What it does not prove

- real image quality
- real provider compatibility
- identity preservation in pixels
- anatomy quality in pixels
- actual ResultValidator evidence
- real retry behavior
- billing behavior
- public production readiness

## Known limitations

- fixture-only
- dry-run only
- no image
- no custom input
- no persistence
- no final admin authentication
- no side-by-side image comparison
- no live provider test

## Next milestone

Demand 017 — Internal AI OS v2 Image Preview

This later milestone must require:

- explicit provider billing guard
- explicit request cap
- internal-only authorization
- source-image privacy controls
- no public production cutover

## Permanent rule

> Control Room may reveal how AI OS reasons about fictional test scenarios.

> Control Room may never become an unguarded provider or production execution
> surface.

## Vercel serverless notes (PATCH 016D)

Control Room API is a plain Vercel Node serverless TypeScript handler under
`api/ai-os-control-room.ts`.

Do **not** export Next.js-style function config such as:

```ts
export const config = { runtime: "nodejs", maxDuration: 60 };
```

`@vercel/node` hard-fails builds when `config.runtime: "nodejs"` is present
(`config.runtime` semantics are evolving; Node is already the default for
`/api/*.ts`). Prefer:

- static `import` from `../src/ai/control-room`
- lazy runtime module loading via `import("../src/ai/control-room/index")`
- `import { createHash, timingSafeEqual } from "node:crypto"`
- default handler export only (plus test helper exports)

To avoid cold-start module initialization failures from returning generic non-JSON
500 pages, Control Room loads the service module only after feature-flag and
access-key checks pass. Lazy-load failures are returned as safe
`runtime_failure` JSON with standard `meta` identity and no stack/module path.

No `vercel.json` functions override is required for Control Room.
