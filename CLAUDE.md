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

### Pseudocode Coloring

`HuffmanDemo` uses short utility functions (`K`, `F`, `O`, `C`) to emit syntax-colored HTML spans for keywords, function names, operators, and comments in the pseudocode panel.

### CSS

All styling is in `src/style.css`. Color scheme: neutral grays with accent blue (`#0d6efd`) and yellow (`#f59f00`). State classes like `.comparing`, `.merging`, `.active`, `.active-first`, `.active-last` drive visual feedback.
