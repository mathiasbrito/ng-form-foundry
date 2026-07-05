import { defineSchema } from 'ng-form-foundry';

/**
 * A small schema shaped like the output of the yang-form-foundry adapter:
 * a root group with a leaf, a presence container (NTP), and a choice (transport).
 */
export const yangExample = defineSchema({
  kind: 'nodeGroup',
  name: 'system',
  label: 'System',
  root: true,
  children: {
    hostname: { kind: 'leaf', type: 'string', name: 'hostname', label: 'Hostname', default: 'router-1' },
    transport: {
      kind: 'choice',
      name: 'transport',
      label: 'Transport',
      cases: {
        tcp: {
          port: { kind: 'leaf', type: 'number', name: 'port', label: 'TCP port', default: 443 },
          tls: { kind: 'leaf', type: 'boolean', name: 'tls', label: 'TLS' },
        },
        udp: {
          port: { kind: 'leaf', type: 'number', name: 'port', label: 'UDP port', default: 53 },
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
  },
});
