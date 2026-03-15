import type { Tree } from './BinaryTree';
import { computeLayout } from './TreeLayout';
import type { Position } from './TreeLayout';

export interface SectionInfo {
  q1Ids: string[];
  q1Title: string;
  q1Caption: string;
  q2Ids: string[];
  q2Title: string;
  q2Caption: string;
}

interface RendererOptions {
  svgEl: SVGSVGElement;
  nodeRadius?: number;
  transitionDuration?: number;
  getSpeedMultiplier?: () => number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const LABEL_TITLE_Y  = 18;
const LABEL_CAPTION_Y = 33;

export class TreeRenderer {
  private svgEl: SVGSVGElement;
  private nodeRadius: number;
  private readonly baseTransitionDuration: number;
  private readonly getSpeedMultiplier: () => number;

  get transitionDuration(): number {
    return Math.round(this.baseTransitionDuration / this.getSpeedMultiplier());
  }

  private sectionLabelsGroup: SVGGElement;
  private edgesGroup: SVGGElement;
  private edgeLabelsGroup: SVGGElement;
  private nodesGroup: SVGGElement;

  private nodeGroupMap = new Map<string, SVGGElement>();
  private edgeMap = new Map<string, SVGLineElement>();
  private edgeLabelMap = new Map<string, SVGTextElement>();
  private highlightedEdges = new Set<string>();

  constructor({ svgEl, nodeRadius = 22, transitionDuration = 800, getSpeedMultiplier = () => 1 }: RendererOptions) {
    this.svgEl = svgEl;
    this.nodeRadius = nodeRadius;
    this.baseTransitionDuration = transitionDuration;
    this.getSpeedMultiplier = getSpeedMultiplier;

    this.sectionLabelsGroup = document.createElementNS(SVG_NS, 'g');
    this.sectionLabelsGroup.id = 'section-labels';
    this.edgesGroup = document.createElementNS(SVG_NS, 'g');
    this.edgesGroup.id = 'edges';
    this.edgeLabelsGroup = document.createElementNS(SVG_NS, 'g');
    this.edgeLabelsGroup.id = 'edge-labels';
    this.nodesGroup = document.createElementNS(SVG_NS, 'g');
    this.nodesGroup.id = 'nodes';

    this.svgEl.appendChild(this.sectionLabelsGroup);
    this.svgEl.appendChild(this.edgesGroup);
    this.svgEl.appendChild(this.edgeLabelsGroup);
    this.svgEl.appendChild(this.nodesGroup);
  }

  private scaledDelay(baseMs: number): Promise<void> {
    return new Promise<void>(resolve => {
      const start = performance.now();
      const tick = () => {
        if (performance.now() - start >= baseMs / this.getSpeedMultiplier()) {
          resolve();
        } else {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private parseXY(id: string): { x: number; y: number } | null {
    const t = this.nodeGroupMap.get(id)?.style.transform;
    if (!t) return null;
    const m = t.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
  }

  /**
   * Spawn a floating label at (fromX, fromY), fade it in, dwell, then fly to
   * (toX, toY) while fading out. Used by both forward and reverse animations so
   * each pair is guaranteed to be the exact mirror of the other.
   *
   * @param groupClass  CSS class on the <g> (e.g. 'comparison-label').
   *                    Text gets `${groupClass}-text`; bg rect gets `${groupClass}-bg`.
   * @param dwellBaseMs Base dwell duration before flying (speed-scaled internally).
   * @param flyBaseMs   Base fly/fade duration (speed-scaled internally).
   */
  private async flyLabel(
    groupClass: string,
    labelText: string,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    dwellBaseMs: number,
    flyBaseMs: number,
  ): Promise<void> {
    const g = document.createElementNS(SVG_NS, 'g');
    g.classList.add(groupClass);
    g.style.transform = `translate(${fromX}px, ${fromY}px)`;
    g.style.opacity = '0';

    const textEl = document.createElementNS(SVG_NS, 'text');
    textEl.classList.add(`${groupClass}-text`);
    textEl.textContent = labelText;
    textEl.setAttribute('text-anchor', 'middle');
    textEl.setAttribute('dominant-baseline', 'central');
    g.appendChild(textEl);
    this.nodesGroup.appendChild(g);

    // Wait two rAFs so the element is in the DOM and we can measure it.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        const bb = (textEl as SVGTextElement).getBBox();
        const pad = 6;
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.classList.add(`${groupClass}-bg`);
        rect.setAttribute('x',      String(bb.x - pad));
        rect.setAttribute('y',      String(bb.y - pad));
        rect.setAttribute('width',  String(bb.width  + pad * 2));
        rect.setAttribute('height', String(bb.height + pad * 2));
        rect.setAttribute('rx', '4');
        g.insertBefore(rect, textEl);
      } catch {}
      resolve();
    })));

    // Fade in at origin, then dwell.
    g.style.transition = 'opacity 0.2s ease';
    g.style.opacity = '1';
    await this.scaledDelay(dwellBaseMs);

    // Fly to destination and fade out.
    const flyDur = Math.round(flyBaseMs / this.getSpeedMultiplier());
    g.style.transition = `opacity ${flyDur}ms ease, transform ${flyDur}ms ease`;
    g.style.transform = `translate(${toX}px, ${toY}px)`;
    g.style.opacity = '0';
    await this.scaledDelay(flyBaseMs);
    g.remove();
  }

  // ── Comparison animation ─────────────────────────────────────────────────────

  async showComparisonAnimation(
    q1Id: string,
    q2Id: string,
    q1Freq: number,
    q2Freq: number,
    selectedId: string,
  ): Promise<void> {
    const q1pos = this.parseXY(q1Id);
    const q2pos = this.parseXY(q2Id);
    if (!q1pos || !q2pos) return;

    const op = q1Freq < q2Freq ? '<' : q1Freq > q2Freq ? '>' : '=';
    const winnerPos = selectedId === q1Id ? q1pos : q2pos;
    const startX = (q1pos.x + q2pos.x) / 2;
    const startY = Math.min(q1pos.y, q2pos.y) - 38;

    await this.flyLabel(
      'comparison-label', `${q1Freq} ${op} ${q2Freq}`,
      startX, startY,
      winnerPos.x, winnerPos.y,
      this.baseTransitionDuration,        // dwell
      this.baseTransitionDuration * 0.8,  // fly
    );
  }

  /** Reverse of showComparisonAnimation: label starts at winner and flies back to center. */
  async showComparisonAnimationReverse(
    q1Id: string,
    q2Id: string,
    q1Freq: number,
    q2Freq: number,
    selectedId: string,
  ): Promise<void> {
    const q1pos = this.parseXY(q1Id);
    const q2pos = this.parseXY(q2Id);
    if (!q1pos || !q2pos) return;

    const op = q1Freq < q2Freq ? '<' : q1Freq > q2Freq ? '>' : '=';
    const winnerPos = selectedId === q1Id ? q1pos : q2pos;
    const endX = (q1pos.x + q2pos.x) / 2;
    const endY = Math.min(q1pos.y, q2pos.y) - 38;

    await this.flyLabel(
      'comparison-label', `${q1Freq} ${op} ${q2Freq}`,
      winnerPos.x, winnerPos.y,
      endX, endY,
      this.baseTransitionDuration,        // dwell
      this.baseTransitionDuration * 0.8,  // fly
    );
  }

  // ── Sum animation ────────────────────────────────────────────────────────────

  async showSumAnimation(
    leftId: string,
    rightId: string,
    leftFreq: number,
    rightFreq: number,
    parentId: string,
  ): Promise<void> {
    const lp = this.parseXY(leftId);
    const rp = this.parseXY(rightId);
    const pp = this.parseXY(parentId);
    if (!lp || !rp || !pp) return;

    const startX = (lp.x + rp.x) / 2;
    const startY = (lp.y + rp.y) / 2;

    await this.flyLabel(
      'sum-label', `${leftFreq} + ${rightFreq} = ${leftFreq + rightFreq}`,
      startX, startY,
      pp.x, pp.y,
      this.baseTransitionDuration * 0.6,  // dwell
      this.baseTransitionDuration,        // fly
    );
  }

  /**
   * Reverse of showSumAnimation: label starts at parent and flies back to
   * children midpoint. Must be called BEFORE renderer.update(prevSnap) so that
   * parseXY(parentId) can still read the parent's position from nodeGroupMap.
   */
  async showSumAnimationReverse(
    leftId: string,
    rightId: string,
    leftFreq: number,
    rightFreq: number,
    parentId: string,
  ): Promise<void> {
    const lp = this.parseXY(leftId);
    const rp = this.parseXY(rightId);
    const pp = this.parseXY(parentId);
    if (!lp || !rp || !pp) return;

    const endX = (lp.x + rp.x) / 2;
    const endY = (lp.y + rp.y) / 2;

    await this.flyLabel(
      'sum-label', `${leftFreq} + ${rightFreq} = ${leftFreq + rightFreq}`,
      pp.x, pp.y,
      endX, endY,
      this.baseTransitionDuration * 0.6,  // dwell
      this.baseTransitionDuration,        // fly
    );
  }

  // ── Node state ───────────────────────────────────────────────────────────────

  clearHighlights(): void {
    for (const el of this.nodeGroupMap.values()) {
      el.classList.remove('merging', 'comparing');
    }
  }

  setComparing(ids: string[], on: boolean): void {
    for (const id of ids) {
      this.nodeGroupMap.get(id)?.classList.toggle('comparing', on);
    }
  }

  setHighlight(ids: string[], on: boolean): void {
    for (const id of ids) {
      this.nodeGroupMap.get(id)?.classList.toggle('merging', on);
    }
  }

  setEdgeHighlight(parentId: string, childId: string, on: boolean): void {
    const key = `${parentId}->${childId}`;
    const line = this.edgeMap.get(key);
    if (!line) return;
    line.classList.toggle('highlighted', on);
    if (on) this.highlightedEdges.add(key);
    else this.highlightedEdges.delete(key);
  }

  clearEdgeHighlights(): void {
    for (const key of this.highlightedEdges) {
      this.edgeMap.get(key)?.classList.remove('highlighted');
    }
    this.highlightedEdges.clear();
  }

  getNodePos(id: string): { x: number; y: number } | null {
    return this.parseXY(id);
  }

  getEdgeLabelPos(parentId: string, childId: string): { x: number; y: number } | null {
    const key = `${parentId}->${childId}`;
    const lbl = this.edgeLabelMap.get(key);
    if (!lbl) return null;
    return { x: parseFloat(lbl.getAttribute('x') ?? '0'), y: parseFloat(lbl.getAttribute('y') ?? '0') };
  }

  update(tree: Tree, sections?: SectionInfo): void {
    const layout = computeLayout(tree);
    const { positions, totalWidth, totalHeight } = layout;

    // Resize SVG
    this.svgEl.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    this.svgEl.style.width = `${totalWidth}px`;
    this.svgEl.style.height = `${totalHeight}px`;

    const newIds = new Set(tree.nodes.keys());
    const oldIds = new Set(this.nodeGroupMap.keys());

    // 1. Removals
    for (const id of oldIds) {
      if (!newIds.has(id)) {
        const el = this.nodeGroupMap.get(id)!;
        el.style.transition = `opacity ${this.transitionDuration}ms, transform ${this.transitionDuration}ms`;
        el.style.opacity = '0';
        el.style.transform = el.style.transform.replace(/scale\([^)]*\)/, '') + ' scale(0)';
        el.addEventListener('transitionend', () => el.remove(), { once: true });
        this.nodeGroupMap.delete(id);
      }
    }

    // 2. Moves (existing nodes)
    for (const id of oldIds) {
      if (newIds.has(id)) {
        const el = this.nodeGroupMap.get(id)!;
        const pos = positions.get(id)!;
        el.style.transition = `opacity ${this.transitionDuration}ms, transform ${this.transitionDuration}ms`;
        el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        const textEl = el.querySelector('text');
        const node = tree.nodes.get(id)!;
        if (textEl) textEl.textContent = node.label;
      }
    }

    // 3. Additions (new nodes)
    for (const id of newIds) {
      if (!oldIds.has(id)) {
        const pos = positions.get(id)!;
        const node = tree.nodes.get(id)!;
        const g = this.createNodeGroup(id, node.label, pos.x, pos.y);

        g.style.transition = 'none';
        g.style.opacity = '0';
        g.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(0)`;
        this.nodesGroup.appendChild(g);
        this.nodeGroupMap.set(id, g);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            g.style.transition = `opacity ${this.transitionDuration}ms, transform ${this.transitionDuration}ms`;
            g.style.opacity = '1';
            g.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(1)`;
          });
        });
      }
    }

    // 4. Update edges
    this.updateEdges(tree, positions);

    // 5. Update section labels
    this.updateSectionLabels(sections, positions, tree, totalHeight);
  }

  private updateSectionLabels(
    sections: SectionInfo | undefined,
    positions: Map<string, Position>,
    tree: Tree,
    totalHeight: number,
  ): void {
    // Clear previous labels
    while (this.sectionLabelsGroup.firstChild) {
      this.sectionLabelsGroup.firstChild.remove();
    }
    if (!sections) return;

    const { q1Ids, q1Title, q1Caption, q2Ids, q2Title, q2Caption } = sections;

    const xExtent = (rootIds: string[]): { minX: number; maxX: number } | null => {
      let minX = Infinity, maxX = -Infinity;
      const visit = (id: string) => {
        const pos = positions.get(id);
        if (pos) { minX = Math.min(minX, pos.x); maxX = Math.max(maxX, pos.x); }
        const node = tree.nodes.get(id);
        if (node?.leftId)  visit(node.leftId);
        if (node?.rightId) visit(node.rightId);
      };
      for (const id of rootIds) visit(id);
      return minX === Infinity ? null : { minX, maxX };
    };

    const q1Ext = q1Ids.length > 0 ? xExtent(q1Ids) : null;
    const q2Ext = q2Ids.length > 0 ? xExtent(q2Ids) : null;

    const addText = (x: number, y: number, text: string, cls: string) => {
      const el = document.createElementNS(SVG_NS, 'text');
      el.setAttribute('x', String(x));
      el.setAttribute('y', String(y));
      el.setAttribute('dy', '0.35em');
      el.classList.add(cls);
      // Render _X as an SVG subscript tspan (e.g. "Q_L" → Q with subscript L)
      const parts = text.split(/(_[A-Za-z])/);
      if (parts.length === 1) {
        el.textContent = text;
      } else {
        for (const part of parts) {
          const tspan = document.createElementNS(SVG_NS, 'tspan');
          if (part.startsWith('_') && part.length === 2) {
            tspan.setAttribute('baseline-shift', 'sub');
            tspan.setAttribute('font-size', '0.75em');
            tspan.textContent = part[1];
          } else {
            tspan.textContent = part;
          }
          el.appendChild(tspan);
        }
      }
      this.sectionLabelsGroup.appendChild(el);
    };

    if (q1Ext && q1Title) {
      const cx = (q1Ext.minX + q1Ext.maxX) / 2;
      addText(cx, LABEL_TITLE_Y,   q1Title,   'section-title');
      addText(cx, LABEL_CAPTION_Y, q1Caption, 'section-caption');
    }

    if (q2Ext) {
      const cx = (q2Ext.minX + q2Ext.maxX) / 2;
      addText(cx, LABEL_TITLE_Y,   q2Title,   'section-title');
      addText(cx, LABEL_CAPTION_Y, q2Caption, 'section-caption');
    }

    // Vertical separator between sections
    if (q1Ext && q2Ext) {
      const sepX = (q1Ext.maxX + q2Ext.minX) / 2;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(sepX));
      line.setAttribute('y1', '0');
      line.setAttribute('x2', String(sepX));
      line.setAttribute('y2', String(totalHeight));
      line.classList.add('section-separator');
      this.sectionLabelsGroup.appendChild(line);
    }
  }

  private createNodeGroup(id: string, label: string, x: number, y: number): SVGGElement {
    const g = document.createElementNS(SVG_NS, 'g');
    g.classList.add('tree-node');
    g.dataset.id = id;
    g.style.transform = `translate(${x}px, ${y}px)`;

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('r', String(this.nodeRadius));

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('dy', '0.35em');
    text.textContent = label;

    g.appendChild(circle);
    g.appendChild(text);
    return g;
  }

  private updateEdges(tree: Tree, positions: Map<string, { x: number; y: number }>): void {
    const newEdgeKeys = new Set<string>();

    for (const [id, node] of tree.nodes) {
      const children: Array<[string, boolean]> = [];
      if (node.leftId)  children.push([node.leftId,  true]);
      if (node.rightId) children.push([node.rightId, false]);

      for (const [childId, isLeft] of children) {
        const key = `${id}->${childId}`;
        newEdgeKeys.add(key);

        const parentPos = positions.get(id)!;
        const childPos  = positions.get(childId)!;
        const { x: lx, y: ly } = this.edgeLabelPos(parentPos, childPos, isLeft);

        if (this.edgeMap.has(key)) {
          const line = this.edgeMap.get(key)!;
          line.setAttribute('x1', String(parentPos.x));
          line.setAttribute('y1', String(parentPos.y));
          line.setAttribute('x2', String(childPos.x));
          line.setAttribute('y2', String(childPos.y));
          const lbl = this.edgeLabelMap.get(key)!;
          lbl.setAttribute('x', String(lx));
          lbl.setAttribute('y', String(ly));
        } else {
          const line = document.createElementNS(SVG_NS, 'line');
          line.setAttribute('x1', String(parentPos.x));
          line.setAttribute('y1', String(parentPos.y));
          line.setAttribute('x2', String(childPos.x));
          line.setAttribute('y2', String(childPos.y));
          line.classList.add('tree-edge');
          this.edgesGroup.appendChild(line);
          this.edgeMap.set(key, line);

          const lbl = document.createElementNS(SVG_NS, 'text');
          lbl.classList.add('edge-label');
          lbl.textContent = isLeft ? '0' : '1';
          lbl.setAttribute('x', String(lx));
          lbl.setAttribute('y', String(ly));
          lbl.setAttribute('text-anchor', 'middle');
          lbl.setAttribute('dominant-baseline', 'central');
          this.edgeLabelsGroup.appendChild(lbl);
          this.edgeLabelMap.set(key, lbl);
        }
      }
    }

    for (const key of this.edgeMap.keys()) {
      if (!newEdgeKeys.has(key)) {
        this.edgeMap.get(key)!.remove();
        this.edgeMap.delete(key);
        this.edgeLabelMap.get(key)?.remove();
        this.edgeLabelMap.delete(key);
      }
    }
  }

  /** Position for an edge bit-label: 30% from parent, offset perpendicular to edge. */
  private edgeLabelPos(
    parentPos: { x: number; y: number },
    childPos:  { x: number; y: number },
    isLeft: boolean,
  ): { x: number; y: number } {
    const dx = childPos.x - parentPos.x;
    const dy = childPos.y - parentPos.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return parentPos;
    const t = 0.5;
    const mx = parentPos.x + t * dx;
    const my = parentPos.y + t * dy;
    // Perpendicular: CCW for left child (0), CW for right child (1)
    const ndx = dx / len, ndy = dy / len;
    const perpX = isLeft ? -ndy :  ndy;
    const perpY = isLeft ?  ndx : -ndx;
    const offset = 9;
    return { x: mx + perpX * offset, y: my + perpY * offset };
  }
}
