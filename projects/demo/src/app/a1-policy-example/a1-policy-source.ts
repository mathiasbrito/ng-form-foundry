import type { JsonSchema } from 'ng-form-foundry-transformers';

/**
 * A JSON Schema (draft 2020-12) shaped like an O-RAN A1 "QoS Target" policy type:
 * a `scope` that is an `anyOf` of variants discriminated by which id fields are
 * required, `$ref`s into a shared **common** document, and a constrained
 * `qosObjectives` object. Authored for the demo to exercise the same shape the
 * airpuls A1 console renders — not a copy of any O-RAN schema.
 */
export const a1QosTargetSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.example.org/demo/a1/qos-target',
  type: 'object',
  required: ['scope', 'qosObjectives'],
  additionalProperties: false,
  properties: {
    scope: {
      title: 'Scope',
      anyOf: [
        {
          title: 'By UE + QoS',
          type: 'object',
          additionalProperties: false,
          required: ['ueId', 'qosId'],
          properties: {
            ueId: { $ref: '/demo/a1/common#/$defs/UeId' },
            qosId: { $ref: '/demo/a1/common#/$defs/QosId' },
            cellId: { $ref: '/demo/a1/common#/$defs/CellId' },
          },
        },
        {
          title: 'By slice + QoS',
          type: 'object',
          additionalProperties: false,
          required: ['sliceId', 'qosId'],
          properties: {
            sliceId: { $ref: '/demo/a1/common#/$defs/SliceId' },
            qosId: { $ref: '/demo/a1/common#/$defs/QosId' },
            cellId: { $ref: '/demo/a1/common#/$defs/CellId' },
          },
        },
        {
          title: 'By QoS only',
          type: 'object',
          additionalProperties: false,
          required: ['qosId'],
          properties: {
            qosId: { $ref: '/demo/a1/common#/$defs/QosId' },
            cellId: { $ref: '/demo/a1/common#/$defs/CellId' },
          },
        },
      ],
    },
    qosObjectives: {
      title: 'QoS objectives',
      type: 'object',
      minProperties: 1,
      additionalProperties: false,
      properties: {
        gfbr: { title: 'GFBR (kbps)', type: 'integer', minimum: 0 },
        mfbr: { title: 'MFBR (kbps)', type: 'integer', minimum: 0 },
        priorityLevel: { title: 'Priority level', type: 'integer', minimum: 1, maximum: 127 },
        pdb: { title: 'PDB (ms)', type: 'number', minimum: 0 },
      },
    },
  },
};

/**
 * The shared "common" document the policy `$ref`s into (matched by `$id`). Holds
 * the id definitions — a nested `oneOf` (`UeId`) and constrained scalars
 * (`SliceId.sst`, `SliceId.sd`, `QosId`) — so the demo exercises cross-file `$ref`
 * resolution and the constraints that ride along.
 */
export const a1CommonSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.example.org/demo/a1/common',
  $defs: {
    UeId: {
      title: 'UE id',
      oneOf: [
        {
          title: 'gNB UE id',
          type: 'object',
          additionalProperties: false,
          required: ['gnbId', 'ueF1apId'],
          properties: {
            gnbId: { title: 'gNB id', type: 'string', pattern: '^[0-9]{1,9}$' },
            ueF1apId: { title: 'UE F1AP id', type: 'integer', minimum: 0 },
          },
        },
        {
          title: 'AMF UE id',
          type: 'object',
          additionalProperties: false,
          required: ['amfUeNgapId'],
          properties: {
            amfUeNgapId: { title: 'AMF UE NGAP id', type: 'integer', minimum: 0 },
          },
        },
      ],
    },
    CellId: {
      title: 'Cell id',
      type: 'object',
      additionalProperties: false,
      required: ['plmnId', 'cId'],
      properties: {
        plmnId: { $ref: '#/$defs/PlmnId' },
        cId: { title: 'Cell identity', type: 'string', pattern: '^[A-Fa-f0-9]{9}$' },
      },
    },
    SliceId: {
      title: 'Slice id (S-NSSAI)',
      type: 'object',
      additionalProperties: false,
      required: ['sst'],
      properties: {
        sst: { title: 'SST', type: 'integer', minimum: 0, maximum: 255 },
        sd: { title: 'SD (hex)', type: 'string', pattern: '^[A-Fa-f0-9]{6}$' },
        plmnId: { $ref: '#/$defs/PlmnId' },
      },
    },
    QosId: {
      title: 'QoS id',
      oneOf: [
        {
          title: '5QI',
          type: 'object',
          additionalProperties: false,
          required: ['fiveQi'],
          properties: { fiveQi: { title: '5QI', type: 'integer', minimum: 1, maximum: 256 } },
        },
        {
          title: 'QCI',
          type: 'object',
          additionalProperties: false,
          required: ['qci'],
          properties: { qci: { title: 'QCI', type: 'integer', minimum: 1, maximum: 256 } },
        },
      ],
    },
    PlmnId: {
      title: 'PLMN id',
      type: 'object',
      additionalProperties: false,
      required: ['mcc', 'mnc'],
      properties: {
        mcc: { title: 'MCC', type: 'string', pattern: '^[0-9]{3}$' },
        mnc: { title: 'MNC', type: 'string', pattern: '^[0-9]{2,3}$' },
      },
    },
  },
};
