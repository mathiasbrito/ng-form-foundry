import { FormArray, FormControl, FormGroup } from '@angular/forms';
import {
  buildControl,
  buildFormFromSchema,
} from './dynamic-recursive-forms-builder';
import { Leaf, LeafEnum, LeafList, NodeGroup, NodeGroupList } from '../types/dynamic-recursive.types';

/**
 * P0 pure-function tests for the schema -> FormGroup builder.
 *
 * The initial-value and list-truncation bugs are FIXED, and the round-trip
 * tests below assert the corrected behaviour. A few `// BUG:` blocks remain:
 * they pin known, still-open issues (spurious [null] seed, nullable leafList
 * controls, ignored minItems, and the record-key vs node.name mismatch) so the
 * suite documents current reality until those are addressed separately.
 */
describe('dynamic-recursive-forms-builder', () => {
  // ---- fixtures ----------------------------------------------------------
  const stringLeaf: Leaf = { kind: 'leaf', type: 'string', name: 'title' };
  const numberLeafDefault: Leaf = {
    kind: 'leaf',
    type: 'number',
    name: 'count',
    default: 7,
  };
  const requiredLeaf: Leaf = {
    kind: 'leaf',
    type: 'string',
    name: 'req',
    required: true,
  };
  const enumLeaf: LeafEnum = {
    kind: 'leaf',
    type: 'enum',
    name: 'color',
    enum: ['red', 'green'],
  };

  const twoLeafGroup: NodeGroup = {
    kind: 'nodeGroup',
    name: 'point',
    children: {
      x: { kind: 'leaf', type: 'number', name: 'x' },
      y: { kind: 'leaf', type: 'number', name: 'y' },
    },
  };

  const groupWithLeafList: NodeGroup = {
    kind: 'nodeGroup',
    name: 'tagged',
    children: {
      tags: { kind: 'leafList', type: 'string', name: 'tags' },
    },
  };

  const groupWithGroupList: NodeGroup = {
    kind: 'nodeGroup',
    name: 'bag',
    children: {
      items: {
        kind: 'nodeGroupList',
        name: 'items',
        type: {
          kind: 'nodeGroup',
          name: 'item',
          children: { v: { kind: 'leaf', type: 'number', name: 'v' } },
        },
      } as NodeGroupList,
    },
  };

  // ---- buildControl: leaves ---------------------------------------------
  it('builds a nullable string leaf whose value is null when no default/initial', () => {
    const c = buildControl(stringLeaf) as FormControl;
    expect(c instanceof FormControl).toBe(true);
    expect(c.value).toBeNull();
  });

  it('applies leaf.default when no initial is supplied', () => {
    const c = buildControl(numberLeafDefault) as FormControl;
    expect(c.value).toBe(7);
  });

  it('lets an explicit initial win over the default', () => {
    const c = buildControl(numberLeafDefault, 42) as FormControl;
    expect(c.value).toBe(42);
  });

  it('preserves a valid falsy initial like 0 on a leaf (?? semantics)', () => {
    const c = buildControl({ kind: 'leaf', type: 'number', name: 'z' } as Leaf, 0) as FormControl;
    expect(c.value).toBe(0);
  });

  it('adds Validators.required so an empty required leaf is invalid', () => {
    const c = buildControl(requiredLeaf) as FormControl;
    expect(c.errors?.['required']).toBe(true);
    expect(c.invalid).toBe(true);
  });

  it('adds an enum validator that rejects out-of-set values', () => {
    const bad = buildControl(enumLeaf, 'purple') as FormControl;
    expect(bad.errors?.['enum']).toBe(true);
    const good = buildControl(enumLeaf, 'red') as FormControl;
    expect(good.errors).toBeNull();
  });

  // ---- buildControl: leaf list ------------------------------------------
  it('builds a FormArray from a leafList array initial (direct call works)', () => {
    const arr = buildControl(
      { kind: 'leafList', type: 'string', name: 'tags' } as LeafList,
      ['a', 'b', 'c'],
    ) as FormArray;
    expect(arr instanceof FormArray).toBe(true);
    expect(arr.length).toBe(3);
    expect(arr.getRawValue()).toEqual(['a', 'b', 'c']);
  });

  it('BUG: seeds a spurious [null] entry when a leafList has no initial and no default', () => {
    const arr = buildControl(
      { kind: 'leafList', type: 'string', name: 'tags' } as LeafList,
    ) as FormArray;
    // pins current buggy behaviour: one null control instead of an empty array
    expect(arr.length).toBe(1);
    expect(arr.at(0).value).toBeNull();
    // CORRECT behaviour would be: expect(arr.length).toBe(0);
  });

  it('BUG: leafList child controls are nullable, contradicting the non-null typed model', () => {
    const arr = buildControl(
      { kind: 'leafList', type: 'string', name: 'tags' } as LeafList,
      ['a'],
    ) as FormArray<FormControl>;
    arr.at(0).setValue(null); // succeeds today; a non-null control would reject/retype this
    expect(arr.at(0).value).toBeNull();
  });

  it('BUG: leafList ignores minItems (should pre-seed minItems empty controls)', () => {
    const arr = buildControl(
      { kind: 'leafList', type: 'string', name: 'tags', minItems: 3 } as LeafList,
    ) as FormArray;
    expect(arr.length).toBe(1); // pins bug; CORRECT would be 3
  });

  // ---- buildControl: node group list ------------------------------------
  it('builds one FormGroup per element when given a group-list array directly', () => {
    const list: NodeGroupList = {
      kind: 'nodeGroupList',
      name: 'items',
      type: {
        kind: 'nodeGroup',
        name: 'item',
        children: { v: { kind: 'leaf', type: 'number', name: 'v' } },
      },
    };
    const arr = buildControl(list, [{ v: 1 }, { v: 2 }]) as FormArray;
    expect(arr.length).toBe(2);
  });

  // ---- buildNodeGroupControl / buildFormFromSchema: initial-value round-trips
  it('seeds each leaf with its own value from the initial object', () => {
    const g = buildFormFromSchema(twoLeafGroup, { x: 1, y: 2 });
    expect(g.get('x')!.value).toBe(1);
    expect(g.get('y')!.value).toBe(2);
  });

  it('round-trip: getRawValue() deep-equals the seed data', () => {
    const data = { x: 1, y: 2 };
    const g = buildFormFromSchema(twoLeafGroup, data);
    expect(g.getRawValue()).toEqual(data);
  });

  it('round-trip: a multi-item group-list keeps every element', () => {
    const data = { items: [{ v: 1 }, { v: 2 }, { v: 3 }] };
    const g = buildFormFromSchema(groupWithGroupList, data);
    const items = g.get('items') as FormArray;
    expect(items.length).toBe(3);
    expect(g.getRawValue()).toEqual(data);
  });

  it('round-trip: leafList data survives a build through its parent', () => {
    const data = { tags: ['a', 'b'] };
    const g = buildFormFromSchema(groupWithLeafList, data);
    const tags = g.get('tags') as FormArray;
    expect(tags.getRawValue()).toEqual(['a', 'b']);
    expect(g.getRawValue()).toEqual(data);
  });

  // ---- key-vs-name mismatch ---------------------------------------------
  it('BUG: controls are keyed by the schema record KEY, not by node.name', () => {
    const schema: NodeGroup = {
      kind: 'nodeGroup',
      name: 'root',
      children: {
        // record key differs from the leaf.name that renderers resolve by
        recordKey: { kind: 'leaf', type: 'string', name: 'nodeName' },
      },
    };
    const g = buildFormFromSchema(schema);
    expect(g.get('recordKey')).not.toBeNull(); // builder keys by 'recordKey'
    expect(g.get('nodeName')).toBeNull(); // renderers look up 'nodeName' -> null -> crash
  });

  it('produces a FormGroup whose keys are exactly the children record keys', () => {
    const g = buildFormFromSchema(twoLeafGroup);
    expect(g instanceof FormGroup).toBe(true);
    expect(Object.keys(g.controls).sort()).toEqual(['x', 'y']);
  });
});
