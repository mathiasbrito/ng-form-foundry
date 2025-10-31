import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { LeafList } from '../../types/dynamic-recursive.types';
import { FormControl } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AnonLeafRendererComponent } from '../anon-leaf-renderer/anon-leaf-renderer.component';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatPrefix } from '@angular/material/input';

@Component({
  selector: 'nff-leaf-list-renderer',
  standalone: true,
  imports: [
    MatIconModule,
    AnonLeafRendererComponent,
    MatButtonModule,
    MatPrefix,
  ],
  templateUrl: './leaf-list-renderer.component.html',
  styleUrl: './leaf-list-renderer.component.scss',
})
export class LeafListRendererComponent implements OnInit {
  @Input() leaf_!: LeafList;
  @Input() initialValue!: number[] | string[] | boolean[];
  @Input() formArray!: any;
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
        message: 'You cannot remove the last item!',
        type: 'error',
      })
      return;
    }
    this.formArray.removeAt($index);
  }

  addItem() {
    this.formArray.push(new FormControl());
  }
}
