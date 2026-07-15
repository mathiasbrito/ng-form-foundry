import type { Leaf, LeafList, LeafType, NodeGroup, NodeGroupList, NodeType } from './schema';

/**
 * The subset of JSON Schema (draft-07 style) this transformer maps to a form.
 * Only the keywords that shape a form are read; anything else is ignored. No
 * validation is performed — the schema drives *structure and types*, not
 * constraint checking (that stays server-side).
 */
export interface JsonSchema {
  type?: JsonSchemaType | JsonSchemaType[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  title?: string;
  default?: unknown;
}

type JsonSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

const ROOT = '__root__';

/**
 * Map a JSON Schema whose top level is an object into a root {@link NodeGroup}.
 * `object` → nodeGroup, `array` of objects → nodeGroupList, `array` of scalars →
 * leafList, a scalar with `enum` → enum leaf, other scalars → typed leaf.
 * `required` marks child leaves, `title` becomes the label, `default` carries a
 * scalar default.
 */
export function jsonSchemaToNodeGroup(schema: JsonSchema, name: string = ROOT): NodeGroup {
  const group = objectToNodeGroup(schema, name, schema.title);
  group.root = true;
  return group;
}

function objectToNodeGroup(schema: JsonSchema, name: string, label?: string): NodeGroup {
  const required = new Set(schema.required ?? []);
  const children: Record<string, NodeType> = {};
  for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
    children[key] = schemaToNode(key, propSchema, required.has(key));
  }
  const group: NodeGroup = { kind: 'nodeGroup', name, children };
  if (label) group.label = label;
  return group;
}

function schemaToNode(name: string, schema: JsonSchema, required: boolean): NodeType {
  const type = primaryType(schema);

  if (type === 'object') {
    return objectToNodeGroup(schema, name, schema.title);
  }

  if (type === 'array') {
    const items = schema.items ?? {};
    if (primaryType(items) === 'object') {
      const node: NodeGroupList = {
        kind: 'nodeGroupList',
        name,
        type: objectToNodeGroup(items, name, items.title),
      };
      if (schema.title) node.label = schema.title;
      return node;
    }
    const list: LeafList = { kind: 'leafList', name, type: scalarType(items) };
    if (schema.title) list.label = schema.title;
    return list;
  }

  // scalar leaf (possibly an enum)
  const leaf: Leaf = { kind: 'leaf', name, type: scalarType(schema) };
  if (schema.enum && schema.enum.length) {
    leaf.type = 'enum';
    leaf.enum = schema.enum.filter((v): v is string | number =>
      typeof v === 'string' || typeof v === 'number',
    );
  }
  if (required) leaf.required = true;
  if (isScalar(schema.default)) leaf.default = schema.default;
  if (schema.title) leaf.label = schema.title;
  return leaf;
}

/** The first declared type, ignoring a `null` companion in a `[T, 'null']` union. */
function primaryType(schema: JsonSchema): JsonSchemaType | undefined {
  const t = schema.type;
  if (Array.isArray(t)) return t.find((x) => x !== 'null');
  return t;
}

/** Map a JSON Schema scalar type to a form {@link LeafType} (default `string`). */
function scalarType(schema: JsonSchema): LeafType {
  if (schema.enum && schema.enum.length) return 'enum';
  switch (primaryType(schema)) {
    case 'boolean':
      return 'boolean';
    case 'number':
    case 'integer':
      return 'number';
    default:
      return 'string';
  }
}

function isScalar(v: unknown): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}
