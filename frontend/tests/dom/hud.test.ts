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
