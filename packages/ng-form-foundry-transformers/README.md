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

With a JSON Schema: `yamlTransformer.toSchema(yaml, { schema })` — `object` →
nodeGroup, `array` of objects → nodeGroupList, scalar `enum` → enum leaf,
`required`/`title`/`default` carried onto the leaves.

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

`0.2.1` — first release under this name (formerly `yang-form-foundry`),
restructured into a transformer catalog. YANG, YAML, and JSON transformers are
complete; YAML and JSON share the format-agnostic form builders in `core` and are
JSON-Schema-driven or inferred.

## License

Apache-2.0 © Mathias Santos de Brito
