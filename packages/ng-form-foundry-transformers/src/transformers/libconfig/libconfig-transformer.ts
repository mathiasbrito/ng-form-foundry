/**
 * A libconfig {@link Transformer} (BETA): turn a libconfig document
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
import type { FormValue, Thesaurus } from '../../core/schema';
import { applyThesaurus } from '../../core/thesaurus';
import type { Transformer, TransformResult } from '../../core/transformer';
import { type JsonSchema, type JsonSchemaOptions, jsonSchemaToNodeGroup } from '../../core/json-schema';
import { type CfgGroup, parseLibconfig } from './parser';
import { extractValue, libconfigToNodeGroup } from './schema';
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
   * Display metadata (`label`/`description`/choice `caseLabels`) injected into
   * the produced schema, schema-driven or inferred alike — see
   * `applyThesaurus`. Keys are plain identifier names, matched
   * case-insensitively; never paths.
   */
  thesaurus?: Thesaurus;
}

/** The revert context: the original text and its positioned AST. */
export interface LibconfigBinding {
  source: string;
  root: CfgGroup;
}

let warnedBeta = false;

function warnBeta(): void {
  if (warnedBeta) return;
  warnedBeta = true;
  console.warn(
    '[ng-form-foundry-transformers] The libconfig transformer is a BETA feature. ' +
      'Verify every write-back (diff toSource output against the original file) before deploying it.',
  );
}

/** Test seam: makes the one-time beta warning observable per test. */
export function resetLibconfigBetaWarning(): void {
  warnedBeta = false;
}

export const libconfigTransformer = {
  id: 'libconfig',

  toSchema(source: string, options?: LibconfigOptions): TransformResult<LibconfigBinding> {
    warnBeta();
    const root = parseLibconfig(source, { includes: options?.includes });
    const schema = options?.schema
      ? jsonSchemaToNodeGroup(options.schema, options.rootName, options.schemaOptions)
      : libconfigToNodeGroup(root, source, options?.rootName ?? '__root__');
    const labeled = options?.thesaurus ? applyThesaurus(schema, options.thesaurus) : schema;
    const initialValue = extractValue(root, source, options?.schema != null) as FormValue;
    return { schema: labeled, binding: { source, root }, initialValue };
  },

  toSource(value: FormValue, binding: LibconfigBinding): string {
    warnBeta();
    return applyValueToSource(binding.source, binding.root, value);
  },
} satisfies Transformer<string, string, LibconfigBinding, LibconfigOptions>;
