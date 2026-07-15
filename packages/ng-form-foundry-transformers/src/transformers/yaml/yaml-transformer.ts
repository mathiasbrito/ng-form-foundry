import { type Document, parseDocument } from 'yaml';
import type { FormValue } from '../../core/schema';
import type { Transformer, TransformResult } from '../../core/transformer';
import { inferNodeGroup } from '../../core/infer';
import { type JsonSchema, jsonSchemaToNodeGroup } from '../../core/json-schema';
import { applyValueToDocument } from './revert';

/** Options for {@link yamlTransformer}'s `toSchema`. */
export interface YamlOptions {
  /**
   * A JSON Schema describing the config. When given, the form is built from it
   * (types, required, enums, nested shape); when omitted, the form is inferred
   * from the YAML data itself (structure + value types).
   */
  schema?: JsonSchema;
  /** Name for the root node group. Defaults to `__root__`. */
  rootName?: string;
}

/**
 * A YAML {@link Transformer}: turn a YAML config document into a form and write
 * the edited value back to YAML. Built for **editing config files** — the revert
 * preserves comments, key order, and formatting by applying edits onto the parsed
 * document (see {@link applyValueToDocument}).
 *
 * The `binding` it round-trips is the parsed {@link Document}; `toSource` clones
 * it before applying, so a single `toSchema` result can serve many edits.
 *
 * With a JSON Schema in {@link YamlOptions}, the form is schema-driven; without
 * one it is inferred from the data.
 */
export const yamlTransformer = {
  id: 'yaml',

  toSchema(source: string, options?: YamlOptions): TransformResult<Document> {
    const doc = parseDocument(source);
    const data = (doc.toJS() ?? {}) as FormValue;
    const schema = options?.schema
      ? jsonSchemaToNodeGroup(options.schema, options.rootName)
      : inferNodeGroup(data, options?.rootName);
    return { schema, binding: doc, initialValue: data };
  },

  toSource(value: FormValue, binding: Document): string {
    const doc = binding.clone();
    applyValueToDocument(doc, value);
    return String(doc);
  },
  // `satisfies` verifies conformance to the catalog contract while keeping the
  // concrete sync return types, so direct callers need no `await`.
} satisfies Transformer<string, string, Document, YamlOptions>;
