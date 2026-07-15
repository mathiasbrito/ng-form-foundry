import type { NodeGroup, FormValue } from './schema';

/**
 * A transformer's revert context: whatever a transformer needs to turn an edited
 * {@link FormValue} back into its source format. Opaque to the catalog — each
 * transformer defines and consumes its own concrete shape (the YANG transformer
 * keeps the effective model, the YAML transformer keeps the parsed document and
 * inferred type map). Kept alongside the schema, not sent to the form UI.
 */
export type BindingMap = unknown;

/** The output of {@link Transformer.toSchema}: the form schema plus its revert context. */
export interface TransformResult<TBinding = BindingMap> {
  /** The ng-form-foundry schema to build a form from. */
  schema: NodeGroup;
  /** Revert context, passed back to {@link Transformer.toSource}. */
  binding: TBinding;
  /** Initial form value extracted from the source, if the source carried data. */
  initialValue?: FormValue;
}

type MaybePromise<T> = T | Promise<T>;

/**
 * Maps one source format to and from the ng-form-foundry schema. YANG, JSON
 * Schema, and plain YAML/JSON config each implement this so a single catalog can
 * turn any of them into an editable form and write the edited value back.
 *
 * `toSchema`/`toSource` may be sync or async — YANG compiles through an external
 * engine (async), while YAML/JSON parse in-process (sync). Register instances in
 * the {@link import('./registry').TransformerRegistry} to look them up by `id`.
 *
 * For **config formats** (YAML, JSON) the thing you load and the thing you save
 * are the same document type, so `TData` defaults to `TSource`. For **schema
 * formats** they differ: YANG's `toSchema` consumes a model source, but its
 * `toSource` reverts to RFC 7951 instance *data* — a different type — so YANG
 * sets `TData` explicitly.
 *
 * @typeParam TSource  what `toSchema` consumes (YAML text, a YANG source set…)
 * @typeParam TData    what `toSource` produces (defaults to `TSource`)
 * @typeParam TBinding the revert context shape this transformer round-trips
 * @typeParam TOptions per-call options (e.g. an optional JSON Schema for YAML)
 */
export interface Transformer<TSource = unknown, TData = TSource, TBinding = BindingMap, TOptions = void> {
  /** Stable catalog key, e.g. `'yang'`, `'yaml'`, `'json-schema'`. */
  readonly id: string;

  /** Turn a source document into a form schema (+ revert context and any initial value). */
  toSchema(source: TSource, options?: TOptions): MaybePromise<TransformResult<TBinding>>;

  /** Turn an edited form value back into the source data, using the binding from `toSchema`. */
  toSource(value: FormValue, binding: TBinding): MaybePromise<TData>;
}
