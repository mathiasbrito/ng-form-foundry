import { EffectiveModel, EffLeaf, EffNode } from './model';
import { Leaf, LeafList, NodeGroup, NodeGroupList, NodeType } from './schema';
import { toFormLeafType } from './rfc7951';

/**
 * Derive the frontend `NodeGroup` schema from a resolved {@link EffectiveModel}.
 *
 * The v0.1 subset: container → nodeGroup, list → nodeGroupList, leaf → leaf,
 * leaf-list → leafList, with the common built-in types. Presentation-only and
 * wire-encoding concerns stay in the binding (the effective model); this output
 * is the pure render contract handed to the Angular app.
 *
 * Counterpart of the revert in `revert.ts`, which walks the same effective model.
 */
export function mapToSchema(model: EffectiveModel): NodeGroup {
  return {
    kind: 'nodeGroup',
    name: '__root__',
    root: true,
    children: mapChildren(model.roots),
  };
}

function mapChildren(nodes: EffNode[]): Record<string, NodeType> {
  const children: Record<string, NodeType> = {};
  for (const node of nodes) {
    children[node.name] = mapNode(node);
  }
  return children;
}

function mapNode(node: EffNode): NodeType {
  switch (node.kind) {
    case 'leaf': {
      // `bits` has no scalar form control; render it as a group of checkboxes,
      // one boolean per flag. The revert collapses the group back to the wire
      // string.
      if (node.type.base === 'bits' && node.type.bits) {
        return bitsGroup(node, node.type.bits);
      }
      const leaf: Leaf = { kind: 'leaf', name: node.name, type: toFormLeafType(node.type) };
      if (node.mandatory) leaf.required = true;
      if (node.default !== undefined) leaf.default = node.default;
      const options = node.type.enums ?? node.type.identities?.map((i) => i.name);
      if (options) leaf.enum = [...options];
      return leaf;
    }
    case 'leaf-list': {
      const list: LeafList = { kind: 'leafList', name: node.name, type: toFormLeafType(node.type) };
      if (node.minElements !== undefined) list.minItems = node.minElements;
      if (node.maxElements !== undefined) list.maxItems = node.maxElements;
      return list;
    }
    case 'container': {
      const group: NodeGroup = { kind: 'nodeGroup', name: node.name, children: mapChildren(node.children) };
      if (node.presence) group.presence = true;
      return group;
    }
    case 'list': {
      const groupList: NodeGroupList = {
        kind: 'nodeGroupList',
        name: node.name,
        type: { kind: 'nodeGroup', name: node.name, children: mapChildren(node.children) },
      };
      if (node.minElements !== undefined) groupList.minItems = node.minElements;
      if (node.maxElements !== undefined) groupList.maxItems = node.maxElements;
      return groupList;
    }
  }
}

function bitsGroup(node: EffLeaf, bits: string[]): NodeGroup {
  const children: Record<string, NodeType> = {};
  for (const bit of bits) {
    children[bit] = { kind: 'leaf', name: bit, type: 'boolean' };
  }
  return { kind: 'nodeGroup', name: node.name, children };
}
