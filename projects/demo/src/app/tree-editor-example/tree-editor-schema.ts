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
    // A presence leaf: absent by default, offered as an add-row / menu entry.
    description: { kind: 'leaf', type: 'string', name: 'description', label: 'Description', presence: true },
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
    // Several optional groups on the root: in the tree they surface as add
    // affordances — one named row each by default, or a single "+ Optional
    // field" menu when the editor's optionalFields is set to 'menu'.
    logging: {
      kind: 'nodeGroup',
      name: 'logging',
      label: 'Logging',
      presence: true,
      children: { level: { kind: 'leaf', type: 'string', name: 'level', label: 'Level', default: 'info' } },
    },
    snmp: {
      kind: 'nodeGroup',
      name: 'snmp',
      label: 'SNMP',
      presence: true,
      children: {
        community: { kind: 'leaf', type: 'string', name: 'community', label: 'Community', default: 'public' },
        port: { kind: 'leaf', type: 'number', name: 'port', label: 'Port', default: 161 },
      },
    },
    syslog: {
      kind: 'nodeGroup',
      name: 'syslog',
      label: 'Syslog',
      presence: true,
      children: {
        host: { kind: 'leaf', type: 'string', name: 'host', label: 'Host' },
        port: { kind: 'leaf', type: 'number', name: 'port', label: 'Port', default: 514 },
      },
    },
    management: {
      kind: 'nodeGroup',
      name: 'management',
      label: 'Management',
      presence: true,
      children: { user: { kind: 'leaf', type: 'string', name: 'user', label: 'Admin user' } },
    },
  },
});
