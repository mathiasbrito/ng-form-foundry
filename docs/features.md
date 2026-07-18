# Features

How to operate each capability of the schema model: what to put in the schema,
how it renders and behaves, and how the value round-trips. Every property is
catalogued in the [Schema reference](schema-reference.md); this page is the
task-oriented tour.

All snippets assume a schema authored with `defineSchema(...)` (see
[Typed schemas](typing.md)) and rendered with:

```html
<nff-dynamic-recursive-form [schema]="schema" [formGroup]="form" [editable]="true" />
```

## Validation and inline errors

Put constraints on a leaf and they become Angular validators; the renderer shows a
`mat-error` under the field when it is invalid and touched. There is no separate
validation layer.

```ts
children: {
  // string constraints
  hostname: {
    kind: 'leaf', type: 'string', name: 'hostname', required: true,
    pattern: '^[a-z0-9-]+$',   // JSON Schema semantics: unanchored RegExp.test
    minLength: 1, maxLength: 63,
  },
  email: { kind: 'leaf', type: 'string', name: 'email', format: 'email' },
  // number constraints
  port:  { kind: 'leaf', type: 'number', name: 'port', min: 1, max: 65535, integer: true },
  ratio: { kind: 'leaf', type: 'number', name: 'ratio', multipleOf: 0.25 },
}
```

| Leaf type | Constraints |
| --- | --- |
| `string` | `pattern`, `minLength`, `maxLength`, `format` (`'email'` \| `'uri'` \| `'url'`) |
| `number` | `min`, `max`, `multipleOf`, `integer` |
| any | `required` |

```{admonition} `pattern` is unanchored
:class: note
`pattern` follows JSON Schema semantics — a `RegExp.test`, which matches
*anywhere* in the value. Anchor it with `^…$` for a whole-value match. (This
differs from Angular's built-in `Validators.pattern`, which anchors for you.)
```

Validity is read through the standard reactive-forms API:

```ts
form.controls.port.errors;   // e.g. { max: { max: 65535, actual: 70000 } }
form.valid;                  // false while any control is invalid
```

## Optional, nullable, and present fields

Three distinct notions, because JSON distinguishes them:

- **Optional** — the field may be *invalid/empty* but the key is always in the
  value. This is the default: omit `required`.
- **Nullable** (`nullable: true`) — `null` is a *valid value*. The control is built
  nullable, so `null` survives `getRawValue()` and the constraint validators accept
  it. Maps JSON Schema `type: [T, 'null']`.
- **Presence** (`presence: true`) — the key itself is data: an *absent key* vs. a
  present one. An absent presence leaf renders as an "Add *field*" button sitting
  in the field flow; clicking it builds the control and focuses the field, which
  carries a remove button that drops the key again. When absent, the control is
  removed from the group so it drops from the value entirely. Presence groups,
  maps, and choices render with an on/off toggle on their section panel.

```ts
children: {
  note:    { kind: 'leaf', type: 'string', name: 'note', nullable: true },  // may be null
  contact: { kind: 'leaf', type: 'string', name: 'contact', presence: true }, // key may be absent
}
```

```ts
buildFormFromSchema(schema).getRawValue();
// { note: null }               ← nullable key present with a null value
// (no `contact` key)           ← presence leaf absent until toggled on
```

An **enabled** presence leaf is `required` (unless `nullable`): materialized
means the key serializes, and an empty value would go on the wire as `null`.
Disable the field to omit it instead.

`presence` works on a `nodeGroup` too (an optional sub-object), and on a `map` (an
optional dictionary). `form.value` also drops absent presence controls; use
`getRawValue()` for the full nullable-inclusive object.

## Constants and read-only fields

`readOnly: true` renders a field read-only even when the form is editable; combine
it with `default` to express a JSON Schema `const`:

```ts
apiVersion: { kind: 'leaf', type: 'string', name: 'apiVersion', default: 'v1', readOnly: true },
```

A single-element `enum` (`enum: ['v1']`) is the alternative — it renders a
one-option dropdown enforced by the enum validator.

## Discriminated choices

A `choice` models a mutually-exclusive selection (JSON Schema `anyOf`/`oneOf`): the
user picks one *case* and only that case's fields are present. In the value it is
`{ __case: <caseName>, ...that case's fields }`, serialized inline.

```ts
scope: {
  kind: 'choice', name: 'scope',
  caseLabels: { byUe: 'By UE', byCell: 'By cell' },   // friendly names for the selector
  cases: {
    byUe:   { ueId:   { kind: 'leaf', type: 'string', name: 'ueId', required: true } },
    byCell: { cellId: { kind: 'leaf', type: 'string', name: 'cellId', required: true } },
  },
},
```

Three things make choices practical for real schemas:

- **Anonymous / auto-named cases.** Case names are arbitrary keys, so `anyOf`
  branches with no name can be auto-named and given `caseLabels` for display.
- **`__case` inference.** Wire data carries no `__case` (the case's fields sit
  inline). When you seed a form from such data, the builder **infers** the active
  case — it prefers the case that can hold every data key without leaving any of
  its own non-optional fields empty (see the
  [ranking](schema-reference.md#anonymous-cases-__case-inference-and-leaf-bodied-cases)).
  So a branch discriminated *by which properties are present or required*
  round-trips without a discriminator key:

  ```ts
  buildFormFromSchema(schema, { scope: { cellId: 'c-1' } });
  // active case inferred as `byCell`
  ```

  The reverse direction is `serializeForm(schema, form)`: `getRawValue()` with
  every `__case` stripped, restoring the inline wire encoding — see
  [Serialization](api.md#serialization).

- **Leaf-bodied cases.** A branch that is a bare scalar can be written as a single
  node instead of a field record; it is normalized to a one-field record keyed by
  the node's `name`. (An `anyOf: [{string}, {null}]` is usually better modeled as a
  single `nullable` leaf.)

See the [Schema reference](schema-reference.md#choice--a-discriminated-selection)
for the required-set / `const`-discriminator recipe.

## Open maps (dictionaries)

A `map` is an object whose **keys are runtime data**, all sharing one `value`
schema — JSON Schema `additionalProperties` / `patternProperties`. Reach for it
only when the keys are open; a fixed key set is a `nodeGroup`.

```ts
labels: {
  kind: 'map', name: 'labels', keyLabel: 'Name',
  value: { kind: 'leaf', type: 'string', name: 'value' },   // every entry is a string
  keyPattern: '^[a-z][a-z0-9_-]*$',   // optional: constrain the keys
  minEntries: 0, maxEntries: 32,
},
```

The user adds, removes, and renames entries. Its control is a `FormGroup` whose
**control names are the entry keys**, so `getRawValue()` is the map object directly:

```ts
buildFormFromSchema(schema, { labels: { env: 'prod', tier: 'db' } })
  .getRawValue().labels;   // { env: 'prod', tier: 'db' }
```

A map `value` may itself be a `nodeGroup` (a dictionary of structured objects). A
`nodeGroup` may contain a `map` child — the two compose.

## Lists

Two repeatable kinds, both `FormArray`s:

- **`leafList`** — a list of scalars (add/remove primitive inputs).
- **`nodeGroupList`** — a list of objects (add/remove cards).

```ts
tags:  { kind: 'leafList', type: 'string', name: 'tags', default: ['a', 'b'] },
lines: {
  kind: 'nodeGroupList', name: 'lines', minItems: 1, maxItems: 20,
  type: { kind: 'nodeGroup', name: 'line', children: { qty: { kind: 'leaf', type: 'number', name: 'qty' } } },
},
```

`minItems`/`maxItems` gate the add/remove controls. Lists size themselves to the
data you seed: an array of three produces three items.

## The editing UX

`[editable]` starts the form read-only (`false`) or editable (`true`). It is a
two-way `model()`, so a consumer may bind `[(editable)]`, and each group renders a
**pencil toggle** that flips its own edit state. When editable, lists show colored
add/remove pills and maps show a key input with add/remove; when read-only, fields
render in the `outline` appearance and the toggles are disabled.

```html
<!-- one-way: start editable -->
<nff-dynamic-recursive-form [schema]="schema" [formGroup]="form" [editable]="true" />

<!-- two-way: bind the edit state -->
<nff-dynamic-recursive-form [schema]="schema" [formGroup]="form" [(editable)]="editing" />
```

For large configs, the [`<nff-config-editor>`](api.md#nff-config-editor) renders
the structure as a navigable tree beside a detail pane that shows the **selected
node's whole subtree flattened into sections** — each child's fields under a
breadcrumb heading that marks the boundary and links back up, with no nested
panels. The tree scopes the view, and structural edits made in either pane stay
in sync. It supports the full node model — groups, lists, maps, and choices —
plus a "+ Optional field" menu for absent presence children (each added one
carries a delete button that returns it to the menu). It draws no container of
its own, only a divider between the panes, so the embedding page owns the
chrome.
