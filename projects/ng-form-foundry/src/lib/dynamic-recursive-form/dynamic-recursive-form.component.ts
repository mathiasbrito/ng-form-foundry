import { Component, computed, input, model, OnInit, output } from '@angular/core';
import { LeafRendererComponent } from './leaf-renderer/leaf-renderer.component';
import { CASE_KEY, Leaf, NodeChoice, NodeGroup, NodeType } from '../types/dynamic-recursive.types';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { NodeGroupListRendererComponent } from './node-group-list-renderer/node-group-list-renderer.component';
import { LeafListRendererComponent } from './leaf-list-renderer/leaf-list-renderer.component';
import { NodeMapRendererComponent } from './node-map-renderer/node-map-renderer.component';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { NgTemplateOutlet } from '@angular/common';
import { asFormArray, asFormControl, asFormGroup } from '../core/utils';
import { buildControl, buildFormFromSchema, caseFields } from '../core/dynamic-recursive-forms-builder';
import { MatTooltip } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

@Component({
  imports: [
    LeafRendererComponent,
    NodeGroupListRendererComponent,
    LeafListRendererComponent,
    NodeMapRendererComponent,
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
  /** The form-description schema to render (a root or nested `NodeGroup`). */
  readonly schema = input.required<NodeGroup>();
  /** Optional value object to seed the form; keyed by the schema's `children` keys. */
  readonly initialValue = input<Record<string, unknown> | null>(null);
  /** The reactive group this form binds to. Defaults to an empty group. */
  readonly formGroup = input<FormGroup>(new FormGroup({}));
  /** Index of this form within a parent list, used by `addButtonCallback`. */
  readonly index = input<number | null>(null);
  /** Whether this form may be removed from a parent list (shows a remove control). */
  readonly removable = input<boolean>(false);
  /** Emitted when the user removes this form from a parent list. */
  readonly remove = output<void>();
  /** Card/section title; falls back to the schema label or name. */
  readonly title = input<string>();
  /** Whether fields accept input. Two-way: also toggled by the built-in edit control. */
  readonly editable = model<boolean>(false);
  /** Invoked with {@link index} to append a new sibling form to a parent list. */
  readonly addButtonCallback = input<((index: number) => void) | null>(null);

  /** True when the schema is a root group (rendered flat, without a wrapping card). */
  readonly root = computed(() => this.schema().root ?? false);

  ngOnInit() {
    const initial = this.initialValue();
    if (initial) {
      this.formGroup().patchValue(initial);
    }
  }

  get nodeGroupChildrenList(): Array<{ key: string; value: NodeType }> {
    const children = this.schema().children ?? {};
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
    const group = this.formGroup();
    if (present) {
      if (!group.get(key)) {
        group.addControl(key, buildFormFromSchema(schema));
      }
    } else if (group.get(key)) {
      group.removeControl(key);
    }
  }

  /**
   * Add or remove a presence leaf's control on this form. Removing it drops the
   * leaf from `form.value`; adding it rebuilds the control from its schema.
   */
  toggleLeafPresence(key: string, schema: Leaf, present: boolean) {
    const group = this.formGroup();
    if (present) {
      if (!group.get(key)) {
        group.addControl(key, buildControl(schema) as never);
      }
    } else if (group.get(key)) {
      group.removeControl(key);
    }
  }

  protected readonly CASE_KEY = CASE_KEY;

  objectKeys(obj: Record<string, unknown>): string[] {
    return Object.keys(obj);
  }

  /** The active case name of a choice control, or null if none is selected. */
  activeCase(key: string): string | null {
    return (this.formGroup().get(key) as FormGroup | null)?.get(CASE_KEY)?.value ?? null;
  }

  /** A synthetic flattened NodeGroup used to render the active case's fields against the choice's FormGroup. */
  caseAsGroup(choice: NodeChoice, caseName: string): NodeGroup {
    return {
      kind: 'nodeGroup',
      name: choice.name,
      children: choice.cases[caseName] ? caseFields(choice.cases[caseName]) : {},
      appearance: { flatten: true },
    };
  }

  /** The display label for a case: the schema's `caseLabels` entry, else the case name. */
  caseLabel(choice: NodeChoice, caseName: string): string {
    return choice.caseLabels?.[caseName] ?? caseName;
  }

  /**
   * A copy of a group flagged to render its fields inline (no inner panel). Used
   * for a presence group's body, whose container is the presence panel itself, so
   * the group's own section panel would be a redundant second box.
   */
  flatGroup(group: NodeGroup): NodeGroup {
    return { ...group, appearance: { ...group.appearance, flatten: true } };
  }

  /** Swap a choice's field controls when the selected case changes. */
  switchCase(key: string, choice: NodeChoice, caseName: string) {
    const group = this.formGroup().get(key) as FormGroup;
    for (const name of Object.keys(group.controls)) {
      if (name !== CASE_KEY) group.removeControl(name);
    }
    const caseChildren = choice.cases[caseName] ? caseFields(choice.cases[caseName]) : {};
    for (const name in caseChildren) {
      group.addControl(name, buildControl(caseChildren[name]) as any);
    }
  }

  protected readonly asFormGroup = asFormGroup;
  protected readonly asFormArray = asFormArray;
  protected readonly asFormControl = asFormControl;
}
