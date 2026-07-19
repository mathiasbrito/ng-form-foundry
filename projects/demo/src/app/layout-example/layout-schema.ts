import { Appearance, NodeGroup } from 'ng-form-foundry';

/**
 * A form exercising the `appearance` field-layout options: a root group of
 * mixed scalar fields (plus a leaf-list, which spans the full row once it has
 * several entries), a nested group, and a choice. The `appearance` sits on
 * the **root only** — the nested TLS group and the Backend choice inherit it,
 * demonstrating the layout cascade.
 */
export function layoutSchema(appearance?: Appearance): NodeGroup {
  return {
    kind: 'nodeGroup',
    name: 'service',
    label: 'Service',
    root: true,
    appearance,
    children: {
      hostname: { kind: 'leaf', type: 'string', name: 'hostname', label: 'Hostname', default: 'gw.example.net' },
      port: { kind: 'leaf', type: 'number', name: 'port', label: 'Port', integer: true, default: 8443 },
      protocol: {
        kind: 'leaf',
        type: 'enum',
        name: 'protocol',
        label: 'Protocol',
        enum: ['http', 'https', 'grpc'],
        default: 'https',
      },
      enabled: { kind: 'leaf', type: 'boolean', name: 'enabled', label: 'Enabled', default: true },
      logRequests: { kind: 'leaf', type: 'boolean', name: 'logRequests', label: 'Log requests' },
      description: { kind: 'leaf', type: 'string', name: 'description', label: 'Description' },
      timeoutMs: { kind: 'leaf', type: 'number', name: 'timeoutMs', label: 'Timeout (ms)', integer: true, default: 3000 },
      tags: { kind: 'leafList', name: 'tags', label: 'Tags', type: 'string', default: ['edge', 'prod'] },
      tls: {
        kind: 'nodeGroup',
        name: 'tls',
        label: 'TLS',
        children: {
          certFile: { kind: 'leaf', type: 'string', name: 'certFile', label: 'Certificate file' },
          keyFile: { kind: 'leaf', type: 'string', name: 'keyFile', label: 'Key file' },
          caFile: { kind: 'leaf', type: 'string', name: 'caFile', label: 'CA file' },
          verifyClient: { kind: 'leaf', type: 'boolean', name: 'verifyClient', label: 'Verify client' },
        },
      },
      backend: {
        kind: 'choice',
        name: 'backend',
        label: 'Backend',
        caseLabels: { static: 'Static upstream', discovered: 'Service discovery' },
        cases: {
          static: {
            upstreamHost: { kind: 'leaf', type: 'string', name: 'upstreamHost', label: 'Upstream host', required: true },
            upstreamPort: { kind: 'leaf', type: 'number', name: 'upstreamPort', label: 'Upstream port', integer: true },
            weight: { kind: 'leaf', type: 'number', name: 'weight', label: 'Weight', integer: true },
          },
          discovered: {
            registry: { kind: 'leaf', type: 'string', name: 'registry', label: 'Registry URL', required: true },
            serviceName: { kind: 'leaf', type: 'string', name: 'serviceName', label: 'Service name' },
            refreshS: { kind: 'leaf', type: 'number', name: 'refreshS', label: 'Refresh (s)', integer: true },
          },
        },
      },
    },
  };
}
