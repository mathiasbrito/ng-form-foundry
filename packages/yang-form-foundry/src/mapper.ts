import { EffectiveModel, EffNode } from './model';
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
      const leaf: Leaf = { kind: 'leaf', name: node.name, type: toFormLeafType(node.type) };
      if (node.mandatory) leaf.required = true;
      if (node.default !== undefined) leaf.default = node.default;
      if (node.type.enums) leaf.enum = [...node.type.enums];
      return leaf;
    }
    case 'leaf-list': {
      const list: LeafList = { kind: 'leafList', name: node.name, type: toFormLeafType(node.type) };
      if (node.minElements !== undefined) list.minItems = node.minElements;
      if (node.maxElements !== undefined) list.maxItems = node.maxElements;
      return list;
    }
    case 'container':
      return { kind: 'nodeGroup', name: node.name, children: mapChildren(node.children) };
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
