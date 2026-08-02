/**
 * ModelRegistry — register and resolve ModelAdapter instances by id.
 *
 * Keeps provider selection out of the transformation engine and UI.
 */

import type { ModelAdapter } from "./ModelAdapter";

/**
 * In-memory adapter registry.
 * Callers register stubs or future live adapters; engine never imports providers.
 */
export class ModelRegistry {
  private readonly adapters = new Map<string, ModelAdapter>();
  private defaultId: string | null = null;

  /**
   * Register an adapter. Optionally mark it as the default.
   * Re-registering the same id replaces the previous adapter.
   */
  register(adapter: ModelAdapter, options?: { default?: boolean }): void {
    if (!adapter.id.trim()) {
      throw new Error("ModelAdapter.id must be a non-empty string");
    }
    this.adapters.set(adapter.id, adapter);
    if (options?.default || this.defaultId === null) {
      this.defaultId = adapter.id;
    }
  }

  /** Look up an adapter by id, or undefined if missing. */
  get(id: string): ModelAdapter | undefined {
    return this.adapters.get(id);
  }

  /**
   * Return the default adapter.
   * Throws if no adapter has been registered.
   */
  default(): ModelAdapter {
    if (this.defaultId === null) {
      throw new Error("ModelRegistry has no default adapter; call register() first");
    }
    const adapter = this.adapters.get(this.defaultId);
    if (!adapter) {
      throw new Error(`ModelRegistry default id "${this.defaultId}" is not registered`);
    }
    return adapter;
  }

  /** Registered adapter ids (stable insertion order). */
  ids(): string[] {
    return [...this.adapters.keys()];
  }
}
