import { DataUtils } from 'three';
import { describe, expect, test } from 'vitest';
import { NODE_STATUSES, type NodeView } from '../../src/engine/contract/state.ts';
import { BurnWindow, fromHalfFloat, HELD_FLAG, packTruth, readTruth, SlotTable, STATUS_CODE, toHalfFloat, TRUTH_LENGTH } from '../../src/engine/store/slots.ts';
import { loadTrace } from '../helpers/assets.ts';

function node(partial: Partial<NodeView> & { id: number }): NodeView {
  return {
    name: `n${partial.id}`, stage: 'House', gate: 'House', parent: null, children: 0, status: 'active',
    compute: 400, compute_allocated: 800, compute_burned: 400, joules_burned: 1, compute_reclaimed: 0,
    liquidity_belief: 100, liquidity_truth: 100, confidence: 0.5, fog: 0.5, generation: 1, idle_ticks: 0, calibrations: 0,
    tasks_total: 1, tasks_done: 0, current_task: null, held: 0, packed: null, note: null, burned_this_tick: 0,
    oak_root: '0'.repeat(64), papers: 0, receipts: [], ...partial,
  };
}

describe('fp16', () => {
  test('toHalfFloat matches THREE.DataUtils.toHalfFloat bit for bit', () => {
    const samples = [0, -0, 1, -1, 0.05, 0.5636, 0.75, 0.9730122, 0.001, 65504, 70000, 1e-5, 6.1e-5, 3.14159, 1234.5, 9, 8, 12];
    for (let i = 0; i < 2000; i++) samples.push(i / 1999);
    for (const v of samples) expect(toHalfFloat(v)).toBe(DataUtils.toHalfFloat(v));
  });
  test('fromHalfFloat matches THREE.DataUtils.fromHalfFloat', () => {
    for (let h = 0; h < 0x7c00; h += 37) expect(fromHalfFloat(h)).toBeCloseTo(DataUtils.fromHalfFloat(h), 10);
    expect(fromHalfFloat(toHalfFloat(-2.5))).toBe(-2.5);
  });
});

describe('packTruth', () => {
  test('Φ round-trips within 1e-3 across [0.05, 1]; purse and heat too', () => {
    const slots = new SlotTable();
    const out = new Uint16Array(TRUTH_LENGTH);
    const nodes: NodeView[] = [];
    for (let i = 0; i <= 100; i++) nodes.push(node({ id: 1000 + i, confidence: 0.05 + (0.95 * i) / 100, compute: 8 * i, burned_this_tick: i / 2 }));
    packTruth(nodes, slots, out, 50);
    for (const n of nodes) {
      const t = readTruth(out, slots.slotOf(n.id));
      expect(Math.abs(t.phi - n.confidence)).toBeLessThan(1e-3);
      expect(Math.abs(t.purse - n.compute / 800)).toBeLessThan(1e-3);
      expect(Math.abs(t.heat - Math.min(1, n.burned_this_tick / 50))).toBeLessThan(1e-3);
    }
  });

  test('status codes are exact for every status, with and without the held flag', () => {
    const slots = new SlotTable();
    const out = new Uint16Array(TRUTH_LENGTH);
    const nodes: NodeView[] = [];
    NODE_STATUSES.forEach((status, i) => {
      nodes.push(node({ id: 1 + i, status, held: 0 }));
      nodes.push(node({ id: 100 + i, status, held: 2 }));
    });
    packTruth(nodes, slots, out, 1);
    NODE_STATUSES.forEach((status, i) => {
      const plain = readTruth(out, slots.slotOf(1 + i));
      const held = readTruth(out, slots.slotOf(100 + i));
      expect(plain.status).toBe(STATUS_CODE[status]);
      expect(plain.held).toBe(false);
      expect(held.status).toBe(STATUS_CODE[status]);
      expect(held.held).toBe(true);
      expect(fromHalfFloat(out[slots.slotOf(100 + i) * 4 + 3])).toBe(STATUS_CODE[status] + HELD_FLAG);
    });
    expect(STATUS_CODE).toEqual({ active: 0, waiting_at_door: 1, halted: 2, packed: 3, partitioned: 4 });
  });

  test('-0 burned_this_tick is normalised: heat 0, never NaN or a negative zero texel', () => {
    const slots = new SlotTable();
    const out = new Uint16Array(TRUTH_LENGTH);
    packTruth([node({ id: 5, burned_this_tick: -0 }), node({ id: 6, burned_this_tick: 3, compute_allocated: 0 })], slots, out, 0);
    const a = readTruth(out, slots.slotOf(5));
    expect(Object.is(a.heat, 0)).toBe(true);
    expect(out[slots.slotOf(5) * 4 + 2]).toBe(0); // +0 bits, not 0x8000
    const b = readTruth(out, slots.slotOf(6));
    expect(b.purse).toBe(0); // allocated 0 → purse 0
    expect(Number.isNaN(b.heat)).toBe(false);
    expect(b.heat).toBe(1); // burnRef 0 falls back to 1: 3 / 1 clamped
  });

  test('packed children are written from the parent profile: Φ = mean_confidence, purse = parent purse, status 3', () => {
    const slots = new SlotTable();
    const out = new Uint16Array(TRUTH_LENGTH);
    const parent = node({
      id: 1, stage: 'Street', compute: 300, compute_allocated: 400, confidence: 0.9,
      packed: { avg_compute_burn_rate: 1, liquidity_velocity: 0, epistemic_variance: 0.2, mean_confidence: 0.61, stochastic_seed: 1, packed_at_tick: 1, active_children: [2], child_count: 2, total_compute_at_pack: 0, macro_ticks: 0, pending_burn: 0, pending_liquidity_delta: 0, pending_decay_ticks: 0 },
    });
    const child = node({ id: 2, parent: 1, status: 'packed', confidence: 0.99, compute: 10, compute_allocated: 800, burned_this_tick: 40 });
    packTruth([parent, child], slots, out, 40);
    const c = readTruth(out, slots.slotOf(2));
    expect(Math.abs(c.phi - 0.61)).toBeLessThan(1e-3);
    expect(Math.abs(c.purse - 0.75)).toBeLessThan(1e-3);
    expect(c.heat).toBe(0);
    expect(c.status).toBe(3);
  });

  test('the recorded house at tick 4: waiting at the door with one held envelope → code 9', () => {
    const trace = loadTrace();
    const slots = new SlotTable();
    const out = new Uint16Array(TRUTH_LENGTH);
    const nodes = trace.house[3].state.nodes;
    packTruth(nodes, slots, out, 1);
    const house = nodes.find((n) => n.stage === 'House')!;
    const t = readTruth(out, slots.slotOf(house.id));
    expect(t.status).toBe(1);
    expect(t.held).toBe(true);
    expect(Math.abs(t.phi - 0.8928)).toBeLessThan(1e-3);
    expect(Math.abs(t.purse - 754.95 / 800)).toBeLessThan(1e-3);
  });
});

describe('BurnWindow (burnRef = p90 of burned_this_tick over the last 8 ticks)', () => {
  test('keeps eight ticks, ignores zeros and -0, and never returns 0', () => {
    const w = new BurnWindow();
    expect(w.ref).toBe(1);
    expect(w.push([{ burned_this_tick: -0 }, { burned_this_tick: 0 }])).toBe(1);
    for (let t = 1; t <= 8; t++) w.push(Array.from({ length: 10 }, (_, i) => ({ burned_this_tick: t * 10 + i })));
    // 80 values 10..89 → p90 ≈ 81
    expect(w.ref).toBeGreaterThanOrEqual(80);
    expect(w.ref).toBeLessThanOrEqual(89);
    for (let t = 0; t < 8; t++) w.push([{ burned_this_tick: 1 }]);
    expect(w.ref).toBe(1); // the old ticks rolled off
  });
});
