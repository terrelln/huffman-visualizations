import { TreeRenderer } from '../tree/TreeRenderer';

import { buildHuffmanSnapshots } from './HuffmanAlgorithm';
import type { SymbolInput, HuffmanSnapshot, SelectionStep } from './HuffmanAlgorithm';

const BASE_STEP_MS = 1200; // how long each pseudocode phase is shown at 1× speed
const BASE_ANIM_MS = 500;  // CSS transition duration for node moves at 1× speed

const DEFAULT_SYMBOLS: SymbolInput[] = [
  { symbol: 'A', freq: 5 },
  { symbol: 'B', freq: 3 },
  { symbol: 'C', freq: 2 },
  { symbol: 'D', freq: 1 },
  { symbol: 'E', freq: 1 },
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
  { id: 'q1-init', indent: 1, html: `Q<sub>L</sub> = ${F('sort')}(symbols, key = ${O('λ')} s: s.freq)` },
  { id: 'q2-init', indent: 1, html: `Q<sub>T</sub> = []` },
  { id: 'while', indent: 1, html: `${K('while')} ${O('|')}Q<sub>L</sub>${O('|')} + ${O('|')}Q<sub>T</sub>${O('|')} > 1:` },
  { id: 'deq-a', indent: 2, html: `a = ${F('dequeue_min')}(Q<sub>L</sub>, Q<sub>T</sub>)` },
  { id: 'deq-b', indent: 2, html: `b = ${F('dequeue_min')}(Q<sub>L</sub>, Q<sub>T</sub>)` },
  { id: 'node-new', indent: 2, html: `node = ${F('Node')}(` },
  { id: 'node-freq', indent: 3, html: `freq  = a.freq + b.freq,` },
  { id: 'node-lr', indent: 3, html: `left  = a,  right = b` },
  { id: 'node-lr', indent: 2, html: `)` },
  { id: 'q2-app', indent: 2, html: `Q<sub>T</sub>.${F('append')}(node)` },
  { id: 'return', indent: 1, html: `${K('return')} Q<sub>L</sub>[0] ${K('if')} ${O('|')}Q<sub>T</sub>${O('|')}=0 ${K('else')} Q<sub>T</sub>[0]` },
  { id: '', indent: 0, html: '' },
  { id: 'fn-deq', indent: 0, html: `${K('def')} ${F('dequeue_min')}(Q<sub>L</sub>, Q<sub>T</sub>):` },
  { id: 'deq-q1e', indent: 1, html: `${K('if')} ${O('|')}Q<sub>L</sub>${O('|')} = 0: ${K('return')} Q<sub>T</sub>.${F('pop_front')}()` },
  { id: 'deq-q2e', indent: 1, html: `${K('if')} ${O('|')}Q<sub>T</sub>${O('|')} = 0: ${K('return')} Q<sub>L</sub>.${F('pop_front')}()` },
  { id: 'deq-cmp', indent: 1, html: `${K('if')} Q<sub>L</sub>[0].freq ${O('≤')} Q<sub>T</sub>[0].freq:` },
  { id: 'deq-r-q1', indent: 2, html: `${K('return')} Q<sub>L</sub>.${F('pop_front')}()  ${C('▷ ties → Q<sub>L</sub>')}` },
  { id: 'deq-else', indent: 1, html: `${K('else')}:` },
  { id: 'deq-r-q2', indent: 2, html: `${K('return')} Q<sub>T</sub>.${F('pop_front')}()` },
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

// ── Action types ─────────────────────────────────────────────────────────────

// An Action has a forward step and its exact inverse.
// Next runs actions forward in order; Prev runs them backward in reverse order.
interface Action {
  forward: () => Promise<void>;
  backward: () => Promise<void>;
}

// ── Demo class ───────────────────────────────────────────────────────────────

export class HuffmanDemo {
  private inputEl: HTMLElement;
  private controlsEl: HTMLElement;
  private svgEl: SVGSVGElement;
  private pseudoEl: HTMLElement;
  private renderer: TreeRenderer;

  private snapshots: HuffmanSnapshot[] = [];
  private currentStep = 0;

  // Actions not yet run (Next consumes from front)
  private remainingActions: Action[] = [];
  // Actions already run (Prev consumes from back)
  private completedActions: Action[] = [];
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

  private prevBtn!: HTMLButtonElement;
  private playBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;

  constructor(inputEl: HTMLElement, controlsEl: HTMLElement, svgEl: SVGSVGElement, pseudoEl: HTMLElement) {
    this.inputEl = inputEl;
    this.controlsEl = controlsEl;
    this.svgEl = svgEl;
    this.pseudoEl = pseudoEl;
    this.renderer = new TreeRenderer({ svgEl });
    this.svgEl.style.display = 'none';
    this.buildPseudocodePanel();
    this.pseudoEl.style.display = 'none';
    this.buildInputStrip();
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
    const allDone = snap.isComplete && this.remainingActions.length === 0 && !this.isAnimating;
    this.prevBtn.disabled = this.currentStep === 0 && this.completedActions.length === 0;
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
    const allDone = snap.isComplete && this.remainingActions.length === 0 && !this.isAnimating;
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
      if (snap.isComplete && this.remainingActions.length === 0) {
        this.isPlaying = false;
        this.updateNavButtons();
        break;
      }
      await this.handleNext();
    }
  }

  private async handleNext(): Promise<void> {
    if (this.isAnimating) return;
    if (this.remainingActions.length > 0) {
      const phase = this.remainingActions.shift()!;
      await this.runPhase(phase.forward);
      this.completedActions.push(phase);
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
    if (this.completedActions.length > 0) {
      const phase = this.completedActions.pop()!;
      this.remainingActions.unshift(phase);
      await this.runPhase(phase.backward);
    } else {
      await this.goToCompletedStep(this.currentStep - 1);
    }
  }

  // Advance forward to a new snapshot, building a phase queue for merge steps.
  private async goToStep(index: number, forward: boolean): Promise<void> {
    this.currentStep = Math.max(0, Math.min(index, this.snapshots.length - 1));
    const snap = this.snapshots[this.currentStep];


    if (forward && snap.selectionSteps) {
      // Merge step: build bidirectional phase queue, run first phase
      const phases = this.buildActions(snap);
      this.remainingActions = phases;
      this.completedActions = [];
      const first = this.remainingActions.shift()!;
      await this.runPhase(first.forward);
      this.completedActions.push(first);
    } else {
      // Non-merge step: render and hold so the step is visible during auto-play
      this.updatePseudoHighlight(getPseudoLines(snap, this.currentStep));
      this.remainingActions = [];
      this.completedActions = [];
      await this.runPhase(async () => {
        this.renderer.update(snap.tree, snap.sections);
        await this.scaledDelay(BASE_STEP_MS);
      });
    }
  }

  // Jump to a snapshot in its completed state (used by Prev when crossing snapshots).
  // Reconstructs completedActions so Prev can continue undoing into it.
  private async goToCompletedStep(index: number): Promise<void> {
    if (index < 0) return;
    this.currentStep = index;
    const snap = this.snapshots[this.currentStep];

    this.updatePseudoHighlight(getPseudoLines(snap, this.currentStep));

    // Reconstruct all phases as "completed" so Prev can undo them in reverse
    this.completedActions = snap.selectionSteps ? this.buildActions(snap) : [];
    this.remainingActions = [];

    await this.runPhase(async () => {
      this.renderer.clearHighlights();
      this.renderer.update(snap.tree, snap.sections);
    });
  }

  // Build the ordered Action list for one forward merge step.
  // Must be called with this.currentStep already set to the merge snapshot's index.
  private buildActions(snap: HuffmanSnapshot): Action[] {
    const prevIndex = this.currentStep - 1;
    const prevSnap = this.snapshots[prevIndex];
    const prevPseudoCompleted = prevSnap
      ? getPseudoLines(prevSnap, prevIndex)
      : [];

    const actions: Action[] = [];
    // Track pseudocode state as actions are built, so each backward can restore the prior state.
    let pseudoState = prevPseudoCompleted;

    // ── Action: while condition ─────────────────────────────────────────────
    const p0Before = pseudoState;
    actions.push({
      forward: async () => { this.updatePseudoHighlight(['while']); await this.scaledDelay(BASE_STEP_MS); },
      backward: async () => { this.updatePseudoHighlight(p0Before); },
    });
    pseudoState = ['while'];

    // ── Actions: two dequeue selections ────────────────────────────────────
    for (let si = 0; si < snap.selectionSteps!.length; si++) {
      const step = snap.selectionSteps![si];
      const deqLine = si === 0 ? 'deq-a' : 'deq-b';
      const candidates = [step.q1CandidateId, step.q2CandidateId]
        .filter((id): id is string => !!id);

      if (candidates.length >= 2) {
        // Comparison phase (blue highlight + flying label)
        const cmpBefore = pseudoState;
        const cmpLines = [deqLine, ...deqCompareLines(step)];
        actions.push({
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
            // Exact inverse of forward (steps 4r, 3r, 2r, 1r):
            this.renderer.setComparing(candidates, true);
            await this.renderer.showComparisonAnimationReverse(
              step.q1CandidateId!, step.q2CandidateId!,
              step.q1CandidateFreq!, step.q2CandidateFreq!,
              step.selectedId,
            );
            this.renderer.setComparing(candidates, false);
            this.updatePseudoHighlight(cmpBefore);
          },
        });
        pseudoState = cmpLines;
      }

      // Selection phase (amber highlight)
      const selBefore = pseudoState;
      const selLines = [deqLine, ...deqSelectedLines(step)];
      const selectedId = step.selectedId;
      actions.push({
        forward: async () => {
          this.updatePseudoHighlight(selLines);
          this.renderer.setHighlight([selectedId], true);
          await this.scaledDelay(BASE_STEP_MS);
        },
        backward: async () => {
          // Exact inverse of forward (steps 2r, 1r):
          this.renderer.setHighlight([selectedId], false);
          this.updatePseudoHighlight(selBefore);
        },
      });
      pseudoState = selLines;
    }

    // ── Action: node creation + merge animation + sum label ────────────────
    const mergeLines = ['node-new', 'node-freq', 'node-lr', 'q2-app'];
    const mergeBefore = pseudoState;
    const mergingIds = [...snap.mergingIds!] as [string, string];
    actions.push({
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
        // Exact inverse of forward (steps 5r, 4r, 3r, 2r, 1r):
        // 5r: play sum animation in reverse — must run before renderer.update removes the parent
        if (snap.mergingFreqs && snap.mergedParentId) {
          await this.renderer.showSumAnimationReverse(
            mergingIds[0], mergingIds[1],
            snap.mergingFreqs[0], snap.mergingFreqs[1],
            snap.mergedParentId,
          );
        }
        // 4r: restore amber highlights on children
        this.renderer.setHighlight(mergingIds, true);
        // 3r+2r: revert to previous tree and wait for node transitions
        this.renderer.update(prevSnap.tree, prevSnap.sections);
        await this.scaledDelay(BASE_ANIM_MS);
        // 1r: restore pseudocode
        this.updatePseudoHighlight(mergeBefore);
      },
    });

    if (snap.isComplete) {
      // ── Action: while condition exits (loop terminates) ─────────────────
      actions.push({
        forward: async () => { this.updatePseudoHighlight(['while']); await this.scaledDelay(BASE_STEP_MS); },
        backward: async () => { this.updatePseudoHighlight(mergeLines); },
      });

      // ── Action: return ──────────────────────────────────────────────────
      actions.push({
        forward: async () => { this.updatePseudoHighlight(['return']); await this.scaledDelay(BASE_STEP_MS); },
        backward: async () => { this.updatePseudoHighlight(['while']); },
      });
    }

    return actions;
  }

  // ── Input strip (persistent) ─────────────────────────────────────────────────

  private nextUnusedSymbol(chips: HTMLElement): string {
    const used = new Set(
      Array.from(chips.querySelectorAll('.chip-sym'))
        .map(el => (el as HTMLInputElement).value.trim().toUpperCase())
    );
    for (let i = 0; i < 26; i++) {
      const ch = String.fromCharCode(65 + i);
      if (!used.has(ch)) return ch;
    }
    return '';
  }

  private buildInputStrip(): void {
    this.inputEl.innerHTML = '';

    const strip = document.createElement('div');
    strip.className = 'input-strip';

    const chips = document.createElement('div');
    chips.className = 'symbol-chips';
    for (const { symbol, freq } of DEFAULT_SYMBOLS) {
      chips.appendChild(this.createSymbolChip(symbol, freq, chips));
    }

    const errorEl = document.createElement('span');
    errorEl.className = 'input-error';
    errorEl.hidden = true;

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-secondary';
    addBtn.textContent = '+ Add';
    addBtn.addEventListener('click', () => {
      const chip = this.createSymbolChip(this.nextUnusedSymbol(chips), 1, chips);
      chips.appendChild(chip);
      (chip.querySelector('.chip-sym') as HTMLInputElement).focus();
    });

    const startBtn = document.createElement('button');
    startBtn.className = 'btn-primary';
    startBtn.textContent = 'Visualize →';
    startBtn.addEventListener('click', () => {
      const inputs = this.readSymbolChips(chips);
      const error = this.validateInputs(inputs);
      if (error) {
        errorEl.textContent = error;
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;
      this.startVisualization(inputs);
    });

    strip.appendChild(chips);
    strip.appendChild(addBtn);
    strip.appendChild(startBtn);
    strip.appendChild(errorEl);
    this.inputEl.appendChild(strip);
  }

  private createSymbolChip(symbol: string, freq: number, container: HTMLElement): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'sym-chip';

    const symInput = document.createElement('input');
    symInput.type = 'text';
    symInput.className = 'chip-sym';
    symInput.placeholder = 'A';
    symInput.value = symbol;
    symInput.maxLength = 1;

    const sep = document.createElement('span');
    sep.className = 'chip-sep';
    sep.textContent = ':';

    const freqInput = document.createElement('input');
    freqInput.type = 'number';
    freqInput.className = 'chip-freq';
    freqInput.placeholder = '1';
    freqInput.value = freq > 0 ? String(freq) : '';
    freqInput.min = '1';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', 'Remove');
    removeBtn.addEventListener('click', () => {
      if (container.querySelectorAll('.sym-chip').length > 1) chip.remove();
    });

    chip.appendChild(symInput);
    chip.appendChild(sep);
    chip.appendChild(freqInput);
    chip.appendChild(removeBtn);
    return chip;
  }

  private readSymbolChips(container: HTMLElement): SymbolInput[] {
    return Array.from(container.querySelectorAll('.sym-chip')).map(chip => ({
      symbol: (chip.querySelector('.chip-sym') as HTMLInputElement).value.trim(),
      freq: parseInt((chip.querySelector('.chip-freq') as HTMLInputElement).value, 10),
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
    this.remainingActions = [];
    this.completedActions = [];
    this.isPlaying = true;

    this.controlsEl.innerHTML = '';
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

    const controls = document.createElement('div');
    controls.className = 'viz-controls';

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

    phase.appendChild(controls);
    phase.appendChild(speedRow);
    this.controlsEl.appendChild(phase);

    void this.goToStep(0, /*forward=*/false).then(() => {
      if (this.isPlaying) void this.playLoop();
    });
  }
}
