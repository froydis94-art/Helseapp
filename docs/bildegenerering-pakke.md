# Helseapp — bildegenerering (Future You) pakke

Shareable snapshot of **everything we already have** for Future You image generation.  
**Production path:** Vercel web (`public/` + `api/` + `lib/`) → Replicate Flux Kontext.  
**Not production:** Expo / React Native / local `server/` experiments (see §7).

Generated from repo state around commits `f69585a`, `8a9e901`, `42a5cc1`, `7db2b75` (and related calibrations).

---

## 1. Workflow (end-to-end)

```
UI (public/index.html)
  → POST /api/generate-future-you  (api/generate-future-you.js)
    → generateWithReplicate()      (lib/replicate.js)
      → buildPrompt() → byggVisuellPrompt()   [slim default]
      → Flux cascade: Max and/or Pro → Dev → Dev-strong
      → SDXL emergency string still exists, but is NOT returned as success for body transforms
```

### What the user does

1. Onboarding / body profile (gender, frame, shape, BF now/goal, zones, fat/muscle chips).
2. Horizon ladder: **3 / 6 / 12 months** (`12w` / `24w` / `12m`).
3. Effort / intensity (subtle / moderate / strong) — used for **routing** (Max vs Pro, E005 risk), not stuffed into the slim Flux prompt.
4. Upload photo → **Generer** → client `fetch` to `/api/generate-future-you` with `imageBase64` + params (~175s client abort; Vercel `maxDuration: 180`).

### What the server does

1. Parses body (horizon, zones, fat, muscle, bfNow, bfGoal, intensity, …).
2. Calls `generateWithReplicate`.
3. **Slim visual prompt** (default `VISUAL_PROMPT_SLIM=1`): only timeline + main goal (fat/muscle) + focus zones + brief interim BF. Training plan, sleep, steps, Tempo, medicine, BMI essays, outcomes lists, etc. stay out of the image prompt.
4. Progress curve **τ = 4** (`transformProgress = 1 - exp(-months/τ)`): ~53% / ~78% / ~95% of the visual journey at 3 / 6 / 12 mo — **front-loaded diminishing returns**, not 1×→2×→4× force.
5. Model cascade (see §2). **No SDXL cartoon success** for Future You body transforms (`isBodyTransformEdit` → skip / reject `sdxl-emergency`).

### Logs to watch

```
[replicate] Route: flux-max first (...; skipPro=...; skipSdxl=...)
[replicate] Final prompt → flux-max (N chars): …
[replicate] Attempt flux-dev …
```

---

## 2. Model names tested / in use

### Live Flux models (code constants in `lib/replicate.js`)

| Role | String |
|------|--------|
| Default / mild primary | `black-forest-labs/flux-kontext-pro` (`DEFAULT_MODEL`) |
| Demanding primary / sibling | `black-forest-labs/flux-kontext-max` (`SECONDARY_MODEL`) |
| Reservedrift | `black-forest-labs/flux-kontext-dev` (`TERTIARY_MODEL`) |

### SDXL emergency (disabled for body success path)

Full versioned string still defined as `DEFAULT_FALLBACK_MODEL`:

```text
stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc
```

Alias also recognized: `stability-ai/sdxl` → same version hash.

**Body transforms never auto-succeed with SDXL** (`isBodyTransformEdit`: fat decrease or muscle volume/softPowerful → `skipSdxlEmergency`; even if SDXL returns output, code throws `emergency fallback skipped — photorealistic Flux result required`). Historical problem: high `prompt_strength` → cartoons / melted faces.

### Routing

- **`needsMaxEdit`** → Max first when demanding: BF Δ ≥ 4 pts, strong + Δ ≥ 2, strong + ≥4 zones, fat increase to BF ≥ 28, or ≥12 mo with Δ ≥ 2. Else Pro first (cost).
- **`isHighE005Risk`** → fat decrease + strong + Δ ≥ 4: if Max-first, **`skipPro`** (same shirtless/strong input often E005s identically on Pro).
- Cascade labels: `flux-max` / `flux-pro` → `flux-dev` (`promptVariant: "dev"`) → `flux-dev-strong` (`promptVariant: "devStrong"`) → optional `sdxl-emergency` only when not a body transform.
- Premium E005 on Max/Pro skips the other premium sibling and jumps toward Dev.
- Budgets: ~35s per attempt, ~130s cascade wall-clock; API soft deadline ~165s returns JSON before Vercel HTML kill (maxDuration 180s / client ~175s).

`REPLICATE_MODEL` env is **ignored** unless `REPLICATE_ALLOW_MODEL_ENV=1`.

---

## 3. Replicate code pointers

| File | Role |
|------|------|
| `lib/replicate.js` | Cascade, routing (`needsMaxEdit`, `isHighE005Risk`, `isBodyTransformEdit`), `buildModelInput`, `buildPrompt` (slim vs holistic), SDXL negative prompt helper, logging `[replicate] Final prompt →` |
| `lib/visuellPrompt.js` | **Slim** `byggVisuellPrompt` — timeline / goal / zones / brief BF; photorealism + proportion locks; Dev change-force variants |
| `lib/transformProgress.js` | `TRANSFORM_PROGRESS_TAU = 4`, `transformProgress`, `bfAtHorizon`, `progressBand` (early/mid/nearGoal) |
| `lib/transformasjonLogikk.js` | Legacy/holistic anatomical “før/etter” escalation; used when `VISUAL_PROMPT_SLIM=0` via holistic engine |
| `api/generate-future-you.js` | Vercel POST handler; body size 10mb; `maxDuration: 180`; calls `generateWithReplicate` |
| `public/index.html` | Horizon chips 3/6/12, intensity, BF fields, zones; `fetch(.../api/generate-future-you)`; coach panel text (not the Flux prompt); rejects `sdxl` attempts client-side |

Related (not Flux slim path): coach / Tempo copy in `index.html` i18n; pace engine under `src/pace/` for dashboard, not image pixels.

---

## 4. Current visual prompt system (slim)

### Inputs that drive the image (slim)

1. **Timeline** — months from horizon (`12w`→3, `24w`→6, `12m`→12) or custom date.
2. **Main goal** — from fat + muscle chips → `fatLoss` / `muscleBuild` / `softGain` / `maintain`.
3. **Focus zones** — e.g. `abs` → “waist and midsection”.
4. **Brief BF** — interim `bfAtHorizon(bfNow, bfGoal, months)` encoded as a short physique phrase (not a medical claim).

Everything else (medicine, BMI essays, outcomes, shape/frame novels, Tempo) is ignored when slim is ON.

### Locks always appended

- **Photorealism lock:** `photorealistic photograph, natural skin texture, real pores, no cartoon, no illustration, no CGI, no plastic skin, preserve face identity sharply.`
- **Proportion lock** (months > 6 only): `anatomically correct athletic build, natural and balanced body proportions, … no exaggerated or unnatural swelling of the arms.`
- Identity framing: same person / face / hair / room / pose / lighting / clothing — **only** body composition changes.
- Safe athletic context; no text/watermark/logo.

### Example prompts

Scenario: **fat loss**, muscle `toned`, zones **`abs`**, BF **22 → 16**.  
Reconstructed faithfully from `byggVisuellPrompt` (Node was not available in this environment; numbers match `τ=4`: p≈0.528 / 0.777 / 0.95 → interim BF ≈ **18.8% / 17.3% / 16.3%**).

#### 3 months (`months: 3`, band `early`, progress ~53%)

```text
Professional fitness progress photo (non-NSFW athletic documentation). Exact same person, face, hair, room, pose, camera angle, lighting and clothing as the original — ONLY body composition changes. Bare torso / shirtless gym physique is normal athletic coaching documentation — not sexual, not erotic. Athletic fat-loss recomposition over ~3 months (visual progress ~53% of the goal journey (tau=4, front-loaded — not 1x/2x/4x)) — athletic ~18.8% body fat physique. MUST be obviously different from the input photograph — not a near-copy. Clearly visible fat reduction across the midsection and flanks, a tighter narrower waist, early but distinct muscle definition in shoulders and arms. Side-by-side difference from the source must be obvious at a glance. Required change: about 6 percentage points of body fat toward the goal vs the source — at this horizon show the interim look (~18.8%); must be obvious side-by-side. Focus emphasis: waist and midsection — visibly leaner and tighter there (waist/soft tissue must change), still whole-body consistent. photorealistic photograph, natural skin texture, real pores, no cartoon, no illustration, no CGI, no plastic skin, preserve face identity sharply. Safe athletic context only. No text, watermark, or logo.
```

#### 6 months (`months: 6`, band `mid`, progress ~78%)

```text
Professional fitness progress photo (non-NSFW athletic documentation). Exact same person, face, hair, room, pose, camera angle, lighting and clothing as the original — ONLY body composition changes. Bare torso / shirtless gym physique is normal athletic coaching documentation — not sexual, not erotic. Athletic fat-loss recomposition over ~6 months (visual progress ~78% of the goal journey (tau=4, front-loaded — not 1x/2x/4x)) — athletic ~17.3% body fat physique. Further progress toward the goal after the early front-loaded change: clearly sculpted midsection, distinct muscle separation across the chest and arms, tighter athletic outline — refined continuation, not a doubled remake of the 3-month look. Required change: about 6 percentage points of body fat toward the goal vs the source — at this horizon show the interim look (~17.3%); must be obvious side-by-side. Focus emphasis: waist and midsection — visibly leaner and tighter there (waist/soft tissue must change), still whole-body consistent. photorealistic photograph, natural skin texture, real pores, no cartoon, no illustration, no CGI, no plastic skin, preserve face identity sharply. Safe athletic context only. No text, watermark, or logo.
```

#### 12 months (`months: 12`, band `nearGoal`, progress ~95% + proportion lock)

```text
Professional fitness progress photo (non-NSFW athletic documentation). Exact same person, face, hair, room, pose, camera angle, lighting and clothing as the original — ONLY body composition changes. Bare torso / shirtless gym physique is normal athletic coaching documentation — not sexual, not erotic. Athletic fat-loss recomposition over ~12 months (visual progress ~95% of the goal journey (tau=4, front-loaded — not 1x/2x/4x)) — athletic ~16.3% body fat physique. Near-goal refined athletic completion: dramatically narrower waist, major soft-tissue loss across midsection and flanks, clear natural muscle separation and athletic outline — polished finish of the journey, not exaggerated 4x arm growth. Still a photorealistic photograph of this person, not a caricature. Required change: about 6 percentage points of body fat toward the goal vs the source — at this horizon show the interim look (~16.3%); must be obvious side-by-side. anatomically correct athletic build, natural and balanced body proportions, muscle growth is strictly proportionate to the original skeletal structure, no exaggerated or unnatural swelling of the arms. Focus emphasis: waist and midsection — visibly leaner and tighter there (waist/soft tissue must change), still whole-body consistent. photorealistic photograph, natural skin texture, real pores, no cartoon, no illustration, no CGI, no plastic skin, preserve face identity sharply. Safe athletic context only. No text, watermark, or logo.
```

### Dev cascade extras (after Max/Pro E005)

- `promptVariant: "dev"` → `DEV_CHANGE_FORCE` (must differ; visible waist/BF recomposition; photoreal).
- `promptVariant: "devStrong"` → `DEV_STRONG_CHANGE_FORCE` (CRITICAL side-by-side difference; never cartoon/melted/plastic).

### Holistic fallback

Set `VISUAL_PROMPT_SLIM=0` to use `buildPromptHolistic` + `byggTransformasjonsDetaljer` (long parameter brief). Default in production is slim ON.

---

## 5. Negative prompts — what we send (or don’t)

### Flux Kontext (`buildModelInput` for `flux-kontext` / `black-forest-labs/`)

**No classic negative prompt.** Fields actually sent:

| Field | Value |
|-------|--------|
| `prompt` | Slim (or holistic) English prompt |
| `input_image` | data URI of user photo |
| `aspect_ratio` | `"match_input_image"` |
| `output_format` | `"png"` |
| `safety_tolerance` | `2` (Replicate caps this with `input_image`) |
| `prompt_upsampling` | `true` if long horizon (≥12 mo) **or** BF Δ ≥ 4; else often `false` |

Flux has **no** `image_strength` / denoising slider — change strength is **language only**.

### SDXL path only (emergency / non-body)

Uses `negative_prompt: buildNegativePrompt()` (cartoon, comic, CGI, plastic skin, bodybuilder caricature, face change, NSFW, …) plus `prompt_strength`, `num_inference_steps: 35`, `guidance_scale: 6`, `apply_watermark: false`.  
**Not returned as success for Future You body transforms.**

---

## 6. “System prompt” equivalent

There is **no separate LLM system prompt** for images. The slim Flux `prompt` string **is** the full instruction.

Separate text paths (not image models):

- **Coach panel** in `public/index.html` — Norwegian/English tips after generate (`coachIntro`, adjust horizon/effort, etc.).
- **Tempo / pace** — goal tracking copy; may influence UI intensity defaults, not the slim Flux body text.
- Holistic `composeGoalBrief` still builds a parameter brief for API metadata / legacy path — not a Gemini system message.

---

## 7. Gemini / React Native — honest status

| Claim | Reality |
|-------|---------|
| Production image gen | **Vercel web + Replicate Flux Kontext** |
| Gemini image generation | **Not used** for Future You in the live web path. One code comment says “Gemini-style guard” for high BF% muscle override — that is naming only, not a Gemini API call. |
| Expo / RN | Present in repo (`App.js`, `app.json`, `src/api/generateFutureYou.js`, Terra helpers). Often **local / uncommitted noise** relative to the deployed web app. |
| Local `server/` | Older OpenAI images edits **or** simple Replicate wrapper (`server/lib/imageProviders.js`) — **not** the Max/Pro/Dev cascade + slim builder. |

### RN / Expo files that exist (NOT the live image pipeline)

- `App.js` — Expo UI (Fremtid / Tempo / Enheter)
- `app.json`, `index.js`, `package.json` (Expo)
- `src/api/generateFutureYou.js` — thin client POST (historically simpler payload)
- `src/api/terra.js`, `src/storage/*`, `src/pace/paceEngine.js`
- `server/lib/imageProviders.js` — OpenAI / basic Replicate (legacy local server)

Do **not** treat Gemini prompts as part of this package — we do not ship Gemini image prompts for Future You.

---

## 8. Cursor prompt history / design instruction themes

Key themes Frøydis (and iteration) locked in — **not** invented Gemini prompts:

1. **Slim 3(+1) params** — timeline, main goal, zones, brief BF only; strip novels that raised E005 false positives.
2. **Diminishing returns / τ=4** — replace changeForce doubling (1→2→4) with front-loaded progress; 3 mo ≈ half the journey; 6→12 is polish, not 4× drama.
3. **Proportion lock** over 6 months — stop disproportionate arm swelling on long horizons.
4. **No cartoons** — photorealism lock; refuse SDXL as success for body transforms.
5. **Max/Pro routing** — Max for demanding edits; skip Pro on high E005-risk shirtless/strong; Dev / Dev-strong reservedrift with stronger change language.
6. **Visible 3 mo** — Flux under-edits timid language; forbid slight/subtle/gradual for real fat-loss targets; demand obvious side-by-side difference.
7. **Interim BF encoding** — show ~half journey look at 3 mo (e.g. 22→16 → ~18.8%), not full goal at short horizon — but still **visible** change.

---

## 9. Good vs bad results (from conversation / iteration)

### Bad (seen / fixed against)

- **Near-copy on Dev reservedrift** — identity lock wins; mitigated with `DEV_CHANGE_FORCE` / `DEV_STRONG_CHANGE_FORCE`.
- **SDXL cartoon / melted face** (nødfallback) — high strength img2img; **disabled as success** for body path.
- **Disproportionate arms** on long horizon — addressed with proportion lock + “not exaggerated 4x arm growth” calibration.
- **Timid 3 mo** under old doubling / soft adjectives — fixed with front-loaded curve + commanding 3 mo calibration.

### Good target

- Photorealistic same person (face sharp).
- **3 mo:** clearly visible change (~half journey) — narrower waist, less midsection soft tissue.
- **6 mo:** more toward goal; refined continuation, not a doubled remake of 3 mo.
- **12 mo:** near-goal polish; balanced proportions.

### Screenshots / chat assets

No image binaries were found under `.cursor` project assets for this package (search returned **0** files). Screenshots from prior chats live in Cursor chat attachments if still available in the UI — **do not embed binaries** in this doc; describe results instead.

---

## 10. How to verify

1. Deploy / open the Vercel web app; Future You → horizons **Om 3 / 6 / 12 måneder**.
2. Set BF e.g. 22 → 16, zone abs, intensity strong; generate.
3. In **Vercel function logs**, find:
   - `[replicate] Route: …`
   - **`[replicate] Final prompt →`** — confirm slim length, τ=4 progress cue, calibration line, photorealism lock; 12 mo includes proportion lock.
4. Confirm cascade never celebrates `sdxl` (UI also rejects `result.attempt` containing `sdxl`).
5. Useful commit tips (recent calibration history):

| Hash | Why it matters |
|------|----------------|
| `7db2b75` | Slim Flux visual prompt builder |
| `1b63ce7` | Trim prompt stack / E005 |
| `42a5cc1` | Stop SDXL cartoon success; strengthen Dev |
| `e0c9144` | Exact 3/6/12 lines + proportion lock |
| `8a9e901` | Horizon ladder 3/6/12 (earlier force doubling) |
| `f69585a` | Replace doubling with τ=4 progress curve |

Quick local check (when Node is on PATH):

```bash
node -e "const { byggVisuellPrompt } = require('./lib/visuellPrompt'); console.log(byggVisuellPrompt({ months: 3, fat: 'decrease', muscle: 'toned', zones: ['abs'], bfNow: 22, bfGoal: 16 }).prompt);"
```

---

## Quick reference — env

| Variable | Notes |
|----------|--------|
| `REPLICATE_API_TOKEN` | Required on Vercel |
| `VISUAL_PROMPT_SLIM` | Default ON (`1`); set `0` for holistic |
| `REPLICATE_ALLOW_MODEL_ENV` | Must be `1` to honor `REPLICATE_MODEL` |
| `REPLICATE_MODEL` / `REPLICATE_FALLBACK_MODEL` | Ignored unless allow flag |

**Never commit** `.env` / tokens.

---

*End of package — single file for copy/send.*
