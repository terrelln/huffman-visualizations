import { buildDecodingTableSteps } from '../07-decoding-table/DecodingTableAlgorithm';
import type { DecodeTableEntry } from '../07-decoding-table/DecodingTableAlgorithm';
import type { DepthRow } from '../05-huffman-depth-limiting/DepthLimitingAlgorithm';
import type { SymbolInput } from '../01-huffman-tree-construction/HuffmanAlgorithm';

const BASE_STEP_MS = 800;
const BASE_FLY_MS = 500;

// ── Types ─────────────────────────────────────────────────────────────────────

interface TableDecCharStep {
  char: string;
  tableIndex: number;     // index into decoding table (from D-bit lookup)
  numBits: number;        // actual bits consumed (from table entry)
  lookupBits: string;     // the D bits read for the lookup (with X for missing bits)
  globalBitOffset: number; // position in the flat bitstream where this char starts
  availableBits: number;  // how many real bits exist (may be < D at end of stream)
}

interface Action {
  forward: () => Promise<void>;
  backward: () => Promise<void>;
}

// ── Demo class ────────────────────────────────────────────────────────────────

export class TableDecodingDemo {
  private controlsEl: HTMLElement;
  private decPanelEl: HTMLElement;
  private tablePanelEl: HTMLElement;

  private steps: TableDecCharStep[] = [];
  private table: (DecodeTableEntry | null)[] = [];
  private tableDepth = 0;
  private maxDepth = 3;

  private currentStep = -1;
  private remainingActions: Action[] = [];
  private completedActions: Action[] = [];
  private isAnimating = false;
  private isPlaying = false;
  private speedMultiplier = 1;
  private generation = 0;

  private prevBtn!: HTMLButtonElement;
  private playBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;

  // Flat array of all bit elements indexed by global position
  private allBitEls: HTMLElement[] = [];

  constructor(containerEl: HTMLElement) {
    this.controlsEl = document.createElement('div');
    containerEl.appendChild(this.controlsEl);

    const vizArea = document.createElement('div');
    vizArea.className = 'viz-area';
    containerEl.appendChild(vizArea);

    this.decPanelEl = document.createElement('div');
    this.decPanelEl.className = 'dec-panel';
    this.decPanelEl.style.display = 'none';
    vizArea.appendChild(this.decPanelEl);

    this.tablePanelEl = document.createElement('div');
    this.tablePanelEl.className = 'tbl-dec-table-panel';
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
      this.clearAllTableHighlights();
      this.clearAllBitHighlights();
      this.rebuildDecDisplay(i + 1);
    });
  }

  private async resetToInitial(): Promise<void> {
    this.currentStep = -1;
    this.completedActions = [];
    this.remainingActions = [];
    await this.runPhase(async () => {
      this.clearAllTableHighlights();
      this.clearAllBitHighlights();
      this.rebuildDecDisplay(0);
    });
  }

  // ── Decoding table display ──────────────────────────────────────────────────

  private buildDecodingTable(): void {
    this.tablePanelEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'dec-header';
    header.textContent = 'Decoding Table';
    this.tablePanelEl.appendChild(header);

    const wrap = document.createElement('div');
    wrap.className = 'decode-table-wrap';

    // Table header
    const thead = document.createElement('div');
    thead.className = 'decode-table-header tbl-dec-row';
    for (const label of ['Index', 'Binary', 'Symbol', 'Bits']) {
      const col = document.createElement('div');
      col.textContent = label;
      thead.appendChild(col);
    }
    wrap.appendChild(thead);

    // Table body
    const tbody = document.createElement('div');
    tbody.className = 'canon-table-body decode-table-body';
    for (let i = 0; i < this.table.length; i++) {
      const entry = this.table[i];
      const rowEl = document.createElement('div');
      rowEl.className = 'decode-row tbl-dec-row';
      rowEl.dataset.tableIdx = String(i);

      const idxCell = document.createElement('div');
      idxCell.className = 'decode-cell-idx';
      idxCell.textContent = String(i);

      const binCell = document.createElement('div');
      binCell.className = 'decode-cell-bin';
      binCell.textContent = i.toString(2).padStart(this.tableDepth, '0');

      const symCell = document.createElement('div');
      symCell.className = 'decode-cell-sym';
      symCell.textContent = entry?.symbol ?? '';

      const bitsCell = document.createElement('div');
      bitsCell.className = 'decode-cell-bits';
      bitsCell.textContent = entry ? String(entry.numBits) : '';

      rowEl.appendChild(idxCell);
      rowEl.appendChild(binCell);
      rowEl.appendChild(symCell);
      rowEl.appendChild(bitsCell);
      rowEl.classList.add('decode-row-filled');
      tbody.appendChild(rowEl);
    }
    wrap.appendChild(tbody);
    this.tablePanelEl.appendChild(wrap);
  }

  // ── Table highlights ────────────────────────────────────────────────────────

  private setTableRowHighlight(tableIndex: number, on: boolean): void {
    const el = this.tablePanelEl.querySelector<HTMLElement>(
      `.tbl-dec-row[data-table-idx="${tableIndex}"]`
    );
    el?.classList.toggle('tbl-dec-row-active', on);
  }

  private scrollRowIntoView(tableIndex: number): void {
    const rowEl = this.tablePanelEl.querySelector<HTMLElement>(
      `.tbl-dec-row[data-table-idx="${tableIndex}"]`
    );
    if (!rowEl) return;
    const scrollContainer = this.tablePanelEl.querySelector<HTMLElement>('.decode-table-wrap');
    if (!scrollContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const rowRect = rowEl.getBoundingClientRect();

    // Check if row is fully visible within the scroll container
    if (rowRect.top >= containerRect.top && rowRect.bottom <= containerRect.bottom) return;

    // Scroll to center the row in the container
    const rowOffsetTop = rowEl.offsetTop;
    const containerHeight = scrollContainer.clientHeight;
    const rowHeight = rowEl.offsetHeight;
    scrollContainer.scrollTo({
      top: rowOffsetTop - containerHeight / 2 + rowHeight / 2,
      behavior: 'smooth',
    });
  }

  private clearAllTableHighlights(): void {
    for (const el of this.tablePanelEl.querySelectorAll<HTMLElement>('.tbl-dec-row-active')) {
      el.classList.remove('tbl-dec-row-active');
    }
  }

  // ── Bit highlights ──────────────────────────────────────────────────────────

  private setLookupHighlight(globalStart: number, count: number, on: boolean): void {
    for (let i = globalStart; i < globalStart + count && i < this.allBitEls.length; i++) {
      this.allBitEls[i].classList.toggle('tbl-dec-bit-lookup', on);
    }
  }

  private clearAllBitHighlights(): void {
    for (const el of this.allBitEls) {
      el.classList.remove('tbl-dec-bit-lookup');
    }
  }

  // ── Bit consume/restore ─────────────────────────────────────────────────────

  private consumeBit(globalIdx: number): void {
    const el = this.allBitEls[globalIdx];
    if (el) {
      el.style.transition = 'opacity 0.2s';
      el.classList.add('dec-bit-consumed');
    }
  }

  private restoreBit(globalIdx: number): void {
    const el = this.allBitEls[globalIdx];
    if (el) {
      el.style.transition = '';
      el.classList.remove('dec-bit-consumed');
    }
  }

  // ── Brace + output char ─────────────────────────────────────────────────────

  private showBrace(charIdx: number): void {
    const el = this.decPanelEl.querySelector<HTMLElement>(
      `.dec-group[data-char-idx="${charIdx}"] .dec-brace`
    );
    if (el) { el.style.transition = 'opacity 0.3s'; el.style.opacity = '1'; }
  }

  private hideBrace(charIdx: number): void {
    const el = this.decPanelEl.querySelector<HTMLElement>(
      `.dec-group[data-char-idx="${charIdx}"] .dec-brace`
    );
    if (el) { el.style.transition = ''; el.style.opacity = '0'; }
  }

  private showOutputChar(charIdx: number): void {
    const el = this.decPanelEl.querySelector<HTMLElement>(
      `.dec-char[data-char-idx="${charIdx}"]`
    );
    if (el) { el.style.transition = 'opacity 0.3s'; el.style.opacity = '1'; }
  }

  private hideOutputChar(charIdx: number): void {
    const el = this.decPanelEl.querySelector<HTMLElement>(
      `.dec-char[data-char-idx="${charIdx}"]`
    );
    if (el) { el.style.transition = ''; el.style.opacity = '0'; }
  }

  // ── Rebuild display for backward jumps ──────────────────────────────────────

  private rebuildDecDisplay(visibleUpTo: number): void {
    // Reset all bits
    for (const el of this.allBitEls) {
      el.style.transition = '';
      el.classList.remove('dec-bit-consumed');
    }

    // Mark consumed bits for completed steps
    for (let i = 0; i < visibleUpTo && i < this.steps.length; i++) {
      const step = this.steps[i];
      for (let j = 0; j < step.numBits; j++) {
        const idx = step.globalBitOffset + j;
        if (idx < this.allBitEls.length) {
          this.allBitEls[idx].classList.add('dec-bit-consumed');
        }
      }
    }

    // Show/hide braces and output chars
    for (const group of this.decPanelEl.querySelectorAll<HTMLElement>('.dec-group')) {
      const ci = parseInt(group.dataset.charIdx ?? '-1', 10);
      const brace = group.querySelector<HTMLElement>('.dec-brace');
      if (brace) { brace.style.transition = ''; brace.style.opacity = ci < visibleUpTo ? '1' : '0'; }
    }
    for (const charEl of this.decPanelEl.querySelectorAll<HTMLElement>('.dec-char')) {
      const ci = parseInt(charEl.dataset.charIdx ?? '-1', 10);
      charEl.style.transition = '';
      charEl.style.opacity = ci < visibleUpTo ? '1' : '0';
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  private buildCharActions(i: number): Action[] {
    const step = this.steps[i];
    const actions: Action[] = [];

    // Action 1: Highlight lookup bits + table row
    actions.push({
      forward: async () => {
        this.setLookupHighlight(step.globalBitOffset, step.availableBits, true);
        this.setTableRowHighlight(step.tableIndex, true);
        this.scrollRowIntoView(step.tableIndex);
        await this.scaledDelay(BASE_STEP_MS);
      },
      backward: async () => {
        this.setLookupHighlight(step.globalBitOffset, step.availableBits, false);
        this.setTableRowHighlight(step.tableIndex, false);
      },
    });

    // Action 2: Fly bits + decode
    actions.push({
      forward: async () => {
        const gen = this.generation;
        await this.flyBits(step.globalBitOffset, step.availableBits, step.lookupBits, step.tableIndex);
        if (this.generation !== gen) return;
        // Consume the actual numBits
        for (let j = 0; j < step.numBits; j++) {
          this.consumeBit(step.globalBitOffset + j);
        }
        // Restore unconsumed lookup bits (if numBits < availableBits)
        for (let j = step.numBits; j < step.availableBits; j++) {
          const idx = step.globalBitOffset + j;
          if (idx < this.allBitEls.length) {
            this.allBitEls[idx].classList.remove('tbl-dec-bit-lookup');
          }
        }
        this.showBrace(i);
        this.showOutputChar(i);
        await this.scaledDelay(BASE_STEP_MS * 0.2);
      },
      backward: async () => {
        // Restore consumed bits
        for (let j = 0; j < step.numBits; j++) {
          this.restoreBit(step.globalBitOffset + j);
        }
        // Re-add lookup highlight on unconsumed bits
        for (let j = step.numBits; j < step.availableBits; j++) {
          const idx = step.globalBitOffset + j;
          if (idx < this.allBitEls.length) {
            this.allBitEls[idx].classList.add('tbl-dec-bit-lookup');
          }
        }
        this.hideBrace(i);
        this.hideOutputChar(i);
      },
    });

    // Action 3: Cleanup
    actions.push({
      forward: async () => {
        this.setTableRowHighlight(step.tableIndex, false);
        // Clear remaining lookup highlights (the consumed bits keep dec-bit-consumed)
        this.setLookupHighlight(step.globalBitOffset, step.availableBits, false);
        await this.scaledDelay(BASE_STEP_MS * 0.3);
      },
      backward: async () => {
        this.setTableRowHighlight(step.tableIndex, true);
        // Restore lookup highlight on consumed bits only (unconsumed were cleared in action 2)
        for (let j = 0; j < step.numBits; j++) {
          const idx = step.globalBitOffset + j;
          if (idx < this.allBitEls.length) {
            this.allBitEls[idx].classList.add('tbl-dec-bit-lookup');
          }
        }
      },
    });

    return actions;
  }

  // ── Decoding panel ──────────────────────────────────────────────────────────

  private buildDecodingPanel(inputString: string, sourceRows: DepthRow[]): void {
    this.decPanelEl.innerHTML = '';
    this.allBitEls = [];

    const header = document.createElement('div');
    header.className = 'dec-header';
    header.textContent = 'Decoding';
    this.decPanelEl.appendChild(header);

    // Build symbol→codeword map
    const symbolMap = new Map<string, string>();
    for (const row of sourceRows) {
      symbolMap.set(row.symbol, row.canonicalCodeword);
    }

    // Input section: all encoded bits visible from the start
    const inputEl = document.createElement('div');
    inputEl.className = 'dec-input';

    let globalIdx = 0;
    for (let i = 0; i < inputString.length; i++) {
      const codeword = symbolMap.get(inputString[i]) ?? '';
      const group = document.createElement('div');
      group.className = 'dec-group';
      group.dataset.charIdx = String(i);

      const bitsRow = document.createElement('div');
      bitsRow.className = 'dec-group-bits';
      for (let j = 0; j < codeword.length; j++) {
        const bit = document.createElement('span');
        bit.className = 'dec-bit';
        bit.dataset.charIdx = String(i);
        bit.dataset.bitIdx = String(j);
        bit.dataset.globalIdx = String(globalIdx);
        bit.textContent = codeword[j];
        bitsRow.appendChild(bit);
        this.allBitEls.push(bit);
        globalIdx++;
      }
      group.appendChild(bitsRow);

      // Brace (hidden initially)
      const brace = document.createElement('div');
      brace.className = 'dec-brace';
      brace.style.opacity = '0';

      const braceInner = document.createElement('div');
      braceInner.className = 'dec-brace-inner';
      const leftArm = document.createElement('div');
      leftArm.className = 'dec-brace-left-arm';
      const rightArm = document.createElement('div');
      rightArm.className = 'dec-brace-right-arm';
      braceInner.appendChild(leftArm);
      braceInner.appendChild(rightArm);
      brace.appendChild(braceInner);

      const braceLabel = document.createElement('div');
      braceLabel.className = 'dec-brace-label';
      braceLabel.textContent = inputString[i];
      brace.appendChild(braceLabel);

      group.appendChild(brace);
      inputEl.appendChild(group);
    }
    this.decPanelEl.appendChild(inputEl);

    // Output section: decoded character boxes, hidden initially
    const outputRow = document.createElement('div');
    outputRow.className = 'dec-output-row';
    for (let i = 0; i < inputString.length; i++) {
      const box = document.createElement('span');
      box.className = 'dec-char';
      box.dataset.charIdx = String(i);
      box.textContent = inputString[i];
      box.style.opacity = '0';
      outputRow.appendChild(box);
    }
    this.decPanelEl.appendChild(outputRow);
  }

  // ── Fly animation ───────────────────────────────────────────────────────────

  private async flyBits(
    globalStart: number, availableCount: number, lookupBits: string, tableIndex: number,
  ): Promise<void> {
    const gen = this.generation;
    // Source: the available bits in the bitstream
    const firstBit = this.allBitEls[globalStart];
    const lastIdx = Math.min(globalStart + availableCount - 1, this.allBitEls.length - 1);
    const lastBit = this.allBitEls[lastIdx];
    if (!firstBit || !lastBit) return;
    const firstRect = firstBit.getBoundingClientRect();
    const lastRect = lastBit.getBoundingClientRect();
    const fromX = (firstRect.left + lastRect.right) / 2;
    const fromY = (firstRect.top + lastRect.bottom) / 2;

    // Target: the binary cell in the table row
    const rowEl = this.tablePanelEl.querySelector<HTMLElement>(
      `.tbl-dec-row[data-table-idx="${tableIndex}"]`
    );
    const targetEl = rowEl?.querySelector<HTMLElement>('.decode-cell-bin');
    if (!targetEl) return;
    const targetRect = targetEl.getBoundingClientRect();
    const toX = targetRect.left + targetRect.width / 2;
    const toY = targetRect.top + targetRect.height / 2;

    const floater = document.createElement('div');
    floater.className = 'dec-bit-floater';
    floater.textContent = lookupBits;
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

  // ── Start ───────────────────────────────────────────────────────────────────

  start(inputs: SymbolInput[], inputString: string): void {
    // Get decoding table and source rows
    const result = buildDecodingTableSteps(inputs, this.maxDepth);
    this.table = result.table;
    this.tableDepth = result.maxDepth;

    // Build symbol→codeword map from source rows
    const symbolMap = new Map<string, string>();
    for (const row of result.sourceRows) {
      symbolMap.set(row.symbol, row.canonicalCodeword);
    }

    // Encode input string to get the full bitstream, then decode using the table
    const D = this.tableDepth;
    let bitstream = '';
    for (const ch of inputString) {
      bitstream += symbolMap.get(ch) ?? '';
    }

    // Walk through bitstream using the table to produce steps
    this.steps = [];
    let pos = 0;
    let charIdx = 0;
    while (pos < bitstream.length && charIdx < inputString.length) {
      const realBits = bitstream.slice(pos, pos + D);
      const availableBits = realBits.length;
      const missingCount = D - availableBits;
      // Pad missing bits with random 0/1 for table lookup
      let paddedBits = realBits;
      for (let k = 0; k < missingCount; k++) {
        paddedBits += Math.random() < 0.5 ? '0' : '1';
      }
      const tableIndex = parseInt(paddedBits, 2);
      const entry = this.table[tableIndex];
      if (!entry) break;
      // Display string: real bits + X for missing
      const lookupBits = realBits + 'X'.repeat(missingCount);
      this.steps.push({
        char: entry.symbol,
        tableIndex,
        numBits: entry.numBits,
        lookupBits,
        globalBitOffset: pos,
        availableBits,
      });
      pos += entry.numBits;
      charIdx++;
    }

    this.generation++;
    this.currentStep = -1;
    this.remainingActions = [];
    this.completedActions = [];
    this.isPlaying = true;

    // Build decoding table display
    this.tablePanelEl.style.display = '';
    this.buildDecodingTable();

    // Build decoding panel
    this.decPanelEl.style.display = '';
    this.buildDecodingPanel(inputString, result.sourceRows);

    // Build controls
    this.controlsEl.innerHTML = '';
    const phase = document.createElement('div');
    phase.className = 'phase-viz';

    const controls = document.createElement('div');
    controls.className = 'viz-controls';

    this.prevBtn = document.createElement('button');
    this.prevBtn.className = 'btn-secondary';
    this.prevBtn.textContent = '\u2190 Prev';
    this.prevBtn.addEventListener('click', () => { void this.handlePrev(); });

    this.playBtn = document.createElement('button');
    this.playBtn.className = 'btn-secondary';
    this.playBtn.textContent = '\u23f8 Pause';
    this.playBtn.addEventListener('click', () => this.togglePlay());

    this.nextBtn = document.createElement('button');
    this.nextBtn.className = 'btn-secondary';
    this.nextBtn.textContent = 'Next \u2192';
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
