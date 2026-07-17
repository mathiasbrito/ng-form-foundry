import type { FormValue } from '../../core/schema';
import type { Transformer, TransformResult } from '../../core/transformer';
import { inferNodeGroup } from '../../core/infer';
import { type JsonSchema, jsonSchemaToNodeGroup } from '../../core/json-schema';
import { isIntegerString, isUnsafeIntegerString } from '../../core/bigint';

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
  /**
   * Paths (as `JSON.stringify`'d key/index arrays) that held an integer literal
   * too large for a JS `number`. Their form value is a string; `toSource` emits
   * them back as unquoted numbers so precision survives the round-trip.
   */
  bigInts: string[];
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
    const schema = options?.schema
      ? jsonSchemaToNodeGroup(options.schema, options.rootName)
      : inferNodeGroup(data, options?.rootName);
    const binding: JsonFormat = {
      indent: detectIndent(source),
      trailingNewline: source.endsWith('\n'),
      bigInts,
    };
    return { schema, binding, initialValue: data };
  },

  toSource(value: FormValue, binding: JsonFormat): string {
    const paths = new Set(binding.bigInts);
    const prepared = paths.size ? markBigInts(value, [], paths) : value;
    let text = JSON.stringify(prepared, null, binding.indent);
    if (paths.size) text = text.replace(BIGINT_MARK_RE, '$1');
    return binding.trailingNewline ? text + '\n' : text;
  },
} satisfies Transformer<string, string, JsonFormat, JsonOptions>;

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
    const res: Record<string, unknown> = {};
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
    const res: Record<string, unknown> = {};
    for (const key of Object.keys(node)) res[key] = markBigInts(node[key], [...path, key], paths);
    return res;
  }
  return node;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
