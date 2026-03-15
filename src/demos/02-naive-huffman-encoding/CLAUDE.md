# Demo 2 — Naive Huffman Encoding

## What this demo shows

How to encode a string using the finished Huffman tree produced by Demo 1.
For each character in the input string the demo walks the root-to-leaf path
in the tree, traversing one edge at a time. Each edge is labeled `0` (left
child) or `1` (right child), so the path spells out the codeword for that
character. The animation makes the connection between tree structure and
bitstring explicit: every bit visibly flies from its edge label in the tree
to its slot in the encoded output.

This demo is the **visual reverse** of Demo 3 (Naive Huffman Decoding).
See the correspondence table in `HuffmanEncodingDemo.ts` and the sibling
`CLAUDE.md` in `03-naive-huffman-decoding/`.

## Visualization design

**Layout**

- Left panel: the encoding panel (`enc-panel`, 220 px wide).
  - Top: input character boxes (`enc-input-row`, one `.enc-char` per symbol).
  - Bottom: encoded output (`enc-output`), one `.enc-group` per character.
    Each group contains a row of bit boxes (`.enc-bit`, initially hidden) and
    an underbrace (`.enc-brace`, initially hidden) labelled with the source
    character.
- Right area: the finished Huffman tree SVG, identical tree to Demo 1's final
  state but with internal-node frequency labels stripped (leaves show only
  the symbol letter).

**Color language**

- Yellow/gold (`.merging`) on a leaf node — the character currently being
  encoded.
- Blue (`.highlighted`) on tree edges — the path currently being traversed.
- Yellow highlight on the active input character box (`.enc-char-active`).
- Blue floating pill (`.enc-bit-floater`) — the animated bit in flight.
- Grey box (`.enc-bit`) — a revealed bit in the output panel.
- Grey underbrace (`.enc-brace`) — appears beneath each completed codeword,
  labelled with the source character.

**Animation sequence per character**

1. Highlight the leaf node (`.merging`) and the input character box
   (`.enc-char-active`). Dwell.
2. For each edge in the root→leaf path:
   a. Highlight the edge (`.highlighted`).
   b. Fly a bit pill from the edge label position in the SVG to the
      corresponding `.enc-bit` slot in the panel. The floater is positioned
      with `position: fixed` so it moves across the panel/tree boundary.
   c. Reveal the bit in the panel (opacity 0 → 1).
   d. On the last edge, reveal the underbrace (opacity 0 → 1).
3. Clear all highlights for this character. Bits and brace remain visible.

**Fly animation**

`flyBit()` converts the SVG edge-label coordinate to viewport pixels (using
`svgEl.getBoundingClientRect()` + viewBox scale), then measures the target
`.enc-bit` element with `getBoundingClientRect()`. A `position: fixed` div
is spawned at the source, faded in, then CSS-transitioned to the target while
fading out, then removed. Direction: **tree → panel** (right to left).

## Architectural choices

**Shared data model with Demo 3**

`CharStep` (`{ char, leafId, edges: EdgeStep[] }`) is the unit of work.
`EdgeStep` is `{ parentId, childId, bit }`. These structures are identical in
Demo 2 and Demo 3; only the animation direction differs. `buildEdgePath()` and
`findLeafId()` are also duplicated in Demo 3 — intentionally, to keep each
demo self-contained without a shared utility module.

**n+2 actions per character**

Each `CharStep` produces exactly `n + 2` `Action` objects (where `n` is the
codeword length):

```
[leaf+char highlight]  [edge 0]  [edge 1]  …  [edge n-1]  [cleanup]
```

This granularity lets Prev/Next step through individual edge traversals rather
than jumping whole characters. The action queue pattern (`remainingActions` /
`completedActions`) is the same as Demo 1.

**`rebuildBitsDisplay(visibleUpTo)`**

Used when jumping directly to a completed step (backward navigation past
multiple characters). Sets bits and braces for chars `< visibleUpTo` to
visible, and hides the rest — faster than replaying all forward actions.

**Tree is re-rendered fresh on each `start()` call**

The `TreeRenderer` is recreated and the final snapshot from
`buildHuffmanSnapshots()` is rendered with `stripCounts()` applied (removes
frequency labels from internal nodes). The tree is static for the duration of
the demo; only node/edge highlighting changes.

**Speed scaling**

Identical pattern to Demo 1: `scaledDelay(baseMs)` divides by
`speedMultiplier` using `requestAnimationFrame` polling. The fly duration
(`BASE_FLY_MS / speedMultiplier`) is computed inline when spawning the
floater, so it respects speed changes made mid-animation.
