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

  /** Whether this field accepts input: the form is editable and the leaf is not `readOnly`. */
  get fieldEditable(): boolean {
    return this.editable && !('name' in this.leaf_ && this.leaf_.readOnly);
  }

  /**
   * A human-readable message for the control's active validation error, or `''`
   * when valid. `mat-form-field` only shows it once the field is in an error
   * state (invalid and touched), so it can be bound unconditionally.
   */
  get errorText(): string {
    const e = this.control.errors;
    if (!e) return '';
    const label = 'name' in this.leaf_ ? this.leaf_.label ?? this.leaf_.name : 'Value';
    if (e['required']) return `${label} is required`;
    if (e['minlength']) return `Must be at least ${e['minlength'].requiredLength} characters`;
    if (e['maxlength']) return `Must be at most ${e['maxlength'].requiredLength} characters`;
    if (e['pattern']) return `Must match ${e['pattern'].requiredPattern ?? 'the required pattern'}`;
    if (e['email']) return 'Must be a valid email address';
    if (e['uri']) return 'Must be a valid URI';
    if (e['min']) return `Must be ≥ ${e['min'].min}`;
    if (e['max']) return `Must be ≤ ${e['max'].max}`;
    if (e['multipleOf']) return `Must be a multiple of ${e['multipleOf'].multipleOf}`;
    if (e['enum']) return 'Not an allowed value';
    return 'Invalid value';
  }
}
