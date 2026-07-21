import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libconfigTransformer } from '../src/transformers/libconfig';
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

test('never writes to the console: parse, extract, and revert are silent', () => {
  const seen: unknown[] = [];
  const original = console.warn;
  console.warn = (msg: unknown) => void seen.push(msg);
  try {
    const { binding, initialValue } = libconfigTransformer.toSchema(FIXTURE);
    libconfigTransformer.toSource(plain(initialValue) as never, binding);
  } finally {
    console.warn = original;
  }
  assert.deepEqual(seen, []);
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

test('non-decimal literals carry their base onto the schema as a radix display hint', () => {
  const src = 'pci = 0x1A;\nmask = 0b0011;\nperm = 0q17;\ndec = 42;\nbig = 0xFFFFFFFFFFFFFFFFL;\nids = [0x01, 0x02];\nmixed = [0x01, 2];\n';
  const { schema } = libconfigTransformer.toSchema(src);
  const c = schema.children as any;
  assert.equal(c.pci.radix, 16);
  assert.equal(c.mask.radix, 2);
  assert.equal(c.perm.radix, 8);
  assert.equal(c.dec.radix, undefined);
  assert.equal(c.big.type, 'string'); // beyond 2^53: the decimal-digit carry…
  assert.equal(c.big.radix, 16); // …still displays in its source base
  assert.equal(c.ids.kind, 'leafList');
  assert.equal(c.ids.radix, 16);
  assert.equal(c.mixed.radix, undefined); // no uniform base across elements
});

// —— schema-mode partial coverage: non-schema keys survive verbatim ——

// OAI-flavored fixture: a partial schema will cover gNBs and Asn1_verbosity
// only; every other key (and all comments) must survive a schema-mode save.
const OAI_FIXTURE = `Active_gNBs = ( "cu-rfsim" ); # do not touch
Asn1_verbosity = "none";
sa = 1; // non-schema scalar between schema-born keys
gNBs = (
  { gNB_ID = 0xe00;
    gNB_name = "cu-rfsim";
    tracking_area_code = 1; # entry key outside the item schema
  }
);
security = { ciphering_algorithms = ( "nea0" ); }; /* non-schema group */
`;

const OAI_PARTIAL_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['gNBs'],
  properties: {
    gNBs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['gNB_ID', 'gNB_name'],
        properties: { gNB_ID: { type: 'integer' }, gNB_name: { type: 'string' } },
      },
    },
    Asn1_verbosity: { type: 'string' },
  },
};

test('schema mode: a serializeForm-shaped value preserves every non-schema key verbatim', () => {
  const { binding } = libconfigTransformer.toSchema(OAI_FIXTURE, { schema: OAI_PARTIAL_SCHEMA });
  // Only schema-covered fields, all unedited — what serializeForm emits.
  const value = { gNBs: [{ gNB_ID: 3584, gNB_name: 'cu-rfsim' }], Asn1_verbosity: 'none' };
  assert.equal(libconfigTransformer.toSource(value, binding), OAI_FIXTURE);
});

test('schema mode: editing a covered field touches one literal, non-schema keys and order intact', () => {
  const { binding } = libconfigTransformer.toSchema(OAI_FIXTURE, { schema: OAI_PARTIAL_SCHEMA });
  const value = { gNBs: [{ gNB_ID: 3584, gNB_name: 'cu-2' }], Asn1_verbosity: 'annoying' };
  const out = libconfigTransformer.toSource(value, binding);
  assert.equal(
    out,
    OAI_FIXTURE.replace('"cu-rfsim";', '"cu-2";').replace('"none"', '"annoying"'),
  );
});

test('schema mode: entry-level keys outside the item schema survive inside list entries', () => {
  const { binding } = libconfigTransformer.toSchema(OAI_FIXTURE, { schema: OAI_PARTIAL_SCHEMA });
  const out = libconfigTransformer.toSource(
    { gNBs: [{ gNB_ID: 26, gNB_name: 'cu-rfsim' }], Asn1_verbosity: 'none' },
    binding,
  );
  assert.match(out, /tracking_area_code = 1; # entry key outside the item schema/);
  assert.match(out, /gNB_ID = 0x01A;/); // edited, in its own radix and width
});

test('schema mode: a schema-born key absent from the value is still deleted (presence off)', () => {
  const { binding } = libconfigTransformer.toSchema(OAI_FIXTURE, { schema: OAI_PARTIAL_SCHEMA });
  const out = libconfigTransformer.toSource({ gNBs: [{ gNB_ID: 3584, gNB_name: 'cu-rfsim' }] }, binding);
  assert.doesNotMatch(out, /Asn1_verbosity/); // covered + absent → removed
  assert.match(out, /Active_gNBs/); // not covered → untouched
  assert.match(out, /security = \{/);
});

test('schema mode: only schema-born keys can be inserted', () => {
  const { binding } = libconfigTransformer.toSchema('a = 1;\n', {
    schema: { type: 'object', properties: { a: { type: 'integer' }, b: { type: 'integer' } } },
  });
  const out = libconfigTransformer.toSource({ a: 1, b: 2, rogue: 9 } as never, binding);
  assert.match(out, /b = 2;/); // schema-born addition lands
  assert.doesNotMatch(out, /rogue/); // non-schema key never inserted
});

test('schema mode: a choice keeps its key; switching cases swaps fields, unknown keys survive', () => {
  const src = 'mode = { a = 1; keep_me = 7; };\nuncovered = 1;\n';
  const choiceSchema: JsonSchema = {
    type: 'object',
    properties: {
      mode: {
        anyOf: [
          { type: 'object', properties: { a: { type: 'integer' } }, required: ['a'] },
          { type: 'object', properties: { b: { type: 'string' } }, required: ['b'] },
        ],
      },
    },
  };
  const { binding } = libconfigTransformer.toSchema(src, { schema: choiceSchema });
  // Same case, edited: only `a` changes; keep_me and uncovered stay.
  assert.equal(
    libconfigTransformer.toSource({ mode: { a: 2 } }, binding),
    'mode = { a = 2; keep_me = 7; };\nuncovered = 1;\n',
  );
  // Case switch: `a` (schema-born, absent) goes, `b` arrives, keep_me stays.
  const switched = libconfigTransformer.toSource({ mode: { b: 'x' } }, binding);
  assert.doesNotMatch(switched, /a = /);
  assert.match(switched, /b = "x";/);
  assert.match(switched, /keep_me = 7;/);
  assert.match(switched, /uncovered = 1;/);
});

test("unknownKeys: 'drop' makes the value authoritative for the whole document", () => {
  const { binding } = libconfigTransformer.toSchema(OAI_FIXTURE, {
    schema: OAI_PARTIAL_SCHEMA,
    unknownKeys: 'drop',
  });
  const out = libconfigTransformer.toSource(
    { gNBs: [{ gNB_ID: 3584, gNB_name: 'cu-rfsim' }], Asn1_verbosity: 'none' },
    binding,
  );
  assert.doesNotMatch(out, /Active_gNBs|security|tracking_area_code/); // uncovered: deleted
  assert.match(out, /Asn1_verbosity = "none";/); // covered: kept
});

test("unknownKeys: 'preserve' is the default and may also be passed explicitly", () => {
  const explicit = libconfigTransformer.toSchema(OAI_FIXTURE, {
    schema: OAI_PARTIAL_SCHEMA,
    unknownKeys: 'preserve',
  });
  const value = { gNBs: [{ gNB_ID: 3584, gNB_name: 'cu-rfsim' }], Asn1_verbosity: 'none' };
  assert.equal(libconfigTransformer.toSource(value, explicit.binding), OAI_FIXTURE);
});

test("unknownKeys: 'edit' surfaces uncovered settings as inferred, editable fields", () => {
  const { schema, binding, initialValue } = libconfigTransformer.toSchema(OAI_FIXTURE, {
    schema: OAI_PARTIAL_SCHEMA,
    unknownKeys: 'edit',
  });
  const c = schema.children as any;
  // Uncovered keys render, typed by the document's own literals.
  assert.equal(c.Active_gNBs.kind, 'leafList');
  assert.equal(c.sa.integer, true);
  assert.equal(c.security.kind, 'nodeGroup');
  // Covered keys keep their schema nodes; entry types merge per key.
  const entry = c.gNBs.type.children;
  assert.equal(entry.gNB_ID.integer, true);
  assert.equal(entry.gNB_ID.radix, 16); // inferred display hint carried onto the schema leaf
  assert.equal(entry.tracking_area_code.integer, true); // uncovered entry key, editable
  // The value covers the whole document, so identity round-trips byte-exact.
  assert.equal(libconfigTransformer.toSource(plain(initialValue) as any, binding), OAI_FIXTURE);
  // …and an uncovered setting is genuinely editable.
  const v = plain(initialValue) as any;
  v.sa = 0;
  assert.equal(
    libconfigTransformer.toSource(v, binding),
    OAI_FIXTURE.replace('sa = 1;', 'sa = 0;'),
  );
});

test("unknownKeys: 'edit' keeps uncovered empty collections as read-only raw carries", () => {
  const src = 'covered = 1;\nnothing = ( );\n';
  const { schema, binding, initialValue } = libconfigTransformer.toSchema(src, {
    schema: { type: 'object', properties: { covered: { type: 'integer' } } },
    unknownKeys: 'edit',
  });
  const leaf = (schema.children as any)['nothing'];
  assert.equal(leaf.readOnly, true);
  assert.equal((initialValue as any).nothing, '( )'); // the carry, not []
  assert.equal(libconfigTransformer.toSource(plain(initialValue) as any, binding), src);
});

test('inferred mode is unchanged: the value stays authoritative for every key', () => {
  const { binding, initialValue } = libconfigTransformer.toSchema('a = 1;\nb = 2;\n');
  const v = plain(initialValue) as Record<string, unknown>;
  delete v['b'];
  assert.equal(libconfigTransformer.toSource(v, binding), 'a = 1;\n');
});

test('an edited raw carry throws instead of splicing or silently dropping', () => {
  const het = libconfigTransformer.toSchema('l = ( 1, "x", true );\n');
  assert.throws(() => libconfigTransformer.toSource({ l: '( 2, "y", false )' }, het.binding), /read-only/);
  const empty = libconfigTransformer.toSchema('e = [ ];\n');
  assert.throws(() => libconfigTransformer.toSource({ e: 'nonsense' }, empty.binding), /read-only/);
});

test('a setting named like an Object.prototype member is deletable', () => {
  const { binding } = libconfigTransformer.toSchema('toString = 1;\nstay = 2;\n');
  assert.equal(libconfigTransformer.toSource({ stay: 2 }, binding), 'stay = 2;\n');
});

test("unknownKeys: 'edit' still preserves settings no form field can carry (inside a covered choice)", () => {
  const src = 'mode = { a = 1; keep_me = 7; };\n';
  const choiceSchema: JsonSchema = {
    type: 'object',
    properties: {
      mode: {
        anyOf: [
          { type: 'object', properties: { a: { type: 'integer' } }, required: ['a'] },
          { type: 'object', properties: { b: { type: 'string' } }, required: ['b'] },
        ],
      },
    },
  };
  const { binding } = libconfigTransformer.toSchema(src, { schema: choiceSchema, unknownKeys: 'edit' });
  // serializeForm emits only the active case's fields; keep_me is invisible
  // to the form (no case names it) and must not be deleted by the save.
  assert.equal(
    libconfigTransformer.toSource({ mode: { a: 2 } }, binding),
    'mode = { a = 2; keep_me = 7; };\n',
  );
});
