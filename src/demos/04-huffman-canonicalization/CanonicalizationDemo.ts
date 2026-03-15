import { TreeRenderer } from '../../tree/TreeRenderer';
import {
  buildCanonSteps,
  buildCanonicalTree,
} from './CanonicalizationAlgorithm';
import type { CanonRow, CanonStep } from './CanonicalizationAlgorithm';
import type { SymbolInput } from '../01-huffman-tree-construction/HuffmanAlgorithm';
import type { Tree } from '../../tree/BinaryTree';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BASE_STEP_MS = 700;
const BASE_PSEUDO_STEP_MS = 1200; // slower dwell for pseudocode line highlights
const BASE_ANIM_MS = 500;
const BASE_FLY_MS  = 500;

// ── Syntax coloring helpers (same as Demo 1) ──────────────────────────────
const K = (s: string) => `<span class="pk">${s}</span>`;
const F = (s: string) => `<span class="pf">${s}</span>`;
const O = (s: string) => `<span class="po">${s}</span>`;

const PSEUDO_LINES = [
  { id: 'fn-canon',    indent: 0, html: `${K('def')} ${F('canonicalize')}(table):` },
  { id: 'sort-line',   indent: 1, html: `${F('sort')}(table, key ${O('=')} ${O('λ')} r: (r.bits, r.symbol))` },
  { id: 'code-init',   indent: 1, html: `code ${O('=')} 0` },
  { id: 'for-loop',    indent: 1, html: `${K('for')} row ${K('in')} table:` },
  { id: 'assign-cw',   indent: 2, html: `row.codeword ${O('=')} ${F('binary')}(code, row.bits)` },
  { id: 'inc-code',    indent: 2, html: `${O('++')}code` },
  { id: 'do-shift',    indent: 2, html: `code ${O('<<=')} next.bits ${O('-')} row.bits` },
  { id: 'return-line', indent: 1, html: `${K('return')} table` },
];

// ── Action type ───────────────────────────────────────────────────────────
interface Action {
  forward: () => Promise<void>;
  backward: () => Promise<void>;
}

// ── Demo class ────────────────────────────────────────────────────────────
export class CanonicalizationDemo {
  private controlsEl: HTMLElement;
  private canonPanelEl!: HTMLElement;
  private vizLeft!: HTMLElement;
  private svgEl!: SVGSVGElement;
  private renderer!: TreeRenderer;

  private actions: Action[] = [];
  private completedActions: Action[] = [];
  private isAnimating = false;
  private isPlaying = false;
  private speedMultiplier = 1;
  private generation = 0;

  private prevBtn!: HTMLButtonElement;
  private playBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;

  // State built in start()
  private rows: CanonRow[] = [];
  private steps: CanonStep[] = [];
  private huffmanTree!: Tree;

  // Table rows DOM refs (by rowIndex in the *sorted* rows order, but initially in extract order)
  // We store them in extraction order first; after sort we reorder.
  private tableRowEls: HTMLElement[] = [];
  private codeDisplayEl!: HTMLElement;
  private pseudoEl!: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.controlsEl = document.createElement('div');
    containerEl.appendChild(this.controlsEl);

    const vizArea = document.createElement('div');
    vizArea.className = 'viz-area';
    containerEl.appendChild(vizArea);

    this.canonPanelEl = document.createElement('div');
    this.canonPanelEl.className = 'canon-panel';
    this.canonPanelEl.style.display = 'none';
    vizArea.appendChild(this.canonPanelEl);

    this.vizLeft = document.createElement('div');
    this.vizLeft.className = 'viz-left';
    vizArea.appendChild(this.vizLeft);

    this.svgEl = document.createElementNS(SVG_NS, 'svg') as unknown as SVGSVGElement;
    this.svgEl.setAttribute('class', 'tree-svg');
    this.svgEl.style.display = 'none';
    this.vizLeft.appendChild(this.svgEl);

    this.renderer = new TreeRenderer({ svgEl: this.svgEl });
  }

  private scaledDelay(baseMs: number): Promise<void> {
    return new Promise<void>(resolve => {
      const start = performance.now();
      const tick = () => {
        if (performance.now() - start >= baseMs / this.speedMultiplier) resolve();
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
    // Put all completed actions back into the queue and restart
    this.actions = [...this.completedActions.reverse(), ...this.actions];
    this.completedActions = [];
    await this.runPhase(async () => {
      // Rebuild everything from scratch
      this.rebuildFromStart();
    });
  }

  // ── SVG → viewport conversion ──────────────────────────────────────────

  private svgToViewport(x: number, y: number): { x: number; y: number } {
    const rect = this.svgEl.getBoundingClientRect();
    const vb = this.svgEl.viewBox.baseVal;
    if (!vb || vb.width === 0) return { x: rect.left + x, y: rect.top + y };
    const scaleX = rect.width / vb.width;
    const scaleY = rect.height / vb.height;
    return { x: rect.left + (x - vb.x) * scaleX, y: rect.top + (y - vb.y) * scaleY };
  }

  // ── Fly animations ─────────────────────────────────────────────────────

  private async flyToRow(
    fromX: number, fromY: number,
    rowEl: HTMLElement,
    text: string,
    cssClass: string,
    flyMs = BASE_FLY_MS,
  ): Promise<void> {
    const targetRect = rowEl.getBoundingClientRect();
    const toX = targetRect.left + targetRect.width / 2;
    const toY = targetRect.top + targetRect.height / 2;
    await this.fly(fromX, fromY, toX, toY, text, cssClass, flyMs);
  }

  private async flyFromRow(
    rowEl: HTMLElement,
    toX: number, toY: number,
    text: string,
    cssClass: string,
    flyMs = BASE_FLY_MS,
  ): Promise<void> {
    const symCell = rowEl.querySelector<HTMLElement>('.canon-cell-sym') ?? rowEl;
    const sourceRect = symCell.getBoundingClientRect();
    const fromX = sourceRect.left + sourceRect.width / 2;
    const fromY = sourceRect.top + sourceRect.height / 2;
    await this.fly(fromX, fromY, toX, toY, text, cssClass, flyMs);
  }

  private async fly(
    fromX: number, fromY: number,
    toX: number, toY: number,
    text: string,
    cssClass: string,
    flyMs = BASE_FLY_MS,
  ): Promise<void> {
    const floater = document.createElement('div');
    floater.className = cssClass;
    floater.textContent = text;
    floater.style.cssText = `position:fixed;left:${fromX}px;top:${fromY}px;transform:translate(-50%,-50%);opacity:0;pointer-events:none;z-index:9999;`;
    document.body.appendChild(floater);

    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    floater.style.transition = 'opacity 0.15s';
    floater.style.opacity = '1';
    await this.scaledDelay(BASE_STEP_MS * 0.4);

    const flyDur = Math.round(flyMs / this.speedMultiplier);
    floater.style.transition = `left ${flyDur}ms ease, top ${flyDur}ms ease, opacity ${flyDur}ms ease`;
    floater.style.left = `${toX}px`;
    floater.style.top = `${toY}px`;
    floater.style.opacity = '0';
    await this.scaledDelay(flyMs);
    floater.remove();
  }

  // ── Pseudocode highlight ───────────────────────────────────────────────

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
        el.classList.toggle('active-last',  !active.has(nextId));
      } else {
        el.classList.remove('active-first', 'active-last');
      }
    });
  }

  private clearPseudoHighlight(): void {
    this.setPseudoHighlight([]);
  }

  // ── Build panel DOM ────────────────────────────────────────────────────

  private buildPanel(rows: CanonRow[]): void {
    this.canonPanelEl.innerHTML = '';
    this.tableRowEls = [];

    const header = document.createElement('div');
    header.className = 'canon-header';
    header.textContent = 'Canonicalization';
    this.canonPanelEl.appendChild(header);

    // Pseudocode block
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

    this.codeDisplayEl = document.createElement('div');
    this.codeDisplayEl.className = 'canon-code-display';
    this.codeDisplayEl.textContent = 'code = 0b0';
    this.pseudoEl.appendChild(this.codeDisplayEl);
    this.canonPanelEl.appendChild(this.pseudoEl);

    // Table (div-based grid so transforms move the full row background)
    const tableWrap = document.createElement('div');
    tableWrap.className = 'canon-table-wrap';

    const headerRow = document.createElement('div');
    headerRow.className = 'canon-table-header';
    for (const label of ['Symbol', 'Bits', 'Codeword']) {
      const cell = document.createElement('div');
      cell.textContent = label;
      headerRow.appendChild(cell);
    }
    tableWrap.appendChild(headerRow);

    const tbody = document.createElement('div');
    tbody.className = 'canon-table-body';

    // Pre-render all rows with opacity 0 (in extraction DFS order)
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowEl = document.createElement('div');
      rowEl.className = 'canon-row';
      rowEl.style.opacity = '0';

      const symCell = document.createElement('div');
      symCell.className = 'canon-cell-sym';
      symCell.textContent = row.symbol;

      const bitsCell = document.createElement('div');
      bitsCell.className = 'canon-cell-bits';
      bitsCell.textContent = String(row.numBits);

      const cwCell = document.createElement('div');
      cwCell.className = 'canon-cell-cw';
      const cwSpan = document.createElement('span');
      cwSpan.className = 'canon-cw-text';
      cwSpan.textContent = row.naiveCodeword;
      cwCell.appendChild(cwSpan);

      rowEl.appendChild(symCell);
      rowEl.appendChild(bitsCell);
      rowEl.appendChild(cwCell);
      tbody.appendChild(rowEl);
      this.tableRowEls.push(rowEl);
    }

    tableWrap.appendChild(tbody);
    this.canonPanelEl.appendChild(tableWrap);
  }

  // ── Action builders ────────────────────────────────────────────────────

  // The steps from CanonicalizationAlgorithm are produced in a specific order.
  // We'll track which extraction-order rows have been shown (for the "rows" array
  // before sort). After the SortStep, rows[] in the algorithm result is already
  // sorted, and tableRowEls needs to be reordered to match.
  //
  // Important: the algorithm's rows[] array is sorted in-place before we get it,
  // so rows[i] after sorting = the row at sorted position i.
  // The SortStep.permutation[i] = original extraction index for sorted row i.

  private buildActions(
    steps: CanonStep[],
    rows: CanonRow[],
    extractionRows: CanonRow[], // rows in DFS extraction order (pre-sort)
  ): Action[] {
    const actions: Action[] = [];

    // We need to track a "current code value" as a display string for the
    // assign steps. We'll pre-compute the code display state for each assign step.
    const codeDisplayStates: string[] = [];
    let code = 0;
    for (const step of steps) {
      if (step.kind === 'assign') {
        codeDisplayStates.push(`code = 0b${code.toString(2).padStart(step.codeword.length, '0')}`);
        const codeAfter = code + 1;
        if (step.shiftAmount > 0) {
          code = codeAfter << step.shiftAmount;
        } else {
          code = codeAfter;
        }
      }
    }

    // Track sorted positions of table row elements (in tableRowEls index space)
    // tableRowEls[i] corresponds to extractionRows[i]
    // After sort, we need to find which tableRowEl corresponds to each sorted row.
    let assignIdx = 0;
    let buildTreeCount = 0;

    for (const step of steps) {
      if (step.kind === 'extract') {
        const s = step;
        actions.push({
          forward: async () => {
            const gen = this.generation;
            this.renderer.setHighlight([s.leafId], true);
            // Fly from leaf position to table row
            const rowEl = this.tableRowEls[s.rowIndex];
            const nodePos = this.renderer.getNodePos(s.leafId);
            if (nodePos) {
              const vp = this.svgToViewport(nodePos.x, nodePos.y);
              await this.flyToRow(vp.x, vp.y, rowEl, extractionRows[s.rowIndex].symbol, 'canon-row-floater', BASE_FLY_MS * 1.8);
            }
            if (this.generation !== gen) return;
            rowEl.style.transition = 'opacity 0.3s';
            rowEl.style.opacity = '1';
            this.renderer.setHighlight([s.leafId], false);
            await this.scaledDelay(BASE_STEP_MS * 0.6);
          },
          backward: async () => {
            const rowEl = this.tableRowEls[s.rowIndex];
            rowEl.style.transition = '';
            rowEl.style.opacity = '0';
            this.renderer.setHighlight([s.leafId], false);
          },
        });

      } else if (step.kind === 'sort') {
        const s = step;
        // permutation[i] = extraction index for sorted position i
        // We need to animate table rows moving to their new positions.
        actions.push({
          forward: async () => {
            this.setPseudoHighlight(['fn-canon', 'sort-line']);

            const tableBody = this.tableRowEls[0]?.parentElement as HTMLElement;
            if (!tableBody) return;

            // Snapshot the top of each slot (slot j = current position of tableRowEls[j])
            const tops = this.tableRowEls.map(r => r.getBoundingClientRect().top);

            for (const row of this.tableRowEls) {
              row.style.transition = 'none';
              row.style.transform = 'translateY(0)';
            }

            await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

            // permutation[i] = extraction index of the row that belongs at sorted slot i
            // → row at extraction index permutation[i] moves from tops[permutation[i]] to tops[i]
            const sortAnimMs = BASE_ANIM_MS * 1.6;
            const dur = Math.round(sortAnimMs / this.speedMultiplier);
            for (let i = 0; i < s.permutation.length; i++) {
              const row = this.tableRowEls[s.permutation[i]];
              const translateY = tops[i] - tops[s.permutation[i]];
              row.style.transition = `transform ${dur}ms ease`;
              row.style.transform = `translateY(${translateY}px)`;
            }

            await this.scaledDelay(sortAnimMs);

            // Commit new DOM order, clear transforms
            const newOrder = s.permutation.map(idx => this.tableRowEls[idx]);
            for (const row of newOrder) {
              tableBody.appendChild(row);
              row.style.transition = '';
              row.style.transform = '';
            }
            for (let i = 0; i < newOrder.length; i++) {
              this.tableRowEls[i] = newOrder[i];
            }

            await this.scaledDelay(BASE_STEP_MS * 0.8);
          },
          backward: async () => {
            const tableBody = this.tableRowEls[0]?.parentElement as HTMLElement;
            if (!tableBody) return;

            // Snapshot the top of each slot (currently in sorted order)
            const tops = this.tableRowEls.map(r => r.getBoundingClientRect().top);

            for (const row of this.tableRowEls) {
              row.style.transition = 'none';
              row.style.transform = 'translateY(0)';
            }

            await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

            // Row at sorted position i (extraction index permutation[i]) moves
            // from tops[i] back to extraction slot permutation[i] (top = tops[permutation[i]])
            const dur = Math.round(BASE_ANIM_MS / this.speedMultiplier);
            for (let i = 0; i < s.permutation.length; i++) {
              const row = this.tableRowEls[i];
              const translateY = tops[s.permutation[i]] - tops[i];
              row.style.transition = `transform ${dur}ms ease`;
              row.style.transform = `translateY(${translateY}px)`;
            }

            await this.scaledDelay(BASE_ANIM_MS);

            // Commit extraction-order DOM, clear transforms
            const extractionOrder: HTMLElement[] = new Array(s.permutation.length);
            for (let i = 0; i < s.permutation.length; i++) {
              extractionOrder[s.permutation[i]] = this.tableRowEls[i];
            }
            for (const row of extractionOrder) {
              tableBody.appendChild(row);
              row.style.transition = '';
              row.style.transform = '';
            }
            for (let i = 0; i < extractionOrder.length; i++) {
              this.tableRowEls[i] = extractionOrder[i];
            }

            this.clearPseudoHighlight();
          },
        });

        // Erase codewords action (after sort)
        actions.push({
          forward: async () => {
            for (const rowEl of this.tableRowEls) {
              const cwSpan = rowEl.querySelector<HTMLElement>('.canon-cw-text');
              if (cwSpan) {
                cwSpan.style.transition = 'opacity 0.3s';
                cwSpan.style.opacity = '0';
              }
            }
            await this.scaledDelay(BASE_STEP_MS * 1.2);
          },
          backward: async () => {
            for (let i = 0; i < this.tableRowEls.length; i++) {
              const cwSpan = this.tableRowEls[i].querySelector<HTMLElement>('.canon-cw-text');
              if (cwSpan) {
                cwSpan.textContent = rows[i].naiveCodeword;
                cwSpan.style.transition = 'opacity 0.3s';
                cwSpan.style.opacity = '1';
              }
            }
            await this.scaledDelay(BASE_STEP_MS * 0.3);
          },
        });

      } else if (step.kind === 'code-init') {
        actions.push({
          forward: async () => {
            this.setPseudoHighlight(['code-init']);
            this.codeDisplayEl.style.opacity = '1';
            this.codeDisplayEl.textContent = 'code = 0b0';
            await this.scaledDelay(BASE_PSEUDO_STEP_MS);
          },
          backward: async () => {
            this.codeDisplayEl.style.opacity = '0';
            this.setPseudoHighlight(['fn-canon', 'sort-line']);
          },
        });

      } else if (step.kind === 'assign') {
        const s = step;
        const localAssignIdx = assignIdx++;
        const codeDisplayBefore = codeDisplayStates[localAssignIdx];
        const isLast = s.rowIndex === rows.length - 1;

        // Action A: highlight for-loop + assign-cw. Fill in codeword.
        actions.push({
          forward: async () => {
            this.setPseudoHighlight(['for-loop', 'assign-cw']);
            this.tableRowEls[s.rowIndex].classList.add('canon-row-active');
            const cwSpan = this.tableRowEls[s.rowIndex].querySelector<HTMLElement>('.canon-cw-text');
            if (cwSpan) {
              cwSpan.innerHTML = s.codeword.split('').map((b, i) =>
                `<span class="canon-cw-bit" data-bit-idx="${i}">${b}</span>`
              ).join('');
              cwSpan.style.opacity = '1';
            }
            await this.scaledDelay(BASE_PSEUDO_STEP_MS);
          },
          backward: async () => {
            this.tableRowEls[s.rowIndex].classList.remove('canon-row-active');
            const cwSpan = this.tableRowEls[s.rowIndex].querySelector<HTMLElement>('.canon-cw-text');
            if (cwSpan) {
              cwSpan.innerHTML = '';
              cwSpan.style.opacity = '0';
            }
            // Go back to code-init highlight or previous assign row active
            if (s.rowIndex === 0) {
              this.setPseudoHighlight(['code-init']);
              this.codeDisplayEl.textContent = 'code = 0b0';
            } else {
              this.setPseudoHighlight(['for-loop', 'assign-cw']);
              this.tableRowEls[s.rowIndex - 1].classList.add('canon-row-active');
              this.codeDisplayEl.textContent = codeDisplayBefore;
            }
          },
        });

        // Action B: highlight inc-code. Update code display to code+1.
        const nextNumBits = isLast ? rows[s.rowIndex].numBits : rows[s.rowIndex + 1].numBits;
        const codeAfterInc = `code = 0b${s.codeAfter.toString(2).padStart(rows[s.rowIndex].numBits, '0')}`;

        actions.push({
          forward: async () => {
            this.setPseudoHighlight(['inc-code']);
            this.codeDisplayEl.textContent = codeAfterInc;
            this.tableRowEls[s.rowIndex].classList.remove('canon-row-active');
            await this.scaledDelay(BASE_PSEUDO_STEP_MS);
          },
          backward: async () => {
            this.tableRowEls[s.rowIndex].classList.add('canon-row-active');
            this.codeDisplayEl.textContent = codeDisplayBefore;
            this.setPseudoHighlight(['for-loop', 'assign-cw']);
          },
        });

        // Action C: highlight do-shift. No-op when bits are equal.
        const shiftedCode = s.codeAfter << s.shiftAmount;
        const codeAfterShift = `code = 0b${shiftedCode.toString(2).padStart(nextNumBits, '0')}`;

        actions.push({
          forward: async () => {
            this.setPseudoHighlight(['do-shift']);
            this.codeDisplayEl.textContent = codeAfterShift;
            await this.scaledDelay(BASE_PSEUDO_STEP_MS);
          },
          backward: async () => {
            this.codeDisplayEl.textContent = codeAfterInc;
            this.setPseudoHighlight(['inc-code']);
          },
        });

        if (isLast) {
          // Action D: highlight return-line
          actions.push({
            forward: async () => {
              this.setPseudoHighlight(['return-line']);
              await this.scaledDelay(BASE_PSEUDO_STEP_MS);
            },
            backward: async () => {
              this.codeDisplayEl.textContent = codeAfterShift;
              this.setPseudoHighlight(['do-shift']);
            },
          });
        }

      } else if (step.kind === 'build-tree') {
        const s = step;
        const treeBeforeIdx = buildTreeCount;
        buildTreeCount++;
        const treeAfterIdx = buildTreeCount;

        actions.push({
          forward: async () => {
            const treeAfter = buildCanonicalTree(rows, treeAfterIdx - 1);

            // First build step: fade out Huffman tree and init canonical renderer
            if (treeBeforeIdx === 0) {
              this.clearPseudoHighlight();
              this.codeDisplayEl.style.opacity = '0';

              const fadeDur = Math.round(400 / this.speedMultiplier);
              this.svgEl.style.transition = `opacity ${fadeDur}ms`;
              this.svgEl.style.opacity = '0';
              await this.scaledDelay(400);
              this.svgEl.style.transition = '';

              while (this.svgEl.firstChild) this.svgEl.firstChild.remove();
              this.renderer = new TreeRenderer({
                svgEl: this.svgEl,
                transitionDuration: BASE_ANIM_MS,
                getSpeedMultiplier: () => this.speedMultiplier,
              });
              this.svgEl.style.opacity = '1';
            }

            // Add all new nodes (internal nodes + leaf) with scale-in animation
            this.renderer.update(treeAfter);
            await this.scaledDelay(BASE_ANIM_MS * 1.2);

            // Traverse every edge from root to leaf, highlighting blue + flying bit pill
            // from the corresponding bit in the table codeword cell to the tree edge
            const pathIds: string[] = [''];
            for (let i = 1; i <= s.codeword.length; i++) {
              pathIds.push(s.codeword.slice(0, i));
            }
            for (let i = 0; i < pathIds.length - 1; i++) {
              const parentId = pathIds[i];
              const childId  = pathIds[i + 1];
              const bit = childId[childId.length - 1];

              this.renderer.setEdgeHighlight(parentId, childId, true);

              const bitEl = this.tableRowEls[s.sourceRowIndex]
                .querySelector<HTMLElement>(`.canon-cw-bit[data-bit-idx="${i}"]`);
              const edgeLabelPos = this.renderer.getEdgeLabelPos(parentId, childId);
              if (bitEl && edgeLabelPos) {
                const bitRect = bitEl.getBoundingClientRect();
                const fromX = bitRect.left + bitRect.width / 2;
                const fromY = bitRect.top + bitRect.height / 2;
                const edgeVp = this.svgToViewport(edgeLabelPos.x, edgeLabelPos.y);
                await this.fly(fromX, fromY, edgeVp.x, edgeVp.y, bit, 'canon-bit-floater');
              }
            }

            // Leaf reached: glow gold
            this.renderer.setHighlight([s.codeword], true);

            // Symbol flies from table row to leaf in gold
            const leafPos = this.renderer.getNodePos(s.codeword);
            if (leafPos) {
              const rowEl = this.tableRowEls[s.sourceRowIndex];
              const leafVp = this.svgToViewport(leafPos.x, leafPos.y);
              await this.flyFromRow(rowEl, leafVp.x, leafVp.y, s.symbol, 'canon-symbol-floater');
            }

            // Dwell then clear highlights
            await this.scaledDelay(BASE_STEP_MS * 0.5);
            this.renderer.clearEdgeHighlights();
            this.renderer.setHighlight([s.codeword], false);
          },
          backward: async () => {
            // Clear any lingering highlights
            this.renderer.clearEdgeHighlights();
            this.renderer.setHighlight([s.codeword], false);

            if (treeBeforeIdx === 0) {
              // Undo the SVG swap: restore original Huffman tree
              const fadeDur = Math.round(400 / this.speedMultiplier);
              this.svgEl.style.transition = `opacity ${fadeDur}ms`;
              this.svgEl.style.opacity = '0';
              await this.scaledDelay(400);
              this.svgEl.style.transition = '';

              while (this.svgEl.firstChild) this.svgEl.firstChild.remove();
              this.renderer = new TreeRenderer({
                svgEl: this.svgEl,
                transitionDuration: BASE_ANIM_MS,
                getSpeedMultiplier: () => this.speedMultiplier,
              });
              this.renderer.update(this.huffmanTree);
              this.svgEl.style.opacity = '1';

              this.setPseudoHighlight(['return-line']);
              this.codeDisplayEl.style.opacity = '1';
            } else {
              const treeBefore = buildCanonicalTree(rows, treeBeforeIdx - 1);
              this.renderer.update(treeBefore);
              await this.scaledDelay(BASE_ANIM_MS);
            }
          },
        });
      }
    }

    return actions;
  }

  // ── Rebuild from start (for replay) ───────────────────────────────────

  private rebuildFromStart(): void {
    // Re-render huffman tree
    while (this.svgEl.firstChild) this.svgEl.firstChild.remove();
    this.renderer = new TreeRenderer({
      svgEl: this.svgEl,
      transitionDuration: BASE_ANIM_MS,
      getSpeedMultiplier: () => this.speedMultiplier,
    });
    this.renderer.update(this.huffmanTree);
    this.svgEl.style.opacity = '1';

    // Reset panel
    const extractionRows = this.buildExtractionRows();
    this.buildPanel(extractionRows);
    this.codeDisplayEl.style.opacity = '0';

    // Rebuild action queue
    this.actions = this.buildActions(this.steps, this.rows, extractionRows);
  }

  private buildExtractionRows(): CanonRow[] {
    // We need the rows in DFS extraction order to build the panel.
    // The rows[] from the algorithm are in sorted order. We can reconstruct
    // extraction order from the SortStep permutation.
    const sortStep = this.steps.find(s => s.kind === 'sort') as { kind: 'sort'; permutation: number[] } | undefined;
    if (!sortStep) return this.rows;

    // permutation[sortedIndex] = extractionIndex
    // So extractionRow[extractionIndex] = sortedRow[sortedIndex]
    const extractionRows: CanonRow[] = new Array(this.rows.length);
    for (let sortedIdx = 0; sortedIdx < sortStep.permutation.length; sortedIdx++) {
      const extractIdx = sortStep.permutation[sortedIdx];
      extractionRows[extractIdx] = this.rows[sortedIdx];
    }
    return extractionRows;
  }

  // ── Start ──────────────────────────────────────────────────────────────

  start(inputs: SymbolInput[], _inputString: string): void {
    // Invalidate any in-flight async chains from a previous run
    this.generation++;
    this.isPlaying = false;
    this.isAnimating = false;

    const result = buildCanonSteps(inputs);
    this.huffmanTree = result.huffmanTree;
    this.rows = result.rows;
    this.steps = result.steps;

    this.completedActions = [];
    this.isPlaying = true;

    // Setup SVG with huffman tree
    while (this.svgEl.firstChild) this.svgEl.firstChild.remove();
    this.renderer = new TreeRenderer({
      svgEl: this.svgEl,
      transitionDuration: BASE_ANIM_MS,
      getSpeedMultiplier: () => this.speedMultiplier,
    });
    this.svgEl.style.display = '';
    this.svgEl.style.opacity = '1';
    this.renderer.update(this.huffmanTree);

    // Build panel in extraction order
    const extractionRows = this.buildExtractionRows();
    this.canonPanelEl.style.display = '';
    this.buildPanel(extractionRows);

    // Build all actions
    this.actions = this.buildActions(this.steps, this.rows, extractionRows);

    // Build controls
    this.controlsEl.innerHTML = '';
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

    // Initial delay then autoplay
    void this.runPhase(async () => {
      await this.scaledDelay(BASE_STEP_MS * 0.5);
    }).then(() => {
      if (this.isPlaying) void this.playLoop();
    });
  }
}
