# ng-form-foundry

Build fully-typed Angular Reactive Forms and Angular Material UI from a single
declarative, recursive **form-description schema**.

- **Library:** [`projects/ng-form-foundry`](projects/ng-form-foundry) — the
  publishable package.
- **Demo:** [`projects/demo`](projects/demo) — example forms consuming the library.
- **Documentation:** <https://ng-form-foundry.readthedocs.io> (source in
  [`docs/`](docs)).

```ts
const schema = defineSchema({
  kind: 'nodeGroup',
  name: 'profile',
  children: {
    firstName: { kind: 'leaf', type: 'string', name: 'firstName', required: true },
    age:       { kind: 'leaf', type: 'number', name: 'age' },
  },
});

form = buildFormFromSchema(schema);
// FormGroup<{ firstName: FormControl<string>; age: FormControl<number> }>
```

See the [library README](projects/ng-form-foundry/README.md) for installation and
a quickstart.

## This is an Angular CLI workspace

| Task | Command |
| --- | --- |
| Run the demo app | `ng serve` → http://localhost:4200/ |
| Build the library | `ng build ng-form-foundry` (output in `dist/ng-form-foundry`) |
| Test the library | `ng test ng-form-foundry` |
| Build the docs | `pip install -r docs/requirements.txt && sphinx-build -b html docs docs/_build/html` |

Continuous integration (build, test, pack, and docs build) runs on every push and
pull request — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## License

[Apache-2.0](LICENSE) © Mathias Santos de Brito
