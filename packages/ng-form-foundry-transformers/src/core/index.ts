/**
 * Format-agnostic core of the transformer catalog: the {@link Transformer}
 * contract every format implements, the {@link TransformerRegistry} for runtime
 * lookup, the ng-form-foundry schema types that are the shared target of all
 * transformers, and the shared schema builders (infer a form from plain data, or
 * map a JSON Schema) that any data-oriented transformer reuses.
 */

export type { Transformer, TransformResult, BindingMap } from './transformer';
export { TransformerRegistry } from './registry';

// Shared schema builders — used by the YAML and JSON transformers alike.
export { inferNodeGroup } from './infer';
export { jsonSchemaToNodeGroup } from './json-schema';
export type { JsonSchema } from './json-schema';

export type {
  NodeGroup,
  NodeType,
  Leaf,
  LeafList,
  NodeGroupList,
  Choice,
  ChoiceCase,
  NodeMap,
  LeafType,
  FormValue,
} from './schema';
export { CASE_KEY } from './schema';
