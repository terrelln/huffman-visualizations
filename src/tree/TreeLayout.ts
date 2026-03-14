import type { Tree } from './BinaryTree';

const H_GAP = 80;
const V_GAP = 70;
const PADDING = 60;

export interface Position {
  x: number;
  y: number;
}

export interface Layout {
  positions: Map<string, Position>;
  totalWidth: number;
  totalHeight: number;
}

export function computeLayout(tree: Tree): Layout {
  const columnMap = new Map<string, number>();
  const depthMap = new Map<string, number>();
  let columnCounter = 0;

  function assignColumns(nodeId: string | undefined): void {
    if (!nodeId) return;
    const node = tree.nodes.get(nodeId);
    if (!node) return;
    assignColumns(node.leftId);
    columnMap.set(nodeId, columnCounter++);
    assignColumns(node.rightId);
  }

  function assignDepths(nodeId: string | undefined, depth: number): void {
    if (!nodeId) return;
    const node = tree.nodes.get(nodeId);
    if (!node) return;
    depthMap.set(nodeId, depth);
    assignDepths(node.leftId, depth + 1);
    assignDepths(node.rightId, depth + 1);
  }

  if (tree.rootId) {
    assignColumns(tree.rootId);
    assignDepths(tree.rootId, 0);
  }

  const positions = new Map<string, Position>();
  let maxCol = 0;
  let maxDepth = 0;

  for (const [id, col] of columnMap) {
    const depth = depthMap.get(id) ?? 0;
    positions.set(id, {
      x: PADDING + col * H_GAP,
      y: PADDING + depth * V_GAP,
    });
    if (col > maxCol) maxCol = col;
    if (depth > maxDepth) maxDepth = depth;
  }

  return {
    positions,
    totalWidth: PADDING * 2 + maxCol * H_GAP,
    totalHeight: PADDING * 2 + maxDepth * V_GAP,
  };
}
