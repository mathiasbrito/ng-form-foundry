import { Component, EventEmitter, HostBinding, inject, Input, OnInit, Output } from '@angular/core';
import { LayoutStyles } from '../../core/appearance';
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
  // Schema-driven bounds: absent `minItems` floors at 0 (an unbounded list can
  // be emptied), absent `maxItems` is unbounded. Read from the schema in
  // ngOnInit so a bare `[leaf_]` binding honors them without extra wiring.
  @Input() minItems: number = 0;
  @Input() maxItems: number = Number.POSITIVE_INFINITY;
  /**
   * The parent group's grid layout (its `fieldsLayout` styles). A stacked list
   * spans the parent's full row, so its entries repeat the same tracks and
   * stay aligned with the columns above; an inline (single-entry) list sits in
   * one track and ignores it.
   */
  @Input() layout: LayoutStyles | null = null;
  @Output() message = new EventEmitter();
  /**
   * Emitted from the empty-list remove button when the list is a presence list —
   * the host removes the whole list (de-materializes it, → absent). Only wired
   * for a `presence` `leafList`; the parent maps it to `setNodePresence`.
   */
  @Output() removeList = new EventEmitter<void>();

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
  get hostLayout(): LayoutStyles | null {
    return this.stacked ? this.layout : null;
  }

  ngOnInit() {
    if (this.initialValue) {
      this.formArray.patchValue(this.initialValue);
    }
  }

  // Effective bounds: the schema wins when it declares them (an explicit
  // `minItems: 0` included), else the `@Input` fallback for a host that binds
  // the renderer directly. Getters, so a schema rebind is reflected live.
  get effectiveMin(): number {
    return this.leaf_?.minItems ?? this.minItems;
  }
  get effectiveMax(): number {
    return this.leaf_?.maxItems ?? this.maxItems;
  }

  /** Whether another item may be appended (below the effective maximum). */
  get canAdd(): boolean {
    return (this.formArray?.length ?? 0) < this.effectiveMax;
  }

  removeItem($index: number) {
    // A presence (optional / advisoryRequired) list has no present-empty state:
    // removing its last entry de-materializes the whole list (→ absent). A
    // required (non-presence) list instead stops at its minimum, staying `[]`.
    if (this.leaf_?.presence && this.formArray.length === 1) {
      this.removeList.emit();
      return;
    }
    if (this.formArray.length <= this.effectiveMin) {
      this.message.emit({
        message: 'You cannot remove the last item!',
        type: 'error',
      })
      return;
    }
    this.formArray.removeAt($index);
  }

  addItem() {
    if (this.formArray.length >= this.effectiveMax) return;
    this.formArray.push(new FormControl());
  }
}
