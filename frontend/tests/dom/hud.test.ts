// The HUD reads the frame and nothing else (ARCHITECTURE §10 companions).

import { afterEach, beforeEach, expect, test } from 'vitest';
import { App } from '../../src/app/App.ts';
import { NullRenderer } from '../../src/app/Renderer.ts';
import { TraceSource } from '../../src/engine/source/TraceSource.ts';
import { loadShell, loadTrace } from '../helpers/assets.ts';

const trace = loadTrace();
let app: App | null = null;
beforeEach(() => loadShell());
afterEach(() => { app?.dispose(); app = null; });

test('the block line, gates, totals and ticker match the frame at every tick of the house run', async () => {
  const source = TraceSource.fromTrace(trace, 'house');
  app = await App.boot({ source, renderer: new NullRenderer(), root: document.body, clock: 'manual' });
  for (let t = 1; t <= 20; t++) {
    const f = (await source.stepTo(t))!;
    const s = f.state;
    const block = document.querySelector('#block')!.textContent!;
    expect(block).toContain(`tick ${s.tick}`);
    expect(block).toContain(`root ${s.root.slice(0, 8)}`);
    expect(block).toContain('recorded run');
    expect([...document.querySelectorAll('#gates li')].map((l) => l.textContent)).toEqual(s.gates);
    expect(document.querySelectorAll('#ticker .tab').length).toBe(s.root_history.length);
    expect(document.querySelector('#ladder button.active')!.getAttribute('data-stage')).toBe(s.active_scale);
    expect(document.querySelector('dd[data-key="approved"]')!.textContent).toBe(String(s.totals.approved));
  }
});

test('the focus card is the house, and its figures are the frame\'s', async () => {
  const source = TraceSource.fromTrace(trace, 'house');
  app = await App.boot({ source, renderer: new NullRenderer(), root: document.body, clock: 'manual' });
  const f = (await source.stepTo(4))!;
  const n = f.state.nodes.find((x) => x.stage === 'House')!;
  expect(document.querySelector('#focus-name')!.textContent).toBe(n.name);
  expect(document.querySelector('#focus-purse')!.textContent).toBe(`purse ${n.compute.toFixed(2)} / ${n.compute_allocated.toFixed(2)} cr`);
  expect(document.querySelector('#focus-tasks')!.textContent).toBe(`${n.tasks_done} / ${n.tasks_total} tasks`);
  expect([...document.querySelectorAll('#receipts li')].map((l) => l.textContent)).toEqual(n.receipts);
});

test('no score, rank, reputation, leaderboard or rating appears anywhere, through the real UI, on every recorded frame', async () => {
  const FORBIDDEN = /\b(score|rank|reputation|leaderboard|rating)\b/i;
  for (const run of ['house', 'house_hidden_cost', 'house_visible_cost', 'street'] as const) {
    loadShell();
    const source = TraceSource.fromTrace(trace, run);
    const a = await App.boot({ source, renderer: new NullRenderer(), root: document.body, clock: 'manual' });
    while (await source.step()) expect(document.body.textContent, `${run} t${a.frame()!.tick}`).not.toMatch(FORBIDDEN);
    a.dispose();
  }
});

test('belief beside truth when they part (a frame edited to part them)', async () => {
  const frames = structuredClone(trace.house.slice(0, 1));
  const n = frames[0].state.nodes.find((x) => x.stage === 'House')!;
  n.liquidity_belief = 10; n.liquidity_truth = 12;
  const source = new TraceSource(frames, { version: trace.version, scenario: 'house', seed: 7 });
  const a = await App.boot({ source, renderer: new NullRenderer(), root: document.body, clock: 'manual' });
  await source.stepTo(1);
  expect(document.querySelector('#focus-liquidity')!.textContent).toBe('belief 10.00 · truth 12.00');
  a.dispose();
});
