# Guided Progress Photo Capture

Status:  
User guidance — non-blocking  
Patch 020A: encouraging title, refined rules, consistency footnote

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Related: [Personal Account Trust](./19_PERSONAL_ACCOUNT_TRUST_AND_VAULT.md)

## Purpose

Help users take more consistent progress photographs before uploading. Better input photographs improve identity preservation, body-shape visibility, transformation consistency, comparison over time, and realism of generated results.

Guidance is optional. HelseApp must not shame, judge, or reject the user based on body type, size, height, weight, clothing, underwear style, pose, attractiveness, background, or camera quality.

## Active surface

Primary production upload surface: **web** `public/index.html` (Fremtid panel — `#file` → FileReader → generate).

Expo `App.js` Galleri/Kamera is a secondary native path and is documented as follow-up (not implemented in Demand 020).

Control Room is internal and unchanged.

## User flow

1. User opens Fremtid upload area.
2. Optional: taps **Get the best progress photo**.
3. Guide modal opens (does not open automatically).
4. User reads illustration, five rules, consistency footnote, good/poor light examples.
5. User taps **Got it** or closes — returns to upload.
6. User may select and upload any technically accepted photograph.

## Guide button

Secondary button near the source-image control:

`📷 Get the best progress photo`

- Visible before and after image selection
- Does not replace upload or generate
- Does not open camera or file picker
- Keyboard and screen-reader accessible
- Encouraging wording (not perfection-focused)

## Neutral illustration

Inline SVG silhouette: front-facing, full body, feet visible, arms slightly away, simple frame, camera in front. No stock photo, no external URL, no identifiable person, no body-ideal emphasis.

## Five short rules

1. Keep your whole body visible from head to feet.  
2. Stand naturally with your arms slightly away from your body.  
3. Keep the camera straight and around waist or chest height.  
4. Use even light from the front — avoid strong shadows.  
5. Keep yourself clearly visible.

## Consistency footnote

Informational only (not a sixth rule):

> Using a similar position and camera angle each time makes it easier to see your progress over time.

Visually smaller, non-blocking, no checkbox.

## Good-light example

Label: **Good light** — even front light; face and body clearly visible.

## Poor-light example

Label: **Harder for the AI to interpret** — backlight / harsh shadows. Educational, not rejecting.

## Accessibility

- Mobile-first modal based on existing `.onboard` overlay pattern  
- Escape closes on web  
- Close control has accessible name  
- Focus returns to trigger when practical  
- Prefer `prefers-reduced-motion` (no required animation)

## Privacy

Guide content is static. No image data enters the guide.

## No tracking

Do not store open/complete/view duration in localStorage, sessionStorage, cookies, IndexedDB, database, or analytics.

## Non-blocking behavior

Closing the guide never requires acknowledgement checkboxes, retakes, quality thresholds, AI analysis, or approval. Upload and generation APIs are unchanged.

## What remains unchanged

- AI OS runtime / formatter / provider / transport / retry  
- `api/generate-future-you.js`, `lib/replicate.js`  
- Control Room / AI Experiment Lab  
- Account-trust enforcement and Personal Progress Library persistence  
- Image picker and generation request contracts  

## Known limitations

- Guide is English content contract (UI strings match Demand 020 / Patch 020A wording).  
- Expo native upload surface not yet wired.  
- No live camera framing overlay.  
- Front / side / back capture modes are reserved only (documentation).

## Manual verification checklist

- [ ] Guide button visible near upload  
- [ ] Title reads Get the best progress photo  
- [ ] Guide does not open on page load  
- [ ] Exactly five rules; footnote is separate  
- [ ] Got it / Escape closes guide  
- [ ] File picker and Generate still work without opening guide  
- [ ] No legal / adult / consent / subscription copy inside guide  

## Future extensions

- optional camera framing overlay  
- optional live distance guidance  
- optional non-blocking photo-quality tips  
- optional comparison-position guidance  

Do not implement those in Demand 020 / Patch 020A.

## Reserved future guided capture modes

Status: **Reserved** — not implemented.

Documentation only. Do not create buttons, UI, camera logic, body analysis, or comparison for these modes in this patch.

- 📷 Front Progress Photo  
- 📷 Side Progress Photo  
- 📷 Back Progress Photo  

These capture modes are reserved for a future milestone.

See also: [21_VISUAL_BODY_ANALYSIS_RESERVATIONS.md](./21_VISUAL_BODY_ANALYSIS_RESERVATIONS.md) — owner-approved multi-view analysis and visual body-fat estimation (contracts only).

## Permanent rule

> Guided Progress Photo Capture helps users improve input consistency without judging or blocking their photograph.

## Module map

- `src/ai/guided-progress-photo/GuidedProgressPhotoContent.ts` — immutable content contract  
- `public/index.html` — button, modal, SVG illustrations, open/close behaviour  
- `src/ai/__tests__/guidedProgressPhoto.test.ts` — Demand 020 / Patch 020A tests  
- `docs/CTO/20_GUIDED_PROGRESS_PHOTO_CAPTURE.md` — this document  
