import { TreeRenderer } from '../tree/TreeRenderer';

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
import { buildHuffmanSnapshots } from './HuffmanAlgorithm';
import type { SymbolInput, HuffmanSnapshot } from './HuffmanAlgorithm';

const DEFAULT_SYMBOLS: SymbolInput[] = [
  { symbol: 'a', freq: 5 },
  { symbol: 'b', freq: 3 },
  { symbol: 'c', freq: 2 },
  { symbol: 'd', freq: 1 },
  { symbol: 'e', freq: 1 },
];

export class HuffmanDemo {
  private container: HTMLElement;
  private svgEl: SVGSVGElement;
  private renderer: TreeRenderer;

  private snapshots: HuffmanSnapshot[] = [];
  private currentStep = 0;

  // Viz-phase elements (set during buildVizPhase)
  private stepLabel!: HTMLElement;
  private stepDesc!: HTMLElement;
  private prevBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;

  constructor(container: HTMLElement, svgEl: SVGSVGElement) {
    this.container = container;
    this.svgEl = svgEl;
    this.renderer = new TreeRenderer({ svgEl });
    this.svgEl.style.display = 'none';
    this.buildInputPhase();
  }

  // ── Input phase ────────────────────────────────────────────────────────────

  private buildInputPhase(): void {
    this.container.innerHTML = '';
    this.svgEl.style.display = 'none';

    const phase = document.createElement('div');
    phase.className = 'phase-input';

    const rowsContainer = document.createElement('div');
    rowsContainer.className = 'symbol-rows';
    for (const { symbol, freq } of DEFAULT_SYMBOLS) {
      rowsContainer.appendChild(this.createSymbolRow(symbol, freq, rowsContainer));
    }

    const errorEl = document.createElement('p');
    errorEl.className = 'input-error';
    errorEl.hidden = true;

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-secondary';
    addBtn.textContent = '+ Add symbol';
    addBtn.addEventListener('click', () => {
      const row = this.createSymbolRow('', 1, rowsContainer);
      rowsContainer.appendChild(row);
      (row.querySelector('.sym-input') as HTMLInputElement).focus();
    });

    const startBtn = document.createElement('button');
    startBtn.className = 'btn-primary';
    startBtn.textContent = 'Visualize →';
    startBtn.addEventListener('click', () => {
      const inputs = this.readSymbolRows(rowsContainer);
      const error = this.validateInputs(inputs);
      if (error) {
        errorEl.textContent = error;
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;
      this.startVisualization(inputs);
    });

    const actions = document.createElement('div');
    actions.className = 'input-actions';
    actions.appendChild(addBtn);
    actions.appendChild(startBtn);

    phase.appendChild(rowsContainer);
    phase.appendChild(actions);
    phase.appendChild(errorEl);
    this.container.appendChild(phase);
  }

  private createSymbolRow(symbol: string, freq: number, container: HTMLElement): HTMLElement {
    const row = document.createElement('div');
    row.className = 'symbol-row';

    const symInput = document.createElement('input');
    symInput.type = 'text';
    symInput.className = 'sym-input';
    symInput.placeholder = 'Symbol';
    symInput.value = symbol;
    symInput.maxLength = 10;

    const freqInput = document.createElement('input');
    freqInput.type = 'number';
    freqInput.className = 'freq-input';
    freqInput.placeholder = 'Count';
    freqInput.value = freq > 0 ? String(freq) : '';
    freqInput.min = '1';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', 'Remove row');
    removeBtn.addEventListener('click', () => {
      if (container.querySelectorAll('.symbol-row').length > 1) row.remove();
    });

    row.appendChild(symInput);
    row.appendChild(freqInput);
    row.appendChild(removeBtn);
    return row;
  }

  private readSymbolRows(container: HTMLElement): SymbolInput[] {
    return Array.from(container.querySelectorAll('.symbol-row')).map(row => ({
      symbol: (row.querySelector('.sym-input') as HTMLInputElement).value.trim(),
      freq: parseInt((row.querySelector('.freq-input') as HTMLInputElement).value, 10),
    }));
  }

  private validateInputs(inputs: SymbolInput[]): string | null {
    if (inputs.length < 2) return 'Enter at least 2 symbols.';
    const seen = new Set<string>();
    for (const { symbol, freq } of inputs) {
      if (!symbol) return 'Symbol names cannot be empty.';
      if (seen.has(symbol)) return `Duplicate symbol: "${symbol}"`;
      seen.add(symbol);
      if (!Number.isInteger(freq) || freq < 1) return `Count for "${symbol}" must be a positive integer.`;
    }
    return null;
  }

  // ── Viz phase ──────────────────────────────────────────────────────────────

  private startVisualization(inputs: SymbolInput[]): void {
    this.snapshots = buildHuffmanSnapshots(inputs);
    this.currentStep = 0;

    this.container.innerHTML = '';

    // Rebuild renderer against a fresh SVG
    while (this.svgEl.firstChild) this.svgEl.firstChild.remove();
    this.renderer = new TreeRenderer({ svgEl: this.svgEl });
    this.svgEl.style.display = '';

    const phase = document.createElement('div');
    phase.className = 'phase-viz';

    // Header: step label + description
    const header = document.createElement('div');
    header.className = 'viz-header';

    this.stepLabel = document.createElement('span');
    this.stepLabel.className = 'step-label';

    this.stepDesc = document.createElement('p');
    this.stepDesc.className = 'step-desc';

    header.appendChild(this.stepLabel);
    header.appendChild(this.stepDesc);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'viz-controls';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn-secondary';
    resetBtn.textContent = '← Reset';
    resetBtn.addEventListener('click', () => this.buildInputPhase());

    this.prevBtn = document.createElement('button');
    this.prevBtn.className = 'btn-secondary';
    this.prevBtn.textContent = '← Prev';
    this.prevBtn.addEventListener('click', () => { void this.showStep(this.currentStep - 1); });

    this.nextBtn = document.createElement('button');
    this.nextBtn.className = 'btn-primary';
    this.nextBtn.textContent = 'Next →';
    this.nextBtn.addEventListener('click', () => { void this.showStep(this.currentStep + 1); });

    controls.appendChild(resetBtn);
    controls.appendChild(this.prevBtn);
    controls.appendChild(this.nextBtn);

    phase.appendChild(header);
    phase.appendChild(controls);
    this.container.appendChild(phase);

    this.showStep(0);
  }

  private async showStep(index: number): Promise<void> {
    const prevStep = this.currentStep;
    this.currentStep = Math.max(0, Math.min(index, this.snapshots.length - 1));
    const snap = this.snapshots[this.currentStep];

    this.stepLabel.textContent = snap.stepLabel;
    this.stepDesc.textContent = snap.description;

    // Disable navigation during animation
    this.prevBtn.disabled = true;
    this.nextBtn.disabled = true;

    // Forward: highlight nodes about to be merged.
    // Backward: highlight the nodes that were merged (now children in current tree).
    const highlightIds =
      index > prevStep ? snap.mergingIds :
      index < prevStep ? this.snapshots[prevStep].mergingIds :
      undefined;

    if (highlightIds) {
      this.renderer.setHighlight(highlightIds, true);
      await delay(200);
      this.renderer.update(snap.tree, snap.sections);
      await delay(this.renderer.transitionDuration);
      this.renderer.setHighlight(highlightIds, false);
    } else {
      this.renderer.update(snap.tree, snap.sections);
    }

    this.prevBtn.disabled = this.currentStep === 0;
    this.nextBtn.disabled = snap.isComplete;
    this.nextBtn.textContent = snap.isComplete ? 'Done ✓' : 'Next →';
  }
}
