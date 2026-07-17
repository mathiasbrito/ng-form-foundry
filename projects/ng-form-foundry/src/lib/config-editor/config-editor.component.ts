import { Component, input, OnInit } from '@angular/core';
import { AbstractControl, FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltip } from '@angular/material/tooltip';
import {
  CASE_KEY,
  Leaf,
  LeafList,
  NodeChoice,
  NodeGroup,
  NodeMap,
  NodeType,
} from '../types/dynamic-recursive.types';
import { asFormArray, asFormControl } from '../core/utils';
import {
  addMapEntry,
  buildControl,
  buildFormFromSchema,
  caseFields,
  removeMapEntry,
  renameMapEntry,
  switchChoiceCase,
} from '../core/dynamic-recursive-forms-builder';
import { LeafRendererComponent } from '../dynamic-recursive-form/leaf-renderer/leaf-renderer.component';
import { LeafListRendererComponent } from '../dynamic-recursive-form/leaf-list-renderer/leaf-list-renderer.component';
import { NodeMapRendererComponent } from '../dynamic-recursive-form/node-map-renderer/node-map-renderer.component';

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
  /** Index in the parent schema's children iteration; keeps the menu in schema order. */
  order: number;
}

/** A navigable node in the config tree. Groups and list items are tree nodes; leaves are their detail. */
interface TreeNode {
  id: string;
  label: string;
  children: TreeNode[];
  /** Leaves editable when this node is selected. A presence leaf carries its `optional` entry so it can be removed back to the menu. */
  leaves: { key: string; node: Leaf; optional?: OptionalEntry }[];
  leafLists: { key: string; node: LeafList }[];
  /** The FormGroup holding this node's leaves, or null for a list-container or map node. */
  group: FormGroup | null;
  /** Present on a nodeGroupList node: lets a `+` add an item. */
  list?: ListRef;
  /** Present on a list-item node: the FormArray and current index it can be removed from. */
  removable?: { array: FormArray; index: number };
  /** Absent optional children of this node, offered by its "+ Optional field" menu. */
  optionals?: OptionalEntry[];
  /** Present on a present optional child node: drives the row's remove control; removal returns `entry` to the parent's menu. */
  presenceRemovable?: { entry: OptionalEntry };
  /** Present on a choice node: the choice schema and its FormGroup (holding `__case` + the active case's fields). */
  choice?: { schema: NodeChoice; group: FormGroup };
  /** Present on a map node. `complex` maps expand entries as child nodes; leaf-valued maps edit inline in the detail pane. */
  map?: { schema: NodeMap; group: FormGroup; complex: boolean };
  /** Present on a complex-map entry node: addresses the entry in its map for remove/rename. */
  mapEntry?: { mapGroup: FormGroup; mapSchema: NodeMap; key: string };
}

/**
 * A tree/detail editor for a schema-built form: the structure (groups, lists,
 * maps, choices) is a tree on the left, and selecting a node shows that node's
 * fields for editing on the right. A `+` on a list or map node adds an entry; a
 * delete button on each item removes it. Absent optional (presence) children are
 * offered by a "+ Optional field" menu row at the end of their parent's
 * children; present ones carry a delete button that returns them to the menu.
 *
 * The component draws no outer container — only a divider between the tree and
 * detail panes — so the embedding client owns the surrounding chrome. The tree
 * is built once from the `schema`/`formGroup` provided at initialization.
 * An alternative to the all-in-one {@link DynamicRecursiveFormComponent} for
 * large configs.
 */
@Component({
  selector: 'nff-config-editor',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgTemplateOutlet,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltip,
    LeafRendererComponent,
    LeafListRendererComponent,
    NodeMapRendererComponent,
  ],
  templateUrl: './config-editor.component.html',
  styleUrl: './config-editor.component.scss',
})
export class ConfigEditorComponent implements OnInit {
  /** The form-description schema whose structure the tree renders. */
  readonly schema = input.required<NodeGroup>();
  /** The schema-built reactive group the editor binds to and mutates. */
  readonly formGroup = input.required<FormGroup>();
  /** Whether fields accept input and structural controls (add/remove/menus) show. */
  readonly editable = input<boolean>(true);

  root!: TreeNode;
  selected: TreeNode | null = null;
  readonly expanded = new Set<string>();

  private nextId = 0;

  ngOnInit() {
    const schema = this.schema();
    this.root = this.buildTree(schema, this.formGroup(), schema.label ?? schema.name);
    this.expanded.add(this.root.id);
    this.select(this.root);
  }

  select(node: TreeNode) {
    this.selected = node;
    // Reveal the node's rows in the tree as it opens on the right. Navigating
    // also retires any pending just-added-leaf focus request.
    this.focusLeafKey = null;
    if (this.hasExpandableContent(node)) this.expanded.add(node.id);
  }

  /** Select a child (list item or sub-group) from the detail pane, keeping its parent expanded in the tree. */
  open(parent: TreeNode, child: TreeNode) {
    this.expanded.add(parent.id);
    this.select(child);
  }

  /**
   * Root-to-`target` path for the detail-pane breadcrumb (inclusive of both ends),
   * or an empty array if `target` is not in the current tree. Searched fresh each
   * call so it stays correct after add/remove/presence mutations rebuild subtrees.
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

  /** Append a new item to a list node's FormArray and to the tree, then select it. */
  addItem(listNode: TreeNode) {
    const list = listNode.list;
    if (!list) return;
    const group = buildFormFromSchema(list.itemSchema);
    list.array.push(group);
    const item = this.buildTree(list.itemSchema, group, list.itemLabel);
    item.removable = { array: list.array, index: list.array.length - 1 };
    listNode.children.push(item);
    this.renumber(listNode);
    this.expanded.add(listNode.id);
    this.select(item);
  }

  /** Remove a list item from its FormArray and the tree (down to `minItems`). */
  removeItem(listNode: TreeNode, item: TreeNode) {
    if (!listNode.list || !item.removable) return;
    if (listNode.list.array.length <= listNode.list.minItems) return;
    listNode.list.array.removeAt(item.removable.index);
    listNode.children.splice(listNode.children.indexOf(item), 1);
    this.renumber(listNode);
    this.reselectIfOrphaned(listNode);
  }

  /** The key of the optional leaf the user just added; its detail-pane field grabs focus when rendered. */
  protected focusLeafKey: string | null = null;

  /** Add an absent optional child from the menu: build its control, place it in the tree, and select it. */
  addOptional(node: TreeNode, entry: OptionalEntry) {
    if (!node.group || node.group.get(entry.key)) return;
    const control =
      entry.schema.kind === 'nodeGroup'
        ? buildFormFromSchema(entry.schema)
        : (buildControl(entry.schema) as AbstractControl);
    node.group.addControl(entry.key, control);
    node.optionals = node.optionals?.filter((o) => o !== entry);
    if (entry.schema.kind === 'leaf') {
      node.leaves.push({ key: entry.key, node: entry.schema, optional: entry });
      this.select(node);
      this.focusLeafKey = entry.key;
      return;
    }
    const child = this.buildChildNode(entry.schema, control, entry.label);
    if (!child) return;
    child.presenceRemovable = { entry };
    node.children.push(child);
    this.expanded.add(node.id);
    this.select(child);
  }

  /** Remove a present optional child node, returning its entry to the parent's menu. */
  removeOptional(parent: TreeNode, node: TreeNode) {
    const entry = node.presenceRemovable?.entry;
    if (!entry || !parent.group) return;
    parent.group.removeControl(entry.key);
    parent.children.splice(parent.children.indexOf(node), 1);
    this.reinsertOptional(parent, entry);
    this.reselectIfOrphaned(parent);
  }

  /** Remove a present optional leaf from the detail pane, returning its entry to the menu. */
  removeOptionalLeaf(node: TreeNode, leaf: { key: string; node: Leaf; optional?: OptionalEntry }) {
    if (!leaf.optional || !node.group) return;
    node.group.removeControl(leaf.key);
    node.leaves = node.leaves.filter((l) => l !== leaf);
    this.reinsertOptional(node, leaf.optional);
  }

  /** The active case name of a choice node, or null when none is selected. */
  activeCase(node: TreeNode): string | null {
    return (node.choice?.group.get(CASE_KEY)?.value as string | null) ?? null;
  }

  /** The display label of a choice node's active case, or null when no case is selected. */
  activeCaseLabel(node: TreeNode): string | null {
    const c = node.choice;
    const active = this.activeCase(node);
    return c && active ? this.caseLabel(c.schema, active) : null;
  }

  /** The display label for a case: the schema's `caseLabels` entry, else the case name. */
  caseLabel(choice: NodeChoice, caseName: string): string {
    return choice.caseLabels?.[caseName] ?? caseName;
  }

  /** Switch a choice node's active case: swap the group's controls and rebuild the subtree in place. */
  switchTreeCase(node: TreeNode, caseName: string) {
    const c = node.choice;
    if (!c) return;
    switchChoiceCase(c.group, c.schema, caseName);
    const rebuilt = this.buildTree(this.caseAsGroup(c.schema, caseName), c.group, node.label);
    node.children = rebuilt.children;
    node.leaves = rebuilt.leaves;
    node.leafLists = rebuilt.leafLists;
    node.optionals = rebuilt.optionals;
    this.expanded.add(node.id);
    this.select(node);
  }

  /** Append a new entry to a complex map node under a generated unique key, then select it. */
  addTreeMapEntry(mapNode: TreeNode) {
    const m = mapNode.map;
    if (!m) return;
    const key = addMapEntry(m.group, m.schema);
    if (key == null) return;
    const child = this.buildChildNode(m.schema.value, m.group.get(key), key);
    if (!child) return;
    child.mapEntry = { mapGroup: m.group, mapSchema: m.schema, key };
    mapNode.children.push(child);
    this.expanded.add(mapNode.id);
    this.select(child);
  }

  /** Remove a complex map entry (down to `minEntries`) from the form group and the tree. */
  removeTreeMapEntry(mapNode: TreeNode, entryNode: TreeNode) {
    const m = mapNode.map;
    const e = entryNode.mapEntry;
    if (!m || !e || !removeMapEntry(m.group, m.schema, e.key)) return;
    mapNode.children.splice(mapNode.children.indexOf(entryNode), 1);
    this.reselectIfOrphaned(mapNode);
  }

  /** Commit a rename-on-blur of a map entry's key; on success the node is relabeled. */
  renameTreeMapEntry(entryNode: TreeNode, rawKey: string) {
    const e = entryNode.mapEntry;
    if (!e) return;
    if (renameMapEntry(e.mapGroup, e.mapSchema, e.key, rawKey)) {
      const committed = rawKey.trim();
      e.key = committed;
      entryNode.label = committed;
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

  protected readonly asFormControl = asFormControl;
  protected readonly asFormArray = asFormArray;
  protected readonly CASE_KEY = CASE_KEY;

  objectKeys(obj: Record<string, unknown>): string[] {
    return Object.keys(obj);
  }

  /** Re-index and re-label a list node's item children (just "#n") after add/remove. */
  private renumber(listNode: TreeNode): void {
    listNode.children.forEach((child, i) => {
      if (child.removable) child.removable.index = i;
      child.label = `#${i + 1}`;
    });
  }

  /** Select `fallback` when the current selection is no longer reachable in the tree. */
  private reselectIfOrphaned(fallback: TreeNode): void {
    if (this.selected && this.pathTo(this.selected).length === 0) this.select(fallback);
  }

  /** Re-insert a removed optional's entry into the node's menu, keeping schema order. */
  private reinsertOptional(node: TreeNode, entry: OptionalEntry): void {
    const list = (node.optionals ??= []);
    const at = list.findIndex((o) => o.order > entry.order);
    if (at === -1) list.push(entry);
    else list.splice(at, 0, entry);
  }

  /** Synthetic group over a case's normalized fields, so a case body builds like any group. */
  private caseAsGroup(choice: NodeChoice, caseName: string): NodeGroup {
    return {
      kind: 'nodeGroup',
      name: choice.name,
      children: choice.cases[caseName] ? caseFields(choice.cases[caseName]) : {},
    };
  }

  private buildTree(schema: NodeGroup, group: FormGroup, label: string): TreeNode {
    const leaves: TreeNode['leaves'] = [];
    const leafLists: TreeNode['leafLists'] = [];
    const children: TreeNode[] = [];
    const optionals: OptionalEntry[] = [];

    const keys = Object.keys(schema.children);
    keys.forEach((key, order) => {
      const child = schema.children[key];
      const control = group.get(key);
      const entry: OptionalEntry = { key, schema: child, label: this.labelOf(child, key), order };
      if (child.kind === 'leaf') {
        if (child.presence && !control) optionals.push(entry);
        else if (control) leaves.push({ key, node: child, optional: child.presence ? entry : undefined });
        return;
      }
      if (child.kind === 'leafList') {
        leafLists.push({ key, node: child });
        return;
      }
      const presence = child.kind !== 'nodeGroupList' && child.presence;
      if (presence && !control) {
        optionals.push(entry);
        return;
      }
      const node = this.buildChildNode(child, control, entry.label);
      if (!node) return;
      if (presence) node.presenceRemovable = { entry };
      children.push(node);
    });

    const node: TreeNode = { id: String(this.nextId++), label, children, leaves, leafLists, group };
    if (optionals.length) node.optionals = optionals;
    return node;
  }

  /** Build the tree node for a single non-leaf child, dispatching on its kind. Null when its control is missing. */
  private buildChildNode(schema: NodeType, control: AbstractControl | null, label: string): TreeNode | null {
    if (schema.kind === 'nodeGroup') {
      return control instanceof FormGroup ? this.buildTree(schema, control, label) : null;
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
                const node = this.buildTree(schema.type, item, `#${i + 1}`);
                node.removable = { array, index: i };
                return node;
              })
          : [];
      return {
        id: String(this.nextId++),
        label,
        children: items,
        leaves: [],
        leafLists: [],
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
          ? this.buildTree(this.caseAsGroup(schema, active), control, label)
          : ({ id: String(this.nextId++), label, children: [], leaves: [], leafLists: [], group: control } as TreeNode);
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
              const entryNode = this.buildChildNode(schema.value, control.get(key), key);
              if (entryNode) entryNode.mapEntry = { mapGroup: control, mapSchema: schema, key };
              return entryNode;
            })
            .filter((n): n is TreeNode => n !== null)
        : [];
      return {
        id: String(this.nextId++),
        label,
        children: entries,
        leaves: [],
        leafLists: [],
        group: null,
        map: { schema, group: control, complex },
      };
    }
    return null;
  }

  /** A node's display label: its schema `label`, else its record key. */
  private labelOf(node: NodeType, key: string): string {
    return ('label' in node ? node.label : undefined) ?? key;
  }
}
