import { EffChoice, EffectiveModel, EffLeaf, EffNode } from './model';
import { CASE_KEY, FormValue } from '../../core/schema';
import { bareIdentity, qualifyIdentity, qualifiedName } from './rfc7951';

/**
 * The round-trip between a plain form value and RFC 7951 instance data, driven
 * entirely by the resolved {@link EffectiveModel} (the server-side binding).
 *
 * `toFormValue` strips module qualification and decodes each leaf to the shape
 * the form renders; `toYangData` re-encodes, keeps list keys as ordinary
 * members, and drops `config false` state. Neither coerces plain scalar values,
 * so int64/uint64/decimal64 (carried as strings) keep full precision.
 *
 * Per-type wire handling (RFC 7951 §6): `empty` is present as `[null]` /
 * absent; `bits` is a space-separated flag string modeled as a boolean group;
 * `identityref` is `module:identity` qualified only across module boundaries.
 * A `choice` (§7.9) has no wrapper on the wire — the active case's fields are
 * inline; in the form value it becomes `{ __case, ...fields }`, which this
 * module flattens on encode and reconstructs on decode.
 *
 * Counterpart of the forward `mapToSchema` in `mapper.ts`.
 */

/** Sentinel returned by the encoder to mean "omit this member entirely". */
const OMIT = Symbol('omit');

/** A node that carries its own instance data (everything except the transparent choice). */
type DataNode = Exclude<EffNode, EffChoice>;

/** RFC 7951 JSON instance data → a plain form value keyed by bare names. */
export function toFormValue(rfc7951: unknown, model: EffectiveModel): FormValue {
  return decodeObject(model.roots, asObject(rfc7951), null);
}

/** A plain form value → RFC 7951 JSON instance data ready for write-back. */
export function toYangData(value: FormValue, model: EffectiveModel): Record<string, unknown> {
  return encodeObject(model.roots, value, null);
}

// --- decode (RFC 7951 -> form) ------------------------------------------------

function decodeObject(children: EffNode[], raw: Record<string, unknown>, parentModule: string | null): FormValue {
  const out: FormValue = {};
  for (const child of children) {
    if (child.kind === 'choice') {
      const decoded = decodeChoice(child, raw, parentModule);
      if (decoded !== undefined) out[child.name] = decoded;
    } else {
      const rawChild = readMember(raw, child, parentModule);
      if (rawChild !== undefined) out[child.name] = decodeNode(child, rawChild);
    }
  }
  return out;
}

function decodeChoice(choice: EffChoice, raw: Record<string, unknown>, parentModule: string | null): FormValue | undefined {
  for (const c of choice.cases) {
    const fields = c.children.filter((f): f is DataNode => f.kind !== 'choice');
    if (!fields.some((f) => readMember(raw, f, parentModule) !== undefined)) continue;
    const caseValue: FormValue = { [CASE_KEY]: c.name };
    for (const f of fields) {
      const rawF = readMember(raw, f, parentModule);
      if (rawF !== undefined) caseValue[f.name] = decodeNode(f, rawF);
    }
    return caseValue;
  }
  return choice.default !== undefined ? { [CASE_KEY]: choice.default } : undefined;
}

function decodeNode(node: DataNode, raw: unknown): unknown {
  switch (node.kind) {
    case 'leaf':
      return decodeLeaf(node, raw);
    case 'leaf-list':
      return Array.isArray(raw) ? [...raw] : raw;
    case 'container':
      return decodeObject(node.children, asObject(raw), node.module);
    case 'list':
      return (Array.isArray(raw) ? raw : []).map((entry) =>
        decodeObject(node.children, asObject(entry), node.module),
      );
  }
}

function decodeLeaf(node: EffLeaf, raw: unknown): unknown {
  switch (node.type.base) {
    case 'empty':
      return true;
    case 'bits': {
      const set = new Set(typeof raw === 'string' ? raw.split(/\s+/).filter(Boolean) : []);
      const group: FormValue = {};
      for (const bit of node.type.bits ?? []) group[bit] = set.has(bit);
      return group;
    }
    case 'identityref':
      return typeof raw === 'string' ? bareIdentity(raw) : raw;
    default:
      return raw;
  }
}

// --- encode (form -> RFC 7951) ------------------------------------------------

function encodeObject(children: EffNode[], value: FormValue, parentModule: string | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const child of children) {
    if (child.kind === 'choice') {
      encodeChoice(child, value[child.name], parentModule, out);
      continue;
    }
    if (isExcluded(child)) continue;
    const v = value[child.name];
    if (v === undefined) continue;
    const encoded = encodeNode(child, v);
    if (encoded !== OMIT) out[qualifiedName(child.name, child.module, parentModule)] = encoded;
  }
  return out;
}

function encodeChoice(choice: EffChoice, choiceValue: unknown, parentModule: string | null, out: Record<string, unknown>): void {
  if (!choiceValue || typeof choiceValue !== 'object') return;
  const caseName = (choiceValue as Record<string, unknown>)[CASE_KEY];
  const active = choice.cases.find((c) => c.name === caseName);
  if (!active) return;
  // The active case's fields serialize inline at the choice's location.
  for (const f of active.children) {
    if (f.kind === 'choice' || isExcluded(f)) continue;
    const v = (choiceValue as Record<string, unknown>)[f.name];
    if (v === undefined) continue;
    const encoded = encodeNode(f, v);
    if (encoded !== OMIT) out[qualifiedName(f.name, f.module, parentModule)] = encoded;
  }
}

function encodeNode(node: DataNode, value: unknown): unknown | typeof OMIT {
  switch (node.kind) {
    case 'leaf':
      return encodeLeaf(node, value);
    case 'leaf-list':
      return Array.isArray(value) ? [...value] : value;
    case 'container':
      return encodeObject(node.children, asObject(value), node.module);
    case 'list':
      return (Array.isArray(value) ? value : []).map((entry) =>
        encodeObject(node.children, asObject(entry), node.module),
      );
  }
}

function encodeLeaf(node: EffLeaf, value: unknown): unknown | typeof OMIT {
  switch (node.type.base) {
    case 'empty':
      return value ? [null] : OMIT;
    case 'bits': {
      const group = asObject(value);
      return (node.type.bits ?? []).filter((bit) => group[bit]).join(' ');
    }
    case 'identityref':
      return typeof value === 'string' ? qualifyIdentity(value, node.module, node.type) : value;
    default:
      return value;
  }
}

// --- helpers ------------------------------------------------------------------

/** Read a node's value from an RFC 7951 object, tolerating a missing module prefix. */
function readMember(obj: Record<string, unknown>, node: EffNode, parentModule: string | null): unknown {
  const qualified = qualifiedName(node.name, node.module, parentModule);
  if (qualified in obj) return obj[qualified];
  return node.name in obj ? obj[node.name] : undefined;
}

function isExcluded(node: EffNode): boolean {
  return 'config' in node && node.config === false;
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
