# Schema reference

Every node in a schema is one of six `kind`s. This page documents each one and
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
| `readOnly` | `boolean` | {sub}`ui` | Render the field read-only even when the form is editable. With `default`, expresses a JSON Schema `const`: `{ default: v, readOnly: true }`. (Single-element `enum` is the alternative for a constant.) |
| `label` | `string` | {sub}`ui` | Field label. Falls back to `name` when omitted. |
| `enum` | `(string \| number)[]` | {sub}`data` | **Required when `type: 'enum'`.** The allowed values; also enforced by a validator. |
| `enumLabel` | `string[]` | {sub}`ui` | Display labels for the enum options, positionally aligned with `enum`. |
| `pattern` | `string` | {sub}`data` | **`type: 'string'` only.** Reject values not matching this regex. Uses JSON Schema semantics — an *unanchored* `RegExp.test`, so anchor with `^…$` for a whole-value match. |
| `minLength` / `maxLength` | `number` | {sub}`data` | **`type: 'string'` only.** Inclusive bounds on string length. |
| `format` | `'email' \| 'uri' \| 'url'` | {sub}`data` | **`type: 'string'` only.** Adds a format validator: `email`, or a parseable absolute URI for `uri`/`url`. |
| `min` / `max` | `number` | {sub}`data` | **`type: 'number'` only.** Inclusive numeric bounds (JSON Schema `minimum`/`maximum`). |
| `multipleOf` | `number` | {sub}`data` | **`type: 'number'` only.** Require the value to be an integer multiple of this number. |
| `integer` | `boolean` | {sub}`data` | **`type: 'number'` only.** Require a whole-number value (JSON Schema `type: 'integer'`). |
| `nullable` | `boolean` | {sub}`data` | The value may be `null` (JSON Schema `type: [T, 'null']`). Builds a nullable control so `null` is a valid value that survives the round-trip. Distinct from `presence` (an *absent key*). |
| `presence` | `boolean` | {sub}`data` | Optional scalar whose presence is itself data (mirrors `nodeGroup.presence`). Rendered with an on/off toggle; omitted from `form.value` when absent, re-added when toggled on. While enabled the control is `required` (materialized means the key serializes — an empty value would emit `null`); a `nullable` presence leaf is exempt, since explicit `null` is one of its values. |

```{admonition} Constraint validators and error messages
:class: note
The constraint properties above wire into Angular `Validators` (with custom
validators for `pattern`, `multipleOf`, and the `uri` format). Their error keys
(`pattern`, `minlength`, `maxlength`, `email`, `uri`, `min`, `max`, `multipleOf`)
are surfaced as a `mat-error` under each `string`/`number` field by the built-in
`leaf-renderer`. They are the direct target of a JSON Schema → schema mapping
(`pattern`/`minLength`/`maxLength`/`format`, `minimum`/`maximum`/`multipleOf`).
```

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
| `presence` | `boolean` | {sub}`data` | Makes the group optional: rendered with an on/off toggle and absent from the form value until enabled. Its control is removed when off and rebuilt when on. |
| `minPresent` / `maxPresent` | `number` | {sub}`data` | Bounds on how many keys are present in the group's value (JSON Schema `minProperties`/`maxProperties` on a closed object). Meaningful when children are presence-optional: the group errors `minPresent` (`{ required, actual }`) / `maxPresent` (`{ allowed, actual }`) while out of range — the tree editor marks the node and explains the fix. |
| `appearance` | `Appearance` | {sub}`ui` | Layout options (see below). |

### `Appearance`

Shared layout options, honoured by `nodeGroup`, `choice`, and `map`.

| Property | Type | Concern | Description |
| --- | --- | --- | --- |
| `flatten` | `boolean` | {sub}`ui` | Render the group's fields inline, without a surrounding card. |
| `noBorder` | `boolean` | {sub}`ui` | Render the group card without its border. |
| `collapsed` | `boolean` | {sub}`ui` | Start the node's section panel collapsed; the user can expand it. Ignored when `flatten` is set. |

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

## `choice` — a discriminated selection

The user picks one `case`; only that case's fields are present. Rendered as a
case selector plus the selected case's fields.

```ts
{
  kind: 'choice',
  name: 'transport',
  cases: {
    tcp: {
      port: { kind: 'leaf', type: 'number', name: 'port' },
      tls:  { kind: 'leaf', type: 'boolean', name: 'tls' },
    },
    udp: {
      port: { kind: 'leaf', type: 'number', name: 'port' },
    },
  },
}
```

| Property | Type | Concern | Description |
| --- | --- | --- | --- |
| `kind` | `'choice'` | {sub}`data` | Node discriminant. Required. |
| `name` | `string` | {sub}`data` | Identity; must equal the `children` key. Required. |
| `cases` | `Record<string, ChoiceCase>` | {sub}`data` | Each case name → that case's body: a field record, **or a single node** (a leaf-bodied case). Required. |
| `caseLabels` | `Record<string, string>` | {sub}`ui` | Display label per case name — for anonymous/auto-named cases. Falls back to the case name. |
| `default` | `string` | {sub}`data` | Case selected when none is chosen and none can be inferred. |
| `mandatory` | `boolean` | {sub}`data` | A case must be selected: the group carries a `caseRequired` error while `__case` is null. |
| `presence` | `boolean` | {sub}`data` | Optional choice: on/off toggle, omitted from the value when absent. While enabled it carries the same `caseRequired` error until a case is picked (`{}` satisfies no case). A plain optional choice reports no error. |
| `label` | `string` | {sub}`ui` | Selector label. Falls back to `name`. |
| `appearance` | `Appearance` | {sub}`ui` | Layout options (see [`Appearance`](#appearance)). |

In the form value a choice is `{ __case: <caseName>, ...that case's fields }`.
The name `__case` is **reserved**: it cannot be used as a case field name (the
builder throws) or as a map entry key (the entry helpers reject it).

### Anonymous cases, `__case` inference, and leaf-bodied cases

Case names are arbitrary keys, so `anyOf`/`oneOf` branches with no name can be
**auto-named** (`case0`, `case1`, …) and given friendly `caseLabels` for the
selector. Colliding `caseLabels` are made unique in the selector
(`caseDisplayLabels`): each colliding case gains its distinguishing fields —
two branches labeled "UE ID" render as "UE ID (Group ID)" and
"UE ID (Slice ID)" — and cases the field suffix cannot separate fall back to
their case name. A **leaf-bodied case** — a branch that is a bare scalar rather than an
object — may be written as a single node; it is normalized to a one-field record
keyed by the node's `name`. (An `anyOf: [{type:'string'}, {type:'null'}]` branch
is usually better modeled as a single `nullable` leaf.)

The wire form of a choice is *inline* (the active case's fields sit at the
choice's location, with no `__case` key). When a form is built from such data,
the builder **infers** the active case by ranking the cases that share at least
one field with the data: fewest data keys the case cannot hold, then fewest
non-`presence` fields absent from the data (fields the form would have to
materialize empty — this separates branches that differ only in their required
set, like `{ueId, qosId}` vs `{qosId}`), then most matched fields, then
declaration order. This is how a branch discriminated **by which properties are
present/required** round-trips without a discriminator key. To produce that
wire form from an edited form, use
[`serializeForm(schema, form)`](api.md#serialization), which strips every
`__case` from `getRawValue()`.

```{admonition} Recipe — `anyOf`/`oneOf` by required-set or `const`
:class: tip
- **Required-set discrimination** (e.g. O-RAN A1 `QoSTarget.scope`, five branches
  each requiring a different id): map each branch to a case whose fields are that
  branch's properties. Distinct required fields let the builder infer the active
  case from the data — no discriminator needed.
- **`const` discriminator** (a shared field pinned to a literal per branch): map
  the discriminator to an `enum` leaf present in every case, and set each case's
  `default`/value accordingly; the selected literal identifies the branch.
```

## `map` — an open, arbitrary-keyed record

A dictionary whose **keys are runtime data**, not declared in the schema, and
whose values all conform to one shared `value` schema. This is the counterpart to
`nodeGroup` (a *fixed* key set) and maps JSON Schema
`additionalProperties: <schema>` / `patternProperties`. The user adds, removes,
and renames entries.

```ts
{
  kind: 'map',
  name: 'labels',
  keyLabel: 'Name',
  value: { kind: 'leaf', type: 'string', name: 'value' },
}
```

| Property | Type | Concern | Description |
| --- | --- | --- | --- |
| `kind` | `'map'` | {sub}`data` | Node discriminant. Required. |
| `name` | `string` | {sub}`data` | Identity; must equal the `children` key. Required. |
| `value` | `NodeType` | {sub}`data` | The schema every entry's value conforms to (a leaf, a group, …). Required. |
| `keyPattern` | `string` | {sub}`data` | `patternProperties`: entry keys must match this regex. Enforced as a group validator; a violating key makes the map (and the form) invalid. |
| `minEntries` / `maxEntries` | `number` | {sub}`data` | Bounds on entry count (JSON Schema `minProperties`/`maxProperties`); gate the add/remove controls **and** validate the group. |
| `presence` | `boolean` | {sub}`data` | Optional map: on/off toggle, omitted from the value when absent. |
| `keyLabel` | `string` | {sub}`ui` | Label for the key column. Defaults to "Key". |
| `label` | `string` | {sub}`ui` | Section label. |

The map's control is a `FormGroup` whose **control names are the entry keys**, so
`getRawValue()` is the map object directly (`{ key: value, … }`) — the same
"`getRawValue()` is your data" contract as every other node. Editing a key is a
*rename* committed on blur.

```{admonition} `map` vs `nodeGroup`
:class: note
Use `nodeGroup` whenever the keys are known at schema-authoring time (the common
case). Reach for `map` **only** when the keys are open/arbitrary. The two compose:
a `nodeGroup` may contain a `map` child, and a map's `value` may be a `nodeGroup`.
```

## Current limitations

The library is at an early version. A few properties are declared on the
model but not yet fully wired:

- A **map `value` of kind `leafList`** is not supported by either renderer. In
  `nff-dynamic-recursive-form` a map value of kind `leaf` or `nodeGroup` is
  rendered; the `nff-config-editor` tree additionally expands `nodeGroup`-,
  `choice`-, `map`-, and `nodeGroupList`-valued entries as child nodes.
- A **generated map entry key** (`key1`, `key2`, …) is committed even when it
  violates a strict `keyPattern` — it is a placeholder meant to be renamed. The
  map's validator flags it until the rename, so the form reports invalid rather
  than shipping the placeholder silently.
- **`minItems` / `maxItems`** currently gate the remove control on
  `nodeGroupList`, but are not yet enforced as `FormArray` validators, and are not
  yet applied to `leafList`. Treat them as UI hints for now, and validate
  cardinality yourself if it must be enforced.
- **`description`** and **`subType`** exist on the types but are not rendered.
  Avoid relying on them.

These are tracked for a future release; the [source repository](https://github.com/mathiasbrito/ng-form-foundry)
is the place to follow progress.
