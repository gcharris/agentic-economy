// The Note (DESIGN §3, ARCHITECTURE §B.2): a paper card on the Oak Table while the focused node's `note`
// is not null. One action, Top up the purse; there is no close-the-week command in the API, so none is drawn.

import { fmtCr, fmtJ, haltReasonLine } from '../engine/contract/copy.ts';
import type { Note } from '../engine/contract/state.ts';
import type { Store } from '../engine/store/Store.ts';
import type { Command } from '../app/App.ts';

export const DEFAULT_TOP_UP = 200;

export interface NoteDeps {
  root: ParentNode;
  live: boolean;
  command: (c: Command) => Promise<boolean>;
}

export class NoteCard {
  private readonly el: HTMLElement;
  private shown: string | null = null;

  constructor(private readonly deps: NoteDeps) {
    const el = deps.root.querySelector<HTMLElement>('#note');
    if (!el) throw new Error('the shell has no #note (index.html)');
    this.el = el;
  }

  apply(store: Store): void {
    const id = store.focus;
    const note = id === null ? null : store.notes.get(id) ?? null;
    if (!note) { this.el.hidden = true; this.shown = null; return; }
    const key = `${note.node}@${note.tick}`;
    this.el.hidden = false;
    if (this.shown === key) return;
    this.shown = key;
    this.render(note);
  }

  private render(n: Note): void {
    const row = (label: string, value: string) => {
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.className = 'mono'; dd.textContent = value;
      return [dt, dd];
    };
    const h = document.createElement('h2'); h.textContent = 'A note on the table';
    const dl = document.createElement('dl');
    dl.append(
      ...row('What it was doing', n.doing),
      ...row('Total cost burned', `${fmtCr(n.compute_burned_total)} cr · ${fmtJ(n.joules_burned_total)} J`),
      ...row('Left in the purse', `${fmtCr(n.compute_remaining)} cr`),
      ...row('Papers on the table', String(n.papers_on_table)),
      ...row('Local state saved', n.saved_state),
    );
    const reason = document.createElement('p'); reason.className = 'reason';
    reason.textContent = haltReasonLine(n.reason);
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.type = 'number'; input.min = '1'; input.step = '1'; input.value = String(DEFAULT_TOP_UP);
    input.setAttribute('aria-label', 'Credits to add');
    const btn = document.createElement('button'); btn.type = 'submit'; btn.textContent = 'Top up the purse';
    btn.disabled = !this.deps.live;
    form.append(input, btn);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const credits = Number(input.value);
      if (!(credits > 0) || !this.deps.live) return;
      btn.disabled = true;
      void this.deps.command({ decision: 'top_up', node: n.node, credits }).then((ok) => { if (!ok) btn.disabled = false; });
    });
    this.el.replaceChildren(h, dl, reason, form);
  }
}
