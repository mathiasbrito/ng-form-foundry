import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';

import { LeafRendererComponent } from './leaf-renderer.component';
import { Leaf } from '../../types/dynamic-recursive.types';
import { buildControl } from '../../core/dynamic-recursive-forms-builder';

describe('DrfLeafRendererComponent', () => {
  let component: LeafRendererComponent;
  let fixture: ComponentFixture<LeafRendererComponent>;

  const leaf: Leaf = { kind: 'leaf', type: 'string', name: 'field' };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeafRendererComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LeafRendererComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('leaf_', leaf);
    fixture.componentRef.setInput('control', new FormControl(''));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders a mat-error message when a constrained field is invalid', () => {
    const constrained: Leaf = { kind: 'leaf', type: 'string', name: 'code', minLength: 3 } as Leaf;
    const ctrl = buildControl(constrained, 'ab') as FormControl; // too short -> minlength error
    fixture.componentRef.setInput('leaf_', constrained);
    fixture.componentRef.setInput('control', ctrl);
    fixture.componentRef.setInput('editable', true);
    ctrl.markAsTouched();
    fixture.detectChanges();

    expect(component.errorText).toContain('at least 3 characters');
    const error: HTMLElement | null = fixture.nativeElement.querySelector('mat-error');
    expect(error).toBeTruthy();
    expect(error!.textContent).toContain('at least 3 characters');
  });

  it('shows the required pattern in the error message so the user knows what to type', () => {
    const leaf: Leaf = { kind: 'leaf', type: 'string', name: 'code', pattern: '^[0-9]{3}$' } as Leaf;
    const ctrl = buildControl(leaf, 'ab') as FormControl; // fails the pattern
    fixture.componentRef.setInput('leaf_', leaf);
    fixture.componentRef.setInput('control', ctrl);
    fixture.detectChanges();

    expect(component.errorText).toContain('^[0-9]{3}$');
  });

  it('a boolean leaf is display-only when not editable: clicking cannot change the wire value', () => {
    const flag: Leaf = { kind: 'leaf', type: 'boolean', name: 'flag' };
    const ctrl = new FormControl(false);
    fixture.componentRef.setInput('leaf_', flag);
    fixture.componentRef.setInput('control', ctrl);
    fixture.componentRef.setInput('editable', false);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('mat-checkbox input');
    expect(input.disabled).toBe(true);
    input.click();
    fixture.detectChanges();
    expect(ctrl.value).toBe(false);
    // The control itself stays enabled — a disabled control would leave the form value.
    expect(ctrl.disabled).toBe(false);
  });

  it('an enum leaf is display-only when not editable', () => {
    const level: Leaf = { kind: 'leaf', type: 'enum', name: 'level', enum: ['low', 'high'] } as Leaf;
    const ctrl = new FormControl('low');
    fixture.componentRef.setInput('leaf_', level);
    fixture.componentRef.setInput('control', ctrl);
    fixture.componentRef.setInput('editable', false);
    fixture.detectChanges();

    const select: HTMLElement = fixture.nativeElement.querySelector('mat-select');
    expect(select.getAttribute('aria-disabled')).toBe('true');
    expect(ctrl.disabled).toBe(false);
  });

  it('renders a readOnly leaf as a read-only input even when the form is editable', () => {
    const constant: Leaf = { kind: 'leaf', type: 'string', name: 'kind', default: 'A1', readOnly: true } as Leaf;
    fixture.componentRef.setInput('leaf_', constant);
    fixture.componentRef.setInput('control', new FormControl('A1'));
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();

    expect(component.fieldEditable).toBe(false);
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.readOnly).toBe(true);
  });
});
