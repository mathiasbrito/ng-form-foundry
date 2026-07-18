import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyThesaurus } from '../src/core/thesaurus';
import { jsonSchemaToNodeGroup, type JsonSchema } from '../src/core/json-schema';
import { jsonTransformer } from '../src/transformers/json/json-transformer';
import { yamlTransformer } from '../src/transformers/yaml/yaml-transformer';
import { libconfigTransformer } from '../src/transformers/libconfig';
import type { Thesaurus } from '../src/core/schema';

const THESAURUS: Thesaurus = {
  ueid: { label: 'UE ID', description: 'UE identifier.' },
  qosid: { label: 'QoS ID' },
  groupid: { label: 'Group ID' },
  sliceid: { label: 'Slice ID' },
  scope: { label: 'Scope' },
  'ue.id': { label: 'Dotted UE ID' }, // a literal name containing a dot — never a path
};

test('fills label and description by record key, case-insensitively, without overwriting', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      ueId: { type: 'string' },
      qosId: { type: 'integer', title: 'Authored title' },
    },
    required: ['ueId', 'qosId'],
  };
  const g = jsonSchemaToNodeGroup(schema, 'body', { thesaurus: THESAURUS });
  const ueId = g.children['ueId'] as any;
  assert.equal(ueId.label, 'UE ID'); // entry key 'ueid' matched property 'ueId'
  assert.equal(ueId.description, 'UE identifier.');
  assert.equal((g.children['qosId'] as any).label, 'Authored title'); // schema title wins
});

test('keys containing dots are literal names, not paths', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: { 'ue.id': { type: 'string' } },
    required: ['ue.id'],
  };
  const g = jsonSchemaToNodeGroup(schema, 'body', { thesaurus: THESAURUS });
  assert.equal((g.children['ue.id'] as any).label, 'Dotted UE ID');
});

test('labels unlabeled choice cases from their discriminating required field', () => {
  // The O-RAN A1 scope shape: untitled anyOf branches. Sibling cases may end
  // up with the same label (identical required sets) — the library's case
  // selectors disambiguate collisions by distinguishing fields.
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      scope: {
        anyOf: [
          {
            type: 'object',
            properties: { ueId: { type: 'string' }, groupId: { type: 'string' }, qosId: { type: 'string' } },
            required: ['ueId', 'qosId'],
          },
          {
            type: 'object',
            properties: { sliceId: { type: 'string' }, qosId: { type: 'string' } },
            required: ['sliceId', 'qosId'],
          },
        ],
      },
    },
    required: ['scope'],
  };
  const g = jsonSchemaToNodeGroup(schema, 'body', { thesaurus: THESAURUS });
  const scope = g.children['scope'] as any;
  assert.equal(scope.label, 'Scope');
  assert.deepEqual(scope.caseLabels, { case0: 'UE ID', case1: 'Slice ID' });
  // Case fields are decorated too, at any depth.
  assert.equal(scope.cases.case0.groupId.label, 'Group ID');
});

test('applies to inferred schemas through the json and yaml transformers', () => {
  const viaJson = jsonTransformer.toSchema('{"ueId":"u1","nested":{"qosId":5}}', { thesaurus: THESAURUS });
  assert.equal((viaJson.schema.children['ueId'] as any).label, 'UE ID');
  assert.equal(((viaJson.schema.children['nested'] as any).children.qosId as any).label, 'QoS ID');

  const viaYaml = yamlTransformer.toSchema('ueId: u1\n', { thesaurus: THESAURUS });
  assert.equal((viaYaml.schema.children['ueId'] as any).label, 'UE ID');
});

test('applies to inferred libconfig schemas', () => {
  const { schema } = libconfigTransformer.toSchema('ueId = "u1";\n', { thesaurus: THESAURUS });
  assert.equal((schema.children['ueId'] as any).label, 'UE ID');
});

test('applyThesaurus does not mutate its input', () => {
  const schema: JsonSchema = { type: 'object', properties: { ueId: { type: 'string' } }, required: ['ueId'] };
  const g = jsonSchemaToNodeGroup(schema, 'body');
  const labeled = applyThesaurus(g, THESAURUS);
  assert.equal((g.children['ueId'] as any).label, undefined);
  assert.equal((labeled.children['ueId'] as any).label, 'UE ID');
});

test('colliding case labels are emitted as-is with labeled distinguishing fields (library de-dup contract)', () => {
  // The real QoSTarget trap: two branches share required {ueId, qosId} and
  // differ only in an optional identifier. The thesaurus labels both cases
  // "UE ID" — deliberately: the library's caseDisplayLabels renders them as
  // "UE ID (Group ID)" / "UE ID (Slice ID)" from the field labels injected
  // here. This pins the handoff surface that de-dup consumes.
  const schema: JsonSchema = {
    type: 'object',
    required: ['scope'],
    properties: {
      scope: {
        anyOf: [
          {
            type: 'object',
            required: ['ueId', 'qosId'],
            properties: { ueId: { type: 'string' }, groupId: { type: 'string' }, qosId: { type: 'string' } },
          },
          {
            type: 'object',
            required: ['ueId', 'qosId'],
            properties: { ueId: { type: 'string' }, sliceId: { type: 'string' }, qosId: { type: 'string' } },
          },
        ],
      },
    },
  };
  const scope = jsonSchemaToNodeGroup(schema, 'body', { thesaurus: THESAURUS }).children['scope'] as any;
  assert.deepEqual(scope.caseLabels, { case0: 'UE ID', case1: 'UE ID' });
  assert.equal(scope.cases.case0.groupId.label, 'Group ID'); // the de-dup suffix source
  assert.equal(scope.cases.case1.sliceId.label, 'Slice ID');
});
