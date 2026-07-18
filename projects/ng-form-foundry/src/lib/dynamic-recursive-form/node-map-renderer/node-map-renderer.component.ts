import { Component, forwardRef, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Leaf, NodeGroup, NodeMap } from '../../types/dynamic-recursive.types';
import { addMapEntry, removeMapEntry, renameMapEntry } from '../../core/dynamic-recursive-forms-builder';
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
export class NodeMapRendererComponent implements OnChanges {
  @Input() nodeMap!: NodeMap;
  @Input() formGroup = new FormGroup<any>({});
  @Input() editable = true;

  /** Ordered view of entry keys, kept stable across renames (`addControl` appends). */
  entryKeys: string[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    // Re-sync whenever the bound group changes: a host may rebind the renderer
    // to another map (e.g. the tree editor swapping documents) while this
    // component instance survives.
    if (changes['formGroup']) this.entryKeys = Object.keys(this.formGroup.controls);
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

  /** Append a new entry under a unique placeholder key. Delegates to {@link addMapEntry}. */
  addEntry(): void {
    const key = addMapEntry(this.formGroup, this.nodeMap);
    if (key != null) this.entryKeys = [...this.entryKeys, key];
  }

  /** Drop an entry (its control leaves the group, so it drops from the value). Delegates to {@link removeMapEntry}. */
  removeEntry(key: string): void {
    if (removeMapEntry(this.formGroup, this.nodeMap, key)) {
      this.entryKeys = this.entryKeys.filter((k) => k !== key);
    }
  }

  /**
   * Commit an edited key by renaming its control once (the value is preserved).
   * An empty, unchanged, duplicate, or `keyPattern`-violating key is a no-op,
   * leaving the entry under its current name. Delegates to {@link renameMapEntry}.
   */
  renameEntry(oldKey: string, rawKey: string): void {
    if (renameMapEntry(this.formGroup, this.nodeMap, oldKey, rawKey)) {
      const newKey = rawKey.trim();
      this.entryKeys = this.entryKeys.map((k) => (k === oldKey ? newKey : k));
    }
  }

  protected readonly asFormControl = asFormControl;
  protected readonly asFormGroup = asFormGroup;
}
