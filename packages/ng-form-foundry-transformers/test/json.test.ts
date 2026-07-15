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

test('all three transformers register and resolve by id', () => {
  const registry = new TransformerRegistry()
    .register(jsonTransformer)
    .register(yamlTransformer)
    .register(createYangTransformer(new FakeEngine({ 'example-interfaces': exampleInterfacesModel })));
  assert.deepEqual(registry.ids().sort(), ['json', 'yaml', 'yang']);
  assert.equal(registry.require('json').id, 'json');
});
