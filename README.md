# ng-form-foundry

Build fully-typed Angular Reactive Forms and a complete Angular Material UI
from a single declarative **schema** — and, with the companion transformers,
turn real configuration files (YAML, JSON, libconfig, YANG models) into
editable forms that write back **without destroying comments, formatting, or
types**.

**📚 Documentation: <https://ng-form-foundry.readthedocs.io>**

```bash
npm install ng-form-foundry              # the Angular library
npm install ng-form-foundry-transformers # optional: config-file & model transformers
```

## Why ng-form-foundry

You describe *what* the data looks like — nested groups, lists, optional
fields, either/or selections, dictionaries — and the library derives both the
typed `FormGroup` and the rendered Material UI from that one description. No
hand-written form templates, no manual `FormGroup<...>` typing, no separate
validation wiring.

```ts
import { defineSchema, buildFormFromSchema } from 'ng-form-foundry';

const schema = defineSchema({
  kind: 'nodeGroup',
  name: 'profile',
  children: {
    firstName: { kind: 'leaf', type: 'string', name: 'firstName', required: true },
    age:       { kind: 'leaf', type: 'number', name: 'age', min: 0, integer: true },
    plan:      { kind: 'leaf', type: 'enum',   name: 'plan', enum: ['free', 'pro'] },
  },
});

form = buildFormFromSchema(schema);
// FormGroup<{ firstName: FormControl<string>; age: FormControl<number>; plan: … }>
```

```html
<nff-dynamic-recursive-form [schema]="schema" [formGroup]="form" [editable]="true" />
```

The schema's constraints (`required`, `pattern`, `min`/`max`, `minLength`,
`multipleOf`, …) become Angular validators with inline `mat-error` messages —
`form.valid` and `form.getRawValue()` are all you read.

## Highlights

- **The full shape vocabulary.** Nested objects, primitive lists, repeatable
  groups, discriminated **choice/case** selections, open **map** dictionaries,
  and optional **presence** fields whose very absence is data — each with its
  Material renderer: add/remove lists, collapsible sections, case selectors,
  rename-able map entries.
- **Two ready-made views.** The all-in-one recursive form
  (`nff-dynamic-recursive-form`), or a tree + detail **config editor**
  (`nff-config-editor`) with the document structure on the left and the
  selected node's fields on the right — built for large configuration files.
- **Declarative layout that cascades.** One `appearance` on the root lays
  fields on a CSS grid, packs equal-width fields per row, gathers checkboxes
  into a compact strip, and bounds field widths — inherited by nested groups,
  list items, map entries, and choice cases, overridable per node:

  ```ts
  appearance: { grid: { cols: 2 }, booleanFields: 'end' }
  ```

- **Edit real config files, not JSON blobs.** The transformers package parses
  a source document into a schema + initial value, and writes the edited value
  back by patching the original text:

  ```ts
  import { yamlTransformer } from 'ng-form-foundry-transformers';

  const { schema, binding, initialValue } = yamlTransformer.toSchema(yamlText);
  // …render the form, let the user edit…
  const updated = yamlTransformer.toSource(form.getRawValue(), binding);
  // comments, key order, and formatting of everything untouched: preserved
  ```

  - **YAML / JSON** — comment- and format-preserving edits, JSON-Schema-driven
    or inferred forms, exact big-integer round-trips.
  - **libconfig** — the `.cfg`/`.conf` format of srsRAN, OAI, and other
    C/C++ software. Statically typed emission (a float slot stays a float, a
    hex literal re-emits as hex at its original width, `L` suffixes survive),
    byte-exact round-trips of untouched documents, comments intact.
  - **YANG** — schema from a YANG model, write-back as RFC 7951 instance data
    for NETCONF/RESTCONF datastores.
  - **Thesaurus** — inject human-readable labels and descriptions into any
    generated schema from a plain identifier → text catalog.

- **Fully typed, modern Angular.** Standalone components, signal inputs,
  Angular 20 + Material 20; the `FormGroup` type is inferred from your schema
  literal.

## Documentation

The full guide lives at **<https://ng-form-foundry.readthedocs.io>**:
[quickstart](https://ng-form-foundry.readthedocs.io/en/latest/quickstart.html) ·
[features](https://ng-form-foundry.readthedocs.io/en/latest/features.html) ·
[schema reference](https://ng-form-foundry.readthedocs.io/en/latest/schema-reference.html) ·
[transformers](https://ng-form-foundry.readthedocs.io/en/latest/transformers.html) ·
[examples](https://ng-form-foundry.readthedocs.io/en/latest/examples.html)

Installation details (peer dependencies, Material theme setup) are in each
package's README: [`ng-form-foundry`](projects/ng-form-foundry/README.md) ·
[`ng-form-foundry-transformers`](packages/ng-form-foundry-transformers/README.md).
Release history: [CHANGELOG.md](CHANGELOG.md).

## Repository

This is an Angular CLI workspace: the library in
[`projects/ng-form-foundry`](projects/ng-form-foundry), the transformers in
[`packages/ng-form-foundry-transformers`](packages/ng-form-foundry-transformers),
a demo app in [`projects/demo`](projects/demo) (`ng serve`), and the
documentation source in [`docs/`](docs). CI builds, tests, and packs both
packages on every push.

## License

[Apache-2.0](LICENSE) © Mathias Santos de Brito
