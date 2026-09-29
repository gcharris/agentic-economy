// The HUD (DESIGN §3, ARCHITECTURE §B.2). Patched once per frame from reduce(), never per render frame.
// Only StateView and EngineEvent are drawn: every number here is a field of the current frame.

import { fmtCost, fmtCr, fmtPhi, GATE_NAME, hash8, STAGE_BY_LEVEL, STAGE_LEVEL, STAGE_NAME } from '../engine/contract/copy.ts';
import type { NodeView, StateView, Totals } from '../engine/contract/state.ts';
import { normaliseBurn, STAGES } from '../engine/contract/state.ts';
import type { EngineSource, Frame } from '../engine/source/EngineSource.ts';
import type { Band } from '../engine/store/bus.ts';
import type { Store } from '../engine/store/Store.ts';
import { pillText } from './pills.ts';

export const FEED_LINES = 40;
const TOTALS_LABEL: Record<keyof Totals, string> = {
  compute_burned: 'burned', tax_paid: 'crossing tax', settled: 'settled', slashed: 'slashed',
  approved: 'approved', rejected: 'rejected', waiting: 'waiting', halted: 'halted',
};

export interface HudDeps {
  root: ParentNode;
  source: EngineSource;
  zoom: (band: Band) => void;
  controls?: { run(): void; pause(): void; step(): void; speed(x: number): void; running(): boolean };
}

export class Hud {
  private readonly $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const el = this.deps.root.querySelector<T>(`#${id}`);
    if (!el) throw new Error(`the shell has no #${id} (index.html)`);
    return el;
  };
  private pending: Band | null = null;
  private tickerKey = '';
  /** The Clearinghouse's last netting, written by the NETTED pulse (DESIGN §7 beat 2). */
  private netted = '';

  constructor(private readonly deps: HudDeps) {
    this.buildLadder();
    this.buildControls();
  }

  apply(frame: Frame, store: Store): void {
    const s = frame.state;
    this.ladder(s);
    const net = frame.events.find((e) => e.type === 'NETTED');
    if (net && net.type === 'NETTED') this.netted = `netted ${net.envelopes} envelopes · gross ${fmtCost(net.gross)} → net ${fmtCost(net.net)}`;
    this.block(s, store);
    const n = store.focus === null ? undefined : store.node(store.focus);
    if (n) this.focus(n);
    this.gates(s);
    this.totals(s.totals);
    this.feed(store);
    this.receipts(n);
    this.ticker(s);
  }

  private buildLadder(): void {
    const nav = this.$('ladder');
    nav.replaceChildren(...STAGES.map((st) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.stage = st;
      b.innerHTML = `<span class="rung"></span><small class="gate"></small>`;
      b.querySelector('.rung')!.textContent = STAGE_NAME[st];
      b.querySelector('.gate')!.textContent = GATE_NAME[st];
      b.addEventListener('click', () => {
        if (!this.deps.source.live) return;
        this.pending = STAGE_LEVEL[st];
        this.deps.zoom(STAGE_LEVEL[st]);
        nav.querySelectorAll<HTMLElement>('button').forEach((x) => x.classList.toggle('pending', x.dataset.stage === st));
      });
      return b;
    }));
  }

  private ladder(s: StateView): void {
    if (this.pending !== null && STAGE_BY_LEVEL[this.pending] === s.active_scale) this.pending = null;
    for (const b of this.$('ladder').querySelectorAll<HTMLButtonElement>('button')) {
      const st = b.dataset.stage as StateView['active_scale'];
      b.classList.toggle('active', st === s.active_scale);
      b.classList.toggle('pending', this.pending !== null && STAGE_BY_LEVEL[this.pending] === st);
      b.setAttribute('aria-current', st === s.active_scale ? 'true' : 'false');
      b.title = this.pending !== null && STAGE_BY_LEVEL[this.pending] === st ? 'asking the engine…' : '';
      b.disabled = !this.deps.source.live;
    }
  }

  private block(s: StateView, store: Store): void {
    const mode = this.deps.source.kind === 'trace' ? 'recorded run'
      : this.deps.source.kind === 'wasm' ? 'live · wasm in a worker' : `live · SSE ${store.hello?.version ?? ''}`.trim();
    this.$('block').innerHTML = '<span class="b-tick"></span><span class="b-root mono"></span><span class="b-exec"></span><span class="b-mempool"></span><span class="b-net"></span><span class="b-mode"></span>';
    const set = (c: string, t: string) => { this.$('block').querySelector(`.${c}`)!.textContent = t; };
    set('b-tick', `tick ${s.tick}`);
    set('b-root', `root ${hash8(s.root)}`);
    set('b-exec', s.executor);
    set('b-mempool', `mempool ${s.mempool}`);
    set('b-net', this.netted);
    set('b-mode', mode);
  }

  private focus(n: NodeView): void {
    this.$('focus-name').textContent = n.name;
    const pill = this.$('focus-status');
    pill.textContent = pillText(n.status);
    pill.dataset.status = n.status;
    const share = n.compute_allocated > 0 ? n.compute / n.compute_allocated : 0;
    const purse = this.$('focus-purse');
    purse.innerHTML = '<span class="v"></span><span class="bar"><i></i></span>';
    purse.querySelector('.v')!.textContent = `purse ${fmtCr(n.compute)} / ${fmtCr(n.compute_allocated)} cr`;
    const bar = purse.querySelector<HTMLElement>('.bar i')!;
    bar.style.width = `${Math.max(0, Math.min(1, share)) * 100}%`;
    purse.classList.toggle('low', share < 0.15);
    this.$('focus-phi').textContent = `Φ ${fmtPhi(n.confidence)} · generation ${n.generation} · fog ${n.fog.toFixed(3)}`;
    this.$('focus-tasks').textContent = `${n.tasks_done} / ${n.tasks_total} tasks`;
    this.$('focus-task').textContent = n.current_task ?? '';
    this.$('focus-burn').textContent = `${fmtCost(normaliseBurn(n.burned_this_tick))} cr this tick`;
    this.$('focus-liquidity').textContent = n.liquidity_belief === n.liquidity_truth
      ? `liquidity ${fmtCr(n.liquidity_truth)}`
      : `belief ${fmtCr(n.liquidity_belief)} · truth ${fmtCr(n.liquidity_truth)}`;
    this.$('focus-papers').textContent = `${n.papers} ${n.papers === 1 ? 'paper' : 'papers'} on the table`;
    this.$('focus-root').textContent = `oak ${hash8(n.oak_root)}`;
  }

  private gates(s: StateView): void {
    const ul = this.$('gates');
    if (ul.childElementCount !== s.gates.length) ul.replaceChildren(...s.gates.map(() => document.createElement('li')));
    s.gates.forEach((g, i) => { (ul.children[i] as HTMLElement).textContent = g; });
  }

  private totals(t: Totals): void {
    const dl = this.$('totals');
    const keys = Object.keys(TOTALS_LABEL) as (keyof Totals)[];
    if (dl.childElementCount !== keys.length * 2) {
      dl.replaceChildren(...keys.flatMap((k) => {
        const dt = document.createElement('dt'); dt.textContent = TOTALS_LABEL[k];
        const dd = document.createElement('dd'); dd.className = 'mono'; dd.dataset.key = k;
        return [dt, dd];
      }));
    }
    for (const k of keys) {
      const v = t[k];
      dl.querySelector<HTMLElement>(`dd[data-key="${k}"]`)!.textContent =
        k === 'compute_burned' || k === 'tax_paid' || k === 'settled' || k === 'slashed' ? `${fmtCr(v)} cr` : String(v);
    }
  }

  private feed(store: Store): void {
    const lines = store.feed.slice(-FEED_LINES).reverse();
    this.$('feed').replaceChildren(...lines.map((l) => {
      const li = document.createElement('li');
      li.textContent = l.text;
      li.dataset.type = l.type;
      return li;
    }));
  }

  private receipts(n: NodeView | undefined): void {
    this.$('receipts').replaceChildren(...(n?.receipts ?? []).map((r) => {
      const li = document.createElement('li'); li.textContent = r; return li;
    }));
  }

  private ticker(s: StateView): void {
    const key = s.root_history.map(([t]) => t).join(',');
    if (key === this.tickerKey) return;
    this.tickerKey = key;
    this.$('ticker').replaceChildren(...[...s.root_history].reverse().map(([t, root]) => {
      const span = document.createElement('span');
      span.className = 'tab';
      span.title = `tick ${t}`;
      span.textContent = root;
      return span;
    }));
  }

  private buildControls(): void {
    const c = this.deps.controls;
    const box = this.$('controls');
    if (!c) { box.hidden = true; return; }
    const btn = (label: string, fn: () => void) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', fn); return b;
    };
    const play = btn('Run', () => { if (c.running()) { c.pause(); play.textContent = 'Run'; } else { c.run(); play.textContent = 'Pause'; } });
    const speed = document.createElement('select');
    speed.setAttribute('aria-label', 'Speed');
    for (const x of [0.25, 0.5, 1, 2, 4, 8]) {
      const o = document.createElement('option'); o.value = String(x); o.textContent = `${x}×`; o.selected = x === 1; speed.append(o);
    }
    speed.addEventListener('change', () => c.speed(Number(speed.value)));
    box.replaceChildren(play, btn('Step', () => c.step()), speed);
  }
}
