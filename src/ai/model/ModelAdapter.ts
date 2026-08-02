/**
 * ModelAdapter — contract for provider-independent image generation.
 *
 * Engine and PromptBuilder never call providers directly. Adapters translate
 * ImageGenerationRequest into provider calls (future) and normalize results.
 *
 * This file defines the interface only — no network, no API keys, no Flux logic.
 */

import type { ImageGenerationRequest } from "./ImageGenerationRequest";
import type { ImageGenerationResult } from "./ImageGenerationResult";

/**
 * Pluggable image-model boundary.
 * Implementations must not recalculate TransformationPlan or PromptPackage content.
 */
export interface ModelAdapter {
  /** Stable registry key (e.g. "replicate-stub"). */
  readonly id: string;

  /** Logical provider family (e.g. "replicate"). */
  readonly provider: string;

  /**
   * Generate an image from a provider-agnostic request.
   * Stub adapters may resolve without network I/O.
   */
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}
