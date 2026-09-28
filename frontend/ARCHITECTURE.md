# ARCHITECTURE.md · module map, contracts and lanes

**Scope.** The frontend of *The Agentic Economy* under `/home/user/agentic-economy/frontend/`: Vite + TypeScript + Three.js on WebGL2. Derived from map ARCHITECTURE and map CONTRACT; every type below was checked against `engine/src/events.rs`, `engine/src/tick.rs`, `engine/src/wasm_abi.rs`, `engine/src/bin/serve.rs` at commit `a242ae3` and against `presentation/trace.json` (recorded 2026-09-28 22:33, `context-engine 0.1.0 (wasm32, sequential executor)`, seed 7). The design it implements is `DESIGN.md`. Rules every module obeys: render only `StateView` and `EngineEvent`; never simulate; every animation is keyed off an event, never off polling; no per-frame walk of state; no score, rank, reputation or leaderboard on screen (a DOM test enforces it, mirroring the engine's `there_is_no_leaderboard`).

## 0. The shape in one paragraph

One `EngineSource` (wasm in a Worker, SSE from `serve`, or a recorded trace) produces a `Frame { tick, state, events, decisions }` once per engine tick. A single `reduce(frame)` pass, the only O(nodes) work per tick, writes per-node truth into three small data textures, turns events into timed **clips**, and patches the DOM (HUD, the Door `<dialog>`, receipts, the Note). Between ticks the CPU touches nothing but uniforms: fog, purse, heat, status, the STATE_SYNC sweep and the gate pulses are evaluated in the shaders from the truth textures and the pulse ring. One `PerspectiveCamera` (fov 4°, dimetric-feeling) whose position, target and band are functions of one altitude scalar `A ∈ [1, 5]`; crossing a band's hysteresis line calls `zoom/<n>` once, and the fold/unfold is drawn only when `PACKED` / `UNPACKED` (or a confirming `TICK_COMMITTED`) arrives. Hex axial coordinates are a pure function of the graph keyed by `NodeId`, so the same seed lays out the same city and a take can be re-shot frame for frame. Each scene band (room, street, city, atlas) registers one `SceneBand` with the app and subscribes to one `SceneBus`. Tests replay `trace.json` through the same store and DOM with a null renderer, and Playwright on SwiftShader replays it through the real page.

## 1. Lanes and ownership

Seven lanes, disjoint files. A lane edits only its own files; anything two lanes need lives in the scaffold lane and is frozen on day 0 (§9). Cross-lane imports are allowed only from `src/engine/**` (scaffold), `src/scene/camera/project.ts` (atlas) and `src/scene/room/actors/**` (room; the street lane imports the peg-cat).

| lane | owns | delivers first |
|---|---|---|
| **scaffold** | `package.json`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `index.html`, `.env.example`, `src/main.ts`, `src/engine/**` (contract, sources, store, layout, GPU truth kernel, tile mesh), `src/app/**`, `public/**`, `scripts/copy-wasm.ts`, `scripts/record-trace.ts` | day 0: the seams of §9; then `TraceSource` (every DOM test depends on it), the tile mesh on the 5,000 fixture, `WasmSource`, `SseSource` |
| **room** | `src/scene/room/**` | the room against `trace.house` with the Door beats |
| **street** | `src/scene/street/**` | six cottages on the ring, `SETTLED` and the hash-mismatch revert against `trace.street` |
| **city** | `src/scene/city/**` | the Clearinghouse and the `NETTED` pulse against scenario 3 in wasm |
| **atlas** | `src/scene/atlas/**` (Stages 4–5), `src/scene/camera/**` (the altitude rig, input, `project()`, dissolves) | day 0: `bands.ts`; then the rig with hysteresis and pending confirmation; then minimal country and world |
| **ui** | `src/ui/**` (HUD, the Door dialog, receipts, the Note, bubbles, ticker, settings, sound), `src/styles/**` | the Door dialog green in `tests/dom/door.test.ts` before any pixel exists; then HUD, Note, receipts |
| **design-page** | `design/index.html` | the design-system page: tokens, type, the five stage palettes, the tile and actor kit, motion rules, a Φ reference strip (1.00, 0.75, 0.5636, 0.05) |
| **qa** | `tests/**`, `scripts/synth-city.ts`, `scripts/render.ts`, `RECORDING-PLAN.md` | `tests/setup.ts` and the no-leaderboard scan; the Playwright SwiftShader project; goldens; the shot list |

### 1.1 Module map, file by file

```
frontend/
  package.json                          scaffold   deps: three, maath; dev: vite, typescript, vitest, jsdom, @playwright/test, pixelmatch, pngjs, vite-plugin-glsl
  vite.config.ts                        scaffold   vite-plugin-glsl (#include), two HTML entries (index.html, design/index.html), aliases @engine @scene @ui
  tsconfig.json                         scaffold   strict, ES2022, lib dom + webworker
  vitest.config.ts                      scaffold   projects: unit (node), dom (jsdom, setupFiles tests/setup.ts)
  playwright.config.ts                  scaffold   project "swiftshader": chromium, headless, args --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist
  index.html                            scaffold   shell: <canvas id="stage">, #hud, <dialog id="door">, #note, #receipts, #feed, #ticker, #labels, #banner
  .env.example                          scaffold   VITE_ENGINE_URL=http://127.0.0.1:8787 (no secret ever lives here)
  DESIGN.md · ARCHITECTURE.md           (this synthesis; frozen)
  RECORDING-PLAN.md                     qa
  public/engine/context_engine.wasm     scaffold   copied by scripts/copy-wasm.ts from ../engine/dist (§13)
  public/traces/trace.json              scaffold   copied from ../presentation/trace.json
  public/fonts/*.woff2                  scaffold   Fraunces, Schibsted Grotesk, JetBrains Mono, self-hosted (open question 8)
  scripts/copy-wasm.ts                  scaffold   copies the wasm, then instantiates it and asserts engine_new(3,…) yields 9 nodes (guards a stale dist)
  scripts/record-trace.ts               scaffold   re-implements ../presentation/record_trace.mjs's loop; adds seed per run and the city, world and street_doors runs (§13)
  scripts/synth-city.ts                 qa         tests/fixtures/synthetic-city-5000.json: 1 city, 50 streets × 100 houses, NodeView-shaped, labelled synthetic
  scripts/render.ts                     qa         director take → per-frame PNG (Playwright) → ffmpeg
  src/main.ts                           scaffold   boot from the URL (§9.3)
  src/app/App.ts                        scaffold   App.boot(), register(band), command(), accept(frame), stepTo() for tests, the render loop
  src/app/Renderer.ts                   scaffold   Renderer interface + NullRenderer (records uniforms; no WebGL)          [day-0 seam]
  src/app/ThreeRenderer.ts              scaffold   WebGLRenderer, DPR cap, quality, the scene, band groups, the render loop, ?stats=1 overlay
  src/app/director.ts                   scaffold   takes: fixed dt = 1/60, keyframes {A, T, yaw, H?, ease, hold}, tick seconds, HUD toggles, captions → SRT
  src/app/quality.ts · lighting.ts      scaffold   the three quality rows and five lighting presets as data; emit on the bus
  src/engine/contract/state.ts          scaffold   StateView/NodeView/HeldView/Totals/TickReport/PackedStatisticalState/Note/HaltReason (§2)   [day-0 seam]
  src/engine/contract/events.ts         scaffold   the 22-variant EngineEvent union, tag "type"                                                   [day-0 seam]
  src/engine/contract/ids.ts            scaffold   NodeId/EnvelopeId as number; toU64(id): bigint; assertJsonSafe
  src/engine/contract/copy.ts           scaffold   STAGE_LEVEL, STAGE_NAME, GATE_NAME, STAGE_ACTOR, STAGE_WORD ("the Street"…)
  src/engine/source/EngineSource.ts     scaffold   Frame, Decision, SourceHello, SourceStatus, EngineSource (§3)                                [day-0 seam]
  src/engine/source/WasmSource.ts       scaffold   main-thread proxy: start/step/commands over postMessage, ack correlation
  src/engine/source/wasm.worker.ts      scaffold   instantiate, engine_* calls, memory.buffer re-fetch, JSON parse, slots + packTruth, transferables
  src/engine/source/SseSource.ts        scaffold   EventSource hello/tick/lagged, GET /state per tick, POST commands
  src/engine/source/TraceSource.ts      scaffold   trace.json replay: step/stepTo/seek, decisions echo, recorded banner
  src/engine/source/TickClock.ts        scaffold   pull-source scheduling: run/pause/step/speed, per-band tick seconds
  src/engine/store/Store.ts             scaffold   last Frame, slots, layout, focus, door queue, notes, feed; subscribe()                       [day-0 seam]
  src/engine/store/reducer.ts           scaffold   reduce(frame): the one O(n) pass (§4)
  src/engine/store/slots.ts             scaffold   NodeId → slot, first-seen, never freed
  src/engine/store/clips.ts             scaffold   Clip type, the event → clip table (Appendix A), the pulse ring (16), tick stagger           [day-0 seam]
  src/engine/store/bus.ts               scaffold   SceneBus (§5)                                                                                  [day-0 seam]
  src/engine/layout/hex.ts              scaffold   axial math (§7.1)
  src/engine/layout/layoutCity.ts       scaffold   layoutCity(nodes) (§7.2), houseYaw(), kerbStone()
  src/engine/layout/layoutCountry.ts    scaffold   the Country at (0,0), cities on rings, HEX_SIZE × 7
  src/engine/layout/layoutWorld.ts      scaffold   countries by ascending id on the 30° N circle of a sphere R 6,000
  src/engine/gpu/TruthBuffer.ts         scaffold   the three DataTextures, prev/current swap, syncT/packT/haltT writes, cascade writes (§6)
  src/engine/gpu/uniforms.ts            scaffold   the shared uniforms object (§6.4)                                                            [day-0 seam]
  src/engine/gpu/hexGeometry.ts         scaffold   the 48-index prism, HEX_SIZE, HEX_FLAT
  src/engine/gpu/TileMesh.ts            scaffold   the one InstancedMesh (tiles + ground; aSlot, aAxial, aKind, aSeed, aFold), raycast → slot → NodeId
  src/engine/gpu/shaders/noise.glsl     scaffold   Ashima 3D simplex (MIT) + hash12
  src/engine/gpu/shaders/truth.glsl     scaffold   fetchTruth, blendT, sweepFront, visiblePhi, applyFog, applyHatch, sweepLight, heatGlow, purseArc, statusTint
  src/engine/gpu/shaders/tile.vert · tile.frag   scaffold   instance placement, aFold collapse, band scale; faces by aKind, pulses
  src/engine/gpu/shaders/fogpass.frag   scaffold   the fullscreen fog medium used by the dissolve
  src/scene/camera/bands.ts             atlas      the band table of §8 as data                                                                 [day-0 seam]
  src/scene/camera/AltitudeRig.ts       atlas      A, spring, dolly/fov/pitch, house-frame yaw handoff, hysteresis, zoom calls, pending
  src/scene/camera/input.ts             atlas      wheel/pinch/keys/rail/click/drag → altitude and focus
  src/scene/camera/project.ts           atlas      worldToScreen for DOM labels and bubbles
  src/scene/camera/Dissolve.ts          atlas      half-res RT blend at band edges, pending clamp ≤ 0.5, reduced-motion fade
  src/scene/room/RoomBand.ts            room       SceneBand stage 1
  src/scene/room/fixtures.ts            room       Archives, Oak Table, papers, Desk, Purse (lid arc), the Door leaf/frame/step, stool, walls, roof
  src/scene/room/stations.ts            room       the station table of DESIGN §4; walks; the Porter's clips
  src/scene/room/lights.ts              room       L1, L2 (from state), L3 emissive (from state), L4
  src/scene/room/actors/PegCat.ts       room       base geometry, five morph targets, inverted-hull outline with smoothed normals, contact shadow  [exported]
  src/scene/room/actors/seats.ts        room       fur, prop, burn glow, thought anchor per seat
  src/scene/room/shaders/room.frag      room       wallpaper haze (fetchTruth), paper, brass
  src/scene/street/StreetBand.ts        street     SceneBand stage 2
  src/scene/street/cottage.ts           street     instanced house bodies, roofs, Door, Letter Slot, chimney, lantern (status)
  src/scene/street/kerb.ts              street     kerb ribbon through the kerb stones, posts
  src/scene/street/couriers.ts          street     cart / envelope-with-feet quads, the four-beat handshake, snap-back, drop
  src/scene/street/shaders/cottage.frag · courier.frag   street
  src/scene/city/CityBand.ts            city       SceneBand stage 3
  src/scene/city/clearinghouse.ts       city       the hall, dome, ports, lantern
  src/scene/city/tubes.ts               city       instanced ribbons, the NETTED four beats from one uPulses entry
  src/scene/city/dressing.ts            city       foundries (ring radius+1 corners), data yards (ring radius+2 corners), aSlot = −1
  src/scene/city/folds.ts               city       PACKED / UNPACKED: aFold, the resin block, seed-order unfold, ember motes
  src/scene/city/shaders/tube.frag      city
  src/scene/atlas/CountryBand.ts        atlas      SceneBand stage 4: heightfield around the city cells, contour lines, the Court's line, ROLLED_BACK, VOIDED
  src/scene/atlas/WorldBand.ts          atlas      SceneBand stage 5: sphere, armillary ring, beacons, fibre, the heartbeat meridian, finality orbits, partition
  src/scene/atlas/shaders/relief.frag · globe.frag   atlas
  src/ui/hud.ts · door.ts · note.ts · receipts.ts · bubbles.ts · pills.ts · ticker.ts · settings.ts · labels.ts · sound.ts · motion.ts   ui
  src/styles/tokens.css · hud.css · door.css · note.css · ticker.css   ui
  design/index.html                     design-page
  tests/setup.ts                        qa         jsdom <dialog> polyfill (showModal/close toggle `open`), matchMedia stub
  tests/unit/*.test.ts                  qa         hex, layout, slots, truthPack, clips, altitude, reducer, contract-wasm
  tests/dom/*.test.ts                   qa         door, note, street, hud, no-leaderboard, values-on-screen
  tests/gpu/*.spec.ts                   qa         door-swiftshader, shaders, drawcalls, goldens
  tests/fixtures/                       qa         synthetic-city-5000.json, layout snapshots, goldens/
```

### 1.2 OWNERSHIP table

| path | lane |
|---|---|
| `package.json`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `index.html`, `.env.example`, `src/main.ts` | scaffold |
| `src/engine/**` (contract, source, store, layout, gpu) | scaffold |
| `src/app/**` | scaffold |
| `public/**`, `scripts/copy-wasm.ts`, `scripts/record-trace.ts` | scaffold |
| `src/scene/room/**` | room |
| `src/scene/street/**` | street |
| `src/scene/city/**` | city |
| `src/scene/atlas/**`, `src/scene/camera/**` | atlas |
| `src/ui/**`, `src/styles/**` | ui |
| `design/index.html` | design-page |
| `tests/**`, `scripts/synth-city.ts`, `scripts/render.ts`, `RECORDING-PLAN.md` | qa |

## 2. The contract (`src/engine/contract/*`)

Serde rules that decide the wire shape, checked against the source: `Stage` is `#[repr(u8)]` with no `rename_all`, so it serialises as the variant **string** (`"House" … "World"`), never the number; `NodeStatus` is `snake_case`; `HaltReason` is `tag = "kind"`, `snake_case`; `EngineEvent` is `tag = "type"`, `SCREAMING_SNAKE_CASE`; `Hash32` is 64 lowercase hex; `NodeId(u64)` / `EnvelopeId(u64)` are transparent newtypes, JSON **numbers**, minted below 2^52 (largest in the trace 3781345924436676); `Option<T>` is `null` or `T`; `(u64, String)` is a two-element array; `executor` is a string (`"sequential"` in the trace). Verified against `trace.json`: every `NodeView` key, every `StateView` key and every event tag below appears with exactly these names.

```ts
// src/engine/contract/state.ts  (mirror of engine/src/tick.rs, lod.rs, receipt.rs)
export type Stage = 'House' | 'Street' | 'City' | 'Country' | 'World';
export type NodeStatus = 'active' | 'waiting_at_door' | 'halted' | 'packed' | 'partitioned';
export type Hash32 = string;            // 64 lowercase hex
export type HashShort = string;         // first 8 hex, only in root_history
export type NodeId = number;            // u64 < 2^52; compare with ===; BigInt only at the wasm boundary
export type EnvelopeId = number;
export type Seat = 'Scout' | 'Scribble' | 'Inspector' | 'Penny' | 'Porter' | 'engine' | (string & {});
export type ModelTier = 'fast_quantized' | 'balanced_staff' | 'frontier_deep';
export type PayloadKind = 'liquidity_transfer' | 'dispatch' | 'hire_service' | 'state_sync' | 'close';
export type HeldReason = 'awaiting_human_signature' | 'awaiting_finality';
export type Executor = 'sequential' | 'tokio-multi-thread' | (string & {});

export type HaltReason =
  | { kind: 'runway_exhausted'; shortfall: number }
  | { kind: 'closed' }
  | { kind: 'slashed'; amount: number }
  | { kind: 'partitioned' };

export interface Note {
  tick: number; node: NodeId; node_name: string;
  doing: string;                       // "lookup (Scout, 280 tok on fast_quantized)"
  compute_burned_total: number; compute_remaining: number; joules_burned_total: number;
  papers_on_table: number; reason: HaltReason;
  saved_state: string;                 // "oak_table@7e70f463"
}

export interface PackedStatisticalState {
  avg_compute_burn_rate: number; liquidity_velocity: number; epistemic_variance: number; mean_confidence: number;
  stochastic_seed: number;             // full u64: may exceed 2^53; display only, never round-trip
  packed_at_tick: number; active_children: NodeId[]; child_count: number;
  total_compute_at_pack: number; macro_ticks: number; pending_burn: number;
  pending_liquidity_delta: number; pending_decay_ticks: number;
}

export interface NodeView {
  id: NodeId; name: string; stage: Stage;
  gate: Stage;                         // max(node's own gate, state.active_scale)
  parent: NodeId | null;
  children: number;                    // a COUNT; edges come from `parent`
  status: NodeStatus;
  compute: number; compute_allocated: number; compute_burned: number; joules_burned: number; compute_reclaimed: number;
  liquidity_belief: number; liquidity_truth: number;
  confidence: number;                  // Φ ∈ [0.05, 1]
  fog: number;                         // clamp(1 − Φ, 0, 1)
  generation: number; idle_ticks: number; calibrations: number;
  tasks_total: number; tasks_done: number; current_task: string | null;
  held: number;                        // envelopes held at this node's gate
  packed: PackedStatisticalState | null;   // on the PARENT of folded children
  note: Note | null;
  burned_this_tick: number;            // may arrive as -0: normalise with (+x || 0)
  oak_root: Hash32; papers: number;
  receipts: string[];                  // newest first; ≤ 6 live, 3 in the trace
}

export interface HeldView {
  envelope: EnvelopeId; node: NodeId; node_name: string;
  description: string;                 // "send the finished draft for doc_synthesis_01"
  cost: number;                        // the send fee
  gate: Stage;                         // 'House' once the person was asked, whatever the camera does
  reason: HeldReason;                  // 'awaiting_finality' iff gate === 'World'
  created_tick: number;
}

export interface Totals { compute_burned: number; tax_paid: number; settled: number; slashed: number; approved: number; rejected: number; waiting: number; halted: number }

export interface TickReport {
  tick: number; drafted: number; compute_burned: number; tax_paid: number; envelopes_minted: number; dropped_by_courier: number;
  approved: number; rejected: number; held: number; slashed: number; voided: number; settled_liquidity: number; halted: number;
  seat_failures: number; synced: number; root: Hash32; global_confirmed: boolean; rolled_back: boolean; packed_groups: number;
}

export interface StateView {
  tick: number; active_scale: Stage; root: Hash32; executor: Executor;
  nodes: NodeView[];                   // ascending id (BTreeMap), NOT creation order
  held: HeldView[]; mempool: number; totals: Totals;
  gates: string[];                     // 5 strings, fixed order: Door, Letter Slot, Clearinghouse, Statutory Law, Recursive STARKs
  last_report: TickReport | null;      // null before the first tick
  root_history: [tick: number, root: HashShort][];   // newest first, ≤ 16
}

// src/engine/contract/copy.ts
export const STAGE_LEVEL: Record<Stage, 1 | 2 | 3 | 4 | 5> = { House: 1, Street: 2, City: 3, Country: 4, World: 5 };
export const STAGE_NAME: Record<Stage, string> = { House: 'The House', Street: 'The Neighborhood', City: 'The City', Country: 'The Country', World: 'The World' };
export const GATE_NAME: Record<Stage, string> = { House: 'The Door', Street: 'The Letter Slot', City: 'The Clearinghouse', Country: 'Statutory Law', World: 'Recursive STARKs' };
export const STAGE_ACTOR: Record<Stage, string> = { House: 'The Porter', Street: 'The Couriers', City: 'The Municipal Treasury', Country: 'The High Court', World: 'The Global Validators' };
export const STAGE_WORD: Record<Stage, string> = { House: 'the House', Street: 'the Street', City: 'the City', Country: 'the Country', World: 'the World' };
```

```ts
// src/engine/contract/events.ts  (mirror of engine/src/events.rs; every variant carries tick)
export type EngineEvent =
  | { type: 'THOUGHT'; tick: number; node: NodeId; seat: Seat; text: string }
  | { type: 'BURN'; tick: number; node: NodeId; seat: Seat; credits: number; joules: number; tier: ModelTier; cache_hit: boolean }
  | { type: 'PROPOSED'; tick: number; envelope: EnvelopeId; from: NodeId; to: NodeId; kind: PayloadKind; requested_liquidity: number; tax_paid: number }
  | { type: 'DROPPED_BY_COURIER'; tick: number; from: NodeId; to: NodeId; reason: string }
  | { type: 'AWAITING_HUMAN_SIGNATURE'; tick: number; node: NodeId; envelope: EnvelopeId; description: string; cost: number }
  | { type: 'AWAITING_FINALITY'; tick: number; envelope: EnvelopeId; until_tick: number }
  | { type: 'APPROVED'; tick: number; envelope: EnvelopeId; gate: Stage }
  | { type: 'REJECTED'; tick: number; envelope: EnvelopeId; gate: Stage; reason: string; sunk_compute: number }
  | { type: 'SLASHED'; tick: number; node: NodeId; amount: number; reason: string }
  | { type: 'SETTLED'; tick: number; envelope: EnvelopeId; from: NodeId; to: NodeId; amount: number }
  | { type: 'DELIVERED'; tick: number; envelope: EnvelopeId; to: NodeId }
  | { type: 'STATE_SYNC'; tick: number; node: NodeId; cost: number; confidence_before: number }
  | { type: 'HALTED'; tick: number; node: NodeId; note: Note }
  | { type: 'SEAT_FAILED'; tick: number; node: NodeId }
  | { type: 'VOIDED'; tick: number; envelope: EnvelopeId; reason: string }
  | { type: 'TOPPED_UP'; tick: number; node: NodeId; credits: number }
  | { type: 'PACKED'; tick: number; parent: NodeId; children: number; seed: number /* full u64, display only */ }
  | { type: 'UNPACKED'; tick: number; parent: NodeId; children: number; macro_ticks: number; burn_distributed: number }
  | { type: 'NETTED'; tick: number; clearinghouse: Stage; gross: number; net: number; envelopes: number }
  | { type: 'ROLLED_BACK'; tick: number; to_tick: number; reason: string; slashed: number }
  | { type: 'GLOBAL_STATE_CONFIRMED'; tick: number; root: Hash32; latency_ticks: number; partitioned: NodeId[] }
  | { type: 'TICK_COMMITTED'; tick: number; root: Hash32; active_scale: Stage; nodes_active: number; nodes_waiting: number; nodes_halted: number; nodes_packed: number; nodes_partitioned: number };
export type EventType = EngineEvent['type'];   // exactly 22
```

Reason strings are matched by **prefix**, never equality: `REJECTED.reason` starts with one of `hash mismatch:`, `lock failed:`, `unbacked`, `proof failed:`, `the person said no at the door`, `cannot afford the send cost of`, `stale belief at commit:`, `injunction:`, `no such service:`, `target`, `bad signature`, `payload hash does not match payload`, `initiator is halted or partitioned:`, `netting batch void:`, `unbacked at commit after netting:`; `DROPPED_BY_COURIER.reason` with `unknown address:` or `cannot afford the crossing tax of`; `SLASHED.reason` with `unbacked in netting:`, `unbacked spend under statute:`, `High Court: systemic failure`. Order inside one tick: per node `BURN`×n, `THOUGHT`×n, then `HALTED` / `PROPOSED` / `DROPPED_BY_COURIER`; then `NETTED`, `APPROVED`, `AWAITING_*`, `REJECTED`, `SLASHED`+`REJECTED`, `VOIDED`, `ROLLED_BACK`; then `SETTLED`, `DELIVERED`, `STATE_SYNC`; then `GLOBAL_STATE_CONFIRMED` (every `stark_period` = 16 ticks); **`TICK_COMMITTED` always last**. `TOPPED_UP`, `HALTED{closed}`, `PACKED`, `UNPACKED` come from commands between ticks and sit at the head of the next drain.

A vitest, `tests/unit/contract-wasm.test.ts`, loads the real `public/engine/context_engine.wasm` in Node, runs ten ticks of scenarios 1, 2, 3 and 5, and checks every `NodeView` key and every event tag against these types, so a drift in `tick.rs` or `events.rs` fails the build before it fails on screen.

## 3. `EngineSource`, `Frame`, the three sources and the clock

```ts
// src/engine/source/EngineSource.ts
export interface Frame {
  tick: number;                  // == state.tick
  state: StateView;
  events: EngineEvent[];         // drained for this tick, in engine order; e.tick <= tick (tick-0 PACKED events sit at the head of frame 1)
  decisions: Decision[];         // commands applied between the previous frame and this one (trace: recorded; live: the app's own log)
  arrivedAt: number;             // app clock seconds (performance.now()/1000) when accepted: the clip scheduler's t0
  seeked?: true;                 // TraceSource.seek(): apply DOM/truth, play no clips
}
export type Decision =
  | { tick: number; decision: 'approve' | 'reject'; envelope: EnvelopeId; description?: string }
  | { tick: number; decision: 'top_up'; node: NodeId; credits: number }
  | { tick: number; decision: 'zoom'; stage: 1 | 2 | 3 | 4 | 5 }
  | { tick: number; decision: 'truth_changed'; description: string };   // record_trace.mjs writes this in the street run

export interface SourceHello { version: string; scenario: 'house' | 'street' | 'city' | 'country' | 'world'; seed: number | null; tickSeconds: number | null; recorded: boolean }
export type SourceStatus =
  | { kind: 'connecting' } | { kind: 'streaming' } | { kind: 'paused' } | { kind: 'lagged'; skipped: number }
  | { kind: 'ended' } | { kind: 'error'; message: string };

export interface EngineSource {
  readonly kind: 'wasm' | 'sse' | 'trace';
  readonly drive: 'pull' | 'push';        // pull: the TickClock calls step(); push: the server ticks and frames arrive on their own
  readonly live: boolean;                 // commands reach an engine (false for the trace)
  start(): Promise<SourceHello>;
  onFrame(cb: (f: Frame) => void): () => void;
  onStatus(cb: (s: SourceStatus) => void): () => void;
  step(): Promise<Frame | null>;          // pull: run exactly one tick; null when a trace is over. push: rejects
  pause(): Promise<void>;                 // sse: POST /pause; pull: no-op (the clock owns it)
  resume(): Promise<void>;
  authorize(envelope: EnvelopeId): Promise<boolean>;   // false: no Door holds that envelope (wasm 0 / serve 404)
  reject(envelope: EnvelopeId): Promise<boolean>;
  topUp(node: NodeId, credits: number): Promise<boolean>;
  zoom(stage: 1 | 2 | 3 | 4 | 5): Promise<boolean>;
  setTruthPrice?(price: number): Promise<boolean>;     // wasm only: engine_set_truth_price
  dispose(): void;
}
```

Commands flow back one way: a DOM control calls `app.command(c)`, which appends `c` to the pending-decision log, calls the source method, and does **nothing optimistic**. The Door closes when the engine says so; the purse gauge moves when the next `Frame` says so. The pending log is attached as `decisions` to the next accepted frame, so a live session can be written out in the trace format and replayed.

**Scenario codes** (`engine_new(scenario, seed, budget, tasks, cost_visible)`, verified against the fresh build): `1` house (2 nodes), `2` street (8 nodes, six houses), `3` city (9 nodes: The City, Street 1–2, S1/S2 House 1–3; `NETTED { gross 60, net 20, envelopes 12 }` at tick 1 with budget 400, tasks 3), `4` the forged country (8 nodes: Albion and seven cities; `NETTED` then `SLASHED`/`ROLLED_BACK` from tick 2), `5` the world (9 nodes; three tick-0 `PACKED` events precede tick 1; `AWAITING_FINALITY`×3 per tick). Anything else builds the house. `serve --scenario house|street|city|country|world` maps the same way.

### 3.1 `WasmSource` + `wasm.worker.ts`

The cdylib (`public/engine/context_engine.wasm`, ~340 KB, zero imports, raw C ABI) runs in a module Worker. Exports: `engine_new`, `engine_tick(): u64` (0 = the tick could not run: no frame, do not read events), `engine_authorize(u64): u32`, `engine_reject(u64): u32`, `engine_top_up(u64, f64)`, `engine_zoom(u32)`, `engine_set_truth_price(f64)`, `engine_state(): u32 len`, `engine_events(): u32 len` (drains), `engine_out_ptr()`, `engine_version()`, `memory`. Read-out: `new TextDecoder().decode(new Uint8Array(x.memory.buffer, x.engine_out_ptr(), len))`, re-fetching `memory.buffer` on **every** read (it detaches when memory grows) and calling `engine_out_ptr()` after the writing call. The worker is the sole caller of `engine_events()`, exactly once per tick, and never drains before a tick, so the world's tick-0 `PACKED` events arrive at the head of frame 1.

```ts
type ToWorker =
  | { t: 'new'; scenario: 1 | 2 | 3 | 4 | 5; seed: string /* decimal u64 */; budget: number; tasks: number; costVisible: boolean }
  | { t: 'tick' } | { t: 'authorize'; id: number; envelope: number } | { t: 'reject'; id: number; envelope: number }
  | { t: 'topUp'; id: number; node: number; credits: number } | { t: 'zoom'; id: number; stage: 1 | 2 | 3 | 4 | 5 } | { t: 'setTruthPrice'; id: number; price: number };
type FromWorker =
  | { t: 'hello'; version: string }
  | { t: 'frame'; tick: number; state: StateView; events: EngineEvent[];
      slots: Float64Array /* NodeId per slot, transferable */; truth: Uint16Array /* RGBA16F per slot, transferable */; burnRef: number }
  | { t: 'ack'; id: number; ok: boolean } | { t: 'error'; message: string };
```

The worker owns the slot table and packs the truth texture before posting, so the main thread never walks `state.nodes` for the GPU (40 KB at 5,000 nodes). The full `StateView` still travels by structured clone (budgeted in §11).

### 3.2 `SseSource`

Against `engine/src/bin/serve.rs` (CORS `*`, `Cache-Control: no-store`, `Connection: close` on non-SSE answers). `start()` opens `EventSource(`${base}/events`)` and listens with `addEventListener` for `hello` (plain text: `context-engine 0.1.0 (native, tokio-multi-thread executor, scenario house, seed 7)`; scenario and seed are parsed from it), `tick` (`{ report: TickReport, events: EngineEvent[] }`, **no state**: the source then does one `GET /state`, keyed to the tick, and emits `Frame { tick: state.tick, state, events }`; if `state.tick > report.tick` the two ticks' events are coalesced into one frame), and `lagged` (`{ skipped }` → status `lagged`, one fresh `GET /state`, a HUD line "stream lagged · N ticks skipped"). The default `message` listener never fires. Commands: `POST /authorize/<envelope>`, `/reject/<envelope>`, `/top-up/<node>/<credits>`, `/zoom/<1-5>`, `/pause`, `/resume`; ids as decimal on the path; `200 {"ok":true}` → `true`; `404 {"ok":false,"error":"no envelope held with that id"}` → `false` ("already decided", not an error dialog); `400` → `false` plus a console error. `drive: 'push'`: the server's `--interval-ms` (700) is the clock. Base URL `import.meta.env.VITE_ENGINE_URL`, default `http://127.0.0.1:8787`.

### 3.3 `TraceSource`

`public/traces/trace.json` is `{ version, house: RecordedFrame[70], house_hidden_cost: [9], house_visible_cost: [13], street: [30] }` with `RecordedFrame = { tick, state (receipts sliced to 3), events, decisions }`; frame `i` has `tick i + 1`. A frame's `decisions` are the commands applied **after the previous frame and before this tick ran**: frame tick 5 of `house` carries `[{ tick: 4, envelope: 3930624385311261, decision: 'approve', description: 'send the finished draft for doc_synthesis_01' }]` and its events are `APPROVED`, `DELIVERED`, `TICK_COMMITTED`; ticks 1–4 hold the envelope (`held.length === 1`, `compute` 754.95 unchanged, Φ 0.9730 → 0.8928, `burned_this_tick` 0, `idle_ticks` 0 → 3); tick 5 has `held` empty and `compute` 744.95. Frame tick 7 of `street` carries `decisions: [{ tick: 7, decision: 'truth_changed', … }]` and six `REJECTED` with reason `hash mismatch: believed courier at 10.00, truth differs (epistemic drift)`, `sunk_compute` 0.5. `house_hidden_cost` ends at tick 9 with a `HALTED` Note (`doing` "lookup (Scout, 280 tok on fast_quantized)", `compute_remaining` 16.2, `shortfall` 11.8).

```ts
export class TraceSource implements EngineSource {
  readonly kind = 'trace'; readonly drive = 'pull'; readonly live = false;
  constructor(readonly frames: RecordedFrame[], readonly hello: { version: string; scenario: SourceHello['scenario']; seed: number | null }) {}
  get length(): number; get cursor(): number;      // index of the last emitted frame, -1 before start
  step(): Promise<Frame | null>;                    // emits frames[cursor + 1] with arrivedAt = now; null at the end → status 'ended'
  stepTo(tick: number): Promise<Frame | null>;      // step() until frame.tick === tick; every intermediate frame is emitted (reducers see every event)
  seek(tick: number): Promise<Frame | null>;        // emits frames[tick - 1] with seeked: true (DOM + truth applied, no clips): director scrubbing
  authorize/reject/topUp/zoom(): Promise<false>;    // recorded run: the Door's buttons are disabled and captioned
}
```

`stepTo` resolves in microtasks with no timers, so a test can `await source.stepTo(4)` and inspect the DOM at exactly tick 4.

### 3.4 `TickClock`

For `drive: 'pull'` sources the app owns time: `{ running, speed (0.25–8), tickSeconds, start(), pause(), stepOnce(), setSpeed() }` schedules `source.step()` every `tickSeconds / speed` on a `setTimeout` chain re-armed after each frame resolves (never overlapping; `requestAnimationFrame` is not used for ticks). `tickSeconds` per band: 1.2, 0.7, 0.4, 0.3, 0.25 (`bands.ts`), so the 16-tick heartbeat reads as 19 s in the room and 4 s in orbit. Speed rescales the schedule and `uTickSeconds` together. In director mode (`?take=`) and test mode (`?clock=manual`) the clock is replaced by explicit stepping.

## 4. Frame flow: worker → main → store → scene bus → bands → DOM

1. **Source.** The worker runs `engine_tick` → `engine_state` → `engine_events`, packs `truth`, posts `{ t: 'frame', … }` with the two arrays transferred. (`SseSource`: `tick` event + `GET /state`; `TraceSource`: `frames[cursor + 1]`.) The source stamps `arrivedAt` and calls its `onFrame` listeners.
2. **`App.accept(frame)`** (main thread): `store.commit(frame)` (the previous frame becomes `prev`); then `reduce(frame)`.
3. **`reduce(frame)`**, the one O(n) pass, in this order: (a) `slots.ensure(state.nodes)`; (b) layout rehash: a hash over sorted `(id, parent)` pairs; if changed, `layoutCity(nodes)` and `bus.emit('layout')`; (c) `burnRef` = 90th percentile of `burned_this_tick` over the last 8 ticks; (d) `packTruth` (sse/trace only; wasm frames arrive packed) and `truth.upload()`; packed children are written from their parent's profile; (e) for each event in order: `clips.schedule(ev, arrivedAt)` (Appendix A), `uTimes` writes (`STATE_SYNC` → `syncT` + cascade; `PACKED`/`UNPACKED` → `packT`; `HALTED` → `haltT`), `pulses.push` for `NETTED`, `ROLLED_BACK`, `GLOBAL_STATE_CONFIRMED`, `SLASHED`; (f) door queue from `state.held` (open once per envelope; close when absent); (g) the DOM patch: `ui.apply(frame)` (HUD, focus card, gates, totals, ticker, Note, receipts, feed). Nothing here runs from the render loop.
4. **Bus.** `bus.emit('frame', frame)`; then for each event `bus.emit('event', sceneEvent)`, and `App` calls `band.onFrame(frame)` then `band.onEvent(ev)` for every mounted band (bands filter by `type` and by their own nodes).
5. **Render loop** (`requestAnimationFrame`): the rig steps its spring and writes `uAltitude`, camera pose and `uTime`; `App` calls `band.setAltitude(a)`; the renderer draws the band groups the altitude gates; `labels.ts` projects at most eight anchors. No `Frame`, no `state`, no `nodes` is read here (`reducer.test.ts`).
6. **Commands** go the other way: DOM → `app.command()` → source → engine; the answer returns only as a later `Frame`.

## 5. `SceneBand`, `SceneContext` and the `SceneBus`

A lane registers its scene with one call, `app.register(band)`, before `App.boot()` resolves; `App` mounts it with the context and drives the four hooks. A band adds one `THREE.Group` named `band-${stage}` to `ctx.scene` and touches nothing outside it.

```ts
// src/app/App.ts
export interface SceneBand {
  readonly stage: 1 | 2 | 3 | 4 | 5;
  mount(ctx: SceneContext): void;      // build geometry, subscribe to the bus; called once
  onFrame(frame: Frame): void;         // after reduce(): truth uploaded, layout current, DOM patched; O(own objects), never O(nodes) beyond the band's tiles
  onEvent(ev: SceneEvent): void;       // one call per EngineEvent, in engine order, after onFrame
  setAltitude(a: number): void;        // per render frame; a number, never a walk; bands fade their groups by the band table
  dispose(): void;
}
export interface SceneEvent { ev: EngineEvent; tick: number; arrivedAt: number; clip: Clip | null; seeked: boolean }
export interface SceneContext {
  scene: THREE.Scene; renderer: THREE.WebGLRenderer | null;      // null under NullRenderer
  camera: THREE.PerspectiveCamera;      // read-only for bands; the rig moves it
  rig: AltitudeRig;                     // .a, .band, .pending, .focus, .houseYaw(id)
  truth: TruthBuffer; uniforms: SharedUniforms; tiles: TileMesh;
  layout: LayoutHandle;                 // .current, .cellOf(id), .houseYaw(id), .kerbStone(id)
  store: Store; bus: SceneBus; clips: ClipScheduler;
  project: (p: THREE.Vector3) => { x: number; y: number; depth: number; visible: boolean };
  quality: QualityPreset; lighting: LightingState; reducedMotion: boolean;
}
```

```ts
// src/engine/store/bus.ts
export interface BusEvents {
  frame: Frame;                                                       // after reduce()
  event: SceneEvent;                                                  // one per EngineEvent, after 'frame'
  altitude: { a: number; band: 1|2|3|4|5; pending: 1|2|3|4|5 | null; w: number };   // per render frame, from the rig
  focus: { node: NodeId | null; cell: Axial | null };
  layout: Layout;                                                     // only when the (id, parent) set changed
  zoomPending: { band: 1|2|3|4|5; sentTick: number };
  zoomConfirmed: { band: 1|2|3|4|5; by: 'PACKED' | 'UNPACKED' | 'TICK_COMMITTED' };
  quality: QualityPreset; lighting: LightingState; reducedMotion: boolean;
  resize: { w: number; h: number; dpr: number };
  status: SourceStatus;
  label: { id: string; world: THREE.Vector3; text: string; kind: 'bubble' | 'plate' | 'caption'; ttl: number } | { id: string; remove: true };
  sound: { cue: 'coin' | 'coinUp' | 'write' | 'knock' | 'stamp' | 'halt' | 'sync' | 'heartbeat'; at: number };
}
export interface SceneBus {
  on<K extends keyof BusEvents>(k: K, cb: (p: BusEvents[K]) => void): () => void;   // returns unsubscribe
  emit<K extends keyof BusEvents>(k: K, p: BusEvents[K]): void;
}
```

Who emits what: `App` emits `frame`, `event`, `status`, `quality`, `lighting`, `reducedMotion`, `resize`; the rig emits `altitude`, `focus`, `zoomPending`, `zoomConfirmed`; the reducer emits `layout`; bands emit `label` and `sound` (the ui lane owns the DOM and the synth that answer them). Bands never emit `frame` or `event`.

## 6. The truth buffer

### 6.1 Textures

Three `DataTexture`s of 256 × 256 (65,536 slots; 5,000 needed), `NearestFilter`, no mips:

| texture | format | R | G | B | A | written |
|---|---|---|---|---|---|---|
| `uTruth` | RGBA16F (`HalfFloatType`) | `phi` = `confidence` (0.05–1) | `purse` = `compute / compute_allocated` (0 when allocated is 0), clamped 0–1 | `heat` = `burned_this_tick / uBurnRef`, clamped 0–1 | `status` code + 8·(held > 0) | per tick, whole texture (`needsUpdate`), 512 KB |
| `uTruthPrev` | same | the previous tick's `uTruth` | | | | swapped by reference each tick |
| `uTimes` | RGBA32F (`FloatType`) | `syncT` app-seconds of the last `STATE_SYNC` (or −1e9) | `packT` of the last `PACKED`/`UNPACKED` touching the node | `haltT` of `HALTED` | `variance` = `packed.epistemic_variance` (0 when not packed) | on events only, a few texels each; 1 MB |

Status codes: `active 0, waiting_at_door 1, halted 2, packed 3, partitioned 4`. Times are float32 because fp16 has 1 s resolution past 1,024 s and the sweep is 600 ms. Packed children are written from their parent's profile: `phi = parent.packed.mean_confidence`, `variance = parent.packed.epistemic_variance`, `purse = parent.purse`, `status = 3`. A node that synced this tick keeps its pre-sync Φ (`confidence_before`) in the prev texel until the sweep is over.

Static per-instance attributes on the tile `InstancedMesh`: `aSlot` (float; −1 for ground and set dressing), `aAxial` (vec2 q, r), `aKind` (0 ground, 1 house, 2 street marker, 3 Clearinghouse, 4 country, 5 dressing), `aSeed` (`hash(NodeId)` in 0–1), `aFold` (0 discrete … 1 folded), plus `instanceMatrix` from the layout.

### 6.2 Slots and packing

`slotOf(id)` allocates the next free slot the first time an id is seen and never frees it within a session; the worker (wasm) and the reducer (sse, trace) share `slots.ts`. `packTruth(nodes, slots, out: Uint16Array, burnRef)` is pure: `s = slotOf(n.id) * 4; out[s] = toHalf(phi); out[s+1] = toHalf(purse); out[s+2] = toHalf(heat); out[s+3] = toHalf(code)` with a port of `THREE.DataUtils.toHalfFloat` in the worker. `burned_this_tick` is normalised with `(+x || 0)` first (the engine emits `-0.0` for seats that burn nothing).

### 6.3 The shader chunk (`truth.glsl`, GLSL ES 3.00 via `ShaderMaterial({ glslVersion: THREE.GLSL3 })`)

```glsl
uniform sampler2D uTruth, uTruthPrev, uTimes;
uniform float uTime, uTickT, uTickSeconds, uAltitude, uReducedMotion, uPxPerUnit, uDpr, uHatchWeight;
uniform vec3  uFogTint;                                     // the stage's fog tint (DESIGN §2)
#define HEX_FLAT 10.392                                     // √3 · HEX_SIZE, metres flat-to-flat
struct Truth { float phi, phiPrev, purse, purseP, heat, variance, syncT, packT, haltT; int status; bool held; };

Truth fetchTruth(float slot) {
  ivec2 tc = ivec2(int(slot) & 255, int(slot) >> 8);
  vec4 a = texelFetch(uTruth, tc, 0), p = texelFetch(uTruthPrev, tc, 0), t = texelFetch(uTimes, tc, 0);
  Truth r; r.phi = a.r; r.phiPrev = p.r; r.purse = a.g; r.purseP = p.g; r.heat = a.b;
  int code = int(a.a + 0.5); r.held = code >= 8; r.status = code & 7;
  r.syncT = t.r; r.packT = t.g; r.haltT = t.b; r.variance = t.a; return r;
}
float blendT() { return smoothstep(0.0, 1.0, clamp((uTime - uTickT) / uTickSeconds, 0.0, 1.0)); }   // free lerp between blocks
float sweepFront(Truth t, vec2 uvC) {                        // uvC: tile-local, centred, span [-0.5, 0.5]
  float age = uTime - t.syncT, dur = mix(0.6, 0.15, uReducedMotion);
  float x = dot(uvC, normalize(vec2(1.0, 0.6)));              // lower-left to upper-right
  return (age / dur - 0.5) * 1.6 - x;                          // > 0 behind the front
}
float visiblePhi(Truth t, vec2 uvC) {
  float synced = step(0.0, sweepFront(t, uvC));
  return (uTime - t.syncT) < 0.8 ? mix(t.phiPrev, t.phi, synced) : mix(t.phiPrev, t.phi, blendT());
}
float stripe(vec2 p, float a) { float d = fract(dot(p, vec2(cos(a), sin(a)))); return 1.0 - smoothstep(0.08, 0.16, abs(d - 0.5)); }
float hatch(float phi, vec2 uvTile, float seed) {            // tile-anchored, ~6 px pitch on screen at every altitude
  float fog = 1.0 - phi;
  vec2 p = uvTile * (HEX_FLAT * uPxPerUnit) / (6.0 * uDpr) + seed * 7.0;
  return clamp(stripe(p, 0.0)   * smoothstep(0.02, 0.12, fog)
             + stripe(p, 0.785) * smoothstep(0.30, 0.40, fog)
             + stripe(p, 1.571) * smoothstep(0.55, 0.65, fog)
             + stripe(p, 2.356) * smoothstep(0.80, 0.90, fog), 0.0, 1.0);
}
vec3 applyFog(vec3 col, float phi, vec2 uv, float seed) {      // lantern smoke; ascending smoothstep edges throughout
  float fog = 1.0 - phi;
  float tAnim = mix(uTime * 0.35, 0.0, uReducedMotion);
  float smoke = 1.0 - uReducedMotion;                          // reduced motion: hatch only
  vec2 warp = smoke * fog * 0.06 * vec2(snoise(vec3(uv * 6.0 + seed * 40.0, tAnim)), snoise(vec3(uv * 6.0 + 17.0 + seed * 40.0, tAnim)));
  col = sampleTile(uv + warp);
  col = mix(col, uFogTint * dot(col, vec3(0.299, 0.587, 0.114)), 0.7 * fog);
  float grain = hash12(gl_FragCoord.xy + mix(uTime * 60.0, 0.0, uReducedMotion)) - 0.5;
  col += smoke * grain * fog * fog * 0.35;
  float split = (1.0 - smoothstep(0.55, 0.75, phi)) * 0.012 * smoke;   // chroma split below HALLUCINATION_THRESHOLD 0.75
  col.r = mix(col.r, sampleTile(uv + warp + vec2(split, 0.0)).r, step(0.001, split));
  col.b = mix(col.b, sampleTile(uv + warp - vec2(split, 0.0)).b, step(0.001, split));
  col = mix(col, vec3(0.055, 0.039, 0.024), hatch(phi, uv, seed) * uHatchWeight);   // --soot; uHatchWeight 0.35 default, 0.85 reduced motion
  return col;
}
vec3 sweepLight(vec3 col, Truth t, vec2 uvC) {                 // the band itself: cyan, verification
  float front = sweepFront(t, uvC), age = uTime - t.syncT;
  float band = (age < 0.8) ? 1.0 - smoothstep(0.0, 0.12, abs(front)) : 0.0;
  return col + vec3(0.16, 0.65, 0.72) * band * 1.4;
}
vec3 heatGlow(vec3 col, Truth t, float mask) {                 // mask: 1 at the chimney / seat, 0 elsewhere
  float cool = exp(-3.0 * (uTime - uTickT) / uTickSeconds);
  float h = t.heat * cool * (0.7 + 0.3 * sin(uTime * 9.0) * (1.0 - uReducedMotion));
  return col + vec3(0.79, 0.32, 0.25) * h * mask;              // --ember
}
float purseArc(Truth t, vec2 uvC) {                            // clockwise from 12 o'clock around the hex rim
  float ang = atan(uvC.x, uvC.y) / 6.2831853 + 0.5;
  float rim = smoothstep(0.42, 0.44, length(uvC)) * (1.0 - smoothstep(0.47, 0.49, length(uvC)));
  return rim * step(ang, mix(t.purseP, t.purse, blendT()));
}
vec3 statusTint(vec3 col, Truth t, vec2 uvC, float rim) {
  float breathe = 0.7 + 0.3 * sin(uTime * 2.6) * (1.0 - uReducedMotion);                        // 0.41 Hz
  if (t.status == 1 && uAltitude <  4.5) col = mix(col, vec3(0.95, 0.80, 0.48), rim * 0.5 * breathe);   // waiting: gold-light, the hand
  if (t.status == 1 && uAltitude >= 4.5) col = mix(col, vec3(0.16, 0.65, 0.72), rim * 0.4);             // finality pending at the World: cyan
  if (t.status == 2) col = mix(col, vec3(0.79, 0.32, 0.25), rim * 0.6);                                 // halted: ember rim
  if (t.status == 3) { float flick = snoise(vec3(uvC * 3.0, uTime * (0.5 + 4.0 * t.variance))) * t.variance * (1.0 - uReducedMotion);
                       col = mix(col, vec3(0.24, 0.23, 0.20), 0.5 + 0.3 * flick); }                     // packed: --resin, shimmer on variance
  if (t.status == 4) col *= 0.25;                                                                         // partitioned
  return col;
}
```

Reference points the design page shows side by side: Φ 1.00 crisp; 0.75 the first chroma split; 0.5636 (the observed floor after twenty uncalibrated handovers) plainly corrupted; 0.05 grey static. The engine computes Φ and `fog`; the shader only draws them.

### 6.4 Shared uniforms (`uniforms.ts`, frozen day 0)

`uTime`, `uTickT`, `uTickSeconds`, `uAltitude`, `uReducedMotion`, `uPxPerUnit` (= viewport height / `H`), `uDpr`, `uHatchWeight`, `uFogTint`, `uBurnRef`, `uTruth`, `uTruthPrev`, `uTimes`, `uPulses[16]` (`kind, t0, originQ, originR`), `uPulseData[16]` (`NETTED`: gross, net, envelopes, radius; `ROLLED_BACK`: to_tick; `GLOBAL_STATE_CONFIRMED`: latency_ticks; `SLASHED`: amount, tickCount), `uKeyDir`, `uKeyColor`, `uHemi`.

### 6.5 The cascade is written, not computed

On `STATE_SYNC { node }` the reducer writes `syncT = arrivedAt` into that node's texel and `syncT = arrivedAt + 0.04 · hexDistance(child, node)` into each descendant's; the room material adds its per-fixture delay (table 0, Desk 80 ms, Purse 160 ms, Door 240 ms). Zero cross-node lookups in the shader.

## 7. Deterministic hex layout

### 7.1 Axial math (`hex.ts`, pointy-top)

```ts
export type Axial = { q: number; r: number };
export const DIRS: Axial[] = [{q:1,r:0},{q:1,r:-1},{q:0,r:-1},{q:-1,r:0},{q:-1,r:1},{q:0,r:1}];
export const add = (a: Axial, b: Axial): Axial => ({ q: a.q + b.q, r: a.r + b.r });
export const scale = (a: Axial, k: number): Axial => ({ q: a.q * k, r: a.r * k });
export const distance = (a: Axial, b: Axial) => { const dq = a.q - b.q, dr = a.r - b.r; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; };
export function ring(center: Axial, k: number): Axial[] {          // 6k cells, from center + DIRS[4]*k, walking DIRS[0..5]
  if (k === 0) return [center];
  const out: Axial[] = []; let h = add(center, scale(DIRS[4], k));
  for (let side = 0; side < 6; side++) for (let i = 0; i < k; i++) { out.push(h); h = add(h, DIRS[side]); }
  return out;
}
export function spiral(center: Axial, n: number): Axial[] { const out = [center]; for (let k = 1; k <= n; k++) out.push(...ring(center, k)); return out; }
export const HEX_SIZE = 6;                                          // centre to corner (m); HEX_FLAT = √3 · 6 ≈ 10.392
export const HEX_FLAT = Math.sqrt(3) * HEX_SIZE;
export const toWorld = ({ q, r }: Axial, y = 0) => ({ x: HEX_SIZE * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r), y, z: HEX_SIZE * 1.5 * r });
export const corners = (k: number): number[] => [0, 1, 2, 3, 4, 5].map(s => s * k);   // indices of the six corner cells of ring(k)
```

### 7.2 The city (`layoutCity.ts`, pure)

```ts
export interface Layout { cell: Map<NodeId, Axial>; streets: Map<NodeId, { ringFrom: number; ringTo: number; cells: Axial[] }>; radius: number; ground: Axial[]; dressing: { foundries: Axial[]; yards: Axial[] } }
export function layoutCity(nodes: NodeView[]): Layout {
  const root = nodes.filter(n => n.parent === null).sort((a, b) => a.id - b.id)[0];     // The City in scenarios::city; Elm Street in scenarios::house
  const cell = new Map<NodeId, Axial>([[root.id, { q: 0, r: 0 }]]);                    // the Clearinghouse tile at 0,0
  const children = (p: NodeId) => nodes.filter(n => n.parent === p).sort((a, b) => a.id - b.id);   // ascending NodeId: stable, seed-derived
  const streets = root.stage === 'Street' ? [root] : children(root.id);                // a root street lays its houses on ring 1
  let nextRing = 1; const streetInfo = new Map();
  for (const s of streets) {
    const houses = children(s.id);
    const ringFrom = nextRing; const cells: Axial[] = []; let k = ringFrom;
    let ringCells = ring({ q: 0, r: 0 }, k);
    const rot = Number(BigInt(s.id) % BigInt(ringCells.length));                        // the street's id turns its ring: same seed → same city
    let idx = rot;
    for (const h of houses) {                                                           // contiguous in spiral order; spill onto the next ring when full
      if (cells.length > 0 && cells.length % ringCells.length === 0) { k++; ringCells = ring({ q: 0, r: 0 }, k); idx = 0; }
      const c = ringCells[idx % ringCells.length]; cells.push(c); cell.set(h.id, c); idx++;
    }
    if (s !== root) cell.set(s.id, cells[Math.floor(cells.length / 2)] ?? ringCells[rot]);   // the street's marker: its middle house's cell
    streetInfo.set(s.id, { ringFrom, ringTo: k, cells }); nextRing = k + 1;
  }
  const radius = nextRing - 1;
  const used = new Set([...cell.values()].map(c => `${c.q},${c.r}`));
  const ground = spiral({ q: 0, r: 0 }, radius + 2).filter(c => !used.has(`${c.q},${c.r}`));
  const dressing = { foundries: corners(radius + 1).map(i => ring({ q: 0, r: 0 }, radius + 1)[i]), yards: corners(radius + 2).map(i => ring({ q: 0, r: 0 }, radius + 2)[i]) };
  return { cell, streets: streetInfo, radius, ground, dressing };
}
// the house on a tile faces the ring centre (its Door wall, local +x, points at (0,0)); the root tile faces +x
export function houseYaw(c: Axial): number { const w = toWorld(c); return (w.x === 0 && w.z === 0) ? 0 : Math.atan2(w.z, -w.x); }
// the kerb stone: 5.0 m from the tile centre toward the ring centre; the kerb ribbon is the closed polyline through a ring's stones
export function kerbStone(c: Axial) { const w = toWorld(c); const l = Math.hypot(w.x, w.z) || 1; return { x: w.x - 5 * w.x / l, y: 0, z: w.z - 5 * w.z / l }; }
```

Worked example, `scenarios::city(config, 2, 3, …)`: Street 1 (the lower id) takes ring 1, its three houses contiguous from `rot₁`; Street 2 takes ring 2, three of twelve cells from `rot₂`; the City at `(0, 0)`; ground to ring 4; foundries on ring 3's corners, yards on ring 4's. The recorded `street` run (`The City` → `Elm Street` → six houses whose ids arrive out of name order) lays out by id, not by name, and the snapshot test pins it. Properties a test pins: pure (no `Math.random`, no `Date`), O(n log n), identical for identical `(id, parent, stage)` triples regardless of array order, stable across ticks; recomputed only when the `(id, parent)` set changes. `layoutCountry`: the Country at `(0, 0)` of its own grid, cities on rings, `HEX_SIZE × 7`; `layoutWorld`: countries by ascending id spaced evenly on the sphere's 30° N great circle.

## 8. The altitude camera (`src/scene/camera/`)

One `PerspectiveCamera`, never swapped. `A ∈ [1, 5]`; the integer part names the nearest band, the fraction the progress. Position `pos = T + d · (−cos p · sin y, sin p, cos p · cos y)`, `lookAt(T)`, with `d = H / (2 · tan(fov / 2))`, `near = d / 50`, `far = 4d`; the camera stands south-west of the focus so the house's north and east walls (Archives, Desk, the Door) are the far walls.

| band | stage | steady range | crosses up at | crosses down at | dissolve window | pitch | yaw | fov | H | tick s |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | House | [1.0, 1.5) | 1.6 → 2 | — | [1.35, 1.65], no RT (the lid) | 30° | 45° in the focused house's frame | 4° | 14 | 1.2 |
| 2 | Street | [1.5, 2.5) | 2.6 → 3 | 1.4 → 1 | [2.35, 2.65] RT | 30° | 45° (house yaw blended out over [1.5, 2.0]) | 4° | max(70, 2.4 × the street arc's extent) | 0.7 |
| 3 | City | [2.5, 3.5) | 3.6 → 4 | 2.4 → 2 | [3.35, 3.65] RT | 30° | 45° | 4° | clamp(2.2 × cityRadius · HEX_FLAT, 140, 1200) | 0.4 |
| 4 | Country | [3.5, 4.5) | 4.6 → 5 | 3.4 → 3 | [4.35, 4.65] RT | 30° → 55° over [3.5, 4.0] | 45° | 4° | 6,000 | 0.3 |
| 5 | World | [4.5, 5.0] | — | 4.4 → 4 | — | 55° → 35° over [4.5, 5.0] | 45° + drag orbit | 4° → 40° | 16,000 (sphere R 6,000) | 0.25 |

`H(A)` is log-interpolated between bands. Rig motion: a critically damped spring on `A`, `T`, yaw (`maath/easing.damp`, half-life 120 ms). Inputs: wheel and pinch → `A` target (0.15 per notch); `[` / `]` → ±1 band; the HUD ladder → that band's centre; click on a tile → `T` (raycast on the `InstancedMesh`: `instanceId → slot → NodeId`); drag at band 5 → yaw. **Hysteresis**: going up, `band` becomes `k + 1` at `A ≥ k + 0.6`; going down, `k` at `A ≤ k + 0.4`; on a change the rig calls `source.zoom(band)` once, records `pending = { band, sentTick }`, emits `zoomPending`, and the dissolve weight `w = smoothstep(k + 0.35, k + 0.65, A)` is clamped ≤ 0.5 until `PACKED` / `UNPACKED` or a `TICK_COMMITTED` whose `active_scale` equals the pending band arrives (`zoomConfirmed`), after which `w` eases to its target over 600 ms. Two engine facts the rig documents: `set_active_scale` re-gates only new and un-asked envelopes (an envelope already presented stays at the Door, `held[].gate === 'House'`); and `zoom/3` on the city world packs the houses, so the live Stage 3 demo does not send `zoom/3` (the world is built at the city by `scenarios::city`). `prefers-reduced-motion`: no RT dissolve; a 150 ms fade through `#16110c`.

## 9. What the scaffold lane guarantees

1. **Importable, frozen on day 0** (a change is a pull request to all lanes): `src/engine/contract/*`, `src/engine/source/EngineSource.ts`, `src/engine/store/Store.ts` and `clips.ts` types, `src/engine/store/bus.ts`, `src/engine/gpu/uniforms.ts`, `src/engine/gpu/shaders/truth.glsl` function signatures, `src/engine/gpu/hexGeometry.ts`, `src/engine/layout/*`, `src/app/Renderer.ts` (`Renderer`, `NullRenderer`), the `SceneBand` / `SceneContext` types in `src/app/App.ts`, and `src/scene/camera/bands.ts` (atlas-owned, frozen with them).
2. **Versions pinned** in `package.json`: `three` 0.17x (one minor for the whole build), `maath`, `vite` 5, `typescript` 5, `vitest` 2, `@playwright/test` pinned to one Chromium (goldens are regenerated on a bump), `vite-plugin-glsl`. No UI framework.
3. **The shell**: `index.html` carries the mount ids `#stage`, `#hud` (with `#focus-status`, `#focus-purse`, `#feed`, `#gates`, `#totals`, `#ladder`, `#block`), `dialog#door` with the ids of §10.2, `#note`, `#receipts`, `#ticker`, `#labels`, `#banner`.
4. **The URL contract** (`src/main.ts`): `?source=wasm|sse|trace` (default `trace` when wasm is blocked, else `wasm`), `&run=house|street|city|country|world|house_hidden_cost|house_visible_cost|street_doors`, `&seed=7&budget=800&tasks=15&cost=1`, `&zoom=1` (a `zoom/<n>` sent before tick 1), `&quality=low|balanced|high`, `&lighting=dawn|noon|golden|dusk|night`, `&motion=reduced`, `&fog=hatch`, `&take=<name>` (director), `&clock=manual` (exposes `window.__app = { ready, stepTo(tick), step(), frame() }` for tests), `&stats=1`, `&renderer=webgpu` (falls back to WebGL with a console note until a TSL tile material exists), `&morph=1`.
5. **Assets**: `public/engine/context_engine.wasm` (guarded copy, §13), `public/traces/trace.json`, self-hosted fonts.
6. **Test harness**: `vitest` projects `unit` and `dom`, the Playwright `swiftshader` project, and `tests/setup.ts`'s `<dialog>` polyfill are wired so a lane's test runs with `npx vitest run --project dom tests/dom/door.test.ts` and `npx playwright test tests/gpu/door-swiftshader.spec.ts`.

## 10. Test plan

**Tier 1, vitest (node), sources and layout**: `hex.test.ts` (ring sizes 6k; distance symmetric; `spiral(3)` = 37 cells; `corners(3)` = [0, 3, 6, 9, 12, 15]); `layout.test.ts` (snapshot of `layoutCity(trace.street[0].state.nodes)`; array-order independence; a 5,000-node synthetic graph lays out in < 50 ms; stability across all 30 street frames; `houseYaw` points every house's +x at the origin); `slots.test.ts`; `truthPack.test.ts` (Φ round-trips within 1e-3; codes exact; `-0` normalised); `clips.test.ts` (each of the 22 event types maps to exactly one clip kind or `none`; `EventType` has 22 members); `altitude.test.ts` (the sequence 2.55, 2.62, 2.58, 2.41, 2.38 produces exactly two `zoom` calls, 3 then 2; the pending clamp holds `w ≤ 0.5` until a confirming `TICK_COMMITTED`); `reducer.test.ts` (a spy on `reduce` after 300 `renderer.frame(dt)` calls equals the frame count); `contract-wasm.test.ts` (the real wasm: ten ticks of scenarios 1, 2, 3, 5; every key and tag). `TraceSource.test.ts` (`stepTo(5)` emits five frames; frame 5's `decisions[0].tick === 4`).

**Tier 2, vitest (jsdom) with `NullRenderer`**, the acceptance test that needs no GPU:

```ts
// tests/dom/door.test.ts
import trace from '../../public/traces/trace.json';
import { App } from '../../src/app/App'; import { TraceSource } from '../../src/engine/source/TraceSource'; import { NullRenderer } from '../../src/app/Renderer';
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
  expect(door.querySelector('#door-proof-phi')!.textContent).toBe('Φ 97.3% then, 89.3% now');
  expect(document.querySelector('#focus-status')!.textContent).toBe('waiting at the door · 0.0 cr idle burn');
  await source.stepTo(5);                          // frame 5 carries the recorded approve; held is empty; APPROVED at tick 5
  expect(door.open).toBe(false);
  expect(document.querySelector('#feed')!.textContent).toMatch(/t5 · approved at the Door/);
  expect(document.querySelector('#focus-purse')!.textContent).toContain('744.95');
});
```

Companions: `note.test.ts` (`house_hidden_cost`, tick 9: the Note is visible, contains "Runway exhausted", `compute_remaining` 16.2, the top-up button); `street.test.ts` (`street`, tick 7: the feed shows the hash-mismatch rejection with 0.5 cr sunk; `liquidity_belief ≠ liquidity_truth` appears on the focus card); `no-leaderboard.test.ts` (after every frame of every recorded run, `document.body.textContent` does not match `/\b(score|rank|reputation|leaderboard|rating)\b/i`: **the first test written**); `hud.test.ts` (tick and the root's first 8 hex match `state`; the ticker has `root_history.length` tabs); `values-on-screen.test.ts` (every number in the focus card is found in the current frame's state or events).

**Tier 3, Playwright + Chromium on SwiftShader** (`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, headless; the real page, the real renderer):

```ts
// tests/gpu/door-swiftshader.spec.ts
test('the Door is open at recorded ticks 1–4 and closed at 5, on the real page', async ({ page }) => {
  page.on('console', m => { if (/shader|GL_INVALID|WebGL/i.test(m.text())) throw new Error(m.text()); });
  await page.goto('/?source=trace&run=house&clock=manual&quality=low');
  await page.waitForFunction(() => (window as any).__app?.ready);
  const door = page.locator('dialog#door');
  await expect(door).not.toHaveAttribute('open', '');
  await page.evaluate(() => (window as any).__app.stepTo(1));
  await expect(door).toHaveAttribute('open', '');
  await page.evaluate(() => (window as any).__app.stepTo(4));
  await expect(door.locator('#door-proof-ticks')).toHaveText('Held 3 ticks');
  await expect(door.locator('#door-proof-purse')).toHaveText('purse unchanged at 754.95 cr');
  await page.screenshot({ path: 'tests/gpu/out/door-t4.png' });      // the thumbnail's DOM half, checked against goldens/door-t4.png
  await page.evaluate(() => (window as any).__app.stepTo(5));
  await expect(door).not.toHaveAttribute('open', '');
});
```

Also `shaders.spec.ts` (every band at Low and Balanced; any shader compile or link message fails), `drawcalls.spec.ts` (`?source=fixture&fixture=city-5000&zoom=3` → `renderer.info.render.calls ≤ 12`), `goldens.spec.ts` (480 × 270 screenshots per band from the trace with `page.clock` frozen at `arrivedAt + 0.3 s`, `pixelmatch` ≤ 0.5 %; regenerated on a Chromium bump). `glslangValidator` runs on every chunk when present.

## 11. Performance plan (5,000 instances at 60 fps on a laptop)

| budget | number | how it holds |
|---|---|---|
| draw calls at Stage 3 | ≤ 12 | tiles 1 (`InstancedMesh`, 48 indices × 5,000 = 80k triangles; ground and dressing share it); cottages 1 (instanced, band 2); couriers 1 (instanced quads, cap 1,024); tubes 1 (cap 512); Clearinghouse 1; room fixtures + cats ≤ 4 (band 1 only); dissolve composite 1; halo geometry 1; `drawcalls.spec.ts` asserts it |
| CPU per render frame | ≤ 2 ms | uniform writes, the spring, ≤ 8 label projections; no state walks (`reducer.test.ts`) |
| CPU per tick | ≤ 8 ms main thread at 5k | JSON parse and `packTruth` in the worker; the main thread does structured-clone receipt (~5 ms at 5k), `reduce()` O(n) (~1 ms), one 512 KB `texImage2D`; `uTimes` uploaded only when an event touched it |
| GPU per frame at 1080p | ≤ 8 ms on Apple M1 / Intel Iris Xe at Balanced | one simplex sample per octave (3 / 2 / 1 by band); the chroma split re-samples only below Φ 0.75; no post pass below High; `setPixelRatio(min(dpr, 1.5))` |
| lights | 3 points + key + hemisphere | ember is emissive; shadow map only from L1 at band 1 |
| memory | < 8 MB GPU | textures 0.5 + 0.5 + 1 MB; instance buffers 5k × 21 floats; two half-res RTs during a dissolve only |
| culling | none per instance | `frustumCulled = false`; the vertex shader collapses instances outside the band's visible ring radius to scale 0 |
| animation | zero CPU | block lerp, sweep, heat cooling, pulses, breathing, haze are functions of `uTime` and the textures |

Measured, not assumed: `?stats=1` overlays `renderer.info` and a 120-frame rolling frame time; `RECORDING-PLAN.md` records the laptop, resolution and quality for every take. The performance proof is `tests/fixtures/synthetic-city-5000.json` (labelled synthetic in the HUD; the live city is 2 × 3, and the video says so). Fallbacks in order: DPR 1.5 → 1, one noise octave, halo off. At 5,000 discrete houses the event stream (~70,000 events per tick) is the bottleneck, not the state: at band 3 and above `BURN` and `THOUGHT` are aggregated per node per tick in the reducer (heat comes from the texel anyway), and `NETTED`, `SLASHED`, `REJECTED`, `HALTED` stay tile-level clips.

## 12. Hosting a live demo: `serve` on Cloud Run (from the main repo)

The estate (`/home/user/context-engine-studio`) deploys its backend through `cloudbuild.yaml`: a Docker build of `backend/Dockerfile`, a push to `gcr.io/$PROJECT_ID/ces-backend:$COMMIT_SHA`, then `gcloud run deploy ces-backend --region us-central1 --platform managed --allow-unauthenticated` with `--update-env-vars` (the runbook `knowledge/reference/runbooks/2026-04-11--runbooks--CLOUD-RUN-DEPLOYMENT.md` records a Feb 14 outage from `--set-env-vars` wiping variables: never use it), followed by an explicit `gcloud run services update-traffic --to-latest`. `.github/workflows/deploy-backend.yml` authenticates with Workload Identity, submits the build, asserts the latest ready revision serves 100 % of traffic, and smoke-checks the URL and CORS. Cloud Run injects `PORT` (8080) and probes it; the wrong port kills the container at startup (`dev-docs/deployment.md`, the runbook's incident table). Secrets are Secret-Manager-backed on the service, never literals.

A hosted `serve` is a **separate** service (not `ces-backend`), and needs, in order:

1. The `serve.rs` change in §13.2: honour `PORT` and add `--bind 0.0.0.0` (it binds `127.0.0.1` today; a container with a loopback bind fails Cloud Run's probe).
2. A distroless image of the one static binary: `FROM rust:1.85 AS build` → `cargo build --release --bin serve` → `FROM gcr.io/distroless/static-debian12` → `CMD ["/serve", "--scenario", "house", "--bind", "0.0.0.0", "--interval-ms", "700"]`.
3. `gcloud run deploy ae-engine-demo --region us-central1 --platform managed --allow-unauthenticated --timeout 3600 --min-instances 1 --max-instances 1 --no-cpu-throttling --concurrency 80`: an SSE connection is one long request (the 300 s default would cut it); one instance is one world (two would be two worlds); ticks must run between requests.
4. The frontend built with `VITE_ENGINE_URL=https://<service url>`; the estate's static-site workflow (`.github/workflows/deploy-landing.yml`) is the shape its `dist/` can follow. No key lives in the frontend; the demo service carries no secret at all.

This is outside the laboratory's stop line (LABORATORY.md): a hosted, public page is Controlled work with its own docket. Nothing in this repository points a public page at `serve` as it is.

## 13. Engine-lane changes (engine change, do in the engine lane)

### 13.1 `wasm_abi.rs`: scenarios 3 and 5 — **already landed**, `dist` is stale

The diff map SCENARIOS proposed is on disk in commit `af24472` ("Expose the city, country and world scenarios to the browser and the server"), with the additional `4 => forged_country` arm; `serve.rs` has the matching `--scenario city|country|world` arms. For the record, the change as it stands relative to the map's baseline:

```diff
--- a/engine/src/wasm_abi.rs
+++ b/engine/src/wasm_abi.rs
@@
-/// scenario 1 = the house (Stage 1), 2 = the street (Stage 2).
+/// scenario 1 = the house (Stage 1), 2 = the street (Stage 2), 3 = the city
+/// (Stage 3: 2 streets × 3 houses, `budget` and `tasks` per house, the camera
+/// at the city so the Clearinghouse nets), 4 = a country whose cities'
+/// clearing collapses (Stage 4: the High Court; fixed parameters, `budget`
+/// and `tasks` ignored), 5 = the world (Stage 5: 3 countries × 2 cities in
+/// stasis; `budget` and `tasks` ignored; drain `engine_events()` once before
+/// the first tick to see the tick-0 `PACKED` events). Anything else builds
+/// the house.
 #[no_mangle]
 pub extern "C" fn engine_new(scenario: u32, seed: u64, budget: f64, tasks: u32, cost_visible: u32) {
@@
     let engine = match scenario {
         2 => scenarios::street(config, 6, budget, tasks as usize),
+        3 => scenarios::city(config, 2, 3, budget, tasks as usize),
+        4 => scenarios::forged_country(config, 5, 2, 2, 200.0, 10_000.0).0,
+        5 => scenarios::world(config, 3, 2),
         _ => scenarios::house(config, budget, tasks as usize),
     };
```

**What is still to do (engine lane):** the tracked artifact `engine/dist/context_engine.wasm` (339,214 bytes, built 21:10) predates this change; instantiated, it answers `engine_new(3, …)` and `engine_new(5, …)` with the two-node house. The fresh build `engine/target/wasm32-unknown-unknown/wasm/context_engine.wasm` (349,035 bytes, 22:18) answers scenario 3 with nine nodes and `NETTED { gross 60, net 20, envelopes 12 }` and scenario 5 with nine nodes and three tick-0 `PACKED` events. Refresh the tracked copy:

```
cd engine && cargo build --profile wasm --no-default-features --target wasm32-unknown-unknown \
  && cp target/wasm32-unknown-unknown/wasm/context_engine.wasm dist/context_engine.wasm
```

`scripts/copy-wasm.ts` guards against a recurrence: after copying it instantiates the file and refuses to continue if `engine_new(3, 7n, 400, 3, 1)` does not yield nine nodes.

### 13.2 `serve.rs`: `PORT` and `--bind` (needed only for a hosted demo, §12)

```diff
--- a/engine/src/bin/serve.rs
+++ b/engine/src/bin/serve.rs
@@
 struct Args {
     scenario: String,
     budget: f64,
     tasks: usize,
     seed: u64,
     interval_ms: u64,
     port: u16,
+    bind: String,
 }
 
 fn parse_args() -> Args {
     let mut a = Args {
         scenario: "house".into(),
         budget: 800.0,
         tasks: 15,
         seed: 7,
         interval_ms: 700,
-        port: 8787,
+        // Cloud Run injects PORT; local runs keep 8787.
+        port: std::env::var("PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(8787),
+        bind: "127.0.0.1".into(),
     };
@@
             "--port" => a.port = it.next().and_then(|v| v.parse().ok()).unwrap_or(a.port),
+            "--bind" => a.bind = it.next().unwrap_or(a.bind),
             _ => {}
@@
-    let listener = match TcpListener::bind(("127.0.0.1", a.port)).await {
+    let listener = match TcpListener::bind((a.bind.as_str(), a.port)).await {
```

Default behaviour is unchanged (loopback, 8787, no TLS, no auth); the lane tests that read the first stdout line keep working.

### 13.3 The trace: three runs and a seed field (scaffold's `scripts/record-trace.ts`, after `presentation/record_trace.mjs`)

`trace.json` has no `city`, `world` or `seed`, and no run in which a street's houses knock at their Doors. Add: `city` (`engine_new(3, 7n, 400, 3, 1)`, 30 ticks; `NETTED` every tick for three ticks, then only `TICK_COMMITTED`), `world` (`engine_new(5, 7n, 0, 0, 1)`, 40 ticks; the three tick-0 `PACKED` events at the head of frame 1; first finality at tick 9), `street_doors` (`engine_new(2, 7n, 1600, 40, 1); engine_zoom(1)`, 20 ticks, the recorded yes after 3 held ticks on House 1 only: the hero wide of DESIGN §11), and `seed: 7` on every run. Frames stay 1-based ticks. `record_trace.mjs` runs its recording at import, so it cannot be wrapped: `record-trace.ts` re-implements the same ~40-line loop against the same wasm and writes the same shape; the presentation-owned `.mjs` is not edited here (open question 2).

### 13.4 Optional: `state` in the SSE `tick` payload

Adding `"state": engine.state_view()` to the `tick` frame removes the per-tick `GET /state`. Not required; the source coalesces.

## 14. Build order

Day 0 (scaffold, atlas): the seams of §9 and `bands.ts`, frozen. Day 1: ui's `door.ts` and `tests/dom/door.test.ts` green against `TraceSource` + `NullRenderer` (acceptance before any pixel); qa's `no-leaderboard.test.ts`. Day 1–2: scaffold's `TileMesh` + truth textures on the 5,000 fixture, `drawcalls.spec.ts` green; the room band with the Door beats on `trace.house`. Day 2–3: the street band on `trace.street`; the city band on scenario 3 in wasm with `NETTED`; `SseSource` against `serve`. Day 3–4: atlas minimal (country, world); the design page; `RECORDING-PLAN.md`; goldens. Throughout: `contract-wasm.test.ts` runs on every push.

## Appendix A · the `clips.ts` table (event → clip)

| event | drawn by | clip kind | duration | feed line |
|---|---|---|---|---|
| `THOUGHT` | ui (bubble) | `bubble` | 2.4 s | `t{tick} · {seat}: {text}` |
| `BURN` | room / street (texel) | `flare` | to the next tick | `t · {seat} burned {credits} cr ({joules} J, {tier}{, cache hit})` |
| `PROPOSED` | room (Porter walk) / street (courier) | `carry` | 900 ms | `t · proposed {kind} to {to} · tax {tax_paid} cr` |
| `DROPPED_BY_COURIER` | street | `drop` | 500 ms | `t · dropped by the courier: {reason}` |
| `AWAITING_HUMAN_SIGNATURE` | ui (Door) + room | `hold` | until decided (state) | `t · the Porter is at the Door: {description} ({cost} cr)` |
| `AWAITING_FINALITY` | atlas | `orbit` | until `until_tick` (dedupe by envelope) | `t · held for finality until t{until_tick}` |
| `APPROVED` | by `gate`: room / street / city | `seal` | 600 ms | `t · approved at {GATE_NAME[gate]}` |
| `REJECTED` | by `gate` | `burn` (`hash mismatch` → `snapback`) | 700 ms | `t · rejected at {GATE_NAME[gate]} · {reason} · {sunk_compute} cr sunk` |
| `SLASHED` | city pulse | `flash` + `scorch` | 400 ms + 8 ticks | `t · slashed {amount} cr · {reason}` |
| `SETTLED` | street / city | `handshake` | 800 ms | `t · settled {amount} between {from} and {to}` |
| `DELIVERED` | street / room | `slot` | 300 ms | `t · delivered to {to}` |
| `STATE_SYNC` | truth (sweep) | `sweep` | 600 ms + cascade | `t · paid the oracle {cost} cr · Φ {confidence_before}% → 100%` |
| `HALTED` | ui (Note) + texel | `note` | until `note` is null (state) | `t · halted: {reason line}` |
| `SEAT_FAILED` | room | `tip` | 400 ms | `t · a seat failed mid-draft; the table is untouched` |
| `VOIDED` | atlas / ui | `strike` | 500 ms | `t · voided by the court: {reason}` |
| `TOPPED_UP` | room + ui | `coins` | 600 ms | `t · topped up {credits} cr` |
| `PACKED` | city (folds) | `fold` | 600 ms | `t · {children} children packed into {parent}` |
| `UNPACKED` | city (folds) | `unfold` | 600 ms | `t · {parent} unpacked {children} children after {macro_ticks} macro-ticks` |
| `NETTED` | city (pulse ring) | `netted` | 400 ms + 40 ms × radius | `t · netted {envelopes} envelopes · gross {gross} → net {net}` |
| `ROLLED_BACK` | atlas (pulse ring) + ui (ticker) | `rewind` | 900 ms | `t · rolled back to t{to_tick} · {reason} · {slashed} slashed` |
| `GLOBAL_STATE_CONFIRMED` | atlas (pulse ring) + ui | `heartbeat` | `latency_ticks × tickSeconds` | `t · STARK heartbeat · root {root8} · {latency_ticks} ticks` |
| `TICK_COMMITTED` | ui | `none` (block line; confirms a pending zoom) | 0 | `t · block committed · {nodes_active} active, {nodes_waiting} waiting, {nodes_halted} halted, {nodes_packed} packed` |

## Appendix B · `tokens.css` and `sound.ts`

```css
:root {
  /* the brief's validated set */
  --ground:#16110c; --panel:#1e1710; --raised:#27201a; --line:#3a2f24; --line-2:#4c3f30;
  --ink:#ece2cf; --ink-2:#b9a88f; --ink-3:#8a7a64; --dim:#7a6c5c;
  --gold:#d4a755; --gold-2:#b98626; --cyan:#2aa5b8; --cyan-2:#7cc8d3; --ember:#c95140; --ember-2:#e0705f;
  --sage:#6a9a6e; --sage-2:#8fbf92; --paper:#f0e6d2; --paper-2:#e3d6bb; --paper-ink:#1c150e;
  /* the world bible's oak set */
  --wall:#2c2219; --wall-2:#201811; --floor:#19130d; --oak:#5a422f; --oak-dark:#3e2d1f; --oak-top:#423021; --oak-leg:#312318;
  --door:#4a3525; --door-frame:#2e2116; --gold-light:#f2cb7a; --shelf:#4f3926; --case:#3a2a1c;
  --spine-a:#7a4f32; --spine-b:#8b3a2b; --spine-c:#3d5c48; --spine-d:#a6884e; --pill:#fff8ed; --paper-aged:#d8c8a8;
  --fur-scout:#d4913b; --fur-scribble:#7a624d; --fur-inspector:#5c5148; --fur-penny:#b9a88f; --fur-porter:#3e3b38;
  /* DESIGN §2 additions */
  --baize:#120e0a; --brass:#a8842e; --linen:#e9dfc6; --plinth:#2b2117; --plinth-lit:#4a3826; --roof:#7d4a34; --resin:#3e3a34; --soot:#0e0a06;
  /* stage fog tints */
  --fog-1:#8a7a64; --fog-2:#6e6152; --fog-3:#5f5548; --fog-4:#4f4740; --fog-5:#385b66;
  --display:"Fraunces",Georgia,"Times New Roman",serif; --ui:"Schibsted Grotesk","Helvetica Neue",Arial,sans-serif; --mono:"JetBrains Mono",Menlo,Consolas,monospace;
}
```

`sound.ts` (Web Audio, one oscillator into a gain with an exponential ramp to 0.0001 over the duration; nothing above gain 0.22): `coin` 987 Hz sine 0.15 s g0.08, then +50 ms 1318 Hz sine 0.20 s g0.06; `coinUp` the pair reversed; `write` 300–500 Hz random sawtooth 0.06 s g0.02; `knock` 120 Hz triangle 0.12 s g0.20, then +110 ms 110 Hz triangle 0.14 s g0.22; `stamp` 180 Hz sine 0.18 s g0.18, then +60 ms 90 Hz triangle 0.25 s g0.20; `halt` 220 Hz square 0.30 s g0.08, then +200 ms 164 Hz square 0.40 s g0.08; `sync` 1318 Hz sine 0.4 s g0.05; `heartbeat` the same sine held for the sweep. Off under reduced motion unless the person turns it on.

### B.1 Lighting presets (`lighting.ts`; DESIGN §2)

| preset | key azimuth / elevation / colour / intensity | hemisphere sky / ground / intensity | lantern emissive |
|---|---|---|---|
| Dawn | 100° / 10° / `#e6b78a` / 1.4 | `#2c2219` / `#16110c` / 0.5 | 0.9 |
| Noon | 200° / 62° / `#f4e6c8` / 2.4 | `#3a2f24` / `#19130d` / 0.8 | 0.25 |
| Golden (default) | 235° / 26° / `#e8c48a` / 1.9 | `#2c2219` / `#16110c` / 0.6 | 0.8 |
| Dusk | 265° / 8° / `#d49a6a` / 1.0 | `#241c14` / `#120e0a` / 0.45 | 1.3 |
| Night | 300° / 18° / `#8a7a64` / 0.3 | `#1e1710` / `#0a0806` / 0.3 | 1.6 |

A time-of-day slider interpolates linearly between neighbours; "Cycle day/night" steps one preset every 64 ticks on `TICK_COMMITTED`, never wall time; at Stage 5 the key is the sun on the sphere. Every key is warm so cyan stays the only cold colour.

### B.2 HUD zones and the Note (`hud.ts`, `note.ts`; DESIGN §3)

| zone | content |
|---|---|
| top-left, `#ladder` | The House, The Neighborhood, The City, The Country, The World; `active_scale` in gold; a pending band in `--ink-3` "asking the engine…"; the gate under each (`GATE_NAME`) |
| top-centre, `#block` | `tick`, `root` 8 hex, `executor`, `mempool`, the mode badge (`live · wasm in a worker` / `live · SSE {hello}` / `recorded run`), the STARK mark with `latency_ticks`; the settings button → popover (quality, lighting, time of day, cycle, sound, "rest to the room's angle") |
| top-right, the focus card | `name`, `#focus-status` pill, `#focus-purse` (`compute / compute_allocated`, gold bar, ember under 15 %), Φ with `generation` and `fog`, `tasks_done / tasks_total`, `current_task`, `burned_this_tick` ("0.0 cr this tick" while waiting), `liquidity_belief` beside `liquidity_truth` when they differ, `papers`, `oak_root` 8 hex |
| bottom-left `#gates` / bottom-right `#totals` | the five `state.gates` strings verbatim / the eight `totals` |
| bottom-centre | run, pause, step, speed, the zoom rail; the 40-line `#feed` drawer with `#receipts` (`node.receipts` verbatim, newest first) above it |
| bottom edge `#ticker`, ≥ 1024 px only | `root_history` as 16 mono tabs of 8 hex, newest right; a cyan tab on `GLOBAL_STATE_CONFIRMED`; on `ROLLED_BACK` the tabs after `to_tick` slide off |

Under 720 px only `#block`, the focus card and `dialog#door` are shown; the rest sits behind a "more" sheet. Status pill copy (`pills.ts`): `active` → "active"; `waiting_at_door` → "waiting at the door · 0.0 cr idle burn"; `halted` → "halted · the note is on the table"; `packed` → "packed · statistical stasis"; `partitioned` → "partitioned".

The Note (`#note`, shown while `node.note !== null`, anchored by `project()` to the Note's table position (0.4, 0.77, −0.2) in the focused house's frame): Fraunces heading "A note on the table"; mono rows "What it was doing" (`doing`), "Total cost burned" (`compute_burned_total` cr · `joules_burned_total` J), "Left in the purse" (`compute_remaining` cr), "Papers on the table" (`papers_on_table`), "Local state saved" (`saved_state`); the reason line from `Note::to_plain_line`: `runway_exhausted` → "Runway exhausted. A person must top up or close." (with `shortfall` cr), `closed` → "Closed by the person. The week is over.", `slashed` → "Slashed by the High Court. Reserves seized." (with `amount`), `partitioned` → "Partitioned from the rails."; then a numeric top-up field and one button, **Top up the purse** → `app.command({ decision: 'top_up', node, credits })`. It lifts when a later frame's `note` is `null`. There is no close-the-week command in the API; none is drawn.

## Appendix C · constants the frontend reads but never computes

Φ floor 0.05, ceiling 1.0; `HALLUCINATION_THRESHOLD` 0.75 (the chroma split); `OBSERVED_CONFIDENCE_AFTER_20_HANDOVERS` 0.5636 (the design-page reference tile); `DECAY_FACTOR` 0.97174 per idle tick (visible as Φ then / now on the Door); `ORACLE_COST` 15 cr; the recorded send fee 10 cr; `stark_period` 16 ticks; `serve` interval 700 ms; ids < 2^52; `house` run: the Door at ticks 1, 6, 11, …, the recorded yes on frames 5, 10, 15, …, `STATE_SYNC` at tick 11 (`confidence_before` 0.7324), `GLOBAL_STATE_CONFIRMED` at tick 16 (`latency_ticks` 32); `house_hidden_cost` halts at tick 9 (`shortfall` 11.8); `street`: truth moved to 12 before tick 7, six `hash mismatch` rejections per tick from tick 7; scenario 3 at tick 1: `NETTED { gross 60.0, net 20.0, envelopes 12 }`.
