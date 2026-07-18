# ng-form-foundry

Build fully-typed Angular Reactive Forms and Angular Material UI from a single
declarative, recursive **form-description schema**.

- **Library:** [`projects/ng-form-foundry`](projects/ng-form-foundry) — the
  publishable Angular package.
- **Transformers:** [`packages/ng-form-foundry-transformers`](packages/ng-form-foundry-transformers) —
  a standalone Node + TypeScript catalog of source-format transformers that turn
  a model or config (YANG, plus YAML and JSON config files) into an ng-form-foundry
  schema and revert the edited value back to the source format.
- **Demo:** [`projects/demo`](projects/demo) — example forms consuming the library.
- **Documentation:** <https://ng-form-foundry.readthedocs.io> (source in
  [`docs/`](docs)).
- **AI agents:** [`AGENTS.md`](AGENTS.md) — a condensed guide to the schema
  model, the library and transformer entry points, and this repo's conventions.

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
| Build/test the transformers | `cd packages/ng-form-foundry-transformers && npm ci && npm test` |
| Build the docs | `pip install -r docs/requirements.txt && sphinx-build -b html docs docs/_build/html` |

Continuous integration (build, test, pack, and docs build) runs on every push and
pull request — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml). On pushes
to `main` that same workflow triggers a Read the Docs rebuild of the `latest` version.

## Releasing

Both packages are published to npm by
[`.github/workflows/release.yml`](.github/workflows/release.yml) when a version tag
is pushed. Each package publishes at the version in its own `package.json`; a version
already on npm is skipped, so re-running a tag is safe.

1. Bump the version in `projects/ng-form-foundry/package.json` and/or
   `packages/ng-form-foundry-transformers/package.json`.
2. Commit, then tag and push (both packages release together at the tag version;
   a package version already on npm is skipped):
   ```bash
   git tag v0.3.2
   git push origin v0.3.2
   ```

Required repository secrets (**Settings → Secrets and variables → Actions**):

| Secret | Used by | Purpose |
| --- | --- | --- |
| `NPM_TOKEN` | `release.yml` | npm **Automation** access token with publish rights for both packages. |
| `READTHEDOCS_TOKEN` | `ci.yml` | Read the Docs API token used to trigger a docs rebuild on pushes to `main`. |

npm [provenance](https://docs.npmjs.com/generating-provenance-statements) is enabled,
which requires a public repository; drop `--provenance` from `release.yml` if the
repository is private. If you connect Read the Docs' native GitHub webhook instead,
`READTHEDOCS_TOKEN` is optional and the trigger step no-ops when it is unset.

## License

[Apache-2.0](LICENSE) © Mathias Santos de Brito
