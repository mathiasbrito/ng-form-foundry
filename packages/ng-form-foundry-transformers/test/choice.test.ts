import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EffectiveModel } from '../src/transformers/yang/model';
import { mapToSchema } from '../src/transformers/yang/mapper';
import { toFormValue, toYangData } from '../src/transformers/yang/revert';

const model: EffectiveModel = {
  modules: [{ name: 'ex', namespace: 'urn:ex' }],
  roots: [
    {
      kind: 'container',
      name: 'protocol',
      module: 'ex',
      children: [
        { kind: 'leaf', name: 'name', module: 'ex', type: { base: 'string' } },
        {
          kind: 'choice',
          name: 'transport',
          module: 'ex',
          cases: [
            {
              name: 'tcp',
              children: [
                { kind: 'leaf', name: 'tcp-port', module: 'ex', type: { base: 'uint16' } },
                { kind: 'leaf', name: 'tls', module: 'ex', type: { base: 'boolean' } },
              ],
            },
            {
              name: 'udp',
              children: [{ kind: 'leaf', name: 'udp-port', module: 'ex', type: { base: 'uint16' } }],
            },
          ],
        },
      ],
    },
  ],
};

test('choice maps to a Choice node with per-case children', () => {
  const protocol = mapToSchema(model).children['protocol'] as any;
  const transport = protocol.children['transport'];
  assert.equal(transport.kind, 'choice');
  assert.deepEqual(Object.keys(transport.cases), ['tcp', 'udp']);
  assert.equal(transport.cases['tcp']['tcp-port'].type, 'number');
  assert.equal(transport.cases['tcp']['tls'].type, 'boolean');
  assert.equal(transport.cases['udp']['udp-port'].type, 'number');
});

test('active case is inline on the wire, nested with __case in the form', () => {
  const data = { 'ex:protocol': { name: 'p', 'tcp-port': 443, tls: true } };
  const form = toFormValue(data, model) as any;
  assert.equal(form.protocol.name, 'p');
  assert.deepEqual(form.protocol.transport, { __case: 'tcp', 'tcp-port': 443, tls: true });
});

test('choice round-trips byte-for-byte (each case)', () => {
  const tcp = { 'ex:protocol': { name: 'p', 'tcp-port': 443, tls: true } };
  assert.deepEqual(toYangData(toFormValue(tcp, model), model), tcp);

  const udp = { 'ex:protocol': { name: 'p', 'udp-port': 53 } };
  assert.deepEqual(toYangData(toFormValue(udp, model), model), udp);
});

test('switching the case emits only the new case fields inline', () => {
  const form = { protocol: { name: 'p', transport: { __case: 'udp', 'udp-port': 53 } } };
  assert.deepEqual(toYangData(form, model), { 'ex:protocol': { name: 'p', 'udp-port': 53 } });
});

test('an unselected choice contributes nothing to the value', () => {
  const data = { 'ex:protocol': { name: 'p' } };
  const form = toFormValue(data, model) as any;
  assert.equal(form.protocol.transport, undefined);
  assert.deepEqual(toYangData(form, model), data);
});
