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
/**
 * Build the FormGroup for a choice: a `__case` control holding the active case
 * name plus that case's field controls. Only the active case's fields are built,
 * matching the inline YANG encoding; switching the case swaps them.
 */
/**
 * Normalize a {@link ChoiceCase} to a field record. A field record is returned
 * as-is; a single node (a leaf-bodied case, e.g. a scalar `anyOf` branch) becomes
 * a one-field record keyed by the node's `name`. The discriminant is a top-level
 * `kind` string, which a field record never has (its keys are field names).
 */
export function caseFields(body: ChoiceCase): Record<string, NodeType> {
  return typeof (body as { kind?: unknown }).kind === 'string'
    ? { [(body as NodeType).name]: body as NodeType }
    : (body as Record<string, NodeType>);
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

function buildChoiceControl(
  choice: NodeChoice,
  initial?: Record<string, unknown> | null,
): FormGroup {
  const active = resolveChoiceCase(choice, initial);
  const controls: any = { [CASE_KEY]: new FormControl(active ?? null) };
  if (active && choice.cases[active]) {
    const caseChildren = caseFields(choice.cases[active]);
    for (const key in caseChildren) {
      controls[key] = buildControl(caseChildren[key], initial?.[key]);
    }
  }
  return new FormGroup(controls);
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
 * Inference only holds when `schema`'s literal type is preserved. Author schemas
 * with {@link defineSchema} or a `satisfies NodeGroup` annotation — never
 * `const schema: NodeGroup = ...`, which widens `children` and erases the field
 * names and value types.
 */
/**
 * Remove presence nodes that have no initial value so they are absent from the
 * built form (and from `form.value`) until the user toggles them on. Applies to
 * both presence groups and presence leaves. Runs on the fully-built, attached
 * tree. `removeControl` is used rather than `disable` because a disabled control
 * is still included in `FormGroup.value`.
 */
function applyPresence(
  group: FormGroup,
  schema: NodeGroup,
  initial?: Record<string, unknown> | null,
): void {
  for (const key in schema.children) {
    const child = schema.children[key];
    const childInitial = (initial as Record<string, unknown> | null | undefined)?.[key];
    if (child.kind === 'leaf' || child.kind === 'map') {
      if (child.presence && childInitial == null) group.removeControl(key);
      continue;
    }
    if (child.kind !== 'nodeGroup') continue;
    if (child.presence && childInitial == null) {
      group.removeControl(key);
    } else if (group.get(key) instanceof FormGroup) {
      applyPresence(group.get(key) as FormGroup, child, childInitial as Record<string, unknown> | null);
    }
  }
}

export function buildFormFromSchema<S extends NodeGroup>(
  schema: S,
  initial: Record<string, unknown> | null = null,
): DFormGroup<S> {
  const group = buildNodeGroupControl<S>(schema, initial);
  applyPresence(group, schema, initial);
  return group;
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
