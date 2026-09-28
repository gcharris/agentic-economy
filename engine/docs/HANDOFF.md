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
  tests/stage2_letter_slot.rs 10 passed, 2 ignored (by design)
  tests/stage3_clearinghouse  9 passed
  tests/stage4_high_court.rs  8 passed
  tests/stage5_recursive_stark 8 passed
cargo build --profile wasm --no-default-features --target wasm32-unknown-unknown   OK, 349,035 bytes (engine/dist holds this build)
cargo clippy --all-targets   one pre-existing note: too_many_arguments (8/7) on the private builder `populate`, src/scenarios/high_court.rs
cargo fmt --check            clean (default rustfmt, no rustfmt.toml; the crate was authored wide and the first `cargo fmt` reflowed it once, whitespace only)
~10,630 lines of Rust (src + tests; ~7,960 before the reflow)
```

**The reflow, for the record.** Commit `01b0b10` was authored wide and never formatted; the closing `cargo fmt` this file prescribes reflowed the crate once, whitespace only, and that reflow was committed on its own ("cargo fmt: reflow the crate once") before the test adaptations, so both diffs read cleanly. No `rustfmt.toml` was added: no stable configuration reproduces the authored style, and `disable_all_formatting` is a policy the Director sets, not a repair. `cargo fmt --check` is clean from here on.

**The six lane tests are adapted (§5), and the suite is green.** They were written by parallel lane agents against the pre-audit engine and encoded behaviours that were then changed on purpose (see §4); §5 records each adaptation as applied.

## 3. Layout

```
engine/
  Cargo.toml                 features: native (default; tokio) · build wasm with --no-default-features
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
  src/agents/llm.rs          LlmSeat + InferenceBackend trait + MockBackend (no live backend)
  src/scenarios/             house, street, city, drift (move_truth), high_court (forged_*), world
  src/wasm_abi.rs            engine_new/tick/authorize/reject/top_up/zoom/set_truth_price/state/events/out_ptr/version
  src/bin/house.rs           terminal demo (--door interactive|auto|reject|hold:N, --hidden-cost, --scenario street)
  src/bin/serve.rs           dependency-free HTTP/1.1 + SSE server: GET /state, GET /events, POST /authorize/<id> …
  tests/                     see §2
  docs/                      this file · AUDIT-LEDGER.md · TECH-STACK-DECISION.md · FRONTEND-DESIGNER-BRIEF.md
  docs/workflow/             raw outputs of the 121-agent audit/panel/lane workflow (lane reports with diffs, 6 stack proposals, facts, audit)
  docs/references/           the Director's three mood images (see §6)
../presentation/             index.template.html + part2/part3 fragments, build.py, record_trace.mjs, trace.json, index.html (STALE, see §7)
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

`../presentation/index.html` is a built single page: thesis, the three objects, three benchmark charts drawn from the raw record, the tick diagram, the five gates, a **live console running the wasm engine** with a recorded-run fallback, stack, code, colophon. It is **STALE**: built against the pre-audit wasm and trace. To refresh:

```
cd engine && sh build-wasm.sh          # builds, then copies the artefact to engine/dist, which is tracked and is what build.py embeds
cd ../presentation && node record_trace.mjs ../engine/dist/context_engine.wasm trace.json && python3 build.py
```

Copy that must change before publishing (edit `index.template.html` / `part2.template.html`):
- "Truth, though, keeps decaying while you decide" → attribute to doc 02's rule; the kernel held Φ constant.
- Gates section: "Zoom out from a house and its Door becomes the street's Letter Slot" → add "for envelopes the person has not yet been asked about".
- Benchmark 1 caption and the provenance box: add the correction that the 19.99% was never deducted from the runway in the kernel.
- The console's camera control no longer bypasses the Door; keep it, explain it in the log line.
- Send fee 25 → 10 in any copy; the house now finishes more of the 15 tasks on 800 cr.
- `part3.template.html` STACK object: replace with the decision in `docs/TECH-STACK-DECISION.md`.
Then publish as an Artifact (the previous operator had not published; there is no artifact URL to preserve). Palette for charts was validated on the dark ground: gold `#b98626`, cyan `#2aa5b8`.

## 7. Open work, in priority order

1. Adapt the six tests (§5): done. 2. Refresh and publish the presentation (§6). 3. Hand `docs/FRONTEND-DESIGNER-BRIEF.md` to the frontend agent (the Director does this). 4. Open items in `docs/AUDIT-LEDGER.md` marked *open* (policy questions: court rollback depth and coherence marker; Stage 3 LOD tension; receiver-side DvP verification; Stage 5 settlement writing no ledger line to Oak Tables, #32; #33, `serve` answering 404 for unheld envelopes, is done). 5. A real `InferenceBackend` over the estate Vault route (read `context-engine-studio/knowledge/reference/dev-docs/calling-vault-models-from-an-agent.md` first; never print a key). 6. Persistence: an append-only tick journal (decisions, top-ups, zooms, seeds) so a run is a fold of its inputs.

## 8. Provenance you will be asked about

`docs/workflow/facts.md` lists 62 facts with file and quote, and 17 discrepancies between the source documents, including: the foundations report's benchmark-3 table (33.0/467.0) vs the JSON (60.0/430.0); benchmark-2 intermediate values in the report vs the JSON; the guild's "1,593.8 credits reclaimed" being phantom (added to the runway, never removed); the kernel's door benchmark asserting 0.0 idle burn rather than measuring it (the engine's `law_4` test actually measures it); arithmetic slips in `ENERGETIC_RUNWAY_EXPERIMENTS.md`. Cite the JSON, not the report tables.
