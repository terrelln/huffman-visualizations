# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
This file should be updated as the repository structure changes to be kept up to date.

## Commands

```bash
npm run dev      # Start development server with HMR
npm run build    # tsc + vite build (TypeScript check then bundle)
npm run preview  # Preview production build
```

No test or lint commands exist.

## Architecture

**huf-viz** is an interactive Huffman encoding algorithm visualizer built with TypeScript and Vite — no UI framework, just DOM manipulation and SVG.

### Entry Flow

`index.html` → `src/main.ts` → `DemoPlayer` (mounts into `#app`)

`DemoPlayer` owns the persistent input controls (symbol frequency chips + input string field) and manages a swipe carousel with two demos:

1. **Demo 1 — Tree Construction** (`src/demos/01-huffman-tree-construction/`): Step-by-step animated walkthrough with pseudocode panel and play/pause/speed controls
2. **Demo 2 — Huffman Encoding** (`src/demos/02-huffman-encoding/`): Static display of the finished Huffman tree

### Core Data Flow

`HuffmanAlgorithm` takes symbol→frequency inputs and produces a list of **tree snapshots** — each snapshot captures a state of the double-queue algorithm (Q1: sorted leaves, Q2: merged nodes) along with metadata about what comparison or merge just occurred. `HuffmanDemo` replays these snapshots as animations.

### Key Components

- **`src/tree/BinaryTree.ts`** — data structure (nodes + forest roots)
- **`src/tree/TreeLayout.ts`** — Reingold-Tilford–style layout algorithm; supports forest rendering with two labeled sections (Q_L / Q_T)
- **`src/tree/TreeRenderer.ts`** — SVG-based renderer; handles animated node scale/fade, flying comparison labels (0/1/</>/=), and sum calculation labels
- **`src/demos/01-huffman-tree-construction/HuffmanAlgorithm.ts`** — core algorithm + snapshot generation
- **`src/demos/01-huffman-tree-construction/HuffmanDemo.ts`** — animation playback engine; each step is composed of reversible async actions

### Animation Pattern

All timed animations use a `scaledDelay(ms, getSpeedMultiplier)` pattern. The speed multiplier (0.2×–4×) comes from a callback so it can be changed mid-playback. Steps are snapshot-driven: the algorithm runs to completion first, then the UI replays the recorded steps.

### Pseudocode Style Guide

Pseudocode panels use Python-inspired syntax rendered as HTML. Each line is a `{ id, indent, html }` entry in a `PSEUDO_LINES` array. The `html` field is built with four coloring helpers:

| Helper | CSS class | Used for |
|--------|-----------|----------|
| `K(s)` | `.pk` (blue) | Keywords: `def`, `for`, `in`, `while`, `if`, `else`, `return`, `not` |
| `F(s)` | `.pf` (green) | Function/method names: `sort`, `dequeue_min`, `binary`, etc. |
| `O(s)` | `.po` (orange) | Operators and symbols: `=`, `+`, `-`, `≤`, `>`, `\|`, `λ`, `++`, `<<=` |
| `C(s)` | `.pc` (gray) | Comments, introduced with `▷` |

**Syntax conventions:**
- Function definitions: `` `${K('def')} ${F('name')}(params):` ``
- Assignment / equality: wrap `=` with `O`: `` `x ${O('=')} value` ``
- Comparisons: use Unicode via `O`: `O('≤')`, `O('>')`, `O('=')` (equality in conditions)
- Increment: **prefix** style only — `` `${O('++')}code` `` not `code++`
- Lambda / sort key: `` `${F('sort')}(xs, key ${O('=')} ${O('λ')} x: ...)` ``
- Absolute value / length bars: each `|` wrapped separately — `` `${O('|')}Q${O('|')}` ``
- Math subscripts: use HTML — `Q<sub>L</sub>`, `Q<sub>T</sub>`
- Comments: `` `${C('▷ note here')}` `` appended at end of line
- Blank separator lines between functions: `{ id: '', indent: 0, html: '' }`

**Indentation levels** (each level = 1.5 em):
- `0` — function definition (`def`)
- `1` — top-level body statements
- `2` — first-level nested block (loop/if body)
- `3` — second-level nested block

**Highlighting groups of lines:**

Multiple lines can be highlighted simultaneously by passing an array of IDs to `setPseudoHighlight`. Consecutive active lines must render as **one merged highlight block** with a single gold left-bar, not as separate pills. This is achieved with `active-first` / `active-last` CSS classes:

- `active-first` — applied to the first active line in a run (rounds top corners)
- `active-last` — applied to the last active line in a run (rounds bottom corners)
- A line that is the only active line gets both classes (fully rounded pill)

**Critical:** determine `active-first` / `active-last` by checking the target `active` Set, **not** by reading `.classList.contains('active')` on adjacent DOM elements. Reading DOM class state mid-iteration gives stale results from the previous highlight call, causing the first line of a group to incorrectly receive both classes and appear as its own separate pill:

```typescript
// Correct — check the set being applied
el.classList.toggle('active-first', !active.has(prevId));
el.classList.toggle('active-last',  !active.has(nextId));

// Wrong — reads stale DOM state from previous setPseudoHighlight call
el.classList.toggle('active-first', !prev?.classList.contains('active'));
el.classList.toggle('active-last',  !next?.classList.contains('active'));
```

**What to avoid:**
- Don't add guards (`if not last row:`, `if x > 0:`) around code that is a safe no-op without them — keep pseudocode minimal and honest.
- Don't use postfix `++` (`code++`); always use prefix (`++code`).

### CSS

All styling is in `src/style.css`. Color scheme: neutral grays with accent blue (`#0d6efd`) and yellow (`#f59f00`). State classes like `.comparing`, `.merging`, `.active`, `.active-first`, `.active-last` drive visual feedback.

**CSS specificity pitfall:** When reusing a state class (e.g. `.canon-row-active`) on elements styled by a different component's base class (e.g. `.depth-row`), the base class can silently override the state class if it sets the same property and appears later in the stylesheet. Always add a compound selector (e.g. `.depth-row.canon-row-active`) to ensure the state wins. After adding any visual state class, verify it actually has a visible effect — don't assume it works just because the JS is correct.

### Flying Animations

When animating a label to a target, fly it to the specific child element it relates to, not to the center of a parent container. For example, if a container displays both `W_C` and `W_T`, fly the `W_C` update to a `<span>` wrapping the `W_C` line, not to the container's center. Wrap target regions in elements with classes so they can be individually targeted.
