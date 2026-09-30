// The phone composes a finished draft into one atomic answer; all numbers come from the frame.

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

export const sendLabel = (h: HeldView): string => `Send it (${fmtCost(h.cost)} cr)`;
export const hireLabel = (h: HeldView): string => `Hire ${h.target_name}'s courier at ${fmtCost(h.believed_price ?? 0)} cr`;
export const LEAVE_LABEL = 'Leave it on the table';

type Command = App['command'];

export class PhoneView implements UiLayer {
  private house: NodeView | undefined;
  /** The card a person answered: the envelopes sent, until a frame no longer holds them. */
  private answered = new Set<number>();
  /** An oracle question in flight: the oracle tick it was asked after. */
  private asking: number | null | undefined = undefined;
  private answeredTick = -1;
  private failure = '';
  private pendingHouse = false;
  private oracleCost = ORACLE_CR;
  private readonly el: HTMLElement;

  constructor(private readonly root: ParentNode, private readonly key: string, private readonly command: Command, private readonly live: boolean) {
    const el = root.querySelector<HTMLElement>('#phone');
    if (!el) throw new Error('the shell has no #phone (index.html)');
    this.el = el;
    this.el.hidden = false;
  }

  apply(frame: Frame, _store: Store): void {
    const s = frame.state;
    if (s.tick > this.answeredTick) this.answered.clear();
    this.pendingHouse = false;
    this.oracleCost = s.game?.oracle_cost ?? ORACLE_CR;
    this.house = resolveHouse(s, this.key);
    const n = this.house;
    if (!n) { this.el.replaceChildren(this.p('who', `No house called “${this.key}” on this street.`)); return; }
    if (this.asking !== undefined && n.oracle_tick !== this.asking) this.asking = undefined;
    const held = new Set(s.held.map((h) => h.envelope));
    for (const id of [...this.answered]) if (!held.has(id)) this.answered.delete(id);

    const head = document.createElement('header');
    const h1 = document.createElement('h1'); h1.textContent = n.name;
    const pill = document.createElement('span'); pill.className = 'pill'; pill.dataset.status = n.status; pill.textContent = (n.porter_back_tick ?? 0) > s.tick && !n.note
      ? `The Porter is out · back at ${dayLabel(n.porter_back_tick!, s.game?.week_ticks)}`
      : (s.game?.send_ticks ?? 1) > 1 && n.status === 'waiting_at_door' ? 'The Porter is at the Door · staff keep drafting' : pillText(n.status);
    head.append(h1, this.p('day mono', dayLabel(s.tick, s.game?.week_ticks)), pill);

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
      : `The oracle said the courier costs ${fmtCost(n.oracle_price)} cr (${dayLabel(n.oracle_tick, s.game?.week_ticks)}).`));
    if (this.asking !== undefined) oracle.append(this.p('asking', 'Asking the oracle… the answer comes back at the next tick.'));

    const parts: HTMLElement[] = [head, purse, oracle];
    if (s.game) {
      const pocket = document.createElement('section'); pocket.className = 'pocket';
      pocket.append(this.p('mono', `Your pocket: ${fmtCost(n.pocket_left ?? 0)} cr left.`));
      const ended = s.tick >= s.game.week_ticks || n.note?.reason.kind === 'closed';
      const control = (label: string, cmd: Parameters<Command>[0], disabled: boolean) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
        b.disabled = !this.live || ended || disabled || this.pendingHouse;
        b.onclick = () => {
          this.pendingHouse = true; b.disabled = true;
          void this.command(cmd).then((ok) => { if (!ok) this.failed('The house command was refused.'); })
            .catch(() => this.failed('The house command could not reach the engine.'));
        };
        pocket.append(b);
      };
      control('Put in 50 cr from your pocket', { decision: 'top_up', node: n.id, credits: 50 }, (n.pocket_left ?? 0) < 50);
      control('The week is over for my house', { decision: 'close', node: n.id }, false);
      parts.push(pocket);
    }
    if (this.failure) { const p = this.p('command-failure', this.failure); p.setAttribute('role', 'alert'); parts.push(p); }
    const cards = composeCards(s, n.id);
    if (n.note) parts.push(noteSheet(n.note, n.note.week ? 'The week’s Note' : 'A note on the table'));
    else if ((n.porter_back_tick ?? 0) > s.tick) {
      const count = n.queued_drafts ?? 0;
      parts.push(this.p('quiet', `The Porter is delivering your parcel. ${count} finished ${count === 1 ? 'draft' : 'drafts'} on the table. ${n.current_task ? 'Your staff keep drafting.' : 'Your list is drafted.'}`));
    }
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
      this.p('calm', (s.game?.send_ticks ?? 1) > 1 ? 'Your staff keep drafting while you decide.' : 'Nothing burns while you decide.'),
      this.p('proof mono', `Held ${held} ${held === 1 ? 'tick' : 'ticks'} · Φ ${fmtPhi(n.confidence)} now`),
    );
    if (c.waiting > 1) el.append(this.p('count', `1 of ${c.waiting} at the Door`));
    el.append(this.p('formatting', 'Formatting costs 2.5 cr once per draft and 0.5 cr per hire attempt. These offers are already paid for.'));
    const buttons = document.createElement('div'); buttons.className = 'answers';
    const cost = s.game?.oracle_cost ?? ORACLE_CR;
    const decide = (answer: 'send' | 'hire' | 'ask' | 'leave') => {
      this.failure = ''; this.el.querySelector('.command-failure')?.remove();
      if (answer === 'ask') {
        this.asking = n.oracle_tick;
        this.el.querySelector('section.oracle')?.append(this.p('asking', 'Asking the oracle… the answer comes back at the next tick.'));
      } else {
        for (const h of c.envelopes) this.answered.add(h.envelope);
        this.answeredTick = s.tick;
        el.append(this.p('sent', 'sent to the Door…'));
      }
      buttons.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      void this.command({ decision: 'answer', node: n.id, offer: c.envelopes[0].envelope, answer })
        .then((ok) => { if (!ok) this.failed('The answer was refused. The card is still on the table.'); })
        .catch(() => this.failed('The answer could not reach the engine. The card is still on the table.'));
    };
    const btn = (label: string, cls: string, answer: 'send' | 'hire' | 'ask' | 'leave', unaffordable = false) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label;
      b.disabled = !this.live || sent || this.asking !== undefined || unaffordable;
      b.addEventListener('click', () => decide(answer)); buttons.append(b);
    };
    if (c.send) btn(sendLabel(c.send), 'send primary', 'send', n.compute < c.send.cost);
    if (c.hire) btn(hireLabel(c.hire), 'hire', 'hire');
    btn(`Ask the oracle first (${cost} cr)`, 'oracle', 'ask', n.compute < cost);
    btn(LEAVE_LABEL, 'leave', 'leave');
    el.append(buttons);
    if (sent) el.append(this.p('sent', 'sent to the Door…'));
    return el;
  }

  private failed(message: string): void {
    this.failure = message; this.asking = undefined; this.answered.clear(); this.pendingHouse = false;
    this.el.querySelector('section.oracle .asking')?.remove();
    this.el.querySelector('.command-failure')?.remove();
    this.el.querySelector('.door-card .sent')?.remove();
    const p = this.p('command-failure', message); p.setAttribute('role', 'alert'); this.el.append(p);
    // Refresh button affordability from the most recent authoritative frame on the next apply.
    this.el.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.disabled = !this.live || (b.classList.contains('oracle') && (this.house?.compute ?? 0) < this.oracleCost)
        || (b.classList.contains('send') && (this.house?.compute ?? 0) < 10)
        || (b.textContent?.startsWith('Put in 50') === true && (this.house?.pocket_left ?? 0) < 50);
    });
  }

  private p(cls: string, text: string): HTMLElement {
    const p = document.createElement('p'); if (cls) p.className = cls; p.textContent = text; return p;
  }
}
