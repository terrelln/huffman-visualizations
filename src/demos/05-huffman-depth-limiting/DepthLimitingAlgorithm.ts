import { buildCanonSteps, buildCanonicalTree } from '../04-huffman-canonicalization/CanonicalizationAlgorithm';
import type { CanonRow } from '../04-huffman-canonicalization/CanonicalizationAlgorithm';
import type { Tree } from '../../tree/BinaryTree';
import type { SymbolInput } from '../01-huffman-tree-construction/HuffmanAlgorithm';

// ── Data structures ────────────────────────────────────────────────────────

export interface DepthRow {
  symbol: string;
  freq: number;
  numBits: number;
  canonicalCodeword: string;
}

export interface ClampStep {
  kind: 'clamp';
  oldBits: number[];
  newBits: number[];
}

export interface KraftInitStep {
  kind: 'kraft-init';
  kraftSum: number;
  target: number;
}

export interface SortByFreqStep {
  kind: 'sort-by-freq';
  permutation: number[];
}

export interface DemoteStep {
  kind: 'demote';
  rowIndex: number;
  oldBits: number;
  newBits: number;
  kraftBefore: number;
  kraftAfter: number;
  target: number;
  applied: boolean;
  broke: boolean;
  isFirstIteration: boolean;
}

export interface PromoteStep {
  kind: 'promote';
  rowIndex: number;
  oldBits: number;
  newBits: number;
  kraftBefore: number;
  kraftAfter: number;
  target: number;
  applied: boolean;
  broke: boolean;
  isFirstIteration: boolean;
}

export interface FinalizeStep {
  kind: 'finalize';
  rows: DepthRow[];
  tree: Tree;
}

export type DepthStep =
  | ClampStep
  | KraftInitStep
  | SortByFreqStep
  | DemoteStep
  | PromoteStep
  | FinalizeStep;

export interface DepthAlgorithmResult {
  rows: DepthRow[];
  steps: DepthStep[];
}

// ── Main algorithm ─────────────────────────────────────────────────────────

export function buildDepthLimitingSteps(
  inputs: SymbolInput[],
  maxDepth: number,
): DepthAlgorithmResult {
  // Get canonical rows from Demo 4
  const canonResult = buildCanonSteps(inputs);
  const canonRows = canonResult.rows;

  // Build freq lookup
  const freqMap = new Map<string, number>();
  for (const inp of inputs) {
    freqMap.set(inp.symbol, inp.freq);
  }

  // Build DepthRows from canonical rows (sorted by bits,symbol from Demo 4)
  let rows: DepthRow[] = canonRows.map(cr => ({
    symbol: cr.symbol,
    freq: freqMap.get(cr.symbol) ?? 0,
    numBits: cr.numBits,
    canonicalCodeword: cr.canonicalCodeword,
  }));

  const steps: DepthStep[] = [];

  // Phase 1: Sort by freq ascending
  const indices = rows.map((_, i) => i);
  const sortedIndices = [...indices].sort((a, b) => {
    const r = rows[a].freq - rows[b].freq;
    return r !== 0 ? r : rows[a].symbol.localeCompare(rows[b].symbol);
  });
  steps.push({ kind: 'sort-by-freq', permutation: sortedIndices });

  const sortedRows = sortedIndices.map(i => rows[i]);
  rows = sortedRows;

  // Phase 2: Clamp
  const oldBitsAll = rows.map(r => r.numBits);
  for (const row of rows) {
    row.numBits = Math.min(row.numBits, maxDepth);
  }
  const newBitsAll = rows.map(r => r.numBits);
  steps.push({ kind: 'clamp', oldBits: oldBitsAll, newBits: newBitsAll });

  // Phase 3: Kraft init
  const target = 1 << maxDepth;
  let kraftSum = 0;
  for (const row of rows) {
    kraftSum += 1 << (maxDepth - row.numBits);
  }
  steps.push({ kind: 'kraft-init', kraftSum, target });

  // Phase 4: Forward pass (demote) — lowest freq first
  for (let i = 0; i < rows.length; i++) {
    if (kraftSum <= target) {
      steps.push({
        kind: 'demote', rowIndex: i, oldBits: rows[i].numBits, newBits: rows[i].numBits,
        kraftBefore: kraftSum, kraftAfter: kraftSum, target,
        applied: false, broke: true, isFirstIteration: true,
      });
      break;
    }
    let isFirst = true;
    while (rows[i].numBits < maxDepth && kraftSum > target) {
      const oldBits = rows[i].numBits;
      const newWeight = 1 << (maxDepth - oldBits - 1);
      const kraftAfter = kraftSum - newWeight;
      steps.push({
        kind: 'demote', rowIndex: i, oldBits, newBits: oldBits + 1,
        kraftBefore: kraftSum, kraftAfter, target,
        applied: true, broke: false, isFirstIteration: isFirst,
      });
      kraftSum = kraftAfter;
      rows[i].numBits = oldBits + 1;
      isFirst = false;
    }
    // Emit a non-applied step if the while condition was never true or exited
    if (isFirst) {
      // while condition was never true (bits already at maxDepth)
      steps.push({
        kind: 'demote', rowIndex: i, oldBits: rows[i].numBits, newBits: rows[i].numBits,
        kraftBefore: kraftSum, kraftAfter: kraftSum, target,
        applied: false, broke: false, isFirstIteration: true,
      });
    }
  }

  // Phase 5: Backward pass (promote) — highest freq first
  for (let i = rows.length - 1; i >= 0; i--) {
    if (kraftSum === target) {
      steps.push({
        kind: 'promote', rowIndex: i, oldBits: rows[i].numBits, newBits: rows[i].numBits,
        kraftBefore: kraftSum, kraftAfter: kraftSum, target,
        applied: false, broke: true, isFirstIteration: true,
      });
      break;
    }
    let isFirst = true;
    while (kraftSum + (1 << (maxDepth - rows[i].numBits)) <= target) {
      const oldBits = rows[i].numBits;
      const currentWeight = 1 << (maxDepth - oldBits);
      const kraftAfter = kraftSum + currentWeight;
      steps.push({
        kind: 'promote', rowIndex: i, oldBits, newBits: oldBits - 1,
        kraftBefore: kraftSum, kraftAfter, target,
        applied: true, broke: false, isFirstIteration: isFirst,
      });
      kraftSum = kraftAfter;
      rows[i].numBits = oldBits - 1;
      isFirst = false;
    }
    // Emit a non-applied step if while condition was never true
    if (isFirst) {
      steps.push({
        kind: 'promote', rowIndex: i, oldBits: rows[i].numBits, newBits: rows[i].numBits,
        kraftBefore: kraftSum, kraftAfter: kraftSum, target,
        applied: false, broke: false, isFirstIteration: true,
      });
    }
  }

  // Phase 6: Finalize — sort by (numBits, symbol), assign canonical codewords, build tree
  rows.sort((a, b) => {
    const r = a.numBits - b.numBits;
    return r !== 0 ? r : a.symbol.localeCompare(b.symbol);
  });

  // Assign canonical codewords
  let code = 0;
  for (let i = 0; i < rows.length; i++) {
    const numBits = rows[i].numBits;
    rows[i].canonicalCodeword = code.toString(2).padStart(numBits, '0');
    if (i < rows.length - 1) {
      const shift = rows[i + 1].numBits - numBits;
      code = (code + 1) << shift;
    }
  }

  // Build tree via buildCanonicalTree
  const canonRowsForTree: CanonRow[] = rows.map(r => ({
    symbol: r.symbol,
    numBits: r.numBits,
    naiveCodeword: '',
    canonicalCodeword: r.canonicalCodeword,
  }));
  const tree = buildCanonicalTree(canonRowsForTree, rows.length - 1);

  steps.push({ kind: 'finalize', rows: [...rows], tree });

  return { rows, steps };
}
