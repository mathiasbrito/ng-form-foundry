/**
 * A thesaurus: human-readable metadata for schema identifiers, injected into a
 * generated {@link NodeGroup} as `label`/`description`/`caseLabels`.
 *
 * Machine schemas (O-RAN A1 policy types, inferred configs) ship without
 * titles, so forms fall back to raw attribute names (`guRanUeId`, `mcc`).
 * A thesaurus maps those identifiers to display metadata once, and every
 * transformer entry point applies it to whatever schema it produced —
 * JSON-Schema-driven or inferred alike.
 *
 * Keys are **plain identifier names**, matched **case-insensitively** against
 * each node's record key (its property/setting name). They are never paths:
 * no separator exists, so a name containing `.`/`/` or any other character is
 * matched verbatim — one entry covers the identifier wherever it appears in
 * the tree.
 */
import type { ChoiceCase, NodeGroup, NodeType, Thesaurus, ThesaurusEntry } from './schema';

/**
 * Return a copy of `schema` with thesaurus metadata filled in. Existing
 * `label`/`description`/`caseLabels` values are respected, never overwritten —
 * the thesaurus fills gaps, it does not restyle authored schemas.
 *
 * Coverage: every node reachable from the root (group children, list item
 * fields, map value templates, choice case fields). A choice case with no
 * label is titled from its discriminating field — the first `required` field
 * (else the first field) that has a thesaurus entry. Sibling cases may end up
 * with the same label when their required sets coincide; the library's
 * `caseDisplayLabels` disambiguates colliding labels in the selectors by each
 * case's distinguishing fields, using the field labels injected here.
 */
export function applyThesaurus<G extends NodeGroup>(schema: G, thesaurus: Thesaurus): G {
  const lookup = new Map<string, ThesaurusEntry>();
  for (const [key, entry] of Object.entries(thesaurus)) lookup.set(key.toLowerCase(), entry);
  const out = structuredClone(schema);
  decorate(out, out.name, lookup);
  return out;
}

function decorate(node: NodeType, key: string, lookup: Map<string, ThesaurusEntry>): void {
  const entry = lookup.get(key.toLowerCase()) ?? lookup.get(node.name.toLowerCase());
  if (entry) {
    if (entry.label !== undefined && node.label === undefined) node.label = entry.label;
    if (
      entry.description !== undefined &&
      (node.kind === 'leaf' || node.kind === 'nodeGroup' || node.kind === 'map') &&
      node.description === undefined
    ) {
      node.description = entry.description;
    }
  }

  switch (node.kind) {
    case 'nodeGroup':
      for (const [childKey, child] of Object.entries(node.children)) decorate(child, childKey, lookup);
      return;
    case 'nodeGroupList':
      for (const [childKey, child] of Object.entries(node.type.children)) decorate(child, childKey, lookup);
      return;
    case 'map':
      decorate(node.value, node.value.name, lookup);
      return;
    case 'choice': {
      for (const [caseName, body] of Object.entries(node.cases)) {
        const fields = caseFieldRecord(body);
        for (const [fieldKey, field] of Object.entries(fields)) decorate(field, fieldKey, lookup);
        if (node.caseLabels?.[caseName] !== undefined) continue;
        const keys = Object.keys(fields);
        const discriminant =
          keys.find((k) => (fields[k] as { required?: boolean }).required && lookup.has(k.toLowerCase())) ??
          keys.find((k) => lookup.has(k.toLowerCase()));
        const label = discriminant ? lookup.get(discriminant.toLowerCase())?.label : undefined;
        if (label !== undefined) node.caseLabels = { ...(node.caseLabels ?? {}), [caseName]: label };
      }
      return;
    }
    default:
      return; // leaf / leafList: nothing beneath
  }
}

/** A case body as a field record (a leaf-bodied case is a one-field record keyed by its name). */
function caseFieldRecord(body: ChoiceCase): Record<string, NodeType> {
  return typeof (body as { kind?: unknown }).kind === 'string'
    ? { [(body as NodeType).name]: body as NodeType }
    : (body as Record<string, NodeType>);
}
