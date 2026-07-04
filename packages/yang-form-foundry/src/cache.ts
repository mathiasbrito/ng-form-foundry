import { CompiledModel } from './model';

/**
 * Pluggable store for compiled models, keyed by a caller-chosen id (typically a
 * hash of the yang-library so the cache invalidates when the device's module
 * set changes). Swap the in-memory default for Redis or similar in production.
 */
export interface ArtifactCache {
  get(key: string): Promise<CompiledModel | undefined>;
  set(key: string, model: CompiledModel): Promise<void>;
  delete(key: string): Promise<void>;
}

/** A process-local {@link ArtifactCache}. Fine for a single instance; not shared across replicas. */
export class InMemoryCache implements ArtifactCache {
  private readonly store = new Map<string, CompiledModel>();

  async get(key: string): Promise<CompiledModel | undefined> {
    return this.store.get(key);
  }

  async set(key: string, model: CompiledModel): Promise<void> {
    this.store.set(key, model);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
