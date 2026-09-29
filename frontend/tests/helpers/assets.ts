// Test access to the two assets. public/ is the source of truth once
// `npm run copy-assets` has run; before that the tests fall back to the files
// it copies from, so the suite is green in either order.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EngineEvent } from '../../src/engine/contract/events.ts';
import type { StateView } from '../../src/engine/contract/state.ts';
import type { Trace } from '../../src/engine/source/TraceSource.ts';

export const FRONTEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function firstExisting(candidates: string[], what: string): string {
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(`${what} not found; run \`npm run copy-assets\` (looked in ${candidates.join(', ')})`);
}

export const tracePath = (): string =>
  firstExisting([resolve(FRONTEND_ROOT, 'public/traces/trace.json'), resolve(FRONTEND_ROOT, '../presentation/trace.json')], 'trace.json');
export const wasmPath = (): string =>
  firstExisting([resolve(FRONTEND_ROOT, 'public/engine/context_engine.wasm'), resolve(FRONTEND_ROOT, '../engine/dist/context_engine.wasm')], 'context_engine.wasm');
export const fixturePath = (name: string): string => resolve(FRONTEND_ROOT, 'tests/fixtures', name);

let traceCache: Trace | null = null;
export function loadTrace(): Trace {
  return (traceCache ??= JSON.parse(readFileSync(tracePath(), 'utf8')) as Trace);
}

export interface EngineExports {
  memory: WebAssembly.Memory;
  engine_new(scenario: number, seed: bigint, budget: number, tasks: number, costVisible: number): void;
  engine_tick(): bigint;
  engine_authorize(envelope: bigint): number;
  engine_reject(envelope: bigint): number;
  engine_top_up(node: bigint, credits: number): void;
  engine_zoom(stage: number): void;
  engine_set_truth_price(price: number): void;
  engine_state(): number;
  engine_events(): number;
  engine_out_ptr(): number;
  engine_version(): number;
}

let moduleCache: WebAssembly.Module | null = null;
export function loadWasmModule(): WebAssembly.Module {
  return (moduleCache ??= new WebAssembly.Module(readFileSync(wasmPath())));
}

/** A fresh engine over the real wasm, the same read-out discipline as the worker (memory.buffer re-fetched on every read). */
export function freshEngine(mod: WebAssembly.Module = loadWasmModule()) {
  const x = new WebAssembly.Instance(mod, {}).exports as unknown as EngineExports;
  const read = (len: number) => new TextDecoder().decode(new Uint8Array(x.memory.buffer, x.engine_out_ptr(), len));
  return {
    x,
    version: (): string => read(x.engine_version()),
    state: (): StateView => JSON.parse(read(x.engine_state())) as StateView,
    events: (): EngineEvent[] => JSON.parse(read(x.engine_events())) as EngineEvent[],
    tick: (): number => Number(x.engine_tick()),
  };
}

/** index.html's body without its scripts: the shell every DOM test mounts, so the tests and the page share one markup. */
export function loadShell(): void {
  const html = readFileSync(resolve(FRONTEND_ROOT, 'index.html'), 'utf8');
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? '';
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/gi, '');
}
