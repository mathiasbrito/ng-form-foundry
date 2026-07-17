# Transformers

`ng-form-foundry-transformers` is a companion **Node/TypeScript** package that
generates schemas from an existing source — a **YAML** or **JSON** config file, or
a **YANG** model — and reverts the edited form value back to that source format. It
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
| `yang` | YANG model (via an engine) | RFC 7951 instance data |

## YAML

Turn a YAML config into a form, then write the edited value back with comments, key
order, and formatting preserved. Pass a JSON Schema to drive types/required/enums,
or omit it to infer the form from the data itself.

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

| JSON Schema | Maps to |
| --- | --- |
| `object` with `properties` | `nodeGroup` (children keyed by property; `required` marks fields) |
| `object` with `additionalProperties: <schema>` / `patternProperties` | `map` (open dictionary; `patternProperties` key → `keyPattern`) |
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

Not yet mapped: `allOf` composition, `exclusiveMinimum`/`exclusiveMaximum`, and
`additionalProperties` *alongside* fixed `properties` (the fixed keys win). An
optional (non-`required`) property maps to a non-required field — author
`presence` by hand when an *absent key* must round-trip.

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
