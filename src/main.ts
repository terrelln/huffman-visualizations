import './style.css';
import { HuffmanDemo } from './demos/01-huffman-tree-construction/HuffmanDemo';

const inputEl      = document.getElementById('demo-root')! as HTMLElement;
const controlsEl   = document.getElementById('viz-controls-root')! as HTMLElement;
const svgEl        = document.getElementById('tree-svg') as unknown as SVGSVGElement;
const pseudoEl     = document.getElementById('pseudo-panel') as HTMLElement;

new HuffmanDemo(inputEl, controlsEl, svgEl, pseudoEl);
