import { FormArray, FormControl, FormGroup } from '@angular/forms';

export type LeafRuntimeType<T> = T extends 'string'
  ? string
  : T extends 'number'
    ? number
    : T extends 'boolean'
      ? boolean
      : T extends 'enum'
        ? string | number
        : never;

export type LeafBase = {
  kind: 'leaf';
  name: string;
  required?: true | undefined;
  label?: string;
  description?: string;
  /**
   * The value may be `null` (JSON Schema `type: [T, 'null']`). Builds a nullable
   * control (drops `nonNullable`), so `null` is a first-class value the
   * constraint validators accept and that survives the round-trip. Distinct from
   * {@link presence}: `nullable` is an explicit `null`, `presence` is an absent key.
   */
  nullable?: boolean;
  /**
   * Optional scalar whose *presence itself* is data (mirrors {@link NodeGroup.presence}).
   * Rendered with an on/off toggle; the control is removed from the parent group
   * when absent (so it drops from `form.value`) and re-added when toggled on. The
   * builder omits it unless an initial value is supplied.
   */
  presence?: boolean;
  /**
   * Render the field read-only even when the surrounding form is editable.
   * Combine with `default` to express a JSON Schema `const` (a fixed,
   * display-only value); single-element `enum` is the alternative for a constant.
   */
  readOnly?: boolean;
};

export type AnonLeaf = {
  [K in Leaf['type']]: { type: K };
}[Leaf['type']];

export type LeafString = LeafBase & {
  type: 'string';
  default?: LeafRuntimeType<'string'>;
  /**
   * Reject values that don't match this regular expression. Follows JSON Schema
   * `pattern` semantics — an *unanchored* `RegExp.test`, so it matches anywhere
   * in the value unless the pattern itself anchors with `^`/`$`.
   */
  pattern?: string;
  /** Minimum string length (JSON Schema `minLength`). */
  minLength?: number;
  /** Maximum string length (JSON Schema `maxLength`). */
  maxLength?: number;
  /** Semantic string format (JSON Schema `format`); adds a matching validator. */
  format?: 'email' | 'uri' | 'url';
};
export type LeafNumber = LeafBase & {
  type: 'number';
  default?: LeafRuntimeType<'number'>;
  /** Require a whole-number value (JSON Schema `type: 'integer'`). */
  integer?: boolean;
  /** Inclusive lower bound (JSON Schema `minimum`). */
  min?: number;
  /** Inclusive upper bound (JSON Schema `maximum`). */
  max?: number;
  /** Require the value to be an integer multiple of this number (JSON Schema `multipleOf`). */
  multipleOf?: number;
};
export type LeafBoolean = LeafBase & {
  type: 'boolean';
  default?: LeafRuntimeType<'boolean'>;
};
export type LeafEnum = LeafBase & {
  type: 'enum';
  default?: LeafRuntimeType<'enum'>;
  enumLabel?: string[];
  enum: LeafRuntimeType<'enum'>[];
};

export type Appearance = {
  flatten?: boolean;
  noBorder?: boolean;
  /** Start this node's section panel collapsed. Ignored when `flatten` is set. */
  collapsed?: boolean;
}

export type Leaf = LeafString | LeafNumber | LeafBoolean | LeafEnum;

export type LeafList<TKind extends Leaf['type'] = Leaf['type']> = {
  kind: 'leafList';
  label?: string;
  name: string;
  description?: string;
  default?: Exclude<Leaf['default'], undefined>[];
  type: TKind;
  minItems?: number;
  maxItems?: number;
};

export type NodeGroupList = {
  kind: 'nodeGroupList';
  name: string;
  label?: string;
  description?: string;
  type: NodeGroup;
  minItems?: number;
  maxItems?: number;
};

export type NodeGroup = {
  kind: 'nodeGroup';
  name: string;
  subType?: string;
  label?: string;
  root?: boolean;
  /**
   * When true, the group is optional: rendered with an on/off toggle and present
   * in the form only while enabled. Its control is removed from the parent
   * FormGroup when absent (so it drops from `form.value`) and re-added when the
   * user toggles it on. The builder omits it unless an initial value is supplied.
   */
  presence?: boolean;
  description?: string;
  /**
   * Minimum / maximum number of keys present in the group's value (JSON Schema
   * `minProperties`/`maxProperties` on a closed object). Meaningful when
   * children are presence-optional: the group carries a `minPresent` /
   * `maxPresent` error while the count of enabled children is out of range.
   */
  minPresent?: number;
  maxPresent?: number;
  children: Record<string, NodeType>;
  appearance?: Appearance;
};

/**
 * One case of a {@link NodeChoice}: either a record of named fields (an object
 * branch), or a single node (a *leaf-bodied* case — e.g. an `anyOf` branch that
 * is a bare scalar). A single node is normalized to a one-field record keyed by
 * its `name` when the form is built.
 */
export type ChoiceCase = Record<string, NodeType> | NodeType;

/**
 * A discriminated selection: the user picks one `case`, and only that case's
 * fields are present. In the form it is a FormGroup holding a `__case` control
 * (the active case name) plus that case's field controls; switching the case
 * swaps the field controls.
 *
 * Cases may be **anonymous / auto-named** (any string key) — for JSON Schema
 * `anyOf`/`oneOf` branches with no name. When a built form is seeded from inline
 * data that carries no `__case`, the builder **infers** the active case from the
 * data shape (the case whose fields best match), so a choice round-trips from
 * real instance data. See the schema reference for the required-set / `const`
 * discriminator recipe.
 */
export type NodeChoice = {
  kind: 'choice';
  name: string;
  label?: string;
  cases: Record<string, ChoiceCase>;
  /**
   * Display labels for cases, keyed by case name — for anonymous/auto-named
   * branches whose keys are not human-friendly. Falls back to the case name.
   */
  caseLabels?: Record<string, string>;
  default?: string;
  mandatory?: boolean;
  /** Optional choice: rendered with an on/off toggle, omitted from the value when absent. */
  presence?: boolean;
  appearance?: Appearance;
};

/**
 * The control name that records which case of a {@link NodeChoice} is active.
 * The name is reserved: it cannot be used as a case field name (the builder
 * throws) or as a map entry key (the entry helpers reject it).
 */
export const CASE_KEY = '__case';

/**
 * An open, arbitrary-keyed record: unlike {@link NodeGroup} (a fixed, declared
 * key set), a map's keys are runtime data and every value conforms to one shared
 * `value` schema. Maps JSON Schema `additionalProperties: <schema>` /
 * `patternProperties`. In the form it is a `FormGroup` whose control *names* are
 * the entry keys, so `getRawValue()` is the map object directly; the renderer
 * lets the user add, remove, and rename entries.
 */
export type NodeMap = {
  kind: 'map';
  name: string;
  label?: string;
  description?: string;
  /** The schema every entry's value conforms to. */
  value: NodeType;
  /** Label for the key column in the editor. Defaults to "Key". */
  keyLabel?: string;
  /** `patternProperties`: entry keys must match this regular expression. */
  keyPattern?: string;
  /** Minimum number of entries (JSON Schema `minProperties`). */
  minEntries?: number;
  /** Maximum number of entries (JSON Schema `maxProperties`). */
  maxEntries?: number;
  /** Optional map: rendered with an on/off toggle, omitted from the value when absent. */
  presence?: boolean;
  appearance?: Appearance;
};

export type NodeType = Leaf | LeafList | NodeGroup | NodeGroupList | NodeChoice | NodeMap;
export type DFormControl<T extends NodeType> = T extends Leaf
  ? FormControl<LeafRuntimeType<T['type']>>
  : T extends LeafList
    ? FormArray<FormControl<LeafRuntimeType<T['type']>>>
    : T extends NodeGroup
      ? DFormGroup<T>
      : T extends NodeGroupList
        ? FormArray<DFormGroup<T['type']>>
        : T extends NodeChoice
          ? FormGroup<any>
          : T extends NodeMap
            ? FormGroup<any>
            : never;

export type FormGroupType<T extends NodeGroup> = {
  [TChild in keyof T['children']]: DFormControl<T['children'][TChild]>;
};
export type DFormGroup<T extends NodeGroup> = FormGroup<FormGroupType<T>>;
