import type { Transformer } from './transformer';

/**
 * A lookup of {@link Transformer}s by their `id`. Lets a consumer pick a format
 * at runtime (`registry.get('yaml')`) instead of importing each transformer
 * directly. Direct imports remain available and tree-shakeable for consumers
 * that only need one format.
 */
export class TransformerRegistry {
  private readonly byId = new Map<string, Transformer<any, any, any, any>>();

  /** Register a transformer under its `id`. Throws if the `id` is already taken. */
  register(transformer: Transformer<any, any, any, any>): this {
    if (this.byId.has(transformer.id)) {
      throw new Error(`transformer '${transformer.id}' is already registered`);
    }
    this.byId.set(transformer.id, transformer);
    return this;
  }

  /** Get a transformer by `id`, or `undefined` if none is registered. */
  get(id: string): Transformer<any, any, any, any> | undefined {
    return this.byId.get(id);
  }

  /** Get a transformer by `id`, throwing a listing of known ids if absent. */
  require(id: string): Transformer<any, any, any, any> {
    const t = this.byId.get(id);
    if (!t) {
      const known = [...this.byId.keys()].join(', ') || '(none)';
      throw new Error(`no transformer registered for '${id}'. Registered: ${known}`);
    }
    return t;
  }

  /** The ids of all registered transformers. */
  ids(): string[] {
    return [...this.byId.keys()];
  }
}
