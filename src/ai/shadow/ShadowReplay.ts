/**
 * Shadow replay — deterministic architecture telemetry records.
 *
 * Must never store plans, prompts, images, URLs, tokens, body measurements,
 * health payloads, RenderPlan, TransformationPlan, formatted requests,
 * ValidationEvidence, or transport payloads.
 */

import { AI_OS_RUNTIME_RULES_VERSION } from "../runtime/AiOsRuntimeTypes";
import type { AiOsRuntimeResult } from "../runtime/AiOsRuntimeTypes";
import { cloneShadowMetrics } from "./ShadowMetrics";
import {
  SHADOW_RUNTIME_RULES_VERSION,
  type ShadowMetrics,
  type ShadowReplayRecord,
  type ShadowReplayVersions,
  type ShadowTerminalOutcome,
} from "./ShadowRuntimeTypes";

function buildVersions(
  runtimeResult: AiOsRuntimeResult | null
): ShadowReplayVersions {
  if (runtimeResult == null) {
    return {
      shadowRulesVersion: SHADOW_RUNTIME_RULES_VERSION,
      runtimeRulesVersion: AI_OS_RUNTIME_RULES_VERSION,
    };
  }

  const v = runtimeResult.trace.versions;
  const versions: ShadowReplayVersions = {
    shadowRulesVersion: SHADOW_RUNTIME_RULES_VERSION,
    runtimeRulesVersion: runtimeResult.trace.rulesVersion,
  };

  if (v.transformationRulesVersion !== undefined) {
    versions.transformationRulesVersion = v.transformationRulesVersion;
  }
  if (v.visualDirectionRulesVersion !== undefined) {
    versions.visualDirectionRulesVersion = v.visualDirectionRulesVersion;
  }
  if (v.renderPlanRulesVersion !== undefined) {
    versions.renderPlanRulesVersion = v.renderPlanRulesVersion;
  }
  if (v.formatterName !== undefined) {
    versions.formatterName = v.formatterName;
  }
  if (v.formatterVersion !== undefined) {
    versions.formatterVersion = v.formatterVersion;
  }
  if (v.transportAdapterId !== undefined) {
    versions.transportAdapterId = v.transportAdapterId;
  }
  if (v.resultValidatorRulesVersion !== undefined) {
    versions.resultValidatorRulesVersion = v.resultValidatorRulesVersion;
  }
  if (v.retryOrchestratorRulesVersion !== undefined) {
    versions.retryOrchestratorRulesVersion = v.retryOrchestratorRulesVersion;
  }

  return versions;
}

/**
 * Build a skipped replay stub when shadow mode is disabled.
 */
export function buildSkippedShadowReplay(
  metrics: ShadowMetrics
): ShadowReplayRecord {
  return {
    traceId: "shadow-skipped",
    runtimeVersion: AI_OS_RUNTIME_RULES_VERSION,
    runtimeMode: null,
    terminalOutcome: "skipped",
    stageSequence: [],
    versions: {
      shadowRulesVersion: SHADOW_RUNTIME_RULES_VERSION,
      runtimeRulesVersion: AI_OS_RUNTIME_RULES_VERSION,
    },
    metrics: cloneShadowMetrics(metrics),
  };
}

/**
 * Build a deterministic replay record from a runtime result + metrics.
 * Reads only safe trace fields — never artifacts.
 */
export function buildShadowReplayRecord(
  runtimeResult: AiOsRuntimeResult,
  metrics: ShadowMetrics,
  terminalOutcome?: ShadowTerminalOutcome
): ShadowReplayRecord {
  return {
    traceId: runtimeResult.trace.traceId,
    runtimeVersion: runtimeResult.trace.rulesVersion,
    runtimeMode: runtimeResult.mode,
    terminalOutcome: terminalOutcome ?? runtimeResult.terminalOutcome,
    stageSequence: runtimeResult.trace.stages.map((s) => s.stage),
    versions: buildVersions(runtimeResult),
    metrics: cloneShadowMetrics(metrics),
  };
}

/**
 * Deep-clone a replay record so callers cannot mutate stored telemetry.
 */
export function cloneShadowReplayRecord(
  record: ShadowReplayRecord
): ShadowReplayRecord {
  return structuredClone(record);
}
