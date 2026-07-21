/**
 * YAML transformer — turn a YAML config document into an ng-form-foundry schema
 * and write the edited value back to YAML with comments preserved. Drive the form
 * from a JSON Schema when one is supplied, otherwise infer it from the data.
 *
 * The schema builders it uses (`inferNodeGroup`, `jsonSchemaToNodeGroup`) live in
 * `core` — they are format-agnostic and shared with the JSON transformer.
 */

export { yamlTransformer } from './yaml-transformer';
export type { YamlOptions, YamlBinding } from './yaml-transformer';
export { applyValueToDocument } from './revert';
