#!/usr/bin/env node
// Copies the engine's wasm and the recorded trace into public/, then
// instantiates the copied wasm and refuses to continue unless
// engine_new(3, 7n, 400, 3, 1) yields nine nodes (ARCHITECTURE §13.1: guards
// a stale engine/dist). Node 22 runs this directly (type stripping):
//   node scripts/copy-assets.ts
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_WASM = resolve(root, '../engine/dist/context_engine.wasm');
const SRC_TRACE = resolve(root, '../presentation/trace.json');
const DST_WASM = resolve(root, 'public/engine/context_engine.wasm');
const DST_TRACE = resolve(root, 'public/traces/trace.json');

const rel = (p: string) => relative(root, p);
const kb = (p: string) => `${(statSync(p).size / 1024).toFixed(0)} KB`;

function fail(message: string): never {
  console.error(`copy-assets: ${message}`);
  process.exit(1);
}

function copy(src: string, dst: string): void {
  if (!existsSync(src)) fail(`missing ${rel(src)}`);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  console.log(`copied ${rel(src)} → ${rel(dst)} (${kb(dst)})`);
}

interface Exports {
  memory: WebAssembly.Memory;
  engine_new(scenario: number, seed: bigint, budget: number, tasks: number, costVisible: number): void;
  engine_tick(): bigint;
  engine_state(): number;
  engine_events(): number;
  engine_out_ptr(): number;
  engine_version(): number;
}

function fresh(mod: WebAssembly.Module) {
  const x = new WebAssembly.Instance(mod, {}).exports as unknown as Exports;
  const read = (len: number) => new TextDecoder().decode(new Uint8Array(x.memory.buffer, x.engine_out_ptr(), len));
  return {
    x,
    version: () => read(x.engine_version()),
    state: () => JSON.parse(read(x.engine_state())) as { nodes: unknown[]; tick: number },
    events: () => JSON.parse(read(x.engine_events())) as { type: string; [k: string]: unknown }[],
  };
}

function guardWasm(path: string): void {
  const bytes = readFileSync(path);
  const imports = WebAssembly.Module.imports(new WebAssembly.Module(bytes));
  if (imports.length !== 0) fail(`the wasm has ${imports.length} imports; the cdylib must have none`);
  const mod = new WebAssembly.Module(bytes);

  const city = fresh(mod);
  const version = city.version();
  city.x.engine_new(3, 7n, 400, 3, 1);
  const cityNodes = city.state().nodes.length;
  if (cityNodes !== 9) {
    try { unlinkSync(path); } catch { /* nothing to remove */ }
    fail(`stale wasm: engine_new(3, 7n, 400, 3, 1) yielded ${cityNodes} nodes, expected 9 (the city: The City, Street 1–2, six houses). ` +
      `Rebuild: cd engine && cargo build --profile wasm --no-default-features --target wasm32-unknown-unknown && cp target/wasm32-unknown-unknown/wasm/context_engine.wasm dist/context_engine.wasm`);
  }
  city.x.engine_tick();
  city.state();
  const netted = city.events().find((e) => e.type === 'NETTED');
  if (!netted) fail('the city did not NET at tick 1');

  const world = fresh(mod);
  world.x.engine_new(5, 7n, 0, 0, 1);
  const worldNodes = world.state().nodes.length;
  if (worldNodes !== 9) fail(`stale wasm: engine_new(5, …) yielded ${worldNodes} nodes, expected 9`);

  console.log(`wasm ok: ${version}; city 9 nodes, NETTED gross ${String(netted.gross)} → net ${String(netted.net)} (${String(netted.envelopes)} envelopes); world 9 nodes`);
}

function guardTrace(path: string): void {
  const trace = JSON.parse(readFileSync(path, 'utf8')) as { version?: string; [run: string]: unknown };
  if (typeof trace.version !== 'string') fail('trace.json has no version');
  const runs = Object.entries(trace).filter(([, v]) => Array.isArray(v)) as [string, { tick: number }[]][];
  if (!runs.some(([k]) => k === 'house') || !runs.some(([k]) => k === 'street')) fail('trace.json lacks the house or the street run');
  for (const [name, frames] of runs) {
    frames.forEach((f, i) => { if (f.tick !== i + 1) fail(`trace.${name}[${i}] has tick ${f.tick}, expected ${i + 1}`); });
  }
  console.log(`trace ok: ${trace.version}; ${runs.map(([k, v]) => `${k} ${v.length}`).join(', ')}`);
}

copy(SRC_WASM, DST_WASM);
copy(SRC_TRACE, DST_TRACE);
guardWasm(DST_WASM);
guardTrace(DST_TRACE);
console.log('copy-assets: done');
