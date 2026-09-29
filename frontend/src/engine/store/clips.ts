// Clips (ARCHITECTURE Appendix A): every event becomes exactly one timed clip
// kind (or `none`), starting at the event's arrivedAt plus a same-tick
// stagger, scaled by the band's tick seconds. The feed line for each event is
// formatted here too, so the ui lane and the tests read one table. The pulse
// ring (16 entries) feeds uPulses / uPulseData for NETTED, ROLLED_BACK,
// GLOBAL_STATE_CONFIRMED and SLASHED.

import { fmtCost, fmtCr, fmtJ, fmtPhi, gateWord, haltReasonLine, hash8 } from '../contract/copy.ts';
import { isHashMismatch, type EngineEvent, type EventType } from '../contract/events.ts';
import type { EnvelopeId, NodeId } from '../contract/state.ts';
import type { Axial } from '../layout/hex.ts';

export type ClipKind =
  | 'bubble' | 'flare' | 'carry' | 'drop' | 'hold' | 'orbit' | 'seal' | 'burn' | 'snapback' | 'flash'
  | 'handshake' | 'slot' | 'sweep' | 'note' | 'tip' | 'strike' | 'coins' | 'fold' | 'unfold' | 'netted'
  | 'rewind' | 'heartbeat' | 'none';

export interface Clip {
  kind: ClipKind;
  ev: EngineEvent;
  tick: number;
  /** App seconds: arrivedAt + stagger. */
  t0: number;
  /** Seconds; Infinity while bound to state (hold, note); 0 for `none`. */
  duration: number;
  /** t0 + duration. */
  end: number;
  /** Same-tick stagger applied (seconds). */
  stagger: number;
  /** The node the clip belongs to (node / from / parent), or null. */
  node: NodeId | null;
  /** The destination node (to), when the event has one. */
  to: NodeId | null;
  envelope: EnvelopeId | null;
  /** SLASHED: the scorch that outlives the flash, in seconds (8 ticks). */
  tail?: number;
  /** STATE_SYNC: seconds per hex ring of cascade (0.04); the reducer writes the texels. */
  cascade?: number;
}

export interface ClipContext {
  tickSeconds: number;
  /** The city's ring radius (NETTED: 400 ms + 40 ms × radius). */
  radius: number;
}

/** Table row: the one clip kind per event type (REJECTED splits on the reason at runtime: `burn`, or `snapback` for "hash mismatch:"). */
export const CLIP_KIND: { readonly [K in EventType]: ClipKind } = {
  THOUGHT: 'bubble',
  BURN: 'flare',
  PROPOSED: 'carry',
  DROPPED_BY_COURIER: 'drop',
  AWAITING_HUMAN_SIGNATURE: 'hold',
  AWAITING_FINALITY: 'orbit',
  APPROVED: 'seal',
  REJECTED: 'burn',
  SLASHED: 'flash',
  SETTLED: 'handshake',
  DELIVERED: 'slot',
  STATE_SYNC: 'sweep',
  HALTED: 'note',
  SEAT_FAILED: 'tip',
  VOIDED: 'strike',
  TOPPED_UP: 'coins',
  PACKED: 'fold',
  UNPACKED: 'unfold',
  NETTED: 'netted',
  ROLLED_BACK: 'rewind',
  GLOBAL_STATE_CONFIRMED: 'heartbeat',
  TICK_COMMITTED: 'none',
};

export function clipKindFor(ev: EngineEvent): ClipKind {
  if (ev.type === 'REJECTED') return isHashMismatch(ev.reason) ? 'snapback' : 'burn';
  return CLIP_KIND[ev.type];
}

/** Duration in seconds for the clip of `ev` (Appendix A's column, tick-scaled where the table says so). */
export function clipDuration(ev: EngineEvent, ctx: ClipContext): number {
  switch (ev.type) {
    case 'THOUGHT': return 2.4;
    case 'BURN': return ctx.tickSeconds; // to the next tick
    case 'PROPOSED': return 0.9;
    case 'DROPPED_BY_COURIER': return 0.5;
    case 'AWAITING_HUMAN_SIGNATURE': return Infinity; // until decided (state)
    case 'AWAITING_FINALITY': return Math.max(0, ev.until_tick - ev.tick) * ctx.tickSeconds;
    case 'APPROVED': return 0.6;
    case 'REJECTED': return 0.7;
    case 'SLASHED': return 0.4; // + tail: 8 ticks of scorch
    case 'SETTLED': return 0.8;
    case 'DELIVERED': return 0.3;
    case 'STATE_SYNC': return 0.6; // + cascade
    case 'HALTED': return Infinity; // until note is null (state)
    case 'SEAT_FAILED': return 0.4;
    case 'VOIDED': return 0.5;
    case 'TOPPED_UP': return 0.6;
    case 'PACKED': return 0.6;
    case 'UNPACKED': return 0.6;
    case 'NETTED': return 0.4 + 0.04 * Math.max(0, ctx.radius);
    case 'ROLLED_BACK': return 0.9;
    case 'GLOBAL_STATE_CONFIRMED': return ev.latency_ticks * ctx.tickSeconds;
    case 'TICK_COMMITTED': return 0;
  }
}

/** The node a clip belongs to and the one it goes to. */
export function clipNodes(ev: EngineEvent): { node: NodeId | null; to: NodeId | null; envelope: EnvelopeId | null } {
  switch (ev.type) {
    case 'THOUGHT': case 'BURN': case 'STATE_SYNC': case 'HALTED': case 'SEAT_FAILED': case 'TOPPED_UP': case 'SLASHED':
      return { node: ev.node, to: null, envelope: null };
    case 'AWAITING_HUMAN_SIGNATURE': return { node: ev.node, to: null, envelope: ev.envelope };
    case 'PROPOSED': case 'SETTLED': return { node: ev.from, to: ev.to, envelope: 'envelope' in ev ? ev.envelope : null };
    case 'DROPPED_BY_COURIER': return { node: ev.from, to: ev.to, envelope: null };
    case 'DELIVERED': return { node: null, to: ev.to, envelope: ev.envelope };
    case 'PACKED': case 'UNPACKED': return { node: ev.parent, to: null, envelope: null };
    case 'AWAITING_FINALITY': case 'APPROVED': case 'REJECTED': case 'VOIDED': return { node: null, to: null, envelope: ev.envelope };
    case 'NETTED': case 'ROLLED_BACK': case 'GLOBAL_STATE_CONFIRMED': case 'TICK_COMMITTED': return { node: null, to: null, envelope: null };
  }
}

/** Seconds between same-type events of one tick (BURN×n read as a ripple, not a blink), capped at a quarter tick. */
export const STAGGER_STEP = 0.03;
export const STAGGER_CAP = 0.25;

export class ClipScheduler {
  readonly active: Clip[] = [];
  private tickKey = -1;
  private perType = new Map<EventType, number>();

  /** Build the clip for `ev` arriving at `arrivedAt` and keep it while it lasts. */
  schedule(ev: EngineEvent, arrivedAt: number, ctx: ClipContext): Clip {
    if (ev.tick !== this.tickKey) { this.tickKey = ev.tick; this.perType = new Map(); }
    const n = this.perType.get(ev.type) ?? 0;
    this.perType.set(ev.type, n + 1);
    const stagger = Math.min(n * STAGGER_STEP, STAGGER_CAP * ctx.tickSeconds);
    const kind = clipKindFor(ev);
    const duration = clipDuration(ev, ctx);
    const t0 = arrivedAt + stagger;
    const { node, to, envelope } = clipNodes(ev);
    const clip: Clip = { kind, ev, tick: ev.tick, t0, duration, end: t0 + duration, stagger, node, to, envelope };
    if (ev.type === 'SLASHED') clip.tail = 8 * ctx.tickSeconds;
    if (ev.type === 'STATE_SYNC') clip.cascade = 0.04;
    if (kind !== 'none') this.active.push(clip);
    return clip;
  }

  /** Drop clips whose end (or tail) has passed. */
  prune(now: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i];
      const last = c.end + (c.tail ?? 0);
      if (last <= now) this.active.splice(i, 1);
    }
  }

  /** The Door was decided (APPROVED / REJECTED or the envelope left `held`): end its hold. */
  endHold(envelope: EnvelopeId, now: number): void {
    for (const c of this.active) if (c.kind === 'hold' && c.envelope === envelope && c.duration === Infinity) { c.duration = Math.max(0, now - c.t0); c.end = now; }
  }

  /** The Note lifted (`node.note` back to null): end the note clip. */
  endNote(node: NodeId, now: number): void {
    for (const c of this.active) if (c.kind === 'note' && c.node === node && c.duration === Infinity) { c.duration = Math.max(0, now - c.t0); c.end = now; }
  }

  activeFor(node: NodeId): Clip[] { return this.active.filter((c) => c.node === node || c.to === node); }
  clear(): void { this.active.length = 0; this.tickKey = -1; this.perType.clear(); }
}

// ---------------------------------------------------------------------------
// The feed line (Appendix A). `nameOf` resolves ids to names from the frame.

export type NameOf = (id: NodeId) => string;

export function feedLine(ev: EngineEvent, nameOf: NameOf): string {
  const t = `t${ev.tick}`;
  switch (ev.type) {
    case 'THOUGHT': return `${t} · ${ev.seat}: ${ev.text}`;
    case 'BURN': return `${t} · ${ev.seat} burned ${fmtCr(ev.credits)} cr (${fmtJ(ev.joules)} J, ${ev.tier}${ev.cache_hit ? ', cache hit' : ''})`;
    case 'PROPOSED': return `${t} · proposed ${ev.kind} to ${nameOf(ev.to)} · tax ${fmtCost(ev.tax_paid)} cr`;
    case 'DROPPED_BY_COURIER': return `${t} · dropped by the courier: ${ev.reason}`;
    case 'AWAITING_HUMAN_SIGNATURE': return `${t} · the Porter is at the Door: ${ev.description} (${fmtCost(ev.cost)} cr)`;
    case 'AWAITING_FINALITY': return `${t} · held for finality until t${ev.until_tick}`;
    case 'APPROVED': return `${t} · approved at ${gateWord(ev.gate)}`;
    case 'REJECTED': return `${t} · rejected at ${gateWord(ev.gate)} · ${ev.reason} · ${fmtCost(ev.sunk_compute)} cr sunk`;
    case 'SLASHED': return `${t} · slashed ${fmtCr(ev.amount)} cr · ${ev.reason}`;
    case 'SETTLED': return `${t} · settled ${fmtCr(ev.amount)} between ${nameOf(ev.from)} and ${nameOf(ev.to)}`;
    case 'DELIVERED': return `${t} · delivered to ${nameOf(ev.to)}`;
    case 'STATE_SYNC': return `${t} · paid the oracle ${fmtCost(ev.cost)} cr · Φ ${fmtPhi(ev.confidence_before)} → 100%`;
    case 'HALTED': return `${t} · halted: ${haltReasonLine(ev.note.reason)}`;
    case 'SEAT_FAILED': return `${t} · a seat failed mid-draft; the table is untouched`;
    case 'VOIDED': return `${t} · voided by the court: ${ev.reason}`;
    case 'TOPPED_UP': return `${t} · topped up ${fmtCr(ev.credits)} cr`;
    case 'PACKED': return `${t} · ${ev.children} children packed into ${nameOf(ev.parent)}`;
    case 'UNPACKED': return `${t} · ${nameOf(ev.parent)} unpacked ${ev.children} children after ${ev.macro_ticks} macro-ticks`;
    case 'NETTED': return `${t} · netted ${ev.envelopes} envelopes · gross ${fmtCost(ev.gross)} → net ${fmtCost(ev.net)}`;
    case 'ROLLED_BACK': return `${t} · rolled back to t${ev.to_tick} · ${ev.reason} · ${ev.slashed} slashed`;
    case 'GLOBAL_STATE_CONFIRMED': return `${t} · STARK heartbeat · root ${hash8(ev.root)} · ${ev.latency_ticks} ticks`;
    case 'TICK_COMMITTED': return `${t} · block committed · ${ev.nodes_active} active, ${ev.nodes_waiting} waiting, ${ev.nodes_halted} halted, ${ev.nodes_packed} packed`;
  }
}

// ---------------------------------------------------------------------------
// The pulse ring: 16 entries → uPulses[16] (kind, t0, originQ, originR) and
// uPulseData[16] (NETTED: gross, net, envelopes, radius; ROLLED_BACK: to_tick;
// GLOBAL_STATE_CONFIRMED: latency_ticks; SLASHED: amount, tickCount).

export const PULSE_RING = 16;
export const PULSE_KIND = { none: 0, NETTED: 1, ROLLED_BACK: 2, GLOBAL_STATE_CONFIRMED: 3, SLASHED: 4 } as const;
export type PulseKind = (typeof PULSE_KIND)[keyof typeof PULSE_KIND];
export type PulseEventType = 'NETTED' | 'ROLLED_BACK' | 'GLOBAL_STATE_CONFIRMED' | 'SLASHED';
export const PULSE_EVENTS: ReadonlySet<EventType> = new Set<EventType>(['NETTED', 'ROLLED_BACK', 'GLOBAL_STATE_CONFIRMED', 'SLASHED']);

export interface Pulse { kind: PulseKind; t0: number; origin: Axial; data: [number, number, number, number] }

export class PulseRing {
  /** vec4 per entry: kind, t0, originQ, originR. */
  readonly uPulses = new Float32Array(PULSE_RING * 4);
  /** vec4 per entry: per-kind payload. */
  readonly uPulseData = new Float32Array(PULSE_RING * 4);
  readonly entries: (Pulse | null)[] = new Array<Pulse | null>(PULSE_RING).fill(null);
  private head = 0;
  /** Set when a push changed the arrays since the last `markClean()`; the renderer uploads only then. */
  dirty = false;

  push(p: Pulse): number {
    const i = this.head;
    this.head = (this.head + 1) % PULSE_RING;
    this.entries[i] = p;
    this.uPulses.set([p.kind, p.t0, p.origin.q, p.origin.r], i * 4);
    this.uPulseData.set(p.data, i * 4);
    this.dirty = true;
    return i;
  }

  /** Build the pulse for a pulse event at `arrivedAt` from `origin` (the node's cell, or 0,0). */
  static fromEvent(ev: EngineEvent, arrivedAt: number, origin: Axial, extra: { radius?: number; tickCount?: number } = {}): Pulse | null {
    switch (ev.type) {
      case 'NETTED': return { kind: PULSE_KIND.NETTED, t0: arrivedAt, origin, data: [ev.gross, ev.net, ev.envelopes, extra.radius ?? 0] };
      case 'ROLLED_BACK': return { kind: PULSE_KIND.ROLLED_BACK, t0: arrivedAt, origin, data: [ev.to_tick, ev.slashed, 0, 0] };
      case 'GLOBAL_STATE_CONFIRMED': return { kind: PULSE_KIND.GLOBAL_STATE_CONFIRMED, t0: arrivedAt, origin, data: [ev.latency_ticks, ev.partitioned.length, 0, 0] };
      case 'SLASHED': return { kind: PULSE_KIND.SLASHED, t0: arrivedAt, origin, data: [ev.amount, extra.tickCount ?? 8, 0, 0] };
      default: return null;
    }
  }

  markClean(): void { this.dirty = false; }
  clear(): void { this.uPulses.fill(0); this.uPulseData.fill(0); this.entries.fill(null); this.head = 0; this.dirty = true; }
}
