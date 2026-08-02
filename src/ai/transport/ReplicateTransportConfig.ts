/**
 * Replicate transport configuration — disabled by default.
 *
 * Server-only env factory. Never logs env values or exposes tokens.
 */

export const DEFAULT_REPLICATE_API_BASE_URL =
  "https://api.replicate.com/v1" as const;

export const DEFAULT_REPLICATE_TRANSPORT_MODEL =
  "black-forest-labs/flux-kontext-pro" as const;

export const DEFAULT_CREATE_TIMEOUT_MS = 15_000;
export const DEFAULT_POLL_INTERVAL_MS = 1_500;
export const DEFAULT_TOTAL_TIMEOUT_MS = 90_000;
export const DEFAULT_MAX_POLL_ATTEMPTS = 60;

const CREATE_TIMEOUT_MIN = 1_000;
const CREATE_TIMEOUT_MAX = 60_000;
const POLL_INTERVAL_MIN = 100;
const POLL_INTERVAL_MAX = 10_000;
const TOTAL_TIMEOUT_MIN = 1_000;
const TOTAL_TIMEOUT_MAX = 300_000;
const MAX_POLL_ATTEMPTS_MIN = 1;
const MAX_POLL_ATTEMPTS_MAX = 200;

export interface ReplicateTransportConfig {
  enabled: boolean;
  apiToken: string | null;
  apiBaseUrl: string;
  model: string;
  createTimeoutMs: number;
  pollIntervalMs: number;
  totalTimeoutMs: number;
  maxPollAttempts: number;
}

export const DEFAULT_REPLICATE_TRANSPORT_CONFIG: ReplicateTransportConfig = {
  enabled: false,
  apiToken: null,
  apiBaseUrl: DEFAULT_REPLICATE_API_BASE_URL,
  model: DEFAULT_REPLICATE_TRANSPORT_MODEL,
  createTimeoutMs: DEFAULT_CREATE_TIMEOUT_MS,
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  totalTimeoutMs: DEFAULT_TOTAL_TIMEOUT_MS,
  maxPollAttempts: DEFAULT_MAX_POLL_ATTEMPTS,
};

/**
 * Safe owner/name model reference only.
 * Rejects tokens, hashes, URLs, whitespace, traversal, query strings.
 */
export function isValidReplicateTransportModel(value: string): boolean {
  const raw = String(value || "").trim();
  if (!raw || raw !== value) return false;
  if (/\s/.test(raw)) return false;
  if (/^r8_/i.test(raw)) return false;
  if (/^[a-f0-9]{64}$/i.test(raw)) return false;
  if (/[:?#@\\]/.test(raw)) return false;
  if (raw.includes("..")) return false;
  if (/^https?:\/\//i.test(raw)) return false;
  if (!/^[^/\s]+\/[^/\s]+$/.test(raw)) return false;
  return true;
}

function parseBoundedInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  if (n < min || n > max) return fallback;
  return n;
}

/**
 * Build transport config from process env (or injected map).
 * Missing flag → disabled. Missing token → null (no throw).
 */
export function createReplicateTransportConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): ReplicateTransportConfig {
  const enabled = String(env.AI_OS_V2_REPLICATE_ENABLED || "").trim() === "1";
  const tokenRaw = env.REPLICATE_API_TOKEN;
  const apiToken =
    typeof tokenRaw === "string" && tokenRaw.trim().length > 0
      ? tokenRaw.trim()
      : null;

  const modelRaw = env.AI_OS_V2_REPLICATE_MODEL;
  const model =
    typeof modelRaw === "string" &&
    modelRaw.length > 0 &&
    isValidReplicateTransportModel(modelRaw)
      ? modelRaw
      : DEFAULT_REPLICATE_TRANSPORT_MODEL;

  return {
    enabled,
    apiToken,
    apiBaseUrl: DEFAULT_REPLICATE_API_BASE_URL,
    model,
    createTimeoutMs: parseBoundedInt(
      env.AI_OS_V2_REPLICATE_CREATE_TIMEOUT_MS,
      DEFAULT_CREATE_TIMEOUT_MS,
      CREATE_TIMEOUT_MIN,
      CREATE_TIMEOUT_MAX
    ),
    pollIntervalMs: parseBoundedInt(
      env.AI_OS_V2_REPLICATE_POLL_INTERVAL_MS,
      DEFAULT_POLL_INTERVAL_MS,
      POLL_INTERVAL_MIN,
      POLL_INTERVAL_MAX
    ),
    totalTimeoutMs: parseBoundedInt(
      env.AI_OS_V2_REPLICATE_TOTAL_TIMEOUT_MS,
      DEFAULT_TOTAL_TIMEOUT_MS,
      TOTAL_TIMEOUT_MIN,
      TOTAL_TIMEOUT_MAX
    ),
    maxPollAttempts: parseBoundedInt(
      env.AI_OS_V2_REPLICATE_MAX_POLL_ATTEMPTS,
      DEFAULT_MAX_POLL_ATTEMPTS,
      MAX_POLL_ATTEMPTS_MIN,
      MAX_POLL_ATTEMPTS_MAX
    ),
  };
}

/**
 * Safe view for tests/serialization — never includes the API token.
 */
export function toSafeReplicateTransportConfigView(
  config: ReplicateTransportConfig
): Omit<ReplicateTransportConfig, "apiToken"> & { hasApiToken: boolean } {
  return {
    enabled: config.enabled,
    hasApiToken: Boolean(config.apiToken),
    apiBaseUrl: config.apiBaseUrl,
    model: config.model,
    createTimeoutMs: config.createTimeoutMs,
    pollIntervalMs: config.pollIntervalMs,
    totalTimeoutMs: config.totalTimeoutMs,
    maxPollAttempts: config.maxPollAttempts,
  };
}
