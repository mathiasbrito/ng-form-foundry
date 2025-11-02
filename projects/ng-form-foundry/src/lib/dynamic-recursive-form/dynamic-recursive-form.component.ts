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
    MatExpansionModule,
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
  root: boolean = false;

  ngOnInit() {
    this.root = this.schema.root ?? false;
    if (this.initialValue) {
      this.formGroup.patchValue(this.initialValue);
      console.log(this.formGroup.value);
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

  protected readonly asFormGroup = asFormGroup;
  protected readonly asFormArray = asFormArray;
  protected readonly asFormControl = asFormControl;
}
