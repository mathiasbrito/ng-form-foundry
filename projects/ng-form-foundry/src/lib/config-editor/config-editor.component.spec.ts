import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfigEditorComponent } from './config-editor.component';
import { buildFormFromSchema } from '../core/dynamic-recursive-forms-builder';
import { NodeGroup } from '../types/dynamic-recursive.types';

describe('ConfigEditorComponent', () => {
  let component: ConfigEditorComponent;
  let fixture: ComponentFixture<ConfigEditorComponent>;

  const schema: NodeGroup = {
    kind: 'nodeGroup',
    name: 'device',
    root: true,
    children: {
      hostname: { kind: 'leaf', type: 'string', name: 'hostname' },
      system: {
        kind: 'nodeGroup',
        name: 'system',
        children: { tz: { kind: 'leaf', type: 'string', name: 'tz' } },
      },
      ifaces: {
        kind: 'nodeGroupList',
        name: 'ifaces',
        type: { kind: 'nodeGroup', name: 'iface', children: { nm: { kind: 'leaf', type: 'string', name: 'nm' } } },
      },
    },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ConfigEditorComponent] }).compileComponents();
    fixture = TestBed.createComponent(ConfigEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('schema', schema);
    fixture.componentRef.setInput(
      'formGroup',
      buildFormFromSchema(schema, { ifaces: [{ nm: 'eth0' }, { nm: 'eth1' }] }),
    );
    fixture.detectChanges();
  });

  it('builds the tree and selects the root with its own leaves', () => {
    expect(component.selected).toBe(component.root);
    expect(component.root.leaves.map((l) => l.key)).toEqual(['hostname']);
    expect(component.root.children.map((c) => c.label)).toEqual(['system', 'ifaces']);
  });

  it('expands a nodeGroupList into one tree node per item', () => {
    const list = component.root.children.find((c) => c.label === 'ifaces')!;
    expect(list.children.length).toBe(2);
    expect(list.leaves.length).toBe(0); // the list node itself has no editable leaves
  });

  it('selecting a group node shows that group\'s leaves', () => {
    const system = component.root.children.find((c) => c.label === 'system')!;
    component.select(system);
    expect(component.selected).toBe(system);
    expect(system.leaves.map((l) => l.key)).toEqual(['tz']);
  });
});
