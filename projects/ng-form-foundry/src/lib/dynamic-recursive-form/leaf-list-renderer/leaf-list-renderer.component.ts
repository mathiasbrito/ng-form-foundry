import { Component, EventEmitter, HostBinding, inject, Input, OnInit, Output } from '@angular/core';
import { LeafList } from '../../types/dynamic-recursive.types';
import { FormControl } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AnonLeafRendererComponent } from '../anon-leaf-renderer/anon-leaf-renderer.component';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatPrefix } from '@angular/material/input';
import { MatTooltip } from '@angular/material/tooltip';

@Component({
  selector: 'nff-leaf-list-renderer',
  standalone: true,
  imports: [
    MatIconModule,
    AnonLeafRendererComponent,
    MatButtonModule,
    MatPrefix,
    MatTooltip,
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
  /**
   * The parent group's grid layout (its `fieldsLayout` styles). A stacked list
   * spans the parent's full row, so its entries repeat the same tracks and
   * stay aligned with the columns above; an inline (single-entry) list sits in
   * one track and ignores it.
   */
  @Input() layout: Record<string, string> | null = null;
  @Output() message = new EventEmitter();

  matDialog = inject(MatDialog);

  /**
   * Take a full-width row of its own once the array holds more than one entry.
   * A multi-entry array grows vertically as its items wrap; sitting inline next
   * to a regular leaf that would stretch the leaf to match. On its own line it
   * cannot. Consumed by the `:host(.stacked)` rule.
   */
  @HostBinding('class.stacked')
  get stacked(): boolean {
    return (this.formArray?.length ?? 0) > 1;
  }

  /** The entries' value type as a host class, so type-scoped min-widths (`--nff-min-*-field-width`) can target them. */
  @HostBinding('class')
  get typeClass(): string {
    return `list-type-${this.leaf_?.type ?? 'unknown'}`;
  }

  /** Applies {@link layout} to the host (the entries' container) while stacked. */
  @HostBinding('style')
  get hostLayout(): Record<string, string> | null {
    return this.stacked ? this.layout : null;
  }

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
