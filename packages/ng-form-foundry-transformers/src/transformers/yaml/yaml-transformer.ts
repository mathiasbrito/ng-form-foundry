import { type Document, parseDocument } from 'yaml';
import type { FormValue, Thesaurus } from '../../core/schema';
import { applyThesaurus } from '../../core/thesaurus';
import type { Transformer, TransformResult } from '../../core/transformer';
import { inferNodeGroup } from '../../core/infer';
import { type JsonSchema, type JsonSchemaOptions, jsonSchemaToNodeGroup } from '../../core/json-schema';
import { isUnsafeBigInt } from '../../core/bigint';
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
  /** Options forwarded to `jsonSchemaToNodeGroup` (`refDocuments`, `optionalPresence`). */
  schemaOptions?: JsonSchemaOptions;
  /**
   * Display metadata (`label`/`description`/choice `caseLabels`) injected into
   * the produced schema, schema-driven or inferred alike — see
   * `applyThesaurus`. Keys are plain identifier names, matched
   * case-insensitively; never paths.
   */
  thesaurus?: Thesaurus;
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
    // Parse integers as BigInt so the document nodes keep full precision; the
    // revert re-emits them verbatim. The form value can't carry a BigInt, so
    // out-of-range integers become strings there (safe ones become plain numbers).
    const doc = parseDocument(source, { intAsBigInt: true });
    const data = (normalizeBigInts(doc.toJS()) ?? {}) as FormValue;
    const schema = options?.schema
      ? jsonSchemaToNodeGroup(options.schema, options.rootName, options.schemaOptions)
      : inferNodeGroup(data, options?.rootName);
    const labeled = options?.thesaurus ? applyThesaurus(schema, options.thesaurus) : schema;
    return { schema: labeled, binding: doc, initialValue: data };
  },

  toSource(value: FormValue, binding: Document): string {
    const doc = binding.clone();
    applyValueToDocument(doc, value);
    return String(doc);
  },
  // `satisfies` verifies conformance to the catalog contract while keeping the
  // concrete sync return types, so direct callers need no `await`.
} satisfies Transformer<string, string, Document, YamlOptions>;

/**
 * Replace every BigInt from an `intAsBigInt` parse with a form-value scalar: a
 * plain `number` when it fits the safe range, otherwise its decimal string (so
 * precision survives). Walks maps and sequences; leaves other values untouched.
 */
function normalizeBigInts(value: unknown): unknown {
  if (typeof value === 'bigint') return isUnsafeBigInt(value) ? value.toString() : Number(value);
  if (Array.isArray(value)) return value.map(normalizeBigInts);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) out[key] = normalizeBigInts((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}
