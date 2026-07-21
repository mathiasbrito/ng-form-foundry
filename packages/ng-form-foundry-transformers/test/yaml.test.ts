import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yamlTransformer } from '../src/transformers/yaml/yaml-transformer';
import type { JsonSchema } from '../src/core/json-schema';
import { TransformerRegistry } from '../src/core/registry';

/** Prototype-free extraction output normalized for deepEqual against literals. */
function plain(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v));
}

test('infers a schema from data: groups, typed leaves, leaf-list, group-list', () => {
  const text = `
server:
  host: localhost
  port: 8080
  tls: true
tags:
  - a
  - b
users:
  - name: alice
  - name: bob
`;
  const { schema, initialValue } = yamlTransformer.toSchema(text);
  assert.equal(schema.kind, 'nodeGroup');
  assert.equal(schema.root, true);

  const server = schema.children['server'] as any;
  assert.equal(server.kind, 'nodeGroup');
  assert.equal(server.children.host.type, 'string');
  assert.equal(server.children.port.type, 'number');
  assert.equal(server.children.tls.type, 'boolean');

  assert.equal((schema.children['tags'] as any).kind, 'leafList');
  assert.equal((schema.children['tags'] as any).type, 'string');

  const users = schema.children['users'] as any;
  assert.equal(users.kind, 'nodeGroupList');
  assert.equal(users.type.children.name.type, 'string');

  assert.deepEqual(plain(initialValue), {
    server: { host: 'localhost', port: 8080, tls: true },
    tags: ['a', 'b'],
    users: [{ name: 'alice' }, { name: 'bob' }],
  });
});

test('a JSON Schema drives types, required, enums, and nesting', () => {
  const jsonSchema: JsonSchema = {
    type: 'object',
    required: ['host'],
    properties: {
      host: { type: 'string', title: 'Host' },
      port: { type: 'integer', default: 80 },
      mode: { type: 'string', enum: ['tcp', 'udp'] },
      tls: { type: 'object', properties: { enabled: { type: 'boolean' } } },
      peers: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' } } } },
    },
  };
  const { schema } = yamlTransformer.toSchema('host: h', { schema: jsonSchema });

  assert.equal((schema.children['host'] as any).required, true);
  assert.equal((schema.children['host'] as any).label, 'Host');
  assert.equal((schema.children['port'] as any).type, 'number');
  assert.equal((schema.children['port'] as any).default, 80);
  assert.equal((schema.children['mode'] as any).type, 'enum');
  assert.deepEqual((schema.children['mode'] as any).enum, ['tcp', 'udp']);
  assert.equal((schema.children['tls'] as any).kind, 'nodeGroup');
  assert.equal((schema.children['peers'] as any).kind, 'nodeGroupList');
  assert.equal((schema.children['peers'] as any).type.children.id.type, 'number');
});

test('revert preserves comments and formatting on edited config', () => {
  const text = `# upstream API
host: localhost   # dev only
port: 8080
`;
  const { binding, initialValue } = yamlTransformer.toSchema(text);
  const out = yamlTransformer.toSource({ ...initialValue, port: 9090 }, binding);

  assert.match(out, /# upstream API/);
  assert.match(out, /host: localhost\s+# dev only/);
  assert.match(out, /port: 9090/);
  assert.doesNotMatch(out, /port: 8080/);
});

test('toSource clones the binding, so one schema serves many independent edits', () => {
  const { binding, initialValue } = yamlTransformer.toSchema('port: 8080\n');
  const a = yamlTransformer.toSource({ ...initialValue, port: 1 }, binding);
  const b = yamlTransformer.toSource({ ...initialValue, port: 2 }, binding);
  assert.match(a, /port: 1\b/);
  assert.match(b, /port: 2\b/);
});

test('revert adds new keys/items and drops removed ones', () => {
  const text = `a: 1
list:
  - x: 1
`;
  const { binding } = yamlTransformer.toSchema(text);
  const out = yamlTransformer.toSource({ b: 2, list: [{ x: 1 }, { x: 2 }] }, binding);

  assert.doesNotMatch(out, /a: 1/); // removed
  assert.match(out, /b: 2/); // added
  assert.match(out, /x: 2/); // appended list item
});

test('revert preserves integer map keys instead of duplicating them', () => {
  const text = `# ports
80: http
443: https
`;
  const { initialValue, binding } = yamlTransformer.toSchema(text);

  // A no-op round-trip must be byte-stable: an integer key reconciles against its
  // original typed node, so no stringified "80"/"443" duplicate pair is appended.
  const noop = yamlTransformer.toSource({ ...initialValue }, binding);
  assert.equal(noop, text);
  assert.doesNotMatch(noop, /"80"|"443"/);

  // Editing a value reuses the original typed key node (and its comment), not a
  // new string-keyed pair.
  const edited = yamlTransformer.toSource({ ...(initialValue as object), '80': 'HTTP' }, binding);
  assert.match(edited, /# ports/);
  assert.match(edited, /^80: HTTP$/m);
  assert.doesNotMatch(edited, /"80"/);
  assert.equal((edited.match(/^80:/gm) || []).length, 1);
});

test('revert preserves boolean and null map keys', () => {
  const text = `true: yes\nnull: nothing\n`;
  const { initialValue, binding } = yamlTransformer.toSchema(text);
  const out = yamlTransformer.toSource({ ...initialValue }, binding);
  assert.equal(out, text);
});

test('revert preserves integers beyond 2^53, editing a sibling', () => {
  const text = `id: 9007199254740993
big: 18446744073709551615
ref: "9007199254740993"
name: keep
`;
  const { initialValue, binding } = yamlTransformer.toSchema(text);

  // Out-of-range integers become strings in the form value; a small int stays a
  // number; a quoted big-digit value stays a string.
  assert.equal((initialValue as any).id, '9007199254740993');
  assert.equal((initialValue as any).big, '18446744073709551615');
  assert.equal((initialValue as any).ref, '9007199254740993');

  const out = yamlTransformer.toSource({ ...(initialValue as object), name: 'changed' }, binding);
  assert.match(out, /^id: 9007199254740993$/m); // unquoted, exact
  assert.match(out, /^big: 18446744073709551615$/m);
  assert.doesNotMatch(out, /9007199254740992/);
  assert.match(out, /^ref: "9007199254740993"$/m); // quoted string kept
  assert.match(out, /^name: changed$/m);
});

test('revert writes an edited big integer back as an unquoted number', () => {
  const { initialValue, binding } = yamlTransformer.toSchema('id: 1\n');
  assert.equal((initialValue as any).id, 1); // small int is a plain number
  const out = yamlTransformer.toSource({ id: '9007199254740993' }, binding);
  assert.equal(out, 'id: 9007199254740993\n');
});

test('yaml transformer registers and is retrievable by id', () => {
  const registry = new TransformerRegistry().register(yamlTransformer);
  assert.deepEqual(registry.ids(), ['yaml']);
  assert.equal(registry.require('yaml').id, 'yaml');
});

test('schemaOptions ride through toSchema: optionalPresence opt-out and refDocuments', () => {
  const jsonSchema: JsonSchema = {
    type: 'object',
    required: ['host'],
    properties: {
      host: { type: 'string' },
      port: { type: 'integer' },
      ue: { $ref: '/jsonschemas/common#/$defs/UeId' },
    },
  };
  const common: JsonSchema = {
    $id: 'https://example.org/jsonschemas/common',
    $defs: { UeId: { type: 'string', pattern: '^[0-9a-f]+$' } },
  };

  const marked = yamlTransformer.toSchema('host: h', {
    schema: jsonSchema,
    schemaOptions: { refDocuments: [common] },
  });
  assert.equal((marked.schema.children['port'] as any).presence, true); // default on
  assert.equal((marked.schema.children['ue'] as any).pattern, '^[0-9a-f]+$'); // cross-file $ref resolved

  const unmarked = yamlTransformer.toSchema('host: h', {
    schema: jsonSchema,
    schemaOptions: { refDocuments: [common], optionalPresence: false },
  });
  assert.equal((unmarked.schema.children['port'] as any).presence, undefined);
});

test('a missing optional key stays absent through the schema-driven round-trip', () => {
  const jsonSchema: JsonSchema = {
    type: 'object',
    required: ['host'],
    properties: { host: { type: 'string' }, port: { type: 'integer' } },
  };
  const { schema, binding, initialValue } = yamlTransformer.toSchema('host: prod # keep\n', { schema: jsonSchema });
  assert.equal((schema.children['port'] as any).presence, true);
  assert.deepEqual(plain(initialValue), { host: 'prod' }); // no port key to seed a control from
  // An untouched form round-trips the initial value; port must not appear as null.
  const out = yamlTransformer.toSource(initialValue!, binding);
  assert.equal(out, 'host: prod # keep\n');
});

test('0x/0o literals carry their base onto the inferred schema as a radix hint', () => {
  const src = 'cell_id: 0x1A\nperms: 0o17\nplain: 42\nbig: 0x7FFFFFFFFFFFFFFF\nmasks: [0x0F, 0xF0]\ncells:\n  - id: 0x01\n  - id: 0x02\n';
  const { schema, initialValue } = yamlTransformer.toSchema(src);
  const c = schema.children as any;
  assert.equal(c.cell_id.radix, 16);
  assert.equal(c.perms.radix, 8);
  assert.equal(c.plain.radix, undefined);
  assert.equal(c.big.type, 'string'); // beyond 2^53: the decimal-digit carry…
  assert.equal(c.big.radix, 16); // …still displays in its source base
  assert.equal(c.masks.kind, 'leafList');
  assert.equal(c.masks.radix, 16);
  assert.equal(c.cells.type.children.id.radix, 16);
  // YAML 1.2 has no binary notation: 0b101 would simply be a string scalar.
  assert.equal((initialValue as any).big, '9223372036854775807');
});

test('an edited hex value re-emits in hex, exact beyond 2^53', () => {
  const { binding, initialValue } = yamlTransformer.toSchema('mask: 0x0F\nbig: 0x7FFFFFFFFFFFFFFF\n');
  const v = JSON.parse(JSON.stringify(initialValue)) as Record<string, unknown>;
  v['mask'] = 26;
  v['big'] = '9223372036854775806';
  assert.equal(yamlTransformer.toSource(v, binding), 'mask: 0x1a\nbig: 0x7ffffffffffffffe\n');
});

test('schema mode: keys the schema does not cover survive a save, comments included', () => {
  const src = 'covered: 1\nuncovered: keep me # and my comment\nnested:\n  known: a\n  extra: stays\n';
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      covered: { type: 'integer' },
      nested: { type: 'object', properties: { known: { type: 'string' } } },
    },
  };
  const { binding } = yamlTransformer.toSchema(src, { schema });
  // serializeForm-shaped: only schema-covered fields.
  const out = yamlTransformer.toSource({ covered: 2, nested: { known: 'b' } }, binding);
  assert.equal(out, 'covered: 2\nuncovered: keep me # and my comment\nnested:\n  known: b\n  extra: stays\n');
});

test("schema mode: unknownKeys 'drop' restores whole-document authority", () => {
  const src = 'covered: 1\nuncovered: gone\n';
  const schema: JsonSchema = { type: 'object', properties: { covered: { type: 'integer' } } };
  const { binding } = yamlTransformer.toSchema(src, { schema, unknownKeys: 'drop' });
  assert.equal(yamlTransformer.toSource({ covered: 2 }, binding), 'covered: 2\n');
});

test('schema mode: uncovered keys inside covered list entries survive', () => {
  const src = 'cells:\n  - id: 1\n    vendor_x: keep\n  - id: 2\n';
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      cells: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' } } } },
    },
  };
  const { binding } = yamlTransformer.toSchema(src, { schema });
  const out = yamlTransformer.toSource({ cells: [{ id: 10 }, { id: 2 }] }, binding);
  assert.equal(out, 'cells:\n  - id: 10\n    vendor_x: keep\n  - id: 2\n');
});

test("unknownKeys: 'edit' surfaces uncovered keys as inferred fields, in document order", () => {
  const src = 'first: keep # comment\ncovered: 1\nmask: 0xf\n';
  const schema: JsonSchema = { type: 'object', properties: { covered: { type: 'integer' } } };
  const { schema: merged, binding, initialValue } = yamlTransformer.toSchema(src, { schema, unknownKeys: 'edit' });
  assert.deepEqual(Object.keys(merged.children), ['first', 'covered', 'mask']); // document order
  assert.equal((merged.children['first'] as any).type, 'string');
  assert.equal((merged.children['mask'] as any).radix, 16); // inferred hint on the uncovered key
  // The value covers everything: identity round-trips, and uncovered keys edit.
  assert.equal(yamlTransformer.toSource(initialValue!, binding), src);
  const v = JSON.parse(JSON.stringify(initialValue)) as Record<string, unknown>;
  v['first'] = 'changed';
  assert.equal(yamlTransformer.toSource(v, binding), src.replace('keep', 'changed'));
});

test('a document key named like an Object.prototype member is deletable', () => {
  const src = 'toString: gone\nstay: 1\n';
  const { binding } = yamlTransformer.toSchema(src); // inferred: whole-value authority
  assert.equal(yamlTransformer.toSource({ stay: 1 }, binding), 'stay: 1\n');
});

test("unknownKeys: 'edit' still preserves keys no form field can carry (inside a covered choice)", () => {
  const src = 'mode:\n  a: 1\n  vendor: keep # comment\n';
  const schema: JsonSchema = {
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
  const { binding } = yamlTransformer.toSchema(src, { schema, unknownKeys: 'edit' });
  // "vendor" is invisible to the form (no case names it): preserved, comment included.
  const out = yamlTransformer.toSource({ mode: { a: 2 } }, binding);
  assert.equal(out, 'mode:\n  a: 2\n  vendor: keep # comment\n');
});
