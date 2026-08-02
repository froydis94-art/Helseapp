/**
 * Provider-agnostic image generation result.
 *
 * Returned by ModelAdapter implementations. Success does not imply
 * product acceptance — identity / anatomy validation happens downstream.
 */

/**
 * Normalized result from any image-model adapter.
 */
export interface ImageGenerationResult {
  /** Whether the adapter produced an image URL without internal failure. */
  success: boolean;

  /** Public or temporary URL of the generated image, or null on failure. */
  imageUrl: string | null;

  /** Logical provider name (e.g. "replicate", "openai", "google"). */
  provider: string;

  /** Model identifier as reported by the adapter (may be a stub label). */
  model: string;

  /** Wall-clock generation time in milliseconds. */
  generationTimeMs: number;

  /** Non-fatal notes for callers (stub warnings, degraded quality, etc.). */
  warnings: string[];

  /** Opaque metadata for tracing; must not contain secrets or raw image bytes. */
  metadata: Record<string, unknown>;
}
