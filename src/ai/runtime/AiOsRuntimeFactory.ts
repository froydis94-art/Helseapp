/**
 * AI OS Runtime dependency factory.
 *
 * No environment reads, no implicit production transport, no tokens.
 */

import type { ReplicateTransportAdapter } from "../transport/ReplicateTransportAdapter";

export interface AiOsRuntimeDependencies {
  transportAdapter?: ReplicateTransportAdapter;

  now: () => number;
}

/**
 * Build injectable runtime dependencies. Never reads environment variables.
 */
export function createAiOsRuntimeDependencies(
  options?: {
    transportAdapter?: ReplicateTransportAdapter;
    now?: () => number;
  }
): AiOsRuntimeDependencies {
  const deps: AiOsRuntimeDependencies = {
    now: options?.now ?? (() => Date.now()),
  };
  if (options?.transportAdapter !== undefined) {
    deps.transportAdapter = options.transportAdapter;
  }
  return deps;
}
