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

export function removeNullAndEmptyArrays(value: any): any {
  if (Array.isArray(value)) {
    const cleanedArray = value
      .map(removeNullAndEmptyArrays)
      .filter(v => v != null && (typeof v !== 'object' || Object.keys(v).length > 0));

    return cleanedArray.length > 0 ? cleanedArray : undefined;
  }

  if (value && typeof value === 'object') {
    const cleanedObject = Object.fromEntries(
      Object.entries(value)
        .map(([k, v]) => [k, removeNullAndEmptyArrays(v)])
        .filter(([_, v]) => v != null && (typeof v !== 'object' || Object.keys(v).length > 0))
    );

    return Object.keys(cleanedObject).length > 0 ? cleanedObject : undefined;
  }

  return value != null ? value : undefined;
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

