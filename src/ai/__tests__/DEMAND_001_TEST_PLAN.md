# DEMAND_001 — Domain foundation test plan

No Jest/Vitest in repo. Lightweight Node tests cover the shared progress curve.
Full engine scenario matrix is listed below for when TypeScript execution is available.

## Runnable now

```bash
node --test src/ai/__tests__/progressCurve.test.cjs
```

Covers:
- 3 / 6 / 12 month diminishing-return progression
- bfAtHorizon interpolation
- progressBand labels
- missing optional BF measurements → null

## Engine / planner scenarios (manual or future TS runner)

| Case | Inputs | Expect |
|------|--------|--------|
| Fat-loss goal | fatDirection=decrease, targetBodyFatPct < current | estimatedFatChangeKg &lt; 0, warnings empty unless timeline aggressive |
| Muscle-building goal | muscleDirection=increase, fatDirection=maintain | estimatedLeanMassChangeKg &gt; 0 |
| Maintenance goal | both maintain | fat & lean deltas 0 |
| Contradictory | fatDirection=decrease + targetBodyFatPct ≥ current | Conflict warning |
| Missing optionals | no weightKg / bodyFatPct | null mass deltas + assumptions |
| Calories | any | recommendedCaloriesKcal === null (no accepted formula yet) |

## Constraints verified by review

- UI / routes / onboarding / Pace / Devices untouched
- Existing prompts / replicate model selection untouched
- No prompt pipeline integration
- Domain layer has no React / fetch / Replicate deps
