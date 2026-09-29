// The main-thread proxy for the wasm engine running in a module Worker
// (ARCHITECTURE §3.1). Ids cross postMessage as decimal strings; the worker
// packs slots + truth and transfers them with the frame; commands are
// correlated by id. Nothing here is optimistic: the answer to a command is a
// later Frame.

import type { EngineEvent } from '../contract/events.ts';
import { idToString } from '../contract/ids.ts';
import type { EnvelopeId, NodeId, StateView } from '../contract/state.ts';
import {
  Listeners, nowSeconds, SCENARIO_CODE, SCENARIO_NAME,
  type EngineSource, type Frame, type ScenarioName, type SourceHello, type SourceStatus,
} from './EngineSource.ts';

export type ScenarioCode = 1 | 2 | 3 | 4 | 5;

export type ToWorker =
  | { t: 'new'; scenario: ScenarioCode; seed: string /* decimal u64 */; budget: number; tasks: number; costVisible: boolean; wasmUrl: string; city?: { streets: number; houses: number }; world?: { countries: number; cities: number; streets: number; houses: number } }
  | { t: 'tick' }
  | { t: 'authorize'; id: number; envelope: string /* decimal */ }
  | { t: 'reject'; id: number; envelope: string }
  | { t: 'topUp'; id: number; node: string; credits: number }
  | { t: 'zoom'; id: number; stage: ScenarioCode }
  | { t: 'setTruthPrice'; id: number; price: number };

export type FromWorker =
  | { t: 'hello'; version: string }
  | { t: 'frame'; tick: number; state: StateView; events: EngineEvent[]; slots: Float64Array; truth: Uint16Array; burnRef: number }
  | { t: 'tick-skipped' } // engine_tick returned 0: no frame, nothing drained
  | { t: 'ack'; id: number; ok: boolean }
  | { t: 'error'; message: string };

export interface WasmSourceOptions {
  scenario: ScenarioName | ScenarioCode;
  seed?: number | bigint | string;
  budget?: number;
  tasks?: number;
  costVisible?: boolean;
  /** Scenario 3 only: a sized city through engine_new_city (DESIGN §2c.5); omitted, scenario 3 is 2 × 3. */
  city?: { streets: number; houses: number };
  /** The whole tree through engine_new_world (Stage 4): countries × cities × streets × houses. */
  world?: { countries: number; cities: number; streets: number; houses: number };
  /** Defaults to `${BASE_URL}engine/context_engine.wasm` (public/engine, copied by scripts/copy-assets.ts). */
  wasmUrl?: string;
  /** Injectable for tests; defaults to a module Worker over ./wasm.worker.ts. */
  createWorker?: () => Worker;
}

/** Defaults match presentation/record_trace.mjs's house run. */
export const WASM_DEFAULTS = { seed: 7, budget: 800, tasks: 15, costVisible: true } as const;

export function defaultWasmUrl(): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base.endsWith('/') ? base : base + '/'}engine/context_engine.wasm`;
}

interface Pending<T> { resolve: (v: T) => void; reject: (e: Error) => void }

export class WasmSource implements EngineSource {
  readonly kind = 'wasm' as const;
  readonly drive = 'pull' as const;
  readonly live = true as const;

  readonly scenario: ScenarioCode;
  readonly seed: string;
  private worker: Worker | null = null;
  private hello: Pending<SourceHello> | null = null;
  private tickWaiter: Pending<Frame | null> | null = null;
  private tickChain: Promise<unknown> = Promise.resolve();
  private readonly acks = new Map<number, Pending<boolean>>();
  private nextId = 1;
  private readonly frames$ = new Listeners<Frame>();
  private readonly status$ = new Listeners<SourceStatus>();
  private disposed = false;

  constructor(private readonly opts: WasmSourceOptions) {
    this.scenario = typeof opts.scenario === 'number' ? opts.scenario : SCENARIO_CODE[opts.scenario];
    const seed = opts.seed ?? WASM_DEFAULTS.seed;
    this.seed = typeof seed === 'bigint' ? seed.toString() : typeof seed === 'number' ? String(Math.trunc(seed)) : seed;
    if (!/^\d+$/.test(this.seed)) throw new RangeError(`seed must be a decimal u64, got ${this.seed}`);
  }

  start(): Promise<SourceHello> {
    if (this.hello) throw new Error('WasmSource.start() called twice');
    this.status$.emit({ kind: 'connecting' });
    const worker = (this.opts.createWorker ?? (() => new Worker(new URL('./wasm.worker.ts', import.meta.url), { type: 'module' })))();
    this.worker = worker;
    worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
    worker.onerror = (e: ErrorEvent) => this.fail(e.message || 'worker error');
    const promise = new Promise<SourceHello>((resolve, reject) => { this.hello = { resolve, reject }; });
    const msg: ToWorker = {
      t: 'new', scenario: this.scenario, seed: this.seed,
      budget: this.opts.budget ?? WASM_DEFAULTS.budget, tasks: this.opts.tasks ?? WASM_DEFAULTS.tasks,
      costVisible: this.opts.costVisible ?? WASM_DEFAULTS.costVisible, wasmUrl: this.opts.wasmUrl ?? defaultWasmUrl(),
      ...(this.opts.city && this.scenario === 3 ? { city: this.opts.city } : {}),
      ...(this.opts.world ? { world: this.opts.world } : {}),
    };
    worker.postMessage(msg);
    return promise;
  }

  onFrame(cb: (f: Frame) => void): () => void { return this.frames$.add(cb); }
  onStatus(cb: (s: SourceStatus) => void): () => void { return this.status$.add(cb); }

  /** Run exactly one tick. Serialised: a second call waits for the first frame. Resolves null when engine_tick returned 0. */
  step(): Promise<Frame | null> {
    const run = () => new Promise<Frame | null>((resolve, reject) => {
      if (!this.worker || this.disposed) { reject(new Error('WasmSource is not started')); return; }
      this.tickWaiter = { resolve, reject };
      this.post({ t: 'tick' });
    });
    const next = this.tickChain.then(run, run);
    this.tickChain = next.catch(() => undefined);
    return next;
  }

  async pause(): Promise<void> { this.status$.emit({ kind: 'paused' }); }
  async resume(): Promise<void> { this.status$.emit({ kind: 'streaming' }); }

  authorize(envelope: EnvelopeId): Promise<boolean> { return this.command((id) => ({ t: 'authorize', id, envelope: idToString(envelope) })); }
  reject(envelope: EnvelopeId): Promise<boolean> { return this.command((id) => ({ t: 'reject', id, envelope: idToString(envelope) })); }
  topUp(node: NodeId, credits: number): Promise<boolean> { return this.command((id) => ({ t: 'topUp', id, node: idToString(node), credits })); }
  zoom(stage: ScenarioCode): Promise<boolean> { return this.command((id) => ({ t: 'zoom', id, stage })); }
  setTruthPrice(price: number): Promise<boolean> { return this.command((id) => ({ t: 'setTruthPrice', id, price })); }

  dispose(): void {
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    const err = new Error('WasmSource disposed');
    this.hello?.reject(err); this.hello = null;
    this.tickWaiter?.reject(err); this.tickWaiter = null;
    for (const p of this.acks.values()) p.reject(err);
    this.acks.clear();
    this.frames$.clear(); this.status$.clear();
  }

  private command(build: (id: number) => ToWorker): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      if (!this.worker || this.disposed) { reject(new Error('WasmSource is not started')); return; }
      const id = this.nextId++;
      this.acks.set(id, { resolve, reject });
      this.post(build(id));
    });
  }

  private post(m: ToWorker): void { this.worker?.postMessage(m); }

  private receive(m: FromWorker): void {
    switch (m.t) {
      case 'hello': {
        const hello: SourceHello = { version: m.version, scenario: SCENARIO_NAME[this.scenario], seed: Number(this.seed) <= Number.MAX_SAFE_INTEGER ? Number(this.seed) : null, tickSeconds: null, recorded: false };
        this.hello?.resolve(hello);
        this.status$.emit({ kind: 'streaming' });
        break;
      }
      case 'frame': {
        const frame: Frame = {
          tick: m.tick, state: m.state, events: m.events, decisions: [], arrivedAt: nowSeconds(),
          packed: { slots: m.slots, truth: m.truth, burnRef: m.burnRef },
        };
        const w = this.tickWaiter; this.tickWaiter = null;
        this.frames$.emit(frame);
        w?.resolve(frame);
        break;
      }
      case 'tick-skipped': {
        const w = this.tickWaiter; this.tickWaiter = null;
        w?.resolve(null);
        break;
      }
      case 'ack': {
        const p = this.acks.get(m.id);
        if (p) { this.acks.delete(m.id); p.resolve(m.ok); }
        break;
      }
      case 'error': this.fail(m.message); break;
    }
  }

  private fail(message: string): void {
    this.status$.emit({ kind: 'error', message });
    const err = new Error(message);
    this.hello?.reject(err); this.hello = null;
    const w = this.tickWaiter; this.tickWaiter = null; w?.reject(err);
    for (const p of this.acks.values()) p.reject(err);
    this.acks.clear();
  }
}
