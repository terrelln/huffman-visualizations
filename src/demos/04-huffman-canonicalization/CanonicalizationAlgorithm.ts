import { makeTree } from '../../tree/BinaryTree';
import type { Tree, TreeNode } from '../../tree/BinaryTree';
import { buildHuffmanSnapshots } from '../01-huffman-tree-construction/HuffmanAlgorithm';
import type { SymbolInput } from '../01-huffman-tree-construction/HuffmanAlgorithm';

// ── Tree utilities ─────────────────────────────────────────────────────────

export function stripCounts(tree: Tree): Tree {
  const newNodes = new Map(
    [...tree.nodes.entries()].map(([id, node]) => {
      const isLeaf = !node.leftId && !node.rightId;
      const label = isLeaf ? node.label.split(':')[0] : '';
      return [id, { ...node, label }];
    })
  );
  return { ...tree, nodes: newNodes };
}

// ── Data structures ────────────────────────────────────────────────────────

export interface CanonRow {
  symbol: string;
  numBits: number;
  naiveCodeword: string;     // from DFS traversal (e.g., "010")
  canonicalCodeword: string; // empty until assigned
}

export interface ExtractStep  { kind: 'extract'; leafId: string; rowIndex: number; }
export interface SortStep     { kind: 'sort';    permutation: number[]; }
export interface CodeInitStep { kind: 'code-init'; }
export interface AssignStep {
  kind: 'assign';
  rowIndex: number;
  codeword: string;
  codeAfter: number;  // code + 1 (before shift)
  shiftAmount: number; // 0 if no shift needed
}
export interface BuildTreeStep {
  kind: 'build-tree';
  codeword: string;
  symbol: string;
  newPrefixes: string[];   // internal node IDs created this step
  sourceRowIndex: number;
}

export type CanonStep = ExtractStep | SortStep | CodeInitStep | AssignStep | BuildTreeStep;

export interface CanonAlgorithmResult {
  huffmanTree: Tree;
  rows: CanonRow[];
  steps: CanonStep[];
}

// ── DFS helpers ────────────────────────────────────────────────────────────

function dfsLeaves(
  tree: Tree,
  nodeId: string,
  path: string,
  result: Array<{ leafId: string; codeword: string }>,
): void {
  const node = tree.nodes.get(nodeId);
  if (!node) return;
  if (!node.leftId && !node.rightId) {
    result.push({ leafId: nodeId, codeword: path });
    return;
  }
  if (node.leftId)  dfsLeaves(tree, node.leftId,  path + '0', result);
  if (node.rightId) dfsLeaves(tree, node.rightId, path + '1', result);
}

// ── Main algorithm ─────────────────────────────────────────────────────────

export function buildCanonSteps(inputs: SymbolInput[]): CanonAlgorithmResult {
  const snapshots = buildHuffmanSnapshots(inputs);
  const lastSnap = snapshots[snapshots.length - 1];
  const huffmanTree = stripCounts(lastSnap.tree);

  // Phase 1: DFS to extract rows
  const extractOrder: Array<{ leafId: string; codeword: string }> = [];
  for (const rootId of huffmanTree.rootIds) {
    dfsLeaves(huffmanTree, rootId, '', extractOrder);
  }

  const rows: CanonRow[] = extractOrder.map(({ leafId, codeword }) => {
    const node = huffmanTree.nodes.get(leafId)!;
    return {
      symbol: node.label,
      numBits: codeword.length,
      naiveCodeword: codeword,
      canonicalCodeword: '',
    };
  });

  const steps: CanonStep[] = [];

  // ExtractStep per leaf
  for (let i = 0; i < rows.length; i++) {
    steps.push({ kind: 'extract', leafId: extractOrder[i].leafId, rowIndex: i });
  }

  // Sort by (numBits, symbol)
  const originalIndices = rows.map((_, i) => i);
  const sortedIndices = [...originalIndices].sort((a, b) => {
    const r = rows[a].numBits - rows[b].numBits;
    return r !== 0 ? r : rows[a].symbol.localeCompare(rows[b].symbol);
  });
  // permutation[i] = where the row at position i in the sorted array was in the original
  steps.push({ kind: 'sort', permutation: sortedIndices });

  // Reorder rows in-place to sorted order
  const sortedRows = sortedIndices.map(i => rows[i]);
  rows.length = 0;
  rows.push(...sortedRows);

  // CodeInit
  steps.push({ kind: 'code-init' });

  // Assign canonical codewords
  let code = 0;
  for (let i = 0; i < rows.length; i++) {
    const numBits = rows[i].numBits;
    const codeword = code.toString(2).padStart(numBits, '0');
    rows[i].canonicalCodeword = codeword;

    const isLast = i === rows.length - 1;
    const shiftAmount = isLast ? 0 : rows[i + 1].numBits - numBits;

    const codeAfter = code + 1;
    steps.push({
      kind: 'assign',
      rowIndex: i,
      codeword,
      codeAfter,
      shiftAmount,
    });

    if (!isLast) {
      code = (code + 1) << shiftAmount;
    }
  }

  // Build canonical tree step by step
  const existingPrefixes = new Set<string>(['']); // root always exists

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cw = row.canonicalCodeword;
    const newPrefixes: string[] = [];

    // Find which prefix nodes need to be created
    for (let len = 1; len < cw.length; len++) {
      const prefix = cw.slice(0, len);
      if (!existingPrefixes.has(prefix)) {
        existingPrefixes.add(prefix);
        newPrefixes.push(prefix);
      }
    }
    // The leaf itself (full codeword) will be added
    existingPrefixes.add(cw);

    steps.push({
      kind: 'build-tree',
      codeword: cw,
      symbol: row.symbol,
      newPrefixes,
      sourceRowIndex: i,
    });
  }

  return { huffmanTree, rows, steps };
}

// ── Canonical tree builder ─────────────────────────────────────────────────

// Builds the canonical tree up to (and including) rowIndex rows added.
// Node IDs = codeword prefix strings; root = "".
export function buildCanonicalTree(rows: CanonRow[], upToIndex: number): Tree {
  const nodes = new Map<string, TreeNode>();

  // Root node always present once we start building
  if (upToIndex < 0) return makeTree([], []);

  nodes.set('', { id: '', label: '' });

  for (let i = 0; i <= upToIndex; i++) {
    const cw = rows[i].canonicalCodeword;
    if (!cw) continue;

    // Ensure all internal nodes along the path exist
    for (let len = 1; len < cw.length; len++) {
      const prefix = cw.slice(0, len);
      if (!nodes.has(prefix)) {
        nodes.set(prefix, { id: prefix, label: '' });
      }
      // Wire up parent→child
      const parentPrefix = prefix.slice(0, -1);
      const bit = prefix[prefix.length - 1];
      const parentNode = nodes.get(parentPrefix)!;
      if (bit === '0') {
        nodes.set(parentPrefix, { ...parentNode, leftId: prefix });
      } else {
        nodes.set(parentPrefix, { ...parentNode, rightId: prefix });
      }
    }

    // Add leaf
    nodes.set(cw, { id: cw, label: rows[i].symbol });
    // Wire leaf to parent
    if (cw.length > 0) {
      const parentPrefix = cw.slice(0, -1);
      const bit = cw[cw.length - 1];
      const parentNode = nodes.get(parentPrefix)!;
      if (bit === '0') {
        nodes.set(parentPrefix, { ...parentNode, leftId: cw });
      } else {
        nodes.set(parentPrefix, { ...parentNode, rightId: cw });
      }
    }
  }

  return makeTree([''], [...nodes.values()]);
}
