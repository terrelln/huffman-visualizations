export interface TreeNode {
  id: string;
  label: string;
  leftId?: string;
  rightId?: string;
}

export interface Tree {
  nodes: Map<string, TreeNode>;
  rootIds: string[]; // one entry per independent subtree (forest support)
}

export function makeTree(rootIds: string | string[] | null, nodes: TreeNode[]): Tree {
  const map = new Map<string, TreeNode>();
  for (const node of nodes) map.set(node.id, node);
  const ids =
    rootIds == null ? [] :
    Array.isArray(rootIds) ? rootIds :
    [rootIds];
  return { nodes: map, rootIds: ids };
}
