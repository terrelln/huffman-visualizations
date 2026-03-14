import './style.css';
import { HuffmanDemo } from './demo/HuffmanDemo';

const svgEl = document.getElementById('tree-svg') as unknown as SVGSVGElement;
const btnEl = document.getElementById('next-btn') as HTMLButtonElement;
const labelEl = document.getElementById('step-label') as HTMLSpanElement;

const demo = new HuffmanDemo(svgEl, btnEl, labelEl);
btnEl.addEventListener('click', () => demo.nextStep());
demo.start();
