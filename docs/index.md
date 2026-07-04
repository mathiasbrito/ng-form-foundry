# ng-form-foundry

**Build fully-typed Angular Reactive Forms and Angular Material UI from a single
declarative, recursive form-description schema.**

You describe a form as data — a tree of `nodeGroup`, `leaf`, `leafList`, and
`nodeGroupList` nodes. `ng-form-foundry` turns that description into a **typed
`FormGroup`** and a **rendered Material form**, so a schema and its form never
drift apart.

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
- **Nested and repeatable.** Groups nest arbitrarily; primitive lists and
  repeatable groups add and remove items at runtime.
- **Angular-native.** Standalone components, Angular 20, reactive forms — drop it
  into an existing app.

## Where to next

- New here? Start with [Installation](installation.md) then the
  [Quickstart](quickstart.md).
- Want the mental model? Read [Concepts](concepts.md).
- Looking up a property? The [Schema reference](schema-reference.md) documents
  every node and field, and whether it shapes **data** or **presentation**.
- Learning by example? [Examples](examples.md) has complete, copy-pasteable forms.

```{toctree}
:hidden:
:maxdepth: 2

installation
quickstart
concepts
schema-reference
examples
typing
api
```
