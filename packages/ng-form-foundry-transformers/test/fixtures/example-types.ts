import { EffectiveModel } from '../../src/transformers/yang/model';

/**
 * Exercises the previously-neglected leaf types: identityref (cross-module),
 * empty, bits, union, binary, and a 64-bit integer.
 */
export const exampleTypesModel: EffectiveModel = {
  modules: [{ name: 'example-types', namespace: 'urn:example:types' }],
  roots: [
    {
      kind: 'container',
      name: 'config',
      module: 'example-types',
      children: [
        {
          kind: 'leaf',
          name: 'mode',
          module: 'example-types',
          type: {
            base: 'identityref',
            identities: [
              { name: 'fast', module: 'example-types' },
              { name: 'turbo', module: 'other-mod' },
            ],
          },
        },
        { kind: 'leaf', name: 'trigger', module: 'example-types', type: { base: 'empty' } },
        {
          kind: 'leaf',
          name: 'flags',
          module: 'example-types',
          type: { base: 'bits', bits: ['alpha', 'beta', 'gamma'] },
        },
        {
          kind: 'leaf',
          name: 'label',
          module: 'example-types',
          type: { base: 'union', members: [{ base: 'uint16' }, { base: 'string' }] },
        },
        { kind: 'leaf', name: 'cert', module: 'example-types', type: { base: 'binary' } },
        { kind: 'leaf', name: 'big', module: 'example-types', type: { base: 'uint64' } },
      ],
    },
  ],
};

export const exampleTypesData = {
  'example-types:config': {
    mode: 'other-mod:turbo', // cross-module identityref → qualified on the wire
    trigger: [null], // empty leaf, present
    flags: 'alpha gamma', // bits set
    label: 'hello', // union, matched string member
    cert: 'aGk=', // binary (base64)
    big: '18446744073709551615', // uint64 as a string
  },
};
