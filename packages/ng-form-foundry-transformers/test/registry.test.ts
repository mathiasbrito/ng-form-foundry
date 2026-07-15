import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TransformerRegistry } from '../src/core/registry';
import { createYangTransformer } from '../src/transformers/yang/yang-transformer';
import { FakeEngine } from '../src/transformers/yang/engines/fake-engine';
import { toFormValue } from '../src/transformers/yang/revert';
import { exampleInterfacesModel, exampleConfigData } from './fixtures/example-interfaces';

const compileReq = {
  entryModule: 'example-interfaces',
  source: { kind: 'inline' as const, modules: {} },
};

function yangTransformer() {
  return createYangTransformer(new FakeEngine({ 'example-interfaces': exampleInterfacesModel }));
}

test('registry looks up a transformer by id and lists ids', () => {
  const registry = new TransformerRegistry().register(yangTransformer());
  assert.deepEqual(registry.ids(), ['yang']);
  assert.equal(registry.require('yang').id, 'yang');
  assert.equal(registry.get('nope'), undefined);
});

test('registry.require throws with the known ids when absent', () => {
  const registry = new TransformerRegistry().register(yangTransformer());
  assert.throws(() => registry.require('yaml'), /no transformer registered for 'yaml'.*yang/s);
});

test('registering a duplicate id throws', () => {
  const registry = new TransformerRegistry().register(yangTransformer());
  assert.throws(() => registry.register(yangTransformer()), /already registered/);
});

test('the yang transformer conforms to the contract: toSchema then toSource round-trips', async () => {
  const t = yangTransformer();
  const { schema, binding } = await t.toSchema(compileReq);
  assert.equal(schema.kind, 'nodeGroup');
  assert.equal(schema.root, true);

  // Reverting an edited form value produces RFC 7951 data (not the model source).
  const formValue = toFormValue(exampleConfigData, binding);
  const back = await t.toSource(formValue, binding);
  assert.deepEqual(back, exampleConfigData);
});
