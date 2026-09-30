# HANDOFF · The Context Engine (The Agentic Economy)

**Written for:** the next Claude agent (cloud or local) taking over this laboratory. Read this file first, then `src/lib.rs`, then `docs/AUDIT-LEDGER.md`.
**Date of handoff:** 2026-09-29. **Previous operator:** Claude Fable 5.1 in a Claude Code session.
**Authority:** `../LABORATORY.md`. This folder is a Director-declared laboratory: no docket, no launcher, no worktree or PR ceremony. Nothing here is shipped or adopted until the Director carries it across the stop line. Never write outside `~/Dev/Multi-Asset Workflows`. Never put a credential in a file, chat or log.

## 1. What this is

A Rust crate (`context-engine`, lib `context_engine`) that is the backend of the game *The Agentic Economy*: an **Asynchronous Agentic State Machine**, not an ECS. One `SovereignNode` struct at five scales (house, street, city, country, world). A tick is a block with four phases: Draft (parallel, isolated) → Collect → Verify (five gates, strategy pattern) → Commit (the only writer of the Sovereign Graph). The Golden Invariant is stated in `src/lib.rs` and tested in `tests/golden_invariant.rs` and `tests/law_1_forgery.rs`.

The same crate builds natively (Tokio multi-core executor) and to `wasm32-unknown-unknown` (341 KB, zero imports, raw C ABI in `src/wasm_abi.rs`). The Director's directive, verbatim intent: build the invisible context engine first; do not skip to rendering.

## 2. State at handoff (verified 2026-09-29; §5 applied since)

```
cargo test --no-fail-fast
  unit (lib)                 16 passed
  tests/golden_invariant.rs  14 passed
  tests/law_1_forgery.rs      5 passed
  tests/serve_smoke.rs        1 passed
  tests/stage2_letter_slot.rs 12 passed (the two DvP lock tests un-ignored 2026-09-29: they guard ledger #4 and #11)
  tests/stage3_clearinghouse  9 passed
  tests/stage4_high_court.rs  8 passed
  tests/stage5_recursive_stark 8 passed
cargo build --profile wasm --no-default-features --target wasm32-unknown-unknown   OK, 349,035 bytes (engine/dist holds this build)
cargo clippy --all-targets   one pre-existing note: too_many_arguments (8/7) on the private builder `populate`, src/scenarios/high_court.rs
cargo fmt --check            clean (default rustfmt, no rustfmt.toml; the crate was authored wide and the first `cargo fmt` reflowed it once, whitespace only)
~10,630 lines of Rust (src + tests; ~7,960 before the reflow)
```

**The reflow, for the record.** Commit `01b0b10` was authored wide and never formatted; the closing `cargo fmt` this file prescribes reflowed the crate once, whitespace only, and that reflow was committed on its own ("cargo fmt: reflow the crate once") before the test adaptations, so both diffs read cleanly. No `rustfmt.toml` was added: no stable configuration reproduces the authored style, and `disable_all_formatting` is a policy the Director sets, not a repair. `cargo fmt --check` is clean from here on.

**Since the handoff, cloud session of 2026-09-28/29, in commit order:** `engine/target` untracked, the wasm kept in `engine/dist` (`build-wasm.sh`); the six tests adapted and `serve` answering 404 (§5); `engine_new(3|4|5)` and `--scenario city|country|world` expose the city, the forged country and the world to the browser and the server; the presentation refreshed and published (§6); `serve` honours `PORT` and `--bind` for a hosted run; `frontend/DESIGN.md` and `frontend/ARCHITECTURE.md` written (§9); a `VaultBackend` behind the `vault` feature, checkpointed with review findings open (§7 item 2); the frontend scaffold's engine layer, checkpointed (§9). The two Stage 2 DvP lock tests are un-ignored (chip session commit 8a633af on `claude/friendly-lovelace-8wrrll`, applied by intent: the test's `SharedSlot` wrapper now forwards `verify_batch`, which is where ledger #11's lock map lives; the trait doc in `src/boundary.rs` says so). Verified after the checkpoints: `cargo test` passed=77 failed=0 ignored=0; `cargo test --features vault` passed=101 failed=0 ignored=0.

**The six lane tests are adapted (§5), and the suite is green.** They were written by parallel lane agents against the pre-audit engine and encoded behaviours that were then changed on purpose (see §4); §5 records each adaptation as applied.

## 3. Layout

```
engine/
  Cargo.toml                 features: native (default; tokio) · build wasm with --no-default-features · vault (native only; ureq; cargo test --features vault)
  src/lib.rs                 the Golden Invariant, module map, empirical anchors table
  src/node.rs                SovereignNode · DraftContext (PRIVATE fields, getters, recorded acts) · Agent trait
  src/tick.rs                Engine: tick(), collect(), verify(), commit(), settle_netted(), LOD, heartbeat, state_view()
  src/boundary.rs            gates: Stage1Door, Stage2LetterSlot, Stage3Clearinghouse, Stage4StatutoryLaw, Stage5RecursiveStark
  src/envelope.rs            ProposalEnvelope (asked_human flag), Payload, AtomicDvP
  src/executor.rs            DraftJob/DraftOutcome keyed by node; SequentialExecutor, TokioExecutor, block_on, block_on_bounded
  src/graph.rs               SovereignGraph: truth balances, contracts, deliveries, snapshots, rollback, settle_net
  src/epistemics.rs          handover drift (kernel formula), idle decay (doc 02 rule, DECAY_FACTOR literal), oracle trigger
  src/resources.rs           Purse, ModelTier specs, ResourceUnit (credits = tokens/10, 0.15 on cache hit)
  src/tax.rs                 CoordinationTax 1.0/1.25/1.40 (doc 04) + the two observed percentages
  src/lod.rs                 PackedStatisticalState (active children only), unpack weights
  src/agents/statistical.rs  Scout, Scribble, Inspector, Steward (Penny), Porter
  src/agents/llm.rs          LlmSeat + InferenceBackend trait + MockBackend (the purse reservation rule; MockBackend)
  src/agents/vault.rs        VaultBackend, feature `vault`: the estate Vault route, key redacted, retries, breaker; WIP, see §7 item 2
  src/scenarios/             house, street, city, drift (move_truth), high_court (forged_*), world
  src/wasm_abi.rs            engine_new/tick/authorize/reject/top_up/zoom/set_truth_price/state/events/out_ptr/version
  src/bin/house.rs           terminal demo (--door interactive|auto|reject|hold:N, --hidden-cost, --scenario street)
  src/bin/serve.rs           dependency-free HTTP/1.1 + SSE server: GET /state, GET /events, POST /authorize/<id> …
  tests/                     see §2
  docs/                      this file · AUDIT-LEDGER.md · TECH-STACK-DECISION.md · FRONTEND-DESIGNER-BRIEF.md
  docs/workflow/             raw outputs of the 121-agent audit/panel/lane workflow (lane reports with diffs, 6 stack proposals, facts, audit)
  docs/references/           the Director's three mood images (see §6)
../presentation/             index.template.html + part2/part3 fragments, build.py, record_trace.mjs, trace.json, index.html (STALE, see §7)
../frontend/                 DESIGN.md · ARCHITECTURE.md · the scaffold's engine layer (WIP); status in §9
```

Run it:
```
cd engine && cargo test
cargo run --release --bin house -- --door interactive
cargo run --release --bin house -- --hidden-cost --budget 300 --tasks 10
cargo run --release --bin serve -- --scenario street --interval-ms 700   # then GET http://127.0.0.1:8787/state
cargo build --profile wasm --no-default-features --target wasm32-unknown-unknown
```

## 4. Decisions taken (with the Director, 2026-09-28/29)

1. **Image 3 (hex colony video frame) is a mood reference, not the target look.** Reinterpret it in the oak-and-brass world of the existing prototypes (`../the-house.html`, `../the-zoom.html`). Images 1–2 (Julia/Mandelbrot) are the fractal thesis.
2. **The frontend designer will be a specialist agent.** The brief is `docs/FRONTEND-DESIGNER-BRIEF.md`; the Director passes it on. Do not build the game renderer in this crate.
3. **The coordination-tax claim is corrected.** In the original Python kernel (`../backend/ael/topologies.py`) the 19.99% "coordination tax" was added to a ledger but never deducted from the runway; the market halted because of cache misses. The engine keeps doc 04's 1.25/1.40 multipliers as a *design rule*; the two percentages justify that a tax exists, not the multipliers. Say this plainly wherever the number appears.
4. **Human sovereignty is not a camera setting.** An envelope presented to the person at the Door stays there whatever the camera does (`ProposalEnvelope.asked_human`). New envelopes minted while the camera is at Stage 2+ go to the algorithmic gate. Test: `once_asked_only_the_person_answers`.
5. **Send fee = 10 cr** (what the kernel actually charged: 100 tokens), not the battery's unused `spend_amount = 25`. The engine adds the crossing tax the kernel never charged.
6. **Idle decay while waiting is doc 02's rule, not a measurement.** Benchmark 3 held Φ constant while the door was closed. Keep the rule; attribute it honestly.
7. **Seats are trusted host code.** The type now prevents identity forgery, free calibration and receipt-less burns; it cannot prevent a seat from sharing an `Arc<Mutex>` with another seat. Documented in `node.rs`.

8. **Level of detail is a knob (AUDIT-LEDGER #30).** `EngineConfig::pack_depth: u8` (default 2, the behaviour before) makes `set_active_scale` pack the children of any parent whose children sit `pack_depth` or more levels below the camera. The city scenarios (`engine_new(3)`, `engine_new_city`, `serve --scenario city`) use 3: the houses the Clearinghouse nets stay live at the City and pack from the Country up; `serve --pack-depth N` overrides.

9. **A yes at the Door does not skip the kerb (doc 06, 2026-09-30).** A hire the person approves at the Door is re-queued with `door_cleared` and crosses the Letter Slot at the next tick, where the believed price is checked against the truth (`dvp_binding`); before, a Door-approved hire went straight to commit and could settle at a stale price. Everything else approved at the Door commits in the same tick as before. The demo's runs and takes are unaffected (their tests pass unchanged).

## 5. The six lane tests, adapted (done; kept for the record)

Line numbers are current (after `cargo fmt`).

| test | why it failed | change (as applied) |
|---|---|---|
| stage2 `the_letter_slot_history_records_settled_and_reverted_phases` (line 601) | `AtomicDvP.locked_compute` now records `tax_paid` (the lane itself flagged the 4× overstatement) | asserts `locked_compute == HIRE_WEIGHT * 0.25` (the 1.25× tax on a weight of 2.0: 0.5 cr) |
| stage2 `an_overdue_house_asks_the_oracle_itself_and_settles_next_tick` (510) | oracle trigger is now `generation + 2 >= MAX_UNCALIBRATED_HANDOVERS`, so neighbours at generation ≥ 3 also sync | the neighbours' `epistemics.generation` is reset to 0 before the tick-3 step; the 'neighbours still revert' assertion stays |
| stage2 `a_street_wide_stale_price_does_not_trip_the_high_court` (686; the lane's name was `…_trips_…`) | the court no longer counts hash-mismatch reverts (the lane's flagged flaw, fixed) | inverted: every revert is a hash mismatch, `!r.rolled_back`, no `RolledBack`/`Slashed` event, no injunction, truth balances unchanged |
| stage3 `unbacked_net_position_is_slashed_at_ten_percent` (343) | the Clearinghouse now price-checks (lane recommendation), so a hallucinated 500 is rejected as hash mismatch, not slashed | A unbacked at the TRUE price: `graph.set_liquidity(a, 3.0)`, the 500 belief removed, and B's `known_peers` cleared so A is a pure net debtor (a mutual pair nets to 0, which any truth backs); expects one `Slashed` of `10 × 0.10 = 1.0`. The lane's hallucinated-500 scenario is kept as its own test, `a_hallucinated_price_is_a_hash_mismatch_at_the_clearinghouse_not_a_slash` (435): the 500 is rejected at the City gate as a hash mismatch (ledger #4), nobody is slashed, B's honest hire clears |
| stage3 `cross_street_pays_1_40_and_same_street_pays_1_25` (521) | send fee is 10 cr | `assert_eq!(x.tax_paid, 2.5)` |
| stage4 `a_systemic_failure_trips_the_circuit_breaker` (98) | court reason text changed | checks `reason.contains("71%") && reason.contains("7 liquidity verdicts")` (5 failed locks + 2 honest payments at the Street gate) |

`cargo clippy --all-targets` still reports the one pre-existing note (`too_many_arguments` (8/7) on the private builder `populate`, `src/scenarios/high_court.rs`); it is left as is. `cargo fmt` is clean.

## 6. The presentation (for the YouTube video)

`../presentation/index.html` is a built single page: thesis, the three objects, three benchmark charts drawn from the raw record, the tick diagram, the five gates, a **live console running the wasm engine** with a recorded-run fallback, stack, code, colophon. It was refreshed on 2026-09-29 against the audited engine and published as a private Artifact: **https://claude.ai/artifact/8FdLqpXtN7UVJ4h8uTuujv** (republish to the same URL by passing it as `url`; sharing is set from the page's Share menu). To refresh:

```
cd engine && sh build-wasm.sh          # builds, then copies the artefact to engine/dist, which is tracked and is what build.py embeds
cd ../presentation && node record_trace.mjs ../engine/dist/context_engine.wasm trace.json && python3 build.py
```

The six copy corrections listed at the 2026-09-29 handoff (decay attribution, the Letter Slot caveat, the coordination-tax correction, the camera log line, send fee 25 → 10, the STACK object) are applied; three review rounds also fixed the measured lede, the tick lede, the house-staff comparison, the colophon's open list and the drift chart's phone labels. Palette for charts was validated on the dark ground: gold `#b98626`, cyan `#2aa5b8`.

## 7. Open work, in priority order (updated 2026-09-29)

1. **The frontend build** (`../frontend/`, brief §6): **done, the demo is complete** (§9). Stages 1–5, the altitude camera and the dissolves, the HUD and the Door, the tier 1–3 tests, `RECORDING-PLAN.md` and the nine takes under `frontend/takes/`. Deferred, by the Director's call of 2026-09-29: design-system page, bloom and dust, sound, 5,000-plate fixture, click-to-focus, contour slide, thought bubbles, goldens. Run: `cd frontend && npm install && npm run copy-assets && npm test && npm run test:gpu`. **Next, by the Director's call of 2026-09-29: the street as a game.** Design pass done: `../../game_design_docs/06_A_WEEK_ON_ELM_STREET.md` (the rules card, the costed decisions, the table, the no-score rule kept, the kitchen-table test and its kill criteria, build order in its §8: one Opus round, engine items 1–5, frontend 6–7). Round 1 built and merged (2026-09-30, §9). **Next:** a second reviewer and an automated playtest by Codex, on its own branch `codex/round-1-review`, from the brief `CODEX-REVIEW-AND-PLAYTEST.md` (this folder); Codex's review and playtest landed (`CODEX-REVIEW-2026-09-30.md`, merged 2026-09-30). **Round 2 authorized** the same day: the rules are doc 06 §10 (retry and payment, the pocket, the atomic answer, the calendar, the tuning matrix); Codex built it on `codex/round-2` (merged; `CODEX-ROUND-2-2026-09-30.md`: sending finishes every variant, balance unproven). **Round 3 authorized** 2026-09-30: the slow walk, doc 06 §11, a bounded experiment on `codex/round-3`; if it does not separate the strategies, stop before the larger fork. Then the kitchen-table playtest, which is the Director's, with doc 06 §7's measures and kill criteria. Nothing hosted.
2. **VaultBackend review findings** (commit ab260bb): bound the request's `max_tokens` by the seat's reservation (blocking); do not retry a timeout or an unreadable 2xx body; debit failed attempts in the ledger; compile `log` at `max_level_debug` so ureq's TRACE wire dump can never print the key; require https except loopback; halt the house on a reservation refusal. Then `cargo test --features vault`. No live call has been made; the Director key is not in this environment.
3. Policy questions in `docs/AUDIT-LEDGER.md` (#28 court rollback depth, #30 Stage 3 LOD tension, #31 receiver-side DvP, #32 Stage 5 ledger lines): the Director's.
4. Persistence: an append-only tick journal (decisions, top-ups, zooms, seeds) so a run is a fold of its inputs.
5. A hosted demo (`serve` on Cloud Run) is Controlled work behind the stop line: needs a docket. `serve` already honours `PORT` and `--bind`; `frontend/ARCHITECTURE.md` §12 has the service shape.

## 9. Frontend status (2026-09-29)

| deliverable (brief §6) | state |
|---|---|
| figure check (§11.5a) | done: `presentation/figure_check.py`, run by `build.py`; 16 claims against the JSON, D1/D2/D6 seeded, `--self-test` |
| design-system page | deferred (the spec is `frontend/DESIGN.md`; see the deferred list below) |
| playable Stage 1 and 2 against `serve` and the trace, Door flow complete | Stage 1 and 2 done on the trace. Room per REVIEW-ROOM (measured light), street per DESIGN §2b (Noon, limewash, rim dyes, cast and contact shadows, vignette): cottages, Letter Slots, chimneys, lanterns, kerb, couriers with the four-beat SETTLED and the hash-mismatch snap-back. Altitude rig with hysteresis, pending clamp, per-band tick seconds and presets. Live wasm/SSE wired; zoom dissolves (RT) not built; the room/street hand-off is a cut at A 1.5 |
| Stage 3 city with the `NETTED` pulse, bulbs not hexes (DESIGN §2c, §2c.1; ARCHITECTURE §7.3) | done. `layoutBulbs.ts`: children all round the rim but the ±35° attachment arc, R = max(2.2r, n·reach·1.15/π) (one deviation: §2c.1 seats by r; seated that way neighbouring streets' houses collide, so the seating term uses each child's reach r + 1.6·r_child), a ±1/24-spacing seeded jitter, terraces of 0.35 m per generation (`base`/`top` per plate). The plate mesh (App-owned, packed attributes, flat per-instance varyings) frays each rim by fog (EDGE_GAIN 4), throws specks past fog 0.5, tints a street's commons with its dye and paves the city in rings round the dome; dark earth with faint contour rings beyond. Street life (commons.ts): kerb ring, lantern posts between houses (state-coloured), paths to a centre stone where couriers meet, five to nine seeded trees; it stays drawn at city altitude (houses as roof and lantern). City: foundries and yards on the plate between the streets, trees along the tubes. Engine: `engine_new_city` and `serve --streets/--houses`. Φ in the city stays uniform by construction; the mixed-Φ take uses the Door (see `tests/gpu/city-swiftshader.spec.ts`). Not built: plate raycast focus, the 5,000-plate draw-call spec, UNPACKED motes, bloom |
| Stage 4 country (DESIGN §2c, §2c.1, §8, §10) | done. Engine: `scenarios::world_full(countries, cities, streets, houses, budget, tasks)` (the whole tree, statistical staff at the houses, `pack_depth` 3, camera at the Country; `city()` now shares `populate_city`), `engine_new_world` in the wasm, `serve --scenario world-full --countries --cities`; `tests/world_full.rs`. Frontend: the country plate terraced below its cities in cut card with contours; a Clearinghouse per city (scaled to its plate); the High Court's line (paper inlay at 40 % with a brass pin every 10°); ROLLED_BACK as a 900 ms unwind sweep with the plate drawn toward the fog tint, the ticker rewinding and 'rolled back to tN · M slashed' in the block line; VOIDED strikes the envelope's feed lines in sage; SLASHED flash and scorch from the pulse ring; the plateau dissolve (3 → 4) with the veil, pitch 30° → 55°. Verified on scenario 4 headless (`tests/unit/country.test.ts`, DOM court test) and on SwiftShader (`country-swiftshader.spec.ts`). Not built: the contour-layer slide of §8 |
| Stage 5 world (DESIGN §2c, §8, §10) | done. Engine: no change; `tests/world_full.rs` runs `world_full(3, 2, 3, 4)` at the World (houses packed, streets sealed, cities live) and checks the heartbeat at tick 16 (latency 8–32, no partition at the baseline). Frontend: `layoutBulbs` lays out every root (countries apart on the ground, `BulbLayout.trees`); `scene/atlas/globe.ts` places the sphere so the focused country's beacon stands where its relief stood; `WorldBand`: the sphere (R 6,000, #141d24, graticule and limb stroke #385b66) on a brass stand, the armillary ring at R + 300 tilted 23°, countries as panel plates tangent to the sphere by ascending id on the 30° N circle (at most 45° apart, centred on the face) with a gold pin and lantern beacon, fibre as great-circle arcs laid over the sphere (30 m up at the beacons, arching to 30 m + 0.08·R·ω mid-span, never a chord) with a 20 % cyan core; GLOBAL_STATE_CONFIRMED sweeps a cyan meridian round the globe and a comet round the ring over latency × tick seconds and lands a cyan tab on the ticker; AWAITING_FINALITY orbits the envelope at R + 150 round its beacon until until_tick (from the held list); a partitioned country goes dark (lantern, halo, fibre cores) until a later heartbeat omits it. The globe dissolve (4 → 5) is night falling: the veil in the World's ground colour #0a0806 (peak 0.7) and the background darkening over [4.35, 4.5] while the country stays centred and visible under it, receding only (the rig holds its apparent size P = distance × tan(fov / 2) on a log curve and backs the target away along the line of sight, so the camera never enters the sphere); at 4.5 the globe comes in with the beacons at the country's own size, growing to theirs by 4.85; pitch 55° → 35° and fov 4° → 40° over [4.35, 5.0]; band 5 rests at A 5.0. Verified headless (`tests/unit/world.test.ts`) and on SwiftShader (`world-swiftshader.spec.ts`). Not built: `?morph=1` curl |
| recording plan | done: `frontend/RECORDING-PLAN.md` (nine shots, one row each: what it shows, source and flags, ticks, band, lighting, duration, take command, output file) and the takes, 1280 × 720 H.264, committed under `frontend/takes/` with a README |
| headless test: the Door at the recorded tick | green. Final run (2026-09-29): 92 vitest (19 files; unit, DOM and the real wasm headless, incl. the Door at the recorded tick, the country's court and the world's heartbeat at tick 16), 8 SwiftShader specs on the real page (Door, thumbnail, room light, street, city ×2, country, world), 81 `cargo test`, `npm run build` clean; the nine takes are specs too, skipped unless `TAKE=1`. The live Door take asserts its beats as it records (Held 2 ticks, the rejection line, the purse down by the 10.0 cr fee) |

**The demo is complete (2026-09-29).** It contains: the room (Stage 1) with the Door flow and the HUD, live on the wasm and replayed from the trace; the street (Stage 2) with the kerb settle, the hash-mismatch revert and daylight; the city (Stage 3) as bulbs with the NETTED pulse, drift as frayed rims, sealed streets; the country (Stage 4) with the High Court's line, the rollback unwind, VOIDED and SLASHED; the world (Stage 5) with the globe, beacons, fibre, the STARK heartbeat, finality orbits and partitions; the altitude camera from the room to orbit with the four dissolves; nine rendered takes (`frontend/takes/`, shot list in `frontend/RECORDING-PLAN.md`). Also published as a private artifact for the Director on 2026-09-30, the built frontend with the engine in a worker and a launch card for the five scenes: https://claude.ai/artifact/VwDJ2DkQF86D2dGnqguQES (private, not a public surface; the artifact frame's WebAssembly support was not verifiable from the lab session at publish, so the local run in §9 is the fallback).

To render each take (from `frontend/`, after `npm install && npm run copy-assets`): `TAKE=1 npx playwright test take-shots` (shots 1, 3–6, 8, 9; `SHOT=<name>` for one), `TAKE=1 npx playwright test take-door` (shot 2, the live Door), `TAKE=1 npx playwright test take-zoom` (shot 7, room to world), then `sh scripts/encode-takes.sh` (WebM → `takes/*.mp4`; `GIF=1` for previews). The table in `RECORDING-PLAN.md` gives each shot's URL, ticks, band and lighting.

Deferred (not in the demo): design-system page, bloom and dust, sound, 5,000-plate fixture, click-to-focus, contour slide, thought bubbles, goldens.

Live cost: the demo and every take run the deterministic engine locally (the wasm in a Web Worker, statistical staff at the seats, no model calls), so running or re-rendering it costs CPU time only; rendering all nine takes takes about 12 minutes on the cloud container. No live model call has been made: the Vault seat is not wired to the frontend and the Director key is not in this environment (§7.2). A hosted demo (`serve` on Cloud Run plus the static build) would add hosting cost and is Controlled work behind a docket (§7.5).

**A Week on Elm Street, round 1 (`game_design_docs/06_A_WEEK_ON_ELM_STREET.md` §8, 2026-09-30): done.** Engine: the person's oracle (`Engine::sync`, `EngineConfig.oracle_policy` Staff | Person, wasm `engine_sync`, `serve POST /sync/<node>`); a settled hire delivers its draft (`HireService.task_id`, `Delivered` on `Settled`; a Door-approved hire crosses the kerb next tick, §4.9); the price walk (`EngineConfig.price_walk`, 8/10/12/14 about once a day, seeded); the week (`EngineConfig.week_ticks`, `HaltReason::WeekOver`, `Note.week` with the week's numbers per house); `scenarios::elm_street` (named houses at the House); `serve --names --week --price-walk --oracle person`; views: `NodeView.oracle_price/oracle_tick`, `HeldView.kind/target/target_name/task_id/believed_price`; wasm `engine_new_game`. Frontend: the phone view (`?house=<name or n>`: one Door, the composed card "Send it (10.0 cr)" / "Hire <neighbour>'s courier at <price>" / "Ask the oracle first (15 cr)" / "Leave it on the table", purse, liquidity, the oracle's last answer, the Note; no canvas) and the TV view (`?view=tv`: the street held at band 2 without moving the engine, the cottages named, Friday's Notes side by side, no totals row). Tests: `engine/tests/elm_street.rs` (six), `serve_smoke`'s game, `frontend/tests/dom/phone.test.ts` (four), `frontend/tests/gpu/game-swiftshader.spec.ts` (the phone still `phone-door.png`, the Notes still `tv-notes.png`). Not built, per doc 06: sound, avatars, chat, timers on the card, a season, any hosted table; the demo's takes are untouched.

To run it at a kitchen table (the laptop and the phones on the household wifi; no internet, no hosting):

```
cd frontend && npx vite --host                      # the page on the household wifi at :5173
cd engine && cargo run --release --bin serve -- --scenario street --names Ada,Ben,Cal,Dee --week 40 --price-walk --oracle person --interval-ms 10000 --bind 0.0.0.0
TV:     http://<laptop>:5173/?source=sse&view=tv
phones: http://<laptop>:5173/?source=sse&house=Ada   (or &house=1 … n, the houses in the order of their names; the pages find serve on the same host at :8787, &engine=http://host:port overrides)
```

Without a server, `?source=wasm&run=game&houses=4&week=40` (add `&house=Ada` or `&view=tv`) runs the same game in the browser, one tab per view, each with its own engine: good for a look, not for a table.

Finish (2026-09-30): the game's pieces are named as a person writes them on the list (`scenarios::PIECES`, "the council letter" … "the Friday summary"; the demo's street keeps its ids, so its trace and takes still read); the wasm is rebuilt; the private artifact (§9 above) carries the game's phone and TV views beside the five demo scenes, generated by `frontend/scripts/launch-page.py`.

## 10. Usage record

Cloud session `session_017K6GES9PnR23AwS2vThJFM` (2026-09-28 21:02 to 2026-09-29): five subagent workflows, 50 agent runs, about 7.3M subagent tokens; the session's own record reports USD 252.78 of usage on the overage pool, with the seven-day limit in `rejected` state from about 23:41 UTC on 28 September until 11:00 UTC on 29 September. Two workflows (the Vault repair round and the frontend scaffold) died on that limit; their partial work is the two WIP checkpoint commits. `TECH-STACK-DECISION.md` records the previous local session's judges stopping on the same limit the day before.

Session `session_01XfouYeTaaQi2P4RF3mnWhV` ("Game build #2", 2026-09-29 11:50 to 18:34 UTC, Opus 5.5 at high, no workflows, no subagents): §11.5 (a) to (e) through the demo's completion (b2536b6). Read from the lab session, its record's `cost_usd` is USD 55.52 (cache reads 169.5M tokens, cache writes 1.2M, output 591k; five-hour window, never in overage). The lab session (`session_017K6GES9PnR23AwS2vThJFM`, Fable 5.1: design judgement, review of every milestone's stills, the pastes) closes at USD 303.35 on its own record, the USD 252.78 above included. The Director's rule for anything further: at most 10–20 % of the weekly 20x Max allowance, Opus 5.5 at high, no workflows. Round 1 of the game (2026-09-30, the same Opus session): `cost_usd` 69.86 at its close, so about USD 14 for the round. The lab session closes at USD 326.72 on its record, with the seven-day limit in `allowed_warning`; the review and the playtest go to Codex (§7).

## 8. Provenance you will be asked about

`docs/workflow/facts.md` lists 62 facts with file and quote, and 17 discrepancies between the source documents, including: the foundations report's benchmark-3 table (33.0/467.0) vs the JSON (60.0/430.0); benchmark-2 intermediate values in the report vs the JSON; the guild's "1,593.8 credits reclaimed" being phantom (added to the runway, never removed); the kernel's door benchmark asserting 0.0 idle burn rather than measuring it (the engine's `law_4` test actually measures it); arithmetic slips in `ENERGETIC_RUNWAY_EXPERIMENTS.md`. Cite the JSON, not the report tables.

## 11. Operating rules for the build (the Director, 2026-09-29)

Budget: this is a side project; keep it inside 10–20 % of the weekly subscription. The USD 252.78 cloud grant is spent.

1. **Model and effort:** Claude Opus 5.5 at effort `high`. Not Fable (2.5× the price per token for implementation the specs already decide), not `xhigh`.
2. **No multi-agent workflows, ultracode off.** Build in the main session; at most one review pass at the end. The workflows of 2026-09-28 cost most of the grant (the raw record is in `docs/workflow/cloud-session-2026-09-29/`).
3. **Spend checkpoints:** the session's own record (`get_session` → `external_metadata.usage.cost_usd`, `rate_limit_info`) is the meter. The Director sets a ceiling per session; stop at 80 % of it, commit, push, report.
4. **Keep the context small:** small tool outputs, never re-read a file already read, no full-file dumps of trace.json or the specs.
5. **Order of work:** (a) the figure check in code (jev's finding): a script run by `presentation/build.py` that fails when a template figure disagrees with the JSON record, seeded with the discrepancies in `docs/workflow/facts.md` (D1: foundations 33.0/467.0 vs JSON 60.0/430.0; D2: gen 5/10/15 87.2/76.0/65.5 vs 88.7/74.4/63.6; D6: 340 vs 150 is 190 not 210, 10 vs 3 is 3.33× not 2.3×, 1.17/0.56 is 2.09 not 1.9); copy agents stay for prose only. (b) The room (Stage 1) with the Door flow and the HUD: the thumbnail and the moral centre. (c) The street. (d) The city with the `NETTED` pulse. (e) Atlas, design page, recording plan last; deferrable.
6. **Stay in the cloud environment:** it has the Rust toolchain with the wasm target, Node 22, headless Chromium with software WebGL for screenshots, and both repositories. The Vault route is unreachable here without the Director key in the environment settings; the frontend does not need it.
7. **Sharing:** a public demo (`serve` on Cloud Run plus the built frontend as a static site) is Controlled work with a docket; the shape is in `../frontend/ARCHITECTURE.md` §12 and `serve` already honours `PORT` and `--bind`.
