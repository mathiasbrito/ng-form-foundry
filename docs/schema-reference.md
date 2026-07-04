# Schema reference

Every node in a schema is one of four `kind`s. This page documents each one and
all of its properties.

Each property is tagged with its **concern**:

- {sub}`data` — shapes the control structure, the value, or its validation.
- {sub}`ui` — shapes only the rendered presentation.

```{tip}
A property tagged {sub}`data` changes what `form.getRawValue()` returns or whether
the form is valid. A property tagged {sub}`ui` never changes the value — only how
it looks.
```

## `leaf` — a single field

A scalar field. Builds a `FormControl`.

```ts
{ kind: 'leaf', type: 'string', name: 'firstName', label: 'First name', required: true }
```

| Property | Type | Concern | Description |
| --- | --- | --- | --- |
| `kind` | `'leaf'` | {sub}`data` | Node discriminant. Required. |
| `name` | `string` | {sub}`data` | Field identity. **Must equal this node's key in the parent `children` map.** Required. |
| `type` | `'string' \| 'number' \| 'boolean' \| 'enum'` | {sub}`data` | The value type (see table below). Required. |
| `required` | `true` | {sub}`data` | Adds `Validators.required`. Omit for optional fields. |
| `default` | matches `type` | {sub}`data` | Initial value when no value is supplied to `buildFormFromSchema`. |
| `label` | `string` | {sub}`ui` | Field label. Falls back to `name` when omitted. |
| `enum` | `(string \| number)[]` | {sub}`data` | **Required when `type: 'enum'`.** The allowed values; also enforced by a validator. |
| `enumLabel` | `string[]` | {sub}`ui` | Display labels for the enum options, positionally aligned with `enum`. |

`type` maps to a control value type:

| `type` | Control value | Rendered as |
| --- | --- | --- |
| `'string'` | `FormControl<string>` | text input |
| `'number'` | `FormControl<number>` | number input |
| `'boolean'` | `FormControl<boolean>` | checkbox |
| `'enum'` | `FormControl<string \| number>` | select |

```{admonition} enumLabel alignment
:class: warning
`enumLabel` is a parallel array — `enumLabel[i]` labels `enum[i]`. Keep the two
arrays the same length and order. If you reorder `enum`, reorder `enumLabel` to
match.
```

## `leafList` — a list of scalars

A repeatable scalar field. Builds a `FormArray<FormControl>`.

```ts
{ kind: 'leafList', type: 'string', name: 'tags', label: 'Tags' }
```

| Property | Type | Concern | Description |
| --- | --- | --- | --- |
| `kind` | `'leafList'` | {sub}`data` | Node discriminant. Required. |
| `name` | `string` | {sub}`data` | Identity; must equal the `children` key. Required. |
| `type` | `'string' \| 'number' \| 'boolean' \| 'enum'` | {sub}`data` | Element value type. Required. |
| `default` | array of the element type | {sub}`data` | Initial items when no value is supplied. |
| `minItems` | `number` | {sub}`data` | Minimum item count. |
| `maxItems` | `number` | {sub}`data` | Maximum item count. |
| `label` | `string` | {sub}`ui` | List label. Falls back to `name`. |

## `nodeGroup` — a nested object

A group of fields. Builds a nested `FormGroup`. The root of every schema is a
`nodeGroup`.

```ts
{
  kind: 'nodeGroup',
  name: 'address',
  label: 'Address',
  children: {
    street: { kind: 'leaf', type: 'string', name: 'street' },
    city:   { kind: 'leaf', type: 'string', name: 'city' },
  },
}
```

| Property | Type | Concern | Description |
| --- | --- | --- | --- |
| `kind` | `'nodeGroup'` | {sub}`data` | Node discriminant. Required. |
| `name` | `string` | {sub}`data` | Identity; must equal the `children` key (except at the root). Required. |
| `children` | `Record<string, NodeType>` | {sub}`data` | The child nodes, keyed by field name. Required. |
| `label` | `string` | {sub}`ui` | Group heading (card or panel title). Falls back to `name`. |
| `root` | `boolean` | {sub}`ui` | Renders the group as the top-level accordion layout instead of a card. Set on the schema root. |
| `appearance` | `Appearance` | {sub}`ui` | Layout options (see below). |

### `Appearance`

| Property | Type | Concern | Description |
| --- | --- | --- | --- |
| `flatten` | `boolean` | {sub}`ui` | Render the group's fields inline, without a surrounding card. |
| `noBorder` | `boolean` | {sub}`ui` | Render the group card without its border. |

## `nodeGroupList` — a list of objects

A repeatable group. Builds a `FormArray<FormGroup>`. Each item is an instance of
the `type` group.

```ts
{
  kind: 'nodeGroupList',
  name: 'contacts',
  label: 'Contacts',
  minItems: 1,
  type: {
    kind: 'nodeGroup',
    name: 'contact',
    children: {
      email:   { kind: 'leaf', type: 'string', name: 'email' },
      primary: { kind: 'leaf', type: 'boolean', name: 'primary' },
    },
  },
}
```

| Property | Type | Concern | Description |
| --- | --- | --- | --- |
| `kind` | `'nodeGroupList'` | {sub}`data` | Node discriminant. Required. |
| `name` | `string` | {sub}`data` | Identity; must equal the `children` key. Required. |
| `type` | `NodeGroup` | {sub}`data` | The group schema each item conforms to. Required. |
| `minItems` | `number` | {sub}`data` | Minimum item count; the last item cannot be removed below this. |
| `maxItems` | `number` | {sub}`data` | Maximum item count. |
| `label` | `string` | {sub}`ui` | List label. Falls back to `name`. |

## Current limitations

The library is at an early version (`0.1.x`). A few properties are declared on the
model but not yet fully wired:

- **`minItems` / `maxItems`** currently gate the remove control on
  `nodeGroupList`, but are not yet enforced as `FormArray` validators, and are not
  yet applied to `leafList`. Treat them as UI hints for now, and validate
  cardinality yourself if it must be enforced.
- **`description`** and **`subType`** exist on the types but are not rendered.
  Avoid relying on them.

These are tracked for a future release; the [source repository](https://github.com/mathiasbrito/ng-form-foundry)
is the place to follow progress.
