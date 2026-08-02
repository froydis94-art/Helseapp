/**
 * Visual Director barrel — photographic presentation between plan and prompts.
 *
 * Not wired to production UI or image providers.
 */

export type {
  ChangeVisibility,
  PresentationStyle,
  PostureTreatment,
  TextureStyle,
  VisualDirection,
} from "./VisualDirection";

export {
  VISUAL_DIRECTOR_RULES_VERSION,
  VisualDirector,
  directVisual,
} from "./VisualDirector";
