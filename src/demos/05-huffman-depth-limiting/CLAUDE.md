# Demo 5 — Huffman Depth Limiting

## What this demo shows

How to enforce a maximum code length on Huffman codes using a simple
heuristic. The algorithm:

1. Starts with canonical Huffman code lengths from Demo 4.
2. **Clamps** any code length exceeding `maxDepth` down to `maxDepth`.
3. Computes the Kraft sum using integer weights: `weight(L) = 2^(maxDepth - L)`,
   target = `2^maxDepth`.
4. **Demotes** (lengthens) rare symbols to reduce the Kraft sum.
5. **Promotes** (shortens) frequent symbols to fill remaining Kraft budget.
6. Calls `canonicalize()` to assign final codewords and build the tree.

## Layout

Two-column layout matching Demo 4:

- **Left panel** (`.depth-panel`, 380px) — stacked:
  - `.canon-header` — "Depth Limiting"
  - `.depth-slider-row` — max depth slider with label and value display
  - `.canon-pseudo` — pseudocode block with highlight support
  - `.depth-kraft-display` — live Kraft sum display (gold background)
  - `.canon-table-wrap` — table with 4 columns: Symbol, Freq, Bits, Codeword
- **Right area** — SVG tree (hidden until finalize step)

## Architecture

**`DepthLimitingAlgorithm.ts`** — pure algorithm, no DOM.
- `buildDepthLimitingSteps(inputs, maxDepth)` calls `buildCanonSteps` from
  Demo 4, then runs clamp/demote/promote passes, emitting `DepthStep[]`.
- Final canonicalization sorts by (numBits, symbol), assigns codewords,
  builds tree via `buildCanonicalTree`.

**`DepthLimitingDemo.ts`** — animation engine.
- Flat `Action[]` queue pattern identical to Demo 4.
- Sort animation reuses the `translateY` + DOM reorder pattern.
- Slider changes trigger `start()` with saved inputs.

## Reused patterns

| Pattern | Source |
|---|---|
| `Action { forward, backward }` flat array | Demo 2/3/4 |
| `scaledDelay(baseMs)` | Demo 2/3/4 |
| Controls + speed slider | Demo 2/3/4 |
| `setPseudoHighlight` with `active-first`/`active-last` | Demo 1/4 |
| Sort animation (translateY transitions) | Demo 4 |
| `buildCanonSteps`, `buildCanonicalTree`, `CanonRow` | Demo 4 |
| `.canon-pseudo`, `.canon-row-active`, `.canon-cell-*` CSS | Demo 4 |
