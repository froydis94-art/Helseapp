# HelseApp AI OS v2.0 Migration Roadmap

Version: 2.0  
Status: Approved roadmap — implementation staged  
Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Architecture: [AI OS v2.0 Architecture](./04_AI_OS_V2_ARCHITECTURE.md)  
Related: [Sprint 1 Completion](./01_SPRINT_1_COMPLETION.md), [Model Adapter](./02_MODEL_ADAPTER.md), [Visual Director](./03_VISUAL_DIRECTOR.md)

## Current state

Foundation already delivered in `src/ai` (not production-integrated):

| Component | Status |
| --- | --- |
| AI Constitution | Active — highest authority |
| Runtime validation | Delivered |
| `BodyProfile` | Delivered |
| `TransformationGoal` | Delivered |
| `TransformationEngine` | Delivered |
| `TransformationPlan` | Delivered |
| `GoalPlanner` | Delivered |
| Shared progress curve | Delivered |
| `PromptPackage` / `PromptBuilder` | Delivered (`buildPromptPackage`, `buildDirectedPromptPackage`) |
| `VisualDirector` / `VisualDirection` | Foundation only |
| `ModelAdapter` contracts | Foundation / stubs |
| Provider-independent adapter foundation | `ReplicateAdapter` stub, `ModelRegistry` |
| Automated `src/ai` tests | Typecheck + `test:ai` green as of Sprint 1 / adapter / Visual Director demands |

**Production still uses** the legacy JavaScript prompt and Replicate flow (`lib/visuellPrompt.js`, `lib/replicate.js`, Vercel/API paths). AI OS v2 must not cut over without an explicit demand and the sequence in the architecture doc (§14).

## Migration principles

- no big-bang rewrite
- preserve working production behavior
- feature flags before cutover
- each phase independently testable
- small diffs
- compatibility maintained (`PromptPackage` preserved until RenderPlan cutover)
- rollback always possible
- Constitution has highest authority

## Phase 2.1 — RenderPlan foundation

**Deliver:**

- `RenderPlan` types
- `RenderPlanBuilder`
- transformation-plan traceability
- `VisualDirection` compatibility
- tests
- no production integration

**Suggested demand:** 006B  

**Estimated Cursor time:** 15–25 minutes

## Phase 2.2 — Provider formatter foundation

**Deliver:**

- `ProviderFormatter` interface
- Flux/Replicate formatter
- formatter contract tests
- no network calls
- no production integration

**Suggested demand:** 007  

**Estimated Cursor time:** 15–25 minutes

## Phase 2.3 — Non-production integration harness

**Deliver:**

- validated fixture
- `TransformationPlan`
- `VisualDirection`
- `RenderPlan`
- formatted provider request
- dry-run output
- no real API calls
- trace report

**Suggested demand:** 008  

**Estimated Cursor time:** 15–25 minutes

## Phase 2.4 — GitHub Actions quality gate

**Deliver:**

- typecheck CI
- AI test CI
- no deployment changes
- branch protection recommendation

**Suggested demand:** 009  

**Estimated Cursor time:** 10–20 minutes

## Phase 2.5 — Server-side Replicate transport adapter

**Deliver:**

- network implementation isolated to server/provider infrastructure
- secrets server-side
- timeout/cancellation
- normalized errors
- mocked adapter tests
- feature flag off by default

**Suggested demand:** 010  

**Estimated Cursor time:** 25–45 minutes

## Phase 2.6 — Result Validator foundation

**Deliver:**

- validation contracts
- identity / anatomy / plan-adherence findings
- deterministic decision policy
- retry recommendation contract
- no external vision call initially

**Suggested demand:** 011  

**Estimated Cursor time:** 20–35 minutes

## Phase 2.7 — Shadow mode

**Deliver:**

- legacy production result remains user-visible
- AI OS v2 pipeline runs optionally for internal comparison
- no duplicate user billing without explicit safeguards
- logging contains no images or sensitive prompts
- comparison metrics

**Suggested demand:** 012  

**Estimated Cursor time:** 30–50 minutes

## Phase 2.8 — Controlled rollout

**Deliver:**

- feature flag
- internal cohort
- fallback to legacy
- cost monitoring
- latency monitoring
- identity failure monitoring
- rollback procedure

**Estimated Cursor time:** 30–60 minutes, likely split into multiple demands

## Deferred phases

Documented as deferred (not in the 2.1–2.8 critical path):

- photo analyzer
- AI-based result scoring
- wearable-driven engine adjustments
- multiple provider production routing
- automatic provider optimization
- personalized longitudinal calibration
- production storage and retention system
- subscriptions and billing

## Review gates

Every phase requires:

- Constitution check
- exact changed-file report
- typecheck
- relevant tests
- security/privacy check
- CTO review
- commit SHA
- no production integration unless explicitly approved

## Immediate next step

**Demand 006B — Implement the provider-neutral RenderPlan foundation.**