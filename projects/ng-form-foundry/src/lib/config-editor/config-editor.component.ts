import { Component, input, OnDestroy, OnInit } from '@angular/core';
import { AbstractControl, FormArray, FormGroup } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { Subscription } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltip } from '@angular/material/tooltip';
import { CASE_KEY, NodeChoice, NodeGroup, NodeMap, NodeType } from '../types/dynamic-recursive.types';
import {
  addMapEntry,
  buildControl,
  buildFormFromSchema,
  caseFields,
  removeMapEntry,
  renameMapEntry,
} from '../core/dynamic-recursive-forms-builder';
import { DynamicRecursiveFormComponent } from '../dynamic-recursive-form/dynamic-recursive-form.component';

/** Metadata on a list-container node that lets the tree add items to its FormArray. */
interface ListRef {
  array: FormArray;
  itemSchema: NodeGroup;
  itemLabel: string;
  minItems: number;
}

/** An absent optional (presence) child, offered by its parent node's "+ Optional field" menu. */
interface OptionalEntry {
  key: string;
  schema: NodeType;
  label: string;
}

/** What the detail pane renders for the selected node: a schema slice bound to its FormGroup. */
interface DetailView {
  schema: NodeGroup;
  group: FormGroup;
}

/**
 * A navigable node in the config tree. Its `id` is the node's stable path from
 * the root (`system/ntp`, `ifaces/0`, `servers/web1`), so expansion and
 * selection survive tree rebuilds.
 */
interface TreeNode {
  id: string;
  label: string;
  children: TreeNode[];
  /** The node's own FormGroup, or null for a list-container or map node. */
  group: FormGroup | null;
  /** The node's own schema, set on group-backed nodes (groups, list items, group-valued map entries). */
  schema?: NodeGroup;
  /** The node as a named child of its parent group: enough to render or remove it there. */
  ref?: { group: FormGroup; key: string; schema: NodeType };
  /** Present on a nodeGroupList node: lets a `+` add an item. */
  list?: ListRef;
  /** Present on a list-item node: the FormArray and current index it can be removed from. */
  removable?: { array: FormArray; index: number };
  /** Absent optional children of this node, offered by its "+ Optional field" menu (schema order). */
  optionals?: OptionalEntry[];
  /** Present on a present optional child node: drives the row's remove control. */
  presenceRemovable?: { key: string };
  /** Present on a choice node: the choice schema and its FormGroup (holding `__case` + the active case's fields). */
  choice?: { schema: NodeChoice; group: FormGroup };
  /** Present on a map node. `complex` maps expand entries as child nodes. */
  map?: { schema: NodeMap; group: FormGroup; complex: boolean };
  /** Present on a complex-map entry node: addresses the entry in its map for remove/rename. */
  mapEntry?: { mapGroup: FormGroup; mapSchema: NodeMap; key: string };
}

/**
 * A tree/detail editor for a schema-built form: the structure (groups, lists,
 * maps, choices) is a tree on the left, and selecting a node renders that
 * node's **entire subtree** — its fields and its child sections' content — on
 * the right through {@link DynamicRecursiveFormComponent}. The tree scopes what
 * the detail pane shows; it adds row conveniences of its own: `+` on list and
 * map rows, a delete control on removable rows, and a "+ Optional field" menu
 * for absent presence children.
 *
 * The tree is **derived state**: any structural change to the form — made
 * through the tree rows or through the embedded detail form — triggers a
 * rebuild (a cheap shape signature over `valueChanges` detects it). Node ids
 * are stable paths, so expansion and selection survive rebuilds.
 *
 * The component draws no outer container — only a divider between the tree and
 * detail panes — so the embedding client owns the surrounding chrome.
 */
@Component({
  selector: 'nff-config-editor',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltip,
    DynamicRecursiveFormComponent,
  ],
  templateUrl: './config-editor.component.html',
  styleUrl: './config-editor.component.scss',
})
export class ConfigEditorComponent implements OnInit, OnDestroy {
  /** The form-description schema whose structure the tree renders. */
  readonly schema = input.required<NodeGroup>();
  /** The schema-built reactive group the editor binds to and mutates. */
  readonly formGroup = input.required<FormGroup>();
  /** Whether fields accept input and structural controls (add/remove/menus) show. */
  readonly editable = input<boolean>(true);

  root!: TreeNode;
  selected: TreeNode | null = null;
  /** What the detail pane renders for the current selection. */
  detail: DetailView | null = null;
  readonly expanded = new Set<string>();

  private shape = '';
  private changes?: Subscription;

  ngOnInit() {
    this.rebuild();
    this.expanded.add(this.root.id);
    this.select(this.root);
    // The embedded detail form mutates the FormGroup directly (presence
    // toggles, list items, map entries, case switches); a shape change there
    // must reflect in the tree.
    this.changes = this.formGroup().valueChanges.subscribe(() => this.syncShape());
  }

  ngOnDestroy() {
    this.changes?.unsubscribe();
  }

  select(node: TreeNode) {
    this.selected = node;
    this.detail = this.computeDetail(node);
    // Reveal the selection: expand every ancestor so the row is visible, and
    // the node itself as it opens on the right.
    for (const crumb of this.pathTo(node)) {
      if (crumb !== node || this.hasExpandableContent(crumb)) this.expanded.add(crumb.id);
    }
  }

  /**
   * Root-to-`target` path for the detail-pane breadcrumb (inclusive of both ends),
   * or an empty array if `target` is not in the current tree.
   */
  pathTo(target: TreeNode): TreeNode[] {
    const walk = (node: TreeNode, trail: TreeNode[]): TreeNode[] | null => {
      const here = [...trail, node];
      if (node === target) return here;
      for (const child of node.children) {
        const found = walk(child, here);
        if (found) return found;
      }
      return null;
    };
    return this.root ? (walk(this.root, []) ?? []) : [];
  }

  toggle(node: TreeNode) {
    if (this.expanded.has(node.id)) this.expanded.delete(node.id);
    else this.expanded.add(node.id);
  }

  /** Whether the row shows an expand twisty: it has child rows to reveal (children or an optionals menu row). */
  hasExpandableContent(node: TreeNode): boolean {
    return node.children.length > 0 || (this.editable() && !!node.optionals?.length);
  }

  /**
   * Whether the node's form subtree holds a validation error. Group/choice, list,
   * and map nodes each check their backing control; `invalid` aggregates over
   * descendants, so an error anywhere below lights every ancestor row.
   */
  hasError(node: TreeNode): boolean {
    return !!(node.group?.invalid || node.list?.array.invalid || node.map?.group.invalid);
  }

  /** Append a new item to a list node's FormArray, then select it. */
  addItem(listNode: TreeNode) {
    const list = listNode.list;
    if (!list) return;
    list.array.push(buildFormFromSchema(list.itemSchema));
    this.selectByPath(`${listNode.id}/${list.array.length - 1}`);
  }

  /** Remove a list item from its FormArray (down to `minItems`). */
  removeItem(listNode: TreeNode, item: TreeNode) {
    if (!listNode.list || !item.removable) return;
    if (listNode.list.array.length <= listNode.list.minItems) return;
    listNode.list.array.removeAt(item.removable.index);
    this.selectByPath(listNode.id);
  }

  /** Add an absent optional child from the menu: build its control and select the node it lands on. */
  addOptional(node: TreeNode, entry: OptionalEntry) {
    if (!node.group || node.group.get(entry.key)) return;
    const control =
      entry.schema.kind === 'nodeGroup'
        ? buildFormFromSchema(entry.schema)
        : (buildControl(entry.schema) as AbstractControl);
    node.group.addControl(entry.key, control);
    // A leaf renders in the parent's detail pane; complex kinds become tree nodes.
    this.selectByPath(entry.schema.kind === 'leaf' ? node.id : this.join(node.id, entry.key));
  }

  /** Remove a present optional child node, returning its entry to the parent's menu. */
  removeOptional(parent: TreeNode, node: TreeNode) {
    const key = node.presenceRemovable?.key;
    if (!key || !parent.group) return;
    parent.group.removeControl(key);
    this.selectByPath(parent.id);
  }

  /** The active case name of a choice node, or null when none is selected. */
  activeCase(node: TreeNode): string | null {
    return (node.choice?.group.get(CASE_KEY)?.value as string | null) ?? null;
  }

  /** The display label of a choice node's active case, or null when no case is selected. */
  activeCaseLabel(node: TreeNode): string | null {
    const c = node.choice;
    const active = this.activeCase(node);
    return c && active ? (c.schema.caseLabels?.[active] ?? active) : null;
  }

  /** Append a new entry to a complex map node under a generated unique key, then select it. */
  addTreeMapEntry(mapNode: TreeNode) {
    const m = mapNode.map;
    if (!m) return;
    const key = addMapEntry(m.group, m.schema);
    if (key != null) this.selectByPath(`${mapNode.id}/${key}`);
  }

  /** Remove a complex map entry (down to `minEntries`). */
  removeTreeMapEntry(mapNode: TreeNode, entryNode: TreeNode) {
    const m = mapNode.map;
    const e = entryNode.mapEntry;
    if (!m || !e || !removeMapEntry(m.group, m.schema, e.key)) return;
    this.selectByPath(mapNode.id);
  }

  /** Commit a rename-on-blur of a map entry's key; on success the entry is selected under its new path. */
  renameTreeMapEntry(entryNode: TreeNode, rawKey: string) {
    const e = entryNode.mapEntry;
    if (!e) return;
    if (renameMapEntry(e.mapGroup, e.mapSchema, e.key, rawKey)) {
      const parentPath = entryNode.id.slice(0, entryNode.id.lastIndexOf('/'));
      this.selectByPath(`${parentPath}/${rawKey.trim()}`);
    }
  }

  /** Whether a map node is at `maxEntries` (the add control is hidden). */
  mapAtMax(node: TreeNode | undefined): boolean {
    const m = node?.map;
    return !!m && m.schema.maxEntries != null && Object.keys(m.group.controls).length >= m.schema.maxEntries;
  }

  /** Whether a map node is at `minEntries` (entry remove controls are hidden). */
  mapAtMin(node: TreeNode | undefined): boolean {
    const m = node?.map;
    return !!m && m.schema.minEntries != null && Object.keys(m.group.controls).length <= m.schema.minEntries;
  }

  // --- derived-tree maintenance ----------------------------------------------

  /** Rebuild the tree from the current form structure if its shape changed. */
  private syncShape(): void {
    const shape = this.shapeOf(this.formGroup());
    if (shape === this.shape) return;
    this.rebuild();
    this.reconcileSelection();
  }

  /**
   * A cheap structural signature of a control tree: group keys (plus the active
   * `__case`), array lengths, leaf placeholders. Value edits don't change it;
   * added/removed/renamed controls and case switches do.
   */
  private shapeOf(control: AbstractControl): string {
    if (control instanceof FormGroup) {
      const inner = Object.keys(control.controls)
        .sort()
        .map((k) => `${k}:${this.shapeOf(control.controls[k])}`)
        .join(',');
      const active = control.get(CASE_KEY)?.value;
      return `{${typeof active === 'string' ? `=${active};` : ''}${inner}}`;
    }
    if (control instanceof FormArray) {
      return `[${control.controls.map((c) => this.shapeOf(c)).join(',')}]`;
    }
    return '.';
  }

  /** Rebuild the whole tree from schema + form and refresh the shape signature. */
  private rebuild(): void {
    const schema = this.schema();
    this.root = this.buildTree(schema, this.formGroup(), schema.label ?? schema.name, '');
    this.shape = this.shapeOf(this.formGroup());
  }

  /** Re-point `selected` at the rebuilt tree: same path, else the closest surviving ancestor. */
  private reconcileSelection(): void {
    const path = this.selected?.id ?? '';
    this.select(this.byPath(path) ?? this.root);
  }

  /** The node at `path` in the current tree, or null. Walks by id-prefix segments. */
  private byPath(path: string): TreeNode | null {
    if (path === this.root.id) return this.root;
    const walk = (node: TreeNode): TreeNode | null => {
      for (const child of node.children) {
        if (child.id === path) return child;
        if (path.startsWith(child.id + '/')) return walk(child);
      }
      return null;
    };
    return walk(this.root);
  }

  /** Select the node at `path`, falling back through its ancestors to the root. */
  private selectByPath(path: string): void {
    let target = this.byPath(path);
    let trimmed = path;
    while (!target && trimmed.includes('/')) {
      trimmed = trimmed.slice(0, trimmed.lastIndexOf('/'));
      target = this.byPath(trimmed);
    }
    this.select(target ?? this.root);
  }

  /**
   * The detail pane's view of a node: choice/map/list nodes render as a named
   * child of their parent group (so their own section chrome and controls
   * appear); group-backed nodes render their content flattened, since the
   * breadcrumb already titles them.
   */
  private computeDetail(node: TreeNode): DetailView | null {
    if (node.choice || node.map || node.list) {
      const ref = node.ref;
      if (!ref) return null;
      return {
        schema: {
          kind: 'nodeGroup',
          name: ref.key,
          appearance: { flatten: true },
          children: { [ref.key]: ref.schema },
        },
        group: ref.group,
      };
    }
    if (node.schema && node.group) {
      return {
        schema: { ...node.schema, root: false, appearance: { ...node.schema.appearance, flatten: true } },
        group: node.group,
      };
    }
    return null;
  }

  // --- tree construction -----------------------------------------------------

  private buildTree(schema: NodeGroup, group: FormGroup, label: string, path: string): TreeNode {
    const children: TreeNode[] = [];
    const optionals: OptionalEntry[] = [];

    for (const key of Object.keys(schema.children)) {
      const child = schema.children[key];
      if (child.kind === 'leaf' || child.kind === 'leafList') {
        // Leaves render in the detail pane; an absent presence leaf is offered by the menu.
        if (child.kind === 'leaf' && child.presence && !group.get(key)) {
          optionals.push({ key, schema: child, label: this.labelOf(child, key) });
        }
        continue;
      }
      const presence = child.kind !== 'nodeGroupList' && child.presence;
      if (presence && !group.get(key)) {
        optionals.push({ key, schema: child, label: this.labelOf(child, key) });
        continue;
      }
      const node = this.buildChildNode(child, group.get(key), this.labelOf(child, key), this.join(path, key));
      if (!node) continue;
      node.ref = { group, key, schema: child };
      if (presence) node.presenceRemovable = { key };
      children.push(node);
    }

    const node: TreeNode = { id: path, label, children, group, schema };
    if (optionals.length) node.optionals = optionals;
    return node;
  }

  /** Build the tree node for a single non-leaf child, dispatching on its kind. Null when its control is missing. */
  private buildChildNode(
    schema: NodeType,
    control: AbstractControl | null,
    label: string,
    path: string,
  ): TreeNode | null {
    if (schema.kind === 'nodeGroup') {
      return control instanceof FormGroup ? this.buildTree(schema, control, label, path) : null;
    }
    if (schema.kind === 'nodeGroupList') {
      const array = control;
      const itemLabel = schema.type.label ?? schema.type.name;
      const items =
        array instanceof FormArray
          ? array.controls
              .filter((c): c is FormGroup => c instanceof FormGroup)
              .map((item, i) => {
                // Just "#n": the item sits under its list node, so repeating the
                // item name (e.g. "Interface #1") only echoes the parent.
                const node = this.buildTree(schema.type, item, `#${i + 1}`, `${path}/${i}`);
                node.removable = { array, index: i };
                return node;
              })
          : [];
      return {
        id: path,
        label,
        children: items,
        group: null,
        list:
          array instanceof FormArray
            ? { array, itemSchema: schema.type, itemLabel, minItems: schema.minItems ?? 0 }
            : undefined,
      };
    }
    if (schema.kind === 'choice') {
      if (!(control instanceof FormGroup)) return null;
      const active = control.get(CASE_KEY)?.value as string | null;
      const node =
        active && schema.cases[active]
          ? this.buildTree(this.caseAsGroup(schema, active), control, label, path)
          : ({ id: path, label, children: [], group: control } as TreeNode);
      node.schema = undefined;
      node.choice = { schema, group: control };
      return node;
    }
    if (schema.kind === 'map') {
      if (!(control instanceof FormGroup)) return null;
      const complex =
        schema.value.kind === 'nodeGroup' ||
        schema.value.kind === 'choice' ||
        schema.value.kind === 'map' ||
        schema.value.kind === 'nodeGroupList';
      const entries = complex
        ? Object.keys(control.controls)
            .map((key) => {
              const entryNode = this.buildChildNode(schema.value, control.get(key), key, `${path}/${key}`);
              if (entryNode) {
                entryNode.mapEntry = { mapGroup: control, mapSchema: schema, key };
                entryNode.ref = { group: control, key, schema: schema.value };
              }
              return entryNode;
            })
            .filter((n): n is TreeNode => n !== null)
        : [];
      return {
        id: path,
        label,
        children: entries,
        group: null,
        map: { schema, group: control, complex },
      };
    }
    return null;
  }

  /** Synthetic group over a case's normalized fields, so a case body builds like any group. */
  private caseAsGroup(choice: NodeChoice, caseName: string): NodeGroup {
    return {
      kind: 'nodeGroup',
      name: choice.name,
      children: choice.cases[caseName] ? caseFields(choice.cases[caseName]) : {},
    };
  }

  /** A node's display label: its schema `label`, else its record key. */
  private labelOf(node: NodeType, key: string): string {
    return ('label' in node ? node.label : undefined) ?? key;
  }

  /** Join a parent path and a segment; the root's path is the empty string. */
  private join(parent: string, segment: string): string {
    return parent ? `${parent}/${segment}` : segment;
  }
}
