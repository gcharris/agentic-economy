// The acceptance test that needs no GPU (ARCHITECTURE §10, tier 2): the recorded house run through the real
// App, store, reducer and DOM with a NullRenderer. The Door opens at tick 1, carries its proof at tick 4,
// and closes at tick 5 when the engine says APPROVED.

import { afterEach, beforeEach, expect, test } from 'vitest';
import { App } from '../../src/app/App.ts';
import { NullRenderer } from '../../src/app/Renderer.ts';
import { TraceSource } from '../../src/engine/source/TraceSource.ts';
import { loadShell, loadTrace } from '../helpers/assets.ts';

const trace = loadTrace();
let app: App | null = null;
beforeEach(() => loadShell());
afterEach(() => { app?.dispose(); app = null; });

test('the DOM shows the Door at the recorded tick and closes when the engine says so', async () => {
  const source = new TraceSource(trace.house, { version: trace.version, scenario: 'house', seed: 7 });
  app = await App.boot({ source, renderer: new NullRenderer(), root: document.body, clock: 'manual' });
  const door = document.querySelector<HTMLDialogElement>('dialog#door')!;
  expect(door.open).toBe(false);
  await source.stepTo(1);
  expect(door.open).toBe(true);
  expect(door.querySelector('#door-node')!.textContent).toBe('The House');
  expect(door.querySelector('#door-desc')!.textContent).toBe('send the finished draft for doc_synthesis_01');
  expect(door.querySelector('#door-cost')!.textContent).toBe('10.0 cr');
  expect(door.textContent).toContain('Nothing burns while you decide');
  expect(door.querySelector('#door-yes')!.textContent).toBe('Yes, send it');
  expect(door.querySelector('#door-no')!.textContent).toBe('No, leave it on the table');
  await source.stepTo(4);
  expect(door.open).toBe(true);
  expect(door.querySelector('#door-proof-ticks')!.textContent).toBe('Held 3 ticks');
  expect(door.querySelector('#door-proof-purse')!.textContent).toBe('purse unchanged at 754.95 cr');
  expect(door.querySelector('#door-proof-phi')!.textContent).toBe('Φ 97.3% then, 89.3% now');
  expect(document.querySelector('#focus-status')!.textContent).toBe('waiting at the door · 0.0 cr idle burn');
  expect(document.querySelector('#focus-burn')!.textContent).toBe('0.0 cr this tick');
  await source.stepTo(5); // frame 5 carries the recorded approve; held is empty; APPROVED at tick 5
  expect(door.open).toBe(false);
  expect(document.querySelector('#feed')!.textContent).toMatch(/t5 · approved at the Door/);
  expect(document.querySelector('#focus-purse')!.textContent).toContain('744.95');
});

test('a recorded run disables the answer and says why; Escape never decides', async () => {
  const source = new TraceSource(trace.house, { version: trace.version, scenario: 'house', seed: 7 });
  app = await App.boot({ source, renderer: new NullRenderer(), root: document.body, clock: 'manual' });
  await source.stepTo(2);
  const door = document.querySelector<HTMLDialogElement>('dialog#door')!;
  expect(door.querySelector<HTMLButtonElement>('#door-yes')!.disabled).toBe(true);
  expect(door.querySelector<HTMLElement>('#door-recorded')!.hidden).toBe(false);
  expect(door.querySelector<HTMLElement>('#door-camera')!.hidden).toBe(true);
  expect(door.querySelector<HTMLElement>('#door-count')!.hidden).toBe(true);
  const cancel = new Event('cancel', { cancelable: true });
  door.dispatchEvent(cancel);
  expect(cancel.defaultPrevented).toBe(true);
  expect(door.open).toBe(true);
});

test('a live source takes the click, shows "sent to the Door…", and only the next frame closes the card', async () => {
  const source = new TraceSource(trace.house, { version: trace.version, scenario: 'house', seed: 7 });
  const asked: number[] = [];
  Object.defineProperty(source, 'live', { value: true });
  (source as { authorize: (e: number) => Promise<boolean> }).authorize = async (e) => { asked.push(e); return true; };
  app = await App.boot({ source, renderer: new NullRenderer(), root: document.body, clock: 'manual' });
  await source.stepTo(4);
  const door = document.querySelector<HTMLDialogElement>('dialog#door')!;
  expect(document.activeElement?.id).toBe('door-no'); // focus lands on No
  door.querySelector<HTMLButtonElement>('#door-yes')!.click();
  await Promise.resolve();
  expect(asked).toEqual([trace.house[0].state.held[0].envelope]);
  expect(door.querySelector<HTMLElement>('#door-sent')!.hidden).toBe(false);
  expect(door.querySelector<HTMLButtonElement>('#door-no')!.disabled).toBe(true);
  expect(door.open).toBe(true); // the click is not the answer; the engine's frame is
  await source.stepTo(5);
  expect(door.open).toBe(false);
});
