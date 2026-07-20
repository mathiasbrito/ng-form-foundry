import { Directive, ElementRef, Input, OnChanges, forwardRef } from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';

export type Radix = 2 | 8 | 16;

const PREFIX: Record<Radix, string> = { 16: '0x', 8: '0o', 2: '0b' };
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * An integer as a prefixed literal in the given base: `0x1A`, `0o17`, `0b101`,
 * hex digits uppercase, a leading `-` for negatives. Accepts a number or a
 * decimal-digit string (the beyond-safe-range carry).
 */
export function formatRadix(value: number | string, radix: Radix): string {
  const big = BigInt(value);
  const negative = big < 0n;
  const digits = (negative ? -big : big).toString(radix);
  return (negative ? '-' : '') + PREFIX[radix] + (radix === 16 ? digits.toUpperCase() : digits);
}

/**
 * Presents an integer control in hex/octal/binary while the control value
 * stays what the schema and validators expect: a plain `number`, or — with
 * `nffRadixValueType="string"` — the exact decimal-digit string that carries
 * integers beyond the safe range (±(2^53 − 1)). Only the visible text is
 * based (`0x1A`, `0o17`, `0b101`); `min`/`max`/`integer`/`pattern` validators
 * therefore apply unchanged.
 *
 * Typing accepts the base's digits with or without prefix, case-insensitive
 * (`0q` is also accepted for octal, as in libconfig); the text normalizes to
 * the prefixed spelling on blur. Unparseable text sets the control to `null`
 * with a `radixFormat` error — never the raw text, so an invalid entry can
 * reach neither the wire value nor a typed write-back; the text itself stays
 * in the input for the user to correct. In number mode a magnitude beyond the
 * safe range likewise yields `null` with `radixRange` instead of a silently
 * rounded number.
 */
@Directive({
  selector: 'input[nffRadixInput]',
  standalone: true,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => RadixInputDirective), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => RadixInputDirective), multi: true },
  ],
  host: {
    '(input)': 'onInput(el.nativeElement.value)',
    '(blur)': 'onBlur()',
    autocomplete: 'off',
    spellcheck: 'false',
  },
})
export class RadixInputDirective implements ControlValueAccessor, Validator, OnChanges {
  /** The display base. */
  @Input({ required: true, alias: 'nffRadixInput' }) radix!: Radix;
  /**
   * What the control carries: `'number'` (default), or `'string'` for the
   * decimal-digit bigint carry of a string leaf.
   */
  @Input({ alias: 'nffRadixValueType' }) valueType: 'number' | 'string' = 'number';

  private modelValue: unknown = null;
  private parseError: 'format' | 'range' | null = null;
  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};
  private onValidatorChange: () => void = () => {};

  constructor(protected readonly el: ElementRef<HTMLInputElement>) {}

  /** A changed base (or carry mode) re-renders the model and re-validates. */
  ngOnChanges(): void {
    this.render();
    this.onValidatorChange();
  }

  writeValue(value: unknown): void {
    this.modelValue = value;
    this.parseError = null;
    this.render();
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.el.nativeElement.disabled = isDisabled;
  }

  validate(_control: AbstractControl): ValidationErrors | null {
    if (this.parseError === 'format') return { radixFormat: { radix: this.radix } };
    if (this.parseError === 'range') return { radixRange: { radix: this.radix } };
    return null;
  }

  protected onInput(text: string): void {
    const trimmed = text.trim();
    if (trimmed === '') {
      this.parseError = null;
      this.modelValue = null;
      this.onChange(null);
      return;
    }
    const big = this.parse(trimmed);
    if (big === null) {
      // Invalid entry: the control gets null (never the raw text), the error
      // marks it, and the element keeps the text for the user to correct.
      this.parseError = 'format';
      this.modelValue = null;
      this.onChange(null);
      return;
    }
    if (this.valueType === 'string') {
      this.parseError = null;
      this.modelValue = big.toString();
      this.onChange(this.modelValue);
      return;
    }
    if (big > MAX_SAFE || big < MIN_SAFE) {
      // A number control cannot hold this exactly: null it, flag it.
      this.parseError = 'range';
      this.modelValue = null;
      this.onChange(null);
      return;
    }
    this.parseError = null;
    this.modelValue = Number(big);
    this.onChange(this.modelValue);
  }

  protected onBlur(): void {
    this.onTouched();
    if (this.parseError === null) this.render(); // normalize e.g. `1a` → `0x1A`
  }

  /** Show the model in its base; unrepresentable models pass through as text. */
  private render(): void {
    if (!this.radix) return; // before the first input binding — rendered once bound
    const v = this.modelValue;
    let text: string;
    if (v == null || v === '') text = '';
    else if (typeof v === 'number' && Number.isInteger(v)) text = formatRadix(v, this.radix);
    else if (typeof v === 'string' && /^[-+]?[0-9]+$/.test(v)) text = formatRadix(v, this.radix);
    else text = String(v);
    this.el.nativeElement.value = text;
  }

  /**
   * `[-+]?` + this base's optional prefix + this base's digits, or null. The
   * prefix is base-specific so hex digit runs that merely *look* like another
   * base's prefix (`0b11` as hex 0x0B11) parse as digits, not as a rejection.
   */
  private parse(text: string): bigint | null {
    const re =
      this.radix === 16
        ? /^([-+]?)(?:0[xX])?([0-9a-fA-F]+)$/
        : this.radix === 8
          ? /^([-+]?)(?:0[oOqQ])?([0-7]+)$/
          : /^([-+]?)(?:0[bB])?([01]+)$/;
    const m = re.exec(text);
    if (!m) return null;
    const big = BigInt(PREFIX[this.radix] + m[2]!.toLowerCase());
    return m[1] === '-' ? -big : big;
  }
}
