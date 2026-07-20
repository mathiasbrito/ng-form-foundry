/**
 * ng-form-foundry-transformers — a catalog of source-format transformers that
 * turn a model or config into an ng-form-foundry schema and revert the edited
 * form value back to the source format.
 *
 * The {@link Transformer} contract is the common seam; each format lives under
 * its own entry point and can be imported on its own (tree-shakeable):
 *
 *   - `yang` — YANG model → form → RFC 7951 data ({@link createYangTransformer},
 *              {@link YangFormAdapter}).
 *   - `yaml` — YAML config → form → YAML ({@link yamlTransformer}); JSON-Schema
 *              driven or inferred from the data, comment-preserving on revert.
 *   - `json` — JSON config → form → JSON ({@link jsonTransformer}); same builders
 *              as `yaml`, indent preserved.
 *   - `libconfig` — libconfig document (srsRAN/OAI-style `.cfg`/`.conf`) → form →
 *              libconfig ({@link libconfigTransformer}); comment- and
 *              type-preserving span splicing on revert.
 *
 * Look transformers up at runtime through {@link TransformerRegistry}, or import
 * the one you need directly.
 */

// Core: the Transformer contract, the registry, shared schema types and builders.
export * from './core';

// Transformers.
export * from './transformers/yang';
export * from './transformers/yaml';
export * from './transformers/json';
export * from './transformers/libconfig';
