import { Component, Input } from '@angular/core';
import { LeafEnum } from '../../types/dynamic-recursive.types';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'nff-leaf-enum-renderer',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './leaf-enum-renderer.component.html',
  styleUrl: './leaf-enum-renderer.component.scss',
})
export class LeafEnumRendererComponent {
  @Input() leafEnum!: LeafEnum;
  @Input() initialValue!: string;
  @Input() control = new FormControl();
  @Input() removable: boolean = false;
  @Input() remove: any;
  @Input() editable: boolean = true;
}
