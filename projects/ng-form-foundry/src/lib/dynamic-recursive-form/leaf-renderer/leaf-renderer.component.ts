import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AnonLeaf, Leaf } from '../../types/dynamic-recursive.types';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { LeafEnumRendererComponent } from '../leaf-enum-renderer/leaf-enum-renderer.component';

@Component({
  selector: 'nff-leaf-renderer',
  standalone: true,
  imports: [
    MatFormFieldModule,
    ReactiveFormsModule,
    MatInputModule,
    MatCheckboxModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
    LeafEnumRendererComponent,
  ],
  templateUrl: './leaf-renderer.component.html',
  styleUrl: './leaf-renderer.component.scss',
})
export class LeafRendererComponent implements OnInit {
  @Input() leaf_!: Leaf | AnonLeaf;
  @Input() control: FormControl = new FormControl();
  @Input() initialValue?: any;
  @Input() removable: boolean = false;
  @Input() editable = true;
  @Output() remove: EventEmitter<number> = new EventEmitter();

  ngOnInit(): void {
    if (this.initialValue) {
      this.control.patchValue(this.initialValue);
    }
  }
}
