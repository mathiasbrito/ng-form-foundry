# ng-form-foundry-transformers

A catalog of **source-format transformers** for
[ng-form-foundry](https://ng-form-foundry.readthedocs.io): turn a model or config
into a schema your Angular app can render, then revert the edited form value back
to the source format.

Framework-agnostic **Node + TypeScript** — no framework imports. NestJS is the
likely host, but the library assumes only Node; wire it into Express, a worker,
or a CLI just as easily.

## Transformers

| id | Source | Reverts to | Status |
| --- | --- | --- | --- |
| `yang` | YANG model (via an engine) | RFC 7951 instance data | available |
| `yaml` | YAML config (optionally a JSON Schema) | YAML (comments preserved) | available |
| `json` | JSON config (optionally a JSON Schema) | JSON (indent preserved) | available |
| `libconfig` | libconfig document (optionally a JSON Schema) | libconfig (comments **and scalar types** preserved) | available |

The YAML and JSON transformers share the same format-agnostic form builders in
`core` (`inferNodeGroup`, `jsonSchemaToNodeGroup`) — a JSON Schema is an *option*
to either, not a transformer of its own.

## The contract

Every format implements one `Transformer`, so a single catalog can turn any of
them into a form and write the edited value back. Look one up by `id` through a
`TransformerRegistry`, or import the one you need directly (tree-shakeable).

```ts
interface Transformer<TSource, TData = TSource, TBinding = BindingMap, TOptions = void> {
  readonly id: string;
  // source → form schema (+ revert context, and any initial value)
  toSchema(source: TSource, options?: TOptions): MaybePromise<{
    schema: NodeGroup; binding: TBinding; initialValue?: FormValue;
  }>;
  // edited form value → source data, using the binding from toSchema
  toSource(value: FormValue, binding: TBinding): MaybePromise<TData>;
}
```

For config formats (YAML, JSON) the thing you load and save is the same document
type, so `TData` defaults to `TSource`. Schema formats differ: YANG's `toSchema`
consumes a model source but its `toSource` reverts to RFC 7951 *data*.

**Choice values:** the YAML/JSON `toSource` applies the value's keys verbatim,
so when the schema contains choices (`anyOf`/`oneOf`) pass the **wire value** —
the library's `serializeForm(schema, form)`, which strips the `__case`
discriminators from `getRawValue()`. The YANG adapter is the exception: its
`toYangData` consumes the form value and flattens `__case` itself.

## Thesaurus — display metadata for machine schemas

Machine schemas (O-RAN A1 policy types, inferred configs) ship without titles,
so forms fall back to raw attribute names (`guRanUeId`, `mcc`). Every
`toSchema` accepts a **thesaurus** — identifier → `{ label, description }` —
injected into the produced schema, JSON-Schema-driven or inferred alike:

```ts
const thesaurus = {
  ueId: { label: 'UE ID', description: 'UE identifier.' },
  mcc: { label: 'MCC', description: 'Mobile Country Code (3 digits).' },
};
yamlTransformer.toSchema(text, { thesaurus });          // also json / libconfig
jsonSchemaToNodeGroup(schema, 'body', { thesaurus });   // or standalone
applyThesaurus(nodeGroup, thesaurus);                   // post-process anything
```

Keys are **plain identifier names**, matched **case-insensitively** against
each node's property/setting name — one entry covers the identifier wherever
it appears. Keys are never paths: no separator exists, so a `.` in a key is a
literal character of the name. The thesaurus fills gaps only — schema-authored
`title`/`description` always win. Unlabeled choice cases are titled from their
discriminating required field; when sibling cases collide (identical required
sets), the library's case selectors disambiguate them by each case's
distinguishing fields.

When the same identifier means different things at different depths, a key
maps to a **list of variants scoped by `under`** — an ancestor-**name** suffix
(an array, so still no separators; each segment is a literal name). The
longest matching scope wins; an entry without `under` is the fallback:

```ts
const thesaurus = {
  id: [
    { under: ['cell'],  label: 'Cell ID' },   // any `id` directly inside a `cell`
    { under: ['slice'], label: 'S-NSSAI' },
    { label: 'ID' },                          // everywhere else
  ],
};
```

Scoping follows the **data hierarchy of names**: list indices, map entry keys,
and — by default — choice case names are transparent. For a **choice**, case
fields match both with and without their case-name segment, so one scope can
cover the whole choice or target a single case:

```ts
// scope (choice) → cases byUe / byCell, both with a field named `id`
const thesaurus = {
  id: [
    { under: ['scope', 'byUe'],   label: 'UE ID' },    // only inside the byUe case
    { under: ['scope', 'byCell'], label: 'Cell ID' },  // only inside byCell
    { under: ['scope'],           label: 'Scope ID' }, // any other case of scope
  ],
};
// → byUe.id: "UE ID", byCell.id: "Cell ID"; the per-case labels also flow
//   into caseLabels via each case's discriminating field.
```

Scoping by an auto-generated case name (`under: ['case0']`) works but is
positional — it shifts when the source schema reorders its branches; prefer
case-name scopes only for hand-named cases.

## YAML transformer

Edit a **YAML config file**: turn it into a form, then write the edited value
back to YAML with comments, key order, and formatting preserved. Pass a JSON
Schema to drive types/required/enums, or omit it to infer the form from the data.

```ts
import { yamlTransformer } from 'ng-form-foundry-transformers';

const yaml = `# upstream API
host: localhost   # dev only
port: 8080
`;

// forward: infer a form schema (+ initial value) from the config
const { schema, binding, initialValue } = yamlTransformer.toSchema(yaml);
//   schema      → NodeGroup the Angular app renders with buildFormFromSchema
//   initialValue → { host: 'localhost', port: 8080 }

// reverse: write the edited value back — comments survive
const out = yamlTransformer.toSource({ ...initialValue, port: 9090 }, binding);
//   # upstream API
//   host: localhost   # dev only
//   port: 9090
```

With a JSON Schema: `yamlTransformer.toSchema(yaml, { schema })`. The mapping
covers **draft 2020-12** (back-compatible with draft-07): `object` → nodeGroup (or
a `map` for `additionalProperties`/`patternProperties`), `array` → nodeGroupList /
leafList, `anyOf`/`oneOf` → choice (or a nullable leaf for `[T, null]`), `$ref` →
`$defs`/`definitions` resolved inline (local **or cross-file** via
`schemaOptions.refDocuments`, matched by `$id`), `const` → a read-only leaf, and the
string / number constraints (`pattern`, `minLength`, `minimum`, `multipleOf`,
`format`, …) carried onto the leaves as validators, with
`minProperties`/`maxProperties` becoming present-children bounds on closed
objects (`minPresent`/`maxPresent`) or entry bounds on open maps.
Non-`required` properties become **`presence` nodes** — absent from the form
and the serialized value until
enabled, so the output validates against the source schema (opt out with
`schemaOptions: { optionalPresence: false }`); a required property mapping to a
choice is marked `mandatory`.

**The schema must agree with the document on container shapes.** A covered
key whose schema says array where the document holds an object (or scalar
where it holds a collection) makes `toSchema` throw a `SchemaShapeError`
naming the path — such a form could not carry the section and saving would
erase it. Catch it to fall back to inferred editing. Scalar-vs-scalar
differences (a quoted `"0xe00"` under an `integer` schema) stay editable,
and an integral edit writes back an integer literal.

**The schema may cover any slice of the document.** Keys it does not mention
are governed by `unknownKeys` (YAML, JSON, and libconfig alike):
`'preserve'` (default) keeps them verbatim on save — a partial schema edits
its fields without erasing the rest of a real-world config; `'drop'` deletes
them — for an intentionally complete schema (sanitizing, template
enforcement); `'edit'` surfaces them as editable fields typed by the
document's own values, merged under the JSON Schema in document order, so
nothing in the file is invisible.

## JSON transformer

Same as YAML, for **JSON config files** — `jsonTransformer.toSchema(json, { schema? })`
and `toSource(value, binding)`. Revert re-serializes with the source's indent width
and trailing newline preserved. Standard JSON has no comments; for JSON **with**
comments (JSONC), use the YAML transformer instead (`JSON.parse` rejects comments).

```ts
import { jsonTransformer } from 'ng-form-foundry-transformers';

const { schema, binding, initialValue } = jsonTransformer.toSchema(configText);
const out = jsonTransformer.toSource({ ...initialValue, replicas: 5 }, binding);
```

## libconfig transformer

Edit a **libconfig document** — the `.cfg`/`.conf` format of srsRAN, OAI, and
other C/C++ software using [libconfig](https://hyperrealm.github.io/libconfig/).

```ts
import { libconfigTransformer } from 'ng-form-foundry-transformers';

const { schema, binding, initialValue } = libconfigTransformer.toSchema(cfgText);
// … build the form, let the user edit …
const editedCfg = libconfigTransformer.toSource(editedValue, binding);
```

The revert **splices edited spans into the original text**, so comments, key
order, `=` vs `:`, terminators, and delimiter style survive verbatim on every
unedited byte. Emission is **type-preserving** — libconfig is statically typed,
so a float slot edited to an integral value emits `21.0` not `21`, hex re-emits
in hex at its original width, an int64 keeps its `L` suffix, and values beyond
2^53 travel as exact decimal strings (the same bigint strategy as YAML/JSON).

Without a JSON Schema, the form is inferred from the document's own typed
literals; a list of groups infers the union of entry keys (keys missing from
some entries become presence toggles). **Empty and heterogeneous collections
are then shown read-only** — libconfig gives no element type to edit by; pass a
JSON Schema (`{ schema, schemaOptions? }`) to type them and make them editable.
`@include` is rejected by default (the form would show less than the C reader
sees); `{ includes: 'opaque' }` keeps the directive line verbatim and edits only
the file's own settings. Newly added settings are value-typed (an integral
number emits as an int) — route float-typed additions through a JSON Schema
slot that exists in the source, or accept the int typing.

The format, the parser design, and the full round-trip semantics are described
in [`docs/libconfig.md`](docs/libconfig.md).

## YANG transformer

Turn a **YANG** model into an ng-form-foundry schema, then revert the edited form
value back to **RFC 7951** instance data for write-back to a NETCONF/RESTCONF
datastore. Use the fuller `YangFormAdapter` when you want caching by `modelId`,
engine-side validation, and RFC 7951 → form-value conversion:

```ts
import { YangFormAdapter, SubprocessEngine } from 'ng-form-foundry-transformers';

const adapter = new YangFormAdapter(new SubprocessEngine());

// resolve a device model once (cached by modelId)
await adapter.compile({
  modelId: 'acme-router@2026-01-01',
  entryModule: 'ietf-interfaces',
  source: { kind: 'dir', path: './yang' },
});

// forward: hand the Angular app a NodeGroup it renders with buildFormFromSchema
const schema = await adapter.getFormSchema('acme-router@2026-01-01');

// load the device's current config into a plain form value
const value = await adapter.toFormValue(deviceGetResponse, 'acme-router@2026-01-01');

// reverse: the edited form value → RFC 7951 JSON, ready for a RESTCONF PUT
const rfc7951 = await adapter.toYangData(editedValue, 'acme-router@2026-01-01');
```

Or use the catalog-conformant `createYangTransformer(engine)` for the plain
`Transformer` view (no caching/validation).

### What it does

- **Forward** — maps a resolved YANG tree to an ng-form-foundry `NodeGroup`
  (`container` → nodeGroup, `list` → nodeGroupList, `leaf`/`leaf-list` → leaf/leafList).
- **Reverse** — reconstructs RFC 7951 JSON from a plain form value, restoring
  module-namespaced member names, list keys, and — critically —
  `int64`/`uint64`/`decimal64` as **strings** so precision survives. `config false`
  state is shown for context but dropped from write-back.
- **Binding stays server-side** — the frontend only ever sees the `NodeGroup`
  schema and returns a plain value; the resolved YANG model (the "binding") never
  leaves the adapter.

### Engines

The only part that touches YANG semantics or the environment is the injected
`YangEngine`:

- **`SubprocessEngine`** (recommended) shells out to the bundled Python helper,
  which wraps **pyang** to resolve `uses`/`augment`/`typedef` and emit a
  normalized effective tree. Requires Python + `pip install pyang` on the host.
- **`FakeEngine`** serves pre-resolved models — used in tests and local dev, no
  Python required.

Caching is pluggable (`ArtifactCache`; an `InMemoryCache` ships by default).

### Leaf and structural type coverage

| YANG type | Form control | Notes |
| --- | --- | --- |
| `string`, `boolean`, int/uint 8–32 | text / checkbox / number | direct |
| `int64`, `uint64`, `decimal64` | text | kept as strings (precision-safe) |
| `enumeration`, `identityref` | enum (dropdown) | identityref re-qualified across modules |
| `empty` | checkbox | `[null]` when set, omitted when not |
| `bits` | group of checkboxes | reverts to the space-separated set |
| `binary`, `instance-identifier`, `leafref`, `union` | text | member types / leafref path kept in the binding |

Plain `container` → nodeGroup; **presence** `container` → nodeGroup flagged
`presence: true` (on/off toggle; present-but-empty round-trips as `{}`, absent is
omitted). **`choice`/`case`** → a `Choice` node: the form value carries
`{ __case, ...fields }` and the adapter flattens it to the inline YANG encoding on
write-back. `must`/`when` cross-field validity is left to server-side validation.

### Using it from NestJS

The core is a plain class, so a NestJS provider is a thin wrapper — see
[`examples/nestjs-provider.ts`](examples/nestjs-provider.ts).

## Develop

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node:test on the compiled output (no Python needed)
```

## Status

`0.5.5` — version-alignment release with the workspace (the paired
`ng-form-foundry` 0.5.5 aligns the standalone form and config editor on list
cardinality, adds `setNodePresence`, and reflects external form mutations in
the config editor); no transformer changes.

`0.5.4` — version-alignment release with the workspace (the paired
`ng-form-foundry` 0.5.4 ships tree options — `expandOnClick`,
`showBreadcrumb` — field-wide add buttons, and a unified block rhythm); no
transformer changes.

`0.5.3` — version-alignment release with the workspace (the paired
`ng-form-foundry` 0.5.3 ships hover-revealed field actions and indexed
group-list add labels); no transformer changes.

`0.5.2` — **shape safety and operator-friendly display**: a container-shape
disagreement between document and schema (array declared where the document
holds an object, or scalar where it holds a collection — inside choices
included) throws a `SchemaShapeError` naming the path instead of producing
an empty form whose save would erase the section; a type-changing integral
edit writes an integer literal, never a float; and schema-driven fields
display hex/octal/binary values in the base the document wrote them, in
every `unknownKeys` mode. Adversarially proof-tested before release.

`0.5.1` — **partial JSON Schemas edit safely**: the new `unknownKeys` option
(YAML, JSON, libconfig) governs keys the schema does not cover — `'preserve'`
(default) keeps them verbatim on save, `'drop'` deletes them for
intentionally complete schemas, `'edit'` surfaces them as editable fields
typed by the document's own values. The YAML binding is now
`YamlBinding { doc, schema? }` instead of the bare parsed document (bindings
are opaque; code that hands them straight back to `toSource` is unaffected).

`0.5.0` — the **libconfig transformer is stable**: the one-time beta warning
is gone (and with it the `resetLibconfigBetaWarning` helper), and the format's
guarantees and known limitations are documented in the transformers guide.
Non-decimal integer literals (`0x`, `0b`, `0o`/`0q`) now set a `radix` display
hint on the generated schema — the paired `ng-form-foundry` release renders
those fields as hex/octal/binary editors, and the YAML transformer does the
same for its hex and octal literals.

`0.4.1` — libconfig hardening after a conformance battle test against the C
library's own scanner, test corpus, and real srsRAN/OAI configs: `0q`/`0Q`
octal, verbatim radix-prefix preservation on edits, sign accepted on decimal
literals only, negative edits into hex/bin/oct slots emit decimal, exact
round-trips for collections mixing safe and beyond-2^53 integers, `null`
rejected instead of written as `true`, a 256-level nesting cap, strict `\x`
escapes, `@include` legal in value positions, and modified read-only carries
throw instead of corrupting.

`0.4.0` — version-alignment release with the workspace (the paired
`ng-form-foundry` 0.4.0 adds appearance-driven field layout); no transformer
changes.

`0.3.5` — the **thesaurus**: every `toSchema` and `jsonSchemaToNodeGroup`
accept identifier → `{ label, description }` display metadata, with variants
scoped by ancestor names (`under`) for identifiers that mean different things
at different depths; choice cases are titled from their labeled discriminating
field. Adversarially battle-tested (51-agent panel); the paired library
release guarantees unique case-selector labels.

`0.3.4` — the **libconfig transformer debuts as a beta** (one-time console
warning on first use; lossless span-splicing round-trip with scalar types
preserved — see [`docs/libconfig.md`](docs/libconfig.md)), and
`minProperties`/`maxProperties` on closed objects now map to the library's
`minPresent`/`maxPresent` present-children bounds, so an emptied
all-optional object (e.g. an A1 `qosObjectives`) is flagged client-side
instead of only by the server's validator.

`0.3.3` — schema-valid round-trips for JSON-Schema-driven forms. Non-`required`
properties now map to `presence` nodes (absent until enabled; opt out with
`schemaOptions: { optionalPresence: false }`), a required property mapping to a
choice is flagged `mandatory`, and the YAML/JSON transformers gained
`options.schemaOptions` — which also makes `refDocuments` (cross-file `$ref`)
reachable through them for the first time. Pairs with the library's
required-aware choice-case inference, empty list seeding, and
materialized-validity rules.

`0.3.2` — documentation release alongside the library's `serializeForm`: the
YAML/JSON `toSource` examples now take the wire value (choice `__case`
discriminators stripped); no transformer code changes.

`0.3.1` — version alignment with the library's review-fix release (all 59
findings of the tree-editor/form-renderer review resolved); no transformer
changes.

`0.3.0` — data-integrity release plus JSON Schema draft 2020-12. Fixes three
round-trip corruption bugs shipped in 0.2.1 (YAML maps with non-string keys
duplicated entries; integers beyond 2^53 lost precision — now carried
losslessly as strings, mirroring the YANG uint64 strategy; YANG identityref
resolved to the wrong module on a local-name collision). `jsonSchemaToNodeGroup`
grew from a draft-07 subset to draft 2020-12: `$ref`/`$defs`, cross-file `$ref`
by `$id` (`refDocuments` option), `anyOf`/`oneOf` → choice, `type: [T, 'null']`
→ nullable, `const` → read-only, `additionalProperties`/`patternProperties` →
map, and string/number constraints as validators.

`0.2.1` — first release under this name (formerly `yang-form-foundry`),
restructured into a transformer catalog. YANG, YAML, and JSON transformers are
complete; YAML and JSON share the format-agnostic form builders in `core` and are
JSON-Schema-driven or inferred. **Deprecated: contains the round-trip corruption
bugs fixed in 0.3.0.**

## License

Apache-2.0 © Mathias Santos de Brito
