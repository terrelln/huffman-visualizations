export interface TreeNode {
  id: string;
  label: string;
  leftId?: string;
  rightId?: string;
}

export interface Tree {
  nodes: Map<string, TreeNode>;
  rootId: string | null;
}

export function makeTree(rootId: string | null, nodes: TreeNode[]): Tree {
  const map = new Map<string, TreeNode>();
  for (const node of nodes) {
    map.set(node.id, node);
  }
  return { nodes: map, rootId };
}
