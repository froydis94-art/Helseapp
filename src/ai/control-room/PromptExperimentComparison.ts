/**
 * Prompt Isolation Lab — comparison, interpretation, safe export (Demand 018D).
 *
 * Deterministic only. No AI calls. No provider contact. No causal certainty claims.
 */

import type { PromptIsolationVariant } from "./PromptIsolationVariants";
import {
  PROMPT_EXPERIMENT_ENVIRONMENT,
  PROMPT_EXPERIMENT_NONDETERMINISM_DISCLAIMER,
  PROMPT_EXPERIMENT_SCHEMA_VERSION,
  PROMPT_EXPERIMENT_SERVICE,
  type PromptExperimentExportReport,
  type PromptExperimentRecord,
} from "./PromptExperimentTypes";

export interface PromptLineDiff {
  onlyInA: string[];
  onlyInB: string[];
  shared: string[];
}

export interface PromptExperimentInterpretation {
  summary: string;
  warnings: string[];
  disclaimer: typeof PROMPT_EXPERIMENT_NONDETERMINISM_DISCLAIMER;
  comparable: boolean;
}

const UNSAFE_EXPORT_PATTERNS: RegExp[] = [
  /data:image\//i,
  /REPLICATE_API_TOKEN/i,
  /AI_OS_CONTROL_ROOM_ACCESS_KEY/i,
  /Authorization\s*:/i,
  /\bBearer\s+[A-Za-z0-9._\-]{8,}/i,
  /sk_live_/i,
  /\b(x-api-key|api-key|authorization)\b\s*[:=]/i,
];

/** Split on newline, trim, drop empty — for line comparison only. */
export function normalizePromptLines(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Exact line-set comparison after normalization.
 * Does not claim that a line caused a provider outcome.
 */
export function comparePromptLines(
  promptA: string,
  promptB: string
): PromptLineDiff {
  const linesA = normalizePromptLines(promptA);
  const linesB = normalizePromptLines(promptB);
  const setA = new Set(linesA);
  const setB = new Set(linesB);
  const onlyInA: string[] = [];
  const onlyInB: string[] = [];
  const shared: string[] = [];
  for (const line of setA) {
    if (setB.has(line)) shared.push(line);
    else onlyInA.push(line);
  }
  for (const line of setB) {
    if (!setA.has(line)) onlyInB.push(line);
  }
  onlyInA.sort();
  onlyInB.sort();
  shared.sort();
  return { onlyInA, onlyInB, shared };
}

function latestOutcomeByVariant(
  records: readonly PromptExperimentRecord[]
): Map<PromptIsolationVariant, PromptExperimentRecord> {
  const map = new Map<PromptIsolationVariant, PromptExperimentRecord>();
  for (const record of records) {
    map.set(record.variant, record);
  }
  return map;
}

function isSafetyBlocked(record: PromptExperimentRecord): boolean {
  return record.outcome === "safety_blocked";
}

function isSucceeded(record: PromptExperimentRecord): boolean {
  return record.outcome === "succeeded";
}

/**
 * Deterministic interpretation from completed manual tests only.
 * Same scenario + model required for comparable conclusions.
 */
export function interpretPromptExperiments(
  records: readonly PromptExperimentRecord[]
): PromptExperimentInterpretation {
  const warnings: string[] = [];
  const disclaimer = PROMPT_EXPERIMENT_NONDETERMINISM_DISCLAIMER;

  if (!records || records.length === 0) {
    return {
      summary:
        "Current evidence is inconclusive. Additional manual tests under identical conditions may be needed.",
      warnings,
      disclaimer,
      comparable: false,
    };
  }

  const scenarios = new Set(records.map((r) => r.scenarioId));
  const models = new Set(records.map((r) => r.provider.model || ""));
  if (scenarios.size > 1) {
    warnings.push(
      "Records use different scenarios; test conditions are not comparable."
    );
  }
  if (models.size > 1) {
    warnings.push(
      "Records use different provider models; test conditions are not comparable."
    );
  }
  if (scenarios.size > 1 || models.size > 1) {
    return {
      summary:
        "Current evidence is inconclusive. Additional manual tests under identical conditions may be needed.",
      warnings,
      disclaimer,
      comparable: false,
    };
  }

  const byVariant = latestOutcomeByVariant(records);
  const minimal = byVariant.get("minimal");
  const current = byVariant.get("current_ai_os");
  const withoutPreview = byVariant.get("current_without_preview_context");
  const baseline = byVariant.get("pre_017c_baseline");

  const tested = [...byVariant.values()];
  const allBlocked =
    tested.length > 0 && tested.every((r) => isSafetyBlocked(r));
  const allSucceeded =
    tested.length > 0 && tested.every((r) => isSucceeded(r));

  let summary: string;

  if (
    minimal &&
    isSucceeded(minimal) &&
    baseline &&
    isSucceeded(baseline) &&
    current &&
    isSafetyBlocked(current) &&
    withoutPreview &&
    isSafetyBlocked(withoutPreview)
  ) {
    summary =
      "A newer formatter or preview-context change may be contributing.";
  } else if (
    minimal &&
    isSucceeded(minimal) &&
    withoutPreview &&
    isSucceeded(withoutPreview) &&
    current &&
    isSafetyBlocked(current)
  ) {
    summary =
      "The preview-specific formatter context may be contributing to the provider block.";
  } else if (
    minimal &&
    isSucceeded(minimal) &&
    current &&
    isSafetyBlocked(current)
  ) {
    summary =
      "Prompt content or complexity may be contributing to the provider block.";
  } else if (allBlocked) {
    summary =
      "Prompt wording is unlikely to be the only cause. The provider model, source image handling or provider moderation may also be contributing.";
  } else if (allSucceeded) {
    summary =
      "The earlier provider block may have been transient or input-dependent.";
  } else {
    summary =
      "Current evidence is inconclusive. Additional manual tests under identical conditions may be needed.";
  }

  // Never recommend moderation / safety bypass or legal conclusions.
  const lowered = `${summary} ${warnings.join(" ")}`.toLowerCase();
  if (
    /disable.*moderation|bypass.*safety|circumvent|legal conclusion|guaranteed/.test(
      lowered
    )
  ) {
    summary =
      "Current evidence is inconclusive. Additional manual tests under identical conditions may be needed.";
  }

  return {
    summary,
    warnings,
    disclaimer,
    comparable: true,
  };
}

export function formatInterpretationText(
  interpretation: PromptExperimentInterpretation
): string {
  const parts = [interpretation.summary];
  for (const warning of interpretation.warnings) {
    parts.push(`Warning: ${warning}`);
  }
  parts.push(interpretation.disclaimer);
  return parts.join("\n\n");
}

export function scanExportForUnsafeContent(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    for (const pattern of UNSAFE_EXPORT_PATTERNS) {
      if (pattern.test(value)) {
        return `Unsafe export content matched ${pattern.source}`;
      }
    }
    return null;
  }
  if (typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const child of value) {
      const hit = scanExportForUnsafeContent(child);
      if (hit) return hit;
    }
    return null;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    const hit = scanExportForUnsafeContent(child);
    if (hit) return hit;
  }
  return null;
}

export class PromptExperimentExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptExperimentExportError";
  }
}

export function buildSafeExportReport(input: {
  records: readonly PromptExperimentRecord[];
  selectedA: string | null;
  selectedB: string | null;
  interpretation: string;
  exportedAt?: string;
}): PromptExperimentExportReport {
  const records = input.records.map((r) => structuredClone(r));
  const report: PromptExperimentExportReport = {
    schemaVersion: PROMPT_EXPERIMENT_SCHEMA_VERSION,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    service: PROMPT_EXPERIMENT_SERVICE,
    environment: PROMPT_EXPERIMENT_ENVIRONMENT,
    records,
    comparisons: {
      selectedA: input.selectedA,
      selectedB: input.selectedB,
      interpretation: input.interpretation,
    },
    safety: {
      containsSourceImage: false,
      containsAccessKey: false,
      containsProviderToken: false,
      containsRawProviderResponse: false,
      containsEnvironmentValues: false,
    },
  };

  const unsafe = scanExportForUnsafeContent(report);
  if (unsafe) {
    throw new PromptExperimentExportError(unsafe);
  }
  return report;
}

export function exportFileName(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `ai-os-prompt-experiments-${y}-${m}-${d}.json`;
}

export interface ComparisonFieldRow {
  field: string;
  valueA: string;
  valueB: string;
}

/** Side-by-side field rows for exactly two records. */
export function buildComparisonRows(
  a: PromptExperimentRecord,
  b: PromptExperimentRecord
): ComparisonFieldRow[] {
  return [
    { field: "variant", valueA: a.variant, valueB: b.variant },
    { field: "scenario", valueA: a.scenarioId, valueB: b.scenarioId },
    {
      field: "provider model",
      valueA: a.provider.model,
      valueB: b.provider.model,
    },
    {
      field: "formatter name",
      valueA: a.formatter.name ?? "—",
      valueB: b.formatter.name ?? "—",
    },
    {
      field: "formatter version",
      valueA: a.formatter.version ?? "—",
      valueB: b.formatter.version ?? "—",
    },
    { field: "outcome", valueA: a.outcome, valueB: b.outcome },
    {
      field: "diagnostic",
      valueA: a.diagnostic ?? "—",
      valueB: b.diagnostic ?? "—",
    },
    {
      field: "duration",
      valueA:
        a.durationMs != null ? String(a.durationMs) : "—",
      valueB:
        b.durationMs != null ? String(b.durationMs) : "—",
    },
    {
      field: "positive words",
      valueA: String(a.promptMetrics.positiveWords),
      valueB: String(b.promptMetrics.positiveWords),
    },
    {
      field: "negative words",
      valueA: String(a.promptMetrics.negativeWords),
      valueB: String(b.promptMetrics.negativeWords),
    },
    {
      field: "total words",
      valueA: String(a.promptMetrics.totalWords),
      valueB: String(b.promptMetrics.totalWords),
    },
    {
      field: "positive characters",
      valueA: String(a.promptMetrics.positiveCharacters),
      valueB: String(b.promptMetrics.positiveCharacters),
    },
    {
      field: "negative characters",
      valueA: String(a.promptMetrics.negativeCharacters),
      valueB: String(b.promptMetrics.negativeCharacters),
    },
    {
      field: "total characters",
      valueA: String(a.promptMetrics.totalCharacters),
      valueB: String(b.promptMetrics.totalCharacters),
    },
  ];
}
