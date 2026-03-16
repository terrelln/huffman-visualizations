# huf-viz

Interactive Huffman encoding algorithm visualizer. Step through tree construction, encoding, decoding, canonicalization, depth limiting, and table-based operations with animated demos.

Built with TypeScript and Vite — no UI framework, just DOM manipulation and SVG.

## Demos

1. **Tree Construction** — Step-by-step Huffman tree building using the double-queue algorithm
2. **Naive Huffman Encoding** — Encode a string by traversing the tree
3. **Naive Huffman Decoding** — Decode a bitstream by traversing the tree
4. **Huffman Canonicalization** — Convert to canonical Huffman codes
5. **Huffman Depth Limiting** — Limit tree depth while preserving optimality
6. **Table-based Encoding** — Encode using a canonical symbol table
7. **Decoding Table Construction** — Build a single-level lookup table
8. **Table-based Decoding** — Decode using the lookup table

## Build

```bash
npm install
npm run build
```

## Development

```bash
npm run dev       # Start dev server with HMR
npm run preview   # Preview production build
```
