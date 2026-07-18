import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';

import { DynamicRecursiveFormComponent } from './dynamic-recursive-form.component';
import { buildFormFromSchema } from '../core/dynamic-recursive-forms-builder';
import { CASE_KEY, Leaf, NodeChoice, NodeGroup, NodeMap } from '../types/dynamic-recursive.types';

describe('DynamicRecursiveFormComponent', () => {
  let component: DynamicRecursiveFormComponent;
  let fixture: ComponentFixture<DynamicRecursiveFormComponent>;

  const schema: NodeGroup = { kind: 'nodeGroup', name: 'root', children: {} };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DynamicRecursiveFormComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DynamicRecursiveFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('schema', schema);
    fixture.componentRef.setInput('formGroup', new FormGroup({}));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('toggleNodePresence adds then removes a presence group control', () => {
    const ntp: NodeGroup = {
      kind: 'nodeGroup',
      name: 'ntp',
      presence: true,
      children: { server: { kind: 'leaf', type: 'string', name: 'server' } },
    };

    component.toggleNodePresence('ntp', ntp, true);
    expect(component.formGroup().get('ntp')).not.toBeNull();

    component.toggleNodePresence('ntp', ntp, false);
    expect(component.formGroup().get('ntp')).toBeNull();
  });

  it('toggleLeafPresence adds then removes a presence leaf control', () => {
    const note: Leaf = { kind: 'leaf', type: 'string', name: 'note', presence: true };

    component.toggleLeafPresence('note', note, true);
    expect(component.formGroup().get('note')).not.toBeNull();

    component.toggleLeafPresence('note', note, false);
    expect(component.formGroup().get('note')).toBeNull();
  });

  it('toggleNodePresence enables a presence choice as a group holding only __case', () => {
    const mode: NodeChoice = {
      kind: 'choice',
      name: 'mode',
      presence: true,
      cases: { a: { x: { kind: 'leaf', type: 'string', name: 'x' } } },
    };

    component.toggleNodePresence('mode', mode, true);
    const group = component.formGroup().get('mode') as FormGroup;
    expect(group).toBeInstanceOf(FormGroup);
    expect(Object.keys(group.controls)).toEqual([CASE_KEY]);
    expect(group.get(CASE_KEY)!.value).toBeNull();

    component.toggleNodePresence('mode', mode, false);
    expect(component.formGroup().get('mode')).toBeNull();
    expect('mode' in component.formGroup().getRawValue()).toBe(false);
  });

  it('toggleNodePresence enables a presence map as an empty group and drops it again', () => {
    const tags: NodeMap = {
      kind: 'map',
      name: 'tags',
      presence: true,
      value: { kind: 'leaf', type: 'string', name: 'value' },
    };

    component.toggleNodePresence('tags', tags, true);
    const group = component.formGroup().get('tags') as FormGroup;
    expect(group).toBeInstanceOf(FormGroup);
    expect(Object.keys(group.controls)).toEqual([]);

    component.toggleNodePresence('tags', tags, true); // idempotent while present
    expect(component.formGroup().get('tags')).toBe(group);

    component.toggleNodePresence('tags', tags, false);
    expect(component.formGroup().get('tags')).toBeNull();
  });

  it('renders complex children in schema declaration order in the root layout', () => {
    const ordered: NodeGroup = {
      kind: 'nodeGroup',
      name: 'root',
      root: true,
      children: {
        alist: {
          kind: 'nodeGroupList',
          name: 'alist',
          label: 'A List',
          type: { kind: 'nodeGroup', name: 'item', children: { x: { kind: 'leaf', type: 'string', name: 'x' } } },
        },
        zmap: { kind: 'map', name: 'zmap', label: 'Z Map', value: { kind: 'leaf', type: 'string', name: 'value' } },
        grp: { kind: 'nodeGroup', name: 'grp', label: 'Group', children: { y: { kind: 'leaf', type: 'string', name: 'y' } } },
      },
    };
    fixture.componentRef.setInput('schema', ordered);
    fixture.componentRef.setInput('formGroup', buildFormFromSchema(ordered));
    fixture.detectChanges();

    // First title inside each top-level block after the fields container.
    const content: HTMLElement = fixture.nativeElement.querySelector('.form-content');
    const titles = [...content.children]
      .slice(1)
      .map((el) => el.querySelector('mat-panel-title')!.textContent!.trim());
    expect(titles).toEqual(['A List', 'Z Map', 'Group']);
  });

  it('renders nothing for an absent presence leaf in read-only mode (no dead add button)', () => {
    const presenceLeafSchema: NodeGroup = {
      kind: 'nodeGroup',
      name: 'root',
      children: { note: { kind: 'leaf', type: 'string', name: 'note', presence: true } },
    };
    fixture.componentRef.setInput('schema', presenceLeafSchema);
    fixture.componentRef.setInput('formGroup', new FormGroup({}));
    fixture.componentRef.setInput('editable', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.presence-leaf-add')).toBeNull();

    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.presence-leaf-add')).toBeTruthy();
  });

  it('renders a presence choice panel with an unchecked toggle and no body while absent', () => {
    const presenceChoiceSchema: NodeGroup = {
      kind: 'nodeGroup',
      name: 'root',
      children: {
        mode: {
          kind: 'choice',
          name: 'mode',
          label: 'Mode',
          presence: true,
          cases: { a: { x: { kind: 'leaf', type: 'string', name: 'x' } } },
        },
      },
    };
    fixture.componentRef.setInput('schema', presenceChoiceSchema);
    fixture.componentRef.setInput('formGroup', new FormGroup({})); // absent: no 'mode' control
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();

    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector('mat-expansion-panel mat-checkbox input');
    expect(checkbox.checked).toBe(false);
    expect(fixture.nativeElement.querySelector('.choice-group')).toBeNull(); // no null-group body rendered

    checkbox.click();
    fixture.detectChanges();

    expect(component.formGroup().get('mode')).toBeInstanceOf(FormGroup);
    expect(fixture.nativeElement.querySelector('.choice-group')).toBeTruthy();
  });

  it('switchCase swaps a choice group field controls', () => {
    const transport: NodeChoice = {
      kind: 'choice',
      name: 'transport',
      cases: {
        tcp: { 'tcp-port': { kind: 'leaf', type: 'number', name: 'tcp-port' } },
        udp: { 'udp-port': { kind: 'leaf', type: 'number', name: 'udp-port' } },
      },
    };
    component.formGroup().addControl(
      'transport',
      new FormGroup({ __case: new FormControl('tcp'), 'tcp-port': new FormControl(1) }),
    );

    component.switchCase('transport', transport, 'udp');

    const t = component.formGroup().get('transport') as FormGroup;
    expect(t.get('tcp-port')).toBeNull();
    expect(t.get('udp-port')).not.toBeNull();
  });

  it('caseLabel returns the labeled name, falling back to the case key', () => {
    const scope: NodeChoice = {
      kind: 'choice',
      name: 'scope',
      cases: { byUe: { ueId: { kind: 'leaf', type: 'string', name: 'ueId' } } },
      caseLabels: { byUe: 'By UE' },
    };
    expect(component.caseLabel(scope, 'byUe')).toBe('By UE');
    expect(component.caseLabel(scope, 'unlabeled')).toBe('unlabeled');
  });
});
