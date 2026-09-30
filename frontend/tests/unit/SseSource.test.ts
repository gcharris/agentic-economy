import { expect, test } from 'vitest';
import { SseSource } from '../../src/engine/source/SseSource.ts';
import type { Frame } from '../../src/engine/source/EngineSource.ts';
import { freshEngine } from '../helpers/assets.ts';

test('SSE hello paints the current state while paused, and refreshes it on reconnect', async () => {
  class Stream extends EventTarget { onerror: (() => void) | null = null; close() {} }
  const stream = new Stream();
  const engine = freshEngine();
  engine.x.engine_new(1, 7n, 800, 15, 1);
  const state = engine.state();
  const source = new SseSource({
    createEventSource: () => stream as unknown as EventSource,
    fetch: async () => Response.json(state),
  });
  const frames: Frame[] = [];
  source.onFrame((f) => frames.push(f));
  const started = source.start();
  stream.dispatchEvent(new MessageEvent('hello', { data: 'context-engine (native, scenario house, seed 7)' }));
  await started;
  await new Promise((done) => setTimeout(done, 0));
  expect(frames).toHaveLength(1);
  expect(frames[0].state).toEqual(JSON.parse(JSON.stringify(state)));
  stream.dispatchEvent(new MessageEvent('hello', { data: 'context-engine (native, scenario house, seed 7)' }));
  await new Promise((done) => setTimeout(done, 0));
  expect(frames).toHaveLength(2);
  source.dispose();
});
