import { TreeRenderer } from '../tree/TreeRenderer';

import { buildHuffmanSnapshots } from './HuffmanAlgorithm';
import type { SymbolInput, HuffmanSnapshot, SelectionStep } from './HuffmanAlgorithm';

const BASE_STEP_MS = 1200; // how long each pseudocode phase is shown at 1× speed
const BASE_ANIM_MS = 500;  // CSS transition duration for node moves at 1× speed

const DEFAULT_SYMBOLS: SymbolInput[] = [
  { symbol: 'a', freq: 5 },
  { symbol: 'b', freq: 3 },
  { symbol: 'c', freq: 2 },
  { symbol: 'd', freq: 1 },
  { symbol: 'e', freq: 1 },
];

// ── Pseudocode ───────────────────────────────────────────────────────────────

interface PseudoLine {
  id: string;
  indent: number;
  html: string;
}

const K = (s: string) => `<span class="pk">${s}</span>`;
const F = (s: string) => `<span class="pf">${s}</span>`;
const O = (s: string) => `<span class="po">${s}</span>`;
const C = (s: string) => `<span class="pc">${s}</span>`;

const PSEUDO_LINES: PseudoLine[] = [
  { id: 'fn-huf', indent: 0, html: `${K('def')} ${F('huffman')}(symbols):` },
  { id: 'q1-init', indent: 1, html: `Q₁ = ${F('sort')}(symbols, key = ${O('λ')} s: s.freq)` },
  { id: 'q2-init', indent: 1, html: `Q₂ = []` },
  { id: 'while', indent: 1, html: `${K('while')} ${O('|')}Q₁${O('|')} + ${O('|')}Q₂${O('|')} > 1:` },
  { id: 'deq-a', indent: 2, html: `a = ${F('dequeue_min')}(Q₁, Q₂)` },
  { id: 'deq-b', indent: 2, html: `b = ${F('dequeue_min')}(Q₁, Q₂)` },
  { id: 'node-new', indent: 2, html: `node = ${F('Node')}(` },
  { id: 'node-freq', indent: 3, html: `freq  = a.freq + b.freq,` },
  { id: 'node-lr', indent: 3, html: `left  = a,  right = b` },
  { id: 'node-lr', indent: 2, html: `)` },
  { id: 'q2-app', indent: 2, html: `Q₂.${F('append')}(node)` },
  { id: 'return', indent: 1, html: `${K('return')} Q₁[0] ${K('if')} ${O('|')}Q₂${O('|')}=0 ${K('else')} Q₂[0]` },
  { id: '', indent: 0, html: '' },
  { id: 'fn-deq', indent: 0, html: `${K('def')} ${F('dequeue_min')}(Q₁, Q₂):` },
  { id: 'deq-q1e', indent: 1, html: `${K('if')} ${O('|')}Q₁${O('|')} = 0: ${K('return')} Q₂.${F('pop_front')}()` },
  { id: 'deq-q2e', indent: 1, html: `${K('if')} ${O('|')}Q₂${O('|')} = 0: ${K('return')} Q₁.${F('pop_front')}()` },
  { id: 'deq-cmp', indent: 1, html: `${K('if')} Q₁[0].freq ${O('≤')} Q₂[0].freq:` },
  { id: 'deq-r-q1', indent: 2, html: `${K('return')} Q₁.${F('pop_front')}()  ${C('▷ ties → Q₁')}` },
  { id: 'deq-else', indent: 1, html: `${K('else')}:` },
  { id: 'deq-r-q2', indent: 2, html: `${K('return')} Q₂.${F('pop_front')}()` },
];

function deqCompareLines(step: SelectionStep): string[] {
  if (!step.q1CandidateId) return ['fn-deq', 'deq-q1e'];
  if (!step.q2CandidateId) return ['fn-deq', 'deq-q2e'];
  return ['fn-deq', 'deq-cmp'];
}

function deqSelectedLines(step: SelectionStep): string[] {
  if (!step.q1CandidateId) return ['fn-deq', 'deq-q1e'];
  if (!step.q2CandidateId) return ['fn-deq', 'deq-q2e'];
  if (step.selectedId === step.q1CandidateId) return ['fn-deq', 'deq-cmp', 'deq-r-q1'];
  return ['fn-deq', 'deq-cmp', 'deq-else', 'deq-r-q2'];
}

function getPseudoLines(snap: HuffmanSnapshot, stepIndex: number): string[] {
  if (!snap.selectionSteps) {
    if (stepIndex === 0) return ['fn-huf'];
    return ['q1-init', 'q2-init'];
  }
  const main = ['while', 'deq-a', 'deq-b', 'node-new', 'node-freq', 'node-lr', 'q2-app'];
  const deqSet = new Set<string>();
  for (const step of snap.selectionSteps) {
    for (const id of deqSelectedLines(step)) deqSet.add(id);
  }
  const result = [...main, ...deqSet];
  if (snap.isComplete) result.push('return');
  return result;
}

// ── Phase types ──────────────────────────────────────────────────────────────

// A BiPhase has a forward action and its exact inverse.
// Next runs forward phases in order; Prev runs backward phases in reverse order.
interface BiPhase {
  forward: () => Promise<void>;
  backward: () => Promise<void>;
}

// ── Demo class ───────────────────────────────────────────────────────────────

export class HuffmanDemo {
  private container: HTMLElement;
  private svgEl: SVGSVGElement;
  private pseudoEl: HTMLElement;
  private renderer: TreeRenderer;

  private snapshots: HuffmanSnapshot[] = [];
  private currentStep = 0;

  // Phases not yet run (Next consumes from front)
  private remainingPhases: BiPhase[] = [];
  // Phases already run (Prev consumes from back)
  private completedPhases: BiPhase[] = [];
  private isAnimating = false;
  private isPlaying = true;
  private speedMultiplier = 1;

  private scaledDelay(baseMs: number): Promise<void> {
    return new Promise<void>(resolve => {
      const start = performance.now();
      const tick = () => {
        if (performance.now() - start >= baseMs / this.speedMultiplier) {
          resolve();
        } else {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });
  }

  private stepLabel!: HTMLElement;
  private stepDesc!: HTMLElement;
  private prevBtn!: HTMLButtonElement;
  private playBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;

  constructor(container: HTMLElement, svgEl: SVGSVGElement, pseudoEl: HTMLElement) {
    this.container = container;
    this.svgEl = svgEl;
    this.pseudoEl = pseudoEl;
    this.renderer = new TreeRenderer({ svgEl });
    this.svgEl.style.display = 'none';
    this.buildPseudocodePanel();
    this.pseudoEl.style.display = 'none';
    this.buildInputPhase();
  }

  // ── Pseudocode panel ────────────────────────────────────────────────────────

  private buildPseudocodePanel(): void {
    this.pseudoEl.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'pseudo-header';
    header.textContent = 'Algorithm';
    this.pseudoEl.appendChild(header);

    const body = document.createElement('div');
    body.className = 'pseudo-body';
    for (const line of PSEUDO_LINES) {
      const div = document.createElement('div');
      div.className = 'pseudo-line';
      if (line.id) div.dataset.id = line.id;
      div.dataset.indent = String(line.indent);
      div.innerHTML = line.html || '&nbsp;';
      body.appendChild(div);
    }
    this.pseudoEl.appendChild(body);
  }

  private updatePseudoHighlight(ids: string[]): void {
    const active = new Set(ids);
    const lines = Array.from(this.pseudoEl.querySelectorAll<HTMLElement>('.pseudo-line'));
    for (const div of lines) {
      const id = div.dataset.id ?? '';
      div.classList.toggle('active', id !== '' && active.has(id));
      div.classList.remove('active-first', 'active-last');
    }
    // Mark first/last of each contiguous active group for bar-shaped rounding
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].classList.contains('active')) continue;
      if (!lines[i - 1]?.classList.contains('active')) lines[i].classList.add('active-first');
      if (!lines[i + 1]?.classList.contains('active')) lines[i].classList.add('active-last');
    }
  }

  // ── Phase queue ─────────────────────────────────────────────────────────────

  private async runPhase(fn: () => Promise<void>): Promise<void> {
    this.isAnimating = true;
    this.prevBtn.disabled = true;
    this.nextBtn.disabled = true;
    // playBtn stays interactive so the user can pause mid-animation
    await fn();
    this.isAnimating = false;
    this.updateNavButtons();
  }

  private updateNavButtons(): void {
    const snap = this.snapshots[this.currentStep];
    const allDone = snap.isComplete && this.remainingPhases.length === 0 && !this.isAnimating;
    this.prevBtn.disabled = this.currentStep === 0 && this.completedPhases.length === 0;
    this.nextBtn.disabled = allDone;
    this.nextBtn.textContent = allDone ? 'Done ✓' : 'Next →';
    if (allDone) {
      this.playBtn.disabled = false;
      this.playBtn.textContent = '↺ Replay';
      this.playBtn.className = 'btn-primary';
    } else {
      this.playBtn.disabled = false;
      this.playBtn.textContent = this.isPlaying ? '⏸ Pause' : '▶ Play';
      this.playBtn.className = this.isPlaying ? 'btn-secondary' : 'btn-primary';
    }
  }

  private togglePlay(): void {
    const snap = this.snapshots[this.currentStep];
    const allDone = snap.isComplete && this.remainingPhases.length === 0 && !this.isAnimating;
    if (allDone) {
      this.isPlaying = true;
      this.updateNavButtons();
      void this.goToStep(0, /*forward=*/true).then(() => void this.playLoop());
      return;
    }
    this.isPlaying = !this.isPlaying;
    this.updateNavButtons();
    if (this.isPlaying) void this.playLoop();
  }

  private async playLoop(): Promise<void> {
    while (this.isPlaying) {
      const snap = this.snapshots[this.currentStep];
      if (snap.isComplete && this.remainingPhases.length === 0) {
        this.isPlaying = false;
        this.updateNavButtons();
        break;
      }
      await this.handleNext();
    }
  }

  private async handleNext(): Promise<void> {
    if (this.isAnimating) return;
    if (this.remainingPhases.length > 0) {
      const phase = this.remainingPhases.shift()!;
      await this.runPhase(phase.forward);
      this.completedPhases.push(phase);
    } else {
      await this.goToStep(this.currentStep + 1, /*forward=*/true);
    }
  }

  private async handlePrev(): Promise<void> {
    if (this.isAnimating) return;
    if (this.isPlaying) {
      this.isPlaying = false;
      this.updateNavButtons();
    }
    if (this.completedPhases.length > 0) {
      const phase = this.completedPhases.pop()!;
      await this.runPhase(phase.backward);
      this.remainingPhases.unshift(phase);
    } else {
      await this.goToCompletedStep(this.currentStep - 1);
    }
  }

  // Advance forward to a new snapshot, building a phase queue for merge steps.
  private async goToStep(index: number, forward: boolean): Promise<void> {
    this.currentStep = Math.max(0, Math.min(index, this.snapshots.length - 1));
    const snap = this.snapshots[this.currentStep];

    this.stepLabel.textContent = snap.stepLabel;
    this.stepDesc.textContent = snap.description;

    if (forward && snap.selectionSteps) {
      // Merge step: build bidirectional phase queue, run first phase
      const phases = this.buildBiPhases(snap);
      this.remainingPhases = phases;
      this.completedPhases = [];
      const first = this.remainingPhases.shift()!;
      await this.runPhase(first.forward);
      this.completedPhases.push(first);
    } else {
      // Non-merge step: render and hold so the step is visible during auto-play
      this.updatePseudoHighlight(getPseudoLines(snap, this.currentStep));
      this.remainingPhases = [];
      this.completedPhases = [];
      await this.runPhase(async () => {
        this.renderer.update(snap.tree, snap.sections);
        await this.scaledDelay(BASE_STEP_MS);
      });
    }
  }

  // Jump to a snapshot in its completed state (used by Prev when crossing snapshots).
  // Reconstructs completedPhases so Prev can continue undoing into it.
  private async goToCompletedStep(index: number): Promise<void> {
    if (index < 0) return;
    this.currentStep = index;
    const snap = this.snapshots[this.currentStep];

    this.stepLabel.textContent = snap.stepLabel;
    this.stepDesc.textContent = snap.description;
    this.updatePseudoHighlight(getPseudoLines(snap, this.currentStep));

    // Reconstruct all phases as "completed" so Prev can undo them in reverse
    this.completedPhases = snap.selectionSteps ? this.buildBiPhases(snap) : [];
    this.remainingPhases = [];

    await this.runPhase(async () => {
      this.renderer.clearHighlights();
      this.renderer.update(snap.tree, snap.sections);
    });
  }

  // Build the ordered BiPhase list for one forward merge step.
  // Must be called with this.currentStep already set to the merge snapshot's index.
  private buildBiPhases(snap: HuffmanSnapshot): BiPhase[] {
    const prevIndex = this.currentStep - 1;
    const prevSnap = this.snapshots[prevIndex];
    const prevPseudoCompleted = prevSnap
      ? getPseudoLines(prevSnap, prevIndex)
      : [];

    const phases: BiPhase[] = [];
    // Track pseudocode state as phases are built, so each backward can restore the prior state.
    let pseudoState = prevPseudoCompleted;

    // ── Phase: while condition ──────────────────────────────────────────────
    const p0Before = pseudoState;
    phases.push({
      forward: async () => { this.updatePseudoHighlight(['while']); await this.scaledDelay(BASE_STEP_MS); },
      backward: async () => { this.updatePseudoHighlight(p0Before); },
    });
    pseudoState = ['while'];

    // ── Phases: two dequeue selections ─────────────────────────────────────
    for (let si = 0; si < snap.selectionSteps!.length; si++) {
      const step = snap.selectionSteps![si];
      const deqLine = si === 0 ? 'deq-a' : 'deq-b';
      const candidates = [step.q1CandidateId, step.q2CandidateId]
        .filter((id): id is string => !!id);

      if (candidates.length >= 2) {
        // Comparison phase (blue highlight + flying label)
        const cmpBefore = pseudoState;
        const cmpLines = [deqLine, ...deqCompareLines(step)];
        phases.push({
          forward: async () => {
            this.updatePseudoHighlight(cmpLines);
            this.renderer.setComparing(candidates, true);
            await this.renderer.showComparisonAnimation(
              step.q1CandidateId!, step.q2CandidateId!,
              step.q1CandidateFreq!, step.q2CandidateFreq!,
              step.selectedId,
            );
            this.renderer.setComparing(candidates, false);
          },
          backward: async () => {
            // comparing was cleared by forward; just restore pseudocode
            this.updatePseudoHighlight(cmpBefore);
          },
        });
        pseudoState = cmpLines;
      }

      // Selection phase (amber highlight)
      const selBefore = pseudoState;
      const selLines = [deqLine, ...deqSelectedLines(step)];
      const selectedId = step.selectedId;
      phases.push({
        forward: async () => {
          this.updatePseudoHighlight(selLines);
          this.renderer.setHighlight([selectedId], true);
          await this.scaledDelay(BASE_STEP_MS);
        },
        backward: async () => {
          this.updatePseudoHighlight(selBefore);
          this.renderer.setHighlight([selectedId], false);
        },
      });
      pseudoState = selLines;
    }

    // ── Phase: node creation + merge animation + sum label ─────────────────
    const mergeLines = [
      'node-new', 'node-freq', 'node-lr', 'q2-app',
      ...(snap.isComplete ? ['return'] : []),
    ];
    const mergeBefore = pseudoState;
    const mergingIds = [...snap.mergingIds!] as [string, string];
    phases.push({
      forward: async () => {
        this.updatePseudoHighlight(mergeLines);
        this.renderer.update(snap.tree, snap.sections);
        await this.scaledDelay(BASE_ANIM_MS);
        this.renderer.setHighlight(mergingIds, false);
        if (snap.mergingFreqs && snap.mergedParentId) {
          await this.renderer.showSumAnimation(
            mergingIds[0], mergingIds[1],
            snap.mergingFreqs[0], snap.mergingFreqs[1],
            snap.mergedParentId,
          );
        }
      },
      backward: async () => {
        // Re-render prevSnap tree (reverse of merge) then restore both nodes amber
        this.updatePseudoHighlight(mergeBefore);
        this.renderer.update(prevSnap.tree, prevSnap.sections);
        await this.scaledDelay(BASE_ANIM_MS);
        this.renderer.setHighlight(mergingIds, true);
      },
    });

    return phases;
  }

  // ── Input phase ─────────────────────────────────────────────────────────────

  private buildInputPhase(): void {
    this.container.innerHTML = '';
    this.svgEl.style.display = 'none';
    this.pseudoEl.style.display = 'none';

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

  // ── Viz phase ───────────────────────────────────────────────────────────────

  private startVisualization(inputs: SymbolInput[]): void {
    this.snapshots = buildHuffmanSnapshots(inputs);
    this.currentStep = 0;
    this.remainingPhases = [];
    this.completedPhases = [];

    this.container.innerHTML = '';
    while (this.svgEl.firstChild) this.svgEl.firstChild.remove();
    this.renderer = new TreeRenderer({
      svgEl: this.svgEl,
      transitionDuration: BASE_ANIM_MS,
      getSpeedMultiplier: () => this.speedMultiplier,
    });
    this.svgEl.style.display = '';
    this.pseudoEl.style.display = '';

    const phase = document.createElement('div');
    phase.className = 'phase-viz';

    const header = document.createElement('div');
    header.className = 'viz-header';

    this.stepLabel = document.createElement('span');
    this.stepLabel.className = 'step-label';

    this.stepDesc = document.createElement('p');
    this.stepDesc.className = 'step-desc';

    header.appendChild(this.stepLabel);
    header.appendChild(this.stepDesc);

    const controls = document.createElement('div');
    controls.className = 'viz-controls';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn-secondary';
    resetBtn.textContent = '← Reset';
    resetBtn.addEventListener('click', () => this.buildInputPhase());

    this.prevBtn = document.createElement('button');
    this.prevBtn.className = 'btn-secondary';
    this.prevBtn.textContent = '← Prev';
    this.prevBtn.addEventListener('click', () => { void this.handlePrev(); });

    this.playBtn = document.createElement('button');
    this.playBtn.className = 'btn-secondary';
    this.playBtn.textContent = '⏸ Pause';
    this.playBtn.addEventListener('click', () => this.togglePlay());

    this.nextBtn = document.createElement('button');
    this.nextBtn.className = 'btn-secondary';
    this.nextBtn.textContent = 'Next →';
    this.nextBtn.addEventListener('click', () => { void this.handleNext(); });

    controls.appendChild(resetBtn);
    controls.appendChild(this.prevBtn);
    controls.appendChild(this.playBtn);
    controls.appendChild(this.nextBtn);

    const speedRow = document.createElement('div');
    speedRow.className = 'viz-speed';

    const speedLabel = document.createElement('span');
    speedLabel.className = 'speed-label';
    speedLabel.textContent = 'Speed';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(Math.log2(0.2));
    slider.max = String(Math.log2(2));
    slider.step = '0.01';
    slider.value = '0'; // log2(1) = 0 → 1× speed
    slider.className = 'speed-slider';
    slider.addEventListener('input', () => {
      this.speedMultiplier = Math.pow(2, parseFloat(slider.value));
    });

    speedRow.appendChild(speedLabel);
    speedRow.appendChild(slider);

    phase.appendChild(header);
    phase.appendChild(controls);
    phase.appendChild(speedRow);
    this.container.appendChild(phase);

    void this.goToStep(0, /*forward=*/false).then(() => {
      if (this.isPlaying) void this.playLoop();
    });
  }
}
