import { FormArray, FormControl, FormGroup } from '@angular/forms';

export type LeafRuntimeType<T> = T extends 'string'
  ? string
  : T extends 'number'
    ? number
    : T extends 'boolean'
      ? boolean
      : T extends 'enum'
        ? string | number
        : never;

export type LeafBase = {
  kind: 'leaf';
  name: string;
  required?: true | undefined;
  label?: string;
  description?: string;
};

export type AnonLeaf = {
  [K in Leaf['type']]: { type: K };
}[Leaf['type']];

export type LeafString = LeafBase & {
  type: 'string';
  default?: LeafRuntimeType<'string'>;
};
export type LeafNumber = LeafBase & {
  type: 'number';
  default?: LeafRuntimeType<'number'>;
};
export type LeafBoolean = LeafBase & {
  type: 'boolean';
  default?: LeafRuntimeType<'boolean'>;
};
export type LeafEnum = LeafBase & {
  type: 'enum';
  default?: LeafRuntimeType<'enum'>;
  enumLabel?: string[];
  enum: LeafRuntimeType<'enum'>[];
};

export type Appearance = {
  flatten: boolean;
}

export type Leaf = LeafString | LeafNumber | LeafBoolean | LeafEnum;

export type LeafList<TKind extends Leaf['type'] = Leaf['type']> = {
  kind: 'leafList';
  label?: string;
  name: string;
  description?: string;
  default?: Exclude<Leaf['default'], undefined>[];
  type: TKind;
};

export type NodeGroupList = {
  kind: 'nodeGroupList';
  name: string;
  label?: string;
  description?: string;
  type: NodeGroup;
};

export type NodeGroup = {
  kind: 'nodeGroup';
  name: string;
  subType?: string;
  label?: string;
  root?: boolean;
  description?: string;
  children: Record<string, NodeType>;
  appearance?: Appearance;
};

export type NodeType = Leaf | LeafList | NodeGroup | NodeGroupList;
export type DFormControl<T extends NodeType> = T extends Leaf
  ? FormControl<LeafRuntimeType<T['type']>>
  : T extends LeafList
    ? FormArray<FormControl<LeafRuntimeType<T['type']>>>
    : T extends NodeGroup
      ? DFormGroup<T>
      : T extends NodeGroupList
        ? FormArray<DFormGroup<T['type']>>
        : never;

export type FormGroupType<T extends NodeGroup> = {
  [TChild in keyof T['children']]: DFormControl<T['children'][TChild]>;
};
export type DFormGroup<T extends NodeGroup> = FormGroup<FormGroupType<T>>;
