# facts
- [F01] Benchmark 1 (Coasean Boundary) workload: 15 tasks on an 800.0-credit budget, with per-task token loads 280 lookup / 650 draft / 320 audit. = **15 tasks; 800.0 cr; 280/650/320 tokens** (/Users/gch2021/Dev/Multi-Asset Workflows/ael_battery.py) — “b1 = benchmark_coasean_boundary(workload_size=15, initial_budget=800.0)” · caveat: TaskDefinition also sets spend_amount=25.0, but topologies.py never reads it (see discrepancies).
- [F02] House Staff topology completed all 15 tasks. = **15 / 15** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"house_staff": {
      "tasks_completed": 15,”
- [F03] House Staff total runway burned (reproduces as 15 x (28.0 + 9.75 + 4.8 + 10.0) = 788.25). = **788.25 credits** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"total_burned": 788.2499999999998,”
- [F04] House Staff coordination tax. = **0.0 credits (0.0%)** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"spent_on_coordination": 0.0,
      "coordination_overhead_pct": 0.0,”
- [F05] House Staff final epistemic confidence after 15 tasks (30 handovers at rigor 0.90/0.98). = **0.6634** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"final_confidence": 0.6634,
      "halted": false”
- [F06] Coasean Market completed 5 of 15 tasks and halted with the budget exhausted. = **5 / 15; 800.0 cr burned; halted: true** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"coasean_market": {
      "tasks_completed": 5,
      "total_burned": 800.0,”
- [F07] Coasean Market coordination tax as recorded. = **159.9 credits (19.99%)** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"spent_on_coordination": 159.9,
      "coordination_overhead_pct": 19.99,” · caveat: This 159.9 is a side ledger; it was never debited from the credit runway (see discrepancies D4). spent_on_work is also 800.0, so work + coordination = 959.9 > 800.0 burned.
- [F08] Coasean Market final confidence (fewer handovers because it halted early). = **0.8316** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"final_confidence": 0.8316,
      "halted": true”
- [F09] Federated Guild completed 15/15 on 431.25 credits, with 1593.75 credits 'reclaimed' by Penny and final confidence 0.6721. = **15/15; 431.25 cr; penny_reclaimed 1593.75; Φ 0.6721** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"federated_guild": {
      "tasks_completed": 15,
      "total_burned": 431.25,
      "spent_on_work": 431.25,
      "spent_on_coordination": 0.0,
      "penny_reclaimed": 1593.75,
      "final_confid” · caveat: penny_reclaimed is credited to the pool without ever having been deducted (discrepancy D3).
- [F10] Foundations report headline efficiency figures per topology (reproduce as 15/788.25, 5/800, 15/431.25). = **0.019 / 0.006 / 0.035 tasks per credit** (/Users/gch2021/Dev/Multi-Asset Workflows/AGENTIC_ECONOMY_FOUNDATIONS.md) — “| **Effective Efficiency** | $0.019\,\text{tasks/credit}$ | $0.006\,\text{tasks/credit}$ | **$0.035\,\text{tasks/credit}$** |”
- [F11] Foundations report's claim that the market delivered 66.7% less work ((15-5)/15). = **66.7% less completed work** (/Users/gch2021/Dev/Multi-Asset Workflows/AGENTIC_ECONOMY_FOUNDATIONS.md) — “The Coasean market delivered **66.7% less completed work** on the exact same budget.”
- [F12] Benchmark 2 uncalibrated drift, generation 1. = **0.9764 (97.6%)** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"generation": 1,
        "tier": "balanced_staff",
        "confidence": 0.9764”
- [F13] Benchmark 2 uncalibrated drift, generation 5. = **0.8866 (88.7%)** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"generation": 5,
        "tier": "frontier_deep",
        "confidence": 0.8866” · caveat: AGENTIC_ECONOMY_FOUNDATIONS.md's table prints 87.2% for Gen 5 (discrepancy D2).
- [F14] Benchmark 2 uncalibrated drift, generation 10. = **0.744 (74.4%)** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"generation": 10,
        "tier": "balanced_staff",
        "confidence": 0.744” · caveat: Foundations table prints 76.0% (discrepancy D2).
- [F15] Benchmark 2 uncalibrated drift, generation 15. = **0.6357 (63.6%)** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"generation": 15,
        "tier": "fast_quantized",
        "confidence": 0.6357” · caveat: Foundations table prints 65.5% (discrepancy D2).
- [F16] Benchmark 2 uncalibrated drift, generation 20 (the headline 56.4%). = **0.5636 (56.4%)** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"final_confidence_uncalibrated": 0.5636,”
- [F17] Benchmark 2 calibrated condition: oracle every 5 generations at 15 credits each, final confidence 1.0, total 60.0 credits. = **1.0 final; 60.0 cr (4 x 15 cr)** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"final_confidence_calibrated": 1.0,
    "total_calibration_spend": 60.0,”
- [F18] Benchmark 2 drift formula and rigor used by the battery. = **decay = (1 - σ_tier) x (1 - 0.5 x rigor); rigor 0.82; tier rotation fast/balanced/frontier by gen % 3** (/Users/gch2021/Dev/Multi-Asset Workflows/backend/ael/kernel.py) — “decay = (1.0 - tier_stability) * (1.0 - (rigor * 0.5))
        self.confidence = max(0.05, self.confidence * (1.0 - decay))” · caveat: Battery call site: ael_battery.py line 129 `conf = tracker_uncalibrated.record_handover(tier, rigor=0.82)`; kernel's own default is rigor=0.85.
- [F19] Benchmark 3 (Spend Door) simulated review delay. = **100 ticks** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"simulated_waiting_ticks": 100,”
- [F20] Benchmark 3 burn before the door (200 tok fast = 20.0 cr + 400 tok balanced = 40.0 cr) and credits at the door on a 500-credit runway. = **60.0 cr burned; 440.0 cr at door** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"burned_before_door": 60.0,
    "credits_at_door": 440.0,” · caveat: Foundations table shows 33.0 / 467.0 instead (discrepancy D1).
- [F21] Benchmark 3 idle burn while waiting at a clean door. = **0.0 credits** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"idle_burn_in_clean_door": 0.0,” · caveat: In the Python battery this is an assigned constant (`idle_burn_clean = 0.0`, ael_battery.py line 204), not a measured loop. The Rust test law_4_the_door_holds_at_zero_burn actually runs 100 ticks and asserts compute_burned == 0.0 each tick.
- [F22] Benchmark 3 busy-poll contrast waste and percentage of the 500-credit budget. = **50.0 credits; 10.0%** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"idle_burn_in_busy_polling": 50.0,
    "budget_wasted_by_busy_poll_pct": 10.0,” · caveat: Computed as `simulated_waiting_ticks * 0.5` (ael_battery.py line 207), an assumed 0.5 cr/tick polling cost, not a measurement.
- [F23] Benchmark 3 runway after the human approves and the 10-credit send executes. = **430.0 credits** (/Users/gch2021/Dev/Multi-Asset Workflows/output/ael_experiment_results.json) — “"post_approval_remaining_credits": 430.0,
    "state_preserved_during_wait": true”
- [F24] Persisted door state after Benchmark 3 (the file the presentation can show). = **remaining_credits 440.0; stage 'Waiting at Door'** (/Users/gch2021/Dev/Multi-Asset Workflows/local_saved_state.json) — “"stage": "Waiting at Door",
  "state_preserved": true,
  "remaining_credits": 440.0”
- [F25] Tier specs (energy, FLOPs, latency per token) in the laboratory kernel. = **fast 0.002 J/tok, 1.4e10 FLOP/tok, 0.8 ms/tok; balanced 0.008, 1.4e11, 2.2; frontier 0.035, 8.0e11, 6.5** (/Users/gch2021/Dev/Multi-Asset Workflows/backend/ael/kernel.py) — “ModelTier.FAST_QUANTIZED: {"joules_per_tok": 0.002, "flops_per_tok": 1.4e10, "ms_per_tok": 0.8},
        ModelTier.BALANCED_STAFF: {"joules_per_tok": 0.008, "flops_per_tok": 1.4e11, "ms_per_tok": 2.2}”
- [F26] Tier stability σ used in the drift formula (identical in kernel.py and the engine). = **0.90 / 0.96 / 0.99** (/Users/gch2021/Dev/Multi-Asset Workflows/engine/src/resources.rs) — “ModelTier::FastQuantized => TierSpec { joules_per_tok: 0.002, flops_per_tok: 1.4e10, ms_per_tok: 0.8, stability: 0.90 },
            ModelTier::BalancedStaff => TierSpec { joules_per_tok: 0.008, flops”
- [F27] Credit / joule accounting unit and cache-hit discount. = **1 credit ≈ 10 tokens ≈ 0.05 J; cache hit = 85% discount** (/Users/gch2021/Dev/Multi-Asset Workflows/backend/ael/kernel.py) — “"""Normalized accounting credit (1 credit ~= 10 tokens ~= 0.05 Joules)."""
        base = self.tokens / 10.0
        if self.cache_hit:
            base *= 0.15  # 85% discount on cached context” · caveat: Engine mirror: resources.rs `TOKENS_PER_CREDIT: f64 = 10.0; JOULES_PER_CREDIT: f64 = 0.05; CACHE_HIT_DISCOUNT: f64 = 0.85`.
- [F28] Foundations report states the 800-credit budget as a joule equivalent (800 x 0.05 = 40 J). = **40.0 J** (/Users/gch2021/Dev/Multi-Asset Workflows/AGENTIC_ECONOMY_FOUNDATIONS.md) — “- **Runway Budget:** 800.0 compute credits ($40.0\,J$ energy equivalent).” · caveat: kernel.py RunwayPool defaults initial_joules to 5000.0 independently of credits (discrepancy D14).
- [F29] Live cost-visibility measurement: model, budget, task count, tier prices. = **gemini/gemini-3.8-flash; budget 100; up to 6 tasks; compact 15 / standard 35 / exhaustive 90** (/Users/gch2021/Dev/Multi-Asset Workflows/LIVE_COST_VISIBILITY.md) — “Model: `gemini/gemini-3.8-flash` through the estate vault. Budget 100. Up to 6 tasks.
The model chose the tier. This script only deducted the price and halted when the next choice did not fit.
Compact”
- [F30] Live cost-visibility, cost visible: six compact calls, finished. = **6 tasks; 90 burned; 10 remaining** (/Users/gch2021/Dev/Multi-Asset Workflows/LIVE_COST_VISIBILITY.md) — “Tasks completed: 6. Burned: 90. Remaining: 10.
Choices: compact, compact, compact, compact, compact, compact”
- [F31] Live cost-visibility, cost hidden: two standard calls, halted at task 3. = **2 tasks; 70 burned; 30 remaining; halted** (/Users/gch2021/Dev/Multi-Asset Workflows/LIVE_COST_VISIBILITY.md) — “Tasks completed: 2. Burned: 70. Remaining: 30.
Choices: standard, standard
[HALTED] Task 3, tried to buy standard at 35. Burned 70. Remaining 30. A person must top up or close.” · caveat: Raw record with timestamp 2026-09-27T11:28:53Z is live_cost_visibility_state.json; the note there says 'Prior laboratory runs were scripted arithmetic.'
- [F32] Runway Experiment 1 setup: 300-credit budget, 10 tasks, tiers 15/35/90 with values 20/40/50. = **300 cr; 10 tasks; 15/20, 35/40, 90/50** (/Users/gch2021/Dev/Multi-Asset Workflows/ENERGETIC_RUNWAY_EXPERIMENTS.md) — “**Setup:** Initial compute runway budget = **300.0 credits**. Target = 10 sequential tasks.  
- Three call tiers available: Compact (15 cost / 20 value), Standard (35 cost / 40 value), Exhaustive (90 ” · caveat: Scripted arithmetic (energetic_runway_experiments.py), not a live model; the hidden condition greedily picks max value.
- [F33] Runway Experiment 1 result: cost visible 10/10 (290 burned), cost hidden 3/10 (270 burned, halted at task 4). = **10/10 vs 3/10** (/Users/gch2021/Dev/Multi-Asset Workflows/ENERGETIC_RUNWAY_EXPERIMENTS.md) — “| **Tasks Completed** | **10 / 10** | **3 / 10** | **+7 tasks (+233%)** |
| **Total Runway Burned** | 290.0 credits | 270.0 credits | Both burned within budget |”
- [F34] Runway Experiment 2 result: orchestrator 10/10 vs market of jobs 6/10, with 305 credits (30.5%) spent on coordination. = **305.0 credits (30.5%)** (/Users/gch2021/Dev/Multi-Asset Workflows/ENERGETIC_RUNWAY_EXPERIMENTS.md) — “| **Budget Spent on "Coordination"** | **0.0 credits (0.0%)** | **305.0 credits (30.5%)** |” · caveat: Fees were installed by hand (15 + 20 + 10 = 45 cr/item on 100 cr of work); reproduces as 6 x 45 + 15 + 20 = 305 on a 1000 budget. IF-THE-AGENTS-DO-THE-ECONOMY.md rounds this to 'about a third of the purse'.
- [F35] Runway Experiment 3: 500-credit budget, 5 cycles, 0.0 credits burned while waiting at the door. = **0.0 credits while waiting; 5 cycles = 200 cr lookups/drafts + 200 cr spends** (/Users/gch2021/Dev/Multi-Asset Workflows/ENERGETIC_RUNWAY_EXPERIMENTS.md) — “| **Budget Burned While Waiting** | **0.0 credits** | **0.0 credits** |
| **Allowed Spends Executed** | **0** | **5 (200.0 cr burned)** |”
- [F36] Dialectic counterpart model and format. = **DeepSeek deepseek-v4-pro, three rounds** (/Users/gch2021/Dev/Multi-Asset Workflows/DIALECTIC.md) — “Other voice: DeepSeek `deepseek-v4-pro`, through the estate vault. Three rounds.”
- [F37] The DeepSeek concession (round 2). = **'The person owns the irreversible boundary. I concede that.'** (/Users/gch2021/Dev/Multi-Asset Workflows/dialectic-round-2.md) — “So I withdraw the first-year sandbox as originally stated. I no longer defend reputation, agent-to-agent fees, or agent-initiated irreversible closes as first-year components.”
- [F38] The DeepSeek concession on what remains of an agent market without fees or reputation (round 3). = **the bid is advisory: cooperative scheduling, not a market** (/Users/gch2021/Dev/Multi-Asset Workflows/dialectic-round-3.md) — “But without fees, reputation, or irreversible close, the bid is advisory, not a binding price or commitment—closer to cooperative scheduling than to a market.”
- [F39] The Stage 5 finality window in the engine (ticks, chosen deterministically from the payload hash). = **8–32 ticks** (/Users/gch2021/Dev/Multi-Asset Workflows/engine/src/boundary.rs) — “Stage5RecursiveStark { min_latency: 8, max_latency: 32, pending: BTreeMap::new(), proofs: 0, last_global_root: None }” · caveat: Design doc 05 phrases this as seconds: 'applies an 8-32 second delay (representing global finality latency)'. GAME_ENGINE_ARCHITECTURE.md says a fixed 8 seconds (discrepancy D7).
- [F40] Engine's planetary heartbeat period. = **every 16 ticks** (/Users/gch2021/Dev/Multi-Asset Workflows/engine/src/tick.rs) — “EngineConfig { seed: 7, cost_visible: true, active_scale: Stage::House, snapshot_depth: 64, stark_period: 16, max_events_retained: 4096 }”
- [F41] Empirical decay constant fitted so 20 idle ticks land on 0.5636 (-ln 0.5636 / 20 = 0.0286705). = **DECAY_RATE = 0.02867 per tick** (/Users/gch2021/Dev/Multi-Asset Workflows/engine/src/epistemics.rs) — “/// `−ln(0.5636) / 20`. Doc 02 rounds this to 0.0287.
pub const DECAY_RATE: f64 = 0.028_67;” · caveat: 02_ENTITY_STATE_MACHINE.md prints `decay_rate = 0.0287`; exp(-0.0287 x 20) = 0.5633, not 0.5636 (discrepancy D8).
- [F42] Other engine epistemic constants. = **OBSERVED 0.5636; HALLUCINATION_THRESHOLD 0.75; ORACLE_COST 15.0; MAX_UNCALIBRATED_HANDOVERS 5; DEFAULT_RIGOR 0.82** (/Users/gch2021/Dev/Multi-Asset Workflows/engine/src/epistemics.rs) — “pub const OBSERVED_CONFIDENCE_AFTER_20_HANDOVERS: f64 = 0.5636;
/// `−ln(0.5636) / 20`. Doc 02 rounds this to 0.0287.
pub const DECAY_RATE: f64 = 0.028_67;
/// Below this a node starts acting on hallu”
- [F43] Coordination tax multipliers in the engine and the two observed percentages they are justified by. = **intra 1.0, same-parent 1.25, cross-parent 1.40; observed 19.99% and 30.5%** (/Users/gch2021/Dev/Multi-Asset Workflows/engine/src/tax.rs) — “pub const OBSERVED_MARKET_TAX_PCT: f64 = 19.99;
/// Runway experiment 2: a market of jobs burned 30.5 % on handoffs.
pub const OBSERVED_JOB_MARKET_TAX_PCT: f64 = 30.5;” · caveat: Multipliers come from 04_ECONOMIC_PRIMITIVES.md: `final_cost = base_cost * 1.25` / `final_cost = base_cost * 1.40`. Default impl: `CoordinationTax { intra: 1.0, same_parent: 1.25, cross_parent: 1.40 }`.
- [F44] Engine's standard synthesis task: same token loads as the battery, but the door fee for a send is 25 credits. = **280/650/320 tokens; spend 25.0 cr** (/Users/gch2021/Dev/Multi-Asset Workflows/engine/src/node.rs) — “Task { id: id.into(), lookup_tokens: 280, draft_tokens: 650, audit_tokens: 320, spend: 25.0, state: TaskState::Pending }” · caveat: The Python battery charged sends at 10 cr (100 tokens), so engine per-task totals differ from the JSON (discrepancy D5).
- [F45] Engine run header (cargo run --release --bin house -- --ticks 20 --door hold:3). = **purse 800 cr; 15 tasks; hold 3 ticks then approve; seed 7; cost visible; tokio-multi-thread** (terminal: cd /Users/gch2021/Dev/Multi-Asset Workflows/engine && cargo run --release --bin house -- --ticks 20 --door hold:3) — “  purse 800 cr · 15 tasks · door: hold 3 ticks, then approve · seed 7 · cost visible · executor tokio-multi-thread”
- [F46] Engine run: per-task draft burn by seat (28.0 fast lookup, 9.8 balanced draft cache hit, 4.8 frontier audit cache hit) and Penny's sweep note. = **28.0 + 9.8 + 4.8 cr; 82.5 cr swept per task** (terminal: cd /Users/gch2021/Dev/Multi-Asset Workflows/engine && cargo run --release --bin house -- --ticks 20 --door hold:3) — “t01      DRAFT  Scout 28.0cr[fast]  Scribble 9.8cr·hit[bala]  Inspector 4.8cr·hit[fron]
t01      Scout  Looked up 4 sources for doc_synthesis_01.
t01   Scribble  Drafted doc_synthesis_01 (650 tok, cac”
- [F47] Engine run: the crossing (coordination) tax on a 25-credit dispatch at the same-parent multiplier (25 x 0.25 = 6.25). = **6.2 cr per dispatch (6.25 unrounded)** (terminal: cd /Users/gch2021/Dev/Multi-Asset Workflows/engine && cargo run --release --bin house -- --ticks 20 --door hold:3) — “t01    COLLECT  env:ce3b621d dispatch · crossing tax 6.2 cr”
- [F48] Engine run: idle burn while the Porter waits at the Door is 0.0 credits for three consecutive ticks; the purse stays at 751.2 while Φ decays 97.3 → 94.6 → 91.9 → 89.3 (factor e^-0.02867 = 0.9717 per tick). = **0.0 cr idle burn; purse 751.2 constant; Φ 97.3% → 89.3% over 3 idle ticks** (terminal: cd /Users/gch2021/Dev/Multi-Asset Workflows/engine && cargo run --release --bin house -- --ticks 20 --door hold:3) — “t01      PURSE  751.2 cr · Φ 97.3% · 0/15 sent · waiting at the door · 0.0 cr idle burn
t02     VERIFY  🚪 The Porter is at the Door: send the finished draft for doc_synthesis_01 (25 cr). Nothing burns”
- [F49] Engine run: after 6 handovers the Scout pays the oracle; state sync costs 15 cr and resets Φ from 64% to 100%; the STARK heartbeat at tick 16 reports 14-tick finality. = **15 cr; Φ 64% → 100%; finality 14 ticks** (terminal: cd /Users/gch2021/Dev/Multi-Asset Workflows/engine && cargo run --release --bin house -- --ticks 20 --door hold:3) — “t16      Scout  My notes are 6 handovers old (Φ 65%). Asking the oracle before I look anything up.
[...]
t16    COLLECT  env:e16fb704 state_sync · crossing tax 0.0 cr
[...]
t16     COMMIT  ✦ state syn”
- [F50] Engine run: the closing note after 20 ticks. = **allocated 800.0; burned 310.2 cr (15.51 J); left 489.8; cushion swept 329.8; 4/15 sent; Φ 89.2%; tax paid 25.0; Door 16 asked / 4 yes / 0 no** (terminal: cd /Users/gch2021/Dev/Multi-Asset Workflows/engine && cargo run --release --bin house -- --ticks 20 --door hold:3) — “    purse allocated       800.0 cr
    burned on thought     310.2 cr  (15.51 J)
    left in the purse     489.8 cr
    cushion swept         329.8 cr  (never yield)
    tasks sent             4/15
  ” · caveat: 489.8 = 800 - 310.2 exactly: the 329.8 cr 'cushion swept' is NOT added to the purse (Purse::note_cushion only records it), unlike the Python guild topology. 310.2 = 4 x 42.55 + 4 x 25 + 25.0 tax + 15 oracle. '16 asked' counts each tick an envelope was re-asked (4 envelopes x 4 ticks).
- [F51] Browser build size of the same engine (wasm32-unknown-unknown, size-optimised `wasm` profile). = **328,513 bytes (324K)** (terminal: ls -la /Users/gch2021/Dev/Multi-Asset Workflows/engine/target/wasm32-unknown-unknown/wasm/context_engine.wasm) — “-rwxr-xr-x  1 gch2021  staff  328513 Sep 28 21:06 target/wasm32-unknown-unknown/wasm/context_engine.wasm”
- [F52] Wasm export list, parsed from the binary's export section (no wasm-objdump installed): 13 exports (1 memory, 10 functions, 2 globals), 0 imports. = **memory; engine_new, engine_tick, engine_authorize, engine_reject, engine_top_up, engine_zoom, engine_state, engine_events, engine_out_ptr, engine_version; __data_end, __heap_base** (/Users/gch2021/Dev/Multi-Asset Workflows/engine/src/wasm_abi.rs) — “#[no_mangle]
pub extern "C" fn engine_new(scenario: u32, seed: u64, budget: f64, tasks: u32, cost_visible: u32) {” · caveat: Parsed with a Python LEB128 walker over the export section; result: EXPORTS 13 / IMPORTS 0. engine_version returns the string 'context-engine 0.1.0 (wasm32, sequential executor)'.
- [F53] cargo test: unit tests. = **16 passed, 0 failed** (terminal: cd /Users/gch2021/Dev/Multi-Asset Workflows/engine && cargo test) — “test result: ok. 16 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s”
- [F54] cargo test: Golden Invariant integration suite (tests/golden_invariant.rs). = **13 passed, 0 failed (29 total with unit tests; 0 doc-tests)** (terminal: cd /Users/gch2021/Dev/Multi-Asset Workflows/engine && cargo test) — “running 13 tests
test law_1_drafts_are_isolated_by_type ... ok
test crossings_pay_the_coordination_tax ... ok
test exhaustion_leaves_a_note_and_keeps_the_papers ... ok
test law_2_oak_table_is_local ..”
- [F55] Engine test that re-runs Benchmark 3 inside the engine: 100 ticks at the door, 0.0 burned each tick, truth still decays. = **100 ticks; 0.0 cr leaked; Φ decays by idle_decay(Φ, 100)** (/Users/gch2021/Dev/Multi-Asset Workflows/engine/tests/golden_invariant.rs) — “for _ in 0..100 {
        let r = block_on(e.tick());
        assert_eq!(r.compute_burned, 0.0, "idle burn while waiting");
        assert_eq!(r.drafted, 0);
    }
    let n = e.node(h).unwrap();
    ”
- [F56] Engine unit test reproducing Benchmark 2's uncalibrated series to four decimals. = **gen1 0.9764, gen5 0.8866, gen10 0.7440, gen20 0.5636** (/Users/gch2021/Dev/Multi-Asset Workflows/engine/src/epistemics.rs) — “assert_eq!(history[0], 0.9764);
        assert_eq!(history[4], 0.8866);
        assert_eq!(history[9], 0.7440);
        assert_eq!(history[19], OBSERVED_CONFIDENCE_AFTER_20_HANDOVERS);”
- [F57] Line counts: engine source and tests. = **src 4,247 lines across 24 .rs files; tests 287 lines (1 file); 4,534 total** (terminal: cd /Users/gch2021/Dev/Multi-Asset Workflows/engine && wc -l src/*.rs src/agents/*.rs src/bin/*.rs src/scenarios/*.rs tests/*.rs) — “     922 src/tick.rs
      97 src/wasm_abi.rs
     103 src/agents/llm.rs
       6 src/agents/mod.rs
     219 src/agents/statistical.rs
     206 src/bin/house.rs
      58 src/scenarios/mod.rs
     287 ” · caveat: Largest files: tick.rs 922, boundary.rs 482, node.rs 470. `find src -name '*.rs' | xargs wc -l` tail = 4247 total.
- [F58] Crate identity and toolchain. = **context-engine 0.1.0; rust-version 1.85; deps serde, serde_json, sha2, tokio (optional, feature native); built with rustc 1.91.1 / cargo 1.91.1** (/Users/gch2021/Dev/Multi-Asset Workflows/engine/Cargo.toml) — “name = "context-engine"
version = "0.1.0"
edition = "2021"
rust-version = "1.85"
description = "The invisible context engine for The Agentic Economy: an Asynchronous Agentic State Machine (AASM)."”
- [F59] Street scenario size the browser ABI instantiates. = **6 houses** (/Users/gch2021/Dev/Multi-Asset Workflows/engine/src/wasm_abi.rs) — “2 => scenarios::street(config, 6, budget, tasks as usize),” · caveat: 03_FRACTAL_SCALING_AND_LOD.md speaks of packing 'all 20 houses' and streets of '20-50 houses' (discrepancy D12).
- [F60] Design-doc statement of the 20-30% coordination tax and the 56.4% truth floor that the engine constants are anchored to. = **20-30%; 56.4% over 20 blocks** (/Users/gch2021/Dev/Multi-Asset Workflows/game_design_docs/01_CORE_ARCHITECTURE.md) — “The engine must deduct an exact 20-30% `COORDINATION_TAX_MULTIPLIER` to account for formatting, translating, and verifying data across boundaries.
- **Truth Degradation:** To prevent endless free simu” · caveat: JSON measured 19.99% (below 20) and runway exp 2 measured 30.5% (above 30); the JSON's 20 steps are handovers, not temporal blocks (discrepancies D9, D11).
- [F61] The narrative's own hedge on the single live measurement, for the presenter to honour on screen. = **one model, one afternoon, a small budget** (/Users/gch2021/Dev/Multi-Asset Workflows/ANSWER-FOR-THE-FRIEND.md) — “I have one measurement, and I will not stretch it. One model, one afternoon, a small budget. When it could see the price, it bought the cheap call and finished the tasks. When it could not see the pri”
- [F62] The narrative's hedge on the coordination-fee toy (Experiment 2's 30.5%). = **'about a third' — installed by hand, not observed** (/Users/gch2021/Dev/Multi-Asset Workflows/IF-THE-AGENTS-DO-THE-ECONOMY.md) — “In a toy where that fee was simply added by hand, about a third of the purse went to the handoff and the job finished late. That number is not evidence that live agents will waste a third of their mon”

# discrepancies
- D1. Benchmark 3 table vs raw record. AGENTIC_ECONOMY_FOUNDATIONS.md prints 'Pre-Door Burn 33.0 credits', 'Post-Approval Runway 467.0 credits' (clean) and '417.0 credits' (busy-poll). output/ael_experiment_results.json benchmark_3_door_integrity records burned_before_door 60.0, credits_at_door 440.0, post_approval_remaining_credits 430.0. The JSON reproduces from ael_battery.py (200 tok fast = 20.0 cr + 400 tok balanced = 40.0 cr = 60.0; 500 - 60 = 440; minus 10 cr send = 430). The table's 33.0 / 467.0 / 417.0 have no source in the code or the JSON; a busy-poll post-approval figure derived from the JSON would be 380.0.
- D2. Benchmark 2 intermediate generations. AGENTIC_ECONOMY_FOUNDATIONS.md table: Gen 5 87.2%, Gen 10 76.0%, Gen 15 65.5%. JSON history_uncalibrated: gen 5 0.8866 (88.7%), gen 10 0.744 (74.4%), gen 15 0.6357 (63.6%). Only Gen 1 (97.6%) and Gen 20 (56.4%) agree. The engine's own unit test asserts the JSON values (0.8866, 0.7440).
- D3. Guild 'penny_reclaimed' arithmetic. backend/ael/topologies.py lines 301-305: `nominal_estimate = (lookup+draft+audit)/10.0; actual_burned = ...; saved = max(0.0, nominal_estimate - actual_burned); self.penny_reclaimed += saved; self.runway.reclaim(saved)` and kernel.py RunwayPool.reclaim does `self.remaining_credits += unused_credits`. The nominal allocation was never deducted from the pool, so each task mints 106.25 cr; on an 800-credit budget the guild's runway ends at 800 - 431.25 + 1593.75 = 1962.5. FOUNDATIONS' 'Completed with 46% reserve' ((800-431.25)/800 = 46.1%) silently ignores the reclaim, while its 'Penny Reclaimed Budget 1,593.8 credits' row presents the minted amount as a result. The Rust engine deliberately avoids this: resources.rs Purse::note_cushion only records compute_reclaimed and moves no credits ('It is never yield, and it never mints credits'); the house run's purse 489.8 = 800 - 310.2 with 329.8 'swept' confirms it.
- D4. Coasean market's 19.99% tax was never charged to the runway. topologies.py lines 171-183 compute `look_brokerage_tax = cost_look.compute_credits * 0.20` and add it to spent_on_coordination, but the ResourceUnit actually burned (`total_look_cost`) keeps `tokens=cost_look.tokens`, and compute_credits is tokens/10, so the credit debit is identical to the untaxed cost; the x1.20/x1.25/x1.15 multipliers touch only joules, flops and latency. Consequently the JSON shows spent_on_work 800.0 AND spent_on_coordination 159.9 (sum 959.9 > total_burned 800.0), and coordination_overhead_pct = 159.9/800 divides a side ledger by a runway it never touched. The market halted at task 6 because of cache misses (draft 65.0 cr vs 9.75, audit 32.0 vs 4.8; 135 cr/task x 5 = 675, then 28+65+32 = 800 exactly), not because of fees. FOUNDATIONS' 'cannibalized 19.99% of its budget on internal subcontracting markups' and tax.rs OBSERVED_MARKET_TAX_PCT = 19.99 both inherit this.
- D5. Send/door fee. FOUNDATIONS lists the workload as 'Spend: 25 cr' and ael_battery.py sets `spend_amount=25.0`, but topologies.py never reads spend_amount (its own default is 30.0); every topology charges a send as `ResourceUnit(tokens=100, ...)` = 10 cr. The Rust engine charges 25 cr (node.rs `spend: 25.0`; run output 'Sending costs 25 cr'). So the battery's per-task house cost is 52.55 cr while the engine's is 42.55 + 25 + 6.25 tax = 73.8 cr; the two cannot be compared task-for-task.
- D6. Runway Experiment 1 arithmetic. ENERGETIC_RUNWAY_EXPERIMENTS.md: 'Total Value Delivered 340.0 vs 150.0 ... +210.0 (+140%)' — 340 - 150 = 190 (+126.7%); 'Visible is 1.9x more efficient' — 1.17 / 0.56 = 2.09 (2.11 unrounded); Summary 'enables rational rationing and 2.3x more completed work' — 10 vs 3 tasks is 3.33x (the table's own '+233%'). All three strings are hardcoded literals in energetic_runway_experiments.py lines 456-457 rather than computed.
- D7. STARK finality. GAME_ENGINE_ARCHITECTURE.md: 'simulated STARK verification (Zero-Knowledge Proof check taking 8 seconds)'. 03_FRACTAL_SCALING_AND_LOD.md and 05_VERIFICATION_BOUNDARIES.md: '8-32 second' window. engine/src/boundary.rs: `min_latency: 8, max_latency: 32` in ticks ('8–32 tick finality'), and the run printed 'finality 14 ticks'. Seconds vs ticks vs a fixed 8 are three different claims.
- D8. Decay constant rounding. 02_ENTITY_STATE_MACHINE.md `decay_rate = 0.0287`; epistemics.rs `DECAY_RATE = 0.028_67` (-ln 0.5636 / 20 = 0.0286705). exp(-0.0287 x 20) = 0.5633, which misses the 0.5636 record; the engine test tolerance is 0.001 so 0.0287 would still pass, but the on-screen constant should be 0.02867.
- D9. Handovers vs time. The JSON's 20 steps are generational handovers (benchmark_2_epistemic_drift, `generations: 20`), but 01_CORE_ARCHITECTURE.md says confidence 'drops to 56.4% over 20 temporal blocks' and 02's calculate_drift uses `delta_t = current_tick - last_sync_tick`. The engine reconciles this by defining two mechanisms (handover decay and idle decay) both calibrated to 0.5636, but the laboratory only measured the handover one.
- D10. ECS terminology. GAME_ENGINE_ARCHITECTURE.md §3: 'the engine uses a nested Entity-Component-System (ECS)'. 01_CORE_ARCHITECTURE.md: 'is not a traditional Entity Component System (ECS)'; lib.rs: 'an Asynchronous Agentic State Machine (AASM), not an Entity-Component-System'; the user brief warns that building an ECS 'will fundamentally fail the requirements'.
- D11. 'Exact 20-30%' band. 01_CORE_ARCHITECTURE.md demands 'an exact 20-30% COORDINATION_TAX_MULTIPLIER', but the two observations are 19.99% (below 20) and 30.5% (above 30), and tax.rs multipliers 1.25/1.40 yield tax shares of 20.0% and 28.6% of routed cost. The band is a paraphrase, not a measured range.
- D12. Street size. 03_FRACTAL_SCALING_AND_LOD.md: 'PackNode() function on all 20 houses' and, in the same doc, 'a street map showing 20-50 houses'. wasm_abi.rs instantiates the street with 6 houses; the integration tests use 3, 4, 5 and 8.
- D13. Synthesis rigor defaults. kernel.py record_handover default rigor = 0.85; ael_battery.py passes rigor=0.82; epistemics.rs DEFAULT_RIGOR = 0.82 labelled 'The battery's default'; the engine's Scribble/Inspector use 0.90/0.98 (matching HouseStaffTopology), and Scout uses DEFAULT_RIGOR. Three different 'defaults' are in play.
- D14. Joule budget. FOUNDATIONS: '800.0 compute credits ($40.0 J energy equivalent)' (800 x 0.05). kernel.py RunwayPool defaults `initial_joules: float = 5000.0` independently of credits, and the battery never passes initial_joules, so the 800-credit pool actually carried a 5000 J ceiling; the joule ledger never binds in any benchmark. The engine's Purse has no separate joule ceiling (joules_remaining = compute x 0.05).
- D15. Ordering artifact in the engine run. At t16 the Scout requests the oracle first, then Scribble and Inspector each record a handover in the same Draft phase, and the state_sync commits at the end of the tick, resetting generation to 0. The closing note therefore reads 'truth Φ 89.2% after 0 handovers, 1 oracle calls' although two handovers occurred after the oracle was requested. Φ itself is consistent (100% at t16 then idle decay to 89.2% by t20); only the handover counter is off by two.
- D16. Door counter semantics. The run's 'The Door (human): 16 asked, 4 yes, 0 no' counts every tick an envelope was re-presented (4 envelopes x 4 ticks each), not 16 distinct requests; Stage1Door.verify increments signatures_requested on each Held verdict. Presenting '16 asked' as 16 requests would be wrong.
- D17. Benchmark 3 'telemetry' is assumed, not measured, in the Python battery. ael_battery.py assigns `idle_burn_clean = 0.0` and `idle_burn_busy_poll = simulated_waiting_ticks * 0.5` without running any waiting loop; FOUNDATIONS labels the row 'Telemetry Parameter' and says 'The system burns zero Watts while awaiting the human tap.' The only executed zero-idle-burn measurement is the engine's law_4_the_door_holds_at_zero_burn test (100 real ticks) and the house run's repeated '0.0 cr idle burn' lines.