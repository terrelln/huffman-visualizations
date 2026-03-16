# Demo 8 — Table-based Huffman Decoding

## What this demo shows

How to decode using the lookup table built in Demo 7, replacing the tree
traversal approach from Demo 3. The relationship mirrors Demo 6 → Demo 2:
same operation (decoding), different mechanism (table lookup vs tree traversal).

For each codeword: read D bits from the bitstream, look up
`table[parseInt(bits, 2)]` to get `{ symbol, numBits }`, consume only
`numBits` bits (may be < D), and emit the symbol.

## Layout

Two-panel layout in `viz-area`:

- **Left**: `dec-panel` (220px) — decoding panel identical to Demo 3
  - Top: encoded input bits (`.dec-group` per codeword, all bits visible)
  - Bottom: decoded output characters (hidden, revealed as decoded)
- **Right**: `tbl-dec-table-panel` (450px) — decoding table from Demo 7
  - Fully pre-filled table with Index | Binary | Symbol | Bits columns

## Architecture

**`TableDecodingDemo.ts`** — single file, no separate algorithm module.

- Calls `buildDecodingTableSteps(inputs, maxDepth)` from Demo 7 to get the
  decoding table and source rows with canonical codewords.
- Encodes the input string using the canonical codewords to get a bitstream.
- Walks through the bitstream using the table to produce `TableDecCharStep[]`.
- Uses the same `Action { forward, backward }` flat array queue pattern
  as Demo 3/6.

## Key differences from Demo 3

| Aspect | Demo 3 | Demo 8 |
|--------|--------|--------|
| Right-side display | Huffman tree (SVG) | Decoding table (HTML) |
| Lookup mechanism | Tree edge traversal | Table index lookup |
| Actions per char | n+2 (one per edge + leaf + cleanup) | 3 (highlight + fly + cleanup) |
| Fly source | Individual bits | D-bit pill |
| Fly target | SVG edge labels | Table binary cell |
| Bit highlight | None (consumed individually) | D-bit lookup highlight |
| maxDepth | No | Yes |
| TreeRenderer | Yes | No |

## Animation sequence per character (3 actions)

1. **Highlight lookup bits + table row**: Highlight next D bits in bitstream
   (`.tbl-dec-bit-lookup`), highlight table row (`.tbl-dec-row-active`). Dwell.
2. **Fly bits + decode**: Fly D-bit pill from bitstream to table binary cell.
   Consume `numBits` bits (`.dec-bit-consumed`), restore unconsumed bits if
   `numBits < D`. Show underbrace + decoded character.
3. **Cleanup**: Clear table row + bit highlights. Consumed bits stay dimmed.

## Bitstream display

Bits are grouped by codeword (same as Demo 3), but lookup highlights span D
bits which may cross group boundaries. Each `.dec-bit` has a `data-global-idx`
attribute for flat indexing. The `allBitEls` array provides O(1) access by
global position.

## Reused patterns

| Pattern | Source |
|---|---|
| `Action { forward, backward }` flat array | Demo 3/6 |
| `scaledDelay(baseMs)` | Demo 3/6 |
| Controls + speed slider | Demo 3/6 |
| Decoding panel (dec-group, dec-bit, dec-brace, dec-char) | Demo 3 |
| `rebuildDecDisplay(visibleUpTo)` | Demo 3 |
| Fly animation (HTML→HTML, getBoundingClientRect) | Demo 6 |
| Decoding table HTML structure | Demo 7 |
| `buildDecodingTableSteps()` | Demo 7 algorithm |
