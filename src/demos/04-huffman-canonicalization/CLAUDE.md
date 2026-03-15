# Demo 4 — Huffman Canonicalization

## What this demo shows

How to derive a **canonical Huffman code** from any Huffman tree. Canonical
codes reassign bit patterns such that:
- Shorter codes always precede longer codes numerically.
- Among codes of the same length, symbols appear in lexicographic order.
- The resulting code is unique and portable (only the code-length table is
  needed to reconstruct it).

The demo walks through six phases:

1. **Show original Huffman tree** — the finished tree from Demo 1.
2. **Extract table** — DFS the tree to build a (Symbol, Bits, Codeword) table,
   one row per leaf. Each row flies from the leaf node to the table.
3. **Erase codewords** — only code *lengths* matter; naive codewords fade out.
4. **Sort** — rows are animated to their sorted positions (by bits, then
   symbol). Pseudocode panel appears.
5. **Assign canonical codewords** — canonical assignment algorithm runs
   step by step with pseudocode highlighting and a live `code` display.
6. **Build canonical tree** — original tree fades out; a new tree grows
   edge-by-edge from the assigned codewords.

## Layout

Same two-column pattern as Demo 1:

- **Left panel** (`.canon-panel`, 320 px) — stacked:
  - `.canon-pseudo` — pseudocode block, hidden until Phase 4 (sort).
  - `.canon-table-wrap` — table with Symbol / Bits / Codeword columns.
- **Right area** — SVG with the Huffman tree (Phase 0–5), then canonical
  tree (Phase 6).

## Node IDs in the canonical tree

Node IDs equal the codeword prefix at that node:
- Root: `""`
- Left child of root: `"0"`, right child: `"1"`
- Leaf for codeword `"010"` has ID `"010"`

This makes path tracing trivial and backward navigation simple (remove the
node whose ID is the reversed codeword).

## Architecture

**`CanonicalizationAlgorithm.ts`** — pure algorithm, no DOM.
- `buildCanonSteps(inputs)` runs `buildHuffmanSnapshots`, DFS-extracts rows,
  sorts, assigns canonical codes, and emits a flat `CanonStep[]`.
- `buildCanonicalTree(rows, upToIndex)` builds the canonical tree containing
  leaves `rows[0..upToIndex]` on demand. Used by action forward/backward.

**`CanonicalizationDemo.ts`** — animation engine.
- Flat `Action[]` queue pattern identical to Demos 2 & 3.
- `buildActions()` consumes the `CanonStep[]` and produces `Action` objects
  with explicit `forward` and `backward` callbacks.
- Sort animation: measures row positions before and after, applies
  `translateY` CSS transitions, then reorders the DOM.
- Fly animations: `position: fixed` floater divs appended to `document.body`.

## Reused patterns

| Pattern | Source |
|---|---|
| `Action { forward, backward }` flat array | Demo 2/3 |
| `scaledDelay(baseMs)` | Demo 2/3 |
| Controls + speed slider | Demo 2/3 |
| `flyBit` mechanics (`position: fixed`, fade-in, CSS fly, remove) | Demo 2/3 |
| `stripCounts` | Demo 2/3 |
| `buildEdgePath` | Demo 2/3 |
| Pseudocode highlight with `K/F/O` + `PSEUDO_LINES` | Demo 1 |
| `TreeRenderer.update(tree)` for progressive builds | All demos |
| `TreeRenderer.getNodePos(id)` (new public wrapper) | Added for Demo 4 |
