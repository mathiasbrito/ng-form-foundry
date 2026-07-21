/**
 * A libconfig {@link Transformer}: turn a libconfig document
 * (srsRAN/OAI-style `.cfg`/`.conf`) into a form and write the edited value
 * back with comments, formatting, and — critically — scalar *types*
 * preserved (libconfig is statically typed; see {@link import('./revert')}).
 *
 * The `binding` is the original source plus its positioned AST; `toSource`
 * splices edited spans into the source, so unedited bytes survive verbatim.
 *
 * Without a JSON Schema the form is inferred from the document's own typed
 * literals ({@link import('./schema')}); empty and heterogeneous collections
 * are then shown read-only. A JSON Schema in the options unlocks typed empty
 * collections, presence toggles for optional settings, enums, and ranges.
 */
import type { FormValue, NodeGroup, Thesaurus } from '../../core/schema';
import { applyThesaurus } from '../../core/thesaurus';
import type { Transformer, TransformResult } from '../../core/transformer';
import { type JsonSchema, type JsonSchemaOptions, jsonSchemaToNodeGroup } from '../../core/json-schema';
import { mergeInferred } from '../../core/merge-inferred';
import { childrenOf } from '../../core/schema-keys';
import { assertSchemaShapes } from '../../core/shape-check';
import { type CfgGroup, parseLibconfig } from './parser';
import { annotateSchemaRadix, carryUncoveredEmpties, extractValue, libconfigToNodeGroup } from './schema';
import { applyValueToSource } from './revert';

/** Options for {@link libconfigTransformer}'s `toSchema`. */
export interface LibconfigOptions {
  /**
   * A JSON Schema describing the config. When given, the form is built from it
   * (types, required/presence, enums, empty-collection element types); when
   * omitted, the form is inferred from the document's typed literals.
   */
  schema?: JsonSchema;
  /** Name for the root node group. Defaults to `__root__`. */
  rootName?: string;
  /** Options forwarded to `jsonSchemaToNodeGroup` (`refDocuments`, `optionalPresence`). */
  schemaOptions?: JsonSchemaOptions;
  /**
   * `@include` handling: `'reject'` (default) errors, because the form would
   * silently show less than the C reader sees; `'opaque'` keeps the directive
   * line verbatim and edits only this file's own settings.
   */
  includes?: 'reject' | 'opaque';
  /**
   * Schema-driven mode only: what happens to settings the JSON Schema does
   * not cover. `'preserve'` (default) keeps them byte-verbatim in place —
   * the form never carried them, so a partial schema edits its slice without
   * erasing the rest. `'drop'` makes the edited value authoritative for the
   * whole document, deleting uncovered settings — for consumers whose schema
   * is intentionally complete (sanitizing a config, enforcing a strict
   * template). `'edit'` surfaces them instead: uncovered settings render as
   * editable fields typed by the document's own literals (the inferred
   * schema merged under the JSON Schema — see `mergeInferred`), so nothing
   * is invisible and the value covers the whole document. Ignored without a
   * `schema`, where the inferred value covers every setting anyway.
   */
  unknownKeys?: 'preserve' | 'drop' | 'edit';
  /**
   * Display metadata (`label`/`description`/choice `caseLabels`) injected into
   * the produced schema, schema-driven or inferred alike — see
   * `applyThesaurus`. Keys are plain identifier names, matched
   * case-insensitively; never paths.
   */
  thesaurus?: Thesaurus;
}

/**
 * The revert context: the original text, its positioned AST, and — in
 * schema-driven mode with `unknownKeys: 'preserve'` or `'edit'` — the
 * NodeGroup the form was built from (the JSON Schema's own under
 * `'preserve'`, the inferred-merged one under `'edit'`), so `toSource` knows
 * which paths are schema-born. Settings outside those paths were never
 * carried by the form and survive verbatim; under `'edit'` that is only the
 * keys no form field can carry (e.g. a key inside a covered choice's group
 * that no case names). Absent `schema` (inferred mode, or
 * `unknownKeys: 'drop'`), the value covers the whole document and is
 * authoritative everywhere.
 */
export interface LibconfigBinding {
  source: string;
  root: CfgGroup;
  schema?: NodeGroup;
}

export const libconfigTransformer = {
  id: 'libconfig',

  toSchema(source: string, options?: LibconfigOptions): TransformResult<LibconfigBinding> {
    const root = parseLibconfig(source, { includes: options?.includes });
    const unknownKeys = options?.unknownKeys ?? 'preserve';
    const fromJsonSchema = options?.schema
      ? jsonSchemaToNodeGroup(options.schema, options.rootName, options.schemaOptions)
      : undefined;
    const schema =
      fromJsonSchema && unknownKeys === 'edit'
        ? mergeInferred(fromJsonSchema, libconfigToNodeGroup(root, source, options?.rootName ?? '__root__'))
        : fromJsonSchema ?? libconfigToNodeGroup(root, source, options?.rootName ?? '__root__');
    // Schema-driven leaves display in the base the document wrote them in —
    // the JSON Schema cannot know it, the document does (see annotateSchemaRadix).
    if (fromJsonSchema) annotateSchemaRadix(root, schema);
    const labeled = options?.thesaurus ? applyThesaurus(schema, options.thesaurus) : schema;
    const initialValue = extractValue(root, source, options?.schema != null) as FormValue;
    // A container-shape disagreement (group vs list vs scalar) produces a
    // form that cannot carry the section and would erase it on save: refuse
    // up front so the consumer can fall back to inferred editing.
    if (fromJsonSchema) assertSchemaShapes(initialValue, fromJsonSchema);
    if (fromJsonSchema && unknownKeys === 'edit') {
      // Uncovered empty collections merged as read-only carries: their value
      // must be the verbatim slice, not the typed [] the extraction produced.
      carryUncoveredEmpties(root, source, initialValue, childrenOf(fromJsonSchema));
    }
    return {
      schema: labeled,
      binding: {
        source,
        root,
        // 'preserve' gates the revert on the JSON Schema's NodeGroup; 'edit'
        // on the merged one (schema-born ≈ everything, but settings no form
        // field can carry stay protected); 'drop' and inferred mode leave
        // the value authoritative for the whole document.
        schema: fromJsonSchema && unknownKeys !== 'drop' ? schema : undefined,
      },
      initialValue,
    };
  },

  toSource(value: FormValue, binding: LibconfigBinding): string {
    return applyValueToSource(binding.source, binding.root, value, binding.schema);
  },
} satisfies Transformer<string, string, LibconfigBinding, LibconfigOptions>;
