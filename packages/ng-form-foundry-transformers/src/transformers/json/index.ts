/**
 * JSON transformer — turn a JSON config document into an ng-form-foundry schema
 * and write the edited value back to JSON. Drive the form from a JSON Schema when
 * one is supplied, otherwise infer it from the data. Reuses the format-agnostic
 * schema builders in `core`.
 */

export { jsonTransformer } from './json-transformer';
export type { JsonOptions, JsonFormat } from './json-transformer';
// Thrown by schema-driven toSchema; re-exported so subpath consumers can
// catch it by instance.
export { SchemaShapeError } from '../../core/shape-check';
