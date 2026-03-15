# Demo 3 — Naive Huffman Decoding

## What this demo shows

How to decode a Huffman-encoded bitstring back into the original string using
the same tree that produced the encoding. Starting at the root, each incoming
bit directs traversal one level down the tree (`0` → left child, `1` → right
child). When a leaf is reached the corresponding symbol is emitted, and
traversal resets to the root for the next codeword.

This demo is the **exact visual reverse** of Demo 2 (Naive Huffman Encoding).
Every structural and visual choice was made to mirror Demo 2 so the two demos
feel like the same process running in opposite directions. See the
correspondence table at the top of `HuffmanDecodingDemo.ts` and the sibling
`CLAUDE.md` in `02-naive-huffman-encoding/`.

## Visualization design

**Layout**

- Left panel: the decoding panel (`dec-panel`, 220 px wide).
  - Top: encoded input bits (`dec-input`), one `.dec-group` per codeword.
    Each group contains a row of bit boxes (`.dec-bit`) and an underbrace
    (`.dec-brace`, initially hidden) labelled with the decoded character.
    **All bits are visible from the start** (reverse of encoding, where bits
    start hidden and are revealed as they land).
  - Bottom: decoded output character boxes (`dec-output-row`, one `.dec-char`
    per symbol, initially hidden).
- Right area: the finished Huffman tree SVG — same tree as Demo 2, leaves
  showing only the symbol letter.

**Color language**

Identical palette to Demo 2 so the two demos feel visually consistent:

- Blue (`.highlighted`) on tree edges — the edge currently being traversed.
- Yellow/gold (`.merging`) on a leaf node — the decoded character just
  reached.
- Blue floating pill (`.dec-bit-floater`) — the animated bit in flight.
- Grey box (`.dec-bit`) — an unconsumed input bit; dims to `opacity: 0.3`
  (`.dec-bit-consumed`) once processed.
- Grey underbrace (`.dec-brace`) — appears beneath each completed codeword
  group, labelled with the decoded character, same visual as `enc-brace`.
- Decoded character box (`.dec-char`) — fades in when the leaf is reached,
  same style as `enc-char`.

**Animation sequence per character**

1. For each edge in the root→leaf path (one action per bit):
   a. Highlight the edge (`.highlighted`).
   b. Fly a bit pill from the `.dec-bit` slot in the panel to the edge label
      position in the SVG. Direction: **panel → tree** (left to right).
   c. Dim the bit in the panel (add `.dec-bit-consumed`, opacity → 0.3).
2. Leaf reached: highlight the leaf node (`.merging`), reveal the underbrace
   (`.dec-brace`, opacity 0 → 1), reveal the decoded character box
   (`.dec-char`, opacity 0 → 1).
3. Clear all highlights. Consumed bits, brace, and decoded character remain.

**Fly animation**

`flyBit()` is the directional reverse of `HuffmanEncodingDemo.flyBit()`:
source is the `.dec-bit` element (measured with `getBoundingClientRect()`),
destination is the SVG edge label position (converted from SVG coordinates
to viewport pixels). The floater mechanics — `position: fixed`, fade in,
CSS transition fly + fade out, remove — are identical to Demo 2.

## Architectural choices

**Structural reverse of Demo 2, not an independent design**

Every decision (data model, action count, timing constants, panel width,
control layout) was made to match Demo 2 as closely as possible, differing
only where the reversal demands it. When reading or editing this file, always
check whether the corresponding change is needed in `HuffmanEncodingDemo.ts`.

**Shared data model with Demo 2**

`CharStep` (`{ char, leafId, edges: EdgeStep[] }`) and `buildEdgePath()` /
`findLeafId()` / `stripCounts()` are copied verbatim from Demo 2. They are
intentionally duplicated (not shared) to keep each demo self-contained.

**n+2 actions per character — same count as encoding, different order**

```
Encoding:  [leaf+char highlight]  [edge 0] … [edge n-1]  [cleanup]
Decoding:  [edge 0] … [edge n-1]  [leaf+brace+char]      [cleanup]
```

The leaf highlight moves from position 0 (encoding: we know the target
upfront) to position n (decoding: the leaf is discovered only after all bits
are consumed). Total action count per character is identical: `n + 2`.

**`rebuildDecDisplay(visibleUpTo)`**

Mirror of `HuffmanEncodingDemo.rebuildBitsDisplay`. For chars `< visibleUpTo`:
bits marked consumed, brace visible, output char visible. For chars
`>= visibleUpTo`: bits restored, brace hidden, output char hidden. Used for
instant backward jumps across multiple completed characters.

**Speed scaling**

Identical to Demo 2: `scaledDelay(baseMs)` with `requestAnimationFrame`
polling, fly duration computed inline as `BASE_FLY_MS / speedMultiplier`.
Timing constants (`BASE_STEP_MS = 800`, `BASE_ANIM_MS = 400`,
`BASE_FLY_MS = 500`) are the same values as Demo 2.
