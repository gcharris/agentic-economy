import { describe, expect, test } from 'vitest';
import type { Frame, SourceStatus } from '../../src/engine/source/EngineSource.ts';
import { TraceSource } from '../../src/engine/source/TraceSource.ts';
import { loadTrace } from '../helpers/assets.ts';

const trace = loadTrace();
const house = () => new TraceSource(trace.house, { version: trace.version, scenario: 'house', seed: 7 });

describe('TraceSource', () => {
  test('start() says recorded and exposes the run', async () => {
    const s = house();
    expect(s.kind).toBe('trace'); expect(s.drive).toBe('pull'); expect(s.live).toBe(false);
    expect(s.length).toBe(70);
    expect(s.cursor).toBe(-1);
    const hello = await s.start();
    expect(hello).toEqual({ version: trace.version, scenario: 'house', seed: 7, tickSeconds: null, recorded: true });
  });

  test('stepTo(5) emits five frames in order; frame 5 carries the recorded approve with decisions[0].tick === 4', async () => {
    const s = house();
    const seen: Frame[] = [];
    s.onFrame((f) => seen.push(f));
    const last = await s.stepTo(5);
    expect(seen).toHaveLength(5);
    expect(seen.map((f) => f.tick)).toEqual([1, 2, 3, 4, 5]);
    expect(last).toBe(seen[4]);
    expect(last!.decisions[0]).toMatchObject({ tick: 4, decision: 'approve', envelope: 3930624385311261, description: 'send the finished draft for doc_synthesis_01' });
    expect(last!.events.map((e) => e.type)).toEqual(['APPROVED', 'DELIVERED', 'TICK_COMMITTED']);
    expect(last!.state.held).toHaveLength(0);
    expect(seen[3].state.held).toHaveLength(1);
    expect(s.cursor).toBe(4);
    for (const f of seen) { expect(f.tick).toBe(f.state.tick); expect(typeof f.arrivedAt).toBe('number'); expect(f.seeked).toBeUndefined(); }
  });

  test('stepTo resolves in microtasks with no timers', async () => {
    const s = house();
    let resolved = false;
    const p = s.stepTo(4).then(() => { resolved = true; });
    // drain microtasks only: no setTimeout, no fake timers
    for (let i = 0; i < 50 && !resolved; i++) await Promise.resolve();
    expect(resolved).toBe(true);
    await p;
    expect(s.cursor).toBe(3);
  });

  test('step() past the end returns null once with status ended; stepTo beyond the run stops at the last frame', async () => {
    const s = new TraceSource(trace.house_hidden_cost, { version: trace.version, scenario: 'house', seed: 7 });
    const statuses: SourceStatus[] = [];
    s.onStatus((st) => statuses.push(st));
    const last = await s.stepTo(99);
    expect(last!.tick).toBe(9);
    expect(await s.step()).toBeNull();
    expect(statuses.at(-1)).toEqual({ kind: 'ended' });
    expect(statuses.filter((x) => x.kind === 'ended')).toHaveLength(1);
  });

  test('stepTo a tick already reached emits nothing more', async () => {
    const s = house();
    await s.stepTo(3);
    const seen: Frame[] = [];
    s.onFrame((f) => seen.push(f));
    const f = await s.stepTo(3);
    expect(seen).toHaveLength(0);
    expect(f!.tick).toBe(3);
  });

  test('seek(tick) emits frames[tick − 1] flagged seeked, without walking the frames between', async () => {
    const s = house();
    const seen: Frame[] = [];
    s.onFrame((f) => seen.push(f));
    const f = await s.seek(16);
    expect(seen).toHaveLength(1);
    expect(f!.tick).toBe(16);
    expect(f!.seeked).toBe(true);
    expect(f!.events.some((e) => e.type === 'GLOBAL_STATE_CONFIRMED')).toBe(true);
    expect(await s.seek(999)).toBeNull();
    expect(s.cursor).toBe(15);
    const next = await s.step();
    expect(next!.tick).toBe(17);
  });

  test('the recorded run answers no command', async () => {
    const s = house();
    expect(await s.authorize()).toBe(false);
    expect(await s.reject()).toBe(false);
    expect(await s.topUp()).toBe(false);
    expect(await s.zoom()).toBe(false);
  });

  test('fromTrace picks a run and refuses a missing one', () => {
    expect(TraceSource.fromTrace(trace, 'street').length).toBe(30);
    expect(TraceSource.fromTrace(trace, 'street').hello.scenario).toBe('street');
    expect(() => TraceSource.fromTrace(trace, 'city')).toThrow(/no run "city"/);
  });

  test('unsubscribe stops frames', async () => {
    const s = house();
    let n = 0;
    const off = s.onFrame(() => n++);
    await s.step();
    off();
    await s.step();
    expect(n).toBe(1);
  });
});
