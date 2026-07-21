import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonTransformer } from '../src/transformers/json/json-transformer';
import { yamlTransformer } from '../src/transformers/yaml/yaml-transformer';
import { createYangTransformer } from '../src/transformers/yang/yang-transformer';
import { FakeEngine } from '../src/transformers/yang/engines/fake-engine';
import { exampleInterfacesModel } from './fixtures/example-interfaces';
import type { JsonSchema } from '../src/core/json-schema';
import { TransformerRegistry } from '../src/core/registry';

test('infers a schema from JSON data (same builders as YAML)', () => {
  const json = JSON.stringify({
    server: { host: 'localhost', port: 8080, tls: true },
    tags: ['a', 'b'],
    users: [{ name: 'alice' }],
  });
  const { schema, initialValue } = jsonTransformer.toSchema(json);
  assert.equal(schema.root, true);
  const server = schema.children['server'] as any;
  assert.equal(server.children.port.type, 'number');
  assert.equal((schema.children['tags'] as any).kind, 'leafList');
  assert.equal((schema.children['users'] as any).kind, 'nodeGroupList');
  assert.equal((initialValue!.server as any).host, 'localhost');
});

test('a JSON Schema drives the JSON form too', () => {
  const jsonSchema: JsonSchema = {
    type: 'object',
    required: ['host'],
    properties: { host: { type: 'string' }, port: { type: 'integer' } },
  };
  const { schema } = jsonTransformer.toSchema('{"host":"h"}', { schema: jsonSchema });
  assert.equal((schema.children['host'] as any).required, true);
  assert.equal((schema.children['port'] as any).type, 'number');
});

test('revert re-serializes edits, preserving indent and trailing newline', () => {
  const source = '{\n    "name": "svc",\n    "replicas": 2\n}\n'; // 4-space indent, trailing NL
  const { binding, initialValue } = jsonTransformer.toSchema(source);
  const out = jsonTransformer.toSource({ ...initialValue, replicas: 5 }, binding);

  assert.match(out, /"replicas": 5/);
  assert.doesNotMatch(out, /"replicas": 2/);
  assert.match(out, /\n    "name"/); // 4-space indent kept
  assert.ok(out.endsWith('\n')); // trailing newline kept
});

test('compact JSON stays compact-ish (indent defaults to 2, no trailing NL)', () => {
  const { binding, initialValue } = jsonTransformer.toSchema('{"a":1}');
  const out = jsonTransformer.toSource({ ...initialValue, a: 2 }, binding);
  assert.match(out, /\n  "a": 2/); // default 2-space indent
  assert.ok(!out.endsWith('\n'));
});

test('preserves integers beyond 2^53 and re-emits them unquoted', () => {
  const source = `{
  "id": 9007199254740993,
  "ref": "9007199254740993",
  "big": 18446744073709551615,
  "name": "keep"
}`;
  const { initialValue, binding } = jsonTransformer.toSchema(source);

  // Out-of-range integers are carried as strings (full precision); a quoted
  // big-digit value stays a genuine string; the sibling is a normal value.
  assert.equal((initialValue as any).id, '9007199254740993');
  assert.equal((initialValue as any).big, '18446744073709551615');
  assert.equal((initialValue as any).ref, '9007199254740993');

  // Editing only the sibling must leave the big integers untouched: they re-emit
  // as unquoted numbers with full precision (not rounded through a JS number).
  const out = jsonTransformer.toSource({ ...(initialValue as object), name: 'changed' }, binding);
  assert.match(out, /"id": 9007199254740993(,|\n)/);
  assert.match(out, /"big": 18446744073709551615(,|\n)/);
  assert.doesNotMatch(out, /9007199254740992/);
  assert.match(out, /"ref": "9007199254740993"/); // still a quoted string
  assert.match(out, /"name": "changed"/);
});

test('preserves big integers inside arrays', () => {
  const source = '{"ids":[9007199254740993,1,18446744073709551615]}';
  const { initialValue, binding } = jsonTransformer.toSchema(source);
  assert.deepEqual((initialValue as any).ids, ['9007199254740993', 1, '18446744073709551615']);

  const out = jsonTransformer.toSource(initialValue as any, binding);
  assert.match(out, /9007199254740993/);
  assert.match(out, /18446744073709551615/);
  assert.doesNotMatch(out, /"9007199254740993"/); // unquoted
  assert.doesNotMatch(out, /9007199254740992/); // no precision loss
});

test('writes an edited big integer back as an unquoted number', () => {
  const { initialValue, binding } = jsonTransformer.toSchema('{"id":9007199254740993}');
  const out = jsonTransformer.toSource({ ...(initialValue as object), id: '9007199254740994' }, binding);
  assert.match(out, /"id": 9007199254740994/);
  assert.doesNotMatch(out, /"9007199254740994"/); // unquoted, not a string
});

test('all three transformers register and resolve by id', () => {
  const registry = new TransformerRegistry()
    .register(jsonTransformer)
    .register(yamlTransformer)
    .register(createYangTransformer(new FakeEngine({ 'example-interfaces': exampleInterfacesModel })));
  assert.deepEqual(registry.ids().sort(), ['json', 'yaml', 'yang']);
  assert.equal(registry.require('json').id, 'json');
});

test('schemaOptions ride through jsonTransformer.toSchema', () => {
  const jsonSchema: JsonSchema = {
    type: 'object',
    required: ['host'],
    properties: { host: { type: 'string' }, note: { type: 'string' } },
  };
  const on = jsonTransformer.toSchema('{"host":"h"}', { schema: jsonSchema });
  assert.equal((on.schema.children['note'] as any).presence, true);

  const off = jsonTransformer.toSchema('{"host":"h"}', {
    schema: jsonSchema,
    schemaOptions: { optionalPresence: false },
  });
  assert.equal((off.schema.children['note'] as any).presence, undefined);
});

test('schema mode: keys the schema does not cover survive a save, key order intact', () => {
  const src = '{\n  "covered": 1,\n  "uncovered": "keep",\n  "nested": {\n    "known": "a",\n    "extra": "stays"\n  }\n}\n';
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      covered: { type: 'integer' },
      nested: { type: 'object', properties: { known: { type: 'string' } } },
    },
  };
  const { binding } = jsonTransformer.toSchema(src, { schema });
  const out = jsonTransformer.toSource({ covered: 2, nested: { known: 'b' } }, binding);
  assert.equal(out, src.replace('"covered": 1', '"covered": 2').replace('"known": "a"', '"known": "b"'));
});

test("schema mode: unknownKeys 'drop' restores whole-document authority", () => {
  const src = '{\n  "covered": 1,\n  "uncovered": "gone"\n}\n';
  const schema: JsonSchema = { type: 'object', properties: { covered: { type: 'integer' } } };
  const { binding } = jsonTransformer.toSchema(src, { schema, unknownKeys: 'drop' });
  assert.equal(jsonTransformer.toSource({ covered: 2 }, binding), '{\n  "covered": 2\n}\n');
});

test('schema mode: uncovered entry keys survive inside covered arrays; covered-absent deletes', () => {
  const src = '{\n  "cells": [\n    {\n      "id": 1,\n      "vendor_x": "keep"\n    }\n  ],\n  "opt": true\n}\n';
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      cells: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' } } } },
      opt: { type: 'boolean' },
    },
  };
  const { binding } = jsonTransformer.toSchema(src, { schema });
  // opt is covered but absent from the value: a presence toggle turned off.
  const out = jsonTransformer.toSource({ cells: [{ id: 7 }] }, binding);
  assert.equal(out, '{\n  "cells": [\n    {\n      "id": 7,\n      "vendor_x": "keep"\n    }\n  ]\n}\n');
});

test("unknownKeys: 'edit' surfaces uncovered keys as inferred, editable fields", () => {
  const src = '{\n  "uncovered": "keep",\n  "covered": 1\n}\n';
  const schema: JsonSchema = { type: 'object', properties: { covered: { type: 'integer' } } };
  const { schema: merged, binding, initialValue } = jsonTransformer.toSchema(src, { schema, unknownKeys: 'edit' });
  assert.deepEqual(Object.keys(merged.children), ['uncovered', 'covered']); // document order
  assert.equal((merged.children['covered'] as any).integer, true); // schema node won
  assert.equal(jsonTransformer.toSource(initialValue!, binding), src);
  const v = { ...(initialValue as Record<string, unknown>), uncovered: 'changed' };
  assert.equal(jsonTransformer.toSource(v as never, binding), src.replace('"keep"', '"changed"'));
});

test('schema mode: hostile key names — __proto__ survives, prototype members are addable', () => {
  // "__proto__" is a legal JSON key; uncovered, it must survive a save. Keys
  // named after Object.prototype members must behave as plain data keys.
  const src = '{\n  "covered": 1,\n  "__proto__": {\n    "x": 1\n  }\n}\n';
  const schema: JsonSchema = {
    type: 'object',
    properties: { covered: { type: 'integer' }, constructor: { type: 'integer' as const }, toString: { type: 'string' as const } },
  };
  const { binding } = jsonTransformer.toSchema(src, { schema });
  const out = jsonTransformer.toSource({ covered: 2, constructor: 5, toString: 'hi' }, binding);
  assert.match(out, /"__proto__": \{\n    "x": 1\n  \}/); // uncovered: verbatim
  assert.match(out, /"constructor": 5/); // covered addition lands
  assert.match(out, /"toString": "hi"/);
});

test("unknownKeys: 'edit' still preserves keys no form field can carry (inside a covered choice)", () => {
  const src = '{\n  "mode": {\n    "a": 1,\n    "vendor": "keep"\n  }\n}\n';
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
  const { binding } = jsonTransformer.toSchema(src, { schema, unknownKeys: 'edit' });
  // serializeForm emits only the active case's fields; "vendor" is invisible
  // to the form (no case names it) and must not be deleted by the save.
  const out = jsonTransformer.toSource({ mode: { a: 2 } }, binding);
  assert.match(out, /"a": 2/);
  assert.match(out, /"vendor": "keep"/);
});
