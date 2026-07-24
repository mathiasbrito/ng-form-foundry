import { Component, computed, forwardRef, input, model, OnInit, output } from '@angular/core';
import { LeafRendererComponent } from './leaf-renderer/leaf-renderer.component';
import { Appearance, CASE_KEY, Leaf, NodeChoice, NodeGroup, NodeType } from '../types/dynamic-recursive.types';
import { inheritableAppearance, LayoutStyles, mergeAppearance } from '../core/appearance';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NodeGroupListRendererComponent } from './node-group-list-renderer/node-group-list-renderer.component';
import { LeafListRendererComponent } from './leaf-list-renderer/leaf-list-renderer.component';
import { NodeMapRendererComponent } from './node-map-renderer/node-map-renderer.component';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { NgTemplateOutlet } from '@angular/common';
import { asFormArray, asFormControl, asFormGroup } from '../core/utils';
import { formatRadix } from './radix-input/radix-input.directive';
import {
  caseDisplayLabels, buildControl, caseFields, setNodePresence, switchChoiceCase } from '../core/dynamic-recursive-forms-builder';
import { MatTooltip } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

/**
 * A grid track count from `appearance.grid`: positive finite counts floored,
 * anything else (absent, zero, negative, non-finite) is 0 — so a bogus `cols`
 * cannot half-enter grid mode (e.g. suppress the rows-only column flow).
 */
function gridTrackCount(count: number | undefined): number {
  return Number.isFinite(count) && count! > 0 ? Math.floor(count!) : 0;
}

@Component({
  imports: [
    LeafRendererComponent,
    LeafListRendererComponent,
    // node-group-list-renderer and node-map-renderer import this component back
    // (list items and map values may be groups); forwardRef tolerates either
    // module-evaluation order for the cycle.
    forwardRef(() => NodeGroupListRendererComponent),
    forwardRef(() => NodeMapRendererComponent),
    ReactiveFormsModule,
    MatExpansionModule,
    MatIconModule,
    MatButtonModule,
    NgTemplateOutlet,
    MatCheckboxModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTooltip,
  ],
  selector: 'nff-dynamic-recursive-form',
  standalone: true,
  styleUrl: './dynamic-recursive-form.component.scss',
  templateUrl: './dynamic-recursive-form.component.html',
})
export class DynamicRecursiveFormComponent implements OnInit {
  /** The form-description schema to render (a root or nested `NodeGroup`). */
  readonly schema = input.required<NodeGroup>();
  /** Optional value object to seed the form; keyed by the schema's `children` keys. */
  readonly initialValue = input<Record<string, unknown> | null>(null);
  /** The reactive group this form binds to. Defaults to an empty group. */
  readonly formGroup = input<FormGroup>(new FormGroup({}));
  /** Index of this form within a parent list, used by `addButtonCallback`. */
  readonly index = input<number | null>(null);
  /** Whether this form may be removed from a parent list (shows a remove control). */
  readonly removable = input<boolean>(false);
  /** Emitted when the user removes this form from a parent list. */
  readonly remove = output<void>();
  /** Card/section title; falls back to the schema label or name. */
  readonly title = input<string>();
  /** Whether fields accept input. Two-way: also toggled by the built-in edit control. */
  readonly editable = model<boolean>(false);
  /**
   * Preview absent optional (presence) leaves as **ghost fields**: the field
   * renders read-only and empty — its schema `default`, if any, shown as the
   * placeholder — with a (+) button that incorporates it into the form, so the
   * user sees the complete form surface. A ghost holds **no control in the
   * form**: it never appears in `value`/`getRawValue()`/`serializeForm` output
   * and never affects validity until incorporated. Replaces the default
   * "Add <field>" button affordance; ignored while the form is not editable
   * (read-only mode hides structural affordances, ghosts included).
   */
  readonly showAbsentOptionals = input<boolean>(false);
  /** Invoked with {@link index} to append a new sibling form to a parent list. */
  readonly addButtonCallback = input<((index: number) => void) | null>(null);
  /**
   * Label for the add-sibling button — the parent list names the appended
   * entry ("Add Cell #3"), which this form cannot derive itself (it knows
   * neither the list's label nor its length). Falls back to
   * "Add new <own label>".
   */
  readonly addButtonLabel = input<string | null>(null);
  /**
   * Key of a presence leaf whose field should grab focus when it renders — lets
   * a host that added the control itself (e.g. the tree editor's optionals
   * menu) hand focus to the new field, like the form's own add button does.
   */
  readonly focusLeaf = input<string | null>(null);
  /**
   * Field-layout appearance cascading down from the parent group. The node's
   * own `appearance` wins per property — see {@link mergeAppearance}.
   */
  readonly inheritedAppearance = input<Appearance | null>(null);

  /** True when the schema is a root group (rendered flat, without a wrapping card). */
  readonly root = computed(() => this.schema().root ?? false);

  /** The node's own `appearance` with inherited layout gaps filled in. */
  protected readonly effectiveAppearance = computed<Appearance | undefined>(() =>
    mergeAppearance(this.inheritedAppearance(), this.schema().appearance),
  );

  /** The layout subset this node's children inherit. */
  protected readonly childAppearance = computed<Appearance | null>(() =>
    inheritableAppearance(this.effectiveAppearance()),
  );

  /**
   * The per-type width bounds are flex-flow-only, and their CSS custom
   * properties inherit into leaf-list internals that the grid-mode resets
   * cannot reach across the encapsulation boundary — so under a grid layout
   * the variables are simply not set at all.
   */
  private flexOnly<T>(value: T | undefined): T | null {
    return this.fieldsLayout() ? null : (value ?? null);
  }

  /** `minTextFieldWidth` for the `.fields` CSS custom property, or null. */
  protected readonly textFieldMin = computed(() => this.flexOnly(this.effectiveAppearance()?.minTextFieldWidth));
  /** `minNumberFieldWidth` for the `.fields` CSS custom property, or null. */
  protected readonly numberFieldMin = computed(() => this.flexOnly(this.effectiveAppearance()?.minNumberFieldWidth));
  /** `maxNumberFieldWidth` for the `.fields` CSS custom property, or null. */
  protected readonly numberFieldMax = computed(() => this.flexOnly(this.effectiveAppearance()?.maxNumberFieldWidth));

  /**
   * True when the active grid defines explicit column tracks. Only then can a
   * stacked leaf-list meaningfully span the row (`grid-column: 1 / -1`
   * resolves `-1` to line 1 without an explicit column template) and repeat
   * the tracks for its entries; in a rows-only grid the list stays a normal
   * auto-flowed item.
   */
  protected readonly gridHasCols = computed(() => !!this.fieldsLayout()?.['grid-template-columns']);

  /**
   * Inline grid styles for the `.fields` area, from `appearance`: `grid`
   * becomes explicit tracks (`cols` fields per row; `rows` alone fills
   * top-to-bottom, adding columns as needed) and `minFieldWidth` becomes
   * as-many-as-fit equal columns of at least that width. `grid` wins over
   * `minFieldWidth`; with neither, `null` keeps the stylesheet's wrapping
   * flex flow. Non-positive `rows`/`cols` are ignored.
   */
  protected readonly fieldsLayout = computed<LayoutStyles | null>(() => {
    const appearance = this.effectiveAppearance();
    const cols = gridTrackCount(appearance?.grid?.cols);
    const rows = gridTrackCount(appearance?.grid?.rows);
    if (cols > 0 || rows > 0) {
      const layout: LayoutStyles = { display: 'grid' };
      if (cols > 0) layout['grid-template-columns'] = `repeat(${cols}, minmax(0, 1fr))`;
      if (rows > 0) layout['grid-template-rows'] = `repeat(${rows}, auto)`;
      if (rows > 0 && cols === 0) {
        layout['grid-auto-flow'] = 'column';
        // The columns this flow creates are implicit; without a bound they
        // size to content and can overflow — match the cols-mode tracks.
        layout['grid-auto-columns'] = 'minmax(0, 1fr)';
      }
      return layout;
    }
    if (appearance?.minFieldWidth) {
      // min(…, 100%) keeps a narrow container to one column instead of overflowing.
      return {
        display: 'grid',
        'grid-template-columns': `repeat(auto-fit, minmax(min(${appearance.minFieldWidth}, 100%), 1fr))`,
      };
    }
    return null;
  });

  /**
   * Whether the gathered boolean row would show anything: a plain boolean, an
   * enabled presence boolean, or (while editable) an absent one's add button.
   * Keeps a read-only form from rendering an empty `.boolean-fields` div,
   * which would add a stray container gap.
   */
  protected booleanAreaVisible(): boolean {
    return Object.entries(this.schema().children ?? {}).some(
      ([key, child]) =>
        child.kind === 'leaf' &&
        child.type === 'boolean' &&
        (!child.presence || !!this.formGroup().get(key) || this.editable()),
    );
  }

  /**
   * Whether a leaf renders in the regular `.fields` flow: always, unless it is
   * a boolean that {@link booleanPlacement} gathers into the `.boolean-fields`
   * row instead.
   */
  protected inFieldFlow(child: Leaf): boolean {
    return this.booleanPlacement() === 'default' || child.type !== 'boolean';
  }

  /**
   * Where `appearance.booleanFields` places the checkbox fields: `'beginning'`
   * or `'end'` renders them grouped in the `.boolean-fields` row and excludes
   * them from the regular field flow; `'default'` (also when the group has no
   * boolean leaf to move) leaves the flow untouched.
   */
  protected readonly booleanPlacement = computed<'beginning' | 'end' | 'default'>(() => {
    const placement = this.effectiveAppearance()?.booleanFields ?? 'default';
    if (placement === 'default') return 'default';
    const hasBooleans = Object.values(this.schema().children ?? {}).some(
      (child) => child.kind === 'leaf' && child.type === 'boolean',
    );
    return hasBooleans ? placement : 'default';
  });

  ngOnInit() {
    const initial = this.initialValue();
    if (initial) {
      const group = this.formGroup();
      // Presence keys carried by the initial value need controls first:
      // patchValue silently skips keys that have none, dropping the data.
      for (const [key, child] of Object.entries(this.schema().children ?? {})) {
        if ('presence' in child && child.presence && key in initial && !group.get(key)) {
          group.addControl(key, buildControl(child, initial[key]) as never);
        }
      }
      group.patchValue(initial);
    }
  }

  protected get nodeGroupChildrenList(): Array<{ key: string; value: NodeType }> {
    const children = this.schema().children ?? {};
    return Object.entries(children).map(([key, value]) => ({
      key,
      value: value as NodeType,
    }));
  }

  protected emitRemoveEvent() {
    this.remove.emit();
  }

  /** The key of the presence leaf the user just enabled; its field grabs focus when rendered. */
  protected presenceFocusKey: string | null = null;

  /**
   * Add or remove a presence node's control on this form — any presence kind:
   * group, leaf, map, or choice. Removing it drops the key from `form.value`;
   * adding it builds the control fresh from its schema (nested presence
   * children start absent). Delegates to {@link setNodePresence}, the
   * host-callable primitive.
   */
  toggleNodePresence(key: string, schema: NodeType, present: boolean) {
    setNodePresence(this.formGroup(), schema, key, present);
    // Either way the key's ghost stand-in is stale: drop it, so a later
    // re-ghosting renders a pristine one even if the old instance was mutated.
    this.ghostControls.delete(key);
  }

  /**
   * The detached stand-in control a ghost field renders against. Never added
   * to {@link formGroup} — that detachment is the whole guarantee: a ghost
   * cannot reach `value`, `getRawValue()`, or validity. Always `null`-valued
   * (the schema default shows as a placeholder instead, see
   * {@link ghostPlaceholder}); cached per key so change detection re-reads a
   * stable instance.
   */
  protected ghostControl(key: string): FormControl {
    let control = this.ghostControls.get(key);
    if (!control) {
      control = new FormControl(null);
      this.ghostControls.set(key, control);
    }
    return control;
  }
  private readonly ghostControls = new Map<string, FormControl>();

  /**
   * A ghost field's placeholder: the leaf's `default`, or empty — spelled in
   * the leaf's `radix` when it has one, matching how the incorporated field
   * will display it.
   */
  protected ghostPlaceholder(schema: Leaf): string {
    if (!('default' in schema) || schema.default == null) return '';
    const radix = 'radix' in schema ? schema.radix : undefined;
    const integral =
      typeof schema.default === 'number'
        ? Number.isInteger(schema.default)
        : typeof schema.default === 'string' && /^[-+]?[0-9]+$/.test(schema.default);
    if (radix && integral) return formatRadix(schema.default as number | string, radix);
    return String(schema.default);
  }

  /**
   * {@link toggleNodePresence} for a presence leaf, additionally focusing the
   * rendered field when the toggle just created it.
   */
  toggleLeafPresence(key: string, schema: Leaf, present: boolean) {
    const had = !!this.formGroup().get(key);
    this.toggleNodePresence(key, schema, present);
    if (present && !had) {
      this.presenceFocusKey = key;
      // Retire the request once the field has rendered and taken focus, so a
      // later re-creation of the same renderer cannot steal focus again.
      setTimeout(() => {
        if (this.presenceFocusKey === key) this.presenceFocusKey = null;
      });
    }
    if (!present && this.presenceFocusKey === key) this.presenceFocusKey = null;
  }

  /**
   * Materialize an absent presence (optional / `advisoryRequired`) list *with
   * its first entry* — clicking "Add <list>" makes the first entry appear at
   * once. An optional list has no present-empty state: removing the last entry
   * de-materializes it (→ absent). A required list is always present instead and
   * uses the renderer's own "Add item" affordance, so it never routes here.
   */
  addPresenceList(key: string, schema: NodeType) {
    setNodePresence(this.formGroup(), schema, key, true, [null]);
    this.ghostControls.delete(key);
  }

  protected objectKeys(obj: Record<string, unknown>): string[] {
    return Object.keys(obj);
  }

  /** The active case name of a choice control, or null if none is selected. */
  protected activeCase(key: string): string | null {
    return (this.formGroup().get(key) as FormGroup | null)?.get(CASE_KEY)?.value ?? null;
  }

  /**
   * A synthetic flattened NodeGroup used to render the active case's fields
   * against the choice's FormGroup. Carries the choice's own `appearance`
   * (grid / field-width layout) onto the case fields.
   */
  protected caseAsGroup(choice: NodeChoice, caseName: string): NodeGroup {
    return {
      kind: 'nodeGroup',
      name: choice.name,
      children: choice.cases[caseName] ? caseFields(choice.cases[caseName]) : {},
      appearance: { ...choice.appearance, flatten: true },
    };
  }

  /**
   * The display label for a case: the schema's `caseLabels` entry (colliding
   * labels disambiguated by their distinguishing fields — see
   * {@link caseDisplayLabels}), else the case name.
   */
  caseLabel(choice: NodeChoice, caseName: string): string {
    return caseDisplayLabels(choice)[caseName] ?? caseName;
  }

  /**
   * A copy of a group flagged to render its fields inline (no inner panel). Used
   * for a presence group's body, whose container is the presence panel itself, so
   * the group's own section panel would be a redundant second box.
   */
  protected flatGroup(group: NodeGroup): NodeGroup {
    return { ...group, appearance: { ...group.appearance, flatten: true } };
  }

  /** Swap a choice's field controls when the selected case changes. Delegates to {@link switchChoiceCase}. */
  switchCase(key: string, choice: NodeChoice, caseName: string) {
    switchChoiceCase(this.formGroup().get(key) as FormGroup, choice, caseName);
  }

  protected readonly asFormGroup = asFormGroup;
  protected readonly asFormArray = asFormArray;
  protected readonly asFormControl = asFormControl;
}
