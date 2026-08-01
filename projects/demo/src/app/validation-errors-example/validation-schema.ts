import { defineSchema } from 'ng-form-foundry';

/**
 * A nested device config with constraint validators at several depths, so a
 * form seeded with bad values lights up error markers across the tree — the
 * fixture for the config editor's error tooltip / go-to-field links.
 */
export const validationSchema = defineSchema({
  kind: 'nodeGroup',
  name: 'device',
  label: 'Device',
  root: true,
  children: {
    hostname: {
      kind: 'leaf',
      type: 'string',
      name: 'hostname',
      label: 'Hostname',
      required: true,
      pattern: '^[a-z][a-z0-9-]*$',
    },
    system: {
      kind: 'nodeGroup',
      name: 'system',
      label: 'System',
      children: {
        mtu: { kind: 'leaf', type: 'number', name: 'mtu', label: 'MTU', min: 576, max: 9000 },
        ntp: {
          kind: 'nodeGroup',
          name: 'ntp',
          label: 'NTP',
          children: {
            server: { kind: 'leaf', type: 'string', name: 'server', label: 'Server', required: true },
            port: { kind: 'leaf', type: 'number', name: 'port', label: 'Port', min: 1, max: 65535 },
          },
        },
      },
    },
    interfaces: {
      kind: 'nodeGroupList',
      name: 'interfaces',
      label: 'Interfaces',
      type: {
        kind: 'nodeGroup',
        name: 'interface',
        label: 'Interface',
        children: {
          name: { kind: 'leaf', type: 'string', name: 'name', label: 'Name', required: true },
          vlan: { kind: 'leaf', type: 'number', name: 'vlan', label: 'VLAN', min: 1, max: 4094 },
        },
      },
    },
  },
});

/** Seed values that deliberately violate the constraints, so every error kind shows. */
export const invalidValue = {
  hostname: 'Bad Host!', // uppercase + space + '!' violate the pattern
  system: {
    mtu: 100, // below min 576
    ntp: {
      server: '', // required, empty
      port: 99999, // above max 65535
    },
  },
  interfaces: [
    { name: '', vlan: 5000 }, // name required, vlan above max 4094
    { name: 'eth1', vlan: 100 }, // valid, for contrast
  ],
};
