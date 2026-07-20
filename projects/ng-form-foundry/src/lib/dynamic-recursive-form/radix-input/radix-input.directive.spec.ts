import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { Radix, RadixInputDirective } from './radix-input.directive';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, RadixInputDirective],
  template: `<input [nffRadixInput]="radix" [nffRadixValueType]="valueType" [formControl]="control">`,
})
class HostComponent {
  radix: Radix = 16;
  valueType: 'number' | 'string' = 'number';
  control = new FormControl<unknown>(null);
}

describe('RadixInputDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let input: HTMLInputElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    input = fixture.nativeElement.querySelector('input');
  });

  function type(text: string): void {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function blur(): void {
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }

  it('renders a numeric model in hex with the 0x prefix and uppercase digits', () => {
    host.control.setValue(26);
    expect(input.value).toBe('0x1A');
  });

  it('parses typed hex — with or without prefix, any case — to a plain number', () => {
    type('0x2A');
    expect(host.control.value).toBe(42);
    type('2a');
    expect(host.control.value).toBe(42);
  });

  it('normalizes the visible text to the prefixed spelling on blur', () => {
    type('2a');
    blur();
    expect(input.value).toBe('0x2A');
  });

  it('keeps numeric validators working on the numeric value', () => {
    host.control.setValidators(Validators.max(100));
    type('FF'); // 255
    expect(host.control.value).toBe(255);
    expect(host.control.errors?.['max']).toBeTruthy();
  });

  it('unparseable text nulls the control and flags radixFormat — the raw text never becomes the value', () => {
    type('0xZZ');
    expect(host.control.value).toBeNull();
    expect(host.control.errors?.['radixFormat']).toEqual({ radix: 16 });
    expect(input.value).toBe('0xZZ'); // the text stays visible for correction
    type('1A'); // recovers
    expect(host.control.value).toBe(26);
    expect(host.control.errors).toBeNull();
  });

  it('blur while invalid keeps the typed text instead of clearing it', () => {
    type('0xZZ');
    blur();
    expect(input.value).toBe('0xZZ');
    expect(host.control.errors?.['radixFormat']).toBeTruthy();
  });

  it('empty input clears to null without an error', () => {
    type('1A');
    type('');
    expect(host.control.value).toBeNull();
    expect(host.control.errors).toBeNull();
  });

  it('octal accepts both 0o and the libconfig 0q spelling', () => {
    host.radix = 8;
    fixture.detectChanges();
    type('0q17');
    expect(host.control.value).toBe(15);
    type('0o20');
    expect(host.control.value).toBe(16);
    blur();
    expect(input.value).toBe('0o20');
  });

  it('binary parses digits with or without 0b and renders with it', () => {
    host.radix = 2;
    fixture.detectChanges();
    type('101');
    expect(host.control.value).toBe(5);
    blur();
    expect(input.value).toBe('0b101');
  });

  it('hex digit runs that resemble another base prefix stay hex (0b11 is 0x0B11)', () => {
    type('0b11');
    expect(host.control.value).toBe(0x0b11);
  });

  it('negative values render and parse with a leading minus', () => {
    host.control.setValue(-26);
    expect(input.value).toBe('-0x1A');
    type('-1A');
    expect(host.control.value).toBe(-26);
  });

  it('string mode carries the exact decimal digits of values beyond 2^53', () => {
    host.valueType = 'string';
    fixture.detectChanges();
    host.control.setValue('9223372036854775807');
    expect(input.value).toBe('0x7FFFFFFFFFFFFFFF');
    type('0x7FFFFFFFFFFFFFFE');
    expect(host.control.value).toBe('9223372036854775806');
    expect(host.control.errors).toBeNull();
  });

  it('number mode nulls magnitudes beyond the safe range with radixRange instead of rounding', () => {
    type('0xFFFFFFFFFFFFFFFF');
    expect(host.control.value).toBeNull();
    expect(host.control.errors?.['radixRange']).toEqual({ radix: 16 });
    expect(input.value).toBe('0xFFFFFFFFFFFFFFFF');
  });

  it('safe-range boundary is exact: ±(2^53 − 1) accepted, one digit past refused', () => {
    type('0x1FFFFFFFFFFFFF'); // 2^53 − 1
    expect(host.control.value).toBe(9007199254740991);
    expect(host.control.errors).toBeNull();
    type('0x20000000000000'); // 2^53
    expect(host.control.value).toBeNull();
    expect(host.control.errors?.['radixRange']).toBeTruthy();
    type('-0x1FFFFFFFFFFFFF');
    expect(host.control.value).toBe(-9007199254740991);
    type('-0x20000000000000');
    expect(host.control.value).toBeNull();
    expect(host.control.errors?.['radixRange']).toBeTruthy();
  });

  it('a radix change after init re-renders the display and re-validates in the new base', () => {
    host.control.setValue(15);
    expect(input.value).toBe('0xF');
    host.radix = 8;
    fixture.detectChanges();
    expect(input.value).toBe('0o17');
    type('18'); // not octal digits
    expect(host.control.value).toBeNull();
    expect(host.control.errors?.['radixFormat']).toEqual({ radix: 8 });
  });

  it('setDisabledState follows the control: disable() greys the input, enable() restores it', () => {
    host.control.disable();
    expect(input.disabled).toBe(true);
    host.control.enable();
    expect(input.disabled).toBe(false);
  });
});
