// The Note (ARCHITECTURE §10 companions): house_hidden_cost halts at tick 9 on an empty purse.

import { afterEach, beforeEach, expect, test } from 'vitest';
import { App } from '../../src/app/App.ts';
import { NullRenderer } from '../../src/app/Renderer.ts';
import { TraceSource } from '../../src/engine/source/TraceSource.ts';
import { loadShell, loadTrace } from '../helpers/assets.ts';

const trace = loadTrace();
let app: App | null = null;
beforeEach(() => loadShell());
afterEach(() => { app?.dispose(); app = null; });

test('the Note lies on the table at the halt, with the reason and one button', async () => {
  const source = TraceSource.fromTrace(trace, 'house_hidden_cost');
  app = await App.boot({ source, renderer: new NullRenderer(), root: document.body, clock: 'manual' });
  const note = document.querySelector<HTMLElement>('#note')!;
  await source.stepTo(8);
  expect(note.hidden).toBe(true);
  await source.stepTo(9);
  expect(note.hidden).toBe(false);
  expect(note.textContent).toContain('A note on the table');
  expect(note.textContent).toContain('Runway exhausted');
  expect(note.textContent).toContain('16.20 cr');
  expect(note.textContent).toContain('lookup (Scout, 280 tok on fast_quantized)');
  const buttons = note.querySelectorAll('button');
  expect(buttons.length).toBe(1);
  expect(buttons[0].textContent).toBe('Top up the purse');
  expect(document.querySelector('#focus-status')!.textContent).toBe('halted · the note is on the table');
});
