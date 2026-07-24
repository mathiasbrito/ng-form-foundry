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
    (node.kind === 'leaf' ||
      node.kind === 'nodeGroup' ||
      node.kind === 'map' ||
      node.kind === 'choice' ||
      node.kind === 'leafList' ||
      node.kind === 'nodeGroupList') &&
    node.presence === true
  );
}

/**
 * Whether a presence child should start absent: there is no initial data
 * object (a scalar seed counts as none), or its key is missing from it. A key
 * that is present with an explicit `null` value keeps its control — `null` is
 * a value (a nullable leaf's), while presence is about the *absent key*.
 */
function presenceAbsent(initial: Record<string, unknown> | null | undefined, key: string): boolean {
  return initial == null || typeof initial !== 'object' || !(key in initial);
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
  // A presence leaf only ever has a control while enabled, and enabled means
  // the key goes on the wire — an empty materialized value would serialize as
  // null and fail typed-schema validation. So materialized ⇒ must hold a
  // value; disable the field to omit it. A nullable presence leaf is exempt:
  // explicit null is one of its legal values.
  else if ((leaf as LeafBase).presence === true && (leaf as LeafBase).nullable !== true) {
    validators.push(Validators.required);
  }
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

// The list value with no seed data is the empty array: a phantom null entry
// would fail validation of the serialized value against typed item schemas,
// and an empty list is the honest wire shape (renderers offer the add row).
function buildLeafListControl<L extends LeafList>(
  list: L,
  initial: LeafRuntimeType<L['type']>[] | null,
): FormArray<FormControl<LeafRuntimeType<LeafList['type']> | null>> {
  const values = (Array.isArray(initial) ? initial : undefined) ?? list.default ?? [];
  return new FormArray(values.map((v) => new FormControl(v)));
}

/**
 * Group error while the number of present (enabled) children is outside the
 * group's `minPresent`/`maxPresent` range — JSON Schema `minProperties` /
 * `maxProperties` on a closed object whose properties are presence-optional.
 * Counted from the live controls, so presence toggles re-evaluate it.
 */
function presentChildrenValidator(group: NodeGroup): ValidatorFn {
  return (control) => {
    const actual = Object.keys((control as FormGroup).controls).length;
    if (group.minPresent != null && actual < group.minPresent) {
      return { minPresent: { required: group.minPresent, actual } };
    }
    if (group.maxPresent != null && actual > group.maxPresent) {
      return { maxPresent: { allowed: group.maxPresent, actual } };
    }
    return null;
  };
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
  const constrained = group.minPresent != null || group.maxPresent != null;
  return new FormGroup(
    controls as FormGroupType<G>,
    constrained ? { validators: presentChildrenValidator(group) } : undefined,
  ) as DFormGroup<G>;
}

function buildNodeGroupListControl<GL extends NodeGroupList>(
  list: GL,
  initial: unknown[] | null = null,
): FormArray<DFormGroup<GL['type']>> {
  // `initial` is the runtime data array — one group per element. With no data
  // the list is empty: seeding a phantom all-null group would put an invalid
  // member on the wire (see buildLeafListControl).
  const values = Array.isArray(initial) ? initial : [];
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
 * Display labels for a choice's cases, keyed by case name, with colliding
 * labels made unique. Schema-supplied `caseLabels` can repeat (e.g. two
 * O-RAN A1 scope branches labeled from the same discriminating field), which
 * makes the case selector ambiguous. Unique labels pass through untouched;
 * each colliding case first gains the fields that set it apart from its
 * same-labeled peers — "UE ID (Group ID)" vs "UE ID (Slice ID)" — and any
 * cases the field suffix cannot separate (no distinguishing fields, peers
 * with identical field sets among a larger clash group, or distinguishing
 * fields that share one display label) fall back to their case name, which
 * is unique by construction.
 */
export function caseDisplayLabels(choice: NodeChoice): Record<string, string> {
  const names = Object.keys(choice.cases);
  const base: Record<string, string> = {};
  const out: Record<string, string> = {};
  const byLabel = new Map<string, string[]>();
  for (const name of names) {
    base[name] = choice.caseLabels?.[name] ?? name;
    out[name] = base[name];
    byLabel.set(base[name], [...(byLabel.get(base[name]) ?? []), name]);
  }
  for (const clashing of byLabel.values()) {
    if (clashing.length < 2) continue;
    for (const name of clashing) {
      const fields = caseFields(choice.cases[name]);
      const others = clashing.filter((o) => o !== name).map((o) => caseFields(choice.cases[o]));
      const distinct = Object.keys(fields).filter((key) => !others.every((o) => key in o));
      const suffix = distinct.length
        ? distinct.map((key) => (fields[key] as { label?: string }).label ?? key).join(', ')
        : name;
      out[name] = `${out[name]} (${suffix})`;
    }
  }
  // Uniqueness guarantee: whatever the collision topology, labels still equal
  // after field-suffixing take the case name instead.
  const byFinal = new Map<string, string[]>();
  for (const name of names) byFinal.set(out[name], [...(byFinal.get(out[name]) ?? []), name]);
  for (const clashing of byFinal.values()) {
    if (clashing.length < 2) continue;
    for (const name of clashing) out[name] = `${base[name]} (${name})`;
  }
  return out;
}

/**
 * The active case of a choice: an explicit `__case` in the initial value, else
 * the case {@link inferChoiceCase} ranks best against the initial data (inline
 * wire data carries no `__case`), else the schema `default`. This lets a choice
 * seed from real instance data whose branch is discriminated by which fields
 * are present and required.
 */
export function resolveChoiceCase(
  choice: NodeChoice,
  initial?: Record<string, unknown> | null,
): string | undefined {
  const explicit = initial?.[CASE_KEY];
  if (typeof explicit === 'string') return explicit;
  return inferChoiceCase(choice, initial) ?? choice.default;
}

/**
 * Pick the active case from inline wire data (which carries no `__case`).
 *
 * Candidates are the cases sharing at least one field name with the data; when
 * none does, the caller falls back to the schema `default`. Candidates are
 * ranked by, in order: fewest data keys the case has no field for (the case
 * must be able to hold the data), fewest non-presence fields absent from the
 * data (fields the form would have to materialize empty — this is how
 * required-set-discriminated `oneOf` branches differ, e.g. a branch requiring
 * `{ueId, qosId}` vs one requiring only `{qosId}`), most matched fields, and
 * finally declaration order. Presence fields are exempt from the absence count
 * because their absence is itself a legal state of the data.
 */
function inferChoiceCase(choice: NodeChoice, initial?: Record<string, unknown> | null): string | undefined {
  if (initial == null || typeof initial !== 'object' || Array.isArray(initial)) return undefined;
  const dataKeys = new Set(Object.keys(initial).filter((k) => k !== CASE_KEY));
  let best: string | undefined;
  let bestRank: number[] | undefined;
  for (const name of Object.keys(choice.cases)) {
    const fields = caseFields(choice.cases[name]);
    let matched = 0;
    for (const key of dataKeys) if (key in fields) matched++;
    if (matched === 0) continue;
    const missing = Object.keys(fields).filter(
      (f) => !hasPresence(fields[f]) && !dataKeys.has(f),
    ).length;
    const rank = [dataKeys.size - matched, missing, -matched];
    if (bestRank === undefined || lexLess(rank, bestRank)) {
      bestRank = rank;
      best = name;
    }
  }
  return best;
}

/** Strictly-less comparison of two equal-length rank vectors, first difference wins. */
function lexLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/**
 * Group error while a choice that must resolve to a case has none selected.
 * Attached to `mandatory` choices (a case is always due) and `presence` choices
 * (enabled means the key serializes, and `{}` satisfies no case) — a plain
 * optional choice stays validator-free, `{ __case: null }` and all.
 */
function caseRequiredValidator(): ValidatorFn {
  return (group) =>
    (group as FormGroup).get(CASE_KEY)?.value == null ? { caseRequired: true } : null;
}

/**
 * Build the FormGroup for a choice: a `__case` control holding the active case
 * name plus that case's field controls. Only the active case's fields are built,
 * matching the inline YANG encoding; switching the case swaps them. Mandatory
 * and presence choices carry {@link caseRequiredValidator}.
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
  const needsCase = choice.mandatory === true || choice.presence === true;
  return new FormGroup(controls, needsCase ? { validators: caseRequiredValidator() } : undefined);
}

/**
 * Switch a choice's FormGroup to `caseName`: sets `__case`, removes every other
 * control, and builds `caseName`'s fields (normalized via {@link caseFields})
 * with their defaults. Presence fields of the new case start absent — the
 * switch carries no data that could make them present. An unknown case name
 * leaves only `__case`. The swap is atomic: one value change fires, and every
 * observable snapshot has fields matching its discriminator.
 */
export function switchChoiceCase(group: FormGroup, choice: NodeChoice, caseName: string): void {
  group.get(CASE_KEY)?.setValue(caseName, { emitEvent: false });
  for (const name of Object.keys(group.controls)) {
    if (name !== CASE_KEY) group.removeControl(name, { emitEvent: false });
  }
  const caseChildren = choice.cases[caseName] ? caseFields(choice.cases[caseName]) : {};
  for (const name in caseChildren) {
    if (hasPresence(caseChildren[name])) continue;
    group.addControl(name, buildControl(caseChildren[name]) as any, { emitEvent: false });
  }
  group.updateValueAndValidity();
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
    const trimmed = key.trim();
    // `__case` is reserved for the choice discriminator; as an entry key it
    // would make the map group indistinguishable from a choice group.
    if (!trimmed || trimmed === CASE_KEY || group.contains(trimmed)) return null;
    if (map.keyPattern && !new RegExp(map.keyPattern).test(trimmed)) return null;
    committed = trimmed;
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
 * Materialize or de-materialize an optional (presence) child of `group`,
 * mirroring the presence toggle the form UI offers — but callable by any host
 * holding the {@link FormGroup}, for a key at any depth. `present: true` builds
 * the child fresh from `schema` (seeded with `initial` if given; nested
 * presence descendants start absent, as {@link buildControl}); `present: false`
 * removes it, dropping the key from the form value.
 *
 * The materialize direction is why the coupling exists: a materialized
 * non-nullable presence leaf carries `Validators.required`, because an
 * enabled-but-empty key would serialize as `null` and fail a typed schema. A
 * host that materializes fields for editing therefore drops the ones left
 * empty on cancel by de-materializing them — this API is that primitive.
 *
 * `schema` must be the presence node for `key`; a non-presence `schema` is a
 * no-op. Returns whether the form changed.
 */
export function setNodePresence(group: FormGroup, schema: NodeType, key: string, present: boolean, initial?: unknown): boolean {
  if (!hasPresence(schema)) return false;
  if (present) {
    if (group.contains(key)) return false;
    group.addControl(key, buildControl(schema, initial) as never);
    return true;
  }
  if (!group.contains(key)) return false;
  group.removeControl(key);
  return true;
}

/**
 * The map's own constraints as a group validator: entry count against
 * `minEntries`/`maxEntries` and every entry key against `keyPattern`. The UI
 * gates prevent most violations; the validator reports the ones that slip
 * through (seeded wire data, generated `keyN` placeholders awaiting a rename).
 */
function mapValidator(map: NodeMap): ValidatorFn {
  let re: RegExp | null = null;
  if (map.keyPattern) {
    try {
      re = new RegExp(map.keyPattern);
    } catch {
      re = null;
    }
  }
  return (ctrl) => {
    const keys = Object.keys((ctrl as FormGroup).controls);
    const errors: Record<string, unknown> = {};
    if (map.minEntries != null && keys.length < map.minEntries) {
      errors['minEntries'] = { required: map.minEntries, actual: keys.length };
    }
    if (map.maxEntries != null && keys.length > map.maxEntries) {
      errors['maxEntries'] = { allowed: map.maxEntries, actual: keys.length };
    }
    if (re) {
      const invalidKeys = keys.filter((k) => !re!.test(k));
      if (invalidKeys.length) errors['keyPattern'] = { pattern: map.keyPattern, keys: invalidKeys };
    }
    return Object.keys(errors).length ? errors : null;
  };
}

/**
 * Build the FormGroup for a map: one control per entry, keyed by the entry key,
 * each built from the map's shared `value` schema. Because the entry keys are the
 * control names, `getRawValue()` is the map object directly. Empty when no
 * initial object is supplied; the renderer adds/removes/renames entries. The
 * group carries {@link mapValidator}, so `keyPattern`/`minEntries`/`maxEntries`
 * violations surface as validation errors.
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
  return new FormGroup(controls, { validators: mapValidator(map) });
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
 * The wire value at `node`: `value` rebuilt with every choice discriminator
 * removed.
 *
 * A choice's form value is `{ __case, ...fields }` ({@link CASE_KEY}); its wire
 * encoding is the active case's fields inline, with no discriminator — the case
 * is recovered from the field shape when the data is seeded back in
 * ({@link resolveChoiceCase}). The walk is schema-driven: only positions the
 * schema declares as choices are stripped, so a group child or map entry that
 * happens to be named `__case` passes through untouched. Values at positions
 * the schema does not describe pass through unchanged.
 */
export function toWireValue(node: NodeType, value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (isChoice(node)) {
    const { [CASE_KEY]: active, ...rest } = value as Record<string, unknown>;
    const fields =
      typeof active === 'string' && node.cases[active] ? caseFields(node.cases[active]) : {};
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(rest)) {
      out[key] = key in fields ? toWireValue(fields[key], rest[key]) : rest[key];
    }
    return out;
  }
  if (isNodeGroup(node)) {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      out[key] = key in node.children ? toWireValue(node.children[key], source[key]) : source[key];
    }
    return out;
  }
  if (isNodeGroupList(node)) {
    return Array.isArray(value) ? value.map((item) => toWireValue(node.type, item)) : value;
  }
  if (isMap(node)) {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source)) out[key] = toWireValue(node.value, source[key]);
    return out;
  }
  return value;
}

/**
 * Serialize a form built by {@link buildFormFromSchema} to its wire value:
 * `form.getRawValue()` with every choice's {@link CASE_KEY} discriminator
 * stripped (see {@link toWireValue}). The result is the inline encoding that
 * `buildFormFromSchema` accepts back as `initial`, so serialize → rebuild
 * round-trips the value.
 */
export function serializeForm(schema: NodeGroup, form: FormGroup): Record<string, unknown> {
  return toWireValue(schema, form.getRawValue()) as Record<string, unknown>;
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
