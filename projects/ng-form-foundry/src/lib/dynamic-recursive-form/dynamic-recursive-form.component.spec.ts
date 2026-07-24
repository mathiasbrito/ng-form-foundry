import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';

import { DynamicRecursiveFormComponent } from './dynamic-recursive-form.component';
import { buildFormFromSchema, serializeForm } from '../core/dynamic-recursive-forms-builder';
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

  describe('appearance field layout', () => {
    const fields = (): HTMLElement => fixture.nativeElement.querySelector('.fields');

    function bind(appearance: NodeGroup['appearance']) {
      const laid: NodeGroup = {
        kind: 'nodeGroup',
        name: 'laid',
        root: true,
        appearance,
        children: {
          a: { kind: 'leaf', type: 'string', name: 'a' },
          on: { kind: 'leaf', type: 'boolean', name: 'on' },
          b: { kind: 'leaf', type: 'string', name: 'b' },
          num: { kind: 'leaf', type: 'number', name: 'num' },
          sel: { kind: 'leaf', type: 'enum', name: 'sel', enum: ['x', 'y'] },
          c: { kind: 'leaf', type: 'string', name: 'c' },
        },
      };
      fixture.componentRef.setInput('schema', laid);
      fixture.componentRef.setInput('formGroup', buildFormFromSchema(laid));
      fixture.detectChanges();
    }

    it('defaults to the flex flow with no inline layout', () => {
      bind(undefined);
      expect(fields().classList.contains('grid-fields')).toBe(false);
      expect(fields().style.display).toBe('');
    });

    it('grid.cols lays fields on a CSS grid with that many columns', () => {
      bind({ grid: { cols: 2 } });
      expect(fields().classList.contains('grid-fields')).toBe(true);
      expect(fields().style.display).toBe('grid');
      expect(fields().style.gridTemplateColumns).toBe('repeat(2, minmax(0px, 1fr))');
    });

    it('grid.rows alone fills top-to-bottom, adding bounded columns as needed', () => {
      bind({ grid: { rows: 2 } });
      expect(fields().style.gridTemplateRows).toBe('repeat(2, auto)');
      expect(fields().style.gridAutoFlow).toBe('column');
      expect(fields().style.gridAutoColumns).toBe('minmax(0px, 1fr)');
    });

    it('a non-positive cols counts as absent and cannot suppress the rows-only column flow', () => {
      bind({ grid: { rows: 2, cols: -1 } });
      expect(fields().style.gridTemplateColumns).toBe('');
      expect(fields().style.gridAutoFlow).toBe('column');
    });

    it('grid mode does not set the per-type width variables (flex-only bounds)', () => {
      bind({ grid: { cols: 2 }, minTextFieldWidth: '250px', maxNumberFieldWidth: '120px' });
      expect(fields().style.getPropertyValue('--nff-min-text-field-width')).toBe('');
      expect(fields().style.getPropertyValue('--nff-max-number-field-width')).toBe('');
    });

    it('minFieldWidth becomes as-many-as-fit equal columns of at least that width', () => {
      bind({ minFieldWidth: '12rem' });
      expect(fields().style.display).toBe('grid');
      expect(fields().style.gridTemplateColumns).toBe('repeat(auto-fit, minmax(min(12rem, 100%), 1fr))');
    });

    it('grid overrides minFieldWidth', () => {
      bind({ grid: { cols: 3 }, minFieldWidth: '12rem' });
      expect(fields().style.gridTemplateColumns).toBe('repeat(3, minmax(0px, 1fr))');
    });

    it('booleanFields default keeps checkboxes in the field flow', () => {
      bind({ grid: { cols: 2 } });
      expect(fixture.nativeElement.querySelector('.boolean-fields')).toBeNull();
      expect(fields().querySelectorAll('nff-leaf-renderer').length).toBe(6);
    });

    it('booleanFields: end gathers checkboxes into a trailing row', () => {
      bind({ grid: { cols: 2 }, booleanFields: 'end' });
      const booleans: HTMLElement = fixture.nativeElement.querySelector('.boolean-fields');
      expect(booleans.querySelectorAll('nff-leaf-renderer').length).toBe(1);
      expect(fields().querySelectorAll('nff-leaf-renderer').length).toBe(5);
      // Trailing: the boolean row comes after the field flow in the DOM.
      expect(fields().compareDocumentPosition(booleans) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('booleanFields: beginning puts the checkbox row before the field flow', () => {
      bind({ booleanFields: 'beginning' });
      const booleans: HTMLElement = fixture.nativeElement.querySelector('.boolean-fields');
      expect(booleans.querySelectorAll('nff-leaf-renderer').length).toBe(1);
      expect(fields().compareDocumentPosition(booleans) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    });

    it('per-type flex bounds reach string and number fields via CSS custom properties', () => {
      bind({ minTextFieldWidth: '200px', minNumberFieldWidth: '80px', maxNumberFieldWidth: '120px' });
      // Flex flow, not a grid: the bounds shape wrapping, not tracks.
      expect(fields().classList.contains('grid-fields')).toBe(false);
      const text = fields().querySelector('nff-leaf-renderer.leaf-type-string')!;
      const number = fields().querySelector('nff-leaf-renderer.leaf-type-number')!;
      const select = fields().querySelector('nff-leaf-renderer.leaf-type-enum')!;
      expect(getComputedStyle(text).minWidth).toBe('200px');
      expect(getComputedStyle(number).minWidth).toBe('80px');
      expect(getComputedStyle(number).maxWidth).toBe('120px');
      // An enum renders as a mat-select — text-like, so it tracks the text minimum.
      expect(getComputedStyle(select).minWidth).toBe('200px');
    });

    function bindWithSub(appearance: NodeGroup['appearance'], subAppearance?: NodeGroup['appearance']) {
      const laid: NodeGroup = {
        kind: 'nodeGroup',
        name: 'laid',
        root: true,
        appearance,
        children: {
          a: { kind: 'leaf', type: 'string', name: 'a' },
          sub: {
            kind: 'nodeGroup',
            name: 'sub',
            appearance: subAppearance,
            children: {
              x: { kind: 'leaf', type: 'string', name: 'x' },
              y: { kind: 'leaf', type: 'string', name: 'y' },
            },
          },
        },
      };
      fixture.componentRef.setInput('schema', laid);
      fixture.componentRef.setInput('formGroup', buildFormFromSchema(laid));
      fixture.detectChanges();
      return fixture.nativeElement.querySelector('nff-dynamic-recursive-form .fields') as HTMLElement;
    }

    it('a child group inherits the parent grid when it sets no layout of its own', () => {
      const subFields = bindWithSub({ grid: { cols: 2 } });
      expect(subFields.style.gridTemplateColumns).toBe('repeat(2, minmax(0px, 1fr))');
    });

    it('a child group choosing its own field sizing is not overridden by the inherited grid', () => {
      const subFields = bindWithSub({ grid: { cols: 2 } }, { minFieldWidth: '10rem' });
      expect(subFields.style.gridTemplateColumns).toBe('repeat(auto-fit, minmax(min(10rem, 100%), 1fr))');
    });

    it("a map's own appearance reaches its group-valued entries", () => {
      const laid: NodeGroup = {
        kind: 'nodeGroup',
        name: 'laid',
        root: true,
        children: {
          servers: {
            kind: 'map',
            name: 'servers',
            appearance: { grid: { cols: 2 } },
            value: {
              kind: 'nodeGroup',
              name: 'server',
              children: {
                url: { kind: 'leaf', type: 'string', name: 'url' },
                port: { kind: 'leaf', type: 'number', name: 'port' },
              },
            },
          },
        },
      };
      fixture.componentRef.setInput('schema', laid);
      fixture.componentRef.setInput('formGroup', buildFormFromSchema(laid, { servers: { s1: { url: 'http://a' } } }));
      fixture.detectChanges();
      const entryFields: HTMLElement = fixture.nativeElement.querySelector(
        'nff-node-map-renderer nff-dynamic-recursive-form .fields',
      );
      expect(entryFields.style.gridTemplateColumns).toBe('repeat(2, minmax(0px, 1fr))');
    });

    it('a stacked leaf-list repeats the parent grid tracks for its entries', () => {
      const laid: NodeGroup = {
        kind: 'nodeGroup',
        name: 'laid',
        root: true,
        appearance: { grid: { cols: 3 } },
        children: {
          tags: { kind: 'leafList', name: 'tags', type: 'string', default: ['a', 'b'] },
        },
      };
      fixture.componentRef.setInput('schema', laid);
      fixture.componentRef.setInput('formGroup', buildFormFromSchema(laid, { tags: ['a', 'b'] }));
      fixture.detectChanges();
      const list: HTMLElement = fixture.nativeElement.querySelector('nff-leaf-list-renderer');
      expect(list.classList.contains('stacked')).toBe(true);
      expect(list.style.gridTemplateColumns).toBe('repeat(3, minmax(0px, 1fr))');
    });

    it('a rows-only grid does not hand its layout to a stacked leaf-list', () => {
      const laid: NodeGroup = {
        kind: 'nodeGroup',
        name: 'laid',
        root: true,
        appearance: { grid: { rows: 2 } },
        children: {
          tags: { kind: 'leafList', name: 'tags', type: 'string', default: ['a', 'b'] },
        },
      };
      fixture.componentRef.setInput('schema', laid);
      fixture.componentRef.setInput('formGroup', buildFormFromSchema(laid, { tags: ['a', 'b'] }));
      fixture.detectChanges();
      expect(fields().classList.contains('grid-cols')).toBe(false);
      const list: HTMLElement = fixture.nativeElement.querySelector('nff-leaf-list-renderer');
      expect(list.style.display).toBe('');
    });
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

  it('an enabled presence leaf reports invalid until filled, so the gap is visible before submit', () => {
    const note: Leaf = { kind: 'leaf', type: 'string', name: 'note', presence: true };
    component.toggleLeafPresence('note', note, true);
    const control = component.formGroup().get('note')!;
    expect(control.hasError('required')).toBe(true);
    control.setValue('filled');
    expect(component.formGroup().valid).toBe(true);
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

  it('binds leaves by their record key even when it differs from node.name', () => {
    // The schema reference asks authors to keep key === name, but the renderer
    // must bind by the key — that is what buildFormFromSchema keyed.
    const skewed: NodeGroup = {
      kind: 'nodeGroup',
      name: 'root',
      root: true,
      children: { 'contact-email': { kind: 'leaf', type: 'string', name: 'contact' } },
    };
    fixture.componentRef.setInput('schema', skewed);
    fixture.componentRef.setInput('formGroup', buildFormFromSchema(skewed, { 'contact-email': 'a@b.c' }));
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.value).toBe('a@b.c');
  });

  it('initialValue materializes presence keys it carries instead of silently dropping them', () => {
    const withPresence: NodeGroup = {
      kind: 'nodeGroup',
      name: 'root',
      children: { note: { kind: 'leaf', type: 'string', name: 'note', presence: true } },
    };
    // Fresh component: the seeding happens in ngOnInit.
    const local = TestBed.createComponent(DynamicRecursiveFormComponent);
    local.componentRef.setInput('schema', withPresence);
    local.componentRef.setInput('formGroup', buildFormFromSchema(withPresence)); // note absent
    local.componentRef.setInput('initialValue', { note: 'carried' });
    local.detectChanges();

    expect(local.componentInstance.formGroup().get('note')!.value).toBe('carried');
  });

  it('retires the presence focus request once consumed, so re-created renderers do not re-steal focus', fakeAsync(() => {
    const note: Leaf = { kind: 'leaf', type: 'string', name: 'note', presence: true };
    component.toggleLeafPresence('note', note, true);
    expect(component['presenceFocusKey']).toBe('note');
    tick();
    expect(component['presenceFocusKey']).toBeNull();
  }));

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

  it('a root nodeGroupList section is shown (expanded) by default — a list has no collapse of its own', () => {
    const rootWithList: NodeGroup = {
      kind: 'nodeGroup',
      name: 'root',
      root: true,
      children: {
        cells: {
          kind: 'nodeGroupList',
          name: 'cells',
          type: { kind: 'nodeGroup', name: 'cell', children: { id: { kind: 'leaf', type: 'number', name: 'id' } } },
        },
      },
    };
    const local = TestBed.createComponent(DynamicRecursiveFormComponent);
    local.componentRef.setInput('schema', rootWithList);
    local.componentRef.setInput('formGroup', buildFormFromSchema(rootWithList, { cells: [{ id: 1 }] }));
    local.detectChanges();

    const panel: HTMLElement = local.nativeElement.querySelector('nff-node-group-list-renderer').closest('mat-expansion-panel');
    expect(panel.classList.contains('mat-expanded')).toBe(true);
  });

  it('presence leaves trail the regular fields in the root layout, regardless of declaration order', () => {
    const rootWithPresence: NodeGroup = {
      kind: 'nodeGroup',
      name: 'root',
      root: true,
      children: {
        note: { kind: 'leaf', type: 'string', name: 'note', presence: true }, // declared first
        host: { kind: 'leaf', type: 'string', name: 'host' },
      },
    };
    const local = TestBed.createComponent(DynamicRecursiveFormComponent);
    local.componentRef.setInput('schema', rootWithPresence);
    local.componentRef.setInput('formGroup', buildFormFromSchema(rootWithPresence));
    local.componentRef.setInput('editable', true);
    local.detectChanges();

    const fields: HTMLElement = local.nativeElement.querySelector('.fields');
    const children = [...fields.children];
    const leafIdx = children.findIndex((el) => el.tagName.toLowerCase() === 'nff-leaf-renderer');
    const addIdx = children.findIndex((el) => el.classList.contains('presence-leaf-add'));
    // The plain leaf renders before the trailing presence add button.
    expect(leafIdx).toBeGreaterThan(-1);
    expect(leafIdx).toBeLessThan(addIdx);

    (local.nativeElement.querySelector('.presence-leaf-add') as HTMLElement).click();
    local.detectChanges();
    const after = [...local.nativeElement.querySelector('.fields').children].map((el) => el.tagName.toLowerCase());
    // Enabled, the presence field keeps the trailing spot.
    expect(after.filter((t) => t === 'nff-leaf-renderer').length).toBe(2);
    expect(after[after.length - 1]).toBe('nff-leaf-renderer');
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

  it('ships the compact icon-button sizing itself — no app-global CSS required', () => {
    // Consumers get only the component styles; a stock 48px Material icon
    // button here means the sizing leaked back into a demo-app stylesheet.
    const withPresence: NodeGroup = {
      kind: 'nodeGroup',
      name: 'root',
      root: true,
      children: { note: { kind: 'leaf', type: 'string', name: 'note', presence: true } },
    };
    const local = TestBed.createComponent(DynamicRecursiveFormComponent);
    local.componentRef.setInput('schema', withPresence);
    local.componentRef.setInput('formGroup', buildFormFromSchema(withPresence, { note: 'x' }));
    local.componentRef.setInput('editable', true);
    local.detectChanges();

    const btn: HTMLElement | null = local.nativeElement.querySelector('.small-icon-button');
    expect(btn).toBeTruthy();
    const style = getComputedStyle(btn!);
    expect(style.width).toBe('24px');
    expect(style.height).toBe('24px');
    expect(style.getPropertyValue('--mat-icon-button-touch-target-display').trim()).toBe('none');
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

  describe('ghost preview of absent optionals (showAbsentOptionals)', () => {
    // A presence leaf with a default AND a required marker plus bounds: the
    // ghost must neutralize all of them until incorporated.
    const ghosted: NodeGroup = {
      kind: 'nodeGroup',
      name: 'cfg',
      root: true,
      children: {
        host: { kind: 'leaf', type: 'string', name: 'host', required: true },
        timeout: { kind: 'leaf', type: 'number', name: 'timeout', presence: true, default: 30, min: 1, required: true },
        verbose: { kind: 'leaf', type: 'boolean', name: 'verbose', presence: true, default: true },
      },
    };
    let form: FormGroup;

    function bindGhosted(schema: NodeGroup = ghosted, initial?: Record<string, unknown>): void {
      form = buildFormFromSchema(schema, initial);
      fixture.componentRef.setInput('schema', schema);
      fixture.componentRef.setInput('formGroup', form);
      fixture.componentRef.setInput('editable', true);
      fixture.componentRef.setInput('showAbsentOptionals', true);
      fixture.detectChanges();
    }

    const ghostFields = (): NodeListOf<HTMLElement> => fixture.nativeElement.querySelectorAll('.ghost-field');
    const ghostInput = (): HTMLInputElement | null => fixture.nativeElement.querySelector('.ghost-field input');
    const ghostAdd = (): HTMLButtonElement | null => fixture.nativeElement.querySelector('.ghost-field .ghost-add');

    it('renders the absent field itself instead of the Add button, read-only', () => {
      bindGhosted();
      expect(ghostFields().length).toBe(2); // timeout (field flow) + verbose (boolean area)
      expect(fixture.nativeElement.querySelector('.presence-leaf-add')).toBeNull();
      const input = ghostInput()!;
      expect(input.readOnly).toBe(true);
      expect(ghostAdd()).toBeTruthy();
    });

    it('the ghost holds no value: default shows as placeholder only, input empty', () => {
      bindGhosted();
      const input = ghostInput()!;
      expect(input.placeholder).toBe('30');
      expect(input.value).toBe('');
    });

    it('value integrity: ghosts appear in neither value, getRawValue, nor serializeForm', () => {
      bindGhosted();
      expect(form.value).toEqual({ host: null });
      expect(form.getRawValue()).toEqual({ host: null });
      expect(serializeForm(ghosted, form)).toEqual({ host: null });
      expect('timeout' in form.controls).toBe(false);
      expect('verbose' in form.controls).toBe(false);
    });

    it('value integrity: rendering ghosts produces the identical value a ghost-less form has', () => {
      const plain = buildFormFromSchema(ghosted);
      bindGhosted();
      expect(form.getRawValue()).toEqual(plain.getRawValue());
    });

    it("a ghost's required/min validators cannot invalidate the form", () => {
      bindGhosted();
      form.get('host')!.setValue('gnb1');
      expect(form.valid).toBe(true); // required+min on the absent timeout are inert
    });

    it('(+) incorporates the field: control appears, seeded with the schema default', () => {
      bindGhosted();
      ghostAdd()!.click();
      fixture.detectChanges();
      expect(form.getRawValue()).toEqual({ host: null, timeout: 30 });
      // The ghost gave way to the real field (one ghost left: verbose).
      expect(ghostFields().length).toBe(1);
    });

    it('an incorporated field is live: edits land in the value, validators apply', () => {
      bindGhosted();
      ghostAdd()!.click();
      fixture.detectChanges();
      form.get('timeout')!.setValue(0); // violates min: 1
      expect(form.get('timeout')!.errors?.['min']).toBeTruthy();
      form.get('timeout')!.setValue(45);
      expect(form.getRawValue()['timeout']).toBe(45);
    });

    it('removing an incorporated field returns it to ghost and drops it from the value', () => {
      bindGhosted(ghosted, { timeout: 45 });
      expect(form.getRawValue()['timeout']).toBe(45);
      component.toggleLeafPresence('timeout', ghosted.children['timeout'] as Leaf, false);
      fixture.detectChanges();
      expect('timeout' in form.getRawValue()).toBe(false);
      expect(ghostFields().length).toBe(2);
    });

    it('typing cannot reach the form through a ghost: the stand-in control is detached', () => {
      bindGhosted();
      const before = JSON.stringify(form.getRawValue());
      // Even a programmatic write to the rendered control must not touch the form.
      const ghost = component['ghostControl']('timeout');
      ghost.setValue(999);
      fixture.detectChanges();
      expect(JSON.stringify(form.getRawValue())).toBe(before);
      expect(form.get('timeout')).toBeNull();
    });

    it('read-only mode renders neither ghosts nor add buttons', () => {
      bindGhosted();
      fixture.componentRef.setInput('editable', false);
      fixture.detectChanges();
      expect(ghostFields().length).toBe(0);
      expect(fixture.nativeElement.querySelector('.presence-leaf-add')).toBeNull();
    });

    it('knob off keeps the Add-button affordance and the same absent value', () => {
      bindGhosted();
      fixture.componentRef.setInput('showAbsentOptionals', false);
      fixture.detectChanges();
      expect(ghostFields().length).toBe(0);
      expect(fixture.nativeElement.querySelectorAll('.presence-leaf-add').length).toBe(2);
      expect(form.getRawValue()).toEqual({ host: null });
    });

    it('a leaf without a default ghosts with an empty placeholder', () => {
      const bare: NodeGroup = {
        kind: 'nodeGroup',
        name: 'cfg',
        root: true,
        children: { note: { kind: 'leaf', type: 'string', name: 'note', presence: true } },
      };
      bindGhosted(bare);
      expect(ghostInput()!.placeholder).toBe('');
      expect(form.getRawValue()).toEqual({});
    });

    it('edge: a presence leaf seeded by initial data renders live, not as a ghost', () => {
      bindGhosted(ghosted, { timeout: 10 });
      expect(ghostFields().length).toBe(1); // only verbose ghosts
      expect(form.getRawValue()).toEqual({ host: null, timeout: 10 });
    });

    it('edge: ghosts inside group-list entries stay out of every entry value', () => {
      const listed: NodeGroup = {
        kind: 'nodeGroup',
        name: 'cfg',
        root: true,
        children: {
          cells: {
            kind: 'nodeGroupList',
            name: 'cells',
            type: {
              kind: 'nodeGroup',
              name: 'cells',
              children: {
                id: { kind: 'leaf', type: 'number', name: 'id' },
                gain: { kind: 'leaf', type: 'number', name: 'gain', presence: true, default: 20 },
              },
            },
          },
        },
      };
      bindGhosted(listed, { cells: [{ id: 1 }, { id: 2, gain: 30 }] });
      // One ghost: entry #1's absent gain; entry #2 has it enabled.
      expect(ghostFields().length).toBe(1);
      expect(form.getRawValue()).toEqual({ cells: [{ id: 1 }, { id: 2, gain: 30 }] });
      expect(serializeForm(listed, form)).toEqual({ cells: [{ id: 1 }, { id: 2, gain: 30 }] });
    });

    it('edge: incorporating in one list entry leaves sibling entries untouched', () => {
      const listed: NodeGroup = {
        kind: 'nodeGroup',
        name: 'cfg',
        root: true,
        children: {
          cells: {
            kind: 'nodeGroupList',
            name: 'cells',
            type: {
              kind: 'nodeGroup',
              name: 'cells',
              children: {
                id: { kind: 'leaf', type: 'number', name: 'id' },
                gain: { kind: 'leaf', type: 'number', name: 'gain', presence: true, default: 20 },
              },
            },
          },
        },
      };
      bindGhosted(listed, { cells: [{ id: 1 }, { id: 2 }] });
      const adds = fixture.nativeElement.querySelectorAll('.ghost-field .ghost-add');
      expect(adds.length).toBe(2);
      (adds[0] as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(form.getRawValue()).toEqual({ cells: [{ id: 1, gain: 20 }, { id: 2 }] });
    });

    it('edge: the ghost stand-in is a stable instance across change detection', () => {
      bindGhosted();
      const first = component['ghostControl']('timeout');
      fixture.detectChanges();
      fixture.detectChanges();
      expect(component['ghostControl']('timeout')).toBe(first);
    });

    it('a mutated stand-in is discarded on toggle: re-ghosting renders pristine', () => {
      bindGhosted();
      component['ghostControl']('timeout').setValue(999);
      ghostAdd()!.click(); // incorporate…
      fixture.detectChanges();
      component.toggleLeafPresence('timeout', ghosted.children['timeout'] as Leaf, false); // …and remove
      fixture.detectChanges();
      expect(component['ghostControl']('timeout').value).toBeNull();
      expect(ghostInput()!.value).toBe('');
    });

    it('turning the knob off after incorporation keeps the field live with its value', () => {
      bindGhosted();
      ghostAdd()!.click();
      fixture.detectChanges();
      fixture.componentRef.setInput('showAbsentOptionals', false);
      fixture.detectChanges();
      expect(form.getRawValue()).toEqual({ host: null, timeout: 30 });
      form.get('timeout')!.setValue(45);
      expect(form.getRawValue()['timeout']).toBe(45);
      expect(ghostFields().length).toBe(0);
    });

    it('a radix presence leaf ghosts with its default spelled in its base', () => {
      const hexed: NodeGroup = {
        kind: 'nodeGroup',
        name: 'cfg',
        root: true,
        children: { mask: { kind: 'leaf', type: 'number', name: 'mask', presence: true, default: 26, radix: 16 } },
      };
      bindGhosted(hexed);
      expect(ghostInput()!.placeholder).toBe('0x1A');
      expect(form.getRawValue()).toEqual({});
    });

    it('an enum presence leaf ghosts as a display-only select carrying its default as placeholder', () => {
      const withEnum: NodeGroup = {
        kind: 'nodeGroup',
        name: 'cfg',
        root: true,
        children: {
          level: { kind: 'leaf', type: 'enum', name: 'level', presence: true, enum: ['low', 'medium', 'high'], default: 'medium' },
        },
      };
      bindGhosted(withEnum);
      const select: HTMLElement | null = fixture.nativeElement.querySelector('.ghost-field mat-select');
      expect(select).toBeTruthy();
      expect(select!.getAttribute('aria-disabled')).toBe('true');
      expect(select!.textContent).toContain('medium');
      expect(form.getRawValue()).toEqual({});
    });

    it('a default-true boolean ghosts unchecked and contributes no value', () => {
      bindGhosted(); // `verbose` has default: true
      const box: HTMLInputElement | null = fixture.nativeElement.querySelector('.ghost-field input[type="checkbox"]');
      expect(box).toBeTruthy();
      expect(box!.checked).toBe(false);
      expect('verbose' in form.getRawValue()).toBe(false);
    });

    it('edge: ghosts cascade into an active choice case and stay out of its value', () => {
      const chosen: NodeGroup = {
        kind: 'nodeGroup',
        name: 'cfg',
        root: true,
        children: {
          scope: {
            kind: 'choice',
            name: 'scope',
            cases: {
              byUe: {
                ueId: { kind: 'leaf', type: 'string', name: 'ueId' },
                priority: { kind: 'leaf', type: 'number', name: 'priority', presence: true, default: 5 },
              },
            },
          },
        },
      };
      bindGhosted(chosen, { scope: { [CASE_KEY]: 'byUe', ueId: 'ue-1' } });
      expect(ghostFields().length).toBe(1);
      expect(form.getRawValue()).toEqual({ scope: { [CASE_KEY]: 'byUe', ueId: 'ue-1' } });
      const add: HTMLButtonElement = fixture.nativeElement.querySelector('.ghost-field .ghost-add');
      add.click();
      fixture.detectChanges();
      expect(form.getRawValue()).toEqual({ scope: { [CASE_KEY]: 'byUe', ueId: 'ue-1', priority: 5 } });
    });

    it('edge: ghosts cascade into map entries and stay out of every entry value', () => {
      const mapped: NodeGroup = {
        kind: 'nodeGroup',
        name: 'cfg',
        root: true,
        children: {
          servers: {
            kind: 'map',
            name: 'servers',
            value: {
              kind: 'nodeGroup',
              name: 'server',
              children: {
                url: { kind: 'leaf', type: 'string', name: 'url' },
                weight: { kind: 'leaf', type: 'number', name: 'weight', presence: true, default: 1 },
              },
            },
          } as NodeMap,
        },
      };
      bindGhosted(mapped, { servers: { web1: { url: 'http://a' } } });
      expect(ghostFields().length).toBe(1);
      expect(form.getRawValue()).toEqual({ servers: { web1: { url: 'http://a' } } });
    });
  });

  describe('radix wire-value integrity under invalid input', () => {
    it('an unparseable hex entry serializes as null, never as the raw text', () => {
      const schema: NodeGroup = {
        kind: 'nodeGroup',
        name: 'cfg',
        root: true,
        children: { mask: { kind: 'leaf', type: 'number', name: 'mask', radix: 16 } },
      };
      const form: FormGroup = buildFormFromSchema(schema, { mask: 15 });
      fixture.componentRef.setInput('schema', schema);
      fixture.componentRef.setInput('formGroup', form);
      fixture.componentRef.setInput('editable', true);
      fixture.detectChanges();

      const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
      input.value = 'xyz';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(form.get('mask')!.value).toBeNull();
      expect(form.getRawValue()).toEqual({ mask: null });
      expect(serializeForm(schema, form)).toEqual({ mask: null });
      expect(form.get('mask')!.errors?.['radixFormat']).toBeTruthy();
      expect(form.valid).toBe(false);

      input.value = '0x2A'; // correction restores the numeric path
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(form.getRawValue()).toEqual({ mask: 42 });
      expect(serializeForm(schema, form)).toEqual({ mask: 42 });
    });
  });
});
