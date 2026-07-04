/**
 * The resolved YANG schema — the effective model the engine emits and the
 * "binding" the adapter keeps server-side.
 *
 * A `YangEngine` resolves a raw YANG module set (with `uses`/`augment`/`typedef`
 * already collapsed) into this normalized tree. It carries everything the plain
 * form value drops but the RFC 7951 round-trip needs: the resolved base type,
 * the owning module (for name qualification), list keys, and the config/state
 * flag. `mapToSchema` derives the frontend `NodeGroup` from it; the revert walks
 * it directly. Kept in the adapter, never sent to the client.
 */

/** YANG built-in base types this version recognizes (RFC 7950 §9). */
export type YangBase =
  | 'string'
  | 'boolean'
  | 'int8' | 'int16' | 'int32' | 'int64'
  | 'uint8' | 'uint16' | 'uint32' | 'uint64'
  | 'decimal64'
  | 'enumeration'
  | 'binary'
  | 'identityref'
  | 'leafref'
  | 'empty'
  | 'instance-identifier'
  | 'union'
  | 'bits';

export interface YangType {
  base: YangBase;
  /** Allowed names for `enumeration`. */
  enums?: string[];
  /** Digit count for `decimal64`. */
  fractionDigits?: number;
  /** Derived identities for `identityref`, each tagged with its defining module. */
  identities?: { name: string; module: string }[];
  /** Named flags for `bits`, in schema order. */
  bits?: string[];
  /** Member types for `union` (ordered; RFC 7950 §9.12). */
  members?: YangType[];
  /** Schema-node path a `leafref` points at (RFC 7950 §9.9). */
  leafrefPath?: string;
}

export interface EffLeaf {
  kind: 'leaf';
  name: string;
  module: string;
  type: YangType;
  default?: string | number | boolean;
  mandatory?: boolean;
  /** `false` = read-only operational state; excluded from write-back. Defaults to config (true). */
  config?: boolean;
  description?: string;
}

export interface EffLeafList {
  kind: 'leaf-list';
  name: string;
  module: string;
  type: YangType;
  minElements?: number;
  maxElements?: number;
  orderedByUser?: boolean;
  config?: boolean;
  description?: string;
}

export interface EffContainer {
  kind: 'container';
  name: string;
  module: string;
  presence?: boolean;
  config?: boolean;
  children: EffNode[];
  description?: string;
}

export interface EffList {
  kind: 'list';
  name: string;
  module: string;
  keys: string[];
  minElements?: number;
  maxElements?: number;
  orderedByUser?: boolean;
  config?: boolean;
  children: EffNode[];
  description?: string;
}

export type EffNode = EffLeaf | EffLeafList | EffContainer | EffList;

export interface ModuleInfo {
  name: string;
  namespace: string;
  revision?: string;
}

/**
 * A fully-resolved YANG model: the top-level data nodes plus module metadata.
 * This is the value stored as a compiled model's `binding`.
 */
export interface EffectiveModel {
  modules: ModuleInfo[];
  roots: EffNode[];
}

/** The compiled artifact: the frontend schema plus the server-side binding. */
export interface CompiledModel {
  schema: import('./schema').NodeGroup;
  binding: EffectiveModel;
}
