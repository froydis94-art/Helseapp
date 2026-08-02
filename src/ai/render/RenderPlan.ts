/**
 * RenderPlan — provider-neutral structured rendering contract.
 *
 * Produced by RenderPlanBuilder from TransformationPlan + VisualDirection.
 * Contains structured instructions only; provider-ready prompt text is a
 * derived artifact created later by a ProviderFormatter (not yet implemented).
 *
 * No provider names, API fields, model IDs, network metadata, image URLs,
 * secrets, Base64 data, or unsupported invented numerics.
 */

export const RENDER_PLAN_SCHEMA_VERSION = 1 as const;
export const RENDER_PLAN_RULES_VERSION = "1.0" as const;

export type RenderOperation = "edit_source_image";

export type RenderChangeKind =
  | "fat_reduction"
  | "fat_increase"
  | "muscle_development"
  | "waist_change"
  | "regional_change"
  | "whole_body_recomposition";

export type RenderChangeDirection =
  | "decrease"
  | "increase"
  | "maintain"
  | "refine";

export interface RenderChange {
  id: string;
  kind: RenderChangeKind;
  direction: RenderChangeDirection;
  region?: string;
  visibility: "restrained" | "clear" | "pronounced";
  description: string;
  sourcePlanField: string;
}

export interface RenderPlan {
  schemaVersion: typeof RENDER_PLAN_SCHEMA_VERSION;
  rulesVersion: typeof RENDER_PLAN_RULES_VERSION;

  source: {
    operation: RenderOperation;
    preserveSourceComposition: true;
  };

  identity: {
    preservePerson: true;
    preserveFace: true;
    preserveApparentAge: true;
    preserveHair: true;
    preserveSkinTone: true;
    preserveDistinctiveFeatures: true;
  };

  scene: {
    preservePose: true;
    preserveCameraPerspective: true;
    preserveLighting: true;
    preserveClothing: true;
    preserveAccessories: true;
    preserveBackground: true;
  };

  transformation: {
    visualIntensity: string;
    changeVisibility: "restrained" | "clear" | "pronounced";
    approvedChanges: RenderChange[];
  };

  anatomy: {
    preserveSkeletalFrame: true;
    constraints: string[];
  };

  realism: {
    presentationStyle: string;
    textureStyle: string;
    constraints: string[];
  };

  exclusions: string[];

  trace: {
    transformationRulesVersion: string;
    visualDirectionRulesVersion: string;
    transformationPlanSchemaVersion: number;
    renderPlanSchemaVersion: number;
    estimateReliability: string;
  };
}

export interface RenderPlanValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
