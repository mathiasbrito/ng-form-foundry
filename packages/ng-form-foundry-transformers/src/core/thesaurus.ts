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
 * the tree. When the same identifier means different things at different
 * depths, a key maps to a list of variants scoped by
 * {@link ThesaurusEntry.under} (an ancestor-name suffix); the longest
 * matching scope wins, and an unscoped variant is the fallback.
 */
import type { ChoiceCase, NodeGroup, NodeType, Thesaurus, ThesaurusEntry } from './schema';

/** A thesaurus variant with its scope normalized for matching. */
interface Variant {
  under: string[];
  entry: ThesaurusEntry;
  /** Position in the author's list — the tie-break among equal-length scopes. */
  order: number;
}

/**
 * Return a copy of `schema` with thesaurus metadata filled in. Existing
 * `label`/`description`/`caseLabels` values are respected, never overwritten —
 * the thesaurus fills gaps, it does not restyle authored schemas.
 *
 * Coverage: every node reachable from the root (group children, list item
 * fields, map value templates, choice case fields). Scoping follows the
 * **data hierarchy of names**: fields inside list items scope under the list
 * name (indices are transparent), map value fields under the map name
 * (runtime keys are transparent), and choice case fields match both with and
 * without their case-name segment — `under: ['scope']` covers every case of
 * the `scope` choice, `under: ['scope', 'byUe']` targets one case (scoping by
 * an auto-generated `case0`-style name works but is positional and brittle).
 *
 * A choice case with no label is titled from its discriminating field — the
 * first `required` field (else the first field) whose thesaurus match carries
 * a `label` (description-only entries do not title cases).
 * Sibling cases may end up with the same label when their required sets
 * coincide; the library's `caseDisplayLabels` disambiguates colliding labels
 * in the selectors by each case's distinguishing fields, using the field
 * labels injected here.
 */
export function applyThesaurus<G extends NodeGroup>(schema: G, thesaurus: Thesaurus): G {
  const lookup = new Map<string, Variant[]>();
  for (const [key, value] of Object.entries(thesaurus)) {
    const variants = (Array.isArray(value) ? value : [value]).map((entry, order) => ({
      under: (entry.under ?? []).map((segment) => segment.toLowerCase()),
      entry,
      order,
    }));
    lookup.set(key.toLowerCase(), variants);
  }
  const out = structuredClone(schema);
  decorate(out, out.name, [[]], lookup);
  return out;
}

/**
 * The best-scoped entry for `name` given the node's applicable ancestor
 * chains: the variant with the longest `under` that is a suffix of any chain
 * (an entry without `under` always applies); equal lengths keep author order.
 */
function resolve(name: string, chains: string[][], lookup: Map<string, Variant[]>): ThesaurusEntry | undefined {
  const variants = lookup.get(name.toLowerCase());
  if (!variants) return undefined;
  let best: Variant | undefined;
  for (const v of variants) {
    if (!chains.some((chain) => isSuffix(v.under, chain))) continue;
    if (!best || v.under.length > best.under.length) best = v;
  }
  return best?.entry;
}

function isSuffix(under: string[], chain: string[]): boolean {
  if (under.length > chain.length) return false;
  const tail = chain.slice(chain.length - under.length);
  return under.every((segment, i) => segment === tail[i]);
}

/**
 * `transparentKey` marks a structural hop that contributes no ancestor
 * segment: a map's `value` template is not a name in the data — entry fields
 * scope under the map's own name.
 */
function decorate(
  node: NodeType,
  key: string,
  chains: string[][],
  lookup: Map<string, Variant[]>,
  transparentKey = false,
): void {
  const entry = resolve(key, chains, lookup) ?? (key === node.name ? undefined : resolve(node.name, chains, lookup));
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

  // Children's ancestor chains gain this node's key. List items and map
  // entries add no segment of their own — indices and runtime keys are not
  // names — so their fields scope under the list/map name directly.
  const childChains = transparentKey ? chains : chains.map((chain) => [...chain, key.toLowerCase()]);

  switch (node.kind) {
    case 'nodeGroup':
      for (const [childKey, child] of Object.entries(node.children)) decorate(child, childKey, childChains, lookup);
      return;
    case 'nodeGroupList':
      for (const [childKey, child] of Object.entries(node.type.children)) decorate(child, childKey, childChains, lookup);
      return;
    case 'map':
      decorate(node.value, node.value.name, childChains, lookup, true);
      return;
    case 'choice': {
      for (const [caseName, body] of Object.entries(node.cases)) {
        // Case fields match with and without the case segment: the wire
        // encoding is inline (case-transparent), while the extra chain lets a
        // scope target one case of the choice.
        const caseChains = [...childChains, ...childChains.map((c) => [...c, caseName.toLowerCase()])];
        const fields = caseFieldRecord(body);
        for (const [fieldKey, field] of Object.entries(fields)) decorate(field, fieldKey, caseChains, lookup);
        if (node.caseLabels?.[caseName] !== undefined) continue;
        // The discriminant must carry a LABEL — a description-only entry on an
        // earlier field must not block a labeled sibling from titling the case.
        const keys = Object.keys(fields);
        const labelOf = (k: string) => resolve(k, caseChains, lookup)?.label;
        const discriminant =
          keys.find((k) => (fields[k] as { required?: boolean }).required && labelOf(k) !== undefined) ??
          keys.find((k) => labelOf(k) !== undefined);
        const label = discriminant ? labelOf(discriminant) : undefined;
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
