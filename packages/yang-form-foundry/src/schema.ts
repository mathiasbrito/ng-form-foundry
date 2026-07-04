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

export type NodeType = Leaf | LeafList | NodeGroup | NodeGroupList;

/** A plain, nested value object produced/consumed by a rendered form. */
export type FormValue = Record<string, unknown>;
