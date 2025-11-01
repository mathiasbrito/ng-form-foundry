import { Component, EventEmitter, forwardRef, inject, Input, OnInit, Output } from '@angular/core';
import { NodeGroupList } from '../../types/dynamic-recursive.types';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DynamicRecursiveFormComponent } from '../dynamic-recursive-form.component';
import { buildFormFromSchema } from '../../core/dynamic-recursive-forms-builder';
import { MatDialog } from '@angular/material/dialog';
import { MatPrefix } from '@angular/material/input';

@Component({
  selector: 'nff-node-group-list-renderer',
  standalone: true,
  imports: [
    MatIconModule,
    forwardRef(() => DynamicRecursiveFormComponent),
    MatPrefix,
    MatButton,
  ],
  templateUrl: './node-group-list-renderer.component.html',
  styleUrl: './node-group-list-renderer.component.scss',
})
export class NodeGroupListRendererComponent implements OnInit {
  @Input() nodeGroupList!: NodeGroupList;
  @Input() initialValue!: number[] | string[] | boolean[];
  @Input() formArray = new FormArray<any>([]);
  @Input() editable: boolean = true;
  @Input() minItems: number = 1;
  @Output() message = new EventEmitter();

  matDialog = inject(MatDialog);

  ngOnInit() {
    if (this.initialValue) {
      this.formArray.patchValue(this.initialValue);
    }
  }

  removeItem($index: number) {
    if (this.formArray.length <= this.minItems) {
      this.message.emit({
        message: `You cannot remove the last ${this.nodeGroupList.type.name} configuration!`,
        type: 'error',
      })
      return;
    }
    this.formArray.removeAt($index);
  }

  addItem() {
    this.formArray.push(buildFormFromSchema(this.nodeGroupList.type, null));
  }

  asFormGroup(group: any) {
    return group as FormGroup;
  }
}
