/**
 * Server-only Production Runtime configuration.
 *
 * Reads only AI_OS_* migration flags. Never reads provider tokens,
 * wearable secrets, image URLs, or client-controlled configuration.
 * Does not log or serialize raw environment input.
 */

import type { ProductionRuntimeMode } from "./ProductionRuntimeTypes";

export interface ProductionRuntimeConfig {
  mode: ProductionRuntimeMode;

  globalKillSwitch: boolean;

  shadowSampleRateBasisPoints: number;

  shadowTimeoutMs: number;
}

export const DEFAULT_PRODUCTION_RUNTIME_CONFIG: ProductionRuntimeConfig = {
  mode: "legacy_only",
  globalKillSwitch: false,
  shadowSampleRateBasisPoints: 0,
  shadowTimeoutMs: 1500,
};

const OPERATIONAL_MODES = new Set<string>([
  "legacy_only",
  "legacy_with_shadow_dry_run",
]);

function parseMode(raw: string | undefined): ProductionRuntimeMode {
  if (raw != null && OPERATIONAL_MODES.has(raw)) {
    return raw as ProductionRuntimeMode;
  }
  return "legacy_only";
}

function parseKillSwitch(raw: string | undefined): boolean {
  return raw === "1";
}

/**
 * Integer BPS 0–10000 only. Invalid / decimal / negative → 0.
 */
function parseSampleBps(raw: string | undefined): number {
  if (raw == null || raw === "") return 0;
  if (!/^\d+$/.test(raw)) return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 10000) return 0;
  return n;
}

/**
 * Integer timeout 100–5000 ms. Invalid → 1500.
 */
function parseTimeoutMs(raw: string | undefined): number {
  if (raw == null || raw === "") return 1500;
  if (!/^\d+$/.test(raw)) return 1500;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 100 || n > 5000) return 1500;
  return n;
}

/**
 * Build config from an env map (or process.env when omitted).
 * Returns a fresh object with safe defaults — never exposes raw env.
 */
export function createProductionRuntimeConfigFromEnv(
  env?: Record<string, string | undefined>
): ProductionRuntimeConfig {
  const source: Record<string, string | undefined> =
    env ??
    (typeof process !== "undefined"
      ? (process.env as Record<string, string | undefined>)
      : {});

  return {
    mode: parseMode(source.AI_OS_PRODUCTION_MODE),
    globalKillSwitch: parseKillSwitch(source.AI_OS_GLOBAL_KILL_SWITCH),
    shadowSampleRateBasisPoints: parseSampleBps(source.AI_OS_SHADOW_SAMPLE_BPS),
    shadowTimeoutMs: parseTimeoutMs(source.AI_OS_SHADOW_TIMEOUT_MS),
  };
}
