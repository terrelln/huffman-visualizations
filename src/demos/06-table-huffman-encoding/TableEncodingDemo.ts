import { buildDepthLimitingSteps } from '../05-huffman-depth-limiting/DepthLimitingAlgorithm';
import type { DepthRow } from '../05-huffman-depth-limiting/DepthLimitingAlgorithm';
import type { SymbolInput } from '../01-huffman-tree-construction/HuffmanAlgorithm';

const BASE_STEP_MS = 800;
const BASE_FLY_MS = 500;

// ── Types ─────────────────────────────────────────────────────────────────────

interface TableCharStep {
  char: string;
  rowIndex: number;   // index into symbol table rows
  codeword: string;   // e.g. "010"
}

interface Action {
  forward: () => Promise<void>;
  backward: () => Promise<void>;
  viewDelay?: number;
}

// ── Demo class ────────────────────────────────────────────────────────────────

export class TableEncodingDemo {
  private controlsEl: HTMLElement;
  private encPanelEl: HTMLElement;
  private tablePanelEl: HTMLElement;

  private steps: TableCharStep[] = [];
  private rows: DepthRow[] = [];
  private maxDepth = 3;

  // currentStep: -1 = initial (before any char), 0..N-1 = at/within char i
  private currentStep = -1;
  private remainingActions: Action[] = [];
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

  constructor(containerEl: HTMLElement) {
    this.controlsEl = document.createElement('div');
    containerEl.appendChild(this.controlsEl);

    const vizArea = document.createElement('div');
    vizArea.className = 'viz-area';
    containerEl.appendChild(vizArea);

    this.encPanelEl = document.createElement('div');
    this.encPanelEl.className = 'enc-panel';
    this.encPanelEl.style.display = 'none';
    vizArea.appendChild(this.encPanelEl);

    this.tablePanelEl = document.createElement('div');
    this.tablePanelEl.className = 'tbl-enc-table-panel';
    this.tablePanelEl.style.display = 'none';
    vizArea.appendChild(this.tablePanelEl);
  }

  setMaxDepth(n: number): void {
    this.maxDepth = n;
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
    return this.steps.length > 0
      && this.currentStep === this.steps.length - 1
      && this.remainingActions.length === 0
      && !this.isAnimating;
  }

  private updateNavButtons(): void {
    const allDone = this.isAllDone();
    const atStart = this.currentStep === -1 && this.completedActions.length === 0;
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

  private async handleNext(): Promise<void> {
    if (this.isAnimating) return;
    if (this.remainingActions.length > 0) {
      const action = this.remainingActions.shift()!;
      this.lastViewDelay = action.viewDelay ?? BASE_STEP_MS;
      if (await this.runPhase(action.forward)) {
        this.completedActions.push(action);
      }
    } else {
      const nextIdx = this.currentStep + 1;
      if (nextIdx < this.steps.length) {
        await this.goToStep(nextIdx);
      }
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
      this.remainingActions.unshift(action);
      await this.runPhase(action.backward);
    } else if (this.currentStep > 0) {
      await this.goToCompletedStep(this.currentStep - 1);
    } else if (this.currentStep === 0) {
      await this.resetToInitial();
    }
  }

  private async goToStep(i: number): Promise<void> {
    this.currentStep = i;
    const actions = this.buildCharActions(i);
    this.remainingActions = actions;
    this.completedActions = [];
    const first = this.remainingActions.shift()!;
    if (await this.runPhase(first.forward)) {
      this.completedActions.push(first);
    }
  }

  private async goToCompletedStep(i: number): Promise<void> {
    this.currentStep = i;
    this.completedActions = this.buildCharActions(i);
    this.remainingActions = [];
    await this.runPhase(async () => {
      this.clearAllHighlights();
      this.rebuildBitsDisplay(i + 1);
      this.clearAllCharHighlights();
    });
  }

  private async resetToInitial(): Promise<void> {
    this.currentStep = -1;
    this.completedActions = [];
    this.remainingActions = [];
    await this.runPhase(async () => {
      this.clearAllHighlights();
      this.rebuildBitsDisplay(0);
      this.clearAllCharHighlights();
    });
  }

  // ── Symbol table ───────────────────────────────────────────────────────────

  private buildSymbolTable(): void {
    this.tablePanelEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'canon-header';
    header.textContent = 'Symbol Table';
    this.tablePanelEl.appendChild(header);

    const wrap = document.createElement('div');
    wrap.className = 'canon-table-wrap';

    // Table header
    const thead = document.createElement('div');
    thead.className = 'canon-table-header tbl-enc-row';
    for (const label of ['Symbol', 'Bits', 'Codeword']) {
      const col = document.createElement('div');
      col.textContent = label;
      thead.appendChild(col);
    }
    wrap.appendChild(thead);

    // Table body
    const tbody = document.createElement('div');
    tbody.className = 'canon-table-body';
    for (let r = 0; r < this.rows.length; r++) {
      const row = this.rows[r];
      const rowEl = document.createElement('div');
      rowEl.className = 'canon-row tbl-enc-row';
      rowEl.dataset.rowIdx = String(r);

      const symCell = document.createElement('div');
      symCell.className = 'canon-cell-sym';
      symCell.textContent = row.symbol;

      const bitsCell = document.createElement('div');
      bitsCell.className = 'canon-cell-bits';
      bitsCell.textContent = String(row.numBits);

      const cwCell = document.createElement('div');
      cwCell.className = 'canon-cell-cw';
      for (let j = 0; j < row.canonicalCodeword.length; j++) {
        const bitSpan = document.createElement('span');
        bitSpan.className = 'tbl-enc-cw-bit';
        bitSpan.dataset.rowIdx = String(r);
        bitSpan.dataset.bitIdx = String(j);
        bitSpan.textContent = row.canonicalCodeword[j];
        cwCell.appendChild(bitSpan);
      }

      rowEl.appendChild(symCell);
      rowEl.appendChild(bitsCell);
      rowEl.appendChild(cwCell);
      tbody.appendChild(rowEl);
    }
    wrap.appendChild(tbody);
    this.tablePanelEl.appendChild(wrap);
  }

  // ── Table highlights ───────────────────────────────────────────────────────

  private setRowHighlight(rowIndex: number, on: boolean): void {
    const el = this.tablePanelEl.querySelector<HTMLElement>(
      `.canon-row[data-row-idx="${rowIndex}"]`
    );
    el?.classList.toggle('tbl-enc-row-active', on);
  }

  private setBitHighlight(rowIndex: number, bitIdx: number, on: boolean): void {
    const el = this.tablePanelEl.querySelector<HTMLElement>(
      `.tbl-enc-cw-bit[data-row-idx="${rowIndex}"][data-bit-idx="${bitIdx}"]`
    );
    el?.classList.toggle('tbl-enc-bit-active', on);
  }

  private clearAllHighlights(): void {
    for (const el of this.tablePanelEl.querySelectorAll<HTMLElement>('.tbl-enc-row-active')) {
      el.classList.remove('tbl-enc-row-active');
    }
    for (const el of this.tablePanelEl.querySelectorAll<HTMLElement>('.tbl-enc-bit-active')) {
      el.classList.remove('tbl-enc-bit-active');
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  private buildCharActions(i: number): Action[] {
    const step = this.steps[i];
    const actions: Action[] = [];

    // Highlight table row + input char box
    actions.push({
      forward: async () => {
        this.setRowHighlight(step.rowIndex, true);
        this.setCharHighlight(i, true);
      },
      backward: async () => {
        this.setRowHighlight(step.rowIndex, false);
        this.setCharHighlight(i, false);
      },
      viewDelay: BASE_STEP_MS,
    });

    // Single action: highlight all bits, fly the whole codeword as one pill, reveal all bits at once
    actions.push({
      forward: async () => {
        const gen = this.generation;
        for (let j = 0; j < step.codeword.length; j++) {
          this.setBitHighlight(step.rowIndex, j, true);
        }
        await this.flyCodeword(step.rowIndex, step.codeword, i);
        if (this.generation !== gen) return;
        for (let j = 0; j < step.codeword.length; j++) {
          this.showBit(i, j);
        }
        this.showBrace(i);
      },
      backward: async () => {
        for (let j = 0; j < step.codeword.length; j++) {
          this.setBitHighlight(step.rowIndex, j, false);
          this.hideBit(i, j);
        }
        this.hideBrace(i);
      },
      viewDelay: BASE_STEP_MS * 0.2,
    });

    // Cleanup: clear all highlights for this char (bits stay visible)
    actions.push({
      forward: async () => {
        this.setRowHighlight(step.rowIndex, false);
        for (let j = 0; j < step.codeword.length; j++) {
          this.setBitHighlight(step.rowIndex, j, false);
        }
        this.setCharHighlight(i, false);
      },
      backward: async () => {
        this.setRowHighlight(step.rowIndex, true);
        for (let j = 0; j < step.codeword.length; j++) {
          this.setBitHighlight(step.rowIndex, j, true);
        }
        this.setCharHighlight(i, true);
      },
      viewDelay: BASE_STEP_MS * 0.3,
    });

    return actions;
  }

  // ── Encoding display ──────────────────────────────────────────────────────

  private buildEncodingPanel(inputString: string): void {
    this.encPanelEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'enc-header';
    header.textContent = 'Encoding';
    this.encPanelEl.appendChild(header);

    // Input string row (char boxes)
    const inputRow = document.createElement('div');
    inputRow.className = 'enc-input-row';
    for (let i = 0; i < inputString.length; i++) {
      const box = document.createElement('span');
      box.className = 'enc-char';
      box.dataset.charIdx = String(i);
      box.textContent = inputString[i];
      inputRow.appendChild(box);
    }
    this.encPanelEl.appendChild(inputRow);

    // Single encoded output: one group per char
    const outputEl = document.createElement('div');
    outputEl.className = 'enc-output';
    for (let i = 0; i < inputString.length; i++) {
      const step = this.steps[i];
      const group = document.createElement('div');
      group.className = 'enc-group';
      group.dataset.charIdx = String(i);

      // Bits
      const bitsRow = document.createElement('div');
      bitsRow.className = 'enc-group-bits';
      for (let j = 0; j < step.codeword.length; j++) {
        const bit = document.createElement('span');
        bit.className = 'enc-bit';
        bit.dataset.charIdx = String(i);
        bit.dataset.bitIdx = String(j);
        bit.textContent = step.codeword[j];
        bit.style.opacity = '0';
        bitsRow.appendChild(bit);
      }
      group.appendChild(bitsRow);

      // Brace (hidden until last bit lands)
      const brace = document.createElement('div');
      brace.className = 'enc-brace';
      brace.style.opacity = '0';

      const braceInner = document.createElement('div');
      braceInner.className = 'enc-brace-inner';
      const leftArm = document.createElement('div');
      leftArm.className = 'enc-brace-left-arm';
      const rightArm = document.createElement('div');
      rightArm.className = 'enc-brace-right-arm';
      braceInner.appendChild(leftArm);
      braceInner.appendChild(rightArm);
      brace.appendChild(braceInner);

      const braceLabel = document.createElement('div');
      braceLabel.className = 'enc-brace-label';
      braceLabel.textContent = inputString[i];
      brace.appendChild(braceLabel);

      group.appendChild(brace);
      outputEl.appendChild(group);
    }
    this.encPanelEl.appendChild(outputEl);
  }

  private setCharHighlight(charIdx: number, on: boolean): void {
    const el = this.encPanelEl.querySelector<HTMLElement>(`.enc-char[data-char-idx="${charIdx}"]`);
    el?.classList.toggle('enc-char-active', on);
  }

  private clearAllCharHighlights(): void {
    for (const el of this.encPanelEl.querySelectorAll<HTMLElement>('.enc-char-active')) {
      el.classList.remove('enc-char-active');
    }
  }

  private showBit(charIdx: number, bitIdx: number): void {
    const el = this.encPanelEl.querySelector<HTMLElement>(
      `.enc-bit[data-char-idx="${charIdx}"][data-bit-idx="${bitIdx}"]`
    );
    if (el) { el.style.transition = 'opacity 0.2s'; el.style.opacity = '1'; }
  }

  private hideBit(charIdx: number, bitIdx: number): void {
    const el = this.encPanelEl.querySelector<HTMLElement>(
      `.enc-bit[data-char-idx="${charIdx}"][data-bit-idx="${bitIdx}"]`
    );
    if (el) { el.style.transition = ''; el.style.opacity = '0'; }
  }

  private showBrace(charIdx: number): void {
    const el = this.encPanelEl.querySelector<HTMLElement>(
      `.enc-group[data-char-idx="${charIdx}"] .enc-brace`
    );
    if (el) { el.style.transition = 'opacity 0.3s'; el.style.opacity = '1'; }
  }

  private hideBrace(charIdx: number): void {
    const el = this.encPanelEl.querySelector<HTMLElement>(
      `.enc-group[data-char-idx="${charIdx}"] .enc-brace`
    );
    if (el) { el.style.transition = ''; el.style.opacity = '0'; }
  }

  private rebuildBitsDisplay(visibleUpTo: number): void {
    for (const bit of this.encPanelEl.querySelectorAll<HTMLElement>('.enc-bit')) {
      const ci = parseInt(bit.dataset.charIdx ?? '-1', 10);
      bit.style.transition = '';
      bit.style.opacity = ci < visibleUpTo ? '1' : '0';
    }
    for (const group of this.encPanelEl.querySelectorAll<HTMLElement>('.enc-group')) {
      const ci = parseInt(group.dataset.charIdx ?? '-1', 10);
      const brace = group.querySelector<HTMLElement>('.enc-brace');
      if (brace) { brace.style.transition = ''; brace.style.opacity = ci < visibleUpTo ? '1' : '0'; }
    }
  }

  // ── Fly animation ─────────────────────────────────────────────────────────

  private async flyCodeword(
    rowIndex: number, codeword: string, charIdx: number,
  ): Promise<void> {
    const gen = this.generation;
    // Source: codeword cell in the symbol table
    const firstBit = this.tablePanelEl.querySelector<HTMLElement>(
      `.tbl-enc-cw-bit[data-row-idx="${rowIndex}"][data-bit-idx="0"]`
    );
    const lastBit = this.tablePanelEl.querySelector<HTMLElement>(
      `.tbl-enc-cw-bit[data-row-idx="${rowIndex}"][data-bit-idx="${codeword.length - 1}"]`
    );
    if (!firstBit || !lastBit) return;
    const firstRect = firstBit.getBoundingClientRect();
    const lastRect = lastBit.getBoundingClientRect();
    const fromX = (firstRect.left + lastRect.right) / 2;
    const fromY = (firstRect.top + lastRect.bottom) / 2;

    // Target: the enc-group-bits container for this char
    const targetEl = this.encPanelEl.querySelector<HTMLElement>(
      `.enc-group[data-char-idx="${charIdx}"] .enc-group-bits`
    );
    if (!targetEl) return;
    const targetRect = targetEl.getBoundingClientRect();
    const toX = targetRect.left + targetRect.width / 2;
    const toY = targetRect.top + targetRect.height / 2;

    const floater = document.createElement('div');
    floater.className = 'enc-bit-floater';
    floater.textContent = codeword;
    floater.style.cssText = `position:fixed;left:${fromX}px;top:${fromY}px;transform:translate(-50%,-50%);opacity:0;pointer-events:none;z-index:9999;`;
    document.body.appendChild(floater);

    // Fade in at origin
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    if (this.generation !== gen) { floater.remove(); return; }
    floater.style.transition = 'opacity 0.15s';
    floater.style.opacity = '1';
    await this.scaledDelay(BASE_STEP_MS * 0.5);
    if (this.generation !== gen) { floater.remove(); return; }

    // Fly to target and fade out
    const flyDur = Math.round(BASE_FLY_MS / this.speedMultiplier);
    floater.style.transition = `left ${flyDur}ms ease, top ${flyDur}ms ease, opacity ${flyDur}ms ease`;
    floater.style.left = `${toX}px`;
    floater.style.top = `${toY}px`;
    floater.style.opacity = '0';
    await this.scaledDelay(BASE_FLY_MS);
    floater.remove();
  }

  // ── Start ─────────────────────────────────────────────────────────────────

  start(inputs: SymbolInput[], inputString: string): void {
    // Run depth limiting algorithm to get canonical codes
    const result = buildDepthLimitingSteps(inputs, this.maxDepth);
    this.rows = result.rows;

    // Build symbol → {rowIndex, codeword} map
    const symbolMap = new Map<string, { rowIndex: number; codeword: string }>();
    for (let r = 0; r < this.rows.length; r++) {
      symbolMap.set(this.rows[r].symbol, {
        rowIndex: r,
        codeword: this.rows[r].canonicalCodeword,
      });
    }

    // Build one step per character in the input string
    this.steps = [];
    for (const char of inputString) {
      const entry = symbolMap.get(char);
      if (!entry) continue;
      this.steps.push({ char, rowIndex: entry.rowIndex, codeword: entry.codeword });
    }

    this.generation++;
    this.currentStep = -1;
    this.remainingActions = [];
    this.completedActions = [];
    this.isPlaying = true;

    // Build symbol table
    this.tablePanelEl.style.display = '';
    this.buildSymbolTable();

    // Build encoding panel
    this.encPanelEl.style.display = '';
    this.buildEncodingPanel(inputString);

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

    // Show initial state then autoplay
    void this.runPhase(async () => {
      await this.scaledDelay(BASE_STEP_MS * 0.5);
    }).then(() => {
      if (this.isPlaying) void this.playLoop();
    });
  }
}
