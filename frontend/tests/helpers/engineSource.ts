// A pull EngineSource over the real wasm, in-process (no Worker): the city and world scenarios exist only in the
// engine, so their headless tests drive it directly with the worker's read-out discipline (freshEngine).

import type { EngineEvent } from '../../src/engine/contract/events.ts';
import type { StateView } from '../../src/engine/contract/state.ts';
import { Listeners, type EngineSource, type Frame, type SourceHello, type SourceStatus, type ScenarioName } from '../../src/engine/source/EngineSource.ts';
import { freshEngine } from './assets.ts';

const CODE: Record<ScenarioName, number> = { house: 1, street: 2, city: 3, country: 4, world: 5 };

export function engineSource(scenario: ScenarioName, opts: { seed?: bigint; budget?: number; tasks?: number } = {}): EngineSource {
  const e = freshEngine();
  e.x.engine_new(CODE[scenario], opts.seed ?? 7n, opts.budget ?? 800, opts.tasks ?? 15, 1);
  const frames = new Listeners<Frame>(), status = new Listeners<SourceStatus>();
  return {
    kind: 'wasm', drive: 'pull', live: true,
    async start(): Promise<SourceHello> { return { version: e.version(), scenario, seed: Number(opts.seed ?? 7n), tickSeconds: null, recorded: false }; },
    onFrame: (cb) => frames.add(cb), onStatus: (cb) => status.add(cb),
    async step() {
      const tick = e.tick();
      const state: StateView = e.state();
      const events: EngineEvent[] = e.events();
      const f: Frame = { tick, state, events, decisions: [], arrivedAt: 0 };
      frames.emit(f);
      return f;
    },
    async pause() {}, async resume() {},
    async authorize(env) { return e.x.engine_authorize(BigInt(env)) === 1; },
    async reject(env) { return e.x.engine_reject(BigInt(env)) === 1; },
    async topUp(node, credits) { e.x.engine_top_up(BigInt(node), credits); return true; },
    async zoom(stage) { e.x.engine_zoom(stage); return true; },
    dispose() { frames.clear(); status.clear(); },
  };
}
