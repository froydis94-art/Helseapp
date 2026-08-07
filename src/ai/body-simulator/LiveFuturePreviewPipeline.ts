/**
 * Live Future Preview pipeline (Demand 022E).
 *
 * Public Future payload → adapter → Body Simulator → Anatomical Engine →
 * canonical verification → formatter adapter → (optional) existing formatter /
 * provider. Feature-flagged; no silent legacy fallback when ON.
 */

import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";

import { BODY_PROFILE_SCHEMA_VERSION } from "../BodyProfile";
import {
  AiOsRuntime,
  createAiOsRuntimeDependencies,
} from "../runtime";
import { TRANSFORMATION_GOAL_SCHEMA_VERSION } from "../TransformationGoal";
import {
  DEFAULT_REPLICATE_TRANSPORT_MODEL,
  type ReplicateTransportAdapter as ReplicateTransportAdapterType,
  type ReplicateTransportDependencies,
  type ReplicateTransportResult,
} from "../transport";
import {
  adaptBodySimulatorRulesToFormatterInput,
  type CanonicalBodyTransformation,
} from "./BodySimulatorFormatterAdapter";
import { simulateBodyTransformation } from "./BodySimulatorEngine";
import type {
  BodySimulatorSimulateResult,
  BodySimulatorTransformationRules,
} from "./BodySimulatorTypes";
import { ANATOMICAL_TRANSFORMATION_SCHEMA_VERSION } from "./AnatomicalTransformationTypes";
import { verifyCanonicalBodySimulatorRules } from "../control-room/BodySimulatorComparison";
import {
  adaptPublicFutureToBodySimulator,
  isBodySimulatorLivePreviewEnabled,
  type PublicFuturePayload,
  type PublicFutureAdapterResult,
} from "./PublicFutureToBodySimulatorAdapter";
import {
  conditionAnatomicalProviderPrompt,
  type NeutralPromptDiagnostics,
  type OptionalNoteProviderConditioning,
  type ProviderPromptLexemeSuppression,
} from "./NeutralAnatomicalPromptConditioner";
import {
  buildProviderSafetyAttributionDiagnostic,
  inspectSourceImageDataUriSafe,
  projectProviderSafetyAttributionForControlRoom,
  type ProviderSafetyAttributionDiagnostic,
} from "./ProviderSafetyAttributionDiagnostic";

/** Proven Flux Kontext Pro transport helpers from legacy lib/replicate.js */
export interface ProvenFluxKontextProHelpers {
  runFluxKontextProOnce: (args: {
    imageDataUri: string;
    prompt: string;
    token?: string;
    model?: string;
    pollTimeoutMs?: number;
    bfNow?: number | null;
    bfGoal?: number | null;
    horizon?: string;
    horizonDate?: string;
  }) => Promise<{
    imageUrl: string;
    model: string;
    attempt?: string;
    inputFieldNames?: string[];
    providerRequestCount?: number;
  }>;
  buildFluxKontextProInput: (args: {
    prompt: string;
    imageDataUri: string;
    bfNow?: number | null;
    bfGoal?: number | null;
    horizon?: string;
    horizonDate?: string;
  }) => Record<string, unknown>;
  DEFAULT_MODEL: string;
}

export type ProviderErrorCategory =
  | "provider_validation_failed"
  | "provider_auth_failed"
  | "provider_model_not_found"
  | "provider_input_contract_failed"
  | "provider_rate_limited"
  | "provider_prediction_failed"
  | "provider_timeout"
  | "provider_unknown_failure";

export interface LiveProviderDiagnostics {
  providerHttpStatus: number | null;
  providerErrorCode: string | null;
  providerErrorCategory: ProviderErrorCategory;
  providerModel: string;
  providerEndpointClass: "replicate_official_model_predictions";
  providerInputFieldNames: string[];
  providerResponseMessageSafe: string;
}

/**
 * Load the known-working Flux Kontext Pro contract from lib/replicate.js.
 * Resolves from process.cwd() so tsx tests and the CJS Vercel bundle both work
 * without bundling reservedrift prompt logic. Production API also injects
 * `fluxProvider: runFluxKontextProOnce` explicitly.
 */
export function loadProvenFluxKontextProHelpers(): ProvenFluxKontextProHelpers {
  const req = createRequire(join(process.cwd(), "package.json"));
  return req(join(process.cwd(), "lib/replicate.js")) as ProvenFluxKontextProHelpers;
}

const PROVEN_FLUX_INPUT_FIELDS = [
  "prompt",
  "input_image",
  "aspect_ratio",
  "output_format",
  "safety_tolerance",
  "prompt_upsampling",
] as const;

function sanitizeProviderMessageSafe(raw: unknown): string {
  let text = "";
  if (typeof raw === "string") text = raw;
  else if (raw != null) text = String(raw);
  text = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  text = text.replace(/r8_[A-Za-z0-9]+/gi, "[redacted]");
  text = text.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  text = text.replace(
    /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi,
    "[redacted]"
  );
  if (!text) text = "Provider request failed.";
  if (text.length > 200) text = `${text.slice(0, 199)}…`;
  return text;
}

export function classifyLiveProviderErrorCategory(
  status: number | null | undefined,
  message: string
): ProviderErrorCategory {
  const code = Number(status) || 0;
  const text = String(message || "");
  if (code === 401 || code === 403) return "provider_auth_failed";
  if (code === 404 || /could not be found|not found|does not exist/i.test(text)) {
    return "provider_model_not_found";
  }
  if (code === 429) return "provider_rate_limited";
  if (code === 400 || code === 422) {
    if (/input|image|field|parameter|validation|invalid|data uri|prompt/i.test(text)) {
      return "provider_input_contract_failed";
    }
    return "provider_validation_failed";
  }
  if (code === 504 || /timeout|timed out|for lang tid|canceled/i.test(text)) {
    return "provider_timeout";
  }
  if (code >= 500 || /prediction|failed|E005|sensitive/i.test(text)) {
    return "provider_prediction_failed";
  }
  return "provider_unknown_failure";
}

export function buildLiveProviderDiagnostics(args: {
  status?: number | null;
  code?: string | null;
  message?: unknown;
  model?: string | null;
  inputFieldNames?: string[] | null;
}): LiveProviderDiagnostics {
  const safe = sanitizeProviderMessageSafe(args.message);
  const status =
    typeof args.status === "number" && Number.isFinite(args.status)
      ? args.status
      : null;
  return {
    providerHttpStatus: status,
    providerErrorCode:
      (typeof args.code === "string" && args.code.trim()) ||
      (status != null ? `http_${status}` : "provider_error"),
    providerErrorCategory: classifyLiveProviderErrorCategory(status, safe),
    providerModel: args.model || DEFAULT_REPLICATE_TRANSPORT_MODEL,
    providerEndpointClass: "replicate_official_model_predictions",
    providerInputFieldNames: Array.isArray(args.inputFieldNames)
      ? [...args.inputFieldNames]
      : [...PROVEN_FLUX_INPUT_FIELDS],
    providerResponseMessageSafe: safe,
  };
}

export {
  BODY_SIMULATOR_LIVE_PREVIEW_ENV,
  isBodySimulatorLivePreviewEnabled,
  adaptPublicFutureToBodySimulator,
  mapPublicBodyFat,
  mapPublicTimeline,
  mapPublicFocusZones,
  mapPublicEffort,
  PUBLIC_FOCUS_ZONE_MAP,
  type PublicFuturePayload,
} from "./PublicFutureToBodySimulatorAdapter";

export type LivePreviewErrorClass =
  | "live_preview_adapter_failed"
  | "live_preview_body_simulator_failed"
  | "live_preview_anatomical_engine_failed"
  | "live_preview_rule_verification_failed"
  | "live_preview_formatter_translation_failed"
  | "live_preview_provider_failed"
  | "body_simulator_live_preview_verification_failed"
  | "anatomical_rules_not_translated";

export class LiveFuturePreviewError extends Error {
  readonly errorClass: LivePreviewErrorClass;
  readonly livePreviewTraceId: string;
  readonly status: number;
  readonly diagnostics: LiveBodySimulatorDiagnostics | null;
  readonly providerCalls: number;
  readonly providerDiagnostics: LiveProviderDiagnostics | null;

  constructor(
    errorClass: LivePreviewErrorClass,
    message: string,
    options: {
      livePreviewTraceId: string;
      status?: number;
      diagnostics?: LiveBodySimulatorDiagnostics | null;
      providerCalls?: number;
      providerDiagnostics?: LiveProviderDiagnostics | null;
    }
  ) {
    super(message);
    this.name = "LiveFuturePreviewError";
    this.errorClass = errorClass;
    this.livePreviewTraceId = options.livePreviewTraceId;
    this.status = options.status ?? 422;
    this.diagnostics = options.diagnostics ?? null;
    this.providerCalls = options.providerCalls ?? 0;
    this.providerDiagnostics = options.providerDiagnostics ?? null;
  }
}

export interface LiveBodySimulatorDiagnostics {
  livePreviewEnabled: boolean;
  livePreviewTraceId: string;
  bodySimulatorExecuted: boolean;
  anatomicalEngineExecuted: boolean;
  bodyFat: {
    current: number | null;
    target: number | null;
    delta: number | null;
  };
  timelineWeeks: number | null;
  timelineSource: string | null;
  timelineScalingCoefficient: number | null;
  effort: {
    publicEffort: string | null;
    canonicalIntensity: string | null;
    anatomicalEffortCoefficient: number | null;
  };
  focusZones: {
    publicFocusZonesReceived: string[];
    canonicalFocusZonesMapped: string[];
    unmappedFocusZones: string[];
  };
  optionalNotePresent: boolean;
  optionalNoteDisposition:
    | "applied"
    | "partially_applied"
    | "suppressed"
    | "none";
  appliedAnatomicalRuleIds: string[];
  appliedFeatures: string[];
  suppressedRuleIds: string[];
  semanticSupportTerms: string[];
  formatterConsumedAnatomicalRules: boolean;
  anatomicalTranslatedChangeCount: number;
  promptContainsAnatomicalIntent: boolean;
  /** Patch 022E-B — safe provider-prompt metrics (no raw prompt). */
  neutralPromptConditioningApplied: boolean;
  providerPromptCharacterCount: number | null;
  providerPromptWordCount: number | null;
  providerPromptAnatomicalTermCount: number | null;
  providerPromptSensitiveLexemeCount: number | null;
  providerPromptPreservationTermCount: number | null;
  providerPromptLexemeSuppressed: ProviderPromptLexemeSuppression[];
  removedReplacedTokenCategories: string[];
  originalProviderPromptCharacterCount: number | null;
  compressedAnatomicalRuleIds: string[];
  optionalNoteConditioning: OptionalNoteProviderConditioning[];
  providerRequestAttempted: boolean;
  providerRequestCount: number;
  providerContract: "flux_kontext_pro_legacy_parity" | "none";
  providerModel: string | null;
  providerInputFieldNames: string[];
  generationPath: "body_simulator_anatomical_live_preview" | "legacy_reservedrift";
  warnings: string[];
  providerDiagnostics?: LiveProviderDiagnostics | null;
  /** Patch 022E-C — safe pre-request / E005 attribution (no secrets). */
  sourceImageMimeType: string | null;
  sourceImageByteLength: number | null;
  sourceImageDimensions: string | null;
  sourceImageDataUriPrefix: string | null;
  sourceImageFieldName: string | null;
  sourceImageSerializationMatchesLegacy: boolean | null;
  conditionedPromptHash: string | null;
  providerPromptUpsampling: boolean | null;
  providerSafetyAttribution: ProviderSafetyAttributionDiagnostic | null;
}

export interface LiveFuturePreviewTraceStage {
  id: string;
  label: string;
  status: "pending" | "ok" | "warn" | "error" | "skipped";
  values: Record<string, string | number | boolean | null>;
  warnings: string[];
}

export interface LiveFuturePreviewPreparation {
  livePreviewTraceId: string;
  adapter: PublicFutureAdapterResult;
  simulateResult: Extract<BodySimulatorSimulateResult, { ok: true }>;
  rules: BodySimulatorTransformationRules;
  canonical: CanonicalBodyTransformation;
  diagnostics: LiveBodySimulatorDiagnostics;
  traceStages: LiveFuturePreviewTraceStage[];
}

function createLivePreviewTraceId(nowMs: number): string {
  const stamp = nowMs.toString(36);
  const rand = randomBytes(6).toString("hex");
  return `lfp_${stamp}_${rand}`;
}

function emptyDiagnostics(
  livePreviewTraceId: string,
  enabled: boolean
): LiveBodySimulatorDiagnostics {
  return {
    livePreviewEnabled: enabled,
    livePreviewTraceId,
    bodySimulatorExecuted: false,
    anatomicalEngineExecuted: false,
    bodyFat: { current: null, target: null, delta: null },
    timelineWeeks: null,
    timelineSource: null,
    timelineScalingCoefficient: null,
    effort: {
      publicEffort: null,
      canonicalIntensity: null,
      anatomicalEffortCoefficient: null,
    },
    focusZones: {
      publicFocusZonesReceived: [],
      canonicalFocusZonesMapped: [],
      unmappedFocusZones: [],
    },
    optionalNotePresent: false,
    optionalNoteDisposition: "none",
    appliedAnatomicalRuleIds: [],
    appliedFeatures: [],
    suppressedRuleIds: [],
    semanticSupportTerms: [],
    formatterConsumedAnatomicalRules: false,
    anatomicalTranslatedChangeCount: 0,
    promptContainsAnatomicalIntent: false,
    neutralPromptConditioningApplied: false,
    providerPromptCharacterCount: null,
    providerPromptWordCount: null,
    providerPromptAnatomicalTermCount: null,
    providerPromptSensitiveLexemeCount: null,
    providerPromptPreservationTermCount: null,
    providerPromptLexemeSuppressed: [],
    removedReplacedTokenCategories: [],
    originalProviderPromptCharacterCount: null,
    compressedAnatomicalRuleIds: [],
    optionalNoteConditioning: [],
    providerRequestAttempted: false,
    providerRequestCount: 0,
    providerContract: "none",
    providerModel: null,
    providerInputFieldNames: [],
    generationPath: enabled
      ? "body_simulator_anatomical_live_preview"
      : "legacy_reservedrift",
    warnings: [],
    providerDiagnostics: null,
    sourceImageMimeType: null,
    sourceImageByteLength: null,
    sourceImageDimensions: null,
    sourceImageDataUriPrefix: null,
    sourceImageFieldName: null,
    sourceImageSerializationMatchesLegacy: null,
    conditionedPromptHash: null,
    providerPromptUpsampling: null,
    providerSafetyAttribution: null,
  };
}

function attachSourceImageMetrics(
  diagnostics: LiveBodySimulatorDiagnostics,
  sourceImageDataUri: string
): void {
  const image = inspectSourceImageDataUriSafe(sourceImageDataUri);
  diagnostics.sourceImageMimeType = image.mimeType;
  diagnostics.sourceImageByteLength = image.byteLength;
  diagnostics.sourceImageDimensions = image.dimensions;
  diagnostics.sourceImageDataUriPrefix = image.dataUriPrefix;
  diagnostics.sourceImageFieldName = image.fieldName;
  diagnostics.sourceImageSerializationMatchesLegacy =
    image.serializationMatchesLegacy;
}

function buildAttributionForLivePath(args: {
  diagnostics: LiveBodySimulatorDiagnostics;
  providerPrompt: string;
  sourceImageDataUri: string;
  promptUpsampling?: boolean | null;
  providerError?: LiveProviderDiagnostics | null;
}): ProviderSafetyAttributionDiagnostic {
  const d = args.diagnostics;
  return buildProviderSafetyAttributionDiagnostic({
    providerError: args.providerError
      ? {
          code: args.providerError.providerErrorCode,
          category: args.providerError.providerErrorCategory,
          httpStatus: args.providerError.providerHttpStatus,
          safeMessage: args.providerError.providerResponseMessageSafe,
        }
      : null,
    sourceImageDataUri: args.sourceImageDataUri,
    providerPrompt: args.providerPrompt,
    promptConditioningApplied: d.neutralPromptConditioningApplied,
    model: d.providerModel || DEFAULT_REPLICATE_TRANSPORT_MODEL,
    endpointClass: "replicate_official_model_predictions",
    providerInputFieldNames: d.providerInputFieldNames.length
      ? d.providerInputFieldNames
      : [...PROVEN_FLUX_INPUT_FIELDS],
    aspectRatio: "match_input_image",
    outputFormat: "png",
    safetyTolerance: 2,
    promptUpsampling: args.promptUpsampling ?? d.providerPromptUpsampling,
    bodyFatDelta: d.bodyFat.delta,
    timelineWeeks: d.timelineWeeks,
    focusZones: d.focusZones.canonicalFocusZonesMapped,
    anatomicalTranslatedChangeCount: d.anatomicalTranslatedChangeCount,
    imageContractMatchesLegacy:
      d.sourceImageSerializationMatchesLegacy === true,
  });
}

function applyNeutralPromptDiagnostics(
  target: LiveBodySimulatorDiagnostics,
  conditioned: NeutralPromptDiagnostics
): void {
  target.neutralPromptConditioningApplied =
    conditioned.neutralPromptConditioningApplied;
  target.providerPromptCharacterCount =
    conditioned.providerPromptCharacterCount;
  target.providerPromptWordCount = conditioned.providerPromptWordCount;
  target.providerPromptAnatomicalTermCount =
    conditioned.providerPromptAnatomicalTermCount;
  target.providerPromptSensitiveLexemeCount =
    conditioned.providerPromptSensitiveLexemeCount;
  target.providerPromptPreservationTermCount =
    conditioned.providerPromptPreservationTermCount;
  target.providerPromptLexemeSuppressed = [
    ...conditioned.providerPromptLexemeSuppressed,
  ];
  target.removedReplacedTokenCategories = [
    ...conditioned.removedReplacedTokenCategories,
  ];
  target.originalProviderPromptCharacterCount =
    conditioned.originalProviderPromptCharacterCount;
  target.compressedAnatomicalRuleIds = [
    ...conditioned.compressedAnatomicalRuleIds,
  ];
  target.optionalNoteConditioning = [...conditioned.optionalNoteConditioning];
}

function noteDispositionFromAnatomical(
  rules: BodySimulatorTransformationRules
): LiveBodySimulatorDiagnostics["optionalNoteDisposition"] {
  const outcomes = rules.anatomicalTransformation?.noteOutcomes ?? [];
  if (outcomes.length === 0) {
    return rules.anatomicalTransformation?.optionalNotesPresent
      ? "suppressed"
      : "none";
  }
  const statuses = new Set(outcomes.map((o) => o.status));
  if (statuses.has("applied") && statuses.size === 1) return "applied";
  if (statuses.has("applied") || statuses.has("partially_applied")) {
    return statuses.has("suppressed") || statuses.has("partially_applied")
      ? "partially_applied"
      : "applied";
  }
  if (statuses.has("partially_applied")) return "partially_applied";
  if (statuses.has("suppressed")) return "suppressed";
  return "none";
}

/**
 * Typed assertion: meaningful anatomical rules must produce anatomical
 * formatter changes (id prefix anat- / sourcePlanField anatomical).
 */
export function assertAnatomicalRulesTranslated(
  rules: BodySimulatorTransformationRules,
  canonical: CanonicalBodyTransformation
): { ok: true; translatedCount: number } | { ok: false; reason: string } {
  const anat = rules.anatomicalTransformation;
  const meaningful = (anat?.rules?.length ?? 0) > 0;
  if (!meaningful) {
    return { ok: true, translatedCount: 0 };
  }

  const translated = canonical.approvedChanges.filter(
    (c) =>
      c.id.startsWith("body-sim-anatomical-") ||
      String(c.sourcePlanField || "").includes("anatomicalTransformation")
  );

  if (translated.length === 0 && (canonical.anatomicalSummaries?.length ?? 0) === 0) {
    return { ok: false, reason: "anatomical_rules_not_translated" };
  }

  if (translated.length === 0) {
    return { ok: false, reason: "anatomical_rules_not_translated" };
  }

  return { ok: true, translatedCount: translated.length };
}

function verifyLivePreviewBeforeProvider(
  adapter: PublicFutureAdapterResult,
  rules: BodySimulatorTransformationRules,
  canonical: CanonicalBodyTransformation
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const base = verifyCanonicalBodySimulatorRules(rules);
  if (!base.ok) errors.push(...base.errors);

  const anat = rules.anatomicalTransformation;
  if (anat == null) {
    errors.push("anatomical_block_missing");
  } else if (anat.schemaVersion !== ANATOMICAL_TRANSFORMATION_SCHEMA_VERSION) {
    errors.push("anatomical_schema_mismatch");
  }

  const bf = adapter.bodyFat;
  if (
    bf.currentBodyFatPercentReceived != null &&
    bf.targetBodyFatPercentReceived != null
  ) {
    if (bf.computedBodyFatDeltaPercentagePoints == null) {
      errors.push("body_fat_delta_missing");
    } else {
      const expected =
        bf.targetBodyFatPercentReceived - bf.currentBodyFatPercentReceived;
      if (bf.computedBodyFatDeltaPercentagePoints !== expected) {
        errors.push("body_fat_delta_mismatch");
      }
      if (
        rules.anatomicalTransformation?.bodyFatContext?.deltaPercentagePoints !=
          null &&
        Math.abs(
          rules.anatomicalTransformation.bodyFatContext.deltaPercentagePoints -
            expected
        ) > 0.01
      ) {
        errors.push("anatomical_body_fat_delta_mismatch");
      }
    }
  }

  if (adapter.timeline.timelineWeeks !== rules.goal.timelineWeeks) {
    errors.push("timeline_mismatch");
  }

  if (!rules.preservation || rules.preservation.identity !== "preserve") {
    errors.push("preservation_identity_missing");
  }

  if (
    (anat?.rules?.length ?? 0) > 0 &&
    (anat?.appliedRuleIds?.length ?? 0) === 0
  ) {
    errors.push("applied_anatomical_rules_missing");
  }

  const translation = assertAnatomicalRulesTranslated(rules, canonical);
  if (!translation.ok) {
    errors.push(translation.reason);
  }

  // No legacy reservedrift markers in canonical source.
  if (canonical.source !== "body_simulator_v1") {
    errors.push("legacy_transform_source_mixed");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

export function buildLiveFuturePreviewTraceStages(
  diagnostics: LiveBodySimulatorDiagnostics,
  outcome: "pending" | "ok" | "error" = "pending"
): LiveFuturePreviewTraceStage[] {
  const warn = diagnostics.warnings;
  return [
    {
      id: "public_future_input",
      label: "Public Future Input",
      status: diagnostics.livePreviewEnabled ? "ok" : "skipped",
      values: {
        livePreviewEnabled: diagnostics.livePreviewEnabled,
        traceId: diagnostics.livePreviewTraceId,
      },
      warnings: [],
    },
    {
      id: "body_simulator_input",
      label: "Body Simulator Input",
      status: diagnostics.bodySimulatorExecuted ? "ok" : "pending",
      values: {
        intensity: diagnostics.effort.canonicalIntensity,
        timelineWeeks: diagnostics.timelineWeeks,
      },
      warnings: [],
    },
    {
      id: "body_fat_delta",
      label: "Body Fat Delta",
      status:
        diagnostics.bodyFat.delta != null
          ? "ok"
          : diagnostics.bodySimulatorExecuted
            ? "warn"
            : "pending",
      values: {
        current: diagnostics.bodyFat.current,
        target: diagnostics.bodyFat.target,
        delta: diagnostics.bodyFat.delta,
      },
      warnings: [],
    },
    {
      id: "timeline_mapping",
      label: "Timeline Mapping",
      status: diagnostics.timelineWeeks != null ? "ok" : "pending",
      values: {
        source: diagnostics.timelineSource,
        weeks: diagnostics.timelineWeeks,
        scalingCoefficient: diagnostics.timelineScalingCoefficient,
      },
      warnings: [],
    },
    {
      id: "focus_mapping",
      label: "Focus Mapping",
      status:
        diagnostics.focusZones.unmappedFocusZones.length > 0 ? "warn" : "ok",
      values: {
        received: diagnostics.focusZones.publicFocusZonesReceived.join(","),
        mapped: diagnostics.focusZones.canonicalFocusZonesMapped.join(","),
        unmapped: diagnostics.focusZones.unmappedFocusZones.join(","),
      },
      warnings:
        diagnostics.focusZones.unmappedFocusZones.length > 0
          ? [`unmapped:${diagnostics.focusZones.unmappedFocusZones.join(",")}`]
          : [],
    },
    {
      id: "anatomical_rules",
      label: "Anatomical Rules",
      status: diagnostics.anatomicalEngineExecuted
        ? diagnostics.appliedAnatomicalRuleIds.length > 0
          ? "ok"
          : "warn"
        : "pending",
      values: {
        appliedCount: diagnostics.appliedAnatomicalRuleIds.length,
        suppressedCount: diagnostics.suppressedRuleIds.length,
        features: diagnostics.appliedFeatures.join(","),
      },
      warnings: [],
    },
    {
      id: "formatter_translation",
      label: "Formatter Translation",
      status: diagnostics.formatterConsumedAnatomicalRules ? "ok" : "pending",
      values: {
        consumed: diagnostics.formatterConsumedAnatomicalRules,
        translatedCount: diagnostics.anatomicalTranslatedChangeCount,
        promptIntent: diagnostics.promptContainsAnatomicalIntent,
      },
      warnings: [],
    },
    {
      id: "neutral_prompt_conditioning",
      label: "Neutral Prompt Conditioning",
      status: diagnostics.neutralPromptConditioningApplied ? "ok" : "pending",
      values: {
        applied: diagnostics.neutralPromptConditioningApplied,
        characterCount: diagnostics.providerPromptCharacterCount,
        wordCount: diagnostics.providerPromptWordCount,
        anatomicalTermCount: diagnostics.providerPromptAnatomicalTermCount,
        sensitiveLexemeCount: diagnostics.providerPromptSensitiveLexemeCount,
        preservationTermCount: diagnostics.providerPromptPreservationTermCount,
        removedCategories: diagnostics.removedReplacedTokenCategories.join(","),
        lexemeSuppressedCount: diagnostics.providerPromptLexemeSuppressed.length,
        originalCharacterCount:
          diagnostics.originalProviderPromptCharacterCount,
      },
      warnings: [],
    },
    {
      id: "provider_attempt",
      label: "Provider Attempt",
      status: diagnostics.providerRequestAttempted
        ? diagnostics.providerRequestCount === 1
          ? "ok"
          : "warn"
        : "pending",
      values: {
        attempted: diagnostics.providerRequestAttempted,
        count: diagnostics.providerRequestCount,
        model: diagnostics.providerModel,
        inputFields: diagnostics.providerInputFieldNames.join(","),
        imageMime: diagnostics.sourceImageMimeType,
        imageBytes: diagnostics.sourceImageByteLength,
        imageDims: diagnostics.sourceImageDimensions,
        imagePrefix: diagnostics.sourceImageDataUriPrefix,
        promptUpsampling: diagnostics.providerPromptUpsampling,
        conditionedPromptHash: diagnostics.conditionedPromptHash,
      },
      warnings: [],
    },
    {
      id: "provider_safety_attribution",
      label: "Provider Safety Attribution",
      status: diagnostics.providerSafetyAttribution
        ? diagnostics.providerSafetyAttribution.attribution.classification ===
          "indeterminate"
          ? "warn"
          : outcome === "error"
            ? "error"
            : "ok"
        : "pending",
      values: projectProviderSafetyAttributionForControlRoom(
        diagnostics.providerSafetyAttribution
      ),
      warnings: [],
    },
    {
      id: "outcome",
      label: "Outcome",
      status: outcome === "ok" ? "ok" : outcome === "error" ? "error" : "pending",
      values: {
        generationPath: diagnostics.generationPath,
      },
      warnings: warn,
    },
  ];
}

/**
 * Prepare live preview through formatter translation (zero provider calls).
 */
export function prepareLiveFuturePreview(
  payload: PublicFuturePayload,
  options?: {
    nowMs?: number;
    livePreviewTraceId?: string;
    enabled?: boolean;
    simulationId?: string;
  }
): LiveFuturePreviewPreparation {
  const nowMs = options?.nowMs ?? Date.now();
  const livePreviewTraceId =
    options?.livePreviewTraceId ?? createLivePreviewTraceId(nowMs);
  const enabled = options?.enabled ?? true;
  const diagnostics = emptyDiagnostics(livePreviewTraceId, enabled);

  const adapted = adaptPublicFutureToBodySimulator(payload, {
    nowMs,
    simulationId: options?.simulationId ?? `lfp${nowMs.toString(16)}prep`,
  });
  if (!adapted.ok) {
    throw new LiveFuturePreviewError(
      "live_preview_adapter_failed",
      adapted.message,
      { livePreviewTraceId, diagnostics, providerCalls: 0 }
    );
  }

  diagnostics.bodyFat = {
    current: adapted.bodyFat.currentBodyFatPercentReceived,
    target: adapted.bodyFat.targetBodyFatPercentReceived,
    delta: adapted.bodyFat.computedBodyFatDeltaPercentagePoints,
  };
  diagnostics.timelineWeeks = adapted.timeline.timelineWeeks;
  diagnostics.timelineSource = adapted.timeline.timelineSource;
  diagnostics.timelineScalingCoefficient =
    adapted.timeline.timelineScalingCoefficient;
  diagnostics.effort = {
    publicEffort: adapted.effort.publicEffort,
    canonicalIntensity: adapted.effort.canonicalIntensity,
    anatomicalEffortCoefficient: adapted.effort.anatomicalEffortCoefficient,
  };
  diagnostics.focusZones = {
    publicFocusZonesReceived: adapted.focus.publicFocusZonesReceived,
    canonicalFocusZonesMapped: adapted.focus.canonicalFocusZonesMapped,
    unmappedFocusZones: adapted.focus.unmappedFocusZones,
  };
  diagnostics.optionalNotePresent = adapted.optionalNotePresent;
  diagnostics.warnings.push(...adapted.warnings);

  let simulateResult: BodySimulatorSimulateResult;
  try {
    simulateResult = simulateBodyTransformation(adapted.input);
  } catch (error) {
    throw new LiveFuturePreviewError(
      "live_preview_body_simulator_failed",
      error instanceof Error ? error.message : "Body Simulator failed.",
      { livePreviewTraceId, diagnostics, providerCalls: 0 }
    );
  }

  diagnostics.bodySimulatorExecuted = true;

  if (!simulateResult.ok) {
    throw new LiveFuturePreviewError(
      "live_preview_body_simulator_failed",
      simulateResult.errors.map((e) => e.message).join("; ") ||
        "Body Simulator validation failed.",
      { livePreviewTraceId, diagnostics, providerCalls: 0 }
    );
  }

  const rules = simulateResult.rules;
  const anat = rules.anatomicalTransformation;
  if (anat == null) {
    throw new LiveFuturePreviewError(
      "live_preview_anatomical_engine_failed",
      "Anatomical Transformation Engine produced no result.",
      { livePreviewTraceId, diagnostics, providerCalls: 0 }
    );
  }

  diagnostics.anatomicalEngineExecuted = true;
  diagnostics.appliedAnatomicalRuleIds = [...anat.appliedRuleIds];
  diagnostics.appliedFeatures = anat.rules.map((r) => r.feature);
  diagnostics.suppressedRuleIds = [...anat.suppressedRuleIds];
  diagnostics.semanticSupportTerms = [...anat.semanticSupportTerms];
  diagnostics.optionalNoteDisposition = noteDispositionFromAnatomical(rules);

  let canonical: CanonicalBodyTransformation;
  try {
    canonical = adaptBodySimulatorRulesToFormatterInput(rules);
  } catch (error) {
    throw new LiveFuturePreviewError(
      "live_preview_formatter_translation_failed",
      error instanceof Error ? error.message : "Formatter adapter failed.",
      { livePreviewTraceId, diagnostics, providerCalls: 0 }
    );
  }

  const translation = assertAnatomicalRulesTranslated(rules, canonical);
  if (!translation.ok) {
    diagnostics.formatterConsumedAnatomicalRules = false;
    throw new LiveFuturePreviewError(
      "anatomical_rules_not_translated",
      "Canonical anatomical rules were not translated by the formatter adapter.",
      { livePreviewTraceId, diagnostics, providerCalls: 0 }
    );
  }

  diagnostics.formatterConsumedAnatomicalRules =
    translation.translatedCount > 0 || anat.rules.length === 0;
  diagnostics.anatomicalTranslatedChangeCount = translation.translatedCount;
  diagnostics.promptContainsAnatomicalIntent =
    translation.translatedCount > 0 ||
    (canonical.anatomicalSummaries?.length ?? 0) > 0;

  const verification = verifyLivePreviewBeforeProvider(
    adapted,
    rules,
    canonical
  );
  if (!verification.ok) {
    throw new LiveFuturePreviewError(
      verification.errors.includes("anatomical_rules_not_translated")
        ? "anatomical_rules_not_translated"
        : "body_simulator_live_preview_verification_failed",
      `Live preview verification failed: ${verification.errors.join(", ")}`,
      { livePreviewTraceId, diagnostics, providerCalls: 0 }
    );
  }

  const traceStages = buildLiveFuturePreviewTraceStages(diagnostics, "pending");

  return {
    livePreviewTraceId,
    adapter: adapted,
    simulateResult,
    rules,
    canonical,
    diagnostics,
    traceStages,
  };
}

function buildShellProfileAndGoal(prep: LiveFuturePreviewPreparation) {
  const bf = prep.diagnostics.bodyFat;
  const profile = {
    schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
    sex:
      prep.adapter.input.profile.sexForPhysiology === "male"
        ? ("male" as const)
        : prep.adapter.input.profile.sexForPhysiology === "female"
          ? ("female" as const)
          : ("unspecified" as const),
    age: prep.adapter.input.profile.ageYears ?? 30,
    heightCm: prep.adapter.input.profile.heightCm ?? 170,
    weightKg: prep.adapter.input.profile.currentWeightKg ?? 70,
    bodyFatPct: bf.current ?? 22,
    trainingLevel: "intermediate" as const,
    trainingAgeYears: 2,
    activityLevel: "moderate" as const,
    nutritionQuality: "good" as const,
  };

  const goal = {
    schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
    fatDirection: (bf.delta != null && bf.delta > 0
      ? "increase"
      : bf.delta != null && bf.delta < 0
        ? "decrease"
        : "maintain") as "increase" | "decrease" | "maintain",
    muscleDirection: "increase" as const,
    ...(bf.target != null ? { targetBodyFatPct: bf.target } : {}),
    timelineWeeks: prep.diagnostics.timelineWeeks ?? 12,
    effortLevel: "high" as const,
    focusZones: ["waist" as const],
    musclePriority: 0.5,
    fatLossPriority: 0.7,
    outcomes: ["fat_loss" as const],
  };

  return { profile, goal };
}

export interface LiveFuturePreviewRunInput {
  payload: PublicFuturePayload;
  sourceImageDataUri: string;
  mimeType?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  nowMs?: number;
  /**
   * Test-only transport mock. Production live path uses the proven
   * Flux Kontext Pro contract from lib/replicate.js (not this adapter).
   */
  transportAdapter?: ReplicateTransportAdapterType;
  transportDependencies?: ReplicateTransportDependencies;
  /** Optional override of proven Flux helper (tests). */
  fluxProvider?: ProvenFluxKontextProHelpers["runFluxKontextProOnce"];
  /** When true, stop after formatter — zero provider calls. */
  dryRun?: boolean;
}

export interface LiveFuturePreviewSuccess {
  ok: true;
  imageUrl: string | null;
  livePreviewTraceId: string;
  livePreviewDiagnostics: LiveBodySimulatorDiagnostics;
  liveFuturePreviewTrace: LiveFuturePreviewTraceStage[];
  bodySimulatorPreviewActive: true;
  attempt: string;
  usedFallback: false;
  model: string | null;
  disclaimer: string;
  providerRequestCount: number;
}

function throwProviderFailed(
  prep: LiveFuturePreviewPreparation,
  message: unknown,
  options: {
    status?: number;
    code?: string | null;
    model?: string | null;
    inputFieldNames?: string[] | null;
    providerCalls?: number;
    providerPrompt?: string;
    sourceImageDataUri?: string;
    promptUpsampling?: boolean | null;
  } = {}
): never {
  const providerDiagnostics = buildLiveProviderDiagnostics({
    status: options.status ?? 502,
    code: options.code,
    message,
    model: options.model,
    inputFieldNames: options.inputFieldNames,
  });
  prep.diagnostics.providerRequestAttempted = true;
  prep.diagnostics.providerRequestCount = options.providerCalls ?? 1;
  prep.diagnostics.providerContract = "flux_kontext_pro_legacy_parity";
  prep.diagnostics.providerModel = providerDiagnostics.providerModel;
  prep.diagnostics.providerInputFieldNames =
    providerDiagnostics.providerInputFieldNames;
  prep.diagnostics.providerDiagnostics = providerDiagnostics;
  if (options.sourceImageDataUri) {
    attachSourceImageMetrics(prep.diagnostics, options.sourceImageDataUri);
  }
  if (typeof options.promptUpsampling === "boolean") {
    prep.diagnostics.providerPromptUpsampling = options.promptUpsampling;
  }
  if (options.providerPrompt != null || options.sourceImageDataUri) {
    prep.diagnostics.providerSafetyAttribution = buildAttributionForLivePath({
      diagnostics: prep.diagnostics,
      providerPrompt: options.providerPrompt || "",
      sourceImageDataUri: options.sourceImageDataUri || "",
      promptUpsampling: options.promptUpsampling,
      providerError: providerDiagnostics,
    });
    prep.diagnostics.conditionedPromptHash =
      prep.diagnostics.providerSafetyAttribution.promptMetrics
        .conditionedPromptHash;
  }

  throw new LiveFuturePreviewError(
    "live_preview_provider_failed",
    providerDiagnostics.providerResponseMessageSafe,
    {
      livePreviewTraceId: prep.livePreviewTraceId,
      diagnostics: prep.diagnostics,
      status: options.status ?? 502,
      providerCalls: options.providerCalls ?? 1,
      providerDiagnostics,
    }
  );
}

/**
 * Full live Future preview path. Exactly one provider request when not dryRun.
 *
 * Transformation authority: Body Simulator → Anatomical → Formatter.
 * Provider transport: proven Flux Kontext Pro contract from lib/replicate.js
 * (same field names / endpoint / auth as legacy generateWithReplicate).
 */
export async function runLiveFuturePreview(
  input: LiveFuturePreviewRunInput
): Promise<LiveFuturePreviewSuccess> {
  const env = input.env ?? process.env;
  if (!isBodySimulatorLivePreviewEnabled(env) && input.dryRun !== true) {
    // Caller should not reach here when flag is off; fail closed for safety.
    throw new LiveFuturePreviewError(
      "live_preview_adapter_failed",
      "Live Future preview flag is not enabled.",
      {
        livePreviewTraceId: createLivePreviewTraceId(Date.now()),
        status: 503,
        providerCalls: 0,
      }
    );
  }

  const prep = prepareLiveFuturePreview(input.payload, {
    nowMs: input.nowMs,
    enabled: true,
  });

  if (input.dryRun) {
    return {
      ok: true,
      imageUrl: null,
      livePreviewTraceId: prep.livePreviewTraceId,
      livePreviewDiagnostics: {
        ...prep.diagnostics,
        providerRequestAttempted: false,
        providerRequestCount: 0,
      },
      liveFuturePreviewTrace: buildLiveFuturePreviewTraceStages(
        prep.diagnostics,
        "ok"
      ),
      bodySimulatorPreviewActive: true,
      attempt: "body-simulator-anatomical-live-preview-dry",
      usedFallback: false,
      model: null,
      disclaimer:
        "Realistic motivational visualization from Body Simulator anatomical rules — not a medical prediction or flattering ideal.",
      providerRequestCount: 0,
    };
  }

  const { profile, goal } = buildShellProfileAndGoal(prep);

  // Format anatomical prompt via existing FluxFormatter (zero provider calls).
  // Do not force aspectRatio — proven Flux contract uses match_input_image.
  const runtime = new AiOsRuntime(
    createAiOsRuntimeDependencies({
      ...(input.transportAdapter
        ? { transportAdapter: input.transportAdapter }
        : {}),
      now: () => input.nowMs ?? Date.now(),
    })
  );

  let formatResult;
  try {
    formatResult = await runtime.run({
      mode: "dry_run",
      profile: profile as never,
      goal: goal as never,
      canonicalBodyTransformation: prep.canonical,
      formatterOptions: {
        quality: "standard",
      },
    });
  } catch (error) {
    throw new LiveFuturePreviewError(
      "live_preview_formatter_translation_failed",
      error instanceof Error ? error.message : "Formatter failed.",
      {
        livePreviewTraceId: prep.livePreviewTraceId,
        diagnostics: prep.diagnostics,
        status: 422,
        providerCalls: 0,
      }
    );
  }

  const formatted = formatResult.artifacts.formattedRequest;
  const anatomicalPrompt =
    typeof formatted?.prompt === "string" ? formatted.prompt.trim() : "";
  if (!formatResult.success || !formatted || !anatomicalPrompt) {
    const detail =
      formatResult.errors?.filter((e) => typeof e === "string").join("; ") ||
      formatResult.terminalOutcome ||
      "Anatomical formatter did not produce a provider prompt.";
    throw new LiveFuturePreviewError(
      "live_preview_formatter_translation_failed",
      detail,
      {
        livePreviewTraceId: prep.livePreviewTraceId,
        diagnostics: prep.diagnostics,
        status: 422,
        providerCalls: 0,
      }
    );
  }

  // Patch 022E-B: condition provider-facing prompt only (canonical rules unchanged).
  const conditioned = conditionAnatomicalProviderPrompt({
    formattedPrompt: anatomicalPrompt,
    canonical: prep.canonical,
    anatomicalRules: prep.rules.anatomicalTransformation?.rules ?? [],
    optionalNotes: prep.adapter.input.optionalNotes ?? [],
  });
  const providerPrompt = conditioned.conditionedPrompt;
  formatted.prompt = providerPrompt;
  // Avoid appending sensitive denial stacks via transport EXCLUSIONS appendix.
  if (typeof formatted.negativePrompt === "string") {
    delete formatted.negativePrompt;
  }

  applyNeutralPromptDiagnostics(prep.diagnostics, conditioned.diagnostics);
  prep.diagnostics.promptContainsAnatomicalIntent = true;
  prep.diagnostics.providerRequestAttempted = true;
  prep.diagnostics.providerContract = "flux_kontext_pro_legacy_parity";
  prep.diagnostics.providerModel = DEFAULT_REPLICATE_TRANSPORT_MODEL;
  prep.diagnostics.providerInputFieldNames = [...PROVEN_FLUX_INPUT_FIELDS];
  attachSourceImageMetrics(prep.diagnostics, input.sourceImageDataUri);

  const horizon =
    typeof input.payload.horizon === "string" && input.payload.horizon.trim()
      ? input.payload.horizon.trim()
      : prep.diagnostics.timelineSource || "12w";
  const horizonDate =
    typeof input.payload.horizonDate === "string"
      ? input.payload.horizonDate
      : "";

  // Resolve prompt_upsampling the same way as proven Flux helper (no network).
  let promptUpsampling: boolean | null = null;
  try {
    const helpers = loadProvenFluxKontextProHelpers();
    const built = helpers.buildFluxKontextProInput({
      prompt: providerPrompt,
      imageDataUri: input.sourceImageDataUri,
      bfNow: prep.diagnostics.bodyFat.current,
      bfGoal: prep.diagnostics.bodyFat.target,
      horizon,
      horizonDate,
    });
    promptUpsampling =
      typeof built.prompt_upsampling === "boolean"
        ? built.prompt_upsampling
        : null;
  } catch {
    promptUpsampling = null;
  }
  prep.diagnostics.providerPromptUpsampling = promptUpsampling;

  // Parity metrics on success path too (022E-C).
  prep.diagnostics.providerSafetyAttribution = buildAttributionForLivePath({
    diagnostics: prep.diagnostics,
    providerPrompt,
    sourceImageDataUri: input.sourceImageDataUri,
    promptUpsampling,
    providerError: null,
  });
  prep.diagnostics.conditionedPromptHash =
    prep.diagnostics.providerSafetyAttribution.promptMetrics
      .conditionedPromptHash;

  // Test-only: injected transport adapter (one call, no auto-retry).
  if (input.transportAdapter) {
    let transport: ReplicateTransportResult;
    try {
      transport = await input.transportAdapter.generate({
        formattedRequest: formatted,
        sourceImage: {
          kind: "data_uri",
          value: input.sourceImageDataUri,
          contentType: (input.mimeType === "image/png" ||
          input.mimeType === "image/webp"
            ? input.mimeType
            : "image/jpeg") as "image/jpeg" | "image/png" | "image/webp",
        },
        traceId: prep.livePreviewTraceId,
      });
    } catch (error) {
      throwProviderFailed(prep, error instanceof Error ? error.message : error, {
        status: 502,
        providerCalls: 1,
        providerPrompt,
        sourceImageDataUri: input.sourceImageDataUri,
        promptUpsampling,
      });
    }

    prep.diagnostics.providerRequestCount = 1;
    if (!transport || transport.success !== true || !transport.imageUrl) {
      const failure = transport && transport.success === false ? transport : null;
      throwProviderFailed(
        prep,
        failure?.error?.message || "Provider request failed.",
        {
          status: 502,
          code: failure?.error?.code ?? null,
          model: failure?.model ?? DEFAULT_REPLICATE_TRANSPORT_MODEL,
          providerCalls: 1,
          providerPrompt,
          sourceImageDataUri: input.sourceImageDataUri,
          promptUpsampling,
        }
      );
    }

    const imageUrl = transport.imageUrl;
    const model = transport.model ?? DEFAULT_REPLICATE_TRANSPORT_MODEL;
    const diagnostics: LiveBodySimulatorDiagnostics = {
      ...prep.diagnostics,
      providerRequestAttempted: true,
      providerRequestCount: 1,
      promptContainsAnatomicalIntent: true,
      providerModel: model,
    };

    return {
      ok: true,
      imageUrl,
      livePreviewTraceId: prep.livePreviewTraceId,
      livePreviewDiagnostics: diagnostics,
      liveFuturePreviewTrace: buildLiveFuturePreviewTraceStages(
        diagnostics,
        "ok"
      ),
      bodySimulatorPreviewActive: true,
      attempt: "body-simulator-anatomical-live-preview",
      usedFallback: false,
      model,
      disclaimer:
        "Realistic motivational visualization from Body Simulator anatomical rules — not a medical prediction or flattering ideal.",
      providerRequestCount: 1,
    };
  }

  // Production live path: proven Flux Kontext Pro contract (lib/replicate.js).
  const token =
    typeof env.REPLICATE_API_TOKEN === "string" && env.REPLICATE_API_TOKEN.trim()
      ? env.REPLICATE_API_TOKEN.trim()
      : "";
  if (!token && input.fluxProvider == null) {
    throwProviderFailed(prep, "Provider is not configured.", {
      status: 503,
      code: "missing_token",
      providerCalls: 0,
      providerPrompt,
      sourceImageDataUri: input.sourceImageDataUri,
      promptUpsampling,
    });
  }

  const runOnce =
    input.fluxProvider ?? loadProvenFluxKontextProHelpers().runFluxKontextProOnce;

  let generated: {
    imageUrl: string;
    model: string;
    attempt?: string;
    inputFieldNames?: string[];
  };
  try {
    generated = await runOnce({
      imageDataUri: input.sourceImageDataUri,
      prompt: providerPrompt,
      token,
      model: DEFAULT_REPLICATE_TRANSPORT_MODEL,
      bfNow: prep.diagnostics.bodyFat.current,
      bfGoal: prep.diagnostics.bodyFat.target,
      horizon,
      horizonDate,
    });
  } catch (error) {
    const err = error as {
      message?: string;
      status?: number;
      code?: string;
      providerErrorCode?: string;
      providerInputFieldNames?: string[];
      providerModel?: string;
      replicateRaw?: string;
    };
    throwProviderFailed(prep, err.replicateRaw || err.message || error, {
      status: typeof err.status === "number" ? err.status : 502,
      code: err.providerErrorCode || err.code || null,
      model: err.providerModel || DEFAULT_REPLICATE_TRANSPORT_MODEL,
      inputFieldNames: err.providerInputFieldNames || [...PROVEN_FLUX_INPUT_FIELDS],
      providerCalls: 1,
      providerPrompt,
      sourceImageDataUri: input.sourceImageDataUri,
      promptUpsampling,
    });
  }

  prep.diagnostics.providerRequestCount = 1;
  if (!generated?.imageUrl) {
    throwProviderFailed(prep, "Provider returned no image URL.", {
      status: 502,
      providerCalls: 1,
      inputFieldNames: generated?.inputFieldNames || [...PROVEN_FLUX_INPUT_FIELDS],
      providerPrompt,
      sourceImageDataUri: input.sourceImageDataUri,
      promptUpsampling,
    });
  }

  const diagnostics: LiveBodySimulatorDiagnostics = {
    ...prep.diagnostics,
    providerRequestAttempted: true,
    providerRequestCount: 1,
    promptContainsAnatomicalIntent: true,
    providerContract: "flux_kontext_pro_legacy_parity",
    providerModel: generated.model || DEFAULT_REPLICATE_TRANSPORT_MODEL,
    providerInputFieldNames:
      generated.inputFieldNames || [...PROVEN_FLUX_INPUT_FIELDS],
  };

  return {
    ok: true,
    imageUrl: generated.imageUrl,
    livePreviewTraceId: prep.livePreviewTraceId,
    livePreviewDiagnostics: diagnostics,
    liveFuturePreviewTrace: buildLiveFuturePreviewTraceStages(
      diagnostics,
      "ok"
    ),
    bodySimulatorPreviewActive: true,
    attempt: "body-simulator-anatomical-live-preview",
    usedFallback: false,
    model: generated.model || DEFAULT_REPLICATE_TRANSPORT_MODEL,
    disclaimer:
      "Realistic motivational visualization from Body Simulator anatomical rules — not a medical prediction or flattering ideal.",
    providerRequestCount: 1,
  };
}

/** Stable hash helper for coefficient regression tests. */
export function sha256FileBytes(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}
