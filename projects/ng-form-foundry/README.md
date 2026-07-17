# ng-form-foundry

Build fully-typed Angular Reactive Forms and Angular Material UI from a single
declarative, recursive **form-description schema**. You write the schema; the
library gives you a typed `FormGroup` and a rendered form.

```ts
const schema = defineSchema({
  kind: 'nodeGroup',
  name: 'profile',
  children: {
    firstName: { kind: 'leaf', type: 'string', name: 'firstName', required: true },
    age:       { kind: 'leaf', type: 'number', name: 'age' },
    subscribe: { kind: 'leaf', type: 'boolean', name: 'subscribe' },
  },
});

form = buildFormFromSchema(schema);
// form: FormGroup<{ firstName: FormControl<string>; age: FormControl<number>; subscribe: FormControl<boolean> }>
```

```html
<nff-dynamic-recursive-form [schema]="schema" [formGroup]="form" [editable]="true" />
```

## Features

- **One schema → typed form + UI.** `NodeGroup` / `Leaf` / `LeafList` /
  `NodeGroupList` / `NodeChoice` / `NodeMap` describe nested objects, primitive
  lists, repeatable groups, discriminated selections, and open dictionaries.
- **Type inference.** The returned `FormGroup`'s keys and control value types are
  inferred from the schema literal — no manual `FormGroup<...>` typing.
- **Validation in the schema.** Per-field constraints (`pattern`, `min`/`max`,
  `minLength`, `multipleOf`, `integer`, `required`, …) become Angular validators
  and inline `mat-error` messages.
- **Angular Material renderers** for string, number, boolean, and enum fields,
  add/remove lists, collapsible groups, optional **presence** fields with a
  toggle, **choice/case** selection, and add/remove/rename **map** entries.
- **Two layouts:** an all-in-one recursive form (`nff-dynamic-recursive-form`),
  or a tree/detail **config editor** (`nff-config-editor`) — structure on the
  left, a node's fields on the right.
- **Standalone components**, Angular 20, signal inputs, reactive forms throughout.

## Installation

```bash
npm install ng-form-foundry
```

### Peer dependencies

`ng-form-foundry` renders with Angular Material, so your app must have:

| Package | Version |
| --- | --- |
| `@angular/core`, `@angular/common`, `@angular/forms` | `^20.1.0` |
| `@angular/material`, `@angular/cdk` | `^20.2.0` |
| `rxjs` | `^7.8.0` |

```bash
npm install @angular/material @angular/cdk
```

### Application setup

Load a Material theme and the Material Icons font. Animations are optional in
Angular Material 20.

```scss
// styles.scss
@use '@angular/material' as mat;
html { @include mat.theme((color: mat.$violet-palette, typography: Roboto, density: 0)); }
```

```html
<!-- index.html <head> -->
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
```

See the [documentation](https://ng-form-foundry.readthedocs.io) for optional
animation setup.

## Reading the value

`buildFormFromSchema` returns a standard reactive `FormGroup`:

```ts
this.form.value;         // current value (omits disabled controls)
this.form.getRawValue(); // full value, typed to the schema
this.form.valid;         // validity from the schema's constraint validators
```

## Documentation

Full guide, schema reference, and worked examples:
**https://ng-form-foundry.readthedocs.io**

## License

Apache-2.0 © Mathias Santos de Brito
