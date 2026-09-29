// Skeleton of ARCHITECTURE §10's reducer test: reduce() runs exactly once per
// accepted frame and never from the render loop. The App + NullRenderer half
// (300 renderer.frame(dt) calls leave the count untouched) is marked todo
// until src/app lands; the engine-layer half runs here against the store.
import { describe, expect, test, vi } from 'vitest';
import type { Frame } from '../../src/engine/source/EngineSource.ts';
import { TraceSource } from '../../src/engine/source/TraceSource.ts';
import { acceptFrame } from '../../src/engine/store/reducer.ts';
import { readTruth } from '../../src/engine/store/slots.ts';
import { NOOP_UI, Store, TIME_NEVER, TIMES_SYNC, type UiLayer } from '../../src/engine/store/Store.ts';
import { loadTrace } from '../helpers/assets.ts';

const trace = loadTrace();

describe('reduce() runs once per frame', () => {
  test('one reduce, one ui.apply and one bus "frame" per accepted frame of the house run', async () => {
    const store = new Store();
    const apply = vi.fn<UiLayer['apply']>();
    const ui: UiLayer = { apply };
    let reduces = 0;
    store.subscribe(() => reduces++); // notify() fires at the end of every reduce()
    const source = new TraceSource(trace.house, { version: trace.version, scenario: 'house', seed: 7 });
    source.onFrame((f: Frame) => acceptFrame(f, store, ui));
    let frames = 0;
    while ((await source.step()) !== null) frames++;
    expect(frames).toBe(70);
    expect(reduces).toBe(70);
    expect(apply).toHaveBeenCalledTimes(70);
    expect(store.bus.counts.frame).toBe(70);
    expect(store.frameCount).toBe(70);
    expect(store.frame!.tick).toBe(70);
    expect(store.prev!.tick).toBe(69);
  });

  test('the render loop never reduces: 300 idle render-frame steps leave the reduce count untouched', async () => {
    const store = new Store();
    let reduces = 0;
    store.subscribe(() => reduces++);
    const source = new TraceSource(trace.house, { version: trace.version, scenario: 'house', seed: 7 });
    source.onFrame((f) => acceptFrame(f, store, NOOP_UI));
    await source.stepTo(3);
    expect(reduces).toBe(3);
    // stand-in for renderer.frame(dt): what a renderer may touch per frame is the clips' prune and the uniform arrays, never the frame
    for (let i = 0; i < 300; i++) { store.clips.prune(store.frame!.arrivedAt + i / 60); void store.pulses.uPulses; }
    expect(reduces).toBe(3);
    expect(store.frameCount).toBe(3);
  });

  test.todo('App + NullRenderer: a spy on reduce after 300 renderer.frame(dt) calls equals the frame count (needs src/app)');
});

describe('what one pass leaves in the store (house run)', () => {
  async function run(tick: number) {
    const store = new Store();
    const source = new TraceSource(trace.house, { version: trace.version, scenario: 'house', seed: 7 });
    source.onFrame((f) => acceptFrame(f, store, NOOP_UI));
    await source.stepTo(tick);
    return { store, source };
  }

  test('tick 1: the Door opens once for the held envelope with the opening purse and Φ', async () => {
    const { store } = await run(1);
    expect(store.door.size).toBe(1);
    const entry = store.door.get(3930624385311261)!;
    expect(entry.held.description).toBe('send the finished draft for doc_synthesis_01');
    expect(entry.openedCompute).toBe(754.95);
    expect(entry.openedPhi).toBeCloseTo(0.9730, 4);
    expect(entry.openedTick).toBe(1);
    expect(store.focus).toBe(3781345924436676);
    expect(store.layout.current.root).toBe(3155115984088982);
    expect(store.feed.at(-1)!.text).toMatch(/^t1 · block committed/);
    expect(store.clips.active.some((c) => c.kind === 'hold')).toBe(true);
  });

  test('tick 4: still open, the house texel reads waiting + held, Φ 0.893', async () => {
    const { store } = await run(4);
    expect(store.door.size).toBe(1);
    const t = readTruth(store.truth, store.slots.peek(3781345924436676));
    expect(t.status).toBe(1);
    expect(t.held).toBe(true);
    expect(Math.abs(t.phi - 0.8928)).toBeLessThan(1e-3);
    expect(store.burnRef).toBeGreaterThan(0);
  });

  test('tick 5: the Door closes because held is empty, the hold clip ends, the feed shows the approval', async () => {
    const { store } = await run(5);
    expect(store.door.size).toBe(0);
    expect(store.feed.map((l) => l.text)).toContain('t5 · approved at the Door');
    expect(store.clips.active.filter((c) => c.kind === 'hold' && c.end === Infinity)).toHaveLength(0);
    expect(store.node(3781345924436676)!.compute).toBe(744.95);
  });

  test('tick 11: STATE_SYNC writes syncT for the house and keeps the pre-sync Φ in the prev texel', async () => {
    const { store } = await run(10);
    expect(store.readTime(3781345924436676, TIMES_SYNC)).toBe(TIME_NEVER);
    const { store: s11 } = await run(11);
    const f = s11.frame!;
    expect(f.events.some((e) => e.type === 'STATE_SYNC')).toBe(true);
    expect(s11.readTime(3781345924436676, TIMES_SYNC)).toBe(Math.fround(f.arrivedAt)); // uTimes is float32
    const prev = readTruth(s11.truthPrev, s11.slots.peek(3781345924436676));
    expect(Math.abs(prev.phi - 0.7324)).toBeLessThan(1e-3);
  });

  test('tick 16: GLOBAL_STATE_CONFIRMED enters the pulse ring', async () => {
    const { store } = await run(16);
    expect(store.pulses.entries.some((p) => p?.kind === 3 && p.data[0] === 32)).toBe(true);
  });

  test('a seeked frame applies state and DOM but schedules no clip', async () => {
    const store = new Store();
    const source = new TraceSource(trace.house, { version: trace.version, scenario: 'house', seed: 7 });
    let events = 0;
    source.onFrame((f) => { const evs = acceptFrame(f, store, NOOP_UI); events = evs.length; expect(evs.every((e) => e.seeked && e.clip === null)).toBe(true); });
    await source.seek(4);
    expect(events).toBeGreaterThan(0);
    expect(store.clips.active).toHaveLength(0);
    expect(store.door.size).toBe(1);
  });

  test('the street run: tick 7 feeds six hash-mismatch rejections; the layout is computed once for 30 frames', async () => {
    const store = new Store();
    let layouts = 0;
    store.bus.on('layout', () => layouts++);
    const source = new TraceSource(trace.street, { version: trace.version, scenario: 'street', seed: 7 });
    source.onFrame((f) => acceptFrame(f, store, NOOP_UI));
    await source.stepTo(7);
    const t7 = store.feed.filter((l) => l.tick === 7 && l.type === 'REJECTED');
    expect(t7).toHaveLength(6);
    for (const l of t7) expect(l.text).toMatch(/rejected at the Letter Slot · hash mismatch: .* · 0\.5 cr sunk$/);
    expect(store.clips.active.filter((c) => c.kind === 'snapback')).toHaveLength(6);
    expect(store.frame!.decisions[0]).toMatchObject({ decision: 'truth_changed', tick: 7 });
    await source.stepTo(30);
    expect(layouts).toBe(1);
    expect(store.feed.length).toBeLessThanOrEqual(200);
  });

  test('house_hidden_cost: the Note is on the table at tick 9 and haltT is written', async () => {
    const store = new Store();
    const source = new TraceSource(trace.house_hidden_cost, { version: trace.version, scenario: 'house', seed: 7 });
    source.onFrame((f) => acceptFrame(f, store, NOOP_UI));
    await source.stepTo(9);
    expect(store.notes.size).toBe(1);
    const note = store.notes.get(3781345924436676)!;
    expect(note.reason).toEqual({ kind: 'runway_exhausted', shortfall: expect.closeTo(11.8, 6) });
    expect(note.compute_remaining).toBeCloseTo(16.2, 6);
    expect(store.feed.some((l) => l.text.includes('Runway exhausted'))).toBe(true);
    expect(store.readTime(3781345924436676, 2)).toBe(Math.fround(store.frame!.arrivedAt));
  });
});
