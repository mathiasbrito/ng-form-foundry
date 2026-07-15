import { EffectiveModel } from '../../src/transformers/yang/model';

/**
 * A small self-contained model exercising the v0.1 subset: a container holding a
 * keyed list of leaves, with a uint64 (string-encoded), an enum, and a
 * config-false state leaf. Stands in for what the engine emits for a real model.
 */
export const exampleInterfacesModel: EffectiveModel = {
  modules: [{ name: 'example-interfaces', namespace: 'urn:example:interfaces' }],
  roots: [
    {
      kind: 'container',
      name: 'interfaces',
      module: 'example-interfaces',
      children: [
        {
          kind: 'list',
          name: 'interface',
          module: 'example-interfaces',
          keys: ['name'],
          children: [
            { kind: 'leaf', name: 'name', module: 'example-interfaces', type: { base: 'string' }, mandatory: true },
            { kind: 'leaf', name: 'enabled', module: 'example-interfaces', type: { base: 'boolean' }, default: true },
            { kind: 'leaf', name: 'mtu', module: 'example-interfaces', type: { base: 'uint16' } },
            { kind: 'leaf', name: 'byte-count', module: 'example-interfaces', type: { base: 'uint64' } },
            {
              kind: 'leaf',
              name: 'oper-status',
              module: 'example-interfaces',
              type: { base: 'enumeration', enums: ['up', 'down', 'testing'] },
              config: false,
            },
          ],
        },
      ],
    },
  ],
};

/** RFC 7951 config data — top-level member namespace-qualified, uint64 as a string. */
export const exampleConfigData = {
  'example-interfaces:interfaces': {
    interface: [
      { name: 'eth0', enabled: false, mtu: 1500, 'byte-count': '18446744073709551615' },
      { name: 'eth1', enabled: true, mtu: 9000, 'byte-count': '42' },
    ],
  },
};

/** RFC 7951 data that also carries operational (config false) state. */
export const exampleDataWithState = {
  'example-interfaces:interfaces': {
    interface: [
      { name: 'eth0', enabled: false, mtu: 1500, 'byte-count': '18446744073709551615', 'oper-status': 'down' },
    ],
  },
};
