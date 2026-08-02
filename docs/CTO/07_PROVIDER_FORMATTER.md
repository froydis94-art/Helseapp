# Provider Formatter Layer

Status: Foundation only — not production-integrated

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Architecture: [AI OS v2.0 Architecture](./04_AI_OS_V2_ARCHITECTURE.md)  
Related: [RenderPlan](./06_RENDER_PLAN.md), [Model Adapter](./02_MODEL_ADAPTER.md), [Visual Director](./03_VISUAL_DIRECTOR.md), [Migration Roadmap](./05_AI_OS_V2_MIGRATION_ROADMAP.md)

## Purpose

Provider formatters translate provider-neutral `RenderPlan` objects into provider-compatible request content (`FormattedImageRequest`).

They understand model-family prompt conventions and supported option mapping.

They do not calculate physiology, mutate approved transformations, call providers, or authenticate.

## Architectural position

```
TransformationPlan
  → VisualDirection
  → RenderPlan
  → ProviderFormatter
  → FormattedImageRequest
  → ModelAdapter
```

## Responsibilities

- provider-specific prompt conventions
- supported option mapping
- capability warnings
- trace metadata
- deterministic formatting

## Forbidden responsibilities

- physiology
- changing approved transformations
- authentication
- network transport
- retries
- result validation
- API keys
- model selection
- UI behavior

## FluxFormatter

`FluxFormatter` is the first formatter implementation (Flux family conventions only).

### Six prompt sections

Positive prompts are built as:

1. `SOURCE` — edit the exact source photograph; keep composition; do not invent a new person or scene  
2. `IDENTITY` — same person, face, apparent age, hair, skin tone, distinctive features  
3. `SCENE` — pose, camera, lighting, clothing, accessories, background  
4. `TRANSFORM` — approved `RenderChange` descriptions only, plus natural-language visibility  
5. `ANATOMY` — skeletal frame and plausibility constraints from the RenderPlan  
6. `REALISM` — presentation/texture wording plus realism constraints  

### Natural-language enum translation

Internal keys such as `source_faithful`, `natural_athletic`, `documentary_fitness`, `restrained`, `clear`, `pronounced`, and `preserve_exactly` are translated into natural language and must not appear as raw enum tokens in the human prompt (for example, restrained → “subtle and understated”).

### Negative prompt behavior

Built only from `renderPlan.exclusions` (deduplicated, stable order). Identity and anatomy exclusions are never silently dropped.

### Supported aspect ratios

Accepted: `1:1`, `4:5`, `3:4`, `9:16`, `16:9`.

Unsupported values produce an `unsupported_aspect_ratio` warning and omit `aspectRatio` (no silent replacement).

### Seed validation

Finite non-negative integers pass through. Invalid seeds are omitted with a warning (no silent clamping).

### Style override limits

`styleOverride` may only choose among declared presentation styles. It changes presentation wording only and must not alter `approvedChanges` or visual intensity.

### Quality handling

`standard` and `high` pass through when valid.

### No model-tier selection

The formatter does not choose Flux model tiers, version hashes, denoise, inference steps, prompt strength, safety tolerance, or output format.

## Formatter versus Adapter

Formatter:

- builds provider-compatible content from `RenderPlan`

Adapter:

- performs provider transport and response normalization

`toImageGenerationRequest` is a pure compatibility helper that wraps formatter output in a `PromptPackage`-based `ImageGenerationRequest` without redesigning adapter contracts.

## Validation

`validateFormattedImageRequest` is a pure helper. It checks at minimum:

- `providerFamily` and metadata completeness
- non-empty prompt with all six sections
- `sourceOperation === "edit_source_image"`
- warning code/message shape
- seed and aspect-ratio validity when present
- no Base64-like, URL-like, API-key-like, or Authorization/Bearer content
- no `prompt_strength`, `num_inference_steps`, `denoise`, `model_version`, or version-hash markers
- no leaked internal enum keys in the human prompt

## PromptPackage migration

- `PromptPackage` remains supported during migration
- `RenderPlan` is the long-term structured rendering source
- `ProviderFormatter` is the preferred future formatting path
- no production cutover in this demand — production still uses `lib/visuellPrompt.js` / Replicate

## Module map (`src/ai/formatters/`)

| File | Role |
| --- | --- |
| `ProviderFormatter.ts` | Contracts, validation, `toImageGenerationRequest` |
| `FluxFormatter.ts` | Flux-family formatter |
| `index.ts` | Barrel exports |

Also re-exported from `src/ai/index.ts`.

## Known limitations

- Flux family only
- no real API calls
- no provider capability discovery
- no production adapter integration
- no result validator
- no feature flag

## Permanent rule

> A formatter may translate approved intent.  
> It may not strengthen, weaken, or redefine the transformation.
