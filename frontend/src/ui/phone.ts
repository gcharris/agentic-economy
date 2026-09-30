// The phone view (doc 06 §5, §8.6): one house's Door on a phone at the kitchen table. `?house=<name or n>`: the
// house by its name, or its place in the street's houses in creation order (Ada 1, Ben 2, …).
//
// The Porter proposes both a send and a hire for the same finished draft; both knock. The card composes them into
// one: "Send it (10.0 cr)" says yes to the send and no to the hire; "Hire Ben's courier at 10.0 cr" the reverse;
// "Ask the oracle first (15 cr)" asks and leaves the card up (the answer comes back on the phone); "Leave it on the
// table" says no to both. Below it: the purse and the liquidity, the oracle's last answer, and the Note when there is
// one. Every number is a field of the current frame.

import type { App } from '../app/App.ts';
import { fmtCost, fmtCr, fmtPhi } from '../engine/contract/copy.ts';
import type { HeldView, NodeView, StateView } from '../engine/contract/state.ts';
import type { Frame } from '../engine/source/EngineSource.ts';
import type { Store, UiLayer } from '../engine/store/Store.ts';
import { pillText } from './pills.ts';
import { dayLabel, noteSheet } from './week.ts';

export const ORACLE_CR = 15;

/** The house a phone belongs to: by name (any case), else the n-th house in creation order. */
export function resolveHouse(state: StateView, key: string): NodeView | undefined {
  const houses = state.nodes.filter((n) => n.stage === 'House').sort((a, b) => (a.house_number ?? a.id) - (b.house_number ?? b.id));
  const byName = houses.find((n) => n.name.toLowerCase() === key.trim().toLowerCase());
  if (byName) return byName;
  const i = Number(key);
  return Number.isInteger(i) && i >= 1 ? houses[i - 1] : undefined;
}

/** One composed card: the send and the hire for the same draft, or any other envelope on its own. */
export interface DoorCard {
  task: string | null;
  send: HeldView | null;
  hire: HeldView | null;
  /** Everything this card answers (the send and the hire, or the one other envelope). */
  envelopes: HeldView[];
  /** How many cards are waiting at this Door, this one included. */
  waiting: number;
  createdTick: number;
}

/** The house's held envelopes composed into cards, oldest draft first (doc 06 §8.6). */
export function composeCards(state: StateView, house: number): DoorCard[] {
  const mine = state.held.filter((h) => h.node === house && h.reason === 'awaiting_human_signature');
  const groups = new Map<string, HeldView[]>();
  for (const h of mine) {
    const key = h.task_id ? `task:${h.task_id}` : `env:${h.envelope}`;
    const g = groups.get(key);
    if (g) g.push(h); else groups.set(key, [h]);
  }
  const cards = [...groups.values()].map((g): DoorCard => ({
    task: g[0].task_id ?? null,
    send: g.find((h) => h.kind === 'dispatch') ?? null,
    hire: g.find((h) => h.kind === 'hire_service') ?? null,
    envelopes: g,
    waiting: 0,
    createdTick: Math.min(...g.map((h) => h.created_tick)),
  }));
  cards.sort((a, b) => a.createdTick - b.createdTick);
  for (const c of cards) c.waiting = cards.length;
  return cards;
}

/** The card's answers: which envelopes each button approves and rejects. */
export function answers(card: DoorCard): { send: { approve: HeldView[]; reject: HeldView[] } | null; hire: { approve: HeldView[]; reject: HeldView[] } | null; leave: HeldView[] } {
  const others = (keep: HeldView) => card.envelopes.filter((h) => h !== keep);
  return {
    send: card.send ? { approve: [card.send], reject: others(card.send) } : null,
    hire: card.hire ? { approve: [card.hire], reject: others(card.hire) } : null,
    leave: card.envelopes,
  };
}

export const sendLabel = (h: HeldView): string => `Send it (${fmtCost(h.cost)} cr)`;
export const hireLabel = (h: HeldView): string => `Hire ${h.target_name}'s courier at ${fmtCost(h.believed_price ?? 0)} cr`;
export const ORACLE_LABEL = `Ask the oracle first (${ORACLE_CR} cr)`;
export const LEAVE_LABEL = 'Leave it on the table';

type Command = App['command'];

export class PhoneView implements UiLayer {
  private house: NodeView | undefined;
  /** The card a person answered: the envelopes sent, until a frame no longer holds them. */
  private answered = new Set<number>();
  /** An oracle question in flight: the oracle tick it was asked after. */
  private asking: number | null | undefined = undefined;
  private readonly el: HTMLElement;

  constructor(private readonly root: ParentNode, private readonly key: string, private readonly command: Command, private readonly live: boolean) {
    const el = root.querySelector<HTMLElement>('#phone');
    if (!el) throw new Error('the shell has no #phone (index.html)');
    this.el = el;
    this.el.hidden = false;
  }

  apply(frame: Frame, _store: Store): void {
    const s = frame.state;
    this.house = resolveHouse(s, this.key);
    const n = this.house;
    if (!n) { this.el.replaceChildren(this.p('who', `No house called “${this.key}” on this street.`)); return; }
    if (this.asking !== undefined && n.oracle_tick !== this.asking) this.asking = undefined;
    const held = new Set(s.held.map((h) => h.envelope));
    for (const id of [...this.answered]) if (!held.has(id)) this.answered.delete(id);

    const head = document.createElement('header');
    const h1 = document.createElement('h1'); h1.textContent = n.name;
    const pill = document.createElement('span'); pill.className = 'pill'; pill.dataset.status = n.status; pill.textContent = pillText(n.status);
    head.append(h1, this.p('day mono', dayLabel(s.tick)), pill);

    const purse = document.createElement('section'); purse.className = 'purse';
    const share = n.compute_allocated > 0 ? n.compute / n.compute_allocated : 0;
    const bar = document.createElement('span'); bar.className = 'bar';
    const fill = document.createElement('i'); fill.style.width = `${Math.max(0, Math.min(1, share)) * 100}%`; bar.append(fill);
    purse.append(
      this.p('v mono', `purse ${fmtCr(n.compute)} / ${fmtCr(n.compute_allocated)} cr`), bar,
      this.p('v mono', `liquidity ${fmtCr(n.liquidity_belief)} cr`),
      this.p('v mono', `${n.tasks_done} of ${n.tasks_total} pieces done · Φ ${fmtPhi(n.confidence)}`),
    );
    purse.classList.toggle('low', share < 0.15);

    const oracle = document.createElement('section'); oracle.className = 'oracle';
    oracle.append(this.p('', n.oracle_price === null || n.oracle_tick === null
      ? 'You have not asked the oracle this week.'
      : `The oracle said the courier costs ${fmtCost(n.oracle_price)} cr (${dayLabel(n.oracle_tick)}).`));
    if (this.asking !== undefined) oracle.append(this.p('asking', 'Asking the oracle… the answer comes back at the next tick.'));

    const parts: HTMLElement[] = [head, purse, oracle];
    const cards = composeCards(s, n.id);
    if (n.note) parts.push(noteSheet(n.note, n.note.week ? 'The week’s Note' : 'A note on the table'));
    else if (cards.length) parts.push(this.card(cards[0], n, s));
    else parts.push(this.p('quiet', n.current_task ? `Nobody at the Door. Your staff are on ${n.current_task}.` : 'Nobody at the Door.'));
    this.el.replaceChildren(...parts);
  }

  private card(c: DoorCard, n: NodeView, s: StateView): HTMLElement {
    const el = document.createElement('section'); el.className = 'door-card'; el.setAttribute('aria-label', 'The Door');
    const sent = c.envelopes.every((h) => this.answered.has(h.envelope));
    const held = s.tick - c.createdTick;
    el.append(
      this.p('eyebrow', 'The Porter is at the Door'),
      this.p('what', c.task ? `The finished draft for ${c.task}.` : c.envelopes[0].description),
      this.p('calm', 'Nothing burns while you decide.'),
      this.p('proof mono', `Held ${held} ${held === 1 ? 'tick' : 'ticks'} · Φ ${fmtPhi(n.confidence)} now`),
    );
    if (c.waiting > 1) el.append(this.p('count', `1 of ${c.waiting} at the Door`));
    const a = answers(c);
    const buttons = document.createElement('div'); buttons.className = 'answers';
    const btn = (label: string, cls: string, fn: () => void) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label;
      b.disabled = !this.live || sent; b.addEventListener('click', fn); buttons.append(b); return b;
    };
    const decide = (approve: HeldView[], reject: HeldView[]) => {
      for (const h of [...approve, ...reject]) this.answered.add(h.envelope);
      for (const h of approve) void this.command({ decision: 'approve', envelope: h.envelope, description: h.description });
      for (const h of reject) void this.command({ decision: 'reject', envelope: h.envelope, description: h.description });
      el.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      el.append(this.p('sent', 'sent to the Door…'));
    };
    if (a.send) btn(sendLabel(a.send.approve[0]), 'send primary', () => decide(a.send!.approve, a.send!.reject));
    if (a.hire) btn(hireLabel(a.hire.approve[0]), 'hire', () => decide(a.hire!.approve, a.hire!.reject));
    if (!a.send && !a.hire) btn('Yes', 'send primary', () => decide(c.envelopes, []));
    const ask = btn(ORACLE_LABEL, 'oracle', () => {
      this.asking = n.oracle_tick;
      ask.disabled = true;
      this.el.querySelector('section.oracle')?.append(this.p('asking', 'Asking the oracle… the answer comes back at the next tick.'));
      void this.command({ decision: 'sync', node: n.id }).then((ok) => {
        if (ok) return;
        this.asking = undefined;
        this.el.querySelector('section.oracle .asking')?.remove();
        ask.disabled = !this.live || sent || n.compute < ORACLE_CR;
      });
    });
    if (this.asking !== undefined || n.compute < ORACLE_CR) ask.disabled = true;
    btn(LEAVE_LABEL, 'leave', () => decide([], a.leave));
    el.append(buttons);
    if (sent) el.append(this.p('sent', 'sent to the Door…'));
    return el;
  }

  private p(cls: string, text: string): HTMLElement {
    const p = document.createElement('p'); if (cls) p.className = cls; p.textContent = text; return p;
  }
}
