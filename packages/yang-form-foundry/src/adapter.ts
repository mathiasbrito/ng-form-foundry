import { CompileRequest, YangEngine } from './engine';
import { ArtifactCache, InMemoryCache } from './cache';
import { CompiledModel } from './model';
import { FormValue, NodeGroup } from './schema';
import { mapToSchema } from './mapper';
import { toFormValue, toYangData } from './revert';

export interface CompileOptions extends CompileRequest {
  /** Cache key for the compiled model — typically a hash of the yang-library. */
  modelId: string;
}

/** Thrown by {@link YangFormAdapter.toYangData} when the engine rejects the reverted data. */
export class YangValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`RFC 7951 validation failed:\n  ${errors.join('\n  ')}`);
    this.name = 'YangValidationError';
  }
}

/**
 * The framework-agnostic core.
 *
 * Resolves a YANG model into a compiled `{ schema, binding }` (caching by
 * `modelId`), serves the frontend `NodeGroup` schema, and round-trips instance
 * data through the plain form value. The `binding` (resolved YANG model) never
 * leaves the adapter; only the `schema` is meant for the client.
 *
 * Construct it directly (`new YangFormAdapter(engine, cache)`) from any Node
 * runtime — Express, a worker, a CLI — or wrap it in a framework provider. It
 * imports nothing framework-specific; all environment access goes through the
 * injected {@link YangEngine} and {@link ArtifactCache}.
 */
export class YangFormAdapter {
  constructor(
    private readonly engine: YangEngine,
    private readonly cache: ArtifactCache = new InMemoryCache(),
  ) {}

  /** Resolve and map a model, or return the cached result for `modelId`. */
  async compile(opts: CompileOptions): Promise<CompiledModel> {
    const cached = await this.cache.get(opts.modelId);
    if (cached) return cached;

    const binding = await this.engine.resolve(opts);
    const model: CompiledModel = { schema: mapToSchema(binding), binding };
    await this.cache.set(opts.modelId, model);
    return model;
  }

  /** The `NodeGroup` schema DTO to hand the Angular app. Excludes the binding. */
  async getFormSchema(modelId: string): Promise<NodeGroup> {
    return (await this.require(modelId)).schema;
  }

  /** RFC 7951 instance data (e.g. a device GET) → a plain form value to edit. */
  async toFormValue(rfc7951: unknown, modelId: string): Promise<FormValue> {
    return toFormValue(rfc7951, (await this.require(modelId)).binding);
  }

  /** An edited form value → RFC 7951 data, validated by the engine, ready for write-back. */
  async toYangData(value: FormValue, modelId: string): Promise<Record<string, unknown>> {
    const model = await this.require(modelId);
    const data = toYangData(value, model.binding);
    const result = await this.engine.validate(data, model.binding);
    if (!result.valid) throw new YangValidationError(result.errors);
    return data;
  }

  private async require(modelId: string): Promise<CompiledModel> {
    const model = await this.cache.get(modelId);
    if (!model) throw new Error(`model '${modelId}' is not compiled — call compile() first`);
    return model;
  }
}
