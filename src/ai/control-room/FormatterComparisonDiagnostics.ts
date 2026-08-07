/**
 * Demand 022B-A — Formatter Comparison, Generation Diagnostics, Pipeline Snapshot.
 *
 * Internal / comparison-only. Never production. Never sends the legacy
 * formatter path to a provider. No second provider request / image generation.
 *
 * Session-only structures for Control Room inspection (in-memory / response
 * payload). Not persisted to disk or DB.
 */

import type { BodyProfile } from "../BodyProfile";
import type { TransformationGoal } from "../TransformationGoal";
import {
  BODY_SIMULATOR_RULES_SCHEMA_VERSION,
  BODY_SIMULATOR_RULES_VERSION,
  type BodySimulatorTransformationRules,
} from "../body-simulator/BodySimulatorTypes";
import {
  CANONICAL_BODY_TRANSFORMATION_SCHEMA_VERSION,
  adaptBodySimulatorRulesToFormatterInput,
  applyCanonicalBodyTransformation,
  buildFormatterInputInspectionView,
  type FormatterInputInspectionView,
} from "../body-simulator/BodySimulatorFormatterAdapter";
import {
  FLUX_FORMATTER_VERSION,
  FluxFormatter,
  type FormattedImageRequest,
  type FormatterOptions,
} from "../formatters";
import { buildRenderPlan, type RenderPlan } from "../render";
import { TransformationEngine } from "../TransformationEngine";
import { directVisual } from "../visual";

export const FORMATTER_COMPARISON_SCHEMA_VERSION = 1 as const;
export const GENERATION_DIAGNOSTICS_SCHEMA_VERSION = 1 as const;
export const PIPELINE_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export const LEGACY_FORMATTER_PATH_ID = "legacy_formatter" as const;
export const BODY_SIMULATOR_FORMATTER_PATH_ID =
  "body_simulator_formatter" as const;

/** Rough chars→tokens heuristic — explicitly labeled estimate, not a billing API. */
export const TOKEN_ESTIMATE_CHARS_PER_TOKEN = 4 as const;

export type FormatterPathId =
  | typeof LEGACY_FORMATTER_PATH_ID
  | typeof BODY_SIMULATOR_FORMATTER_PATH_ID;

export interface FormatterPathPromptSummary {
  positiveLength: number;
  negativeLength: number;
  totalLength: number;
  /** Truncated preview for inspector — never a full secret-bearing payload. */
  positivePreview: string;
  approvedChangeIds: string[];
}

export interface FormatterPathFormatterSummary {
  formatterName: string;
  formatterVersion: string;
  visualIntensity: string;
  changeVisibility: string;
  approvedChangeCount: number;
  approvedChangeIds: string[];
  /** Flattened identity/scene preservation key list from RenderPlan. */
  preservationKeys: string[];
}

export interface FormatterPathSide {
  pathId: FormatterPathId;
  /** Legacy path is always deprecated; Body Simulator is the live internal path. */
  deprecated: boolean;
  /** Always false for legacy — never production. */
  productionEligible: false;
  neverProduction: boolean;
  promptSummary: FormatterPathPromptSummary;
  formatterSummary: FormatterPathFormatterSummary;
}

export interface FormatterComparison {
  schemaVersion: typeof FORMATTER_COMPARISON_SCHEMA_VERSION;
  purpose: "internal_comparison_only";
  lifetime: "session_only";
  persisted: false;
  legacyPath: FormatterPathSide;
  bodySimulatorPath: FormatterPathSide;
  addedFields: string[];
  removedFields: string[];
  changedTransformationFields: string[];
  changedPreservationFields: string[];
  promptLengthDelta: number;
  summaryDifferences: string[];
  /** Invariant: comparison never calls transport / providers. */
  providerCallsFromComparison: 0;
}

export type DiagnosticsNotRun = "not_run";

export interface EstimatedMetric {
  value: number | null;
  labeling: "estimate";
  note: string;
}

export interface GenerationDiagnostics {
  schemaVersion: typeof GENERATION_DIAGNOSTICS_SCHEMA_VERSION;
  lifetime: "session_only";
  persisted: false;
  /** Demand 022C — which path produced the provider request (when any). */
  generationPath?: "legacy" | "body_simulator" | null;
  /**
   * Demand 022C — Body Simulator rules version when used; null on legacy path.
   * Distinct from bodySimulatorVersion which may carry a placeholder label.
   */
  bodySimulatorRules: string | null;
  /** Demand 022C — true when the provider-bound path was the deprecated legacy baseline. */
  deprecatedBaseline: boolean;
  bodySimulatorVersion: string;
  formatterVersion: string;
  formatterSchema: string;
  ruleSchema: string;
  scenario: string;
  timeline: number | null;
  intensity: string | null;
  promptLength: number | null;
  estimatedTokens: EstimatedMetric;
  estimatedProviderCost: EstimatedMetric;
  generationDurationMs: number | null;
  provider: string | null;
  model: string | null;
  httpStatus: number | null | DiagnosticsNotRun;
  retryCount: number | null | DiagnosticsNotRun;
  warnings: string[];
  limitations: string[];
  providerClassification:
    | "dry_run_no_provider"
    | "internal_preview"
    | "not_run"
    | "comparison_only";
  timestamp: string;
}

export interface PipelineSnapshot {
  schemaVersion: typeof PIPELINE_SNAPSHOT_SCHEMA_VERSION;
  lifetime: "session_only";
  persisted: false;
  downloadAvailable: false;
  transformationRules: unknown;
  formatterInput: FormatterInputInspectionView | null;
  formatterOutput: {
    formatterName: string | null;
    formatterVersion: string | null;
    providerFamily: string | null;
    approvedChangeIds: string[];
    visualIntensity: string | null;
    changeVisibility: string | null;
  } | null;
  prompt: {
    positivePrompt: string;
    negativePrompt: string;
    totalLength: number;
  } | null;
  generationDiagnostics: GenerationDiagnostics | null;
  previewMetadata: {
    mode: string;
    scenarioId: string;
    bodySimulatorScenarioId: string | null;
    formatterComparisonPresent: boolean;
    /** True only when Demand 022C generationPath === "legacy". */
    legacyPathSentToProvider: boolean;
    /** True only when Demand 022C generationPath === "body_simulator". */
    bodySimulatorPathSentToProvider: boolean;
    generationPath: "legacy" | "body_simulator" | null;
  };
}

export interface LegacyFormatterComparisonRun {
  renderPlan: RenderPlan;
  formatted: FormattedImageRequest;
  /** Always 0 — comparison must never touch transport. */
  providerCalls: 0;
}

const PREVIEW_CHARS = 180;

function truncatePreview(text: string): string {
  if (text.length <= PREVIEW_CHARS) return text;
  return `${text.slice(0, PREVIEW_CHARS)}…`;
}

function preservationKeysFromRenderPlan(plan: RenderPlan): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(plan.identity)) {
    keys.push(`identity.${k}=${String(v)}`);
  }
  for (const [k, v] of Object.entries(plan.scene)) {
    keys.push(`scene.${k}=${String(v)}`);
  }
  return keys.sort();
}

function buildPathSide(options: {
  pathId: FormatterPathId;
  deprecated: boolean;
  neverProduction: boolean;
  renderPlan: RenderPlan;
  formatted: FormattedImageRequest;
}): FormatterPathSide {
  const positive = options.formatted.prompt ?? "";
  const negative = options.formatted.negativePrompt ?? "";
  const ids = options.renderPlan.transformation.approvedChanges.map((c) => c.id);
  return {
    pathId: options.pathId,
    deprecated: options.deprecated,
    productionEligible: false,
    neverProduction: options.neverProduction,
    promptSummary: {
      positiveLength: positive.length,
      negativeLength: negative.length,
      totalLength: positive.length + negative.length,
      positivePreview: truncatePreview(positive),
      approvedChangeIds: [...ids],
    },
    formatterSummary: {
      formatterName: options.formatted.metadata.formatterName,
      formatterVersion: options.formatted.metadata.formatterVersion,
      visualIntensity: options.renderPlan.transformation.visualIntensity,
      changeVisibility: options.renderPlan.transformation.changeVisibility,
      approvedChangeCount: ids.length,
      approvedChangeIds: [...ids],
      preservationKeys: preservationKeysFromRenderPlan(options.renderPlan),
    },
  };
}

/**
 * Run the deprecated legacy TransformationEngine → RenderPlan → FluxFormatter
 * path in-memory for comparison only. Never production. Never transport.
 */
export function runLegacyFormatterComparisonPath(options: {
  profile: BodyProfile;
  goal: TransformationGoal;
  formatterOptions?: FormatterOptions;
}): LegacyFormatterComparisonRun {
  const engine = new TransformationEngine();
  const plan = engine.compute(options.profile, options.goal);
  const direction = directVisual(options.profile, options.goal, plan);
  const renderPlan = buildRenderPlan(plan, direction);
  const formatter = new FluxFormatter();
  const formatted = formatter.format(renderPlan, options.formatterOptions);
  return {
    renderPlan,
    formatted,
    providerCalls: 0,
  };
}

/**
 * Run Body Simulator canonical → apply → FluxFormatter in-memory for the
 * comparison side. Does not call transport. Translate/apply only.
 */
export function runBodySimulatorFormatterComparisonPath(options: {
  rules: BodySimulatorTransformationRules;
  profile: BodyProfile;
  goal: TransformationGoal;
  formatterOptions?: FormatterOptions;
}): {
  renderPlan: RenderPlan;
  formatted: FormattedImageRequest;
  canonicalApprovedChangeIds: string[];
  providerCalls: 0;
} {
  const canonical = adaptBodySimulatorRulesToFormatterInput(options.rules);
  const engine = new TransformationEngine();
  const plan = engine.compute(options.profile, options.goal);
  const direction = directVisual(options.profile, options.goal, plan);
  const base = buildRenderPlan(plan, direction);
  const renderPlan = applyCanonicalBodyTransformation(base, canonical);
  const formatter = new FluxFormatter();
  const formatted = formatter.format(renderPlan, options.formatterOptions);
  return {
    renderPlan,
    formatted,
    canonicalApprovedChangeIds: canonical.approvedChanges.map((c) => c.id),
    providerCalls: 0,
  };
}

function flattenTransformationFieldMap(plan: RenderPlan): Map<string, string> {
  const map = new Map<string, string>();
  map.set(
    "transformation.visualIntensity",
    String(plan.transformation.visualIntensity)
  );
  map.set(
    "transformation.changeVisibility",
    String(plan.transformation.changeVisibility)
  );
  for (const change of plan.transformation.approvedChanges) {
    map.set(
      `transformation.approvedChanges.${change.id}`,
      `${change.kind}|${change.direction}|${change.visibility}|${change.description}`
    );
  }
  return map;
}

function flattenPreservationFieldMap(plan: RenderPlan): Map<string, string> {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(plan.identity)) {
    map.set(`identity.${k}`, String(v));
  }
  for (const [k, v] of Object.entries(plan.scene)) {
    map.set(`scene.${k}`, String(v));
  }
  map.set(
    "anatomy.preserveSkeletalFrame",
    String(plan.anatomy.preserveSkeletalFrame)
  );
  return map;
}

function diffFieldMaps(
  legacy: Map<string, string>,
  bodySim: Map<string, string>
): {
  added: string[];
  removed: string[];
  changed: string[];
} {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const key of bodySim.keys()) {
    if (!legacy.has(key)) {
      added.push(key);
    } else if (legacy.get(key) !== bodySim.get(key)) {
      changed.push(key);
    }
  }
  for (const key of legacy.keys()) {
    if (!bodySim.has(key)) {
      removed.push(key);
    }
  }
  added.sort();
  removed.sort();
  changed.sort();
  return { added, removed, changed };
}

export function estimateTokensFromPromptLength(
  promptLength: number | null | undefined
): EstimatedMetric {
  if (typeof promptLength !== "number" || !Number.isFinite(promptLength)) {
    return {
      value: null,
      labeling: "estimate",
      note: "Prompt length unavailable; token estimate not computed.",
    };
  }
  return {
    value: Math.ceil(promptLength / TOKEN_ESTIMATE_CHARS_PER_TOKEN),
    labeling: "estimate",
    note: `Heuristic chars/${TOKEN_ESTIMATE_CHARS_PER_TOKEN}; not a provider billing API.`,
  };
}

export function estimateProviderCostPlaceholder(): EstimatedMetric {
  return {
    value: null,
    labeling: "estimate",
    note: "No billing API wired; provider cost left unset (estimate placeholder).",
  };
}

/**
 * Build side-by-side FormatterComparison. In-memory only; never transport.
 */
export function buildFormatterComparison(options: {
  legacyRenderPlan: RenderPlan;
  legacyFormatted: FormattedImageRequest;
  bodySimulatorRenderPlan: RenderPlan;
  bodySimulatorFormatted: FormattedImageRequest;
}): FormatterComparison {
  const legacyPath = buildPathSide({
    pathId: LEGACY_FORMATTER_PATH_ID,
    deprecated: true,
    neverProduction: true,
    renderPlan: options.legacyRenderPlan,
    formatted: options.legacyFormatted,
  });
  const bodySimulatorPath = buildPathSide({
    pathId: BODY_SIMULATOR_FORMATTER_PATH_ID,
    deprecated: false,
    neverProduction: false,
    renderPlan: options.bodySimulatorRenderPlan,
    formatted: options.bodySimulatorFormatted,
  });
  // Body Simulator path is still internal-only for production cutover purposes.
  bodySimulatorPath.neverProduction = true;

  const transformDiff = diffFieldMaps(
    flattenTransformationFieldMap(options.legacyRenderPlan),
    flattenTransformationFieldMap(options.bodySimulatorRenderPlan)
  );
  const preservationDiff = diffFieldMaps(
    flattenPreservationFieldMap(options.legacyRenderPlan),
    flattenPreservationFieldMap(options.bodySimulatorRenderPlan)
  );

  const promptLengthDelta =
    bodySimulatorPath.promptSummary.totalLength -
    legacyPath.promptSummary.totalLength;

  const summaryDifferences: string[] = [];
  if (
    legacyPath.formatterSummary.approvedChangeCount !==
    bodySimulatorPath.formatterSummary.approvedChangeCount
  ) {
    summaryDifferences.push(
      `approvedChangeCount: legacy=${legacyPath.formatterSummary.approvedChangeCount} bodySimulator=${bodySimulatorPath.formatterSummary.approvedChangeCount}`
    );
  }
  if (
    legacyPath.formatterSummary.visualIntensity !==
    bodySimulatorPath.formatterSummary.visualIntensity
  ) {
    summaryDifferences.push(
      `visualIntensity: legacy=${legacyPath.formatterSummary.visualIntensity} bodySimulator=${bodySimulatorPath.formatterSummary.visualIntensity}`
    );
  }
  if (
    legacyPath.formatterSummary.changeVisibility !==
    bodySimulatorPath.formatterSummary.changeVisibility
  ) {
    summaryDifferences.push(
      `changeVisibility: legacy=${legacyPath.formatterSummary.changeVisibility} bodySimulator=${bodySimulatorPath.formatterSummary.changeVisibility}`
    );
  }
  if (promptLengthDelta !== 0) {
    summaryDifferences.push(`promptLengthDelta=${promptLengthDelta}`);
  }
  if (transformDiff.added.length > 0) {
    summaryDifferences.push(
      `addedTransformationFields=${transformDiff.added.length}`
    );
  }
  if (transformDiff.removed.length > 0) {
    summaryDifferences.push(
      `removedTransformationFields=${transformDiff.removed.length}`
    );
  }

  return {
    schemaVersion: FORMATTER_COMPARISON_SCHEMA_VERSION,
    purpose: "internal_comparison_only",
    lifetime: "session_only",
    persisted: false,
    legacyPath,
    bodySimulatorPath,
    addedFields: transformDiff.added,
    removedFields: transformDiff.removed,
    changedTransformationFields: transformDiff.changed,
    changedPreservationFields: preservationDiff.changed,
    promptLengthDelta,
    summaryDifferences,
    providerCallsFromComparison: 0,
  };
}

/**
 * Convenience: run both formatter paths in-memory and compare.
 * Never invokes transport / Replicate.
 */
export function compareLegacyAndBodySimulatorFormatters(options: {
  rules: BodySimulatorTransformationRules;
  profile: BodyProfile;
  goal: TransformationGoal;
  formatterOptions?: FormatterOptions;
}): FormatterComparison {
  const legacy = runLegacyFormatterComparisonPath({
    profile: options.profile,
    goal: options.goal,
    formatterOptions: options.formatterOptions,
  });
  const bodySim = runBodySimulatorFormatterComparisonPath({
    rules: options.rules,
    profile: options.profile,
    goal: options.goal,
    formatterOptions: options.formatterOptions,
  });
  return buildFormatterComparison({
    legacyRenderPlan: legacy.renderPlan,
    legacyFormatted: legacy.formatted,
    bodySimulatorRenderPlan: bodySim.renderPlan,
    bodySimulatorFormatted: bodySim.formatted,
  });
}

export function buildGenerationDiagnostics(options: {
  scenarioId: string;
  rules?: BodySimulatorTransformationRules | null;
  formatterName?: string | null;
  formatterVersion?: string | null;
  promptLength?: number | null;
  warnings?: string[];
  limitations?: string[];
  providerClassification: GenerationDiagnostics["providerClassification"];
  generationDurationMs?: number | null;
  provider?: string | null;
  model?: string | null;
  httpStatus?: number | null | DiagnosticsNotRun;
  retryCount?: number | null | DiagnosticsNotRun;
  timestamp?: string;
  /** Demand 022C — which path was bound to the provider (if any). */
  generationPath?: "legacy" | "body_simulator" | null;
  deprecatedBaseline?: boolean;
}): GenerationDiagnostics {
  const rules = options.rules ?? null;
  const promptLength =
    typeof options.promptLength === "number" ? options.promptLength : null;
  const dry =
    options.providerClassification === "dry_run_no_provider" ||
    options.providerClassification === "comparison_only" ||
    options.providerClassification === "not_run";
  const generationPath = options.generationPath ?? null;
  const deprecatedBaseline =
    options.deprecatedBaseline === true || generationPath === "legacy";
  const bodySimulatorRules =
    deprecatedBaseline || rules == null
      ? null
      : rules.rulesVersion ?? null;

  return {
    schemaVersion: GENERATION_DIAGNOSTICS_SCHEMA_VERSION,
    lifetime: "session_only",
    persisted: false,
    generationPath,
    bodySimulatorRules,
    deprecatedBaseline,
    bodySimulatorVersion:
      bodySimulatorRules ??
      (deprecatedBaseline
        ? "legacy_baseline_no_body_simulator_rules"
        : BODY_SIMULATOR_RULES_VERSION),
    formatterVersion:
      options.formatterVersion ?? FLUX_FORMATTER_VERSION,
    formatterSchema: `FormattedImageRequest@flux/${FLUX_FORMATTER_VERSION}`,
    ruleSchema: deprecatedBaseline
      ? "legacy_transformation_engine@deprecated"
      : `BodySimulatorTransformationRules@${BODY_SIMULATOR_RULES_SCHEMA_VERSION}`,
    scenario: options.scenarioId,
    timeline: rules?.goal.timelineWeeks ?? null,
    intensity: rules?.goal.intensity ?? null,
    promptLength,
    estimatedTokens: estimateTokensFromPromptLength(promptLength),
    estimatedProviderCost: estimateProviderCostPlaceholder(),
    generationDurationMs: dry
      ? null
      : options.generationDurationMs ?? null,
    provider: dry ? null : options.provider ?? null,
    model: dry ? null : options.model ?? null,
    httpStatus: dry
      ? "not_run"
      : options.httpStatus ?? null,
    retryCount: dry ? "not_run" : options.retryCount ?? 0,
    warnings: [...(options.warnings ?? [])],
    limitations: [
      ...(options.limitations ?? []),
      ...(rules?.limitations ?? []),
      ...(deprecatedBaseline
        ? ["Deprecated legacy baseline — internal comparison only; never production."]
        : []),
    ],
    providerClassification: options.providerClassification,
    timestamp: options.timestamp ?? new Date().toISOString(),
  };
}

export function buildPipelineSnapshot(options: {
  mode: string;
  scenarioId: string;
  bodySimulatorScenarioId?: string | null;
  rules?: BodySimulatorTransformationRules | null;
  formatterInput?: FormatterInputInspectionView | null;
  bodySimulatorRenderPlan?: RenderPlan | null;
  formatted?: FormattedImageRequest | null;
  generationDiagnostics?: GenerationDiagnostics | null;
  formatterComparisonPresent: boolean;
  generationPath?: "legacy" | "body_simulator" | null;
}): PipelineSnapshot {
  const rules = options.rules ?? null;
  const formatted = options.formatted ?? null;
  const renderPlan = options.bodySimulatorRenderPlan ?? null;
  const generationPath = options.generationPath ?? null;

  let formatterInput = options.formatterInput ?? null;
  if (formatterInput == null && rules != null) {
    const canonical = adaptBodySimulatorRulesToFormatterInput(rules);
    formatterInput = buildFormatterInputInspectionView(rules, canonical);
  }

  const positive = formatted?.prompt ?? "";
  const negative = formatted?.negativePrompt ?? "";

  return {
    schemaVersion: PIPELINE_SNAPSHOT_SCHEMA_VERSION,
    lifetime: "session_only",
    persisted: false,
    downloadAvailable: false,
    transformationRules:
      rules == null
        ? null
        : {
            schemaVersion: rules.schemaVersion,
            rulesVersion: rules.rulesVersion,
            simulationId: rules.simulationId,
            goal: structuredClone(rules.goal),
            wholeBodyChange: structuredClone(rules.wholeBodyChange),
            regions: structuredClone(rules.regions),
            preservation: structuredClone(rules.preservation),
            realism: structuredClone(rules.realism),
            confidence: structuredClone(rules.confidence),
            provenance: structuredClone(rules.provenance),
            limitations: [...(rules.limitations ?? [])],
            canonicalAdapterSchemaVersion:
              CANONICAL_BODY_TRANSFORMATION_SCHEMA_VERSION,
          },
    formatterInput: formatterInput == null ? null : structuredClone(formatterInput),
    formatterOutput:
      formatted == null
        ? null
        : {
            formatterName: formatted.metadata.formatterName ?? null,
            formatterVersion: formatted.metadata.formatterVersion ?? null,
            providerFamily: formatted.providerFamily ?? null,
            approvedChangeIds:
              renderPlan?.transformation.approvedChanges.map((c) => c.id) ??
              [],
            visualIntensity:
              renderPlan?.transformation.visualIntensity ?? null,
            changeVisibility:
              renderPlan?.transformation.changeVisibility ?? null,
          },
    prompt:
      formatted == null
        ? null
        : {
            positivePrompt: positive,
            negativePrompt: negative,
            totalLength: positive.length + negative.length,
          },
    generationDiagnostics:
      options.generationDiagnostics == null
        ? null
        : structuredClone(options.generationDiagnostics),
    previewMetadata: {
      mode: options.mode,
      scenarioId: options.scenarioId,
      bodySimulatorScenarioId: options.bodySimulatorScenarioId ?? null,
      formatterComparisonPresent: options.formatterComparisonPresent,
      legacyPathSentToProvider: generationPath === "legacy",
      bodySimulatorPathSentToProvider: generationPath === "body_simulator",
      generationPath,
    },
  };
}
