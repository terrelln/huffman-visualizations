import { HuffmanDemo } from './demos/01-huffman-tree-construction/HuffmanDemo';
import { HuffmanEncodingDemo } from './demos/02-naive-huffman-encoding/HuffmanEncodingDemo';
import { HuffmanDecodingDemo } from './demos/03-naive-huffman-decoding/HuffmanDecodingDemo';
import { CanonicalizationDemo } from './demos/04-huffman-canonicalization/CanonicalizationDemo';
import { DepthLimitingDemo } from './demos/05-huffman-depth-limiting/DepthLimitingDemo';
import { TableEncodingDemo } from './demos/06-table-huffman-encoding/TableEncodingDemo';
import { DecodingTableDemo } from './demos/07-decoding-table/DecodingTableDemo';
import { TableDecodingDemo } from './demos/08-table-huffman-decoding/TableDecodingDemo';
import type { SymbolInput } from './demos/01-huffman-tree-construction/HuffmanAlgorithm';
import { buildCanonSteps } from './demos/04-huffman-canonicalization/CanonicalizationAlgorithm';

const DEFAULT_SYMBOLS: SymbolInput[] = [
  { symbol: 'A', freq: 10 },
  { symbol: 'E', freq: 25 },
  { symbol: 'G', freq: 5 },
  { symbol: 'M', freq: 1 },
  { symbol: 'N', freq: 1 },
  { symbol: 'O', freq: 5 },
];

const DEMO_TITLES = [
  'Tree Construction',
  'Naive Huffman Encoding',
  'Naive Huffman Decoding',
  'Huffman Canonicalization',
  'Huffman Depth Limiting',
  'Table-based Encoding',
  'Decoding Table Construction',
  'Table-based Decoding',
];

interface IDemo {
  start(inputs: SymbolInput[], inputString: string): void;
  pause?(): void;
  play?(): void;
}

export class DemoPlayer {
  // ── Input strip state ──────────────────────────────────────────────────────
  private wordList: string[] = [];
  private chipsEl!: HTMLDivElement;
  private inputStringEl!: HTMLInputElement;
  private inputStringUserModified = false;
  private depthSliderEl!: HTMLInputElement;
  private depthValueEl!: HTMLSpanElement;
  private depthSliderUserModified = false;
  private depthLimitingDemo!: DepthLimitingDemo;
  private tableEncodingDemo!: TableEncodingDemo;
  private decodingTableDemo!: DecodingTableDemo;
  private tableDecodingDemo!: TableDecodingDemo;

  // ── Demo navigation state ──────────────────────────────────────────────────
  private demos: IDemo[] = [];
  private currentIndex = 0;
  private slidesEl!: HTMLElement;
  private prevChevron!: HTMLButtonElement;
  private nextChevron!: HTMLButtonElement;
  private navTitle!: HTMLSpanElement;

  constructor(appEl: HTMLElement) {
    const h1 = document.createElement('h1');
    h1.textContent = 'Huffman Encoding';
    appEl.appendChild(h1);

    // Shared input panel
    const inputPanel = document.createElement('div');
    appEl.appendChild(inputPanel);
    this.buildInputStrip(inputPanel);

    // Grid wrapper: row 1 = title (col 2 only), row 2 = [‹] [viewport] [›]
    const wrapper = document.createElement('div');
    wrapper.className = 'demo-wrapper';
    appEl.appendChild(wrapper);

    const navEl = document.createElement('div');
    navEl.className = 'demo-nav';
    wrapper.appendChild(navEl);
    this.buildDemoNav(navEl);

    this.prevChevron = document.createElement('button');
    this.prevChevron.className = 'demo-nav-chevron chevron-prev';
    this.prevChevron.innerHTML = '<span>‹</span>';
    this.prevChevron.setAttribute('aria-label', 'Previous demo');
    this.prevChevron.addEventListener('click', () => this.navigate(this.currentIndex - 1));
    wrapper.appendChild(this.prevChevron);

    const viewport = document.createElement('div');
    viewport.className = 'demo-viewport';
    wrapper.appendChild(viewport);

    this.slidesEl = document.createElement('div');
    this.slidesEl.className = 'demo-slides';
    viewport.appendChild(this.slidesEl);

    this.nextChevron = document.createElement('button');
    this.nextChevron.className = 'demo-nav-chevron chevron-next';
    this.nextChevron.innerHTML = '<span>›</span>';
    this.nextChevron.setAttribute('aria-label', 'Next demo');
    this.nextChevron.addEventListener('click', () => this.navigate(this.currentIndex + 1));
    wrapper.appendChild(this.nextChevron);


    // Create slides and demos
    const slide1 = this.addSlide();
    const slide2 = this.addSlide();
    const slide3 = this.addSlide();
    const slide4 = this.addSlide();
    const slide5 = this.addSlide();

    this.demos.push(new HuffmanDemo(slide1));
    this.demos.push(new HuffmanEncodingDemo(slide2));
    this.demos.push(new HuffmanDecodingDemo(slide3));
    this.demos.push(new CanonicalizationDemo(slide4));
    this.depthLimitingDemo = new DepthLimitingDemo(slide5);
    this.demos.push(this.depthLimitingDemo);

    const slide6 = this.addSlide();
    this.tableEncodingDemo = new TableEncodingDemo(slide6);
    this.demos.push(this.tableEncodingDemo);

    const slide7 = this.addSlide();
    this.decodingTableDemo = new DecodingTableDemo(slide7);
    this.demos.push(this.decodingTableDemo);

    const slide8 = this.addSlide();
    this.tableDecodingDemo = new TableDecodingDemo(slide8);
    this.demos.push(this.tableDecodingDemo);

    this.updateNavUI();
    void this.loadWordList();
  }

  private addSlide(): HTMLElement {
    const slide = document.createElement('div');
    slide.className = 'demo-slide';
    this.slidesEl.appendChild(slide);
    return slide;
  }

  private buildDemoNav(navEl: HTMLElement): void {
    this.navTitle = document.createElement('span');
    this.navTitle.className = 'demo-nav-title';
    navEl.appendChild(this.navTitle);
  }


  private navigate(index: number): void {
    if (index < 0 || index >= this.demos.length) return;
    // Pause outgoing demo if it supports it
    this.demos[this.currentIndex].pause?.();
    this.currentIndex = index;
    this.slidesEl.style.transform = `translateX(-${index * 100}%)`;
    this.updateNavUI();
  }

  private updateNavUI(): void {
    this.prevChevron.disabled = this.currentIndex === 0;
    this.nextChevron.disabled = this.currentIndex === this.demos.length - 1;
    this.navTitle.textContent =
      `${this.currentIndex + 1} / ${this.demos.length}  ·  ${DEMO_TITLES[this.currentIndex]}`;
  }

  // ── Input strip ─────────────────────────────────────────────────────────────

  private async loadWordList(): Promise<void> {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}wordle-answers-alphabetical.txt`);
      const text = await res.text();
      this.wordList = text.split('\n').map(w => w.trim().toUpperCase()).filter(w => w.length > 0);
      this.updateInputString();
    } catch {
      // Word list unavailable; fallback already set
    }
  }

  private updateInputString(): void {
    if (!this.inputStringEl || !this.chipsEl) return;
    const symbols = this.readSymbolChips(this.chipsEl);
    const val = this.computeDefaultInput(symbols);
    this.inputStringEl.placeholder = val;
    if (!this.inputStringUserModified) {
      this.inputStringEl.value = val;
    }
    this.updateDepthSlider();
  }

  private updateDepthSlider(): void {
    if (!this.depthSliderEl || !this.chipsEl) return;
    const symbols = this.readSymbolChips(this.chipsEl);
    if (this.validateInputs(symbols) !== null) return;

    try {
      const canonResult = buildCanonSteps(symbols);
      const treeDepth = Math.max(...canonResult.rows.map(r => r.numBits));
      const minDepth = Math.max(Math.ceil(Math.log2(symbols.length)), 1);

      this.depthSliderEl.min = String(minDepth);
      this.depthSliderEl.max = String(treeDepth);

      let val: number;
      if (this.depthSliderUserModified) {
        // Clamp current value to new bounds
        val = parseInt(this.depthSliderEl.value, 10);
        val = Math.max(minDepth, Math.min(treeDepth, val));
      } else {
        // Default to tree depth - 1
        val = Math.max(treeDepth - 1, minDepth);
      }
      this.depthSliderEl.value = String(val);
      this.depthValueEl.textContent = String(val);
    } catch {
      // Invalid inputs — leave slider as-is
    }
  }

  private computeDefaultInput(symbols: SymbolInput[]): string {
    if (symbols.length === 0) return '';
    const symbolSet = new Set(symbols.map(s => s.symbol.toUpperCase()));

    const validWords = this.wordList.filter(word =>
      word.length > 0 && [...word].every(ch => symbolSet.has(ch))
    );

    if (validWords.length > 0) {
      let maxDistinct = 0;
      for (const word of validWords) {
        const d = new Set(word).size;
        if (d > maxDistinct) maxDistinct = d;
      }
      const best = validWords.filter(w => new Set(w).size === maxDistinct);
      return best[Math.floor(Math.random() * best.length)];
    }

    return this.generateFromDistribution(symbols);
  }

  private generateFromDistribution(symbols: SymbolInput[]): string {
    const result: string[] = [];
    const used = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const pool = used.size < symbols.length
        ? symbols.filter(s => !used.has(s.symbol))
        : symbols;
      const total = pool.reduce((sum, s) => sum + s.freq, 0);
      let r = Math.random() * total;
      for (const s of pool) {
        r -= s.freq;
        if (r <= 0) { result.push(s.symbol); used.add(s.symbol); break; }
      }
    }
    return result.join('');
  }

  private buildInputStrip(parentEl: HTMLElement): void {
    const strip = document.createElement('div');
    strip.className = 'input-strip';

    // ── Row 1: Symbol Counts ─────────────────────────────────────────────
    const row1 = document.createElement('div');
    row1.className = 'input-row';

    const row1Label = document.createElement('span');
    row1Label.className = 'input-row-label';
    row1Label.textContent = 'Symbol Counts';

    const chips = document.createElement('div');
    chips.className = 'symbol-chips';
    this.chipsEl = chips;
    for (const { symbol, freq } of DEFAULT_SYMBOLS) {
      chips.appendChild(this.createSymbolChip(symbol, freq, chips));
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-secondary';
    addBtn.textContent = '+ Add';
    addBtn.addEventListener('click', () => {
      const chip = this.createSymbolChip(this.nextUnusedSymbol(chips), 1, chips);
      chips.appendChild(chip);
      (chip.querySelector('.chip-sym') as HTMLInputElement).focus();
      this.updateInputString();
    });

    row1.appendChild(row1Label);
    row1.appendChild(chips);
    row1.appendChild(addBtn);

    // ── Row 2: Input String ──────────────────────────────────────────────
    const row2 = document.createElement('div');
    row2.className = 'input-row';

    const row2Label = document.createElement('span');
    row2Label.className = 'input-row-label';
    row2Label.textContent = 'Input String';

    const inputStringEl = document.createElement('input');
    inputStringEl.type = 'text';
    inputStringEl.className = 'input-string-input';
    this.inputStringEl = inputStringEl;
    inputStringEl.addEventListener('input', () => { this.inputStringUserModified = true; });
    this.updateInputString();

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'btn-secondary';
    refreshBtn.textContent = '↻';
    refreshBtn.title = 'Regenerate input string';
    refreshBtn.addEventListener('click', () => {
      this.inputStringUserModified = false;
      this.updateInputString();
    });

    const errorEl = document.createElement('span');
    errorEl.className = 'input-error';
    errorEl.hidden = true;

    const startBtn = document.createElement('button');
    startBtn.className = 'btn-primary';
    startBtn.textContent = 'Visualize →';
    startBtn.addEventListener('click', () => {
      const inputs = this.readSymbolChips(chips);
      const symError = this.validateInputs(inputs);
      const strError = symError ? null : this.validateInputString(inputStringEl.value, inputs);
      const error = symError ?? strError;
      if (error) {
        errorEl.textContent = error;
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;
      const inputString = inputStringEl.value;
      const maxDepth = parseInt(this.depthSliderEl.value, 10);
      this.depthLimitingDemo.setMaxDepth(maxDepth);
      this.tableEncodingDemo.setMaxDepth(maxDepth);
      this.decodingTableDemo.setMaxDepth(maxDepth);
      this.tableDecodingDemo.setMaxDepth(maxDepth);
      for (const demo of this.demos) {
        demo.start(inputs, inputString);
      }
      // Only auto-play the currently visible demo
      for (let i = 0; i < this.demos.length; i++) {
        if (i !== this.currentIndex) {
          this.demos[i].pause?.();
        }
      }
    });

    row2.appendChild(row2Label);
    row2.appendChild(inputStringEl);
    row2.appendChild(refreshBtn);
    row2.appendChild(startBtn);
    row2.appendChild(errorEl);

    // ── Row 3: Max Depth ──────────────────────────────────────────────
    const row3 = document.createElement('div');
    row3.className = 'input-row';

    const row3Label = document.createElement('span');
    row3Label.className = 'input-row-label';
    row3Label.textContent = 'Max Depth';

    this.depthSliderEl = document.createElement('input');
    this.depthSliderEl.type = 'range';
    this.depthSliderEl.className = 'depth-slider';
    this.depthSliderEl.min = '1';
    this.depthSliderEl.max = '4';
    this.depthSliderEl.value = '3';
    this.depthSliderEl.addEventListener('input', () => {
      this.depthSliderUserModified = true;
      this.depthValueEl.textContent = this.depthSliderEl.value;
    });

    this.depthValueEl = document.createElement('span');
    this.depthValueEl.className = 'depth-slider-value';
    this.depthValueEl.textContent = '3';

    row3.appendChild(row3Label);
    row3.appendChild(this.depthSliderEl);
    row3.appendChild(this.depthValueEl);

    strip.appendChild(row1);
    strip.appendChild(row2);
    strip.appendChild(row3);
    parentEl.appendChild(strip);

    this.updateDepthSlider();
  }

  private createSymbolChip(symbol: string, freq: number, container: HTMLElement): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'sym-chip';

    const symInput = document.createElement('input');
    symInput.type = 'text';
    symInput.className = 'chip-sym';
    symInput.placeholder = 'A';
    symInput.value = symbol;
    symInput.maxLength = 1;
    symInput.addEventListener('input', () => {
      symInput.value = symInput.value.toUpperCase().replace(/[^A-Z]/g, '');
      this.updateInputString();
    });

    const sep = document.createElement('span');
    sep.className = 'chip-sep';
    sep.textContent = ':';

    const freqInput = document.createElement('input');
    freqInput.type = 'number';
    freqInput.className = 'chip-freq';
    freqInput.placeholder = '1';
    freqInput.value = freq > 0 ? String(freq) : '';
    freqInput.min = '1';
    freqInput.addEventListener('input', () => this.updateDepthSlider());

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', 'Remove');
    removeBtn.addEventListener('click', () => {
      if (container.querySelectorAll('.sym-chip').length > 1) {
        chip.remove();
        this.updateInputString();
      }
    });

    chip.appendChild(symInput);
    chip.appendChild(sep);
    chip.appendChild(freqInput);
    chip.appendChild(removeBtn);
    return chip;
  }

  private nextUnusedSymbol(chips: HTMLElement): string {
    const used = new Set(
      Array.from(chips.querySelectorAll('.chip-sym'))
        .map(el => (el as HTMLInputElement).value.trim().toUpperCase())
    );
    for (let i = 0; i < 26; i++) {
      const ch = String.fromCharCode(65 + i);
      if (!used.has(ch)) return ch;
    }
    return '';
  }

  private readSymbolChips(container: HTMLElement): SymbolInput[] {
    return Array.from(container.querySelectorAll('.sym-chip')).map(chip => ({
      symbol: (chip.querySelector('.chip-sym') as HTMLInputElement).value.trim(),
      freq: parseInt((chip.querySelector('.chip-freq') as HTMLInputElement).value, 10),
    }));
  }

  private validateInputs(inputs: SymbolInput[]): string | null {
    if (inputs.length < 2) return 'Enter at least 2 symbols.';
    const seen = new Set<string>();
    for (const { symbol, freq } of inputs) {
      if (!symbol) return 'Symbol names cannot be empty.';
      if (!/^[A-Z]$/.test(symbol)) return `Symbol "${symbol}" must be a single uppercase letter (A–Z).`;
      if (seen.has(symbol)) return `Duplicate symbol: "${symbol}"`;
      seen.add(symbol);
      if (!Number.isInteger(freq) || freq < 1) return `Count for "${symbol}" must be a positive integer.`;
    }
    return null;
  }

  private validateInputString(str: string, symbols: SymbolInput[]): string | null {
    if (!str) return 'Input string cannot be empty.';
    const symbolSet = new Set(symbols.map(s => s.symbol));
    for (const ch of str) {
      if (!symbolSet.has(ch)) return `Character "${ch}" in input string is not in Symbol Counts.`;
    }
    return null;
  }
}
