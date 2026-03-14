import { makeTree } from '../tree/BinaryTree';
import type { Tree, TreeNode } from '../tree/BinaryTree';

export interface SymbolInput {
  symbol: string;
  freq: number;
}

export interface HuffmanSnapshot {
  tree: Tree;
  stepLabel: string;    // e.g. "Step 2 of 4"
  description: string;  // e.g. "Merge d:1 + e:1 → de:2"
  isComplete: boolean;
}

interface QueueItem {
  nodeId: string;
  freq: number;
  depth: number;       // height of the subtree rooted here
  insertOrder: number; // stable tiebreaker
}

export function buildHuffmanSnapshots(inputs: SymbolInput[]): HuffmanSnapshot[] {
  const allNodes = new Map<string, TreeNode>();
  let insertOrder = 0;

  // Sort inputs by freq ascending so the initial display is already in queue order
  const sorted = [...inputs].sort((a, b) => a.freq - b.freq || a.symbol.localeCompare(b.symbol));

  let queue: QueueItem[] = sorted.map(({ symbol, freq }) => {
    allNodes.set(symbol, { id: symbol, label: `${symbol}:${freq}` });
    return { nodeId: symbol, freq, depth: 0, insertOrder: insertOrder++ };
  });

  const totalMerges = inputs.length - 1;
  const snapshots: HuffmanSnapshot[] = [];
  let internalCounter = 0;

  snapshots.push({
    tree: forestTree(queue, allNodes),
    stepLabel: `Step 0 of ${totalMerges}`,
    description: sorted.map(i => `${i.symbol}:${i.freq}`).join(', '),
    isComplete: false,
  });

  let mergeCount = 0;

  while (queue.length > 1) {
    queue.sort((a, b) => a.freq - b.freq || a.insertOrder - b.insertOrder);

    // Shallower tree on the left, deeper tree on the right
    const [a, b] = [queue[0], queue[1]];
    const left  = a.depth <= b.depth ? a : b;
    const right = a.depth <= b.depth ? b : a;
    queue = queue.slice(2);

    const newFreq = left.freq + right.freq;
    const newId = `_${++internalCounter}`;

    allNodes.set(newId, {
      id: newId,
      label: String(newFreq),
      leftId: left.nodeId,
      rightId: right.nodeId,
    });

    const newDepth = Math.max(left.depth, right.depth) + 1;
    queue.push({ nodeId: newId, freq: newFreq, depth: newDepth, insertOrder: insertOrder++ });
    mergeCount++;

    const leftLeaves = subtreeLeaves(left.nodeId, allNodes);
    const rightLeaves = subtreeLeaves(right.nodeId, allNodes);
    const desc =
      `Merge ${leftLeaves}:${left.freq} + ${rightLeaves}:${right.freq}` +
      ` → ${leftLeaves}${rightLeaves}:${newFreq}`;

    snapshots.push({
      tree: forestTree(queue, allNodes),
      stepLabel: `Step ${mergeCount} of ${totalMerges}`,
      description: desc,
      isComplete: queue.length === 1,
    });
  }

  return snapshots;
}

function subtreeLeaves(nodeId: string, allNodes: Map<string, TreeNode>): string {
  const node = allNodes.get(nodeId)!;
  if (!node.leftId && !node.rightId) return node.id; // leaf — id is the symbol
  const l = node.leftId ? subtreeLeaves(node.leftId, allNodes) : '';
  const r = node.rightId ? subtreeLeaves(node.rightId, allNodes) : '';
  return l + r;
}

function forestTree(queue: QueueItem[], allNodes: Map<string, TreeNode>): Tree {
  const reachable = new Set<string>();

  function collect(nodeId: string): void {
    if (reachable.has(nodeId)) return;
    reachable.add(nodeId);
    const node = allNodes.get(nodeId);
    if (node?.leftId) collect(node.leftId);
    if (node?.rightId) collect(node.rightId);
  }

  for (const item of queue) collect(item.nodeId);

  const nodes: TreeNode[] = [];
  for (const id of reachable) nodes.push(allNodes.get(id)!);

  return makeTree(queue.map(item => item.nodeId), nodes);
}
