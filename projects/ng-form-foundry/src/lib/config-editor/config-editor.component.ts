import { Component, effect, ElementRef, inject, input, model, OnDestroy, untracked } from '@angular/core';
import { AbstractControl, FormArray, FormGroup } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { Subscription } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltip } from '@angular/material/tooltip';
import { Appearance, CASE_KEY, NodeChoice, NodeGroup, NodeMap, NodeType } from '../types/dynamic-recursive.types';
import { descendantLayout } from '../core/appearance';
import {
  addMapEntry,
  buildControl,
  buildFormFromSchema,
  caseDisplayLabels,
  caseFields,
  removeMapEntry,
  renameMapEntry,
  switchChoiceCase,
} from '../core/dynamic-recursive-forms-builder';
import { DynamicRecursiveFormComponent } from '../dynamic-recursive-form/dynamic-recursive-form.component';
import { NodeMapRendererComponent } from '../dynamic-recursive-form/node-map-renderer/node-map-renderer.component';

/**
 * The transformers package names a root nobody named `__root__` — a sentinel,
 * not display text (the packages share no code, so the string is matched here
 * verbatim). The tree substitutes {@link ROOT_FALLBACK_TITLE} for it; any
 * other root name is an authored one and displays as-is.
 */
const ROOT_SENTINEL = '__root__';
const ROOT_FALLBACK_TITLE = 'Configuration';

/** Metadata on a list-container node that lets the tree add items to its FormArray. */
interface ListRef {
  array: FormArray;
  itemSchema: NodeGroup;
  itemLabel: string;
  minItems: number;
  maxItems?: number;
}

/** An absent optional (presence) child, offered by its parent node's "+ Optional field" menu. */
interface OptionalEntry {
  key: string;
  schema: NodeType;
  label: string;
}

/**
 * One flat section of the detail pane. The selected node's subtree renders as a
 * pre-order list of these — no nesting chrome: each section after the first is
 * separated by a breadcrumb heading (`trail`), and holds only the node's *own*
 * fields (`schema` is a leaf-only slice; complex children are sections of their
 * own, deeper in the list).
 */
interface DetailSection {
  node: TreeNode;
  /** Selected-node-to-here trail, rendered as the section's breadcrumb heading (omitted on the first section). */
  trail: TreeNode[];
  /** Leaf-only slice of the node's own schema, or null when it has no own fields. */
  schema: NodeGroup | null;
  /** The group `schema` binds to (the node's group; for a choice, the choice group). */
  group: FormGroup | null;
  /** A trailing add-control section of a list / complex map: renders after the last item, with no heading. */
  footer?: boolean;
  /** The section continues a run of same-list items / same-map entries: its heading draws no divider line. */
  continuation?: boolean;
}

/**
 * A navigable node in the config tree. Its `id` is the node's stable path from
 * the root (`system/ntp`, `ifaces/0`, `servers/web1`), so expansion and
 * selection survive tree rebuilds. Segments are `%`/`/`-escaped, since map
 * entry keys are arbitrary runtime data; list-item identity is positional.
 */
interface TreeNode {
  id: string;
  label: string;
  children: TreeNode[];
  /** The node's own FormGroup, or null for a list-container or map node. */
  group: FormGroup | null;
  /** The node's own schema, set on group-backed nodes (groups, list items, group-valued map entries). */
  schema?: NodeGroup;
  /** Present on a nodeGroupList node: lets a `+` add an item. */
  list?: ListRef;
  /** Present on a list-item node: its current index in the parent list (removal goes through the parent list array). */
  removable?: { index: number };
  /** Absent optional children of this node, offered by its "+ Optional field" menu (schema order). */
  optionals?: OptionalEntry[];
  /** Present on a present optional child node: drives the row's remove control. */
  presenceRemovable?: { key: string };
  /** Field-layout appearance inherited from ancestor groups, for the node's detail-section form. */
  inherited?: Appearance | null;
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
 * node's **entire subtree** on the right as a **flat list of sections** — the
 * node's own fields first, then every descendant's fields, each separated by a
 * breadcrumb heading (`Service / Deploy scope / …`) instead of nested panels.
 * Leaf fields render through {@link DynamicRecursiveFormComponent} with a
 * leaf-only schema slice; choice selectors, map rows, and add controls render
 * inline in their section. The tree adds row conveniences of its own: `+` on
 * list and map rows, a delete control on removable rows, and a
 * "+ Optional field" menu for absent presence children.
 *
 * The tree is **derived state**: any structural change to the form — made
 * through the tree rows or through the detail sections — triggers a rebuild (a
 * cheap shape signature over `valueChanges` detects it). Node ids are stable
 * paths, so expansion and selection survive rebuilds. Swapping the `schema` or
 * `formGroup` input rebinds the editor to the new pair, resetting expansion
 * and selection.
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
    MatSelectModule,
    MatTooltip,
    DynamicRecursiveFormComponent,
    NodeMapRendererComponent,
  ],
  templateUrl: './config-editor.component.html',
  styleUrl: './config-editor.component.scss',
})
export class ConfigEditorComponent implements OnDestroy {
  /** The form-description schema whose structure the tree renders. */
  readonly schema = input.required<NodeGroup>();
  /** The schema-built reactive group the editor binds to and mutates. */
  readonly formGroup = input.required<FormGroup>();
  /**
   * Whether fields accept input and structural controls (add/remove/menus)
   * show. Two-way bindable: the root tree row carries a toggle, so the editor
   * can flip it itself and the host observes the change.
   */
  readonly editable = model<boolean>(true);
  /**
   * Title for the root tree row and breadcrumb origin, overriding the schema's
   * own `label`/`name`. Read when the tree is (re)built, so a later change
   * shows on the next rebind or structural rebuild, not immediately.
   */
  readonly rootTitle = input<string>();
  /**
   * Whether selecting a tree row also expands the node's own children.
   * Off by default: a click selects (the detail pane shows the subtree
   * anyway) and the twisty alone controls expansion, so browsing a deep
   * config does not keep unfolding the tree. Ancestors of the selection are
   * always expanded — the selected row itself must stay visible.
   */
  readonly expandOnClick = input<boolean>(false);
  /**
   * Whether the detail pane shows its top breadcrumb (the selected node's
   * path, with the member remove control beside it). Hosts whose tree
   * already tells the user where they are can turn it off — the section
   * trail headings inside the detail stay, and member removal remains
   * available on the tree rows and section headings.
   */
  readonly showBreadcrumb = input<boolean>(true);

  root!: TreeNode;
  selected: TreeNode | null = null;
  /** The selected subtree as a flat, breadcrumb-separated section list. */
  sections: DetailSection[] = [];
  /** Root-to-selection trail for the detail-pane breadcrumb, computed once per selection. */
  breadcrumb: TreeNode[] = [];
  readonly expanded = new Set<string>();

  private shape = '';
  private changes?: Subscription;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Stable per-instance ids for the shape signature, so replacing a control (setControl) reads as a structural change. */
  private readonly controlIds = new WeakMap<AbstractControl, number>();
  private controlIdSeq = 0;

  constructor() {
    // Rebind whenever the schema or form inputs change (a host loading another
    // config document): derived state resets against the new pair. Wrapped in
    // untracked so only the two inputs re-trigger the effect.
    effect(() => {
      const schema = this.schema();
      const group = this.formGroup();
      untracked(() => this.attach(schema, group));
    });
  }

  ngOnDestroy() {
    this.changes?.unsubscribe();
  }

  /** Bind the editor to a schema/form pair: fresh tree, root selection, and shape-sync subscription. */
  private attach(schema: NodeGroup, group: FormGroup): void {
    this.changes?.unsubscribe();
    this.expanded.clear();
    this.root = this.buildTree(schema, group, this.rootLabelOf(schema), '');
    this.shape = this.shapeOf(group);
    this.expanded.add(this.root.id);
    this.select(this.root);
    // The detail sections mutate the FormGroup directly (presence toggles,
    // list items, map entries, case switches); a shape change there must
    // reflect in the tree.
    this.changes = group.valueChanges.subscribe(() => this.syncShape());
  }

  select(node: TreeNode, reveal = true) {
    this.selected = node;
    // Sections that would render only their breadcrumb heading (a composite
    // node with no leaf fields and no chrome) are dropped: their children get
    // sections of their own, whose trails carry the full path anyway.
    this.sections = this.markContinuations(
      this.buildSections(node, []).filter((s, i) => i === 0 || this.sectionHasContent(s)),
    );
    this.breadcrumb = this.pathTo(node);
    // Navigating retires any pending just-added-leaf focus request.
    this.focusSectionId = null;
    this.focusLeafKey = null;
    // Reveal the selection: expand every ancestor so the row is visible —
    // and the node itself only under `expandOnClick` (the detail pane shows
    // its subtree regardless). Structural re-syncs pass reveal=false — they
    // must not re-expand what the user collapsed.
    if (reveal) {
      for (const crumb of this.breadcrumb) {
        if (crumb !== node) this.expanded.add(crumb.id);
        else if (this.expandOnClick() && this.hasExpandableContent(crumb)) this.expanded.add(crumb.id);
      }
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

  protected toggle(node: TreeNode) {
    if (this.expanded.has(node.id)) this.expanded.delete(node.id);
    else this.expanded.add(node.id);
  }

  /** Keyboard access for tree rows: Enter/Space selects, ArrowRight expands, ArrowLeft collapses. */
  protected onRowKeydown(event: KeyboardEvent, node: TreeNode) {
    // Keys pressed on the row's inner buttons keep their own meaning.
    if (event.target !== event.currentTarget) return;
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.select(node);
        break;
      case 'ArrowRight':
        if (this.hasExpandableContent(node) && !this.expanded.has(node.id)) {
          event.preventDefault();
          this.expanded.add(node.id);
        }
        break;
      case 'ArrowLeft':
        if (this.expanded.has(node.id)) {
          event.preventDefault();
          this.expanded.delete(node.id);
        }
        break;
    }
  }

  /** Whether the row shows an expand twisty: it has child rows to reveal (children or an optionals menu row). */
  protected hasExpandableContent(node: TreeNode): boolean {
    return node.children.length > 0 || (this.editable() && !!node.optionals?.length);
  }

  /**
   * Whether the node's form subtree holds a validation error. Group/choice, list,
   * and map nodes each check their backing control; `invalid` aggregates over
   * descendants, so an error anywhere below lights every ancestor row.
   */
  protected hasError(node: TreeNode): boolean {
    return !!(node.group?.invalid || node.list?.array.invalid || node.map?.group.invalid);
  }

  /**
   * Append a new item to a list node's FormArray (up to `maxItems`). A tree-row
   * add selects the new item; a detail-pane add passes `keepSelection` so the
   * current (possibly ancestor) view stays put and the item appears as a new
   * section in it.
   */
  addItem(listNode: TreeNode, keepSelection = false) {
    const list = listNode.list;
    if (!list) return;
    if (list.maxItems != null && list.array.length >= list.maxItems) return;
    list.array.push(buildFormFromSchema(list.itemSchema));
    if (keepSelection) this.selectByPath(this.selected?.id ?? '', false);
    else this.selectByPath(this.join(listNode.id, String(list.array.length - 1)));
  }

  /**
   * Remove a list item from its FormArray (down to `minItems`). List-item
   * identity is positional, so expansion state under the list is cleared —
   * otherwise it would silently migrate to the items that shift into the
   * removed indexes.
   */
  removeItem(listNode: TreeNode, item: TreeNode, keepSelection = false) {
    if (!listNode.list || !item.removable) return;
    if (listNode.list.array.length <= listNode.list.minItems) return;
    for (const id of [...this.expanded]) {
      if (id.startsWith(`${listNode.id}/`)) this.expanded.delete(id);
    }
    listNode.list.array.removeAt(item.removable.index);
    // A detail-pane remove keeps the (ancestor) selection; a tree-row remove
    // moves to the list and returns focus to its row.
    if (keepSelection) {
      this.selectByPath(this.selected?.id ?? '', false);
      return;
    }
    this.selectByPath(listNode.id);
    this.focusSelectedRow();
  }

  /** The just-added optional leaf (section path + key) whose field grabs focus when rendered. */
  protected focusSectionId: string | null = null;
  protected focusLeafKey: string | null = null;

  /** Add an absent optional child from the menu: build its control and select the node it lands on. */
  addOptional(node: TreeNode, entry: OptionalEntry) {
    if (!node.group || node.group.get(entry.key)) return;
    node.group.addControl(entry.key, buildControl(entry.schema) as AbstractControl);
    // A leaf renders in the parent's detail pane; complex kinds become tree nodes.
    this.selectByPath(entry.schema.kind === 'leaf' ? node.id : this.join(node.id, entry.key));
    // Adding the last optional removes the menu row that held focus.
    if (entry.schema.kind !== 'leaf') this.focusSelectedRow();
    if (entry.schema.kind === 'leaf') {
      // Set after selection (select() retires any pending request): the new
      // field should grab focus, like the form's own add button. Retired after
      // a tick so later re-renders of the section cannot steal focus again.
      this.focusSectionId = node.id;
      this.focusLeafKey = entry.key;
      setTimeout(() => {
        if (this.focusLeafKey === entry.key) {
          this.focusSectionId = null;
          this.focusLeafKey = null;
        }
      });
    }
  }

  /** Remove a present optional child node, returning its entry to the parent's menu. */
  removeOptional(parent: TreeNode, node: TreeNode) {
    const key = node.presenceRemovable?.key;
    if (!key || !parent.group) return;
    parent.group.removeControl(key);
    this.selectByPath(parent.id);
    this.focusSelectedRow();
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

  /**
   * The display label for a case: the schema's `caseLabels` entry (colliding
   * labels disambiguated by their distinguishing fields — see
   * {@link caseDisplayLabels}), else the case name.
   */
  protected caseLabel(choice: NodeChoice, caseName: string): string {
    return caseDisplayLabels(choice)[caseName] ?? caseName;
  }

  /**
   * Switch a choice node's active case from its detail selector; the
   * structural sync rebuilds the tree and sections. The tree selection stays
   * where it is: detail edits must never steal it, or a flattened ancestor
   * view would collapse to the choice node mid-edit. Selection moves only
   * through the tree itself.
   */
  switchTreeCase(node: TreeNode, caseName: string) {
    const c = node.choice;
    if (!c) return;
    switchChoiceCase(c.group, c.schema, caseName);
    this.selectByPath(this.selected?.id ?? node.id, false);
  }

  protected objectKeys(obj: Record<string, unknown>): string[] {
    return Object.keys(obj);
  }

  /**
   * Append a new entry to a complex map node under a generated unique key. A
   * tree-row add selects the new entry; a detail-pane add passes
   * `keepSelection` so the current view stays put (see {@link addItem}).
   */
  addTreeMapEntry(mapNode: TreeNode, keepSelection = false) {
    const m = mapNode.map;
    if (!m) return;
    const key = addMapEntry(m.group, m.schema);
    if (key == null) return;
    if (keepSelection) this.selectByPath(this.selected?.id ?? '', false);
    else this.selectByPath(this.join(mapNode.id, key));
  }

  /** Remove a complex map entry (down to `minEntries`). */
  removeTreeMapEntry(mapNode: TreeNode, entryNode: TreeNode, keepSelection = false) {
    const m = mapNode.map;
    const e = entryNode.mapEntry;
    if (!m || !e || !removeMapEntry(m.group, m.schema, e.key)) return;
    if (keepSelection) {
      this.selectByPath(this.selected?.id ?? '', false);
      return;
    }
    this.selectByPath(mapNode.id);
    this.focusSelectedRow();
  }

  /**
   * Commit a rename-on-blur of a map entry's key; on success the selection is
   * remapped to the entry's new identity when it pointed at (or inside) the
   * entry — otherwise it stays put — and the fresh key field regains focus
   * (the rename re-renders the section under a new id, destroying the input
   * that held focus).
   */
  renameTreeMapEntry(entryNode: TreeNode, rawKey: string) {
    const e = entryNode.mapEntry;
    if (!e) return;
    // Captured before the mutation: the rename's structural sync reconciles
    // the selection against the stale id (falling back to an ancestor) before
    // this method can remap it.
    const selectedId = this.selected?.id ?? '';
    if (renameMapEntry(e.mapGroup, e.mapSchema, e.key, rawKey)) {
      const parentPath = entryNode.id.slice(0, entryNode.id.lastIndexOf('/'));
      const newId = this.join(parentPath, rawKey.trim());
      // The entry's descendants keep their expansion under the new identity.
      for (const id of [...this.expanded]) {
        if (id === entryNode.id || id.startsWith(`${entryNode.id}/`)) {
          this.expanded.delete(id);
          this.expanded.add(newId + id.slice(entryNode.id.length));
        }
      }
      // Selection is remapped, not moved: it follows the rename only when it
      // sat on the entry (or inside it); an ancestor view stays put.
      const followed =
        selectedId === entryNode.id || selectedId.startsWith(`${entryNode.id}/`)
          ? newId + selectedId.slice(entryNode.id.length)
          : selectedId;
      this.selectByPath(followed, false);
      // Deferred so the rebuilt section's key field exists before focusing.
      setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.detail .key-field input')?.focus());
    }
  }

  /** Move keyboard focus to the selected tree row once the action's re-render settles. */
  private focusSelectedRow(): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.tree-row.selected')?.focus());
  }

  /** A muted hint for a section whose node currently renders no content of its own. */
  /**
   * Explains a group's `minPresent`/`maxPresent` violation next to the red
   * tree marker: the fix is enabling or removing optional fields, which is not
   * evident from any single field's own error.
   */
  protected presentRangeHint(s: DetailSection): string | null {
    const errors = s.node.group?.errors;
    const min = errors?.['minPresent'];
    if (min) {
      const noun = min.required === 1 ? 'field' : 'fields';
      return `At least ${min.required} ${noun} must be set (${min.actual} set) — add from the optional-fields menu.`;
    }
    const max = errors?.['maxPresent'];
    if (max) return `At most ${max.allowed} of these fields may be set (${max.actual} set).`;
    return null;
  }

  protected emptySectionHint(s: DetailSection): string | null {
    const n = s.node;
    if (n.list && !n.children.length) return `No ${n.list.itemLabel} items.`;
    if (n.map?.complex && !n.children.length) return 'No entries.';
    if (n.map && !n.map.complex && !Object.keys(n.map.group.controls).length && !this.editable()) {
      return 'No entries.';
    }
    return null;
  }

  /** Whether a list node is at `maxItems` (the add control is hidden). */
  protected listAtMax(node: TreeNode | undefined): boolean {
    const l = node?.list;
    return !!l && l.maxItems != null && l.array.length >= l.maxItems;
  }

  /** Whether a list node is at `minItems` (item remove controls are hidden). */
  protected listAtMin(node: TreeNode | undefined): boolean {
    const l = node?.list;
    return !!l && l.array.length <= l.minItems;
  }

  /** Whether a map node is at `maxEntries` (the add control is hidden). */
  protected mapAtMax(node: TreeNode | undefined): boolean {
    const m = node?.map;
    return !!m && m.schema.maxEntries != null && Object.keys(m.group.controls).length >= m.schema.maxEntries;
  }

  /** Whether a map node is at `minEntries` (entry remove controls are hidden). */
  protected mapAtMin(node: TreeNode | undefined): boolean {
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
   * added/removed/renamed controls and case switches do. Reading `__case` from
   * any group is safe because the name is reserved (the builder rejects it as a
   * case field name or map entry key), so only choice groups carry it.
   */
  private shapeOf(control: AbstractControl): string {
    if (control instanceof FormGroup) {
      const inner = Object.keys(control.controls)
        .sort()
        .map((k) => `${k}:${this.shapeOf(control.controls[k])}`)
        .join(',');
      const active = control.get(CASE_KEY)?.value;
      return `{#${this.uidOf(control)}${typeof active === 'string' ? `=${active};` : ''}${inner}}`;
    }
    if (control instanceof FormArray) {
      return `[#${this.uidOf(control)}${control.controls.map((c) => this.shapeOf(c)).join(',')}]`;
    }
    return '.';
  }

  /** The instance id a container contributes to the shape signature. */
  private uidOf(control: AbstractControl): number {
    let id = this.controlIds.get(control);
    if (id == null) {
      id = ++this.controlIdSeq;
      this.controlIds.set(control, id);
    }
    return id;
  }

  /** Root row title: host override, else schema label, else its name — with the {@link ROOT_SENTINEL} swapped for a generic title. */
  private rootLabelOf(schema: NodeGroup): string {
    return this.rootTitle() ?? schema.label ?? (schema.name === ROOT_SENTINEL ? ROOT_FALLBACK_TITLE : schema.name);
  }

  /** Rebuild the whole tree from schema + form and refresh the shape signature. */
  private rebuild(): void {
    const schema = this.schema();
    this.root = this.buildTree(schema, this.formGroup(), this.rootLabelOf(schema), '');
    this.shape = this.shapeOf(this.formGroup());
  }

  /** Re-point `selected` at the rebuilt tree: same path, else the closest surviving ancestor. */
  private reconcileSelection(): void {
    this.selectByPath(this.selected?.id ?? '', false);
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
  private selectByPath(path: string, reveal = true): void {
    let target = this.byPath(path);
    let trimmed = path;
    while (!target && trimmed.includes('/')) {
      trimmed = trimmed.slice(0, trimmed.lastIndexOf('/'));
      target = this.byPath(trimmed);
    }
    this.select(target ?? this.root, reveal);
  }

  /**
   * Flatten a subtree into detail sections, pre-order: the node's own fields
   * first, then each child as its own breadcrumb-headed section. No nesting
   * chrome — the headings are the boundaries between children.
   */
  private buildSections(node: TreeNode, trail: TreeNode[]): DetailSection[] {
    const here = [...trail, node];
    const list: DetailSection[] = [{ node, trail: here, ...this.sectionContent(node) }];
    for (const child of node.children) list.push(...this.buildSections(child, here));
    // A list's / complex map's add control trails its items — appending
    // belongs after the last member, not under the container's heading.
    if (node.list || node.map?.complex) {
      list.push({ node, trail: here, schema: null, group: null, footer: true });
    }
    return list;
  }

  /**
   * Whether a section renders anything beyond its heading: a leaf slice, the
   * chrome of its node kind (case selector, key field, add controls), or a
   * present-children error that needs explaining. Heading-only sections are
   * dropped from the flat list — a divider with nothing under it is clutter.
   */
  private sectionHasContent(s: DetailSection): boolean {
    if (s.footer) return true;
    const n = s.node;
    // A non-empty list / complex map's leading section would hold only its
    // heading (the add control lives in the footer): drop it — the items'
    // trails carry the container in their breadcrumbs.
    return !!(
      s.schema ||
      n.choice ||
      n.mapEntry ||
      (n.map && !n.map.complex) ||
      this.emptySectionHint(s) ||
      this.presentRangeHint(s)
    );
  }

  /** Every expandable node currently expanded — drives the root row's expand/collapse-all toggle. */
  protected allExpanded(): boolean {
    let all = true;
    const walk = (node: TreeNode): void => {
      if (!all) return;
      if (this.hasExpandableContent(node) && !this.expanded.has(node.id)) all = false;
      for (const child of node.children) walk(child);
    };
    walk(this.root);
    return all;
  }

  /**
   * Expand every expandable node, or collapse back when all are open. The
   * collapse keeps the root open — a tree reduced to one row reads as empty.
   */
  protected toggleExpandAll(): void {
    if (this.allExpanded()) {
      this.expanded.clear();
      this.expanded.add(this.root.id);
      return;
    }
    const walk = (node: TreeNode): void => {
      if (this.hasExpandableContent(node)) this.expanded.add(node.id);
      for (const child of node.children) walk(child);
    };
    walk(this.root);
  }

  /** The selected member's container (list / map), for the breadcrumb's remove control. */
  protected selectedMemberParent(): TreeNode | null {
    if (!this.selected || !(this.selected.removable || this.selected.mapEntry)) return null;
    return this.breadcrumb.length > 1 ? (this.breadcrumb[this.breadcrumb.length - 2] ?? null) : null;
  }

  /** The section node's container (list / map), for member controls in its heading. */
  protected memberParent(s: DetailSection): TreeNode | null {
    return s.trail.length > 1 ? (s.trail[s.trail.length - 2] ?? null) : null;
  }

  /**
   * Flag the sections that continue a run of siblings — a list item or map
   * entry whose preceding section is inside the same container. Their headings
   * draw no divider line, so a run of same-kind members reads as one list
   * rather than a stack of separated blocks.
   */
  private markContinuations(sections: DetailSection[]): DetailSection[] {
    for (let i = 1; i < sections.length; i++) {
      const s = sections[i];
      if (s.footer || !(s.node.removable || s.node.mapEntry)) continue;
      const containerId = s.node.id.slice(0, s.node.id.lastIndexOf('/'));
      const prev = sections[i - 1].node.id;
      if (prev === containerId || prev.startsWith(`${containerId}/`)) s.continuation = true;
    }
    return sections;
  }

  /** A section's own renderable fields: a leaf-only schema slice and the group it binds to. */
  private sectionContent(node: TreeNode): { schema: NodeGroup | null; group: FormGroup | null } {
    if (node.choice) {
      const active = this.activeCase(node);
      const body = active && node.choice.schema.cases[active] ? this.caseAsGroup(node.choice.schema, active) : null;
      return { schema: body ? this.leafOnly(body) : null, group: node.choice.group };
    }
    if (node.schema && node.group) {
      return { schema: this.leafOnly(node.schema), group: node.group };
    }
    return { schema: null, group: null };
  }

  /**
   * The node's own fields as a flattened schema: leaf and leafList children
   * only. Complex children are rendered as sections of their own, so the
   * embedded form never draws nested section chrome. The node's `appearance`
   * (grid / field-width layout) carries into the slice. Null when there are
   * no own fields.
   */
  private leafOnly(schema: NodeGroup): NodeGroup | null {
    const children: Record<string, NodeType> = {};
    for (const key of Object.keys(schema.children)) {
      const child = schema.children[key];
      if (child.kind === 'leaf' || child.kind === 'leafList') children[key] = child;
    }
    if (!Object.keys(children).length) return null;
    return { ...schema, root: false, children, appearance: { ...schema.appearance, flatten: true } };
  }

  // --- tree construction -----------------------------------------------------

  private buildTree(
    schema: NodeGroup,
    group: FormGroup,
    label: string,
    path: string,
    inherited: Appearance | null = null,
  ): TreeNode {
    const children: TreeNode[] = [];
    const optionals: OptionalEntry[] = [];
    const childInherited = descendantLayout(inherited, schema.appearance);

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
      const node = this.buildChildNode(child, group.get(key), this.labelOf(child, key), this.join(path, key), childInherited);
      if (!node) continue;
      if (presence) node.presenceRemovable = { key };
      children.push(node);
    }

    const node: TreeNode = { id: path, label, children, group, schema, inherited };
    if (optionals.length) node.optionals = optionals;
    return node;
  }

  /** Build the tree node for a single non-leaf child, dispatching on its kind. Null when its control is missing. */
  private buildChildNode(
    schema: NodeType,
    control: AbstractControl | null,
    label: string,
    path: string,
    inherited: Appearance | null = null,
  ): TreeNode | null {
    if (schema.kind === 'nodeGroup') {
      return control instanceof FormGroup ? this.buildTree(schema, control, label, path, inherited) : null;
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
                const node = this.buildTree(schema.type, item, `#${i + 1}`, this.join(path, String(i)), inherited);
                node.removable = { index: i };
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
            ? { array, itemSchema: schema.type, itemLabel, minItems: schema.minItems ?? 0, maxItems: schema.maxItems }
            : undefined,
      };
    }
    if (schema.kind === 'choice') {
      if (!(control instanceof FormGroup)) return null;
      const active = control.get(CASE_KEY)?.value as string | null;
      const node =
        active && schema.cases[active]
          ? this.buildTree(this.caseAsGroup(schema, active), control, label, path, inherited)
          : ({ id: path, label, children: [], group: control, inherited } as TreeNode);
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
              // Index access, not .get(): entry keys are arbitrary runtime data
              // and .get() would split a key like '10.0.0.1' into a dotted path.
              // Entries inherit through the map node's own appearance.
              const entryNode = this.buildChildNode(
                schema.value,
                control.controls[key],
                key,
                this.join(path, key),
                descendantLayout(inherited, schema.appearance),
              );
              if (entryNode) {
                entryNode.mapEntry = { mapGroup: control, mapSchema: schema, key };
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

  /**
   * Synthetic group over a case's normalized fields, so a case body builds
   * like any group. Carries the choice's own `appearance` so its layout
   * reaches the case fields.
   */
  private caseAsGroup(choice: NodeChoice, caseName: string): NodeGroup {
    return {
      kind: 'nodeGroup',
      name: choice.name,
      children: choice.cases[caseName] ? caseFields(choice.cases[caseName]) : {},
      ...(choice.appearance ? { appearance: choice.appearance } : {}),
    };
  }

  /** A node's display label: its schema `label`, else its record key. */
  private labelOf(node: NodeType, key: string): string {
    return ('label' in node ? node.label : undefined) ?? key;
  }

  /** Join a parent path and a segment; the root's path is the empty string. */
  private join(parent: string, segment: string): string {
    const seg = this.escapeSeg(segment);
    return parent ? `${parent}/${seg}` : seg;
  }

  /**
   * Escape a path segment: `/` is the id separator, and map entry keys are
   * arbitrary runtime data that may contain it. Labels stay unescaped — only
   * node identities encode.
   */
  private escapeSeg(segment: string): string {
    return segment.replace(/%/g, '%25').replace(/\//g, '%2F');
  }
}
