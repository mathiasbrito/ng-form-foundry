import { type Document, type Node, type YAMLMap, isMap, isScalar, isSeq } from 'yaml';

type Path = (string | number)[];

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
 */
export function applyValueToDocument(doc: Document, value: unknown): void {
  if (doc.contents == null) {
    doc.contents = doc.createNode(value) as unknown as Document['contents'];
    return;
  }
  applyAt(doc, [], value);
}

function applyAt(doc: Document, path: Path, value: unknown): void {
  const node = nodeAt(doc, path);

  if (isPlainObject(value)) {
    if (!isMap(node)) return replaceAt(doc, path, value);
    const keys = new Set(Object.keys(value));
    for (const key of mapKeyStrings(node)) {
      if (!keys.has(key)) node.delete(key);
    }
    for (const key of keys) applyAt(doc, [...path, key], value[key]);
    return;
  }

  if (Array.isArray(value)) {
    if (!isSeq(node)) return replaceAt(doc, path, value);
    while (node.items.length > value.length) node.items.pop();
    for (let i = 0; i < value.length; i++) {
      if (i < node.items.length) applyAt(doc, [...path, i], value[i]);
      else node.items.push(doc.createNode(value[i]) as Node);
    }
    return;
  }

  // scalar (string / number / boolean / null)
  if (isScalar(node)) node.value = value;
  else replaceAt(doc, path, value);
}

/** Set the whole subtree at `path` to a fresh node (used when the shape changed). */
function replaceAt(doc: Document, path: Path, value: unknown): void {
  if (path.length === 0) {
    doc.contents = doc.createNode(value) as unknown as Document['contents'];
  } else {
    doc.setIn(path, doc.createNode(value));
  }
}

function nodeAt(doc: Document, path: Path): unknown {
  return path.length === 0 ? doc.contents : doc.getIn(path, true);
}

/** The string keys currently present in a YAML map node. */
function mapKeyStrings(node: YAMLMap): string[] {
  return node.items.map((pair) => (isScalar(pair.key) ? String(pair.key.value) : String(pair.key)));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
