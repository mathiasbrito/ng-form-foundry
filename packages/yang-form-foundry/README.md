# yang-form-foundry

Turn a **YANG** model into an [ng-form-foundry](https://ng-form-foundry.readthedocs.io)
schema your Angular app can render, then revert the edited form value back to
**RFC 7951** instance data for write-back to a NETCONF/RESTCONF datastore.

Framework-agnostic **Node + TypeScript** — no framework imports. NestJS is the
likely host, but the library assumes only Node; wire it into Express, a worker,
or a CLI just as easily.

```ts
import { YangFormAdapter, SubprocessEngine } from 'yang-form-foundry';

const adapter = new YangFormAdapter(new SubprocessEngine());

// resolve a device model once (cached by modelId)
await adapter.compile({
  modelId: 'acme-router@2026-01-01',
  entryModule: 'ietf-interfaces',
  source: { kind: 'dir', path: './yang' },
});

// forward: hand the Angular app a NodeGroup it renders with buildFormFromSchema
const schema = await adapter.getFormSchema('acme-router@2026-01-01');

// load the device's current config into a plain form value
const value = await adapter.toFormValue(deviceGetResponse, 'acme-router@2026-01-01');

// reverse: the edited form value → RFC 7951 JSON, ready for a RESTCONF PUT
const rfc7951 = await adapter.toYangData(editedValue, 'acme-router@2026-01-01');
```

## What it does

- **Forward** — maps a resolved YANG tree to an ng-form-foundry `NodeGroup`
  (`container` → nodeGroup, `list` → nodeGroupList, `leaf`/`leaf-list` → leaf/leafList).
- **Reverse** — reconstructs RFC 7951 JSON from a plain form value, restoring
  module-namespaced member names, list keys, and — critically —
  `int64`/`uint64`/`decimal64` as **strings** so precision survives. `config false`
  state is shown for context but dropped from write-back.
- **Binding stays server-side** — the frontend only ever sees the `NodeGroup`
  schema and returns a plain value; the resolved YANG model (the "binding") never
  leaves the adapter.

## Architecture

The only part that touches YANG semantics or the environment is the injected
`YangEngine`:

- **`SubprocessEngine`** (recommended) shells out to the bundled Python helper,
  which wraps **pyang** (and yangson, later) to resolve `uses`/`augment`/`typedef`
  and emit a normalized effective tree. Requires Python + `pip install pyang` on
  the host.
- **`FakeEngine`** serves pre-resolved models — used in tests and local dev, no
  Python required.

Caching is pluggable too (`ArtifactCache`; an `InMemoryCache` ships by default).

## Using it from NestJS

The core is a plain class, so a NestJS provider is a thin wrapper — see
[`examples/nestjs-provider.ts`](examples/nestjs-provider.ts). A dedicated
`/nestjs` entry point is planned.

## Status

`0.1.0`, early. The **v0.1 subset** covers container / list (+keys) / leaf /
leaf-list and the common built-in types (`string`, `boolean`, `int`/`uint` 8–32,
`enumeration`), plus `int64`/`uint64`/`decimal64` as strings. Deferred to later
phases: `choice`/`case`, `leafref`, `identityref`, `union`, `bits`, `empty`,
presence containers, and `must`/`when` — see the
[adapter plan](https://ng-form-foundry.readthedocs.io).

## Develop

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node:test on the compiled output (no Python needed)
```

## License

Apache-2.0 © Mathias Santos de Brito
