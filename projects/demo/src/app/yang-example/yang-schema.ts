import { defineSchema } from 'ng-form-foundry';

/**
 * A small schema shaped like the output of the ng-form-foundry-transformers YANG transformer:
 * a root group with a leaf, a presence container (NTP), and a choice (transport).
 */
export const yangExample = defineSchema({
  kind: 'nodeGroup',
  name: 'system',
  label: 'System',
  root: true,
  children: {
    hostname: {
      kind: 'leaf', type: 'string', name: 'hostname', label: 'Hostname', default: 'router-1',
      // RFC 1123 label: letters/digits/hyphens, 1–63 chars, no leading/trailing hyphen.
      pattern: '^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$',
      minLength: 1,
      maxLength: 63,
    },
    // Optional scalar (presence): rendered with an on/off toggle, omitted from the
    // value when absent.
    contact: { kind: 'leaf', type: 'string', name: 'contact', label: 'Contact email', format: 'email', presence: true },
    transport: {
      kind: 'choice',
      name: 'transport',
      label: 'Transport',
      caseLabels: { tcp: 'TCP', udp: 'UDP' },
      cases: {
        tcp: {
          port: { kind: 'leaf', type: 'number', name: 'port', label: 'TCP port', default: 443, integer: true, min: 1, max: 65535 },
          tls: { kind: 'leaf', type: 'boolean', name: 'tls', label: 'TLS' },
        },
        udp: {
          port: { kind: 'leaf', type: 'number', name: 'port', label: 'UDP port', default: 53, integer: true, min: 1, max: 65535 },
        },
      },
    },
    ntp: {
      kind: 'nodeGroup',
      name: 'ntp',
      label: 'NTP (presence)',
      presence: true,
      children: {
        server: { kind: 'leaf', type: 'string', name: 'server', label: 'Server' },
      },
    },
    // Open, arbitrary-keyed record (a map / dictionary): add, remove, and rename
    // entries. Maps JSON Schema `additionalProperties: { type: 'string' }`.
    labels: {
      kind: 'map',
      name: 'labels',
      label: 'Labels (map)',
      keyLabel: 'Name',
      value: { kind: 'leaf', type: 'string', name: 'value', label: 'Value' },
    },
  },
});
