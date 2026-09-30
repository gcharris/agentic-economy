// The module Worker that owns the wasm engine (ARCHITECTURE §3.1). The
// cdylib has zero imports and a raw C ABI: the host reads JSON out of linear
// memory, re-fetching `memory.buffer` on EVERY read (it detaches when memory
// grows) and calling `engine_out_ptr()` after the writing call. This worker
// is the sole caller of `engine_events()`, exactly once per tick, and never
// drains before a tick, so the world's tick-0 PACKED events arrive at the head
// of frame 1. `engine_tick()` returning 0 means the tick could not run: no
// frame is posted and nothing is drained.

/// <reference lib="webworker" />

import type { EngineEvent } from '../contract/events.ts';
import type { StateView } from '../contract/state.ts';
import { BurnWindow, packTruth, SlotTable, TRUTH_LENGTH } from '../store/slots.ts';
import type { FromWorker, ToWorker } from './WasmSource.ts';

interface EngineExports {
  memory: WebAssembly.Memory;
  engine_new(scenario: number, seed: bigint, budget: number, tasks: number, costVisible: number): void;
  engine_new_city?(streets: number, houses: number, budget: number, tasks: number, seed: bigint, costVisible: number): void;
  engine_new_world?(countries: number, cities: number, streets: number, houses: number, budget: number, tasks: number, seed: bigint, costVisible: number): void;
  engine_tick(): bigint;
  engine_authorize(envelope: bigint): number;
  engine_reject(envelope: bigint): number;
  engine_top_up(node: bigint, credits: number): void;
  engine_new_game?(houses: number, budget: number, tasks: number, weekTicks: number, priceWalk: number, oraclePerson: number, seed: bigint, costVisible: number): void;
  engine_sync?(node: bigint): number;
  engine_zoom(stage: number): void;
  engine_set_truth_price(price: number): void;
  engine_state(): number;
  engine_events(): number;
  engine_out_ptr(): number;
  engine_version(): number;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;
const decoder = new TextDecoder();
const slots = new SlotTable();
const burns = new BurnWindow();
let x: EngineExports | null = null;

function post(m: FromWorker, transfer?: Transferable[]): void {
  if (transfer) scope.postMessage(m, transfer); else scope.postMessage(m);
}

/** Read the output buffer: memory.buffer re-fetched every time; out_ptr read after the writing call. */
function read(e: EngineExports, len: number): string {
  return decoder.decode(new Uint8Array(e.memory.buffer, e.engine_out_ptr(), len));
}

async function instantiate(url: string): Promise<EngineExports> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`wasm fetch failed: ${response.status} ${url}`);
  let instance: WebAssembly.Instance;
  try {
    ({ instance } = await WebAssembly.instantiateStreaming(response.clone(), {}));
  } catch {
    ({ instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {}));
  }
  return instance.exports as unknown as EngineExports;
}

function engine(): EngineExports {
  if (!x) throw new Error('engine_new has not run: send { t: "new" } first');
  return x;
}

function tick(): void {
  const e = engine();
  const t = e.engine_tick();
  if (t === 0n) { post({ t: 'tick-skipped' }); return; }
  const state = JSON.parse(read(e, e.engine_state())) as StateView;
  const events = JSON.parse(read(e, e.engine_events())) as EngineEvent[]; // the one drain per tick
  slots.ensure(state.nodes);
  const burnRef = burns.push(state.nodes);
  const truth = new Uint16Array(TRUTH_LENGTH);
  packTruth(state.nodes, slots, truth, burnRef);
  const slotArray = slots.toArray();
  post({ t: 'frame', tick: Number(t), state, events, slots: slotArray, truth, burnRef }, [slotArray.buffer, truth.buffer]);
}

scope.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  try {
    switch (m.t) {
      case 'new': {
        x = await instantiate(m.wasmUrl);
        if (m.game && x.engine_new_game) x.engine_new_game(m.game.houses, m.budget, m.tasks, m.game.week, m.game.priceWalk ? 1 : 0, m.game.oraclePerson ? 1 : 0, BigInt(m.seed), m.costVisible ? 1 : 0);
        else if (m.world && x.engine_new_world) x.engine_new_world(m.world.countries, m.world.cities, m.world.streets, m.world.houses, m.budget, m.tasks, BigInt(m.seed), m.costVisible ? 1 : 0);
        else if (m.city && x.engine_new_city) x.engine_new_city(m.city.streets, m.city.houses, m.budget, m.tasks, BigInt(m.seed), m.costVisible ? 1 : 0);
        else x.engine_new(m.scenario, BigInt(m.seed), m.budget, m.tasks, m.costVisible ? 1 : 0);
        post({ t: 'hello', version: read(x, x.engine_version()) });
        break;
      }
      case 'tick': tick(); break;
      case 'authorize': post({ t: 'ack', id: m.id, ok: engine().engine_authorize(BigInt(m.envelope)) === 1 }); break;
      case 'reject': post({ t: 'ack', id: m.id, ok: engine().engine_reject(BigInt(m.envelope)) === 1 }); break;
      case 'topUp': engine().engine_top_up(BigInt(m.node), m.credits); post({ t: 'ack', id: m.id, ok: true }); break;
      case 'sync': post({ t: 'ack', id: m.id, ok: (engine().engine_sync?.(BigInt(m.node)) ?? 0) === 1 }); break;
      case 'zoom': engine().engine_zoom(m.stage); post({ t: 'ack', id: m.id, ok: true }); break;
      case 'setTruthPrice': engine().engine_set_truth_price(m.price); post({ t: 'ack', id: m.id, ok: true }); break;
    }
  } catch (err) {
    post({ t: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
