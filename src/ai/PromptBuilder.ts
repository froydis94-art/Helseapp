/**
 * PromptBuilder — stub API for future image / identity prompt assembly.
 *
 * Intentionally empty: methods accept typed context and return empty strings.
 * No prompt logic, no Replicate/Flux, no I/O. Safe to import without side effects.
 */

import type { BodyProfile } from "./BodyProfile";
import type { TransformationGoal } from "./TransformationGoal";
import type { TransformationPlan } from "./TransformationPlan";

/**
 * Optional context bag for future prompt composition.
 * All fields optional so callers can pass partial state during integration.
 */
export interface PromptBuilderContext {
  /** Current body profile. */
  profile?: BodyProfile;

  /** Desired transformation goal. */
  goal?: TransformationGoal;

  /** Engine output plan (deltas, intensity, warnings). */
  plan?: TransformationPlan;
}

/**
 * Placeholder prompt builder.
 *
 * When wired later, these methods should compose strings for generation
 * pipelines. Today they only reserve the public surface area.
 */
export class PromptBuilder {
  /**
   * Build the main positive generation prompt.
   * @returns Empty string until implemented.
   */
  buildPrompt(_context?: PromptBuilderContext): string {
    return "";
  }

  /**
   * Build the negative prompt (artifacts / unwanted traits to avoid).
   * @returns Empty string until implemented.
   */
  buildNegativePrompt(_context?: PromptBuilderContext): string {
    return "";
  }

  /**
   * Build identity-preservation instructions (face / distinguishing traits).
   * @returns Empty string until implemented.
   */
  buildIdentityPrompt(_context?: PromptBuilderContext): string {
    return "";
  }

  /**
   * Build lighting direction for the scene.
   * @returns Empty string until implemented.
   */
  buildLightingPrompt(_context?: PromptBuilderContext): string {
    return "";
  }

  /**
   * Build camera / framing instructions.
   * @returns Empty string until implemented.
   */
  buildCameraPrompt(_context?: PromptBuilderContext): string {
    return "";
  }
}
