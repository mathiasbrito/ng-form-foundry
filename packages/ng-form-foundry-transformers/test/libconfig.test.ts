import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  libconfigTransformer,
  resetLibconfigBetaWarning,
} from '../src/transformers/libconfig';
import { LibconfigParseError, parseLibconfig } from '../src/transformers/libconfig/parser';
import { TransformerRegistry } from '../src/core/registry';
import type { JsonSchema } from '../src/core/json-schema';

/** Prototype-free extraction output normalized for deepEqual against literals. */
function plain(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v));
}

// srsRAN-flavored, hand-written (no upstream text): every scalar style, both
// assignment styles, both terminators, comments of all three kinds.
const FIXTURE = `# radio resources
version = 1;
mac_cnfg :
{
  periodic_bsr_timer = 20; // in ms
  ulsch_cfg = {
    max_harq_tx = 4,
    enabled = TRUE
  };
};
/* per-cell setup */
cell_list = (
  { cell_id = 0x01;
    dl_earfcn = 3350;
    tx_gain = 20.0; // dB
    name = "cell" "-a";
  },
  { cell_id = 0x02;
    dl_earfcn = 3400;
    tx_gain = 30.5;
    name = "cell-b";
    rx_gain = 10.0;
  }
);
arfcns = ( 3350, 3400 );
prach_ids = [ 4, 12, 63 ];
ledger_id = 9007199254740993L;
`;

test('beta: warns exactly once across repeated use', () => {
  resetLibconfigBetaWarning();
  const seen: string[] = [];
  const original = console.warn;
  console.warn = (msg: string) => void seen.push(msg);
  try {
    libconfigTransformer.toSchema('a = 1;');
    const { binding } = libconfigTransformer.toSchema('b = 2;');
    libconfigTransformer.toSource({ b: 2 }, binding);
  } finally {
    console.warn = original;
  }
  assert.equal(seen.length, 1);
  assert.match(seen[0]!, /BETA/);
});

test('infers statically-typed leaves: int, hex int, float, bool, string, int64 carry', () => {
  const { schema, initialValue } = libconfigTransformer.toSchema(FIXTURE);
  const cell = (schema.children['cell_list'] as any).type.children;
  assert.equal(cell.cell_id.integer, true);
  assert.equal(cell.tx_gain.type, 'number');
  assert.equal(cell.tx_gain.integer, undefined); // float slot, not an int
  assert.equal((schema.children['version'] as any).integer, true);
  assert.equal(((schema.children['mac_cnfg'] as any).children.ulsch_cfg.children.enabled as any).type, 'boolean');
  // int64 beyond 2^53: string leaf constrained to digits.
  assert.equal((schema.children['ledger_id'] as any).type, 'string');
  assert.equal((schema.children['ledger_id'] as any).pattern, '^[-+]?[0-9]+$');
  assert.equal((initialValue as any).ledger_id, '9007199254740993');
  // Adjacent string literals concatenate.
  assert.equal((initialValue as any).cell_list[0].name, 'cell-a');
  // Paren scalar list and bracket array both become plain arrays.
  assert.deepEqual(plain((initialValue as any).arfcns), [3350, 3400]);
  assert.deepEqual(plain((initialValue as any).prach_ids), [4, 12, 63]);
});

test('group lists infer a union type; keys missing from some entries become presence', () => {
  const { schema } = libconfigTransformer.toSchema(FIXTURE);
  const cell = (schema.children['cell_list'] as any).type.children;
  assert.equal(cell.rx_gain.presence, true); // only in the second entry
  assert.equal(cell.cell_id.presence, undefined); // in every entry
});

test('identity round-trip is byte-exact, comments and all', () => {
  const { binding, initialValue } = libconfigTransformer.toSchema(FIXTURE);
  assert.equal(libconfigTransformer.toSource(initialValue!, binding), FIXTURE);
});

test('a single scalar edit splices one literal and nothing else', () => {
  const { binding, initialValue } = libconfigTransformer.toSchema(FIXTURE);
  const value = structuredClone(plain(initialValue)) as any;
  value.cell_list[0].dl_earfcn = 2850;
  const out = libconfigTransformer.toSource(value, binding);
  assert.equal(out, FIXTURE.replace('dl_earfcn = 3350;', 'dl_earfcn = 2850;'));
});

test('typed emission: float stays float, hex stays hex at width, L suffix survives, bool lowercases', () => {
  const src = 'tx_gain = 20.0;\ncell_id = 0x0A;\nfreq = 5L;\nuse_tls = TRUE;\n';
  const { binding, initialValue } = libconfigTransformer.toSchema(src);
  const value = { ...(plain(initialValue) as any), tx_gain: 21, cell_id: 11, freq: 6, use_tls: false };
  assert.equal(
    libconfigTransformer.toSource(value, binding),
    'tx_gain = 21.0;\ncell_id = 0x0B;\nfreq = 6L;\nuse_tls = false;\n',
  );
});

test('int64 string carry: verbatim round-trip, edited digits keep the suffix, junk throws', () => {
  const src = 'ledger = 9223372036854775807L;\n';
  const { binding, initialValue } = libconfigTransformer.toSchema(src);
  assert.equal((initialValue as any).ledger, '9223372036854775807');
  assert.equal(libconfigTransformer.toSource(plain(initialValue) as any, binding), src);
  assert.equal(
    libconfigTransformer.toSource({ ledger: '9223372036854775806' }, binding),
    'ledger = 9223372036854775806L;\n',
  );
  assert.throws(() => libconfigTransformer.toSource({ ledger: 'not-a-number' }, binding), /not an integer/);
});

test('editing a concatenated string collapses the split literals, value-preserving', () => {
  const { binding, initialValue } = libconfigTransformer.toSchema(FIXTURE);
  const value = plain(initialValue) as any;
  value.cell_list[0].name = 'renamed';
  const out = libconfigTransformer.toSource(value, binding);
  assert.ok(out.includes('name = "renamed";'));
  assert.ok(!out.includes('"cell" "-a"'));
});

test('a deleted key takes its whole line including the inline comment', () => {
  const { binding, initialValue } = libconfigTransformer.toSchema(FIXTURE);
  const value = plain(initialValue) as any;
  delete value.mac_cnfg.periodic_bsr_timer;
  const out = libconfigTransformer.toSource(value, binding);
  assert.ok(!out.includes('periodic_bsr_timer'));
  assert.ok(!out.includes('// in ms'));
  assert.ok(out.includes('ulsch_cfg')); // neighbors untouched
});

test('an added key lands on a fresh line at the group indent, after the last setting line', () => {
  const src = 'rf = {\n  tx_gain = 20.0; // dB\n};\n';
  const { binding, initialValue } = libconfigTransformer.toSchema(src);
  const value = plain(initialValue) as any;
  value.rf.rx_gain = 15;
  assert.equal(
    libconfigTransformer.toSource(value, binding),
    'rf = {\n  tx_gain = 20.0; // dB\n  rx_gain = 15;\n};\n',
  );
});

test('lists grow and shrink by splicing inside their own delimiters', () => {
  const { binding, initialValue } = libconfigTransformer.toSchema(FIXTURE);
  const grown = plain(initialValue) as any;
  grown.prach_ids = [4, 12, 63, 71];
  assert.ok(libconfigTransformer.toSource(grown, binding).includes('[ 4, 12, 63, 71 ];'));
  const shrunk = plain(initialValue) as any;
  shrunk.arfcns = [3350];
  assert.ok(libconfigTransformer.toSource(shrunk, binding).includes('( 3350 );'));
});

test('group-list entries can be edited, added, and removed', () => {
  const { binding, initialValue } = libconfigTransformer.toSchema(FIXTURE);
  const value = plain(initialValue) as any;
  value.cell_list = [value.cell_list[0], { cell_id: 3, dl_earfcn: 3500, tx_gain: 25.0, name: 'cell-c' }];
  const out = libconfigTransformer.toSource(value, binding);
  assert.ok(out.includes('cell_id = 0x01')); // entry 0 untouched, hex intact
  assert.ok(!out.includes('cell-b')); // entry 1 replaced in place
  assert.ok(out.includes('dl_earfcn = 3500'));
});

test('heterogeneous lists surface read-only and round-trip verbatim', () => {
  const src = 'mixed = ( 1, "two", ( 3 ) ); # keep me\n';
  const { schema, binding, initialValue } = libconfigTransformer.toSchema(src);
  const leaf = schema.children['mixed'] as any;
  assert.equal(leaf.readOnly, true);
  assert.equal((initialValue as any).mixed, '( 1, "two", ( 3 ) )');
  assert.equal(libconfigTransformer.toSource(plain(initialValue) as any, binding), src);
});

test('empty collections are read-only when inferred, editable under a JSON Schema', () => {
  const src = 'ncells = [];\n';
  const inferred = libconfigTransformer.toSchema(src);
  assert.equal((inferred.schema.children['ncells'] as any).readOnly, true);
  assert.equal((inferred.initialValue as any).ncells, '[]');
  assert.equal(libconfigTransformer.toSource(plain(inferred.initialValue) as any, inferred.binding), src);

  const jsonSchema: JsonSchema = {
    type: 'object',
    required: ['ncells'],
    properties: { ncells: { type: 'array', items: { type: 'integer' } } },
  };
  const typed = libconfigTransformer.toSchema(src, { schema: jsonSchema });
  assert.equal((typed.schema.children['ncells'] as any).kind, 'leafList');
  assert.deepEqual(plain((typed.initialValue as any).ncells), []);
  assert.equal(libconfigTransformer.toSource({ ncells: [3350, 3400] }, typed.binding), 'ncells = [3350, 3400];\n');
});

test('@include rejects by default with an actionable error, opaque keeps the line', () => {
  const src = '@include "common.cfg"\nport = 8080;\n';
  assert.throws(() => libconfigTransformer.toSchema(src), LibconfigParseError);
  const opaque = libconfigTransformer.toSchema(src, { includes: 'opaque' });
  assert.deepEqual(plain(opaque.initialValue), { port: 8080 });
  const out = libconfigTransformer.toSource({ port: 9090 }, opaque.binding);
  assert.equal(out, '@include "common.cfg"\nport = 9090;\n');
});

test('duplicate setting names in one group are a parse error, like libconfig itself', () => {
  assert.throws(() => parseLibconfig('a = 1;\na = 2;\n'), /duplicate setting name 'a'/);
});

test('__proto__ cannot pollute: illegal as a name, and records are prototype-free anyway', () => {
  // libconfig names must start with a letter or '*', so `__proto__` never parses…
  assert.throws(() => parseLibconfig('__proto__ = { polluted = true; };\n'), LibconfigParseError);
  assert.equal(({} as any).polluted, undefined);
  // …and extraction uses null-prototype records as defense in depth.
  const { initialValue } = libconfigTransformer.toSchema('rf = { gain = 1; };\n');
  assert.equal(Object.getPrototypeOf((initialValue as any).rf), null);
});

test('registers in the catalog under libconfig', () => {
  const registry = new TransformerRegistry().register(libconfigTransformer);
  assert.equal(registry.require('libconfig'), libconfigTransformer);
});

// —— battle-test regressions (radix conformance, fuzz, heterogeneous lists) ——

test('0q/0Q octal parses like the C scanner and edits keep the spelling', () => {
  const { schema, binding, initialValue } = libconfigTransformer.toSchema('perms = 0q17;\nmask = 0Q7L;\n');
  assert.equal((schema.children['perms'] as any).integer, true);
  assert.equal((initialValue as any).perms, 15);
  assert.equal((initialValue as any).mask, 7);
  const out = libconfigTransformer.toSource({ perms: 9, mask: 7 }, binding);
  assert.equal(out, 'perms = 0q11;\nmask = 0Q7L;\n');
});

test('a sign on a hex/binary/octal literal is a parse error, never a raw SyntaxError', () => {
  for (const src of ['x = -0x10;', 'x = +0b101;', 'x = -0q17;', 'x = [1, -0x2];']) {
    assert.throws(() => parseLibconfig(src), LibconfigParseError);
  }
});

test('a negative edit into a hex slot emits decimal: the C scanner takes no signed hex', () => {
  const { binding } = libconfigTransformer.toSchema('h = 0xFF;\nb = 0b0011L;\n');
  assert.equal(libconfigTransformer.toSource({ h: -26, b: -3 }, binding), 'h = -26;\nb = -3L;\n');
});

test('a collection mixing safe and beyond-2^53 ints survives untouched and edits exactly', () => {
  const src = 'ids = [0x01, 9007199254740993L];\n';
  const { binding, initialValue } = libconfigTransformer.toSchema(src);
  assert.deepEqual(plain((initialValue as any).ids), ['1', '9007199254740993']);
  // Untouched write-back is byte-exact — the digit-string carry is not an edit.
  assert.equal(libconfigTransformer.toSource(plain(initialValue) as any, binding), src);
  // An edited safe element goes back in its own literal style, not as a string.
  const out = libconfigTransformer.toSource({ ids: ['2', '9007199254740993'] }, binding);
  assert.equal(out, 'ids = [0x02, 9007199254740993L];\n');
});

test('null never writes a value: existing settings refuse it, added keys skip it', () => {
  const { binding } = libconfigTransformer.toSchema('x = 5;\n');
  assert.throws(() => libconfigTransformer.toSource({ x: null } as any, binding), /no libconfig representation/);
  assert.equal(libconfigTransformer.toSource({ x: 5, y: null } as any, binding), 'x = 5;\n');
});

test('hostile nesting fails with a parse error instead of a stack overflow', () => {
  const nested = (n: number) => `a = ${'('.repeat(n)}1${')'.repeat(n)};`;
  assert.equal(parseLibconfig(nested(50)).settings.length, 1);
  assert.throws(() => parseLibconfig(nested(300)), /nesting deeper than 256/);
});

test('\\x escapes need two hex digits, like the C scanner', () => {
  assert.equal((libconfigTransformer.toSchema('s = "a\\x41b";\n').initialValue as any).s, 'aAb');
  assert.throws(() => parseLibconfig('s = "a\\xZZ";\n'), /two hex digits/);
  assert.throws(() => parseLibconfig('s = "a\\x4";\n'), LibconfigParseError);
});

test('@include is trivia anywhere, value positions included (opaque mode)', () => {
  const src = 'l = ( 1,\n@include "more.cfg"\n2 );\n';
  const { binding, initialValue } = libconfigTransformer.toSchema(src, { includes: 'opaque' });
  assert.deepEqual(plain((initialValue as any).l), [1, 2]);
  assert.equal(libconfigTransformer.toSource(plain(initialValue) as any, binding), src);
  assert.throws(() => parseLibconfig(src), /'@include' is not supported/);
});

test('an edited raw carry throws instead of splicing or silently dropping', () => {
  const het = libconfigTransformer.toSchema('l = ( 1, "x", true );\n');
  assert.throws(() => libconfigTransformer.toSource({ l: '( 2, "y", false )' }, het.binding), /read-only/);
  const empty = libconfigTransformer.toSchema('e = [ ];\n');
  assert.throws(() => libconfigTransformer.toSource({ e: 'nonsense' }, empty.binding), /read-only/);
});
