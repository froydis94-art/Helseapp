/**
 * Live Future Preview pipeline (Demand 022E).
 *
 * Public Future payload → adapter → Body Simulator → Anatomical Engine →
 * canonical verification → formatter adapter → (optional) existing formatter /
 * provider. Feature-flagged; no silent legacy fallback when ON.
 */

import { createHash, randomBytes } from "node:crypto";

import { BODY_PROFILE_SCHEMA_VERSION } from "../BodyProfile";
import {
  AiOsRuntime,
  createAiOsRuntimeDependencies,
} from "../runtime";
import { TRANSFORMATION_GOAL_SCHEMA_VERSION } from "../TransformationGoal";
import {
  DEFAULT_MAX_POLL_ATTEMPTS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_REPLICATE_API_BASE_URL,
  DEFAULT_REPLICATE_TRANSPORT_MODEL,
  DEFAULT_TOTAL_TIMEOUT_MS,
  ReplicateTransportAdapter,
  type ReplicateTransportAdapter as ReplicateTransportAdapterType,
  type ReplicateTransportConfig,
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

  constructor(
    errorClass: LivePreviewErrorClass,
    message: string,
    options: {
      livePreviewTraceId: string;
      status?: number;
      diagnostics?: LiveBodySimulatorDiagnostics | null;
      providerCalls?: number;
    }
  ) {
    super(message);
    this.name = "LiveFuturePreviewError";
    this.errorClass = errorClass;
    this.livePreviewTraceId = options.livePreviewTraceId;
    this.status = options.status ?? 422;
    this.diagnostics = options.diagnostics ?? null;
    this.providerCalls = options.providerCalls ?? 0;
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
  providerRequestAttempted: boolean;
  providerRequestCount: number;
  generationPath: "body_simulator_anatomical_live_preview" | "legacy_reservedrift";
  warnings: string[];
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
    providerRequestAttempted: false,
    providerRequestCount: 0,
    generationPath: enabled
      ? "body_simulator_anatomical_live_preview"
      : "legacy_reservedrift",
    warnings: [],
  };
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
      },
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
  transportAdapter?: ReplicateTransportAdapterType;
  transportDependencies?: ReplicateTransportDependencies;
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

function buildTransportConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
): ReplicateTransportConfig {
  const token =
    typeof env.REPLICATE_API_TOKEN === "string" && env.REPLICATE_API_TOKEN.trim()
      ? env.REPLICATE_API_TOKEN.trim()
      : null;
  return {
    enabled: token != null,
    apiToken: token,
    apiBaseUrl: DEFAULT_REPLICATE_API_BASE_URL,
    model: DEFAULT_REPLICATE_TRANSPORT_MODEL,
    createTimeoutMs: 60_000,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    totalTimeoutMs: Math.max(DEFAULT_TOTAL_TIMEOUT_MS, 120_000),
    maxPollAttempts: DEFAULT_MAX_POLL_ATTEMPTS,
  };
}

/**
 * Full live Future preview path. Exactly one provider request when not dryRun.
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

  let transportAdapter = input.transportAdapter;
  if (transportAdapter == null) {
    const config = buildTransportConfig(env);
    if (config.apiToken == null) {
      throw new LiveFuturePreviewError(
        "live_preview_provider_failed",
        "Provider is not configured.",
        {
          livePreviewTraceId: prep.livePreviewTraceId,
          diagnostics: prep.diagnostics,
          status: 503,
          providerCalls: 0,
        }
      );
    }
    transportAdapter = new ReplicateTransportAdapter(
      config,
      input.transportDependencies
    );
  }

  prep.diagnostics.providerRequestAttempted = true;

  const runtime = new AiOsRuntime(
    createAiOsRuntimeDependencies({
      transportAdapter,
      now: () => input.nowMs ?? Date.now(),
    })
  );

  let runtimeResult;
  try {
    runtimeResult = await runtime.run({
      mode: "transport_mock",
      profile: profile as never,
      goal: goal as never,
      canonicalBodyTransformation: prep.canonical,
      formatterOptions: {
        aspectRatio: "3:4",
        quality: "standard",
      },
      sourceImage: {
        kind: "data_uri",
        value: input.sourceImageDataUri,
        contentType: (input.mimeType === "image/png" ||
        input.mimeType === "image/webp"
          ? input.mimeType
          : "image/jpeg") as "image/jpeg" | "image/png" | "image/webp",
      },
    });
  } catch (error) {
    prep.diagnostics.providerRequestCount = 1;
    throw new LiveFuturePreviewError(
      "live_preview_provider_failed",
      error instanceof Error ? error.message : "Provider request failed.",
      {
        livePreviewTraceId: prep.livePreviewTraceId,
        diagnostics: prep.diagnostics,
        status: 502,
        providerCalls: 1,
      }
    );
  }

  prep.diagnostics.providerRequestCount = 1;

  const transport = runtimeResult.artifacts.transportResult as
    | ReplicateTransportResult
    | undefined;

  if (!transport || transport.success !== true || !transport.imageUrl) {
    throw new LiveFuturePreviewError(
      "live_preview_provider_failed",
      "Provider request failed.",
      {
        livePreviewTraceId: prep.livePreviewTraceId,
        diagnostics: prep.diagnostics,
        status: 502,
        providerCalls: 1,
      }
    );
  }

  const diagnostics: LiveBodySimulatorDiagnostics = {
    ...prep.diagnostics,
    providerRequestAttempted: true,
    providerRequestCount: 1,
    promptContainsAnatomicalIntent: true,
  };

  return {
    ok: true,
    imageUrl: transport.imageUrl,
    livePreviewTraceId: prep.livePreviewTraceId,
    livePreviewDiagnostics: diagnostics,
    liveFuturePreviewTrace: buildLiveFuturePreviewTraceStages(
      diagnostics,
      "ok"
    ),
    bodySimulatorPreviewActive: true,
    attempt: "body-simulator-anatomical-live-preview",
    usedFallback: false,
    model: transport.model ?? DEFAULT_REPLICATE_TRANSPORT_MODEL,
    disclaimer:
      "Realistic motivational visualization from Body Simulator anatomical rules — not a medical prediction or flattering ideal.",
    providerRequestCount: 1,
  };
}

/** Stable hash helper for coefficient regression tests. */
export function sha256FileBytes(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}
