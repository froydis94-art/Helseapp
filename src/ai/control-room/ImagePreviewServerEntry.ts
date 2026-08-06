/**
 * Image Preview server entry — re-exports the paid-preview service surface.
 *
 * The Vercel API does not import this TypeScript file at runtime. Production
 * loads the prebundled CJS artifact `imagePreviewRuntime.bundle.cjs` built from
 * `ImagePreviewService.ts` via `npm run build:ai-image-preview-runtime`.
 */

export {
  ImagePreviewService,
  ImagePreviewServiceError,
  buildProvisionalPreviewEvidence,
  getImagePreviewSafetyStatus,
  validatePreviewSourceImage,
} from "./ImagePreviewService";
