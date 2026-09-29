// The Door (DESIGN §3): a real <dialog>, opened with showModal() when the store's door queue has an entry and
// closed only when the engine answers (APPROVED / REJECTED) or a frame's `held` no longer lists the envelope.
// Escape is cancelled; focus lands on No. Every figure on the card is read from the frame it is patched in.

import { fmtCost, fmtCr, fmtPhi, STAGE_WORD } from '../engine/contract/copy.ts';
import type { StateView } from '../engine/contract/state.ts';
import type { DoorEntry, Store } from '../engine/store/Store.ts';
import type { Command } from '../app/App.ts';

export interface DoorDeps {
  root: ParentNode;
  live: boolean;
  command: (c: Command) => Promise<boolean>;
  /** Screen position of the Door on the canvas, if a renderer can say; the card centres there. */
  locate?: () => { x: number; y: number } | null;
}

const PURSE_EPS = 0.005;

export class DoorDialog {
  readonly el: HTMLDialogElement;
  private current: DoorEntry | null = null;
  private readonly q: <T extends HTMLElement = HTMLElement>(id: string) => T;

  constructor(private readonly deps: DoorDeps) {
    const el = deps.root.querySelector<HTMLDialogElement>('dialog#door');
    if (!el) throw new Error('the shell has no dialog#door (index.html)');
    this.el = el;
    this.q = <T extends HTMLElement>(id: string) => el.querySelector<T>(`#${id}`)!;
    el.addEventListener('cancel', (e) => e.preventDefault()); // Escape never decides for the person
    this.q('door-yes').addEventListener('click', () => this.decide('approve'));
    this.q('door-no').addEventListener('click', () => this.decide('reject'));
    this.q('door-recorded').hidden = deps.live;
  }

  apply(state: StateView, store: Store): void {
    const queue = [...store.door.values()];
    const entry = queue[0] ?? null;
    if (!entry) { this.current = null; if (this.el.open) this.el.close(); return; }
    this.current = entry;
    const h = entry.held;
    const node = store.node(entry.node);
    this.q('door-node').textContent = h.node_name;
    this.q('door-desc').textContent = h.description;
    this.q('door-cost').textContent = `${fmtCost(h.cost)} cr`;

    const n = Math.max(0, state.tick - h.created_tick);
    this.q('door-proof-ticks').textContent = `Held ${n} ${n === 1 ? 'tick' : 'ticks'}`;
    const now = node?.compute ?? entry.openedCompute;
    this.q('door-proof-purse').textContent = Math.abs(now - entry.openedCompute) < PURSE_EPS
      ? `purse unchanged at ${fmtCr(now)} cr`
      : `purse ${fmtCr(entry.openedCompute)} cr → ${fmtCr(now)} cr${now > entry.openedCompute ? ' (topped up)' : ''}`;
    this.q('door-proof-phi').textContent = `Φ ${fmtPhi(entry.openedPhi)} then, ${fmtPhi(node?.confidence ?? entry.openedPhi)} now`;

    const cam = this.q('door-camera');
    cam.hidden = state.active_scale === 'House';
    if (!cam.hidden) cam.textContent = `The camera is at ${STAGE_WORD[state.active_scale]}. This envelope was already presented to you; it stays at the Door.`;
    const count = this.q('door-count');
    count.hidden = queue.length < 2;
    if (!count.hidden) count.textContent = `1 of ${queue.length} at the Door`;

    const sent = entry.sent !== null;
    this.q('door-sent').hidden = !sent;
    for (const id of ['door-yes', 'door-no']) this.q<HTMLButtonElement>(id).disabled = sent || !this.deps.live;

    if (!this.el.open) {
      this.place();
      this.el.showModal();
      this.q('door-no').focus();
    }
  }

  private place(): void {
    const p = this.deps.locate?.();
    if (!p || typeof innerWidth === 'undefined') { this.el.style.removeProperty('left'); this.el.style.removeProperty('top'); return; }
    const w = Math.min(440, innerWidth - 32);
    this.el.style.left = `${Math.round(Math.min(innerWidth - w - 16, Math.max(16, p.x - w / 2)))}px`;
    this.el.style.top = `${Math.round(Math.max(16, Math.min(innerHeight * 0.5, p.y - 360)))}px`;
  }

  private async decide(decision: 'approve' | 'reject'): Promise<void> {
    const e = this.current;
    if (!e || e.sent || !this.deps.live) return;
    e.sent = decision;
    this.q('door-sent').hidden = false;
    for (const id of ['door-yes', 'door-no']) this.q<HTMLButtonElement>(id).disabled = true;
    const ok = await this.deps.command({ decision, envelope: e.envelope, description: e.held.description });
    if (!ok) { // no Door holds it any more; the next frame will say what happened
      e.sent = null;
      this.q('door-sent').hidden = true;
    }
  }
}
