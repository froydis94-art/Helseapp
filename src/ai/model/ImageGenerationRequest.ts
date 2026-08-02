/**
 * Provider-agnostic image generation request.
 *
 * Carries a PromptPackage plus optional rendering hints. Must not contain
 * provider-specific identifiers (prediction ids, model version hashes, etc.).
 */

import type { PromptPackage } from "../PromptBuilder";

/** Common aspect ratios supported across adapters. */
export type AspectRatio = "1:1" | "3:4" | "4:3" | "16:9" | "9:16";

/** Relative output quality preference (adapter maps to provider knobs later). */
export type GenerationQuality = "draft" | "standard" | "high";

/**
 * High-level style preference. Kept generic so adapters can translate —
 * not Flux/SDXL-specific prompt dialect.
 */
export type GenerationStyle = "photorealistic" | "natural";

/**
 * Input to {@link ModelAdapter.generate}.
 * Built from PromptPackage; never recalculates physiology or prompts.
 */
export interface ImageGenerationRequest {
  /** Model-independent prompt package from PromptBuilder. */
  promptPackage: PromptPackage;

  /** Desired output aspect ratio. */
  aspectRatio?: AspectRatio;

  /** Optional deterministic seed when the provider supports it. */
  seed?: number;

  /** Relative quality preference. */
  quality?: GenerationQuality;

  /** Relative style preference. */
  style?: GenerationStyle;

  /**
   * Opaque bag for future adapter-local options.
   * Must remain free of provider API identifiers and secrets.
   */
  providerOptions?: Record<string, unknown>;
}
