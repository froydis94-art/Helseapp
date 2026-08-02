/**
 * PromptBuilder — contract for turning a TransformationPlan into structured
 * prompt output. No prompt wording is implemented in this foundation task.
 */

import type { TransformationPlan } from "./TransformationPlan";

/** Structured prompt bundle (empty strings until a later sprint). */
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
 * Contract: accept a plan (and optional extras), return structured prompt parts.
 * Implementations must not call image models.
 */
export interface PromptBuilder {
  build(plan: TransformationPlan, extras?: Record<string, unknown>): StructuredPromptOutput;
}

/**
 * Stub PromptBuilder — returns empty structured fields.
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
