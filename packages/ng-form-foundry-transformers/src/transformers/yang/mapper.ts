import { EffectiveModel, EffLeaf, EffNode } from './model';
import { Choice, Leaf, LeafList, NodeGroup, NodeGroupList, NodeType } from '../../core/schema';
import { toFormLeafType } from './rfc7951';

/**
 * Derive the frontend `NodeGroup` schema from a resolved {@link EffectiveModel}.
 *
 * container → nodeGroup (presence containers flagged `presence`), list →
 * nodeGroupList, leaf-list → leafList, choice → a `Choice` node, and leaf → leaf
 * (with `bits` becoming a group of boolean checkboxes and identityref/enum
 * carrying their options). Wire-encoding concerns stay in the binding (the
 * effective model); this output is the pure render contract handed to the app.
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
    case 'choice': {
      const cases: Record<string, Record<string, NodeType>> = {};
      for (const c of node.cases) {
        cases[c.name] = mapChildren(c.children);
      }
      const choice: Choice = { kind: 'choice', name: node.name, cases };
      if (node.default) choice.default = node.default;
      if (node.mandatory) choice.mandatory = true;
      return choice;
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
