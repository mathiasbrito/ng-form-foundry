import { defineSchema } from 'ng-form-foundry';

/** A nested config with groups and a list, to exercise the tree editor. */
export const treeEditorSchema = defineSchema({
  kind: 'nodeGroup',
  name: 'device',
  label: 'Device',
  root: true,
  children: {
    hostname: { kind: 'leaf', type: 'string', name: 'hostname', label: 'Hostname' },
    location: { kind: 'leaf', type: 'string', name: 'location', label: 'Location' },
    system: {
      kind: 'nodeGroup',
      name: 'system',
      label: 'System',
      children: {
        timezone: { kind: 'leaf', type: 'string', name: 'timezone', label: 'Timezone' },
        ntp: {
          kind: 'nodeGroup',
          name: 'ntp',
          label: 'NTP',
          children: {
            server: { kind: 'leaf', type: 'string', name: 'server', label: 'Server' },
            enabled: { kind: 'leaf', type: 'boolean', name: 'enabled', label: 'Enabled' },
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
          name: { kind: 'leaf', type: 'string', name: 'name', label: 'Name' },
          mtu: { kind: 'leaf', type: 'number', name: 'mtu', label: 'MTU', default: 1500 },
          enabled: { kind: 'leaf', type: 'boolean', name: 'enabled', label: 'Enabled' },
        },
      },
    },
    logging: {
      kind: 'nodeGroup',
      name: 'logging',
      label: 'Logging (optional)',
      presence: true,
      children: { level: { kind: 'leaf', type: 'string', name: 'level', label: 'Level', default: 'info' } },
    },
    management: {
      kind: 'nodeGroup',
      name: 'management',
      label: 'Management (optional)',
      presence: true,
      children: { user: { kind: 'leaf', type: 'string', name: 'user', label: 'Admin user' } },
    },
  },
});
