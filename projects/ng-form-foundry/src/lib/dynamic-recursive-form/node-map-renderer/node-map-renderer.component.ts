import { Component, forwardRef, Input, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Leaf, NodeGroup, NodeMap } from '../../types/dynamic-recursive.types';
import { buildControl } from '../../core/dynamic-recursive-forms-builder';
import { asFormControl, asFormGroup } from '../../core/utils';
import { LeafRendererComponent } from '../leaf-renderer/leaf-renderer.component';
import { DynamicRecursiveFormComponent } from '../dynamic-recursive-form.component';

/**
 * Renders a {@link NodeMap}: an open, arbitrary-keyed record. Each entry is a row
 * with an editable key and the shared value schema's control; the user can add,
 * remove, and rename entries. The map's control is a `FormGroup` whose control
 * names are the entry keys, so the key is edited as a *rename* (remove + re-add
 * the same control) committed on blur — see {@link renameEntry}.
 */
@Component({
  selector: 'nff-node-map-renderer',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    LeafRendererComponent,
    // node-map-renderer and dynamic-recursive-form import each other (a map value
    // may be a group); forwardRef defers the reference to break the cycle.
    forwardRef(() => DynamicRecursiveFormComponent),
  ],
  templateUrl: './node-map-renderer.component.html',
  styleUrl: './node-map-renderer.component.scss',
})
export class NodeMapRendererComponent implements OnInit {
  @Input() nodeMap!: NodeMap;
  @Input() formGroup = new FormGroup<any>({});
  @Input() editable = true;

  /** Ordered view of entry keys, kept stable across renames (`addControl` appends). */
  entryKeys: string[] = [];

  ngOnInit(): void {
    this.entryKeys = Object.keys(this.formGroup.controls);
  }

  /** The value schema as a leaf (used when `value.kind === 'leaf'`). */
  get valueLeaf(): Leaf {
    return this.nodeMap.value as Leaf;
  }
  /** The value schema as a group (used when `value.kind === 'nodeGroup'`). */
  get valueGroup(): NodeGroup {
    return this.nodeMap.value as NodeGroup;
  }

  get atMax(): boolean {
    return this.nodeMap.maxEntries != null && this.entryKeys.length >= this.nodeMap.maxEntries;
  }
  get atMin(): boolean {
    return this.nodeMap.minEntries != null && this.entryKeys.length <= this.nodeMap.minEntries;
  }

  /** Append a new entry under a unique placeholder key. */
  addEntry(): void {
    const key = this.uniqueKey();
    this.formGroup.addControl(key, buildControl(this.nodeMap.value) as never);
    this.entryKeys = [...this.entryKeys, key];
  }

  /** Drop an entry (its control leaves the group, so it drops from the value). */
  removeEntry(key: string): void {
    this.formGroup.removeControl(key);
    this.entryKeys = this.entryKeys.filter((k) => k !== key);
  }

  /**
   * Commit an edited key by renaming its control once (remove + re-add the same
   * instance, so the value is preserved). Ignores an empty, unchanged, duplicate,
   * or `keyPattern`-violating key, leaving the entry under its current name.
   */
  renameEntry(oldKey: string, rawKey: string): void {
    const newKey = rawKey.trim();
    if (!newKey || newKey === oldKey || this.formGroup.contains(newKey)) return;
    if (this.nodeMap.keyPattern && !new RegExp(this.nodeMap.keyPattern).test(newKey)) return;
    const control = this.formGroup.get(oldKey);
    if (!control) return;
    this.formGroup.removeControl(oldKey);
    this.formGroup.addControl(newKey, control);
    this.entryKeys = this.entryKeys.map((k) => (k === oldKey ? newKey : k));
  }

  private uniqueKey(): string {
    let n = this.entryKeys.length + 1;
    let key = `key${n}`;
    while (this.formGroup.contains(key)) key = `key${++n}`;
    return key;
  }

  protected readonly asFormControl = asFormControl;
  protected readonly asFormGroup = asFormGroup;
}
