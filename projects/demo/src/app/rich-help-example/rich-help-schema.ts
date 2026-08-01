import { defineSchema } from 'ng-form-foundry';

/**
 * A device config whose tree nodes carry rich-HTML `description`s, to exercise
 * the config editor's help popover. Every non-leaf node here has a
 * `description`, so its tree row shows a help icon on hover; the strings use
 * lists, links, `code`, and emphasis to show the popover keeps formatting.
 */
export const richHelpSchema = defineSchema({
  kind: 'nodeGroup',
  name: 'device',
  label: 'Device',
  root: true,
  description:
    '<p>Edge router configuration.</p><p>Hover the <strong>?</strong> icon on any row for guidance — the help text accepts <em>formatted</em> HTML.</p>',
  children: {
    hostname: {
      kind: 'leaf',
      type: 'string',
      name: 'hostname',
      label: 'Hostname',
      description: "The device's <strong>hostname</strong> — a valid DNS label (letters, digits, hyphens).",
    },
    contact: {
      kind: 'leaf',
      type: 'string',
      name: 'contact',
      label: 'Contact',
      presence: true,
      description: '<p>Optional administrative contact (email or name).</p><p>Hover <strong>Add Contact</strong> to see this before adding it.</p>',
    },
    tags: {
      kind: 'leafList',
      type: 'string',
      name: 'tags',
      label: 'Tags',
      presence: true,
      description: '<p>Free-form <strong>tags</strong> for this device, e.g. <code>edge</code>, <code>prod</code>, <code>eu-west-1</code>.</p>',
    },
    system: {
      kind: 'nodeGroup',
      name: 'system',
      label: 'System',
      description:
        '<p>Host-level settings.</p><ul><li><strong>Timezone</strong> — IANA name, e.g. <code>Europe/Berlin</code>.</li><li><strong>NTP</strong> — time sync, configured below.</li></ul>',
      children: {
        timezone: {
          kind: 'leaf',
          type: 'string',
          name: 'timezone',
          label: 'Timezone',
          default: 'UTC',
          description: 'IANA timezone name, e.g. <code>Europe/Berlin</code> or <code>UTC</code>.',
        },
        ntp: {
          kind: 'nodeGroup',
          name: 'ntp',
          label: 'NTP',
          description:
            '<p>Network Time Protocol client. See <a href="https://www.rfc-editor.org/rfc/rfc5905" target="_blank" rel="noopener">RFC&nbsp;5905</a>.</p><p>Leave <code>enabled</code> off to keep the hardware clock.</p>',
          children: {
            server: {
              kind: 'leaf',
              type: 'string',
              name: 'server',
              label: 'Server',
              default: 'pool.ntp.org',
              description:
                'Upstream NTP server or pool hostname. See <a href="https://www.ntppool.org/" target="_blank" rel="noopener">ntppool.org</a>.',
            },
            enabled: {
              kind: 'leaf',
              type: 'boolean',
              name: 'enabled',
              label: 'Enabled',
              default: true,
              description: 'Run the NTP client at boot. Off keeps the hardware clock.',
            },
          },
        },
      },
    },
    interfaces: {
      kind: 'nodeGroupList',
      name: 'interfaces',
      label: 'Interfaces',
      description:
        '<p>Physical and virtual network interfaces.</p><p>Add one row per port; the <code>MTU</code> defaults to <code>1500</code>.</p>',
      type: {
        kind: 'nodeGroup',
        name: 'interface',
        label: 'Interface',
        description:
          '<p>A single interface.</p><p>Set <strong>Enabled</strong> off to keep the config but hold the port administratively down.</p>',
        children: {
          name: { kind: 'leaf', type: 'string', name: 'name', label: 'Name', description: 'Interface name, e.g. <code>eth0</code>.' },
          mtu: {
            kind: 'leaf',
            type: 'number',
            name: 'mtu',
            label: 'MTU',
            default: 1500,
            description:
              'Maximum transmission unit, in bytes. Common values: <code>1500</code> (Ethernet), <code>9000</code> (jumbo frames).',
          },
          enabled: { kind: 'leaf', type: 'boolean', name: 'enabled', label: 'Enabled', default: true },
        },
      },
    },
    routes: {
      kind: 'map',
      name: 'routes',
      label: 'Static routes',
      keyLabel: 'Prefix',
      description:
        '<p>Static routing table, keyed by destination prefix.</p><p>Key example: <code>10.0.0.0/8</code>; value is the next-hop address.</p>',
      value: { kind: 'leaf', type: 'string', name: 'nextHop', label: 'Next hop' },
    },
    auth: {
      kind: 'choice',
      name: 'auth',
      label: 'Admin auth',
      description:
        '<p>How the admin user authenticates.</p><ul><li><strong>Password</strong> — simplest, rotate often.</li><li><strong>SSH key</strong> — recommended; paste the public key.</li></ul>',
      caseLabels: { password: 'Password', key: 'SSH key' },
      cases: {
        password: { password: { kind: 'leaf', type: 'string', name: 'password', label: 'Password' } },
        key: { publicKey: { kind: 'leaf', type: 'string', name: 'publicKey', label: 'Public key' } },
      },
    },
  },
});
