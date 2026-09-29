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

1. **The frontend build** (`../frontend/`, brief §6). The spec is written (`DESIGN.md`, `ARCHITECTURE.md`) and the scaffold's engine layer is in (contract types, the three `EngineSource`s and the worker, store/reducer/clips/bus, hex layout, 69 unit tests). Done since: `App`, `main.ts`, the band-1 rig, the ui lane (HUD, the Door dialog, the Note, receipts) and the room (see §9). Not started: the truth buffer and tile mesh, the street, city and atlas bands, the design-system page, `RECORDING-PLAN.md`, the Door-at-recorded-tick tests. Build order: ARCHITECTURE §14. Run: `cd frontend && npm install && npm run copy-assets && npm test`.
2. **VaultBackend review findings** (commit ab260bb): bound the request's `max_tokens` by the seat's reservation (blocking); do not retry a timeout or an unreadable 2xx body; debit failed attempts in the ledger; compile `log` at `max_level_debug` so ureq's TRACE wire dump can never print the key; require https except loopback; halt the house on a reservation refusal. Then `cargo test --features vault`. No live call has been made; the Director key is not in this environment.
3. Policy questions in `docs/AUDIT-LEDGER.md` (#28 court rollback depth, #30 Stage 3 LOD tension, #31 receiver-side DvP, #32 Stage 5 ledger lines): the Director's.
4. Persistence: an append-only tick journal (decisions, top-ups, zooms, seeds) so a run is a fold of its inputs.
5. A hosted demo (`serve` on Cloud Run) is Controlled work behind the stop line: needs a docket. `serve` already honours `PORT` and `--bind`; `frontend/ARCHITECTURE.md` §12 has the service shape.

## 9. Frontend status (2026-09-29)

| deliverable (brief §6) | state |
|---|---|
| figure check (§11.5a) | done: `presentation/figure_check.py`, run by `build.py`; 16 claims against the JSON, D1/D2/D6 seeded, `--self-test` |
| design-system page | spec only (`frontend/DESIGN.md`) |
| playable Stage 1 and 2 against `serve` and the trace, Door flow complete | Stage 1 and 2 done on the trace. Room per REVIEW-ROOM (measured light), street per DESIGN §2b (Noon, limewash, rim dyes, cast and contact shadows, vignette): cottages, Letter Slots, chimneys, lanterns, kerb, couriers with the four-beat SETTLED and the hash-mismatch snap-back. Altitude rig with hysteresis, pending clamp, per-band tick seconds and presets. Live wasm/SSE wired; zoom dissolves (RT) not built; the room/street hand-off is a cut at A 1.5 |
| Stage 3 hex city with the `NETTED` pulse | done against scenario 3 in the wasm: `TruthBuffer` + shared uniforms + one `TileMesh` InstancedMesh (Φ fog, hatch, grain, purse arc, status rim, heat, sweep, packed fold, street dye, sage ticks, the NETTED ring and SLASHED flash/scorch from the pulse ring), Clearinghouse with the flare, tubes with the fill, street lanterns, foundries, slate data yards, baseboard; the block line writes the netting. Not built: tile raycast focus, the 5,000-tile fixture source and `drawcalls.spec`, UNPACKED ember motes, bloom |
| recording plan | not started |
| headless test: the Door at the recorded tick | green (94 vitest, 5 SwiftShader specs incl. `room-light`, `street`, `city`): `tests/dom/door.test.ts` (3), `note`, `hud` (incl. the forbidden-word scan through the real UI), `tests/unit/room.test.ts`; SwiftShader `tests/gpu/door-swiftshader.spec.ts` (ticks 1–4–5 and the thumbnail take `?take=thumbnail`) |

Share of this handoff's total effort done: about half. The engine side is near complete, the presentation is published, and the frontend is a spec plus its data layer; its rendering is most of what remains.

## 10. Usage record

Cloud session `session_017K6GES9PnR23AwS2vThJFM` (2026-09-28 21:02 to 2026-09-29): five subagent workflows, 50 agent runs, about 7.3M subagent tokens; the session's own record reports USD 252.78 of usage on the overage pool, with the seven-day limit in `rejected` state from about 23:41 UTC on 28 September until 11:00 UTC on 29 September. Two workflows (the Vault repair round and the frontend scaffold) died on that limit; their partial work is the two WIP checkpoint commits. `TECH-STACK-DECISION.md` records the previous local session's judges stopping on the same limit the day before.

Session `session_01XfouYeTaaQi2P4RF3mnWhV` (2026-09-29, Opus 5.5 at high, no workflows, no subagents): §11.5 (a) and (b). The session record exposes no `cost_usd`, only `rate_limit_info` (five-hour window, `allowed`), so spend was not measurable from inside the session.

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
