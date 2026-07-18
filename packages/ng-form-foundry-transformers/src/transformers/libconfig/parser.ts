/**
 * A lossless libconfig parser: source text → positioned AST.
 *
 * Every node carries its `[start, end)` span into the original text, and every
 * scalar carries the emission metadata (`radix`, `L` suffix, float-ness, raw
 * lexeme) that {@link import('./revert')} needs to write an edited value back
 * without re-typing the setting for the consuming C program — libconfig is
 * statically typed, so `20` and `20.0` are different types to
 * `config_lookup_*`. Comments and formatting are not modeled: the revert
 * splices only edited value spans, so every unedited byte survives verbatim.
 *
 * Implemented independently from the libconfig manual
 * (https://hyperrealm.github.io/libconfig/libconfig_manual.html); the grammar
 * covers: groups `{}`, arrays `[]` (homogeneous scalars), lists `()`
 * (heterogeneous), settings `name = value;` / `name : value` with an optional
 * `;`/`,` terminator, int (decimal/hex/binary/octal), int64 (`L`/`LL`
 * suffix), float, bool (case-insensitive), strings with escapes and adjacent
 * literal concatenation, `#`/`//`/`/* *​/` comments, and `@include` lines.
 */

/** Half-open source range of a node, in code-unit offsets. */
export interface Span {
  start: number;
  end: number;
}

/** How an integer literal was written, so an edit re-emits the same style. */
export interface IntMeta {
  radix: 2 | 8 | 10 | 16;
  /** `L`/`LL` suffix, verbatim, or empty. */
  suffix: string;
  /** Hex/binary/octal digit count of the literal, for width-preserving edits. */
  digits: number;
}

export type CfgValue = CfgScalar | CfgGroup | CfgArray | CfgList;

export interface CfgScalar {
  kind: 'scalar';
  span: Span;
  /**
   * `int` and `float` hold a JS number; `int64` holds the exact decimal digits
   * as a string when the value is outside the safe integer range, a number
   * otherwise (the string carry mirrors `core/bigint.ts`).
   */
  type: 'int' | 'int64' | 'float' | 'bool' | 'string';
  value: number | string | boolean;
  int?: IntMeta;
}

export interface CfgSetting {
  name: string;
  /** The whole setting: name through terminator (exclusive of trailing comment). */
  span: Span;
  value: CfgValue;
}

export interface CfgGroup {
  kind: 'group';
  span: Span;
  /** Between the braces (the whole file for the root) — the insertion window. */
  innerSpan: Span;
  settings: CfgSetting[];
}

export interface CfgArray {
  kind: 'array';
  span: Span;
  innerSpan: Span;
  elements: CfgScalar[];
}

export interface CfgList {
  kind: 'list';
  span: Span;
  innerSpan: Span;
  elements: CfgValue[];
}

/** Options observed by the parser (a subset of the transformer's options). */
export interface ParseOptions {
  /**
   * `'reject'` (default) errors on an `@include` line — the parsed form would
   * silently show less than the C reader sees. `'opaque'` skips the directive:
   * the line survives verbatim in the source and the included settings stay
   * invisible to the form.
   */
  includes?: 'reject' | 'opaque';
}

/** A parse failure, pointing at the offending line and column. */
export class LibconfigParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(`libconfig parse error at ${line}:${column} — ${message}`);
    this.name = 'LibconfigParseError';
  }
}

const NAME_RE = /^[A-Za-z*][-A-Za-z0-9_*.]*/;
const INT_RE = /^[-+]?(0[xX][0-9A-Fa-f]+|0[bB][01]+|0[oO][0-7]+|[0-9]+)(LL?)?/;
const FLOAT_RE = /^[-+]?(([0-9]*\.[0-9]+|[0-9]+\.[0-9]*)([eE][-+]?[0-9]+)?|[0-9]+[eE][-+]?[0-9]+)/;
const BOOL_RE = /^(true|false)(?![-A-Za-z0-9_*.])/i;

/** Parse a libconfig document into its root group (spans index into `source`). */
export function parseLibconfig(source: string, options?: ParseOptions): CfgGroup {
  return new Parser(source, options?.includes ?? 'reject').parseRoot();
}

class Parser {
  private pos = 0;

  constructor(
    private readonly src: string,
    private readonly includes: 'reject' | 'opaque',
  ) {}

  parseRoot(): CfgGroup {
    const settings = this.parseSettings(undefined);
    return {
      kind: 'group',
      span: { start: 0, end: this.src.length },
      innerSpan: { start: 0, end: this.src.length },
      settings,
    };
  }

  /** Settings until `closer` (or EOF for the root). */
  private parseSettings(closer: '}' | undefined): CfgSetting[] {
    const settings: CfgSetting[] = [];
    for (;;) {
      this.skipTrivia();
      if (this.pos >= this.src.length) {
        if (closer) this.fail(`expected '${closer}'`);
        return settings;
      }
      if (closer && this.src[this.pos] === closer) return settings;
      if (this.src[this.pos] === '@') {
        this.handleInclude();
        continue;
      }
      settings.push(this.parseSetting(settings));
    }
  }

  private parseSetting(siblings: CfgSetting[]): CfgSetting {
    const start = this.pos;
    const name = this.match(NAME_RE) ?? this.fail('expected a setting name');
    if (siblings.some((s) => s.name === name)) {
      this.fail(`duplicate setting name '${name}' in the same group`);
    }
    this.skipTrivia();
    if (this.src[this.pos] !== '=' && this.src[this.pos] !== ':') {
      this.fail(`expected '=' or ':' after '${name}'`);
    }
    this.pos++;
    this.skipTrivia();
    const value = this.parseValue();
    this.skipTrivia();
    // Terminator is optional in the grammar: `;`, `,`, or nothing.
    if (this.src[this.pos] === ';' || this.src[this.pos] === ',') this.pos++;
    return { name, span: { start, end: this.pos }, value };
  }

  private parseValue(): CfgValue {
    const c = this.src[this.pos];
    if (c === '{') return this.parseGroup();
    if (c === '[') return this.parseCollection('[', ']', 'array') as CfgArray;
    if (c === '(') return this.parseCollection('(', ')', 'list') as CfgList;
    return this.parseScalar();
  }

  private parseGroup(): CfgGroup {
    const start = this.pos++;
    const innerStart = this.pos;
    const settings = this.parseSettings('}');
    const innerEnd = this.pos;
    this.pos++; // consume '}'
    return {
      kind: 'group',
      span: { start, end: this.pos },
      innerSpan: { start: innerStart, end: innerEnd },
      settings,
    };
  }

  private parseCollection(open: string, close: string, kind: 'array' | 'list'): CfgArray | CfgList {
    const start = this.pos++;
    const innerStart = this.pos;
    const elements: CfgValue[] = [];
    for (;;) {
      this.skipTrivia();
      if (this.pos >= this.src.length) this.fail(`expected '${close}'`);
      if (this.src[this.pos] === close) break;
      const element = kind === 'array' ? this.parseScalar() : this.parseValue();
      elements.push(element);
      this.skipTrivia();
      if (this.src[this.pos] === ',') this.pos++;
      else if (this.src[this.pos] !== close) this.fail(`expected ',' or '${close}'`);
    }
    const innerEnd = this.pos;
    this.pos++; // consume closer
    if (kind === 'array') {
      const nonScalar = elements.find((e) => e.kind !== 'scalar');
      if (nonScalar) this.fail('arrays hold scalars only (use a list for groups)');
      const types = new Set(elements.map((e) => family((e as CfgScalar).type)));
      if (types.size > 1) this.fail('array elements must share one scalar type');
      return {
        kind: 'array',
        span: { start, end: this.pos },
        innerSpan: { start: innerStart, end: innerEnd },
        elements: elements as CfgScalar[],
      };
    }
    return {
      kind: 'list',
      span: { start, end: this.pos },
      innerSpan: { start: innerStart, end: innerEnd },
      elements,
    };
  }

  private parseScalar(): CfgScalar {
    const start = this.pos;
    const rest = this.src.slice(this.pos);

    const bool = BOOL_RE.exec(rest);
    if (bool) {
      this.pos += bool[0].length;
      return { kind: 'scalar', span: { start, end: this.pos }, type: 'bool', value: bool[0].toLowerCase() === 'true' };
    }

    if (rest[0] === '"') return this.parseString();

    // Float before int: `1.5` must not lex as int `1` + junk.
    const float = FLOAT_RE.exec(rest);
    if (float) {
      this.pos += float[0].length;
      return { kind: 'scalar', span: { start, end: this.pos }, type: 'float', value: Number(float[0]) };
    }

    const int = INT_RE.exec(rest);
    if (int) {
      this.pos += int[0].length;
      return this.intScalar(int[0], { start, end: this.pos });
    }

    return this.fail('expected a value');
  }

  private intScalar(lexeme: string, span: Span): CfgScalar {
    const sign = lexeme[0] === '-' ? '-' : '';
    const unsigned = lexeme.replace(/^[-+]/, '');
    const suffix = /LL?$/i.exec(unsigned)?.[0] ?? '';
    const body = suffix ? unsigned.slice(0, -suffix.length) : unsigned;
    const prefix = body.slice(0, 2).toLowerCase();
    const radix: IntMeta['radix'] =
      prefix === '0x' ? 16 : prefix === '0b' ? 2 : prefix === '0o' ? 8 : 10;
    const digits = radix === 10 ? body : body.slice(2);
    const big = BigInt(sign + (radix === 10 ? digits : body.slice(0, 2) + digits));
    const meta: IntMeta = { radix, suffix, digits: digits.length };
    // Values past 2^53 ride as exact decimal strings (the core bigint strategy);
    // the suffix and radix stay in the metadata for the write-back.
    const safe = big >= BigInt(Number.MIN_SAFE_INTEGER) && big <= BigInt(Number.MAX_SAFE_INTEGER);
    const type = suffix || !safe ? 'int64' : 'int';
    return {
      kind: 'scalar',
      span,
      type,
      value: safe ? Number(big) : big.toString(),
      int: meta,
    };
  }

  private parseString(): CfgScalar {
    const start = this.pos;
    let value = '';
    // Adjacent literals concatenate: `"a" "b"` (possibly across lines) is "ab".
    for (;;) {
      value += this.parseStringLiteral();
      const resume = this.pos;
      this.skipTrivia();
      if (this.src[this.pos] !== '"') {
        this.pos = resume; // trivia after the last literal belongs to the caller
        break;
      }
    }
    return { kind: 'scalar', span: { start, end: this.pos }, type: 'string', value };
  }

  private parseStringLiteral(): string {
    this.pos++; // opening quote
    let out = '';
    while (this.pos < this.src.length) {
      const c = this.src[this.pos];
      if (c === '"') {
        this.pos++;
        return out;
      }
      if (c === '\\') {
        const esc = this.src[this.pos + 1];
        if (esc === 'x') {
          out += String.fromCharCode(parseInt(this.src.slice(this.pos + 2, this.pos + 4), 16));
          this.pos += 4;
          continue;
        }
        const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', f: '\f', v: '\v', '\\': '\\', '"': '"' };
        out += (esc !== undefined && simple[esc]) || esc || '';
        this.pos += 2;
        continue;
      }
      if (c === '\n') this.fail('unterminated string');
      out += c;
      this.pos++;
    }
    return this.fail('unterminated string');
  }

  private handleInclude(): void {
    const lineEnd = this.src.indexOf('\n', this.pos);
    if (this.includes === 'reject') {
      this.fail(
        "'@include' is not supported: the form would show less than the C reader sees. " +
          "Pass includes: 'opaque' to keep the directive verbatim and edit only this file's own settings",
      );
    }
    this.pos = lineEnd === -1 ? this.src.length : lineEnd + 1;
  }

  /** Skip whitespace and all three comment forms. */
  private skipTrivia(): void {
    for (;;) {
      const c = this.src[this.pos];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        this.pos++;
        continue;
      }
      if (c === '#' || (c === '/' && this.src[this.pos + 1] === '/')) {
        const nl = this.src.indexOf('\n', this.pos);
        this.pos = nl === -1 ? this.src.length : nl;
        continue;
      }
      if (c === '/' && this.src[this.pos + 1] === '*') {
        const end = this.src.indexOf('*/', this.pos + 2);
        if (end === -1) this.fail('unterminated block comment');
        this.pos = end + 2;
        continue;
      }
      return;
    }
  }

  private match(re: RegExp): string | undefined {
    const m = re.exec(this.src.slice(this.pos));
    if (!m) return undefined;
    this.pos += m[0].length;
    return m[0];
  }

  private fail(message: string): never {
    const upto = this.src.slice(0, this.pos);
    const line = upto.split('\n').length;
    const column = this.pos - upto.lastIndexOf('\n');
    throw new LibconfigParseError(message, line, column);
  }
}

/** Scalar type family for array homogeneity: int and int64 mix, float does not. */
export function family(type: CfgScalar['type']): 'integer' | 'float' | 'bool' | 'string' {
  return type === 'int' || type === 'int64' ? 'integer' : type;
}
