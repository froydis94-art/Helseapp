/**
 * AI Pipeline Inspector — Transformation Rules comparison (Demand 018E).
 *
 * Flattened exact-value compare. No semantic interpretation. No causality.
 * Rules are compared before prompts in the Experiment Lab UI order.
 */

import type { AiPipelineTransformationRules } from "./AiPipelineInspectorTypes";
import { AI_PIPELINE_RULE_GROUP_KEYS } from "./AiPipelineInspectorTypes";
import { stableStringifyRuleValue } from "./TransformationRuleProjection";
import type { PromptExperimentRecord } from "./PromptExperimentTypes";

export interface AiPipelineRuleDiffAdded {
  path: string;
  value: unknown;
}

export interface AiPipelineRuleDiffRemoved {
  path: string;
  value: unknown;
}

export interface AiPipelineRuleDiffModified {
  path: string;
  before: unknown;
  after: unknown;
}

export interface AiPipelineRuleDiffUnchanged {
  path: string;
  value: unknown;
}

export interface AiPipelineRulePathComparison {
  added: AiPipelineRuleDiffAdded[];
  removed: AiPipelineRuleDiffRemoved[];
  modified: AiPipelineRuleDiffModified[];
  unchanged: AiPipelineRuleDiffUnchanged[];
}

export interface AiPipelineComparisonWarnings {
  scenarioMismatch: boolean;
  providerModelMismatch: boolean;
  pipelineVersionMismatch: boolean;
  transformationRulesVersionMismatch: boolean;
  formatterVersionMismatch: boolean;
  warnings: string[];
}

/** Flatten JSON-serializable objects into sorted dot paths. Arrays as whole values. */
export function flattenRulePaths(
  value: unknown,
  prefix = ""
): Array<{ path: string; value: unknown }> {
  if (value == null) {
    return prefix ? [{ path: prefix, value: null }] : [];
  }
  if (typeof value !== "object") {
    return [{ path: prefix, value }];
  }
  if (Array.isArray(value)) {
    return [{ path: prefix, value }];
  }
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  if (keys.length === 0) {
    return prefix ? [{ path: prefix, value: {} }] : [];
  }
  const out: Array<{ path: string; value: unknown }> = [];
  for (const key of keys) {
    const childPath = prefix ? `${prefix}.${key}` : key;
    const child = rec[key];
    if (
      child != null &&
      typeof child === "object" &&
      !Array.isArray(child)
    ) {
      out.push(...flattenRulePaths(child, childPath));
    } else {
      out.push({ path: childPath, value: child ?? null });
    }
  }
  return out;
}

function rulesToFlatMap(
  rules: AiPipelineTransformationRules | null | undefined
): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (rules == null) return map;
  for (const key of AI_PIPELINE_RULE_GROUP_KEYS) {
    const value = rules[key];
    const flat = flattenRulePaths(value, key);
    for (const entry of flat) {
      map.set(entry.path, entry.value);
    }
  }
  return map;
}

/**
 * Deterministic Transformation Rules path comparison.
 * Ignores paths that are unavailable (null) in both records.
 */
export function compareAiPipelineRules(
  rulesA: AiPipelineTransformationRules | null | undefined,
  rulesB: AiPipelineTransformationRules | null | undefined
): AiPipelineRulePathComparison {
  const mapA = rulesToFlatMap(rulesA);
  const mapB = rulesToFlatMap(rulesB);
  const paths = new Set<string>([...mapA.keys(), ...mapB.keys()]);
  const sorted = [...paths].sort();
  const added: AiPipelineRuleDiffAdded[] = [];
  const removed: AiPipelineRuleDiffRemoved[] = [];
  const modified: AiPipelineRuleDiffModified[] = [];
  const unchanged: AiPipelineRuleDiffUnchanged[] = [];

  for (const path of sorted) {
    const hasA = mapA.has(path);
    const hasB = mapB.has(path);
    const valueA = hasA ? mapA.get(path) : null;
    const valueB = hasB ? mapB.get(path) : null;
    const strA = stableStringifyRuleValue(valueA);
    const strB = stableStringifyRuleValue(valueB);
    const emptyA = !hasA || strA === "null";
    const emptyB = !hasB || strB === "null";
    if (emptyA && emptyB) continue;
    if (emptyA && !emptyB) {
      added.push({ path, value: valueB });
    } else if (!emptyA && emptyB) {
      removed.push({ path, value: valueA });
    } else if (strA === strB) {
      unchanged.push({ path, value: valueA });
    } else {
      modified.push({ path, before: valueA, after: valueB });
    }
  }

  return { added, removed, modified, unchanged };
}

export function collectPipelineComparisonWarnings(
  a: PromptExperimentRecord,
  b: PromptExperimentRecord
): AiPipelineComparisonWarnings {
  const warnings: string[] = [];
  const scenarioMismatch = a.scenarioId !== b.scenarioId;
  const providerModelMismatch =
    (a.provider.model || "") !== (b.provider.model || "");
  const pipeA = a.pipelineInspector?.versions.pipelineVersion ?? null;
  const pipeB = b.pipelineInspector?.versions.pipelineVersion ?? null;
  const rulesA =
    a.pipelineInspector?.versions.transformationRulesVersion ?? null;
  const rulesB =
    b.pipelineInspector?.versions.transformationRulesVersion ?? null;
  const fmtA =
    a.pipelineInspector?.versions.formatterVersion ??
    a.formatter.version ??
    null;
  const fmtB =
    b.pipelineInspector?.versions.formatterVersion ??
    b.formatter.version ??
    null;
  const pipelineVersionMismatch = pipeA !== pipeB;
  const transformationRulesVersionMismatch = rulesA !== rulesB;
  const formatterVersionMismatch = fmtA !== fmtB;

  if (scenarioMismatch) {
    warnings.push("Scenario differs between comparison A and B.");
  }
  if (providerModelMismatch) {
    warnings.push("Provider model differs between comparison A and B.");
  }
  if (pipelineVersionMismatch) {
    warnings.push("Pipeline version differs between comparison A and B.");
  }
  if (transformationRulesVersionMismatch) {
    warnings.push(
      "Transformation Rules version differs between comparison A and B."
    );
  }
  if (formatterVersionMismatch) {
    warnings.push("Formatter version differs between comparison A and B.");
  }

  return {
    scenarioMismatch,
    providerModelMismatch,
    pipelineVersionMismatch,
    transformationRulesVersionMismatch,
    formatterVersionMismatch,
    warnings,
  };
}

/** UI section order for comparison panel (rules before prompts). */
export const AI_PIPELINE_COMPARISON_UI_ORDER = [
  "Test conditions",
  "Version differences",
  "Rule differences",
  "Prompt metrics",
  "Prompt line differences",
  "Provider outcomes",
  "Cautious interpretation",
] as const;
