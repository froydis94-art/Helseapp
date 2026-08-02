# DEMAND_002 — AI foundation verification

## Runnable

```bash
npm run typecheck
npm run test:ai
```

## Coverage

| Case | Expect |
|------|--------|
| Valid profile / goal | `ok: true` |
| Invalid body-fat | `ok: false` |
| Invalid priorities | `ok: false` |
| NaN / Infinity | `ok: false` |
| Short timeline | clamped to ≥4 weeks |
| Advanced trainee | lower lean gain + warning |
| Limitations | reduced lean estimate |
| Target BF ≥ current | `estimatedFatChangeKg === 0` |
| Front-loaded monthly | early gaps ≥ late; final month progress=1 |
| 3 / 6 / 12 ordering | p3 < p6 < p12, shrinking gaps |
| Deterministic | identical plans except `generatedAt` |

## Export renames (DEMAND_002)

- `TransformationPlan.confidence` → `estimateReliabilityScore` + `estimateReliability`
- Stub validator result → `ValidatorCheckResult` (`ValidationResult` now = input validation)
