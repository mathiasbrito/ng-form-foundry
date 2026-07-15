import type { FormValue } from '../../core/schema';
import type { Transformer, TransformResult } from '../../core/transformer';
import { inferNodeGroup } from '../../core/infer';
import { type JsonSchema, jsonSchemaToNodeGroup } from '../../core/json-schema';

/** Options for {@link jsonTransformer}'s `toSchema`. */
export interface JsonOptions {
  /**
   * A JSON Schema describing the config. When given, the form is built from it;
   * when omitted, the form is inferred from the JSON data itself.
   */
  schema?: JsonSchema;
  /** Name for the root node group. Defaults to `__root__`. */
  rootName?: string;
}

/** How the source was formatted, so `toSource` re-emits it the same way. */
export interface JsonFormat {
  /** Indent width in spaces (detected from the source; defaults to 2). */
  indent: number;
  /** Whether the source ended with a trailing newline. */
  trailingNewline: boolean;
}

/**
 * A JSON {@link Transformer}: turn a JSON config document into a form and write
 * the edited value back to JSON. The form is built by the same format-agnostic
 * `core` builders the YAML transformer uses — only parsing (`JSON.parse`) and
 * serialization (`JSON.stringify`) are JSON-specific.
 *
 * Standard JSON has no comments, so revert re-serializes the edited value,
 * preserving the source's indent width and trailing newline. Key order follows
 * the form value (which follows the schema, derived from the original), so it is
 * preserved for untouched keys. For JSON **with comments** (JSONC), parse and
 * edit it as YAML with {@link import('../yaml/yaml-transformer').yamlTransformer}
 * instead — `JSON.parse` rejects comments.
 */
export const jsonTransformer = {
  id: 'json',

  toSchema(source: string, options?: JsonOptions): TransformResult<JsonFormat> {
    const data = (JSON.parse(source) ?? {}) as FormValue;
    const schema = options?.schema
      ? jsonSchemaToNodeGroup(options.schema, options.rootName)
      : inferNodeGroup(data, options?.rootName);
    const binding: JsonFormat = {
      indent: detectIndent(source),
      trailingNewline: source.endsWith('\n'),
    };
    return { schema, binding, initialValue: data };
  },

  toSource(value: FormValue, binding: JsonFormat): string {
    const text = JSON.stringify(value, null, binding.indent);
    return binding.trailingNewline ? text + '\n' : text;
  },
} satisfies Transformer<string, string, JsonFormat, JsonOptions>;

/** Indent width (in spaces) of the first indented line, or 2 if none/tabs. */
function detectIndent(source: string): number {
  const match = source.match(/\n( +)\S/);
  return match && match[1] ? match[1].length : 2;
}
