import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { LeafRendererComponent } from './leaf-renderer/leaf-renderer.component';
import { NodeGroup, NodeType } from '../types/dynamic-recursive.types';
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
import { buildFormFromSchema } from '../core/dynamic-recursive-forms-builder';
import { MatTooltip } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';

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

  protected readonly asFormGroup = asFormGroup;
  protected readonly asFormArray = asFormArray;
  protected readonly asFormControl = asFormControl;
}
