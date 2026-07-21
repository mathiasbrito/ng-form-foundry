/**
 * Container-shape validation between a parsed document and a user-supplied
 * JSON Schema's {@link NodeGroup}.
 *
 * A schema that declares a section a list while the document holds a group
 * (or scalar, or vice versa) produces a form that cannot carry the section's
 * contents — the form builder coerces the unusable initial value to an empty
 * control, the form looks valid, and a save erases the section. For config
 * files that program live systems, that silent path is the worst failure
 * mode, so schema-driven `toSchema` refuses up front: the consumer catches
 * {@link SchemaShapeError} and falls back to inferred editing or fixes the
 * schema. Scalar-vs-scalar differences are *not* errors — a quoted `"0xe00"`
 * under an `integer` schema is a legitimate wild-file shape the form can
 * carry and edit.
 */
import type { Choice, NodeGroup, NodeType } from './schema';
import { childrenOf, isSingleNodeBody } from './schema-keys';

/** A document/schema container-shape disagreement, pointing at the key path. */
export class SchemaShapeError extends Error {
  constructor(
    /** Path of the offending key, e.g. `gNBs` or `cells[0].id`. */
    readonly path: string,
    /** What the document holds there. */
    readonly found: 'object' | 'array' | 'scalar',
    /** What the schema declares there. */
    readonly expected: 'object' | 'array' | 'scalar',
  ) {
    super(
      `'${path}': the document holds ${article(found)} here, but the schema expects ` +
        `${article(expected)} — the form cannot carry its contents, and saving would erase them. ` +
        `Align the schema with the document, or leave this key out of the schema.`,
    );
    this.name = 'SchemaShapeError';
  }
}

function article(shape: 'object' | 'array' | 'scalar'): string {
  return shape === 'array' ? 'an array' : shape === 'object' ? 'an object' : 'a scalar';
}

/**
 * Walk the extracted document value against the JSON-Schema-derived schema
 * and throw {@link SchemaShapeError} on the first container-kind
 * disagreement. Only schema-covered keys are checked (absent keys are
 * presence, uncovered keys are inference's business, and inference always
 * matches the document by construction).
 */
export function assertSchemaShapes(data: unknown, schema: NodeGroup): void {
  checkNode(data, schema, '');
}

function checkNode(value: unknown, node: NodeType, path: string): void {
  // Absent is presence semantics; null is either a nullable leaf's value or
  // the empty-container idiom (YAML `section:`) — nothing exists to erase.
  if (value == null) return;
  switch (node.kind) {
    case 'leaf':
      // Any primitive is carryable (string carries, quoted ints). An *empty*
      // collection is too: the libconfig empty-collection carry under a
      // string leaf round-trips as a no-op — only content can be erased.
      if (isRecord(value)) throw new SchemaShapeError(path, 'object', 'scalar');
      if (Array.isArray(value) && value.length > 0) throw new SchemaShapeError(path, 'array', 'scalar');
      return;
    case 'leafList':
      if (!Array.isArray(value)) throw new SchemaShapeError(path, shapeOf(value), 'array');
      value.forEach((item, i) => {
        if (isRecord(item) || Array.isArray(item)) {
          throw new SchemaShapeError(`${path}[${i}]`, shapeOf(item), 'scalar');
        }
      });
      return;
    case 'nodeGroupList':
      if (!Array.isArray(value)) throw new SchemaShapeError(path, shapeOf(value), 'array');
      value.forEach((item, i) => {
        if (!isRecord(item)) throw new SchemaShapeError(`${path}[${i}]`, shapeOf(item), 'object');
        checkChildren(item, node.type, `${path}[${i}]`);
      });
      return;
    case 'nodeGroup':
    case 'map':
      if (!isRecord(value)) throw new SchemaShapeError(path, shapeOf(value), 'object');
      checkChildren(value, node, path);
      return;
    case 'choice': {
      // The document's shape must be one some case can carry: a record for
      // record-bodied cases, an array for a collection-bodied case, a scalar
      // for a leaf-bodied case. An array under object-only cases (or a
      // record under scalar-only cases) is exactly the uncarryable-section
      // erasure this check exists to refuse.
      const allowed = caseShapes(node);
      const found = shapeOf(value);
      if (!allowed.has(found)) {
        throw new SchemaShapeError(path, found, preferredShape(allowed));
      }
      if (isRecord(value)) checkChildren(value, node, path);
      return;
    }
  }
}

/** The container shapes a choice's cases can carry, unioned across cases. */
function caseShapes(choice: Choice): Set<'object' | 'array' | 'scalar'> {
  const shapes = new Set<'object' | 'array' | 'scalar'>();
  for (const body of Object.values(choice.cases)) {
    if (!isSingleNodeBody(body)) {
      shapes.add('object'); // a record of named fields
      continue;
    }
    switch (body.kind) {
      case 'nodeGroup':
      case 'map':
        shapes.add('object');
        break;
      case 'nodeGroupList':
      case 'leafList':
        shapes.add('array');
        break;
      case 'leaf':
        shapes.add('scalar');
        break;
      case 'choice': // a nested choice's own cases are unknowable here: permissive
        shapes.add('object').add('array').add('scalar');
        break;
    }
  }
  return shapes;
}

/** A single representative shape for the error message, objects first. */
function preferredShape(allowed: Set<'object' | 'array' | 'scalar'>): 'object' | 'array' | 'scalar' {
  if (allowed.has('object')) return 'object';
  if (allowed.has('array')) return 'array';
  return 'scalar';
}

/** Recurse a record's own keys through the node's schema-born children. */
function checkChildren(record: Record<string, unknown>, node: NodeType, path: string): void {
  const keys = childrenOf(node);
  if (!keys) return;
  for (const key of Object.keys(record)) {
    const child = keys.get(key);
    if (child) checkNode(record[key], child, path ? `${path}.${key}` : key);
  }
}

function shapeOf(value: unknown): 'object' | 'array' | 'scalar' {
  if (Array.isArray(value)) return 'array';
  return isRecord(value) ? 'object' : 'scalar';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
