# Visual Director

Status: foundation only, not production-integrated  
Related: [AI Constitution](./00_AI_CONSTITUTION.md), [Sprint 1 Completion](./01_SPRINT_1_COMPLETION.md), [Model Adapter](./02_MODEL_ADAPTER.md)

## Purpose

The Visual Director is a deterministic layer between `TransformationPlan` and `PromptBuilder`.

It controls photographic presentation and rendering emphasis for approved plan changes.

It does **not** calculate physiology, mutate the plan, or call an image provider.

## Architectural position

```
BodyProfile
  → TransformationGoal
  → TransformationEngine
  → TransformationPlan
  → VisualDirector
  → VisualDirection
  → PromptBuilder (PromptPackage)
  → ModelAdapter
  → providers (future)
```

## Permanent rule

> TransformationEngine decides what changes.
> VisualDirector decides how those approved changes are visually emphasized.
> PromptBuilder translates the result.
> ModelAdapter delivers it to a provider.

## Responsibilities

- Map `plan.visualIntensity` to `changeVisibility`
- Choose a conservative `presentationStyle`
- Emit photographic instructions (source-faithful camera realism)
- Emit emphasis instructions from **existing** plan fields only
- Choose `textureStyle` and `postureTreatment` without inventing anatomy
- Provide realism constraints and exclusions
- Remain deterministic for identical inputs

## Forbidden responsibilities

- Physiology calculation (fat loss rates, muscle potential, timelines)
- Mutating `BodyProfile`, `TransformationGoal`, or `TransformationPlan`
- Inventing body-fat percentages or unselected regions
- Gender, ethnicity, age, or body-type visual stereotypes
- Sweat, oil, tanning, veins, stage lighting, competition conditioning, cosmetic retouching
- Provider calls, network, API keys, Replicate / Flux / SDXL / OpenAI / Imagen parameters
- Image dimensions, denoise, seeds, model names, inference steps

## Layer differences

| Layer | Owns | Must not |
| --- | --- | --- |
| TransformationEngine | Physiology estimates → TransformationPlan | Build prompts or call image APIs |
| VisualDirector | Photographic presentation → VisualDirection | Recalculate fat/muscle/timeline or call providers |
| PromptBuilder | Translate plan + direction → PromptPackage | Own physiology or provider transport |
| ModelAdapter | Map PromptPackage → provider request/result | Own transformation or visual policy |

## Why visual direction cannot change physiology

HelseApp owns transformation intelligence in the engine. Visual direction only decides how already-approved changes are emphasized in a photograph. Letting presentation logic invent measurements would make the image model (via prompt prose) a competing source of physiological truth, violating the constitution.

## Current presentation styles

| Style | When |
| --- | --- |
| `source_faithful` | Default; minimal reinterpretation of the source photo |
| `natural_athletic` | Meaningful athletic change is present in the plan |
| `documentary_fitness` | Only for clear or pronounced transformations |

## Future extension policy

- Add styles or instructions only via an approved demand
- Keep VisualDirection free of provider-specific fields
- Prefer stable, unique, ordered instruction lists
- Cut over to production prompts only with an explicit demand — `lib/visuellPrompt.js` stays unchanged until then

## Testing requirements

`src/ai/__tests__/visualDirector.test.ts` covers determinism, non-mutation, intensity mapping, missing BF%, region gating, posture defaults, stereotype bans, forbidden glamour cues, provider-name absence, directed prompt sections, identity/skeletal preservation, exclusions in negative prompt, metadata alignment, and compatibility with `buildPromptPackage`.

Run:

```
npm run typecheck
npm run test:ai
```

## Known limitations

- Not wired into production UI, Vercel routes, or `lib/replicate.js` / `lib/visuellPrompt.js`
- `buildPromptPackage` remains the legacy path; `buildDirectedPromptPackage` is preferred for the new contract
- Presentation heuristics are conservative product defaults, not photographic science
- Posture upright emphasis requires an explicit posture-related regional target/note on the plan

## Module map (`src/ai/visual/`)

| File | Role |
| --- | --- |
| `VisualDirection.ts` | Types / interface |
| `VisualDirector.ts` | `directVisual` + `VisualDirector` |
| `index.ts` | Barrel exports |

Also re-exported from `src/ai/index.ts`.
