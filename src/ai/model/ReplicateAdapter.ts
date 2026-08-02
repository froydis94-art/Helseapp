/**
 * ReplicateAdapter — STUB only.
 *
 * Maps PromptPackage → ImageGenerationRequest and satisfies ModelAdapter
 * without performing any network calls. Production Replicate / Flux wiring
 * remains in lib/replicate.js until an explicit cutover.
 */

import type { PromptPackage } from "../PromptBuilder";
import type {
  AspectRatio,
  GenerationQuality,
  GenerationStyle,
  ImageGenerationRequest,
} from "./ImageGenerationRequest";
import type { ImageGenerationResult } from "./ImageGenerationResult";
import type { ModelAdapter } from "./ModelAdapter";

/** Optional rendering hints when building a request from a PromptPackage. */
export interface ReplicateAdapterRequestOptions {
  aspectRatio?: AspectRatio;
  seed?: number;
  quality?: GenerationQuality;
  style?: GenerationStyle;
  providerOptions?: Record<string, unknown>;
}

const STUB_WARNING =
  "ReplicateAdapter is a stub; no image was generated and no Replicate API was called.";

/**
 * Future Replicate provider adapter (stub).
 * Does not fetch, does not read API keys, does not import lib/replicate.js.
 */
export class ReplicateAdapter implements ModelAdapter {
  readonly id = "replicate-stub";
  readonly provider = "replicate";

  /**
   * Translate a PromptPackage into a provider-agnostic ImageGenerationRequest.
   * Does not rewrite prompt text or inject Flux-specific syntax.
   */
  static toRequest(
    promptPackage: PromptPackage,
    options: ReplicateAdapterRequestOptions = {}
  ): ImageGenerationRequest {
    const request: ImageGenerationRequest = {
      promptPackage,
    };
    if (options.aspectRatio !== undefined) {
      request.aspectRatio = options.aspectRatio;
    }
    if (options.seed !== undefined) {
      request.seed = options.seed;
    }
    if (options.quality !== undefined) {
      request.quality = options.quality;
    }
    if (options.style !== undefined) {
      request.style = options.style;
    }
    if (options.providerOptions !== undefined) {
      request.providerOptions = { ...options.providerOptions };
    }
    return request;
  }

  /**
   * Stub generate — returns a failed-but-structured result with no network I/O.
   * Preserves request shape in metadata for integration harnesses.
   */
  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const started = Date.now();
    return {
      success: false,
      imageUrl: null,
      provider: this.provider,
      model: "replicate-stub",
      generationTimeMs: Math.max(0, Date.now() - started),
      warnings: [STUB_WARNING],
      metadata: {
        stub: true,
        adapterId: this.id,
        primaryPromptLength: request.promptPackage.primaryPrompt.length,
        negativePromptLength: request.promptPackage.negativePrompt.length,
        aspectRatio: request.aspectRatio ?? null,
        seed: request.seed ?? null,
        quality: request.quality ?? null,
        style: request.style ?? null,
      },
    };
  }
}
