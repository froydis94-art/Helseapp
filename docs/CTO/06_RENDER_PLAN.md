# RenderPlan Foundation

Status: Foundation only — not production-integrated

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Architecture: [AI OS v2.0 Architecture](./04_AI_OS_V2_ARCHITECTURE.md)  
Related: [Visual Director](./03_VISUAL_DIRECTOR.md), [Model Adapter](./02_MODEL_ADAPTER.md), [Migration Roadmap](./05_AI_OS_V2_MIGRATION_ROADMAP.md)

## Purpose

`RenderPlan` is the provider-neutral structured rendering contract for HelseApp AI OS v2.0.

It carries approved visual changes, preservation rules, anatomy and realism constraints, exclusions, and trace metadata between VisualDirection and a future ProviderFormatter.

It does not contain a provider-ready prompt as the source of truth. Provider-ready prompt text is a derived artifact created later by a formatter.

## Architectural position

```
TransformationPlan
  → VisualDirection
  → RenderPlanBuilder
  → RenderPlan
  → future ProviderFormatter
  → ModelAdapter
```

## Responsibilities

- preserve identity and source scene
- carry approved transformation changes
- carry anatomy and realism constraints
- carry exclusions
- carry trace metadata

## Forbidden responsibilities

- physiology calculation
- provider syntax
- network calls
- authentication
- model selection
- retries
- result validation
- UI presentation

## Why PromptPackage remains

Migration compatibility:

- `PromptPackage` remains supported during migration
- `RenderPlan` is the preferred long-term structured rendering source
- future ProviderFormatters derive provider prompts from `RenderPlan`
- no breaking cutover yet — production still uses the legacy prompt path

## Contract sections

| Section | Intent |
| --- | --- |
| `source` | Source-image edit operation and composition fidelity |
| `identity` | Same-person constraints (face, age appearance, hair, skin tone, distinctive features) |
| `scene` | Pose, camera, lighting, clothing, accessories, background preservation |
| `transformation` | Approved visual changes only — magnitudes and regions from `TransformationPlan`, visibility from `VisualDirection` |
| `anatomy` | Skeletal and limb constraints; proportional development |
| `realism` | Presentation/texture style plus photorealism constraints |
| `exclusions` | Explicit negatives (identity drift, impossible anatomy, glamour stereotypes, etc.) |
| `trace` | Schema/rules versions, plan reliability band, builder versioning |

## Validation

`validateRenderPlan` is a pure, deterministic helper. It checks at minimum:

- schema and rules versions
- `source.operation === "edit_source_image"`
- required preservation flags are `true`
- unique non-empty approved change ids and descriptions
- no duplicate exclusions
- no empty anatomy or realism constraint strings
- no provider/model keywords (`replicate`, `flux`, `sdxl`, `openai`, `imagen`, `api key`, `bearer`, `model id`, `inference steps`, `denoise`, `prompt strength`)
- no URL-like, API-key-like, or Base64-like strings
- no `undefined` values inside required objects

## Known limitations

- no ProviderFormatter yet
- no production integration
- no result validator
- no transport
- no feature flag
- current production path unchanged (`lib/visuellPrompt.js` / Replicate)

## Module map (`src/ai/render/`)

| File | Role |
| --- | --- |
| `RenderPlan.ts` | Types / constants / validation result interface |
| `RenderPlanBuilder.ts` | `buildRenderPlan` + `validateRenderPlan` |
| `index.ts` | Barrel exports |

Also re-exported from `src/ai/index.ts`.

## Permanent rule

> RenderPlan structures approved rendering intent.
> It does not decide physiology and it does not speak a provider's language.
