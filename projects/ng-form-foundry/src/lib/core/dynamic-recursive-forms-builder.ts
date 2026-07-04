import {
  FormArray,
  FormControl,
  FormGroup,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import {
  DFormControl,
  DFormGroup,
  FormGroupType,
  Leaf,
  LeafEnum,
  LeafList,
  LeafRuntimeType,
  NodeGroup,
  NodeGroupList,
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

function enumValidator(choices: readonly (string | number)[]): ValidatorFn {
  const set = new Set(choices);
  return (ctrl) =>
    ctrl.value == null || set.has(ctrl.value) ? null : { enum: true };
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
  const defaultValue =
    initial ?? ('default' in leaf ? (leaf as any).default : undefined) ?? null;
  return new FormControl<LeafRuntimeType<L['type']>>(defaultValue, {
    nonNullable: true,
    validators,
  });
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
export function buildControl<T extends NodeType>(
  node: T,
  initial?: unknown | null,
): DFormControl<T> | FormControl<LeafRuntimeType<any>> | FormArray<any> {
  if (isLeaf(node)) {
    return buildLeafControl(node, initial);
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
