# Brief for the frontend specialist agent · The Agentic Economy

**Written for:** the specialist agent who will design and build the game's visual frontend. You did not see the engine being built; everything you need is here or linked. The Director will pass you this file.

## 1. What you are building

The visible half of a simulation game whose invisible half already exists: a Rust **context engine** (this folder, `engine/`) that simulates an economy of autonomous agents at five nested scales. You render what the engine says and nothing else. You never simulate. You never reach into a node.

The game's thesis, in one line: **state moves only at a boundary, and nothing is shared by default.** Every visual you make should let a viewer *see* that: private drafting inside a house, an envelope leaving it, a gate deciding, and only then the world changing.

Read, in this order (all short): `../IF-THE-AGENTS-DO-THE-ECONOMY.md` (the story: the purse, the note, the door), `../game_design_docs/03_FRACTAL_SCALING_AND_LOD.md` §3 (the visual spec per stage), `../game_design_docs/02_ENTITY_STATE_MACHINE.md` §4 (how Φ maps to shaders), `../GAME_ENGINE_ARCHITECTURE.md` §4, then `engine/src/lib.rs`, `engine/src/events.rs`, `engine/src/tick.rs` (the `StateView`/`NodeView`/`HeldView` structs at the bottom). Open `../the-house.html` and `../the-zoom.html` in a browser: they are the existing 2D prototypes and carry the house's visual world.

## 2. Art direction

**Mood references** (`docs/references/`): `mood-3-hex-colony-video-frame.png` is an isometric hex colony with little agents and a settings rail (HDR + bloom, shadows, planet and lighting presets, "rest to isometric"). The Director's ruling: **it is a mood reference, not the target look.** Take from it: the isometric hex zoning, the readable little actors going about their work, the crispness and depth, the day/night and quality presets, the joy. Do **not** take its palette or its sci-fi kit.

**The target world is the room with the oak table.** Warm dark ground, oak and brass, paper and ink, one cold accent for verification. Tokens the presentation already uses (validated for colour-vision deficiency on the dark ground): ground `#16110c`, panel `#1e1710`, line `#3a2f24`, ink `#ece2cf`, muted `#8a7a64`, gold (display) `#d4a755`, gold (marks) `#b98626`, verification cyan `#2aa5b8`, sunk-cost ember `#c95140`, approval sage `#6a9a6e`, paper `#f0e6d2`. Type: Fraunces (display), Schibsted Grotesk (UI), JetBrains Mono (receipts, hashes). You may extend these; do not replace them without a reason you write down.

`mood-1` and `mood-2` (Julia and Mandelbrot sets) are the fractal thesis: the same rule at every zoom. The zoom itself should feel like that: continuous, self-similar, never a hard cut.

**Vocabulary you must keep:** the Purse, the Oak Table, the Door, the Porter, the Note, the Letter Slot, the Clearinghouse, the High Court, the STARK heartbeat, Scout / Scribble / Inspector / Penny / Porter. Seats are staff, not traders. **There is no score, rank, reputation or leaderboard anywhere, and there must not be one on screen.** (A test enforces it in the state view.)

## 3. The five stages (what exists at each, from doc 03)

| stage | geometry | actors | events to animate |
|---|---|---|---|
| 1 House | interior cutaway: the Desk, the Purse, the Oak Table, the Door | five seats moving between stations | `Burn` (heat/exhaust at a seat), `Thought` (speech), `Proposed` (the Porter walks to the Door), `AwaitingHumanSignature` (the Door modal, the whole node pauses), `Approved`/`Rejected`, `Delivered`, `StateSync` (a cascading light sweep resets the fog), `Halted` (the Note on the table) |
| 2 Street | 20–50 houses on a street | couriers between letter slots | `Settled` (an atomic handshake at the kerb), `Rejected` with "hash mismatch" (the swap reverts; a ripple of static), `Netted` is not here |
| 3 City | hex-grid zoning; foundries, data centres, the central Clearinghouse | batch transport lines (glowing tubes) | `Netted` (an end-of-tick pulse through the clearinghouse: gross in, net out), `Slashed` |
| 4 Country | topographic map of cities as nodes; regulatory boundary lines | the High Court | `RolledBack` (the whole graph rewinds one snapshot; a visible unwind), `Voided`, `Slashed` |
| 5 World | planetary sphere / orbital | intercontinental fibre | `GlobalStateConfirmed` (8–32 tick finality pulse: a sweeping radar line), `AwaitingFinality`, partition (a country goes dark on the rails) |

Fog of war: every node carries `confidence` Φ ∈ [0.05, 1] and `fog = 1 − Φ`. Crisp at 1.0; Perlin/simplex distortion increasing with fog; a `StateSync` event sweeps it clean. Compute: `compute / compute_allocated` is the purse gauge; `burned_this_tick` is heat. Status pills: `active`, `waiting_at_door` (0.0 cr idle burn, say so), `halted` (show the note), `packed` (statistical stasis: render the parent's `packed` profile, not the children), `partitioned`.

## 4. The contract (what the engine gives you)

**State** (`GET /state` or wasm `engine_state()`): `StateView { tick, active_scale, root, executor, nodes: [NodeView], held: [HeldView], mempool, totals, gates: [String], last_report, root_history }`. `NodeView` fields: `id, name, stage, gate, parent, children, status, compute, compute_allocated, compute_burned, joules_burned, compute_reclaimed, liquidity_belief, liquidity_truth, confidence, fog, generation, idle_ticks, calibrations, tasks_total, tasks_done, current_task, held, packed, note, burned_this_tick, oak_root, papers, receipts`. `HeldView`: `envelope, node, node_name, description, cost, gate, reason ("awaiting_human_signature" | "awaiting_finality"), created_tick`. Ids are integers below 2^52 (JSON-safe); post them back as numbers.

**Events** (`GET /events` SSE `tick` frames `{report, events}` or wasm `engine_events()`): the `EngineEvent` enum in `engine/src/events.rs`, tagged `"type"` in SCREAMING_SNAKE_CASE. Every animation is keyed off an event, never off polling a value.

**Commands:** `POST /authorize/<envelope>`, `/reject/<envelope>`, `/top-up/<node>/<credits>`, `/zoom/<1-5>`, `/pause`, `/resume` (server, `engine/src/bin/serve.rs`), or the wasm exports `engine_authorize/reject/top_up/zoom/set_truth_price`. The camera command changes which gate verifies *new* envelopes; an envelope already presented to the person stays at the Door regardless (`asked_human`). Show that.

**Three sources, one interface:** implement `EngineSource` producing `Frame { tick, state, events }` from (a) the wasm module in a Web Worker (offline demo; `../presentation/part3.template.html` has a working adapter to copy), (b) the SSE server, (c) a recorded trace (`../presentation/record_trace.mjs` shows the format). Tests run against (c) with no GPU.

## 5. Render architecture (converged from three independent proposals; details in `docs/workflow/proposal-frontend-*.md`)

- TypeScript, Vite. Three.js on WebGL2 with the WebGPU renderer behind a flag.
- One `InstancedMesh` of hex prisms for the city; per-instance attributes or a per-node RGBA16F data texture ("truth buffer") carrying Φ, compute fraction, burn, status, last-sync time. Fog, sweep and gate pulses evaluated in the shader from that buffer.
- One camera whose position, fov and LOD band are functions of a single **altitude** scalar; orthographic-feeling dimetric at Stages 1–4, opening to an orbital perspective at Stage 5; cross-dissolve at band edges. Zooming calls `zoom/<n>`; the frontend never packs or unpacks itself, it animates when `Packed`/`Unpacked` arrive.
- Hex axial coordinates laid out deterministically from the graph (same seed, same city), so a recording can be re-shot frame for frame.
- UI layer (HUD, the Door dialog, receipts, the Note) in DOM, not in the canvas: the Door is a real `<dialog>` with **Yes, send it** / **No, leave it on the table**, the cost, and the line "Nothing burns while you decide" with the live proof (ticks held, purse unchanged, Φ then and now).

## 6. Deliverables and acceptance

1. A design system page: palette, type, the five stage palettes, the tile and actor kit, motion rules (one orchestrated moment per event type; respect `prefers-reduced-motion`).
2. A playable Stage 1 and Stage 2 against the SSE server and against the recorded trace, with the Door flow complete.
3. A Stage 3 hex city rendering `scenarios::city` (2 streets × 3 houses is fine) with the `Netted` pulse.
4. A recording plan for the YouTube video: shot list keyed to seeds and ticks.
Acceptance: no value on screen that is not in `StateView` or an event; no per-frame polling of state; 60 fps with 5,000 instanced tiles on a laptop; a headless test that replays `trace.json` and asserts the DOM shows the Door at the recorded tick.

## 7. What not to do

Do not add fees between seats, a reputation number, or a "best helper" board. Do not render a node's Oak Table contents to other nodes. Do not compute anything the engine should compute (netting, decay, prices). Do not use the sci-fi kit of the mood reference. Do not publish outside this laboratory folder.
