// The Notes on the table (doc 06 §5, §6, §8.7): on the TV, at Friday's last tick, every house's Note side by side
// in the Note's own typography, in the order of the houses' names. No totals row, and nothing set one house against
// another: the engine hands over the essay's numbers per house, and the table reads them out and argues.

import type { StateView } from '../engine/contract/state.ts';
import { noteSheet } from './week.ts';

export class NotesTable {
  private readonly el: HTMLElement | null;
  private key = '';

  constructor(root: ParentNode) {
    this.el = root.querySelector<HTMLElement>('#notes');
  }

  apply(state: StateView): void {
    if (!this.el) return;
    const notes = state.nodes
      .filter((n) => n.stage === 'House' && n.note?.week)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((n) => n.note!);
    const key = notes.map((n) => `${n.node}@${n.tick}`).join(',');
    if (key === this.key) return;
    this.key = key;
    this.el.hidden = notes.length === 0;
    if (!notes.length) { this.el.replaceChildren(); return; }
    const h = document.createElement('h2'); h.textContent = 'Friday evening · the Notes on the table';
    const row = document.createElement('div'); row.className = 'sheets';
    row.append(...notes.map((n) => noteSheet(n, 'The week’s Note')));
    this.el.replaceChildren(h, row);
  }
}
