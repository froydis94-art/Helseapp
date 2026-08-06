/**
 * ImagePreviewService — one authorized AI OS v2 live preview request.
 *
 * Uses AiOsRuntime mode `transport_mock` with an injected real (or fake)
 * ReplicateTransportAdapter. Exactly one provider call. No automatic retry.
 */

import {
  AiOsRuntime,
  createAiOsRuntimeDependencies,
} from "../runtime";
import {
  DEFAULT_MAX_POLL_ATTEMPTS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_REPLICATE_API_BASE_URL,
  DEFAULT_REPLICATE_TRANSPORT_MODEL,
  ReplicateTransportAdapter,
  isValidReplicateTransportModel,
  type ReplicateTransportConfig,
  type ReplicateTransportDependencies,
  type ReplicateTransportFailure,
  type ReplicateTransportResult,
} from "../transport";
import {
  RESULT_VALIDATOR_RULES_VERSION,
  VALIDATION_EVIDENCE_SCHEMA_VERSION,
  evaluateCandidate,
  type ValidationDecision,
  type ValidationEvidence,
} from "../validation-result";

/** Preview create must absorb large data-URI uploads from serverless regions. */
const PREVIEW_CREATE_TIMEOUT_MS = 60_000;
/** Allow one Flux create+poll cycle inside the Vercel maxDuration budget. */
const PREVIEW_TOTAL_TIMEOUT_MS = 120_000;
import { getControlRoomScenario } from "./ControlRoomFixtures";
import {
  ImagePreviewProjectionError,
  projectImagePreviewResult,
  sanitizeImagePreviewProjection,
  validateImagePreviewProjection,
} from "./ImagePreviewProjection";
import {
  IMAGE_PREVIEW_ACCEPTED_MIME,
  IMAGE_PREVIEW_FORBIDDEN_CONTENT_ERROR,
  IMAGE_PREVIEW_MAX_BYTES,
  IMAGE_PREVIEW_SAFETY_STATUS,
  type ImagePreviewMimeType,
  type ImagePreviewResult,
  type ImagePreviewScenarioId,
} from "./ImagePreviewTypes";

export class ImagePreviewServiceError extends Error {
  readonly code:
    | "scenario_not_found"
    | "invalid_request"
    | "invalid_image"
    | "image_too_large"
    | "billing_confirmation_required"
    | "runtime_failure"
    | "provider_failure"
    | "provider_timeout"
    | "provider_invalid_input"
    | "provider_auth_error"
    | "provider_http_error"
    | "provider_safety_blocked"
    | "provider_invalid_response"
    | "provider_network_error"
    | "validation_rejected"
    | "unsafe_result"
    | "missing_token";

  constructor(
    code: ImagePreviewServiceError["code"],
    message: string
  ) {
    super(message);
    this.name = "ImagePreviewServiceError";
    this.code = code;
  }
}

export interface ImagePreviewValidatedSource {
  dataUri: string;
  mimeType: ImagePreviewMimeType;
  byteLength: number;
}

export interface ImagePreviewRunInput {
  scenarioId: string;
  billingConfirmed: unknown;
  sourceImageDataUri: unknown;
  requestId?: string;
}

export interface ImagePreviewServiceDependencies {
  transportAdapter?: ReplicateTransportAdapter;
  transportDependencies?: Partial<ReplicateTransportDependencies>;
  now?: () => number;
  env?: Record<string, string | undefined>;
  /** Injectable for tests — defaults to provisional preview evidence. */
  buildValidationEvidence?: (
    predictionId: string,
    model: string
  ) => ValidationEvidence;
  evaluateCandidateFn?: typeof evaluateCandidate;
}

const DATA_URI_RE =
  /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i;

function normalizeMime(raw: string): ImagePreviewMimeType | null {
  const lower = raw.toLowerCase();
  if (lower === "image/jpg" || lower === "image/jpeg") return "image/jpeg";
  if (lower === "image/png") return "image/png";
  if (lower === "image/webp") return "image/webp";
  return null;
}

function detectMimeFromMagic(bytes: Uint8Array): ImagePreviewMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Validate a single data-URI source image. Never logs the payload.
 */
export function validatePreviewSourceImage(
  raw: unknown
): ImagePreviewValidatedSource {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Source image is required."
    );
  }

  const value = raw.trim();

  if (/^https?:\/\//i.test(value)) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Remote image URLs are not accepted."
    );
  }

  if (/image\/svg/i.test(value.slice(0, 80))) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "SVG images are not accepted."
    );
  }

  if (/image\/gif/i.test(value.slice(0, 80))) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "GIF images are not accepted."
    );
  }

  if (/image\/heic|image\/heif|application\/pdf|video\//i.test(value.slice(0, 80))) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Unsupported image type."
    );
  }

  const match = DATA_URI_RE.exec(value);
  if (!match) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Malformed image data URI."
    );
  }

  const declaredMime = normalizeMime(match[1]!);
  if (declaredMime == null || !IMAGE_PREVIEW_ACCEPTED_MIME.includes(declaredMime)) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Unsupported image MIME type."
    );
  }

  const b64 = match[2]!.replace(/\s+/g, "");
  if (!b64) {
    throw new ImagePreviewServiceError("invalid_image", "Empty image.");
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(b64, "base64");
  } catch {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Malformed Base64 image data."
    );
  }

  // Round-trip check: reject clearly malformed base64
  if (bytes.length === 0) {
    throw new ImagePreviewServiceError("invalid_image", "Empty image.");
  }
  const reencoded = bytes.toString("base64").replace(/=+$/, "");
  const normalizedInput = b64.replace(/=+$/, "");
  if (reencoded.length < Math.min(16, normalizedInput.length) * 0.5) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Malformed Base64 image data."
    );
  }

  if (bytes.length > IMAGE_PREVIEW_MAX_BYTES) {
    throw new ImagePreviewServiceError(
      "image_too_large",
      "Image exceeds the 5 MB limit."
    );
  }

  const magicMime = detectMimeFromMagic(bytes);
  if (magicMime == null) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Unrecognized image bytes."
    );
  }
  if (magicMime !== declaredMime) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Image MIME type does not match file contents."
    );
  }

  const canonicalUri = `data:${declaredMime};base64,${b64}`;
  return {
    dataUri: canonicalUri,
    mimeType: declaredMime,
    byteLength: bytes.length,
  };
}

function assertBillingConfirmed(value: unknown): asserts value is true {
  if (value !== true) {
    throw new ImagePreviewServiceError(
      "billing_confirmation_required",
      "Explicit billing confirmation is required."
    );
  }
}

function resolvePreviewModel(
  env: Record<string, string | undefined>
): string {
  const raw = env.AI_OS_IMAGE_PREVIEW_MODEL;
  if (
    typeof raw === "string" &&
    raw.length > 0 &&
    isValidReplicateTransportModel(raw)
  ) {
    return raw;
  }
  return DEFAULT_REPLICATE_TRANSPORT_MODEL;
}

function buildPreviewTransportConfig(
  env: Record<string, string | undefined>,
  model: string
): ReplicateTransportConfig {
  const tokenRaw = env.REPLICATE_API_TOKEN;
  const apiToken =
    typeof tokenRaw === "string" && tokenRaw.trim().length > 0
      ? tokenRaw.trim()
      : null;

  return {
    enabled: true,
    apiToken,
    apiBaseUrl: DEFAULT_REPLICATE_API_BASE_URL,
    model,
    createTimeoutMs: PREVIEW_CREATE_TIMEOUT_MS,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    totalTimeoutMs: PREVIEW_TOTAL_TIMEOUT_MS,
    maxPollAttempts: DEFAULT_MAX_POLL_ATTEMPTS,
  };
}

/**
 * Map transport failure codes to allowlisted preview error categories.
 * Never echoes provider payloads, tokens, or image bytes.
 */
function isProviderSafetyMessage(message: string): boolean {
  return /sensitive|E005|flagged|nsfw|safety/i.test(message);
}

export function mapTransportFailureToPreviewError(
  transport: ReplicateTransportFailure
): ImagePreviewServiceError {
  switch (transport.error.code) {
    case "missing_token":
    case "adapter_disabled":
      return new ImagePreviewServiceError(
        "missing_token",
        "Provider is not configured."
      );
    case "invalid_request":
    case "unsupported_source_image":
    case "provider_validation_error":
      return new ImagePreviewServiceError(
        "provider_invalid_input",
        "Provider rejected the request input."
      );
    case "provider_auth_error":
      return new ImagePreviewServiceError(
        "provider_auth_error",
        "Provider authentication failed."
      );
    case "request_timeout":
    case "polling_exhausted":
      return new ImagePreviewServiceError(
        "provider_timeout",
        "Provider request timed out."
      );
    case "provider_rate_limited":
    case "provider_unavailable":
      return new ImagePreviewServiceError(
        "provider_http_error",
        "Provider HTTP request failed."
      );
    case "provider_failed":
      if (isProviderSafetyMessage(transport.error.message)) {
        return new ImagePreviewServiceError(
          "provider_safety_blocked",
          "Provider safety filter blocked the request."
        );
      }
      return new ImagePreviewServiceError(
        "provider_failure",
        "Provider request failed."
      );
    case "invalid_provider_response":
      return new ImagePreviewServiceError(
        "provider_invalid_response",
        "Provider returned an unusable response."
      );
    case "unknown_transport_error":
      return new ImagePreviewServiceError(
        "provider_network_error",
        "Provider network request failed."
      );
    case "request_aborted":
    default:
      return new ImagePreviewServiceError(
        "provider_failure",
        "Provider request failed."
      );
  }
}

function isTransportFailure(
  transport: ReplicateTransportResult
): transport is ReplicateTransportFailure {
  return !transport.success;
}

/**
 * Provisional evidence for the internal preview lab until a vision adapter
 * exists. Scores sit at acceptance thresholds; Demand 018 adds real review.
 */
export function buildProvisionalPreviewEvidence(
  predictionId: string,
  model: string
): ValidationEvidence {
  const dims = [
    "identity",
    "anatomy",
    "plan_adherence",
    "photorealism",
    "pose_camera",
    "safety",
  ] as const;

  return {
    schemaVersion: VALIDATION_EVIDENCE_SCHEMA_VERSION,
    candidate: {
      candidateId: predictionId,
      provider: "replicate",
      model,
    },
    dimensions: dims.map((dimension) => ({
      dimension,
      score: dimension === "safety" ? 0.99 : 0.9,
      confidence: "medium" as const,
      source: "deterministic_fixture" as const,
      findings: [
        "Preview laboratory provisional evidence — real vision analysis deferred.",
      ],
      warnings: [],
    })),
    metadata: {
      validatorInputVersion: "1.0",
      transformationRulesVersion: "1.0",
      renderPlanRulesVersion: "1.0",
    },
  };
}

function createRequestId(now: () => number): string {
  const ts = now().toString(36);
  const rand = Math.floor(Math.random() * 1e9).toString(36);
  return `imgprev-${ts}-${rand}`;
}

export class ImagePreviewService {
  private readonly deps: ImagePreviewServiceDependencies;

  constructor(deps: ImagePreviewServiceDependencies = {}) {
    this.deps = deps;
  }

  async runPreview(input: ImagePreviewRunInput): Promise<ImagePreviewResult> {
    assertBillingConfirmed(input.billingConfirmed);

    const scenarioId = input.scenarioId;
    if (typeof scenarioId !== "string") {
      throw new ImagePreviewServiceError(
        "invalid_request",
        "Invalid request."
      );
    }

    const resolved = getControlRoomScenario(
      scenarioId as ImagePreviewScenarioId
    );
    if (!resolved) {
      throw new ImagePreviewServiceError(
        "scenario_not_found",
        "Scenario was not found."
      );
    }

    const source = validatePreviewSourceImage(input.sourceImageDataUri);
    const env = this.deps.env ?? process.env;
    const model = resolvePreviewModel(env);
    const now = this.deps.now ?? (() => Date.now());
    const requestId =
      typeof input.requestId === "string" && input.requestId.trim()
        ? input.requestId.trim()
        : createRequestId(now);

    let transportAdapter = this.deps.transportAdapter;
    if (transportAdapter == null) {
      const config = buildPreviewTransportConfig(env, model);
      if (config.apiToken == null) {
        throw new ImagePreviewServiceError(
          "missing_token",
          "Provider is not configured."
        );
      }
      transportAdapter = new ReplicateTransportAdapter(
        config,
        this.deps.transportDependencies
      );
    }

    const runtime = new AiOsRuntime(
      createAiOsRuntimeDependencies({
        transportAdapter,
        now,
      })
    );

    const runtimeInput = {
      mode: "transport_mock" as const,
      profile: resolved.runtimeInput.profile,
      goal: resolved.runtimeInput.goal,
      ...(resolved.runtimeInput.formatterOptions !== undefined
        ? { formatterOptions: resolved.runtimeInput.formatterOptions }
        : {}),
      sourceImage: {
        kind: "data_uri" as const,
        value: source.dataUri,
        contentType: source.mimeType,
      },
    };

    let runtimeResult;
    try {
      runtimeResult = await runtime.run(runtimeInput);
    } catch {
      throw new ImagePreviewServiceError(
        "runtime_failure",
        "AI OS preview runtime failed."
      );
    }

    const transport = runtimeResult.artifacts.transportResult;
    if (!transport) {
      throw new ImagePreviewServiceError(
        "provider_failure",
        "Provider request failed."
      );
    }
    if (isTransportFailure(transport)) {
      throw mapTransportFailureToPreviewError(transport);
    }

    // Exactly one transport call already performed by the runtime.
    // Do not auto-retry even if RetryOrchestrator suggests retry_required.

    const evidenceBuilder =
      this.deps.buildValidationEvidence ?? buildProvisionalPreviewEvidence;
    const evidence = evidenceBuilder(transport.predictionId, model);

    const evaluate =
      this.deps.evaluateCandidateFn ?? evaluateCandidate;

    let validationDecision: ValidationDecision;
    try {
      validationDecision = evaluate({
        evidence,
        renderPlan: runtimeResult.artifacts.renderPlan!,
        attempt: 1,
        maxAttempts: 1,
      });
    } catch {
      throw new ImagePreviewServiceError(
        "runtime_failure",
        "Result validation failed."
      );
    }

    // Attach validator version into a shallow copy of runtime versions for projection.
    runtimeResult = {
      ...runtimeResult,
      artifacts: {
        ...runtimeResult.artifacts,
        validationDecision,
      },
      trace: {
        ...runtimeResult.trace,
        versions: {
          ...runtimeResult.trace.versions,
          resultValidatorRulesVersion: RESULT_VALIDATOR_RULES_VERSION,
        },
        stages: [
          ...runtimeResult.trace.stages,
          {
            stage: "result_validation" as const,
            success: true,
            durationMs: 0,
            warnings: [],
            errors: [],
          },
        ],
      },
    };

    if (validationDecision.outcome !== "accept") {
      throw new ImagePreviewServiceError(
        "validation_rejected",
        "Validation rejected the candidate."
      );
    }

    let projected: ImagePreviewResult;
    try {
      projected = projectImagePreviewResult({
        scenarioId: resolved.summary.id,
        requestId,
        sourceMimeType: source.mimeType,
        sourceByteLength: source.byteLength,
        runtimeResult,
        validationDecision,
        model,
        extraWarnings: [
          "Preview laboratory: ResultValidator used provisional evidence; real vision analysis is deferred to Demand 018.",
          "No automatic retry was performed.",
        ],
      });
    } catch (error) {
      if (error instanceof ImagePreviewProjectionError) {
        throw new ImagePreviewServiceError(error.code, error.message);
      }
      throw new ImagePreviewServiceError(
        "runtime_failure",
        "Preview projection failed."
      );
    }

    const sanitized = sanitizeImagePreviewProjection(projected);
    const validation = validateImagePreviewProjection(sanitized);
    if (!validation.valid || !sanitized.success || sanitized.artifacts == null) {
      throw new ImagePreviewServiceError(
        "unsafe_result",
        IMAGE_PREVIEW_FORBIDDEN_CONTENT_ERROR
      );
    }

    // Final safety invariant check
    const safety = sanitized.safety;
    if (
      safety.internalOnly !== true ||
      safety.explicitBillingConfirmation !== true ||
      safety.requestCapApplied !== true ||
      safety.sourceImagePersisted !== false ||
      safety.generatedImagePersistedByHelseApp !== false ||
      safety.legacyProductionChanged !== false ||
      safety.publicCutoverEnabled !== false
    ) {
      throw new ImagePreviewServiceError(
        "unsafe_result",
        IMAGE_PREVIEW_FORBIDDEN_CONTENT_ERROR
      );
    }

    return sanitized;
  }
}

/** Exported for tests — confirms safety constant identity. */
export function getImagePreviewSafetyStatus() {
  return { ...IMAGE_PREVIEW_SAFETY_STATUS };
}
