import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toFormValue, toYangData } from '../src/revert';
import {
  exampleInterfacesModel,
  exampleConfigData,
  exampleDataWithState,
} from './fixtures/example-interfaces';

test('config data round-trips byte-for-byte', () => {
  const form = toFormValue(exampleConfigData, exampleInterfacesModel);
  const back = toYangData(form, exampleInterfacesModel);
  assert.deepEqual(back, exampleConfigData);
});

test('uint64 keeps full precision (stays a string end to end)', () => {
  const form = toFormValue(exampleConfigData, exampleInterfacesModel) as any;
  const first = form.interfaces.interface[0];
  assert.equal(first['byte-count'], '18446744073709551615');
  assert.equal(typeof first['byte-count'], 'string');
});

test('top-level member is namespace-qualified; children are bare', () => {
  const back = toYangData(
    toFormValue(exampleConfigData, exampleInterfacesModel),
    exampleInterfacesModel,
  ) as any;
  assert.ok('example-interfaces:interfaces' in back);
  const iface = back['example-interfaces:interfaces'].interface[0];
  assert.ok('name' in iface);
  assert.ok(!('example-interfaces:name' in iface));
});

test('config false state is shown on decode but dropped on write-back', () => {
  const form = toFormValue(exampleDataWithState, exampleInterfacesModel) as any;
  assert.equal(form.interfaces.interface[0]['oper-status'], 'down');

  const back = toYangData(form, exampleInterfacesModel) as any;
  const outIface = back['example-interfaces:interfaces'].interface[0];
  assert.ok(!('oper-status' in outIface));
});

test('list keys are ordinary members of every entry', () => {
  const form = toFormValue(exampleConfigData, exampleInterfacesModel) as any;
  assert.equal(form.interfaces.interface.length, 2);
  assert.equal(form.interfaces.interface[1].name, 'eth1');
});
