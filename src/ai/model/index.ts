/**
 * Model adapter barrel — provider-independent image generation boundary.
 *
 * Architecture: BodyProfile → Goal → Engine → Plan → PromptBuilder → ModelAdapter → providers.
 * Not wired to production UI or lib/replicate.js.
 */

export type {
  AspectRatio,
  GenerationQuality,
  GenerationStyle,
  ImageGenerationRequest,
} from "./ImageGenerationRequest";

export type { ImageGenerationResult } from "./ImageGenerationResult";

export type { ModelAdapter } from "./ModelAdapter";

export {
  ReplicateAdapter,
  type ReplicateAdapterRequestOptions,
} from "./ReplicateAdapter";

export { ModelRegistry } from "./ModelRegistry";
