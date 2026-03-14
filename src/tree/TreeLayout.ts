import type { Tree } from './BinaryTree';

const H_GAP = 60;
const V_GAP = 80;
const PADDING = 60;      // horizontal (left/right) margin
const PADDING_TOP = 90;  // vertical top margin — must fit section title + caption + gap
const FOREST_GAP = 60;   // horizontal gap between subtrees within the same section
const SECTION_GAP = 120; // wider gap between Q1 and Q2 sections

export interface Position {
  x: number;
  y: number;
}

export interface Layout {
  positions: Map<string, Position>;
  totalWidth: number;
  totalHeight: number;
}

interface Extent {
  minX: number;
  maxX: number;
}

export function computeLayout(tree: Tree): Layout {
  const { rootIds } = tree;
  if (rootIds.length === 0) {
    return { positions: new Map(), totalWidth: 0, totalHeight: 0 };
  }

  const xMap = new Map<string, number>();
  const depthMap = new Map<string, number>();

  function assignDepths(nodeId: string | undefined, depth: number): void {
    if (!nodeId) return;
    const node = tree.nodes.get(nodeId);
    if (!node) return;
    depthMap.set(nodeId, depth);
    assignDepths(node.leftId, depth + 1);
    assignDepths(node.rightId, depth + 1);
  }

  // Place subtree centered at x=0; return its bounding extent relative to that origin.
  // Children are offset by ±o where o ≥ H_GAP and no two nodes at the same depth
  // are closer than H_GAP apart — giving equal-angle edges throughout.
  function placeSubtree(nodeId: string): Extent {
    const node = tree.nodes.get(nodeId)!;
    xMap.set(nodeId, 0);

    const isLeaf = !node.leftId && !node.rightId;
    if (isLeaf) return { minX: 0, maxX: 0 };

    const leftExtent: Extent = node.leftId ? placeSubtree(node.leftId) : { minX: 0, maxX: 0 };
    const rightExtent: Extent = node.rightId ? placeSubtree(node.rightId) : { minX: 0, maxX: 0 };

    const o = Math.max(H_GAP, (leftExtent.maxX - rightExtent.minX + H_GAP) / 2);

    if (node.leftId) shiftSubtree(node.leftId, -o);
    if (node.rightId) shiftSubtree(node.rightId, +o);

    return {
      minX: node.leftId ? -o + leftExtent.minX : 0,
      maxX: node.rightId ? +o + rightExtent.maxX : 0,
    };
  }

  function shiftSubtree(nodeId: string, dx: number): void {
    xMap.set(nodeId, (xMap.get(nodeId) ?? 0) + dx);
    const node = tree.nodes.get(nodeId)!;
    if (node.leftId) shiftSubtree(node.leftId, dx);
    if (node.rightId) shiftSubtree(node.rightId, dx);
  }

  // Lay out each subtree independently, then arrange them side by side.
  for (const rootId of rootIds) assignDepths(rootId, 0);
  const extents = rootIds.map(id => placeSubtree(id));

  let cursor = PADDING;
  for (let i = 0; i < rootIds.length; i++) {
    const { minX, maxX } = extents[i];
    shiftSubtree(rootIds[i], cursor - minX);
    const gap = (tree.sectionBoundary != null && i === tree.sectionBoundary - 1)
      ? SECTION_GAP
      : FOREST_GAP;
    cursor += maxX - minX + gap;
  }
  // After the last subtree the loop always appended FOREST_GAP; subtract it back.
  const totalWidth = cursor - FOREST_GAP + PADDING;

  const positions = new Map<string, Position>();
  let maxDepth = 0;
  for (const [id, x] of xMap) {
    const depth = depthMap.get(id) ?? 0;
    positions.set(id, { x, y: PADDING_TOP + depth * V_GAP });
    if (depth > maxDepth) maxDepth = depth;
  }

  return {
    positions,
    totalWidth,
    totalHeight: PADDING_TOP + PADDING + maxDepth * V_GAP,
  };
}
