import type { FormValue, NodeGroup, NodeType, Thesaurus } from '../../core/schema';
import { applyThesaurus } from '../../core/thesaurus';
import type { Transformer, TransformResult } from '../../core/transformer';
import { inferNodeGroup } from '../../core/infer';
import { type JsonSchema, type JsonSchemaOptions, jsonSchemaToNodeGroup } from '../../core/json-schema';
import { isIntegerString, isUnsafeIntegerString } from '../../core/bigint';
import { type SchemaKeys, childrenOf, itemSchemaOf } from '../../core/schema-keys';
import { mergeInferred } from '../../core/merge-inferred';
import { assertSchemaShapes } from '../../core/shape-check';

/** Options for {@link jsonTransformer}'s `toSchema`. */
export interface JsonOptions {
  /**
   * A JSON Schema describing the config. When given, the form is built from it;
   * when omitted, the form is inferred from the JSON data itself.
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
   * cover. `'preserve'` (default) keeps them — the form never carried them,
   * so a partial schema edits its slice without erasing the rest. `'drop'`
   * makes the edited value authoritative for the whole document, deleting
   * uncovered keys — for consumers whose schema is intentionally complete.
   * `'edit'` surfaces them instead: uncovered keys render as editable fields
   * typed by the data (the inferred schema merged under the JSON Schema), so
   * nothing is invisible and the value covers the whole document. Ignored
   * without a `schema`.
   */
  unknownKeys?: 'preserve' | 'drop' | 'edit';
}

/** How the source was formatted, so `toSource` re-emits it the same way. */
export interface JsonFormat {
  /** Indent width in spaces (detected from the source; defaults to 2). */
  indent: number;
  /** Whether the source ended with a trailing newline. */
  trailingNewline: boolean;
  /**
   * Paths (as `JSON.stringify`'d key/index arrays) that held an integer literal
   * too large for a JS `number`. Their form value is a string; `toSource` emits
   * them back as unquoted numbers so precision survives the round-trip.
   */
  bigInts: string[];
  /**
   * Present in schema-driven mode with `unknownKeys: 'preserve'` (the
   * default) or `'edit'`: the original parsed data and the NodeGroup the
   * form was built from (the JSON Schema's own under `'preserve'`, the
   * inferred-merged one under `'edit'`). `toSource` then treats the value as
   * authoritative for schema-born paths only and merges it over the
   * original, so uncovered keys survive in their original key order — under
   * `'edit'` that protection is left covering only the keys no form field
   * can carry (e.g. a key inside a covered choice's object that no case
   * names).
   */
  original?: FormValue;
  schema?: NodeGroup;
}

/**
 * A JSON {@link Transformer}: turn a JSON config document into a form and write
 * the edited value back to JSON. The form is built by the same format-agnostic
 * `core` builders the YAML transformer uses — only parsing (`JSON.parse`) and
 * serialization (`JSON.stringify`) are JSON-specific.
 *
 * Standard JSON has no comments, so revert re-serializes, preserving the
 * source's indent width and trailing newline. In schema-driven mode with
 * `unknownKeys: 'preserve'` or `'edit'` the value is merged over the original
 * data at schema-born paths ({@link mergeSchemaBorn}), so uncovered keys and
 * the original key order survive; otherwise the edited value is serialized
 * as-is, key order following the form value. For JSON **with comments**
 * (JSONC), parse and edit it as YAML with
 * {@link import('../yaml/yaml-transformer').yamlTransformer} instead —
 * `JSON.parse` rejects comments.
 *
 * Integers beyond 2^53 can't survive a `number` round-trip, so they are carried
 * as strings in the form value and re-emitted verbatim as unquoted numbers (the
 * same strategy the YANG adapter uses for `uint64`).
 */
export const jsonTransformer = {
  id: 'json',

  toSchema(source: string, options?: JsonOptions): TransformResult<JsonFormat> {
    const bigInts: string[] = [];
    const parsed = JSON.parse(source, bigIntReviver);
    const data = collectBigInts(parsed ?? {}, [], bigInts) as FormValue;
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
    const labeled = options?.thesaurus ? applyThesaurus(schema, options.thesaurus) : schema;
    // 'preserve' gates the revert on the JSON Schema's NodeGroup; 'edit' on
    // the merged one (schema-born ≈ everything, but keys no form field can
    // carry stay protected); 'drop' and inferred mode leave the value
    // authoritative for the whole document.
    const preserveUnknown = fromJsonSchema != null && unknownKeys !== 'drop';
    const binding: JsonFormat = {
      indent: detectIndent(source),
      trailingNewline: source.endsWith('\n'),
      bigInts,
      original: preserveUnknown ? data : undefined,
      schema: preserveUnknown ? schema : undefined,
    };
    return { schema: labeled, binding, initialValue: data };
  },

  toSource(value: FormValue, binding: JsonFormat): string {
    const merged =
      binding.schema && binding.original !== undefined
        ? (mergeSchemaBorn(binding.original, value, childrenOf(binding.schema)) as FormValue)
        : value;
    const paths = new Set(binding.bigInts);
    const prepared = paths.size ? markBigInts(merged, [], paths) : merged;
    let text = JSON.stringify(prepared, null, binding.indent);
    if (paths.size) text = text.replace(BIGINT_MARK_RE, '$1');
    return binding.trailingNewline ? text + '\n' : text;
  },
} satisfies Transformer<string, string, JsonFormat, JsonOptions>;

/**
 * Merge the edited value over the original data, value-authoritative for
 * schema-born keys only: an uncovered key keeps its original value and its
 * position in the key order; a covered key takes the edited value (recursing
 * where both sides are objects, and per index into arrays of groups); a
 * covered key absent from the value is omitted (a presence toggle off);
 * covered keys new to the document append after the originals.
 */
function mergeSchemaBorn(original: unknown, value: unknown, schema: SchemaKeys): unknown {
  if (!isPlainObject(original) || !isPlainObject(value) || !schema) return value;
  // Null-prototype output and own-key checks: document keys are arbitrary, so
  // `__proto__` must stay a data key and `toString`/`constructor` must not
  // resolve through the prototype chain (which would drop or fabricate keys).
  const out: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(original)) {
    if (!schema.has(key)) {
      out[key] = original[key]; // not schema-born: verbatim, in place
    } else if (hasOwn(value, key)) {
      out[key] = mergeChild(original[key], value[key], schema.get(key));
    } // covered + absent: deleted
  }
  for (const key of Object.keys(value)) {
    if (!(key in out) && !hasOwn(original, key) && schema.has(key)) out[key] = value[key];
  }
  return out;
}

/** Per-key recursion: objects merge by their child schema, group arrays per index. */
function mergeChild(original: unknown, value: unknown, schema: NodeType | undefined): unknown {
  if (schema && isPlainObject(original) && isPlainObject(value)) {
    return mergeSchemaBorn(original, value, childrenOf(schema));
  }
  const itemSchema = itemSchemaOf(schema);
  if (itemSchema && Array.isArray(original) && Array.isArray(value)) {
    return value.map((item, i) =>
      i < original.length ? mergeChild(original[i], item, itemSchema) : item,
    );
  }
  return value;
}

/** Indent width (in spaces) of the first indented line, or 2 if none/tabs. */
function detectIndent(source: string): number {
  const match = source.match(/\n( +)\S/);
  return match && match[1] ? match[1].length : 2;
}

// --- big-integer preservation -------------------------------------------------

/** A key/index path key, collision-free across separator characters. */
function pathKey(path: (string | number)[]): string {
  return JSON.stringify(path);
}

/** Placeholder wrapping a big-int value through `JSON.stringify`, stripped after. */
const BIGINT_MARK = '@@nff-bigint@@';
const BIGINT_MARK_RE = new RegExp(`"${BIGINT_MARK}(-?\\d+)${BIGINT_MARK}"`, 'g');

/** An out-of-range integer literal, captured verbatim from the source. */
class BigIntLiteral {
  constructor(readonly digits: string) {}
}

/**
 * A `JSON.parse` reviver that captures integer literals too large for a `number`.
 * The parsed `value` is already lossy, so the exact digits come from the reviver
 * `context.source` (the raw literal text; available on Node 21+). Genuine strings
 * never reach here as numbers, so a quoted big-digit value stays a plain string.
 *
 * On a runtime without `context.source` (Node < 21) the exact digits can't be
 * recovered, so an out-of-range integer throws with an actionable message rather
 * than being silently rounded. Safe integers and floats are unaffected there.
 */
function bigIntReviver(_key: string, value: unknown, context?: { source?: string }): unknown {
  if (typeof value !== 'number') return value;
  if (context && typeof context.source === 'string') {
    return isUnsafeIntegerString(context.source) ? new BigIntLiteral(context.source) : value;
  }
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
    throw new RangeError(
      `JSON integer ${value} exceeds the safe range (2^53) and its exact value cannot be ` +
        `recovered on this runtime. Use Node ≥ 21 for lossless big-integer support, or ` +
        `quote the value as a string in the source.`,
    );
  }
  return value;
}

/**
 * Replace each {@link BigIntLiteral} with its digit string in the form value, and
 * record its path so `toSource` can re-emit it unquoted. Walks objects and arrays.
 */
function collectBigInts(node: unknown, path: (string | number)[], out: string[]): unknown {
  if (node instanceof BigIntLiteral) {
    out.push(pathKey(path));
    return node.digits;
  }
  if (Array.isArray(node)) return node.map((v, i) => collectBigInts(v, [...path, i], out));
  if (isPlainObject(node)) {
    // Null prototype: a `__proto__` document key must stay a data key.
    const res: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(node)) res[key] = collectBigInts(node[key], [...path, key], out);
    return res;
  }
  return node;
}

/**
 * Wrap the string value at each recorded big-int path in a placeholder so
 * `JSON.stringify` emits it as a (quoted) string that {@link BIGINT_MARK_RE} then
 * unquotes. A value the user has edited to a non-integer stays a normal string.
 */
function markBigInts(node: unknown, path: (string | number)[], paths: Set<string>): unknown {
  if (typeof node === 'string') {
    return paths.has(pathKey(path)) && isIntegerString(node) ? `${BIGINT_MARK}${node}${BIGINT_MARK}` : node;
  }
  if (Array.isArray(node)) return node.map((v, i) => markBigInts(v, [...path, i], paths));
  if (isPlainObject(node)) {
    const res: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(node)) res[key] = markBigInts(node[key], [...path, key], paths);
    return res;
  }
  return node;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Own-key membership, immune to `Object.prototype` members and null-prototype objects. */
function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
