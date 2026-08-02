/**
 * RenderPlanBuilder — maps TransformationPlan + VisualDirection → RenderPlan.
 *
 * Does not calculate physiology, mutate inputs, call providers, or emit
 * provider-specific prompt syntax. Foundation only — not production-integrated.
 */

import type { TransformationPlan } from "../TransformationPlan";
import type { VisualDirection } from "../visual/VisualDirection";
import {
  RENDER_PLAN_RULES_VERSION,
  RENDER_PLAN_SCHEMA_VERSION,
  type RenderChange,
  type RenderPlan,
  type RenderPlanValidationResult,
} from "./RenderPlan";

/** Anatomy principles that must remain present on every RenderPlan. */
const REQUIRED_ANATOMY_PRINCIPLES = [
  "preserve original skeletal frame",
  "anatomically plausible changes",
  "no artificial waist compression",
  "no disproportionate regional growth",
  "no limb or hand distortion",
  "changes compatible with original pose",
] as const;

const FORBIDDEN_PROVIDER_KEYWORDS = [
  "replicate",
  "flux",
  "sdxl",
  "openai",
  "imagen",
  "api key",
  "bearer",
  "model id",
  "inference steps",
  "denoise",
  "prompt strength",
] as const;

function uniqueNonEmpty(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function hasWholeBodyRecomposition(plan: TransformationPlan): boolean {
  const fatSignal =
    plan.estimatedFatLossKg != null ||
    (plan.estimatedFatChangeKg != null && plan.estimatedFatChangeKg !== 0);
  const muscleSignal =
    plan.estimatedMuscleGainKg != null ||
    (plan.estimatedLeanMassChangeKg != null &&
      plan.estimatedLeanMassChangeKg !== 0);
  return fatSignal && muscleSignal;
}

function fatReductionApproved(plan: TransformationPlan): boolean {
  if (plan.estimatedFatLossKg != null) return true;
  if (plan.estimatedFatChangeKg != null && plan.estimatedFatChangeKg < 0) {
    return true;
  }
  return false;
}

function fatIncreaseApproved(plan: TransformationPlan): boolean {
  if (plan.estimatedFatLossKg != null) return false;
  if (plan.estimatedFatChangeKg != null && plan.estimatedFatChangeKg > 0) {
    return true;
  }
  return false;
}

function muscleDevelopmentApproved(plan: TransformationPlan): boolean {
  if (plan.estimatedMuscleGainKg != null) return true;
  if (
    plan.estimatedLeanMassChangeKg != null &&
    plan.estimatedLeanMassChangeKg > 0
  ) {
    return true;
  }
  return false;
}

function waistChangeApproved(plan: TransformationPlan): boolean {
  return plan.waistChangeCm != null && plan.waistChangeCm !== 0;
}

function regionChangeDirection(
  magnitude: number
): RenderChange["direction"] {
  if (magnitude < -0.05) return "decrease";
  if (magnitude > 0.05) return "increase";
  return "refine";
}

function describeRegionalChange(region: string, magnitude: number): string {
  if (magnitude < -0.05) {
    return `Reduce visible soft tissue around the ${region} while preserving natural anatomy.`;
  }
  if (magnitude > 0.05) {
    return `Add modest proportional ${region} development consistent with the source frame.`;
  }
  return `Apply a restrained refinement to the ${region} without inventing new anatomy.`;
}

function buildApprovedChanges(
  plan: TransformationPlan,
  direction: VisualDirection
): RenderChange[] {
  const visibility = direction.changeVisibility;
  const changes: RenderChange[] = [];

  if (hasWholeBodyRecomposition(plan)) {
    changes.push({
      id: "whole-body-recomposition",
      kind: "whole_body_recomposition",
      direction: "refine",
      visibility,
      description:
        "Apply a clear whole-body recomposition while preserving the original silhouette identity.",
      sourcePlanField: "estimatedFatChangeKg,estimatedLeanMassChangeKg",
    });
  }

  if (fatReductionApproved(plan)) {
    changes.push({
      id: "fat-reduction",
      kind: "fat_reduction",
      direction: "decrease",
      visibility,
      description:
        "Reduce visible soft tissue while preserving natural anatomy and source identity.",
      sourcePlanField:
        plan.estimatedFatLossKg != null
          ? "estimatedFatLossKg"
          : "estimatedFatChangeKg",
    });
  } else if (fatIncreaseApproved(plan)) {
    changes.push({
      id: "fat-increase",
      kind: "fat_increase",
      direction: "increase",
      visibility,
      description:
        "Increase soft-tissue fullness modestly while preserving natural anatomy and source identity.",
      sourcePlanField: "estimatedFatChangeKg",
    });
  }

  if (waistChangeApproved(plan)) {
    const decreasing = (plan.waistChangeCm as number) < 0;
    changes.push({
      id: "waist-change",
      kind: "waist_change",
      direction: decreasing ? "decrease" : "increase",
      region: "waist",
      visibility,
      description: decreasing
        ? "Reduce visible soft tissue around the waist while preserving natural anatomy."
        : "Increase waist fullness modestly while preserving natural anatomy.",
      sourcePlanField: "waistChangeCm",
    });
  }

  if (muscleDevelopmentApproved(plan)) {
    changes.push({
      id: "muscle-development",
      kind: "muscle_development",
      direction: "increase",
      visibility,
      description:
        "Add modest proportional muscle development consistent with the source frame.",
      sourcePlanField:
        plan.estimatedMuscleGainKg != null
          ? "estimatedMuscleGainKg"
          : "estimatedLeanMassChangeKg",
    });
  }

  for (const target of plan.regionalTargets) {
    const region = target.region.trim();
    if (!region) continue;
    changes.push({
      id: `region-${region}`,
      kind: "regional_change",
      direction: regionChangeDirection(target.magnitude),
      region,
      visibility,
      description: describeRegionalChange(region, target.magnitude),
      sourcePlanField: "regionalTargets",
    });
  }

  // Deduplicate by id while preserving first occurrence / stable order.
  const seen = new Set<string>();
  const unique: RenderChange[] = [];
  for (const change of changes) {
    if (seen.has(change.id)) continue;
    seen.add(change.id);
    unique.push(change);
  }
  return unique;
}

function buildAnatomyConstraints(direction: VisualDirection): string[] {
  return uniqueNonEmpty([
    ...REQUIRED_ANATOMY_PRINCIPLES,
    ...direction.realismConstraints,
  ]);
}

function buildRealismConstraints(direction: VisualDirection): string[] {
  return uniqueNonEmpty([
    ...direction.photographicInstructions,
    ...direction.realismConstraints,
  ]);
}

/**
 * Build a deterministic RenderPlan from an approved plan and visual direction.
 * Does not calculate physiology or mutate inputs.
 */
export function buildRenderPlan(
  plan: TransformationPlan,
  direction: VisualDirection
): RenderPlan {
  return {
    schemaVersion: RENDER_PLAN_SCHEMA_VERSION,
    rulesVersion: RENDER_PLAN_RULES_VERSION,
    source: {
      operation: "edit_source_image",
      preserveSourceComposition: true,
    },
    identity: {
      preservePerson: true,
      preserveFace: true,
      preserveApparentAge: true,
      preserveHair: true,
      preserveSkinTone: true,
      preserveDistinctiveFeatures: true,
    },
    scene: {
      preservePose: true,
      preserveCameraPerspective: true,
      preserveLighting: true,
      preserveClothing: true,
      preserveAccessories: true,
      preserveBackground: true,
    },
    transformation: {
      visualIntensity: plan.visualIntensity,
      changeVisibility: direction.changeVisibility,
      approvedChanges: buildApprovedChanges(plan, direction),
    },
    anatomy: {
      preserveSkeletalFrame: true,
      constraints: buildAnatomyConstraints(direction),
    },
    realism: {
      presentationStyle: direction.presentationStyle,
      textureStyle: direction.textureStyle,
      constraints: buildRealismConstraints(direction),
    },
    exclusions: uniqueNonEmpty(direction.exclusions),
    trace: {
      transformationRulesVersion: plan.rulesVersion,
      visualDirectionRulesVersion: direction.metadata.rulesVersion,
      transformationPlanSchemaVersion: plan.schemaVersion,
      renderPlanSchemaVersion: RENDER_PLAN_SCHEMA_VERSION,
      estimateReliability: plan.estimateReliability,
    },
  };
}

function collectStringLeaves(
  value: unknown,
  path: string,
  out: Array<{ path: string; value: string }>
): void {
  if (value == null) return;
  if (typeof value === "string") {
    out.push({ path, value });
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectStringLeaves(item, `${path}[${i}]`, out));
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectStringLeaves(child, path ? `${path}.${key}` : key, out);
    }
  }
}

function hasUndefinedInRequired(value: unknown): boolean {
  if (value === undefined) return true;
  if (value === null) return false;
  if (typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasUndefinedInRequired(item));
  }
  return Object.values(value as Record<string, unknown>).some((child) =>
    hasUndefinedInRequired(child)
  );
}

const URL_LIKE =
  /https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|ai)\b/i;
/** True Base64 payloads / data-URIs — not camelCase field names. */
const BASE64_LIKE =
  /data:image\/[a-z0-9+.-]*;base64,[A-Za-z0-9+/=\s]{16,}|^[A-Za-z0-9+/]{64,}={1,2}$/;
const API_KEY_LIKE =
  /\b(?:sk-|rk-|api[_-]?key|bearer\s+[A-Za-z0-9._-]{8,})\b/i;

/**
 * Deterministic RenderPlan validation. No I/O.
 */
export function validateRenderPlan(
  renderPlan: RenderPlan
): RenderPlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (renderPlan.schemaVersion == null) {
    errors.push("schemaVersion is missing");
  }
  const rulesVersion = renderPlan.rulesVersion as string | null | undefined;
  if (rulesVersion == null || rulesVersion.trim() === "") {
    errors.push("rulesVersion is missing");
  }
  if (renderPlan.source?.operation !== "edit_source_image") {
    errors.push('source.operation must be "edit_source_image"');
  }

  const flags: Array<[boolean | undefined, string]> = [
    [renderPlan.source?.preserveSourceComposition, "source.preserveSourceComposition"],
    [renderPlan.identity?.preservePerson, "identity.preservePerson"],
    [renderPlan.identity?.preserveFace, "identity.preserveFace"],
    [renderPlan.identity?.preserveApparentAge, "identity.preserveApparentAge"],
    [renderPlan.identity?.preserveHair, "identity.preserveHair"],
    [renderPlan.identity?.preserveSkinTone, "identity.preserveSkinTone"],
    [
      renderPlan.identity?.preserveDistinctiveFeatures,
      "identity.preserveDistinctiveFeatures",
    ],
    [renderPlan.scene?.preservePose, "scene.preservePose"],
    [renderPlan.scene?.preserveCameraPerspective, "scene.preserveCameraPerspective"],
    [renderPlan.scene?.preserveLighting, "scene.preserveLighting"],
    [renderPlan.scene?.preserveClothing, "scene.preserveClothing"],
    [renderPlan.scene?.preserveAccessories, "scene.preserveAccessories"],
    [renderPlan.scene?.preserveBackground, "scene.preserveBackground"],
    [renderPlan.anatomy?.preserveSkeletalFrame, "anatomy.preserveSkeletalFrame"],
  ];
  for (const [flag, label] of flags) {
    if (flag !== true) {
      errors.push(`${label} must be true`);
    }
  }

  const changes = renderPlan.transformation?.approvedChanges ?? [];
  const ids = new Set<string>();
  for (const change of changes) {
    if (!change.id || change.id.trim() === "") {
      errors.push("approvedChanges entry missing id");
      continue;
    }
    if (ids.has(change.id)) {
      errors.push(`duplicate approvedChange id: ${change.id}`);
    }
    ids.add(change.id);
    if (!change.description || change.description.trim() === "") {
      errors.push(`approvedChange ${change.id} has empty description`);
    }
  }

  const exclusions = renderPlan.exclusions ?? [];
  const exclusionSeen = new Set<string>();
  for (const ex of exclusions) {
    if (exclusionSeen.has(ex)) {
      errors.push(`duplicate exclusion: ${ex}`);
    }
    exclusionSeen.add(ex);
  }

  for (const c of renderPlan.anatomy?.constraints ?? []) {
    if (!c || c.trim() === "") {
      errors.push("empty anatomy constraint string");
    }
  }
  for (const c of renderPlan.realism?.constraints ?? []) {
    if (!c || c.trim() === "") {
      errors.push("empty realism constraint string");
    }
  }

  if (hasUndefinedInRequired(renderPlan)) {
    errors.push("undefined values present inside required objects");
  }

  const strings: Array<{ path: string; value: string }> = [];
  collectStringLeaves(renderPlan, "", strings);

  for (const { path, value } of strings) {
    const lower = value.toLowerCase();
    for (const keyword of FORBIDDEN_PROVIDER_KEYWORDS) {
      if (lower.includes(keyword)) {
        errors.push(`provider/model keyword "${keyword}" in ${path || "root"}`);
      }
    }
    if (URL_LIKE.test(value)) {
      errors.push(`URL-like string in ${path || "root"}`);
    }
    if (API_KEY_LIKE.test(value)) {
      errors.push(`API-key-like string in ${path || "root"}`);
    }
    if (BASE64_LIKE.test(value.trim())) {
      errors.push(`Base64-like string in ${path || "root"}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
