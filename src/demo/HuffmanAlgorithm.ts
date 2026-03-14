import { makeTree } from '../tree/BinaryTree';
import type { Tree, TreeNode } from '../tree/BinaryTree';

export interface SymbolInput {
  symbol: string;
  freq: number;
}

export interface HuffmanSnapshot {
  tree: Tree;
  stepLabel: string;       // e.g. "Step 2 of 5"
  description: string;     // e.g. "Merge d:1 + e:1 → de:2"
  isComplete: boolean;
  mergingIds?: [string, string]; // IDs of the two nodes merged to produce this step
}

interface QueueItem {
  nodeId: string;
  freq: number;
}

// Double-queue Huffman algorithm:
//   Q1 holds the initial leaf nodes sorted by frequency (consumed front-to-back).
//   Q2 holds merged trees in creation order (always appended, consumed front-to-back).
// Each step dequeues the two items with the lowest frequency from the fronts of Q1/Q2,
// merges them, and enqueues the result onto Q2. Because merges produce non-decreasing
// frequencies, Q2 stays sorted, so a simple two-pointer minimum suffices.
export function buildHuffmanSnapshots(inputs: SymbolInput[]): HuffmanSnapshot[] {
  const allNodes = new Map<string, TreeNode>();

  for (const { symbol, freq } of inputs) {
    allNodes.set(symbol, { id: symbol, label: `${symbol}:${freq}` });
  }

  const sorted = [...inputs].sort((a, b) => a.freq - b.freq || a.symbol.localeCompare(b.symbol));

  let q1: QueueItem[] = sorted.map(({ symbol, freq }) => ({ nodeId: symbol, freq }));
  let q2: QueueItem[] = [];

  const totalMerges = inputs.length - 1;
  const totalSteps = totalMerges + 1; // +1 for the sort step
  const snapshots: HuffmanSnapshot[] = [];
  let internalCounter = 0;

  // Step 0: symbols in the order the user entered them
  snapshots.push({
    tree: makeTree(inputs.map(i => i.symbol), [...allNodes.values()]),
    stepLabel: `Step 0 of ${totalSteps}`,
    description: inputs.map(i => `${i.symbol}:${i.freq}`).join(', '),
    isComplete: false,
  });

  // Step 1: symbols sorted by frequency (nodes slide to their sorted positions)
  snapshots.push({
    tree: forestTree([...q1], allNodes),
    stepLabel: `Step 1 of ${totalSteps}`,
    description: `Sort by frequency: ${sorted.map(i => `${i.symbol}:${i.freq}`).join(', ')}`,
    isComplete: false,
    // No mergingIds — this is a reorder, not a merge
  });

  let mergeCount = 1;

  while (q1.length + q2.length > 1) {
    const a = dequeueMin(q1, q2);
    const b = dequeueMin(q1, q2);

    const left  = a;
    const right = b;

    const newFreq = left.freq + right.freq;
    const newId = `_${++internalCounter}`;

    allNodes.set(newId, {
      id: newId,
      label: String(newFreq),
      leftId: left.nodeId,
      rightId: right.nodeId,
    });

    const merged: QueueItem = { nodeId: newId, freq: newFreq };
    q2.push(merged);
    mergeCount++;

    const leftLeaves  = subtreeLeaves(left.nodeId,  allNodes);
    const rightLeaves = subtreeLeaves(right.nodeId, allNodes);
    const desc =
      `Merge ${leftLeaves}:${left.freq} + ${rightLeaves}:${right.freq}` +
      ` → ${leftLeaves}${rightLeaves}:${newFreq}`;

    snapshots.push({
      tree: forestTree([...q1, ...q2], allNodes),
      stepLabel: `Step ${mergeCount} of ${totalSteps}`,
      description: desc,
      isComplete: q1.length + q2.length === 1,
      mergingIds: [left.nodeId, right.nodeId],
    });
  }

  return snapshots;
}

// Return and remove the front item with the lower frequency from q1 or q2.
// Ties go to q1 (prefer unmerged leaves to keep the tree balanced).
function dequeueMin(q1: QueueItem[], q2: QueueItem[]): QueueItem {
  const useQ1 =
    q1.length > 0 && (q2.length === 0 || q1[0].freq <= q2[0].freq);
  return useQ1 ? q1.shift()! : q2.shift()!;
}

function subtreeLeaves(nodeId: string, allNodes: Map<string, TreeNode>): string {
  const node = allNodes.get(nodeId)!;
  if (!node.leftId && !node.rightId) return node.id;
  const l = node.leftId  ? subtreeLeaves(node.leftId,  allNodes) : '';
  const r = node.rightId ? subtreeLeaves(node.rightId, allNodes) : '';
  return l + r;
}

function forestTree(queue: QueueItem[], allNodes: Map<string, TreeNode>): Tree {
  const reachable = new Set<string>();

  function collect(nodeId: string): void {
    if (reachable.has(nodeId)) return;
    reachable.add(nodeId);
    const node = allNodes.get(nodeId);
    if (node?.leftId)  collect(node.leftId);
    if (node?.rightId) collect(node.rightId);
  }

  for (const item of queue) collect(item.nodeId);

  const nodes: TreeNode[] = [];
  for (const id of reachable) nodes.push(allNodes.get(id)!);

  return makeTree(queue.map(item => item.nodeId), nodes);
}
