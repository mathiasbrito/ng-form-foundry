import { FormArray, FormControl, FormGroup } from '@angular/forms';
import {
  addMapEntry,
  buildControl,
  buildFormFromSchema,
  caseFields,
  removeMapEntry,
  renameMapEntry,
  resolveChoiceCase,
  serializeForm,
  switchChoiceCase,
  toWireValue,
} from './dynamic-recursive-forms-builder';
import {
  CASE_KEY,
  Leaf,
  LeafEnum,
  LeafList,
  NodeChoice,
  NodeGroup,
  NodeGroupList,
  NodeMap,
  NodeType,
} from '../types/dynamic-recursive.types';

/**
 * P0 pure-function tests for the schema -> FormGroup builder.
 *
 * The initial-value, list-truncation, and phantom-[null]-seed bugs are FIXED,
 * and the round-trip tests below assert the corrected behaviour. A few
 * `// BUG:` blocks remain: they pin known, still-open issues (nullable
 * leafList controls, no minItems validator, and the record-key vs node.name
 * mismatch) so the suite documents current reality until those are addressed
 * separately.
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

  it('seeds an empty array when a leafList has no initial and no default', () => {
    const arr = buildControl(
      { kind: 'leafList', type: 'string', name: 'tags' } as LeafList,
    ) as FormArray;
    // A phantom [null] entry would fail wire validation against typed items.
    expect(arr.length).toBe(0);
    expect(arr.getRawValue()).toEqual([]);
  });

  it('a leafList default still seeds the initial entries', () => {
    const arr = buildControl(
      { kind: 'leafList', type: 'string', name: 'tags', default: ['a'] } as LeafList,
    ) as FormArray;
    expect(arr.getRawValue()).toEqual(['a']);
  });

  it('seeds an empty array when a nodeGroupList has no initial data', () => {
    const list: NodeGroupList = {
      kind: 'nodeGroupList',
      name: 'items',
      type: { kind: 'nodeGroup', name: 'item', children: { x: { kind: 'leaf', type: 'string', name: 'x' } } },
    };
    const arr = buildControl(list) as FormArray;
    // A phantom all-null group would put an invalid member on the wire.
    expect(arr.length).toBe(0);
    expect(arr.getRawValue()).toEqual([]);
  });

  it('BUG: leafList child controls are nullable, contradicting the non-null typed model', () => {
    const arr = buildControl(
      { kind: 'leafList', type: 'string', name: 'tags' } as LeafList,
      ['a'],
    ) as FormArray<FormControl>;
    arr.at(0).setValue(null); // succeeds today; a non-null control would reject/retype this
    expect(arr.at(0).value).toBeNull();
  });

  it('BUG: leafList carries no minItems validator (an under-filled list reports valid)', () => {
    const arr = buildControl(
      { kind: 'leafList', type: 'string', name: 'tags', minItems: 3 } as LeafList,
    ) as FormArray;
    expect(arr.length).toBe(0); // empty seed — entries are user-added
    expect(arr.valid).toBe(true); // pins the gap: nothing flags length < minItems
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

  // ---- shared choice/map mutation helpers --------------------------------

  describe('switchChoiceCase', () => {
    const choice: NodeChoice = {
      kind: 'choice',
      name: 'transport',
      cases: {
        tcp: { port: { kind: 'leaf', type: 'number', name: 'port' } },
        tls: { cert: { kind: 'leaf', type: 'string', name: 'cert', default: 'pem' } },
      },
    };

    it('sets __case, removes the old fields, and builds the new case with defaults', () => {
      const group = buildControl(choice, { tcp: true, port: 443 }) as FormGroup;
      expect(group.get(CASE_KEY)!.value).toBe('tcp');

      switchChoiceCase(group, choice, 'tls');

      expect(group.get(CASE_KEY)!.value).toBe('tls');
      expect(group.get('port')).toBeNull();
      expect(group.get('cert')!.value).toBe('pem');
    });

    it('leaves only __case for an unknown case name', () => {
      const group = buildControl(choice, { port: 80 }) as FormGroup;

      switchChoiceCase(group, choice, 'udp');

      expect(group.get(CASE_KEY)!.value).toBe('udp');
      expect(Object.keys(group.controls)).toEqual([CASE_KEY]);
    });

    it('swaps atomically: one value change whose fields match the discriminator', () => {
      const group = buildControl(choice, { port: 443 }) as FormGroup;
      const snapshots: Record<string, unknown>[] = [];
      group.valueChanges.subscribe((v) => snapshots.push(v));

      switchChoiceCase(group, choice, 'tls');

      expect(snapshots.length).toBe(1); // no per-mutation transients
      expect(snapshots[0]).toEqual({ [CASE_KEY]: 'tls', cert: 'pem' });
    });
  });

  describe('map entry helpers', () => {
    const map: NodeMap = {
      kind: 'map',
      name: 'servers',
      keyPattern: '^[a-z][a-z0-9]*$',
      minEntries: 1,
      maxEntries: 3,
      value: { kind: 'leaf', type: 'string', name: 'value' },
    };

    function mapGroup(initial: Record<string, unknown>): FormGroup {
      return buildControl(map, initial) as FormGroup;
    }

    it('addMapEntry generates the first free keyN placeholder', () => {
      const g = mapGroup({ key1: 'a' });
      expect(addMapEntry(g, map)).toBe('key2');
      expect(g.get('key2')).toBeTruthy();
    });

    it('addMapEntry with an explicit key rejects duplicates and keyPattern violations', () => {
      const g = mapGroup({ web: 'a' });
      expect(addMapEntry(g, map, 'web')).toBeNull();
      expect(addMapEntry(g, map, '1bad')).toBeNull();
      expect(addMapEntry(g, map, 'db')).toBe('db');
    });

    it('addMapEntry refuses to grow past maxEntries', () => {
      const g = mapGroup({ a: '1', b: '2', c: '3' });
      expect(addMapEntry(g, map)).toBeNull();
      expect(Object.keys(g.controls).length).toBe(3);
    });

    it('renameMapEntry keeps the renamed entry at its position in the key order', () => {
      const g = mapGroup({ web: 'a', db: 'b', cache: 'c' });
      let emissions = 0;
      g.valueChanges.subscribe(() => emissions++);

      expect(renameMapEntry(g, map, 'db', 'store')).toBe(true);

      expect(Object.keys(g.controls)).toEqual(['web', 'store', 'cache']);
      expect(Object.keys(g.getRawValue() as Record<string, unknown>)).toEqual(['web', 'store', 'cache']);
      expect(emissions).toBe(1); // one value change for the whole rename
    });

    it('renameMapEntry preserves the control instance and guards bad keys', () => {
      const g = mapGroup({ web: 'a', db: 'b' });
      const control = g.get('web');

      expect(renameMapEntry(g, map, 'web', 'edge')).toBe(true);
      expect(g.get('edge')).toBe(control);
      expect(g.get('web')).toBeNull();

      expect(renameMapEntry(g, map, 'edge', '')).toBe(false);
      expect(renameMapEntry(g, map, 'edge', 'edge')).toBe(false);
      expect(renameMapEntry(g, map, 'edge', 'db')).toBe(false);
      expect(renameMapEntry(g, map, 'edge', 'BAD')).toBe(false);
      expect(g.get('edge')).toBe(control);
    });

    it('removeMapEntry removes an entry but not below minEntries', () => {
      const g = mapGroup({ web: 'a', db: 'b' });
      expect(removeMapEntry(g, map, 'web')).toBe(true);
      expect(removeMapEntry(g, map, 'db')).toBe(false); // at minEntries: 1
      expect(Object.keys(g.controls)).toEqual(['db']);
    });

    it('trims explicit keys and rejects empty or whitespace-only ones', () => {
      const g = mapGroup({ web: 'a' });
      expect(addMapEntry(g, map, '')).toBeNull();
      expect(addMapEntry(g, map, '   ')).toBeNull();
      expect(addMapEntry(g, map, '  db  ')).toBe('db');
      expect(g.contains('db')).toBe(true);
    });

    it('generates keyN placeholders from the entry count, skipping taken names', () => {
      const openMap: NodeMap = { kind: 'map', name: 'm', value: { kind: 'leaf', type: 'string', name: 'value' } };
      const g = buildControl(openMap, {}) as FormGroup;
      expect(addMapEntry(g, openMap)).toBe('key1');
      expect(addMapEntry(g, openMap)).toBe('key2');
      expect(renameMapEntry(g, openMap, 'key2', 'key3')).toBe(true);
      expect(addMapEntry(g, openMap)).toBe('key4'); // key3 taken; count-based start probes forward
    });

    it('surfaces keyPattern/minEntries/maxEntries violations as group validation errors', () => {
      // Seeded wire data that violates the pattern: committed, but the form reports it.
      const seeded = buildControl(map, { 'BAD KEY': 'x' }) as FormGroup;
      expect(seeded.errors?.['keyPattern']).toEqual({ pattern: map.keyPattern, keys: ['BAD KEY'] });

      // Below minEntries: invalid until an entry exists.
      const empty = buildControl(map, {}) as FormGroup;
      expect(empty.errors?.['minEntries']).toEqual({ required: 1, actual: 0 });

      // A generated placeholder violating a strict pattern is committed for
      // renaming, and flagged by the validator until it is renamed.
      const strict: NodeMap = {
        kind: 'map',
        name: 'm',
        keyPattern: '^[a-z]+$',
        value: { kind: 'leaf', type: 'string', name: 'value' },
      };
      const g = buildControl(strict, { web: 'a' }) as FormGroup;
      expect(g.valid).toBe(true);
      expect(addMapEntry(g, strict)).toBe('key2');
      expect(g.errors?.['keyPattern']).toEqual({ pattern: '^[a-z]+$', keys: ['key2'] });
      expect(renameMapEntry(g, strict, 'key2', 'db')).toBe(true);
      expect(g.valid).toBe(true);
    });

    it('rejects the reserved __case name as an entry key (add and rename)', () => {
      const g = mapGroup({ web: 'a' });
      expect(addMapEntry(g, map, CASE_KEY)).toBeNull();
      expect(renameMapEntry(g, map, 'web', CASE_KEY)).toBe(false);
      expect(Object.keys(g.controls)).toEqual(['web']);
    });

    it('treats dotted keys as verbatim entry names, never as dot-delimited control paths', () => {
      const openMap: NodeMap = { kind: 'map', name: 'endpoints', value: { kind: 'leaf', type: 'string', name: 'value' } };
      const g = buildControl(openMap, { '10.0.0.1': 'edge', 'web.example.com': 'www' }) as FormGroup;

      expect(renameMapEntry(g, openMap, '10.0.0.1', 'gateway.local')).toBe(true);
      expect(g.controls['gateway.local'].value).toBe('edge');
      expect(g.controls['10.0.0.1']).toBeUndefined();

      expect(removeMapEntry(g, openMap, 'web.example.com')).toBe(true);
      expect((g.getRawValue() as Record<string, unknown>)).toEqual({ 'gateway.local': 'edge' });
    });
  });

  it('throws when a case field uses the reserved __case name instead of clobbering the discriminator', () => {
    const bad: NodeChoice = {
      kind: 'choice',
      name: 'mode',
      cases: { a: { [CASE_KEY]: { kind: 'leaf', type: 'string', name: CASE_KEY } } },
    };
    expect(() => caseFields(bad.cases['a'])).toThrowError(/reserved/);
    expect(() => buildControl(bad, { [CASE_KEY]: 'a' })).toThrowError(/reserved/);
  });

  it('never builds a control for an absent presence choice', () => {
    const schema: NodeGroup = {
      kind: 'nodeGroup',
      name: 'root',
      children: {
        mode: {
          kind: 'choice',
          name: 'mode',
          presence: true,
          cases: { a: { x: { kind: 'leaf', type: 'string', name: 'x' } } },
        },
      },
    };
    expect(buildFormFromSchema(schema).get('mode')).toBeNull();
    expect(buildFormFromSchema(schema, { mode: { x: '1' } }).get('mode')).toBeInstanceOf(FormGroup);
  });

  // ---- presence at depth: list items, map values, choice cases -----------

  describe('presence descendants beyond plain groups', () => {
    it('a presence leaf inside a list item starts absent per item and follows each item&apos;s data', () => {
      const schema: NodeGroup = {
        kind: 'nodeGroup',
        name: 'root',
        children: {
          items: {
            kind: 'nodeGroupList',
            name: 'items',
            type: {
              kind: 'nodeGroup',
              name: 'item',
              children: {
                name: { kind: 'leaf', type: 'string', name: 'name' },
                note: { kind: 'leaf', type: 'string', name: 'note', presence: true },
              },
            },
          },
        },
      };
      const g = buildFormFromSchema(schema, { items: [{ name: 'a' }, { name: 'b', note: 'kept' }] });
      expect((g.getRawValue() as any).items).toEqual([{ name: 'a' }, { name: 'b', note: 'kept' }]);
    });

    it('a presence group inside a map value starts absent unless the entry data carries it', () => {
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
              children: {
                url: { kind: 'leaf', type: 'string', name: 'url' },
                tls: {
                  kind: 'nodeGroup',
                  name: 'tls',
                  presence: true,
                  children: { cert: { kind: 'leaf', type: 'string', name: 'cert' } },
                },
              },
            },
          },
        },
      };
      const data = { backends: { a: { url: 'http://a' }, b: { url: 'https://b', tls: { cert: 'pem' } } } };
      const g = buildFormFromSchema(schema, data);
      expect((g.getRawValue() as any).backends).toEqual(data.backends);
    });

    it('a presence field inside a choice case starts absent and stays absent on a case switch', () => {
      const choice: NodeChoice = {
        kind: 'choice',
        name: 'scope',
        cases: {
          byNode: {
            nodeId: { kind: 'leaf', type: 'string', name: 'nodeId' },
            priority: { kind: 'leaf', type: 'number', name: 'priority', presence: true },
          },
          byZone: { kind: 'leaf', type: 'string', name: 'zoneId' },
        },
      };
      const g = buildControl(choice, { nodeId: 'n1' }) as FormGroup;
      expect(g.get('priority')).toBeNull();
      expect(g.getRawValue()).toEqual({ [CASE_KEY]: 'byNode', nodeId: 'n1' });

      const seeded = buildControl(choice, { nodeId: 'n1', priority: 5 }) as FormGroup;
      expect(seeded.get('priority')!.value).toBe(5);

      switchChoiceCase(g, choice, 'byZone');
      switchChoiceCase(g, choice, 'byNode');
      expect(g.get('nodeId')).toBeTruthy();
      expect(g.get('priority')).toBeNull(); // a switch carries no data to make it present
    });

    it('keeps a nullable presence leaf whose key is present with an explicit null (null is a value, absence is the missing key)', () => {
      const schema: NodeGroup = {
        kind: 'nodeGroup',
        name: 'root',
        children: {
          note: { kind: 'leaf', type: 'string', name: 'note', presence: true, nullable: true },
        },
      };
      expect(buildFormFromSchema(schema).get('note')).toBeNull();
      const seeded = buildFormFromSchema(schema, { note: null });
      expect(seeded.get('note')).toBeTruthy();
      expect(seeded.getRawValue() as Record<string, unknown>).toEqual({ note: null });
    });
  });

  describe('choice case inference (required-aware ranking)', () => {
    // The O-RAN A1 scope pattern: one branch's fields are a subset of another's.
    const scope: NodeChoice = {
      kind: 'choice',
      name: 'scope',
      cases: {
        case0: {
          ueId: { kind: 'leaf', type: 'number', name: 'ueId', required: true, integer: true },
          qosId: { kind: 'leaf', type: 'number', name: 'qosId', required: true, integer: true },
        },
        case1: {
          qosId: { kind: 'leaf', type: 'number', name: 'qosId', required: true, integer: true },
        },
      },
    };

    it('picks the subset case when the data lacks the superset case required field', () => {
      // Overlap alone ties 1=1; the old first-wins tie-break chose case0 and
      // serialized an ajv-invalid { ueId: null, qosId } body.
      expect(resolveChoiceCase(scope, { qosId: 5 })).toBe('case1');
    });

    it('still picks the superset case when the data covers it', () => {
      expect(resolveChoiceCase(scope, { ueId: 7, qosId: 5 })).toBe('case0');
    });

    it('a non-leaf required field (nodeGroup) counts as missing — no tightest-case bias', () => {
      // Reviewer counterexample: data {shared} is valid against case0 only.
      // Ranking by "fewest fields" would wrongly pick case1 (its cfg group is
      // invisible to a required-Leaf-only check); absence of any non-presence
      // field must count regardless of kind.
      const choice: NodeChoice = {
        kind: 'choice',
        name: 'outer',
        cases: {
          case0: {
            shared: { kind: 'leaf', type: 'number', name: 'shared', required: true, integer: true },
            opt1: { kind: 'leaf', type: 'string', name: 'opt1', presence: true },
            opt2: { kind: 'leaf', type: 'string', name: 'opt2', presence: true },
          },
          case1: {
            shared: { kind: 'leaf', type: 'number', name: 'shared', required: true, integer: true },
            cfg: {
              kind: 'nodeGroup',
              name: 'cfg',
              children: { x: { kind: 'leaf', type: 'number', name: 'x', required: true, integer: true } },
            },
          },
        },
      };
      expect(resolveChoiceCase(choice, { shared: 1 })).toBe('case0');

      const schema: NodeGroup = { kind: 'nodeGroup', name: 'root', children: { outer: choice } };
      const form = buildFormFromSchema(schema, { outer: { shared: 1 } });
      expect(serializeForm(schema, form)).toEqual({ outer: { shared: 1 } });
    });

    it('presence fields are exempt from the absence count; genuine full ties keep declaration order', () => {
      const choice: NodeChoice = {
        kind: 'choice',
        name: 'sel',
        cases: {
          withOptional: {
            qosId: { kind: 'leaf', type: 'number', name: 'qosId', required: true },
            cellId: { kind: 'leaf', type: 'string', name: 'cellId', presence: true },
          },
          bare: {
            qosId: { kind: 'leaf', type: 'number', name: 'qosId', required: true },
          },
        },
      };
      // Absent presence cellId costs nothing, so both cases tie on every
      // criterion and the first declared wins — keeping its optional reachable.
      expect(resolveChoiceCase(choice, { qosId: 5 })).toBe('withOptional');
    });

    it('non-string __case in the data is ignored by inference, not counted as an uncovered key', () => {
      // getRawValue() of a not-yet-selected choice fed back as initial.
      expect(resolveChoiceCase(scope, { [CASE_KEY]: null as unknown as string, qosId: 5 })).toBe('case1');
    });

    it('does not throw for primitive or array seeds (leaf-bodied scalar choices)', () => {
      const scalarChoice: NodeChoice = {
        kind: 'choice',
        name: 'limit',
        cases: {
          text: { kind: 'leaf', type: 'string', name: 'text' },
          count: { kind: 'leaf', type: 'number', name: 'count' },
        },
      };
      // A scalar wire value can reach a choice position; `key in 'hello'` threw.
      expect(() => buildControl(scalarChoice, 'hello')).not.toThrow();
      expect(() => buildControl(scalarChoice, [1, 2] as unknown as Record<string, unknown>)).not.toThrow();
      const group = buildControl(scalarChoice, 'hello') as FormGroup;
      expect(group.get(CASE_KEY)!.value).toBeNull();
    });

    it('data matching no case still falls back to the schema default', () => {
      const withDefault: NodeChoice = { ...scope, default: 'case1' };
      expect(resolveChoiceCase(withDefault, { zzz: 1 })).toBe('case1');
      expect(resolveChoiceCase(scope, { zzz: 1 })).toBeUndefined();
    });

    it('end-to-end: the consumer body round-trips ajv-shaped through build and serialize', () => {
      // filter is an optional (presence) object, as the JSON-Schema transformer
      // now emits for non-required properties.
      const body: NodeGroup = {
        kind: 'nodeGroup',
        name: 'body',
        children: {
          name: { kind: 'leaf', type: 'string', name: 'name', required: true },
          filter: {
            kind: 'nodeGroup',
            name: 'filter',
            presence: true,
            children: { id: { kind: 'leaf', type: 'number', name: 'id', required: true, integer: true } },
          },
          scope,
        },
      };
      const form = buildFormFromSchema(body, { name: 'x', scope: { qosId: 5 } });
      expect(serializeForm(body, form)).toEqual({ name: 'x', scope: { qosId: 5 } });
    });
  });

  describe('materialized validity (presence leaves, mandatory/presence choices)', () => {
    it('an enabled presence leaf must hold a value', () => {
      const note: Leaf = { kind: 'leaf', type: 'string', name: 'note', presence: true };
      const control = buildControl(note) as FormControl;
      // Materialized means the key serializes; empty would emit null and fail
      // typed-schema validation, so the control is required while it exists.
      expect(control.hasError('required')).toBe(true);
      control.setValue('x');
      expect(control.valid).toBe(true);
    });

    it('a nullable presence leaf accepts explicit null', () => {
      const note: Leaf = { kind: 'leaf', type: 'string', name: 'note', presence: true, nullable: true };
      const control = buildControl(note, null) as FormControl;
      expect(control.valid).toBe(true);
    });

    it('a mandatory choice errors until a case is selected', () => {
      const scope: NodeChoice = {
        kind: 'choice',
        name: 'scope',
        mandatory: true,
        cases: { byUe: { ueId: { kind: 'leaf', type: 'string', name: 'ueId' } } },
      };
      const group = buildControl(scope) as FormGroup;
      expect(group.hasError('caseRequired')).toBe(true);
      switchChoiceCase(group, scope, 'byUe');
      expect(group.hasError('caseRequired')).toBe(false);
    });

    it('an enabled presence choice errors until a case is selected', () => {
      const mode: NodeChoice = {
        kind: 'choice',
        name: 'mode',
        presence: true,
        cases: { a: { x: { kind: 'leaf', type: 'string', name: 'x' } } },
      };
      const group = buildControl(mode) as FormGroup;
      expect(group.hasError('caseRequired')).toBe(true);
      switchChoiceCase(group, mode, 'a');
      expect(group.valid).toBe(true);
    });

    it('a plain optional choice stays valid with no case selected (unchanged)', () => {
      const plain: NodeChoice = {
        kind: 'choice',
        name: 'plain',
        cases: { a: { x: { kind: 'leaf', type: 'string', name: 'x' } } },
      };
      const group = buildControl(plain) as FormGroup;
      expect(group.get(CASE_KEY)!.value).toBeNull();
      expect(group.valid).toBe(true);
    });
  });

  describe('serializeForm / toWireValue', () => {
    const transport: NodeChoice = {
      kind: 'choice',
      name: 'transport',
      cases: {
        tcp: { 'tcp-port': { kind: 'leaf', type: 'number', name: 'tcp-port' } },
        udp: { 'udp-port': { kind: 'leaf', type: 'number', name: 'udp-port' } },
      },
    };

    it('strips the discriminator, leaving the active case fields inline', () => {
      const schema: NodeGroup = { kind: 'nodeGroup', name: 'root', children: { transport } };
      const form = buildFormFromSchema(schema, { transport: { 'tcp-port': 830 } });
      expect((form.getRawValue() as any).transport[CASE_KEY]).toBe('tcp');
      expect(serializeForm(schema, form)).toEqual({ transport: { 'tcp-port': 830 } });
    });

    it('round-trips: wire → build (case inferred) → serialize → the same wire value', () => {
      const schema: NodeGroup = { kind: 'nodeGroup', name: 'root', children: { transport } };
      const wire = { transport: { 'udp-port': 1812 } };
      expect(serializeForm(schema, buildFormFromSchema(schema, wire))).toEqual(wire);
    });

    it('strips at depth: choices inside list items and map entries', () => {
      const schema: NodeGroup = {
        kind: 'nodeGroup',
        name: 'root',
        children: {
          links: {
            kind: 'nodeGroupList',
            name: 'links',
            type: { kind: 'nodeGroup', name: 'link', children: { transport } },
          },
          peers: { kind: 'map', name: 'peers', value: transport },
        },
      };
      const wire = {
        links: [{ transport: { 'tcp-port': 22 } }, { transport: { 'udp-port': 53 } }],
        peers: { east: { 'tcp-port': 179 } },
      };
      const serialized = serializeForm(schema, buildFormFromSchema(schema, wire));
      expect(serialized).toEqual(wire);
      expect(JSON.stringify(serialized)).not.toContain(CASE_KEY);
    });

    it('collapses a choice nested inside another choice case', () => {
      const outer: NodeChoice = {
        kind: 'choice',
        name: 'outer',
        cases: { net: { transport } },
      };
      const schema: NodeGroup = { kind: 'nodeGroup', name: 'root', children: { outer } };
      const wire = { outer: { transport: { 'udp-port': 500 } } };
      expect(serializeForm(schema, buildFormFromSchema(schema, wire))).toEqual(wire);
    });

    it('serializes an enabled-but-unselected choice to an empty object', () => {
      const schema: NodeGroup = { kind: 'nodeGroup', name: 'root', children: { transport } };
      const form = buildFormFromSchema(schema, { transport: {} });
      expect((form.getRawValue() as any).transport).toEqual({ [CASE_KEY]: null });
      expect(serializeForm(schema, form)).toEqual({ transport: {} });
    });

    it('leaves keys named __case alone outside choice positions', () => {
      const schema: NodeGroup = {
        kind: 'nodeGroup',
        name: 'root',
        children: {
          [CASE_KEY]: { kind: 'leaf', type: 'string', name: CASE_KEY },
          tags: { kind: 'map', name: 'tags', value: { kind: 'leaf', type: 'string', name: 'value' } },
        },
      };
      const wire = { [CASE_KEY]: 'a literal field', tags: { [CASE_KEY]: 'a literal key' } };
      expect(serializeForm(schema, buildFormFromSchema(schema, wire))).toEqual(wire);
    });

    it('passes scalars, null, and leaf lists through toWireValue unchanged', () => {
      const port: Leaf = { kind: 'leaf', type: 'number', name: 'port', nullable: true };
      const aliases: LeafList = { kind: 'leafList', name: 'aliases', type: 'string' };
      expect(toWireValue(port, 8080)).toBe(8080);
      expect(toWireValue(port, null)).toBeNull();
      expect(toWireValue(aliases, ['a', 'b'])).toEqual(['a', 'b']);
    });

    it('serializes a leaf-bodied case to its single inline field', () => {
      const limit: NodeChoice = {
        kind: 'choice',
        name: 'limit',
        cases: {
          unlimited: { kind: 'leaf', type: 'boolean', name: 'unlimited' },
          capped: { cap: { kind: 'leaf', type: 'number', name: 'cap' } },
        },
      };
      const schema: NodeGroup = { kind: 'nodeGroup', name: 'root', children: { limit } };
      const wire = { limit: { unlimited: true } };
      expect(serializeForm(schema, buildFormFromSchema(schema, wire))).toEqual(wire);
    });

    it('omits an absent presence field inside a case and keeps it once enabled', () => {
      const choice: NodeChoice = {
        kind: 'choice',
        name: 'auth',
        cases: {
          basic: {
            user: { kind: 'leaf', type: 'string', name: 'user' },
            realm: { kind: 'leaf', type: 'string', name: 'realm', presence: true },
          },
        },
      };
      const schema: NodeGroup = { kind: 'nodeGroup', name: 'root', children: { auth: choice } };
      const form = buildFormFromSchema(schema, { auth: { user: 'ada' } });
      expect(serializeForm(schema, form)).toEqual({ auth: { user: 'ada' } });

      (form.get('auth') as FormGroup).addControl('realm', buildControl(choice.cases['basic'] && (caseFields(choice.cases['basic'])['realm']), 'corp'));
      expect(serializeForm(schema, form)).toEqual({ auth: { user: 'ada', realm: 'corp' } });
    });

    it('serialize output rebuilds an identical form (full round-trip both directions)', () => {
      const schema: NodeGroup = {
        kind: 'nodeGroup',
        name: 'root',
        children: {
          transport,
          tags: { kind: 'map', name: 'tags', value: { kind: 'leaf', type: 'string', name: 'value' } },
          aliases: { kind: 'leafList', name: 'aliases', type: 'string' },
        },
      };
      const form = buildFormFromSchema(schema, {
        transport: { 'tcp-port': 22 },
        tags: { env: 'prod' },
        aliases: ['a'],
      });
      const wire = serializeForm(schema, form);
      const rebuilt = buildFormFromSchema(schema, wire);
      expect(rebuilt.getRawValue()).toEqual(form.getRawValue());
      expect(serializeForm(schema, rebuilt)).toEqual(wire);
    });
  });
});
