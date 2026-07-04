import { FormControl } from '@angular/forms';
import {
  asFormArray,
  asFormControl,
  asFormGroup,
  nodeGroupChildrenLeafs,
  nodeGroupChildrenList,
  removeNullAndEmptyArrays,
} from './utils';
import { NodeGroup } from '../types/dynamic-recursive.types';

describe('utils', () => {
  describe('removeNullAndEmptyArrays', () => {
    it('preserves the primitive false (falsy but not null)', () => {
      expect(removeNullAndEmptyArrays(false)).toBe(false);
    });

    it('preserves the number 0', () => {
      expect(removeNullAndEmptyArrays(0)).toBe(0);
    });

    it('preserves the empty string', () => {
      expect(removeNullAndEmptyArrays('')).toBe('');
    });

    it('maps null to undefined', () => {
      expect(removeNullAndEmptyArrays(null)).toBeUndefined();
    });

    it('maps undefined to undefined', () => {
      expect(removeNullAndEmptyArrays(undefined)).toBeUndefined();
    });

    it('collapses an empty array to undefined', () => {
      expect(removeNullAndEmptyArrays([])).toBeUndefined();
    });

    it('collapses an empty object to undefined', () => {
      expect(removeNullAndEmptyArrays({})).toBeUndefined();
    });

    it('keeps a non-empty array of primitives intact', () => {
      expect(removeNullAndEmptyArrays([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('keeps valid zeros inside an array', () => {
      expect(removeNullAndEmptyArrays([0, 0])).toEqual([0, 0]);
    });

    it('drops null elements from an array', () => {
      expect(removeNullAndEmptyArrays([null, 1, null, 2])).toEqual([1, 2]);
    });

    it('keeps falsy-but-valid object properties (0, false, "")', () => {
      expect(removeNullAndEmptyArrays({ a: 0, b: false, c: '' })).toEqual({
        a: 0,
        b: false,
        c: '',
      });
    });

    it('drops null-valued object properties', () => {
      expect(removeNullAndEmptyArrays({ a: 1, b: null })).toEqual({ a: 1 });
    });

    it('recursively collapses a deeply-null object to undefined', () => {
      expect(removeNullAndEmptyArrays({ a: { b: null } })).toBeUndefined();
    });

    it('collapses an array of empty objects to undefined', () => {
      expect(removeNullAndEmptyArrays([{}, {}])).toBeUndefined();
    });

    it('collapses an array of empty arrays to undefined', () => {
      expect(removeNullAndEmptyArrays([[], []])).toBeUndefined();
    });
  });

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

  describe('children accessors', () => {
    const schema: NodeGroup = {
      kind: 'nodeGroup',
      name: 'g',
      children: {
        a: { kind: 'leaf', type: 'string', name: 'a' },
        b: { kind: 'leafList', type: 'number', name: 'b' },
        c: { kind: 'leaf', type: 'number', name: 'c' },
      },
    };

    it('nodeGroupChildrenList returns every child as {key,value}', () => {
      const list = nodeGroupChildrenList(schema);
      expect(list.map((e) => e.key)).toEqual(['a', 'b', 'c']);
      expect(list[0].value.kind).toBe('leaf');
    });

    it('nodeGroupChildrenLeafs returns only leaf children (dead-code path)', () => {
      const leafs = nodeGroupChildrenLeafs(schema);
      expect(leafs.map((e) => e.key)).toEqual(['a', 'c']);
    });
  });
});
