# Quickstart

This guide builds a small profile form end to end: define a schema, build a typed
form, render it, and read the value back.

Make sure you've completed [Installation](installation.md) first.

## 1. Define a schema

A schema is a plain object. The root is always a `nodeGroup`; its `children` map
holds the fields.

```{important}
Author schemas with `defineSchema(...)` (or a `satisfies NodeGroup` annotation),
**not** `const schema: NodeGroup = ...`. The annotation widens the schema type and
erases the field names and value types that `buildFormFromSchema` relies on. See
[Typed schemas](typing.md).
```

```ts
// profile.schema.ts
import { defineSchema } from 'ng-form-foundry';

export const profileSchema = defineSchema({
  kind: 'nodeGroup',
  name: 'profile',
  children: {
    firstName: { kind: 'leaf', type: 'string', name: 'firstName', label: 'First name', required: true },
    lastName:  { kind: 'leaf', type: 'string', name: 'lastName', label: 'Last name' },
    age:       { kind: 'leaf', type: 'number', name: 'age', label: 'Age' },
    role:      { kind: 'leaf', type: 'enum', name: 'role', label: 'Role', enum: ['admin', 'editor', 'viewer'], default: 'viewer' },
    subscribe: { kind: 'leaf', type: 'boolean', name: 'subscribe', label: 'Subscribe to newsletter' },
  },
});
```

```{note}
Each child's `name` must equal its key in the `children` map (`firstName`'s key is
`firstName`). The builder keys controls by the map key, and the renderers look
them up by `name`; if they differ, the control won't bind. See
[Concepts › Identity](concepts.md#identity-the-children-key).
```

## 2. Build a typed form and render it

```ts
// profile-form.component.ts
import { Component } from '@angular/core';
import { buildFormFromSchema, DynamicRecursiveFormComponent } from 'ng-form-foundry';
import { profileSchema } from './profile.schema';

@Component({
  selector: 'app-profile-form',
  imports: [DynamicRecursiveFormComponent],
  template: `
    <nff-dynamic-recursive-form
      [schema]="schema"
      [formGroup]="form"
      [editable]="true"
    />
    <button (click)="save()">Save</button>
  `,
})
export class ProfileFormComponent {
  readonly schema = profileSchema;
  readonly form = buildFormFromSchema(profileSchema);

  save() {
    console.log(this.form.getRawValue());
    // { firstName: '', lastName: null, age: null, role: 'viewer', subscribe: null }
  }
}
```

`form` is fully typed — `form.controls.role` is a `FormControl<string | number>`,
`form.controls.age` a `FormControl<number>`, and so on.

## 3. Seed initial values

Pass a value object as the second argument to `buildFormFromSchema`. Keys match
the schema's `children` keys:

```ts
readonly form = buildFormFromSchema(profileSchema, {
  firstName: 'Ada',
  age: 36,
  role: 'admin',
  subscribe: true,
});
```

## 4. Read the value

The result is a standard reactive `FormGroup`:

```ts
this.form.value;         // current value; omits disabled controls
this.form.getRawValue(); // full value object, typed to the schema
this.form.valid;         // reflects required / enum / list-cardinality validators
this.form.controls.role.setValue('editor');
```

## Next

- Add nested groups, primitive lists, and repeatable groups — see
  [Examples](examples.md).
- Understand each node type — see [Concepts](concepts.md).
