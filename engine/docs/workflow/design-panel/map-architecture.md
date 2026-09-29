# The converged render architecture · a map precise enough to implement

**Reader C · 2026-09-28.** Sources read in full: `engine/docs/FRONTEND-DESIGNER-BRIEF.md`, `engine/docs/TECH-STACK-DECISION.md`, the three frontend proposals (`proposal-frontend-3-Truth_Buffer.md`, `proposal-frontend-4-One_Quad,_Five_Scales.md`, `proposal-frontend-5-Altitude.md`), and the engine as it stands: `engine/src/events.rs`, `engine/src/tick.rs` (`StateView`, `NodeView`, `HeldView`, `Totals`, `TickReport`, `state_view()`), `engine/src/wasm_abi.rs`, `engine/src/bin/serve.rs`, `engine/src/scenarios/{mod,city,world}.rs`, `engine/src/lod.rs`, `engine/src/receipt.rs`, `engine/src/epistemics.rs`, `presentation/record_trace.mjs`, `presentation/trace.json` (inspected frame by frame), `presentation/part3.template.html` (the working wasm adapter), `the-house.html`, `the-zoom.html`, doc 03 §3, doc 02 §4, `GAME_ENGINE_ARCHITECTURE.md` §4, and the estate's Cloud Run deployment in the main repo `context-engine-studio` (`.github/workflows/deploy-backend.yml`, `cloudbuild.yaml`, the deployment dev-doc).

Rules every section obeys: render only `StateView` and `EngineEvent`; never simulate; every animation is keyed off an event, never off polling; no per-frame walk of state; no score, rank, reputation, rating or leaderboard anywhere on screen (a DOM test enforces it, mirroring the engine's `there_is_no_leaderboard`). Vocabulary kept: the Purse, the Oak Table, the Door, the Porter, the Note, the Letter Slot, the Clearinghouse, the High Court, the STARK heartbeat, and the five seats Scout / Scribble / Inspector / Penny / Porter (Penny is the engine's `Steward` seat; seats are staff, not traders).

## 0. The shape in one paragraph

One `EngineSource` (wasm in a Worker, SSE from `serve`, or a recorded trace) produces `Frame { tick, state, events, decisions }` once per engine tick. A single `reduce(frame)` pass (the only O(nodes) work per tick) writes per-node truth into two small data textures, turns events into timed **clips**, and patches the DOM (HUD, the Door `<dialog>`, receipts, the Note). Between ticks the CPU touches nothing but a handful of uniforms: fog, purse, heat, status, the StateSync sweep and the gate pulses are all evaluated in the tile shader from the truth textures and the clip ring. One `PerspectiveCamera` at a 4° field of view (dimetric-feeling) whose position, target and band are functions of one **altitude** scalar `A ∈ [1, 5]`; crossing a band's hysteresis line calls `zoom/<n>` once and the fold/unfold is animated only when `PACKED`/`UNPACKED` (or the confirming `TICK_COMMITTED.active_scale`) arrives. Hex axial coordinates are a pure function of the graph (root at `(0,0)`, streets as spiral rings, houses along a ring), keyed by `NodeId`, so the same seed lays out the same city and a take can be re-shot frame for frame. Tests replay `trace.json` through the same store and DOM with a null renderer and assert the Door is open at tick 1 and closed at tick 5.

---

## 1. `EngineSource`, `Frame`, and the three implementations

### 1.1 The contract, mirrored from the Rust structs (`src/contract/`)

Field names are the engine's, verbatim. Ids are `u64` minted as `(rng >> 12) ^ counter` (`tick.rs::mint_id`), so they are below 2^52 and safe as JSON numbers; the frontend keeps them as `number` and converts to `BigInt` only at the wasm boundary. `Hash32` is a 64-char lowercase hex string. `Stage` serialises as `"House" | "Street" | "City" | "Country" | "World"` (levels 1–5). `NodeStatus` is snake_case.

```ts
// src/contract/state.ts  (mirror of engine/src/tick.rs, lod.rs, receipt.rs)
export type NodeId = number; export type EnvelopeId = number; export type Hash32 = string;
export type Stage = 'House' | 'Street' | 'City' | 'Country' | 'World';
export const STAGE_LEVEL: Record<Stage, 1|2|3|4|5> = { House: 1, Street: 2, City: 3, Country: 4, World: 5 };
export type NodeStatus = 'active' | 'waiting_at_door' | 'halted' | 'packed' | 'partitioned';

export interface PackedStatisticalState {
  avg_compute_burn_rate: number; liquidity_velocity: number; epistemic_variance: number; mean_confidence: number;
  stochastic_seed: number; packed_at_tick: number; active_children: NodeId[]; child_count: number;
  total_compute_at_pack: number; macro_ticks: number; pending_burn: number; pending_liquidity_delta: number; pending_decay_ticks: number;
}
export type HaltReason =                                   // serde(tag = "kind", snake_case), verified in trace.json
  | { kind: 'runway_exhausted'; shortfall: number } | { kind: 'closed' } | { kind: 'slashed'; amount: number } | { kind: 'partitioned' };
export interface Note {
  tick: number; node: NodeId; node_name: string; doing: string; compute_burned_total: number; compute_remaining: number;
  joules_burned_total: number; papers_on_table: number; reason: HaltReason; saved_state: string;
}
export interface NodeView {
  id: NodeId; name: string; stage: Stage; gate: Stage; parent: NodeId | null; children: number; status: NodeStatus;
  compute: number; compute_allocated: number; compute_burned: number; joules_burned: number; compute_reclaimed: number;
  liquidity_belief: number; liquidity_truth: number; confidence: number; fog: number; generation: number; idle_ticks: number;
  calibrations: number; tasks_total: number; tasks_done: number; current_task: string | null; held: number;
  packed: PackedStatisticalState | null; note: Note | null; burned_this_tick: number; oak_root: Hash32; papers: number; receipts: string[];
}
export interface HeldView {
  envelope: EnvelopeId; node: NodeId; node_name: string; description: string; cost: number; gate: Stage;
  reason: 'awaiting_human_signature' | 'awaiting_finality'; created_tick: number;
}
export interface Totals { compute_burned: number; tax_paid: number; settled: number; slashed: number; approved: number; rejected: number; waiting: number; halted: number }
export interface TickReport {
  tick: number; drafted: number; compute_burned: number; tax_paid: number; envelopes_minted: number; dropped_by_courier: number;
  approved: number; rejected: number; held: number; slashed: number; voided: number; settled_liquidity: number; halted: number;
  seat_failures: number; synced: number; root: Hash32; global_confirmed: boolean; rolled_back: boolean; packed_groups: number;
}
export interface StateView {
  tick: number; active_scale: Stage; root: Hash32; executor: string; nodes: NodeView[]; held: HeldView[]; mempool: number;
  totals: Totals; gates: string[]; last_report: TickReport | null; root_history: [number, string][];
}
```

```ts
// src/contract/events.ts  (mirror of engine/src/events.rs; tag "type", SCREAMING_SNAKE_CASE; every variant carries tick)
type T = { tick: number };
export type EngineEvent =
  | T & { type: 'THOUGHT'; node: NodeId; seat: string; text: string }
  | T & { type: 'BURN'; node: NodeId; seat: string; credits: number; joules: number; tier: string; cache_hit: boolean }
  | T & { type: 'PROPOSED'; envelope: EnvelopeId; from: NodeId; to: NodeId; kind: string; requested_liquidity: number; tax_paid: number }
  | T & { type: 'DROPPED_BY_COURIER'; from: NodeId; to: NodeId; reason: string }
  | T & { type: 'AWAITING_HUMAN_SIGNATURE'; node: NodeId; envelope: EnvelopeId; description: string; cost: number }
  | T & { type: 'AWAITING_FINALITY'; envelope: EnvelopeId; until_tick: number }
  | T & { type: 'APPROVED'; envelope: EnvelopeId; gate: Stage }
  | T & { type: 'REJECTED'; envelope: EnvelopeId; gate: Stage; reason: string; sunk_compute: number }
  | T & { type: 'SLASHED'; node: NodeId; amount: number; reason: string }
  | T & { type: 'SETTLED'; envelope: EnvelopeId; from: NodeId; to: NodeId; amount: number }
  | T & { type: 'DELIVERED'; envelope: EnvelopeId; to: NodeId }
  | T & { type: 'STATE_SYNC'; node: NodeId; cost: number; confidence_before: number }
  | T & { type: 'HALTED'; node: NodeId; note: Note }
  | T & { type: 'SEAT_FAILED'; node: NodeId }
  | T & { type: 'VOIDED'; envelope: EnvelopeId; reason: string }
  | T & { type: 'TOPPED_UP'; node: NodeId; credits: number }
  | T & { type: 'PACKED'; parent: NodeId; children: number; seed: number }
  | T & { type: 'UNPACKED'; parent: NodeId; children: number; macro_ticks: number; burn_distributed: number }
  | T & { type: 'NETTED'; clearinghouse: Stage; gross: number; net: number; envelopes: number }
  | T & { type: 'ROLLED_BACK'; to_tick: number; reason: string; slashed: number }
  | T & { type: 'GLOBAL_STATE_CONFIRMED'; root: Hash32; latency_ticks: number; partitioned: NodeId[] }
  | T & { type: 'TICK_COMMITTED'; root: Hash32; active_scale: Stage; nodes_active: number; nodes_waiting: number; nodes_halted: number; nodes_packed: number; nodes_partitioned: number };
```

A vitest (`tests/unit/contract-wasm.test.ts`) loads the real `engine/dist/context_engine.wasm` in Node, runs ten ticks of the house and the street, and checks every `NodeView` key and every event tag against these types, so a drift in `tick.rs` or `events.rs` fails the frontend build before it fails on screen. (`ts-rs` can replace the hand mirror later; it is not needed to start.)

### 1.2 `Frame` and `EngineSource` (`src/source/EngineSource.ts`)

```ts
export interface Frame {
  tick: number;                 // == state.tick
  state: StateView;             // the whole view; the trace slims receipts to 3 per node (wasm/sse give 6)
  events: EngineEvent[];        // drained for this tick, in engine order; every one has e.tick <= tick
  decisions: Decision[];        // commands applied between the previous frame and this one (trace: recorded; live: the app's own log)
  arrivedAt: number;            // app clock seconds (performance.now()/1000) when the frame was accepted; the clip scheduler's t0
  seeked?: true;                // set by TraceSource.seek(): apply DOM/truth, play no clips
}
export type Decision =
  | { tick: number; decision: 'approve' | 'reject'; envelope: EnvelopeId; description?: string }
  | { tick: number; decision: 'top_up'; node: NodeId; credits: number }
  | { tick: number; decision: 'zoom'; stage: 1|2|3|4|5 }
  | { tick: number; decision: 'truth_changed'; description: string };   // record_trace.mjs writes this one in the street run

export interface SourceHello { version: string; scenario: 'house' | 'street' | 'city'; seed: number | null; tickSeconds: number | null; recorded: boolean }
export type SourceStatus =
  | { kind: 'connecting' } | { kind: 'streaming' } | { kind: 'paused' } | { kind: 'lagged'; skipped: number }
  | { kind: 'ended' } | { kind: 'error'; message: string };

export interface EngineSource {
  readonly kind: 'wasm' | 'sse' | 'trace';
  readonly drive: 'pull' | 'push';      // pull: the app's TickClock calls step(); push: the server ticks and frames arrive on their own
  readonly live: boolean;               // commands reach an engine (false for the trace)
  start(): Promise<SourceHello>;
  onFrame(cb: (f: Frame) => void): () => void;
  onStatus(cb: (s: SourceStatus) => void): () => void;
  step(): Promise<Frame | null>;        // pull sources: run/emit exactly one tick; null when a trace is over. push sources: rejects.
  pause(): Promise<void>;               // sse: POST /pause; pull: TickClock stops (a no-op here, the clock owns it)
  resume(): Promise<void>;              // sse: POST /resume
  authorize(envelope: EnvelopeId): Promise<boolean>;   // false: no Door holds that envelope (wasm returns 0; serve answers 404)
  reject(envelope: EnvelopeId): Promise<boolean>;
  topUp(node: NodeId, credits: number): Promise<boolean>;
  zoom(stage: 1|2|3|4|5): Promise<boolean>;
  setTruthPrice?(price: number): Promise<boolean>;     // wasm only (engine_set_truth_price); the street demo's "truth moved" beat
  dispose(): void;
}
```

Commands flow back one way: a DOM control calls `app.command(c)`, which (1) appends `c` to the app's pending-decision log, (2) calls the source method, (3) does **nothing optimistic**. The Door closes when the engine says so (an `APPROVED`/`REJECTED` for that envelope, or the next frame whose `state.held` no longer lists it), the purse gauge moves when the next `Frame` says so. The pending log is attached as `decisions` to the next accepted frame, so a wasm or SSE session can be written out in exactly the trace format (`scripts/record-trace.ts`) and replayed.

### 1.3 `WasmSource` (`src/source/WasmSource.ts` + `src/source/wasm.worker.ts`)

The engine's cdylib (`engine/dist/context_engine.wasm`, ~340 KB, zero imports, raw C ABI, no wasm-bindgen) runs in a module Worker. Exports and their JS-side types: `engine_new(scenario: u32, seed: u64→BigInt, budget: f64, tasks: u32, cost_visible: u32)`, `engine_tick(): u64→BigInt` (0 means the tick could not complete on this host), `engine_authorize(u64→BigInt): u32`, `engine_reject(u64→BigInt): u32`, `engine_top_up(u64→BigInt, f64)`, `engine_zoom(u32)`, `engine_set_truth_price(f64)`, `engine_state(): u32` (length), `engine_events(): u32` (length, drains), `engine_out_ptr(): ptr`, `engine_version(): u32`, and `memory`. The output buffer is read as `new TextDecoder().decode(new Uint8Array(x.memory.buffer, x.engine_out_ptr(), len))`, re-fetching `memory.buffer` on **every** read because it detaches when memory grows (the adapter in `part3.template.html` and `record_trace.mjs` both do this). Scenario codes today: `1` house, `2` street (six houses); `3` city is an engine-side addition (see §8.3).

Worker protocol (structured clone; the truth arrays are transferables):

```ts
// main → worker
type ToWorker =
  | { t: 'new'; scenario: 1|2|3; seed: string /* decimal u64 */; budget: number; tasks: number; costVisible: boolean }
  | { t: 'tick' } | { t: 'authorize'; envelope: number } | { t: 'reject'; envelope: number }
  | { t: 'topUp'; node: number; credits: number } | { t: 'zoom'; stage: 1|2|3|4|5 } | { t: 'setTruthPrice'; price: number };
// worker → main
type FromWorker =
  | { t: 'hello'; version: string }
  | { t: 'frame'; tick: number; state: StateView; events: EngineEvent[];
      slots: Float64Array /* NodeId per slot, transferable */; truth: Uint16Array /* RGBA16F per slot, transferable */ }
  | { t: 'ack'; id: number; ok: boolean } | { t: 'error'; message: string };
```

The worker owns the slot table (§2.2) and packs the truth texture (§2.3) before posting, so the main thread never walks `state.nodes` for the GPU; at 5,000 nodes the packed truth is 40 KB. The full `StateView` still travels by structured clone (a few MB at 5k nodes, ~5–8 ms on the main thread per tick at 1.4 Hz, budgeted in §7); the 50k path is the ~40-line `engine_state_f32()` export Truth Buffer proposed, not needed for the acceptance target. `WasmSource.step()` posts `tick` and resolves with the next `frame`; commands resolve on `ack`. The tick loop is the adapter's: `engine_tick` → `engine_state` → `engine_events` (the worker is the sole caller of `engine_events`, so drained events are never lost).

### 1.4 `SseSource` (`src/source/SseSource.ts`)

Against `engine/src/bin/serve.rs` (dependency-free HTTP/1.1 + SSE, CORS `*` on every answer, `Cache-Control: no-store`):

- `start()`: `new EventSource(`${base}/events`)`. `event: hello` carries the version text (`context-engine 0.1.0 (native, tokio-multi-thread executor, scenario house, seed 7)`; the source parses scenario and seed from it). `retry: 1000` is set by the server.
- `event: tick` carries `{ report: TickReport, events: EngineEvent[] }` — **no state**. The source then `GET ${base}/state` (the reply is ordered after the tick because both go through the engine task's one command channel) and emits `Frame { tick: state.tick, state, events }`. If a second tick lands before the GET returns (`state.tick > report.tick`), the events of both ticks are coalesced into the one frame at `state.tick`; each event still carries its own `tick`, so clips play in order. (An optional one-line server change adds `state` to the tick payload and removes the round trip; §8.3.)
- `event: lagged` `{ skipped }` → status `lagged`, one fresh `GET /state`, and a HUD line "stream lagged · N ticks skipped"; nothing is faked in between.
- Commands: `fetch(`${base}/authorize/${envelope}`, { method: 'POST' })` and likewise `/reject/<envelope>`, `/top-up/<node>/<credits>`, `/zoom/<1-5>`, `/pause`, `/resume`. Ids go on the path as decimal numbers (never the `env:xxxxxxxx` display form). `200 {"ok":true}` → `true`; `404 {"ok":false,"error":"no envelope held with that id"}` → `false`; `400` malformed → `false` plus a console error.
- `drive: 'push'`: the server's `--interval-ms` (default 700) is the clock; `setSpeed` is not available and the HUD says "server tick · 700 ms". `pause()`/`resume()` POST and the server keeps answering `/state` and commands while paused.
- Base URL: `import.meta.env.VITE_ENGINE_URL`, default `http://127.0.0.1:8787`.

**Cloud Run (from the main repo).** The estate deploys its backend with `gcloud run deploy --platform managed --allow-unauthenticated` in `us-central1` through `cloudbuild.yaml`, and Cloud Run injects `PORT` (8080). A shared demo of `serve` follows the same shape (a distroless image of the one static binary, as the velocity-first backend proposal already suggested) with four settings that matter for a stream: `--timeout 3600` (an SSE connection is one long request; the default 300 s would cut it), `--max-instances 1` and `--min-instances 1` (one engine instance is one world; two instances would be two different worlds), `--no-cpu-throttling` (ticks must run between requests), `--concurrency 80`. `serve.rs` currently binds `127.0.0.1` and takes `--port`; a `--bind 0.0.0.0` flag (or honouring `PORT`) is the one engine-side change Cloud Run needs (§8.3). No key ever lives in the frontend; the demo service carries no secret at all.

### 1.5 `TraceSource` (`src/source/TraceSource.ts`)

`presentation/trace.json` is `{ version, house: RecordedFrame[], house_hidden_cost: RecordedFrame[], house_visible_cost: RecordedFrame[], street: RecordedFrame[] }` with `RecordedFrame = { tick, state (receipts sliced to 3), events, decisions }`. A frame's `decisions` are the commands `record_trace.mjs` applied **after the previous frame and before this tick ran** (e.g. frame 5 of `house` carries `{ tick: 4, envelope: 3930624385311261, decision: 'approve' }` and its events include the `APPROVED` at tick 5). Frames are 1-based ticks in order; `house` has 70, `house_hidden_cost` 9 (halts), `house_visible_cost` 13, `street` 30.

```ts
export class TraceSource implements EngineSource {
  readonly kind = 'trace'; readonly drive = 'pull'; readonly live = false;
  constructor(readonly frames: RecordedFrame[], readonly hello: { version: string; scenario: 'house'|'street'|'city'; seed: number | null }) {}
  get length(): number; get cursor(): number;            // index of the last emitted frame, -1 before start
  step(): Promise<Frame | null>;                          // emits frames[cursor+1] with arrivedAt = now; null at the end → status 'ended'
  stepTo(tick: number): Promise<Frame | null>;            // step() until frame.tick === tick (every intermediate frame is emitted, so reducers see every event)
  seek(tick: number): Promise<Frame | null>;              // emits only frames[tick-1] with seeked: true (DOM + truth applied, no clips); director scrubbing
  authorize/reject/topUp/zoom(): Promise<false>;          // recorded run: the Door's buttons are disabled and captioned "recorded run"
}
```

Tick-accurate stepping for tests is `stepTo(n)`: it is synchronous in effect (each `step()` resolves in a microtask; no timers), so a test can `await source.stepTo(4)` and inspect the DOM at exactly tick 4. The app's clock is not involved in tests. The recorded-run banner ("Recorded run · context-engine 0.1.0 (wasm32, sequential executor) · seed 7 · the person's decisions replay at the recorded ticks") stays visible whenever `hello.recorded` is true, as the existing page already does. The trace lacks a `seed` field and a `city` run; re-record once §8.3's scenario 3 exists (`scripts/record-trace.ts` wraps `record_trace.mjs` and adds `seed` per run).

### 1.6 The `TickClock` (`src/source/TickClock.ts`): pause, step, speed

For `drive: 'pull'` sources the app owns time: `TickClock { running, speed (0.25–8), tickSeconds, start(), pause(), stepOnce(), setSpeed() }` schedules `source.step()` every `tickSeconds / speed` (a `setTimeout` chain re-armed after each frame resolves, never overlapping; `requestAnimationFrame` is not used for ticks). Default `tickSeconds` per band (the Altitude proposal's numbers): House 1.2 s, Street 0.7 s, City 0.4 s, Country 0.3 s, World 0.25 s, so the 16-tick `stark_period` reads as a 4 s heartbeat in orbit and a 19 s one in the room. Pause stops scheduling; the render loop continues (fog breathes, the Door stays up); `stepOnce()` is the HUD's step button; speed rescales both the schedule and the clip durations (`uTickSeconds` uniform), so a 4× run still plays a Burn flare per tick. For `drive: 'push'` the clock is a mirror of the server's status only. In director mode (`?take=`) the clock is replaced by fixed `dt = 1/60` stepping (§9, `director.ts`).

---

## 2. The truth buffer

### 2.1 What is on the GPU per node

Decision (§8): a **texture**, not per-instance attributes, because couriers, tubes, pulses and labels all need to look up a node's truth by slot without duplicating it; per-instance data carries only the static part. Three `DataTexture`s of 256 × 256 (65,536 slots; 5,000 needed; §7):

| texture | format | R | G | B | A | written |
|---|---|---|---|---|---|---|
| `uTruth` | RGBA16F (`HalfFloatType`, `NearestFilter`, no mips) | `phi` = `confidence` (0.05–1) | `purse` = `compute / compute_allocated` (0 when allocated is 0), clamped 0–1 | `heat` = `burned_this_tick / uBurnRef`, clamped 0–1 | `status` code + 8·(held > 0) | per tick, whole texture (`needsUpdate`), 512 KB |
| `uTruthPrev` | same | the previous tick's `uTruth` | | | | swapped by reference each tick, no upload |
| `uTimes` | RGBA32F (`FloatType`, nearest) | `syncT` app-seconds of the node's last `STATE_SYNC` (or −1e9) | `packT` app-seconds of the last `PACKED`/`UNPACKED` touching the node (or −1e9) | `haltT` app-seconds of `HALTED` (or −1e9) | `variance` = `packed.epistemic_variance` (0 when not packed) | on events only (a handful of texels per event, one `needsUpdate`); 1 MB |

Status codes: `active 0, waiting_at_door 1, halted 2, packed 3, partitioned 4`; small integers are exact in half float. `uBurnRef` is the 90th percentile of `burned_this_tick` over the last 8 ticks (recomputed per tick on the CPU, one number), so heat is relative to what this run burns. Times are float32 because fp16 has 1 s resolution past 1,024 s and the sweep is 600 ms long. Packed children are written from their parent's profile (the brief: render the parent's `packed` profile, not the children): `phi = parent.packed.mean_confidence`, `variance = parent.packed.epistemic_variance`, `purse = parent.purse`, `status = 3`.

Static per-instance attributes on the tile `InstancedMesh`: `aSlot` (float), `aAxial` (vec2 q,r), `aKind` (0 ground, 1 house, 2 street, 3 city/Clearinghouse, 4 country), `aSeed` (float, `hash(NodeId)` in 0–1, decorrelates noise), plus `instanceMatrix` from the layout (§4). Ground tiles (no node) have `aSlot = -1` and read no truth.

### 2.2 Slots (`src/store/slots.ts`)

`state.nodes` arrives ordered by ascending `NodeId` (`Engine.nodes` is a `BTreeMap`), which is stable while the node set is stable, but the slot table is keyed by id anyway: `slotOf(id)` allocates the next free slot the first time an id is seen and never frees it within a session. The worker (wasm) and the reducer (sse, trace) share the same `slots.ts`; a layout also keys by id, so texel `i` means node `slots[i]` for the whole run and a re-shot take maps identically.

### 2.3 Packing (`packTruth(nodes, slots, out: Uint16Array, burnRef)`, pure, shared by worker and reducer)

For each node: `const s = slotOf(n.id) * 4; out[s] = toHalf(phi); out[s+1] = toHalf(purse); out[s+2] = toHalf(heat); out[s+3] = toHalf(code)`, using `THREE.DataUtils.toHalfFloat` (a port of it in the worker, which does not import three). 5,000 nodes = 20,000 conversions per tick, well under 1 ms.

### 2.4 The shader (`src/render/shaders/truth.glsl`, `#include`d by tile, room, courier and tube materials; GLSL ES 3.00 via `ShaderMaterial({ glslVersion: THREE.GLSL3 })`)

```glsl
uniform sampler2D uTruth, uTruthPrev, uTimes;
uniform float uTime;          // app seconds (the render clock; keeps running while the engine is paused)
uniform float uTickT;         // arrivedAt of the current frame
uniform float uTickSeconds;   // expected interval at this band and speed
uniform float uAltitude;      // §3
uniform float uReducedMotion; // 1.0 → no warp animation, no grain flicker, sweeps become 150 ms fades
struct Truth { float phi, phiPrev, purse, heat, variance, syncT, packT, haltT; int status; bool held; };

Truth fetchTruth(float slot) {
  ivec2 tc = ivec2(int(slot) & 255, int(slot) >> 8);
  vec4 a = texelFetch(uTruth, tc, 0), p = texelFetch(uTruthPrev, tc, 0), t = texelFetch(uTimes, tc, 0);
  Truth r; r.phi = a.r; r.phiPrev = p.r; r.purse = a.g; r.heat = a.b;
  int code = int(a.a + 0.5); r.held = code >= 8; r.status = code & 7;
  r.syncT = t.r; r.packT = t.g; r.haltT = t.b; r.variance = t.a; return r;
}
float blendT() { return smoothstep(0.0, 1.0, clamp((uTime - uTickT) / uTickSeconds, 0.0, 1.0)); }   // free lerp between blocks

// fog = 1 − Φ, with the sweep front deciding whether a fragment sees the old or the new Φ
float sweepFront(Truth t, vec2 uvC) {                     // uvC: tile-local coords centred at 0, span [-0.5, 0.5]
  float age = uTime - t.syncT;                            // seconds since STATE_SYNC (+ cascade delay written by the reducer)
  float dur = mix(0.6, 0.15, uReducedMotion);
  float x   = dot(uvC, normalize(vec2(1.0, 0.6)));         // the band travels diagonally, lower-left to upper-right
  return (age / dur - 0.5) * 1.6 - x;                     // > 0 behind the front (already synced), < 0 ahead of it
}
float visiblePhi(Truth t, vec2 uvC) {
  float front = sweepFront(t, uvC);
  float synced = step(0.0, front);                         // 1 behind the front
  float phiLerp = mix(t.phiPrev, t.phi, blendT());
  return (uTime - t.syncT) < 0.8 ? mix(t.phiPrev, t.phi, synced) : phiLerp;   // during a sweep: hard front; otherwise: block lerp
}
vec3 applyFog(vec3 col, float phi, vec2 uv, float seed, float octaves) {
  float fog = 1.0 - phi;                                   // 0 crisp … 0.95 at the Φ floor
  float tAnim = mix(uTime * 0.35, 0.0, uReducedMotion);
  vec2 warp = fog * 0.06 * vec2(snoise(vec3(uv * 6.0 + seed * 40.0, tAnim)), snoise(vec3(uv * 6.0 + 17.0 + seed * 40.0, tAnim)));
  col = sampleTile(uv + warp);                             // the material's own colour lookup, re-sampled at the warped uv
  col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), 0.7 * fog);                     // desaturate
  float grain = hash12(gl_FragCoord.xy + mix(uTime * 60.0, 0.0, uReducedMotion)) - 0.5;
  col += grain * fog * fog * 0.35;                         // static, quadratic so 0.9 Φ is barely grainy and 0.56 is plainly corrupted
  float split = smoothstep(0.75, 0.55, phi) * 0.012;      // below HALLUCINATION_THRESHOLD (0.75) the chroma splits
  col.r = mix(col.r, sampleTile(uv + warp + vec2(split, 0.0)).r, step(0.001, split));
  col.b = mix(col.b, sampleTile(uv + warp - vec2(split, 0.0)).b, step(0.001, split));
  return col;
}
vec3 sweepLight(vec3 col, Truth t, vec2 uvC) {             // the bright band itself, gold into bloom
  float front = sweepFront(t, uvC); float age = uTime - t.syncT;
  float band = (age < 0.8) ? 1.0 - smoothstep(0.0, 0.12, abs(front)) : 0.0;
  return col + vec3(0.83, 0.65, 0.33) * band * 1.4;       // gold display #d4a755
}
vec3 heatGlow(vec3 col, Truth t, float mask) {             // mask: 1 at the seat/roof vent, 0 elsewhere
  float cool = exp(-3.0 * (uTime - uTickT) / uTickSeconds);// flares on the tick, cools before the next one
  float h = t.heat * cool * (0.7 + 0.3 * sin(uTime * 9.0) * (1.0 - uReducedMotion));
  return col + vec3(0.79, 0.32, 0.25) * h * mask;         // ember #c95140
}
float purseArc(Truth t, vec2 uvC) {                        // the purse gauge as an arc around the hex rim, clockwise from 12 o'clock
  float ang = atan(uvC.x, uvC.y) / 6.2831853 + 0.5;        // 0..1
  float rim = smoothstep(0.42, 0.44, length(uvC)) * (1.0 - smoothstep(0.47, 0.49, length(uvC)));
  float purseLerp = mix(texelFetch(uTruthPrev, ivec2(0), 0).g, t.purse, blendT());   // (real code uses the node's prev texel)
  return rim * step(ang, purseLerp);
}
vec3 statusTint(vec3 col, Truth t, vec2 uvC, float rim) {
  if (t.status == 1) col = mix(col, vec3(0.16, 0.65, 0.72), rim * (0.35 + 0.15 * sin(uTime * 2.6)));   // waiting at the Door: cyan, breathing
  if (t.status == 2) col = mix(col, vec3(0.79, 0.32, 0.25), rim * 0.6);                                // halted: ember rim (the Note is DOM)
  if (t.status == 3) { float flick = snoise(vec3(uvC * 3.0, uTime * (0.5 + 4.0 * t.variance))) * t.variance;  // packed: haze that shimmers with its own variance
                       col = mix(col, vec3(0.54, 0.48, 0.39), 0.5 + 0.3 * flick); }
  if (t.status == 4) col *= 0.25;                                                                        // partitioned: dark on the rails
  if (t.held)        col = mix(col, vec3(0.16, 0.65, 0.72), rim * 0.2);                                  // an envelope held (finality at Stage 5)
  return col;
}
```

Reference points the design-system page shows side by side: Φ 1.00 crisp; Φ 0.75 the first chroma split; Φ 0.5636 (the observed floor after twenty uncalibrated handovers) plainly corrupted; Φ 0.05 grey static. The engine computes Φ and `fog`; the shader only draws them.

### 2.5 The StateSync cascade is written, not computed per frame

On `STATE_SYNC { node }` the reducer writes `syncT = arrivedAt` into that node's `uTimes` texel and `syncT = arrivedAt + 0.04 · hexDistance(child, node)` into each descendant's texel (city: ring by ring at 40 ms per hex; room: the Oak Table first, then Desk, Purse, Door at 80 ms per station, which the room material reads from the house's texel plus a per-fixture delay). Zero cross-node lookups in the shader. The reducer keeps `phiPrev` correct for the sweep by not swapping `uTruthPrev` for a node that synced this tick until the sweep is over (it copies the pre-sync Φ, which equals `confidence_before` from the event, into the prev texel).

### 2.6 Gate pulses (`uniform vec4 uPulses[16]`, `uniform vec4 uPulseData[16]`; a ring on the CPU, one uniform upload per event)

`uPulses[i] = (kind, t0, originQ, originR)`, `uPulseData[i] = (a, b, c, d)` by kind: `NETTED` (a = gross, b = net, c = envelopes; a radial ring from the Clearinghouse at 40 ms per hex, whose width shrinks from gross to net as it travels), `ROLLED_BACK` (a = to_tick; a broad colour sweep across the region polygon, back to front, 900 ms), `GLOBAL_STATE_CONFIRMED` (a = latency_ticks; a radar line orbiting the sphere once per `latency_ticks × tickSeconds`, cyan; partitioned countries read `status 4` from their texel and stay dark), `SLASHED` (a = amount; an ember flash on one tile, 400 ms). `APPROVED`/`REJECTED`/`SETTLED`/`DELIVERED`/`PROPOSED` are courier and room clips (Appendix A), not tile pulses.

---

## 3. The altitude camera

### 3.1 One camera, one scalar

A single `PerspectiveCamera`, never swapped. `A ∈ [1, 5]` is the altitude; the integer part names the band the camera is nearest, the fraction is progress toward the next. The camera is placed relative to the focus point `T` (the focused node's world centre, §4) in a spherical frame: `pos = T + d · (cos p · sin y, sin p, cos p · cos y)`, `lookAt(T)`, with distance from the dolly-zoom identity `d = H / (2 · tan(fov / 2))`, so a change of fov never changes the apparent size of the target.

| band | stage | steady range | crosses up at | crosses down at | dissolve window | pitch `p` | yaw `y` | fov | view height `H` (world units) | tick s (pull) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | House (the room) | [1.0, 1.5) | 1.6 → 2 | — | [1.35, 1.65] roof fade (no RT) | 30° | 45° | 4° | 14 | 1.2 |
| 2 | Street | [1.5, 2.5) | 2.6 → 3 | 1.4 → 1 | [2.35, 2.65] RT dissolve | 30° | 45° | 4° | max(70, 2.4 × the street arc's extent) | 0.7 |
| 3 | City | [2.5, 3.5) | 3.6 → 4 | 2.4 → 2 | [3.35, 3.65] | 30° | 45° | 4° | clamp(2.2 × cityRadius, 140, 1200) | 0.4 |
| 4 | Country | [3.5, 4.5) | 4.6 → 5 | 3.4 → 3 | [4.35, 4.65] | 30° → 55° over A ∈ [3.5, 4.0] | 45° | 4° | 6,000 | 0.3 |
| 5 | World | [4.5, 5.0] | — | 4.4 → 4 | — | 55° → 35° over [4.5, 5.0] | 45° + free orbit (drag) | 4° → 40° over [4.5, 5.0] | 16,000 (sphere R = 6,000) | 0.25 |

`H(A)` between bands is log-interpolated: `H = exp(mix(ln H_k, ln H_{k+1}, A − k))`. With fov 4°, `d = 14.3 · H` (room: d ≈ 200; city at H = 400: d ≈ 5,700); with fov 40° at the world, `d ≈ 1.37 · H ≈ 22,000`. `near = d / 50`, `far = 4 d`, updated per frame. Pitch 30° with yaw 45° gives the 2:1 dimetric read of the prototypes and the mood frame; a 4° field of view makes perspective convergence under 2% across the frame, which is the "orthographic-feeling" the decision record asks for without an orthographic camera and a seam. At band 5 the country plane is drawn on the sphere: `Stages/World.ts` places country beacons on a sphere of radius 6,000 and the flat country heightfield is faded out during the dissolve. (Altitude's `uCurvature` curl from flat to sphere is kept as an optional enhancement behind `?morph=1`; the shipped default at 4↔5 is the dissolve, which all three proposals named as the fallback.)

Rig motion: a critically damped spring on `A`, `T`, `y` (`maath/easing.damp`, half-life 120 ms), frame-rate independent. Inputs (`camera/input.ts`): wheel and pinch → `A` target (0.15 per notch), keys `[`/`]` → ±1 band, the HUD stage rail → that band's centre, click on a tile → `T` (raycast on the `InstancedMesh`: `instanceId → slot → NodeId`), drag at band 5 → yaw.

### 3.2 How zooming calls `zoom/<n>`

`Altitude.ts` keeps `band: 1..5` (what the engine was last asked for) and applies **hysteresis**: going up, `band` becomes `k+1` when `A ≥ k + 0.6`; going down, `k` when `A ≤ k + 0.4`. When `band` changes the controller calls `source.zoom(band)` **once**, records `pending = { band, sentTick: store.tick }`, and the stage rail shows the target band as "asking the engine…". A wobble at a threshold cannot thrash pack/unpack because the two lines are 0.2 apart. The engine's `set_active_scale` changes only which gate verifies **new** envelopes; an envelope already presented to the person stays at the Door (`asked_human`), and the Door dialog says so (§5.3). Note the engine rule the lane report documents: at `active_scale = City` every house under every street is packed, so the live Stage 3 demo runs `scenarios::city` placed at the city by configuration; the frontend does not work around this.

### 3.3 The frontend never packs or unpacks

The camera keeps moving (it is a camera), but what exists in the band being entered appears only when the engine confirms:

1. Until confirmation, tiles that will fold (children of the parent being packed) show **stasis haze**: the reducer sets a per-instance `aFold` target of 1 and the shader draws their Φ pulled toward 0.5 with a slow shimmer; the incoming band's content is not drawn at all.
2. Confirmation is the first of: `PACKED { parent, children, seed }` / `UNPACKED { parent, children, macro_ticks, burn_distributed }`, or a `TICK_COMMITTED` whose `active_scale` equals the pending band (nothing had to fold, e.g. the camera moved but no node changed status). `pending` is cleared.
3. On `PACKED`: over 600 ms the children condense into the parent's tile (instance scale → 0 along the hex-distance order, 40 ms per ring), ending in the profile card (the parent's texel now carries `mean_confidence`, `epistemic_variance`); `packT` is written for the parent and children. On `UNPACKED`: the inverse, children appear from the parent's haze in `stochastic_seed` order (a seeded shuffle of the ring cells), purse arcs interpolate from the parent's value to each child's next-frame value over 600 ms, and `burn_distributed` falls as ember particles from the parent tile (count = `min(64, ceil(burn_distributed / 5))`).
4. The typical wait is one tick; showing it as haze is deliberate (latency shown, not hidden).

### 3.4 Cross-dissolve rules at band edges

- 1↔2 (room ↔ street) needs no render target: the room is drawn inside the focused house tile's cutaway (the near two walls omitted, the roof off); as `A` rises through [1.35, 1.65] the roof and near walls fade in (`alpha = smoothstep(1.35, 1.65, A)`), the room fixtures fade out, and the street's other houses fade in from their own fog. Going down is the reverse: the roof lifts.
- 2↔3, 3↔4, 4↔5: the outgoing band renders to a half-resolution target; `Dissolve.ts` composites it over the incoming band through the fog shader as the medium: the outgoing image is fogged progressively (`fog = w`), the incoming one is drawn with a sweep from crisp-at-the-focus outward, `w = smoothstep(k + 0.35, k + 0.65, A)`. While a `pending` zoom is unconfirmed, `w` is clamped to ≤ 0.5 (the incoming band is not shown as existing); on confirmation `w` eases to its target over 600 ms. Reversing the wheel before confirmation just moves `A` back; if the hysteresis line is re-crossed a new `zoom` is sent and the pending record replaced.
- `prefers-reduced-motion`: no RT dissolve; a 150 ms fade through the ground colour `#16110c`, and no haze shimmer.
- The camera never shows a scale the engine is not simulating: the incoming band's tiles are instanced from `state.nodes` whose status is not `packed`; packed nodes render only as their parent's profile card.

---

## 4. Deterministic hex layout from the graph

### 4.1 Axial math (`src/layout/hex.ts`, pointy-top, ~60 lines after Red Blob)

```ts
export type Axial = { q: number; r: number };
export const DIRS: Axial[] = [{q:1,r:0},{q:1,r:-1},{q:0,r:-1},{q:-1,r:0},{q:-1,r:1},{q:0,r:1}];
export const add = (a: Axial, b: Axial): Axial => ({ q: a.q + b.q, r: a.r + b.r });
export const scale = (a: Axial, k: number): Axial => ({ q: a.q * k, r: a.r * k });
export const distance = (a: Axial, b: Axial) => { const dq = a.q - b.q, dr = a.r - b.r; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; };
export function ring(center: Axial, k: number): Axial[] {          // 6k cells, starting at center + DIRS[4]*k, walking DIRS[0..5]
  if (k === 0) return [center];
  const out: Axial[] = []; let h = add(center, scale(DIRS[4], k));
  for (let side = 0; side < 6; side++) for (let i = 0; i < k; i++) { out.push(h); h = add(h, DIRS[side]); }
  return out;
}
export function spiral(center: Axial, n: number): Axial[] { const out = [center]; for (let k = 1; k <= n; k++) out.push(...ring(center, k)); return out; }
export const HEX_SIZE = 6;                                          // world units, centre to corner; flat-to-flat ≈ 10.39, a house interior of 8 × 8 fits
export const toWorld = ({ q, r }: Axial, y = 0) => ({ x: HEX_SIZE * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r), y, z: HEX_SIZE * 1.5 * r });
```

### 4.2 The city algorithm (`src/layout/layoutCity.ts`, pure: `(nodes: NodeView[]) → Layout`)

```ts
export interface Layout { cell: Map<NodeId, Axial>; streets: Map<NodeId, { ringFrom: number; ringTo: number; cells: Axial[] }>; radius: number; ground: Axial[] }
export function layoutCity(nodes: NodeView[]): Layout {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const root = nodes.filter(n => n.parent === null).sort((a, b) => a.id - b.id)[0];     // the City in scenarios::city; Elm Street in scenarios::house
  const cell = new Map<NodeId, Axial>([[root.id, { q: 0, r: 0 }]]);                    // the Clearinghouse (the City node's own tile) at 0,0
  const children = (p: NodeId) => nodes.filter(n => n.parent === p).sort((a, b) => a.id - b.id);   // ascending NodeId: stable, seed-derived
  const streets = root.stage === 'Street' ? [root] : children(root.id);                // a root street lays its houses on ring 1
  let nextRing = 1; const streetInfo = new Map();
  for (const s of streets) {
    const houses = children(s.id);
    const ringFrom = nextRing; const cells: Axial[] = []; let k = ringFrom;
    let ringCells = ring({ q: 0, r: 0 }, k);
    const rot = Number(BigInt(s.id) % BigInt(ringCells.length));                        // the street's own id turns its ring: same seed → same ids → same city
    let idx = rot;
    for (const h of houses) {                                                           // contiguous in spiral order; spill onto the next ring when the ring is full
      if (cells.length > 0 && cells.length % ringCells.length === 0) { k++; ringCells = ring({ q: 0, r: 0 }, k); idx = 0; }
      const c = ringCells[idx % ringCells.length]; cells.push(c); cell.set(h.id, c); idx++;
    }
    if (s !== root) cell.set(s.id, cells[Math.floor(cells.length / 2)] ?? ringCells[rot]);   // a street's own marker: its middle house's kerb (not a tile)
    streetInfo.set(s.id, { ringFrom, ringTo: k, cells }); nextRing = k + 1;
  }
  const radius = nextRing - 1;
  const used = new Set([...cell.values()].map(c => `${c.q},${c.r}`));
  const ground = spiral({ q: 0, r: 0 }, radius + 1).filter(c => !used.has(`${c.q},${c.r}`));   // unlit ground tiles fill the spiral, so the city reads as a colony
  return { cell, streets: streetInfo, radius, ground };
}
```

Worked example, `scenarios::city(config, 2, 3, …)` (the acceptance city): Street 1 (the lower id of the two) takes ring 1, its three houses at cells `rot₁, rot₁+1, rot₁+2` of the six; Street 2 takes ring 2, three contiguous cells of twelve at `rot₂`; the City at `(0,0)` with the Clearinghouse glyph; 19 cells in the spiral of which 7 are lit. A 20–50-house street (Stage 2's spec) needs ring 4–9; it starts on a fresh ring and continues onto the next, so the city stays a solid spiral. The recorded `street` run (`The City` root → `Elm Street` → six houses whose ids arrive out of name order) lays out by id, not by name, and the snapshot test pins it. Streets have no tile of their own: a street is drawn as the kerb ribbon through its cells; a packed street renders its profile card at its marker cell. Country (`layoutCountry.ts`): the Country node at `(0,0)` of its own grid with cities on rings, `HEX_SIZE × 7`; world (`layoutWorld.ts`): countries by ascending id spaced evenly on the sphere's 30° N great circle (minimal, bands 4–5 are minimal in the brief).

Properties a test pins: pure (no `Math.random`, no `Date`), O(n log n), identical for identical `(id, parent, stage)` triples regardless of array order, and stable across ticks (a node's cell never changes while it exists, which the truth buffer's slot ↔ tile binding needs). The layout is recomputed only when the set of `(id, parent)` pairs changes (a hash over the sorted pairs, checked per tick, O(n)).

---

## 5. The DOM UI layer (`src/ui/`)

All text lives in DOM; the canvas draws no glyphs. Fonts: Fraunces (display), Schibsted Grotesk (UI), JetBrains Mono (receipts, hashes, ids). Tokens from the brief in `tokens.css` (`--ground #16110c`, `--panel #1e1710`, `--line #3a2f24`, `--ink #ece2cf`, `--muted #8a7a64`, `--gold-display #d4a755`, `--gold-marks #b98626`, `--cyan #2aa5b8`, `--ember #c95140`, `--sage #6a9a6e`, `--paper #f0e6d2`). DOM updates happen inside `reduce()` on frame arrival and on clip boundaries, never per render frame; the only per-frame DOM work is `transform` updates of ≤ 8 projected labels (`camera/project.ts`).

### 5.1 HUD (`hud.ts`)

- **Stage rail** (top-left): the five stages as a breadcrumb (`Stage::name()`: The House, The Neighborhood, The City, The Country, The World), the engine's `active_scale` in gold, the camera's pending band in muted with "asking the engine…", the gate name under each (`The Door`, `The Letter Slot`, `The Clearinghouse`, `Statutory Law`, the STARK verifier).
- **Block line**: `tick`, `root` (first 8 hex, mono), `executor`, `mempool`, the mode badge (`live · wasm in a worker` / `live · SSE ${hello}` / `recorded run`), and the STARK heartbeat mark: a cyan tick on the rail on `GLOBAL_STATE_CONFIRMED` with `latency_ticks` and the root's first 8 hex.
- **Focus card** (top-right, the focused node): `name`, status pill, purse gauge (`compute` / `compute_allocated`, gold fill, ember below 15%), Φ meter (`confidence` %, `generation`, `fog` %), `tasks_done / tasks_total`, `current_task`, `burned_this_tick` ("0.0 cr this tick" while waiting at the Door, said plainly), `liquidity_belief` vs `liquidity_truth` when they differ (Stage 2's drift), `papers` on the table, `oak_root` first 8 hex.
- **Gates** (bottom-left): `state.gates` lines verbatim (e.g. `The Door (human): 1 asked, 0 yes, 0 no`).
- **Totals** (bottom-right): `totals.compute_burned`, `tax_paid` (with the corrected provenance line from HANDOFF §4.3 on hover), `settled`, `slashed`, `approved`, `rejected`, `waiting`, `halted`.
- Controls: run/pause, step, speed (pull sources), zoom rail, quality toggle, and for the live street demo the "move the truth" button (`setTruthPrice`, wasm only).

Status pill copy (`pills.ts`, the presentation's lines): `active` → "active"; `waiting_at_door` → "waiting at the door · 0.0 cr idle burn"; `halted` → "halted · the note is on the table"; `packed` → "packed · statistical stasis"; `partitioned` → "partitioned".

### 5.2 The Door (`door.ts`, a real `<dialog>`)

```html
<dialog id="door" class="door" aria-labelledby="door-title" aria-describedby="door-desc">
  <form method="dialog">
    <p class="door-kicker">The Porter is at the Door</p>
    <h2 id="door-title">The House</h2>                                    <!-- held.node_name -->
    <p id="door-desc" class="door-desc">send the finished draft for doc_synthesis_01</p>   <!-- held.description -->
    <p class="door-cost">Sending costs <span class="num" id="door-cost">10.0 cr</span>. It comes out of the purse only if you say yes.</p>
    <p class="door-proof"><strong>Nothing burns while you decide.</strong>
      <span id="door-proof-ticks">Held 3 ticks</span> · <span id="door-proof-purse">purse unchanged at 754.95 cr</span> ·
      <span id="door-proof-phi">Φ 97.3% then, 89.3% now</span></p>
    <p class="door-camera" id="door-camera" hidden>The camera is at the Street. This envelope was already presented to you; it stays at the Door.</p>
    <p class="door-queue" id="door-queue" hidden>1 of 2 at the Door</p>
    <menu class="door-actions">
      <button value="no" id="door-no" autofocus>No, leave it on the table</button>
      <button value="yes" id="door-yes" class="primary">Yes, send it</button>
    </menu>
    <p class="door-recorded" id="door-recorded" hidden>Recorded run · the person's answer replays at the recorded tick</p>
  </form>
</dialog>
```

Controller states: `closed → open(envelope) → deciding(envelope, answer) → closed`.

- **Open** on `AWAITING_HUMAN_SIGNATURE { node, envelope, description, cost }` **or** on any frame whose `state.held` contains an entry with `reason === 'awaiting_human_signature'` not yet shown (the trace's first frame carries both; the controller keys by `envelope` so it opens once). It records `openedAt = { tick, compute: node.compute, confidence: node.confidence }` for the proof line. `showModal()` (the canvas keeps animating behind it; `showModal` blocks DOM interaction only).
- **Proof line**, recomputed on every frame while open: `Held N ticks` with `N = state.tick − held.created_tick`; `purse unchanged at X cr` when `node.compute === openedAt.compute`, otherwise the honest line `purse X cr → Y cr (topped up)`; `Φ a% then, b% now` from `openedAt.confidence` and `node.confidence` (truth decays while you wait; doc 02's rule, shown, not hidden). With the recorded house run at tick 4 this reads "Held 3 ticks · purse unchanged at 754.95 cr · Φ 97.3% then, 89.3% now".
- **Buttons**: Yes → `app.command({ decision: 'approve', envelope })` → `source.authorize(envelope)`; No → `reject`. The dialog does not close on click; it shows "sent to the Door…" and closes when the engine answers: an `APPROVED`/`REJECTED` for that envelope, or a frame whose `held` no longer lists it (tick 5 in the recording: `held` is empty, `compute` 754.95 → 744.95, the 10 cr send cost taken only after the yes). If the source answers `false` (no Door holds that id) the dialog says so and re-reads `held`.
- Escape and backdrop clicks are cancelled (`cancel` event `preventDefault`): closing the dialog is not a decision, and the engine's own state decides when it goes. Focus starts on **No**.
- **Camera note** shown when `state.active_scale !== 'House'`: the envelope stays at the Door whatever the camera does.
- **Queue**: several held envelopes show one at a time in `created_tick` order with "k of n at the Door".
- **Recorded run**: buttons disabled, the recorded answer arrives as a `decisions` entry on a later frame and is echoed for 600 ms on the matching button ("recorded: yes") before the state closes the dialog.
- `awaiting_finality` entries (Stage 5) never open the Door; they are a HUD line "held for finality until tick N" from `AWAITING_FINALITY`.

### 5.3 Receipts and the event feed (`receipts.ts`)

`node.receipts` lines verbatim in mono (newest first; 6 from wasm/SSE, 3 in the trace), and a 40-line event feed with one plain sentence per event (Appendix A's "feed line" column), e.g. `t5 · approved at the Door · env 3930624385311261`, `t7 · rejected at the Letter Slot · hash mismatch: believed courier at 10.00, truth differs (epistemic drift) · 0.5 cr sunk`, `t11 · The House paid the oracle 15 cr · Φ 73.2% → 100%`.

### 5.4 The Note (`note.ts`)

Shown when `node.note !== null` (and on `HALTED`), a paper card (`--paper` on `--ground`, Fraunces heading "A note on the table", Schibsted body): `doing` ("lookup (Scout, 280 tok on fast_quantized)"), `compute_burned_total`, `compute_remaining`, `joules_burned_total`, `papers_on_table`, `saved_state`, and the reason line from `Note::to_plain_line`: `runway_exhausted` → "Runway exhausted. A person must top up or close." (with `shortfall`), `closed` → "Closed by the person. The week is over.", `slashed` → "Slashed by the High Court. Reserves seized." (with `amount`), `partitioned` → the engine's fourth line. Below: a top-up field and button → `top-up/<node>/<credits>` (`TOPPED_UP` then lifts the note when `note` returns to `null`). There is no close-the-week command in the API; none is drawn.

### 5.5 Speech bubbles (`bubbles.ts`) and motion (`motion.ts`)

`THOUGHT { node, seat, text }` → a DOM bubble anchored to the seat's station (room) or the house tile (street), projected each frame, 2.4 s, at most three per node. `motion.ts` holds the durations table (Appendix A) and halves or removes them under `prefers-reduced-motion` (`uReducedMotion = 1`, bubbles appear without slide, the Door opens without scale).

---

## 6. Tests without a GPU

Three tiers; the first two need no GPU and run in CI on any runner.

**Tier 1, vitest (node):** `hex.test.ts` (ring sizes 6k, distance symmetric, spiral(3) = 37 cells), `layout.test.ts` (snapshot of `layoutCity(trace.street[0].state.nodes)`; array-order independence; a 5,000-node synthetic graph lays out in < 50 ms; stability across all 30 street frames), `slots.test.ts`, `truthPack.test.ts` (Φ round-trips within 1e-3; codes exact), `clips.test.ts` (each of the 22 event types maps to exactly one moment or to `none`), `altitude.test.ts` (hysteresis: a sequence 2.55, 2.62, 2.58, 2.41, 2.38 produces exactly two `zoom` calls: 3 then 2), `reducer.test.ts` (the reducer runs once per frame and never from the render loop: a spy on `reduce` after 300 `renderer.frame(dt)` calls stays at the frame count), `contract-wasm.test.ts` (the real wasm in Node, §1.1).

**Tier 2, vitest (jsdom) with a null renderer.** `Renderer` is an interface; `NullRenderer` implements `mount/resize/frame/dispose` as no-ops and records the uniforms it was given. jsdom lacks `HTMLDialogElement.showModal`; `tests/setup.ts` polyfills `showModal`/`close` to toggle the `open` attribute. The acceptance test:

```ts
// tests/dom/door.test.ts
import trace from '../../public/traces/trace.json';
import { App } from '../../src/app/App'; import { TraceSource } from '../../src/source/TraceSource'; import { NullRenderer } from '../../src/render/Renderer';

test('the DOM shows the Door at the recorded tick and closes when the engine says so', async () => {
  const source = new TraceSource(trace.house, { version: trace.version, scenario: 'house', seed: 7 });
  const app = await App.boot({ source, renderer: new NullRenderer(), root: document.body });
  const door = document.querySelector<HTMLDialogElement>('dialog#door')!;
  expect(door.open).toBe(false);
  await source.stepTo(1);
  expect(door.open).toBe(true);
  expect(door.querySelector('#door-desc')!.textContent).toBe('send the finished draft for doc_synthesis_01');
  expect(door.querySelector('#door-cost')!.textContent).toBe('10.0 cr');
  expect(door.textContent).toContain('Nothing burns while you decide');
  expect(door.querySelector('#door-yes')!.textContent).toBe('Yes, send it');
  expect(door.querySelector('#door-no')!.textContent).toBe('No, leave it on the table');
  await source.stepTo(4);
  expect(door.open).toBe(true);
  expect(door.querySelector('#door-proof-ticks')!.textContent).toBe('Held 3 ticks');
  expect(door.querySelector('#door-proof-purse')!.textContent).toBe('purse unchanged at 754.95 cr');
  expect(document.querySelector('#focus-status')!.textContent).toBe('waiting at the door · 0.0 cr idle burn');
  await source.stepTo(5);                          // frame 5 carries the recorded approve; held is empty; APPROVED at tick 5
  expect(door.open).toBe(false);
  expect(document.querySelector('#feed')!.textContent).toMatch(/t5 · approved at the Door/);
  expect(document.querySelector('#focus-purse')!.textContent).toContain('744.95');
});
```

Companions: `note.test.ts` (`house_hidden_cost`, tick 9: the Note is visible, contains "Runway exhausted", `compute_remaining` 16.2), `street.test.ts` (`street`, tick 7: the feed shows the hash-mismatch rejection and `liquidity_belief ≠ liquidity_truth` appears on the focus card), `no-leaderboard.test.ts` (after every frame of every recorded run, `document.body.textContent` does not match `/\b(score|rank|reputation|leaderboard|rating)\b/i`), `hud.test.ts` (the tick and the root's first 8 hex match `state`), `values-on-screen.test.ts` (every number rendered in the focus card is found in the current `Frame`'s state or events; a regex over the card's text against a set built from the frame).

**Tier 3, Playwright + Chromium `--use-angle=swiftshader --enable-unsafe-swiftshader` (software WebGL2, verified by the Altitude author on Chrome 153):** `shaders.spec.ts` fails on any console shader error; `drawcalls.spec.ts` loads `?source=fixture&fixture=city-5000` and asserts `renderer.info.render.calls ≤ 12`; `goldens.spec.ts` takes 480 × 270 screenshots per band from the trace with `page.clock` frozen and compares with `pixelmatch` at ≤ 0.5%. `glslangValidator` is run on every chunk when present (optional). Goldens are regenerated on a Chromium bump; Playwright is pinned.

---

## 7. Performance plan: 5,000 instances at 60 fps on a laptop

| budget | number | how it holds |
|---|---|---|
| draw calls at Stage 3 | ≤ 12 | tiles 1 (`InstancedMesh`, hex prism: 6 top + 12 side triangles, 36 indices, 5,000 instances = 90k triangles); ground tiles share it; couriers 1 (instanced quads, cap 1,024); tubes 1 (instanced ribbons, cap 512); room fixtures 1 (instanced SDF quads, cap 64, band 1 only); country heightfield 1, world sphere + beacons 2 (band-gated); dissolve composite 1; bloom 3 at half res (quality ≥ balanced); the Playwright test asserts the count |
| CPU per render frame | ≤ 2 ms | uniform writes (`uTime`, `uTickT`, camera), spring step, ≤ 8 label projections; no state walks (`reducer.test.ts`) |
| CPU per tick | ≤ 8 ms main thread at 5k | JSON parse and `packTruth` in the worker; the main thread does structured-clone receipt, `reduce()` O(n) over 5k nodes (~1 ms), one `texImage2D` of 512 KB (`uTruth.needsUpdate`); `uTimes` uploaded only when an event touched it |
| GPU per frame at 1080p | ≤ 8 ms on Apple M1 / Intel Iris Xe | one 3D simplex sample per fragment per octave: octaves 3 in band 1, 2 in band 2, 1 in bands 3–5 (`uAltitude`-driven); chroma split re-samples only below Φ 0.75; the fog pass at half resolution when `devicePixelRatio ≥ 2`; `renderer.setPixelRatio(min(dpr, 2))`, 1.5 on the "low" quality setting; bloom off on "low" |
| memory | < 8 MB GPU | textures 0.5 + 0.5 + 1 MB; instance buffers 5k × (16 + 5) floats; two half-res RTs during a dissolve only |
| culling | none per instance | `frustumCulled = false` on the tile mesh; the vertex shader collapses instances outside the band's visible ring radius to scale 0 (`aFold`), cheaper than per-instance culling |
| animation | zero CPU | block lerp, sweep, heat cooling, pulses, breathing, haze are all functions of `uTime` and the textures |

Measured, not assumed: `?stats=1` overlays `renderer.info` and a 120-frame rolling frame time (the only per-frame DOM write, and only in that mode); the recording plan records the laptop, resolution and quality setting for every take. The fixture `tests/fixtures/synthetic-city-5000.json` (generated by `scripts/synth-city.ts`: 1 city, 50 streets × 100 houses, seeded, `NodeView`-shaped, labelled synthetic in the HUD) is the performance proof, since the live city scenario is 2 × 3; the video must say so. Fallbacks in order: drop bloom, half-res fog, 1 noise octave, DPR 1.5.

---

## 8. Where the proposals disagreed, and what was chosen

### 8.1 The decision table

| topic | Truth Buffer | One Quad, Five Scales | Altitude | chosen here (decision record + this map) |
|---|---|---|---|---|
| renderer | three.js WebGL2, WebGPU flag | raw WebGL2 + twgl, one instanced quad, no WebGPU | three.js + `postprocessing` (bloom, SMAA) | three.js on WebGL2, `WebGPURenderer` behind `?renderer=webgpu` (honest note: GLSL materials do not run there; the flag falls back to WebGL until a TSL tile material exists); bloom optional by quality |
| per-node data | 512² RGBA16F texture, R Φ / G purse / B burn / A status+sync | 12-float `Float32Array` instance buffer | per-instance `aConfidence/aBurn/aStatus/aUnpack` | RGBA16F truth + RGBA16F previous + RGBA32F times textures (§2), static instance attributes only; reason: shared lookups, one upload per tick, fp32 for times |
| camera | ortho S1–3, perspective S4–5, matched-frustum trick at 3→4 | 2D affine `{x, y, zoom}` + iso skew | one `PerspectiveCamera`, fov 4° → 40°, `uCurvature` curl | Altitude's rig: one perspective camera, 4° through band 4, opening at band 5; dissolve at 4↔5, curl optional (§3) |
| LOD transition | 600 ms fog-medium blend on Packed/Unpacked | 400 ms dissolve-and-scale, `engine_zoom` at the midpoint | hysteresis 0.6/0.4, condense/fold on events | hysteresis 0.6 up / 0.4 down; `zoom/<n>` at the crossing; 600 ms fog-medium dissolve gated on Packed/Unpacked or the confirming TickCommitted (§3.2–3.4) |
| UI layer | Preact + signals | plain DOM, Preact as escape hatch | Solid, troika text in scene | plain DOM (jsdom-testable, no framework in tests); no in-canvas text |
| stream transport | WebSocket | WebSocket | WebSocket JSON lines | **SSE** (`GET /events`) + `POST` commands: the server that exists speaks SSE; all three wrote before `serve.rs` did |
| types | hand-written | hand-written | `ts-rs` from the Rust structs | hand mirror + a real-wasm contract test now; `ts-rs` later |
| scale target | 50k tiles | n/a | ~10k | 5,000 (the brief's acceptance) with 65k slots of headroom |
| noise | Ashima 3D simplex | 3-octave fbm | simplex + domain warp + chroma split below 0.75 | Ashima 3D simplex, domain warp, chroma split below `HALLUCINATION_THRESHOLD`, octaves by band |
| ids | strings or a reviver | `BigInt` at the boundary | — | numbers (verified < 2^52 by `mint_id`), `BigInt` only at the wasm boundary, decimal on SSE paths |
| Stage 1 room | later | SDF fixtures on quads, seats as quads | `clippingPlanes` cutaway of the house tile | the room is the house tile's interior: SDF fixtures on instanced quads, near walls omitted, roof fades with altitude (§3.4) |
| recording | CDP per-frame PNG → ffmpeg | Playwright screenshot per frame + director track JSON → ffmpeg | WebCodecs + mp4-muxer | Playwright per-frame PNG + ffmpeg with a director track (fewest moving parts; ffmpeg is installed); WebCodecs optional |
| tests | vitest on real wasm, glslang, Playwright draw-call budget | 95% pure functions, SwiftShader goldens, determinism | SwiftShader goldens, console shader errors | all of them, tiered (§6); the DOM tier is the acceptance test |
| build order | S3 grid first | — | — | S1 room + Door first (acceptance 2 and the trace exist), S3 second (the performance proof on the synthetic fixture), S2 third, then 4–5 minimal |

### 8.2 What the decision record settled that the proposals left open

Render only `StateView` + events; one `EngineSource`; the three implementations; deterministic axial layout; fog = 1 − Φ in a noise shader; the LOD animation only on `Packed`/`Unpacked`; the Door as a real `<dialog>` with the exact two button labels and the proof line; DOM for all UI; `zoom/<n>` as the only way the frontend changes scale.

### 8.3 Engine-side dependencies this map surfaces (laboratory notes, not done here)

1. `wasm_abi.rs::engine_new` maps only `1` → house and `2` → street; deliverable 3 (Stage 3 against `scenarios::city`) needs `3 => scenarios::city(config, 2, 3, budget, tasks)` (three lines) and `serve.rs` a `--scenario city` arm.
2. `serve.rs` binds `127.0.0.1` and has no `--bind`; a Cloud Run demo needs `0.0.0.0` and `$PORT` (§1.4).
3. SSE tick frames carry `{report, events}` without `state`; the frontend does one `GET /state` per tick. Adding `"state": engine.state_view()` to the payload is optional and removes the round trip.
4. `trace.json` has no `seed` per run and no `city` run; re-record after (1).
5. `EnvelopeId`/`NodeId` stay numbers; if ids ever exceed 2^53 the SSE path must move to strings (not today).

---

## 9. Module map (Vite + TypeScript + three.js) and who owns what

```
frontend/
  package.json · vite.config.ts (vite-plugin-glsl for #include) · tsconfig.json · vitest.config.ts (projects: unit=node, dom=jsdom) · playwright.config.ts
  index.html                       the app shell: <canvas id="stage">, #hud mount points, <dialog id="door">, #note, #receipts, #feed, mode banner
  design-system.html               deliverable 1: tokens, type, five stage palettes, tile and actor kit, motion rules, Φ reference strip
  public/engine/context_engine.wasm  copied from ../engine/dist by scripts/copy-wasm.ts
  public/traces/trace.json         copied from ../presentation/trace.json
  src/contract/state.ts            StateView/NodeView/HeldView/Totals/TickReport/PackedStatisticalState/Note/HaltReason (mirror of tick.rs, lod.rs, receipt.rs)
  src/contract/events.ts           the 22-variant EngineEvent union, tag "type"
  src/contract/ids.ts              NodeId/EnvelopeId as number; toU64(id): bigint; assertJsonSafe
  src/source/EngineSource.ts       Frame, Decision, SourceHello, SourceStatus, EngineSource (§1.2)   [day-0 seam]
  src/source/WasmSource.ts         main-thread proxy: start/step/commands over postMessage, ack correlation
  src/source/wasm.worker.ts        instantiateStreaming, engine_* calls, memory.buffer re-fetch, JSON parse, slots + packTruth, transferables
  src/source/SseSource.ts          EventSource hello/tick/lagged, GET /state per tick, POST commands, VITE_ENGINE_URL
  src/source/TraceSource.ts        trace.json replay: step/stepTo/seek, decisions echo, recorded banner
  src/source/TickClock.ts          pull-source scheduling: run/pause/step/speed, per-band tick seconds
  src/store/Store.ts               app state: last Frame, slots, layout, focus, door queue, notes, feed; subscribe()   [day-0 seam]
  src/store/reducer.ts             reduce(frame): the one O(n) pass → truth pack (sse/trace), clips, DOM patches, layout rehash
  src/store/slots.ts               NodeId → slot, first-seen, never freed
  src/store/clips.ts               Clip type, event → Clip table (Appendix A), the pulse ring (16), the tick stagger   [day-0 seam]
  src/layout/hex.ts                axial math (§4.1)
  src/layout/layoutCity.ts         layoutCity(nodes) (§4.2)
  src/layout/layoutCountry.ts      country grid, cities on rings, HEX_SIZE × 7 (minimal)
  src/layout/layoutWorld.ts        countries on the sphere by id (minimal)
  src/render/Renderer.ts           Renderer interface { mount, resize, frame(dt), setStore, dispose } + NullRenderer   [day-0 seam]
  src/render/ThreeRenderer.ts      WebGLRenderer setup, ?renderer=webgpu flag, DPR cap, quality toggle, band-gated scene list, post chain
  src/render/truth/TruthBuffer.ts  the three DataTextures, swap prev/current, write syncT/packT/haltT, cascade writes (§2.5)
  src/render/truth/uniforms.ts     the shared uniforms object (uTime, uTickT, uTickSeconds, uAltitude, uReducedMotion, uPulses…)   [day-0 seam]
  src/render/shaders/noise.glsl    Ashima 3D simplex (MIT) + hash12
  src/render/shaders/truth.glsl    fetchTruth, visiblePhi, applyFog, sweepLight, heatGlow, purseArc, statusTint (§2.4)
  src/render/shaders/tile.vert     instance placement, aFold collapse, band scale
  src/render/shaders/tile.frag     hex prism faces: ground / house facade (band 2) / city tile (band 3) / Clearinghouse glyph; pulses
  src/render/shaders/room.frag     SDF fixtures: the Desk, the Purse (fill = purse), the Oak Table (papers = `papers`), the Door (cyan when held); seats
  src/render/shaders/courier.frag  courier sprite, Letter Slot handshake (four beats), hash-mismatch snap-back
  src/render/shaders/tube.frag     Clearinghouse tubes and the Netted gross → net ring
  src/render/shaders/fogpass.frag  the fullscreen fog medium used by Dissolve
  src/render/stages/Room.ts        Stage 1 scene: fixtures, five seat stations, walks (Porter to the Door), Thought anchors, roof/wall fade
  src/render/stages/Street.ts      Stage 2 scene: house facades on the ring arc, kerb ribbon, letter slots, couriers, Settled/Rejected clips
  src/render/stages/City.ts        Stage 3 scene: the tile InstancedMesh (+ ground), tubes, the Clearinghouse, Netted, Slashed, Packed/Unpacked folds
  src/render/stages/Country.ts     Stage 4 minimal: seeded heightfield with shader contours, cities as tiles, RolledBack sweep, Voided
  src/render/stages/World.ts       Stage 5 minimal: sphere, country beacons, rails, GlobalStateConfirmed radar, partition dark
  src/render/Dissolve.ts           half-res RT blend at band edges, pending-zoom clamp, reduced-motion fade
  src/camera/bands.ts              the band table of §3.1 as data   [day-0 seam]
  src/camera/Altitude.ts           A, spring, fov/dolly/pitch, hysteresis, zoom calls, pending confirmation (§3.2–3.3)
  src/camera/project.ts            worldToScreen for DOM labels and bubbles
  src/camera/input.ts              wheel/pinch/keys/rail/click/drag → altitude and focus
  src/ui/tokens.css · hud.css · door.css · note.css
  src/ui/hud.ts                    stage rail, block line, focus card, gates, totals, controls
  src/ui/door.ts                   the <dialog> controller (§5.2)
  src/ui/note.ts                   the Note card and top-up (§5.4)
  src/ui/receipts.ts               receipts ledger and event feed (§5.3)
  src/ui/bubbles.ts                Thought bubbles
  src/ui/pills.ts                  status pill copy
  src/ui/motion.ts                 durations table, prefers-reduced-motion
  src/app/App.ts                   wiring: source → store → renderer + ui; app.command(); app.step(dt) for director mode; App.boot()
  src/app/main.ts                  boot from the URL: ?source=wasm|sse|trace&run=house|street|city&seed=7&budget=800&tasks=15&cost=1&take=…
  src/app/director.ts              Take loader: fixed dt, keyframes (A, T, yaw, ease, hold), tick seconds, HUD toggles, captions → SRT
  tests/setup.ts                   jsdom dialog polyfill
  tests/unit/*.test.ts             hex, layout, slots, truthPack, clips, altitude, reducer, contract-wasm
  tests/dom/*.test.ts              door, note, street, hud, no-leaderboard, values-on-screen
  tests/gpu/*.spec.ts              shaders, drawcalls, goldens (Playwright + SwiftShader)
  tests/fixtures/                  synthetic-city-5000.json, layout snapshots, goldens/
  scripts/copy-wasm.ts · synth-city.ts · record-trace.ts (wraps ../presentation/record_trace.mjs, adds seed) · render.ts (director → PNG frames → ffmpeg)
  docs/RECORDING-PLAN.md           deliverable 4: shot list keyed to seeds and ticks (house seed 7: Door at t1, yes at t4, oracle at t11, heartbeat at t16; street seed 7: truth moves before t7, hash-mismatch revert at t7; city: Netted per tick), laptop and quality noted per take
```

### 9.1 Five agents, disjoint files

| agent | owns | delivers first |
|---|---|---|
| A · engine sources | `src/contract/*`, `src/source/*`, `src/store/*`, `tests/unit/{contract-wasm,slots,truthPack,clips,reducer}`, `scripts/{copy-wasm,record-trace}` | day 0: `contract/*`, `EngineSource.ts`, `Store.ts` signatures, `clips.ts` types; then TraceSource (tests depend on it), WasmSource, SseSource |
| B · room and street | `src/render/stages/{Room,Street}.ts`, `src/render/shaders/{room,courier}.frag` | Room against the trace with the Door beats; Street with Settled and the hash-mismatch revert |
| C · city, country/world, truth buffer, performance | `src/render/truth/*`, `src/render/shaders/{noise,truth,tile.*,tube,fogpass}`, `src/render/stages/{City,Country,World}.ts`, `src/render/ThreeRenderer.ts`, `src/render/Dissolve.ts`, `scripts/synth-city.ts`, `tests/gpu/*` | day 0: `uniforms.ts`, `Renderer.ts` (with NullRenderer); then the tile mesh + truth textures on the 5,000 fixture (the draw-call test), then Netted |
| D · camera and layout | `src/camera/*`, `src/layout/*`, `tests/unit/{hex,layout,altitude}` | day 0: `bands.ts`; then hex + layoutCity with snapshots; then Altitude with hysteresis and pending-zoom |
| E · HUD, Door, design system, DOM tests, recording | `src/ui/*`, `index.html`, `design-system.html`, `src/app/*`, `tests/setup.ts`, `tests/dom/*`, `scripts/render.ts`, `docs/RECORDING-PLAN.md` | the Door dialog and `door.test.ts` against TraceSource + NullRenderer (acceptance 2's test can be green before any pixel exists); then HUD, Note, receipts; the design-system page; the take format and shot list |

Day-0 seams (written first, then frozen; any change is a pull request to all five): `src/contract/*`, `src/source/EngineSource.ts`, `src/store/Store.ts` and `clips.ts` types, `src/render/Renderer.ts`, `src/render/truth/uniforms.ts`, `src/camera/bands.ts`. Everything else is private to its agent. Integration point: `App.ts` (E) instantiates A's source, C's renderer, D's camera and E's UI against the store; a stage module registers itself with the renderer by band (`renderer.register(band, stage)`), so B and C never edit each other's files.

---

## Appendix A · one orchestrated moment per event (the `clips.ts` table)

| event | who draws it | the moment | duration | feed line |
|---|---|---|---|---|
| `THOUGHT` | bubbles (DOM) | a bubble at the seat's station | 2.4 s | `t{tick} · {seat}: {text}` |
| `BURN` | room / tile | ember flare at the seat (room) or roof vent (street/city); `heat` channel from the next frame keeps it warm; `cache_hit` draws a smaller, cooler flare | to the next tick | `t · {seat} burned {credits} cr ({joules} J, {tier}{, cache hit})` |
| `PROPOSED` | room → courier | Scribble's paper goes to the Oak Table, the Porter carries it to the Door (room); a courier leaves the house's letter slot toward `to` (street) | 900 ms | `t · proposed {kind} to {to} · tax {tax_paid} cr` |
| `DROPPED_BY_COURIER` | courier | the courier stops at the kerb and the envelope dissolves | 500 ms | `t · dropped by the courier: {reason}` |
| `AWAITING_HUMAN_SIGNATURE` | door (DOM) + room | the Door opens; the Porter stands at the Door; the house's status tint breathes cyan; the whole node pauses | until decided | `t · the Porter is at the Door: {description} ({cost} cr)` |
| `AWAITING_FINALITY` | HUD + world | a held mark on the country beacon until `until_tick` | until then | `t · held for finality until t{until_tick}` |
| `APPROVED` | room / courier / tube by `gate` | the Door frame glows warm and the Porter steps out (House); the handshake completes (Street); the tube lights (City) | 600 ms | `t · approved at {gate_name}` |
| `REJECTED` | room / courier by `gate` | the paper returns to the table, ember (House); the handshake snaps back red with a ripple of static, "hash mismatch" caption when the reason says so (Street) | 700 ms | `t · rejected at {gate_name} · {reason} · {sunk_compute} cr sunk` |
| `SLASHED` | tile pulse | ember flash on the node, the purse arc drops | 400 ms | `t · slashed {amount} cr · {reason}` |
| `SETTLED` | courier | the atomic handshake at the kerb: lock, swap, verify, settle in four beats between `from` and `to` | 800 ms | `t · settled {amount} between {from} and {to}` |
| `DELIVERED` | courier / room | the envelope enters `to`'s letter slot | 300 ms | `t · delivered to {to}` |
| `STATE_SYNC` | truth (sweep) | the cascading light sweep, fog cleared behind the front | 600 ms + cascade | `t · paid the oracle {cost} cr · Φ {confidence_before}% → 100%` |
| `HALTED` | note (DOM) + tile | the Note drops onto the table; ember rim | until top-up | `t · halted: {reason line}` |
| `SEAT_FAILED` | room | the seat's quad flickers and returns to its station; nothing on the table moves | 400 ms | `t · a seat failed mid-draft; the table is untouched` |
| `VOIDED` | country | the envelope's line is struck through in sage | 500 ms | `t · voided by the court: {reason}` |
| `TOPPED_UP` | room + note | coins into the Purse fixture, the Note lifts | 600 ms | `t · topped up {credits} cr` |
| `PACKED` | city (fold) | children condense into the parent's profile card, ring by ring | 600 ms | `t · {children} children packed into {parent}` |
| `UNPACKED` | city (unfold) | the parent's haze condenses into children, purse arcs interpolate, `burn_distributed` falls as embers | 600 ms | `t · {parent} unpacked {children} children after {macro_ticks} macro-ticks` |
| `NETTED` | tube pulse | the end-of-tick pulse through the Clearinghouse: gross in, net out, ring width shrinking from gross to net | 40 ms × radius | `t · netted {envelopes} envelopes · gross {gross} → net {net}` |
| `ROLLED_BACK` | country pulse | the region sweeps backwards to `to_tick`; `slashed` count shown | 900 ms | `t · rolled back to t{to_tick} · {reason} · {slashed} slashed` |
| `GLOBAL_STATE_CONFIRMED` | world pulse + HUD | the radar line orbits once over `latency_ticks`; `partitioned` countries go dark; the heartbeat mark on the rail | latency_ticks × tick s | `t · STARK heartbeat · root {root8} · {latency_ticks} ticks` |
| `TICK_COMMITTED` | HUD | the block line updates (`tick`, `root`, counts); confirms a pending zoom when `active_scale` matches | instant | `t · block committed · {nodes_active} active, {nodes_waiting} waiting, {nodes_halted} halted, {nodes_packed} packed` |

## Appendix B · constants the frontend reads but never computes

`confidence` floor 0.05 and ceiling 1.0 (brief); `HALLUCINATION_THRESHOLD` 0.75 (the chroma split); `OBSERVED_CONFIDENCE_AFTER_20_HANDOVERS` 0.5636 (the design-system reference tile); `DECAY_FACTOR` 0.97174 per idle tick (visible as Φ then/now on the Door); `ORACLE_COST` 15 cr (the StateSync feed line); send fee 10 cr (the Door's cost in the recording); `stark_period` 16 ticks (default `EngineConfig`); `serve` interval 700 ms; ids < 2^52; `trace.json` house run: Door at ticks 1, 6, 11, …; recorded yes at frames 5, 10, 15, …; `STATE_SYNC` at tick 11 (`confidence_before` 0.7324); `GLOBAL_STATE_CONFIRMED` at tick 16 (`latency_ticks` 32); `house_hidden_cost` halts at tick 9 with `shortfall` 11.8; `street` run: truth moved to 12 before tick 7, hash-mismatch rejection at tick 7.
