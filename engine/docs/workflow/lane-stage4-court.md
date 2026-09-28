# lane stage4-court · green=True

## files created
- src/scenarios/high_court.rs: Stage 4 laboratory worlds. `Transferor` seat (a standing order: one LiquidityTransfer per tick to its first peer from `arm_tick` on; `forger()` asks 10 000, `honest()` asks 5.0; burns no inference, uses no rng). `forged_street(config, forgers, honest, arm_tick, truth_each, delusion)` builds houses under a street under a city with the camera at the street (collapse at the Letter Slot); `forged_country(...)` builds cities under a country with the camera at the city (collapse at the Clearinghouse, via netting). Forgers' purse belief is set to `delusion` while their graph truth is `truth_each`. Returns `(Engine, CourtWorld { parent, forgers, honest })`. Deterministic peer wiring; no clock, no OS entropy.
- tests/stage4_high_court.rs: Eight tests: (1) a_systemic_failure_trips_the_circuit_breaker — 7 verified, 5 rejected (71%) at tick 2; RolledBack{to_tick:1, slashed:5}; one 'High Court' Slashed event per offender of exactly 25% of tick-1 truth; truth == 75%; purse belief re-synced from 10 000 to truth; innocents untouched; graph.root() == (tick-1 graph clone + the five fines).root(); no contracts booked; snapshot chain [1,2]. (1b) rollback_lands_on_the_previous_root_when_there_is_nothing_to_seize — offenders with truth 0: root == tick-1 root exactly. (2) offenders_are_under_injunction_at_the_country_gate — camera to Country, two offenders knock with BACKED 1.0 payments: Rejected at Stage::Country with reason containing 'injunction', not fined again; honest neighbours' identical envelopes Approved and Settled at the same gate; StateView.gates shows the court that ruled. (3) approvals_from_the_failed_tick_are_voided — report.approved==2 yet 0 Settled/Delivered, settled_liquidity 0, contracts/total_settled unchanged, honest truth & belief unchanged, only the 0.25 cr crossing tax sunk (no send fee). Plus: a_clearinghouse_collapse_is_fined_once_by_the_court (netting → Slashed verdicts; what stands is the court's 25%, not the gate's 200/200 seizure), the_court_needs_a_sample_and_a_majority (3/3 < min_sample; 5/10 = 50% no ruling; 5/9 rules), a_ruling_on_tick_one_still_vetoes_and_fines (no snapshot to restore, no panic), replay_through_the_court_is_exact (same seed → identical TickReports, rollbacks, injunctions, root).

## cargo toml diff
```diff
(no diff: Cargo.toml unchanged, no dependencies or feature flags added)
```

## tests added
- tests/stage4_high_court.rs::a_systemic_failure_trips_the_circuit_breaker
- tests/stage4_high_court.rs::rollback_lands_on_the_previous_root_when_there_is_nothing_to_seize
- tests/stage4_high_court.rs::offenders_are_under_injunction_at_the_country_gate
- tests/stage4_high_court.rs::approvals_from_the_failed_tick_are_voided
- tests/stage4_high_court.rs::a_clearinghouse_collapse_is_fined_once_by_the_court
- tests/stage4_high_court.rs::the_court_needs_a_sample_and_a_majority
- tests/stage4_high_court.rs::a_ruling_on_tick_one_still_vetoes_and_fines
- tests/stage4_high_court.rs::replay_through_the_court_is_exact

## observations
- Full `cargo test` in the lane: 16 unit tests (lib) + 13 tests/golden_invariant.rs + 8 tests/stage4_high_court.rs = 37 passed, 0 failed. Baseline before my changes was 16 + 13 green.
- Proof the core fix is load-bearing: with the ORIGINAL /engine/src/tick.rs swapped into the lane, `offenders_are_under_injunction_at_the_country_gate` fails (`left: 4, right: 2` at the approved count: the injuncted offenders' envelopes were approved at the Country gate); the other 7 pass either way. tick.rs was restored to the patched version afterwards.
- All envelopes in the tests are produced through Draft → Collect (a real seat, a real DraftContext, tax paid at mint, signature by the node); nothing is hand-injected into the mempool, so the Golden Invariant is respected by the test harness itself.
- The literal requirement 'engine.graph.root() equals the root snapshotted at the previous tick' cannot hold when the court seizes anything: the 25% fine is itself a state change applied after the rollback. Test (1) therefore asserts root == (tick-1 graph clone + the five fines).root() and root != tick-1 root; test (1b) asserts exact equality in the case where the offenders' truth is 0 so the fine is 0.
- `set_active_scale(Stage::Country)` packs every house (rule: children pack iff parent.level < camera.level, using parent.level-1 as the assumed child level regardless of actual child stages), so houses cannot draft at the Country camera; the injunction test calls the public `unpack_children(street)` after zooming to keep them drafting against the Country gate (effective gate = own gate max camera).
- Semantics answer for doc 05: because Verify precedes Commit, at assess time the Sovereign Graph is still exactly the tick-1 snapshot plus any in-tick gate seizures, so `rollback_to(tick-1)` restores nothing that was ever committed; the order's real effect is `self.approved.clear()` (a veto of the block) plus the fines. That is a coherent 'circuit breaker' reading of doc 05 (the failed clearing is never booked) and the tests treat it as the spec; but it is not the 'hard rollback to a previous coherent state from a deeply archived snapshot' the doc language implies (snapshot_depth 64 is never used deeper than 1; there is no coherence criterion choosing the target).
- Original crate verified untouched: /Users/gch2021/Dev/Multi-Asset Workflows/engine/src/scenarios/ contains only mod.rs and tests/ contains only golden_invariant.rs. The temporary probe test (tests/zz_probe_tmp.rs) used to measure the flaws below was deleted after the run.
- Probe numbers behind the flaws (seed-deterministic): PROBE-A street of 5 houses at House camera → 10 envelopes at the Doors; person rejects 6 → RolledBack{60% of 10}, 3 houses injuncted and fined 50.0 each 'High Court: systemic failure'. PROBE-B Clearinghouse collapse: actually seized 250 across 5 offenders, but graph.total_slashed += 1250, 10 Slashed events summing to 1250, StateView.totals.slashed = 1250. PROBE-C tick-1 ruling: RolledBack{tick:1, to_tick:0} while root_history has 1 entry and no snapshot ≤ 0 exists. PROBE-D five injuncted nodes knocking with backed 1.0 payments at Country: court trips every tick (ticks 3-6), offender truth 150 → 112.5 → 84.375 → 63.28 → 47.46, honest approvals voided every tick (0 settled), court.rollbacks = 5.

## design flaws
- [FIXED in lane, src/tick.rs] Two courts: `Engine::court` (assess + injunctions) and `strategies[Stage::Country]` (the instance that verified Country-gate envelopes) were different `Stage4StatutoryLaw` values. Injunctions were recorded in one and read from the other, so an injuncted node's envelopes were APPROVED at the Country gate. Follow-up for the merge: `set_strategy(Stage::Country, ..)`/`strategy(Stage::Country)` now address an orphan; drop Country from `default_strategies()` or store the court in the map.
- [NOT fixed; policy] Injunction refusals re-trigger the court and compound the fine (denial of service). `Stage4StatutoryLaw::verify` returns `Rejected` for an injuncted initiator; `Engine::verify` pushes every Rejected initiator into `offenders` and every rejection into `TickStats.rejected`, so a majority of injuncted nodes merely knocking (with fully backed envelopes) trips `assess` again every tick: a new RolledBack, a fresh 25% of the remaining truth (150 → 112.5 → 84.4 → 63.3 → 47.5 over four ticks), and every honest approval in the jurisdiction voided each tick indefinitely. Suggest excluding injunction refusals from TickStats (or counting only first-time offenders), and/or making the injunction a courier-level drop rather than a gate verdict.
- [NOT fixed; policy] Stage-1 human sovereignty is punished by Stage-4 law. `offenders`/`TickStats` are gathered from every gate, and `assess` runs regardless of `active_scale`. At the House camera, a person rejecting 6 of 10 envelopes at the Doors ('the person said no at the door') produces RolledBack{60% of 10}, three injunctions and 50.0 fines with reason 'High Court: systemic failure'. Likewise 'target is not reachable' (a halted neighbour) and 'bad signature' rejections count as offences of the initiator. Suggest counting only liquidity-bearing, unbacked verdicts from gates ≥ Street/City, or gating `assess` on the camera being at ≥ City.
- [NOT fixed; accounting] Double slashing at the Clearinghouse is undone in truth but not in the ledger or the event stream. Stage 3 emits `Verdict::Slashed{amount = 10% of the REQUEST}` (1 000 for a 10 000 forgery, capped by `graph.slash` at the whole 200 truth), `Engine::verify` seizes it, then `apply_court_order` → `rollback_to(tick-1)` silently restores that seizure and takes 25%. Net seized = 250 for five offenders (correct), but `graph.total_slashed` (+1 250), `StateView.totals.slashed` (1 250) and the ten Slashed events (sum 1 250) overstate it 5×. `GraphSnapshot` does not carry `total_settled`/`total_slashed` and `rollback_to` does not restore them. Also three inconsistent fine bases: Stage 3 verdict = 10% of requested; Stage 4 verdict = 25% of the shortfall (requested − have); court order = 25% of the truth held after rollback (unrelated to the offence size; 0 when truth is 0).
- [NOT fixed; semantics] `assess` targets `tick − 1`, the snapshot taken at the END of the previous tick, i.e. the state at the START of the failing tick. Because Verify runs before Commit, nothing from the failing tick has been committed when the order is applied, so the 'rollback' never unwinds committed state; its only substantive effects are voiding `self.approved` and the fines. Doc 05's 'deeply archived snapshot ... hard rollback of the City to a previous coherent state' is exercised only at depth 1; `snapshot_depth: 64` is never used; there is no coherence marker (e.g. last tick under the threshold) to roll back to; a crisis that accumulated under the 50% line over several ticks is never unwound. If the veto reading is intended, rename the order (Veto/StopLine) and drop the snapshot machinery from the hot path; if true rollback is intended, `assess` needs history and a coherence criterion.
- [NOT fixed; reporting] A tick-1 ruling emits `RolledBack{to_tick: 0}` although `rollback_to(0)` returned None (no snapshot ≤ 0 exists) — `restored.unwrap_or(to_tick)` reports a restoration that did not happen. Suggest `to_tick: Option<u64>` or emitting the actual restored tick only.
- [NOT fixed; reporting] Voided approvals are invisible. In the failing tick `TickReport.approved` still counts the approvals that were voided (2 approved, 0 settled), an `Approved` event was emitted for each and no per-envelope event ever says they were voided; the frontend sees Approved with no Settled/Delivered. Innocent initiators lose their crossing tax as sunk cost with no receipt. Suggest a `Voided { tick, envelope, reason }` event and a `voided` counter in TickReport.
- [NOT fixed; statistics] `TickStats.total` includes `Held` verdicts (which dilute the rejection rate) and Stage-1 held envelopes are re-verified every tick, so the same door-held envelope is counted in `total` on every tick it waits. Rate = rejected / (approved + held + rejected + slashed) is therefore camera-dependent in a way doc 05 does not describe.
- [Observation, not a bug] `set_active_scale` decides packing from `parent.level < camera.level` and assumes children sit exactly one level below their parent; a house hung directly under a Country node would keep drafting at the Country camera while a house under a street packs. Not exercised by the tests beyond the manual `unpack_children` call noted in observations.

## test output tail
```
test rollback_lands_on_the_previous_root_when_there_is_nothing_to_seize ... ok
test approvals_from_the_failed_tick_are_voided ... ok
test the_court_needs_a_sample_and_a_majority ... ok
test offenders_are_under_injunction_at_the_country_gate ... ok
test a_systemic_failure_trips_the_circuit_breaker ... ok
test replay_through_the_court_is_exact ... ok

test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s

   Doc-tests context_engine

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

## core diff: src/tick.rs
why: LOGIC BUG (blocks requirement 2): Engine held TWO Stage4StatutoryLaw instances. `Engine::court` runs `assess()` and records `injunctions`; the Country gate verified envelopes with a different instance, `strategies[Stage::Country]` (from `default_strategies()`), whose injunction set stays empty forever. Injunctions therefore never bound: on the unpatched file the injunction test fails with 4 approved instead of 2 (offenders' envelopes approved at Country), and `strategy(Stage::Country).describe()` reports '0 rollbacks, 0 injunctions' after 5 rollbacks. The fix routes the Country gate to `self.court` in `verify()` (disjoint-field borrow, no other change) and makes StateView.gates describe the court that actually rules. Side effect to note: `set_strategy(Stage::Country, ..)` / `strategy(Stage::Country)` now address an orphan instance; the clean follow-up is to drop Country from `default_strategies()` or make `court` the map's entry.
```diff
--- /Users/gch2021/Dev/Multi-Asset Workflows/engine/src/tick.rs
+++ src/tick.rs
@@ -464,7 +464,10 @@
         {
             let view = BoundaryView { tick, graph: &self.graph, decisions: &self.decisions, node_status: &node_status, node_secrets: &node_secrets };
             for (gate, envs) in by_gate {
-                let strat = strategies.get_mut(&gate).expect("a strategy for every stage");
+                // One court, not two. The Country gate is the same instance
+                // that assesses the tick, so the injunctions it hands down
+                // bind at the gate. (`strategies[Country]` is not consulted.)
+                let strat: &mut dyn VerificationStrategy = if gate == Stage::Country { &mut self.court } else { strategies.get_mut(&gate).expect("a strategy for every stage").as_mut() };
                 let verdicts = strat.verify_batch(&envs, &view);
                 if gate == Stage::City && !envs.is_empty() {
                     let gross: f64 = envs.iter().filter(|e| e.payload.moves_liquidity()).map(|e| e.requested_liquidity).sum();
@@ -838,7 +841,7 @@
                 waiting,
                 halted,
             },
-            gates: self.strategies.values().map(|s| s.describe()).collect(),
+            gates: self.strategies.iter().map(|(s, b)| if *s == Stage::Country { self.court.describe() } else { b.describe() }).collect(),
             last_report: self.reports.last().cloned(),
             root_history: self.graph.root_history.iter().rev().take(16).map(|(t, r)| (*t, r.short())).collect(),
         }

```

## core diff: src/scenarios/mod.rs
why: Registers the new scenario module and re-exports its builders so `context_engine::prelude::*` (which globs `scenarios::*`) exposes forged_street/forged_country/Transferor/CourtWorld to the integration tests.
```diff
--- /Users/gch2021/Dev/Multi-Asset Workflows/engine/src/scenarios/mod.rs
+++ src/scenarios/mod.rs
@@ -1,6 +1,9 @@
 //! Ready-made worlds. The same engine, seeded so a run replays exactly.
 //! One file per stage; each stage's scenario is a pure function of its config.
 
+pub mod high_court;
+pub use high_court::{forged_country, forged_street, CourtWorld, Transferor};
+
 use crate::agents::statistical::{Inspector, Porter, Scout, Scribble, Steward};
 use crate::node::{Stage, Task};
 use crate::resources::Purse;

```