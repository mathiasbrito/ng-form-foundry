import { EffectiveModel } from './model';

/**
 * A request to resolve a YANG module set into an {@link EffectiveModel}.
 *
 * `source` locates the raw `.yang` files (a directory, or an in-memory map of
 * module name → text). `yangLibrary` pins exactly which modules, revisions,
 * features, and deviations are in effect (RFC 8525 ietf-yang-library), so the
 * resolved model matches the target datastore. `datastore` selects whether
 * `config false` state nodes are included.
 */
export interface CompileRequest {
  entryModule: string;
  source: YangSource;
  yangLibrary?: unknown;
  datastore?: 'config' | 'operational';
}

export type YangSource =
  | { kind: 'dir'; path: string }
  | { kind: 'inline'; modules: Record<string, string> };

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * The pluggable YANG engine — the only part of the adapter that touches YANG
 * semantics or the environment.
 *
 * Implementations resolve a module set into an {@link EffectiveModel} and
 * validate RFC 7951 instance data against it. The recommended implementation
 * shells out to pyang/yangson (`SubprocessEngine`); tests use `FakeEngine`.
 * Keeping this an interface is what lets the adapter stay framework- and
 * tooling-agnostic.
 */
export interface YangEngine {
  resolve(req: CompileRequest): Promise<EffectiveModel>;
  validate(data: unknown, model: EffectiveModel): Promise<ValidationResult>;
}
