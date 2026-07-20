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
