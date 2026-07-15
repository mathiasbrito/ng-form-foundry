/**
 * YANG transformer — turn a YANG model into an ng-form-foundry schema and revert
 * the edited form value back to RFC 7951 instance data.
 *
 * {@link createYangTransformer} is the catalog-conformant entry point;
 * {@link YangFormAdapter} is the fuller stateful orchestrator (caching,
 * engine-side validation, RFC 7951 → form-value conversion).
 */

export { createYangTransformer } from './yang-transformer';

export { YangFormAdapter, YangValidationError } from './adapter';
export type { CompileOptions } from './adapter';

export type { YangEngine, CompileRequest, YangSource, ValidationResult } from './engine';
export { SubprocessEngine } from './engines/subprocess-engine';
export type { SubprocessEngineOptions } from './engines/subprocess-engine';
export { FakeEngine } from './engines/fake-engine';

export { InMemoryCache } from './cache';
export type { ArtifactCache } from './cache';

export { mapToSchema } from './mapper';
export { toFormValue, toYangData } from './revert';

export type {
  EffectiveModel,
  CompiledModel,
  EffNode,
  EffLeaf,
  EffLeafList,
  EffContainer,
  EffList,
  YangType,
  YangBase,
  ModuleInfo,
} from './model';
