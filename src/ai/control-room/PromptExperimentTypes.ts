/**
 * Prompt Isolation Lab — session experiment history contracts (Demand 018D).
 *
 * Browser memory only. Never localStorage / sessionStorage / IndexedDB / cookies.
 * Never source images, access keys, tokens, raw provider payloads, or env values.
 */

import type { PromptIsolationVariant } from "./PromptIsolationVariants";

export const PROMPT_EXPERIMENT_SCHEMA_VERSION = 1 as const;
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
  promptMetrics: PromptExperimentMetrics;
  outcome: PromptExperimentOutcome;
  diagnostic?: string;
  durationMs?: number;
  generatedImageAvailable: boolean;
  formatter: {
    name: string | null;
    version: string | null;
  };
  prompts: {
    positivePrompt: string;
    negativePrompt: string;
  };
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
  providerFamily?: string;
  model?: string;
  predictionId?: string;
  outcome: PromptExperimentOutcome;
  diagnostic?: string;
  durationMs?: number;
  generatedImageAvailable?: boolean;
  formatterName?: string | null;
  formatterVersion?: string | null;
  positivePrompt?: string;
  negativePrompt?: string;
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
  const record: PromptExperimentRecord = {
    schemaVersion: PROMPT_EXPERIMENT_SCHEMA_VERSION,
    experimentId: input.experimentId ?? createExperimentId(),
    createdAt,
    variant: input.variant,
    scenarioId: input.scenarioId,
    provider: {
      family:
        typeof input.providerFamily === "string" && input.providerFamily
          ? input.providerFamily
          : "flux",
      model: typeof input.model === "string" ? input.model : "",
    },
    promptMetrics: computePromptMetrics(positivePrompt, negativePrompt),
    outcome: input.outcome,
    generatedImageAvailable: input.generatedImageAvailable === true,
    formatter: {
      name: input.formatterName ?? null,
      version: input.formatterVersion ?? null,
    },
    prompts: {
      positivePrompt,
      negativePrompt,
    },
  };
  if (typeof input.predictionId === "string" && input.predictionId) {
    record.provider.predictionId = input.predictionId;
  }
  if (typeof input.diagnostic === "string" && input.diagnostic) {
    record.diagnostic = input.diagnostic;
  }
  if (
    typeof input.durationMs === "number" &&
    Number.isFinite(input.durationMs)
  ) {
    record.durationMs = Math.max(0, input.durationMs);
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
