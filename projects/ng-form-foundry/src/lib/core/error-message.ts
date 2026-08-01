import { ValidationErrors } from '@angular/forms';

/**
 * A human-readable message for a control's active validation error, given the
 * field's display `label`; `''` when there is no error. Shared by the leaf
 * renderer's inline `mat-error` and the config editor's error tooltip so both
 * phrase the same error identically. Reports the first matching error in a
 * fixed precedence.
 */
export function describeControlError(errors: ValidationErrors | null, label: string): string {
  const e = errors;
  if (!e) return '';
  if (e['required']) return `${label} is required`;
  if (e['radixFormat']) {
    const names: Record<number, string> = { 16: 'hexadecimal (0x…)', 8: 'octal (0o…)', 2: 'binary (0b…)' };
    return `Must be a ${names[e['radixFormat'].radix] ?? 'based'} number`;
  }
  if (e['radixRange']) return 'Too large to edit exactly (beyond ±2^53)';
  if (e['minlength']) return `Must be at least ${e['minlength'].requiredLength} characters`;
  if (e['maxlength']) return `Must be at most ${e['maxlength'].requiredLength} characters`;
  if (e['pattern']) return `Must match ${e['pattern'].requiredPattern ?? 'the required pattern'}`;
  if (e['email']) return 'Must be a valid email address';
  if (e['uri']) return 'Must be a valid URI';
  if (e['min']) return `Must be ≥ ${e['min'].min}`;
  if (e['max']) return `Must be ≤ ${e['max'].max}`;
  if (e['multipleOf']) return `Must be a multiple of ${e['multipleOf'].multipleOf}`;
  if (e['enum']) return 'Not an allowed value';
  return 'Invalid value';
}
