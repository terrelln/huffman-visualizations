# Demo 7 — Decoding Table Construction

## What this demo shows

How to build a single-level Huffman decoding table from the canonical
symbol table produced by Demo 5 (Depth Limiting). The table has `2^D`
entries where D is the max depth.

For each symbol with `numBits` bits and codeword:
1. Compute `numEntries = 2^(D - numBits)`.
2. Compute `startIndex = parseInt(codeword, 2) << (D - numBits)`.
3. Fill `table[start..start+numEntries-1]` with `{ symbol, numBits }`.

## Layout

Single wide panel (`.decode-panel`, 900px) with a flex row:

- **Left column** (`.decode-left`):
  - `.canon-pseudo` — pseudocode block with highlight support
  - `.decode-compute-display` — gold pill showing computed `n` and `start` values
  - Source table (Symbol | Bits | Codeword) from `DepthRow[]`
- **Right column** (`.decode-right`):
  - Decoding table (Index | Binary | Symbol | Bits) — `2^D` rows, initially empty

## Architecture

**`DecodingTableAlgorithm.ts`** — pure algorithm, no DOM.
- `buildDecodingTableSteps(inputs, maxDepth)` calls `buildDepthLimitingSteps`
  from Demo 5, then emits `DecodingTableStep[]`.

**`DecodingTableDemo.ts`** — animation engine.
- Flat `Action[]` queue pattern identical to Demo 5.
- Step types: `init-table`, `symbol-start`, `compute-entries`, `fill-entry`, `done`.

## Reused patterns

| Pattern | Source |
|---|---|
| `Action { forward, backward }` flat array | Demo 2/3/4/5 |
| `scaledDelay(baseMs)` | Demo 2/3/4/5 |
| Controls + speed slider | Demo 2/3/4/5 |
| `setPseudoHighlight` with `active-first`/`active-last` | Demo 1/4/5 |
| `.canon-pseudo`, `.canon-row-active`, `.canon-cell-*` CSS | Demo 4/5 |
