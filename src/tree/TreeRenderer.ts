import type { Tree } from './BinaryTree';
import { computeLayout } from './TreeLayout';

interface RendererOptions {
  svgEl: SVGSVGElement;
  nodeRadius?: number;
  transitionDuration?: number;
}

export class TreeRenderer {
  private svgEl: SVGSVGElement;
  private nodeRadius: number;
  readonly transitionDuration: number;

  private edgesGroup: SVGGElement;
  private nodesGroup: SVGGElement;

  private nodeGroupMap = new Map<string, SVGGElement>();
  private edgeMap = new Map<string, SVGLineElement>();

  constructor({ svgEl, nodeRadius = 22, transitionDuration = 500 }: RendererOptions) {
    this.svgEl = svgEl;
    this.nodeRadius = nodeRadius;
    this.transitionDuration = transitionDuration;

    this.edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.edgesGroup.id = 'edges';
    this.nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.nodesGroup.id = 'nodes';

    this.svgEl.appendChild(this.edgesGroup);
    this.svgEl.appendChild(this.nodesGroup);
  }

  setHighlight(ids: string[], on: boolean): void {
    for (const id of ids) {
      this.nodeGroupMap.get(id)?.classList.toggle('merging', on);
    }
  }

  update(tree: Tree): void {
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
        // Update label
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

        // Start invisible + scaled down
        g.style.transition = 'none';
        g.style.opacity = '0';
        g.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(0)`;
        this.nodesGroup.appendChild(g);
        this.nodeGroupMap.set(id, g);

        // Double-rAF to ensure browser paints initial state before animating
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
  }

  private createNodeGroup(id: string, label: string, x: number, y: number): SVGGElement {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('tree-node');
    g.dataset.id = id;
    g.style.transform = `translate(${x}px, ${y}px)`;

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', String(this.nodeRadius));

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
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
          // Update existing
          const line = this.edgeMap.get(key)!;
          line.setAttribute('x1', String(parentPos.x));
          line.setAttribute('y1', String(parentPos.y));
          line.setAttribute('x2', String(childPos.x));
          line.setAttribute('y2', String(childPos.y));
        } else {
          // Add new
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
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

    // Remove stale edges
    for (const key of this.edgeMap.keys()) {
      if (!newEdgeKeys.has(key)) {
        this.edgeMap.get(key)!.remove();
        this.edgeMap.delete(key);
      }
    }
  }
}
