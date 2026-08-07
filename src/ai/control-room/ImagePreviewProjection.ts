/**
 * Internal image-preview projection + sanitizer.
 *
 * Allows exactly one HTTPS generated-image URL. Source image bytes, tokens,
 * and environment values remain forbidden.
 */

import type { AiOsRuntimeResult, AiOsRuntimeStage } from "../runtime/AiOsRuntimeTypes";
import type { FormattedImageRequest } from "../formatters/ProviderFormatter";
import type { ValidationDecision } from "../validation-result/ValidationDecision";
import type { ReplicateTransportResult } from "../transport/ReplicateTransportTypes";
import {
  IMAGE_PREVIEW_FORBIDDEN_CONTENT_ERROR,
  IMAGE_PREVIEW_INPUT_ASSURANCES,
  IMAGE_PREVIEW_INTENDED_CONTEXT,
  IMAGE_PREVIEW_SAFETY_STATUS,
  IMAGE_PREVIEW_SCHEMA_VERSION,
  type ImagePreviewInputAssurances,
  type ImagePreviewMimeType,
  type ImagePreviewResult,
  type ImagePreviewScenarioId,
  type ImagePreviewStageView,
  type ImagePreviewValidationSummary,
  type PromptIsolationSummary,
} from "./ImagePreviewTypes";
import {
  DEFAULT_PROMPT_ISOLATION_VARIANT,
  buildPromptIsolationSummary,
} from "./PromptIsolationVariants";
import type {
  FormatterComparison,
  GenerationDiagnostics,
  PipelineSnapshot,
} from "./FormatterComparisonDiagnostics";

const STAGE_LABELS: Record<string, string> = {
  input_validation: "Input validation",
  transformation: "Transformation",
  visual_direction: "Visual direction",
  render_plan: "Render plan",
  render_plan_validation: "Render plan validation",
  provider_formatting: "Provider formatting",
  formatted_request_validation: "Formatted request validation",
  transport: "Transport",
  awaiting_validation: "Awaiting validation",
  result_validation: "Result validation",
  retry_orchestration: "Retry orchestration",
  completed: "Completed",
};

const FORBIDDEN_STRING_PATTERNS: RegExp[] = [
  /data:image\//i,
  /\bAuthorization\b/i,
  /\bBearer\b/i,
  /REPLICATE_API_TOKEN/i,
  /\br8_[A-Za-z0-9]+/i,
  /\bsk-[A-Za-z0-9]+/i,
  /AI_OS_CONTROL_ROOM_ACCESS_KEY/i,
  /AI_OS_IMAGE_PREVIEW_/i,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /\bat\s+\S+\s+\([^)]+\.\w+:\d+:\d+\)/i,
  /[A-Za-z]:\\[^\s]+/,
  /\/home\/[^\s]+/,
  /\/Users\/[^\s]+/,
];

const FORBIDDEN_KEYS = new Set([
  "sourceimage",
  "transportresult",
  "validationevidence",
  "retrydecision",
  "retrystate",
  "healthpayload",
  "heartrate",
  "hrv",
  "sleepscore",
  "terrauserid",
  "wearable",
  "accesskey",
  "access_key",
  "authorization",
  "replicate_api_token",
  "apikey",
  "api_key",
  "apitoken",
]);

export class ImagePreviewProjectionError extends Error {
  readonly code: "runtime_failure" | "unsafe_result" | "provider_failure";

  constructor(
    message: string,
    code: "runtime_failure" | "unsafe_result" | "provider_failure" = "runtime_failure"
  ) {
    super(message);
    this.name = "ImagePreviewProjectionError";
    this.code = code;
  }
}

function isAllowedHttpsImageUrl(url: string): boolean {
  if (typeof url !== "string" || !url.startsWith("https://")) return false;
  if (url.startsWith("http://")) return false;
  if (/data:image\//i.test(url)) return false;
  if (/[?#]/.test(url) && /token|auth|key|bearer/i.test(url)) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    if (u.hash) return false;
    // Reject Replicate API polling URLs — only delivery URLs.
    if (
      u.hostname === "api.replicate.com" &&
      u.pathname.startsWith("/v1/predictions/")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function projectStages(runtimeResult: AiOsRuntimeResult): ImagePreviewStageView[] {
  return runtimeResult.trace.stages.map((stage) => ({
    stage: stage.stage,
    label: STAGE_LABELS[stage.stage] ?? stage.stage,
    success: stage.success,
    durationMs: Math.max(0, stage.durationMs),
    warningsCount: stage.warnings.length,
    errorsCount: stage.errors.length,
  }));
}

function projectVersions(
  runtimeResult: AiOsRuntimeResult
): Record<string, string | null> {
  const source = runtimeResult.trace.versions;
  return {
    runtimeRulesVersion: runtimeResult.trace.rulesVersion ?? null,
    transformationRulesVersion: source.transformationRulesVersion ?? null,
    visualDirectionRulesVersion: source.visualDirectionRulesVersion ?? null,
    renderPlanRulesVersion: source.renderPlanRulesVersion ?? null,
    formatterName: source.formatterName ?? null,
    formatterVersion: source.formatterVersion ?? null,
    transportAdapterId: source.transportAdapterId ?? null,
    resultValidatorRulesVersion: source.resultValidatorRulesVersion ?? null,
    retryOrchestratorRulesVersion: source.retryOrchestratorRulesVersion ?? null,
  };
}

function projectValidation(
  decision: ValidationDecision | null | undefined
): ImagePreviewValidationSummary | null {
  if (decision == null) return null;
  const findings = decision.findings ?? [];
  const rejectionReasons = findings
    .filter((f) => f.severity === "critical")
    .map((f) => f.message)
    .filter((m) => typeof m === "string" && m.length > 0)
    .slice(0, 12);
  const warnings = findings
    .filter((f) => f.severity === "warning" || f.severity === "info")
    .map((f) => f.message)
    .filter((m) => typeof m === "string" && m.length > 0)
    .slice(0, 20);
  return {
    accepted: decision.outcome === "accept",
    decision: decision.outcome,
    warnings,
    rejectionReasons,
  };
}

function projectProvider(
  transport: ReplicateTransportResult | undefined,
  model: string
): ImagePreviewResult["provider"] {
  if (transport == null) return null;
  if (transport.success) {
    return {
      providerFamily: "flux",
      model: transport.model || model,
      predictionId: transport.predictionId,
      status: transport.status,
      durationMs: Math.max(0, transport.generationTimeMs),
    };
  }
  return {
    providerFamily: "flux",
    model: transport.model || model,
    ...(transport.predictionId ? { predictionId: transport.predictionId } : {}),
    status: transport.status ?? "failed",
    durationMs: Math.max(0, transport.generationTimeMs),
  };
}

function isExactInputAssurances(
  value: ImagePreviewInputAssurances | null | undefined
): value is ImagePreviewInputAssurances {
  return (
    value != null &&
    value.adultConfirmed === true &&
    value.consentConfirmed === true &&
    value.billingConfirmed === true &&
    value.intendedContext === IMAGE_PREVIEW_INTENDED_CONTEXT
  );
}

export interface ImagePreviewProjectionInput {
  scenarioId: ImagePreviewScenarioId;
  requestId: string;
  sourceMimeType: ImagePreviewMimeType;
  sourceByteLength: number;
  runtimeResult: AiOsRuntimeResult;
  validationDecision?: ValidationDecision | null;
  model: string;
  inputAssurances: ImagePreviewInputAssurances;
  promptIsolation: PromptIsolationSummary;
  extraWarnings?: string[];
  formatterComparison?: FormatterComparison | null;
  generationDiagnostics?: GenerationDiagnostics | null;
  pipelineSnapshot?: PipelineSnapshot | null;
}

/**
 * Project a completed preview runtime cycle into the safe developer view model.
 */
export function projectImagePreviewResult(
  input: ImagePreviewProjectionInput
): ImagePreviewResult {
  const { runtimeResult } = input;
  const transport = runtimeResult.artifacts.transportResult;
  const formatted = runtimeResult.artifacts.formattedRequest as
    | FormattedImageRequest
    | undefined;

  let generatedUrl: string | null = null;
  if (transport?.success && typeof transport.imageUrl === "string") {
    if (!isAllowedHttpsImageUrl(transport.imageUrl)) {
      throw new ImagePreviewProjectionError(
        "Generated image URL failed safety checks.",
        "unsafe_result"
      );
    }
    generatedUrl = transport.imageUrl;
  }

  const validation =
    input.validationDecision !== undefined
      ? projectValidation(input.validationDecision)
      : projectValidation(runtimeResult.artifacts.validationDecision);

  const warnings = [
    ...runtimeResult.warnings,
    ...(input.extraWarnings ?? []),
  ].slice(0, 40);

  let artifacts: ImagePreviewResult["artifacts"] = null;
  if (
    runtimeResult.artifacts.transformationPlan != null &&
    runtimeResult.artifacts.visualDirection != null &&
    runtimeResult.artifacts.renderPlan != null &&
    formatted != null
  ) {
    artifacts = {
      transformationPlan: structuredClone(runtimeResult.artifacts.transformationPlan),
      visualDirection: structuredClone(runtimeResult.artifacts.visualDirection),
      renderPlan: structuredClone(runtimeResult.artifacts.renderPlan),
      formattedRequestSummary: {
        formatterName: formatted.metadata.formatterName,
        formatterVersion: formatted.metadata.formatterVersion,
        providerFamily: formatted.providerFamily,
        model: input.model,
        ...(formatted.aspectRatio !== undefined
          ? { aspectRatio: formatted.aspectRatio }
          : {}),
        positivePrompt: formatted.prompt,
        negativePrompt: formatted.negativePrompt ?? "",
      },
    };
  }

  const assurancesOk = isExactInputAssurances(input.inputAssurances);
  const success =
    runtimeResult.success === true &&
    generatedUrl != null &&
    (validation == null || validation.accepted === true) &&
    assurancesOk;

  return {
    schemaVersion: IMAGE_PREVIEW_SCHEMA_VERSION,
    success,
    scenarioId: input.scenarioId,
    requestId: input.requestId,
    source: {
      mimeType: input.sourceMimeType,
      byteLength: input.sourceByteLength,
    },
    generatedImage:
      generatedUrl != null
        ? { url: generatedUrl, expiresOrIsTemporary: true }
        : null,
    runtime: {
      mode: runtimeResult.mode,
      terminalOutcome: runtimeResult.terminalOutcome,
      traceId: runtimeResult.trace.traceId,
      stages: projectStages(runtimeResult),
      versions: projectVersions(runtimeResult),
    },
    artifacts,
    provider: projectProvider(transport, input.model),
    validation,
    safety: { ...IMAGE_PREVIEW_SAFETY_STATUS },
    inputAssurances: assurancesOk
      ? { ...IMAGE_PREVIEW_INPUT_ASSURANCES }
      : { ...input.inputAssurances },
    promptIsolation: structuredClone(input.promptIsolation),
    formatterComparison:
      input.formatterComparison == null
        ? null
        : structuredClone(input.formatterComparison),
    generationDiagnostics:
      input.generationDiagnostics == null
        ? null
        : structuredClone(input.generationDiagnostics),
    pipelineSnapshot:
      input.pipelineSnapshot == null
        ? null
        : structuredClone(input.pipelineSnapshot),
    warnings,
    errors: [...runtimeResult.errors].slice(0, 20),
  };
}

function walkForbidden(
  value: unknown,
  path: string[],
  allowGeneratedUrlPath: boolean
): string | null {
  if (value == null) return null;

  if (typeof value === "string") {
    const joined = path.join(".");
    if (
      allowGeneratedUrlPath &&
      joined === "generatedImage.url" &&
      isAllowedHttpsImageUrl(value)
    ) {
      return null;
    }
    if (/^https?:\/\//i.test(value) && joined !== "generatedImage.url") {
      return `Forbidden URL at ${joined || "(root)"}`;
    }
    for (const pattern of FORBIDDEN_STRING_PATTERNS) {
      if (pattern.test(value)) {
        return `Forbidden content at ${joined || "(root)"}`;
      }
    }
    // Long base64-like blobs
    if (value.length > 512 && /^[A-Za-z0-9+/=\s]+$/.test(value.slice(0, 80))) {
      return `Forbidden binary-like content at ${joined || "(root)"}`;
    }
    return null;
  }

  if (typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = walkForbidden(value[i], [...path, String(i)], allowGeneratedUrlPath);
      if (hit) return hit;
    }
    return null;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (FORBIDDEN_KEYS.has(normalized)) {
      return `Forbidden key ${key}`;
    }
    const hit = walkForbidden(child, [...path, key], allowGeneratedUrlPath);
    if (hit) return hit;
  }
  return null;
}

export interface ImagePreviewValidationOutcome {
  valid: boolean;
  errors: string[];
}

export function validateImagePreviewProjection(
  result: ImagePreviewResult
): ImagePreviewValidationOutcome {
  const errors: string[] = [];

  if (result.schemaVersion !== IMAGE_PREVIEW_SCHEMA_VERSION) {
    errors.push("Invalid schema version.");
  }

  const safety = result.safety;
  if (
    safety == null ||
    safety.internalOnly !== true ||
    safety.explicitBillingConfirmation !== true ||
    safety.requestCapApplied !== true ||
    safety.sourceImagePersisted !== false ||
    safety.generatedImagePersistedByHelseApp !== false ||
    safety.legacyProductionChanged !== false ||
    safety.publicCutoverEnabled !== false
  ) {
    errors.push("Safety invariants are not exact.");
  }

  if (!isExactInputAssurances(result.inputAssurances)) {
    errors.push("Input assurances are missing or not exact.");
  }

  if (result.success === true && !isExactInputAssurances(result.inputAssurances)) {
    errors.push("Successful projection requires exact input assurances.");
  }

  if (
    result.promptIsolation == null ||
    typeof result.promptIsolation !== "object" ||
    typeof result.promptIsolation.variant !== "string" ||
    result.promptIsolation.sameProviderModelTransport !== true
  ) {
    errors.push("Prompt isolation summary is missing or invalid.");
  }

  if (result.generatedImage != null) {
    if (result.generatedImage.expiresOrIsTemporary !== true) {
      errors.push("Generated image must be marked temporary.");
    }
    if (!isAllowedHttpsImageUrl(result.generatedImage.url)) {
      errors.push("Generated image URL is not an allowed HTTPS URL.");
    }
  }

  const forbidden = walkForbidden(result, [], true);
  if (forbidden) {
    errors.push(forbidden);
  }

  try {
    JSON.stringify(result);
  } catch {
    errors.push("Projection is not JSON serializable.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Deep-clone and invalidate unsafe projections while preserving request id.
 */
export function sanitizeImagePreviewProjection(
  result: ImagePreviewResult
): ImagePreviewResult {
  const clone = structuredClone(result) as ImagePreviewResult;
  const check = validateImagePreviewProjection(clone);
  if (check.valid) {
    return clone;
  }

  const fallbackIsolation =
    clone.promptIsolation ??
    buildPromptIsolationSummary({
      variant: DEFAULT_PROMPT_ISOLATION_VARIANT,
      formatterName: null,
      formatterVersion: null,
      model: "",
      requestId: clone.requestId,
      seed: null,
    });

  return {
    schemaVersion: IMAGE_PREVIEW_SCHEMA_VERSION,
    success: false,
    scenarioId: clone.scenarioId,
    requestId: clone.requestId,
    source: {
      mimeType: clone.source.mimeType,
      byteLength: clone.source.byteLength,
    },
    generatedImage: null,
    runtime: {
      mode: clone.runtime.mode,
      terminalOutcome: "invalid_runtime_state",
      traceId: clone.runtime.traceId,
      stages: [],
      versions: {},
    },
    artifacts: null,
    provider: null,
    validation: null,
    safety: { ...IMAGE_PREVIEW_SAFETY_STATUS },
    inputAssurances: { ...IMAGE_PREVIEW_INPUT_ASSURANCES },
    promptIsolation: fallbackIsolation,
    formatterComparison: null,
    generationDiagnostics: null,
    pipelineSnapshot: null,
    warnings: [],
    errors: [IMAGE_PREVIEW_FORBIDDEN_CONTENT_ERROR],
  };
}

/** Exported for stage label coverage in tests. */
export function previewStageLabel(stage: AiOsRuntimeStage | string): string {
  return STAGE_LABELS[stage] ?? String(stage);
}
