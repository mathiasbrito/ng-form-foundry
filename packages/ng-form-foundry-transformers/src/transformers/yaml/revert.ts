import { type Document, type Node, type Pair, type YAMLMap, type YAMLSeq, isMap, isScalar, isSeq } from 'yaml';
import { isIntegerString } from '../../core/bigint';

/**
 * Apply an edited form value onto a parsed YAML {@link Document} in place,
 * preserving comments and formatting on every node that survives the edit.
 *
 * Existing scalars are mutated (`node.value = …`), which keeps their inline and
 * leading comments; only genuinely new keys/items create fresh (comment-less)
 * nodes, and keys/items dropped from the value are deleted along with their
 * comments. Counterpart of the schema/inference in {@link import('./infer')} and
 * {@link import('./json-schema')}. Callers should clone the document first if the
 * original must be preserved.
 *
 * Map keys are matched by the *same string form* `doc.toJS()` produced when the
 * form value was built, so non-string keys (a `80:` port map, a `true:` flag)
 * reconcile against their original typed key nodes instead of being appended as
 * duplicate string-keyed pairs.
 */
export function applyValueToDocument(doc: Document, value: unknown): void {
  if (doc.contents == null) {
    doc.contents = doc.createNode(value) as unknown as Document['contents'];
    return;
  }
  doc.contents = applyToNode(doc, doc.contents as unknown, value) as Document['contents'];
}

/**
 * Reconcile the parsed `node` at one position with its edited `value`, returning
 * the node to store there. A scalar is mutated in place so its comments survive;
 * a map/sequence is reconciled child-by-child; a shape change (or a brand-new
 * position) allocates a fresh node.
 */
function applyToNode(doc: Document, node: unknown, value: unknown): unknown {
  if (isPlainObject(value)) {
    if (!isMap(node)) return doc.createNode(value);
    reconcileMap(doc, node, value);
    return node;
  }

  if (Array.isArray(value)) {
    if (!isSeq(node)) return doc.createNode(value);
    reconcileSeq(doc, node, value);
    return node;
  }

  // scalar (string / number / boolean / null)
  if (isScalar(node)) {
    node.value = coerceScalarValue(value, node.value);
    return node;
  }
  return doc.createNode(value);
}

/**
 * Update a map node against the value object: drop pairs whose key is gone,
 * recurse into the ones that remain (matched by their `toJS` key string, so
 * typed keys line up), and append a fresh pair for each genuinely new key.
 */
function reconcileMap(doc: Document, node: YAMLMap, value: Record<string, unknown>): void {
  node.items = node.items.filter((pair) => keyString(pair.key) in value);
  for (const key of Object.keys(value)) {
    const pair = node.items.find((p) => keyString(p.key) === key);
    if (pair) {
      pair.value = applyToNode(doc, pair.value, value[key]) as Node | null;
    } else {
      node.items.push(doc.createPair(key, value[key]) as Pair);
    }
  }
}

/** Update a sequence node: shrink/grow to the value's length, recurse per item. */
function reconcileSeq(doc: Document, node: YAMLSeq, value: unknown[]): void {
  while (node.items.length > value.length) node.items.pop();
  for (let i = 0; i < value.length; i++) {
    if (i < node.items.length) {
      node.items[i] = applyToNode(doc, node.items[i], value[i]) as Node;
    } else {
      node.items.push(doc.createNode(value[i]) as Node);
    }
  }
}

/**
 * The value to store on a scalar node. An out-of-range integer is carried in the
 * form value as a string (a `number` would lose precision); when the node it
 * lands on already held a BigInt — i.e. the source had an unquoted integer there
 * — restore the BigInt so it re-emits as a bare number rather than a quoted
 * string. Everything else passes through unchanged (a genuine string key stays a
 * string node, so it keeps its quotes).
 */
function coerceScalarValue(value: unknown, current: unknown): unknown {
  if (typeof current === 'bigint' && typeof value === 'string' && isIntegerString(value)) {
    return BigInt(value);
  }
  return value;
}

/**
 * The string a key node takes as a JS object key, matching `doc.toJS()`: the
 * scalar value stringified, with `null`/`undefined` collapsing to `''` (the
 * empty key `toJS` uses for a `null:` key).
 */
function keyString(key: unknown): string {
  const v = isScalar(key) ? key.value : key;
  return v == null ? '' : String(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
