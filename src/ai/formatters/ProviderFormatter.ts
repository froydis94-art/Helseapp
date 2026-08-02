/**
 * ProviderFormatter contracts — translate provider-neutral RenderPlan into
 * provider-compatible, transport-ready formatted request content.
 *
 * Foundation only: no network, secrets, model IDs, or production wiring.
 */

import type { PromptPackage } from "../PromptBuilder";
import type {
  AspectRatio,
  GenerationQuality,
  GenerationStyle,
  ImageGenerationRequest,
} from "../model/ImageGenerationRequest";
import type { RenderPlan } from "../render/RenderPlan";

export type ProviderFamily =
  | "flux"
  | "gpt_image"
  | "imagen"
  | "generic";

export type FormatterCapability =
  | "negative_prompt"
  | "aspect_ratio"
  | "seed"
  | "quality"
  | "style"
  | "source_image_edit"
  | "identity_preservation"
  | "structured_instructions";

export interface FormatterWarning {
  code:
    | "unsupported_capability"
    | "degraded_negative_prompt"
    | "degraded_structure"
    | "unsupported_aspect_ratio"
    | "unsupported_style"
    | "unsupported_quality"
    | "provider_limitation";

  message: string;
}

export interface FormattedImageRequest {
  providerFamily: ProviderFamily;

  prompt: string;
  negativePrompt?: string;

  sourceOperation: "edit_source_image";

  aspectRatio?: string;
  seed?: number;
  quality?: "standard" | "high";
  style?: "source_faithful" | "natural_athletic" | "documentary_fitness";

  warnings: FormatterWarning[];

  metadata: {
    formatterName: string;
    formatterVersion: string;
    renderPlanSchemaVersion: number;
    renderPlanRulesVersion: string;
    transformationRulesVersion: string;
    visualDirectionRulesVersion: string;
    estimateReliability: string;
  };
}

export interface FormatterOptions {
  aspectRatio?: string;
  seed?: number;
  quality?: "standard" | "high";
  styleOverride?:
    | "source_faithful"
    | "natural_athletic"
    | "documentary_fitness";
}

export interface ProviderFormatter {
  readonly name: string;
  readonly version: string;
  readonly providerFamily: ProviderFamily;
  readonly capabilities: readonly FormatterCapability[];

  format(
    renderPlan: RenderPlan,
    options?: FormatterOptions
  ): FormattedImageRequest;
}

export interface FormattedRequestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Aspect ratios accepted by FluxFormatter option validation. */
export const SUPPORTED_FORMATTER_ASPECT_RATIOS = [
  "1:1",
  "4:5",
  "3:4",
  "9:16",
  "16:9",
] as const;

const PROMPT_SECTIONS = [
  "SOURCE",
  "IDENTITY",
  "SCENE",
  "TRANSFORM",
  "ANATOMY",
  "REALISM",
] as const;

const INTERNAL_ENUM_KEYS = [
  "source_faithful",
  "natural_athletic",
  "documentary_fitness",
  "restrained",
  "pronounced",
  "preserve_exactly",
  "preserve_with_natural_upright_emphasis",
  "slightly_defined",
  "whole_body_recomposition",
  "fat_reduction",
  "fat_increase",
  "muscle_development",
  "waist_change",
  "regional_change",
] as const;

const FORBIDDEN_PROMPT_MARKERS = [
  "REPLICATE_API_TOKEN",
  "Authorization:",
  "Bearer",
  "api.try",
  "api.replicate",
  "data:image/",
  "prompt_strength",
  "num_inference_steps",
  "denoise",
  "model_version",
  "version hash",
] as const;

const BASE64_LIKE =
  /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]{40,}/i;
const URL_LIKE = /https?:\/\/|wss?:\/\//i;
const API_KEY_LIKE =
  /\b(sk-[A-Za-z0-9]{10,}|r8_[A-Za-z0-9]{10,}|api[_-]?key\s*[:=])/i;

const ADAPTER_ASPECT_RATIOS = new Set<AspectRatio>([
  "1:1",
  "3:4",
  "4:3",
  "16:9",
  "9:16",
]);

function isSupportedFormatterAspectRatio(value: string): boolean {
  return (SUPPORTED_FORMATTER_ASPECT_RATIOS as readonly string[]).includes(
    value
  );
}

function mapStyleToGenerationStyle(
  style: FormattedImageRequest["style"]
): GenerationStyle {
  if (style === "documentary_fitness") return "photorealistic";
  return "natural";
}

/**
 * Compatibility bridge: FormattedImageRequest → ImageGenerationRequest.
 * Builds a PromptPackage from formatter output without network or secrets.
 * Does not redesign ImageGenerationRequest fields.
 */
export function toImageGenerationRequest(
  formatted: FormattedImageRequest
): ImageGenerationRequest {
  const promptPackage: PromptPackage = {
    primaryPrompt: formatted.prompt,
    negativePrompt: formatted.negativePrompt ?? "",
    identityConstraints: [],
    anatomyConstraints: [],
    transformationInstructions: [],
    metadata: {
      rulesVersion: formatted.metadata.transformationRulesVersion,
      visualIntensity: "",
      estimateReliability: formatted.metadata.estimateReliability,
    },
  };

  const request: ImageGenerationRequest = {
    promptPackage,
    providerOptions: {
      formatterName: formatted.metadata.formatterName,
      formatterVersion: formatted.metadata.formatterVersion,
      providerFamily: formatted.providerFamily,
      sourceOperation: formatted.sourceOperation,
      formattedStyle: formatted.style,
      formatterWarnings: formatted.warnings,
    },
  };

  if (
    formatted.aspectRatio !== undefined &&
    ADAPTER_ASPECT_RATIOS.has(formatted.aspectRatio as AspectRatio)
  ) {
    request.aspectRatio = formatted.aspectRatio as AspectRatio;
  } else if (formatted.aspectRatio !== undefined) {
    request.providerOptions = {
      ...request.providerOptions,
      formattedAspectRatio: formatted.aspectRatio,
    };
  }

  if (formatted.seed !== undefined) {
    request.seed = formatted.seed;
  }

  if (formatted.quality !== undefined) {
    request.quality = formatted.quality as GenerationQuality;
  }

  if (formatted.style !== undefined) {
    request.style = mapStyleToGenerationStyle(formatted.style);
  }

  return request;
}

/**
 * Pure validation of a FormattedImageRequest.
 * Does not call providers or mutate the request.
 */
export function validateFormattedImageRequest(
  request: FormattedImageRequest
): FormattedRequestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const families: ProviderFamily[] = [
    "flux",
    "gpt_image",
    "imagen",
    "generic",
  ];
  if (!families.includes(request.providerFamily)) {
    errors.push("providerFamily is missing or invalid");
  }

  if (typeof request.prompt !== "string" || request.prompt.trim() === "") {
    errors.push("prompt must be a non-empty string");
  }

  if (request.sourceOperation !== "edit_source_image") {
    errors.push('sourceOperation must be "edit_source_image"');
  }

  const meta = request.metadata;
  if (
    meta == null ||
    typeof meta.formatterName !== "string" ||
    meta.formatterName.trim() === "" ||
    typeof meta.formatterVersion !== "string" ||
    meta.formatterVersion.trim() === "" ||
    typeof meta.renderPlanSchemaVersion !== "number" ||
    typeof meta.renderPlanRulesVersion !== "string" ||
    meta.renderPlanRulesVersion.trim() === "" ||
    typeof meta.transformationRulesVersion !== "string" ||
    meta.transformationRulesVersion.trim() === "" ||
    typeof meta.visualDirectionRulesVersion !== "string" ||
    meta.visualDirectionRulesVersion.trim() === "" ||
    typeof meta.estimateReliability !== "string" ||
    meta.estimateReliability.trim() === ""
  ) {
    errors.push("metadata fields are incomplete");
  }

  if (!Array.isArray(request.warnings)) {
    errors.push("warnings must be an array");
  } else {
    const validCodes = new Set([
      "unsupported_capability",
      "degraded_negative_prompt",
      "degraded_structure",
      "unsupported_aspect_ratio",
      "unsupported_style",
      "unsupported_quality",
      "provider_limitation",
    ]);
    for (const warning of request.warnings) {
      if (warning == null || !validCodes.has(warning.code)) {
        errors.push("warning has invalid code");
      }
      if (
        warning == null ||
        typeof warning.message !== "string" ||
        warning.message.trim() === ""
      ) {
        errors.push("warning message must be non-empty");
      }
    }
  }

  if (request.seed !== undefined) {
    if (
      typeof request.seed !== "number" ||
      !Number.isFinite(request.seed) ||
      !Number.isInteger(request.seed) ||
      request.seed < 0
    ) {
      errors.push("seed must be a finite non-negative integer when present");
    }
  }

  if (request.aspectRatio !== undefined) {
    if (!isSupportedFormatterAspectRatio(request.aspectRatio)) {
      errors.push("aspectRatio is unsupported when present");
    }
  }

  const prompt = request.prompt ?? "";
  for (const section of PROMPT_SECTIONS) {
    if (!prompt.includes(section)) {
      errors.push(`prompt missing section ${section}`);
    }
  }

  const scanTargets = [
    prompt,
    request.negativePrompt ?? "",
    JSON.stringify(request.metadata ?? {}),
  ].join("\n");

  if (BASE64_LIKE.test(scanTargets) || /data:image\//i.test(scanTargets)) {
    errors.push("Base64-like content is forbidden");
  }
  if (URL_LIKE.test(scanTargets)) {
    errors.push("URL-like content is forbidden");
  }
  if (API_KEY_LIKE.test(scanTargets)) {
    errors.push("API-key-like content is forbidden");
  }

  for (const marker of FORBIDDEN_PROMPT_MARKERS) {
    if (scanTargets.toLowerCase().includes(marker.toLowerCase())) {
      errors.push(`forbidden transport/provider marker: ${marker}`);
    }
  }

  for (const key of INTERNAL_ENUM_KEYS) {
    const re = new RegExp(`\\b${key}\\b`);
    if (re.test(prompt)) {
      errors.push(`internal enum key leaked into prompt: ${key}`);
    }
  }

  const forbiddenFields = [
    "apiKey",
    "api_key",
    "authorization",
    "headers",
    "timeout",
    "fetch",
    "imageUrl",
    "base64",
    "modelId",
    "model_id",
    "versionHash",
  ];
  const rawKeys = Object.keys(request as unknown as Record<string, unknown>);
  for (const field of forbiddenFields) {
    if (rawKeys.includes(field)) {
      errors.push(`forbidden transport field present: ${field}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
