# ng-form-foundry

**Build fully-typed Angular Reactive Forms and Angular Material UI from a single
declarative, recursive form-description schema.**

You describe a form as data — a tree of `nodeGroup`, `leaf`, `leafList`,
`nodeGroupList`, `choice`, and `map` nodes, each carrying its own validation.
`ng-form-foundry` turns that description into a **typed `FormGroup`** and a
**rendered Material form**, so a schema and its form never drift apart.

```ts
import { defineSchema, buildFormFromSchema } from 'ng-form-foundry';

const schema = defineSchema({
  kind: 'nodeGroup',
  name: 'profile',
  children: {
    firstName: { kind: 'leaf', type: 'string', name: 'firstName', required: true },
    age:       { kind: 'leaf', type: 'number', name: 'age' },
    subscribe: { kind: 'leaf', type: 'boolean', name: 'subscribe' },
  },
});

const form = buildFormFromSchema(schema);
// form: FormGroup<{
//   firstName: FormControl<string>;
//   age: FormControl<number>;
//   subscribe: FormControl<boolean>;
// }>
```

```html
<nff-dynamic-recursive-form [schema]="schema" [formGroup]="form" [editable]="true" />
```

## Why

- **One source of truth.** The same schema drives the control structure, the
  validators, the value shape, and the rendered UI.
- **Real types, inferred.** `buildFormFromSchema` returns a `FormGroup` whose keys
  and control value types come straight from your schema literal — no hand-written
  `FormGroup<...>` generics. See [Typed schemas](typing.md).
- **Validation in the schema.** Per-field constraints (`pattern`, `min`/`max`,
  `minLength`, `multipleOf`, `required`, …) become Angular validators and inline
  `mat-error` messages — no separate validation layer. See [Features](features.md).
- **Every JSON-shape covered.** Nested objects and lists, optional and nullable
  fields, discriminated selections (`choice`), and open dictionaries (`map`).
- **Angular-native.** Standalone components, Angular 20, signal inputs, reactive
  forms — drop it into an existing app.

## The two packages

| Package | Runs in | Purpose |
| --- | --- | --- |
| **`ng-form-foundry`** | the browser (Angular) | The schema model, the typed builder, and the Material renderers. This is what you render forms with. |
| **`ng-form-foundry-transformers`** | Node (backend) | Turn a **YAML/JSON config** or a **YANG model** into a schema, and revert the edited value back to the source format. Optional — see [Transformers](transformers.md). |

## Where to next

- New here? Start with [Installation](installation.md) then the
  [Quickstart](quickstart.md).
- Want the mental model? Read [Concepts](concepts.md).
- Building a form? [Features](features.md) shows how to operate each capability —
  validation, optional/nullable fields, choices, maps, and constants.
- Looking up a property? The [Schema reference](schema-reference.md) documents
  every node and field, and whether it shapes **data** or **presentation**.
- Driving forms from config or YANG? See [Transformers](transformers.md).
- Learning by example? [Examples](examples.md) has complete, copy-pasteable forms.

```{toctree}
:hidden:
:maxdepth: 2

installation
quickstart
concepts
features
schema-reference
transformers
examples
typing
api
```
