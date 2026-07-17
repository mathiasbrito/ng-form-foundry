import { LeafType } from '../../core/schema';
import { YangBase, YangType } from './model';

/**
 * RFC 7951 (JSON Encoding of YANG Data) helpers.
 *
 * The two round-trip hazards this module owns: member-name namespace
 * qualification (§4) and the value encodings that differ from a naive JS mapping
 * (§6) — notably that int64/uint64/decimal64 are JSON *strings* to avoid IEEE-754
 * precision loss.
 */

/** Base types whose RFC 7951 value is a JSON string, not a number (§6.1). */
const STRING_ENCODED: ReadonlySet<YangBase> = new Set<YangBase>([
  'int64',
  'uint64',
  'decimal64',
]);

const NUMBER_BASES: ReadonlySet<YangBase> = new Set<YangBase>([
  'int8', 'int16', 'int32',
  'uint8', 'uint16', 'uint32',
]);

/** Whether a leaf of this base must keep a string form to preserve precision. */
export function isStringEncoded(base: YangBase): boolean {
  return STRING_ENCODED.has(base);
}

/**
 * Map a resolved YANG type to the form model's four leaf value types.
 *
 * - `boolean` and `empty` → boolean (empty is a present/absent checkbox).
 * - `enumeration` and `identityref` → enum (a dropdown of names).
 * - the fixed-width integers (int/uint 8..32) → number.
 * - everything else — string, binary, leafref, instance-identifier, union, and
 *   the string-encoded int64/uint64/decimal64 — renders as text.
 *
 * 64-bit integers and decimal64 map to `'string'` deliberately: a JS `number`
 * cannot hold them without loss, so they stay strings end to end. `bits` has no
 * leaf equivalent and is mapped to a group of boolean checkboxes by the mapper,
 * so it never reaches this function.
 */
export function toFormLeafType(t: YangType): LeafType {
  if (t.base === 'boolean' || t.base === 'empty') return 'boolean';
  if (t.base === 'enumeration' || t.base === 'identityref') return 'enum';
  if (NUMBER_BASES.has(t.base)) return 'number';
  return 'string';
}

type Identity = { name: string; module: string };

/** True when more than one derived identity shares this local name. */
function nameIsAmbiguous(identities: Identity[], name: string): boolean {
  return identities.filter((i) => i.name === name).length > 1;
}

/**
 * The token an identityref takes in the *form* (dropdown option and form value):
 * the bare identity name, or a fully-qualified `module:name` when the bare name
 * is ambiguous — the same local name is derived from more than one module.
 * Keeping ambiguous identities qualified lets {@link qualifyIdentity} recover the
 * exact identity on write-back; unambiguous ones stay bare for a clean UI.
 */
export function identityToken(module: string, name: string, identities: Identity[]): string {
  return nameIsAmbiguous(identities, name) ? `${module}:${name}` : name;
}

/**
 * Resolve an RFC 7951 identityref *wire* value to its form {@link identityToken}.
 * A qualified `module:name` names that exact identity; a bare name is an identity
 * in the leaf's own module (RFC 7951 §6.8).
 */
export function wireToFormIdentity(wire: string, leafModule: string, t: YangType): string {
  const identities = t.identities ?? [];
  const id = resolveIdentity(wire, leafModule, identities);
  return id ? identityToken(id.module, id.name, identities) : splitQualified(wire).name;
}

/**
 * RFC 7951 identityref value (§6.8): `module:identity` when the identity is
 * defined in a different module than the referencing leaf, otherwise the bare
 * identity name. The incoming `token` is the form value — bare, or `module:name`
 * when the local name is ambiguous (see {@link identityToken}) — so the exact
 * identity is recovered even when two modules derive the same name.
 */
export function qualifyIdentity(token: string, leafModule: string, t: YangType): string {
  const identities = t.identities ?? [];
  const { module, name } = splitQualified(token);
  const id = resolveIdentity(token, leafModule, identities);
  const idModule = id ? id.module : module ?? leafModule;
  return idModule !== leafModule ? `${idModule}:${name}` : name;
}

/**
 * The specific identity a bare-or-qualified reference points at: matched on
 * module + name when qualified (or when the leaf's own module has that name),
 * else the first identity with that local name.
 */
function resolveIdentity(ref: string, leafModule: string, identities: Identity[]): Identity | undefined {
  const { module, name } = splitQualified(ref);
  const owner = module ?? leafModule;
  return identities.find((i) => i.name === name && i.module === owner)
    ?? identities.find((i) => i.name === name);
}

/**
 * RFC 7951 member name for a node (§4). A name is qualified `module:name` when
 * the node is at the top level (no parent module) or its module differs from its
 * parent's; otherwise the bare name is used.
 */
export function qualifiedName(name: string, module: string, parentModule: string | null): string {
  return parentModule === null || module !== parentModule ? `${module}:${name}` : name;
}

/** Split an RFC 7951 member name into its optional module prefix and local name. */
export function splitQualified(member: string): { module?: string; name: string } {
  const i = member.indexOf(':');
  return i === -1 ? { name: member } : { module: member.slice(0, i), name: member.slice(i + 1) };
}
