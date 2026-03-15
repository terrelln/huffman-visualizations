# Demo 6 — Table-based Huffman Encoding

## What this demo shows

How to encode a string using a depth-limited canonical symbol table instead
of tree traversal. For each character in the input string, the demo looks up
the symbol in the table (produced by Demo 5's depth-limiting algorithm),
highlights the matching row, then copies each codeword bit to the output
panel via a flying animation — making the table-lookup approach explicit.

This demo is structurally a copy of Demo 2 (Naive Huffman Encoding) with the
tree replaced by an HTML symbol table.

## Layout

Same `viz-area` flex layout as Demo 2:

- **Left**: `enc-panel` (220px) — input char boxes + output bits + underbraces
  (identical to Demo 2)
- **Right**: Symbol table (`tbl-enc-table-panel`, 260px) — HTML table with
  Symbol, Bits, Codeword columns. Each bit in the codeword cell is wrapped
  in a `<span class="tbl-enc-cw-bit">` for fly targeting.

Bits fly from right (table) to left (enc-panel), same direction as Demo 2.

## Architecture

**`TableEncodingDemo.ts`** — single file, no separate algorithm module.

- Calls `buildDepthLimitingSteps(inputs, maxDepth)` from Demo 5 to get
  `DepthRow[]` with canonical codewords.
- Builds `TableCharStep[]` (one per input character) with `rowIndex` and
  `codeword` fields — no tree traversal needed.
- Uses the same `Action { forward, backward }` flat array queue pattern
  as Demo 2/3/4/5.

## Key differences from Demo 2

| Aspect | Demo 2 | Demo 6 |
|--------|--------|--------|
| Right-side display | Huffman tree (SVG) | Symbol table (HTML) |
| Code source | Tree edge traversal | `buildDepthLimitingSteps` output |
| Fly source | SVG edge label (coordinate conversion) | HTML span (`getBoundingClientRect`) |
| Highlight mechanism | TreeRenderer methods | CSS classes on table rows/spans |
| maxDepth | No | Yes |
| TreeRenderer | Yes | No |

## Animation sequence per character

1. Highlight table row (`.tbl-enc-row-active`) + input char box
   (`.enc-char-active`). Dwell.
2. Per-bit: highlight bit span (`.tbl-enc-bit-active`) in table, fly
   from table to enc-panel, reveal bit. On last bit, reveal underbrace.
3. Cleanup: clear all highlights for this character. Bits and brace
   remain visible.

## Reused patterns

| Pattern | Source |
|---|---|
| `Action { forward, backward }` flat array | Demo 2/3/4/5 |
| `scaledDelay(baseMs)` | Demo 2/3/4/5 |
| Controls + speed slider | Demo 2/3/4/5 |
| Encoding panel (`buildEncodingPanel`, `showBit/hideBit`, etc.) | Demo 2 |
| `rebuildBitsDisplay(visibleUpTo)` | Demo 2 |
| `.canon-table-*` CSS classes | Demo 4 |
| `.enc-*` CSS classes | Demo 2 |
