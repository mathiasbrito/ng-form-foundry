import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormGroup } from '@angular/forms';

import { DynamicRecursiveFormComponent } from './dynamic-recursive-form.component';
import { NodeGroupListRendererComponent } from './node-group-list-renderer/node-group-list-renderer.component';
import { ConfigEditorComponent } from '../config-editor/config-editor.component';
import { buildFormFromSchema, serializeForm, setNodePresence } from '../core/dynamic-recursive-forms-builder';
import { NodeGroup, NodeType } from '../types/dynamic-recursive.types';

/**
 * Cross-renderer parity harness.
 *
 * The two ways to render a form — the standalone `nff-dynamic-recursive-form`
 * and the tree/detail `nff-config-editor` — MUST agree on schema-driven
 * behavior and output. They share the builder but each owns its mutation
 * affordances, which is exactly how they drifted before. Every assertion here
 * runs the SAME schema + logical action through BOTH renderers and expects the
 * same result, so a future one-sided change fails this spec.
 */
describe('renderer parity: standalone form vs config editor', () => {
  /** Mount the standalone form on a fresh form built from `schema` + `initial`. */
  function mountForm(schema: NodeGroup, initial?: Record<string, unknown>) {
    const fixture = TestBed.createComponent(DynamicRecursiveFormComponent);
    const form = buildFormFromSchema(schema, initial) as FormGroup;
    fixture.componentRef.setInput('schema', schema);
    fixture.componentRef.setInput('formGroup', form);
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();
    return { fixture, form };
  }

  /** Mount the config editor on a fresh form built from `schema` + `initial`. */
  function mountEditor(schema: NodeGroup, initial?: Record<string, unknown>) {
    const fixture = TestBed.createComponent(ConfigEditorComponent);
    const form = buildFormFromSchema(schema, initial) as FormGroup;
    fixture.componentRef.setInput('schema', schema);
    fixture.componentRef.setInput('formGroup', form);
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, form };
  }

  /** The standalone form's NodeGroupList renderer for the first list it renders. */
  function listRenderer(fixture: ComponentFixture<DynamicRecursiveFormComponent>): NodeGroupListRendererComponent {
    return fixture.debugElement.query(By.directive(NodeGroupListRendererComponent)).componentInstance;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DynamicRecursiveFormComponent, ConfigEditorComponent],
    }).compileComponents();
  });

  const listSchema = (bounds: { minItems?: number; maxItems?: number }): NodeGroup => ({
    kind: 'nodeGroup',
    name: 'root',
    root: true,
    children: {
      cells: {
        kind: 'nodeGroupList',
        name: 'cells',
        ...bounds,
        type: { kind: 'nodeGroup', name: 'cell', children: { id: { kind: 'leaf', type: 'number', name: 'id' } } },
      },
    },
  });

  it('both refuse to exceed maxItems — no add control renders, and the guard holds', () => {
    const schema = listSchema({ minItems: 1, maxItems: 1 });

    // Standalone: no add affordance renders in the list's DOM at the cap…
    const s = mountForm(schema, { cells: [{ id: 1 }] });
    const lr = listRenderer(s.fixture);
    expect(lr.canAdd).toBe(false);
    const listEl: HTMLElement = s.fixture.debugElement.query(By.directive(NodeGroupListRendererComponent)).nativeElement;
    expect(listEl.querySelector('.empty-add-button')).toBeNull();
    expect(listEl.querySelector('.add-button')).toBeNull();
    lr.addItem(); // …and the guard holds even if called directly.
    expect((s.form.get('cells') as any).length).toBe(1);

    // Config editor: the list-row / footer add is hidden at the cap…
    const e = mountEditor(schema, { cells: [{ id: 1 }] });
    const cells = e.component.root.children.find((c) => c.id === 'cells')!;
    expect(e.component['listAtMax'](cells)).toBe(true);
    expect(e.fixture.nativeElement.querySelector('.row-btn.add')).toBeNull();
    e.component.addItem(cells); // …and its guard holds too.
    expect((e.form.get('cells') as any).length).toBe(1);

    expect(serializeForm(schema, s.form)).toEqual(serializeForm(schema, e.form));
  });

  it('both can empty a list whose minItems is 0 (was: standalone floored at 1)', () => {
    const schema = listSchema({ minItems: 0 }); // maxItems unbounded

    const s = mountForm(schema, { cells: [{ id: 1 }] });
    const lr = listRenderer(s.fixture);
    lr.removeItem(0);
    expect((s.form.get('cells') as any).length).toBe(0);

    const e = mountEditor(schema, { cells: [{ id: 1 }] });
    const cells = e.component.root.children.find((c) => c.id === 'cells')!;
    e.component.removeItem(cells, cells.children[0]);
    expect((e.form.get('cells') as any).length).toBe(0);

    expect(serializeForm(schema, s.form)).toEqual(serializeForm(schema, e.form));
    expect(s.form.valid).toBe(e.form.valid);
  });

  it('both offer an add affordance for an empty list (was: standalone dead end)', () => {
    const schema = listSchema({}); // no bounds, starts empty

    const s = mountForm(schema, {});
    // The standalone shows a footer "Add … #1" button; find it and click.
    const addBtn = s.fixture.nativeElement.querySelector('.empty-add-button') as HTMLButtonElement | null;
    expect(addBtn).toBeTruthy();
    addBtn!.click();
    s.fixture.detectChanges();
    expect((s.form.get('cells') as any).length).toBe(1);

    const e = mountEditor(schema, {});
    const cells = e.component.root.children.find((c) => c.id === 'cells')!;
    expect(e.component['listAtMax'](cells)).toBe(false); // add available
    e.component.addItem(cells);
    expect((e.form.get('cells') as any).length).toBe(1);

    expect(serializeForm(schema, s.form)).toEqual(serializeForm(schema, e.form));
  });

  it('adding an item produces the same value through either renderer', () => {
    const schema = listSchema({});
    const s = mountForm(schema, { cells: [{ id: 1 }] });
    listRenderer(s.fixture).addItem();
    const e = mountEditor(schema, { cells: [{ id: 1 }] });
    e.component.addItem(e.component.root.children.find((c) => c.id === 'cells')!);
    expect(serializeForm(schema, s.form)).toEqual(serializeForm(schema, e.form));
  });

  it('materializing a presence child through each renderer produces the same value and validity', () => {
    const schema: NodeGroup = {
      kind: 'nodeGroup',
      name: 'root',
      root: true,
      children: {
        host: { kind: 'leaf', type: 'string', name: 'host' },
        note: { kind: 'leaf', type: 'string', name: 'note', presence: true },
      },
    };
    const noteLeaf: NodeType = schema.children['note'];

    // Standalone: materialize through the form component's own toggle.
    const s = mountForm(schema, { host: 'h' });
    expect(s.form.contains('note')).toBe(false);
    s.fixture.componentInstance.toggleNodePresence('note', noteLeaf, true);

    // Config editor: materialize through the tree's "+ Optional field" path.
    const e = mountEditor(schema, { host: 'h' });
    const entry = e.component.root.optionals!.find((o) => o.key === 'note')!;
    e.component.addOptional(e.component.root, entry);

    expect(serializeForm(schema, s.form)).toEqual(serializeForm(schema, e.form));
    expect(s.form.valid).toBe(e.form.valid); // both required-empty → both invalid
    expect(s.form.get('note')!.hasError('required')).toBe(true);
    // De-materializing (cancel path) drops the key in both.
    s.fixture.componentInstance.toggleNodePresence('note', noteLeaf, false);
    expect(setNodePresence(e.form, noteLeaf, 'note', false)).toBe(true);
    expect(serializeForm(schema, s.form)).toEqual(serializeForm(schema, e.form));
  });

  it('an absent presence list stays out of the value in both renderers, and materializes identically', () => {
    const schema: NodeGroup = {
      kind: 'nodeGroup',
      name: 'root',
      root: true,
      children: {
        host: { kind: 'leaf', type: 'string', name: 'host' },
        addrs: { kind: 'leafList', type: 'string', name: 'addrs', presence: true },
      },
    };
    const addrsList: NodeType = schema.children['addrs'];

    // Absent from the seed ⇒ not built ⇒ absent from the value in BOTH.
    const s = mountForm(schema, { host: 'h' });
    const e = mountEditor(schema, { host: 'h' });
    expect(s.form.contains('addrs')).toBe(false);
    expect(e.form.contains('addrs')).toBe(false);
    expect(serializeForm(schema, s.form)).toEqual({ host: 'h' });
    expect(serializeForm(schema, s.form)).toEqual(serializeForm(schema, e.form));

    // Materialize through each renderer's own presence path.
    s.fixture.componentInstance.toggleNodePresence('addrs', addrsList, true);
    const entry = e.component.root.optionals!.find((o) => o.key === 'addrs')!;
    e.component.addOptional(e.component.root, entry);

    // Both now carry an (empty) list, and serialize it identically.
    expect(s.form.contains('addrs')).toBe(true);
    expect(e.form.contains('addrs')).toBe(true);
    expect(serializeForm(schema, s.form)).toEqual({ host: 'h', addrs: [] });
    expect(serializeForm(schema, s.form)).toEqual(serializeForm(schema, e.form));

    // De-materializing drops the key again in both.
    s.fixture.componentInstance.toggleNodePresence('addrs', addrsList, false);
    expect(setNodePresence(e.form, addrsList, 'addrs', false)).toBe(true);
    expect(serializeForm(schema, s.form)).toEqual(serializeForm(schema, e.form));
    expect(serializeForm(schema, s.form)).toEqual({ host: 'h' });
  });
});
