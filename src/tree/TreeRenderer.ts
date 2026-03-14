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
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const LABEL_TITLE_Y  = 18;
const LABEL_CAPTION_Y = 33;

export class TreeRenderer {
  private svgEl: SVGSVGElement;
  private nodeRadius: number;
  readonly transitionDuration: number;

  private sectionLabelsGroup: SVGGElement;
  private edgesGroup: SVGGElement;
  private nodesGroup: SVGGElement;

  private nodeGroupMap = new Map<string, SVGGElement>();
  private edgeMap = new Map<string, SVGLineElement>();

  constructor({ svgEl, nodeRadius = 22, transitionDuration = 500 }: RendererOptions) {
    this.svgEl = svgEl;
    this.nodeRadius = nodeRadius;
    this.transitionDuration = transitionDuration;

    this.sectionLabelsGroup = document.createElementNS(SVG_NS, 'g');
    this.sectionLabelsGroup.id = 'section-labels';
    this.edgesGroup = document.createElementNS(SVG_NS, 'g');
    this.edgesGroup.id = 'edges';
    this.nodesGroup = document.createElementNS(SVG_NS, 'g');
    this.nodesGroup.id = 'nodes';

    this.svgEl.appendChild(this.sectionLabelsGroup);
    this.svgEl.appendChild(this.edgesGroup);
    this.svgEl.appendChild(this.nodesGroup);
  }

  async showComparisonAnimation(
    q1Id: string,
    q2Id: string,
    q1Freq: number,
    q2Freq: number,
    selectedId: string,
  ): Promise<void> {
    const parseXY = (id: string) => {
      const t = this.nodeGroupMap.get(id)?.style.transform;
      if (!t) return null;
      const m = t.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
      return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
    };

    const q1pos = parseXY(q1Id);
    const q2pos = parseXY(q2Id);
    if (!q1pos || !q2pos) return;

    const op = q1Freq < q2Freq ? '<' : q1Freq > q2Freq ? '>' : '=';
    const winnerPos = selectedId === q1Id ? q1pos : q2pos;

    const startX = (q1pos.x + q2pos.x) / 2;
    const startY = Math.min(q1pos.y, q2pos.y) - 38;

    const g = document.createElementNS(SVG_NS, 'g');
    g.classList.add('comparison-label');
    g.style.transform = `translate(${startX}px, ${startY}px)`;
    g.style.opacity = '0';

    const text = document.createElementNS(SVG_NS, 'text');
    text.classList.add('comparison-label-text');
    text.textContent = `${q1Freq} ${op} ${q2Freq}`;
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    g.appendChild(text);
    this.nodesGroup.appendChild(g);

    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        const bb = (text as SVGTextElement).getBBox();
        const pad = 6;
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.classList.add('comparison-label-bg');
        rect.setAttribute('x', String(bb.x - pad));
        rect.setAttribute('y', String(bb.y - pad));
        rect.setAttribute('width',  String(bb.width  + pad * 2));
        rect.setAttribute('height', String(bb.height + pad * 2));
        rect.setAttribute('rx', '4');
        g.insertBefore(rect, text);
      } catch {}
      resolve();
    })));

    // Fade in
    g.style.transition = 'opacity 0.15s ease';
    g.style.opacity = '1';
    await new Promise<void>(resolve => setTimeout(resolve, 300));

    // Fly toward winner and fade out
    const flyDur = 320;
    g.style.transition = `opacity ${flyDur}ms ease, transform ${flyDur}ms ease`;
    g.style.transform = `translate(${winnerPos.x}px, ${winnerPos.y}px)`;
    g.style.opacity = '0';
    await new Promise<void>(resolve => setTimeout(resolve, flyDur));
    g.remove();
  }

  async showSumAnimation(
    leftId: string,
    rightId: string,
    leftFreq: number,
    rightFreq: number,
    parentId: string,
  ): Promise<void> {
    const parseXY = (id: string) => {
      const t = this.nodeGroupMap.get(id)?.style.transform;
      if (!t) return null;
      const m = t.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
      return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
    };

    const lp = parseXY(leftId);
    const rp = parseXY(rightId);
    const pp = parseXY(parentId);
    if (!lp || !rp || !pp) return;

    const startX = (lp.x + rp.x) / 2;
    const startY = (lp.y + rp.y) / 2;

    const g = document.createElementNS(SVG_NS, 'g');
    g.classList.add('sum-label');
    g.style.transform = `translate(${startX}px, ${startY}px)`;
    g.style.opacity = '0';

    const text = document.createElementNS(SVG_NS, 'text');
    text.classList.add('sum-label-text');
    text.textContent = `${leftFreq} + ${rightFreq} = ${leftFreq + rightFreq}`;
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    g.appendChild(text);
    this.nodesGroup.appendChild(g);

    // Size background rect after text is in DOM
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        const bb = (text as SVGTextElement).getBBox();
        const pad = 6;
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.classList.add('sum-label-bg');
        rect.setAttribute('x', String(bb.x - pad));
        rect.setAttribute('y', String(bb.y - pad));
        rect.setAttribute('width',  String(bb.width  + pad * 2));
        rect.setAttribute('height', String(bb.height + pad * 2));
        rect.setAttribute('rx', '4');
        g.insertBefore(rect, text);
      } catch {}
      resolve();
    })));

    // Fade in at children midpoint
    g.style.transition = 'opacity 0.2s ease';
    g.style.opacity = '1';
    await new Promise<void>(resolve => setTimeout(resolve, 350));

    // Fly up to parent and fade out simultaneously
    const dur = this.transitionDuration;
    g.style.transition = `opacity ${dur}ms ease, transform ${dur}ms ease`;
    g.style.transform = `translate(${pp.x}px, ${pp.y}px)`;
    g.style.opacity = '0';
    await new Promise<void>(resolve => setTimeout(resolve, dur));
    g.remove();
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
      el.textContent = text;
      this.sectionLabelsGroup.appendChild(el);
    };

    if (q1Ext) {
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
      for (const childId of [node.leftId, node.rightId]) {
        if (!childId) continue;
        const key = `${id}->${childId}`;
        newEdgeKeys.add(key);

        const parentPos = positions.get(id)!;
        const childPos = positions.get(childId)!;

        if (this.edgeMap.has(key)) {
          const line = this.edgeMap.get(key)!;
          line.setAttribute('x1', String(parentPos.x));
          line.setAttribute('y1', String(parentPos.y));
          line.setAttribute('x2', String(childPos.x));
          line.setAttribute('y2', String(childPos.y));
        } else {
          const line = document.createElementNS(SVG_NS, 'line');
          line.setAttribute('x1', String(parentPos.x));
          line.setAttribute('y1', String(parentPos.y));
          line.setAttribute('x2', String(childPos.x));
          line.setAttribute('y2', String(childPos.y));
          line.classList.add('tree-edge');
          this.edgesGroup.appendChild(line);
          this.edgeMap.set(key, line);
        }
      }
    }

    for (const key of this.edgeMap.keys()) {
      if (!newEdgeKeys.has(key)) {
        this.edgeMap.get(key)!.remove();
        this.edgeMap.delete(key);
      }
    }
  }
}
