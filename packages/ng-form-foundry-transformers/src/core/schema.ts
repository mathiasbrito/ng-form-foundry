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
  /** Display labels for the enum options, positionally aligned with `enum`. */
  enumLabel?: string[];
  // --- string constraints ---
  /** Reject values not matching this regex (JSON Schema `pattern`; unanchored). */
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  /** Semantic string format (JSON Schema `format`). */
  format?: 'email' | 'uri' | 'url';
  // --- number constraints ---
  /** Require a whole-number value (JSON Schema `type: 'integer'`). */
  integer?: boolean;
  /** Inclusive bounds (JSON Schema `minimum`/`maximum`). */
  min?: number;
  max?: number;
  multipleOf?: number;
  /**
   * Present the value in this base (16 hex, 8 octal, 2 binary) instead of
   * decimal — set when the source document wrote the literal that way. Purely
   * a display hint: the value itself stays a plain number (or, on a string
   * leaf, the exact decimal-digit carry of an integer beyond ±2^53).
   */
  radix?: 2 | 8 | 16;
  // --- optionality / display ---
  /** The value may be `null` (JSON Schema `type: [T, 'null']`). */
  nullable?: boolean;
  /** Optional scalar whose presence is itself data (on/off toggle). */
  presence?: boolean;
  /** Render read-only; with `default`, expresses a JSON Schema `const`. */
  readOnly?: boolean;
  description?: string;
}

export interface LeafList {
  kind: 'leafList';
  name: string;
  type: LeafType;
  label?: string;
  minItems?: number;
  maxItems?: number;
  /** Present every item in this base — see {@link Leaf.radix}. */
  radix?: 2 | 8 | 16;
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
  /**
   * Minimum / maximum number of keys present in the group's value (JSON Schema
   * `minProperties`/`maxProperties` on a closed object with presence-optional
   * children); the library validates the enabled-children count against them.
   */
  minPresent?: number;
  maxPresent?: number;
  description?: string;
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

/** One case body: a record of named fields, or a single node (a leaf-bodied case). */
export type ChoiceCase = Record<string, NodeType> | NodeType;

/**
 * A discriminated selection: the user picks one `case`, and only that case's
 * fields are present. In the form value a choice is an object
 * `{ __case: <caseName>, ...that case's fields }`; the adapter flattens it to the
 * inline YANG encoding on write-back. Cases may be anonymous/auto-named (from a
 * JSON Schema `anyOf`/`oneOf`); the active case is inferred from seed data.
 */
export interface Choice {
  kind: 'choice';
  name: string;
  label?: string;
  cases: Record<string, ChoiceCase>;
  /** Display labels for cases, keyed by case name. */
  caseLabels?: Record<string, string>;
  default?: string;
  /** A case must be selected for the form to be valid (a required property). */
  mandatory?: boolean;
  /** Optional choice whose presence is itself data (mirrors {@link NodeGroup.presence}). */
  presence?: boolean;
}

/**
 * An open, arbitrary-keyed record: unlike {@link NodeGroup} (a fixed key set), a
 * map's keys are runtime data and every value conforms to one `value` schema.
 * Maps JSON Schema `additionalProperties: <schema>` / `patternProperties`.
 */
export interface NodeMap {
  kind: 'map';
  name: string;
  label?: string;
  description?: string;
  /** The schema every entry's value conforms to. */
  value: NodeType;
  keyLabel?: string;
  /** `patternProperties`: entry keys must match this regex. */
  keyPattern?: string;
  minEntries?: number;
  maxEntries?: number;
  presence?: boolean;
}

export type NodeType = Leaf | LeafList | NodeGroup | NodeGroupList | Choice | NodeMap;

/** The form-value key that records which case of a {@link Choice} is active. */
export const CASE_KEY = '__case';

/** A plain, nested value object produced/consumed by a rendered form. */
export type FormValue = Record<string, unknown>;

/** Display metadata for one schema identifier (see {@link Thesaurus}). */
export interface ThesaurusEntry {
  label?: string;
  description?: string;
  /**
   * Ancestor-name suffix this variant applies under: each segment is a
   * **literal name** (no separators exist, so any character is literal),
   * matched case-insensitively against the identifier's ancestor chain.
   * `['scope', 'cell']` applies to a node whose parent is `cell` inside
   * `scope`, at any depth. Longest matching `under` wins; an entry without
   * `under` is the unscoped fallback. Case fields match both with and without
   * their case-name segment, so `['scope']` covers every case of a choice and
   * `['scope', 'byUe']` targets one case.
   */
  under?: string[];
}

/**
 * Identifier → display metadata, injected into a generated {@link NodeGroup}
 * by `applyThesaurus`. Keys are **plain identifier names** matched
 * **case-insensitively** against node record keys — never paths: no separator
 * exists, so a `.` (or any character) in a key is a literal part of the name.
 *
 * A key maps to one entry, or to a list of variants scoped by
 * {@link ThesaurusEntry.under} when the same identifier carries different
 * meanings at different depths.
 */
export type Thesaurus = Record<string, ThesaurusEntry | ThesaurusEntry[]>;
