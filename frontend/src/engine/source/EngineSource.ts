// The one interface every source implements (ARCHITECTURE §3): wasm in a
// Worker, SSE from `serve`, or a recorded trace. A Frame arrives once per
// engine tick; commands flow back one way and nothing is optimistic.

import type { EngineEvent } from '../contract/events.ts';
import type { EnvelopeId, NodeId, StateView } from '../contract/state.ts';

export interface Frame {
  tick: number; // == state.tick
  state: StateView;
  events: EngineEvent[]; // drained for this tick, in engine order; e.tick <= tick (tick-0 PACKED events sit at the head of frame 1)
  decisions: Decision[]; // commands applied between the previous frame and this one (trace: recorded; live: the app's own log)
  arrivedAt: number; // app clock seconds (performance.now()/1000) when accepted: the clip scheduler's t0
  seeked?: true; // TraceSource.seek(): apply DOM/truth, play no clips
  /** Wasm frames arrive with the truth already packed in the worker (§3.1); sse/trace frames are packed by the reducer. */
  packed?: PackedTruth;
}

export interface PackedTruth {
  slots: Float64Array; // NodeId per slot, in slot order (length = slots allocated)
  truth: Uint16Array; // RGBA16F per slot, 256 × 256 × 4
  burnRef: number;
}

export type Decision =
  | { tick: number; decision: 'approve' | 'reject'; envelope: EnvelopeId; description?: string }
  | { tick: number; decision: 'top_up'; node: NodeId; credits: number }
  | { tick: number; decision: 'zoom'; stage: 1 | 2 | 3 | 4 | 5 }
  | { tick: number; decision: 'truth_changed'; description: string }; // record_trace.mjs writes this in the street run

export type ScenarioName = 'house' | 'street' | 'city' | 'country' | 'world';
export const SCENARIO_CODE: Record<ScenarioName, 1 | 2 | 3 | 4 | 5> = { house: 1, street: 2, city: 3, country: 4, world: 5 };
export const SCENARIO_NAME: Record<1 | 2 | 3 | 4 | 5, ScenarioName> = { 1: 'house', 2: 'street', 3: 'city', 4: 'country', 5: 'world' };

export interface SourceHello { version: string; scenario: ScenarioName; seed: number | null; tickSeconds: number | null; recorded: boolean }

export type SourceStatus =
  | { kind: 'connecting' } | { kind: 'streaming' } | { kind: 'paused' } | { kind: 'lagged'; skipped: number }
  | { kind: 'ended' } | { kind: 'error'; message: string };

export interface EngineSource {
  readonly kind: 'wasm' | 'sse' | 'trace';
  readonly drive: 'pull' | 'push'; // pull: the TickClock calls step(); push: the server ticks and frames arrive on their own
  readonly live: boolean; // commands reach an engine (false for the trace)
  start(): Promise<SourceHello>;
  onFrame(cb: (f: Frame) => void): () => void;
  onStatus(cb: (s: SourceStatus) => void): () => void;
  step(): Promise<Frame | null>; // pull: run exactly one tick; null when a trace is over. push: rejects
  pause(): Promise<void>; // sse: POST /pause; pull: no-op (the clock owns it)
  resume(): Promise<void>;
  authorize(envelope: EnvelopeId): Promise<boolean>; // false: no Door holds that envelope (wasm 0 / serve 404)
  reject(envelope: EnvelopeId): Promise<boolean>;
  topUp(node: NodeId, credits: number): Promise<boolean>;
  sync(node: NodeId): Promise<boolean>; // the person asks the oracle (doc 06 §8.1): wasm engine_sync, serve POST /sync; trace false
  zoom(stage: 1 | 2 | 3 | 4 | 5): Promise<boolean>;
  setTruthPrice?(price: number): Promise<boolean>; // wasm only: engine_set_truth_price
  dispose(): void;
}

/** App clock seconds, the unit of `arrivedAt` and every clip. */
export const nowSeconds = (): number =>
  (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()) / 1000;

/** A tiny listener set shared by the three sources. */
export class Listeners<T> {
  private readonly set = new Set<(v: T) => void>();
  add(cb: (v: T) => void): () => void { this.set.add(cb); return () => { this.set.delete(cb); }; }
  emit(v: T): void { for (const cb of [...this.set]) cb(v); }
  clear(): void { this.set.clear(); }
  get size(): number { return this.set.size; }
}
