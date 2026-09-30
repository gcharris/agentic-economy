// Mirror of engine/src/tick.rs (StateView, NodeView, HeldView, Totals,
// TickReport), lod.rs (PackedStatisticalState), receipt.rs (Note, HaltReason),
// node.rs (Stage, NodeStatus). Serde rules that decide the wire shape:
// `Stage` is `#[repr(u8)]` with no rename_all, so it serialises as the variant
// STRING ("House" … "World"), never the number; `NodeStatus` is snake_case;
// `HaltReason` is `tag = "kind"`, snake_case; `Hash32` is 64 lowercase hex;
// ids are JSON numbers below 2^52; `Option<T>` is `null` or `T`;
// `(u64, String)` is a two-element array. Verified against trace.json and the
// wasm build in tests/unit/contract-wasm.test.ts.

import type { EnvelopeId, NodeId } from './ids.ts';
export type { EnvelopeId, NodeId } from './ids.ts';

export type Stage = 'House' | 'Street' | 'City' | 'Country' | 'World';
export type NodeStatus = 'active' | 'waiting_at_door' | 'halted' | 'packed' | 'partitioned';
export type Hash32 = string; // 64 lowercase hex
export type HashShort = string; // first 8 hex, only in root_history
export type Seat = 'Scout' | 'Scribble' | 'Inspector' | 'Penny' | 'Porter' | 'engine' | (string & {});
export type ModelTier = 'fast_quantized' | 'balanced_staff' | 'frontier_deep';
export type PayloadKind = 'liquidity_transfer' | 'dispatch' | 'hire_service' | 'state_sync' | 'close';
export type HeldReason = 'awaiting_human_signature' | 'awaiting_finality';
export type Executor = 'sequential' | 'tokio-multi-thread' | (string & {});

export type HaltReason =
  | { kind: 'runway_exhausted'; shortfall: number }
  | { kind: 'closed' }
  | { kind: 'slashed'; amount: number }
  | { kind: 'partitioned' }
  | { kind: 'week_over' }; // doc 06: Friday's last tick (EngineConfig::week_ticks)

/** Friday's numbers for one house (doc 06 §3): the essay's own currency, never compared by the engine. */
export interface WeekNote {
  pieces_done: number;
  pieces_total: number;
  compute_burned: number;
  purse_left: number;
  liquidity_left: number;
  swaps_settled: number;
  swaps_reverted: number;
  oracle_queries: number;
  top_ups: number;
  top_up_credits: number;
}

export interface Note {
  tick: number;
  node: NodeId;
  node_name: string;
  doing: string; // "lookup (Scout, 280 tok on fast_quantized)"
  compute_burned_total: number;
  compute_remaining: number;
  joules_burned_total: number;
  papers_on_table: number;
  reason: HaltReason;
  saved_state: string; // "oak_table@7e70f463"
  week: WeekNote | null; // on the Note a house leaves when the week ends; null otherwise
}

export interface PackedStatisticalState {
  avg_compute_burn_rate: number;
  liquidity_velocity: number;
  epistemic_variance: number;
  mean_confidence: number;
  stochastic_seed: number; // full u64: may exceed 2^53; display only, never round-trip
  packed_at_tick: number;
  active_children: NodeId[];
  child_count: number;
  total_compute_at_pack: number;
  macro_ticks: number;
  pending_burn: number;
  pending_liquidity_delta: number;
  pending_decay_ticks: number;
}

export interface NodeView {
  id: NodeId;
  name: string;
  stage: Stage;
  gate: Stage; // max(node's own gate, state.active_scale)
  parent: NodeId | null;
  children: number; // a COUNT; edges come from `parent`
  status: NodeStatus;
  compute: number;
  compute_allocated: number;
  compute_burned: number;
  joules_burned: number;
  compute_reclaimed: number;
  liquidity_belief: number;
  liquidity_truth: number;
  confidence: number; // Φ ∈ [0.05, 1]
  fog: number; // clamp(1 − Φ, 0, 1)
  generation: number;
  idle_ticks: number;
  calibrations: number;
  tasks_total: number;
  tasks_done: number;
  current_task: string | null;
  held: number; // envelopes held at this node's gate
  packed: PackedStatisticalState | null; // on the PARENT of folded children
  note: Note | null;
  burned_this_tick: number; // may arrive as -0: normalise with (+x || 0)
  oak_root: Hash32;
  papers: number;
  oracle_price: number | null; // the oracle's last answer to this house: the courier's truth price (doc 06 §5)
  pocket_left?: number;
  porter_back_tick?: number;
  queued_drafts?: number; // game only: finite 200-cr pocket
  house_number?: number | null; // one-based --names order; absent in older recorded traces
  oracle_tick: number | null;
  receipts: string[]; // newest first; ≤ 6 live, 3 in the trace
}

export interface HeldView {
  envelope: EnvelopeId;
  node: NodeId;
  node_name: string;
  description: string; // "send the finished draft for doc_synthesis_01"
  cost: number; // the send fee
  gate: Stage; // 'House' once the person was asked, whatever the camera does
  reason: HeldReason; // 'awaiting_finality' iff gate === 'World'
  created_tick: number;
  kind: PayloadKind; // the phone composes the send and the hire for one draft into one card (doc 06 §8.6)
  target: NodeId;
  target_name: string;
  task_id: string | null;
  believed_price: number | null; // a hire's price as the house believes it
}

export interface Totals {
  compute_burned: number;
  tax_paid: number;
  settled: number;
  slashed: number;
  approved: number;
  rejected: number;
  waiting: number;
  halted: number;
}

export interface TickReport {
  tick: number;
  drafted: number;
  compute_burned: number;
  tax_paid: number;
  envelopes_minted: number;
  dropped_by_courier: number;
  approved: number;
  rejected: number;
  held: number;
  slashed: number;
  voided: number;
  settled_liquidity: number;
  halted: number;
  seat_failures: number;
  synced: number;
  root: Hash32;
  global_confirmed: boolean;
  rolled_back: boolean;
  packed_groups: number;
}

export interface StateView {
  game?: { week_ticks: number; oracle_cost: number; retry_drafts: boolean; send_ticks: number };
  tick: number;
  active_scale: Stage;
  root: Hash32;
  executor: Executor;
  nodes: NodeView[]; // ascending id (BTreeMap), NOT creation order
  held: HeldView[];
  mempool: number;
  totals: Totals;
  gates: string[]; // 5 strings, fixed order: Door, Letter Slot, Clearinghouse, Statutory Law, Recursive STARKs
  last_report: TickReport | null; // null before the first tick
  root_history: [tick: number, root: HashShort][]; // newest first, ≤ 16
}

// ---------------------------------------------------------------------------
// Runtime mirrors of the interfaces above, for the wasm contract test. Each is
// typed so that adding or removing a key in the interface without touching the
// tuple fails `tsc` (the `Exhaustive` check), and the test fails when the wire
// drifts from the tuple.

type Exhaustive<T, K extends readonly (keyof T)[]> = Exclude<keyof T, K[number]> extends never
  ? K[number] extends keyof T
    ? K
    : never
  : never;

export const STAGES = ['House', 'Street', 'City', 'Country', 'World'] as const satisfies readonly Stage[];
export const NODE_STATUSES = ['active', 'waiting_at_door', 'halted', 'packed', 'partitioned'] as const satisfies readonly NodeStatus[];
export const HELD_REASONS = ['awaiting_human_signature', 'awaiting_finality'] as const satisfies readonly HeldReason[];
export const HALT_KINDS = ['runway_exhausted', 'closed', 'slashed', 'partitioned', 'week_over'] as const satisfies readonly HaltReason['kind'][];

const nodeViewKeys = [
  'id', 'name', 'stage', 'gate', 'parent', 'children', 'status',
  'compute', 'compute_allocated', 'compute_burned', 'joules_burned', 'compute_reclaimed',
  'liquidity_belief', 'liquidity_truth', 'confidence', 'fog',
  'generation', 'idle_ticks', 'calibrations', 'tasks_total', 'tasks_done', 'current_task',
  'held', 'packed', 'note', 'burned_this_tick', 'oak_root', 'papers', 'oracle_price', 'oracle_tick', 'house_number', 'pocket_left', 'porter_back_tick', 'queued_drafts', 'receipts',
] as const;
export const NODE_VIEW_KEYS: Exhaustive<NodeView, typeof nodeViewKeys> = nodeViewKeys;

const stateViewKeys = [
  'tick', 'active_scale', 'root', 'executor', 'nodes', 'held', 'mempool', 'totals', 'gates', 'last_report', 'root_history', 'game',
] as const;
export const STATE_VIEW_KEYS: Exhaustive<StateView, typeof stateViewKeys> = stateViewKeys;

const heldViewKeys = ['envelope', 'node', 'node_name', 'description', 'cost', 'gate', 'reason', 'created_tick', 'kind', 'target', 'target_name', 'task_id', 'believed_price'] as const;
export const HELD_VIEW_KEYS: Exhaustive<HeldView, typeof heldViewKeys> = heldViewKeys;

const totalsKeys = ['compute_burned', 'tax_paid', 'settled', 'slashed', 'approved', 'rejected', 'waiting', 'halted'] as const;
export const TOTALS_KEYS: Exhaustive<Totals, typeof totalsKeys> = totalsKeys;

const tickReportKeys = [
  'tick', 'drafted', 'compute_burned', 'tax_paid', 'envelopes_minted', 'dropped_by_courier', 'approved', 'rejected', 'held',
  'slashed', 'voided', 'settled_liquidity', 'halted', 'seat_failures', 'synced', 'root', 'global_confirmed', 'rolled_back', 'packed_groups',
] as const;
export const TICK_REPORT_KEYS: Exhaustive<TickReport, typeof tickReportKeys> = tickReportKeys;

const packedKeys = [
  'avg_compute_burn_rate', 'liquidity_velocity', 'epistemic_variance', 'mean_confidence', 'stochastic_seed', 'packed_at_tick',
  'active_children', 'child_count', 'total_compute_at_pack', 'macro_ticks', 'pending_burn', 'pending_liquidity_delta', 'pending_decay_ticks',
] as const;
export const PACKED_KEYS: Exhaustive<PackedStatisticalState, typeof packedKeys> = packedKeys;

const noteKeys = [
  'tick', 'node', 'node_name', 'doing', 'compute_burned_total', 'compute_remaining', 'joules_burned_total', 'papers_on_table', 'reason', 'saved_state', 'week',
] as const;
export const NOTE_KEYS: Exhaustive<Note, typeof noteKeys> = noteKeys;

/** `burned_this_tick` arrives as `-0.0` for seats that burn nothing. */
export const normaliseBurn = (x: number): number => +x || 0;
