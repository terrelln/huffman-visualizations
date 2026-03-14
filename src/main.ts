import './style.css';
import { HuffmanDemo } from './demo/HuffmanDemo';

const demoRoot = document.getElementById('demo-root')!;
const svgEl = document.getElementById('tree-svg') as unknown as SVGSVGElement;
const pseudoEl = document.getElementById('pseudo-panel') as HTMLElement;

new HuffmanDemo(demoRoot, svgEl, pseudoEl);
