# API reference

## Functions

### `buildFormFromSchema(schema, initial?)`

Builds a typed `FormGroup` from a root `nodeGroup` schema.

```ts
function buildFormFromSchema<S extends NodeGroup>(
  schema: S,
  initial?: Record<string, unknown> | null,
): DFormGroup<S>;
```

| Parameter | Type | Description |
| --- | --- | --- |
| `schema` | `NodeGroup` | The root schema. Author it with [`defineSchema`](typing.md) to keep inference. |
| `initial` | object \| `null` | Optional seed values, keyed by the schema's `children` keys. Each control is seeded from its matching slice, falling back to the node's `default`. |

Returns a `FormGroup` whose keys and control value types are inferred from
`schema`.

```ts
const form = buildFormFromSchema(profileSchema, { firstName: 'Ada' });
```

### `defineSchema(schema)`

Identity helper that captures a schema literal with its exact type while checking
it against `NodeGroup`. Use it (or `satisfies NodeGroup`) so
`buildFormFromSchema` can infer a typed form. See [Typed schemas](typing.md).

```ts
function defineSchema<const S extends NodeGroup>(schema: S): S;
```

### `buildControl(node, initial?)`

Builds the `AbstractControl` for a single node — a `FormControl`, `FormArray`, or
nested `FormGroup` depending on `node.kind`. Most code uses
`buildFormFromSchema`; reach for `buildControl` to build one non-root node.

```ts
function buildControl<T extends NodeType>(
  node: T,
  initial?: unknown | null,
): DFormControl<T>;
```

## Component

### `<nff-dynamic-recursive-form>`

`DynamicRecursiveFormComponent` — renders a schema against a `FormGroup`. Import it
into your standalone component's `imports`.

```html
<nff-dynamic-recursive-form
  [schema]="schema"
  [formGroup]="form"
  [editable]="true"
/>
```

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `schema` | `NodeGroup` | — | **Required.** The schema to render. |
| `formGroup` | `FormGroup` | new empty group | The form to bind to — pass the result of `buildFormFromSchema(schema)`. |
| `initialValue` | object | — | Optional seed value applied on init. Prefer seeding via `buildFormFromSchema(schema, initial)`. |
| `editable` | `boolean` | `false` | Whether fields start editable. Each group also has an edit toggle. |
| `title` | `string` | — | Overrides the header title of the rendered group. |

```{note}
Always pass a `formGroup` built from the same `schema` with `buildFormFromSchema`.
Rendering with `[schema]` alone binds the fields to a throwaway group and the
values won't reach your form.
```

## Types

The schema model. See the [Schema reference](schema-reference.md) for every
property.

| Type | Description |
| --- | --- |
| `NodeGroup` | A group of fields (object). The root of a schema. |
| `Leaf` | A single scalar field. Union of `LeafString`, `LeafNumber`, `LeafBoolean`, `LeafEnum`. |
| `LeafList` | A list of scalar fields. |
| `NodeGroupList` | A list of groups. |
| `NodeChoice` | A discriminated selection (`cases`); in the form value the selection is `{ __case, ...fields }`. |
| `NodeType` | `Leaf \| LeafList \| NodeGroup \| NodeGroupList \| NodeChoice`. |
| `Appearance` | Presentation options for a `nodeGroup` (`flatten`, `noBorder`). |
| `CASE_KEY` | The form-value key (`'__case'`) that records a choice's active case. |

### Inferred (advanced)

| Type | Description |
| --- | --- |
| `DFormGroup<G>` | The `FormGroup` type inferred for a `nodeGroup` `G`. |
| `DFormControl<N>` | The control type inferred for a node `N`. |
| `LeafRuntimeType<T>` | Maps a leaf `type` string to its runtime value type. |
