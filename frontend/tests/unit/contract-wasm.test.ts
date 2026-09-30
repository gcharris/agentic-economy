// The real wasm in Node: ten ticks of scenarios 1, 2, 3 and 5, every
// NodeView / StateView / HeldView / Totals / TickReport / Packed / Note key and
// every event tag and key against the contract types, so a drift in tick.rs or
// events.rs fails the build before it fails on screen. Scenario 4 must emit
// ROLLED_BACK within 20 ticks.
import { describe, expect, test } from 'vitest';
import { EVENT_KEYS, EVENT_TYPE_SET, type EngineEvent } from '../../src/engine/contract/events.ts';
import { MAX_ID } from '../../src/engine/contract/ids.ts';
import {
  HALT_KINDS, HELD_REASONS, HELD_VIEW_KEYS, NODE_STATUSES, NODE_VIEW_KEYS, NOTE_KEYS, PACKED_KEYS, STAGES, STATE_VIEW_KEYS,
  TICK_REPORT_KEYS, TOTALS_KEYS, type StateView,
} from '../../src/engine/contract/state.ts';
import { freshEngine, loadWasmModule, wasmPath } from '../helpers/assets.ts';

const mod = loadWasmModule();
const keysOf = (o: object) => Object.keys(o).sort();
const sorted = (k: readonly string[]) => [...k].sort();
const isHash32 = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
const isId = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < MAX_ID;
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

function checkState(state: StateView, tick: number) {
  expect(keysOf(state)).toEqual(sorted(STATE_VIEW_KEYS.filter((k) => k !== 'game' || 'game' in state)));
  expect(state.tick).toBe(tick);
  expect(STAGES).toContain(state.active_scale);
  expect(isHash32(state.root)).toBe(true);
  expect(typeof state.executor).toBe('string');
  expect(state.gates).toHaveLength(5);
  ['The Door', 'The Letter Slot', 'The Clearinghouse', 'Statutory Law', 'Recursive STARKs'].forEach((name, i) => expect(state.gates[i].startsWith(name), state.gates[i]).toBe(true));
  expect(keysOf(state.totals)).toEqual(sorted(TOTALS_KEYS));
  expect(state.last_report).not.toBeNull();
  expect(keysOf(state.last_report!)).toEqual(sorted(TICK_REPORT_KEYS));
  expect(isHash32(state.last_report!.root)).toBe(true);
  expect(state.root_history.length).toBeLessThanOrEqual(16);
  expect(state.root_history[0][0]).toBe(tick); // newest first
  for (const [t, h] of state.root_history) { expect(Number.isInteger(t)).toBe(true); expect(h).toMatch(/^[0-9a-f]{8}$/); }
  for (let i = 1; i < state.nodes.length; i++) expect(state.nodes[i].id).toBeGreaterThan(state.nodes[i - 1].id); // ascending id
  const ids = new Set(state.nodes.map((n) => n.id));
  for (const n of state.nodes) {
    expect(keysOf(n)).toEqual(sorted(NODE_VIEW_KEYS.filter((k) => k !== 'pocket_left' || 'pocket_left' in n)));
    expect(isId(n.id)).toBe(true);
    expect(typeof n.name).toBe('string');
    expect(STAGES).toContain(n.stage);
    expect(STAGES).toContain(n.gate);
    expect(n.parent === null || (isId(n.parent) && ids.has(n.parent))).toBe(true);
    expect(Number.isInteger(n.children)).toBe(true);
    expect(NODE_STATUSES).toContain(n.status);
    for (const k of ['compute', 'compute_allocated', 'compute_burned', 'joules_burned', 'compute_reclaimed', 'liquidity_belief', 'liquidity_truth', 'confidence', 'fog', 'burned_this_tick'] as const) expect(isNum(n[k])).toBe(true);
    expect(n.confidence).toBeGreaterThanOrEqual(0.05); expect(n.confidence).toBeLessThanOrEqual(1);
    expect(Math.abs(n.fog - Math.min(1, Math.max(0, 1 - n.confidence)))).toBeLessThan(1e-9);
    for (const k of ['generation', 'idle_ticks', 'calibrations', 'tasks_total', 'tasks_done', 'held', 'papers'] as const) expect(Number.isInteger(n[k])).toBe(true);
    expect(n.current_task === null || typeof n.current_task === 'string').toBe(true);
    expect(isHash32(n.oak_root)).toBe(true);
    expect(Array.isArray(n.receipts)).toBe(true);
    for (const r of n.receipts) expect(typeof r).toBe('string');
    if (n.packed !== null) {
      expect(keysOf(n.packed)).toEqual(sorted(PACKED_KEYS));
      for (const c of n.packed.active_children) expect(ids.has(c)).toBe(true);
    }
    if (n.note !== null) {
      expect(keysOf(n.note)).toEqual(sorted(NOTE_KEYS));
      expect(HALT_KINDS).toContain(n.note.reason.kind);
    }
  }
  for (const h of state.held) {
    expect(keysOf(h)).toEqual(sorted(HELD_VIEW_KEYS));
    expect(isId(h.envelope)).toBe(true);
    expect(ids.has(h.node)).toBe(true);
    expect(HELD_REASONS).toContain(h.reason);
    expect(h.reason === 'awaiting_finality').toBe(h.gate === 'World');
  }
}

function checkEvents(events: EngineEvent[], tick: number) {
  expect(events.length).toBeGreaterThan(0);
  for (const e of events) {
    expect(EVENT_TYPE_SET.has(e.type)).toBe(true);
    expect(keysOf(e)).toEqual(sorted(['type', ...EVENT_KEYS[e.type]]));
    expect(e.tick).toBeLessThanOrEqual(tick);
    if ('node' in e) expect(isId(e.node)).toBe(true);
    if ('envelope' in e) expect(isId(e.envelope)).toBe(true);
    if ('gate' in e) expect(STAGES).toContain(e.gate);
    if (e.type === 'TICK_COMMITTED') { expect(isHash32(e.root)).toBe(true); expect(STAGES).toContain(e.active_scale); }
    if (e.type === 'HALTED') { expect(keysOf(e.note)).toEqual(sorted(NOTE_KEYS)); expect(HALT_KINDS).toContain(e.note.reason.kind); }
    if (e.type === 'GLOBAL_STATE_CONFIRMED') expect(isHash32(e.root)).toBe(true);
  }
  expect(events[events.length - 1].type).toBe('TICK_COMMITTED'); // always last
  expect(events.filter((e) => e.type === 'TICK_COMMITTED')).toHaveLength(1);
}

describe(`contract-wasm (${wasmPath()})`, () => {
  test('the cdylib has no imports and the expected exports', () => {
    expect(WebAssembly.Module.imports(mod)).toEqual([]);
    const names = WebAssembly.Module.exports(mod).map((e) => e.name);
    for (const n of ['memory', 'engine_new', 'engine_tick', 'engine_authorize', 'engine_reject', 'engine_top_up', 'engine_zoom', 'engine_set_truth_price', 'engine_state', 'engine_events', 'engine_out_ptr', 'engine_version']) expect(names).toContain(n);
    expect(freshEngine(mod).version()).toMatch(/^context-engine \d+\.\d+\.\d+ \(wasm32, sequential executor\)$/);
  });

  const expectedNodes: Record<number, number> = { 1: 2, 2: 8, 3: 9, 5: 9 };
  for (const scenario of [1, 2, 3, 5] as const) {
    test(`scenario ${scenario}: ten ticks, every key and every tag`, () => {
      const e = freshEngine(mod);
      e.x.engine_new(scenario, 7n, 400, 3, 1);
      const s0 = e.state();
      expect(s0.tick).toBe(0);
      expect(s0.nodes).toHaveLength(expectedNodes[scenario]);
      expect(s0.last_report).toBeNull();
      const seen = new Set<string>();
      for (let t = 1; t <= 10; t++) {
        expect(e.tick()).toBe(t);
        const state = e.state();
        const events = e.events(); // the one drain per tick
        checkState(state, t);
        checkEvents(events, t);
        for (const ev of events) seen.add(ev.type);
        if (scenario === 3 && t === 1) {
          expect(events.find((ev) => ev.type === 'NETTED')).toMatchObject({ clearinghouse: 'City', gross: 60, net: 20, envelopes: 12 });
        }
        if (scenario === 5 && t === 1) {
          expect(events.slice(0, 3).map((ev) => ev.type)).toEqual(['PACKED', 'PACKED', 'PACKED']); // tick-0 PACKED at the head of frame 1
          expect(events.slice(0, 3).every((ev) => ev.tick === 0)).toBe(true);
          expect(events.filter((ev) => ev.type === 'AWAITING_FINALITY')).toHaveLength(3);
          expect(state.nodes.filter((n) => n.packed !== null)).toHaveLength(3);
          expect(state.nodes.filter((n) => n.status === 'packed')).toHaveLength(6);
        }
        expect(e.events()).toEqual([]); // a second drain in the same tick is empty: the worker drains exactly once
      }
      expect(seen.has('TICK_COMMITTED')).toBe(true);
      expect(seen.has('BURN')).toBe(true);
    });
  }

  test('scenario 1: the Door holds an envelope at tick 1; authorize answers 1 then the next tick APPROVES; an unknown envelope answers 0', () => {
    const e = freshEngine(mod);
    e.x.engine_new(1, 7n, 800, 15, 1);
    e.tick(); e.events();
    const held = e.state().held;
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ description: 'send the finished draft for doc_synthesis_01', cost: 10, gate: 'House', reason: 'awaiting_human_signature', created_tick: 1 });
    expect(e.x.engine_authorize(123n)).toBe(0);
    expect(e.x.engine_authorize(BigInt(held[0].envelope))).toBe(1);
    e.tick();
    const events = e.events();
    expect(events.map((ev) => ev.type)).toEqual(['APPROVED', 'DELIVERED', 'TICK_COMMITTED']);
    expect(e.state().held).toHaveLength(0);
  });

  test('scenario 1: top_up between ticks sits at the head of the next drain', () => {
    const e = freshEngine(mod);
    e.x.engine_new(1, 7n, 800, 15, 1);
    e.tick(); e.events();
    const house = e.state().nodes.find((n) => n.stage === 'House')!;
    e.x.engine_top_up(BigInt(house.id), 10);
    e.tick();
    const events = e.events();
    expect(events[0]).toMatchObject({ type: 'TOPPED_UP', node: house.id, credits: 10 });
  });

  test('scenario 4 (the forged country) emits ROLLED_BACK within 20 ticks, and SLASHED with it', () => {
    const e = freshEngine(mod);
    e.x.engine_new(4, 7n, 400, 3, 1);
    expect(e.state().nodes).toHaveLength(8);
    let rolledAt = -1, slashed = false;
    for (let t = 1; t <= 20 && rolledAt < 0; t++) {
      expect(e.tick()).toBe(t);
      const state = e.state();
      const events = e.events();
      checkState(state, t);
      checkEvents(events, t);
      for (const ev of events) {
        if (ev.type === 'ROLLED_BACK') { rolledAt = t; expect(ev.to_tick).toBeLessThan(t); expect(typeof ev.reason).toBe('string'); }
        if (ev.type === 'SLASHED') slashed = true;
      }
    }
    expect(rolledAt).toBeGreaterThan(0);
    expect(rolledAt).toBeLessThanOrEqual(20);
    expect(slashed).toBe(true);
  });

  test('every id the engine mints is a JSON-safe integer below 2^52', () => {
    for (const scenario of [1, 2, 3, 4, 5] as const) {
      const e = freshEngine(mod);
      e.x.engine_new(scenario, 7n, 400, 3, 1);
      e.tick();
      for (const n of e.state().nodes) expect(isId(n.id)).toBe(true);
      for (const ev of e.events()) for (const k of ['node', 'envelope', 'from', 'to', 'parent'] as const) if (k in ev) expect(isId((ev as unknown as Record<string, unknown>)[k])).toBe(true);
    }
  });
});
