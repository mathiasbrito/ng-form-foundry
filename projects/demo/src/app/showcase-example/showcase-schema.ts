import { defineSchema } from 'ng-form-foundry';

/**
 * A 0.3.0 showcase schema: one form that exercises every new capability —
 * leaf constraint validators, integer/nullable/presence leaves, a read-only
 * constant, a labeled choice seeded by inference, and open maps (including one
 * with numeric keys, which echoes the R1 round-trip fix) plus a big-integer
 * string (the R2 strategy).
 */
export const showcase = defineSchema({
  kind: 'nodeGroup',
  name: 'service',
  root: true,
  label: 'Service',
  children: {
    // --- Constraint validators (inline mat-error) ---
    hostname: {
      kind: 'leaf', type: 'string', name: 'hostname', label: 'Hostname', required: true,
      pattern: '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$', minLength: 1, maxLength: 63, default: 'api-gateway',
    },
    adminEmail: { kind: 'leaf', type: 'string', name: 'adminEmail', label: 'Admin email', format: 'email' },
    healthUrl: { kind: 'leaf', type: 'string', name: 'healthUrl', label: 'Health check URL', format: 'uri' },
    port: { kind: 'leaf', type: 'number', name: 'port', label: 'Port', min: 1, max: 65535, integer: true, default: 8080 },
    cpuShare: { kind: 'leaf', type: 'number', name: 'cpuShare', label: 'CPU share', min: 0, max: 1, multipleOf: 0.05, default: 0.25 },

    // --- Optional / nullable / presence / constant ---
    replicas: { kind: 'leaf', type: 'number', name: 'replicas', label: 'Replicas (nullable)', integer: true, nullable: true },
    notes: { kind: 'leaf', type: 'string', name: 'notes', label: 'Notes (optional — presence)', presence: true },
    apiVersion: { kind: 'leaf', type: 'string', name: 'apiVersion', label: 'API version (const)', default: 'apps/v1', readOnly: true },

    // --- Choice: labeled cases, active case inferred from seed data ---
    scope: {
      kind: 'choice', name: 'scope', label: 'Deploy scope',
      caseLabels: { byNode: 'By node', byZone: 'By zone', byRegion: 'By region' },
      cases: {
        byNode: { nodeId: { kind: 'leaf', type: 'string', name: 'nodeId', label: 'Node id', required: true } },
        byZone: { zoneId: { kind: 'leaf', type: 'string', name: 'zoneId', label: 'Zone id', required: true } },
        byRegion: { regionId: { kind: 'leaf', type: 'string', name: 'regionId', label: 'Region id', required: true } },
      },
    },

    // --- Open maps (add / remove / rename). Numeric keys echo the R1 fix. ---
    portMap: {
      kind: 'map', name: 'portMap', label: 'Port map — numeric keys (R1)', keyLabel: 'Port',
      value: { kind: 'leaf', type: 'string', name: 'value', label: 'Service' },
    },
    labels: {
      kind: 'map', name: 'labels', label: 'Labels', keyLabel: 'Name',
      value: { kind: 'leaf', type: 'string', name: 'value', label: 'Value' },
    },

    // --- A big integer, carried as a string with full precision (R2) ---
    ledgerId: {
      kind: 'leaf', type: 'string', name: 'ledgerId', label: 'Ledger id — >2^53 (R2)',
      pattern: '^[0-9]+$', default: '9007199254740993',
    },

    // --- A primitive list ---
    tags: { kind: 'leafList', type: 'string', name: 'tags', label: 'Tags' },
  },
});

/**
 * Seed data. `scope` carries no `__case`, so the active case is inferred from the
 * present field (`byZone`); `portMap` uses numeric keys; `replicas` is null;
 * `notes` is absent (its presence toggle starts off).
 */
export const showcaseValue = {
  hostname: 'api-gateway',
  adminEmail: 'ops@example.com',
  healthUrl: 'https://api-gateway/healthz',
  port: 8080,
  cpuShare: 0.25,
  replicas: null,
  scope: { zoneId: 'eu-west-1a' },
  portMap: { '80': 'http', '443': 'https' },
  labels: { env: 'prod', team: 'platform' },
  ledgerId: '9007199254740993',
  tags: ['edge', 'public'],
};
