import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapToSchema } from '../src/transformers/yang/mapper';
import { toFormValue, toYangData } from '../src/transformers/yang/revert';
import { exampleTypesModel, exampleTypesData } from './fixtures/example-types';

test('maps the neglected leaf types to the right form controls', () => {
  const schema = mapToSchema(exampleTypesModel);
  const config = schema.children['config'] as any;
  const f = config.children;

  // identityref -> enum with the derived identity names as options
  assert.equal(f['mode'].type, 'enum');
  assert.deepEqual(f['mode'].enum, ['fast', 'turbo']);

  // empty -> boolean checkbox
  assert.equal(f['trigger'].type, 'boolean');

  // bits -> a group of boolean checkboxes, one per flag
  assert.equal(f['flags'].kind, 'nodeGroup');
  assert.deepEqual(Object.keys(f['flags'].children), ['alpha', 'beta', 'gamma']);
  assert.equal(f['flags'].children['beta'].type, 'boolean');

  // union / binary -> text; uint64 -> text (precision-safe)
  assert.equal(f['label'].type, 'string');
  assert.equal(f['cert'].type, 'string');
  assert.equal(f['big'].type, 'string');
});

test('neglected types round-trip byte-for-byte', () => {
  const form = toFormValue(exampleTypesData, exampleTypesModel);
  const back = toYangData(form, exampleTypesModel);
  assert.deepEqual(back, exampleTypesData);
});

test('decoded form shapes match the rendered controls', () => {
  const form = toFormValue(exampleTypesData, exampleTypesModel) as any;
  const c = form.config;
  assert.equal(c.mode, 'turbo'); // bare identity name for the dropdown
  assert.equal(c.trigger, true); // empty present -> checked
  assert.deepEqual(c.flags, { alpha: true, beta: false, gamma: true }); // bits group
  assert.equal(c.big, '18446744073709551615'); // uint64 stays a string
});

test('empty leaf: false/absent is omitted, true encodes as [null]', () => {
  const form = toFormValue(exampleTypesData, exampleTypesModel) as any;

  form.config.trigger = false;
  const off = toYangData(form, exampleTypesModel) as any;
  assert.ok(!('trigger' in off['example-types:config']));

  form.config.trigger = true;
  const on = toYangData(form, exampleTypesModel) as any;
  assert.deepEqual(on['example-types:config'].trigger, [null]);
});

test('bits: only the checked flags are emitted, in schema order', () => {
  const form = toFormValue(exampleTypesData, exampleTypesModel) as any;
  form.config.flags = { alpha: false, beta: true, gamma: true };
  const back = toYangData(form, exampleTypesModel) as any;
  assert.equal(back['example-types:config'].flags, 'beta gamma');
});

test('cross-module identityref is re-qualified; same-module stays bare', () => {
  const form = toFormValue(exampleTypesData, exampleTypesModel) as any;
  assert.equal(
    (toYangData(form, exampleTypesModel) as any)['example-types:config'].mode,
    'other-mod:turbo',
  );

  form.config.mode = 'fast'; // defined in this module
  assert.equal(
    (toYangData(form, exampleTypesModel) as any)['example-types:config'].mode,
    'fast',
  );
});
