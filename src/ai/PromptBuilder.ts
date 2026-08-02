/**
 * PromptBuilder — translates a TransformationPlan into a model-independent
 * prompt package. Does not recalculate physiology or call image models.
 */

import type { BodyProfile } from "./BodyProfile";
import type { TransformationGoal } from "./TransformationGoal";
import type { TransformationPlan } from "./TransformationPlan";

/** Structured prompt bundle (legacy stub shape — kept for compatibility). */
export interface StructuredPromptOutput {
  /** Main positive prompt text. */
  prompt: string;

  /** Negative prompt text. */
  negativePrompt: string;

  /** Identity-preservation instructions. */
  identityPrompt: string;

  /** Lighting direction. */
  lightingPrompt: string;

  /** Camera / framing instructions. */
  cameraPrompt: string;

  /** Optional machine-readable extras for adapters. */
  meta?: Record<string, unknown>;
}

/**
 * Model-independent prompt package derived from profile + goal + plan.
 * No provider-specific fields, denoise strength, steps, or model names.
 */
export interface PromptPackage {
  primaryPrompt: string;
  negativePrompt: string;
  identityConstraints: string[];
  anatomyConstraints: string[];
  transformationInstructions: string[];
  metadata: {
    rulesVersion: string;
    visualIntensity: string;
    estimateReliability: string;
  };
}

/**
 * Contract: accept a plan (and optional extras), return structured prompt parts.
 * Implementations must not call image models.
 */
export interface PromptBuilder {
  build(plan: TransformationPlan, extras?: Record<string, unknown>): StructuredPromptOutput;
}

const NEGATIVE_PROMPT = [
  "different person",
  "changed face",
  "distorted anatomy",
  "extra limbs",
  "missing limbs",
  "enlarged hands",
  "enlarged feet",
  "artificial waist",
  "disproportionate muscles",
  "cartoon",
  "illustration",
  "CGI",
  "plastic skin",
  "blurred identity",
  "changed clothing",
  "changed pose",
  "changed camera angle",
  "changed background",
].join(", ");

const IDENTITY_CONSTRAINTS = [
  "Keep the same person as the source photograph",
  "Preserve facial identity and apparent age",
  "Preserve hair, skin tone, tattoos, and scars",
  "Preserve skeletal frame and limb count",
  "Preserve pose, camera perspective, lighting, clothing, accessories, and background",
];

const ANATOMY_CONSTRAINTS = [
  "Anatomically plausible proportions only",
  "No impossible skeletal changes",
  "No duplicate or missing limbs",
  "No distorted hands or feet",
  "Muscle development proportional to the original frame",
  "No artificial waist compression or caricature proportions",
];

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

function describeChangeDirection(magnitude: number): string {
  if (magnitude < -0.05) return "subtle reduction / tightening";
  if (magnitude > 0.05) return "subtle development / fullness";
  return "minimal visible change";
}

/**
 * Build a structured PromptPackage from validated inputs and a computed plan.
 * Translates plan fields only — does not recalculate fat, muscle, timeline, or reliability.
 */
export function buildPromptPackage(
  _profile: BodyProfile,
  _goal: TransformationGoal,
  plan: TransformationPlan
): PromptPackage {
  const identityConstraints = [...IDENTITY_CONSTRAINTS];
  const anatomyConstraints = [...ANATOMY_CONSTRAINTS];

  const transformationInstructions: string[] = [];

  transformationInstructions.push(
    `Apply a ${plan.visualIntensity} visual change over approximately ${plan.effectiveTimelineWeeks} weeks (progress ${plan.progress}).`
  );

  if (plan.interimBodyFatPct != null) {
    transformationInstructions.push(
      `Interim body-fat appearance near ${plan.interimBodyFatPct}% (estimate from plan, not a measured value).`
    );
  } else if (plan.currentBodyFatPct != null && plan.targetBodyFatPct == null) {
    transformationInstructions.push(
      "Body-fat target unknown — do not invent a numeric body-fat percentage."
    );
  } else if (plan.currentBodyFatPct == null) {
    transformationInstructions.push(
      "Current body-fat unknown — do not invent a numeric body-fat percentage."
    );
  }

  if (plan.estimatedFatLossKg != null) {
    transformationInstructions.push(
      `Directional fat-loss estimate about ${plan.estimatedFatLossKg.min}–${plan.estimatedFatLossKg.max} kg (heuristic range).`
    );
  } else if (plan.estimatedFatChangeKg != null && plan.estimatedFatChangeKg > 0) {
    transformationInstructions.push(
      "Plan indicates fat gain direction — keep changes subtle and proportional."
    );
  }

  if (plan.estimatedMuscleGainKg != null) {
    transformationInstructions.push(
      `Directional muscle-gain estimate about ${plan.estimatedMuscleGainKg.min}–${plan.estimatedMuscleGainKg.max} kg (heuristic range).`
    );
  }

  if (plan.waistChangeCm != null && plan.waistChangeCm < 0) {
    transformationInstructions.push(
      `Waist may appear slightly smaller (about ${Math.abs(plan.waistChangeCm)} cm estimate) without artificial cinching.`
    );
  }

  for (const region of plan.regionalTargets) {
    transformationInstructions.push(
      `Region ${region.region}: ${describeChangeDirection(region.magnitude)}.`
    );
  }

  const preserveBlock = [
    "facial identity and apparent age",
    "hair, skin tone, tattoos, scars",
    "skeletal frame and limb placement",
    "pose, camera perspective, lighting",
    "clothing, accessories, and background",
  ]
    .map((line) => `- ${line}`)
    .join("\n");

  const changeLines = uniqueNonEmpty(transformationInstructions).map(
    (line) => `- ${line}`
  );
  const changeBlock = changeLines.join("\n");

  const realismBlock = [
    "- photorealistic photograph, natural skin texture",
    "- anatomically plausible, proportional to the original frame",
    "- no exaggerated or cartoonish physique",
    "- motivational visual estimate only — not a guaranteed outcome",
  ].join("\n");

  const primaryPrompt = [
    "Edit this exact source photograph. Keep the same person.",
    "",
    "PRESERVE:",
    preserveBlock,
    "",
    "CHANGE:",
    changeBlock,
    "",
    "REALISM:",
    realismBlock,
  ].join("\n");

  return {
    primaryPrompt,
    negativePrompt: NEGATIVE_PROMPT,
    identityConstraints,
    anatomyConstraints,
    transformationInstructions: uniqueNonEmpty(transformationInstructions),
    metadata: {
      rulesVersion: plan.rulesVersion,
      visualIntensity: plan.visualIntensity,
      estimateReliability: plan.estimateReliability,
    },
  };
}

/**
 * Stub PromptBuilder — returns empty structured fields.
 * Prefer `buildPromptPackage` for the Sprint 1 contract.
 */
export class StubPromptBuilder implements PromptBuilder {
  build(
    _plan: TransformationPlan,
    _extras?: Record<string, unknown>
  ): StructuredPromptOutput {
    return {
      prompt: "",
      negativePrompt: "",
      identityPrompt: "",
      lightingPrompt: "",
      cameraPrompt: "",
      meta: { stub: true },
    };
  }
}
