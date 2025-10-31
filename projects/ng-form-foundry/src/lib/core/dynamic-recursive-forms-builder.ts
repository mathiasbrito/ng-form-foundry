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
    controls[key] = buildControl(
      child,
      initial,
    ) as FormGroupType<G>[typeof key];
  }
  return new FormGroup(controls as FormGroupType<G>) as DFormGroup<G>;
}

function buildNodeGroupListControl<GL extends NodeGroupList>(
  list: GL,
  initial: GL[] | null = null,
): FormArray<DFormGroup<GL['type']>> {
  const values = Array.isArray(initial) ? initial : [null];
  return new FormArray(
    values.map((v) => buildNodeGroupControl(list.type, v as any)),
  );
}

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
      initial ? (initial as NodeGroupList[]) : null,
    ) as DFormControl<T>;
  }
  return new FormControl(initial ?? '') as DFormControl<T>;
}

export function buildFormFromSchema<S extends NodeGroup>(
  schema: S,
  initial: Record<string, unknown> | null = null,
): DFormGroup<S> {
  return buildNodeGroupControl<S>(schema, initial);
}
