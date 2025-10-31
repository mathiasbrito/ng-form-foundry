import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AnonLeaf } from '../../types/dynamic-recursive.types';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'nff-anon-leaf-renderer',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule,
    MatCheckboxModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './anon-leaf-renderer.component.html',
  styleUrl: './anon-leaf-renderer.component.scss',
})
export class AnonLeafRendererComponent {
  @Input() AnonLeaf!: AnonLeaf;
  @Input() initialValue!: string;
  @Input() control = new FormControl();
  @Input() removable: boolean = false;
  @Input() editable: boolean = true;
  @Input() index!: number;
  @Output() remove = new EventEmitter();
  @Input() label!: string;

  emitRemoveEvent() {
    this.remove.emit();
  }
}
