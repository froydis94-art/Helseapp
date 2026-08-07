/**
 * Provider Safety Attribution Diagnostic (Patch 022E-C).
 *
 * Safe, secret-free attribution for Replicate/Flux E005 (and related) outcomes.
 * No paid provider calls. Never includes raw image, data URI body, or tokens.
 */

import { createHash } from "node:crypto";

import { measureProviderPromptDiagnostics } from "./NeutralAnatomicalPromptConditioner";

export const PROVIDER_SAFETY_ATTRIBUTION_SCHEMA_VERSION = 1 as const;

export type ProviderSafetyAttributionClassification =
  | "likely_input_related"
  | "likely_prompt_image_combination"
  | "likely_output_related"
  | "provider_behavior_changed"
  | "indeterminate";

export type ProviderSafetyAttributionConfidence = "low" | "medium" | "high";

export interface ProviderSafetyAttributionDiagnostic {
  schemaVersion: 1;
  providerError: {
    code: string | null;
    category: string | null;
    httpStatus: number | null;
    safeMessage: string | null;
  };
  attribution: {
    classification: ProviderSafetyAttributionClassification;
    confidence: ProviderSafetyAttributionConfidence;
    reasons: string[];
  };
  requestParity: {
    imageContractMatchesLegacy: boolean;
    providerContractMatchesLegacy: boolean;
    modelMatchesLegacy: boolean;
    promptConditioningApplied: boolean;
  };
  promptMetrics: {
    characters: number;
    words: number;
    anatomicalTerms: number;
    preservationTerms: number;
    sensitiveLexemes: number;
    conditionedPromptHash: string | null;
    preservationSentenceCount: number;
    anatomyInstructionCount: number;
    semanticSupportCount: number;
  };
  imageMetrics: {
    mimeType: string;
    byteLength: number;
    dimensions: string | null;
    serializationMatchesLegacy: boolean;
    fieldName: string;
    dataUriPrefix: string;
  };
  requestSnapshot: {
    model: string;
    endpointClass: string;
    providerInputFieldNames: string[];
    aspectRatio: string | null;
    outputFormat: string | null;
    safetyTolerance: number | null;
    promptUpsampling: boolean | null;
    bodyFatDelta: number | null;
    timelineWeeks: number | null;
    focusZones: string[];
    anatomicalTranslatedChangeCount: number;
  };
  repairedDefects: string[];
  unresolvedDifferences: string[];
}

export interface SafeSourceImageInspection {
  mimeType: string;
  byteLength: number;
  dimensions: string | null;
  fieldName: "input_image";
  dataUriPrefix: string;
  serializationMatchesLegacy: boolean;
}

const LEGACY_DEFAULT_MODEL = "black-forest-labs/flux-kontext-pro";
const LEGACY_ENDPOINT_CLASS = "replicate_official_model_predictions";
const LEGACY_FLUX_FIELDS = [
  "prompt",
  "input_image",
  "aspect_ratio",
  "output_format",
  "safety_tolerance",
  "prompt_upsampling",
] as const;

/**
 * Same construction as lib/replicate.js `toDataUri` / api `toDataUri`.
 */
export function serializeImageDataUriLikeLegacy(
  imageBuffer: Buffer,
  mimeType?: string | null
): string {
  const mime = mimeType || "image/jpeg";
  return `data:${mime};base64,${imageBuffer.toString("base64")}`;
}

function parseJpegDimensions(buf: Buffer): string | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) break;
    // SOF0 / SOF2
    if (marker === 0xc0 || marker === 0xc2) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return `${width}x${height}`;
    }
    i += 2 + len;
  }
  return null;
}

function parsePngDimensions(buf: Buffer): string | null {
  if (buf.length < 24) return null;
  const sig = buf.subarray(0, 8).toString("hex");
  if (sig !== "89504e470d0a1a0a") return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return `${width}x${height}`;
}

/**
 * Safe image metrics from a data URI. Never returns raw image bytes or full URI.
 */
export function inspectSourceImageDataUriSafe(
  dataUri: string,
  options?: { fieldName?: "input_image" }
): SafeSourceImageInspection {
  const raw = String(dataUri || "");
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
  const mimeType = match?.[1]?.toLowerCase() || "application/octet-stream";
  const prefix = match ? match[0] : "data:;base64,";
  const b64 = match ? raw.slice(match[0].length) : "";
  let byteLength = 0;
  let dimensions: string | null = null;
  let serializationMatchesLegacy = false;

  try {
    const buf = Buffer.from(b64, "base64");
    byteLength = buf.length;
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      dimensions = parseJpegDimensions(buf);
    } else if (mimeType === "image/png") {
      dimensions = parsePngDimensions(buf);
    }
    const rebuilt = serializeImageDataUriLikeLegacy(buf, mimeType);
    serializationMatchesLegacy = rebuilt === raw;
  } catch {
    byteLength = 0;
    serializationMatchesLegacy = false;
  }

  return {
    mimeType,
    byteLength,
    dimensions,
    fieldName: options?.fieldName ?? "input_image",
    dataUriPrefix: prefix,
    serializationMatchesLegacy,
  };
}

export function hashProviderPromptSafe(prompt: string): string {
  return createHash("sha256").update(String(prompt || ""), "utf8").digest("hex");
}

export function countPreservationSentences(prompt: string): number {
  const parts = String(prompt || "")
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.filter((s) => /\bpreserve\b/i.test(s)).length;
}

export function countAnatomyInstructionLines(prompt: string): number {
  const parts = String(prompt || "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.filter((s) =>
    /\b(midsection|abdomen|abdominal|waist|muscle|fat|thigh|glute|definition|subcutaneous)\b/i.test(
      s
    )
  ).length;
}

export function countSemanticSupportMentions(prompt: string): number {
  const lower = String(prompt || "").toLowerCase();
  let n = 0;
  for (const term of ["lean", "defined", "athletic"] as const) {
    const re = new RegExp(`\\b${term}\\b`, "g");
    const m = lower.match(re);
    if (m) n += m.length;
  }
  return n;
}

export function isE005SensitiveProviderMessage(message: string | null | undefined): boolean {
  return /E005|flagged as sensitive|sensitive content/i.test(String(message || ""));
}

export interface BuildProviderSafetyAttributionInput {
  providerError?: {
    code?: string | null;
    category?: string | null;
    httpStatus?: number | null;
    safeMessage?: string | null;
  } | null;
  sourceImageDataUri?: string | null;
  providerPrompt?: string | null;
  promptConditioningApplied?: boolean;
  model?: string | null;
  endpointClass?: string | null;
  providerInputFieldNames?: string[] | null;
  aspectRatio?: string | null;
  outputFormat?: string | null;
  safetyTolerance?: number | null;
  promptUpsampling?: boolean | null;
  bodyFatDelta?: number | null;
  timelineWeeks?: number | null;
  focusZones?: string[] | null;
  anatomicalTranslatedChangeCount?: number | null;
  /** Explicit repaired defect ids discovered/fixed in this patch. */
  repairedDefects?: string[];
  /** Extra unresolved differences beyond defaults. */
  unresolvedDifferences?: string[];
  /** When true, image contract already verified against legacy helper. */
  imageContractMatchesLegacy?: boolean;
  /** Patch 022E-E — ordered Flux fallback context for attribution. */
  fluxOrderedFallback?: {
    strategy?: string | null;
    reason?: string | null;
    attemptPlan?: string[] | null;
    attempts?: Array<{
      label?: string;
      outcome?: string;
      eligibleFailure?: boolean;
    }> | null;
    fallbackUsed?: boolean;
    requestCount?: number;
    logicalSuccessViaFallback?: boolean;
  } | null;
}

function arraysEqualSorted(a: string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const aa = [...a].sort();
  const bb = [...b].sort();
  return aa.every((v, i) => v === bb[i]);
}

/**
 * Build attribution without paid provider calls.
 * Never claims high confidence for E005 input-vs-output isolation.
 */
export function buildProviderSafetyAttributionDiagnostic(
  input: BuildProviderSafetyAttributionInput
): ProviderSafetyAttributionDiagnostic {
  const image = inspectSourceImageDataUriSafe(input.sourceImageDataUri || "");
  const prompt = String(input.providerPrompt || "");
  const promptMetricsRaw = measureProviderPromptDiagnostics(prompt);
  const fieldNames = Array.isArray(input.providerInputFieldNames)
    ? [...input.providerInputFieldNames]
    : [...LEGACY_FLUX_FIELDS];

  const model = input.model || LEGACY_DEFAULT_MODEL;
  const endpointClass = input.endpointClass || LEGACY_ENDPOINT_CLASS;
  const modelMatchesLegacy = model === LEGACY_DEFAULT_MODEL;
  const providerContractMatchesLegacy =
    endpointClass === LEGACY_ENDPOINT_CLASS &&
    arraysEqualSorted(fieldNames, LEGACY_FLUX_FIELDS) &&
    (input.aspectRatio == null || input.aspectRatio === "match_input_image") &&
    (input.outputFormat == null || input.outputFormat === "png") &&
    (input.safetyTolerance == null || input.safetyTolerance === 2);

  const imageContractMatchesLegacy =
    typeof input.imageContractMatchesLegacy === "boolean"
      ? input.imageContractMatchesLegacy
      : image.serializationMatchesLegacy && image.fieldName === "input_image";

  const promptConditioningApplied = Boolean(input.promptConditioningApplied);
  const safeMessage = input.providerError?.safeMessage ?? null;
  const isE005 = isE005SensitiveProviderMessage(safeMessage);

  const repairedDefects = [
    ...(input.repairedDefects ?? []),
  ];
  const defaultRepairs = [
    "removed_provider_facing_adult_status_framing",
    "removed_provider_facing_clothing_coverage_meta",
    "compressed_conditioned_prompt_to_single_block",
  ];
  for (const id of defaultRepairs) {
    if (!repairedDefects.includes(id)) repairedDefects.push(id);
  }

  const unresolvedDifferences = [
    ...(input.unresolvedDifferences ?? []),
  ];
  const fallbackCtx = input.fluxOrderedFallback || null;
  const orderedFallbackActive =
    fallbackCtx?.strategy === "flux_ordered_fallback";
  const defaultUnresolved = [
    "prompt_content_differs_from_legacy_slim_athletic_framing",
    "e005_message_does_not_distinguish_input_vs_output",
    "no_paid_provider_attribution_probe",
  ];
  if (!orderedFallbackActive) {
    defaultUnresolved.splice(
      1,
      0,
      "legacy_path_may_cascade_alternate_models_on_e005"
    );
  }
  for (const id of defaultUnresolved) {
    if (!unresolvedDifferences.includes(id)) unresolvedDifferences.push(id);
  }

  if (
    orderedFallbackActive &&
    !repairedDefects.includes("restored_intelligent_flux_ordered_fallback")
  ) {
    repairedDefects.push("restored_intelligent_flux_ordered_fallback");
  }

  const reasons: string[] = [];
  let classification: ProviderSafetyAttributionClassification = "indeterminate";
  let confidence: ProviderSafetyAttributionConfidence = "low";

  if (!isE005 && !safeMessage) {
    reasons.push("no_provider_safety_error_present");
    if (fallbackCtx?.logicalSuccessViaFallback) {
      reasons.push("primary_attempt_failed_eligible_fallback_succeeded");
      reasons.push("live_path_flux_ordered_fallback_logical_success");
      classification = "provider_behavior_changed";
      confidence = "medium";
    } else {
      classification = "indeterminate";
      confidence = "low";
    }
  } else if (!isE005) {
    reasons.push("provider_error_not_e005_sensitive");
    classification = "indeterminate";
    confidence = "low";
  } else {
    reasons.push("e005_sensitive_flag_observed");
    reasons.push("e005_api_message_ambiguous_input_or_output");

    if (imageContractMatchesLegacy) {
      reasons.push("image_serialization_matches_legacy_toDataUri");
    } else {
      reasons.push("image_serialization_differs_from_legacy");
    }
    if (providerContractMatchesLegacy) {
      reasons.push("provider_request_fields_match_legacy_flux_contract");
    } else {
      reasons.push("provider_request_fields_differ_from_legacy");
    }
    if (modelMatchesLegacy) {
      reasons.push("model_matches_legacy_flux_kontext_pro");
    } else {
      reasons.push("model_differs_from_legacy_default");
    }
    if (promptConditioningApplied) {
      reasons.push("neutral_prompt_conditioning_applied");
    } else {
      reasons.push("neutral_prompt_conditioning_not_applied");
    }
    if (promptMetricsRaw.providerPromptSensitiveLexemeCount === 0) {
      reasons.push("provider_prompt_sensitive_lexeme_count_zero");
    } else {
      reasons.push("provider_prompt_still_contains_sensitive_lexemes");
    }
    reasons.push("provider_prompt_structure_differs_from_legacy_slim");
    reasons.push("legacy_generateWithReplicate_may_cascade_on_e005");
    if (orderedFallbackActive) {
      reasons.push("live_path_flux_ordered_fallback");
      const failedAttempts = (fallbackCtx?.attempts || []).filter(
        (a) => a.outcome === "failed"
      );
      if (failedAttempts.length > 0) {
        reasons.push("attempt_level_eligible_failure_recorded");
      }
      if (fallbackCtx?.logicalSuccessViaFallback) {
        reasons.push("primary_attempt_failed_eligible_fallback_succeeded");
      } else {
        reasons.push("all_flux_ordered_fallback_attempts_failed");
      }
    } else {
      reasons.push("live_path_single_request_no_cascade");
    }
    reasons.push("attribution_without_paid_provider_isolation_probe");

    if (!imageContractMatchesLegacy) {
      classification = "likely_input_related";
      confidence = "medium";
    } else if (
      imageContractMatchesLegacy &&
      providerContractMatchesLegacy &&
      modelMatchesLegacy &&
      promptConditioningApplied &&
      promptMetricsRaw.providerPromptSensitiveLexemeCount === 0
    ) {
      // Transport/image parity holds; remaining delta is prompt wording vs
      // underwear/progress photo combination — or unresolved provider behavior.
      // Do not claim high certainty: E005 does not isolate input vs output.
      classification = "likely_prompt_image_combination";
      confidence = "medium";
    } else if (
      imageContractMatchesLegacy &&
      providerContractMatchesLegacy &&
      !promptConditioningApplied
    ) {
      classification = "likely_prompt_image_combination";
      confidence = "medium";
    } else {
      classification = "indeterminate";
      confidence = "low";
    }
  }

  // Hard rule: E005 isolation without a paid probe never uses "high".
  // (Classification paths above only emit low|medium for E005.)

  return {
    schemaVersion: PROVIDER_SAFETY_ATTRIBUTION_SCHEMA_VERSION,
    providerError: {
      code: input.providerError?.code ?? null,
      category: input.providerError?.category ?? null,
      httpStatus:
        typeof input.providerError?.httpStatus === "number"
          ? input.providerError.httpStatus
          : null,
      safeMessage,
    },
    attribution: {
      classification,
      confidence,
      reasons,
    },
    requestParity: {
      imageContractMatchesLegacy,
      providerContractMatchesLegacy,
      modelMatchesLegacy,
      promptConditioningApplied,
    },
    promptMetrics: {
      characters: promptMetricsRaw.providerPromptCharacterCount,
      words: promptMetricsRaw.providerPromptWordCount,
      anatomicalTerms: promptMetricsRaw.providerPromptAnatomicalTermCount,
      preservationTerms: promptMetricsRaw.providerPromptPreservationTermCount,
      sensitiveLexemes: promptMetricsRaw.providerPromptSensitiveLexemeCount,
      conditionedPromptHash: prompt ? hashProviderPromptSafe(prompt) : null,
      preservationSentenceCount: countPreservationSentences(prompt),
      anatomyInstructionCount: countAnatomyInstructionLines(prompt),
      semanticSupportCount: countSemanticSupportMentions(prompt),
    },
    imageMetrics: {
      mimeType: image.mimeType,
      byteLength: image.byteLength,
      dimensions: image.dimensions,
      serializationMatchesLegacy: image.serializationMatchesLegacy,
      fieldName: image.fieldName,
      dataUriPrefix: image.dataUriPrefix,
    },
    requestSnapshot: {
      model,
      endpointClass,
      providerInputFieldNames: fieldNames,
      aspectRatio: input.aspectRatio ?? "match_input_image",
      outputFormat: input.outputFormat ?? "png",
      safetyTolerance: input.safetyTolerance ?? 2,
      promptUpsampling:
        typeof input.promptUpsampling === "boolean"
          ? input.promptUpsampling
          : null,
      bodyFatDelta:
        typeof input.bodyFatDelta === "number" ? input.bodyFatDelta : null,
      timelineWeeks:
        typeof input.timelineWeeks === "number" ? input.timelineWeeks : null,
      focusZones: Array.isArray(input.focusZones) ? [...input.focusZones] : [],
      anatomicalTranslatedChangeCount:
        typeof input.anatomicalTranslatedChangeCount === "number"
          ? input.anatomicalTranslatedChangeCount
          : 0,
    },
    repairedDefects,
    unresolvedDifferences,
  };
}

/** Read-only Control Room projection (no raw image / no bypass controls). */
export function projectProviderSafetyAttributionForControlRoom(
  diagnostic: ProviderSafetyAttributionDiagnostic | null | undefined
): Record<string, string | number | boolean | null> {
  if (!diagnostic) {
    return {
      available: false,
      classification: null,
      confidence: null,
    };
  }
  return {
    available: true,
    schemaVersion: diagnostic.schemaVersion,
    classification: diagnostic.attribution.classification,
    confidence: diagnostic.attribution.confidence,
    reasonCount: diagnostic.attribution.reasons.length,
    reasons: diagnostic.attribution.reasons.join(" | "),
    imageContractMatchesLegacy:
      diagnostic.requestParity.imageContractMatchesLegacy,
    providerContractMatchesLegacy:
      diagnostic.requestParity.providerContractMatchesLegacy,
    modelMatchesLegacy: diagnostic.requestParity.modelMatchesLegacy,
    promptConditioningApplied:
      diagnostic.requestParity.promptConditioningApplied,
    promptCharacters: diagnostic.promptMetrics.characters,
    promptWords: diagnostic.promptMetrics.words,
    promptAnatomicalTerms: diagnostic.promptMetrics.anatomicalTerms,
    promptPreservationTerms: diagnostic.promptMetrics.preservationTerms,
    promptSensitiveLexemes: diagnostic.promptMetrics.sensitiveLexemes,
    imageMimeType: diagnostic.imageMetrics.mimeType,
    imageByteLength: diagnostic.imageMetrics.byteLength,
    imageDimensions: diagnostic.imageMetrics.dimensions,
    imageFieldName: diagnostic.imageMetrics.fieldName,
    imageDataUriPrefix: diagnostic.imageMetrics.dataUriPrefix,
    repairedDefects: diagnostic.repairedDefects.join(" | "),
    unresolvedDifferences: diagnostic.unresolvedDifferences.join(" | "),
    providerErrorCode: diagnostic.providerError.code,
    providerErrorCategory: diagnostic.providerError.category,
    providerHttpStatus: diagnostic.providerError.httpStatus,
    providerSafeMessage: diagnostic.providerError.safeMessage,
  };
}
