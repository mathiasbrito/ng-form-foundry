import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';

import { AnonLeafRendererComponent } from './anon-leaf-renderer.component';
import { AnonLeaf, LeafList } from '../../types/dynamic-recursive.types';

describe('DrfAnonLeafRendererComponent', () => {
  let component: AnonLeafRendererComponent;
  let fixture: ComponentFixture<AnonLeafRendererComponent>;

  const anonLeaf: AnonLeaf = { type: 'string' };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnonLeafRendererComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AnonLeafRendererComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('AnonLeaf', anonLeaf);
    fixture.componentRef.setInput('index', 0);
    fixture.componentRef.setInput('control', new FormControl(''));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('a leafList with a radix renders its items as based text inputs', () => {
    const masks: LeafList = { kind: 'leafList', name: 'masks', type: 'number', radix: 16 };
    fixture.componentRef.setInput('AnonLeaf', masks);
    fixture.componentRef.setInput('control', new FormControl(255));
    fixture.componentRef.setInput('label', 'masks');
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.type).toBe('text');
    expect(input.value).toBe('0xFF');
  });

  it('a string-typed radix leafList carries exact decimal digits behind the based display', () => {
    const big: LeafList = { kind: 'leafList', name: 'ids', type: 'string', radix: 16 };
    const control = new FormControl<unknown>('9223372036854775807');
    fixture.componentRef.setInput('AnonLeaf', big);
    fixture.componentRef.setInput('control', control);
    fixture.componentRef.setInput('label', 'ids');
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.value).toBe('0x7FFFFFFFFFFFFFFF');
    input.value = '0x7FFFFFFFFFFFFFFE';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(control.value).toBe('9223372036854775806');
  });
});
