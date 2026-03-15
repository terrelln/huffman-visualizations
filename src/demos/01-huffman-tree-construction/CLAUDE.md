# Demo 1 — Tree Construction

## What this demo shows

The double-queue (linear-time) Huffman tree construction algorithm, animated
step by step. The user supplies symbol→frequency pairs; the demo shows how
those symbols are sorted, then iteratively merged into a binary tree via two
queues:

- **Q_L (Leaf queue)** — the initial leaf nodes, consumed front-to-back in
  sorted order.
- **Q_T (Tree queue)** — merged internal nodes appended in creation order;
  because merged frequencies are non-decreasing, this queue stays sorted
  automatically, so a simple two-pointer minimum suffices.

Each iteration dequeues the two lowest-frequency items across both queue
fronts, creates a parent node whose frequency is their sum, and enqueues the
parent onto Q_T. The demo ends when a single root remains.

## Visualization design

**Layout**

- Left panel: the algorithm pseudocode (`pseudo-panel`), with active lines
  highlighted in yellow.
- Right area: an SVG tree (`tree-svg`) that animates node moves and additions
  using CSS transitions.
- The forest is rendered with two labeled sections separated by a dashed
  vertical line: Q_L on the left, Q_T on the right. Section labels (Q_L,
  Q_T with SVG subscripts) are drawn directly on the SVG.

**Color language**

- Blue (`.comparing`) — the two front-of-queue candidates being compared.
- Yellow/gold (`.merging`) — the node selected (winner of the comparison) or
  the two nodes about to be merged.
- Yellow highlight on pseudocode lines (`.active`) — tracks which lines of
  the algorithm are currently executing.

**Animations**

Each merge step is broken into sub-phases that play sequentially:

1. Highlight `while` condition.
2. For each of the two `dequeue_min` calls:
   - If both queues have candidates: show a floating comparison label
     (`"freq_a < freq_b"`) that flies from the midpoint between the two
     candidates to the winner node. Both candidates get `.comparing`.
   - Show the selected node with `.merging`.
3. Render the new parent node (SVG transition: nodes slide to new positions,
   new node scales in). A sum label (`"a + b = c"`) flies from the children
   midpoint to the new parent.
4. If complete, step through the `while` exit and `return` pseudocode lines.

**Comparison label** uses `comparison-label-bg` / `comparison-label-text`
(blue pill). **Sum label** uses `sum-label-bg` / `sum-label-text` (yellow pill).
Both are implemented via `TreeRenderer.flyLabel()`.

## Architectural choices

**Snapshot-driven playback**

`HuffmanAlgorithm.buildHuffmanSnapshots()` runs the full algorithm eagerly and
records a `HuffmanSnapshot` for every merge step, including the intermediate
`SelectionStep` metadata needed to reconstruct which nodes were compared.
`HuffmanDemo` replays these snapshots rather than running the algorithm live,
which keeps animation logic cleanly separated from algorithm logic.

**Action queue**

Within each snapshot, `buildActions()` produces an ordered list of `Action`
objects (`{ forward, backward }`). Both directions are explicit and reversible
— the backward path mirrors the forward path exactly, allowing the Prev button
to undo individual sub-phases without re-running the algorithm.

`remainingActions` holds actions yet to play; `completedActions` is a stack of
already-played actions used for backward navigation. Moving between snapshots
calls `goToStep` (forward) or `goToCompletedStep` (backward), which rebuilds
the action queue for that snapshot.

**Speed scaling**

All timed waits use `scaledDelay(baseMs)`, which polls `performance.now()`
via `requestAnimationFrame` and divides the base duration by
`speedMultiplier`. CSS transition durations are also divided by
`speedMultiplier` via `TreeRenderer.transitionDuration`. This means the speed
slider affects both JS delays and CSS animations uniformly.

**Pseudocode highlighting**

`PSEUDO_LINES` is a static array of `{ id, indent, html }` records. Each line
has a stable `id` used as a selector key. `updatePseudoHighlight(ids)` adds
`.active` to matching lines and computes `.active-first` / `.active-last` for
border-radius on contiguous highlighted blocks.

**Node IDs**

Leaf nodes use the symbol string (e.g. `"A"`) as their ID. Internal nodes use
auto-incrementing `"_1"`, `"_2"`, etc. IDs are stable across the entire
session, which lets the renderer diff old and new trees cleanly.
