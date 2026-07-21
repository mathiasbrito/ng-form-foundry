# Releasing

Both packages are published to npm by
[`.github/workflows/release.yml`](.github/workflows/release.yml) when a version
tag is pushed. Each package publishes at the version in its own `package.json`;
a version already on npm is skipped, so re-running a tag is safe.

1. Bump the version in `projects/ng-form-foundry/package.json` and/or
   `packages/ng-form-foundry-transformers/package.json` (and the workspace
   `package.json`, `docs/conf.py` `release`, and the tag example below).
2. Update [CHANGELOG.md](CHANGELOG.md).
3. Commit, then tag and push (both packages release together at the tag
   version):

   ```bash
   git tag v0.5.4
   git push origin v0.5.4
   ```

Continuous integration (build, test, pack, docs build) runs on every push and
pull request — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml). On
pushes to `main` the workflow also triggers a Read the Docs rebuild of the
`latest` version.

## Required repository secrets

**Settings → Secrets and variables → Actions**:

| Secret | Used by | Purpose |
| --- | --- | --- |
| `NPM_TOKEN` | `release.yml` | npm **Automation** access token with publish rights for both packages. |
| `READTHEDOCS_TOKEN` | `ci.yml` | Read the Docs API token used to trigger a docs rebuild on pushes to `main`. |

npm [provenance](https://docs.npmjs.com/generating-provenance-statements) is
enabled, which requires a public repository; drop `--provenance` from
`release.yml` if the repository is private. If you connect Read the Docs'
native GitHub webhook instead, `READTHEDOCS_TOKEN` is optional and the trigger
step no-ops when it is unset.
