import { FormControl } from '@angular/forms';
import { asFormArray, asFormControl, asFormGroup } from './utils';

describe('utils', () => {
  describe('cast helpers (blindly cast — no runtime guard)', () => {
    it('BUG: asFormControl passes null straight through as a non-null control', () => {
      // returns null, then callers dereference `.value` / `.get()` -> crash
      expect(asFormControl(null)).toBeNull();
    });

    it('BUG: asFormArray passes null straight through', () => {
      expect(asFormArray(null)).toBeNull();
    });

    it('BUG: asFormGroup passes null straight through', () => {
      expect(asFormGroup(null)).toBeNull();
    });

    it('is an identity cast for a real control', () => {
      const c = new FormControl('hi');
      expect(asFormControl(c)).toBe(c);
    });
  });
});
