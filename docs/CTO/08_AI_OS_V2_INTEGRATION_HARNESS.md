# AI OS v2 Integration Harness

Status:  
Developer-only dry-run foundation — not production-integrated

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Architecture: [AI OS v2.0 Architecture](./04_AI_OS_V2_ARCHITECTURE.md)  
Related: [Migration Roadmap](./05_AI_OS_V2_MIGRATION_ROADMAP.md), [RenderPlan](./06_RENDER_PLAN.md), [Provider Formatter](./07_PROVIDER_FORMATTER.md), [Visual Director](./03_VISUAL_DIRECTOR.md), [Model Adapter](./02_MODEL_ADAPTER.md)

## Purpose

The harness verifies that HelseApp AI OS v2 layers compose as one deterministic pipeline without generating an image or contacting any provider.

It is a developer-only verification tool. It must never run automatically in production, bill providers, or change user-facing behavior.

## Pipeline

```
validated fixture
→ TransformationEngine
→ TransformationPlan
→ VisualDirector
→ VisualDirection
→ RenderPlanBuilder
→ RenderPlan validation
→ FluxFormatter
→ formatted request validation
→ sanitized report
```

Stages recorded on the report (stable order):

1. `input_validation`
2. `transformation_plan`
3. `visual_direction`
4. `render_plan`
5. `render_plan_validation`
6. `provider_formatting`
7. `formatted_request_validation`
8. `completed`

Validation failures stop early (no later stages, no formatting after a failed RenderPlan validation).

## What it proves

- contracts are compatible across adjacent layers
- no harness stage mutates upstream artifacts
- trace metadata survives into versions and formatter metadata
- provider-neutral `RenderPlan` intent becomes formatter output
- invalid input stops at the validation boundary
- no network or billing occurs

## What it does not prove

- visual image quality
- identity preservation in actual generated output
- provider availability
- latency
- cost
- real timeout behavior
- production privacy lifecycle
- result validation quality

## Fixtures

| Fixture | Intent |
| --- | --- |
| `validRecompositionFixture` | Moderate 24-week recomposition with known BF% and waist/shoulders focus |
| `missingBodyFatFixture` | Valid path when current and target BF% are unknown — unknowns stay unknown |
| `invalidPriorityFixture` | Invalid priority (e.g. `1.5`) fails at input validation |
| `shortTimelineFixture` | Borderline short (4-week) timeline with unusual-timeline warning |

All fixtures use fictional, generic test data only.

## Report

`AiOsV2HarnessReport` includes:

- `traceId` — deterministic, non-sensitive identifier from safe structural fields
- `stages` — ordered stage results with durations, warnings, and errors
- `versions` — schema/rules/formatter version metadata
- `summary` — timeline, intensity, visibility, approved change ids, formatter warning codes, reliability
- `artifacts` — optional `TransformationPlan`, `VisualDirection`, `RenderPlan`, `FormattedImageRequest`
- `warnings` / `errors` — aggregated, user-safe messages

Reports must remain JSON-serializable and free of image data, Base64, tokens, URLs, and raw health payloads.

## Privacy and safety

- no images
- no Base64
- no tokens
- no raw health payloads
- no real user data
- sanitized output via `sanitizeHarnessReport`

Unsafe strings are **redacted** (replaced with `[REDACTED_FORBIDDEN_CONTENT]`), not merely detected. Redaction forces `success: false` and adds exactly one explicit error. It never silently marks an unsafe report successful, and never leaves forbidden content in the returned report.

## Running

```
npm run test:ai
npm run harness:ai
```

`harness:ai` runs `validRecompositionFixture` through the dry-run pipeline and prints a sanitized JSON report (exit 0 on success, 1 on failure).

Direct usage from tests or Node:

```ts
import { runAiOsV2Harness, validRecompositionFixture } from "./src/ai/harness";

const report = runAiOsV2Harness(validRecompositionFixture);
```

## Module map

| File | Role |
| --- | --- |
| `src/ai/harness/AiOsV2Harness.ts` | Contracts, `runAiOsV2Harness`, `sanitizeHarnessReport`, trace ID |
| `src/ai/harness/fixtures.ts` | Shared dry-run fixtures |
| `src/ai/harness/index.ts` | Barrel exports |
| `src/ai/__tests__/aiOsV2Harness.test.ts` | Integration harness tests |
| `scripts/run-ai-os-v2-harness.ts` | Optional CLI |

Also re-exported from `src/ai/index.ts`.

## Known limitations

- FluxFormatter only
- no network
- no ModelAdapter transport
- no ResultValidator
- no production feature flag
- no image fixtures

## Permanent rule

> The harness proves data-flow integrity.  
> It does not authorize production traffic or redefine transformation logic.
