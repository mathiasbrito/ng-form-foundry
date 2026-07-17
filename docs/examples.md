# Examples

Every example is complete and copy-pasteable. They assume you've done the
[Installation](installation.md) setup (animations, theme, icon font).

## A field of every kind

Shows the core `kind`s and all leaf `type`s in one schema.
([choice](#a-discriminated-choice) and [map](#an-open-map) have their own examples
below.)

```ts
import { defineSchema } from 'ng-form-foundry';

export const kitchenSink = defineSchema({
  kind: 'nodeGroup',
  name: 'account',
  root: true,
  children: {
    // leaf — scalars
    username: { kind: 'leaf', type: 'string', name: 'username', label: 'Username', required: true },
    seats:    { kind: 'leaf', type: 'number', name: 'seats', label: 'Seats', default: 1 },
    active:   { kind: 'leaf', type: 'boolean', name: 'active', label: 'Active' },
    plan:     {
      kind: 'leaf', type: 'enum', name: 'plan', label: 'Plan',
      enum: ['free', 'pro', 'enterprise'],
      enumLabel: ['Free', 'Pro', 'Enterprise'],
      default: 'free',
    },

    // leafList — a list of scalars
    aliases: { kind: 'leafList', type: 'string', name: 'aliases', label: 'Aliases' },

    // nodeGroup — a nested object
    billing: {
      kind: 'nodeGroup', name: 'billing', label: 'Billing address',
      children: {
        line1:   { kind: 'leaf', type: 'string', name: 'line1', label: 'Address' },
        country: { kind: 'leaf', type: 'string', name: 'country', label: 'Country' },
      },
    },

    // nodeGroupList — a list of objects
    members: {
      kind: 'nodeGroupList', name: 'members', label: 'Team members', minItems: 1,
      type: {
        kind: 'nodeGroup', name: 'member',
        children: {
          email: { kind: 'leaf', type: 'string', name: 'email', label: 'Email', required: true },
          admin: { kind: 'leaf', type: 'boolean', name: 'admin', label: 'Admin' },
        },
      },
    },
  },
});
```

```ts
import { Component } from '@angular/core';
import { buildFormFromSchema, DynamicRecursiveFormComponent } from 'ng-form-foundry';
import { kitchenSink } from './kitchen-sink.schema';

@Component({
  selector: 'app-account-form',
  imports: [DynamicRecursiveFormComponent],
  template: `<nff-dynamic-recursive-form [schema]="schema" [formGroup]="form" [editable]="true" />`,
})
export class AccountFormComponent {
  readonly schema = kitchenSink;
  readonly form = buildFormFromSchema(kitchenSink);
}
```

## Seeding and reading values

Pass a value object (keyed by the schema's `children` keys) as the second argument
to `buildFormFromSchema`. Read it back with `getRawValue()`.

```ts
readonly form = buildFormFromSchema(kitchenSink, {
  username: 'ada',
  seats: 5,
  active: true,
  plan: 'pro',
  aliases: ['ada.l', 'countess'],
  billing: { line1: '1 Analytical Way', country: 'UK' },
  members: [
    { email: 'ada@example.com', admin: true },
    { email: 'charles@example.com', admin: false },
  ],
});

// later
const value = this.form.getRawValue();
// value.members[1].email === 'charles@example.com'
```

Lists are sized to the data you pass — a `members` array of two produces two
groups, an `aliases` array of two produces two inputs.

## Validation and required fields

Constraints on a leaf become validators and inline `mat-error`s. Validity surfaces
through the standard reactive-forms API.

```ts
export const signup = defineSchema({
  kind: 'nodeGroup',
  name: 'signup',
  children: {
    email:    { kind: 'leaf', type: 'string', name: 'email', label: 'Email', required: true, format: 'email' },
    username: { kind: 'leaf', type: 'string', name: 'username', label: 'Username', pattern: '^[a-z0-9_]+$', minLength: 3, maxLength: 20 },
    age:      { kind: 'leaf', type: 'number', name: 'age', label: 'Age', min: 18, max: 120, integer: true },
    role:     { kind: 'leaf', type: 'enum', name: 'role', label: 'Role', enum: ['user', 'admin'] },
  },
});

const form = buildFormFromSchema(signup);

form.valid;                          // false — email is required and empty
form.controls.email.errors;          // { required: true }

form.controls.username.setValue('ab');
form.controls.username.errors;       // { minlength: { requiredLength: 3, actualLength: 2 } }

form.controls.age.setValue(17);
form.controls.age.errors;            // { min: { min: 18, actual: 17 } }

form.controls.role.setValue('root'); // not in the enum
form.controls.role.errors;           // { enum: true }
```

## Optional and nullable fields

`nullable` lets `null` be a value; `presence` makes the key itself optional (absent
until toggled on). See [Features](features.md#optional-nullable-and-present-fields).

```ts
export const settings = defineSchema({
  kind: 'nodeGroup',
  name: 'settings',
  children: {
    displayName: { kind: 'leaf', type: 'string', name: 'displayName', label: 'Display name', nullable: true },
    webhook:     { kind: 'leaf', type: 'string', name: 'webhook', label: 'Webhook URL', format: 'uri', presence: true },
  },
});

buildFormFromSchema(settings).getRawValue();
// { displayName: null }   — nullable key present as null; `webhook` absent until toggled on
```

## A discriminated choice

The user picks one case; only that case's fields are present. Seeding from inline
data infers the active case.

```ts
export const target = defineSchema({
  kind: 'nodeGroup',
  name: 'target',
  root: true,
  children: {
    scope: {
      kind: 'choice', name: 'scope', label: 'Scope',
      caseLabels: { byUe: 'By UE', byCell: 'By cell' },
      cases: {
        byUe:   { ueId:   { kind: 'leaf', type: 'string', name: 'ueId', label: 'UE id', required: true } },
        byCell: { cellId: { kind: 'leaf', type: 'string', name: 'cellId', label: 'Cell id', required: true } },
      },
    },
  },
});

const form = buildFormFromSchema(target, { scope: { cellId: 'c-1' } });
form.controls.scope.get('__case')!.value;  // 'byCell' — inferred from the data
form.getRawValue().scope;                   // { __case: 'byCell', cellId: 'c-1' }
```

## An open map

A dictionary of arbitrary keys sharing one value schema. `getRawValue()` is the map
object directly.

```ts
export const service = defineSchema({
  kind: 'nodeGroup',
  name: 'service',
  root: true,
  children: {
    image:  { kind: 'leaf', type: 'string', name: 'image', label: 'Image' },
    labels: {
      kind: 'map', name: 'labels', label: 'Labels', keyLabel: 'Name',
      value: { kind: 'leaf', type: 'string', name: 'value', label: 'Value' },
    },
  },
});

const form = buildFormFromSchema(service, {
  image: 'nginx:1.27',
  labels: { env: 'prod', region: 'eu-west' },
});

form.getRawValue().labels;   // { env: 'prod', region: 'eu-west' }
```

## Deeply nested groups

Groups nest to any depth. Use `appearance.flatten` to render an inner group's
fields inline instead of in their own card.

```ts
export const shipment = defineSchema({
  kind: 'nodeGroup',
  name: 'shipment',
  root: true,
  children: {
    reference: { kind: 'leaf', type: 'string', name: 'reference', label: 'Reference' },
    origin: {
      kind: 'nodeGroup', name: 'origin', label: 'Origin',
      children: {
        city: { kind: 'leaf', type: 'string', name: 'city', label: 'City' },
        geo: {
          kind: 'nodeGroup', name: 'geo', label: 'Coordinates',
          appearance: { flatten: true },   // render lat/lon inline, no nested card
          children: {
            lat: { kind: 'leaf', type: 'number', name: 'lat', label: 'Latitude' },
            lon: { kind: 'leaf', type: 'number', name: 'lon', label: 'Longitude' },
          },
        },
      },
    },
  },
});
```

## A list of scalars

`leafList` renders an add/remove list of primitive inputs.

```ts
export const survey = defineSchema({
  kind: 'nodeGroup',
  name: 'survey',
  children: {
    question: { kind: 'leaf', type: 'string', name: 'question', label: 'Question' },
    options:  { kind: 'leafList', type: 'string', name: 'options', label: 'Options', default: ['Yes', 'No'] },
  },
});

const form = buildFormFromSchema(survey);
form.controls.options;             // FormArray<FormControl<string>>
form.controls.options.getRawValue(); // ['Yes', 'No']
```

## A repeatable group

`nodeGroupList` renders each item as a group you can add and remove. `minItems`
keeps at least one item.

```ts
export const invoice = defineSchema({
  kind: 'nodeGroup',
  name: 'invoice',
  root: true,
  children: {
    number: { kind: 'leaf', type: 'string', name: 'number', label: 'Invoice #' },
    lines: {
      kind: 'nodeGroupList', name: 'lines', label: 'Line items', minItems: 1,
      type: {
        kind: 'nodeGroup', name: 'line',
        children: {
          description: { kind: 'leaf', type: 'string', name: 'description', label: 'Description' },
          quantity:    { kind: 'leaf', type: 'number', name: 'quantity', label: 'Qty', default: 1 },
          unitPrice:   { kind: 'leaf', type: 'number', name: 'unitPrice', label: 'Unit price' },
        },
      },
    },
  },
});
```

```ts
const form = buildFormFromSchema(invoice, {
  number: 'INV-001',
  lines: [
    { description: 'Consulting', quantity: 10, unitPrice: 150 },
    { description: 'Travel', quantity: 1, unitPrice: 300 },
  ],
});

form.controls.lines.length;                 // 2
form.controls.lines.at(0).controls.quantity.value; // 10
```
