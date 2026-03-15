import { TreeRenderer } from '../../tree/TreeRenderer';
import type { Tree } from '../../tree/BinaryTree';
import { buildHuffmanSnapshots } from '../01-huffman-tree-construction/HuffmanAlgorithm';
import type { SymbolInput } from '../01-huffman-tree-construction/HuffmanAlgorithm';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BASE_STEP_MS = 800;
const BASE_ANIM_MS = 400;
const BASE_FLY_MS = 500;

// ── Tree utilities ────────────────────────────────────────────────────────────

function stripCounts(tree: Tree): Tree {
  const newNodes = new Map(
    [...tree.nodes.entries()].map(([id, node]) => {
      const isLeaf = !node.leftId && !node.rightId;
      const label = isLeaf ? node.label.split(':')[0] : '';
      return [id, { ...node, label }];
    })
  );
  return { ...tree, nodes: newNodes };
}

function findLeafId(tree: Tree, symbol: string): string | null {
  for (const [id, node] of tree.nodes) {
    if (!node.leftId && !node.rightId && node.label.split(':')[0] === symbol) return id;
  }
  return null;
}

interface EdgeStep {
  parentId: string;
  childId: string;
  bit: '0' | '1';
}

function buildEdgePath(tree: Tree, leafId: string): EdgeStep[] {
  const result: EdgeStep[] = [];
  const dfs = (nodeId: string): boolean => {
    if (nodeId === leafId) return true;
    const node = tree.nodes.get(nodeId);
    if (!node) return false;
    if (node.leftId && dfs(node.leftId)) {
      result.unshift({ parentId: nodeId, childId: node.leftId, bit: '0' });
      return true;
    }
    if (node.rightId && dfs(node.rightId)) {
      result.unshift({ parentId: nodeId, childId: node.rightId, bit: '1' });
      return true;
    }
    return false;
  };
  for (const rootId of tree.rootIds) {
    result.length = 0;
    if (dfs(rootId)) return result;
  }
  return result;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CharStep {
  char: string;
  leafId: string;
  edges: EdgeStep[];
}

interface Action {
  forward: () => Promise<void>;
  backward: () => Promise<void>;
}

// ── Demo class ────────────────────────────────────────────────────────────────

export class HuffmanEncodingDemo {
  private controlsEl: HTMLElement;
  private encPanelEl: HTMLElement;
  private svgEl: SVGSVGElement;
  private renderer: TreeRenderer;

  private steps: CharStep[] = [];
  // currentStep: -1 = initial (before any char), 0..N-1 = at/within char i
  private currentStep = -1;
  private remainingActions: Action[] = [];
  private completedActions: Action[] = [];
  private isAnimating = false;
  private isPlaying = false;
  private speedMultiplier = 1;

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

    const vizLeft = document.createElement('div');
    vizLeft.className = 'viz-left';
    vizArea.appendChild(vizLeft);

    this.svgEl = document.createElementNS(SVG_NS, 'svg') as unknown as SVGSVGElement;
    this.svgEl.setAttribute('class', 'tree-svg');
    this.svgEl.style.display = 'none';
    vizLeft.appendChild(this.svgEl);

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
    while (this.isPlaying && !this.isAllDone()) {
      await this.handleNext();
    }
    if (this.isAllDone()) {
      this.isPlaying = false;
      this.updateNavButtons();
    }
  }

  private async runPhase(fn: () => Promise<void>): Promise<void> {
    this.isAnimating = true;
    this.prevBtn.disabled = true;
    this.nextBtn.disabled = true;
    await fn();
    this.isAnimating = false;
    this.updateNavButtons();
  }

  private async handleNext(): Promise<void> {
    if (this.isAnimating) return;
    if (this.remainingActions.length > 0) {
      const action = this.remainingActions.shift()!;
      await this.runPhase(action.forward);
      this.completedActions.push(action);
    } else {
      const nextIdx = this.currentStep + 1; // -1 + 1 = 0 for first char
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
    await this.runPhase(first.forward);
    this.completedActions.push(first);
  }

  private async goToCompletedStep(i: number): Promise<void> {
    this.currentStep = i;
    this.completedActions = this.buildCharActions(i);
    this.remainingActions = [];
    await this.runPhase(async () => {
      this.renderer.clearHighlights();
      this.renderer.clearEdgeHighlights();
      this.rebuildBitsDisplay(i + 1);
      this.clearAllCharHighlights();
    });
  }

  private async resetToInitial(): Promise<void> {
    this.currentStep = -1;
    this.completedActions = [];
    this.remainingActions = [];
    await this.runPhase(async () => {
      this.renderer.clearHighlights();
      this.renderer.clearEdgeHighlights();
      this.rebuildBitsDisplay(0);
      this.clearAllCharHighlights();
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  private buildCharActions(i: number): Action[] {
    const step = this.steps[i];
    const actions: Action[] = [];

    // Highlight leaf node + input char box
    actions.push({
      forward: async () => {
        this.renderer.setHighlight([step.leafId], true);
        this.setCharHighlight(i, true);
        await this.scaledDelay(BASE_STEP_MS);
      },
      backward: async () => {
        this.renderer.setHighlight([step.leafId], false);
        this.setCharHighlight(i, false);
      },
    });

    // One action per edge: highlight edge + fly bit to display
    for (let j = 0; j < step.edges.length; j++) {
      const edge = step.edges[j];
      const bitIdx = j;
      const charIdx = i;
      const isLastBit = j === step.edges.length - 1;
      actions.push({
        forward: async () => {
          this.renderer.setEdgeHighlight(edge.parentId, edge.childId, true);
          await this.flyBit(edge.parentId, edge.childId, edge.bit, charIdx, bitIdx);
          this.showBit(charIdx, bitIdx);
          if (isLastBit) this.showBrace(charIdx);
          await this.scaledDelay(BASE_STEP_MS * 0.2);
        },
        backward: async () => {
          this.renderer.setEdgeHighlight(edge.parentId, edge.childId, false);
          this.hideBit(charIdx, bitIdx);
          if (isLastBit) this.hideBrace(charIdx);
        },
      });
    }

    // Cleanup: clear all highlights for this char (bits stay visible)
    actions.push({
      forward: async () => {
        this.renderer.setHighlight([step.leafId], false);
        for (const edge of step.edges) {
          this.renderer.setEdgeHighlight(edge.parentId, edge.childId, false);
        }
        this.setCharHighlight(i, false);
        await this.scaledDelay(BASE_STEP_MS * 0.3);
      },
      backward: async () => {
        // Restore full highlighting state
        this.renderer.setHighlight([step.leafId], true);
        for (const edge of step.edges) {
          this.renderer.setEdgeHighlight(edge.parentId, edge.childId, true);
        }
        this.setCharHighlight(i, true);
      },
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

    // Single encoded output: one group per char, laid out in a row
    const outputEl = document.createElement('div');
    outputEl.className = 'enc-output';
    for (let i = 0; i < inputString.length; i++) {
      const group = document.createElement('div');
      group.className = 'enc-group';
      group.dataset.charIdx = String(i);

      // Bits
      const bitsRow = document.createElement('div');
      bitsRow.className = 'enc-group-bits';
      for (let j = 0; j < this.steps[i].edges.length; j++) {
        const bit = document.createElement('span');
        bit.className = 'enc-bit';
        bit.dataset.charIdx = String(i);
        bit.dataset.bitIdx = String(j);
        bit.textContent = this.steps[i].edges[j].bit;
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
    // Show bits and braces for fully-encoded chars (< visibleUpTo), hide the rest
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

  private async flyBit(
    parentId: string, childId: string, bit: string,
    charIdx: number, bitIdx: number,
  ): Promise<void> {
    const labelPos = this.renderer.getEdgeLabelPos(parentId, childId);
    if (!labelPos) return;

    const svgRect = this.svgEl.getBoundingClientRect();
    const vb = this.svgEl.viewBox.baseVal;
    if (!vb || vb.width === 0) return;

    const scaleX = svgRect.width / vb.width;
    const scaleY = svgRect.height / vb.height;
    const fromX = svgRect.left + (labelPos.x - vb.x) * scaleX;
    const fromY = svgRect.top + (labelPos.y - vb.y) * scaleY;

    const targetEl = this.encPanelEl.querySelector<HTMLElement>(
      `.enc-bit[data-char-idx="${charIdx}"][data-bit-idx="${bitIdx}"]`
    );
    if (!targetEl) return;
    const targetRect = targetEl.getBoundingClientRect();
    const toX = targetRect.left + targetRect.width / 2;
    const toY = targetRect.top + targetRect.height / 2;

    const floater = document.createElement('div');
    floater.className = 'enc-bit-floater';
    floater.textContent = bit;
    floater.style.cssText = `position:fixed;left:${fromX}px;top:${fromY}px;transform:translate(-50%,-50%);opacity:0;pointer-events:none;z-index:9999;`;
    document.body.appendChild(floater);

    // Fade in at origin
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    floater.style.transition = 'opacity 0.15s';
    floater.style.opacity = '1';
    await this.scaledDelay(BASE_STEP_MS * 0.5);

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
    const snapshots = buildHuffmanSnapshots(inputs);
    const last = snapshots[snapshots.length - 1];
    const tree = stripCounts(last.tree);

    // Build one step per character in the input string
    this.steps = [];
    for (const char of inputString) {
      const leafId = findLeafId(last.tree, char);
      if (!leafId) continue;
      const edges = buildEdgePath(last.tree, leafId);
      this.steps.push({ char, leafId, edges });
    }

    this.currentStep = -1;
    this.remainingActions = [];
    this.completedActions = [];
    this.isPlaying = true;

    // Reset renderer
    while (this.svgEl.firstChild) this.svgEl.firstChild.remove();
    this.renderer = new TreeRenderer({
      svgEl: this.svgEl,
      transitionDuration: BASE_ANIM_MS,
      getSpeedMultiplier: () => this.speedMultiplier,
    });
    this.svgEl.style.display = '';
    this.renderer.update(tree, undefined);

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

    // Show initial state then autoplay
    void this.runPhase(async () => {
      await this.scaledDelay(BASE_STEP_MS * 0.5);
    }).then(() => {
      if (this.isPlaying) void this.playLoop();
    });
  }
}
