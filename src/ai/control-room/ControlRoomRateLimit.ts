/**
 * Best-effort in-memory hourly request cap for internal image preview.
 *
 * Serverless instances may each keep separate memory — billing guard only,
 * not strong distributed security.
 */

export const DEFAULT_PREVIEW_MAX_REQUESTS_PER_HOUR = 3;
export const MIN_PREVIEW_MAX_REQUESTS_PER_HOUR = 1;
export const MAX_PREVIEW_MAX_REQUESTS_PER_HOUR = 10;
export const PREVIEW_RATE_WINDOW_MS = 60 * 60 * 1000;

export function parsePreviewMaxRequestsPerHour(
  raw: string | undefined
): number {
  if (raw === undefined || raw === "") {
    return DEFAULT_PREVIEW_MAX_REQUESTS_PER_HOUR;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return DEFAULT_PREVIEW_MAX_REQUESTS_PER_HOUR;
  }
  if (
    n < MIN_PREVIEW_MAX_REQUESTS_PER_HOUR ||
    n > MAX_PREVIEW_MAX_REQUESTS_PER_HOUR
  ) {
    return DEFAULT_PREVIEW_MAX_REQUESTS_PER_HOUR;
  }
  return n;
}

export interface PreviewRateLimitStore {
  /** Map of rate key → timestamps of accepted requests within the window. */
  buckets: Map<string, number[]>;
}

export function createPreviewRateLimitStore(): PreviewRateLimitStore {
  return { buckets: new Map() };
}

/** Module-level default store for the preview API process. */
const defaultStore: PreviewRateLimitStore = createPreviewRateLimitStore();

export function getDefaultPreviewRateLimitStore(): PreviewRateLimitStore {
  return defaultStore;
}

export interface PreviewRateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

/**
 * Check and (when allowed) record one request against the hourly cap.
 * Does not store access keys or raw IP addresses.
 */
export function consumePreviewRateLimit(
  rateKey: string,
  limit: number,
  nowMs: number = Date.now(),
  store: PreviewRateLimitStore = defaultStore
): PreviewRateLimitResult {
  const safeLimit = Math.max(
    MIN_PREVIEW_MAX_REQUESTS_PER_HOUR,
    Math.min(MAX_PREVIEW_MAX_REQUESTS_PER_HOUR, limit)
  );
  const windowStart = nowMs - PREVIEW_RATE_WINDOW_MS;
  const existing = store.buckets.get(rateKey) ?? [];
  const recent = existing.filter((ts) => ts > windowStart);

  if (recent.length >= safeLimit) {
    store.buckets.set(rateKey, recent);
    return { allowed: false, remaining: 0, limit: safeLimit };
  }

  recent.push(nowMs);
  store.buckets.set(rateKey, recent);
  return {
    allowed: true,
    remaining: Math.max(0, safeLimit - recent.length),
    limit: safeLimit,
  };
}

/** Test helper — clears the default in-memory store. */
export function resetDefaultPreviewRateLimitStore(): void {
  defaultStore.buckets.clear();
}
