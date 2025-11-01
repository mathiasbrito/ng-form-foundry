import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { Leaf, NodeGroup, NodeGroupList, NodeType } from '../types/dynamic-recursive.types';

export function nodeGroupChildrenList(schema: NodeGroup): Array<{ key: string; value: NodeType }> {
  const children = schema.children ?? {};
  return Object.entries(children).map(([key, value]) => ({
    key,
    value: value as NodeType,
  }));
}

export function nodeGroupChildrenLeafs(schema: NodeGroup): Array<{ key: string; value: Leaf }> {
  const children = schema.children ?? {};
  return Object.entries(children).reduce((acc, [key, value]) => {
    if (value.kind === 'leaf') {
      acc.push({ key, value: value as Leaf });
    }
    return acc;
  }, [] as Array<{ key: string; value: Leaf }>);
}

export function asFormControl(control: any) {
  return control as FormControl;
}

export function asFormArray(control: any) {
  return control as FormArray;
}

export function asFormGroup(control: any) {
  return control as FormGroup;
}

