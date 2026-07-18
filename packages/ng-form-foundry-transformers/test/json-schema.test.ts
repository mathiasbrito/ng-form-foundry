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

test('resolves a cross-file $ref by matching the target document $id', () => {
  const common: JsonSchema = {
    $id: 'https://schemas.example.org/defs/common',
    $defs: {
      PlmnId: {
        type: 'object',
        required: ['mcc'],
        properties: { mcc: { type: 'string', pattern: '^[0-9]{3}$' } },
      },
    },
  };
  const schema: JsonSchema = {
    type: 'object',
    properties: { plmn: { $ref: '/defs/common#/$defs/PlmnId' } },
  };
  const plmn = jsonSchemaToNodeGroup(schema, '__root__', { refDocuments: [common] }).children['plmn'] as any;
  assert.equal(plmn.kind, 'nodeGroup');
  assert.equal(plmn.children.mcc.pattern, '^[0-9]{3}$');
  assert.equal(plmn.children.mcc.required, true);
});

test('follows a local $ref inside a cross-referenced document', () => {
  const common: JsonSchema = {
    $id: 'https://schemas.example.org/defs/common',
    $defs: {
      SliceId: {
        type: 'object',
        required: ['sst'],
        properties: { sst: { $ref: '#/$defs/Sst' }, plmnId: { $ref: '#/$defs/PlmnId' } },
      },
      Sst: { type: 'integer', minimum: 0, maximum: 255 },
      PlmnId: { type: 'object', properties: { mcc: { type: 'string' } } },
    },
  };
  const schema: JsonSchema = {
    type: 'object',
    properties: { slice: { $ref: '/defs/common#/$defs/SliceId' } },
  };
  const slice = jsonSchemaToNodeGroup(schema, '__root__', { refDocuments: [common] }).children['slice'] as any;
  assert.equal(slice.kind, 'nodeGroup');
  assert.equal(slice.children.sst.type, 'number'); // #/$defs/Sst resolved locally in common
  assert.equal(slice.children.sst.integer, true);
  assert.equal(slice.children.sst.max, 255);
  assert.equal(slice.children.plmnId.kind, 'nodeGroup'); // second-level local ref
});

test('an anyOf scope whose fields are cross-file $refs resolves each field (A1 shape)', () => {
  const common: JsonSchema = {
    $id: 'https://schemas.example.org/a1/common',
    $defs: {
      UeId: {
        oneOf: [{ type: 'object', required: ['gnbId'], properties: { gnbId: { type: 'string' } } }],
      },
      QosId: {
        type: 'object',
        required: ['fiveQi'],
        properties: { fiveQi: { type: 'integer', minimum: 1, maximum: 256 } },
      },
    },
  };
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      scope: {
        anyOf: [
          {
            type: 'object',
            required: ['ueId', 'qosId'],
            properties: { ueId: { $ref: '/a1/common#/$defs/UeId' }, qosId: { $ref: '/a1/common#/$defs/QosId' } },
          },
          {
            type: 'object',
            required: ['qosId'],
            properties: { qosId: { $ref: '/a1/common#/$defs/QosId' } },
          },
        ],
      },
    },
  };
  const scope = jsonSchemaToNodeGroup(schema, '__root__', { refDocuments: [common] }).children['scope'] as any;
  assert.equal(scope.kind, 'choice');
  assert.deepEqual(Object.keys(scope.cases), ['case0', 'case1']);
  assert.equal(scope.cases.case0.ueId.kind, 'choice'); // UeId oneOf -> nested choice
  assert.equal(scope.cases.case0.qosId.kind, 'nodeGroup');
  assert.equal(scope.cases.case0.qosId.children.fiveQi.integer, true);
  assert.equal(scope.cases.case0.qosId.children.fiveQi.max, 256);
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

// --- optionalPresence: non-required properties become presence nodes ----------

test('optional properties of every presence-capable kind are marked presence: true', () => {
  const schema: JsonSchema = {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string' },
      note: { type: 'string' },
      filter: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } },
      mode: { oneOf: [{ type: 'object', properties: { a: { type: 'string' } } }, { type: 'object', properties: { b: { type: 'string' } } }] },
      labels: { type: 'object', additionalProperties: { type: 'string' } },
    },
  };
  const g = jsonSchemaToNodeGroup(schema);
  assert.equal((g.children['name'] as any).presence, undefined); // required — never marked
  assert.equal((g.children['note'] as any).presence, true); // leaf
  assert.equal((g.children['filter'] as any).presence, true); // nodeGroup
  assert.equal((g.children['mode'] as any).presence, true); // choice
  assert.equal((g.children['labels'] as any).presence, true); // map
  // Inside the optional object, its own required child is untouched.
  assert.equal((g.children['filter'] as any).children.id.presence, undefined);
  assert.equal((g.children['filter'] as any).children.id.required, true);
});

test('a required property mapping to a choice keeps presence off and gains mandatory', () => {
  const schema: JsonSchema = {
    type: 'object',
    required: ['scope'],
    properties: {
      scope: { oneOf: [
        { type: 'object', required: ['ueId'], properties: { ueId: { type: 'integer' } } },
        { type: 'object', required: ['qosId'], properties: { qosId: { type: 'integer' } } },
      ] },
    },
  };
  const scope = jsonSchemaToNodeGroup(schema).children['scope'] as any;
  assert.equal(scope.kind, 'choice');
  assert.equal(scope.presence, undefined);
  assert.equal(scope.mandatory, true);
});

test('optional fields inside oneOf branches are marked; required branch fields are not', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      scope: { oneOf: [
        { type: 'object', required: ['shared'], properties: { shared: { type: 'integer' }, opt: { type: 'string' } } },
      ] },
    },
  };
  const scope = jsonSchemaToNodeGroup(schema).children['scope'] as any;
  assert.equal(scope.cases.case0.shared.presence, undefined);
  assert.equal(scope.cases.case0.shared.required, true);
  assert.equal(scope.cases.case0.opt.presence, true);
});

test('non-property positions are never marked: map values, array items, leaf-bodied cases', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      labels: { type: 'object', additionalProperties: { type: 'string' } },
      peers: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' } } } },
      limit: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
    },
  };
  const g = jsonSchemaToNodeGroup(schema);
  const labels = g.children['labels'] as any;
  assert.equal(labels.presence, true); // the optional map property itself
  assert.equal(labels.value.presence, undefined); // its value template — never

  const peers = g.children['peers'] as any;
  assert.equal(peers.presence, undefined); // lists cannot carry presence
  assert.equal(peers.type.presence, undefined); // the item group — never
  assert.equal(peers.type.children.id.presence, true); // an optional property INSIDE an item is a property

  const limit = g.children['limit'] as any;
  assert.equal(limit.presence, true); // the optional choice property itself
  for (const name of Object.keys(limit.cases)) {
    assert.equal(limit.cases[name].presence, undefined); // leaf-bodied case nodes — never
  }
});

test('optionalPresence: false restores unconditional materialization', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      note: { type: 'string' },
      filter: { type: 'object', properties: { id: { type: 'integer' } } },
    },
  };
  const g = jsonSchemaToNodeGroup(schema, 'body', { optionalPresence: false });
  assert.equal((g.children['note'] as any).presence, undefined);
  assert.equal((g.children['filter'] as any).presence, undefined);
});

test('an optional leaf with a default is still presence (the default seeds it when enabled)', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: { port: { type: 'integer', default: 80 } },
  };
  const port = jsonSchemaToNodeGroup(schema).children['port'] as any;
  assert.equal(port.presence, true);
  assert.equal(port.default, 80);
});
