import { buildDecodingTableSteps } from './DecodingTableAlgorithm';
import type { DecodingTableStep, DecodeTableEntry } from './DecodingTableAlgorithm';
import type { DepthRow } from '../05-huffman-depth-limiting/DepthLimitingAlgorithm';
import type { SymbolInput } from '../01-huffman-tree-construction/HuffmanAlgorithm';

const BASE_STEP_MS = 1400;
const BASE_PSEUDO_STEP_MS = 2400;
const BASE_ANIM_MS = 1000;

// ── Syntax coloring helpers ───────────────────────────────────────────────────
const K = (s: string) => `<span class="pk">${s}</span>`;
const F = (s: string) => `<span class="pf">${s}</span>`;
const O = (s: string) => `<span class="po">${s}</span>`;

const PSEUDO_LINES = [
  { id: 'fn-def', indent: 0, html: `${K('def')} ${F('build_decode_table')}(symbols):` },
  { id: 'depth-line', indent: 1, html: `D ${O('=')} ${F('max')}(sym.bits ${K('for')} sym ${K('in')} symbols)` },
  { id: 'init-line', indent: 1, html: `table ${O('=')} [None] ${O('*')} 2<sup>D</sup>` },
  { id: 'start-init', indent: 1, html: `start ${O('=')} 0` },
  { id: 'for-sym', indent: 1, html: `${K('for')} sym ${K('in')} symbols:` },
  { id: 'num-entries', indent: 2, html: `n ${O('=')} 2<sup>(D ${O('-')} sym.bits)</sup>` },
  { id: 'for-i', indent: 2, html: `${K('for')} i ${K('in')} ${F('range')}(start, start ${O('+')} n):` },
  { id: 'fill-line', indent: 3, html: `table[i] ${O('=')} sym` },
  { id: 'start-advance', indent: 2, html: `start ${O('+=')} n` },
  { id: 'return-line', indent: 1, html: `${K('return')} table` },
];

// ── Action type ───────────────────────────────────────────────────────────────
interface Action {
  forward: () => Promise<void>;
  backward: () => Promise<void>;
  viewDelay?: number;
}

// ── Demo class ────────────────────────────────────────────────────────────────
export class DecodingTableDemo {
  private controlsEl: HTMLElement;
  private decodePanelEl!: HTMLElement;

  private actions: Action[] = [];
  private completedActions: Action[] = [];
  private isAnimating = false;
  private isPlaying = false;
  private speedMultiplier = 1;
  private generation = 0;
  private playDelayResolve: (() => void) | null = null;
  private lastViewDelay = BASE_STEP_MS;

  private prevBtn!: HTMLButtonElement;
  private playBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;

  private steps: DecodingTableStep[] = [];
  private maxDepth = 3;
  private savedInputs: SymbolInput[] = [];

  private sourceRowEls: HTMLElement[] = [];
  private decodeRowEls: HTMLElement[] = [];
  private pseudoEl!: HTMLElement;
  private varsBoxEl!: HTMLElement;
  private dValEl!: HTMLElement;
  private startValEl!: HTMLElement;
  private nValEl!: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.controlsEl = document.createElement('div');
    containerEl.appendChild(this.controlsEl);

    const vizArea = document.createElement('div');
    vizArea.className = 'viz-area';
    containerEl.appendChild(vizArea);

    this.decodePanelEl = document.createElement('div');
    this.decodePanelEl.className = 'canon-panel decode-panel';
    this.decodePanelEl.style.display = 'none';
    vizArea.appendChild(this.decodePanelEl);
  }

  private scaledDelay(baseMs: number): Promise<void> {
    const gen = this.generation;
    return new Promise<void>(resolve => {
      const start = performance.now();
      const tick = () => {
        if (this.generation !== gen) resolve();
        else if (performance.now() - start >= baseMs / this.speedMultiplier) resolve();
        else requestAnimationFrame(tick);
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

  setMaxDepth(n: number): void {
    this.maxDepth = n;
  }

  pause(): void {
    if (this.isPlaying) {
      this.isPlaying = false;
      if (this.prevBtn) this.updateNavButtons();
    }
  }

  play(): void {
    if (!this.isPlaying && !this.isAllDone()) {
      this.isPlaying = true;
      if (this.prevBtn) this.updateNavButtons();
      void this.playLoop();
    }
  }

  private isAllDone(): boolean {
    return this.actions.length === 0
      && this.steps.length > 0
      && !this.isAnimating;
  }

  private updateNavButtons(): void {
    const allDone = this.isAllDone();
    const atStart = this.completedActions.length === 0 && !this.isAnimating;
    this.prevBtn.disabled = atStart || this.isAnimating;
    this.nextBtn.disabled = (allDone || this.steps.length === 0) || this.isAnimating;
    this.nextBtn.textContent = allDone ? 'Done \u2713' : 'Next \u2192';
    if (allDone) {
      this.playBtn.disabled = false;
      this.playBtn.textContent = '\u21ba Replay';
      this.playBtn.className = 'btn-primary';
    } else {
      this.playBtn.disabled = false;
      this.playBtn.textContent = this.isPlaying ? '\u23f8 Pause' : '\u25b6 Play';
      this.playBtn.className = this.isPlaying ? 'btn-secondary' : 'btn-primary';
    }
  }

  private togglePlay(): void {
    if (this.isAllDone()) {
      this.isPlaying = true;
      this.updateNavButtons();
      void this.resetToInitial().then(() => { if (this.isPlaying) void this.playLoop(); });
      return;
    }
    this.isPlaying = !this.isPlaying;
    this.updateNavButtons();
    if (this.isPlaying) void this.playLoop();
  }

  private async playLoop(): Promise<void> {
    const gen = this.generation;
    while (this.isPlaying && !this.isAllDone() && this.generation === gen) {
      await this.handleNext();
      if (!this.isPlaying || this.generation !== gen) break;
      await this.playDelay(this.lastViewDelay);
    }
    if (this.generation !== gen) return;
    if (this.isAllDone()) {
      this.isPlaying = false;
      this.updateNavButtons();
    }
  }

  private async runPhase(fn: () => Promise<void>): Promise<void> {
    const gen = this.generation;
    this.isAnimating = true;
    this.prevBtn.disabled = true;
    this.nextBtn.disabled = true;
    await fn();
    if (this.generation !== gen) return;
    this.isAnimating = false;
    this.updateNavButtons();
  }

  private async handleNext(): Promise<void> {
    if (this.isAnimating) return;
    if (this.actions.length > 0) {
      const gen = this.generation;
      const action = this.actions.shift()!;
      this.lastViewDelay = action.viewDelay ?? BASE_STEP_MS;
      await this.runPhase(action.forward);
      if (this.generation === gen) this.completedActions.push(action);
    }
  }

  private async handlePrev(): Promise<void> {
    if (this.isAnimating) return;
    if (this.isPlaying) {
      this.isPlaying = false;
      this.updateNavButtons();
    }
    if (this.completedActions.length > 0) {
      const action = this.completedActions.pop()!;
      this.actions.unshift(action);
      await this.runPhase(action.backward);
    }
  }

  private async resetToInitial(): Promise<void> {
    this.actions = [...this.completedActions.reverse(), ...this.actions];
    this.completedActions = [];
    await this.runPhase(async () => {
      this.rebuildFromStart();
    });
  }

  // ── Pseudocode highlight ────────────────────────────────────────────────

  private setPseudoHighlight(ids: string[]): void {
    const active = new Set(ids);
    const lines = Array.from(
      this.pseudoEl.querySelectorAll<HTMLElement>('.canon-pseudo-line')
    );
    lines.forEach((el, i) => {
      const isActive = active.has(el.dataset.id ?? '');
      el.classList.toggle('active', isActive);
      if (isActive) {
        const prevId = lines[i - 1]?.dataset.id ?? '';
        const nextId = lines[i + 1]?.dataset.id ?? '';
        el.classList.toggle('active-first', !active.has(prevId));
        el.classList.toggle('active-last', !active.has(nextId));
      } else {
        el.classList.remove('active-first', 'active-last');
      }
    });
  }

  private clearPseudoHighlight(): void {
    this.setPseudoHighlight([]);
  }

  // ── Flying label animation ──────────────────────────────────────────────

  private async flyToDisplay(
    text: string,
    fromId: string,
    target: 'D' | 'start' | 'n',
  ): Promise<void> {
    const gen = this.generation;
    const sourceLine = this.pseudoEl.querySelector<HTMLElement>(
      `.canon-pseudo-line[data-id="${fromId}"]`
    );
    const targetSpan = target === 'D' ? this.dValEl
      : target === 'start' ? this.startValEl : this.nValEl;
    if (!sourceLine || !targetSpan) return;

    const sourceRect = sourceLine.getBoundingClientRect();
    const targetRect = targetSpan.getBoundingClientRect();

    const label = document.createElement('div');
    label.className = 'depth-fly-label depth-fly-kraft';
    label.textContent = text;
    label.style.left = `${sourceRect.right + 4}px`;
    label.style.top = `${sourceRect.top + sourceRect.height / 2}px`;
    document.body.appendChild(label);

    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    if (this.generation !== gen) { label.remove(); return; }

    const dur = Math.round(BASE_ANIM_MS / this.speedMultiplier);
    label.style.transition = `left ${dur}ms ease, top ${dur}ms ease, opacity ${dur * 0.3}ms ease ${dur * 0.7}ms`;
    label.style.left = `${targetRect.left + targetRect.width / 2}px`;
    label.style.top = `${targetRect.top + targetRect.height / 2}px`;

    await this.scaledDelay(BASE_ANIM_MS);
    if (this.generation !== gen) { label.remove(); return; }
    label.style.opacity = '0';
    await this.scaledDelay(BASE_ANIM_MS * 0.3);
    label.remove();
  }

  private setD(value: string): void {
    this.dValEl.textContent = value;
  }

  private setStart(value: string): void {
    this.startValEl.textContent = value;
  }

  private setN(value: string): void {
    this.nValEl.textContent = value;
  }

  private showVarsBox(): void {
    this.varsBoxEl.style.opacity = '1';
  }

  private hideVarsBox(): void {
    this.varsBoxEl.style.opacity = '0';
  }

  // ── Scroll helpers ──────────────────────────────────────────────────────

  private scrollDecodeRowIntoView(tableIndex: number): void {
    const rowEl = this.decodeRowEls[tableIndex];
    if (!rowEl) return;
    const scrollContainer = rowEl.closest<HTMLElement>('.decode-table-wrap');
    if (!scrollContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const rowRect = rowEl.getBoundingClientRect();

    if (rowRect.top >= containerRect.top && rowRect.bottom <= containerRect.bottom) return;

    const rowOffsetTop = rowEl.offsetTop;
    const containerHeight = scrollContainer.clientHeight;
    const rowHeight = rowEl.offsetHeight;
    scrollContainer.scrollTo({
      top: rowOffsetTop - containerHeight / 2 + rowHeight / 2,
      behavior: 'smooth',
    });
  }

  // ── Build panel DOM ─────────────────────────────────────────────────────

  private buildPanel(sourceRows: DepthRow[], tableSize: number, maxDepth: number): void {
    this.decodePanelEl.innerHTML = '';
    this.sourceRowEls = [];
    this.decodeRowEls = [];

    const header = document.createElement('div');
    header.className = 'canon-header';
    header.textContent = 'Decoding Table Construction';
    this.decodePanelEl.appendChild(header);

    // Body row: left (pseudo + compute + source table) | right (decode table)
    const bodyRow = document.createElement('div');
    bodyRow.className = 'decode-body-row';

    // ── Left column ───────────────────────────────────────────────────────
    const left = document.createElement('div');
    left.className = 'decode-left';

    // Pseudocode
    this.pseudoEl = document.createElement('div');
    this.pseudoEl.className = 'canon-pseudo';
    const pseudoBody = document.createElement('div');
    pseudoBody.className = 'canon-pseudo-body';
    for (const line of PSEUDO_LINES) {
      const div = document.createElement('div');
      div.className = 'canon-pseudo-line';
      div.dataset.id = line.id;
      div.dataset.indent = String(line.indent);
      div.innerHTML = line.html;
      pseudoBody.appendChild(div);
    }
    this.pseudoEl.appendChild(pseudoBody);
    left.appendChild(this.pseudoEl);

    // Variables box (single container with D, start, n lines)
    this.varsBoxEl = document.createElement('div');
    this.varsBoxEl.className = 'decode-vars-box';
    this.varsBoxEl.style.opacity = '0';

    const mkLine = (label: string): HTMLElement => {
      const line = document.createElement('div');
      line.className = 'decode-var-line';
      const lbl = document.createElement('span');
      lbl.textContent = `${label} = `;
      const val = document.createElement('span');
      val.className = 'decode-display-val';
      line.appendChild(lbl);
      line.appendChild(val);
      return line;
    };

    const dLine = mkLine('D');
    this.dValEl = dLine.querySelector('.decode-display-val')!;
    const startLine = mkLine('start');
    this.startValEl = startLine.querySelector('.decode-display-val')!;
    const nLine = mkLine('n');
    this.nValEl = nLine.querySelector('.decode-display-val')!;

    this.varsBoxEl.appendChild(dLine);
    this.varsBoxEl.appendChild(startLine);
    this.varsBoxEl.appendChild(nLine);
    left.appendChild(this.varsBoxEl);

    // ── Middle column (source table) ──────────────────────────────────────
    const mid = document.createElement('div');
    mid.className = 'decode-mid';

    const srcWrap = document.createElement('div');
    srcWrap.className = 'canon-table-wrap';

    const srcHeader = document.createElement('div');
    srcHeader.className = 'decode-src-header';
    for (const label of ['Symbol', 'Bits', 'Codeword']) {
      const cell = document.createElement('div');
      cell.textContent = label;
      srcHeader.appendChild(cell);
    }
    srcWrap.appendChild(srcHeader);

    const srcBody = document.createElement('div');
    srcBody.className = 'canon-table-body';
    for (const row of sourceRows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'decode-src-row';

      const symCell = document.createElement('div');
      symCell.className = 'canon-cell-sym';
      symCell.textContent = row.symbol;

      const bitsCell = document.createElement('div');
      bitsCell.className = 'canon-cell-bits';
      bitsCell.textContent = String(row.numBits);

      const cwCell = document.createElement('div');
      cwCell.className = 'canon-cell-cw';
      cwCell.textContent = row.canonicalCodeword;

      rowEl.appendChild(symCell);
      rowEl.appendChild(bitsCell);
      rowEl.appendChild(cwCell);
      srcBody.appendChild(rowEl);
      this.sourceRowEls.push(rowEl);
    }
    srcWrap.appendChild(srcBody);
    mid.appendChild(srcWrap);

    // ── Right column (decode table) ───────────────────────────────────────
    const right = document.createElement('div');
    right.className = 'decode-right';

    const decWrap = document.createElement('div');
    decWrap.className = 'decode-table-wrap';

    const decHeader = document.createElement('div');
    decHeader.className = 'decode-table-header';
    for (const label of ['Index', 'Binary', 'Symbol', 'Bits']) {
      const cell = document.createElement('div');
      cell.textContent = label;
      decHeader.appendChild(cell);
    }
    decWrap.appendChild(decHeader);

    const decBody = document.createElement('div');
    decBody.className = 'canon-table-body decode-table-body';
    for (let i = 0; i < tableSize; i++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'decode-row';

      const idxCell = document.createElement('div');
      idxCell.className = 'decode-cell-idx';
      idxCell.textContent = String(i);

      const binCell = document.createElement('div');
      binCell.className = 'decode-cell-bin';
      binCell.textContent = i.toString(2).padStart(maxDepth, '0');

      const symCell = document.createElement('div');
      symCell.className = 'decode-cell-sym';

      const bitsCell = document.createElement('div');
      bitsCell.className = 'decode-cell-bits';

      rowEl.appendChild(idxCell);
      rowEl.appendChild(binCell);
      rowEl.appendChild(symCell);
      rowEl.appendChild(bitsCell);
      decBody.appendChild(rowEl);
      this.decodeRowEls.push(rowEl);
    }
    decWrap.appendChild(decBody);
    right.appendChild(decWrap);

    bodyRow.appendChild(left);
    bodyRow.appendChild(mid);
    bodyRow.appendChild(right);
    this.decodePanelEl.appendChild(bodyRow);
  }

  // ── Action builders ─────────────────────────────────────────────────────

  private buildActions(steps: DecodingTableStep[]): Action[] {
    const actions: Action[] = [];

    // Track decode table state for backward
    const tableState: (DecodeTableEntry | null)[] = new Array(this.decodeRowEls.length).fill(null);

    for (let si = 0; si < steps.length; si++) {
      const step = steps[si];

      if (step.kind === 'compute-depth') {
        const s = step;
        // Action 1: highlight fn-def
        actions.push({
          forward: async () => {
            this.setPseudoHighlight(['fn-def']);
            this.showVarsBox();
          },
          backward: async () => {
            this.clearPseudoHighlight();
            this.hideVarsBox();
          },
          viewDelay: BASE_PSEUDO_STEP_MS * 0.6,
        });
        // Action 2: highlight depth-line, fly D value
        actions.push({
          forward: async () => {
            this.setPseudoHighlight(['depth-line']);
            await this.flyToDisplay(`= ${s.maxDepth}`, 'depth-line', 'D');
            this.setD(String(s.maxDepth));
          },
          backward: async () => {
            this.setPseudoHighlight(['fn-def']);
            this.setD('');
          },
          viewDelay: BASE_PSEUDO_STEP_MS * 0.4,
        });

      } else if (step.kind === 'init-table') {
        actions.push({
          forward: async () => {
            this.setPseudoHighlight(['init-line']);
          },
          backward: async () => {
            this.setPseudoHighlight(['depth-line']);
            this.setStart('');
          },
          viewDelay: BASE_PSEUDO_STEP_MS * 0.6,
        });

        // Separate action for start = 0 with fly-in
        actions.push({
          forward: async () => {
            this.setPseudoHighlight(['start-init']);
            await this.flyToDisplay('= 0', 'start-init', 'start');
            this.setStart('0');
          },
          backward: async () => {
            this.setStart('');
            this.setPseudoHighlight(['init-line']);
          },
          viewDelay: BASE_PSEUDO_STEP_MS * 0.4,
        });

      } else if (step.kind === 'symbol-start') {
        const s = step;
        actions.push({
          forward: async () => {
            for (const el of this.sourceRowEls) el.classList.remove('decode-src-active');
            this.sourceRowEls[s.rowIndex].classList.add('decode-src-active');
            this.setN('');
            this.setPseudoHighlight(['for-sym']);
          },
          backward: async () => {
            this.sourceRowEls[s.rowIndex].classList.remove('decode-src-active');
            if (s.rowIndex === 0) {
              this.setPseudoHighlight(['start-init']);
            } else {
              this.sourceRowEls[s.rowIndex - 1].classList.add('decode-src-active');
              this.setPseudoHighlight(['start-advance']);
            }
          },
          viewDelay: BASE_PSEUDO_STEP_MS * 0.7,
        });

      } else if (step.kind === 'compute-entries') {
        const s = step;
        actions.push({
          forward: async () => {
            this.setPseudoHighlight(['num-entries']);
            await this.flyToDisplay(`= ${s.numEntries}`, 'num-entries', 'n');
            this.setN(String(s.numEntries));
          },
          backward: async () => {
            this.setN('');
            this.setPseudoHighlight(['for-sym']);
          },
          viewDelay: BASE_PSEUDO_STEP_MS * 0.4,
        });

      } else if (step.kind === 'fill-entry') {
        const s = step;
        const prevEntry = tableState[s.tableIndex];
        tableState[s.tableIndex] = { symbol: s.symbol, numBits: s.numBits };

        actions.push({
          forward: async () => {
            // Clear previous row highlight
            for (const el of this.decodeRowEls) el.classList.remove('decode-row-active');
            this.setPseudoHighlight(['for-i', 'fill-line']);
            const rowEl = this.decodeRowEls[s.tableIndex];
            this.scrollDecodeRowIntoView(s.tableIndex);
            rowEl.classList.add('decode-row-active');
            const symCell = rowEl.querySelector<HTMLElement>('.decode-cell-sym');
            const bitsCell = rowEl.querySelector<HTMLElement>('.decode-cell-bits');
            if (symCell) symCell.textContent = s.symbol;
            if (bitsCell) bitsCell.textContent = String(s.numBits);
            rowEl.classList.add('decode-row-filled');
          },
          viewDelay: BASE_STEP_MS * 0.6,
          backward: async () => {
            const rowEl = this.decodeRowEls[s.tableIndex];
            rowEl.classList.remove('decode-row-active', 'decode-row-filled');
            const symCell = rowEl.querySelector<HTMLElement>('.decode-cell-sym');
            const bitsCell = rowEl.querySelector<HTMLElement>('.decode-cell-bits');
            if (prevEntry) {
              if (symCell) symCell.textContent = prevEntry.symbol;
              if (bitsCell) bitsCell.textContent = String(prevEntry.numBits);
              rowEl.classList.add('decode-row-filled');
            } else {
              if (symCell) symCell.textContent = '';
              if (bitsCell) bitsCell.textContent = '';
            }

            if (s.isFirst) {
              this.setPseudoHighlight(['num-entries']);
            } else {
              this.setPseudoHighlight(['for-i', 'fill-line']);
            }
          },
        });

        // After the last fill-entry for this symbol, add a start-advance action with fly-in
        if (s.isLast) {
          const computeStep = steps.find(
            st => st.kind === 'compute-entries' && st.rowIndex === s.rowIndex
          );
          const numEntries = computeStep && computeStep.kind === 'compute-entries' ? computeStep.numEntries : 0;
          const oldStart = computeStep && computeStep.kind === 'compute-entries' ? computeStep.startIndex : 0;
          const newStart = oldStart + numEntries;

          actions.push({
            forward: async () => {
              for (const el of this.decodeRowEls) el.classList.remove('decode-row-active');
              this.setPseudoHighlight(['start-advance']);
              await this.flyToDisplay(`= ${newStart}`, 'start-advance', 'start');
              this.setStart(String(newStart));
              this.setN('');
            },
            backward: async () => {
              this.setStart(String(oldStart));
              this.setN(String(numEntries));
              this.setPseudoHighlight(['for-i', 'fill-line']);
            },
            viewDelay: BASE_PSEUDO_STEP_MS * 0.4,
          });
        }

      } else if (step.kind === 'done') {
        actions.push({
          forward: async () => {
            for (const el of this.decodeRowEls) el.classList.remove('decode-row-active');
            for (const el of this.sourceRowEls) el.classList.remove('decode-src-active');
            this.setPseudoHighlight(['return-line']);
            this.hideVarsBox();
          },
          backward: async () => {
            // Restore last source row highlight
            if (this.sourceRowEls.length > 0) {
              this.sourceRowEls[this.sourceRowEls.length - 1].classList.add('decode-src-active');
            }
            this.setPseudoHighlight(['start-advance']);
            this.showVarsBox();
            const depthStep = steps.find(st => st.kind === 'compute-depth');
            if (depthStep && depthStep.kind === 'compute-depth') {
              this.setD(String(depthStep.maxDepth));
            }
            const lastCompute = [...steps].filter(st => st.kind === 'compute-entries').pop();
            if (lastCompute && lastCompute.kind === 'compute-entries') {
              this.setStart(String(lastCompute.startIndex + lastCompute.numEntries));
            }
          },
          viewDelay: BASE_PSEUDO_STEP_MS,
        });
      }
    }

    return actions;
  }

  // ── Rebuild from start (for replay) ─────────────────────────────────────

  private rebuildFromStart(): void {
    const result = buildDecodingTableSteps(this.savedInputs, this.maxDepth);
    this.steps = result.steps;
    this.buildPanel(result.sourceRows, 1 << result.maxDepth, result.maxDepth);
    this.actions = this.buildActions(this.steps);
  }

  // ── Start ───────────────────────────────────────────────────────────────

  start(inputs: SymbolInput[], _inputString: string): void {
    this.generation++;
    this.isPlaying = false;
    this.isAnimating = false;
    this.savedInputs = inputs;

    const result = buildDecodingTableSteps(inputs, this.maxDepth);
    this.steps = result.steps;
    this.completedActions = [];
    this.isPlaying = true;

    // Setup panel
    this.decodePanelEl.style.display = '';
    this.buildPanel(result.sourceRows, 1 << result.maxDepth, result.maxDepth);

    // Build actions
    this.actions = this.buildActions(this.steps);

    // Build controls
    this.controlsEl.innerHTML = '';
    const phase = document.createElement('div');
    phase.className = 'phase-viz';

    const controls = document.createElement('div');
    controls.className = 'viz-controls';

    this.prevBtn = document.createElement('button');
    this.prevBtn.className = 'btn-secondary';
    this.prevBtn.textContent = '\u2190 Prev';
    this.prevBtn.addEventListener('click', () => {
      this.cancelPlayDelay();
      void this.handlePrev();
    });

    this.playBtn = document.createElement('button');
    this.playBtn.className = 'btn-secondary';
    this.playBtn.textContent = '\u23f8 Pause';
    this.playBtn.addEventListener('click', () => this.togglePlay());

    this.nextBtn = document.createElement('button');
    this.nextBtn.className = 'btn-secondary';
    this.nextBtn.textContent = 'Next \u2192';
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

    void this.runPhase(async () => {
      await this.scaledDelay(BASE_STEP_MS * 0.5);
    }).then(() => {
      if (this.isPlaying) void this.playLoop();
    });
  }
}
