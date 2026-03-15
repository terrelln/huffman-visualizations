import { TreeRenderer } from '../../tree/TreeRenderer';
import type { Tree } from '../../tree/BinaryTree';
import { buildHuffmanSnapshots } from '../01-huffman-tree-construction/HuffmanAlgorithm';
import type { SymbolInput } from '../01-huffman-tree-construction/HuffmanAlgorithm';

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

const SVG_NS = 'http://www.w3.org/2000/svg';

export class HuffmanEncodingDemo {
  private svgEl: SVGSVGElement;
  private renderer: TreeRenderer;

  constructor(containerEl: HTMLElement) {
    const vizArea = document.createElement('div');
    vizArea.className = 'viz-area';
    containerEl.appendChild(vizArea);

    const vizLeft = document.createElement('div');
    vizLeft.className = 'viz-left';
    vizArea.appendChild(vizLeft);

    this.svgEl = document.createElementNS(SVG_NS, 'svg') as unknown as SVGSVGElement;
    this.svgEl.setAttribute('class', 'tree-svg');
    this.svgEl.style.display = 'none';
    vizLeft.appendChild(this.svgEl);

    this.renderer = new TreeRenderer({ svgEl: this.svgEl });
  }

  start(inputs: SymbolInput[], _inputString: string): void {
    const snapshots = buildHuffmanSnapshots(inputs);
    const last = snapshots[snapshots.length - 1];

    while (this.svgEl.firstChild) this.svgEl.firstChild.remove();
    this.renderer = new TreeRenderer({ svgEl: this.svgEl });
    this.svgEl.style.display = '';
    // Pass undefined for sections to suppress Q_L / Q_T labels on the static tree
    this.renderer.update(stripCounts(last.tree), undefined);
  }
}
