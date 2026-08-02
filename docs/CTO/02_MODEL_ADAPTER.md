# Model Adapter Layer

Status: Sprint 2 foundation (stubs only)  
Related: [AI Constitution](./00_AI_CONSTITUTION.md), [Sprint 1 Completion](./01_SPRINT_1_COMPLETION.md)

## Purpose

The model adapter layer is the provider-independent boundary between HelseApp’s transformation intelligence and external image models.

HelseApp owns physiology and prompts. Adapters only render.

> The image model never decides the transformation. HelseApp calculates the transformation; the image model only visualizes it.

This layer ensures:

- the transformation **engine never calls Replicate** (or any provider)
- the **app never knows prompt construction details**
- providers (Replicate, OpenAI, Imagen, SDXL, Flux) remain replaceable infrastructure

## Architecture flow

```
BodyProfile
  → TransformationGoal
  → TransformationEngine
  → TransformationPlan
  → PromptBuilder (PromptPackage)
  → ModelAdapter (ImageGenerationRequest → ImageGenerationResult)
  → providers (future live implementations)
```

| Stage | Owns | Must not |
| --- | --- | --- |
| Engine / GoalPlanner | Physiology estimates, plan | Call image APIs or build provider prompts |
| PromptBuilder | Model-independent PromptPackage | Recalculate fat/muscle/timeline or call models |
| ModelAdapter | Map request → provider → normalized result | Own transformation rules or UI |
| Production UI / `lib/replicate.js` | Current live pipeline (unchanged) | Import adapter until explicit cutover |

## Module map (`src/ai/model/`)

| File | Role |
| --- | --- |
| `ImageGenerationRequest.ts` | PromptPackage + aspect ratio, seed, quality, style, generic `providerOptions` |
| `ImageGenerationResult.ts` | success, imageUrl, provider, model, generationTimeMs, warnings, metadata |
| `ModelAdapter.ts` | Interface: `generate(request): Promise<ImageGenerationResult>` |
| `ReplicateAdapter.ts` | **Stub** — maps PromptPackage → request; no fetch, no API keys |
| `ModelRegistry.ts` | `register()`, `get()`, `default()` |
| `index.ts` | Barrel exports |

Also re-exported from `src/ai/index.ts`.

## Current state (DEMAND 004)

- Architecture, types, stub adapter, registry, tests, and this doc only.
- `ReplicateAdapter.generate` returns a structured **non-success** stub result.
- **Not wired** into production UI, Vercel routes, or `lib/replicate.js`.
- Production Flux / Replicate prompt pipeline (`lib/visuellPrompt.js`) is unchanged.

## Future providers

Adapters should share `ImageGenerationRequest` / `ImageGenerationResult` and differ only in translation + transport:

| Provider | Expected adapter | Notes |
| --- | --- | --- |
| Replicate | Live `ReplicateAdapter` (replaces stub) | Flux Kontext / other hosted models; prediction polling lives inside adapter |
| OpenAI Images | `OpenAIImagesAdapter` | Map PromptPackage fields to Images API input; no physiology |
| Google Imagen | `ImagenAdapter` | Same request contract; provider options stay opaque |
| Stability SDXL | `SdxlAdapter` | Negative prompt + quality mapping only |
| Flux (direct) | `FluxAdapter` or via Replicate | Flux-specific syntax stays in the adapter, never in PromptBuilder |

Provider-specific IDs (prediction ids, version hashes, API tokens) must never appear on `ImageGenerationRequest`. Secrets stay server-side when live adapters are introduced.

## Integration rule for Sprint 2+

Cutover requires an explicit demand: register a live adapter, prove plan → prompt → adapter shape in a harness, then point production at the registry — without moving physiology into the adapter.
