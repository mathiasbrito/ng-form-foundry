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

## Components

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
| `editable` | `boolean` | `false` | Whether fields start editable. **Two-way** (`model`) — bind `[(editable)]` to track it; each group also has an edit toggle. |
| `title` | `string` | — | Overrides the header title of the rendered group. |

The inputs are Angular signal inputs, so template binding is unchanged
(`[schema]="…"`); reading them off a component instance is a signal call
(`cmp.schema()`).

```{note}
Always pass a `formGroup` built from the same `schema` with `buildFormFromSchema`.
Rendering with `[schema]` alone binds the fields to a throwaway group and the
values won't reach your form.
```

### `<nff-config-editor>`

`ConfigEditorComponent` — a tree/detail editor for large configs. The structure
(groups, lists, maps, choices) is a tree on the left; selecting a node shows that
node's fields for editing on the right. Binds to the same `FormGroup` as the
form component.

- **Lists and complex maps** get a `+` on their tree row to add an item/entry and
  a delete button on each child row. A map entry's key is renamed in its detail
  pane; a leaf-valued map is edited inline as key/value rows.
- **Choices** show the active case next to the tree label and a "Selected option"
  selector in the detail pane; switching the case swaps the fields.
- **Optional (presence) children** that are absent are offered by a
  "+ Optional field" menu row at the end of their parent's children; present ones
  carry a delete button that returns them to the menu.

The component draws **no outer container** — only a vertical divider between the
tree and the detail pane. Wrap it in your own card or border:

```html
<div class="my-editor-card">
  <nff-config-editor [schema]="schema" [formGroup]="form" />
</div>
```

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `schema` | `NodeGroup` | — | **Required.** The schema to edit. |
| `formGroup` | `FormGroup` | — | **Required.** The form from `buildFormFromSchema(schema)`. |
| `editable` | `boolean` | `true` | Whether fields accept input and structural controls (add/remove/menus) show. |

The inputs are signal inputs, like the form component's. The tree is built once
from the `schema`/`formGroup` provided at initialization.

## Types

The schema model. See the [Schema reference](schema-reference.md) for every
property.

| Type | Description |
| --- | --- |
| `NodeGroup` | A group of fields (object). The root of a schema. |
| `Leaf` | A single scalar field. Union of `LeafString`, `LeafNumber`, `LeafBoolean`, `LeafEnum`. Carries the constraint, `nullable`, `presence`, and `readOnly` fields. |
| `LeafList` | A list of scalar fields. |
| `NodeGroupList` | A list of groups. |
| `NodeChoice` | A discriminated selection (`cases`, `caseLabels`); in the form value the selection is `{ __case, ...fields }`. The active case is inferred from seed data when no `__case` is present. |
| `ChoiceCase` | One case body: a field record, or a single node (a leaf-bodied case). |
| `NodeMap` | An open, arbitrary-keyed record (`value` schema, `keyPattern`, `min`/`maxEntries`). |
| `NodeType` | `Leaf \| LeafList \| NodeGroup \| NodeGroupList \| NodeChoice \| NodeMap`. |
| `Appearance` | Presentation options for a `nodeGroup`, `choice`, or `map` (`flatten`, `noBorder`, `collapsed`). |
| `CASE_KEY` | The form-value key (`'__case'`) that records a choice's active case. |

### Inferred (advanced)

| Type | Description |
| --- | --- |
| `DFormGroup<G>` | The `FormGroup` type inferred for a `nodeGroup` `G`. |
| `DFormControl<N>` | The control type inferred for a node `N`. |
| `LeafRuntimeType<T>` | Maps a leaf `type` string to its runtime value type. |
