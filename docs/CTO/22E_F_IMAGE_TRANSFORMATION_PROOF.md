# Image Transformation Proof (022E-F)

Status:  
Diagnostics implemented; **paid diagnostic run inconclusive pending owner** (no `REPLICATE_API_TOKEN` in local env at implementation time).

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Related: [22E — Anatomical Live Preview](./22E_ANATOMICAL_LIVE_PREVIEW_INTEGRATION.md), [22E-D Provider Capability](./22E_D_PROVIDER_CAPABILITY_EVALUATION.md), [17 — Internal AI Image Preview](./17_INTERNAL_AI_IMAGE_PREVIEW.md)

Typed module: `src/ai/body-simulator/ImageTransformationProof.ts`

---

## Problem

Generation completes and returns an image URL, but the owner often sees output that is visually unchanged from the input. This demand proves **which layer loses the transformation** — not UX polish or prompt calibration.

---

## What was added

### 1. Input vs output comparison (server-side)

Before client rendering, when a provider URL is available:

| Metric | Source |
| --- | --- |
| SHA-256 | Raw image bytes (input data-URI decoded; output downloaded server-side) |
| Dimensions / byte length | PNG/JPEG headers + buffer length |
| Average-hash | PNG pixel aHash when decodable; else raw-byte 8×8 bucket hash |
| RMSE / % differing | Pixel RGB when both PNG+same size; else byte RMSE when lengths match |

Logged/reported safely (never full image / never token):

- provider/model route + attempt plan
- prediction ID(s)
- input fingerprint (hash only)
- output fingerprint + URL **host** only
- Flux strength-like params actually sent
- fallback used + `providerRequestCount`

### 2. Controlled diagnostic generation mode

- Request field: `diagnosticMode: "transformation_proof"`
- Gate: `X-AI-OS-Control-Room-Key` must match `AI_OS_CONTROL_ROOM_ACCESS_KEY` (header only)
- Also requires `AI_OS_CONTROL_ROOM_ENABLED=1` **or** `BODY_SIMULATOR_TRANSFORM_PROOF_DIAGNOSTIC=1`
- **Not** exposed on public Future UI (`public/index.html`)
- Injects a labeled diagnostic prompt block (broader shoulders/arms, narrower waist, solid teal `#008080` background marker) — attribution only, not permanent production calibration
- Product Body Simulator / Anatomical coefficients remain unchanged

### 3. Control Room surface

Live Future Preview Trace → **Transformation Proof** (read-only hashes + deltas when present).

---

## Code-proven layer suspects (no paid call required)

From repository inspection of `lib/replicate.js` `buildFluxKontextProInput` / live cascade:

| Layer | Finding | Confidence |
| --- | --- | --- |
| **provider_parameters** | Flux Kontext edit contract sends `prompt`, `input_image`, `aspect_ratio: match_input_image`, `output_format`, `safety_tolerance: 2`, `prompt_upsampling` — **no** `image_strength` / `denoise` / `prompt_strength` / `guidance_scale`. Change is language-only. | **High** |
| **provider_parameters** | `prompt_upsampling` is `false` unless horizon ≥12 months **or** BF Δ ≥ 4 — mild/short cases get less instruction amplification. | **Medium** |
| **prompt_construction** | Neutral conditioning + anatomical formatter produce intent, but Flux adherence is unchecked without byte deltas. | **Medium** (needs paid proof) |
| **provider_capability** | If server download SHA-256 ≈ input after a strong diagnostic prompt (teal background), provider returned a near no-op. | **Pending owner run** |
| **fallback_routing** | Ordered Max/Pro/Dev can change model; same prompt/image across attempts — reported in diagnostics when used. | Instrumentable |
| **result_storage_cache** | No HelseApp image cache rewrite found on live path; output is provider URL. Unlikely primary. | **Low** |
| **frontend_rendering** | If server deltas show clear transform but UI looks identical → wrong URL / stale `<img>`. Compare `outputUrlHost` vs displayed URL host. | **Pending owner run** |

**Primary code-proven suspect today:** `provider_parameters` (Flux Kontext lacks denoise/strength; mild cases may also have `prompt_upsampling=false`), with `provider_capability` / `prompt_construction` still possible until a paid diagnostic compares bytes.

---

## Paid diagnostic status

| Item | Status |
| --- | --- |
| Diagnostic endpoint/mode | Implemented |
| Offline metrics + gating tests | Implemented |
| `REPLICATE_API_TOKEN` present in local env at run | **No** (empty / absent) |
| One controlled paid Replicate call | **Not executed** (do not invent credentials) |

### Owner one-click next step

Prerequisites on Vercel (or local with env):

1. `REPLICATE_API_TOKEN` set
2. `AI_OS_CONTROL_ROOM_ENABLED=1` and `AI_OS_CONTROL_ROOM_ACCESS_KEY` (≥16 chars)
3. Prefer `BODY_SIMULATOR_LIVE_PREVIEW_ENABLED=1` (diagnostic can also enter live path when authorized)

Then POST (replace host / key / image):

```http
POST /api/generate-future-you
Content-Type: application/json
X-AI-OS-Control-Room-Key: <AI_OS_CONTROL_ROOM_ACCESS_KEY>

{
  "diagnosticMode": "transformation_proof",
  "imageBase64": "<progress-photo-base64>",
  "mimeType": "image/jpeg",
  "bfNow": 22,
  "bfGoal": 12,
  "fat": "decrease",
  "intensity": "strong",
  "horizon": "24w",
  "zones": ["shoulders", "arms", "waist"]
}
```

Read response fields:

- `transformationProof.delta.verdict` (`identical_bytes` | `near_identical` | `clearly_transformed`)
- `transformationProof.input.sha256` vs `output.sha256`
- `transformationProof.implicatedLayers`
- `liveFuturePreviewTrace` stage `transformation_proof`

Or unlock Control Room and inspect **Transformation Proof** after a diagnostic response is loaded into the session/trace.

**How to read the result**

| Verdict | Layer conclusion |
| --- | --- |
| `identical_bytes` / `near_identical` after teal diagnostic prompt | **provider_capability** (and/or **provider_parameters**) — lost before client |
| `clearly_transformed` but UI unchanged | **frontend_rendering** |
| `clearly_transformed` and UI shows teal + body change | Pipeline delivers transform; prior “no-op” was adherence/prompt force under production prompts |

---

## Confirmations

- No production safety/moderation rule changes
- No provider/model cutover
- No Body Simulator physiology coefficient changes
- Diagnostic prompt is gated and labeled; not default Future UI
- CI/tests use mocks only (no paid calls)

---

## Files

| Path | Role |
| --- | --- |
| `src/ai/body-simulator/ImageTransformationProof.ts` | Hashes, deltas, gating, report |
| `src/ai/body-simulator/LiveFuturePreviewPipeline.ts` | Diagnostic inject + server compare + trace stage |
| `api/generate-future-you.js` | Control Room key gate for `diagnosticMode` |
| `lib/replicate.js` | `predictionId` on prediction result |
| `public/ai-os-control-room.html` / `.js` | Transformation Proof panel |
| `src/ai/__tests__/imageTransformationProof.test.ts` | Offline proof tests |
| `src/ai/body-simulator/liveFuturePreviewRuntime.bundle.cjs` | Vercel runtime bundle |
