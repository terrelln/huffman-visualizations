import { makeTree } from '../tree/BinaryTree';
import type { Tree } from '../tree/BinaryTree';
import { TreeRenderer } from '../tree/TreeRenderer';

const STEPS: Tree[] = [
  // Step 0: merge d:1 + e:1 → de(2)
  makeTree('de', [
    { id: 'de', label: '2' },
    { id: 'd', label: 'd:1' },
    { id: 'e', label: 'e:1' },
  ]),
  // Step 1: merge c:2 + de(2) → cde(4)
  makeTree('cde', [
    { id: 'cde', label: '4' },
    { id: 'c', label: 'c:2' },
    { id: 'de', label: '2' },
    { id: 'd', label: 'd:1' },
    { id: 'e', label: 'e:1' },
  ]),
  // Step 2: merge b:3 + cde(4) → bcde(7)
  makeTree('bcde', [
    { id: 'bcde', label: '7' },
    { id: 'b', label: 'b:3' },
    { id: 'cde', label: '4' },
    { id: 'c', label: 'c:2' },
    { id: 'de', label: '2' },
    { id: 'd', label: 'd:1' },
    { id: 'e', label: 'e:1' },
  ]),
  // Step 3: merge a:5 + bcde(7) → abcde(12)
  makeTree('abcde', [
    { id: 'abcde', label: '12' },
    { id: 'a', label: 'a:5' },
    { id: 'bcde', label: '7' },
    { id: 'b', label: 'b:3' },
    { id: 'cde', label: '4' },
    { id: 'c', label: 'c:2' },
    { id: 'de', label: '2' },
    { id: 'd', label: 'd:1' },
    { id: 'e', label: 'e:1' },
  ]),
];

// Wire up parent-child relationships
function linkNodes(tree: Tree, links: [string, string, string][]): void {
  for (const [parentId, leftId, rightId] of links) {
    const node = tree.nodes.get(parentId);
    if (node) {
      node.leftId = leftId;
      node.rightId = rightId;
    }
  }
}

linkNodes(STEPS[0], [['de', 'd', 'e']]);
linkNodes(STEPS[1], [['cde', 'c', 'de'], ['de', 'd', 'e']]);
linkNodes(STEPS[2], [['bcde', 'b', 'cde'], ['cde', 'c', 'de'], ['de', 'd', 'e']]);
linkNodes(STEPS[3], [['abcde', 'a', 'bcde'], ['bcde', 'b', 'cde'], ['cde', 'c', 'de'], ['de', 'd', 'e']]);

export class HuffmanDemo {
  private renderer: TreeRenderer;
  private stepIndex = -1;
  private btnEl: HTMLButtonElement;
  private labelEl: HTMLSpanElement;

  constructor(svgEl: SVGSVGElement, btnEl: HTMLButtonElement, labelEl: HTMLSpanElement) {
    this.renderer = new TreeRenderer({ svgEl });
    this.btnEl = btnEl;
    this.labelEl = labelEl;
  }

  start(): void {
    this.nextStep();
  }

  nextStep(): void {
    if (this.stepIndex >= STEPS.length - 1) return;
    this.stepIndex++;
    this.renderer.update(STEPS[this.stepIndex]);
    this.labelEl.textContent = `Step ${this.stepIndex + 1} of ${STEPS.length}`;
    if (this.stepIndex >= STEPS.length - 1) {
      this.btnEl.disabled = true;
    }
  }
}
