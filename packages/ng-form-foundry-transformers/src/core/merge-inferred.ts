/**
 * Schema union for `unknownKeys: 'edit'`: overlay a user-supplied JSON
 * Schema's {@link NodeGroup} onto the schema *inferred from the document
 * itself*, so covered keys keep their typed, validated, labeled nodes while
 * every key the JSON Schema does not mention still renders — editable, typed
 * by inference (see `core/infer.ts` and the per-format inference in the
 * transformers). Counterpart of `core/schema-keys.ts`, which handles the
 * *preserve-invisibly* answer to the same question.
 */
import type { NodeGroup, NodeType } from './schema';

/**
 * Merge per key, recursively. Document order wins for placement: the
 * inferred children mirror the source document, so present keys render in
 * file order with schema-only keys (e.g. presence-able additions) appended
 * after, in schema order. Where both sides describe a key, the schema wins —
 * except that groups and group-lists merge structurally, so a partially
 * covered subtree keeps its uncovered fields at any depth. Group metadata
 * (name, label, presence, bounds) comes from the schema side.
 */
export function mergeInferred(schema: NodeGroup, inferred: NodeGroup): NodeGroup {
  const children: Record<string, NodeType> = Object.create(null);
  for (const [name, inferredChild] of Object.entries(inferred.children)) {
    const schemaChild = schema.children[name];
    children[name] = schemaChild ? mergeNode(schemaChild, inferredChild) : inferredChild;
  }
  for (const [name, schemaChild] of Object.entries(schema.children)) {
    if (!(name in children)) children[name] = schemaChild;
  }
  return { ...schema, children };
}

/**
 * One key described by both sides: groups and group-lists merge recursively;
 * everything else — leaves, choices, maps, and shape disagreements — takes
 * the schema node, which is authoritative wherever it speaks. One inferred
 * fact does carry over: a leaf's `radix` display hint, which only the
 * document knows (JSON Schema has no radix vocabulary).
 */
function mergeNode(schema: NodeType, inferred: NodeType): NodeType {
  if (schema.kind === 'nodeGroup' && inferred.kind === 'nodeGroup') {
    return mergeInferred(schema, inferred);
  }
  if (schema.kind === 'nodeGroupList' && inferred.kind === 'nodeGroupList') {
    return { ...schema, type: mergeInferred(schema.type, inferred.type) };
  }
  if (
    (schema.kind === 'leaf' || schema.kind === 'leafList') &&
    schema.kind === inferred.kind &&
    inferred.radix &&
    !schema.radix
  ) {
    return { ...schema, radix: inferred.radix };
  }
  return schema;
}
