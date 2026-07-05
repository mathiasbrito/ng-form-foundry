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

## Data vs. presentation

A schema node carries two kinds of information:

- **Data** — what shapes the value and its validation: `kind`, `type`, `required`,
  `enum`, `default`, `minItems`, `maxItems`, and the tree structure itself.
- **Presentation** — what shapes the rendered UI: `label`, `enumLabel`, and the
  `appearance` options (`flatten`, `noBorder`) and `root` layout flag.

The [Schema reference](schema-reference.md) tags every property with which concern
it belongs to, so you can tell at a glance whether a field affects the submitted
value or only the display.

## Validation

The builder attaches validators from the schema:

- `required: true` on a leaf → `Validators.required`.
- `enum` on an enum leaf → a membership validator (values outside the `enum` array
  are invalid).

Validity surfaces through the standard `form.valid` / `control.errors` API. See
[Examples › Validation](examples.md#validation-and-required-fields).
