/**
 * VisualDirector — deterministic photographic presentation from a TransformationPlan.
 *
 * Does not calculate physiology, mutate the plan, or call image providers.
 */

import type { BodyProfile } from "../BodyProfile";
import type { TransformationGoal } from "../TransformationGoal";
import type { TransformationPlan, VisualIntensity } from "../TransformationPlan";
import type {
  ChangeVisibility,
  PresentationStyle,
  TextureStyle,
  VisualDirection,
} from "./VisualDirection";

/** Visual Director rules version (traceability — independent of physiology rules). */
export const VISUAL_DIRECTOR_RULES_VERSION = "1.0" as const;

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

function mapChangeVisibility(intensity: VisualIntensity): ChangeVisibility {
  switch (intensity) {
    case "subtle":
      return "restrained";
    case "moderate":
      return "clear";
    case "noticeable":
      return "clear";
    case "dramatic":
      return "pronounced";
  }
}

function hasMeaningfulAthleticChange(plan: TransformationPlan): boolean {
  if (plan.estimatedMuscleGainKg != null) return true;
  if (
    plan.estimatedLeanMassChangeKg != null &&
    plan.estimatedLeanMassChangeKg > 0
  ) {
    return true;
  }
  return plan.regionalTargets.some((r) => r.magnitude > 0.05);
}

function choosePresentationStyle(
  plan: TransformationPlan,
  changeVisibility: ChangeVisibility
): PresentationStyle {
  const athletic = hasMeaningfulAthleticChange(plan);
  const clearOrPronounced =
    changeVisibility === "clear" || changeVisibility === "pronounced";

  // documentary_fitness only allowed for clear or pronounced transformations
  if (
    clearOrPronounced &&
    (athletic ||
      plan.estimatedFatLossKg != null ||
      plan.visualIntensity === "noticeable" ||
      plan.visualIntensity === "dramatic")
  ) {
    return "documentary_fitness";
  }

  if (athletic) {
    return "natural_athletic";
  }

  return "source_faithful";
}

function hasPostureRelatedSupport(plan: TransformationPlan): boolean {
  return plan.regionalTargets.some((r) => {
    if (/posture/i.test(r.region)) return true;
    if (r.note != null && /posture/i.test(r.note)) return true;
    return false;
  });
}

function chooseTextureStyle(plan: TransformationPlan): TextureStyle {
  const intensityOk =
    plan.visualIntensity === "noticeable" ||
    plan.visualIntensity === "dramatic";
  const fatOrMuscle =
    plan.estimatedFatLossKg != null ||
    plan.estimatedMuscleGainKg != null ||
    (plan.estimatedFatChangeKg != null && plan.estimatedFatChangeKg < 0) ||
    (plan.estimatedLeanMassChangeKg != null &&
      plan.estimatedLeanMassChangeKg > 0);

  if (intensityOk && fatOrMuscle) {
    return "slightly_defined";
  }
  return "natural";
}

function describeRegionMagnitude(magnitude: number): string {
  if (magnitude < -0.05) return "subtle reduction / tightening";
  if (magnitude > 0.05) return "subtle development / fullness";
  return "minimal visible change";
}

function buildEmphasisInstructions(plan: TransformationPlan): string[] {
  const lines: string[] = [];

  lines.push(
    `Apply a ${plan.visualIntensity} visual change (progress ${plan.progress}).`
  );

  if (plan.interimBodyFatPct != null) {
    lines.push(
      `Interim body-fat appearance near ${plan.interimBodyFatPct}% (from plan estimate only).`
    );
  }

  if (plan.estimatedFatLossKg != null) {
    lines.push(
      `Directional fat-loss emphasis about ${plan.estimatedFatLossKg.min}–${plan.estimatedFatLossKg.max} kg (heuristic range from plan).`
    );
  }

  if (plan.estimatedMuscleGainKg != null) {
    lines.push(
      `Directional muscle-gain emphasis about ${plan.estimatedMuscleGainKg.min}–${plan.estimatedMuscleGainKg.max} kg (heuristic range from plan).`
    );
  }

  if (plan.waistChangeCm != null && plan.waistChangeCm < 0) {
    lines.push(
      `Waist may appear slightly smaller (about ${Math.abs(plan.waistChangeCm)} cm estimate from plan) without artificial cinching.`
    );
  }

  for (const region of plan.regionalTargets) {
    lines.push(
      `Region ${region.region}: ${describeRegionMagnitude(region.magnitude)}.`
    );
  }

  return uniqueNonEmpty(lines);
}

const PHOTOGRAPHIC_INSTRUCTIONS = [
  "retain the original source-photo character",
  "retain natural smartphone-camera realism",
  "retain the original light direction and exposure",
  "keep natural skin texture and pores",
  "avoid studio glamour reinterpretation",
  "avoid artificial sharpening or plastic skin",
] as const;

const REALISM_CONSTRAINTS = [
  "anatomically plausible changes",
  "original skeletal frame preserved",
  "no artificial waist compression",
  "no disproportionate regional growth",
  "no limb or hand distortion",
  "no superhero or caricature proportions",
  "no new muscles or anatomy painted onto clothing",
  "changes must remain compatible with the original pose",
] as const;

const EXCLUSIONS = [
  "different person",
  "changed face",
  "changed age",
  "changed skin tone",
  "changed pose",
  "changed camera angle",
  "changed background",
  "changed clothing",
  "altered skeletal frame",
  "extra or missing limbs",
  "distorted hands or feet",
  "artificial waist",
  "disproportionate muscles",
  "cartoon",
  "illustration",
  "CGI",
  "plastic skin",
] as const;

/**
 * Build a deterministic VisualDirection from validated inputs and a computed plan.
 * Profile and goal are accepted for the pipeline contract; presentation rules
 * use only TransformationPlan fields (no gender/ethnicity stereotypes).
 */
export function directVisual(
  _profile: BodyProfile,
  _goal: TransformationGoal,
  plan: TransformationPlan
): VisualDirection {
  const changeVisibility = mapChangeVisibility(plan.visualIntensity);
  const presentationStyle = choosePresentationStyle(plan, changeVisibility);
  const textureStyle = chooseTextureStyle(plan);
  const postureTreatment = hasPostureRelatedSupport(plan)
    ? "preserve_with_natural_upright_emphasis"
    : "preserve_exactly";

  return {
    schemaVersion: 1,
    presentationStyle,
    changeVisibility,
    textureStyle,
    postureTreatment,
    preserve: {
      identity: true,
      apparentAge: true,
      hair: true,
      skinTone: true,
      skeletalFrame: true,
      pose: true,
      cameraPerspective: true,
      lighting: true,
      clothing: true,
      accessories: true,
      background: true,
    },
    photographicInstructions: [...PHOTOGRAPHIC_INSTRUCTIONS],
    emphasisInstructions: buildEmphasisInstructions(plan),
    realismConstraints: [...REALISM_CONSTRAINTS],
    exclusions: [...EXCLUSIONS],
    metadata: {
      rulesVersion: VISUAL_DIRECTOR_RULES_VERSION,
      sourcePlanRulesVersion: plan.rulesVersion,
      visualIntensity: plan.visualIntensity,
      estimateReliability: plan.estimateReliability,
    },
  };
}

/** Deterministic Visual Director (thin class wrapper over `directVisual`). */
export class VisualDirector {
  directVisual(
    profile: BodyProfile,
    goal: TransformationGoal,
    plan: TransformationPlan
  ): VisualDirection {
    return directVisual(profile, goal, plan);
  }
}
