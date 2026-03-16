import { TreeRenderer } from '../../tree/TreeRenderer';

import { buildHuffmanSnapshots } from './HuffmanAlgorithm';
import type { SymbolInput, HuffmanSnapshot, SelectionStep } from './HuffmanAlgorithm';

const SVG_NS = 'http://www.w3.org/2000/svg';

const BASE_STEP_MS = 1200; // how long each pseudocode phase is shown at 1× speed
const BASE_ANIM_MS = 500;  // CSS transition duration for node moves at 1× speed

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
  if (!step.q1CandidateId) return ['deq-q1e'];
  if (!step.q2CandidateId) return ['deq-q2e'];
  return ['deq-cmp'];
}

function deqSelectedLines(step: SelectionStep): string[] {
  if (!step.q1CandidateId) return ['deq-q1e'];
  if (!step.q2CandidateId) return ['deq-q2e'];
  if (step.selectedId === step.q1CandidateId) return ['deq-r-q1'];
  return ['deq-r-q2'];
}

// Returns the pseudocode lines that should be highlighted after a snapshot has fully completed.
function getCompletedPseudoLines(snap: HuffmanSnapshot, stepIndex: number): string[] {
  if (!snap.selectionSteps) {
    if (stepIndex === 0) return ['fn-huf'];
    return ['q1-init', 'q2-init'];
  }
  if (snap.isComplete) return ['return'];
  // After a merge step completes, the merge lines are the last thing shown
  return ['node-new', 'node-freq', 'node-lr', 'q2-app'];
}

// ── Action types ─────────────────────────────────────────────────────────────

interface Action {
  forward: () => Promise<void>;
  backward: () => Promise<void>;
  viewDelay?: number;
}

// ── Demo class ───────────────────────────────────────────────────────────────

export class HuffmanDemo {
  private controlsEl: HTMLElement;
  private pseudoEl: HTMLElement;
  private svgEl: SVGSVGElement;
  private renderer: TreeRenderer;

  private snapshots: HuffmanSnapshot[] = [];
  private currentStep = 0;

  private remainingActions: Action[] = [];
  private completedActions: Action[] = [];
  private isAnimating = false;
  private isPlaying = false;
  private speedMultiplier = 1;
  private generation = 0;
  private playDelayResolve: (() => void) | null = null;
  private lastViewDelay = BASE_STEP_MS;

  private scaledDelay(baseMs: number): Promise<void> {
    const gen = this.generation;
    return new Promise<void>(resolve => {
      const start = performance.now();
      const tick = () => {
        if (this.generation !== gen) resolve();
        else if (performance.now() - start >= baseMs / this.speedMultiplier) {
          resolve();
        } else {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });
  }

  private playDelay(baseMs: number): Promise<void> {
    return new Promise<void>(resolve => {
      this.playDelayResolve = resolve;
      const gen = this.generation;
      const start = performance.now();
      const tick = () => {
        if (this.generation !== gen || this.playDelayResolve !== resolve) resolve();
        else if (performance.now() - start >= baseMs / this.speedMultiplier) {
          this.playDelayResolve = null;
          resolve();
        } else {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });
  }

  private cancelPlayDelay(): void {
    if (this.playDelayResolve) {
      const r = this.playDelayResolve;
      this.playDelayResolve = null;
      r();
    }
  }

  private prevBtn!: HTMLButtonElement;
  private playBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;

  constructor(containerEl: HTMLElement) {
    // Controls row (created fresh on each start() call, placeholder div here)
    this.controlsEl = document.createElement('div');
    containerEl.appendChild(this.controlsEl);

    // Viz area: [pseudo | viz-left > svg]
    const vizArea = document.createElement('div');
    vizArea.className = 'viz-area';
    containerEl.appendChild(vizArea);

    this.pseudoEl = document.createElement('div');
    this.pseudoEl.className = 'pseudo-panel';
    this.pseudoEl.style.display = 'none';
    vizArea.appendChild(this.pseudoEl);

    const vizLeft = document.createElement('div');
    vizLeft.className = 'viz-left';
    vizArea.appendChild(vizLeft);

    this.svgEl = document.createElementNS(SVG_NS, 'svg') as unknown as SVGSVGElement;
    this.svgEl.setAttribute('class', 'tree-svg');
    this.svgEl.style.display = 'none';
    vizLeft.appendChild(this.svgEl);

    this.renderer = new TreeRenderer({ svgEl: this.svgEl });
    this.buildPseudocodePanel();
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
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].classList.contains('active')) continue;
      if (!lines[i - 1]?.classList.contains('active')) lines[i].classList.add('active-first');
      if (!lines[i + 1]?.classList.contains('active')) lines[i].classList.add('active-last');
    }
  }

  // ── Phase queue ─────────────────────────────────────────────────────────────

  private async runPhase(fn: () => Promise<void>): Promise<boolean> {
    const gen = this.generation;
    this.isAnimating = true;
    this.prevBtn.disabled = true;
    this.nextBtn.disabled = true;
    await fn();
    if (this.generation !== gen) return false;
    this.isAnimating = false;
    this.updateNavButtons();
    return true;
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

  pause(): void {
    if (this.isPlaying) {
      this.isPlaying = false;
      if (this.prevBtn) this.updateNavButtons();
    }
  }

  play(): void {
    if (!this.isPlaying) {
      this.isPlaying = true;
      if (this.prevBtn) this.updateNavButtons();
      void this.playLoop();
    }
  }

  private async playLoop(): Promise<void> {
    const gen = this.generation;
    while (this.isPlaying && this.generation === gen) {
      const snap = this.snapshots[this.currentStep];
      if (snap.isComplete && this.remainingActions.length === 0) {
        this.isPlaying = false;
        this.updateNavButtons();
        break;
      }
      await this.handleNext();
      if (!this.isPlaying || this.generation !== gen) break;
      await this.playDelay(this.lastViewDelay);
    }
  }

  private async handleNext(): Promise<void> {
    if (this.isAnimating) return;
    if (this.remainingActions.length > 0) {
      const phase = this.remainingActions.shift()!;
      this.lastViewDelay = phase.viewDelay ?? BASE_STEP_MS;
      if (await this.runPhase(phase.forward)) {
        this.completedActions.push(phase);
      }
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

  private async goToStep(index: number, forward: boolean): Promise<void> {
    this.currentStep = Math.max(0, Math.min(index, this.snapshots.length - 1));
    const snap = this.snapshots[this.currentStep];

    if (forward && snap.selectionSteps) {
      const phases = this.buildActions(snap);
      this.remainingActions = phases;
      this.completedActions = [];
      const first = this.remainingActions.shift()!;
      this.lastViewDelay = first.viewDelay ?? BASE_STEP_MS;
      if (await this.runPhase(first.forward)) {
        this.completedActions.push(first);
      }
    } else {
      this.updatePseudoHighlight(getCompletedPseudoLines(snap, this.currentStep));
      this.remainingActions = [];
      this.completedActions = [];
      this.lastViewDelay = BASE_STEP_MS;
      await this.runPhase(async () => {
        this.renderer.update(snap.tree, snap.sections);
      });
    }
  }

  private async goToCompletedStep(index: number): Promise<void> {
    if (index < 0) return;
    this.currentStep = index;
    const snap = this.snapshots[this.currentStep];

    this.updatePseudoHighlight(getCompletedPseudoLines(snap, this.currentStep));
    this.completedActions = snap.selectionSteps ? this.buildActions(snap) : [];
    this.remainingActions = [];

    await this.runPhase(async () => {
      this.renderer.clearHighlights();
      this.renderer.update(snap.tree, snap.sections);
    });
  }

  private buildActions(snap: HuffmanSnapshot): Action[] {
    const prevIndex = this.currentStep - 1;
    const prevSnap = this.snapshots[prevIndex];
    const prevPseudoCompleted = prevSnap ? getCompletedPseudoLines(prevSnap, prevIndex) : [];

    const actions: Action[] = [];
    let pseudoState = prevPseudoCompleted;

    const p0Before = pseudoState;
    actions.push({
      forward: async () => { this.updatePseudoHighlight(['while']); },
      backward: async () => { this.updatePseudoHighlight(p0Before); },
      viewDelay: BASE_STEP_MS,
    });
    pseudoState = ['while'];

    for (let si = 0; si < snap.selectionSteps!.length; si++) {
      const step = snap.selectionSteps![si];
      const deqLine = si === 0 ? 'deq-a' : 'deq-b';
      const candidates = [step.q1CandidateId, step.q2CandidateId]
        .filter((id): id is string => !!id);

      if (candidates.length >= 2) {
        const cmpBefore = pseudoState;
        const cmpLines = [deqLine, ...deqCompareLines(step)];
        actions.push({
          forward: async () => {
            const gen = this.generation;
            this.updatePseudoHighlight(cmpLines);
            this.renderer.setComparing(candidates, true);
            await this.renderer.showComparisonAnimation(
              step.q1CandidateId!, step.q2CandidateId!,
              step.q1CandidateFreq!, step.q2CandidateFreq!,
              step.selectedId,
            );
            if (this.generation !== gen) return;
            this.renderer.setComparing(candidates, false);
          },
          backward: async () => {
            this.updatePseudoHighlight(cmpBefore);
          },
        });
        pseudoState = cmpLines;
      }

      const selBefore = pseudoState;
      const selLines = [deqLine, ...deqSelectedLines(step)];
      const selectedId = step.selectedId;
      actions.push({
        forward: async () => {
          this.updatePseudoHighlight(selLines);
          this.renderer.setHighlight([selectedId], true);
        },
        backward: async () => {
          this.renderer.setHighlight([selectedId], false);
          this.updatePseudoHighlight(selBefore);
        },
        viewDelay: BASE_STEP_MS,
      });
      pseudoState = selLines;
    }

    const mergeLines = ['node-new', 'node-freq', 'node-lr', 'q2-app'];
    const mergeBefore = pseudoState;
    const mergingIds = [...snap.mergingIds!] as [string, string];
    actions.push({
      forward: async () => {
        const gen = this.generation;
        this.updatePseudoHighlight(mergeLines);
        this.renderer.update(snap.tree, snap.sections);
        await this.scaledDelay(BASE_ANIM_MS);
        if (this.generation !== gen) return;
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
        this.renderer.setHighlight(mergingIds, true);
        this.renderer.update(prevSnap.tree, prevSnap.sections);
        this.updatePseudoHighlight(mergeBefore);
      },
    });

    if (snap.isComplete) {
      actions.push({
        forward: async () => { this.updatePseudoHighlight(['while']); },
        backward: async () => { this.updatePseudoHighlight(mergeLines); },
        viewDelay: BASE_STEP_MS,
      });
      actions.push({
        forward: async () => { this.updatePseudoHighlight(['return']); },
        backward: async () => { this.updatePseudoHighlight(['while']); },
        viewDelay: BASE_STEP_MS,
      });
    }

    return actions;
  }

  // ── Start ────────────────────────────────────────────────────────────────────

  start(inputs: SymbolInput[], _inputString: string): void {
    this.generation++;
    this.snapshots = buildHuffmanSnapshots(inputs);
    this.currentStep = 0;
    this.remainingActions = [];
    this.completedActions = [];
    this.isPlaying = true;

    // Rebuild controls
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
    this.prevBtn.addEventListener('click', () => {
      this.cancelPlayDelay();
      void this.handlePrev();
    });

    this.playBtn = document.createElement('button');
    this.playBtn.className = 'btn-secondary';
    this.playBtn.textContent = '⏸ Pause';
    this.playBtn.addEventListener('click', () => this.togglePlay());

    this.nextBtn = document.createElement('button');
    this.nextBtn.className = 'btn-secondary';
    this.nextBtn.textContent = 'Next →';
    this.nextBtn.addEventListener('click', () => {
      if (this.isPlaying) {
        this.cancelPlayDelay();
      } else {
        void this.handleNext();
      }
    });

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
    slider.max = String(Math.log2(4));
    slider.step = '0.01';
    slider.value = String(Math.log2(this.speedMultiplier));
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
