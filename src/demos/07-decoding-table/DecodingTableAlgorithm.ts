import { buildDepthLimitingSteps } from '../05-huffman-depth-limiting/DepthLimitingAlgorithm';
import type { DepthRow } from '../05-huffman-depth-limiting/DepthLimitingAlgorithm';
import type { SymbolInput } from '../01-huffman-tree-construction/HuffmanAlgorithm';

// ── Step types ────────────────────────────────────────────────────────────────

export interface ComputeDepthStep {
  kind: 'compute-depth';
  maxDepth: number;
}

export interface InitTableStep {
  kind: 'init-table';
  tableSize: number;
  maxDepth: number;
}

export interface SymbolStartStep {
  kind: 'symbol-start';
  rowIndex: number;
  symbol: string;
  numBits: number;
}

export interface ComputeEntriesStep {
  kind: 'compute-entries';
  rowIndex: number;
  numEntries: number;
  startIndex: number;
  maxDepth: number;
}

export interface FillEntryStep {
  kind: 'fill-entry';
  tableIndex: number;
  symbol: string;
  numBits: number;
  rowIndex: number;
  isFirst: boolean;
  isLast: boolean;
}

export interface DoneStep {
  kind: 'done';
}

export type DecodingTableStep =
  | ComputeDepthStep
  | InitTableStep
  | SymbolStartStep
  | ComputeEntriesStep
  | FillEntryStep
  | DoneStep;

export interface DecodeTableEntry {
  symbol: string;
  numBits: number;
}

export interface DecodingTableResult {
  sourceRows: DepthRow[];
  maxDepth: number;
  table: (DecodeTableEntry | null)[];
  steps: DecodingTableStep[];
}

// ── Main algorithm ────────────────────────────────────────────────────────────

export function buildDecodingTableSteps(
  inputs: SymbolInput[],
  maxDepth: number,
): DecodingTableResult {
  const depthResult = buildDepthLimitingSteps(inputs, maxDepth);
  const sourceRows = depthResult.rows;

  // D is derived from the source rows, not passed as a parameter
  const D = Math.max(...sourceRows.map(r => r.numBits));

  const tableSize = 1 << D;
  const table: (DecodeTableEntry | null)[] = new Array(tableSize).fill(null);
  const steps: DecodingTableStep[] = [];

  steps.push({ kind: 'compute-depth', maxDepth: D });
  steps.push({ kind: 'init-table', tableSize, maxDepth: D });

  let startIndex = 0;
  for (let ri = 0; ri < sourceRows.length; ri++) {
    const row = sourceRows[ri];
    const { symbol, numBits } = row;

    steps.push({ kind: 'symbol-start', rowIndex: ri, symbol, numBits });

    const numEntries = 1 << (D - numBits);

    steps.push({ kind: 'compute-entries', rowIndex: ri, numEntries, startIndex, maxDepth: D });

    for (let j = 0; j < numEntries; j++) {
      const idx = startIndex + j;
      table[idx] = { symbol, numBits };
      steps.push({
        kind: 'fill-entry',
        tableIndex: idx,
        symbol,
        numBits,
        rowIndex: ri,
        isFirst: j === 0,
        isLast: j === numEntries - 1,
      });
    }
    startIndex += numEntries;
  }

  steps.push({ kind: 'done' });

  return { sourceRows, maxDepth: D, table, steps };
}
