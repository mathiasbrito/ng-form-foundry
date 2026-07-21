import { type Document, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { FormValue, NodeGroup, NodeType, Thesaurus } from '../../core/schema';
import { applyThesaurus } from '../../core/thesaurus';
import type { Transformer, TransformResult } from '../../core/transformer';
import { inferNodeGroup } from '../../core/infer';
import { type JsonSchema, type JsonSchemaOptions, jsonSchemaToNodeGroup } from '../../core/json-schema';
import { mergeInferred } from '../../core/merge-inferred';
import { childrenOf } from '../../core/schema-keys';
import { assertSchemaShapes } from '../../core/shape-check';
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
  /**
   * Schema-driven mode only: what happens to keys the JSON Schema does not
   * cover. `'preserve'` (default) keeps them verbatim — the form never
   * carried them, so a partial schema edits its slice without erasing the
   * rest. `'drop'` makes the edited value authoritative for the whole
   * document, deleting uncovered keys — for consumers whose schema is
   * intentionally complete. `'edit'` surfaces them instead: uncovered keys
   * render as editable fields typed by the data (the inferred schema merged
   * under the JSON Schema), so nothing is invisible and the value covers the
   * whole document. Ignored without a `schema`.
   */
  unknownKeys?: 'preserve' | 'drop' | 'edit';
}

/**
 * The revert context: the parsed {@link Document} and — in schema-driven
 * mode with `unknownKeys: 'preserve'` or `'edit'` — the NodeGroup the form
 * was built from (the JSON Schema's own under `'preserve'`, the
 * inferred-merged one under `'edit'`), so `toSource` treats the value as
 * authoritative for schema-born paths only. Under `'edit'` that is almost
 * the whole document; the gate still protects the keys no form field can
 * carry (e.g. a key inside a covered choice's object that no case names).
 * Treat it as opaque: build it with `toSchema`, hand it back to `toSource`.
 */
export interface YamlBinding {
  doc: Document;
  schema?: NodeGroup;
}

/**
 * A YAML {@link Transformer}: turn a YAML config document into a form and write
 * the edited value back to YAML. Built for **editing config files** — the revert
 * preserves comments, key order, and formatting by applying edits onto the parsed
 * document (see {@link applyValueToDocument}).
 *
 * The `binding` it round-trips is a {@link YamlBinding}; `toSource` clones the
 * document inside it before applying, so a single `toSchema` result can serve
 * many edits.
 *
 * With a JSON Schema in {@link YamlOptions}, the form is schema-driven; without
 * one it is inferred from the data.
 */
export const yamlTransformer = {
  id: 'yaml',

  toSchema(source: string, options?: YamlOptions): TransformResult<YamlBinding> {
    // Parse integers as BigInt so the document nodes keep full precision; the
    // revert re-emits them verbatim. The form value can't carry a BigInt, so
    // out-of-range integers become strings there (safe ones become plain numbers).
    const doc = parseDocument(source, { intAsBigInt: true });
    const data = (normalizeBigInts(doc.toJS()) ?? {}) as FormValue;
    const unknownKeys = options?.unknownKeys ?? 'preserve';
    const fromJsonSchema = options?.schema
      ? jsonSchemaToNodeGroup(options.schema, options.rootName, options.schemaOptions)
      : undefined;
    const schema =
      fromJsonSchema && unknownKeys === 'edit'
        ? mergeInferred(fromJsonSchema, inferNodeGroup(data, options?.rootName))
        : fromJsonSchema ?? inferNodeGroup(data, options?.rootName);
    // A container-shape disagreement between document and schema would erase
    // the section on save: refuse up front (see assertSchemaShapes).
    if (fromJsonSchema) assertSchemaShapes(data, fromJsonSchema);
    // Every mode picks up the document's hex/octal presentation: inference
    // for its own leaves, schema-driven leaves too — the JSON Schema cannot
    // know the base a value was written in, the document does.
    if (doc.contents) annotateRadix(doc.contents, schema);
    const labeled = options?.thesaurus ? applyThesaurus(schema, options.thesaurus) : schema;
    return {
      schema: labeled,
      // 'preserve' gates the revert on the JSON Schema's NodeGroup; 'edit' on
      // the merged one (schema-born ≈ everything, but keys no form field can
      // carry stay protected); 'drop' and inferred mode leave the value
      // authoritative for the whole document.
      binding: { doc, schema: fromJsonSchema && unknownKeys !== 'drop' ? schema : undefined },
      initialValue: data,
    };
  },

  toSource(value: FormValue, binding: YamlBinding): string {
    const doc = binding.doc.clone();
    applyValueToDocument(doc, value, binding.schema);
    return String(doc);
  },
  // `satisfies` verifies conformance to the catalog contract while keeping the
  // concrete sync return types, so direct callers need no `await`.
} satisfies Transformer<string, string, YamlBinding, YamlOptions>;

const RADIX_BY_FORMAT: Record<string, 2 | 8 | 16> = { BIN: 2, OCT: 8, HEX: 16 };

/**
 * Copy non-decimal integer presentation (`0x`/`0o`/`0b` literals) from the
 * parsed document onto the schema as leaf/leafList `radix` display hints —
 * neither plain-data inference (`toJS()` drops the scalar format) nor a JSON
 * Schema (no radix vocabulary) can know the base a value was written in; the
 * document is the only authority. Runs in every mode and fills gaps only, so
 * a `radix` already on a leaf wins. The revert needs nothing: scalars are
 * mutated in place, so an edited value re-emits in its literal's own base.
 * Across group-list items the first non-decimal occurrence wins — one shared
 * item schema cannot vary the display per item. Keyed containers — groups,
 * choices, maps — resolve their children through {@link childrenOf}, so case
 * fields and map entries annotate too.
 */
function annotateRadix(node: unknown, schema: NodeType): void {
  switch (schema.kind) {
    case 'leaf': {
      // Only number/string leaves render radix.
      if (schema.type !== 'number' && schema.type !== 'string') return;
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
    case 'nodeGroupList': {
      if (!isSeq(node)) return;
      for (const item of node.items) annotateRadix(item, schema.type);
      return;
    }
    default: {
      // nodeGroup / choice / map — keyed containers over a document mapping.
      if (!isMap(node)) return;
      const keys = childrenOf(schema);
      if (!keys) return;
      for (const pair of node.items) {
        const child = keys.get(pairKey(pair.key));
        if (child) annotateRadix(pair.value, child);
      }
      return;
    }
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
    // Null prototype: a `__proto__` document key must stay a data key.
    const out: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(value)) out[key] = normalizeBigInts((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}
