import { type Document, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { FormValue, NodeType, Thesaurus } from '../../core/schema';
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
    if (!options?.schema && doc.contents) annotateRadix(doc.contents, schema);
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

const RADIX_BY_FORMAT: Record<string, 2 | 8 | 16> = { BIN: 2, OCT: 8, HEX: 16 };

/**
 * Copy non-decimal integer presentation (`0x`/`0o`/`0b` literals) from the
 * parsed document onto the inferred schema as leaf/leafList `radix` display
 * hints — the plain-data inference cannot see them, because `toJS()` drops the
 * scalar format. The revert needs nothing: scalars are mutated in place, so an
 * edited value re-emits in its literal's own base. Across group-list items the
 * first non-decimal occurrence wins — one shared item schema cannot vary the
 * display per item. Schema-driven mode is untouched (JSON Schema has no radix
 * vocabulary).
 */
function annotateRadix(node: unknown, schema: NodeType): void {
  switch (schema.kind) {
    case 'leaf': {
      const radix = scalarRadix(node);
      if (radix && !schema.radix) schema.radix = radix;
      return;
    }
    case 'leafList': {
      if (!isSeq(node) || schema.radix) return;
      const radixes = node.items.map(scalarRadix);
      if (radixes[0] && radixes.every((r) => r === radixes[0])) schema.radix = radixes[0];
      return;
    }
    case 'nodeGroup': {
      if (!isMap(node)) return;
      for (const pair of node.items) {
        const child = schema.children[pairKey(pair.key)];
        if (child) annotateRadix(pair.value, child);
      }
      return;
    }
    case 'nodeGroupList': {
      if (!isSeq(node)) return;
      for (const item of node.items) annotateRadix(item, schema.type);
      return;
    }
    default:
      return; // choice/map never come out of plain-data inference
  }
}

/** The display radix of a non-decimal integer scalar node, else undefined. */
function scalarRadix(node: unknown): 2 | 8 | 16 | undefined {
  if (!isScalar(node)) return undefined;
  if (typeof node.value !== 'number' && typeof node.value !== 'bigint') return undefined;
  return RADIX_BY_FORMAT[node.format ?? ''];
}

/** The string a key node takes as a JS object key, matching `doc.toJS()`. */
function pairKey(key: unknown): string {
  const v = isScalar(key) ? key.value : key;
  return v == null ? '' : String(v);
}

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
