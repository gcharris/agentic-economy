// Mirror of engine/src/events.rs: `#[serde(tag = "type", rename_all =
// "SCREAMING_SNAKE_CASE")]`; every variant carries `tick`. Reason strings are
// matched by PREFIX, never equality (see REJECTED_REASONS et al.). Order inside
// one tick: per node BURN×n, THOUGHT×n, then HALTED / PROPOSED /
// DROPPED_BY_COURIER; then NETTED, APPROVED, AWAITING_*, REJECTED,
// SLASHED+REJECTED, VOIDED, ROLLED_BACK; then SETTLED, DELIVERED, STATE_SYNC;
// then GLOBAL_STATE_CONFIRMED (every stark_period = 16 ticks); TICK_COMMITTED
// always last. TOPPED_UP, HALTED{closed}, PACKED, UNPACKED come from commands
// between ticks and sit at the head of the next drain.

import type { EnvelopeId, Hash32, ModelTier, NodeId, Note, PayloadKind, Seat, Stage } from './state.ts';

export type EngineEvent =
  | { type: 'THOUGHT'; tick: number; node: NodeId; seat: Seat; text: string }
  | { type: 'BURN'; tick: number; node: NodeId; seat: Seat; credits: number; joules: number; tier: ModelTier; cache_hit: boolean }
  | { type: 'PROPOSED'; tick: number; envelope: EnvelopeId; from: NodeId; to: NodeId; kind: PayloadKind; requested_liquidity: number; tax_paid: number }
  | { type: 'DROPPED_BY_COURIER'; tick: number; from: NodeId; to: NodeId; reason: string }
  | { type: 'AWAITING_HUMAN_SIGNATURE'; tick: number; node: NodeId; envelope: EnvelopeId; description: string; cost: number }
  | { type: 'AWAITING_FINALITY'; tick: number; envelope: EnvelopeId; until_tick: number }
  | { type: 'APPROVED'; tick: number; envelope: EnvelopeId; gate: Stage }
  | { type: 'REJECTED'; tick: number; envelope: EnvelopeId; gate: Stage; reason: string; sunk_compute: number }
  | { type: 'SLASHED'; tick: number; node: NodeId; amount: number; reason: string }
  | { type: 'SETTLED'; tick: number; envelope: EnvelopeId; from: NodeId; to: NodeId; amount: number }
  | { type: 'DELIVERED'; tick: number; envelope: EnvelopeId; to: NodeId }
  | { type: 'STATE_SYNC'; tick: number; node: NodeId; cost: number; confidence_before: number }
  | { type: 'HALTED'; tick: number; node: NodeId; note: Note }
  | { type: 'SEAT_FAILED'; tick: number; node: NodeId }
  | { type: 'VOIDED'; tick: number; envelope: EnvelopeId; reason: string }
  | { type: 'TOPPED_UP'; tick: number; node: NodeId; credits: number }
  | { type: 'PACKED'; tick: number; parent: NodeId; children: number; seed: number /* full u64, display only */ }
  | { type: 'UNPACKED'; tick: number; parent: NodeId; children: number; macro_ticks: number; burn_distributed: number }
  | { type: 'NETTED'; tick: number; clearinghouse: Stage; gross: number; net: number; envelopes: number }
  | { type: 'ROLLED_BACK'; tick: number; to_tick: number; reason: string; slashed: number }
  | { type: 'GLOBAL_STATE_CONFIRMED'; tick: number; root: Hash32; latency_ticks: number; partitioned: NodeId[] }
  | { type: 'TICK_COMMITTED'; tick: number; root: Hash32; active_scale: Stage; nodes_active: number; nodes_waiting: number; nodes_halted: number; nodes_packed: number; nodes_partitioned: number };

export type EventType = EngineEvent['type']; // exactly 22
export type EventOf<T extends EventType> = Extract<EngineEvent, { type: T }>;

/**
 * The 22 tags at runtime, in the engine's declaration order. The `satisfies`
 * clause fails `tsc` if a tag is misspelt; `_exhaustive` fails it if the union
 * grows without this tuple following (the wasm contract test then fails on the
 * wire side).
 */
export const EVENT_TYPES = [
  'THOUGHT', 'BURN', 'PROPOSED', 'DROPPED_BY_COURIER', 'AWAITING_HUMAN_SIGNATURE', 'AWAITING_FINALITY',
  'APPROVED', 'REJECTED', 'SLASHED', 'SETTLED', 'DELIVERED', 'STATE_SYNC', 'HALTED', 'SEAT_FAILED',
  'VOIDED', 'TOPPED_UP', 'PACKED', 'UNPACKED', 'NETTED', 'ROLLED_BACK', 'GLOBAL_STATE_CONFIRMED', 'TICK_COMMITTED',
] as const satisfies readonly EventType[];
type _Exhaustive = Exclude<EventType, (typeof EVENT_TYPES)[number]> extends never ? true : never;
const _exhaustive: _Exhaustive = true;
void _exhaustive;

export const EVENT_TYPE_SET: ReadonlySet<string> = new Set<string>(EVENT_TYPES);
export const isEventType = (s: string): s is EventType => EVENT_TYPE_SET.has(s);

/** The keys each variant carries besides `type`, for the wire test. */
export const EVENT_KEYS: { readonly [K in EventType]: readonly Exclude<keyof EventOf<K>, 'type'>[] } = {
  THOUGHT: ['tick', 'node', 'seat', 'text'],
  BURN: ['tick', 'node', 'seat', 'credits', 'joules', 'tier', 'cache_hit'],
  PROPOSED: ['tick', 'envelope', 'from', 'to', 'kind', 'requested_liquidity', 'tax_paid'],
  DROPPED_BY_COURIER: ['tick', 'from', 'to', 'reason'],
  AWAITING_HUMAN_SIGNATURE: ['tick', 'node', 'envelope', 'description', 'cost'],
  AWAITING_FINALITY: ['tick', 'envelope', 'until_tick'],
  APPROVED: ['tick', 'envelope', 'gate'],
  REJECTED: ['tick', 'envelope', 'gate', 'reason', 'sunk_compute'],
  SLASHED: ['tick', 'node', 'amount', 'reason'],
  SETTLED: ['tick', 'envelope', 'from', 'to', 'amount'],
  DELIVERED: ['tick', 'envelope', 'to'],
  STATE_SYNC: ['tick', 'node', 'cost', 'confidence_before'],
  HALTED: ['tick', 'node', 'note'],
  SEAT_FAILED: ['tick', 'node'],
  VOIDED: ['tick', 'envelope', 'reason'],
  TOPPED_UP: ['tick', 'node', 'credits'],
  PACKED: ['tick', 'parent', 'children', 'seed'],
  UNPACKED: ['tick', 'parent', 'children', 'macro_ticks', 'burn_distributed'],
  NETTED: ['tick', 'clearinghouse', 'gross', 'net', 'envelopes'],
  ROLLED_BACK: ['tick', 'to_tick', 'reason', 'slashed'],
  GLOBAL_STATE_CONFIRMED: ['tick', 'root', 'latency_ticks', 'partitioned'],
  TICK_COMMITTED: ['tick', 'root', 'active_scale', 'nodes_active', 'nodes_waiting', 'nodes_halted', 'nodes_packed', 'nodes_partitioned'],
};

/** Reason prefixes (matched with `startsWith`, never `===`). */
export const REJECTED_REASONS = [
  'hash mismatch:', 'lock failed:', 'unbacked', 'proof failed:', 'the person said no at the door',
  'cannot afford the send cost of', 'stale belief at commit:', 'injunction:', 'no such service:', 'target',
  'bad signature', 'payload hash does not match payload', 'initiator is halted or partitioned:',
  'netting batch void:', 'unbacked at commit after netting:',
] as const;
export const DROPPED_REASONS = ['unknown address:', 'cannot afford the crossing tax of'] as const;
export const SLASHED_REASONS = ['unbacked in netting:', 'unbacked spend under statute:', 'High Court: systemic failure'] as const;

export const reasonIs = (reason: string, prefix: string): boolean => reason.startsWith(prefix);
/** The Street's revert: `REJECTED.reason` beginning "hash mismatch:" (the courier snaps back). */
export const isHashMismatch = (reason: string): boolean => reason.startsWith('hash mismatch:');
