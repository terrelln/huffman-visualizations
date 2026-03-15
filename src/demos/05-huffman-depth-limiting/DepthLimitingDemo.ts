import { TreeRenderer } from '../../tree/TreeRenderer';
import { buildDepthLimitingSteps } from './DepthLimitingAlgorithm';
import type { DepthRow, DepthStep } from './DepthLimitingAlgorithm';
import { buildCanonSteps } from '../04-huffman-canonicalization/CanonicalizationAlgorithm';
import type { SymbolInput } from '../01-huffman-tree-construction/HuffmanAlgorithm';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BASE_STEP_MS = 700;
const BASE_PSEUDO_STEP_MS = 1200;
const BASE_ANIM_MS = 500;

// ── Syntax coloring helpers (same as Demo 1) ──────────────────────────────
const K = (s: string) => `<span class="pk">${s}</span>`;
const F = (s: string) => `<span class="pf">${s}</span>`;
const O = (s: string) => `<span class="po">${s}</span>`;

const PSEUDO_LINES = [
  { id: 'fn-def',           indent: 0, html: `${K('def')} ${F('depth_limit')}(table, max_depth):` },
  { id: 'sort-line',        indent: 1, html: `${F('sort')}(table, key ${O('=')} ${O('λ')} x: x.freq)` },
  { id: 'clamp-for',        indent: 1, html: `${K('for')} row ${K('in')} table:` },
  { id: 'clamp-set',        indent: 2, html: `row.bits ${O('=')} ${F('min')}(row.bits, max_depth)` },
  { id: '',                  indent: 0, html: '' },
  { id: 'w-lambda',         indent: 1, html: `weight ${O('=')} ${O('λ')} bits: 2<sup>(max_depth ${O('-')} bits)</sup>` },
  { id: 'target-line',      indent: 1, html: `W<sub>T</sub> ${O('=')} 2<sup>max_depth</sup>` },
  { id: 'kraft-init',       indent: 1, html: `W<sub>C</sub> ${O('=')} ${O('Σ')} ${F('weight')}(row.bits) ${K('for')} row ${K('in')} table` },
  { id: '',                  indent: 0, html: '' },
  { id: 'demote-for',       indent: 1, html: `${K('for')} row ${K('in')} table ${K('while')} W<sub>C</sub> ${O('>')} W<sub>T</sub>:` },
  { id: 'demote-while',     indent: 2, html: `${K('while')} row.bits ${O('<')} max_depth ${K('and')} W<sub>C</sub> ${O('>')} W<sub>T</sub>:` },
  { id: 'demote-kraft',     indent: 3, html: `W<sub>C</sub> ${O('-=')} ${F('weight')}(row.bits ${O('+')} 1)` },
  { id: 'demote-inc',       indent: 3, html: `${O('++')}row.bits` },
  { id: '',                  indent: 0, html: '' },
  { id: 'promote-for',      indent: 1, html: `${K('for')} row ${K('in')} ${F('reversed')}(table) ${K('while')} W<sub>C</sub> ${O('≠')} W<sub>T</sub>:` },
  { id: 'promote-while',    indent: 2, html: `${K('while')} W<sub>C</sub> ${O('+')} ${F('weight')}(row.bits) ${O('≤')} W<sub>T</sub>:` },
  { id: 'promote-kraft',    indent: 3, html: `W<sub>C</sub> ${O('+=')} ${F('weight')}(row.bits)` },
  { id: 'promote-dec',      indent: 3, html: `${O('--')}row.bits` },
  { id: '',                  indent: 0, html: '' },
  { id: 'canon-line',       indent: 1, html: `${K('return')} ${F('canonicalize')}(table)` },
];

// ── Action type ───────────────────────────────────────────────────────────
interface Action {
  forward: () => Promise<void>;
  backward: () => Promise<void>;
}

// ── Demo class ────────────────────────────────────────────────────────────
export class DepthLimitingDemo {
  private controlsEl: HTMLElement;
  private depthPanelEl!: HTMLElement;
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

  private steps: DepthStep[] = [];
  private maxDepth = 3;
  private savedInputs: SymbolInput[] = [];

  private tableRowEls: HTMLElement[] = [];
  private pseudoEl!: HTMLElement;
  private kraftDisplayEl!: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.controlsEl = document.createElement('div');
    containerEl.appendChild(this.controlsEl);

    const vizArea = document.createElement('div');
    vizArea.className = 'viz-area';
    containerEl.appendChild(vizArea);

    this.depthPanelEl = document.createElement('div');
    this.depthPanelEl.className = 'canon-panel depth-panel';
    this.depthPanelEl.style.display = 'none';
    vizArea.appendChild(this.depthPanelEl);

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

  setMaxDepth(n: number): void {
    this.maxDepth = n;
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
    this.actions = [...this.completedActions.reverse(), ...this.actions];
    this.completedActions = [];
    await this.runPhase(async () => {
      this.rebuildFromStart();
    });
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

  // ── Kraft display ─────────────────────────────────────────────────────

  private updateKraftDisplay(kraftSum: number, target: number): void {
    this.kraftDisplayEl.textContent = `W_C = ${kraftSum}  /  W_T = ${target}`;
    this.kraftDisplayEl.style.opacity = '1';
  }

  // ── Build panel DOM ────────────────────────────────────────────────────

  private buildPanel(rows: DepthRow[]): void {
    this.depthPanelEl.innerHTML = '';
    this.tableRowEls = [];

    const header = document.createElement('div');
    header.className = 'canon-header';
    header.textContent = 'Depth Limiting';
    this.depthPanelEl.appendChild(header);

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

    this.kraftDisplayEl = document.createElement('div');
    this.kraftDisplayEl.className = 'depth-kraft-display';
    this.kraftDisplayEl.textContent = 'W_C = 0  /  W_T = 0';
    this.kraftDisplayEl.style.opacity = '0';
    this.pseudoEl.appendChild(this.kraftDisplayEl);

    // Table
    const tableWrap = document.createElement('div');
    tableWrap.className = 'canon-table-wrap';

    const headerRow = document.createElement('div');
    headerRow.className = 'depth-table-header';
    for (const label of ['Symbol', 'Freq', 'Bits', 'Codeword']) {
      const cell = document.createElement('div');
      cell.textContent = label;
      headerRow.appendChild(cell);
    }
    tableWrap.appendChild(headerRow);

    const tbody = document.createElement('div');
    tbody.className = 'canon-table-body';

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowEl = document.createElement('div');
      rowEl.className = 'depth-row';

      const symCell = document.createElement('div');
      symCell.className = 'canon-cell-sym';
      symCell.textContent = row.symbol;

      const freqCell = document.createElement('div');
      freqCell.className = 'depth-cell-freq';
      freqCell.textContent = String(row.freq);

      const bitsCell = document.createElement('div');
      bitsCell.className = 'canon-cell-bits';
      bitsCell.textContent = String(row.numBits);

      const cwCell = document.createElement('div');
      cwCell.className = 'canon-cell-cw';
      const cwSpan = document.createElement('span');
      cwSpan.className = 'canon-cw-text';
      cwSpan.textContent = row.canonicalCodeword;
      cwCell.appendChild(cwSpan);

      rowEl.appendChild(symCell);
      rowEl.appendChild(freqCell);
      rowEl.appendChild(bitsCell);
      rowEl.appendChild(cwCell);
      tbody.appendChild(rowEl);
      this.tableRowEls.push(rowEl);
    }

    tableWrap.appendChild(tbody);

    // Side-by-side container for pseudocode + table
    const bodyRow = document.createElement('div');
    bodyRow.className = 'depth-body-row';
    bodyRow.appendChild(this.pseudoEl);
    bodyRow.appendChild(tableWrap);
    this.depthPanelEl.appendChild(bodyRow);
  }

  // ── Action builders ────────────────────────────────────────────────────

  private buildActions(steps: DepthStep[], initialRows: DepthRow[]): Action[] {
    const actions: Action[] = [];

    // Save initial codewords for backward restoration
    const initialCodewords = initialRows.map(r => r.canonicalCodeword);

    // Action 0: highlight fn-def, clear codewords
    actions.push({
      forward: async () => {
        this.setPseudoHighlight(['fn-def']);
        // Clear codewords from table
        for (const rowEl of this.tableRowEls) {
          const cwSpan = rowEl.querySelector<HTMLElement>('.canon-cw-text');
          if (cwSpan) cwSpan.textContent = '';
        }
        await this.scaledDelay(BASE_PSEUDO_STEP_MS);
      },
      backward: async () => {
        this.clearPseudoHighlight();
        // Restore codewords
        for (let i = 0; i < this.tableRowEls.length; i++) {
          const cwSpan = this.tableRowEls[i].querySelector<HTMLElement>('.canon-cw-text');
          if (cwSpan) cwSpan.textContent = initialCodewords[i];
        }
      },
    });

    for (const step of steps) {
      if (step.kind === 'clamp') {
        const s = step;
        actions.push({
          forward: async () => {
            this.setPseudoHighlight(['clamp-for', 'clamp-set']);
            // Update all rows at once, highlight any that changed
            for (let i = 0; i < this.tableRowEls.length; i++) {
              const bitsCell = this.tableRowEls[i].querySelector<HTMLElement>('.canon-cell-bits');
              if (bitsCell) {
                bitsCell.textContent = String(s.newBits[i]);
                if (s.oldBits[i] !== s.newBits[i]) {
                  bitsCell.classList.add('depth-bits-changed');
                  this.tableRowEls[i].classList.add('canon-row-active');
                }
              }
            }
            await this.scaledDelay(BASE_PSEUDO_STEP_MS);
            for (let i = 0; i < this.tableRowEls.length; i++) {
              this.tableRowEls[i].classList.remove('canon-row-active');
              const bitsCell = this.tableRowEls[i].querySelector<HTMLElement>('.canon-cell-bits');
              if (bitsCell) bitsCell.classList.remove('depth-bits-changed');
            }
          },
          backward: async () => {
            for (let i = 0; i < this.tableRowEls.length; i++) {
              this.tableRowEls[i].classList.remove('canon-row-active');
              const bitsCell = this.tableRowEls[i].querySelector<HTMLElement>('.canon-cell-bits');
              if (bitsCell) {
                bitsCell.textContent = String(s.oldBits[i]);
                bitsCell.classList.remove('depth-bits-changed');
              }
            }
            this.setPseudoHighlight(['sort-line']);
          },
        });

      } else if (step.kind === 'kraft-init') {
        const s = step;
        actions.push({
          forward: async () => {
            this.setPseudoHighlight(['w-lambda', 'target-line', 'kraft-init']);
            this.updateKraftDisplay(s.kraftSum, s.target);
            await this.scaledDelay(BASE_PSEUDO_STEP_MS);
          },
          backward: async () => {
            this.kraftDisplayEl.style.opacity = '0';
            this.setPseudoHighlight(['clamp-for', 'clamp-set']);
          },
        });

      } else if (step.kind === 'sort-by-freq') {
        const s = step;
        actions.push({
          forward: async () => {
            this.setPseudoHighlight(['sort-line']);

            const tableBody = this.tableRowEls[0]?.parentElement as HTMLElement;
            if (!tableBody) return;

            const tops = this.tableRowEls.map(r => r.getBoundingClientRect().top);
            for (const row of this.tableRowEls) {
              row.style.transition = 'none';
              row.style.transform = 'translateY(0)';
            }
            await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

            const sortAnimMs = BASE_ANIM_MS * 1.6;
            const dur = Math.round(sortAnimMs / this.speedMultiplier);
            for (let i = 0; i < s.permutation.length; i++) {
              const row = this.tableRowEls[s.permutation[i]];
              const translateY = tops[i] - tops[s.permutation[i]];
              row.style.transition = `transform ${dur}ms ease`;
              row.style.transform = `translateY(${translateY}px)`;
            }
            await this.scaledDelay(sortAnimMs);

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

            const tops = this.tableRowEls.map(r => r.getBoundingClientRect().top);
            for (const row of this.tableRowEls) {
              row.style.transition = 'none';
              row.style.transform = 'translateY(0)';
            }
            await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

            const dur = Math.round(BASE_ANIM_MS / this.speedMultiplier);
            for (let i = 0; i < s.permutation.length; i++) {
              const row = this.tableRowEls[i];
              const translateY = tops[s.permutation[i]] - tops[i];
              row.style.transition = `transform ${dur}ms ease`;
              row.style.transform = `translateY(${translateY}px)`;
            }
            await this.scaledDelay(BASE_ANIM_MS);

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

            this.setPseudoHighlight(['fn-def']);
          },
        });

      } else if (step.kind === 'demote') {
        const s = step;
        const demoteSteps = this.steps.filter(st => st.kind === 'demote');
        const isFirstDemote = demoteSteps.length > 0 && demoteSteps[0] === s;

        if (s.broke) {
          // for-while condition false — loop ends, just flash the for line
          actions.push({
            forward: async () => {
              this.setPseudoHighlight(['demote-for']);
              await this.scaledDelay(BASE_PSEUDO_STEP_MS);
            },
            backward: async () => {
              if (isFirstDemote) {
                this.setPseudoHighlight(['w-lambda', 'target-line', 'kraft-init']);
              } else {
                this.setPseudoHighlight(['demote-while']);
              }
            },
          });
        } else if (s.applied) {
          actions.push({
            forward: async () => {
              if (s.isFirstIteration) {
                this.setPseudoHighlight(['demote-for']);
                this.tableRowEls[s.rowIndex].classList.add('canon-row-active');
                await this.scaledDelay(BASE_PSEUDO_STEP_MS * 0.4);
              }
              this.tableRowEls[s.rowIndex].classList.add('canon-row-active');
              this.setPseudoHighlight(['demote-while']);
              await this.scaledDelay(BASE_PSEUDO_STEP_MS * 0.4);
              this.setPseudoHighlight(['demote-kraft', 'demote-inc']);
              const bitsCell = this.tableRowEls[s.rowIndex].querySelector<HTMLElement>('.canon-cell-bits');
              if (bitsCell) {
                bitsCell.textContent = String(s.newBits);
                bitsCell.classList.add('depth-bits-changed');
              }
              this.updateKraftDisplay(s.kraftAfter, s.target);
              await this.scaledDelay(BASE_PSEUDO_STEP_MS);
              if (bitsCell) bitsCell.classList.remove('depth-bits-changed');
              this.tableRowEls[s.rowIndex].classList.remove('canon-row-active');
            },
            backward: async () => {
              this.tableRowEls[s.rowIndex].classList.remove('canon-row-active');
              const bitsCell = this.tableRowEls[s.rowIndex].querySelector<HTMLElement>('.canon-cell-bits');
              if (bitsCell) {
                bitsCell.textContent = String(s.oldBits);
                bitsCell.classList.remove('depth-bits-changed');
              }
              this.updateKraftDisplay(s.kraftBefore, s.target);
              if (isFirstDemote) {
                this.setPseudoHighlight(['w-lambda', 'target-line', 'kraft-init']);
              } else {
                this.setPseudoHighlight(['demote-while']);
              }
            },
          });
        } else {
          // Not applied, not broke: while condition false, move to next row
          actions.push({
            forward: async () => {
              this.setPseudoHighlight(['demote-for']);
              this.tableRowEls[s.rowIndex].classList.add('canon-row-active');
              await this.scaledDelay(BASE_PSEUDO_STEP_MS * 0.4);
              this.setPseudoHighlight(['demote-while']);
              await this.scaledDelay(BASE_PSEUDO_STEP_MS);
              this.tableRowEls[s.rowIndex].classList.remove('canon-row-active');
            },
            backward: async () => {
              this.tableRowEls[s.rowIndex].classList.remove('canon-row-active');
              if (isFirstDemote) {
                this.setPseudoHighlight(['w-lambda', 'target-line', 'kraft-init']);
              } else {
                this.setPseudoHighlight(['demote-while']);
              }
            },
          });
        }

      } else if (step.kind === 'promote') {
        const s = step;
        const promoteSteps = steps.filter(st => st.kind === 'promote');
        const isFirstPromote = promoteSteps.length > 0 && promoteSteps[0] === s;

        const backToDemote = (): void => {
          const lastDemote = [...steps].filter(st => st.kind === 'demote').pop() as any;
          if (lastDemote?.broke) {
            this.setPseudoHighlight(['demote-for']);
          } else if (lastDemote) {
            this.setPseudoHighlight(['demote-while']);
          } else {
            this.setPseudoHighlight(['w-lambda', 'target-line', 'kraft-init']);
          }
        };

        if (s.broke) {
          // for-while condition false — loop ends, just flash the for line
          actions.push({
            forward: async () => {
              this.setPseudoHighlight(['promote-for']);
              await this.scaledDelay(BASE_PSEUDO_STEP_MS);
            },
            backward: async () => {
              if (isFirstPromote) {
                backToDemote();
              } else {
                this.setPseudoHighlight(['promote-while']);
              }
            },
          });
        } else if (s.applied) {
          actions.push({
            forward: async () => {
              if (s.isFirstIteration) {
                this.setPseudoHighlight(['promote-for']);
                this.tableRowEls[s.rowIndex].classList.add('canon-row-active');
                await this.scaledDelay(BASE_PSEUDO_STEP_MS * 0.4);
              }
              this.tableRowEls[s.rowIndex].classList.add('canon-row-active');
              this.setPseudoHighlight(['promote-while']);
              await this.scaledDelay(BASE_PSEUDO_STEP_MS * 0.4);
              this.setPseudoHighlight(['promote-kraft', 'promote-dec']);
              const bitsCell = this.tableRowEls[s.rowIndex].querySelector<HTMLElement>('.canon-cell-bits');
              if (bitsCell) {
                bitsCell.textContent = String(s.newBits);
                bitsCell.classList.add('depth-bits-changed');
              }
              this.updateKraftDisplay(s.kraftAfter, s.target);
              await this.scaledDelay(BASE_PSEUDO_STEP_MS);
              if (bitsCell) bitsCell.classList.remove('depth-bits-changed');
              this.tableRowEls[s.rowIndex].classList.remove('canon-row-active');
            },
            backward: async () => {
              this.tableRowEls[s.rowIndex].classList.remove('canon-row-active');
              const bitsCell = this.tableRowEls[s.rowIndex].querySelector<HTMLElement>('.canon-cell-bits');
              if (bitsCell) {
                bitsCell.textContent = String(s.oldBits);
                bitsCell.classList.remove('depth-bits-changed');
              }
              this.updateKraftDisplay(s.kraftBefore, s.target);
              if (isFirstPromote) {
                backToDemote();
              } else {
                this.setPseudoHighlight(['promote-while']);
              }
            },
          });
        } else {
          // Not applied, not broke: while condition false, move to next row
          actions.push({
            forward: async () => {
              this.setPseudoHighlight(['promote-for']);
              this.tableRowEls[s.rowIndex].classList.add('canon-row-active');
              await this.scaledDelay(BASE_PSEUDO_STEP_MS * 0.4);
              this.setPseudoHighlight(['promote-while']);
              await this.scaledDelay(BASE_PSEUDO_STEP_MS);
              this.tableRowEls[s.rowIndex].classList.remove('canon-row-active');
            },
            backward: async () => {
              this.tableRowEls[s.rowIndex].classList.remove('canon-row-active');
              if (isFirstPromote) {
                backToDemote();
              } else {
                this.setPseudoHighlight(['promote-while']);
              }
            },
          });
        }

      } else if (step.kind === 'finalize') {
        const s = step;
        actions.push({
          forward: async () => {
            this.setPseudoHighlight(['canon-line']);
            // Fill all codewords
            // Table is currently in freq-sorted order; we need to map finalized rows back
            // The finalized rows are sorted by (numBits, symbol), different from current DOM order.
            // Create a lookup by symbol
            const cwBySymbol = new Map<string, string>();
            for (const row of s.rows) {
              cwBySymbol.set(row.symbol, row.canonicalCodeword);
            }
            const bitsBySymbol = new Map<string, number>();
            for (const row of s.rows) {
              bitsBySymbol.set(row.symbol, row.numBits);
            }
            for (const rowEl of this.tableRowEls) {
              const sym = rowEl.querySelector<HTMLElement>('.canon-cell-sym')?.textContent ?? '';
              const cwSpan = rowEl.querySelector<HTMLElement>('.canon-cw-text');
              if (cwSpan) cwSpan.textContent = cwBySymbol.get(sym) ?? '';
              const bitsCell = rowEl.querySelector<HTMLElement>('.canon-cell-bits');
              if (bitsCell) bitsCell.textContent = String(bitsBySymbol.get(sym) ?? '');
            }

            // Show tree
            while (this.svgEl.firstChild) this.svgEl.firstChild.remove();
            this.renderer = new TreeRenderer({
              svgEl: this.svgEl,
              transitionDuration: BASE_ANIM_MS,
              getSpeedMultiplier: () => this.speedMultiplier,
            });
            this.svgEl.style.display = '';
            this.renderer.update(s.tree);
            await this.scaledDelay(BASE_PSEUDO_STEP_MS);
          },
          backward: async () => {
            // Hide tree
            this.svgEl.style.display = 'none';
            while (this.svgEl.firstChild) this.svgEl.firstChild.remove();
            // Clear codewords
            for (const rowEl of this.tableRowEls) {
              const cwSpan = rowEl.querySelector<HTMLElement>('.canon-cw-text');
              if (cwSpan) cwSpan.textContent = '';
            }
            // Restore pseudocode highlight from last promote step
            const lastPromote = [...steps].filter(st => st.kind === 'promote').pop();
            if (lastPromote) {
              this.setPseudoHighlight(['promote-for']);
            }
          },
        });
      }
    }

    return actions;
  }

  // ── Rebuild from start (for replay) ───────────────────────────────────

  private rebuildFromStart(): void {
    this.svgEl.style.display = 'none';
    while (this.svgEl.firstChild) this.svgEl.firstChild.remove();
    this.renderer = new TreeRenderer({
      svgEl: this.svgEl,
      transitionDuration: BASE_ANIM_MS,
      getSpeedMultiplier: () => this.speedMultiplier,
    });

    const result = buildDepthLimitingSteps(this.savedInputs, this.maxDepth);
    this.steps = result.steps;

    // Build initial rows (before depth limiting) from canonical result
    const initialRows = this.buildInitialRows();
    this.buildPanel(initialRows);
    this.actions = this.buildActions(this.steps, initialRows);
  }

  private buildInitialRows(): DepthRow[] {
    const canonResult = buildCanonSteps(this.savedInputs);
    const freqMap = new Map<string, number>();
    for (const inp of this.savedInputs) {
      freqMap.set(inp.symbol, inp.freq);
    }
    return canonResult.rows.map(cr => ({
      symbol: cr.symbol,
      freq: freqMap.get(cr.symbol) ?? 0,
      numBits: cr.numBits,
      canonicalCodeword: cr.canonicalCodeword,
    }));
  }

  // ── Start ──────────────────────────────────────────────────────────────

  start(inputs: SymbolInput[], _inputString: string): void {
    this.generation++;
    this.isPlaying = false;
    this.isAnimating = false;
    this.savedInputs = inputs;

    // Build initial rows (canonical, pre-depth-limiting)
    const initialRows = this.buildInitialRows();

    const result = buildDepthLimitingSteps(inputs, this.maxDepth);
    this.steps = result.steps;
    this.completedActions = [];
    this.isPlaying = true;

    // Setup panel
    this.depthPanelEl.style.display = '';
    this.buildPanel(initialRows);

    // SVG hidden until finalize
    this.svgEl.style.display = 'none';

    // Build actions
    this.actions = this.buildActions(this.steps, initialRows);

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

    void this.runPhase(async () => {
      await this.scaledDelay(BASE_STEP_MS * 0.5);
    }).then(() => {
      if (this.isPlaying) void this.playLoop();
    });
  }
}
