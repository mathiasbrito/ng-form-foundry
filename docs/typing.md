# Typed schemas

`buildFormFromSchema` returns a `FormGroup` whose keys and control value types are
**inferred from your schema literal**. This only works when the schema keeps its
exact ("literal") type. This page shows how to author schemas so inference holds —
and the one common mistake that silently throws it away.

## Inference in action

Given a schema literal, the builder infers a precise `FormGroup`:

```ts
const schema = defineSchema({
  kind: 'nodeGroup',
  name: 'profile',
  children: {
    firstName: { kind: 'leaf', type: 'string', name: 'firstName' },
    age:       { kind: 'leaf', type: 'number', name: 'age' },
  },
});

const form = buildFormFromSchema(schema);
//    ^? FormGroup<{ firstName: FormControl<string>; age: FormControl<number> }>

form.controls.age.setValue('nope'); // ❌ compile error: expected number
form.getRawValue();                 // { firstName: string; age: number }
```

## The mistake that breaks it

Annotating the schema constant with `: NodeGroup` **widens** its type. The
`children` map collapses to `Record<string, NodeType>`, which erases the field
names and each field's `type` — so the builder can no longer infer anything:

```ts
// ❌ inference lost
const schema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'profile',
  children: {
    firstName: { kind: 'leaf', type: 'string', name: 'firstName' },
    age:       { kind: 'leaf', type: 'number', name: 'age' },
  },
};

const form = buildFormFromSchema(schema);
//    ^? FormGroup<{ [key: string]: AbstractControl }>   ← names and types gone
```

The form still works at runtime — but you lose autocompletion, `setValue` type
checking, and the typed `getRawValue()`.

## Author schemas one of these ways

### `defineSchema` (recommended)

`defineSchema` is an identity function whose `const` type parameter captures the
literal type while still checking it against `NodeGroup`:

```ts
import { defineSchema } from 'ng-form-foundry';

export const schema = defineSchema({
  kind: 'nodeGroup',
  name: 'profile',
  children: {
    firstName: { kind: 'leaf', type: 'string', name: 'firstName' },
  },
});
```

You get a red squiggle if the object isn't a valid schema, and full inference
downstream.

### `satisfies NodeGroup`

Equivalent, using the `satisfies` operator instead of a helper:

```ts
import { NodeGroup } from 'ng-form-foundry';

export const schema = {
  kind: 'nodeGroup',
  name: 'profile',
  children: {
    firstName: { kind: 'leaf', type: 'string', name: 'firstName' },
  },
} satisfies NodeGroup;
```

### Inline

Passing a literal directly to `buildFormFromSchema` also infers correctly, since
the argument's literal type flows straight in:

```ts
const form = buildFormFromSchema({
  kind: 'nodeGroup',
  name: 'profile',
  children: { firstName: { kind: 'leaf', type: 'string', name: 'firstName' } },
});
```

```{admonition} Rule of thumb
:class: tip
Use `defineSchema(...)` or `... satisfies NodeGroup`. Never write
`const schema: NodeGroup = ...`.
```

## The inferred types

For reference, these type aliases (exported from the package) drive the inference:

- `DFormControl<Node>` — the control type for a single node.
- `DFormGroup<Group>` — the `FormGroup` type for a `nodeGroup`.
- `LeafRuntimeType<Type>` — maps a leaf `type` string to its runtime type.

You rarely reference them directly; `buildFormFromSchema` applies them for you.
