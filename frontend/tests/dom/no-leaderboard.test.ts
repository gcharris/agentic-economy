// The first test written (ARCHITECTURE §10): after every frame of every
// recorded run, the DOM never shows a score, rank, reputation, leaderboard or
// rating. The shell of index.html is mounted and the trace replays through the
// store with the ui seam at its default (no-op); the ui lane's real layer
// makes this test bite, and it stays green by never drawing those words.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { TraceSource, type RunName } from '../../src/engine/source/TraceSource.ts';
import { acceptFrame } from '../../src/engine/store/reducer.ts';
import { NOOP_UI, Store } from '../../src/engine/store/Store.ts';
import { FRONTEND_ROOT, loadTrace } from '../helpers/assets.ts';

const FORBIDDEN = /\b(score|rank|reputation|leaderboard|rating)\b/i;
const trace = loadTrace();
const RUNS = (['house', 'house_hidden_cost', 'house_visible_cost', 'street'] as const satisfies readonly RunName[]).filter((r) => Array.isArray(trace[r]));

beforeAll(() => {
  const html = readFileSync(resolve(FRONTEND_ROOT, 'index.html'), 'utf8');
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? '';
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/gi, '');
});

describe('there is no leaderboard', () => {
  test('the shell itself carries every mount id and no forbidden word', () => {
    for (const id of ['stage', 'hud', 'focus-status', 'focus-purse', 'feed', 'gates', 'totals', 'ladder', 'block', 'door', 'note', 'receipts', 'ticker', 'labels', 'banner']) {
      expect(document.getElementById(id), `#${id}`).not.toBeNull();
    }
    const door = document.querySelector<HTMLDialogElement>('dialog#door')!;
    expect(door.open).toBe(false);
    for (const id of ['door-desc', 'door-cost', 'door-yes', 'door-no', 'door-proof-ticks', 'door-proof-purse', 'door-proof-phi']) expect(door.querySelector(`#${id}`), `#${id}`).not.toBeNull();
    expect(door.textContent).toContain('Nothing burns while you decide');
    expect(door.querySelector('#door-yes')!.textContent).toBe('Yes, send it');
    expect(door.querySelector('#door-no')!.textContent).toBe('No, leave it on the table');
    expect(document.body.textContent).not.toMatch(FORBIDDEN);
  });

  for (const run of RUNS) {
    test(`after every frame of the recorded "${run}" run`, async () => {
      const store = new Store();
      const source = TraceSource.fromTrace(trace, run);
      let frames = 0;
      source.onFrame((f) => {
        acceptFrame(f, store, NOOP_UI);
        frames++;
        expect(document.body.textContent, `${run} tick ${f.tick}`).not.toMatch(FORBIDDEN);
        // the copy the ui lane will draw from the store: feed lines, held descriptions, notes, node names and tasks
        const drawn = [
          ...store.feed.map((l) => l.text),
          ...f.state.held.map((h) => `${h.node_name} ${h.description}`),
          ...[...store.notes.values()].map((n) => `${n.doing} ${n.saved_state}`),
          ...f.state.nodes.map((n) => `${n.name} ${n.current_task ?? ''} ${n.receipts.join(' ')}`),
          ...f.state.gates,
        ].join('\n');
        expect(drawn, `${run} tick ${f.tick}`).not.toMatch(FORBIDDEN);
      });
      while ((await source.step()) !== null) { /* every frame */ }
      expect(frames).toBe(trace[run]!.length);
    });
  }

  test('the dialog polyfill toggles the open attribute', () => {
    const door = document.querySelector<HTMLDialogElement>('dialog#door')!;
    door.showModal();
    expect(door.open).toBe(true);
    expect(door.hasAttribute('open')).toBe(true);
    let closed = 0;
    door.addEventListener('close', () => closed++);
    door.close();
    expect(door.open).toBe(false);
    expect(closed).toBe(1);
    expect(typeof window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe('boolean');
  });
});
