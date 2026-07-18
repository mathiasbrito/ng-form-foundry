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

// --- scoped variants (under: ancestor-name suffixes) --------------------------

test('scoped variants: the same identifier labels differently under different ancestors', () => {
  const schema: JsonSchema = {
    type: 'object',
    required: ['cell', 'slice', 'policy'],
    properties: {
      cell: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      slice: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      policy: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  };
  const scoped: Thesaurus = {
    id: [
      { under: ['cell'], label: 'Cell ID' },
      { under: ['slice'], label: 'S-NSSAI' },
      { label: 'ID' }, // unscoped fallback
    ],
  };
  const g = jsonSchemaToNodeGroup(schema, 'body', { thesaurus: scoped });
  assert.equal(((g.children['cell'] as any).children.id as any).label, 'Cell ID');
  assert.equal(((g.children['slice'] as any).children.id as any).label, 'S-NSSAI');
  assert.equal(((g.children['policy'] as any).children.id as any).label, 'ID'); // fallback
});

test('the longest matching scope wins over a shorter one', () => {
  const schema: JsonSchema = {
    type: 'object',
    required: ['outer'],
    properties: {
      outer: {
        type: 'object',
        required: ['cell'],
        properties: {
          cell: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        },
      },
    },
  };
  const scoped: Thesaurus = {
    id: [
      { under: ['cell'], label: 'Any Cell ID' },
      { under: ['outer', 'cell'], label: 'Outer Cell ID' },
    ],
  };
  const g = jsonSchemaToNodeGroup(schema, 'body', { thesaurus: scoped });
  assert.equal((((g.children['outer'] as any).children.cell as any).children.id as any).label, 'Outer Cell ID');
});

test('choice cases are scope-transparent by default and targetable by case name', () => {
  // Hand-built NodeGroup with meaningfully named cases: the same field name
  // means different things in sibling cases of ONE choice — only a case-name
  // scope can distinguish them.
  const group = {
    kind: 'nodeGroup' as const,
    name: 'body',
    children: {
      scope: {
        kind: 'choice' as const,
        name: 'scope',
        cases: {
          byUe: { id: { kind: 'leaf' as const, type: 'string' as const, name: 'id' } },
          byCell: { id: { kind: 'leaf' as const, type: 'string' as const, name: 'id' } },
        },
      },
    },
  };
  const scoped: Thesaurus = {
    id: [
      { under: ['scope', 'byUe'], label: 'UE ID' },
      { under: ['scope', 'byCell'], label: 'Cell ID' },
      { under: ['scope'], label: 'Scope ID' }, // would cover any other case
    ],
  };
  const labeled = applyThesaurus(group, scoped);
  const scope = labeled.children['scope'] as any;
  assert.equal(scope.cases.byUe.id.label, 'UE ID');
  assert.equal(scope.cases.byCell.id.label, 'Cell ID');
  // The per-case labels also drive caseLabels via the discriminating field.
  assert.deepEqual(scope.caseLabels, { byUe: 'UE ID', byCell: 'Cell ID' });

  // Case-transparent variant: with only the ['scope'] entry, both cases match it.
  const transparent = applyThesaurus(group, { id: [{ under: ['scope'], label: 'Scope ID' }] });
  assert.equal((transparent.children['scope'] as any).cases.byUe.id.label, 'Scope ID');
  assert.equal((transparent.children['scope'] as any).cases.byCell.id.label, 'Scope ID');
});

test('list items and map entries are transparent: fields scope under the list/map name', () => {
  const schema: JsonSchema = {
    type: 'object',
    required: ['cells', 'peers'],
    properties: {
      cells: {
        type: 'array',
        items: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
      peers: { type: 'object', additionalProperties: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
    },
  };
  const scoped: Thesaurus = {
    id: [
      { under: ['cells'], label: 'Cell ID' },
      { under: ['peers'], label: 'Peer ID' },
    ],
  };
  const g = jsonSchemaToNodeGroup(schema, 'body', { thesaurus: scoped });
  assert.equal(((g.children['cells'] as any).type.children.id as any).label, 'Cell ID');
  assert.equal((((g.children['peers'] as any).value as any).children.id as any).label, 'Peer ID');
});
