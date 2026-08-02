/**
 * VisualDirection — model-independent photographic presentation contract.
 *
 * Produced by VisualDirector from an existing TransformationPlan.
 * No provider options, dimensions, denoise, model names, steps, or seeds.
 */

export type PresentationStyle =
  | "source_faithful"
  | "natural_athletic"
  | "documentary_fitness";

export type ChangeVisibility =
  | "restrained"
  | "clear"
  | "pronounced";

export type TextureStyle =
  | "natural"
  | "slightly_defined";

export type PostureTreatment =
  | "preserve_exactly"
  | "preserve_with_natural_upright_emphasis";

export interface VisualDirection {
  schemaVersion: 1;
  presentationStyle: PresentationStyle;
  changeVisibility: ChangeVisibility;
  textureStyle: TextureStyle;
  postureTreatment: PostureTreatment;

  preserve: {
    identity: true;
    apparentAge: true;
    hair: true;
    skinTone: true;
    skeletalFrame: true;
    pose: true;
    cameraPerspective: true;
    lighting: true;
    clothing: true;
    accessories: true;
    background: true;
  };

  photographicInstructions: string[];
  emphasisInstructions: string[];
  realismConstraints: string[];
  exclusions: string[];

  metadata: {
    rulesVersion: string;
    sourcePlanRulesVersion: string;
    visualIntensity: string;
    estimateReliability: string;
  };
}
