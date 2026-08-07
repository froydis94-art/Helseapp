# HelseApp AI Constitution

Version: 1.0
Status: Active
Owner: HelseApp CTO
Applies to: Product, AI architecture, transformation engine, image generation, validation, health-data integrations, and developer tooling.

## 1. Mission

HelseApp creates motivating and realistic visualizations of a user's possible future physical progress.

The product must help users understand direction and possibility without presenting an AI-generated image as a guarantee, diagnosis, medical prediction, or verified outcome.

The defining product principle is:

> The image model never decides the transformation. HelseApp calculates the transformation; the image model only visualizes it.

## 2. Source of truth

The transformation must be calculated before an image prompt is created.

The required flow is:

1. Raw user input
2. Runtime validation
3. BodyProfile
4. TransformationGoal
5. TransformationEngine
6. TransformationPlan
7. PromptBuilder
8. Image-model adapter
9. Result validation
10. User-facing result

Flux, Replicate, OpenAI, Imagen, SDXL, or any future model must never become the source of physiological truth.

## 3. Model independence

Image models are replaceable infrastructure.

HelseApp-owned logic must remain independent of:

- Replicate
- Flux
- OpenAI
- Google
- Stability AI
- individual model versions
- model-specific prompt syntax

Provider-specific behavior belongs in model adapters, not in BodyProfile, TransformationGoal, TransformationEngine, GoalPlanner, or shared physiology rules.

## 4. Identity preservation

Every generated result must represent the same person as the source image.

Unless explicitly required by a supported feature, preserve:

- facial identity
- apparent age
- hair
- skin tone
- tattoos
- scars
- skeletal frame
- limb count and placement
- hands and feet
- pose
- camera perspective
- lighting
- background
- clothing
- accessories

The body may be recomposed, but the person must not be replaced.

Identity preservation must not prevent realistic body-composition edits. Identity and transformation are separate validation dimensions.

## 5. Anatomical realism

HelseApp must never intentionally generate:

- impossible skeletal changes
- disproportionate limb growth
- extreme shoulder widening unrelated to the original frame
- artificial waist compression
- duplicate or missing limbs
- distorted hands or feet
- unrealistic muscle insertion
- superhero or caricature proportions
- anatomy inconsistent with the original pose

Muscle development must remain proportional to the user's original skeletal structure.

## 6. Physiological realism

Transformation outputs must be bounded by transparent product heuristics.

The engine must consider available information such as:

- current weight
- estimated body-fat percentage
- target body-fat percentage
- training experience
- training age
- effort and adherence
- timeline
- selected priorities
- limitations
- activity and nutrition data when available

Missing data must create assumptions or reduced reliability. Missing values must never silently be invented as known facts.

All calculations are product estimates, not medical conclusions.

## 7. Progress over time

Progress is not a linear visual-force ladder.

HelseApp uses diminishing returns:

- visible progress can be relatively fast early
- later improvements continue at a slower rate
- 6 months must not automatically mean twice the visual change of 3 months
- 12 months must not automatically mean four times the visual change of 3 months

The shared default progression concept is:

progress(months) = 1 - exp(-months / tau)

Default tau: 4 months.

All product layers must ultimately use one shared implementation of the progress curve.

No module may independently recreate a competing timeline formula.

## 8. TransformationPlan contract

TransformationEngine must return structured data before any prompt is built.

A TransformationPlan may contain:

- effective timeline
- estimated fat-loss range
- estimated muscle-gain range
- target or interim body-fat appearance
- waist-change estimate
- regional development allocation
- visual intensity
- assumptions
- warnings
- estimate reliability
- traceable input references

Prompts must be derived from this plan.

Prompts must not independently reinterpret the user's goals.

## 9. No false precision

Heuristic outputs must not be presented as statistically validated certainty.

Use language such as:

- estimate
- range
- directional
- likely visual progression
- low, medium, or high estimate reliability

Avoid language such as:

- guaranteed
- exact prediction
- medically accurate future
- scientifically certain
- proven final appearance

Numeric reliability scores are internal product heuristics and must be described as such.

## 10. Prompt governance

Prompts are rendering instructions, not business logic.

PromptBuilder may translate:

- identity constraints
- TransformationPlan changes
- timeline
- focus zones
- anatomical constraints
- camera and lighting preservation
- photorealism requirements

PromptBuilder must not calculate:

- safe fat-loss rates
- muscle-growth potential
- recommended timelines
- nutrition requirements
- confidence or reliability
- the target transformation itself

Prompt content must be modular, testable, inspectable, and model-adapter aware.

Avoid repeated or contradictory prompt fragments.

## 11. Image validation

A generated image is not accepted only because an API returned successfully.

Future validation must assess separately:

1. Identity preservation
2. Anatomical validity
3. Transformation-plan adherence
4. Photorealism
5. Pose and camera preservation
6. Safety
7. Difference from the source
8. Absence of exaggerated or implausible change

A failed result may be retried with controlled adjustments.

Retries must not bypass physiological limits.

## 12. Health and wearable data

Wearable and health data may improve planning reliability, but must not become mandatory for the core visualization experience.

Terra and future health integrations may contribute:

- weight trends
- activity
- workouts
- recovery
- sleep
- steps
- nutrition data when available

Raw health data must be normalized before entering the transformation engine.

Provider-specific payloads must not leak into core domain types.

## 13. Privacy and sensitive data

Body images and health information are sensitive data.

The architecture must minimize:

- unnecessary storage
- provider exposure
- long-lived image URLs
- secret leakage
- logging of image data
- logging of health payloads
- client-side API credentials

API tokens must never be stored in frontend code.

Base64 image data must never be written to normal application logs.

Future storage must define retention and deletion behavior explicitly.

## 14. Validation boundaries

Raw UI input, API payloads, local storage, wearable data, and model outputs are untrusted.

Validate data at system boundaries.

TypeScript interfaces alone are not runtime validation.

Invalid input must return explicit errors.

Unusual but permitted input may return warnings.

Do not silently repair materially invalid health or body data.

## 15. Determinism and traceability

Given identical validated inputs and the same rules version, the deterministic engine should produce identical TransformationPlan output, excluding explicitly non-deterministic metadata such as timestamps.

Every future plan should be traceable to:

- profile schema version
- rules version
- engine version
- validated inputs
- assumptions
- warnings
- generated timestamp where appropriate

Changes to transformation rules must be documented.

## 16. Testing requirements

Core physiology and planning logic must have automated tests.

At minimum, tests must cover:

- valid inputs
- invalid numeric values
- missing optional values
- boundary values
- timeline behavior
- diminishing returns
- beginner versus advanced training assumptions
- conflicting goals
- limitations
- determinism
- compatibility with existing progress logic

No production integration is complete while typechecking or relevant tests fail.

## 17. Change discipline

Cursor implements approved architecture. Cursor does not independently redefine product architecture.

Every engineering demand must:

- identify allowed files
- identify forbidden files
- minimize the diff
- preserve public contracts unless change is approved
- report assumptions
- run tests
- report commands and results
- stop rather than invent missing product policy

Important architectural decisions must be added to the decision log.

## 18. Product communication

The UI must make clear that goal images are motivational visual estimates.

Recommended wording:

> A realistic visualization based on your selected goals and available data. This is not a medical prediction or a guaranteed result.

The app must avoid shame-based language.

Being behind a plan should lead to guidance and adjustment, not punishment.

## 19. Definition of done

An AI feature is not complete merely because it generates an image.

It is complete only when:

- inputs are validated
- transformation logic is structured
- uncertainty is communicated
- identity is preserved
- anatomy is plausible
- output follows the TransformationPlan
- errors are handled
- sensitive data is protected
- tests pass
- documentation is updated

## 20. Permanent architectural rule

> HelseApp owns the transformation intelligence. External models render the result.

## 21. Original presentation and adulthood

Body-progress visualization preserves the user's original presentation and
modifies only what the approved health and body-progress plan requires.

Permanent product rules:

> HelseApp does not judge why a photograph was taken.

> HelseApp preserves the user's original presentation and modifies only what is
> necessary for the requested health and body-progress visualization.

> Clothing or underwear style alone must never determine whether an image is
> interpreted as sexual.

> The user's declaration is the primary basis for adulthood. AI must not estimate
> age from appearance.

> HelseApp must not introduce explicit pornographic content that is absent from
> the source image.

## 22. Transformation Rules are canonical

Transformation Rules are the canonical representation of HelseApp intent.

Prompts are provider-specific implementation artifacts generated from
Transformation Rules. They are not the source of business truth.

Permanent architectural rules:

> Transformation Rules are the canonical representation of HelseApp intent.

> Prompts are provider-specific implementation artifacts generated from
> Transformation Rules.

> Prompts are generated implementation artifacts, not the source of truth.

> No business logic may depend directly on prompt wording.

> HelseApp business logic must never depend directly on final prompt wording.

> Future provider formatters must consume the same canonical Transformation
> Rules without changing HelseApp transformation intent.

> Future providers must consume the same Transformation Rules via their own
> formatter; the inspector and comparison layers remain provider-independent.

## 23. Personal account trust and private progress

Permanent product rules for Personal accounts and private progress images:

> A Personal account belongs to one adult account holder (minimum age 18).
> Accounts must not be shared.

> HelseApp must not estimate adulthood from appearance or body signals.
> Preferred adulthood basis is identity-provider verification; account
> attestation is a development fallback and must not be labelled verification.

> Terms of Service, Privacy Notice acknowledgement, Responsible AI Use, and
> Sensitive Data Consent are separate versioned records. Sensitive-data consent
> is optional, explicit, and withdrawable, and must not be hidden inside Terms.

> AI-generated images are expected future visualizations, not medical
> predictions, guaranteed outcomes, or promises.

> Saving a progress image to a Personal Progress Vault is opt-in per image.
> Default generation discards temporary results. Saved images remain private to
> the Personal account. No model-training reuse without a separate future
> optional consent.

> Misuse enforcement is warning-first by default. Severe or apparently unlawful
> misuse may lock an account pending human review. No automatic fines, automatic
> criminal determination, or automatic authority reporting.

> Account-level acceptance may replace repeated adult/consent checkboxes only
> after the server can prove the required trust state. Production enforcement
> must not activate without real authentication and persistence.
