// The street through the real UI (ARCHITECTURE §10 companions): tick 7 of the recorded street run.

import { afterEach, beforeEach, expect, test } from 'vitest';
import { App } from '../../src/app/App.ts';
import { NullRenderer } from '../../src/app/Renderer.ts';
import { TraceSource } from '../../src/engine/source/TraceSource.ts';
import { loadShell, loadTrace } from '../helpers/assets.ts';

const trace = loadTrace();
let app: App | null = null;
beforeEach(() => loadShell());
afterEach(() => { app?.dispose(); app = null; });

test('tick 7: the hash-mismatch rejection is in the feed with 0.5 cr sunk; the focus card reads liquidity from the frame', async () => {
  const source = TraceSource.fromTrace(trace, 'street');
  app = await App.boot({ source, renderer: new NullRenderer(), root: document.body, clock: 'manual' });
  await source.stepTo(6);
  expect(document.querySelector('#feed')!.textContent).not.toMatch(/hash mismatch/);
  const f = (await source.stepTo(7))!;
  expect(f.decisions.some((d) => d.decision === 'truth_changed')).toBe(true);
  expect(document.querySelector('#feed')!.textContent).toMatch(/t7 · rejected at the Letter Slot · hash mismatch: .* · 0\.5 cr sunk/);
  const n = f.state.nodes.find((x) => x.id === app!.store.focus)!;
  // ARCHITECTURE §10 expects belief ≠ truth here, but the recording's drift is the believed courier price
  // (10.00 vs 12), not a node's liquidity: every node's belief equals its truth at ticks 7–9. The card follows
  // the frame; the belief · truth form is covered in hud.test.ts.
  expect(n.liquidity_belief).toBe(n.liquidity_truth);
  expect(document.querySelector('#focus-liquidity')!.textContent).toBe(`liquidity ${n.liquidity_truth.toFixed(2)}`);
  expect(document.querySelector('#ladder button.active')!.getAttribute('data-stage')).toBe('Street');
});

test('the block line writes the Clearinghouse netting on NETTED (scenario 3 in the wasm)', async () => {
  const { engineSource } = await import('../helpers/engineSource.ts');
  const source = engineSource('city');
  app = await App.boot({ source, renderer: new NullRenderer(), root: document.body, clock: 'manual' });
  await app.stepTo(1);
  expect(document.querySelector('#block')!.textContent).toContain('netted 12 envelopes · gross 60.0 → net 20.0');
  expect(document.querySelector('#ladder button.active')!.getAttribute('data-stage')).toBe('City');
});
