import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonSchemaToNodeGroup, type JsonSchema } from '../src/core/json-schema';

test('maps object properties, required, title, default (draft-07 baseline)', () => {
  const schema: JsonSchema = {
    type: 'object',
    required: ['host'],
    properties: {
      host: { type: 'string', title: 'Host', default: 'localhost' },
      port: { type: 'integer', default: 80 },
    },
  };
  const g = jsonSchemaToNodeGroup(schema);
  assert.equal(g.kind, 'nodeGroup');
  assert.equal(g.root, true);

  const host = g.children['host'] as any;
  assert.equal(host.type, 'string');
  assert.equal(host.required, true);
  assert.equal(host.label, 'Host');
  assert.equal(host.default, 'localhost');

  const port = g.children['port'] as any;
  assert.equal(port.type, 'number');
  assert.equal(port.integer, true);
});

test('passes through string and number constraints', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', pattern: '^[a-z]+$', minLength: 2, maxLength: 8, format: 'email' },
      qty: { type: 'number', minimum: 1, maximum: 10, multipleOf: 0.5 },
    },
  };
  const g = jsonSchemaToNodeGroup(schema);
  const name = g.children['name'] as any;
  assert.equal(name.pattern, '^[a-z]+$');
  assert.equal(name.minLength, 2);
  assert.equal(name.maxLength, 8);
  assert.equal(name.format, 'email');

  const qty = g.children['qty'] as any;
  assert.equal(qty.min, 1);
  assert.equal(qty.max, 10);
  assert.equal(qty.multipleOf, 0.5);
});

test('resolves a local $ref against $defs', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: { id: { $ref: '#/$defs/Id' } },
    $defs: { Id: { type: 'string', title: 'Identifier', minLength: 1 } },
  };
  const id = jsonSchemaToNodeGroup(schema).children['id'] as any;
  assert.equal(id.type, 'string');
  assert.equal(id.label, 'Identifier');
  assert.equal(id.minLength, 1);
});

test('maps type: [T, "null"] to a nullable leaf', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: { note: { type: ['string', 'null'] } },
  };
  const note = jsonSchemaToNodeGroup(schema).children['note'] as any;
  assert.equal(note.type, 'string');
  assert.equal(note.nullable, true);
});

test('maps const to a read-only leaf pinned to the value', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: { apiVersion: { const: 'v1' } },
  };
  const v = jsonSchemaToNodeGroup(schema).children['apiVersion'] as any;
  assert.equal(v.type, 'string');
  assert.equal(v.default, 'v1');
  assert.equal(v.readOnly, true);
});

test('maps anyOf of object branches to a choice with auto-named, labeled cases', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      scope: {
        anyOf: [
          { type: 'object', title: 'By UE', properties: { ueId: { type: 'string' } }, required: ['ueId'] },
          { type: 'object', title: 'By cell', properties: { cellId: { type: 'string' } }, required: ['cellId'] },
        ],
      },
    },
  };
  const scope = jsonSchemaToNodeGroup(schema).children['scope'] as any;
  assert.equal(scope.kind, 'choice');
  assert.deepEqual(Object.keys(scope.cases), ['case0', 'case1']);
  assert.equal(scope.caseLabels.case0, 'By UE');
  assert.equal(scope.cases.case1.cellId.kind, 'leaf');
});

test('collapses anyOf: [T, null] to a nullable leaf, not a choice', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: { ref: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
  };
  const ref = jsonSchemaToNodeGroup(schema).children['ref'] as any;
  assert.equal(ref.kind, 'leaf');
  assert.equal(ref.type, 'string');
  assert.equal(ref.nullable, true);
});

test('maps additionalProperties to a map node', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      labels: { type: 'object', additionalProperties: { type: 'string' }, minProperties: 1 },
    },
  };
  const labels = jsonSchemaToNodeGroup(schema).children['labels'] as any;
  assert.equal(labels.kind, 'map');
  assert.equal(labels.value.kind, 'leaf');
  assert.equal(labels.value.type, 'string');
  assert.equal(labels.minEntries, 1);
});

test('maps patternProperties to a map with a key pattern', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      headers: { type: 'object', patternProperties: { '^x-': { type: 'string' } } },
    },
  };
  const headers = jsonSchemaToNodeGroup(schema).children['headers'] as any;
  assert.equal(headers.kind, 'map');
  assert.equal(headers.keyPattern, '^x-');
});

test('maps enum to an enum leaf and an object-array to a nodeGroupList', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['tcp', 'udp'] },
      peers: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' } } }, minItems: 1 },
    },
  };
  const g = jsonSchemaToNodeGroup(schema);
  const mode = g.children['mode'] as any;
  assert.equal(mode.type, 'enum');
  assert.deepEqual(mode.enum, ['tcp', 'udp']);

  const peers = g.children['peers'] as any;
  assert.equal(peers.kind, 'nodeGroupList');
  assert.equal(peers.minItems, 1);
  assert.equal(peers.type.children.id.integer, true);
});

test('a $ref to a nested object resolves into a nodeGroup', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: { qos: { $ref: '#/$defs/QoS' } },
    $defs: {
      QoS: {
        type: 'object',
        properties: {
          gfbr: { type: 'integer', minimum: 0 },
          pdb: { type: 'number', minimum: 0 },
        },
        required: ['gfbr'],
      },
    },
  };
  const qos = jsonSchemaToNodeGroup(schema).children['qos'] as any;
  assert.equal(qos.kind, 'nodeGroup');
  assert.equal(qos.children.gfbr.integer, true);
  assert.equal(qos.children.gfbr.required, true);
  assert.equal(qos.children.pdb.min, 0);
});
