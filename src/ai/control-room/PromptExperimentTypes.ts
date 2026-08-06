/**
 * Prompt Isolation Lab — session experiment history contracts (Demand 018D/018E).
 *
 * Browser memory only. Never localStorage / sessionStorage / IndexedDB / cookies.
 * Never source images, access keys, tokens, raw provider payloads, or env values.
 *
 * Demand 018E: Transformation Rules are canonical; prompts are derived artifacts.
 * Single history system — pipelineInspector extends records (no parallel store).
 */

import type { AiPipelineInspectorSnapshot } from "./AiPipelineInspectorTypes";
import { projectAiPipelineInspector } from "./AiPipelineProjection";
import type { PromptIsolationVariant } from "./PromptIsolationVariants";
import type { TransformationRulesView } from "./TransformationRuleProjection";
import {
  projectTransformationRules,
  type ProjectTransformationRulesInput,
} from "./TransformationRuleProjection";

export const PROMPT_EXPERIMENT_SCHEMA_VERSION = 3 as const;
export const PROMPT_EXPERIMENT_HISTORY_MAX = 20 as const;
export const PROMPT_EXPERIMENT_SERVICE = "ai-os-prompt-isolation-lab" as const;
export const PROMPT_EXPERIMENT_ENVIRONMENT = "internal_control_room" as const;

export const PROMPT_EXPERIMENT_NONDETERMINISM_DISCLAIMER =
  "This is diagnostic evidence, not proof. Provider generation and moderation may be nondeterministic." as const;

export type PromptExperimentOutcome =
  | "succeeded"
  | "safety_blocked"
  | "provider_failed"
  | "validation_rejected"
  | "runtime_failed";

export interface PromptExperimentMetrics {
  positiveCharacters: number;
  positiveWords: number;
  negativeCharacters: number;
  negativeWords: number;
  totalCharacters: number;
  totalWords: number;
}

export interface PromptExperimentFormatterOutputMeta {
  positivePromptLength: number;
  negativePromptLength: number;
  positiveWords: number;
  negativeWords: number;
  totalCharacters: number;
  totalWords: number;
}

export interface PromptExperimentFormatterMeta {
  name: string | null;
  version: string | null;
  mode: string | null;
  output: PromptExperimentFormatterOutputMeta;
}

export interface PromptExperimentProviderResult {
  outcome: PromptExperimentOutcome;
  diagnostic?: string;
  family: string;
  model: string;
  predictionId?: string;
  durationMs?: number;
  generatedImageAvailable: boolean;
}

export interface PromptExperimentRecord {
  schemaVersion: typeof PROMPT_EXPERIMENT_SCHEMA_VERSION;
  experimentId: string;
  createdAt: string;
  variant: PromptIsolationVariant;
  scenarioId: string;
  provider: {
    family: string;
    model: string;
    predictionId?: string;
  };
  /** Canonical Transformation Rules projection (provider-independent). */
  transformationRules: TransformationRulesView;
  /** Full AI Pipeline Inspector snapshot (Goal → Result + provenance). */
  pipelineInspector: AiPipelineInspectorSnapshot;
  promptMetrics: PromptExperimentMetrics;
  outcome: PromptExperimentOutcome;
  diagnostic?: string;
  durationMs?: number;
  generatedImageAvailable: boolean;
  formatter: PromptExperimentFormatterMeta;
  prompts: {
    positivePrompt: string;
    negativePrompt: string;
  };
  /** Provider outcome summary — no image bytes, tokens, or raw payloads. */
  providerResult: PromptExperimentProviderResult;
}

export interface PromptExperimentExportSafety {
  containsSourceImage: false;
  containsAccessKey: false;
  containsProviderToken: false;
  containsRawProviderResponse: false;
  containsEnvironmentValues: false;
}

export interface PromptExperimentExportReport {
  schemaVersion: typeof PROMPT_EXPERIMENT_SCHEMA_VERSION;
  exportedAt: string;
  service: typeof PROMPT_EXPERIMENT_SERVICE;
  environment: typeof PROMPT_EXPERIMENT_ENVIRONMENT;
  records: PromptExperimentRecord[];
  comparisons: {
    selectedA: string | null;
    selectedB: string | null;
    interpretation: string;
    /** Present when A and B are selected — path-based rule diff. */
    ruleComparison?: unknown;
    comparisonWarnings?: string[];
  };
  safety: PromptExperimentExportSafety;
}

/** Deterministic character count (JS string length). Empty → 0. */
export function countPromptCharacters(text: string): number {
  if (typeof text !== "string" || text.length === 0) return 0;
  return text.length;
}

/**
 * Deterministic word count: trim, split on one or more whitespace, empty → 0.
 * No tokenizer libraries.
 */
export function countPromptWords(text: string): number {
  if (typeof text !== "string") return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

export function computePromptMetrics(
  positivePrompt: string,
  negativePrompt: string
): PromptExperimentMetrics {
  const positiveCharacters = countPromptCharacters(positivePrompt);
  const positiveWords = countPromptWords(positivePrompt);
  const negativeCharacters = countPromptCharacters(negativePrompt);
  const negativeWords = countPromptWords(negativePrompt);
  return {
    positiveCharacters,
    positiveWords,
    negativeCharacters,
    negativeWords,
    totalCharacters: positiveCharacters + negativeCharacters,
    totalWords: positiveWords + negativeWords,
  };
}

export function createExperimentId(nowMs: number = Date.now()): string {
  const rand =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `r${Math.random().toString(36).slice(2, 10)}`;
  return `pex_${nowMs.toString(36)}_${rand}`;
}

export interface BuildPromptExperimentRecordInput {
  experimentId?: string;
  createdAt?: string;
  variant: PromptIsolationVariant;
  scenarioId: string;
  requestId?: string | null;
  scenarioSummary?: string | null;
  providerFamily?: string;
  model?: string;
  predictionId?: string;
  outcome: PromptExperimentOutcome;
  diagnostic?: string;
  durationMs?: number;
  generatedImageAvailable?: boolean;
  success?: boolean;
  validationDecision?: string | null;
  formatterName?: string | null;
  formatterVersion?: string | null;
  /** Formatter mode (e.g. promptIsolation promptSource). */
  formatterMode?: string | null;
  positivePrompt?: string;
  negativePrompt?: string;
  /** Optional pre-projected rules; otherwise projected from artifacts below. */
  transformationRules?: TransformationRulesView;
  pipelineInspector?: AiPipelineInspectorSnapshot;
  goal?: unknown;
  profile?: unknown;
  transformationPlan?: unknown;
  visualDirection?: unknown;
  renderPlan?: unknown;
  runtimeVersions?: Record<string, string | null> | null;
  aiOsVersion?: string | null;
}

export function buildPromptExperimentRecord(
  input: BuildPromptExperimentRecordInput
): PromptExperimentRecord {
  const positivePrompt =
    typeof input.positivePrompt === "string" ? input.positivePrompt : "";
  const negativePrompt =
    typeof input.negativePrompt === "string" ? input.negativePrompt : "";
  const createdAt =
    typeof input.createdAt === "string" && input.createdAt.length > 0
      ? input.createdAt
      : new Date().toISOString();
  const family =
    typeof input.providerFamily === "string" && input.providerFamily
      ? input.providerFamily
      : "flux";
  const model = typeof input.model === "string" ? input.model : "";
  const generatedImageAvailable = input.generatedImageAvailable === true;
  const experimentId = input.experimentId ?? createExperimentId();

  const projectionInput: ProjectTransformationRulesInput = {
    scenarioId: input.scenarioId,
    transformationPlan: input.transformationPlan,
    visualDirection: input.visualDirection,
    renderPlan: input.renderPlan,
  };
  const transformationRules =
    input.transformationRules ?? projectTransformationRules(projectionInput);

  const promptMetrics = computePromptMetrics(positivePrompt, negativePrompt);
  const formatterMode =
    typeof input.formatterMode === "string" && input.formatterMode
      ? input.formatterMode
      : null;

  const pipelineInspector =
    input.pipelineInspector ??
    projectAiPipelineInspector({
      experimentId,
      requestId: input.requestId,
      scenarioId: input.scenarioId,
      scenarioSummary: input.scenarioSummary,
      goal: input.goal,
      profile: input.profile,
      transformationPlan: input.transformationPlan,
      visualDirection: input.visualDirection,
      renderPlan: input.renderPlan,
      formatterName: input.formatterName,
      formatterVersion: input.formatterVersion,
      formatterMode,
      positivePrompt,
      negativePrompt,
      providerFamily: family,
      model,
      predictionId: input.predictionId,
      durationMs: input.durationMs,
      outcome: input.outcome,
      success: input.success === true || input.outcome === "succeeded",
      diagnostic: input.diagnostic,
      validationDecision: input.validationDecision,
      generatedImageAvailable,
      runtimeVersions: input.runtimeVersions,
      aiOsVersion: input.aiOsVersion,
    });

  const record: PromptExperimentRecord = {
    schemaVersion: PROMPT_EXPERIMENT_SCHEMA_VERSION,
    experimentId,
    createdAt,
    variant: input.variant,
    scenarioId: input.scenarioId,
    provider: {
      family,
      model,
    },
    transformationRules,
    pipelineInspector,
    promptMetrics,
    outcome: input.outcome,
    generatedImageAvailable,
    formatter: {
      name: input.formatterName ?? null,
      version: input.formatterVersion ?? null,
      mode: formatterMode,
      output: {
        positivePromptLength: promptMetrics.positiveCharacters,
        negativePromptLength: promptMetrics.negativeCharacters,
        positiveWords: promptMetrics.positiveWords,
        negativeWords: promptMetrics.negativeWords,
        totalCharacters: promptMetrics.totalCharacters,
        totalWords: promptMetrics.totalWords,
      },
    },
    prompts: {
      positivePrompt,
      negativePrompt,
    },
    providerResult: {
      outcome: input.outcome,
      family,
      model,
      generatedImageAvailable,
    },
  };
  if (typeof input.predictionId === "string" && input.predictionId) {
    record.provider.predictionId = input.predictionId;
    record.providerResult.predictionId = input.predictionId;
  }
  if (typeof input.diagnostic === "string" && input.diagnostic) {
    record.diagnostic = input.diagnostic;
    record.providerResult.diagnostic = input.diagnostic;
  }
  if (
    typeof input.durationMs === "number" &&
    Number.isFinite(input.durationMs)
  ) {
    const durationMs = Math.max(0, input.durationMs);
    record.durationMs = durationMs;
    record.providerResult.durationMs = durationMs;
  }
  return record;
}

/**
 * In-memory FIFO history (max 20). Not a persistence layer.
 */
export class PromptExperimentHistoryStore {
  private readonly records: PromptExperimentRecord[] = [];
  readonly maxSize: number;

  constructor(maxSize: number = PROMPT_EXPERIMENT_HISTORY_MAX) {
    this.maxSize = Math.max(1, Math.min(20, Math.floor(maxSize) || 20));
  }

  getAll(): readonly PromptExperimentRecord[] {
    return this.records;
  }

  size(): number {
    return this.records.length;
  }

  clear(): void {
    this.records.length = 0;
  }

  add(record: PromptExperimentRecord): void {
    this.records.push(record);
    while (this.records.length > this.maxSize) {
      this.records.shift();
    }
  }

  remove(experimentId: string): boolean {
    const idx = this.records.findIndex((r) => r.experimentId === experimentId);
    if (idx < 0) return false;
    this.records.splice(idx, 1);
    return true;
  }

  getById(experimentId: string): PromptExperimentRecord | null {
    return this.records.find((r) => r.experimentId === experimentId) ?? null;
  }
}

/** Map safe API failure fields to experiment outcome (never raw moderation). */
export function classifyPromptExperimentOutcome(input: {
  success?: boolean;
  code?: string | null;
  diagnostic?: string | null;
  validationAccepted?: boolean | null;
}): PromptExperimentOutcome {
  if (input.success === true) return "succeeded";
  const diagnostic =
    typeof input.diagnostic === "string" ? input.diagnostic : "";
  if (diagnostic === "provider_safety_blocked") return "safety_blocked";
  const code = typeof input.code === "string" ? input.code : "";
  if (code === "validation_rejected" || diagnostic === "validation_failed") {
    return "validation_rejected";
  }
  if (
    code === "provider_failure" ||
    diagnostic === "provider_failure" ||
    diagnostic === "provider_timeout" ||
    diagnostic === "provider_invalid_input" ||
    diagnostic === "provider_auth_error" ||
    diagnostic === "provider_http_error" ||
    diagnostic === "provider_invalid_response" ||
    diagnostic === "provider_network_error" ||
    diagnostic === "token_missing"
  ) {
    return "provider_failed";
  }
  if (input.validationAccepted === false) return "validation_rejected";
  return "runtime_failed";
}
