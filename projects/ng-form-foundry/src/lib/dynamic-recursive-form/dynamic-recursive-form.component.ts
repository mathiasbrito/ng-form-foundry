import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { LeafRendererComponent } from './leaf-renderer/leaf-renderer.component';
import { CASE_KEY, NodeChoice, NodeGroup, NodeType } from '../types/dynamic-recursive.types';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { NodeGroupListRendererComponent } from './node-group-list-renderer/node-group-list-renderer.component';
import { LeafListRendererComponent } from './leaf-list-renderer/leaf-list-renderer.component';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { NgTemplateOutlet } from '@angular/common';
import { asFormArray, asFormControl, asFormGroup } from '../core/utils';
import { buildControl, buildFormFromSchema } from '../core/dynamic-recursive-forms-builder';
import { MatTooltip } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

@Component({
  imports: [
    LeafRendererComponent,
    NodeGroupListRendererComponent,
    LeafListRendererComponent,
    ReactiveFormsModule,
    MatExpansionModule,
    MatIconModule,
    MatButtonModule,
    NgTemplateOutlet,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTooltip,
  ],
  selector: 'nff-dynamic-recursive-form',
  standalone: true,
  styleUrl: './dynamic-recursive-form.component.scss',
  templateUrl: './dynamic-recursive-form.component.html',
})
export class DynamicRecursiveFormComponent implements OnInit {
  @Input({ required: true }) schema!: NodeGroup;
  @Input() initialValue!: any;
  @Input() formGroup = new FormGroup<any>({});
  @Input() index: number | null = null;
  @Input() removable: boolean = false;
  @Output() remove = new EventEmitter();
  @Input() title!: string;
  @Input() editable = false;
  @Input() addButtonCallback: ((index: number) => void) | null = null;
  root: boolean = false;

  ngOnInit() {
    this.root = this.schema.root ?? false;
    if (this.initialValue) {
      this.formGroup.patchValue(this.initialValue);
    }
  }

  get nodeGroupChildrenList(): Array<{ key: string; value: NodeType }> {
    const children = this.schema.children ?? {};
    return Object.entries(children).map(([key, value]) => ({
      key,
      value: value as NodeType,
    }));
  }

  emitRemoveEvent() {
    this.remove.emit();
  }

  /**
   * Add or remove a presence group's control on this form. Removing it drops the
   * group from `form.value`; adding it rebuilds the sub-group from its schema.
   */
  togglePresence(key: string, schema: NodeGroup, present: boolean) {
    if (present) {
      if (!this.formGroup.get(key)) {
        this.formGroup.addControl(key, buildFormFromSchema(schema));
      }
    } else if (this.formGroup.get(key)) {
      this.formGroup.removeControl(key);
    }
  }

  protected readonly CASE_KEY = CASE_KEY;

  objectKeys(obj: Record<string, unknown>): string[] {
    return Object.keys(obj);
  }

  /** The active case name of a choice control, or null if none is selected. */
  activeCase(key: string): string | null {
    return (this.formGroup.get(key) as FormGroup | null)?.get(CASE_KEY)?.value ?? null;
  }

  /** A synthetic flattened NodeGroup used to render the active case's fields against the choice's FormGroup. */
  caseAsGroup(choice: NodeChoice, caseName: string): NodeGroup {
    return {
      kind: 'nodeGroup',
      name: choice.name,
      children: choice.cases[caseName] ?? {},
      appearance: { flatten: true },
    };
  }

  /** Swap a choice's field controls when the selected case changes. */
  switchCase(key: string, choice: NodeChoice, caseName: string) {
    const group = this.formGroup.get(key) as FormGroup;
    for (const name of Object.keys(group.controls)) {
      if (name !== CASE_KEY) group.removeControl(name);
    }
    const caseChildren = choice.cases[caseName] ?? {};
    for (const name in caseChildren) {
      group.addControl(name, buildControl(caseChildren[name]) as any);
    }
  }

  protected readonly asFormGroup = asFormGroup;
  protected readonly asFormArray = asFormArray;
  protected readonly asFormControl = asFormControl;
}
