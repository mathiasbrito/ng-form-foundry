# AGENTS.md — a guide for AI agents

This file addresses AI agents (and fast-moving humans) that need to **use** or
**modify** this repository. It tells you what the project guarantees, where
everything lives, how to drive the library and the transformers, and how to
verify your work the way this repo expects.

## What this project is, in 30 seconds

`ng-form-foundry` builds **fully-typed Angular Reactive Forms + Angular Material
UI from one declarative, recursive schema**. A sibling npm package,
`ng-form-foundry-transformers`, turns external formats (JSON Schema 2020-12,
YAML/JSON config, YANG models) into that schema and reverts edited form values
back to the source format.

**The one load-bearing invariant:** `form.getRawValue()` **IS the data.** Every
node maps to a control whose value is the wire shape — map keys are control
names, absent optional keys are absent controls (never `disable()`d). The single
exception is the choice discriminator: a choice group holds `__case` plus only
the active case's fields, and `serializeForm(schema, form)` returns the value
with every `__case` stripped — the wire encoding. Any change that would make
`getRawValue()` need post-processing beyond that one built-in strip is wrong.

## Repository map

| Path | What it is |
| --- | --- |
| `projects/ng-form-foundry/` | The publishable Angular library (`ng-form-foundry` on npm). Public API surface: `src/public-api.ts`. |
| `projects/ng-form-foundry/src/lib/types/dynamic-recursive.types.ts` | The whole schema model (`NodeType` union). Read this first. |
| `projects/ng-form-foundry/src/lib/core/dynamic-recursive-forms-builder.ts` | Schema → `FormGroup` builder + validators + choice/map mutation helpers. |
| `projects/ng-form-foundry/src/lib/dynamic-recursive-form/` | `<nff-dynamic-recursive-form>` — the all-in-one recursive form renderer (+ leaf/list/map sub-renderers). |
| `projects/ng-form-foundry/src/lib/config-editor/` | `<nff-config-editor>` — tree/detail editor for large configs. |
| `packages/ng-form-foundry-transformers/` | Framework-agnostic Node/TS transformer catalog (`ng-form-foundry-transformers` on npm). `src/core/` is browser-safe; `src/transformers/yang/` needs Node + `pyang`. |
| `projects/demo/src/app/` | Demo app — every feature has a route (see [Explore by running](#explore-by-running-things)). |
| `docs/` | Sphinx/MyST documentation (Read the Docs). `schema-reference.md` is the per-node property reference. |

## The schema model in 60 seconds

`NodeType = Leaf | LeafList | NodeGroup | NodeGroupList | NodeChoice | NodeMap`

| `kind` | Renders as | Control | Notes |
| --- | --- | --- | --- |
| `leaf` | input/checkbox/select | `FormControl` | types: `string \| number \| boolean \| enum`; constraints (`pattern`, `min`, `format`, …) become validators with inline `<mat-error>`s |
| `leafList` | repeatable scalar rows | `FormArray<FormControl>` | |
| `nodeGroup` | section panel | `FormGroup` | the root node; fixed, declared keys |
| `nodeGroupList` | repeatable groups | `FormArray<FormGroup>` | |
| `choice` | "Selected option" select | `FormGroup` of `{ __case, ...fields }` | one case active at a time; `__case` is form-only, never on the wire — `serializeForm` strips it |
| `map` | key/value rows | `FormGroup` with **dynamic keys** | open/arbitrary keys (`additionalProperties`); control name = entry key |

Distinctions agents get wrong:

- **Optional vs nullable vs presence** — omit `required` = may be empty but the
  key is always there; `nullable: true` = `null` is a valid value; `presence:
  true` = the *key itself* is data (control removed when absent, "Add *field*"
  button / optionals menu in the UIs). `leaf`, `nodeGroup`, `map`, and `choice`
  all support `presence` — but not the two list kinds. An *enabled* presence
  leaf is required unless `nullable` (materialized means the key serializes);
  a `mandatory` or enabled-presence choice errors `caseRequired` until a case
  is picked.
- **`map` vs `nodeGroup`** — known keys at authoring time → `nodeGroup`; open
  keys → `map`. They compose.
- **Choice case inference** — wire data carries no `__case`; when seeding from
  data the active case is the best-ranked candidate (`resolveChoiceCase`):
  fewest data keys the case cannot hold, then fewest non-`presence` fields the
  data lacks (so `{qosId}` picks the branch requiring only `qosId`, not the one
  also requiring `ueId`), then most matched fields, then declaration order.
  Cases may be anonymous (`case0`, …) with `caseLabels`.

**Typing gotcha:** author schemas with `defineSchema({...})` (or `satisfies
NodeGroup`). Annotating a constant `: NodeGroup` widens the literal type and
destroys the schema → `FormGroup` type inference.

## Using the library

```ts
import {
  defineSchema, buildFormFromSchema,               // schema → typed FormGroup
  buildControl,                                    // one non-root node
  caseFields, resolveChoiceCase, switchChoiceCase, // drive a choice group
  addMapEntry, renameMapEntry, removeMapEntry,     // drive a map group
  DynamicRecursiveFormComponent, ConfigEditorComponent,
} from 'ng-form-foundry';

const schema = defineSchema({ kind: 'nodeGroup', name: 'svc', root: true, children: { /* … */ } });
const form = buildFormFromSchema(schema, initialData);  // typed FormGroup
```

```html
<!-- all-in-one form -->
<nff-dynamic-recursive-form [schema]="schema" [formGroup]="form" [(editable)]="editing" />

<!-- tree/detail editor for large configs; draws no container of its own -->
<nff-config-editor [schema]="schema" [formGroup]="form" />
```

Always pass a `formGroup` built from the **same schema** — rendering with
`[schema]` alone binds fields to a throwaway group. Read the edited data with
`serializeForm(schema, form)` — `form.getRawValue()` with every choice's
`__case` stripped; when the schema has no choices the two are identical.

## Using the transformers

Everything is exported from the package root; `core` is framework-free and
browser-safe (the demo runs it in the browser).

### JSON Schema (draft 2020-12) → form schema

```ts
import { jsonSchemaToNodeGroup } from 'ng-form-foundry-transformers';

// Single document ($ref into $defs resolves locally):
const schema = jsonSchemaToNodeGroup(jsonSchema, 'policy');

// Cross-file $ref by $id (e.g. O-RAN A1: "/jsonschemas/a1td/common_3.0.1#/$defs/UeId"):
const schema2 = jsonSchemaToNodeGroup(mainDoc, 'policy', { refDocuments: [commonDoc] });
```

Mapping highlights: `anyOf`/`oneOf` → `choice` (auto-named cases, `title` →
`caseLabels`); `type: [T, 'null']` → nullable leaf (not a choice); `const` →
read-only leaf; `additionalProperties`/`patternProperties` → `map`;
string/number constraints and `type: "integer"` → validators; `required` →
`required: true` on leaves, `mandatory: true` on choices; optional
(non-`required`) properties auto-become `presence` nodes — absent until enabled,
so the serialized value validates against the source schema (opt out with
`schemaOptions: { optionalPresence: false }`). Not mapped: `allOf`, exclusive
bounds, presence for optional *arrays* (lists can't carry it).

### YAML / JSON config round-trip

Every transformer implements one contract: `toSchema(source) → { schema,
binding, initialValue }` and `toSource(value, binding) → source`. Keep
`binding` server-side/opaque; never send it to the form UI.

```ts
import { yamlTransformer, jsonTransformer } from 'ng-form-foundry-transformers';

const { schema, binding, initialValue } = yamlTransformer.toSchema(yamlText); // optionally { schema: jsonSchema }
// … build the form, let the user edit …
const editedYaml = yamlTransformer.toSource(serializeForm(schema, form), binding); // comments & formatting preserved
```

`toSource` for YAML/JSON applies the value's keys verbatim, so hand it the
**wire value** (`serializeForm`, from `ng-form-foundry`) — a raw
`getRawValue()` would write `__case` keys into the config when the schema
contains choices. The YANG adapter is the exception: `toYangData` consumes the
**form value** and flattens `__case` itself.

Round-trip guarantees you must not break: YAML comments/formatting and JSON
indent are preserved; **non-string map keys** (`{80: http}`) survive; integers
beyond 2^53 are carried **losslessly as strings** (JSON needs Node ≥ 21 for
this — it throws below rather than corrupting).

### YANG

```ts
import { createYangTransformer, YangFormAdapter, SubprocessEngine } from 'ng-form-foundry-transformers';
```

Compiles via `pyang` (Python required) — server-side only. `toSchema` consumes
YANG sources; `toSource` emits RFC 7951 instance data. `FakeEngine` exists for
tests. Full type coverage table: `docs/transformers.md`.

## Explore by running things

```bash
npm ci && npx ng serve demo --port 4321
```

| Route | Shows |
| --- | --- |
| `/showcase` | every 0.3.0 feature in one form + live `getRawValue()` panel |
| `/showcase-tree` | the same schema in the tree editor (optionals menu, maps, choice) |
| `/a1-policy` | `jsonSchemaToNodeGroup` running **live in the browser** on a cross-file-$ref A1 policy schema |
| `/yang` | presence + choice + map, YANG-flavored |
| `/tree`, `/complex-tree` | tree editor, simple and large (OpenAirInterface DU) configs |
| `/simple`, `/complex`, `/split` | form renderer basics |

**The specs are executable documentation.** For any behavior question, read the
matching `*.spec.ts` before reading implementation:
`core/dynamic-recursive-forms-builder.spec.ts` (builder + helpers),
`config-editor/config-editor.component.spec.ts` (tree semantics), and
`packages/ng-form-foundry-transformers/test/*.test.ts` (round-trip guarantees).

## Verifying changes

```bash
npx ng test ng-form-foundry --browsers=ChromeHeadless --watch=false  # Karma/Jasmine
npx ng build ng-form-foundry && npx ng build demo
cd packages/ng-form-foundry-transformers && npm run build && npm test  # node:test
sphinx-build -b html -W --keep-going docs <outdir>                     # docs must build warning-free
```

All suites green before any commit. For UI changes, verify in the demo in a
real browser, not only through unit tests.

## Conventions when modifying this repo

- **Never break `getRawValue()` IS the data.** Absent optional = removed
  control (`removeControl`, never `disable()` — a disabled control still
  appears in `.value`). The choice `__case` discriminator is the sole
  exception; `serializeForm` is the strip, and nothing else may need one.
- **Colors:** only `var(--mat-sys-*)` Material theme tokens. No hardcoded hex.
- **Docs travel with code:** update `docs/`, READMEs, and docstrings in the
  same commit as the behavior change. Docstrings describe current behavior
  only — no changelog remarks, no links to working documents.
- **Public API** of the library goes through `src/public-api.ts`; builder
  exports are automatically public.
- **Component import cycles** (recursive renderers) must use
  `forwardRef(() => X)` on **both** sides — one-sided guards break when module
  evaluation order changes.
- **Commits:** conventional commits (`feat(scope):`, `fix:`, `chore(release):`),
  no `Co-Authored-By`/session trailers.
- **Release:** bump versions in both packages + root + lockfiles +
  `docs/conf.py`, commit `chore(release): X.Y.Z`, tag `vX.Y.Z`; pushing the tag
  triggers `.github/workflows/release.yml`, which publishes both packages
  (already-published versions are skipped). Never publish from a working tree.
- **Licensing:** the repo is public — do not commit third-party schema files
  (e.g. O-RAN specs). Validate against them locally, commit synthetic fixtures.
