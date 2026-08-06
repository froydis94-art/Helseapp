/**
 * ReplicateTransportAdapter — server-side create + poll transport.
 *
 * Disabled by default. No production route wiring. No physiology or validation.
 * Uses injectable fetch/now/sleep for mocked tests (zero real network).
 */

import {
  SUPPORTED_FORMATTER_ASPECT_RATIOS,
  validateFormattedImageRequest,
} from "../formatters/ProviderFormatter";
import { isAbortError, isTimeoutLikeFetchError } from "./ReplicateErrors";
import {
  extractReplicateImageUrl,
  normalizeHttpFailure,
  normalizeReplicateFailure,
  normalizeReplicateStatus,
  parsePredictionPayload,
} from "./ReplicateResponseNormalizer";
import {
  DEFAULT_REPLICATE_API_BASE_URL,
  type ReplicateTransportConfig,
} from "./ReplicateTransportConfig";
import type {
  ReplicateCreatePredictionBody,
  ReplicateTransportInput,
  ReplicateTransportInputValidation,
  ReplicateTransportResult,
  ReplicateTransportSuccess,
} from "./ReplicateTransportTypes";

/** Conservative max length for data URI strings (do not decode bytes). */
export const MAX_DATA_URI_CHARS = 8_000_000;

const ALLOWED_DATA_URI_PREFIXES = [
  "data:image/jpeg;base64,",
  "data:image/jpg;base64,",
  "data:image/png;base64,",
  "data:image/webp;base64,",
] as const;

const SENSITIVE_TRACE =
  /authorization|bearer\s|r8_[A-Za-z0-9]|api[_-]?key|data:image\/|https?:\/\/|sk-[A-Za-z0-9]/i;

/**
 * Flux Kontext Pro does not expose a separate negative_prompt field.
 * Exclusions are appended as a labeled section (capability adaptation only).
 */
export const NEGATIVE_PROMPT_APPENDIX_LABEL = "EXCLUSIONS";

export interface ReplicateTransportDependencies {
  fetchFn: typeof fetch;
  now: () => number;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      reject(err);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      const err = new Error("aborted");
      err.name = "AbortError";
      reject(err);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function resolveDeps(
  partial?: Partial<ReplicateTransportDependencies>
): ReplicateTransportDependencies {
  return {
    fetchFn: partial?.fetchFn ?? globalThis.fetch.bind(globalThis),
    now: partial?.now ?? (() => Date.now()),
    sleep: partial?.sleep ?? defaultSleep,
  };
}

function hasSensitiveContent(value: string): boolean {
  return SENSITIVE_TRACE.test(value);
}

/**
 * Validate transport input without logging or echoing source image values.
 */
export function validateReplicateTransportInput(
  input: ReplicateTransportInput
): ReplicateTransportInputValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input == null || typeof input !== "object") {
    return {
      valid: false,
      errors: ["Transport input is required."],
      warnings,
    };
  }

  if (!input.formattedRequest) {
    errors.push("formattedRequest is required.");
  } else {
    const formattedCheck = validateFormattedImageRequest(input.formattedRequest);
    if (!formattedCheck.valid) {
      errors.push("formattedRequest failed formatter contract validation.");
    }
    if (input.formattedRequest.providerFamily !== "flux") {
      errors.push('providerFamily must be "flux".');
    }
    if (
      typeof input.formattedRequest.prompt !== "string" ||
      input.formattedRequest.prompt.trim() === ""
    ) {
      errors.push("prompt must be a non-empty string.");
    }
    if (input.formattedRequest.sourceOperation !== "edit_source_image") {
      errors.push('sourceOperation must be "edit_source_image".');
    }
    if (input.formattedRequest.aspectRatio !== undefined) {
      const ar = input.formattedRequest.aspectRatio;
      if (
        !(SUPPORTED_FORMATTER_ASPECT_RATIOS as readonly string[]).includes(ar)
      ) {
        errors.push("aspectRatio is unsupported.");
      }
    }
    if (input.formattedRequest.seed !== undefined) {
      const seed = input.formattedRequest.seed;
      if (
        typeof seed !== "number" ||
        !Number.isFinite(seed) ||
        !Number.isInteger(seed) ||
        seed < 0
      ) {
        errors.push("seed is invalid.");
      }
    }
  }

  if (typeof input.traceId !== "string" || input.traceId.trim() === "") {
    errors.push("traceId must be a non-empty string.");
  } else if (hasSensitiveContent(input.traceId)) {
    errors.push("traceId contains disallowed content.");
  }

  const source = input.sourceImage;
  if (!source || typeof source !== "object") {
    errors.push("Source image reference is invalid.");
  } else {
    const kind = source.kind;
    const value = source.value;
    if (kind !== "https_url" && kind !== "data_uri") {
      errors.push("Source image reference is invalid.");
    } else if (typeof value !== "string" || value.trim() === "") {
      errors.push("Source image reference is invalid.");
    } else if (kind === "https_url") {
      if (!value.startsWith("https://") || value.startsWith("http://")) {
        errors.push("Source image reference is invalid.");
      } else {
        try {
          const u = new URL(value);
          if (u.protocol !== "https:" || u.username || u.password) {
            errors.push("Source image reference is invalid.");
          }
        } catch {
          errors.push("Source image reference is invalid.");
        }
      }
    } else if (kind === "data_uri") {
      const lower = value.slice(0, 64).toLowerCase();
      if (lower.includes("image/svg")) {
        errors.push("Source image reference is invalid.");
      } else if (
        !ALLOWED_DATA_URI_PREFIXES.some((p) =>
          value.toLowerCase().startsWith(p)
        )
      ) {
        errors.push("Source image reference is invalid.");
      } else if (value.length > MAX_DATA_URI_CHARS) {
        errors.push("Source image reference is invalid.");
      }
    }

    if (
      typeof value === "string" &&
      (hasSensitiveContent(value.slice(0, 200)) && kind === "https_url"
        ? /authorization|bearer\s|r8_|api[_-]?key/i.test(value)
        : false)
    ) {
      errors.push("Source image reference is invalid.");
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Build create-prediction body from formatted request + source image.
 * Preserves formatted prompts; does not rewrite transformations.
 *
 * Mapping (flux-kontext-pro) — aligned with the working production Flux contract:
 * - prompt ← formatted positive prompt (+ EXCLUSIONS appendix when negative present)
 * - input_image ← sourceImage.value
 * - aspect_ratio ← supported formatter value, else match_input_image
 * - output_format ← png
 * - safety_tolerance ← 2 (Replicate max when input_image is set)
 * - seed ← when present
 * prompt_upsampling / strength knobs stay omitted (not invented here).
 */
export function buildReplicateCreatePredictionBody(
  config: ReplicateTransportConfig,
  input: ReplicateTransportInput
): ReplicateCreatePredictionBody {
  const formatted = input.formattedRequest;
  let prompt = formatted.prompt;
  const negative = formatted.negativePrompt?.trim();
  if (negative) {
    // Flux Kontext has no separate negative_prompt — append labeled exclusions.
    prompt = `${prompt}\n\n${NEGATIVE_PROMPT_APPENDIX_LABEL}:\n${negative}`;
  }

  const bodyInput: Record<string, unknown> = {
    prompt,
    input_image: input.sourceImage.value,
    aspect_ratio: "match_input_image",
    output_format: "png",
    safety_tolerance: 2,
  };

  if (
    formatted.aspectRatio !== undefined &&
    (SUPPORTED_FORMATTER_ASPECT_RATIOS as readonly string[]).includes(
      formatted.aspectRatio
    )
  ) {
    bodyInput.aspect_ratio = formatted.aspectRatio;
  }

  if (formatted.seed !== undefined) {
    bodyInput.seed = formatted.seed;
  }

  return {
    model: config.model,
    input: bodyInput,
  };
}

/**
 * Allowlist poll URLs: https://api.replicate.com/v1/predictions/...
 */
export function isAllowedReplicatePollUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    if (u.hostname !== "api.replicate.com") return false;
    if (u.hash) return false;
    if (!u.pathname.startsWith("/v1/predictions/")) return false;
    if (u.pathname === "/v1/predictions/" || u.pathname === "/v1/predictions") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve apiBaseUrl to the official Replicate API origin only.
 * Accepts an optional single trailing slash; rejects all other variants.
 * Returns the canonical base URL, or null when the value is untrusted.
 */
export function resolveOfficialReplicateApiBaseUrl(
  apiBaseUrl: string
): string | null {
  if (typeof apiBaseUrl !== "string") return null;
  const trimmed = apiBaseUrl.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (u.hostname !== "api.replicate.com") return null;
    if (u.port !== "") return null;
    if (u.search !== "") return null;
    if (u.hash !== "") return null;
    let pathname = u.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    if (pathname !== "/v1") return null;
    return DEFAULT_REPLICATE_API_BASE_URL;
  } catch {
    return null;
  }
}

function linkAbortSignals(
  signals: Array<AbortSignal | undefined>
): AbortController {
  const controller = new AbortController();
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller;
}

export class ReplicateTransportAdapter {
  readonly id = "replicate-transport-v1";
  readonly provider = "replicate" as const;

  private readonly config: ReplicateTransportConfig;
  private readonly deps: ReplicateTransportDependencies;

  constructor(
    config: ReplicateTransportConfig,
    dependencies?: Partial<ReplicateTransportDependencies>
  ) {
    this.config = config;
    this.deps = resolveDeps(dependencies);
  }

  async generate(
    input: ReplicateTransportInput
  ): Promise<ReplicateTransportResult> {
    const started = this.deps.now();
    const elapsed = (): number => Math.max(0, this.deps.now() - started);
    const traceId =
      typeof input?.traceId === "string" && input.traceId.trim()
        ? input.traceId
        : "missing-trace";

    try {
      if (!this.config.enabled) {
        return normalizeReplicateFailure({
          code: "adapter_disabled",
          message: "Replicate transport adapter is disabled.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
        });
      }

      if (!this.config.apiToken) {
        return normalizeReplicateFailure({
          code: "missing_token",
          message: "Replicate API token is not configured.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
          model: this.config.model,
        });
      }

      const validation = validateReplicateTransportInput(input);
      if (!validation.valid) {
        return normalizeReplicateFailure({
          code: "invalid_request",
          message: "Transport input is invalid.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
          model: this.config.model,
          warnings: validation.warnings,
        });
      }

      const apiBaseUrl = resolveOfficialReplicateApiBaseUrl(
        this.config.apiBaseUrl
      );
      if (!apiBaseUrl) {
        return normalizeReplicateFailure({
          code: "invalid_request",
          message: "Replicate transport configuration is invalid.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
          model: this.config.model,
        });
      }

      const body = buildReplicateCreatePredictionBody(this.config, input);
      const [owner, name] = this.config.model.split("/");
      const createUrl = `${apiBaseUrl}/models/${owner}/${name}/predictions`;

      const totalController = new AbortController();
      const totalTimer = setTimeout(
        () => totalController.abort(),
        this.config.totalTimeoutMs
      );
      const createController = linkAbortSignals([
        input.abortSignal,
        totalController.signal,
      ]);
      const createTimer = setTimeout(
        () => createController.abort(),
        this.config.createTimeoutMs
      );

      // Prefer: wait — short sync hold like the working Flux path (≈12s).
      // Long wait + multi-MB data-URI uploads race Node/undici timeouts and
      // were misclassified as opaque transport failures.
      const preferWaitSeconds = Math.max(
        1,
        Math.min(12, Math.floor(this.config.createTimeoutMs / 1000) - 8)
      );

      let createResponse: Response;
      try {
        createResponse = await this.deps.fetchFn(createUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
            "Content-Type": "application/json",
            Prefer: `wait=${preferWaitSeconds}`,
            // Auto-cancel hung predictions inside the create/total budget.
            "Cancel-After": `${Math.max(
              5,
              Math.ceil(this.config.totalTimeoutMs / 1000)
            )}s`,
          },
          body: JSON.stringify({ input: body.input }),
          signal: createController.signal,
        });
      } catch (err) {
        clearTimeout(createTimer);
        clearTimeout(totalTimer);
        if (isAbortError(err)) {
          if (input.abortSignal?.aborted) {
            return normalizeReplicateFailure({
              code: "request_aborted",
              message: "Request was aborted.",
              retryable: true,
              traceId,
              generationTimeMs: elapsed(),
              model: this.config.model,
            });
          }
          return normalizeReplicateFailure({
            code: "request_timeout",
            message: "Request timed out.",
            retryable: true,
            traceId,
            generationTimeMs: elapsed(),
            model: this.config.model,
          });
        }
        if (isTimeoutLikeFetchError(err)) {
          return normalizeReplicateFailure({
            code: "request_timeout",
            message: "Request timed out.",
            retryable: true,
            traceId,
            generationTimeMs: elapsed(),
            model: this.config.model,
          });
        }
        return normalizeReplicateFailure({
          code: "unknown_transport_error",
          message: "Transport request failed.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
          model: this.config.model,
        });
      } finally {
        clearTimeout(createTimer);
      }

      if (!createResponse.ok) {
        clearTimeout(totalTimer);
        let bodyText = "";
        try {
          bodyText = await createResponse.text();
        } catch {
          bodyText = "";
        }
        return normalizeHttpFailure(
          createResponse.status,
          traceId,
          elapsed(),
          bodyText,
          { model: this.config.model }
        );
      }

      let createJson: unknown;
      try {
        createJson = await createResponse.json();
      } catch {
        clearTimeout(totalTimer);
        return normalizeReplicateFailure({
          code: "invalid_provider_response",
          message: "Provider returned an invalid create response.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
          model: this.config.model,
        });
      }

      const prediction = parsePredictionPayload(createJson);
      if (!prediction) {
        clearTimeout(totalTimer);
        return normalizeReplicateFailure({
          code: "invalid_provider_response",
          message: "Provider returned an invalid create response.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
          model: this.config.model,
        });
      }

      const predictionId =
        typeof prediction.id === "string" ? prediction.id : undefined;
      let status = normalizeReplicateStatus(prediction.status);
      let pollingAttempts = 0;

      const finishSuccess = (
        output: unknown,
        providerStatus: string
      ): ReplicateTransportResult => {
        const imageUrl = extractReplicateImageUrl(output);
        if (!imageUrl) {
          return normalizeReplicateFailure({
            code: "invalid_provider_response",
            message: "Provider output did not contain a valid HTTPS image URL.",
            retryable: false,
            traceId,
            generationTimeMs: elapsed(),
            predictionId,
            model: this.config.model,
            status: status ?? undefined,
            pollingAttempts,
            providerStatus,
          });
        }
        const success: ReplicateTransportSuccess = {
          success: true,
          provider: "replicate",
          predictionId: predictionId ?? "unknown",
          model: this.config.model,
          status: "succeeded",
          imageUrl,
          generationTimeMs: elapsed(),
          warnings: [],
          metadata: {
            traceId,
            formatterName: input.formattedRequest.metadata.formatterName,
            formatterVersion: input.formattedRequest.metadata.formatterVersion,
            pollingAttempts,
            providerStatus,
          },
        };
        return success;
      };

      if (status === "succeeded") {
        clearTimeout(totalTimer);
        return finishSuccess(prediction.output, status);
      }

      if (status === "failed" || status === "canceled") {
        clearTimeout(totalTimer);
        return normalizeReplicateFailure({
          code: "provider_failed",
          message: "Provider prediction failed.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
          predictionId,
          model: this.config.model,
          status,
          pollingAttempts,
          providerStatus: status,
          providerError: prediction.error,
        });
      }

      const pollUrlRaw =
        prediction.urls && typeof prediction.urls.get === "string"
          ? prediction.urls.get
          : predictionId
            ? `${apiBaseUrl}/predictions/${predictionId}`
            : null;

      if (!pollUrlRaw || !isAllowedReplicatePollUrl(pollUrlRaw)) {
        clearTimeout(totalTimer);
        return normalizeReplicateFailure({
          code: "invalid_provider_response",
          message: "Provider returned an untrusted polling URL.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
          predictionId,
          model: this.config.model,
          pollingAttempts,
        });
      }

      let latestOutput: unknown = prediction.output;
      let latestError: unknown = prediction.error;

      while (pollingAttempts < this.config.maxPollAttempts) {
        if (input.abortSignal?.aborted || totalController.signal.aborted) {
          clearTimeout(totalTimer);
          if (input.abortSignal?.aborted) {
            return normalizeReplicateFailure({
              code: "request_aborted",
              message: "Request was aborted.",
              retryable: true,
              traceId,
              generationTimeMs: elapsed(),
              predictionId,
              model: this.config.model,
              pollingAttempts,
            });
          }
          return normalizeReplicateFailure({
            code: "request_timeout",
            message: "Request timed out.",
            retryable: true,
            traceId,
            generationTimeMs: elapsed(),
            predictionId,
            model: this.config.model,
            pollingAttempts,
          });
        }

        try {
          await this.deps.sleep(
            this.config.pollIntervalMs,
            linkAbortSignals([input.abortSignal, totalController.signal]).signal
          );
        } catch (err) {
          clearTimeout(totalTimer);
          if (isAbortError(err) && input.abortSignal?.aborted) {
            return normalizeReplicateFailure({
              code: "request_aborted",
              message: "Request was aborted.",
              retryable: true,
              traceId,
              generationTimeMs: elapsed(),
              predictionId,
              model: this.config.model,
              pollingAttempts,
            });
          }
          return normalizeReplicateFailure({
            code: "request_timeout",
            message: "Request timed out.",
            retryable: true,
            traceId,
            generationTimeMs: elapsed(),
            predictionId,
            model: this.config.model,
            pollingAttempts,
          });
        }

        pollingAttempts += 1;

        const pollController = linkAbortSignals([
          input.abortSignal,
          totalController.signal,
        ]);

        let pollResponse: Response;
        try {
          pollResponse = await this.deps.fetchFn(pollUrlRaw, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${this.config.apiToken}`,
              "Content-Type": "application/json",
            },
            signal: pollController.signal,
          });
        } catch (err) {
          clearTimeout(totalTimer);
          if (isAbortError(err)) {
            if (input.abortSignal?.aborted) {
              return normalizeReplicateFailure({
                code: "request_aborted",
                message: "Request was aborted.",
                retryable: true,
                traceId,
                generationTimeMs: elapsed(),
                predictionId,
                model: this.config.model,
                pollingAttempts,
              });
            }
            return normalizeReplicateFailure({
              code: "request_timeout",
              message: "Request timed out.",
              retryable: true,
              traceId,
              generationTimeMs: elapsed(),
              predictionId,
              model: this.config.model,
              pollingAttempts,
            });
          }
          if (isTimeoutLikeFetchError(err)) {
            return normalizeReplicateFailure({
              code: "request_timeout",
              message: "Request timed out.",
              retryable: true,
              traceId,
              generationTimeMs: elapsed(),
              predictionId,
              model: this.config.model,
              pollingAttempts,
            });
          }
          return normalizeReplicateFailure({
            code: "unknown_transport_error",
            message: "Transport polling failed.",
            retryable: false,
            traceId,
            generationTimeMs: elapsed(),
            predictionId,
            model: this.config.model,
            pollingAttempts,
          });
        }

        if (!pollResponse.ok) {
          clearTimeout(totalTimer);
          let bodyText = "";
          try {
            bodyText = await pollResponse.text();
          } catch {
            bodyText = "";
          }
          return normalizeHttpFailure(
            pollResponse.status,
            traceId,
            elapsed(),
            bodyText,
            {
              predictionId,
              model: this.config.model,
              pollingAttempts,
            }
          );
        }

        let pollJson: unknown;
        try {
          pollJson = await pollResponse.json();
        } catch {
          clearTimeout(totalTimer);
          return normalizeReplicateFailure({
            code: "invalid_provider_response",
            message: "Provider returned an invalid poll response.",
            retryable: false,
            traceId,
            generationTimeMs: elapsed(),
            predictionId,
            model: this.config.model,
            pollingAttempts,
          });
        }

        const polled = parsePredictionPayload(pollJson);
        if (!polled) {
          clearTimeout(totalTimer);
          return normalizeReplicateFailure({
            code: "invalid_provider_response",
            message: "Provider returned an invalid poll response.",
            retryable: false,
            traceId,
            generationTimeMs: elapsed(),
            predictionId,
            model: this.config.model,
            pollingAttempts,
          });
        }

        status = normalizeReplicateStatus(polled.status);
        latestOutput = polled.output;
        latestError = polled.error;

        if (status === "succeeded") {
          clearTimeout(totalTimer);
          return finishSuccess(latestOutput, status);
        }
        if (status === "failed" || status === "canceled") {
          clearTimeout(totalTimer);
          return normalizeReplicateFailure({
            code: "provider_failed",
            message: "Provider prediction failed.",
            retryable: false,
            traceId,
            generationTimeMs: elapsed(),
            predictionId,
            model: this.config.model,
            status,
            pollingAttempts,
            providerStatus: status,
            providerError: latestError,
          });
        }
      }

      clearTimeout(totalTimer);
      return normalizeReplicateFailure({
        code: "polling_exhausted",
        message: "Polling attempts exhausted.",
        retryable: true,
        traceId,
        generationTimeMs: elapsed(),
        predictionId,
        model: this.config.model,
        pollingAttempts,
      });
    } catch {
      return normalizeReplicateFailure({
        code: "unknown_transport_error",
        message: "Unexpected transport failure.",
        retryable: false,
        traceId,
        generationTimeMs: elapsed(),
        model: this.config.model,
      });
    }
  }
}
