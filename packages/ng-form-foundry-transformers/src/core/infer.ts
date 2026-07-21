import type { Leaf, LeafList, LeafType, NodeGroup, NodeGroupList, NodeType } from './schema';

const ROOT = '__root__';

/**
 * Infer a root {@link NodeGroup} from a parsed data object — the whole form
 * when no JSON Schema is given, and the layer `mergeInferred` overlays under
 * `unknownKeys: 'edit'`. Structure and types come from the values themselves:
 *
 *   - object            → nodeGroup (recursed)
 *   - array of objects  → nodeGroupList (item schema = union of the items' keys)
 *   - array of scalars  → leafList (element type from the first element)
 *   - scalar            → typed leaf (string / number / boolean)
 *
 * `null` and empty/mixed arrays fall back to `string`, since a value alone can't
 * declare an enum, a constraint, or an empty array's element type. Pass a JSON
 * Schema to {@link import('./json-schema').jsonSchemaToNodeGroup} for richer output.
 */
export function inferNodeGroup(data: Record<string, unknown>, name: string = ROOT): NodeGroup {
  const group = objectToNodeGroup(data, name);
  group.root = true;
  return group;
}

function objectToNodeGroup(data: Record<string, unknown>, name: string): NodeGroup {
  // Null prototype: data keys are arbitrary, and assigning a `__proto__` key
  // onto a plain object would silently set the record's prototype instead.
  const children: Record<string, NodeType> = Object.create(null);
  for (const [key, value] of Object.entries(data)) {
    children[key] = inferNode(key, value);
  }
  return { kind: 'nodeGroup', name, children };
}

function inferNode(name: string, value: unknown): NodeType {
  if (Array.isArray(value)) return inferArray(name, value);
  if (isPlainObject(value)) return objectToNodeGroup(value, name);
  return { kind: 'leaf', name, type: scalarType(value) };
}

function inferArray(name: string, items: unknown[]): NodeGroupList | LeafList {
  const objects = items.filter(isPlainObject);
  if (objects.length && objects.length === items.length) {
    return { kind: 'nodeGroupList', name, type: objectToNodeGroup(unionKeys(objects), name) };
  }
  // array of scalars (or empty / mixed → string fallback)
  const first = items.find((v) => !isPlainObject(v) && !Array.isArray(v));
  return { kind: 'leafList', name, type: scalarType(first) };
}

/** A representative object with every key seen across `items`, each mapped to the first non-null sample. */
function unionKeys(items: Record<string, unknown>[]): Record<string, unknown> {
  const merged: Record<string, unknown> = Object.create(null);
  for (const item of items) {
    for (const [key, value] of Object.entries(item)) {
      if (!(key in merged) || (merged[key] == null && value != null)) merged[key] = value;
    }
  }
  return merged;
}

/** Infer a form {@link LeafType} from a scalar value (default `string`). */
function scalarType(value: unknown): LeafType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'string';
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
