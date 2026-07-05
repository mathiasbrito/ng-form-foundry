import { Component, Input, OnInit } from '@angular/core';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltip } from '@angular/material/tooltip';
import { Leaf, LeafList, NodeGroup } from '../types/dynamic-recursive.types';
import { asFormArray, asFormControl } from '../core/utils';
import { buildFormFromSchema } from '../core/dynamic-recursive-forms-builder';
import { LeafRendererComponent } from '../dynamic-recursive-form/leaf-renderer/leaf-renderer.component';
import { LeafListRendererComponent } from '../dynamic-recursive-form/leaf-list-renderer/leaf-list-renderer.component';

/** Metadata on a list-container node that lets the tree add items to its FormArray. */
interface ListRef {
  array: FormArray;
  itemSchema: NodeGroup;
  itemLabel: string;
  minItems: number;
}

/** A navigable node in the config tree. Groups and list items are tree nodes; leaves are their detail. */
interface TreeNode {
  id: string;
  label: string;
  children: TreeNode[];
  /** Leaves editable when this node is selected. Empty for list-container nodes. */
  leaves: { key: string; node: Leaf }[];
  leafLists: { key: string; node: LeafList }[];
  /** The FormGroup holding this node's leaves, or null for a list-container node. */
  group: FormGroup | null;
  /** Present on a nodeGroupList node: lets a `+` add an item. */
  list?: ListRef;
  /** Present on a list-item node: the FormArray and current index it can be removed from. */
  removable?: { array: FormArray; index: number };
  /** Present on an optional (presence) group node: lets a checkbox add/remove the group. */
  presence?: { parentGroup: FormGroup; key: string; schema: NodeGroup };
  /** For a presence node: whether the group is currently present. */
  present?: boolean;
}

/**
 * A tree/detail editor for a schema-built form: the structure (containers, lists,
 * groups) is a tree on the left, and selecting a node shows that node's leaf
 * fields for editing on the right. A `+` on a list node adds an entry; a delete
 * button on each item removes it. An alternative to the all-in-one
 * {@link DynamicRecursiveFormComponent} for large configs.
 */
@Component({
  selector: 'nff-config-editor',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgTemplateOutlet,
    MatIconModule,
    MatButtonModule,
    MatCheckboxModule,
    MatTooltip,
    LeafRendererComponent,
    LeafListRendererComponent,
  ],
  templateUrl: './config-editor.component.html',
  styleUrl: './config-editor.component.scss',
})
export class ConfigEditorComponent implements OnInit {
  @Input({ required: true }) schema!: NodeGroup;
  @Input({ required: true }) formGroup!: FormGroup;
  @Input() editable = true;

  root!: TreeNode;
  selected: TreeNode | null = null;
  readonly expanded = new Set<string>();

  private nextId = 0;

  ngOnInit() {
    this.root = this.buildTree(this.schema, this.formGroup, this.schema.label ?? this.schema.name);
    this.expanded.add(this.root.id);
    this.select(this.root);
  }

  select(node: TreeNode) {
    this.selected = node;
    // Reveal the node's direct children in the tree as it opens on the right.
    if (node.children.length) this.expanded.add(node.id);
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
    if (this.selected === item) this.select(listNode);
  }

  /** Enable or disable an optional (presence) group by adding/removing its control. */
  setPresence(node: TreeNode, present: boolean) {
    const p = node.presence;
    if (!p) return;
    if (present) {
      if (!(p.parentGroup.get(p.key) instanceof FormGroup)) {
        const group = buildFormFromSchema(p.schema);
        p.parentGroup.addControl(p.key, group);
        const built = this.buildTree(p.schema, group, node.label);
        node.children = built.children;
        node.leaves = built.leaves;
        node.leafLists = built.leafLists;
        node.group = group;
      }
      node.present = true;
      this.select(node);
    } else {
      p.parentGroup.removeControl(p.key);
      node.children = [];
      node.leaves = [];
      node.leafLists = [];
      node.group = null;
      node.present = false;
    }
  }

  protected readonly asFormControl = asFormControl;
  protected readonly asFormArray = asFormArray;

  private placeholder(label: string): TreeNode {
    return { id: String(this.nextId++), label, children: [], leaves: [], leafLists: [], group: null };
  }

  /** Re-index and re-label a list node's item children (just "#n") after add/remove. */
  private renumber(listNode: TreeNode): void {
    listNode.children.forEach((child, i) => {
      if (child.removable) child.removable.index = i;
      child.label = `#${i + 1}`;
    });
  }

  private buildTree(schema: NodeGroup, group: FormGroup, label: string): TreeNode {
    const leaves: TreeNode['leaves'] = [];
    const leafLists: TreeNode['leafLists'] = [];
    const children: TreeNode[] = [];

    for (const key of Object.keys(schema.children)) {
      const child = schema.children[key];
      if (child.kind === 'leaf') {
        leaves.push({ key, node: child });
      } else if (child.kind === 'leafList') {
        leafLists.push({ key, node: child });
      } else if (child.kind === 'nodeGroup') {
        const childGroup = group.get(key);
        if (child.presence) {
          // Optional group: always a tree node — a placeholder when absent.
          const node =
            childGroup instanceof FormGroup
              ? this.buildTree(child, childGroup, child.label ?? key)
              : this.placeholder(child.label ?? key);
          node.presence = { parentGroup: group, key, schema: child };
          node.present = childGroup instanceof FormGroup;
          children.push(node);
        } else if (childGroup instanceof FormGroup) {
          children.push(this.buildTree(child, childGroup, child.label ?? key));
        }
      } else if (child.kind === 'nodeGroupList') {
        const array = group.get(key);
        const itemLabel = child.type.label ?? child.type.name;
        const items =
          array instanceof FormArray
            ? array.controls
                .filter((c): c is FormGroup => c instanceof FormGroup)
                .map((item, i) => {
                  // Just "#n": the item sits under its list node, so repeating the
                  // item name (e.g. "Interface #1") only echoes the parent.
                  const node = this.buildTree(child.type, item, `#${i + 1}`);
                  node.removable = { array, index: i };
                  return node;
                })
            : [];
        children.push({
          id: String(this.nextId++),
          label: child.label ?? key,
          children: items,
          leaves: [],
          leafLists: [],
          group: null,
          list:
            array instanceof FormArray
              ? { array, itemSchema: child.type, itemLabel, minItems: child.minItems ?? 0 }
              : undefined,
        });
      }
      // choice nodes are not shown in the tree yet.
    }

    return { id: String(this.nextId++), label, children, leaves, leafLists, group };
  }
}
