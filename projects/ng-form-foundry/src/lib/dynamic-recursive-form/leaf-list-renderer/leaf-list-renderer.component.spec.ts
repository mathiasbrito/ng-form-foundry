import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormArray, FormControl } from '@angular/forms';

import { LeafListRendererComponent } from './leaf-list-renderer.component';
import { LeafList } from '../../types/dynamic-recursive.types';

describe('DrfLeafListRendererComponent', () => {
  let component: LeafListRendererComponent;
  let fixture: ComponentFixture<LeafListRendererComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeafListRendererComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LeafListRendererComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('radix items stay plain numbers through edit, add, and positional remove', () => {
    const masks: LeafList = { kind: 'leafList', name: 'masks', type: 'number', radix: 16 };
    const array = new FormArray([new FormControl<unknown>(15), new FormControl<unknown>(240)]);
    fixture.componentRef.setInput('leaf_', masks);
    fixture.componentRef.setInput('formArray', array);
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();

    const inputs = (): NodeListOf<HTMLInputElement> => fixture.nativeElement.querySelectorAll('input');
    expect(Array.from(inputs()).map((i) => i.value)).toEqual(['0xF', '0xF0']);

    // Edit item 0 in hex: the array value stays numeric.
    inputs()[0]!.value = '1A';
    inputs()[0]!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(array.value).toEqual([26, 240]);

    // Positional removal rebinds the survivor into the first rendered input
    // (track $index): the display must re-render the rebound control's value.
    component.removeItem(0);
    fixture.detectChanges();
    expect(array.value).toEqual([240]);
    expect(inputs()[0]!.value).toBe('0xF0');

    component.addItem();
    fixture.detectChanges();
    expect(array.length).toBe(2);
    inputs()[1]!.value = '0b11'; // hex digits, not a binary prefix, in a radix-16 list
    inputs()[1]!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(array.value).toEqual([240, 0x0b11]);
  });
});

describe('DrfLeafListRendererComponent cardinality', () => {
  async function mount(leaf_: LeafList, values: unknown[]) {
    await TestBed.configureTestingModule({ imports: [LeafListRendererComponent] }).compileComponents();
    const fixture = TestBed.createComponent(LeafListRendererComponent);
    const array = new FormArray<any>(values.map((v) => new FormControl(v)));
    fixture.componentRef.setInput('leaf_', leaf_);
    fixture.componentRef.setInput('formArray', array);
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();
    return { fixture, array, c: fixture.componentInstance };
  }

  it('refuses to exceed maxItems', async () => {
    const { array, c } = await mount({ kind: 'leafList', name: 'tags', type: 'string', maxItems: 2 }, ['a', 'b']);
    expect(c.canAdd).toBe(false);
    c.addItem();
    expect(array.length).toBe(2);
  });

  it('honors minItems 0: the last item is removable', async () => {
    const { array, c } = await mount({ kind: 'leafList', name: 'tags', type: 'string' }, ['a']);
    c.removeItem(0);
    expect(array.length).toBe(0);
  });

  it('offers an add affordance for an empty list', async () => {
    const { fixture, array } = await mount({ kind: 'leafList', name: 'tags', type: 'string' }, []);
    const add = fixture.nativeElement.querySelector('.add-button') as HTMLButtonElement | null;
    expect(add).toBeTruthy();
    add!.click();
    fixture.detectChanges();
    expect(array.length).toBe(1);
  });
});

describe('DrfLeafListRendererComponent bounds precedence', () => {
  async function mount(leaf_: LeafList, values: unknown[], inputs?: { minItems?: number; maxItems?: number }) {
    await TestBed.configureTestingModule({ imports: [LeafListRendererComponent] }).compileComponents();
    const fixture = TestBed.createComponent(LeafListRendererComponent);
    const array = new FormArray<any>(values.map((v) => new FormControl(v)));
    fixture.componentRef.setInput('leaf_', leaf_);
    fixture.componentRef.setInput('formArray', array);
    if (inputs?.minItems != null) fixture.componentRef.setInput('minItems', inputs.minItems);
    if (inputs?.maxItems != null) fixture.componentRef.setInput('maxItems', inputs.maxItems);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('the @Input bound is the fallback when the schema declares no bounds', async () => {
    const c = await mount({ kind: 'leafList', name: 'tags', type: 'string' }, ['a', 'b'], { minItems: 1, maxItems: 2 });
    expect(c.effectiveMin).toBe(1);
    expect(c.effectiveMax).toBe(2);
    expect(c.canAdd).toBe(false);
  });

  it('the schema wins over the @Input when both are present (including minItems 0)', async () => {
    const c = await mount({ kind: 'leafList', name: 'tags', type: 'string', minItems: 0, maxItems: 5 }, ['a'], { minItems: 3, maxItems: 2 });
    expect(c.effectiveMin).toBe(0);
    expect(c.effectiveMax).toBe(5);
  });
});
