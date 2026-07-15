import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YangFormAdapter } from '../src/transformers/yang/adapter';
import { FakeEngine } from '../src/transformers/yang/engines/fake-engine';
import { CompileRequest } from '../src/transformers/yang/engine';
import { exampleInterfacesModel, exampleConfigData } from './fixtures/example-interfaces';

const compileOpts = {
  modelId: 'm1',
  entryModule: 'example-interfaces',
  source: { kind: 'inline' as const, modules: {} },
};

function makeAdapter(): YangFormAdapter {
  return new YangFormAdapter(new FakeEngine({ 'example-interfaces': exampleInterfacesModel }));
}

test('compile maps the model to a renderable NodeGroup schema', async () => {
  const { schema } = await makeAdapter().compile(compileOpts);
  assert.equal(schema.kind, 'nodeGroup');
  assert.equal(schema.root, true);

  const interfaces = schema.children['interfaces'] as any;
  assert.equal(interfaces.kind, 'nodeGroup');

  const iface = interfaces.children['interface'];
  assert.equal(iface.kind, 'nodeGroupList');

  const fields = iface.type.children;
  assert.equal(fields['mtu'].type, 'number');
  assert.equal(fields['byte-count'].type, 'string'); // uint64 -> string
  assert.equal(fields['oper-status'].type, 'enum');
  assert.deepEqual(fields['oper-status'].enum, ['up', 'down', 'testing']);
  assert.equal(fields['name'].required, true);
});

test('getFormSchema returns only the schema; the adapter round-trips data', async () => {
  const adapter = makeAdapter();
  await adapter.compile(compileOpts);

  const schema = await adapter.getFormSchema('m1');
  assert.equal(schema.name, '__root__');

  const form = await adapter.toFormValue(exampleConfigData, 'm1');
  const back = await adapter.toYangData(form, 'm1');
  assert.deepEqual(back, exampleConfigData);
});

test('compile caches by modelId (engine.resolve called once)', async () => {
  let calls = 0;
  const engine = new FakeEngine({ 'example-interfaces': exampleInterfacesModel });
  const original = engine.resolve.bind(engine);
  engine.resolve = (req: CompileRequest) => {
    calls++;
    return original(req);
  };

  const adapter = new YangFormAdapter(engine);
  await adapter.compile(compileOpts);
  await adapter.compile(compileOpts);
  assert.equal(calls, 1);
});

test('operating on an uncompiled model id throws', async () => {
  await assert.rejects(() => makeAdapter().getFormSchema('missing'), /not compiled/);
});
