import { FormArray, FormControl, FormGroup } from '@angular/forms';

export function asFormControl(control: any) {
  return control as FormControl;
}

export function asFormArray(control: any) {
  return control as FormArray;
}

export function asFormGroup(control: any) {
  return control as FormGroup;
}

