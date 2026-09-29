import { describe, expect, test } from 'vitest';
import { EVENT_TYPES, type EngineEvent, type EventType } from '../../src/engine/contract/events.ts';
import {
  CLIP_KIND, clipDuration, clipKindFor, ClipScheduler, feedLine, PULSE_KIND, PULSE_RING, PulseRing, STAGGER_CAP, STAGGER_STEP, type ClipKind,
} from '../../src/engine/store/clips.ts';
import { loadTrace } from '../helpers/assets.ts';

const H = 3781345924436676, S = 3155115984088982, E = 3930624385311261;
const root = 'a'.repeat(64);
const note = { tick: 9, node: H, node_name: 'The House', doing: 'lookup (Scout, 280 tok on fast_quantized)', compute_burned_total: 283.8, compute_remaining: 16.2, joules_burned_total: 42.87, papers_on_table: 12, reason: { kind: 'runway_exhausted' as const, shortfall: 11.8 }, saved_state: 'oak_table@7e70f463' };

/** One sample event per type. */
const SAMPLE: { [K in EventType]: Extract<EngineEvent, { type: K }> } = {
  THOUGHT: { type: 'THOUGHT', tick: 1, node: H, seat: 'Scout', text: 'looking it up' },
  BURN: { type: 'BURN', tick: 1, node: H, seat: 'Scribble', credits: 9.8, joules: 0.78, tier: 'balanced_staff', cache_hit: true },
  PROPOSED: { type: 'PROPOSED', tick: 1, envelope: E, from: H, to: S, kind: 'dispatch', requested_liquidity: 0, tax_paid: 2.5 },
  DROPPED_BY_COURIER: { type: 'DROPPED_BY_COURIER', tick: 1, from: H, to: S, reason: 'unknown address: nowhere' },
  AWAITING_HUMAN_SIGNATURE: { type: 'AWAITING_HUMAN_SIGNATURE', tick: 1, node: H, envelope: E, description: 'send the finished draft for doc_synthesis_01', cost: 10 },
  AWAITING_FINALITY: { type: 'AWAITING_FINALITY', tick: 1, envelope: E, until_tick: 9 },
  APPROVED: { type: 'APPROVED', tick: 5, envelope: E, gate: 'House' },
  REJECTED: { type: 'REJECTED', tick: 7, envelope: E, gate: 'Street', reason: 'hash mismatch: believed courier at 10.00, truth differs (epistemic drift)', sunk_compute: 0.5 },
  SLASHED: { type: 'SLASHED', tick: 2, node: H, amount: 200, reason: 'unbacked in netting: forged' },
  SETTLED: { type: 'SETTLED', tick: 1, envelope: E, from: H, to: S, amount: 10 },
  DELIVERED: { type: 'DELIVERED', tick: 5, envelope: E, to: S },
  STATE_SYNC: { type: 'STATE_SYNC', tick: 11, node: H, cost: 15, confidence_before: 0.7323945 },
  HALTED: { type: 'HALTED', tick: 9, node: H, note },
  SEAT_FAILED: { type: 'SEAT_FAILED', tick: 3, node: H },
  VOIDED: { type: 'VOIDED', tick: 3, envelope: E, reason: 'injunction: the court said so' },
  TOPPED_UP: { type: 'TOPPED_UP', tick: 10, node: H, credits: 100 },
  PACKED: { type: 'PACKED', tick: 0, parent: S, children: 6, seed: 12345 },
  UNPACKED: { type: 'UNPACKED', tick: 4, parent: S, children: 6, macro_ticks: 3, burn_distributed: 12 },
  NETTED: { type: 'NETTED', tick: 1, clearinghouse: 'City', gross: 60, net: 20, envelopes: 12 },
  ROLLED_BACK: { type: 'ROLLED_BACK', tick: 2, to_tick: 1, reason: 'High Court: systemic failure', slashed: 5 },
  GLOBAL_STATE_CONFIRMED: { type: 'GLOBAL_STATE_CONFIRMED', tick: 16, root, latency_ticks: 32, partitioned: [] },
  TICK_COMMITTED: { type: 'TICK_COMMITTED', tick: 1, root, active_scale: 'House', nodes_active: 1, nodes_waiting: 1, nodes_halted: 0, nodes_packed: 0, nodes_partitioned: 0 },
};
const names: Record<number, string> = { [H]: 'The House', [S]: 'Elm Street' };
const nameOf = (id: number) => names[id] ?? `node ${id}`;
const ctx = { tickSeconds: 1.2, radius: 2 };

describe('the clip table (Appendix A)', () => {
  test('EventType has exactly 22 members and the sample covers each once', () => {
    expect(EVENT_TYPES).toHaveLength(22);
    expect(new Set(EVENT_TYPES).size).toBe(22);
    expect(Object.keys(SAMPLE).sort()).toEqual([...EVENT_TYPES].sort());
  });

  test('each of the 22 event types maps to exactly one clip kind or none', () => {
    const kinds: ClipKind[] = [];
    for (const t of EVENT_TYPES) {
      const kind = clipKindFor(SAMPLE[t]);
      expect(typeof kind).toBe('string');
      expect(CLIP_KIND[t]).toBeDefined();
      if (t !== 'REJECTED') expect(kind).toBe(CLIP_KIND[t]);
      kinds.push(kind);
    }
    expect(kinds.filter((k) => k === 'none')).toEqual(['none']); // only TICK_COMMITTED
    expect(clipKindFor(SAMPLE.TICK_COMMITTED)).toBe('none');
    expect(Object.keys(CLIP_KIND)).toHaveLength(22);
  });

  test('REJECTED splits on the reason prefix: hash mismatch → snapback, anything else → burn', () => {
    expect(clipKindFor(SAMPLE.REJECTED)).toBe('snapback');
    expect(clipKindFor({ ...SAMPLE.REJECTED, reason: 'the person said no at the door' })).toBe('burn');
    expect(clipKindFor({ ...SAMPLE.REJECTED, reason: 'hash mismatch' })).toBe('burn'); // the prefix carries the colon
  });

  test('durations follow the table and scale by tick seconds where it says so', () => {
    expect(clipDuration(SAMPLE.THOUGHT, ctx)).toBe(2.4);
    expect(clipDuration(SAMPLE.BURN, ctx)).toBe(1.2);
    expect(clipDuration(SAMPLE.BURN, { ...ctx, tickSeconds: 0.4 })).toBe(0.4);
    expect(clipDuration(SAMPLE.AWAITING_HUMAN_SIGNATURE, ctx)).toBe(Infinity);
    expect(clipDuration(SAMPLE.HALTED, ctx)).toBe(Infinity);
    expect(clipDuration(SAMPLE.AWAITING_FINALITY, ctx)).toBeCloseTo(8 * 1.2, 9);
    expect(clipDuration(SAMPLE.NETTED, ctx)).toBeCloseTo(0.48, 9);
    expect(clipDuration(SAMPLE.GLOBAL_STATE_CONFIRMED, ctx)).toBeCloseTo(38.4, 9);
    expect(clipDuration(SAMPLE.TICK_COMMITTED, ctx)).toBe(0);
    expect(clipDuration(SAMPLE.APPROVED, ctx)).toBe(0.6);
    expect(clipDuration(SAMPLE.REJECTED, ctx)).toBe(0.7);
  });

  test('the scheduler staggers same-type events within one tick and keeps live clips until they end', () => {
    const s = new ClipScheduler();
    const a = s.schedule(SAMPLE.BURN, 100, ctx);
    const b = s.schedule(SAMPLE.BURN, 100, ctx);
    const c = s.schedule(SAMPLE.THOUGHT, 100, ctx);
    expect(a.t0).toBe(100);
    expect(b.t0).toBeCloseTo(100 + STAGGER_STEP, 9);
    expect(c.t0).toBe(100); // a different type starts its own stagger
    for (let i = 0; i < 40; i++) s.schedule(SAMPLE.BURN, 100, ctx);
    const last = s.active[s.active.length - 1];
    expect(last.stagger).toBeLessThanOrEqual(STAGGER_CAP * ctx.tickSeconds);
    expect(s.schedule(SAMPLE.TICK_COMMITTED, 100, ctx).kind).toBe('none');
    expect(s.active.some((x) => x.kind === 'none')).toBe(false);
    s.prune(100 + 1.2 + 0.3 + 1); // BURNs (1.2 s) and the bubble (2.4 s)? bubble ends at 102.4
    expect(s.active.every((x) => x.kind === 'bubble')).toBe(true);
    s.prune(103);
    expect(s.active).toHaveLength(0);
  });

  test('holds and notes are state-bound until the reducer ends them', () => {
    const s = new ClipScheduler();
    const hold = s.schedule(SAMPLE.AWAITING_HUMAN_SIGNATURE, 10, ctx);
    const n = s.schedule(SAMPLE.HALTED, 10, ctx);
    expect(hold.end).toBe(Infinity);
    s.prune(1e9);
    expect(s.active).toHaveLength(2);
    s.endHold(E, 14);
    expect(hold.end).toBe(14);
    s.endNote(H, 15);
    expect(n.duration).toBe(5);
    s.prune(16);
    expect(s.active).toHaveLength(0);
  });

  test('SLASHED carries an 8-tick scorch tail; STATE_SYNC a 40 ms per ring cascade', () => {
    const s = new ClipScheduler();
    expect(s.schedule(SAMPLE.SLASHED, 0, ctx).tail).toBeCloseTo(9.6, 9);
    expect(s.schedule(SAMPLE.STATE_SYNC, 0, ctx).cascade).toBe(0.04);
  });
});

describe('the feed line', () => {
  test('formats every type with the design\'s number rules', () => {
    expect(feedLine(SAMPLE.APPROVED, nameOf)).toBe('t5 · approved at the Door');
    expect(feedLine(SAMPLE.APPROVED, nameOf)).toMatch(/t5 · approved at the Door/);
    expect(feedLine(SAMPLE.REJECTED, nameOf)).toBe('t7 · rejected at the Letter Slot · hash mismatch: believed courier at 10.00, truth differs (epistemic drift) · 0.5 cr sunk');
    expect(feedLine(SAMPLE.BURN, nameOf)).toBe('t1 · Scribble burned 9.80 cr (0.78 J, balanced_staff, cache hit)');
    expect(feedLine(SAMPLE.PROPOSED, nameOf)).toBe('t1 · proposed dispatch to Elm Street · tax 2.5 cr');
    expect(feedLine(SAMPLE.AWAITING_HUMAN_SIGNATURE, nameOf)).toBe('t1 · the Porter is at the Door: send the finished draft for doc_synthesis_01 (10.0 cr)');
    expect(feedLine(SAMPLE.STATE_SYNC, nameOf)).toBe('t11 · paid the oracle 15.0 cr · Φ 73.2% → 100%');
    expect(feedLine(SAMPLE.HALTED, nameOf)).toContain('t9 · halted: Runway exhausted. A person must top up or close.');
    expect(feedLine(SAMPLE.NETTED, nameOf)).toBe('t1 · netted 12 envelopes · gross 60.0 → net 20.0');
    expect(feedLine(SAMPLE.GLOBAL_STATE_CONFIRMED, nameOf)).toBe('t16 · STARK heartbeat · root aaaaaaaa · 32 ticks');
    expect(feedLine(SAMPLE.TICK_COMMITTED, nameOf)).toBe('t1 · block committed · 1 active, 1 waiting, 0 halted, 0 packed');
    expect(feedLine(SAMPLE.PACKED, nameOf)).toBe('t0 · 6 children packed into Elm Street');
    expect(feedLine(SAMPLE.SETTLED, nameOf)).toBe('t1 · settled 10.00 between The House and Elm Street');
    expect(feedLine(SAMPLE.ROLLED_BACK, nameOf)).toBe('t2 · rolled back to t1 · High Court: systemic failure · 5 slashed');
    for (const t of EVENT_TYPES) expect(feedLine(SAMPLE[t], nameOf)).toMatch(/^t\d+ · /);
  });

  test('no feed line of the recorded runs carries a forbidden word', () => {
    const trace = loadTrace();
    const re = /\b(score|rank|reputation|leaderboard|rating)\b/i;
    for (const run of [trace.house, trace.house_hidden_cost, trace.house_visible_cost, trace.street]) {
      for (const f of run) for (const ev of f.events) expect(feedLine(ev, nameOf)).not.toMatch(re);
    }
  });
});

describe('the pulse ring', () => {
  test('16 entries, wraps around, and packs the uniform vec4s', () => {
    const ring = new PulseRing();
    expect(PULSE_RING).toBe(16);
    for (let i = 0; i < 18; i++) ring.push({ kind: PULSE_KIND.NETTED, t0: i, origin: { x: i, z: -i }, data: [60, 20, 12, 2] });
    expect(ring.entries.filter(Boolean)).toHaveLength(16);
    expect(ring.uPulses[0 * 4 + 1]).toBe(16); // slot 0 was overwritten by the 17th push
    expect(ring.uPulses[1 * 4 + 1]).toBe(17);
    expect(ring.uPulses[2 * 4 + 1]).toBe(2);
    expect([...ring.uPulseData.slice(8, 12)]).toEqual([60, 20, 12, 2]);
    expect(ring.dirty).toBe(true);
    ring.markClean();
    expect(ring.dirty).toBe(false);
  });

  test('fromEvent builds the four pulse kinds and nothing for the rest', () => {
    const o = { x: 0, z: 0 };
    expect(PulseRing.fromEvent(SAMPLE.NETTED, 1, o, { radius: 3 })).toEqual({ kind: 1, t0: 1, origin: o, data: [60, 20, 12, 3] });
    expect(PulseRing.fromEvent(SAMPLE.ROLLED_BACK, 1, o)?.kind).toBe(PULSE_KIND.ROLLED_BACK);
    expect(PulseRing.fromEvent(SAMPLE.GLOBAL_STATE_CONFIRMED, 1, o)?.data[0]).toBe(32);
    expect(PulseRing.fromEvent(SAMPLE.SLASHED, 1, o)?.data).toEqual([200, 8, 0, 0]);
    expect(PulseRing.fromEvent(SAMPLE.BURN, 1, o)).toBeNull();
  });
});
