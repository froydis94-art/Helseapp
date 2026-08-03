/**
 * Deterministic production migration policy.
 *
 * Permanent invariants on every decision:
 * - legacyRequired === true
 * - userVisibleOwner === "legacy"
 * - v2ProviderTrafficAllowed === false
 */

import type { ProductionRuntimeConfig } from "./ProductionRuntimeConfig";
import {
  PRODUCTION_RUNTIME_RULES_VERSION,
  type ProductionRequestContext,
  type ProductionRuntimeDecision,
  type ProductionRuntimeMode,
} from "./ProductionRuntimeTypes";

export interface ProductionRequestValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const MAX_ID_LENGTH = 128;

const ALLOWED_LOCALES = new Set([
  "nb",
  "nn",
  "en",
  "en-US",
  "en-GB",
  "nb-NO",
  "nn-NO",
]);

const FORBIDDEN_ID_PATTERNS: RegExp[] = [
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
];

function idLooksForbidden(value: string): boolean {
  for (const pattern of FORBIDDEN_ID_PATTERNS) {
    if (pattern.test(value)) return true;
  }
  return false;
}

function baseDecision(partial: {
  action: ProductionRuntimeDecision["action"];
  reasonCode: ProductionRuntimeDecision["reasonCode"];
  effectiveMode: ProductionRuntimeDecision["effectiveMode"];
  runShadowDryRun: boolean;
  sampleBucket: number | null;
  sampleRateBasisPoints: number;
  killSwitchActive: boolean;
  warnings?: string[];
  errors?: string[];
}): ProductionRuntimeDecision {
  return {
    rulesVersion: PRODUCTION_RUNTIME_RULES_VERSION,
    action: partial.action,
    reasonCode: partial.reasonCode,
    effectiveMode: partial.effectiveMode,
    legacyRequired: true,
    runShadowDryRun: partial.runShadowDryRun,
    userVisibleOwner: "legacy",
    v2ProviderTrafficAllowed: false,
    metadata: {
      sampleBucket: partial.sampleBucket,
      sampleRateBasisPoints: partial.sampleRateBasisPoints,
      killSwitchActive: partial.killSwitchActive,
    },
    warnings: partial.warnings ? [...partial.warnings] : [],
    errors: partial.errors ? [...partial.errors] : [],
  };
}

/**
 * Validate production request context without echoing sensitive values.
 */
export function validateProductionRequestContext(
  context: ProductionRequestContext
): ProductionRequestValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (context == null || typeof context !== "object") {
    return {
      valid: false,
      errors: ["Request context is invalid."],
      warnings,
    };
  }

  if (typeof context.authenticated !== "boolean") {
    errors.push("authenticated must be a boolean.");
  }

  if (typeof context.requestId !== "string" || context.requestId.trim() === "") {
    errors.push("requestId is required.");
  } else if (context.requestId.length > MAX_ID_LENGTH) {
    errors.push("requestId exceeds length limit.");
  } else if (idLooksForbidden(context.requestId)) {
    errors.push("requestId contains forbidden content.");
  }

  if (typeof context.routeId !== "string" || context.routeId.trim() === "") {
    errors.push("routeId is required.");
  } else if (context.routeId.length > MAX_ID_LENGTH) {
    errors.push("routeId exceeds length limit.");
  } else if (idLooksForbidden(context.routeId)) {
    errors.push("routeId contains forbidden content.");
  }

  if (context.locale !== undefined) {
    if (typeof context.locale !== "string" || !ALLOWED_LOCALES.has(context.locale)) {
      errors.push("locale is not allowlisted.");
    }
  }

  if (context.unitSystem !== undefined) {
    if (context.unitSystem !== "metric" && context.unitSystem !== "us") {
      errors.push("unitSystem is not allowlisted.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Deterministic sample bucket in [0, 9999] from requestId.
 * FNV-1a 32-bit — no randomness, timestamp, or crypto secret.
 */
export function calculateProductionSampleBucket(requestId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < requestId.length; i++) {
    hash ^= requestId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 10000;
}

const RESERVED_OR_UNSUPPORTED: ReadonlySet<ProductionRuntimeMode> = new Set([
  "v2_dry_run_internal",
  "v2_live_disabled",
]);

/**
 * Evaluate migration policy. Never throws for expected invalid input.
 * Order: validate → kill switch → legacy_only → shadow sampling → unsupported.
 */
export function evaluateProductionRuntimePolicy(
  config: ProductionRuntimeConfig,
  context: ProductionRequestContext
): ProductionRuntimeDecision {
  const validation = validateProductionRequestContext(context);
  const bps = Number.isInteger(config.shadowSampleRateBasisPoints)
    ? Math.max(0, Math.min(10000, config.shadowSampleRateBasisPoints))
    : 0;

  if (!validation.valid) {
    const hasMissingId =
      typeof context?.requestId !== "string" ||
      context.requestId.trim() === "" ||
      typeof context?.routeId !== "string" ||
      context.routeId.trim() === "";

    return baseDecision({
      action: "use_legacy_only",
      reasonCode: hasMissingId
        ? "missing_request_identity"
        : "safe_fallback_to_legacy",
      effectiveMode: "legacy_only",
      runShadowDryRun: false,
      sampleBucket: null,
      sampleRateBasisPoints: bps,
      killSwitchActive: Boolean(config.globalKillSwitch),
      errors: [...validation.errors],
      warnings: [...validation.warnings],
    });
  }

  if (config.globalKillSwitch) {
    return baseDecision({
      action: "disable_v2",
      reasonCode: "global_kill_switch",
      effectiveMode: "legacy_only",
      runShadowDryRun: false,
      sampleBucket: null,
      sampleRateBasisPoints: bps,
      killSwitchActive: true,
    });
  }

  if (config.mode === "legacy_only") {
    return baseDecision({
      action: "use_legacy_only",
      reasonCode: "default_legacy_policy",
      effectiveMode: "legacy_only",
      runShadowDryRun: false,
      sampleBucket: null,
      sampleRateBasisPoints: bps,
      killSwitchActive: false,
    });
  }

  if (config.mode === "legacy_with_shadow_dry_run") {
    const sampleBucket = calculateProductionSampleBucket(context.requestId);
    if (sampleBucket < bps) {
      return baseDecision({
        action: "use_legacy_with_shadow",
        reasonCode: "shadow_dry_run_enabled",
        effectiveMode: "legacy_with_shadow_dry_run",
        runShadowDryRun: true,
        sampleBucket,
        sampleRateBasisPoints: bps,
        killSwitchActive: false,
      });
    }
    return baseDecision({
      action: "skip_shadow",
      reasonCode: "shadow_sample_not_selected",
      effectiveMode: "legacy_with_shadow_dry_run",
      runShadowDryRun: false,
      sampleBucket,
      sampleRateBasisPoints: bps,
      killSwitchActive: false,
    });
  }

  if (RESERVED_OR_UNSUPPORTED.has(config.mode)) {
    return baseDecision({
      action: "reject_unsupported_mode",
      reasonCode: "unsupported_mode",
      effectiveMode: "legacy_only",
      runShadowDryRun: false,
      sampleBucket: null,
      sampleRateBasisPoints: bps,
      killSwitchActive: false,
      errors: ["Unsupported production runtime mode."],
    });
  }

  return baseDecision({
    action: "reject_unsupported_mode",
    reasonCode: "invalid_configuration",
    effectiveMode: "legacy_only",
    runShadowDryRun: false,
    sampleBucket: null,
    sampleRateBasisPoints: bps,
    killSwitchActive: Boolean(config.globalKillSwitch),
    errors: ["Invalid production runtime configuration."],
  });
}
