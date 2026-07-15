/**
 * The ng-form-foundry schema DTO — the JSON contract the Angular app renders.
 *
 * These are a framework-free structural mirror of ng-form-foundry's `NodeGroup`
 * model: the same JSON shape, without the `@angular/forms` imports that the
 * frontend package couples to its type-level `FormControl` inference. The
 * adapter only produces schema *data*, so it needs the plain shapes; the
 * frontend re-derives its typed `FormGroup` from the same JSON via
 * `buildFormFromSchema`.
 */

export type LeafType = 'string' | 'number' | 'boolean' | 'enum';

export interface Leaf {
  kind: 'leaf';
  name: string;
  type: LeafType;
  required?: true;
  label?: string;
  default?: string | number | boolean;
  /** Present when `type` is `'enum'`. */
  enum?: (string | number)[];
}

export interface LeafList {
  kind: 'leafList';
  name: string;
  type: LeafType;
  label?: string;
  minItems?: number;
  maxItems?: number;
}

export interface NodeGroup {
  kind: 'nodeGroup';
  name: string;
  label?: string;
  root?: boolean;
  /**
   * When true, the group is optional and rendered with an on/off toggle: absent
   * unless the user enables it. Maps a YANG presence container — present-but-empty
   * serializes as `{}`, absent is omitted.
   */
  presence?: boolean;
  children: Record<string, NodeType>;
}

export interface NodeGroupList {
  kind: 'nodeGroupList';
  name: string;
  label?: string;
  type: NodeGroup;
  minItems?: number;
  maxItems?: number;
}

/**
 * A discriminated selection: the user picks one `case`, and only that case's
 * fields are present. In the form value a choice is an object
 * `{ __case: <caseName>, ...that case's fields }`; the adapter flattens it to the
 * inline YANG encoding on write-back.
 */
export interface Choice {
  kind: 'choice';
  name: string;
  label?: string;
  cases: Record<string, Record<string, NodeType>>;
  default?: string;
  mandatory?: boolean;
}

export type NodeType = Leaf | LeafList | NodeGroup | NodeGroupList | Choice;

/** The form-value key that records which case of a {@link Choice} is active. */
export const CASE_KEY = '__case';

/** A plain, nested value object produced/consumed by a rendered form. */
export type FormValue = Record<string, unknown>;
