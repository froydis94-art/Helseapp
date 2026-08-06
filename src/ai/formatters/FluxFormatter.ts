/**
 * FluxFormatter — translates RenderPlan into Flux-family prompt sections.
 *
 * Provider knowledge is limited to formatting conventions.
 * No network, auth, model-tier selection, or Replicate API fields.
 */

import type { RenderChange, RenderPlan } from "../render/RenderPlan";
import type {
  FormatterCapability,
  FormatterOptions,
  FormatterWarning,
  FormattedImageRequest,
  ProviderFamily,
  ProviderFormatter,
} from "./ProviderFormatter";
import { SUPPORTED_FORMATTER_ASPECT_RATIOS } from "./ProviderFormatter";

export const FLUX_FORMATTER_VERSION = "1.0" as const;

const FLUX_CAPABILITIES: readonly FormatterCapability[] = [
  "negative_prompt",
  "aspect_ratio",
  "seed",
  "quality",
  "style",
  "source_image_edit",
  "identity_preservation",
  "structured_instructions",
] as const;

type PresentationStyleKey =
  | "source_faithful"
  | "natural_athletic"
  | "documentary_fitness";

type VisibilityKey = "restrained" | "clear" | "pronounced";

function translatePresentationStyle(style: string): string {
  switch (style) {
    case "source_faithful":
      return "Keep the original photograph highly faithful to the source.";
    case "natural_athletic":
      return "Present the approved changes with a natural athletic appearance.";
    case "documentary_fitness":
      return "Use a realistic documentary fitness-photo presentation.";
    default:
      return "Keep the photographic presentation faithful to the source photograph.";
  }
}

function translateVisibility(visibility: string): string {
  switch (visibility) {
    case "restrained":
      // Avoid leaking the raw enum token into the human prompt.
      return "Keep the visible transformation subtle and understated.";
    case "clear":
      return "Make the approved transformation clearly visible while remaining realistic.";
    case "pronounced":
      // Avoid leaking the raw enum token into the human prompt.
      return "Make the approved transformation strongly visible without exaggeration.";
    default:
      return "Apply only the approved transformation with realistic visibility.";
  }
}

function translateTextureStyle(texture: string): string {
  switch (texture) {
    case "slightly_defined":
      return "Use slightly defined natural skin and muscle texture without artificial gloss.";
    case "natural":
      return "Keep natural skin texture and pores.";
    default:
      return "Keep natural photographic texture.";
  }
}

function isPresentationStyle(value: string): value is PresentationStyleKey {
  return (
    value === "source_faithful" ||
    value === "natural_athletic" ||
    value === "documentary_fitness"
  );
}

function uniqueStable(lines: string[]): string[] {
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

function buildSourceSection(plan: RenderPlan): string {
  const lines = [
    "Edit this exact source photograph.",
    plan.source.preserveSourceComposition
      ? "Keep the source composition."
      : "Keep the source composition.",
    "Do not generate a new person or a new scene.",
  ];
  return ["SOURCE", ...lines].join("\n");
}

function buildIdentitySection(plan: RenderPlan): string {
  const lines: string[] = [];
  if (plan.identity.preservePerson) {
    lines.push("Preserve the same person as the source photograph.");
  }
  if (plan.identity.preserveFace) {
    lines.push("Preserve the same face.");
  }
  if (plan.identity.preserveApparentAge) {
    lines.push("Preserve the same apparent age.");
  }
  if (plan.identity.preserveHair) {
    lines.push("Preserve the same hair.");
  }
  if (plan.identity.preserveSkinTone) {
    lines.push("Preserve the same skin tone.");
  }
  if (plan.identity.preserveDistinctiveFeatures) {
    lines.push("Preserve the same distinctive features.");
  }
  return ["IDENTITY", ...lines].join("\n");
}

function buildSceneSection(plan: RenderPlan): string {
  const lines: string[] = [];
  if (plan.scene.preservePose) {
    lines.push("Preserve the original pose.");
  }
  if (plan.scene.preserveCameraPerspective) {
    lines.push("Preserve the camera perspective.");
  }
  if (plan.scene.preserveLighting) {
    lines.push("Preserve the lighting.");
  }
  if (plan.scene.preserveClothing) {
    lines.push("Preserve the clothing.");
  }
  if (plan.scene.preserveAccessories) {
    lines.push("Preserve the accessories.");
  }
  if (plan.scene.preserveBackground) {
    lines.push("Preserve the background.");
  }
  return ["SCENE", ...lines].join("\n");
}

function buildTransformSection(plan: RenderPlan): string {
  const lines: string[] = [translateVisibility(plan.transformation.changeVisibility)];
  const seenDescriptions = new Set<string>();
  for (const change of plan.transformation.approvedChanges) {
    const description = change.description.trim();
    if (!description || seenDescriptions.has(description)) continue;
    seenDescriptions.add(description);
    lines.push(description);
  }
  return ["TRANSFORM", ...lines].join("\n");
}

function buildAnatomySection(plan: RenderPlan): string {
  const lines: string[] = [];
  if (plan.anatomy.preserveSkeletalFrame) {
    lines.push("Preserve the original skeletal frame.");
  }
  lines.push("Keep anatomically plausible proportions.");
  lines.push("Do not apply artificial waist compression.");
  lines.push("Do not apply disproportionate muscle growth.");
  lines.push("Do not distort limbs, hands, or feet.");
  lines.push("Keep changes compatible with the original pose.");
  for (const constraint of plan.anatomy.constraints) {
    const t = constraint.trim();
    if (t) lines.push(t);
  }
  return ["ANATOMY", ...uniqueStable(lines)].join("\n");
}

function buildRealismSection(
  plan: RenderPlan,
  presentationStyle: string
): string {
  const lines: string[] = [
    translatePresentationStyle(presentationStyle),
    translateTextureStyle(plan.realism.textureStyle),
  ];
  for (const constraint of plan.realism.constraints) {
    const t = constraint.trim();
    if (t) lines.push(t);
  }
  return ["REALISM", ...uniqueStable(lines)].join("\n");
}

function buildSafetySection(): string {
  const lines = [
    "Clearly adult subject only.",
    "Non-sexual fitness progress visualization in a health and training context.",
    "Neutral documentary presentation.",
    "Ordinary underwear or athletic clothing may be present and must remain non-sexual.",
    "Preserve existing clothing coverage.",
    "Do not remove clothing.",
    "Do not make clothing more revealing.",
    "No nudity.",
    "No genital exposure.",
    "No sexualization.",
    "No erotic pose.",
    "No age reduction.",
    "No age ambiguity.",
    "Preserve identity.",
    "Preserve pose unless the approved transformation requires only a minor natural adjustment.",
  ];
  return ["SAFETY", ...lines].join("\n");
}

const PREVIEW_SAFETY_NEGATIVE = [
  "nudity",
  "genital exposure",
  "sexualized pose",
  "erotic framing",
  "age reduction",
  "minor appearance",
  "childlike features",
  "removed clothing",
  "more revealing clothing",
] as const;

function buildNegativePrompt(
  plan: RenderPlan,
  includePreviewSafety: boolean
): string {
  const parts = [...plan.exclusions];
  if (includePreviewSafety) {
    parts.push(...PREVIEW_SAFETY_NEGATIVE);
  }
  return uniqueStable(parts).join(", ");
}

function resolvePresentationStyle(
  plan: RenderPlan,
  options: FormatterOptions | undefined,
  warnings: FormatterWarning[]
): PresentationStyleKey {
  if (options?.styleOverride !== undefined) {
    if (isPresentationStyle(options.styleOverride)) {
      return options.styleOverride;
    }
    warnings.push({
      code: "unsupported_style",
      message: `Unsupported styleOverride omitted: ${String(options.styleOverride)}`,
    });
  }
  if (isPresentationStyle(plan.realism.presentationStyle)) {
    return plan.realism.presentationStyle;
  }
  warnings.push({
    code: "unsupported_style",
    message: `Unsupported presentationStyle fell back to source-faithful wording: ${plan.realism.presentationStyle}`,
  });
  return "source_faithful";
}

function applyOptions(
  options: FormatterOptions | undefined,
  warnings: FormatterWarning[]
): Pick<FormattedImageRequest, "aspectRatio" | "seed" | "quality"> {
  const out: Pick<FormattedImageRequest, "aspectRatio" | "seed" | "quality"> =
    {};
  if (!options) return out;

  if (options.aspectRatio !== undefined) {
    if (
      (SUPPORTED_FORMATTER_ASPECT_RATIOS as readonly string[]).includes(
        options.aspectRatio
      )
    ) {
      out.aspectRatio = options.aspectRatio;
    } else {
      warnings.push({
        code: "unsupported_aspect_ratio",
        message: `Unsupported aspectRatio omitted: ${options.aspectRatio}`,
      });
    }
  }

  if (options.seed !== undefined) {
    if (
      typeof options.seed === "number" &&
      Number.isFinite(options.seed) &&
      Number.isInteger(options.seed) &&
      options.seed >= 0
    ) {
      out.seed = options.seed;
    } else {
      warnings.push({
        code: "provider_limitation",
        message: `Invalid seed omitted: ${String(options.seed)}`,
      });
    }
  }

  if (options.quality !== undefined) {
    if (options.quality === "standard" || options.quality === "high") {
      out.quality = options.quality;
    } else {
      warnings.push({
        code: "unsupported_quality",
        message: `Unsupported quality omitted: ${String(options.quality)}`,
      });
    }
  }

  return out;
}

/**
 * Flux-family formatter. Deterministic for identical RenderPlan + options.
 * Does not mutate inputs or alter approvedChanges.
 */
export class FluxFormatter implements ProviderFormatter {
  readonly name = "FluxFormatter";
  readonly version = FLUX_FORMATTER_VERSION;
  readonly providerFamily: ProviderFamily = "flux";
  readonly capabilities = FLUX_CAPABILITIES;

  format(
    renderPlan: RenderPlan,
    options?: FormatterOptions
  ): FormattedImageRequest {
    const warnings: FormatterWarning[] = [];
    const presentationStyle = resolvePresentationStyle(
      renderPlan,
      options,
      warnings
    );
    const optionFields = applyOptions(options, warnings);

    // Touch approvedChanges read-only to keep a stable local reference for
    // determinism checks; never mutate.
    const approvedChanges: readonly RenderChange[] =
      renderPlan.transformation.approvedChanges;
    void approvedChanges;

    const includePreviewSafety =
      options?.previewSafetyContext === "non_sexual_fitness_visualization";

    const promptSections = [
      buildSourceSection(renderPlan),
      buildIdentitySection(renderPlan),
      buildSceneSection(renderPlan),
      buildTransformSection(renderPlan),
      buildAnatomySection(renderPlan),
      buildRealismSection(renderPlan, presentationStyle),
    ];
    if (includePreviewSafety) {
      promptSections.push(buildSafetySection());
    }
    const prompt = promptSections.join("\n\n");

    const negativePrompt = buildNegativePrompt(renderPlan, includePreviewSafety);

    const result: FormattedImageRequest = {
      providerFamily: this.providerFamily,
      prompt,
      sourceOperation: "edit_source_image",
      warnings: [...warnings],
      style: presentationStyle,
      metadata: {
        formatterName: this.name,
        formatterVersion: this.version,
        renderPlanSchemaVersion: renderPlan.schemaVersion,
        renderPlanRulesVersion: renderPlan.rulesVersion,
        transformationRulesVersion:
          renderPlan.trace.transformationRulesVersion,
        visualDirectionRulesVersion:
          renderPlan.trace.visualDirectionRulesVersion,
        estimateReliability: renderPlan.trace.estimateReliability,
      },
    };

    if (negativePrompt) {
      result.negativePrompt = negativePrompt;
    }
    if (optionFields.aspectRatio !== undefined) {
      result.aspectRatio = optionFields.aspectRatio;
    }
    if (optionFields.seed !== undefined) {
      result.seed = optionFields.seed;
    }
    if (optionFields.quality !== undefined) {
      result.quality = optionFields.quality;
    }

    return result;
  }
}

/** Convenience singleton for harnesses and tests. */
export const fluxFormatter = new FluxFormatter();

/** Unused VisibilityKey export guard for type documentation. */
export type FluxVisibilityKey = VisibilityKey;
