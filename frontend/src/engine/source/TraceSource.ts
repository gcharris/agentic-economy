// A recorded run (presentation/trace.json) replayed as frames (ARCHITECTURE
// §3.3). `stepTo` resolves in microtasks with no timers, so a test can
// `await source.stepTo(4)` and inspect the DOM at exactly tick 4.

import type { EngineEvent } from '../contract/events.ts';
import type { StateView } from '../contract/state.ts';
import { Listeners, nowSeconds, type Decision, type EngineSource, type Frame, type SourceHello, type SourceStatus } from './EngineSource.ts';

export interface RecordedFrame { tick: number; state: StateView; events: EngineEvent[]; decisions: Decision[] }

/** The shape of trace.json today; §13.3 adds city, world, street_doors and seed. */
export interface Trace {
  version: string;
  seed?: number;
  house: RecordedFrame[];
  house_hidden_cost: RecordedFrame[];
  house_visible_cost: RecordedFrame[];
  street: RecordedFrame[];
  city?: RecordedFrame[];
  world?: RecordedFrame[];
  street_doors?: RecordedFrame[];
}
export type RunName = 'house' | 'house_hidden_cost' | 'house_visible_cost' | 'street' | 'city' | 'world' | 'street_doors';
export const RUN_NAMES: readonly RunName[] = ['house', 'house_hidden_cost', 'house_visible_cost', 'street', 'city', 'world', 'street_doors'];
export const RUN_SCENARIO: Record<RunName, SourceHello['scenario']> = {
  house: 'house', house_hidden_cost: 'house', house_visible_cost: 'house', street: 'street', city: 'city', world: 'world', street_doors: 'street',
};

export class TraceSource implements EngineSource {
  readonly kind = 'trace' as const;
  readonly drive = 'pull' as const;
  readonly live = false as const;

  private index = -1;
  private started = false;
  private ended = false;
  private readonly frames$ = new Listeners<Frame>();
  private readonly status$ = new Listeners<SourceStatus>();

  constructor(
    readonly frames: RecordedFrame[],
    readonly hello: { version: string; scenario: SourceHello['scenario']; seed: number | null },
  ) {}

  /** Convenience: a source over one named run of a parsed trace.json. */
  static fromTrace(trace: Trace, run: RunName): TraceSource {
    const frames = trace[run];
    if (!frames) throw new Error(`trace.json has no run "${run}"`);
    return new TraceSource(frames, { version: trace.version, scenario: RUN_SCENARIO[run], seed: trace.seed ?? 7 });
  }

  get length(): number { return this.frames.length; }
  /** Index of the last emitted frame, -1 before start. */
  get cursor(): number { return this.index; }
  /** The last emitted recorded frame, or null. */
  get current(): RecordedFrame | null { return this.index >= 0 ? this.frames[this.index] : null; }

  async start(): Promise<SourceHello> {
    this.started = true;
    this.status$.emit({ kind: 'paused' });
    return { version: this.hello.version, scenario: this.hello.scenario, seed: this.hello.seed, tickSeconds: null, recorded: true };
  }

  onFrame(cb: (f: Frame) => void): () => void { return this.frames$.add(cb); }
  onStatus(cb: (s: SourceStatus) => void): () => void { return this.status$.add(cb); }

  private emitAt(i: number, seeked = false): Frame {
    const rec = this.frames[i];
    this.index = i;
    const frame: Frame = { tick: rec.tick, state: rec.state, events: rec.events, decisions: rec.decisions ?? [], arrivedAt: nowSeconds() };
    if (seeked) frame.seeked = true;
    this.frames$.emit(frame);
    return frame;
  }

  /** Emits frames[cursor + 1] with arrivedAt = now; null at the end → status 'ended'. */
  async step(): Promise<Frame | null> {
    if (!this.started) await this.start();
    const next = this.index + 1;
    if (next >= this.frames.length) {
      if (!this.ended) { this.ended = true; this.status$.emit({ kind: 'ended' }); }
      return null;
    }
    return this.emitAt(next);
  }

  /** step() until frame.tick === tick; every intermediate frame is emitted (reducers see every event). */
  async stepTo(tick: number): Promise<Frame | null> {
    let last: Frame | null = this.index >= 0 ? this.frameAt(this.index) : null;
    while (this.index < 0 || this.frames[this.index].tick < tick) {
      const f = await this.step();
      if (f === null) return last;
      last = f;
      if (f.tick >= tick) break;
    }
    return last;
  }

  /** Emits frames[tick - 1] with seeked: true (DOM + truth applied, no clips): director scrubbing. */
  async seek(tick: number): Promise<Frame | null> {
    if (!this.started) await this.start();
    const i = this.frames.findIndex((f) => f.tick === tick);
    if (i < 0) return null;
    this.ended = false;
    return this.emitAt(i, true);
  }

  private frameAt(i: number): Frame {
    const rec = this.frames[i];
    return { tick: rec.tick, state: rec.state, events: rec.events, decisions: rec.decisions ?? [], arrivedAt: nowSeconds() };
  }

  async pause(): Promise<void> { this.status$.emit({ kind: 'paused' }); }
  async resume(): Promise<void> { this.status$.emit({ kind: 'streaming' }); }

  // Recorded run: the Door's buttons are disabled and captioned; nothing reaches an engine.
  async authorize(): Promise<false> { return false; }
  async reject(): Promise<false> { return false; }
  async topUp(): Promise<false> { return false; }
  async zoom(): Promise<false> { return false; }

  dispose(): void { this.frames$.clear(); this.status$.clear(); }
}
