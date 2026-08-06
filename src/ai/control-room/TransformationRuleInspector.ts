/**
 * Transformation Rule Inspector (Demand 018E).
 *
 * Read-only inspection helpers for Experiment Lab:
 * pipeline stages, formatter metadata view, and deterministic rule diffs.
 * Never contacts providers. Never modifies generation.
 */

import {
  TRANSFORM_RULE_FIELD_KEYS,
  type TransformationRuleFieldKey,
  type TransformationRulesView,
  stableStringifyRuleValue,
} from "./TransformationRuleProjection";
import {
  computePromptMetrics,
  countPromptCharacters,
  countPromptWords,
  type PromptExperimentMetrics,
} from "./PromptExperimentTypes";

/** Canonical read-only pipeline for the inspector (rules before prompts). */
export const TRANSFORM_RULE_PIPELINE_STAGES = [
  "User Goal",
  "Transformation Plan",
  "Transformation Rules",
  "Formatter",
  "Positive Prompt",
  "Negative Prompt",
  "Provider",
  "Generated Result",
] as const;

export type TransformationRulePipelineStage =
  (typeof TRANSFORM_RULE_PIPELINE_STAGES)[number];

export type RuleDiffStatus =
  | "added"
  | "removed"
  | "modified"
  | "unchanged";

export interface TransformationRuleDiffEntry {
  key: TransformationRuleFieldKey;
  label: string;
  status: RuleDiffStatus;
  valueA: unknown;
  valueB: unknown;
}

export interface TransformationRuleComparison {
  /** Rules compared first — deterministic exact-value statuses. */
  rules: TransformationRuleDiffEntry[];
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
}

export interface FormatterInspectorView {
  name: string | null;
  version: string | null;
  mode: string | null;
  output: {
    positivePromptLength: number;
    negativePromptLength: number;
    positiveWords: number;
    negativeWords: number;
    totalCharacters: number;
    totalWords: number;
  };
  promptMetrics: PromptExperimentMetrics;
}

export interface BuildFormatterInspectorInput {
  name?: string | null;
  version?: string | null;
  /** Isolation / formatter mode label (e.g. promptSource or variant). */
  mode?: string | null;
  positivePrompt?: string;
  negativePrompt?: string;
}

export function getTransformationRulePipelineStages(): readonly TransformationRulePipelineStage[] {
  return TRANSFORM_RULE_PIPELINE_STAGES;
}

/** Index of Transformation Rules in the pipeline (must precede prompts). */
export function transformationRulesPipelineIndex(): number {
  return TRANSFORM_RULE_PIPELINE_STAGES.indexOf("Transformation Rules");
}

export function positivePromptPipelineIndex(): number {
  return TRANSFORM_RULE_PIPELINE_STAGES.indexOf("Positive Prompt");
}

/** Assert architectural order: rules appear before positive/negative prompts. */
export function rulesAppearBeforePromptsInPipeline(): boolean {
  const rulesIdx = transformationRulesPipelineIndex();
  const positiveIdx = positivePromptPipelineIndex();
  const negativeIdx = TRANSFORM_RULE_PIPELINE_STAGES.indexOf("Negative Prompt");
  return rulesIdx >= 0 && rulesIdx < positiveIdx && rulesIdx < negativeIdx;
}

export function buildFormatterInspectorView(
  input: BuildFormatterInspectorInput
): FormatterInspectorView {
  const positive =
    typeof input.positivePrompt === "string" ? input.positivePrompt : "";
  const negative =
    typeof input.negativePrompt === "string" ? input.negativePrompt : "";
  const promptMetrics = computePromptMetrics(positive, negative);
  return {
    name: input.name ?? null,
    version: input.version ?? null,
    mode: typeof input.mode === "string" && input.mode ? input.mode : null,
    output: {
      positivePromptLength: countPromptCharacters(positive),
      negativePromptLength: countPromptCharacters(negative),
      positiveWords: countPromptWords(positive),
      negativeWords: countPromptWords(negative),
      totalCharacters: promptMetrics.totalCharacters,
      totalWords: promptMetrics.totalWords,
    },
    promptMetrics,
  };
}

function emptyRulesMap(): Record<TransformationRuleFieldKey, unknown> {
  const map = {} as Record<TransformationRuleFieldKey, unknown>;
  for (const key of TRANSFORM_RULE_FIELD_KEYS) {
    map[key] = null;
  }
  return map;
}

function rulesMapFromView(
  view: TransformationRulesView | null | undefined
): Record<TransformationRuleFieldKey, unknown> {
  if (view == null || typeof view !== "object" || view.rules == null) {
    return emptyRulesMap();
  }
  const map = emptyRulesMap();
  for (const key of TRANSFORM_RULE_FIELD_KEYS) {
    map[key] = view.rules[key] ?? null;
  }
  return map;
}

/**
 * Deterministic Transformation Rules comparison.
 * Exact value compare only — no semantic interpretation.
 * Statuses: added / removed / modified / unchanged.
 */
export function compareTransformationRules(
  rulesA: TransformationRulesView | null | undefined,
  rulesB: TransformationRulesView | null | undefined
): TransformationRuleComparison {
  const mapA = rulesMapFromView(rulesA);
  const mapB = rulesMapFromView(rulesB);
  const entries: TransformationRuleDiffEntry[] = [];
  let added = 0;
  let removed = 0;
  let modified = 0;
  let unchanged = 0;

  for (const key of TRANSFORM_RULE_FIELD_KEYS) {
    const valueA = mapA[key];
    const valueB = mapB[key];
    const strA = stableStringifyRuleValue(valueA);
    const strB = stableStringifyRuleValue(valueB);
    const emptyA = strA === "null";
    const emptyB = strB === "null";
    let status: RuleDiffStatus;
    if (emptyA && !emptyB) {
      status = "added";
      added += 1;
    } else if (!emptyA && emptyB) {
      status = "removed";
      removed += 1;
    } else if (strA === strB) {
      status = "unchanged";
      unchanged += 1;
    } else {
      status = "modified";
      modified += 1;
    }
    const label =
      rulesA?.fields?.find((f) => f.key === key)?.label ||
      rulesB?.fields?.find((f) => f.key === key)?.label ||
      key;
    entries.push({
      key,
      label,
      status,
      valueA,
      valueB,
    });
  }

  return {
    rules: entries,
    summary: { added, removed, modified, unchanged },
  };
}

/** True when every preferred rule field is present in the view. */
export function transformationRulesViewComplete(
  view: TransformationRulesView | null | undefined
): boolean {
  if (view == null) return false;
  if (view.fields.length !== TRANSFORM_RULE_FIELD_KEYS.length) return false;
  return TRANSFORM_RULE_FIELD_KEYS.every((key, index) => {
    return view.fields[index]?.key === key && key in view.rules;
  });
}
