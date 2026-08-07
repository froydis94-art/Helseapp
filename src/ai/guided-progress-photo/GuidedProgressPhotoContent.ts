/**
 * Guided Progress Photo Capture — immutable UI content (Demand 020 / Patch 020A).
 * Shared contract for public upload guide. No server fetch, no persistence.
 */

export const GUIDED_PROGRESS_PHOTO_CONTENT = {
  version: "1.1",
  buttonLabel: "Get the best progress photo",
  buttonVisualPrefix: "📷",
  title: "Get the best progress photo",
  subtitle:
    "A consistent photo helps HelseApp create a clearer and more realistic visualization.",
  rules: [
    "Keep your whole body visible from head to feet.",
    "Stand naturally with your arms slightly away from your body.",
    "Keep the camera straight and around waist or chest height.",
    "Use even light from the front — avoid strong shadows.",
    "Keep yourself clearly visible.",
  ],
  footnote:
    "Using a similar position and camera angle each time makes it easier to see your progress over time.",
  goodLightLabel: "Good light",
  goodLightHint: "Even front light — face and body clearly visible.",
  poorLightLabel: "Harder for the AI to interpret",
  poorLightHint: "Strong backlight or harsh shadows hide the body outline.",
  closeLabel: "Got it",
} as const;

export type GuidedProgressPhotoContent = typeof GUIDED_PROGRESS_PHOTO_CONTENT;

export function getGuidedProgressPhotoContent(): GuidedProgressPhotoContent {
  return GUIDED_PROGRESS_PHOTO_CONTENT;
}
