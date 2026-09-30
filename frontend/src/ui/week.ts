// A Week on Elm Street (doc 06): the calendar and the Note's own typography, shared by the phone and the TV.
// Only StateView fields are drawn; the week's numbers are one house's own, never set against another's.

import { fmtCost, fmtCr, haltReasonLine } from '../engine/contract/copy.ts';
import type { Note, WeekNote } from '../engine/contract/state.ts';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/** Five days divided over the configured week, including a non-multiple such as 48. */
export function dayLabel(tick: number, weekTicks = 40): string {
  const week = Math.max(1, Math.floor(weekTicks));
  if (tick < 1) return 'Monday morning';
  if (tick > week) return 'the week is over';
  const day = Math.min(4, Math.floor((tick - 1) * DAYS.length / week));
  const start = Math.ceil(day * week / DAYS.length);
  const end = Math.ceil((day + 1) * week / DAYS.length);
  return `${DAYS[day]} · tick ${tick - start} of ${end - start}`;
}

/** The week's numbers as the Note writes them (doc 06 §3, "Friday"). */
export function weekLines(w: WeekNote): [string, string][] {
  const times = (n: number) => (n === 1 ? 'once' : `${n} times`);
  return [
    ['pieces done', `${w.pieces_done} of ${w.pieces_total}`],
    ['compute burned', `${fmtCr(w.compute_burned)} cr`],
    ['purse left', `${fmtCr(w.purse_left)} cr`],
    ['liquidity left', `${fmtCr(w.liquidity_left)} cr`],
    ['swaps settled', String(w.swaps_settled)],
    ['swaps reverted', String(w.swaps_reverted)],
    ['oracle asked', w.oracle_queries === 0 ? 'never' : times(w.oracle_queries)],
    ['top-ups', w.top_ups === 0 ? 'none' : `${times(w.top_ups)} · ${fmtCost(w.top_up_credits)} cr`],
  ];
}

/** A Note as a --paper sheet: the heading, the week's numbers (or what the house was doing), the reason line. */
export function noteSheet(n: Note, heading = 'A note on the table'): HTMLElement {
  const el = document.createElement('article');
  el.className = 'note-sheet';
  el.dataset.node = String(n.node);
  const h = document.createElement('h2'); h.textContent = heading;
  const who = document.createElement('p'); who.className = 'who'; who.textContent = n.node_name;
  const dl = document.createElement('dl');
  const rows: [string, string][] = n.week
    ? weekLines(n.week)
    : [['doing', n.doing], ['compute burned', `${fmtCr(n.compute_burned_total)} cr`], ['purse left', `${fmtCr(n.compute_remaining)} cr`], ['papers on the table', String(n.papers_on_table)]];
  for (const [k, v] of rows) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.className = 'mono'; dd.textContent = v;
    dl.append(dt, dd);
  }
  const reason = document.createElement('p'); reason.className = 'reason'; reason.textContent = haltReasonLine(n.reason);
  el.append(h, who, dl, reason);
  return el;
}
