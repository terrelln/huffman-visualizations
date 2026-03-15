import { TreeRenderer } from '../../tree/TreeRenderer';
import type { Tree } from '../../tree/BinaryTree';
import { buildHuffmanSnapshots } from '../01-huffman-tree-construction/HuffmanAlgorithm';
import type { SymbolInput } from '../01-huffman-tree-construction/HuffmanAlgorithm';

// ═══════════════════════════════════════════════════════════════════════════
// DECODING ↔ ENCODING CORRESPONDENCE  (Demo 3 ↔ Demo 2)
//
// This demo is the structural and visual reverse of HuffmanEncodingDemo.
// Keep the two in sync: any change to one should be reflected in the other.
//
//  Encoding (HuffmanEncodingDemo)      Decoding (this file)
//  ──────────────────────────────────  ──────────────────────────────────
//  Panel top row:  INPUT chars         Panel top section:  INPUT bits
//  Panel bot row:  OUTPUT bits         Panel bot row:      OUTPUT chars
//  Bits start:     hidden (opacity 0)  Bits start:         visible (opacity 1)
//  Chars start:    visible             Chars start:        hidden (opacity 0)
//  Per char:       highlight leaf FIRST  Per char:         highlight leaf LAST
//  Per edge:       fly bit tree → panel  Per edge:         fly bit panel → tree
//  Bits fade IN as they land           Bits dim as they are consumed
//  Brace appears:  on last bit landing   Brace appears:    when leaf is reached
//
// Both share identical CharStep/EdgeStep data structures, timing constants,
// action count per character (n+2), and control/speed UI.
// ═══════════════════════════════════════════════════════════════════════════

const SVG_NS = 'http://www.w3.org/2000/svg';
// Timing constants match HuffmanEncodingDemo exactly (same feel, reverse direction)
const BASE_STEP_MS = 800;
const BASE_ANIM_MS = 400;
const BASE_FLY_MS = 500;

// ── Tree utilities (identical to HuffmanEncodingDemo) ─────────────────────

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

// ── Types (identical to HuffmanEncodingDemo) ──────────────────────────────

interface CharStep {
  char: string;
  leafId: string;
  edges: EdgeStep[];
}

interface Action {
  forward: () => Promise<void>;
  backward: () => Promise<void>;
}

// ── Demo class ────────────────────────────────────────────────────────────

export class HuffmanDecodingDemo {
  private controlsEl: HTMLElement;
  private decPanelEl: HTMLElement;
  private svgEl: SVGSVGElement;
  private renderer: TreeRenderer;

  // State mirrors HuffmanEncodingDemo exactly
  private steps: CharStep[] = [];
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

    // Panel on LEFT, tree on RIGHT — same physical layout as HuffmanEncodingDemo.
    // Fly direction is reversed: encoding bits fly right→left (tree→panel),
    // decoding bits fly left→right (panel→tree).
    this.decPanelEl = document.createElement('div');
    this.decPanelEl.className = 'dec-panel';
    this.decPanelEl.style.display = 'none';
    vizArea.appendChild(this.decPanelEl);

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
      this.rebuildDecDisplay(i + 1);
    });
  }

  private async resetToInitial(): Promise<void> {
    this.currentStep = -1;
    this.completedActions = [];
    this.remainingActions = [];
    await this.runPhase(async () => {
      this.renderer.clearHighlights();
      this.renderer.clearEdgeHighlights();
      this.rebuildDecDisplay(0);
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  // Structural reverse of HuffmanEncodingDemo.buildCharActions.
  //
  //  Encoding per char:  [leaf+char highlight] [edge0] [edge1] … [edgeN] [cleanup]
  //  Decoding per char:  [edge0] [edge1] … [edgeN] [leaf+brace+char] [cleanup]
  //
  // Both produce n+2 actions per character; the leaf highlight just moves from
  // position 0 (encoding) to position n (decoding).
  private buildCharActions(i: number): Action[] {
    const step = this.steps[i];
    const actions: Action[] = [];

    // One action per edge: highlight edge, fly bit panel→tree, dim bit.
    // (Reverse of encoding's per-edge actions, which fly bit tree→panel and reveal it.)
    for (let j = 0; j < step.edges.length; j++) {
      const edge = step.edges[j];
      const bitIdx = j;
      const charIdx = i;
      actions.push({
        forward: async () => {
          this.renderer.setEdgeHighlight(edge.parentId, edge.childId, true);
          await this.flyBit(charIdx, bitIdx, edge.parentId, edge.childId, edge.bit);
          this.consumeBit(charIdx, bitIdx);
          await this.scaledDelay(BASE_STEP_MS * 0.2);
        },
        backward: async () => {
          this.renderer.setEdgeHighlight(edge.parentId, edge.childId, false);
          this.restoreBit(charIdx, bitIdx);
        },
      });
    }

    // Leaf reached: highlight leaf, show brace over consumed bits, reveal decoded char.
    // (Reverse of encoding's first action which highlights leaf + input char box upfront.)
    actions.push({
      forward: async () => {
        this.renderer.setHighlight([step.leafId], true);
        this.showBrace(i);
        this.showOutputChar(i);
        await this.scaledDelay(BASE_STEP_MS);
      },
      backward: async () => {
        this.renderer.setHighlight([step.leafId], false);
        this.hideBrace(i);
        this.hideOutputChar(i);
      },
    });

    // Cleanup: clear all highlights (consumed bits, brace, and decoded char persist).
    // (Identical structure to encoding's cleanup action.)
    actions.push({
      forward: async () => {
        this.renderer.setHighlight([step.leafId], false);
        for (const edge of step.edges) {
          this.renderer.setEdgeHighlight(edge.parentId, edge.childId, false);
        }
        await this.scaledDelay(BASE_STEP_MS * 0.3);
      },
      backward: async () => {
        // Restore full highlighting state
        this.renderer.setHighlight([step.leafId], true);
        for (const edge of step.edges) {
          this.renderer.setEdgeHighlight(edge.parentId, edge.childId, true);
        }
      },
    });

    return actions;
  }

  // ── Decoding display ──────────────────────────────────────────────────────

  // Mirror of HuffmanEncodingDemo.buildEncodingPanel with input/output swapped:
  //   Encoding: top = input chars (visible), bottom = output bits (hidden)
  //   Decoding: top = input bits  (visible), bottom = output chars (hidden)
  private buildDecodingPanel(inputString: string): void {
    this.decPanelEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'dec-header';
    header.textContent = 'Decoding';
    this.decPanelEl.appendChild(header);

    // Input section: all encoded bits visible from the start.
    // (Reverse of encoding's output section where bits start at opacity 0.)
    const inputEl = document.createElement('div');
    inputEl.className = 'dec-input';
    for (let i = 0; i < inputString.length; i++) {
      const group = document.createElement('div');
      group.className = 'dec-group';
      group.dataset.charIdx = String(i);

      const bitsRow = document.createElement('div');
      bitsRow.className = 'dec-group-bits';
      for (let j = 0; j < this.steps[i].edges.length; j++) {
        const bit = document.createElement('span');
        bit.className = 'dec-bit';
        bit.dataset.charIdx = String(i);
        bit.dataset.bitIdx = String(j);
        bit.textContent = this.steps[i].edges[j].bit;
        // Bits start fully visible — reverse of encoding where they start at opacity 0
        bitsRow.appendChild(bit);
      }
      group.appendChild(bitsRow);

      // Brace hidden initially, appears when leaf is reached.
      // (Same timing as encoding's brace, just triggered by a different event.)
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

    // Output section: decoded character boxes, hidden initially.
    // (Reverse of encoding's input row where chars are visible from the start.)
    const outputRow = document.createElement('div');
    outputRow.className = 'dec-output-row';
    for (let i = 0; i < inputString.length; i++) {
      const box = document.createElement('span');
      box.className = 'dec-char';
      box.dataset.charIdx = String(i);
      box.textContent = inputString[i];
      box.style.opacity = '0'; // Hidden; revealed when this char is decoded
      outputRow.appendChild(box);
    }
    this.decPanelEl.appendChild(outputRow);
  }

  // Dim a bit to show it has been consumed by the decoder.
  // (Reverse of encoding's showBit which fades a bit IN as it lands.)
  private consumeBit(charIdx: number, bitIdx: number): void {
    const el = this.decPanelEl.querySelector<HTMLElement>(
      `.dec-bit[data-char-idx="${charIdx}"][data-bit-idx="${bitIdx}"]`
    );
    if (el) {
      el.style.transition = 'opacity 0.2s';
      el.classList.add('dec-bit-consumed');
    }
  }

  // Restore a consumed bit (used when stepping backward).
  // (Reverse of encoding's hideBit.)
  private restoreBit(charIdx: number, bitIdx: number): void {
    const el = this.decPanelEl.querySelector<HTMLElement>(
      `.dec-bit[data-char-idx="${charIdx}"][data-bit-idx="${bitIdx}"]`
    );
    if (el) {
      el.style.transition = '';
      el.classList.remove('dec-bit-consumed');
    }
  }

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

  // Show the decoded character in the output row.
  // (Reverse of encoding's setCharHighlight which highlights an input char.)
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

  // Mirror of HuffmanEncodingDemo.rebuildBitsDisplay, but for decoding state:
  //   chars < visibleUpTo: bits consumed, brace visible, output char visible
  //   chars >= visibleUpTo: bits normal, brace hidden, output char hidden
  private rebuildDecDisplay(visibleUpTo: number): void {
    for (const bit of this.decPanelEl.querySelectorAll<HTMLElement>('.dec-bit')) {
      const ci = parseInt(bit.dataset.charIdx ?? '-1', 10);
      bit.style.transition = '';
      if (ci < visibleUpTo) bit.classList.add('dec-bit-consumed');
      else bit.classList.remove('dec-bit-consumed');
    }
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

  // ── Fly animation ─────────────────────────────────────────────────────────

  // Exact reverse of HuffmanEncodingDemo.flyBit:
  //   Encoding: FROM tree edge label  →  TO panel bit element   (right → left)
  //   Decoding: FROM panel bit element →  TO tree edge label    (left  → right)
  private async flyBit(
    charIdx: number, bitIdx: number,
    parentId: string, childId: string, bit: string,
  ): Promise<void> {
    // Source: the panel bit element (sample its position before consuming it)
    const bitEl = this.decPanelEl.querySelector<HTMLElement>(
      `.dec-bit[data-char-idx="${charIdx}"][data-bit-idx="${bitIdx}"]`
    );
    if (!bitEl) return;
    const bitRect = bitEl.getBoundingClientRect();
    const fromX = bitRect.left + bitRect.width / 2;
    const fromY = bitRect.top + bitRect.height / 2;

    // Destination: tree edge label position
    const labelPos = this.renderer.getEdgeLabelPos(parentId, childId);
    if (!labelPos) return;
    const svgRect = this.svgEl.getBoundingClientRect();
    const vb = this.svgEl.viewBox.baseVal;
    if (!vb || vb.width === 0) return;
    const scaleX = svgRect.width / vb.width;
    const scaleY = svgRect.height / vb.height;
    const toX = svgRect.left + (labelPos.x - vb.x) * scaleX;
    const toY = svgRect.top + (labelPos.y - vb.y) * scaleY;

    const floater = document.createElement('div');
    floater.className = 'dec-bit-floater';
    floater.textContent = bit;
    floater.style.cssText = `position:fixed;left:${fromX}px;top:${fromY}px;transform:translate(-50%,-50%);opacity:0;pointer-events:none;z-index:9999;`;
    document.body.appendChild(floater);

    // Fade in at origin
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    floater.style.transition = 'opacity 0.15s';
    floater.style.opacity = '1';
    await this.scaledDelay(BASE_STEP_MS * 0.5);

    // Fly to tree edge label and fade out
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

    // Build one step per character — identical data model to HuffmanEncodingDemo
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

    // Build decoding panel
    this.decPanelEl.style.display = '';
    this.buildDecodingPanel(inputString);

    // Build controls — identical structure to HuffmanEncodingDemo
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
