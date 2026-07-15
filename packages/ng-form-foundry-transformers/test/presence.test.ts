import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EffectiveModel } from '../src/transformers/yang/model';
import { mapToSchema } from '../src/transformers/yang/mapper';
import { toFormValue, toYangData } from '../src/transformers/yang/revert';

const model: EffectiveModel = {
  modules: [{ name: 'example-sys', namespace: 'urn:example:sys' }],
  roots: [
    {
      kind: 'container',
      name: 'system',
      module: 'example-sys',
      children: [
        { kind: 'leaf', name: 'hostname', module: 'example-sys', type: { base: 'string' } },
        {
          kind: 'container',
          name: 'ntp',
          module: 'example-sys',
          presence: true,
          children: [{ kind: 'leaf', name: 'server', module: 'example-sys', type: { base: 'string' } }],
        },
      ],
    },
  ],
};

test('presence container maps to a NodeGroup flagged presence:true', () => {
  const system = mapToSchema(model).children['system'] as any;
  assert.equal(system.children['ntp'].presence, true);
  assert.notEqual(system.presence, true); // the plain container is not presence
});

test('present-but-empty presence container round-trips as {}', () => {
  const data = { 'example-sys:system': { hostname: 'r1', ntp: {} } };
  const form = toFormValue(data, model) as any;
  assert.deepEqual(form.system.ntp, {});
  assert.deepEqual(toYangData(form, model), data);
});

test('present presence container with children round-trips', () => {
  const data = { 'example-sys:system': { hostname: 'r1', ntp: { server: 'pool.ntp.org' } } };
  assert.deepEqual(toYangData(toFormValue(data, model), model), data);
});

test('absent presence container is omitted on both sides', () => {
  const data = { 'example-sys:system': { hostname: 'r1' } };
  const form = toFormValue(data, model) as any;
  assert.ok(!('ntp' in form.system));
  const back = toYangData(form, model) as any;
  assert.ok(!('ntp' in back['example-sys:system']));
});
