import { FormArray, FormControl, FormGroup } from '@angular/forms';
import {
  buildControl,
  buildFormFromSchema,
  caseFields,
} from './dynamic-recursive-forms-builder';
import { Leaf, LeafEnum, LeafList, NodeGroup, NodeGroupList, NodeType } from '../types/dynamic-recursive.types';

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

  // ---- leaf constraint validators ---------------------------------------
  it('validates string pattern (unanchored, JSON-Schema semantics), minLength and maxLength', () => {
    const leaf: Leaf = {
      kind: 'leaf', type: 'string', name: 's',
      pattern: '^[a-z]+$', minLength: 2, maxLength: 4,
    } as Leaf;
    expect((buildControl(leaf, 'abc') as FormControl).valid).toBe(true);
    expect((buildControl(leaf, 'A1') as FormControl).errors?.['pattern']).toBeTruthy();
    expect((buildControl(leaf, 'a') as FormControl).errors?.['minlength']).toBeTruthy();
    expect((buildControl(leaf, 'abcde') as FormControl).errors?.['maxlength']).toBeTruthy();
  });

  it('applies string format: email and uri validators', () => {
    const email: Leaf = { kind: 'leaf', type: 'string', name: 'e', format: 'email' } as Leaf;
    expect((buildControl(email, 'a@b.com') as FormControl).valid).toBe(true);
    expect((buildControl(email, 'nope') as FormControl).errors?.['email']).toBeTruthy();

    const uri: Leaf = { kind: 'leaf', type: 'string', name: 'u', format: 'uri' } as Leaf;
    expect((buildControl(uri, 'https://example.dev/x') as FormControl).valid).toBe(true);
    expect((buildControl(uri, 'not a uri') as FormControl).errors?.['uri']).toBeTruthy();
  });

  it('validates number min, max and multipleOf', () => {
    const leaf: Leaf = {
      kind: 'leaf', type: 'number', name: 'n', min: 1, max: 10, multipleOf: 2,
    } as Leaf;
    expect((buildControl(leaf, 4) as FormControl).valid).toBe(true);
    expect((buildControl(leaf, 0) as FormControl).errors?.['min']).toBeTruthy();
    expect((buildControl(leaf, 11) as FormControl).errors?.['max']).toBeTruthy();
    expect((buildControl(leaf, 3) as FormControl).errors?.['multipleOf']).toBeTruthy();
  });

  it('leaves an unconstrained leaf with no validation errors', () => {
    expect((buildControl(stringLeaf, 'anything') as FormControl).errors).toBeNull();
  });

  // ---- integer, nullable & presence leaves ------------------------------
  it('validates number integer', () => {
    const leaf: Leaf = { kind: 'leaf', type: 'number', name: 'n', integer: true } as Leaf;
    expect((buildControl(leaf, 5) as FormControl).valid).toBe(true);
    expect((buildControl(leaf, 5.5) as FormControl).errors?.['integer']).toBeTruthy();
  });

  it('a nullable leaf accepts null as a valid value and resets to null', () => {
    const leaf: Leaf = { kind: 'leaf', type: 'string', name: 's', nullable: true } as Leaf;
    const c = buildControl(leaf, null) as FormControl;
    expect(c.value).toBeNull();
    expect(c.valid).toBe(true);
    c.setValue('x');
    c.reset();
    expect(c.value).toBeNull(); // nonNullable is off for a nullable leaf
  });

  const presenceLeafSchema: NodeGroup = {
    kind: 'nodeGroup',
    name: 'root',
    children: {
      note: { kind: 'leaf', type: 'string', name: 'note', presence: true },
      keep: { kind: 'leaf', type: 'string', name: 'keep' },
    },
  };

  it('omits an absent presence leaf from the form and its value', () => {
    const g = buildFormFromSchema(presenceLeafSchema);
    expect(g.get('note')).toBeNull();
    expect((g.getRawValue() as any).note).toBeUndefined();
    expect(g.get('keep')).not.toBeNull();
  });

  it('keeps a presence leaf that has an initial value', () => {
    const g = buildFormFromSchema(presenceLeafSchema, { note: 'hi' });
    expect(g.get('note')).not.toBeNull();
    expect((g.getRawValue() as any).note).toBe('hi');
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

  // ---- presence groups ---------------------------------------------------
  const presenceSchema: NodeGroup = {
    kind: 'nodeGroup',
    name: 'root',
    children: {
      ntp: {
        kind: 'nodeGroup',
        name: 'ntp',
        presence: true,
        children: { server: { kind: 'leaf', type: 'string', name: 'server' } },
      },
    },
  };

  it('omits an absent presence group from the form and its value', () => {
    const g = buildFormFromSchema(presenceSchema);
    expect(g.get('ntp')).toBeNull();
    expect((g.getRawValue() as any).ntp).toBeUndefined();
  });

  it('keeps a presence group that has an initial value', () => {
    const g = buildFormFromSchema(presenceSchema, { ntp: { server: 'pool.ntp.org' } });
    expect(g.get('ntp')).not.toBeNull();
    expect((g.getRawValue() as any).ntp).toEqual({ server: 'pool.ntp.org' });
  });

  // ---- choice ------------------------------------------------------------
  const choiceSchema: NodeGroup = {
    kind: 'nodeGroup',
    name: 'root',
    children: {
      transport: {
        kind: 'choice',
        name: 'transport',
        cases: {
          tcp: { 'tcp-port': { kind: 'leaf', type: 'number', name: 'tcp-port' } },
          udp: { 'udp-port': { kind: 'leaf', type: 'number', name: 'udp-port' } },
        },
      },
    },
  };

  it('builds a choice group with __case and only the active case fields', () => {
    const g = buildFormFromSchema(choiceSchema, { transport: { __case: 'tcp', 'tcp-port': 443 } });
    const t = g.get('transport') as FormGroup;
    expect(t.get('__case')!.value).toBe('tcp');
    expect(t.get('tcp-port')!.value).toBe(443);
    expect(t.get('udp-port')).toBeNull();
  });

  it('builds a choice group with no case selected as just __case', () => {
    const g = buildFormFromSchema(choiceSchema);
    const t = g.get('transport') as FormGroup;
    expect(t.get('__case')!.value).toBeNull();
    expect(Object.keys(t.controls)).toEqual(['__case']);
  });

  // ---- choice: anonymous cases, __case inference, leaf-bodied ------------
  const scopeSchema: NodeGroup = {
    kind: 'nodeGroup',
    name: 'root',
    children: {
      // anyOf-style: anonymous cases discriminated by which field is present.
      scope: {
        kind: 'choice',
        name: 'scope',
        cases: {
          byUe: { ueId: { kind: 'leaf', type: 'string', name: 'ueId' } },
          byCell: { cellId: { kind: 'leaf', type: 'string', name: 'cellId' } },
        },
      },
    },
  };

  it('infers the active choice case from inline data that has no __case', () => {
    const g = buildFormFromSchema(scopeSchema, { scope: { cellId: 'c-1' } });
    const c = g.get('scope') as FormGroup;
    expect(c.get('__case')!.value).toBe('byCell');
    expect(c.get('cellId')!.value).toBe('c-1');
    expect(c.get('ueId')).toBeNull();
  });

  it('normalizes a leaf-bodied case to a single-field record keyed by the node name', () => {
    const schema: NodeGroup = {
      kind: 'nodeGroup',
      name: 'root',
      children: {
        val: {
          kind: 'choice',
          name: 'val',
          cases: {
            asText: { kind: 'leaf', type: 'string', name: 'text' }, // leaf-bodied
            asNum: { n: { kind: 'leaf', type: 'number', name: 'n' } }, // field record
          },
        },
      },
    };
    const g = buildFormFromSchema(schema, { val: { __case: 'asText', text: 'hi' } });
    const c = g.get('val') as FormGroup;
    expect(c.get('__case')!.value).toBe('asText');
    expect(c.get('text')!.value).toBe('hi');
  });

  it('caseFields returns a field record as-is and wraps a single node', () => {
    const record = { a: { kind: 'leaf', type: 'string', name: 'a' } } as Record<string, NodeType>;
    expect(caseFields(record)).toBe(record);
    const single = { kind: 'leaf', type: 'string', name: 'x' } as NodeType;
    expect(Object.keys(caseFields(single))).toEqual(['x']);
  });

  // ---- map / dictionary node --------------------------------------------
  const mapSchema: NodeGroup = {
    kind: 'nodeGroup',
    name: 'root',
    children: {
      labels: {
        kind: 'map',
        name: 'labels',
        value: { kind: 'leaf', type: 'string', name: 'value' },
      },
    },
  };

  it('builds a map as a FormGroup keyed by the entry keys; getRawValue is the object', () => {
    const g = buildFormFromSchema(mapSchema, { labels: { env: 'prod', tier: 'db' } });
    const m = g.get('labels') as FormGroup;
    expect(Object.keys(m.controls).sort()).toEqual(['env', 'tier']);
    expect(m.get('env')!.value).toBe('prod');
    expect((g.getRawValue() as any).labels).toEqual({ env: 'prod', tier: 'db' });
  });

  it('builds an empty map when no initial object is supplied', () => {
    const g = buildFormFromSchema(mapSchema);
    expect(Object.keys((g.get('labels') as FormGroup).controls)).toEqual([]);
  });

  it('builds a map whose value schema is a nodeGroup (round-trips nested objects)', () => {
    const schema: NodeGroup = {
      kind: 'nodeGroup',
      name: 'root',
      children: {
        backends: {
          kind: 'map',
          name: 'backends',
          value: {
            kind: 'nodeGroup',
            name: 'backend',
            children: { port: { kind: 'leaf', type: 'number', name: 'port' } },
          },
        },
      },
    };
    const data = { backends: { a: { port: 1 }, b: { port: 2 } } };
    const g = buildFormFromSchema(schema, data);
    expect((g.getRawValue() as any).backends).toEqual(data.backends);
  });
});
