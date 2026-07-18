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
import type { CfgGroup, CfgScalar, CfgValue, CfgSetting, IntMeta } from './parser';
import { listShape, raw } from './schema';

interface Edit {
  start: number;
  end: number;
  text: string;
}

/** Apply `value` onto the parsed `root` of `source`, returning the new text. */
export function applyValueToSource(source: string, root: CfgGroup, value: Record<string, unknown>): string {
  const edits: Edit[] = [];
  patchGroup(source, root, value, edits);
  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

function patchGroup(src: string, group: CfgGroup, value: Record<string, unknown>, edits: Edit[]): void {
  for (const setting of group.settings) {
    if (!value || !(setting.name in value)) {
      edits.push(deleteSetting(src, setting));
      continue;
    }
    patchValue(src, setting.value, value[setting.name], edits);
  }
  const known = new Set(group.settings.map((s) => s.name));
  const added = Object.keys(value ?? {}).filter((k) => !known.has(k));
  if (added.length) {
    edits.push(insertionEdit(src, group, added.map((k) => `${k} = ${serialize(value[k], '')};`)));
  }
}

function patchValue(src: string, node: CfgValue, value: unknown, edits: Edit[]): void {
  switch (node.kind) {
    case 'scalar': {
      if (node.value === value) return;
      edits.push({ ...node.span, text: emitScalar(value, node) });
      return;
    }
    case 'group': {
      if (isRecord(value)) return patchGroup(src, node, value, edits);
      edits.push({ ...node.span, text: serialize(value, '') }); // shape change: regenerate
      return;
    }
    case 'array': {
      if (Array.isArray(value)) return patchElements(src, node.elements, node, value, edits);
      // The read-only raw carry of an untyped empty array: leave verbatim.
      if (typeof value === 'string' && value === raw(node, src)) return;
      edits.push({ ...node.span, text: serialize(value, '') });
      return;
    }
    case 'list': {
      const shape = listShape(node);
      if (shape === 'groups' && Array.isArray(value)) {
        return patchElements(src, node.elements, node, value, edits);
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
      // Heterogeneous (read-only raw carry) or unchanged empty: only replace on
      // a genuine mismatch with a non-raw value shape — otherwise leave verbatim.
      if (typeof value === 'string' && value === raw(node, src)) return;
      if (value !== undefined && typeof value !== 'string') {
        edits.push({ ...node.span, text: serialize(value, '') });
      }
      return;
    }
  }
}

/** Element-wise patch of an array/list: edit in place, then grow or shrink. */
function patchElements(src: string, elements: CfgValue[], collection: { innerSpan: { start: number; end: number } }, value: unknown[], edits: Edit[]): void {
  const shared = Math.min(elements.length, value.length);
  for (let i = 0; i < shared; i++) patchValue(src, elements[i]!, value[i], edits);
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
    // The int64 string carry: exact digits back, with the original suffix.
    if (node.type === 'int64' && typeof node.value === 'string') {
      if (!/^[-+]?[0-9]+$/.test(value)) {
        throw new Error(`'${value}' is not an integer: this setting carries a 64-bit integer as a string`);
      }
      return value + (node.int?.suffix ?? '');
    }
    return quote(value);
  }

  if (typeof value === 'number') {
    if (node.type === 'float') return floatLiteral(value);
    if ((node.type === 'int' || node.type === 'int64') && Number.isInteger(value)) {
      return intLiteral(value, node.int);
    }
    return floatLiteral(value); // a fractional edit into an int slot: emit honestly
  }

  return serialize(value, '');
}

/** Integer in the source's radix and width, suffix preserved. */
function intLiteral(value: number, meta: IntMeta | undefined): string {
  if (!meta || meta.radix === 10) return String(value) + (meta?.suffix ?? '');
  const prefix = meta.radix === 16 ? '0x' : meta.radix === 2 ? '0b' : '0o';
  const digits = Math.abs(value).toString(meta.radix).toUpperCase().padStart(meta.digits, '0');
  return (value < 0 ? '-' : '') + prefix + digits + meta.suffix;
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
 * slot or accept the int typing (documented beta limitation).
 */
function serialize(value: unknown, indent: string): string {
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
  return 'true'; // null/undefined have no libconfig literal; unreachable via typed forms
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
