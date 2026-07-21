/**
 * Schema-born key resolution for partial-schema reverts.
 *
 * A transformer given a JSON Schema builds its form from the produced
 * {@link NodeGroup} — so `serializeForm` can only ever emit keys that schema
 * describes. When the edited value is written back onto the original
 * document, the value is authoritative for those **schema-born** paths only;
 * every other key was never carried by the form and must be preserved.
 * These helpers answer "which keys can the value legitimately speak for?" at
 * each document level, mirroring the wire encoding of
 * ng-form-foundry's `serializeForm`/`toWireValue`.
 */
import type { Choice, NodeGroup, NodeType } from './schema';

/**
 * The schema-born key set of one document level, as `name → child schema`
 * for recursion. `undefined` means "no schema in play": every key is
 * value-authoritative. A key absent from a defined map is not schema-born
 * and must be preserved verbatim.
 */
export type SchemaKeys = Map<string, NodeType | undefined> | undefined;

/**
 * The keys `serializeForm` can emit for a schema node standing at a document
 * object/group, with each key's schema for recursion. A nodeGroup
 * contributes its children by key — a choice child included, since the wire
 * value keeps a choice at its own key (`toWireValue` strips only the case
 * discriminator). Standing at a choice, the keys are the union of every
 * case's fields: the form only emits the active case, so the other cases'
 * keys behave like any non-emitted schema key. A map is open-keyed — every
 * key is schema-born and entries recurse with the map's value schema.
 */
export function childrenOf(node: NodeType): SchemaKeys {
  switch (node.kind) {
    case 'nodeGroup':
      return new Map(Object.entries(node.children));
    case 'choice': {
      const out = new Map<string, NodeType | undefined>();
      for (const [name, field] of caseEntries(node)) out.set(name, field);
      return out;
    }
    case 'map':
      return new OpenKeys(node.value);
    default:
      return undefined; // leaf/leafList/list shapes carry no key semantics
  }
}

/** The per-item schema when `node` describes a list of groups, else undefined. */
export function itemSchemaOf(node: NodeType | undefined): NodeGroup | undefined {
  return node?.kind === 'nodeGroupList' ? node.type : undefined;
}

/** Field name → schema across every case of a choice (leaf-bodied cases too). */
function* caseEntries(choice: Choice): Generator<[string, NodeType]> {
  for (const body of Object.values(choice.cases)) {
    if ('kind' in body) yield [(body as NodeType).name, body as NodeType];
    else for (const [name, field] of Object.entries(body as Record<string, NodeType>)) yield [name, field];
  }
}

/** A `SchemaKeys` map matching every key — a map node's open dictionary. */
class OpenKeys extends Map<string, NodeType | undefined> {
  constructor(private readonly valueSchema: NodeType) {
    super();
  }
  override has(_key: string): boolean {
    return true;
  }
  override get(_key: string): NodeType {
    return this.valueSchema;
  }
}
