# Concepts

## The schema is a tree of nodes

A form description is a tree. Every node has a `kind` that determines what it
becomes:

| `kind` | Describes | Builds |
| --- | --- | --- |
| `leaf` | a single scalar field | `FormControl` |
| `leafList` | a list of scalars | `FormArray<FormControl>` |
| `nodeGroup` | a nested object | `FormGroup` |
| `nodeGroupList` | a list of objects | `FormArray<FormGroup>` |
| `choice` | a discriminated selection | `FormGroup` (a case selector + the chosen case's fields) |
| `map` | an open, arbitrary-keyed record | `FormGroup` (control names are the entry keys) |

The root of every schema is a `nodeGroup`. Its `children` map contains the fields;
each child is itself any of these kinds, so groups nest to any depth. A
`nodeGroup` can also be marked `presence` (see the
[schema reference](schema-reference.md)) to make it an optional, toggleable group.

```ts
{
  kind: 'nodeGroup',            // → FormGroup
  name: 'order',
  children: {
    reference: { kind: 'leaf', type: 'string', name: 'reference' },   // → FormControl<string>
    tags:      { kind: 'leafList', type: 'string', name: 'tags' },     // → FormArray<FormControl<string>>
    address:   { kind: 'nodeGroup', name: 'address', children: {...} },// → nested FormGroup
    lines:     { kind: 'nodeGroupList', name: 'lines', type: {...} },  // → FormArray<FormGroup>
  },
}
```

## From schema to a typed FormGroup

`buildFormFromSchema(schema)` walks the tree and returns a `FormGroup` whose
**shape and value types are inferred from the schema literal**. A `leaf` of
`type: 'number'` becomes a `FormControl<number>`; a `nodeGroup` becomes a nested
`FormGroup` with the same keys as its `children`.

```ts
const form = buildFormFromSchema(orderSchema);
form.controls.reference; // FormControl<string>
form.controls.tags;      // FormArray<FormControl<string>>
form.controls.address;   // FormGroup<{ ... }>
```

This inference is the library's core feature, and it only survives if the
schema's literal type is preserved. Read [Typed schemas](typing.md) for how to
author schemas so it works — and the one annotation that breaks it.

## Leaf value types

`type` on a leaf maps to a runtime type:

| `type` | Control value type |
| --- | --- |
| `'string'` | `string` |
| `'number'` | `number` |
| `'boolean'` | `boolean` |
| `'enum'` | `string \| number`, restricted to the `enum` array |

## Identity: the `children` key

Each node carries a `name`, and each `nodeGroup` also keys its children in a
`children` map. **The `name` must equal the map key.** The builder registers each
control under its map key, while the renderers resolve controls by `name` — if the
two differ, the control silently fails to bind.

```ts
// correct — key and name agree
children: {
  email: { kind: 'leaf', type: 'string', name: 'email' },
}

// wrong — control is registered as `email`, renderer looks up `mail` → no binding
children: {
  email: { kind: 'leaf', type: 'string', name: 'mail' },
}
```

Using [`defineSchema`](typing.md) does not catch this mismatch at compile time, so
keep `name` and its key identical by convention.

## The value is `getRawValue()`

The library keeps one contract: **`form.getRawValue()` is your data.** A `leaf` is
its scalar, a `nodeGroup`/`map` is an object, a `leafList`/`nodeGroupList` is an
array, a `choice` is `{ __case, ...fields }`. Seed a form with
`buildFormFromSchema(schema, initial)` and read it back with `getRawValue()` and
the shape round-trips. (`form.value` omits disabled/absent controls — see
[optional fields](features.md#optional-nullable-and-present-fields).)

The one form-only artifact in that shape is the choice discriminator: wire data
carries no `__case` (the active case is inferred from which fields are present).
To emit wire data, use `serializeForm(schema, form)` — `getRawValue()` with
every `__case` stripped; without choices in the schema the two are identical.
See [Serialization](api.md#serialization).

## Data vs. presentation

A schema node carries two kinds of information:

- **Data** — what shapes the value and its validation: `kind`, `type`, `required`,
  `enum`, `default`, the leaf constraints (`pattern`, `min`/`max`, `minLength`,
  `multipleOf`, `integer`, …), `nullable`, `presence`, `minItems`/`maxItems`, and
  the tree structure itself.
- **Presentation** — what shapes the rendered UI: `label`, `enumLabel`,
  `caseLabels`, `keyLabel`, `readOnly`, the `appearance` options (`flatten`,
  `noBorder`), and the `root` layout flag.

The [Schema reference](schema-reference.md) tags every property with which concern
it belongs to, so you can tell at a glance whether a field affects the submitted
value or only the display.

## Validation lives in the schema

The builder turns schema constraints into Angular validators, and the renderer
shows an inline `mat-error` for each:

- `required: true` → `Validators.required`.
- On a `string` leaf: `pattern`, `minLength`, `maxLength`, `format` (`email`/`uri`).
- On a `number` leaf: `min`, `max`, `multipleOf`, `integer`.
- `enum` → a membership validator.

Validity surfaces through the standard `form.valid` / `control.errors` API. There
is no separate validation layer to keep in sync. See
[Features › Validation](features.md#validation-and-inline-errors).

## Beyond fixed objects

Two node kinds model shapes a fixed `nodeGroup` can't:

- **`choice`** — a discriminated selection (JSON Schema `anyOf`/`oneOf`): the user
  picks one case and only that case's fields are present.
- **`map`** — an open, arbitrary-keyed record (JSON Schema `additionalProperties`):
  the user adds, removes, and renames keyed entries that share one value schema.

Both are covered in [Features](features.md); `map` is a *sibling* of `nodeGroup`
(open keys), not a replacement (fixed keys).

## Driving forms from config or models

You can author schemas by hand, or generate them from an existing source with the
companion **[`ng-form-foundry-transformers`](transformers.md)** package — a YAML or
JSON config file, or a YANG model — and revert the edited value back to that source
format.
