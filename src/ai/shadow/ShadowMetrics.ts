/**
 * Shadow metrics collection — architecture telemetry only.
 *
 * Durations, counts, outcome flags, and version stamps.
 * Never copies prompts, images, URLs, tokens, plans, or payloads.
 */

import { AI_OS_RUNTIME_RULES_VERSION } from "../runtime/AiOsRuntimeTypes";
import type { AiOsRuntimeResult } from "../runtime/AiOsRuntimeTypes";
import {
  SHADOW_RUNTIME_RULES_VERSION,
  type ShadowMetrics,
  type ShadowStageDuration,
} from "./ShadowRuntimeTypes";

function emptyMetrics(
  runtimeDurationMs = 0,
  runtimeMode: ShadowMetrics["runtimeMode"] = null
): ShadowMetrics {
  return {
    runtimeDurationMs,
    stageDurations: [],
    stageCount: 0,
    retryRequested: false,
    accepted: false,
    rejected: false,
    awaitingValidation: false,
    transportFailure: false,
    runtimeMode,
    runtimeVersion: AI_OS_RUNTIME_RULES_VERSION,
    formatterVersion: null,
    validatorVersion: null,
    retryVersion: null,
    shadowRulesVersion: SHADOW_RUNTIME_RULES_VERSION,
  };
}

/**
 * Build empty metrics for a skipped (disabled) shadow invocation.
 */
export function emptyShadowMetrics(): ShadowMetrics {
  return emptyMetrics(0, null);
}

/**
 * Collect metrics from a completed AiOsRuntimeResult.
 * Reads only trace stages, versions, and terminalOutcome — never artifacts.
 */
export function collectShadowMetrics(
  runtimeResult: AiOsRuntimeResult | null,
  runtimeDurationMs: number
): ShadowMetrics {
  if (runtimeResult == null) {
    return emptyMetrics(Math.max(0, Math.round(runtimeDurationMs)), null);
  }

  const stageDurations: ShadowStageDuration[] = runtimeResult.trace.stages.map(
    (stage) => ({
      stage: stage.stage,
      durationMs: Math.max(0, Math.round(stage.durationMs)),
    })
  );

  const outcome = runtimeResult.terminalOutcome;

  return {
    runtimeDurationMs: Math.max(0, Math.round(runtimeDurationMs)),
    stageDurations,
    stageCount: stageDurations.length,
    retryRequested: outcome === "retry_required",
    accepted: outcome === "accepted",
    rejected: outcome === "rejected",
    awaitingValidation: outcome === "awaiting_validation",
    transportFailure: outcome === "transport_failed",
    runtimeMode: runtimeResult.mode,
    runtimeVersion: runtimeResult.trace.rulesVersion,
    formatterVersion: runtimeResult.trace.versions.formatterVersion ?? null,
    validatorVersion:
      runtimeResult.trace.versions.resultValidatorRulesVersion ?? null,
    retryVersion:
      runtimeResult.trace.versions.retryOrchestratorRulesVersion ?? null,
    shadowRulesVersion: SHADOW_RUNTIME_RULES_VERSION,
  };
}

/**
 * Deep-clone metrics so callers cannot mutate collected telemetry.
 */
export function cloneShadowMetrics(metrics: ShadowMetrics): ShadowMetrics {
  return structuredClone(metrics);
}
