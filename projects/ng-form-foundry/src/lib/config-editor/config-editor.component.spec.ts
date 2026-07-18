import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormArray, FormControl, FormGroup } from '@angular/forms';

import { ConfigEditorComponent } from './config-editor.component';
import { buildFormFromSchema, switchChoiceCase } from '../core/dynamic-recursive-forms-builder';
import { CASE_KEY, NodeChoice, NodeGroup, NodeGroupList } from '../types/dynamic-recursive.types';

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
    // Root selection, pre-order. A non-empty list's / complex map's own section
    // would hold only its heading, so it is dropped; its add control trails the
    // items as a headingless footer (same node id, footer flag).
    expect(component.sections.map((s) => (s.footer ? `${s.node.id}:footer` : s.node.id))).toEqual([
      '', 'system', 'ifaces/0', 'ifaces/1', 'ifaces:footer', 'scope', 'scope/ports', 'labels', 'servers/s1', 'servers:footer',
    ]);
    // Section trails run from the selected node to the section's node.
    const item0 = component.sections.find((s) => s.node.id === 'ifaces/0')!;
    expect(item0.trail.map((n) => n.label)).toEqual(['device', 'ifaces', '#1']);

    // Members continuing a run of siblings drop their divider line: #2 follows
    // #1 inside the same list; #1 follows the 'system' group, so it keeps it.
    expect(item0.continuation).toBeUndefined();
    expect(component.sections.find((s) => s.node.id === 'ifaces/1')!.continuation).toBe(true);

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
    // Every section but the first carries a heading — footers never do.
    expect(headings.length).toBe(component.sections.filter((s) => !s.footer).length - 1);
    // Assert the heading's structure, not its collapsed text: ancestor links, then the current segment.
    const links = [...headings[0].querySelectorAll('.crumb-link')].map((a) => a.textContent!.trim());
    expect(links).toEqual(['device']);
    expect(headings[0].querySelector('.crumb-current')!.textContent!.trim()).toBe('system');
    // Section headings are headings, not nav landmarks: only the breadcrumb is a nav.
    expect(headings.every((h) => h.getAttribute('role') === 'heading')).toBe(true);
    expect(el.querySelectorAll('.detail nav').length).toBe(1);
  });

  it('switchTreeCase re-syncs the sections without stealing the tree selection', () => {
    // Editing from the root's flattened view: the case swaps, the sections
    // re-sync, and the selection stays on the root — collapsing the view to
    // the choice node would hide the rest of the form mid-edit.
    expect(component.selected!.id).toBe('');
    component.switchTreeCase(node('scope'), 'byZone');
    expect((form.get('scope') as FormGroup).get(CASE_KEY)!.value).toBe('byZone');
    expect(component.selected!.id).toBe('');
    // The zoneId leaf renders in the choice's own section; the ports child section is gone.
    expect(component.sections.some((s) => s.node.id === 'scope/ports')).toBe(false);
    expect(component.sections.some((s) => s.node.id === 'scope')).toBe(true);
    // The rest of the flattened root view survives the edit.
    expect(component.sections.some((s) => s.node.id === 'system')).toBe(true);
  });

  it('switchTreeCase keeps the choice node selected when its own view is active', () => {
    component.select(node('scope'));
    component.switchTreeCase(node('scope'), 'byZone');
    expect(component.selected!.id).toBe('scope');
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

  it('a tree-row deletion hands keyboard focus back to the selected row', fakeAsync(() => {
    fixture.detectChanges();
    component.removeItem(node('ifaces'), node('ifaces').children[0]);
    fixture.detectChanges();
    tick(); // the refocus defers until the re-render settles

    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.tree-row.selected'));
  }));

  it('removeItem clears expansion under the list, since item identity is positional', () => {
    const list = node('ifaces');
    component.expanded.add('ifaces/1'); // would otherwise migrate to the item shifting into index 1

    component.removeItem(list, list.children[0]);

    expect([...component.expanded].some((id) => id.startsWith('ifaces/'))).toBe(false);
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

  it('detail-pane adds keep the current selection; tree-row adds move it', () => {
    // Detail add from the root view: item and entry appear as new sections,
    // the root stays selected.
    component.addItem(node('ifaces'), true);
    expect(component.selected!.id).toBe('');
    expect(component.sections.some((s) => s.node.id === 'ifaces/2')).toBe(true);

    component.addTreeMapEntry(node('servers'), true);
    expect(component.selected!.id).toBe('');

    // The tree-row variants still select what they created.
    component.addItem(node('ifaces'));
    expect(component.selected!.id).toBe('ifaces/3');
  });

  it('member sections carry a delete control in their heading; removing keeps the selection', () => {
    fixture.detectChanges();
    const heading = [...fixture.nativeElement.querySelectorAll('.detail .section-heading')].find((h: HTMLElement) =>
      h.textContent!.includes('#2'),
    ) as HTMLElement;
    const remove: HTMLButtonElement = heading.querySelector('.section-remove')!;
    expect(remove).toBeTruthy();

    remove.click();
    fixture.detectChanges();

    expect((form.get('ifaces') as FormArray).length).toBe(1);
    expect(component.selected!.id).toBe(''); // detail remove: root view stays
  });

  it('the heading delete control hides at the container floor (minEntries)', () => {
    // servers has minEntries: 1 and exactly one entry — its section heading
    // must offer no remove.
    fixture.detectChanges();
    const heading = [...fixture.nativeElement.querySelectorAll('.detail .section-heading')].find((h: HTMLElement) =>
      h.textContent!.includes('s1'),
    ) as HTMLElement;
    expect(heading.querySelector('.section-remove')).toBeNull();
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

  it('renameTreeMapEntry renames the control preserving its value, selection staying put', () => {
    const group = form.get('servers') as FormGroup;
    const control = group.get('s1');

    // Renamed from the root's flattened view: the ancestor view must not
    // collapse to the entry.
    component.renameTreeMapEntry(node('servers').children[0], 'web1');

    expect(group.get('s1')).toBeNull();
    expect(group.get('web1')).toBe(control);
    expect(node('servers').children[0].label).toBe('web1');
    expect(component.selected!.id).toBe('');
  });

  it('renameTreeMapEntry remaps the selection when it sat on the renamed entry', () => {
    component.select(node('servers').children[0]);
    component.renameTreeMapEntry(node('servers').children[0], 'web1');
    expect(component.selected!.id).toBe('servers/web1');
  });

  it('a committed rename hands focus to the renamed section&apos;s fresh key field', fakeAsync(() => {
    component.select(node('servers').children[0]);
    fixture.detectChanges();

    component.renameTreeMapEntry(node('servers').children[0], 'web1');
    fixture.detectChanges();
    tick(); // the refocus is deferred until the rebuilt section exists

    const keyInput: HTMLInputElement = fixture.nativeElement.querySelector('.detail .key-field input');
    expect(keyInput.value).toBe('web1');
    expect(document.activeElement).toBe(keyInput);
  }));

  it('a renamed entry keeps its position among the map node&apos;s children', () => {
    component.addTreeMapEntry(node('servers')); // key2
    component.addTreeMapEntry(node('servers')); // key3

    component.renameTreeMapEntry(node('servers').children[1], 'mid');

    expect(node('servers').children.map((c) => c.id)).toEqual(['servers/s1', 'servers/mid', 'servers/key3']);
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

  it('a structural re-sync does not re-expand ancestors the user collapsed', () => {
    component.select(node('servers').children[0]); // expands 'servers'
    component.expanded.delete('servers'); // user collapses it again

    const ifaceType = (schema.children['ifaces'] as NodeGroupList).type;
    (form.get('ifaces') as FormArray).push(buildFormFromSchema(ifaceType));

    expect(component.selected!.id).toBe('servers/s1'); // selection survived
    expect(component.expanded.has('servers')).toBe(false); // collapse respected
  });

  it('replacing a control with setControl rebuilds the tree even when the shape is identical', () => {
    const replacement = buildFormFromSchema(schema.children['system'] as NodeGroup);

    form.setControl('system', replacement);

    expect(node('system').group).toBe(replacement as FormGroup); // no detached-subtree editing
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

  it('editable=false renders a fully inert editor: no structural controls, read-only detail', () => {
    component.select(node('servers').children[0]); // a map entry: key field + fields
    fixture.componentRef.setInput('editable', false);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.tree .row-btn').length).toBe(0); // no add/remove rows
    expect(el.querySelector('.optional-row')).toBeNull(); // no optionals menu
    const keyInput: HTMLInputElement = el.querySelector('.detail .key-field input')!;
    expect(keyInput.readOnly).toBe(true);
    expect(el.querySelectorAll('.detail .section-actions').length).toBe(0); // no Add buttons

    component.select(node('scope'));
    fixture.detectChanges();
    // The case selector is replaced by a read-only display of the active case.
    expect(el.querySelector('.detail .case-select mat-select')).toBeNull();
    const caseDisplay: HTMLInputElement = el.querySelector('.detail .case-select input')!;
    expect(caseDisplay.readOnly).toBe(true);
    expect(caseDisplay.value).toBe('By node');
  });

  it('renders the "+ Optional field" row after the children, and hides it when not editable', () => {
    fixture.detectChanges();
    const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.tree .tree-row');
    expect(rows[rows.length - 1].classList).toContain('optional-row');

    fixture.componentRef.setInput('editable', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.optional-row')).toBeNull();
  });

  // --- accessibility ---------------------------------------------------------

  it('tree rows are focusable tree items and Enter selects them', () => {
    const rows: HTMLElement[] = [...fixture.nativeElement.querySelectorAll('.tree [role="treeitem"]')];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.getAttribute('tabindex') === '0')).toBe(true);

    const system = rows.find((r) => r.textContent!.includes('system'))!;
    system.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(component.selected!.id).toBe('system');
    expect(system.getAttribute('aria-selected')).toBe('true');
  });

  it('ArrowRight expands and ArrowLeft collapses a row from the keyboard', () => {
    const rows: HTMLElement[] = [...fixture.nativeElement.querySelectorAll('.tree [role="treeitem"]')];
    const row = rows.find((r) => r.textContent!.includes('ifaces'))!;

    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(component.expanded.has('ifaces')).toBe(true);
    expect(row.getAttribute('aria-expanded')).withContext('before CD').toBeDefined();

    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(component.expanded.has('ifaces')).toBe(false);
  });

  it('every icon-only button in the tree carries an accessible name', () => {
    component.expanded.add('ifaces');
    component.expanded.add('servers');
    fixture.detectChanges();

    const buttons: HTMLElement[] = [...fixture.nativeElement.querySelectorAll('.tree button.mat-mdc-icon-button')];
    expect(buttons.length).toBeGreaterThan(2); // twisties + add/remove row controls
    const unnamed = buttons.filter((b) => !(b.getAttribute('aria-label') ?? '').trim());
    expect(unnamed.map((b) => b.outerHTML.slice(0, 80))).toEqual([]);
  });

  it('draws no container of its own: the editor renders bare tree and detail panes', () => {
    // The embedding client owns the chrome; the component contributes only the
    // two panes (divider styling is a theme concern, verified in the demos).
    const editor: HTMLElement = fixture.nativeElement.querySelector('.editor');
    expect([...editor.children].map((c) => c.className.split(' ')[0])).toEqual(['tree', 'detail']);
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
          children: {
            url: { kind: 'leaf', type: 'string', name: 'url' },
            tls: {
              kind: 'nodeGroup',
              name: 'tls',
              children: { cert: { kind: 'leaf', type: 'string', name: 'cert' } },
            },
          },
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
    expect((group.controls['gateway.local'] as FormGroup).getRawValue() as Record<string, unknown>).toEqual({
      url: 'http://edge',
      tls: { cert: null },
    });
    expect(component.root.children.find((c) => c.id === 'endpoints')!.children[0].label).toBe('gateway.local');
  });

  it('keys containing the path separator get escaped ids, so entries and their subtrees stay addressable', () => {
    // Select the entry first: a selection sitting on the renamed entry follows
    // it to the new (escaped) identity instead of going stale.
    component.select(component.root.children.find((c) => c.id === 'endpoints')!.children[0]);
    component.renameTreeMapEntry(component.root.children.find((c) => c.id === 'endpoints')!.children[0], 'edge/gw');

    const entry = component.root.children.find((c) => c.id === 'endpoints')!.children[0];
    expect(entry.label).toBe('edge/gw'); // display stays raw
    expect(entry.id).toBe('endpoints/edge%2Fgw'); // identity encodes the separator
    expect(entry.children[0].id).toBe('endpoints/edge%2Fgw/tls');
    expect(component.selected!.id).toBe(entry.id);
  });

  it('a rename carries the descendants&apos; expansion state to the new identity', () => {
    const entry = component.root.children.find((c) => c.id === 'endpoints')!.children[0];
    component.select(entry); // expands the entry itself
    expect(component.expanded.has('endpoints/10.0.0.1')).toBe(true);

    component.renameTreeMapEntry(entry, 'web1');

    expect(component.expanded.has('endpoints/web1')).toBe(true);
    expect([...component.expanded].some((id) => id.includes('10.0.0.1'))).toBe(false);
  });
});

describe('ConfigEditorComponent shape signature', () => {
  it('a pure __case flip re-syncs the tree even when both cases share identical field sets', async () => {
    // Twin cases: switching changes ONLY the discriminator, so this isolates
    // the signature's __case marker from key-set changes.
    const twinSchema: NodeGroup = {
      kind: 'nodeGroup',
      name: 'root',
      root: true,
      children: {
        mode: {
          kind: 'choice',
          name: 'mode',
          caseLabels: { a: 'Case A', b: 'Case B' },
          cases: {
            a: { x: { kind: 'leaf', type: 'string', name: 'x' } },
            b: { x: { kind: 'leaf', type: 'string', name: 'x' } },
          },
        },
      },
    };
    await TestBed.configureTestingModule({ imports: [ConfigEditorComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ConfigEditorComponent);
    const form: FormGroup = buildFormFromSchema(twinSchema, { mode: { [CASE_KEY]: 'a', x: '1' } });
    fixture.componentRef.setInput('schema', twinSchema);
    fixture.componentRef.setInput('formGroup', form);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const before = component.root.children.find((c) => c.id === 'mode')!;
    expect(component.activeCaseLabel(before)).toBe('Case A');

    switchChoiceCase(form.get('mode') as FormGroup, twinSchema.children['mode'] as NodeChoice, 'b');

    const after = component.root.children.find((c) => c.id === 'mode')!;
    expect(after).not.toBe(before); // the __case marker alone triggered the rebuild
    expect(component.activeCaseLabel(after)).toBe('Case B');
  });
});

describe('ConfigEditorComponent choice-valued map entries', () => {
  const schema: NodeGroup = {
    kind: 'nodeGroup',
    name: 'root',
    root: true,
    children: {
      rules: {
        kind: 'map',
        name: 'rules',
        value: {
          kind: 'choice',
          name: 'rule',
          cases: {
            allow: { subnet: { kind: 'leaf', type: 'string', name: 'subnet' } },
            deny: { reason: { kind: 'leaf', type: 'string', name: 'reason' } },
          },
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
    form = buildFormFromSchema(schema, { rules: { lan: { subnet: '10.0.0.0/8' } } });
    fixture.componentRef.setInput('schema', schema);
    fixture.componentRef.setInput('formGroup', form);
    fixture.detectChanges();
  });

  it('builds a choice node per entry with the case inferred from the entry data', () => {
    const rules = component.root.children.find((c) => c.id === 'rules')!;
    expect(rules.map!.complex).toBe(true);
    const entry = rules.children[0];
    expect(entry.choice).toBeTruthy();
    expect(component.activeCase(entry)).toBe('allow');
    expect(entry.mapEntry!.key).toBe('lan');
  });

  it('renders the entry section with a case selector and switches its case', () => {
    const rules = component.root.children.find((c) => c.id === 'rules')!;
    component.select(rules.children[0]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.detail .case-select mat-select')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.detail .key-field input')).toBeTruthy();

    component.switchTreeCase(rules.children[0], 'deny');

    const entryGroup = (form.get('rules') as FormGroup).controls['lan'] as FormGroup;
    expect(entryGroup.get(CASE_KEY)!.value).toBe('deny');
    expect(entryGroup.get('subnet')).toBeNull();
    expect(entryGroup.get('reason')).toBeTruthy();
  });
});

describe('ConfigEditorComponent presence leaves inside a choice case', () => {
  const schema: NodeGroup = {
    kind: 'nodeGroup',
    name: 'root',
    root: true,
    children: {
      scope: {
        kind: 'choice',
        name: 'scope',
        cases: {
          byNode: {
            nodeId: { kind: 'leaf', type: 'string', name: 'nodeId' },
            prio: { kind: 'leaf', type: 'number', name: 'prio', presence: true },
          },
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
    form = buildFormFromSchema(schema, { scope: { nodeId: 'n1' } });
    fixture.componentRef.setInput('schema', schema);
    fixture.componentRef.setInput('formGroup', form);
    fixture.detectChanges();
  });

  it('offers the absent case presence leaf in the choice node&apos;s optionals menu and round-trips add/remove', () => {
    const scope = component.root.children.find((c) => c.id === 'scope')!;
    expect(scope.optionals!.map((o) => o.key)).toEqual(['prio']);

    component.addOptional(scope, scope.optionals![0]);

    const choiceGroup = form.get('scope') as FormGroup;
    expect(choiceGroup.get('prio')).toBeTruthy();
    expect(component.root.children.find((c) => c.id === 'scope')!.optionals ?? []).toEqual([]);

    // Removal through the group (as the section form's remove control does).
    choiceGroup.removeControl('prio');
    expect(component.root.children.find((c) => c.id === 'scope')!.optionals!.map((o) => o.key)).toEqual(['prio']);
    expect('prio' in choiceGroup.getRawValue()).toBe(false);
  });
});

describe('ConfigEditorComponent list floors and caps', () => {
  const schema: NodeGroup = {
    kind: 'nodeGroup',
    name: 'net',
    root: true,
    children: {
      ifaces: {
        kind: 'nodeGroupList',
        name: 'ifaces',
        minItems: 1,
        maxItems: 1,
        type: { kind: 'nodeGroup', name: 'iface', children: { nm: { kind: 'leaf', type: 'string', name: 'nm' } } },
      },
    },
  };

  let fixture: ComponentFixture<ConfigEditorComponent>;
  let form: FormGroup;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ConfigEditorComponent] }).compileComponents();
    fixture = TestBed.createComponent(ConfigEditorComponent);
    form = buildFormFromSchema(schema, { ifaces: [{ nm: 'eth0' }] });
    fixture.componentRef.setInput('schema', schema);
    fixture.componentRef.setInput('formGroup', form);
    fixture.detectChanges();
    fixture.componentInstance.expanded.add('ifaces');
    fixture.detectChanges();
  });

  it('hides the item remove control at the minItems floor instead of rendering a dead button', () => {
    const rows: HTMLElement[] = [...fixture.nativeElement.querySelectorAll('.tree .tree-row')];
    const itemRow = rows.find((r) => r.textContent!.includes('#1'))!;
    expect(itemRow).toBeTruthy();
    expect(itemRow.querySelector('.row-btn.remove')).toBeNull();
  });

  it('hides the add control and refuses addItem at the maxItems cap', () => {
    const rows: HTMLElement[] = [...fixture.nativeElement.querySelectorAll('.tree .tree-row')];
    const listRow = rows.find((r) => r.textContent!.includes('ifaces'))!;
    expect(listRow.querySelector('.row-btn.add')).toBeNull();

    const list = fixture.componentInstance.root.children.find((c) => c.id === 'ifaces')!;
    fixture.componentInstance.addItem(list);
    expect((form.get('ifaces') as FormArray).length).toBe(1); // capped
  });

  it('shows a muted hint for a list section with no items instead of a blank pane', () => {
    // Bypass the floor guard the way external data would: an empty seeded list.
    const emptyForm = buildFormFromSchema(schema, { ifaces: [] });
    fixture.componentRef.setInput('formGroup', emptyForm);
    fixture.detectChanges();

    const list = fixture.componentInstance.root.children.find((c) => c.id === 'ifaces')!;
    fixture.componentInstance.select(list);
    fixture.detectChanges();

    const hint: HTMLElement | null = fixture.nativeElement.querySelector('.detail .empty');
    expect(hint?.textContent).toContain('No iface items.');
  });
});

describe('ConfigEditorComponent with composite-only groups', () => {
  // `net` renders nothing itself — no leaves, only a nested group — so it must
  // not contribute a heading-only section between the root and `net/tcp`.
  const schema: NodeGroup = {
    kind: 'nodeGroup',
    name: 'root',
    children: {
      host: { kind: 'leaf', type: 'string', name: 'host' },
      net: {
        kind: 'nodeGroup',
        name: 'net',
        children: {
          tcp: {
            kind: 'nodeGroup',
            name: 'tcp',
            children: { port: { kind: 'leaf', type: 'number', name: 'port' } },
          },
        },
      },
    },
  };

  let component: ConfigEditorComponent;
  let fixture: ComponentFixture<ConfigEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ConfigEditorComponent] }).compileComponents();
    fixture = TestBed.createComponent(ConfigEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('schema', schema);
    fixture.componentRef.setInput('formGroup', buildFormFromSchema(schema));
    fixture.detectChanges();
  });

  it('drops heading-only sections; children keep the full breadcrumb trail', () => {
    expect(component.sections.map((s) => s.node.id)).toEqual(['', 'net/tcp']);
    // The skipped node still appears in its child's trail, so the path reads whole.
    expect(component.sections[1].trail.map((n) => n.label)).toEqual(['root', 'net', 'tcp']);
    const headings = fixture.nativeElement.querySelectorAll('.detail .section-heading');
    expect(headings.length).toBe(1);
  });

  it('still shows the composite-only node as its own selection target', () => {
    component.select(component.root.children.find((c) => c.id === 'net')!);
    // Selected directly, its own (first) section stays even though empty; the
    // child follows with content.
    expect(component.sections.map((s) => s.node.id)).toEqual(['net', 'net/tcp']);
  });
});

describe('ConfigEditorComponent with a present-children range (minPresent)', () => {
  // The A1 qosObjectives shape: required closed object, all children optional,
  // JSON Schema minProperties: 1 → nodeGroup minPresent: 1.
  const schema: NodeGroup = {
    kind: 'nodeGroup',
    name: 'root',
    children: {
      qosObjectives: {
        kind: 'nodeGroup',
        name: 'qosObjectives',
        label: 'QoS objectives',
        minPresent: 1,
        children: {
          gfbr: { kind: 'leaf', type: 'number', name: 'gfbr', presence: true, integer: true },
          mfbr: { kind: 'leaf', type: 'number', name: 'mfbr', presence: true, integer: true },
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
    form = buildFormFromSchema(schema, { qosObjectives: {} }); // nothing enabled
    fixture.componentRef.setInput('schema', schema);
    fixture.componentRef.setInput('formGroup', form);
    fixture.detectChanges();
  });

  it('marks the tree row red while too few optional children are enabled', () => {
    const qos = component.root.children.find((c) => c.id === 'qosObjectives')!;
    expect(component['hasError'](qos)).toBe(true);
    expect(fixture.nativeElement.querySelector('.row-error-icon')).toBeTruthy();

    (form.get('qosObjectives') as FormGroup).addControl('gfbr', new FormControl(1000));
    fixture.detectChanges();
    expect(component['hasError'](qos)).toBe(false);
  });

  it('explains the violation in the detail view and clears it when a field is enabled', () => {
    const qos = component.root.children.find((c) => c.id === 'qosObjectives')!;
    component.select(qos);
    fixture.detectChanges();
    const hint: HTMLElement | null = fixture.nativeElement.querySelector('.section-error');
    expect(hint?.textContent).toContain('At least 1 field must be set (0 set)');

    (form.get('qosObjectives') as FormGroup).addControl('mfbr', new FormControl(500));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.section-error')).toBeNull();
  });
});
