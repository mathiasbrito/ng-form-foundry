/**
 * libconfig AST → form schema and initial value.
 *
 * Inference works from the AST, not from plain data, because libconfig
 * literals are statically typed: `20`, `20.0`, `true`, and `"x"` are four
 * different types to the consuming C program, and the schema must reflect
 * that. Rules the plain-data inference in `core/infer.ts` cannot express:
 *
 * - int leaves get `integer: true`; int64 values beyond 2^53 become string
 *   leaves constrained to integer digits (the `core/bigint.ts` carry).
 * - A list of groups becomes a nodeGroupList whose item type is the union of
 *   the keys observed across entries; keys absent from at least one entry are
 *   marked `presence: true`, so building an entry that lacks them does not
 *   materialize null settings into the write-back.
 * - Empty arrays/lists and heterogeneous lists have no honest element type,
 *   so they map to read-only string leaves carrying the raw source span —
 *   verbatim round-trip, no mistyping. A user-supplied JSON Schema (see the
 *   transformer options) replaces this inference entirely and makes typed
 *   empty collections editable.
 */
import type { Leaf, NodeGroup, NodeType, FormValue } from '../../core/schema';
import { type SchemaKeys, childrenOf, itemSchemaOf } from '../../core/schema-keys';
import { type CfgGroup, type CfgList, type CfgScalar, type CfgValue, family } from './parser';

/** Digits only — the constraint for int64 values carried as strings. */
const INTEGER_STRING_PATTERN = '^[-+]?[0-9]+$';

/** Infer the root NodeGroup for a parsed document. */
export function libconfigToNodeGroup(root: CfgGroup, source: string, name: string): NodeGroup {
  const group = groupToNode(root, source, name) as NodeGroup;
  group.root = true;
  return group;
}

/**
 * The plain form value mirroring {@link libconfigToNodeGroup}'s schema.
 *
 * `emptyAsArrays` selects the empty-collection carry: the inferred schema
 * renders an empty `[]`/`()` as a read-only verbatim string (no honest element
 * type exists), while a user-supplied JSON Schema types it — so schema-driven
 * extraction hands the form a real empty array instead.
 */
export function extractValue(value: CfgValue, source: string, emptyAsArrays = false): unknown {
  switch (value.kind) {
    case 'scalar':
      return value.value;
    case 'group': {
      const out: FormValue = Object.create(null);
      for (const s of value.settings) out[s.name] = extractValue(s.value, source, emptyAsArrays);
      return out;
    }
    case 'array':
      if (value.elements.length === 0 && !emptyAsArrays) return raw(value, source);
      return arrayValue(value.elements);
    case 'list': {
      const shape = listShape(value);
      if (shape === 'groups') return value.elements.map((e) => extractValue(e, source, emptyAsArrays));
      if (shape === 'scalars') return arrayValue(value.elements as CfgScalar[]);
      if (shape === 'empty' && emptyAsArrays) return [];
      return raw(value, source); // empty or heterogeneous: the verbatim span
    }
  }
}

function nodeFor(name: string, value: CfgValue, source: string): NodeType {
  switch (value.kind) {
    case 'scalar':
      return scalarLeaf(name, value);
    case 'group':
      return groupToNode(value, source, name);
    case 'array':
      return listLeaf(name, value.elements);
    case 'list': {
      const shape = listShape(value);
      if (shape === 'groups') return groupListNode(name, value, source);
      if (shape === 'scalars') return listLeaf(name, value.elements as CfgScalar[]);
      return rawLeaf(name, shape === 'empty' ? 'empty collection' : 'heterogeneous list');
    }
  }
}

function groupToNode(group: CfgGroup, source: string, name: string): NodeGroup {
  const children: Record<string, NodeType> = Object.create(null);
  for (const s of group.settings) children[s.name] = nodeFor(s.name, s.value, source);
  return { kind: 'nodeGroup', name, children };
}

function scalarLeaf(name: string, scalar: CfgScalar): Leaf {
  switch (scalar.type) {
    case 'bool':
      return { kind: 'leaf', name, type: 'boolean' };
    case 'string':
      return { kind: 'leaf', name, type: 'string' };
    case 'float':
      return { kind: 'leaf', name, type: 'number' };
    case 'int':
      return withRadix({ kind: 'leaf', name, type: 'number', integer: true }, scalar);
    case 'int64':
      // Beyond 2^53 the value rides as an exact decimal string.
      return typeof scalar.value === 'string'
        ? withRadix({ kind: 'leaf', name, type: 'string', pattern: INTEGER_STRING_PATTERN }, scalar)
        : withRadix({ kind: 'leaf', name, type: 'number', integer: true }, scalar);
  }
}

/** Carry a non-decimal literal's base onto the leaf as its display radix. */
function withRadix(leaf: Leaf, scalar: CfgScalar): Leaf {
  const radix = scalar.int?.radix;
  if (radix && radix !== 10) leaf.radix = radix;
  return leaf;
}

/**
 * A homogeneous scalar collection → leafList. One int64 element beyond 2^53
 * degrades the whole list to string carry: a leafList holds one scalar type,
 * so consistency beats convenience (see {@link arrayValue}, which matches).
 */
function listLeaf(name: string, elements: CfgScalar[]): NodeType {
  if (elements.length === 0) return rawLeaf(name, 'empty collection');
  const f = family(elements[0]!.type);
  const radix = f === 'integer' ? sharedRadix(elements) : undefined;
  if (f === 'integer' && elements.some((e) => typeof e.value === 'string')) {
    return { kind: 'leafList', name, type: 'string', ...(radix && { radix }) };
  }
  return {
    kind: 'leafList',
    name,
    type: f === 'integer' || f === 'float' ? 'number' : f === 'bool' ? 'boolean' : 'string',
    ...(radix && { radix }),
  };
}

/** The display radix shared by every element, when uniform and non-decimal. */
function sharedRadix(elements: CfgScalar[]): 2 | 8 | 16 | undefined {
  const first = elements[0]?.int?.radix ?? 10;
  if (first === 10) return undefined;
  return elements.every((e) => (e.int?.radix ?? 10) === first) ? first : undefined;
}

function arrayValue(elements: CfgScalar[]): unknown[] {
  const stringCarry =
    elements.length > 0 &&
    family(elements[0]!.type) === 'integer' &&
    elements.some((e) => typeof e.value === 'string');
  return elements.map((e) => (stringCarry ? String(e.value) : e.value));
}

/**
 * A list of groups → nodeGroupList typed as the union of keys across entries;
 * keys missing from at least one entry become presence fields, so entries
 * lacking them build without the key instead of materializing nulls.
 */
function groupListNode(name: string, list: CfgList, source: string): NodeType {
  const groups = list.elements as CfgGroup[];
  const children: Record<string, NodeType> = Object.create(null);
  const seenIn: Record<string, number> = Object.create(null);
  for (const g of groups) {
    for (const s of g.settings) {
      if (!(s.name in children)) children[s.name] = nodeFor(s.name, s.value, source);
      seenIn[s.name] = (seenIn[s.name] ?? 0) + 1;
    }
  }
  for (const key of Object.keys(children)) {
    if ((seenIn[key] ?? 0) < groups.length) {
      const child = children[key]!;
      if (child.kind === 'leaf' || child.kind === 'nodeGroup' || child.kind === 'map' || child.kind === 'choice') {
        child.presence = true;
      }
    }
  }
  return { kind: 'nodeGroupList', name, type: { kind: 'nodeGroup', name, children } };
}

type ListShape = 'groups' | 'scalars' | 'empty' | 'heterogeneous';

/** Classify a `( )` list: all groups, all same-family scalars, empty, or mixed. */
export function listShape(list: CfgList): ListShape {
  if (list.elements.length === 0) return 'empty';
  if (list.elements.every((e) => e.kind === 'group')) return 'groups';
  if (list.elements.every((e) => e.kind === 'scalar')) {
    const families = new Set(list.elements.map((e) => family((e as CfgScalar).type)));
    if (families.size === 1) return 'scalars';
  }
  return 'heterogeneous';
}

/** Read-only leaf carrying the collection's verbatim source text. */
function rawLeaf(name: string, why: string): Leaf {
  const hint =
    why === 'empty collection'
      ? 'Provide a JSON Schema to type its elements and make it editable.'
      : 'It stays read-only: no single element type exists to edit by.';
  return {
    kind: 'leaf',
    name,
    type: 'string',
    readOnly: true,
    description: `Shown verbatim (${why}). ${hint}`,
  };
}

/** The verbatim source slice of a node. */
export function raw(value: CfgValue, source: string): string {
  return source.slice(value.span.start, value.span.end);
}

/**
 * Stamp the document's non-decimal integer presentation onto a
 * **schema-driven** NodeGroup as `radix` display hints — the JSON Schema has
 * no radix vocabulary, so the document is the only authority on how a value
 * is written. Covered number/string leaves whose literal is hex/octal/binary
 * (and homogeneous collections thereof) display in that base in every
 * `unknownKeys` mode, matching what inference does for uncovered fields.
 * Fills gaps only: a `radix` already on the leaf (e.g. carried by
 * `mergeInferred` under `'edit'`) wins. Keyed containers — groups, choices,
 * maps — resolve through {@link childrenOf}, so case fields and map entries
 * annotate too.
 */
export function annotateSchemaRadix(node: CfgValue, schema: NodeType): void {
  switch (schema.kind) {
    case 'leaf': {
      if (node.kind === 'scalar' && node.int && node.int.radix !== 10 && !schema.radix) {
        schema.radix = node.int.radix;
      }
      return;
    }
    case 'leafList': {
      if (schema.radix) return;
      if ((node.kind === 'array' || node.kind === 'list') && node.elements.every((e) => e.kind === 'scalar')) {
        const radix = sharedRadix(node.elements as CfgScalar[]);
        if (radix) schema.radix = radix;
      }
      return;
    }
    case 'nodeGroupList': {
      if (node.kind !== 'list') return;
      for (const el of node.elements) annotateSchemaRadix(el, schema.type);
      return;
    }
    default: {
      // nodeGroup / choice / map — keyed containers over a document group.
      if (node.kind !== 'group') return;
      const keys = childrenOf(schema);
      if (!keys) return;
      for (const setting of node.settings) {
        const child = keys.get(setting.name);
        if (child) annotateSchemaRadix(setting.value, child);
      }
      return;
    }
  }
}

/**
 * `unknownKeys: 'edit'` extraction fixup. The whole-document extraction runs
 * with `emptyAsArrays` (schema-covered empty collections are typed and
 * editable), but collections the JSON Schema does **not** cover merge as
 * read-only raw-carry leaves — their value must be the verbatim source
 * slice, not `[]`. Walks the document alongside the original (pre-merge)
 * schema coverage and restores the carry on every uncovered empty
 * collection, at any depth.
 */
export function carryUncoveredEmpties(
  group: CfgGroup,
  source: string,
  value: unknown,
  keys: SchemaKeys,
): void {
  if (!isRecord(value)) return;
  for (const setting of group.settings) {
    if (keys && !keys.has(setting.name)) {
      restoreEmptyCarries(setting.value, source, value, setting.name);
      continue;
    }
    const child = keys?.get(setting.name);
    const v = value[setting.name];
    if (setting.value.kind === 'group' && child) {
      carryUncoveredEmpties(setting.value, source, v, childrenOf(child));
    } else if (setting.value.kind === 'list' && Array.isArray(v)) {
      const itemSchema = itemSchemaOf(child);
      if (!itemSchema) continue;
      const itemKeys = childrenOf(itemSchema);
      setting.value.elements.forEach((el, i) => {
        if (el.kind === 'group') carryUncoveredEmpties(el, source, v[i], itemKeys);
      });
    }
  }
}

/** In a fully uncovered subtree, every empty collection reverts to its carry. */
function restoreEmptyCarries(node: CfgValue, source: string, parent: Record<string, unknown> | unknown[], key: string | number): void {
  if ((node.kind === 'array' || node.kind === 'list') && node.elements.length === 0) {
    (parent as Record<string, unknown>)[key as string] = raw(node, source);
    return;
  }
  if (node.kind === 'group') {
    const v = (parent as Record<string, unknown>)[key as string];
    if (!isRecord(v)) return;
    for (const s of node.settings) restoreEmptyCarries(s.value, source, v, s.name);
    return;
  }
  if (node.kind === 'list') {
    const v = (parent as Record<string, unknown>)[key as string];
    if (!Array.isArray(v)) return;
    node.elements.forEach((el, i) => restoreEmptyCarries(el, source, v as unknown[], i));
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
