import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormArray, FormGroup } from '@angular/forms';

import { ConfigEditorComponent } from './config-editor.component';
import { buildFormFromSchema } from '../core/dynamic-recursive-forms-builder';
import { CASE_KEY, NodeGroup } from '../types/dynamic-recursive.types';

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

  it('builds the tree and selects the root with its own leaves', () => {
    expect(component.selected).toBe(component.root);
    expect(component.root.leaves.map((l) => l.key)).toEqual(['hostname']);
    expect(component.root.children.map((c) => c.label)).toEqual(['system', 'ifaces', 'scope', 'labels', 'servers']);
  });

  it('expands a nodeGroupList into one tree node per item', () => {
    const list = component.root.children.find((c) => c.label === 'ifaces')!;
    expect(list.children.length).toBe(2);
    expect(list.leaves.length).toBe(0); // the list node itself has no editable leaves
  });

  it("selecting a group node shows that group's leaves", () => {
    const system = component.root.children.find((c) => c.label === 'system')!;
    component.select(system);
    expect(component.selected).toBe(system);
    expect(system.leaves.map((l) => l.key)).toEqual(['tz']);
  });

  it('selecting a node with children expands it in the tree', () => {
    const list = component.root.children.find((c) => c.label === 'ifaces')!;
    expect(component.expanded.has(list.id)).toBe(false);
    component.select(list);
    expect(component.expanded.has(list.id)).toBe(true);
  });

  it('pathTo returns the root-to-node breadcrumb path', () => {
    const list = component.root.children.find((c) => c.label === 'ifaces')!;
    const item = list.children[0];
    expect(component.pathTo(component.root).map((n) => n.label)).toEqual(['device']);
    expect(component.pathTo(item).map((n) => n.label)).toEqual(['device', 'ifaces', '#1']);
  });

  it('open selects a child and keeps its parent expanded', () => {
    const list = component.root.children.find((c) => c.label === 'ifaces')!;
    const first = list.children[0];

    component.open(list, first);

    expect(component.selected).toBe(first);
    expect(component.expanded.has(list.id)).toBe(true);
  });

  // --- lists -----------------------------------------------------------------

  it('addItem appends to the FormArray and the tree and selects the new item', () => {
    const list = component.root.children.find((c) => c.label === 'ifaces')!;
    const array = form.get('ifaces') as FormArray;
    expect(array.length).toBe(2);

    component.addItem(list);

    expect(array.length).toBe(3);
    expect(list.children.length).toBe(3);
    expect(component.selected).toBe(list.children[2]);
    expect(component.selected!.leaves.map((l) => l.key)).toEqual(['nm']);
  });

  it('removeItem removes from the FormArray and re-indexes the remaining items', () => {
    const list = component.root.children.find((c) => c.label === 'ifaces')!;
    const array = form.get('ifaces') as FormArray;

    component.removeItem(list, list.children[0]);

    expect(array.length).toBe(1);
    expect(list.children.length).toBe(1);
    expect(list.children[0].removable!.index).toBe(0);
    expect(list.children[0].label).toBe('#1');
  });

  // --- optionals -------------------------------------------------------------

  it('collects absent optional children in the menu, not the tree, with no controls built', () => {
    expect(component.root.optionals!.map((o) => o.key)).toEqual(['optional', 'note', 'tags', 'mode']);
    expect(component.root.children.some((c) => c.label === 'optional')).toBe(false);
    expect(component.root.leaves.some((l) => l.key === 'note')).toBe(false);
    for (const key of ['optional', 'note', 'tags', 'mode']) {
      expect(form.get(key)).withContext(key).toBeNull();
    }
  });

  it('addOptional on a group builds its control, appends a removable node, and selects it', () => {
    const entry = component.root.optionals!.find((o) => o.key === 'optional')!;

    component.addOptional(component.root, entry);

    expect(form.get('optional')).toBeInstanceOf(FormGroup);
    const node = component.root.children[component.root.children.length - 1];
    expect(node.label).toBe('optional');
    expect(node.presenceRemovable!.entry).toBe(entry);
    expect(node.leaves.map((l) => l.key)).toEqual(['flag']);
    expect(component.selected).toBe(node);
    expect(component.expanded.has(component.root.id)).toBe(true);
    expect(component.root.optionals!.some((o) => o.key === 'optional')).toBe(false);
  });

  it('removeOptional drops the control and returns the entry to the menu in schema order', () => {
    const entry = component.root.optionals!.find((o) => o.key === 'note')!;
    component.addOptional(component.root, entry);
    const optEntry = component.root.optionals!.find((o) => o.key === 'optional')!;
    component.addOptional(component.root, optEntry);
    const node = component.root.children[component.root.children.length - 1];

    component.removeOptional(component.root, node);

    expect(form.get('optional')).toBeNull();
    expect('optional' in form.getRawValue()).toBe(false);
    expect(component.root.children.some((c) => c.label === 'optional')).toBe(false);
    // Re-inserted before 'tags'/'mode' (schema order), not appended.
    expect(component.root.optionals!.map((o) => o.key)).toEqual(['optional', 'tags', 'mode']);
    expect(component.selected).toBe(component.root);
  });

  it('optional leaves flow through the detail pane: added to leaves, removed back to the menu', () => {
    const entry = component.root.optionals!.find((o) => o.key === 'note')!;

    component.addOptional(component.root, entry);

    expect(form.get('note')).toBeTruthy();
    const leaf = component.root.leaves.find((l) => l.key === 'note')!;
    expect(leaf.optional).toBe(entry);
    expect(component.selected).toBe(component.root);

    component.removeOptionalLeaf(component.root, leaf);

    expect(form.get('note')).toBeNull();
    expect('note' in form.getRawValue()).toBe(false);
    expect(component.root.leaves.some((l) => l.key === 'note')).toBe(false);
    expect(component.root.optionals!.map((o) => o.key)).toEqual(['optional', 'note', 'tags', 'mode']);
  });

  it('addOptional on a map builds an empty map node', () => {
    const entry = component.root.optionals!.find((o) => o.key === 'tags')!;

    component.addOptional(component.root, entry);

    const node = component.root.children[component.root.children.length - 1];
    expect(node.map).toBeTruthy();
    expect(node.map!.complex).toBe(false);
    expect(form.get('tags')).toBeInstanceOf(FormGroup);
    expect(Object.keys((form.get('tags') as FormGroup).controls)).toEqual([]);
  });

  it('addOptional on a choice builds a case-less choice node', () => {
    const entry = component.root.optionals!.find((o) => o.key === 'mode')!;

    component.addOptional(component.root, entry);

    const node = component.root.children[component.root.children.length - 1];
    expect(node.choice).toBeTruthy();
    expect(component.activeCase(node)).toBeNull();
    expect(node.leaves.length).toBe(0);

    component.switchTreeCase(node, 'a');

    expect(component.activeCase(node)).toBe('a');
    expect(node.leaves.map((l) => l.key)).toEqual(['x']);
  });

  // --- choice ----------------------------------------------------------------

  it('builds a choice node from the inferred active case, with case labels', () => {
    const scope = component.root.children.find((c) => c.label === 'scope')!;
    expect(scope.choice).toBeTruthy();
    expect(component.activeCase(scope)).toBe('byNode');
    expect(component.activeCaseLabel(scope)).toBe('By node');
    expect(scope.leaves.map((l) => l.key)).toEqual(['nodeId']);
    // The case's complex field (a map) becomes a tree child of the choice node.
    expect(scope.children.length).toBe(1);
    expect(scope.children[0].map).toBeTruthy();
  });

  it('switchTreeCase swaps the controls and rebuilds the subtree in place', () => {
    const scope = component.root.children.find((c) => c.label === 'scope')!;
    const id = scope.id;

    component.switchTreeCase(scope, 'byZone');

    const group = form.get('scope') as FormGroup;
    expect(group.get(CASE_KEY)!.value).toBe('byZone');
    expect(group.get('nodeId')).toBeNull();
    expect(group.get('zoneId')).toBeTruthy();
    // The leaf-bodied case normalizes to a single field.
    expect(scope.leaves.map((l) => l.key)).toEqual(['zoneId']);
    expect(scope.children.length).toBe(0);
    expect(scope.id).toBe(id);
    expect(component.selected).toBe(scope);
  });

  // --- maps ------------------------------------------------------------------

  it('builds a leaf-valued map as a childless inline-editable node', () => {
    const labels = component.root.children.find((c) => c.label === 'labels')!;
    expect(labels.map!.complex).toBe(false);
    expect(labels.children.length).toBe(0);
  });

  it('builds a complex map with one child node per entry, keyed by entry key', () => {
    const servers = component.root.children.find((c) => c.label === 'servers')!;
    expect(servers.map!.complex).toBe(true);
    expect(servers.children.map((c) => c.label)).toEqual(['s1']);
    expect(servers.children[0].mapEntry!.key).toBe('s1');
    expect(servers.children[0].leaves.map((l) => l.key)).toEqual(['url']);
  });

  it('addTreeMapEntry appends under a unique key and stops at maxEntries', () => {
    const servers = component.root.children.find((c) => c.label === 'servers')!;
    const group = form.get('servers') as FormGroup;

    component.addTreeMapEntry(servers);
    component.addTreeMapEntry(servers);

    expect(Object.keys(group.controls).length).toBe(3);
    expect(servers.children.length).toBe(3);
    expect(component.selected).toBe(servers.children[2]);

    component.addTreeMapEntry(servers); // at maxEntries: 3

    expect(Object.keys(group.controls).length).toBe(3);
    expect(servers.children.length).toBe(3);
  });

  it('removeTreeMapEntry removes an entry but not below minEntries', () => {
    const servers = component.root.children.find((c) => c.label === 'servers')!;
    const group = form.get('servers') as FormGroup;

    component.removeTreeMapEntry(servers, servers.children[0]); // at minEntries: 1

    expect(group.get('s1')).toBeTruthy();
    expect(servers.children.length).toBe(1);

    component.addTreeMapEntry(servers);
    component.removeTreeMapEntry(servers, servers.children[1]);

    expect(Object.keys(group.controls)).toEqual(['s1']);
    expect(servers.children.length).toBe(1);
  });

  it('renameTreeMapEntry renames the control preserving its value and relabels the node', () => {
    const servers = component.root.children.find((c) => c.label === 'servers')!;
    const group = form.get('servers') as FormGroup;
    const control = group.get('s1');
    const entry = servers.children[0];

    component.renameTreeMapEntry(entry, 'web1');

    expect(group.get('s1')).toBeNull();
    expect(group.get('web1')).toBe(control);
    expect(entry.label).toBe('web1');
    expect(entry.mapEntry!.key).toBe('web1');
  });

  it('renameTreeMapEntry ignores an empty, duplicate, or pattern-violating key', () => {
    const servers = component.root.children.find((c) => c.label === 'servers')!;
    component.addTreeMapEntry(servers); // adds 'key2'
    const entry = servers.children[0];

    component.renameTreeMapEntry(entry, '');
    component.renameTreeMapEntry(entry, 'key2'); // duplicate
    component.renameTreeMapEntry(entry, '1bad'); // violates ^[a-z][a-z0-9]*$

    expect(entry.label).toBe('s1');
    expect((form.get('servers') as FormGroup).get('s1')).toBeTruthy();
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
