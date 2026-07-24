# Transformers

`ng-form-foundry-transformers` is a companion **Node/TypeScript** package that
generates schemas from an existing source — a **YAML** or **JSON** config file, a
**YANG** model, or a **libconfig** document — and reverts the edited
form value back to that source format. It
is framework-agnostic (no framework imports); NestJS is the likely host, but it
runs just as well in Express, a worker, or a CLI.

It is optional: author schemas by hand with the browser package when you have no
source to drive them from.

```bash
npm install ng-form-foundry-transformers
```

## The shape of it

Each format implements one `Transformer`: a forward pass that turns a source into a
schema (plus a *binding* — the context needed to revert — and any initial value),
and a reverse pass that writes an edited form value back.

```ts
interface Transformer<TSource, TData = TSource, TBinding = unknown, TOptions = void> {
  readonly id: string;
  toSchema(source: TSource, options?: TOptions): { schema: NodeGroup; binding: TBinding; initialValue?: FormValue };
  toSource(value: FormValue, binding: TBinding): TData;
}
```

The **binding stays on your server** — the browser only ever receives the
`NodeGroup` schema and returns a plain value. `toSchema`/`toSource` are sync for
YAML/JSON and async for YANG (it compiles through an external engine). Look
transformers up by `id` via a `TransformerRegistry`, or import the one you need
directly (tree-shakeable).

| id | Source | Reverts to |
| --- | --- | --- |
| `yaml` | YAML config (optionally a JSON Schema) | YAML — comments & key order preserved |
| `json` | JSON config (optionally a JSON Schema) | JSON — indent & trailing newline preserved |
| `libconfig` | libconfig document (optionally a JSON Schema) | libconfig — comments & scalar types preserved |
| `yang` | YANG model (via an engine) | RFC 7951 instance data |

## YAML

Turn a YAML config into a form, then write the edited value back with comments, key
order, and formatting preserved. Pass a JSON Schema to drive types/required/enums,
or omit it to infer the form from the data itself. Hex and octal literals
(`0x1A`, `0o17` — YAML 1.2 has no binary notation) keep their own base either
way: the leaf gets a `radix` display hint — schema-driven leaves included,
since only the document knows how a value was written — and an edited value
re-emits as the same kind of literal.

```ts
import { yamlTransformer } from 'ng-form-foundry-transformers';

const yaml = `# upstream API
host: localhost   # dev only
port: 8080
`;

const { schema, binding, initialValue } = yamlTransformer.toSchema(yaml);
//   schema       → render it in Angular with buildFormFromSchema(schema, initialValue)
//   initialValue → { host: 'localhost', port: 8080 }

const out = yamlTransformer.toSource({ ...initialValue, port: 9090 }, binding);
//   # upstream API
//   host: localhost   # dev only
//   port: 9090
```

## JSON

The same, for JSON config files. Revert re-serializes with the source's indent
width and trailing newline preserved. Standard JSON has no comments; for JSON
**with** comments (JSONC), use the YAML transformer — `JSON.parse` rejects them.

```ts
import { jsonTransformer } from 'ng-form-foundry-transformers';

const { schema, binding, initialValue } = jsonTransformer.toSchema(configText);
const out = jsonTransformer.toSource({ ...initialValue, replicas: 5 }, binding);
```

```{admonition} Large integers are preserved
:class: note
JavaScript numbers lose precision beyond 2^53. Both transformers carry an
out-of-range integer as a **string** in the form value and re-emit it verbatim as
an unquoted number, so a value like `9007199254740993` round-trips exactly. (JSON
requires Node ≥ 21 for this; on older Node it throws rather than silently round.)
```

### Driving the form from a JSON Schema

`yamlTransformer.toSchema(text, { schema })` and the JSON equivalent accept a **JSON
Schema (draft 2020-12, back-compatible with draft-07)** to shape the form; without
one, the form is inferred from the data's structure and value types. The exported
`jsonSchemaToNodeGroup(schema)` does the mapping and can be used on its own.

A schema-covered key whose **container shape disagrees with the document** —
the schema says array where the document holds an object, or scalar where it
holds a collection — makes `toSchema` throw a `SchemaShapeError` naming the
offending path: such a form could not carry the section's contents and
saving it would erase them. Catch the error to fall back to inferred
editing, or align the schema. Scalar-vs-scalar differences (a quoted
`"0xe00"` under an `integer` schema) are not errors — the form carries and
edits them, and an integral edit writes back an integer literal.

The schema **may cover any slice of the document**. On save, the edited value
is authoritative for schema-covered paths only: every key the schema does not
mention — top-level or nested inside covered objects and array entries —
survives verbatim, so a real-world config can be edited through a partial
schema without enumerating every key the deployed software writes. Removing
a schema-covered optional still deletes it. This is the
`unknownKeys: 'preserve'` default (YAML, JSON, and libconfig alike). The
other two answers to "what about keys outside the schema?": pass
`unknownKeys: 'drop'` when the schema is intentionally complete and
uncovered keys should be deleted on save (sanitizing a config, enforcing a
strict template), or `unknownKeys: 'edit'` to **surface** them — the
inferred schema is merged under the JSON Schema, so uncovered keys render
as editable fields typed by the document's own values (in document order,
radix hints included), covered keys keep their typed, validated schema
nodes, and nothing in the file is invisible. On save, `'edit'` is
authoritative for the merged schema's paths — effectively the whole
document, while the rare keys no form field can carry (say, a key inside a
covered choice's object that no case names) still survive verbatim.

| JSON Schema | Maps to |
| --- | --- |
| `object` with `properties` | `nodeGroup` (children keyed by property; `required` marks fields) |
| `object` with `additionalProperties: <schema>` / `patternProperties` | `map` (open dictionary; `patternProperties` key → `keyPattern`) |
| `minProperties` / `maxProperties` | on a closed object → `minPresent`/`maxPresent` (bounds on enabled children); on an open map → `minEntries`/`maxEntries` |
| `array` of objects / of scalars | `nodeGroupList` / `leafList` |
| `anyOf` / `oneOf` | `choice` — auto-named cases, `title` → case label |
| `anyOf: [T, null]` | a single **nullable** leaf (not a choice) |
| `string` + `pattern`/`minLength`/`maxLength`/`format` | string leaf with those validators |
| `number`/`integer` + `minimum`/`maximum`/`multipleOf` | number leaf (`integer` flagged) |
| `type: [T, "null"]` | a **nullable** leaf |
| `const` | a read-only leaf pinned to the value |
| `enum` | enum leaf |
| `$ref` — local (`#/$defs/…`) or **cross-file** (`/path#/$defs/…`) | resolved inline |
| `title` / `description` / `default` | label / description / default |

**Cross-file `$ref`** resolves against other documents you pass in
`options.refDocuments`, matched by `$id`. A ref like `/a1/common#/$defs/UeId`
resolves into the document whose `$id` ends with `/a1/common`; refs *within* that
document then resolve against it. This is what lets an A1 policy type reference a
shared `common` definitions file:

```ts
import { jsonSchemaToNodeGroup } from 'ng-form-foundry-transformers';

const schema = jsonSchemaToNodeGroup(qosTarget, 'QoSTarget', {
  refDocuments: [common], // the doc QoSTarget's $ref points at
});
```

**Optional properties become `presence` nodes.** A property not in `required`
maps to `presence: true` (leaf, group, choice, map, **and lists** — `leafList`
and `nodeGroupList`): absent from the form value until the user enables it. That
is what schemas with typed properties and `additionalProperties: false` demand —
materializing an untouched optional as `null` (or, for a list, as `[]`) fails
validation against the very schema the form came from, and would inject a key the
source never authored. A required property that maps to a choice is marked
`mandatory` instead. Opt out with `{ optionalPresence: false }` to materialize
every property unconditionally. When calling through the YAML/JSON transformers,
pass these flags (and `refDocuments`) as `options.schemaOptions`.

Marking optional **lists** as presence is what keeps an *absent* list distinct
from a *present-but-empty* one: a zero-edit rebuild of a source that never had
`amf_ip_address` will not splice `amf_ip_address = [ ]` back in, while a source
that wrote `amf_ip_address = ( )` keeps its empty list. Both cases round-trip
byte-for-byte.

#### `advisoryRequired` — treat `required` as advisory, not structural

**What it does.** By default, a property listed in the schema's `required` array
is **always materialized** — it renders on the form and is present in the value
even when the source document omitted it, because the schema says it must exist.
Setting `{ advisoryRequired: true }` makes those `required` properties `presence`
nodes as well: their presence then **follows the data**. A key present in the
loaded value materializes; a key the source omitted **stays absent**. The
property keeps `required: true`, so once it is present it must hold a value
(validation is unchanged) — but `required` no longer *forces the key to exist*.

**Why it exists.** When a single schema covers several config flavours (a CU, a
DU, and a gNB all validated against one document), its `required` list is
necessarily over-broad: a key that is mandatory for one flavour gets demanded on
every unit. A byte-exact editor must not write a key the source never had, so
force-materializing every `required` key would corrupt the document — e.g.
emitting `du_addr = ""` into a CU config that never carried `du_addr`.
`advisoryRequired` is the escape for that case.

```ts
// Source omits `du_addr`; the shared schema marks it required.
const { schema, initialValue } = libconfigTransformer.toSchema(source, {
  schema: sharedSchema,
  schemaOptions: { advisoryRequired: true },   // via YAML/JSON/libconfig
});
// du_addr → presence node, absent from initialValue → not force-written.
// If the operator DOES add it, `required` still forbids leaving it empty.
```

The three states of a property under `advisoryRequired`, by whether it is in
`required` and whether the source carried it:

| in `required`? | in the source? | result |
| --- | --- | --- |
| yes | yes | materialized, `required` validation applies |
| yes | no  | **absent** (not force-written); `required` applies only if you add it |
| no  | yes | materialized (ordinary optional that happens to be present) |
| no  | no  | absent (ordinary optional) |

**When to use it.** Only for **byte-exact editing of an existing document**
against a schema whose `required` list you do not control or cannot scope.
Leave it `false` (the default) for **new-form authoring**, where a required
field *should* render on a blank form so the user is prompted to fill it. The
cleaner fix for an over-broad `required` list is to correct the schema — scope
it per flavour, or trim `required` to the keys genuinely always present — and
`advisoryRequired` is the pragmatic fallback when that is not an option. It
composes with `optionalPresence` and the `unknownKeys` modes.

Not yet mapped: `allOf` composition, `exclusiveMinimum`/`exclusiveMaximum`, and
`additionalProperties` *alongside* fixed `properties` (the fixed keys win).

### Thesaurus — display metadata injection

Machine schemas (O-RAN A1 policy types, plain config files) usually ship
without `title`/`description`, so forms fall back to raw attribute names
(`guRanUeId`, `mcc`). A **thesaurus** fixes that once, at the transformer:
a catalog of identifier → display metadata that every `toSchema` (and
`jsonSchemaToNodeGroup` itself) injects into the schema it produces —
JSON-Schema-driven or inferred alike.

**How to use it:**

1. **Build the catalog once per domain** — plain identifier names as keys,
   `{ label, description? }` as values. Keys match **case-insensitively**
   against property/setting names, so one entry covers `ueId`, `UeId`, and a
   `$def` named `UeId` alike. Keys are **never paths**: no separator exists,
   so a `.` in a key is a literal character of a name.

   ```ts
   const thesaurus = {
     ueId: { label: 'UE ID', description: 'UE identifier.' },
     mcc:  { label: 'MCC', description: 'Mobile Country Code (3 digits).' },
     gfbr: { label: 'GFBR', description: 'Guaranteed Flow Bit Rate, in bit/s.' },
   };
   ```

2. **Pass it to any entry point** — it applies wherever the schema came from:

   ```ts
   jsonSchemaToNodeGroup(policySchema, 'body', { thesaurus, refDocuments: [common] });
   yamlTransformer.toSchema(text, { thesaurus });        // inferred or schema-driven
   jsonTransformer.toSchema(text, { thesaurus });
   libconfigTransformer.toSchema(cfg, { thesaurus });
   applyThesaurus(nodeGroup, thesaurus);                 // post-process any schema
   ```

3. **Scope entries when one name has several meanings.** A key may map to a
   list of variants scoped by `under` — an ancestor-**name** suffix, written
   as an array (no separators, every segment a literal name). The longest
   matching scope wins; an entry without `under` is the fallback:

   ```ts
   const thesaurus = {
     id: [
       { under: ['cell'],  label: 'Cell ID' },   // any `id` directly inside a `cell`
       { under: ['slice'], label: 'S-NSSAI' },
       { label: 'ID' },                          // everywhere else
     ],
   };
   ```

   List indices and map entry keys are transparent — fields scope under the
   list/map *name* (`under: ['cells']` covers every item's fields).

4. **Choices**: case fields match both **with and without** their case-name
   segment, so one scope can cover the whole choice or target a single case:

   ```ts
   // scope (choice) → cases byUe / byCell, both with a field named `id`
   const thesaurus = {
     id: [
       { under: ['scope', 'byUe'],   label: 'UE ID' },    // one case only
       { under: ['scope', 'byCell'], label: 'Cell ID' },
       { under: ['scope'],           label: 'Scope ID' }, // any case of scope
     ],
   };
   ```

   An unlabeled case is titled from its discriminating field — the first
   `required` (else first) field whose entry **carries a label**
   (description-only entries never title a case). When sibling cases end up
   with the same title (identical required sets, as in the O-RAN QoSTarget
   scope), the library's `caseDisplayLabels` guarantees the selector options
   are unique by suffixing each case's distinguishing fields. Scoping by an
   auto-generated case name (`case0`) is positional and brittle — reserve
   case-name scopes for hand-named cases.

**Precedence:** the thesaurus fills gaps only. Schema-authored
`title`/`description` (including titles on `$ref`-resolved definitions) always
win, and `applyThesaurus` never mutates its input — it returns a decorated
copy.

## libconfig

`libconfigTransformer` edits **libconfig documents** — the `.cfg`/`.conf`
format of srsRAN, OAI, and other C/C++ software.

The revert splices edited value spans into the original text, so comments and
formatting survive verbatim on every unedited byte, and emission is
**type-preserving** — libconfig is statically typed, so a float slot keeps its
`.0`, a hex/binary/octal literal (`0x`, `0b`, `0o`/`0q`) re-emits in its own
radix, prefix spelling, and digit width, an int64 keeps its `L` suffix, and
integers beyond 2^53 travel as exact decimal strings. A negative edit into a
non-decimal slot emits decimal, because the C scanner accepts no sign on
hex/binary/octal literals.

Non-decimal literals also set the leaf's `radix` display hint — on inferred
and schema-driven leaves alike, in every `unknownKeys` mode — so the form
*shows and edits* the value in the base the file wrote it in (`0x1A` renders
as `0x1A`, not `26`) — see the library's radix rendering in `features.md`.
The value itself stays a plain number end to end.

Without a JSON Schema the form is inferred from the document's typed literals
(a list of groups infers the union of entry keys; keys missing from some
entries become presence toggles). Empty and heterogeneous collections are then
**read-only** — no honest element type exists. A JSON Schema
(`{ schema, schemaOptions? }`) may cover **any slice of the document**: the
edited value is authoritative for schema-covered paths only, and every
setting the schema does not mention — top-level or nested inside covered
groups and list entries — survives byte-verbatim in its original position.
A real-world config can therefore be edited through a partial schema without
enumerating every key the deployed software (or a newer version of it)
writes. Absence of a schema-covered key still removes it, so presence
toggles keep their meaning. As in the YAML/JSON transformers this is the
`unknownKeys: 'preserve'` default, `unknownKeys: 'drop'` opts an
intentionally complete schema back into whole-document authority, and
`unknownKeys: 'edit'` surfaces uncovered settings as editable fields typed
by the document's own literals (uncovered empty and heterogeneous
collections stay read-only carries, as in inferred mode). A JSON
Schema also makes typed **empty** collections editable;
heterogeneous lists stay read-only, and an edited carry string is rejected
with an error rather than spliced. `@include` is rejected by default;
`{ includes: 'opaque' }` keeps the directive line verbatim (anywhere the C
scanner allows it, list positions included) and edits only the file's own
settings.

### Guarantees

Pinned by the package's test suite:

- An untouched form round-trips **byte-identically** — comments, formatting,
  and all.
- A single scalar edit changes exactly one literal in the output.
- Types survive edits: float slots stay floats, hex/binary/octal literals
  keep their base, prefix spelling, and digit width, `L`/`LL` suffixes stay,
  and 64-bit integer precision is exact end to end.

### Known limitations

- **New settings are value-typed.** A setting added by the form (one with no
  counterpart in the source file) is emitted from its JavaScript value: an
  integral number becomes an int even where the consuming program expects a
  float. Route such additions through a slot that exists in the source, or
  accept the typing.
- **Heterogeneous lists are read-only**, and empty collections are read-only
  without a JSON Schema — libconfig gives no element type to edit by.
- **In `'opaque'` include mode the form edits only the parent file**; settings
  from included files are invisible to it.
- `minItems`/`maxItems`-style cardinality is not enforced on inferred lists
  (a JSON Schema adds it).
- **Shrinking a list can drop comments inside it.** Removing trailing
  elements deletes their source span; a comment sitting between the removed
  elements goes with them. Comments outside the edited span are never
  touched.

The format, the parser design, and the full round-trip semantics are described
in the package's
[`docs/libconfig.md`](https://github.com/mathiasbrito/ng-form-foundry/blob/main/packages/ng-form-foundry-transformers/docs/libconfig.md).

## YANG

Turn a YANG model into a schema, then revert the edited value to **RFC 7951**
instance data for write-back to a NETCONF/RESTCONF datastore. Use `YangFormAdapter`
when you want caching by `modelId`, engine-side validation, and RFC 7951 → form
conversion:

```ts
import { YangFormAdapter, SubprocessEngine } from 'ng-form-foundry-transformers';

const adapter = new YangFormAdapter(new SubprocessEngine());

// resolve a device model once (cached by modelId)
await adapter.compile({
  modelId: 'acme-router@2026-01-01',
  entryModule: 'ietf-interfaces',
  source: { kind: 'dir', path: './yang' },
});

const schema = await adapter.getFormSchema('acme-router@2026-01-01');      // → Angular
const value  = await adapter.toFormValue(deviceGetResponse, 'acme-router@2026-01-01');
const rfc7951 = await adapter.toYangData(editedValue, 'acme-router@2026-01-01'); // → RESTCONF PUT
```

Or use `createYangTransformer(engine)` for the plain, catalog-conformant
`Transformer` view (no caching or validation).

### Engines

The only part that touches YANG semantics or the environment is the injected
`YangEngine`:

- **`SubprocessEngine`** (recommended) shells out to the bundled Python helper,
  which wraps **pyang** to resolve `uses`/`augment`/`typedef` and emit a normalized
  effective tree. Requires Python + `pip install pyang` on the host.
- **`FakeEngine`** serves pre-resolved models — for tests and local dev, no Python
  required.

Caching is pluggable (`ArtifactCache`; an `InMemoryCache` ships by default).

### Type coverage

| YANG type | Form control | Notes |
| --- | --- | --- |
| `string`, `boolean`, int/uint 8–32 | text / checkbox / number | direct |
| `int64`, `uint64`, `decimal64` | text | kept as strings (precision-safe) |
| `enumeration`, `identityref` | enum (dropdown) | identityref re-qualified across modules |
| `empty` | checkbox | `[null]` when set, omitted when not |
| `bits` | group of checkboxes | reverts to the space-separated set |
| `binary`, `instance-identifier`, `leafref`, `union` | text | member types / leafref path kept in the binding |

`container` → nodeGroup; a **presence** container → a `presence` nodeGroup;
**`choice`/`case`** → a `choice` node (`{ __case, ...fields }` flattened to the
inline YANG encoding on write-back). `config false` state is shown for context but
dropped from write-back. `must`/`when` cross-field validity is left to server-side
validation.

## From NestJS

The core is a plain class, so a NestJS provider is a thin wrapper. See
`examples/nestjs-provider.ts` in the package.

```{admonition} Version note
:class: warning
Use `ng-form-foundry-transformers@0.3.0` or later — `0.2.1` shipped with
round-trip data-corruption defects (non-string YAML map keys, large-integer
precision, and an identityref module collision) that `0.3.0` fixes.
```
