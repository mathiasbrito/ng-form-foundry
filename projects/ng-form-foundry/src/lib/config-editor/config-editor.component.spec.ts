import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormArray, FormGroup } from '@angular/forms';

import { ConfigEditorComponent } from './config-editor.component';
import { buildFormFromSchema, switchChoiceCase } from '../core/dynamic-recursive-forms-builder';
import { CASE_KEY, NodeChoice, NodeGroup } from '../types/dynamic-recursive.types';

describe('ConfigEditorComponent', () => {
  let component: ConfigEditorComponent;
  let fixture: ComponentFixture<ConfigEditorComponent>;
  let form: FormGroup;

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
      optional: {
        kind: 'nodeGroup',
        name: 'optional',
        presence: true,
        children: { flag: { kind: 'leaf', type: 'boolean', name: 'flag' } },
      },
      note: { kind: 'leaf', type: 'string', name: 'note', presence: true },
      tags: {
        kind: 'map',
        name: 'tags',
        presence: true,
        value: { kind: 'leaf', type: 'string', name: 'value' },
      },
      mode: {
        kind: 'choice',
        name: 'mode',
        presence: true,
        cases: {
          a: { x: { kind: 'leaf', type: 'string', name: 'x' } },
          b: { y: { kind: 'leaf', type: 'string', name: 'y' } },
        },
      },
      scope: {
        kind: 'choice',
        name: 'scope',
        caseLabels: { byNode: 'By node', byZone: 'By zone' },
        cases: {
          byNode: {
            nodeId: { kind: 'leaf', type: 'string', name: 'nodeId' },
            ports: { kind: 'map', name: 'ports', value: { kind: 'leaf', type: 'string', name: 'value' } },
          },
          // A leaf-bodied case: normalized to a one-field record by caseFields.
          byZone: { kind: 'leaf', type: 'string', name: 'zoneId' },
        },
      },
      labels: {
        kind: 'map',
        name: 'labels',
        value: { kind: 'leaf', type: 'string', name: 'value' },
      },
      servers: {
        kind: 'map',
        name: 'servers',
        keyPattern: '^[a-z][a-z0-9]*$',
        minEntries: 1,
        maxEntries: 3,
        value: {
          kind: 'nodeGroup',
          name: 'server',
          children: { url: { kind: 'leaf', type: 'string', name: 'url' } },
        },
      },
    },
  };

  /** Re-fetch a direct child of the root by its stable path id (nodes are rebuilt on structural change). */
  function node(id: string) {
    return component.root.children.find((c) => c.id === id)!;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ConfigEditorComponent] }).compileComponents();
    fixture = TestBed.createComponent(ConfigEditorComponent);
    component = fixture.componentInstance;
    form = buildFormFromSchema(schema, {
      ifaces: [{ nm: 'eth0' }, { nm: 'eth1' }],
      scope: { nodeId: 'n1' },
      labels: { env: 'prod' },
      servers: { s1: { url: 'http://a' } },
    });
    fixture.componentRef.setInput('schema', schema);
    fixture.componentRef.setInput('formGroup', form);
    fixture.detectChanges();
  });

  // --- structure -------------------------------------------------------------

  it('builds the tree with path ids and selects the root', () => {
    expect(component.selected).toBe(component.root);
    expect(component.root.children.map((c) => c.id)).toEqual(['system', 'ifaces', 'scope', 'labels', 'servers']);
  });

  it('expands a nodeGroupList into one tree node per item, ids by index', () => {
    const list = node('ifaces');
    expect(list.children.map((c) => c.id)).toEqual(['ifaces/0', 'ifaces/1']);
    expect(list.children.map((c) => c.label)).toEqual(['#1', '#2']);
  });

  it('selecting a node flattens its subtree into breadcrumb-separated sections, pre-order', () => {
    // Root selection: one section per node, the selected node first.
    expect(component.sections.map((s) => s.node.id)).toEqual([
      '', 'system', 'ifaces', 'ifaces/0', 'ifaces/1', 'scope', 'scope/ports', 'labels', 'servers', 'servers/s1',
    ]);
    // Section trails run from the selected node to the section's node.
    expect(component.sections[3].trail.map((n) => n.label)).toEqual(['device', 'ifaces', '#1']);

    const system = node('system');
    component.select(system);
    expect(component.sections.length).toBe(1);
    expect(component.sections[0].group).toBe(form.get('system') as FormGroup);
    // The section schema is a flattened leaf-only slice: no nested section chrome.
    expect(component.sections[0].schema!.appearance?.flatten).toBe(true);
    expect(Object.keys(component.sections[0].schema!.children)).toEqual(['tz']);
  });

  it('selecting a node with children expands it in the tree', () => {
    const list = node('ifaces');
    expect(component.expanded.has(list.id)).toBe(false);
    component.select(list);
    expect(component.expanded.has(list.id)).toBe(true);
  });

  it('pathTo returns the root-to-node breadcrumb path', () => {
    const item = node('ifaces').children[0];
    expect(component.pathTo(component.root).map((n) => n.label)).toEqual(['device']);
    expect(component.pathTo(item).map((n) => n.label)).toEqual(['device', 'ifaces', '#1']);
  });

  it('renders the subtree content flat: no section links, no expansion panels, breadcrumb headings between children', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.detail nff-dynamic-recursive-form')).toBeTruthy();
    expect(el.querySelector('.child-links')).toBeNull();
    expect(el.querySelector('.detail mat-expansion-panel')).toBeNull();
    const headings = [...el.querySelectorAll<HTMLElement>('.detail .section-heading')];
    expect(headings.length).toBe(component.sections.length - 1); // every section but the first
    expect(headings[0].textContent!.replace(/\s+/g, '').trim()).toBe('device/system');
  });

  it('switchTreeCase swaps the case from the detail selector and re-syncs the sections', () => {
    component.switchTreeCase(node('scope'), 'byZone');
    expect((form.get('scope') as FormGroup).get(CASE_KEY)!.value).toBe('byZone');
    expect(component.selected!.id).toBe('scope');
    // The zoneId leaf renders in the choice's own section; the ports child section is gone.
    expect(component.sections.some((s) => s.node.id === 'scope/ports')).toBe(false);
  });

  // --- lists -----------------------------------------------------------------

  it('addItem appends to the FormArray, rebuilds the tree, and selects the new item', () => {
    const array = form.get('ifaces') as FormArray;

    component.addItem(node('ifaces'));

    expect(array.length).toBe(3);
    expect(node('ifaces').children.length).toBe(3);
    expect(component.selected!.id).toBe('ifaces/2');
  });

  it('removeItem removes from the FormArray and renumbers the remaining items', () => {
    const array = form.get('ifaces') as FormArray;
    const list = node('ifaces');

    component.removeItem(list, list.children[0]);

    expect(array.length).toBe(1);
    expect(node('ifaces').children.map((c) => c.label)).toEqual(['#1']);
    expect(component.selected!.id).toBe('ifaces');
  });

  // --- optionals -------------------------------------------------------------

  it('collects absent optional children in the menu, not the tree, with no controls built', () => {
    expect(component.root.optionals!.map((o) => o.key)).toEqual(['optional', 'note', 'tags', 'mode']);
    expect(component.root.children.some((c) => c.id === 'optional')).toBe(false);
    for (const key of ['optional', 'note', 'tags', 'mode']) {
      expect(form.get(key)).withContext(key).toBeNull();
    }
  });

  it('addOptional on a group builds its control, adds a removable node, and selects it', () => {
    const entry = component.root.optionals!.find((o) => o.key === 'optional')!;

    component.addOptional(component.root, entry);

    expect(form.get('optional')).toBeInstanceOf(FormGroup);
    expect(component.selected!.id).toBe('optional');
    expect(component.selected!.presenceRemovable!.key).toBe('optional');
    expect(component.root.optionals!.some((o) => o.key === 'optional')).toBe(false);
  });

  it('removeOptional drops the control and returns the entry to the menu in schema order', () => {
    component.addOptional(component.root, component.root.optionals!.find((o) => o.key === 'note')!);
    component.addOptional(component.root, component.root.optionals!.find((o) => o.key === 'optional')!);

    component.removeOptional(component.root, node('optional'));

    expect(form.get('optional')).toBeNull();
    expect('optional' in form.getRawValue()).toBe(false);
    // Rebuilt from the schema iteration, so the returned entry sits in schema order.
    expect(component.root.optionals!.map((o) => o.key)).toEqual(['optional', 'tags', 'mode']);
    expect(component.selected).toBe(component.root);
  });

  it('addOptional on a leaf builds its control and keeps the parent selected (leaves render in the detail form)', () => {
    const entry = component.root.optionals!.find((o) => o.key === 'note')!;

    component.addOptional(component.root, entry);

    expect(form.get('note')).toBeTruthy();
    expect(component.selected).toBe(component.root);
    expect(component.root.optionals!.some((o) => o.key === 'note')).toBe(false);
  });

  it('addOptional on a leaf focuses its field in the detail form, like the form add button does', fakeAsync(() => {
    const entry = component.root.optionals!.find((o) => o.key === 'note')!;

    component.addOptional(component.root, entry);
    fixture.detectChanges();
    tick(); // the leaf renderer defers its focus out of the change-detection pass

    const el: HTMLElement = fixture.nativeElement;
    const noteField = [...el.querySelectorAll('.detail mat-form-field')].find((f) =>
      f.querySelector('mat-label')?.textContent?.includes('note'),
    )!;
    expect(document.activeElement).toBe(noteField.querySelector('input'));
  }));

  it('addOptional on a map and a choice builds their nodes', () => {
    component.addOptional(component.root, component.root.optionals!.find((o) => o.key === 'tags')!);
    expect(node('tags').map!.complex).toBe(false);

    component.addOptional(component.root, component.root.optionals!.find((o) => o.key === 'mode')!);
    expect(node('mode').choice).toBeTruthy();
    expect(component.activeCase(node('mode'))).toBeNull();
  });

  // --- choice ----------------------------------------------------------------

  it('builds a choice node from the inferred active case, with case labels and complex case fields as children', () => {
    const scope = node('scope');
    expect(component.activeCase(scope)).toBe('byNode');
    expect(component.activeCaseLabel(scope)).toBe('By node');
    expect(scope.children.map((c) => c.id)).toEqual(['scope/ports']);
  });

  it('a case switch through the form group syncs the tree in place', () => {
    switchChoiceCase(form.get('scope') as FormGroup, schema.children['scope'] as NodeChoice, 'byZone');

    const scope = node('scope');
    expect((form.get('scope') as FormGroup).get(CASE_KEY)!.value).toBe('byZone');
    expect((form.get('scope') as FormGroup).get('nodeId')).toBeNull();
    expect(component.activeCaseLabel(scope)).toBe('By zone');
    expect(scope.children.length).toBe(0); // the leaf-bodied case has no complex fields
  });

  // --- maps ------------------------------------------------------------------

  it('builds a leaf-valued map as a childless node and a complex map with entry children keyed by path', () => {
    expect(node('labels').map!.complex).toBe(false);
    expect(node('labels').children.length).toBe(0);
    expect(node('servers').children.map((c) => c.id)).toEqual(['servers/s1']);
    expect(node('servers').children[0].mapEntry!.key).toBe('s1');
  });

  it('addTreeMapEntry appends under a unique key and stops at maxEntries', () => {
    const group = form.get('servers') as FormGroup;

    component.addTreeMapEntry(node('servers'));
    component.addTreeMapEntry(node('servers'));

    expect(Object.keys(group.controls).length).toBe(3);
    expect(component.selected!.mapEntry).toBeTruthy();

    component.addTreeMapEntry(node('servers')); // at maxEntries: 3
    expect(Object.keys(group.controls).length).toBe(3);
  });

  it('removeTreeMapEntry removes an entry but not below minEntries', () => {
    const group = form.get('servers') as FormGroup;
    const servers = node('servers');

    component.removeTreeMapEntry(servers, servers.children[0]); // at minEntries: 1
    expect(group.get('s1')).toBeTruthy();

    component.addTreeMapEntry(node('servers'));
    component.removeTreeMapEntry(node('servers'), node('servers').children[1]);
    expect(Object.keys(group.controls)).toEqual(['s1']);
  });

  it('renameTreeMapEntry renames the control preserving its value and re-selects the entry', () => {
    const group = form.get('servers') as FormGroup;
    const control = group.get('s1');

    component.renameTreeMapEntry(node('servers').children[0], 'web1');

    expect(group.get('s1')).toBeNull();
    expect(group.get('web1')).toBe(control);
    expect(node('servers').children[0].label).toBe('web1');
    expect(component.selected!.id).toBe('servers/web1');
  });

  it('renameTreeMapEntry ignores an empty, duplicate, or pattern-violating key', () => {
    component.addTreeMapEntry(node('servers')); // adds 'key2'
    const entry = node('servers').children[0];

    component.renameTreeMapEntry(entry, '');
    component.renameTreeMapEntry(entry, 'key2'); // duplicate
    component.renameTreeMapEntry(entry, '1bad'); // violates ^[a-z][a-z0-9]*$

    expect((form.get('servers') as FormGroup).get('s1')).toBeTruthy();
    expect(node('servers').children[0].label).toBe('s1');
  });

  // --- structural sync -------------------------------------------------------

  it('reflects structural changes made directly on the form (as the embedded detail form does)', () => {
    const system = node('system');
    component.select(system);
    expect(component.expanded.has('ifaces')).toBe(false);
    component.expanded.add('ifaces');

    // Simulate an embedded-form mutation: drop the selected group.
    form.removeControl('system');

    expect(component.root.children.some((c) => c.id === 'system')).toBe(false);
    // Selection falls back to the closest surviving ancestor; expansion is path-keyed and survives.
    expect(component.selected).toBe(component.root);
    expect(component.expanded.has('ifaces')).toBe(true);
  });

  it('value edits do not rebuild the tree', () => {
    const before = node('system');
    form.get('hostname')!.setValue('core-2');
    expect(node('system')).toBe(before); // same node object: no rebuild happened
  });

  it('a removed deep selection falls back to its closest surviving ancestor, not the root', () => {
    const entry = node('servers').children[0]; // servers/s1
    component.select(entry);

    (form.get('servers') as FormGroup).removeControl('s1');

    expect(component.selected!.id).toBe('servers');
  });

  it('swapping the formGroup input rebinds the editor to the new document', () => {
    const replacement: FormGroup = buildFormFromSchema(schema, { ifaces: [{ nm: 'swap0' }] });
    fixture.componentRef.setInput('formGroup', replacement);
    fixture.detectChanges();

    expect(component.selected).toBe(component.root);
    expect(node('ifaces').children.length).toBe(1);

    // The new group drives the tree; the old one is detached.
    replacement.removeControl('system');
    expect(component.root.children.some((c) => c.id === 'system')).toBe(false);
    form.removeControl('labels');
    expect(component.root.children.some((c) => c.id === 'labels')).toBe(true);
  });

  // --- rendering -------------------------------------------------------------

  it('renders the "+ Optional field" row after the children, and hides it when not editable', () => {
    fixture.detectChanges();
    const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.tree .tree-row');
    expect(rows[rows.length - 1].classList).toContain('optional-row');

    fixture.componentRef.setInput('editable', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.optional-row')).toBeNull();
  });

  it('draws no border box around the tree (the divider is the only chrome)', () => {
    const tree: HTMLElement = fixture.nativeElement.querySelector('.tree');
    const style = getComputedStyle(tree);
    expect(style.borderLeftStyle).toBe('none');
    expect(style.borderTopStyle).toBe('none');
    expect(style.borderRightStyle).toBe('solid'); // the tree/detail divider
  });
});

describe('ConfigEditorComponent with dotted map keys', () => {
  // Map entry keys are arbitrary runtime data ('10.0.0.1', 'web.example.com');
  // they must be treated as verbatim control names, never as the dot-delimited
  // paths AbstractControl.get() parses.
  const schema: NodeGroup = {
    kind: 'nodeGroup',
    name: 'net',
    root: true,
    children: {
      endpoints: {
        kind: 'map',
        name: 'endpoints',
        value: {
          kind: 'nodeGroup',
          name: 'endpoint',
          children: { url: { kind: 'leaf', type: 'string', name: 'url' } },
        },
      },
    },
  };

  let component: ConfigEditorComponent;
  let fixture: ComponentFixture<ConfigEditorComponent>;
  let form: FormGroup;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ConfigEditorComponent] }).compileComponents();
    fixture = TestBed.createComponent(ConfigEditorComponent);
    component = fixture.componentInstance;
    form = buildFormFromSchema(schema, { endpoints: { '10.0.0.1': { url: 'http://edge' } } });
    fixture.componentRef.setInput('schema', schema);
    fixture.componentRef.setInput('formGroup', form);
    fixture.detectChanges();
  });

  it('builds a tree node and detail section for a dotted-key entry instead of silently dropping it', () => {
    const endpoints = component.root.children.find((c) => c.id === 'endpoints')!;
    expect(endpoints.children.map((c) => c.label)).toEqual(['10.0.0.1']);
    component.select(endpoints.children[0]);
    expect(component.sections[0].group).toBe((form.get('endpoints') as FormGroup).controls['10.0.0.1'] as FormGroup);
  });

  it('renames a dotted-key entry, preserving its value', () => {
    const endpoints = component.root.children.find((c) => c.id === 'endpoints')!;
    component.renameTreeMapEntry(endpoints.children[0], 'gateway.local');

    const group = form.get('endpoints') as FormGroup;
    expect(group.contains('10.0.0.1')).toBe(false);
    expect((group.controls['gateway.local'] as FormGroup).getRawValue()).toEqual({ url: 'http://edge' });
    expect(component.root.children.find((c) => c.id === 'endpoints')!.children[0].label).toBe('gateway.local');
  });
});
