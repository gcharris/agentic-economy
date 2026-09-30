// A pull EngineSource over the real wasm, in-process (no Worker): the city and world scenarios exist only in the
// engine, so their headless tests drive it directly with the worker's read-out discipline (freshEngine).

import type { EngineEvent } from '../../src/engine/contract/events.ts';
import type { StateView } from '../../src/engine/contract/state.ts';
import { Listeners, type EngineSource, type Frame, type SourceHello, type SourceStatus, type ScenarioName } from '../../src/engine/source/EngineSource.ts';
import { freshEngine } from './assets.ts';

const CODE: Record<ScenarioName, number> = { house: 1, street: 2, city: 3, country: 4, world: 5 };

export function engineSource(scenario: ScenarioName, opts: { seed?: bigint; budget?: number; tasks?: number; city?: { streets: number; houses: number }; world?: { countries: number; cities: number; streets: number; houses: number }; game?: { houses: number; week: number; priceWalk: boolean; oraclePerson: boolean; oracleCost?: number; cadence?: number; sendTicks?: number } } = {}): EngineSource {
  const e = freshEngine();
  const x = e.x as typeof e.x & { engine_new_city(s: number, h: number, b: number, t: number, seed: bigint, c: number): void; engine_new_world(co: number, ci: number, s: number, h: number, b: number, t: number, seed: bigint, c: number): void; engine_new_game(h: number, b: number, t: number, w: number, walk: number, person: number, seed: bigint, c: number): void; engine_sync(node: bigint): number };
  if (opts.game) { const g = opts.game; x.engine_new_game(g.houses, opts.budget ?? 800, opts.tasks ?? 15, g.week, g.priceWalk ? 1 : 0, g.oraclePerson ? 1 : 0, opts.seed ?? 7n, 1); x.engine_game_options(g.oracleCost ?? 15, g.cadence ?? 8); x.engine_send_ticks(g.sendTicks ?? 1); }
  else if (opts.world) { const w = opts.world; x.engine_new_world(w.countries, w.cities, w.streets, w.houses, opts.budget ?? 800, opts.tasks ?? 15, opts.seed ?? 7n, 1); }
  else if (opts.city) x.engine_new_city(opts.city.streets, opts.city.houses, opts.budget ?? 800, opts.tasks ?? 15, opts.seed ?? 7n, 1);
  else e.x.engine_new(CODE[scenario], opts.seed ?? 7n, opts.budget ?? 800, opts.tasks ?? 15, 1);
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
    async topUp(node, credits) { return e.x.engine_top_up(BigInt(node), credits) === 1; },
    async answer(node, offer, answer) { return e.x.engine_answer(BigInt(node), BigInt(offer), ['send', 'hire', 'ask', 'leave'].indexOf(answer)) === 1; },
    async close(node) { return e.x.engine_close(BigInt(node)) === 1; },
    async zoom(stage) { e.x.engine_zoom(stage); return true; },
    async sync(node) { return x.engine_sync(BigInt(node)) === 1; },
    dispose() { frames.clear(); status.clear(); },
  };
}
