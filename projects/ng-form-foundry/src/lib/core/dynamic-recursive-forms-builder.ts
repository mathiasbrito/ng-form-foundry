import {
  FormArray,
  FormControl,
  FormGroup,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import {
  CASE_KEY,
  ChoiceCase,
  DFormControl,
  DFormGroup,
  FormGroupType,
  Leaf,
  LeafBase,
  LeafEnum,
  LeafList,
  LeafNumber,
  LeafRuntimeType,
  LeafString,
  NodeChoice,
  NodeGroup,
  NodeGroupList,
  NodeMap,
  NodeType,
} from '../types/dynamic-recursive.types';

// --- type guards
function isLeaf(node: NodeType): node is Leaf {
  return node.kind === 'leaf';
}

function isLeafList(node: NodeType): node is LeafList {
  return node.kind === 'leafList';
}
function isNodeGroup(node: NodeType): node is NodeGroup {
  return node.kind === 'nodeGroup';
}
function isNodeGroupList(node: NodeType): node is NodeGroupList {
  return node.kind === 'nodeGroupList';
}
function isChoice(node: NodeType): node is NodeChoice {
  return node.kind === 'choice';
}
function isMap(node: NodeType): node is NodeMap {
  return node.kind === 'map';
}

/** Whether the node is an optional (presence) node: its key is data, absent until enabled. */
function hasPresence(node: NodeType): boolean {
  return (
    (node.kind === 'leaf' || node.kind === 'nodeGroup' || node.kind === 'map' || node.kind === 'choice') &&
    node.presence === true
  );
}

/**
 * Whether a presence child should start absent: there is no initial data
 * object, or its key is missing from it. A key that is present with an explicit
 * `null` value keeps its control — `null` is a value (a nullable leaf's), while
 * presence is about the *absent key*.
 */
function presenceAbsent(initial: Record<string, unknown> | null | undefined, key: string): boolean {
  return initial == null || !(key in initial);
}

function enumValidator(choices: readonly (string | number)[]): ValidatorFn {
  const set = new Set(choices);
  return (ctrl) =>
    ctrl.value == null || set.has(ctrl.value) ? null : { enum: true };
}

/**
 * JSON Schema `pattern`: an *unanchored* `RegExp.test`, unlike Angular's built-in
 * `Validators.pattern` which anchors the expression. An invalid regex disables
 * the check rather than throwing. Empty/absent values pass (use `required`).
 */
function patternValidator(pattern: string): ValidatorFn {
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    return () => null;
  }
  return (ctrl) => {
    const v = ctrl.value;
    if (v == null || v === '') return null;
    return re.test(String(v)) ? null : { pattern: { requiredPattern: pattern, actualValue: v } };
  };
}

/** JSON Schema `type: 'integer'`: reject a value that is not a whole number. */
function integerValidator(): ValidatorFn {
  return (ctrl) => {
    const v = ctrl.value;
    if (v == null || v === '') return null;
    const num = typeof v === 'number' ? v : Number(v);
    return Number.isInteger(num) ? null : { integer: true };
  };
}

/** JSON Schema `multipleOf`: reject a value that is not an integer multiple of `step`. */
function multipleOfValidator(step: number): ValidatorFn {
  return (ctrl) => {
    const v = ctrl.value;
    if (v == null || v === '') return null;
    const num = typeof v === 'number' ? v : Number(v);
    if (Number.isNaN(num)) return null;
    const ratio = num / step;
    // A small tolerance absorbs binary float drift (e.g. 0.3 / 0.1).
    return Math.abs(ratio - Math.round(ratio)) < 1e-9
      ? null
      : { multipleOf: { multipleOf: step, actual: num } };
  };
}

/** JSON Schema `format: uri`: reject a string that is not a parseable absolute URI. */
function uriValidator(): ValidatorFn {
  return (ctrl) => {
    const v = ctrl.value;
    if (v == null || v === '') return null;
    try {
      new URL(String(v));
      return null;
    } catch {
      return { uri: true };
    }
  };
}

function buildLeafControl<L extends Leaf>(
  leaf: L,
  initial?: unknown,
): FormControl<LeafRuntimeType<L['type']>> {
  const validators: ValidatorFn[] = [];
  if ('required' in leaf && leaf.required) validators.push(Validators.required);
  if ('type' in leaf && leaf.type === 'enum') {
    const choices = (leaf as LeafEnum).enum as (string | number)[];
    validators.push(enumValidator(choices));
  }
  if (leaf.type === 'string') {
    const s = leaf as LeafString;
    if (s.pattern != null) validators.push(patternValidator(s.pattern));
    if (s.minLength != null) validators.push(Validators.minLength(s.minLength));
    if (s.maxLength != null) validators.push(Validators.maxLength(s.maxLength));
    if (s.format === 'email') validators.push(Validators.email);
    else if (s.format === 'uri' || s.format === 'url') validators.push(uriValidator());
  } else if (leaf.type === 'number') {
    const n = leaf as LeafNumber;
    if (n.integer) validators.push(integerValidator());
    if (n.min != null) validators.push(Validators.min(n.min));
    if (n.max != null) validators.push(Validators.max(n.max));
    if (n.multipleOf != null) validators.push(multipleOfValidator(n.multipleOf));
  }
  const defaultValue =
    initial ?? ('default' in leaf ? (leaf as any).default : undefined) ?? null;
  // A nullable leaf drops `nonNullable`, so `null` is a first-class value that
  // `reset()` restores and that survives the round-trip (JSON Schema `null`).
  // The typed model still treats a leaf value as non-null, so the runtime
  // nullable control is cast back to the declared type.
  const nullable = 'nullable' in leaf && (leaf as LeafBase).nullable === true;
  return new FormControl<LeafRuntimeType<L['type']>>(defaultValue, {
    nonNullable: !nullable,
    validators,
  }) as FormControl<LeafRuntimeType<L['type']>>;
}

function buildLeafListControl<L extends LeafList>(
  list: L,
  initial: LeafRuntimeType<L['type']>[] | null,
): FormArray<FormControl<LeafRuntimeType<LeafList['type']> | null>> {
  const values = (Array.isArray(initial) ? initial : undefined) ??
    list.default ?? [null];
  return new FormArray(values.map((v) => new FormControl(v)));
}

function buildNodeGroupControl<G extends NodeGroup>(
  group: G,
  initial?: Record<string, unknown> | null,
): DFormGroup<G> {
  const controls: any = {} as Partial<FormGroupType<G>>;
  for (const key in group.children) {
    const child = group.children[key];
    // An absent presence child gets no control at all, so it is absent from the
    // form value until enabled. Because every nested group is built through this
    // function — plain children, list items, map values, choice case fields —
    // presence is honored at any depth.
    if (hasPresence(child) && presenceAbsent(initial, key)) continue;
    // Forward only this child's slice of the initial data, keyed by the child's
    // record key. Passing the whole `initial` object seeds every leaf with the
    // parent record and prevents list builders from sizing to the real data.
    controls[key] = buildControl(
      child,
      initial?.[key],
    ) as FormGroupType<G>[typeof key];
  }
  return new FormGroup(controls as FormGroupType<G>) as DFormGroup<G>;
}

function buildNodeGroupListControl<GL extends NodeGroupList>(
  list: GL,
  initial: unknown[] | null = null,
): FormArray<DFormGroup<GL['type']>> {
  // `initial` is the runtime data array — one group per element. Fall back to a
  // single empty group only when no initial data is supplied.
  const values = Array.isArray(initial) ? initial : [null];
  return new FormArray(
    values.map((v) =>
      buildNodeGroupControl(list.type, v as Record<string, unknown> | null),
    ),
  );
}

/**
 * Normalize a {@link ChoiceCase} to a field record. A field record is returned
 * as-is; a single node (a leaf-bodied case, e.g. a scalar `anyOf` branch) becomes
 * a one-field record keyed by the node's `name`. The discriminant is a top-level
 * `kind` string, which a field record never has (its keys are field names).
 *
 * Throws when a case field is keyed `__case`: that name is reserved for the
 * choice discriminator ({@link CASE_KEY}) and a field under it would silently
 * clobber the active-case control.
 */
export function caseFields(body: ChoiceCase): Record<string, NodeType> {
  const fields =
    typeof (body as { kind?: unknown }).kind === 'string'
      ? { [(body as NodeType).name]: body as NodeType }
      : (body as Record<string, NodeType>);
  if (CASE_KEY in fields) {
    throw new Error(`"${CASE_KEY}" is reserved for the choice discriminator and cannot name a case field`);
  }
  return fields;
}

/**
 * The active case of a choice: an explicit `__case` in the initial value, else
 * the case whose fields best match the initial data (inline wire data carries no
 * `__case`), else the schema `default`. This lets a choice seed from real
 * instance data whose branch is discriminated by which fields are present.
 */
export function resolveChoiceCase(
  choice: NodeChoice,
  initial?: Record<string, unknown> | null,
): string | undefined {
  const explicit = initial?.[CASE_KEY];
  if (typeof explicit === 'string') return explicit;
  return inferChoiceCase(choice, initial) ?? choice.default;
}

/** Pick the case whose fields most overlap the initial data (none if nothing matches). */
function inferChoiceCase(choice: NodeChoice, initial?: Record<string, unknown> | null): string | undefined {
  if (!initial) return undefined;
  let best: string | undefined;
  let bestScore = 0;
  for (const name of Object.keys(choice.cases)) {
    const fields = Object.keys(caseFields(choice.cases[name]));
    let score = 0;
    for (const field of fields) if (field in initial) score++;
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return best;
}

/**
 * Build the FormGroup for a choice: a `__case` control holding the active case
 * name plus that case's field controls. Only the active case's fields are built,
 * matching the inline YANG encoding; switching the case swaps them.
 */
function buildChoiceControl(
  choice: NodeChoice,
  initial?: Record<string, unknown> | null,
): FormGroup {
  const active = resolveChoiceCase(choice, initial);
  const controls: any = { [CASE_KEY]: new FormControl(active ?? null) };
  if (active && choice.cases[active]) {
    const caseChildren = caseFields(choice.cases[active]);
    for (const key in caseChildren) {
      // Case fields honor presence like any group's children: an absent
      // presence field gets no control.
      if (hasPresence(caseChildren[key]) && presenceAbsent(initial, key)) continue;
      controls[key] = buildControl(caseChildren[key], initial?.[key]);
    }
  }
  return new FormGroup(controls);
}

/**
 * Switch a choice's FormGroup to `caseName`: sets `__case`, removes every other
 * control, and builds `caseName`'s fields (normalized via {@link caseFields})
 * with their defaults. Presence fields of the new case start absent — the
 * switch carries no data that could make them present. An unknown case name
 * leaves only `__case`.
 */
export function switchChoiceCase(group: FormGroup, choice: NodeChoice, caseName: string): void {
  group.get(CASE_KEY)?.setValue(caseName);
  for (const name of Object.keys(group.controls)) {
    if (name !== CASE_KEY) group.removeControl(name);
  }
  const caseChildren = choice.cases[caseName] ? caseFields(choice.cases[caseName]) : {};
  for (const name in caseChildren) {
    if (hasPresence(caseChildren[name])) continue;
    group.addControl(name, buildControl(caseChildren[name]) as any);
  }
}

/**
 * Append a map entry built from `map.value` and return its committed key, or
 * `null` when nothing was added. With no `key`, the first free `keyN`
 * placeholder is generated (not checked against `keyPattern` — placeholders are
 * meant to be renamed). An explicit `key` is rejected when it duplicates an
 * existing entry or violates `keyPattern`. Rejects when `maxEntries` is reached.
 */
export function addMapEntry(group: FormGroup, map: NodeMap, key?: string): string | null {
  if (map.maxEntries != null && Object.keys(group.controls).length >= map.maxEntries) return null;
  let committed: string;
  if (key != null) {
    // `__case` is reserved for the choice discriminator; as an entry key it
    // would make the map group indistinguishable from a choice group.
    if (key === CASE_KEY || group.contains(key)) return null;
    if (map.keyPattern && !new RegExp(map.keyPattern).test(key)) return null;
    committed = key;
  } else {
    let n = Object.keys(group.controls).length + 1;
    committed = `key${n}`;
    while (group.contains(committed)) committed = `key${++n}`;
  }
  group.addControl(committed, buildControl(map.value) as any);
  return committed;
}

/**
 * Rename entry `oldKey` to `newKey.trim()`, preserving the control instance
 * (so the value survives) and the entry's position in the group's key order —
 * the order `getRawValue()` serializes and the tree editor renders. Returns
 * whether the rename was committed: an empty, reserved (`__case`), unchanged,
 * duplicate, or `keyPattern`-violating key is a no-op, leaving the entry under
 * its current name. Entry keys are looked up verbatim — never via
 * `AbstractControl.get`, which would split keys like `10.0.0.1` into
 * dot-delimited paths. Emits a single value change.
 */
export function renameMapEntry(group: FormGroup, map: NodeMap, oldKey: string, newKey: string): boolean {
  const committed = newKey.trim();
  if (!committed || committed === CASE_KEY || committed === oldKey || group.contains(committed)) return false;
  if (map.keyPattern && !new RegExp(map.keyPattern).test(committed)) return false;
  const control = group.controls[oldKey];
  if (!control) return false;
  // Re-key in place: swap the name, then re-append every key that followed so
  // the renamed entry does not jump to the end of the key order.
  const following = Object.keys(group.controls);
  following.splice(0, following.indexOf(oldKey) + 1);
  group.removeControl(oldKey, { emitEvent: false });
  group.addControl(committed, control, { emitEvent: false });
  for (const key of following) {
    const sibling = group.controls[key];
    group.removeControl(key, { emitEvent: false });
    group.addControl(key, sibling, { emitEvent: false });
  }
  group.updateValueAndValidity();
  return true;
}

/** Remove entry `key` unless the map is at `minEntries`. Returns whether it was removed. */
export function removeMapEntry(group: FormGroup, map: NodeMap, key: string): boolean {
  if (!group.contains(key)) return false;
  if (map.minEntries != null && Object.keys(group.controls).length <= map.minEntries) return false;
  group.removeControl(key);
  return true;
}

/**
 * Build the FormGroup for a map: one control per entry, keyed by the entry key,
 * each built from the map's shared `value` schema. Because the entry keys are the
 * control names, `getRawValue()` is the map object directly. Empty when no
 * initial object is supplied; the renderer adds/removes/renames entries.
 */
function buildMapControl(
  map: NodeMap,
  initial?: Record<string, unknown> | null,
): FormGroup {
  const controls: any = {};
  const source = initial && typeof initial === 'object' && !Array.isArray(initial) ? initial : {};
  for (const key of Object.keys(source)) {
    controls[key] = buildControl(map.value, source[key]);
  }
  return new FormGroup(controls);
}

/**
 * Build the `AbstractControl` for a single schema node.
 *
 * Dispatches on `node.kind`: a `leaf` becomes a `FormControl`, a `leafList` a
 * `FormArray` of controls, a `nodeGroup` a nested `FormGroup`, and a
 * `nodeGroupList` a `FormArray` of groups. `initial` is the runtime value for
 * this node — a scalar for a leaf, an array for a list, an object for a group —
 * and seeds the control's value (falling back to the node's `default`).
 *
 * Most callers use {@link buildFormFromSchema}; this is exposed for building a
 * control from a single non-root node.
 */
export function buildControl<T extends NodeType>(
  node: T,
  initial?: unknown | null,
): DFormControl<T> | FormControl<LeafRuntimeType<any>> | FormArray<any> {
  if (isLeaf(node)) {
    return buildLeafControl(node, initial);
  }
  if (isChoice(node)) {
    return buildChoiceControl(
      node,
      initial ? (initial as Record<string, unknown>) : null,
    ) as DFormControl<T>;
  }
  if (isMap(node)) {
    return buildMapControl(
      node,
      initial ? (initial as Record<string, unknown>) : null,
    ) as DFormControl<T>;
  }
  if (isLeafList(node)) {
    return buildLeafListControl(
      node,
      initial !== null
        ? (initial as LeafRuntimeType<(T & LeafList)['type']>[])
        : initial,
    ) as DFormControl<T>;
  }
  if (isNodeGroup(node)) {
    return buildNodeGroupControl(
      node,
      initial ? (initial as Record<string, unknown>) : null,
    ) as DFormControl<T>;
  }
  if (isNodeGroupList(node)) {
    return buildNodeGroupListControl(
      node,
      initial ? (initial as unknown[]) : null,
    ) as DFormControl<T>;
  }
  return new FormControl(initial ?? '') as DFormControl<T>;
}

/**
 * Build a typed `FormGroup` from a root `NodeGroup` schema.
 *
 * The returned group's control structure, keys, and value types are inferred
 * from the schema literal — a `leaf` of `type: 'number'` yields a
 * `FormControl<number>`, a `nodeGroup` a nested `FormGroup`, and so on. `initial`
 * is an optional value object keyed by the schema's `children` keys; each child
 * control is seeded from its matching slice (falling back to the node `default`).
 *
 * Presence nodes whose key is absent from `initial` get no control, at any depth
 * — plain children, list items, map values, and choice case fields alike — so
 * they are absent from the form value until enabled. A key present with an
 * explicit `null` keeps its control: `null` is a value, absence is the missing
 * key.
 *
 * Inference only holds when `schema`'s literal type is preserved. Author schemas
 * with {@link defineSchema} or a `satisfies NodeGroup` annotation — never
 * `const schema: NodeGroup = ...`, which widens `children` and erases the field
 * names and value types.
 */
export function buildFormFromSchema<S extends NodeGroup>(
  schema: S,
  initial: Record<string, unknown> | null = null,
): DFormGroup<S> {
  return buildNodeGroupControl<S>(schema, initial);
}

/**
 * Capture a schema literal with its exact type while checking it against
 * `NodeGroup`.
 *
 * This is an identity function whose only job is the `const` type parameter,
 * which keeps the narrow literal type of `schema` (field names, each node's
 * `type`) instead of widening it to `NodeGroup`. Assigning a schema to a
 * `: NodeGroup`-annotated constant widens `children` to
 * `Record<string, NodeType>` and erases that information, so
 * {@link buildFormFromSchema} can no longer infer a typed `FormGroup`. Passing
 * the schema through `defineSchema` (or annotating it `satisfies NodeGroup`)
 * preserves the schema-to-`FormGroup` inference.
 */
export function defineSchema<const S extends NodeGroup>(schema: S): S {
  return schema;
}
