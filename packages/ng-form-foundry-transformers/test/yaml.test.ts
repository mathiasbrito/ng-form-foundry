import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yamlTransformer } from '../src/transformers/yaml/yaml-transformer';
import type { JsonSchema } from '../src/core/json-schema';
import { TransformerRegistry } from '../src/core/registry';

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

  assert.deepEqual(initialValue, {
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
