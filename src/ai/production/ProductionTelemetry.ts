/**
 * Production-safe telemetry projection from Shadow Runtime results.
 *
 * Allowlisted architecture metrics only. No traceId, requestId, routeId,
 * prompts, images, URLs, replay, warnings, errors, or artifacts.
 */

import type {
  ShadowRuntimeResult,
  ShadowTerminalOutcome,
} from "../shadow/ShadowRuntimeTypes";
import { PRODUCTION_RUNTIME_RULES_VERSION } from "./ProductionRuntimeTypes";

export interface ProductionTelemetry {
  schemaVersion: 1;

  productionRulesVersion: typeof PRODUCTION_RUNTIME_RULES_VERSION;

  shadowRulesVersion: string | null;

  runtimeRulesVersion: string | null;

  runtimeMode: "dry_run" | null;

  terminalOutcome: ShadowTerminalOutcome | null;

  stageCount: number;

  totalDurationMs: number;

  stageDurationBuckets: {
    under100ms: number;
    from100To499ms: number;
    from500To999ms: number;
    atLeast1000ms: number;
  };

  flags: {
    shadowExecuted: boolean;
    shadowSucceeded: boolean;
    retryRequested: boolean;
    accepted: boolean;
    rejected: boolean;
    awaitingValidation: boolean;
    transportFailure: boolean;
  };
}

const FORBIDDEN_TELEMETRY_PATTERNS: RegExp[] = [
  /https?:\/\//i,
  /data:image\//i,
  /\bBearer\b/i,
  /\bAuthorization\b/i,
  /REPLICATE_API_TOKEN/i,
  /\bapi[_-]?key\b/i,
  /\br8_[A-Za-z0-9]+/i,
  /\bsk-[A-Za-z0-9]+/i,
  /(?:[A-Za-z0-9+/]{40,}={0,2})/,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /"traceId"\s*:/i,
  /"requestId"\s*:/i,
  /"prompt"/i,
  /"imageUrl"/i,
  /"imageBase64"/i,
  /"health"/i,
  /"healthPayload"/i,
];

function emptyBuckets(): ProductionTelemetry["stageDurationBuckets"] {
  return {
    under100ms: 0,
    from100To499ms: 0,
    from500To999ms: 0,
    atLeast1000ms: 0,
  };
}

function bucketDuration(
  buckets: ProductionTelemetry["stageDurationBuckets"],
  durationMs: number
): void {
  const ms = Math.max(0, Math.round(durationMs));
  if (ms < 100) buckets.under100ms += 1;
  else if (ms < 500) buckets.from100To499ms += 1;
  else if (ms < 1000) buckets.from500To999ms += 1;
  else buckets.atLeast1000ms += 1;
}

/**
 * Project Shadow result into production-safe telemetry.
 * Returns a fresh object. Deterministic for equivalent Shadow metrics.
 */
export function projectProductionTelemetry(
  shadowResult: ShadowRuntimeResult
): ProductionTelemetry {
  const metrics = shadowResult.metrics;
  const buckets = emptyBuckets();
  for (const stage of metrics.stageDurations) {
    bucketDuration(buckets, stage.durationMs);
  }

  const runtimeMode =
    metrics.runtimeMode === "dry_run" ? ("dry_run" as const) : null;

  return {
    schemaVersion: 1,
    productionRulesVersion: PRODUCTION_RUNTIME_RULES_VERSION,
    shadowRulesVersion: metrics.shadowRulesVersion ?? null,
    runtimeRulesVersion: metrics.runtimeVersion ?? null,
    runtimeMode,
    terminalOutcome: shadowResult.execution.terminalOutcome,
    stageCount: Math.max(0, Math.round(metrics.stageCount)),
    totalDurationMs: Math.max(0, Math.round(metrics.runtimeDurationMs)),
    stageDurationBuckets: buckets,
    flags: {
      shadowExecuted: Boolean(shadowResult.execution.executed),
      shadowSucceeded: Boolean(shadowResult.success),
      retryRequested: Boolean(metrics.retryRequested),
      accepted: Boolean(metrics.accepted),
      rejected: Boolean(metrics.rejected),
      awaitingValidation: Boolean(metrics.awaitingValidation),
      transportFailure: Boolean(metrics.transportFailure),
    },
  };
}

/**
 * Reject serialized telemetry containing forbidden sensitive content.
 */
export function validateProductionTelemetry(telemetry: ProductionTelemetry): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (telemetry == null || typeof telemetry !== "object") {
    return { valid: false, errors: ["Telemetry is invalid."] };
  }

  if (telemetry.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1.");
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(telemetry);
  } catch {
    return { valid: false, errors: ["Telemetry is not serializable."] };
  }

  for (const pattern of FORBIDDEN_TELEMETRY_PATTERNS) {
    if (pattern.test(serialized)) {
      errors.push("Telemetry contains forbidden content.");
      break;
    }
  }

  // Explicit key bans beyond pattern scan of values.
  const forbiddenKeys = [
    "traceId",
    "requestId",
    "routeId",
    "prompt",
    "imageUrl",
    "imageBase64",
    "health",
    "healthPayload",
    "replay",
  ];
  const keyScan = (value: unknown): void => {
    if (value == null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) keyScan(item);
      return;
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (forbiddenKeys.includes(key)) {
        errors.push(`Telemetry contains forbidden key: ${key}.`);
      }
      keyScan(nested);
    }
  };
  keyScan(telemetry);

  return { valid: errors.length === 0, errors };
}
