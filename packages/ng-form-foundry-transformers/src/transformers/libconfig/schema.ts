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
      return { kind: 'leaf', name, type: 'number', integer: true };
    case 'int64':
      // Beyond 2^53 the value rides as an exact decimal string.
      return typeof scalar.value === 'string'
        ? { kind: 'leaf', name, type: 'string', pattern: INTEGER_STRING_PATTERN }
        : { kind: 'leaf', name, type: 'number', integer: true };
  }
}

/**
 * A homogeneous scalar collection → leafList. One int64 element beyond 2^53
 * degrades the whole list to string carry: a leafList holds one scalar type,
 * so consistency beats convenience (see {@link arrayValue}, which matches).
 */
function listLeaf(name: string, elements: CfgScalar[]): NodeType {
  if (elements.length === 0) return rawLeaf(name, 'empty collection');
  const f = family(elements[0]!.type);
  if (f === 'integer' && elements.some((e) => typeof e.value === 'string')) {
    return { kind: 'leafList', name, type: 'string' };
  }
  return { kind: 'leafList', name, type: f === 'integer' || f === 'float' ? 'number' : f === 'bool' ? 'boolean' : 'string' };
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
  return {
    kind: 'leaf',
    name,
    type: 'string',
    readOnly: true,
    description: `Shown verbatim (${why}): libconfig gives no element type to edit by. Provide a JSON Schema to make it editable.`,
  };
}

/** The verbatim source slice of a node. */
export function raw(value: CfgValue, source: string): string {
  return source.slice(value.span.start, value.span.end);
}
