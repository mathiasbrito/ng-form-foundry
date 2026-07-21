/**
 * Write an edited form value back onto libconfig source by span splicing.
 *
 * Counterpart of the AST/extraction in {@link import('./parser')} and
 * {@link import('./schema')}. Instead of regenerating text from the AST, the
 * edited value is compared against the AST node by node and only the spans
 * that actually changed are replaced in the original text — every unedited
 * byte (comments, indentation, `=` vs `:`, terminators, delimiter style)
 * survives verbatim.
 *
 * Emission is type-preserving, because the consuming C program reads settings
 * through typed lookups: a float stays a float (`21` edits to `21.0`), a hex
 * literal re-emits in hex at its original digit width, an int64 keeps its
 * `L`/`LL` suffix, and values beyond 2^53 travel as exact decimal strings.
 */
import type { NodeGroup, NodeType } from '../../core/schema';
import { type SchemaKeys, childrenOf, itemSchemaOf } from '../../core/schema-keys';
import type { CfgGroup, CfgScalar, CfgValue, CfgSetting, IntMeta } from './parser';
import { listShape, raw } from './schema';

interface Edit {
  start: number;
  end: number;
  text: string;
}

/**
 * Apply `value` onto the parsed `root` of `source`, returning the new text.
 *
 * Without `schema` (inferred mode) the value is authoritative for the whole
 * document: it was extracted from every setting, so a key it lacks is a
 * deletion. With `schema` (the NodeGroup the form was built from) the value
 * is authoritative for **schema-born paths only** — the form never carried
 * the other settings, so they survive byte-verbatim in their original
 * positions. A partial schema thus edits its slice of an OAI/srsRAN config
 * without erasing keys the schema does not enumerate; absence of a
 * schema-born key still deletes (a presence toggle turned off).
 */
export function applyValueToSource(
  source: string,
  root: CfgGroup,
  value: Record<string, unknown>,
  schema?: NodeGroup,
): string {
  const edits: Edit[] = [];
  patchGroup(source, root, value, edits, schema && childrenOf(schema));
  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

function patchGroup(src: string, group: CfgGroup, value: Record<string, unknown>, edits: Edit[], schema: SchemaKeys): void {
  for (const setting of group.settings) {
    if (schema && !schema.has(setting.name)) continue; // not schema-born: verbatim
    // Own-key check: `in` would resolve setting names like `toString` through
    // the prototype chain, making them undeletable (and their "value" a function).
    if (!value || !Object.prototype.hasOwnProperty.call(value, setting.name)) {
      edits.push(deleteSetting(src, setting));
      continue;
    }
    patchValue(src, setting.value, value[setting.name], edits, schema?.get(setting.name));
  }
  const known = new Set(group.settings.map((s) => s.name));
  // null/undefined means "absent", never a value: such keys are not added —
  // and under a schema, only schema-born keys may be added at all.
  const added = Object.keys(value ?? {}).filter(
    (k) => !known.has(k) && value[k] != null && (!schema || schema.has(k)),
  );
  if (added.length) {
    edits.push(insertionEdit(src, group, added.map((k) => `${k} = ${serialize(value[k], '')};`)));
  }
}

function patchValue(src: string, node: CfgValue, value: unknown, edits: Edit[], schema?: NodeType): void {
  switch (node.kind) {
    case 'scalar': {
      if (node.value === value) return;
      // The collection-wide bigint carry hands safe elements back as digit
      // strings; a string spelling the same value is not an edit.
      if (typeof value === 'string' && typeof node.value === 'number' && value === String(node.value)) return;
      edits.push({ ...node.span, text: emitScalar(value, node) });
      return;
    }
    case 'group': {
      if (isRecord(value)) return patchGroup(src, node, value, edits, schema && childrenOf(schema));
      edits.push({ ...node.span, text: serialize(value, '') }); // shape change: regenerate
      return;
    }
    case 'array': {
      if (Array.isArray(value)) return patchElements(src, node.elements, node, value, edits);
      // A string here is the read-only raw carry of an untyped empty array:
      // unchanged it stays verbatim, edited it is an error, never a splice.
      if (typeof value === 'string') {
        if (value === raw(node, src)) return;
        throw new Error('this collection is read-only (no element type to edit by): the edited text was not applied');
      }
      edits.push({ ...node.span, text: serialize(value, '') });
      return;
    }
    case 'list': {
      const shape = listShape(node);
      if (shape === 'groups' && Array.isArray(value)) {
        return patchElements(src, node.elements, node, value, edits, itemSchemaOf(schema));
      }
      if (shape === 'scalars' && Array.isArray(value)) {
        return patchElements(src, node.elements, node, value, edits);
      }
      if (shape === 'empty' && Array.isArray(value)) {
        // Editable only under a JSON Schema; entries splice inside the delimiters.
        if (value.length) {
          edits.push({ start: node.innerSpan.start, end: node.innerSpan.start, text: value.map((v) => serialize(v, '')).join(', ') });
        }
        return;
      }
      // Heterogeneous (read-only raw carry) or unchanged empty: the carry
      // stays verbatim, an edited carry is an error, a non-string value is a
      // genuine shape change and regenerates.
      if (typeof value === 'string') {
        if (value === raw(node, src)) return;
        throw new Error('this list is read-only (heterogeneous): the edited text was not applied');
      }
      if (value !== undefined) {
        edits.push({ ...node.span, text: serialize(value, '') });
      }
      return;
    }
  }
}

/** Element-wise patch of an array/list: edit in place, then grow or shrink. */
function patchElements(src: string, elements: CfgValue[], collection: { innerSpan: { start: number; end: number } }, value: unknown[], edits: Edit[], itemSchema?: NodeGroup): void {
  const shared = Math.min(elements.length, value.length);
  for (let i = 0; i < shared; i++) patchValue(src, elements[i]!, value[i], edits, itemSchema);
  if (value.length > elements.length) {
    const items = value.slice(elements.length).map((v) => serialize(v, ''));
    const at = elements.length ? elements[elements.length - 1]!.span.end : collection.innerSpan.start;
    edits.push({ start: at, end: at, text: (elements.length ? ', ' : '') + items.join(', ') });
  } else if (value.length < elements.length) {
    const start = value.length ? elements[value.length - 1]!.span.end : collection.innerSpan.start;
    edits.push({ start, end: elements[elements.length - 1]!.span.end, text: '' });
  }
}

/**
 * Deletion takes the whole setting line when nothing else lives on it: the
 * leading indent, the setting, trailing spaces, a trailing `#`/`//` comment,
 * and the newline. A setting sharing its line only gives up its own span.
 */
function deleteSetting(src: string, setting: CfgSetting): Edit {
  let start = setting.span.start;
  while (start > 0 && (src[start - 1] === ' ' || src[start - 1] === '\t')) start--;
  const atLineStart = start === 0 || src[start - 1] === '\n';
  let end = setting.span.end;
  while (end < src.length && (src[end] === ' ' || src[end] === '\t')) end++;
  if (src[end] === '#' || (src[end] === '/' && src[end + 1] === '/')) {
    const nl = src.indexOf('\n', end);
    end = nl === -1 ? src.length : nl;
  }
  if (atLineStart && src[end] === '\n') return { start, end: end + 1, text: '' };
  return { start: setting.span.start, end, text: '' };
}

/** Indent of the group's first setting, for inserted lines (2 spaces fallback). */
function settingIndent(src: string, group: CfgGroup): string {
  const first = group.settings[0];
  if (!first) return '  ';
  const lineStart = src.lastIndexOf('\n', first.span.start - 1) + 1;
  const lead = src.slice(lineStart, first.span.start);
  return /^[ \t]*$/.test(lead) ? lead : '  ';
}

/**
 * Where new settings go: on fresh lines after the last setting's own line (so
 * a trailing inline comment keeps its setting), else at the start of an empty
 * braced group, else appended at the end of an empty root document.
 */
function insertionEdit(src: string, group: CfgGroup, settings: string[]): Edit {
  const isRoot = group.span.start === 0 && group.span.end === src.length;
  const limit = isRoot ? src.length : group.innerSpan.end;
  const last = group.settings[group.settings.length - 1];
  if (last) {
    const indent = settingIndent(src, group);
    const nl = src.indexOf('\n', last.span.end);
    if (nl !== -1 && nl <= limit) {
      return { start: nl, end: nl, text: settings.map((s) => `\n${indent}${s}`).join('') };
    }
    return { start: limit, end: limit, text: settings.map((s) => ` ${s}`).join('') };
  }
  const at = isRoot ? limit : group.innerSpan.start;
  const text = settings.map((s) => `${isRoot ? '' : ' '}${s}`).join(' ');
  return { start: at, end: at, text: isRoot ? text + '\n' : text + ' ' };
}

/** Format an edited scalar in the style its AST node was written in. */
function emitScalar(value: unknown, node: CfgScalar): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  if (typeof value === 'string') {
    if (node.type === 'int' || node.type === 'int64') {
      if (!/^[-+]?[0-9]+$/.test(value)) {
        throw new Error(`'${value}' is not an integer: this setting is integer-typed`);
      }
      // The int64 string carry: exact digits back, with the original suffix.
      if (typeof node.value === 'string') return value + (node.int?.suffix ?? '');
      // A safe element of a carried collection: back to its own literal style.
      const n = Number(value);
      if (Number.isSafeInteger(n)) return intLiteral(n, node.int);
      return value + (node.int?.suffix ?? '');
    }
    return quote(value);
  }

  if (typeof value === 'number') {
    if (node.type === 'float') return floatLiteral(value);
    if ((node.type === 'int' || node.type === 'int64') && Number.isInteger(value)) {
      return intLiteral(value, node.int);
    }
    // A type-changing edit (e.g. a quoted "0xe00" slot edited to a number
    // under an integer schema): integral values emit an int literal —
    // float form is reserved for genuinely fractional values.
    return Number.isInteger(value) ? String(value) : floatLiteral(value);
  }

  return serialize(value, '');
}

/**
 * Integer in the source's radix, width, and prefix spelling, suffix preserved.
 * Negatives always emit decimal: the C scanner accepts no sign on a
 * hex/binary/octal literal, so `-0x1A` would not load.
 */
function intLiteral(value: number, meta: IntMeta | undefined): string {
  if (!meta || meta.radix === 10 || value < 0) return String(value) + (meta?.suffix ?? '');
  const prefix = meta.prefix || (meta.radix === 16 ? '0x' : meta.radix === 2 ? '0b' : '0o');
  const digits = value.toString(meta.radix).toUpperCase().padStart(meta.digits, '0');
  return prefix + digits + meta.suffix;
}

/** A float literal that stays a float: integral values gain `.0`. */
function floatLiteral(value: number): string {
  const s = String(value);
  return Number.isInteger(value) && !/[.eE]/.test(s) ? `${s}.0` : s;
}

function quote(value: string): string {
  let out = '"';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\f') out += '\\f';
    else if (code < 0x20) out += '\\x' + code.toString(16).padStart(2, '0');
    else out += ch;
  }
  return out + '"';
}

/**
 * Serialize a brand-new value with no AST counterpart (an added setting, a
 * grown collection). Typing is value-driven here: integral numbers emit as
 * ints, fractional as floats — a host that needs a float-typed `21.0` for a
 * fresh setting should send `21.0`-producing edits through an existing float
 * slot or accept the int typing. null/undefined have no libconfig literal
 * and throw.
 */
function serialize(value: unknown, indent: string): string {
  if (value == null) {
    throw new Error('null/undefined has no libconfig representation: omit the setting instead');
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return /^[-+]?[0-9]+$/.test(value) && isBigIntString(value) ? value + 'L' : quote(value);
  if (Array.isArray(value)) {
    const inner = value.map((v) => serialize(v, indent)).join(', ');
    const grouped = value.some((v) => isRecord(v) || Array.isArray(v));
    return grouped ? `( ${inner} )` : `[ ${inner} ]`;
  }
  if (isRecord(value)) {
    const body = Object.keys(value)
      .map((k) => `${k} = ${serialize(value[k], indent)};`)
      .join(' ');
    return `{ ${body} }`;
  }
  throw new Error(`a ${typeof value} value has no libconfig representation`);
}

/** An integer string that exceeds the double-safe range (the bigint carry). */
function isBigIntString(value: string): boolean {
  try {
    const big = BigInt(value);
    return big > BigInt(Number.MAX_SAFE_INTEGER) || big < BigInt(Number.MIN_SAFE_INTEGER);
  } catch {
    return false;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
