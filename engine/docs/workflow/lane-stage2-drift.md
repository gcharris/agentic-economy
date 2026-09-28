# lane stage2-drift · green=True

## files created
- tests/stage2_letter_slot.rs: Proves the Stage 2 atomic DvP story end to end: (1) swaps settle through the Letter Slot with the camera at Stage::Street and the Sovereign Graph moves by exactly the settled amounts (liquidity conserved, purse belief == truth after settle); (2) after move_truth() every stale HireService reverts with a hash-mismatch Rejected at gate Street, no balance moves, and the purse drops by exactly the 0.5 cr crossing tax (the 2.0 send weight is not charged); (3) a house that pays the oracle (forced two ways: a PayOracle test seat, and generation = MAX_UNCALIBRATED_HANDOVERS so the real Scout asks) settles again next tick at the new price while its neighbours keep reverting; (4) a zero-allocation liquidity payload is DroppedByCourier in Collect, never minted, never seen by the slot; (5) Stage2LetterSlot.history holds Settled and Reverted records bound to their envelopes and locked amounts. Also: replay under drift is exact; a street of >=5 stale houses trips the Stage 4 court; a characterisation test showing the Scribble hallucination branch is dormant with the default staff; and two #[ignore]d tests that encode doc 04 section 3's Lock semantics the engine does not yet implement (they fail today, verified with --ignored). Reads the real Stage2LetterSlot's ledger through a SharedSlot wrapper (Arc<Mutex<Stage2LetterSlot>> behind the VerificationStrategy trait) so no core change was needed.
- src/scenarios/drift.rs: Stage 2 under drift, as a reusable scenario: street_under_drift(config, houses, budget_each, tasks_each, new_price) builds scenarios::street and moves the courier's ground truth before tick 1; move_truth(engine, service, price) is the host-side act of the world moving (a draft cannot do it by law 1; Commit never changes prices). Constants STALE_PRICE = 10.0 and MOVED_PRICE = 12.0. Registered in src/scenarios/mod.rs and re-exported through the prelude.

## cargo toml diff
```diff
(no change) diff -u of the original Cargo.toml against the lane copy is empty. No dependencies, features or tokio flags were added; the tests use only std (Arc, Mutex, BTreeMap) and the crate's prelude.
```

## tests added
- swaps_settle_through_the_letter_slot_and_move_the_graph_exactly
- a_moved_truth_reverts_every_stale_swap_and_sinks_only_the_tax
- the_default_staff_reverts_under_drift_until_the_scout_pays_the_oracle
- a_house_that_pays_the_oracle_settles_again_while_its_neighbours_still_revert
- an_overdue_house_asks_the_oracle_itself_and_settles_next_tick
- the_courier_drops_a_liquidity_payload_with_zero_allocation_before_verification
- the_letter_slot_history_records_settled_and_reverted_phases
- replay_under_drift_is_exact
- a_street_wide_stale_price_trips_the_high_court
- scribble_hallucination_path_is_dormant_with_the_default_staff
- dvp_binds_the_lock_amount_to_the_verified_price  [#[ignore]: encodes doc 04 s3 Lock semantics not yet implemented; fails today by design, un-ignore with the fix]
- dvp_lock_reserves_liquidity_so_a_second_swap_cannot_pass_the_gate  [#[ignore]: encodes doc 04 s3 Lock semantics not yet implemented; fails today by design, un-ignore with the fix]

## observations
- Full suite in the lane: 16 unit + 13 golden_invariant + 10 stage2_letter_slot passed, 2 ignored by design, 0 failed. Lane crate: /private/tmp/claude-501/-Users-gch2021-Dev-Multi-Asset-Workflows/8644f859-ac58-45f1-8794-84c71d2ade47/scratchpad/lanes/stage2-drift/engine. The original at /Users/gch2021/Dev/Multi-Asset Workflows/engine was never modified.
- The original crate moved on after the lane was copied (upstream edits at 21:14-21:17 to src/agents/statistical.rs [Scribble/Inspector pick tier and tokens by cost_visible], src/wasm_abi.rs [new engine_set_truth_price export], tests/golden_invariant.rs [exhaustion budget 30 -> 20]). To prove my additions merge onto the live version, I overlaid only drift.rs, the mod.rs registration and the new test file onto a copy of the CURRENT original at .../scratchpad/lanes/stage2-drift/merge-check and ran cargo test there: 16 + 13 + 10 passed, 2 ignored, 0 failed. Merge by hand = copy the two new files and apply the 3-line mod.rs hunk.
- scenarios::move_truth duplicates what the new wasm export engine_set_truth_price does inline; the wasm export could call scenarios::move_truth(e, "courier", price) so the browser and the tests share one definition of 'the world moved'.
- HALLUCINATION PATH FINDING (statistical.rs, Scribble): with the default staff and default seeds the branch `is_hallucinating() && chance(fog)` is DORMANT ON THE STREET and no hallucination-driven revert ever occurs anywhere. Structural reason: the Scout syncs at generation >= 5, so the deepest generation the Scribble drafts at on a street is 7, and Phi after 7 handovers through Scribble(BalancedStaff, rigor 0.90)/Inspector(FrontierDeep, 0.98) is about 0.90, far above the 0.75 cliff; with the camera at Street nothing ever waits at a gate, so idle decay never accumulates. Empirical: 12 seeds x 30 ticks x 3 houses produced zero 'I'm fairly sure the courier costs' thoughts and zero hash mismatches while the truth stood still (asserted in scribble_hallucination_path_is_dormant_with_the_default_staff). The branch IS reachable at Stage 1: a temporary probe (removed) over 30 seeds had a person leave the Porter at the Door ~12 ticks; Phi decayed idle to ~0.67 and the next draft hallucinated a price in 31 of 90 low-Phi drafts (~34%, matching fog). But at Stage 1 the house has no known_peers, so the hallucinated price only reaches a paper and a thought, never a HireService envelope. Net: every revert in these tests comes from the world moving, not from a hallucinated belief.
- SMALLEST CHANGE PROPOSED (not applied; one token in src/agents/statistical.rs, Scribble::draft): replace `if ctx.epistemics.is_hallucinating() && ctx.rng.chance(ctx.epistemics.fog())` with `if ctx.rng.chance(ctx.epistemics.fog())`, so the probability of acting on a wrong price is continuous in 1 - Phi instead of a cliff at 0.75. On a street Phi sits at 0.90-0.97, giving a 3-10% chance per draft: a 3-house street then produces roughly one hallucinated hire every 3-5 ticks that reverts at the Letter Slot on its own, which is the doc 05 story ('Epistemic Decay hallucinating a different price'). Determinism is untouched (seeded rng), the Inspector's 'flagged' verdict can keep using is_hallucinating(), and doc 02's cliff survives as the point where fog is large. Alternative if the cliff must stay: leave the Scribble alone and let the demo trigger drift via move_truth / engine_set_truth_price, which is what the tests do.
- Reading Stage2LetterSlot.history needed no core change: Engine boxes strategies as dyn VerificationStrategy with no downcast, so the test installs the REAL Stage2LetterSlot behind an Arc<Mutex<_>> wrapper via Engine::set_strategy. If the frontend ever wants the DvP ledger (it is a natural 'handshake' animation source per GAME_ENGINE_ARCHITECTURE.md), the cheapest core addition is `fn as_any(&self) -> &dyn Any` on the trait or a `dvp_history()` accessor; describe() already carries the settled/reverted counts.
- Timing detail worth showing in the video: a house's swap drafted in the same block as its StateSync still carries the stale Oak snapshot and reverts; the settle comes one tick after the oracle. That is law 1 working as designed (the draft snapshot predates Commit), and the tests assert it explicitly.
- With identical staff and seeds every house reaches generation 5 on the same tick, so all houses pay the oracle in lockstep (asserted: synced == 3 on one tick). For a livelier street in the demo, stagger initial epistemics.generation or rigor per house so oracle payments spread out.
- The crossing tax is burned in Collect BEFORE Mempool::submit applies the courier rule, so a zero-allocation liquidity payload still costs its 0.5 cr of tax even though it never reaches anyone (the test only asserts the 2.0 send weight was not charged, to avoid locking that ordering in). Defensible as 'the envelope was formatted', but worth a conscious decision.
- A house whose swap reverted learns nothing on its own table: only the engine-level Rejected event carries the 'hash mismatch' reason, and only StateSync ever writes price/courier. If the Scout should be able to notice 'my last swap bounced' without the host, Commit/verify could leave a paper on the initiator's table on a revert.
- Pre-existing clippy warning, present in the original too and not touched: src/tick.rs:368 extend_with_drain (`node.receipts.extend(ctx.receipts.drain(..))` -> `append`). No compiler warnings in any target.
- Engine::verify computes `sunk = env.tax_paid + env.compute_weight.min(0.0).abs()`; the second term is always 0 for non-negative weights, so sunk_compute == tax_paid. Reads like a leftover; harmless.

## design flaws
- DvP Lock reserves nothing (doc 04 s3 step 1 'Sender locks Liquidity'): BoundaryView::liquidity_backed only READS the graph balance; nothing is reserved and SovereignNode.liquidity_locked is never written anywhere. Two 10-credit swaps from a 15-credit purse in one tick both pass the Letter Slot (its ledger records two Settled, swaps == 2), then the second fails in Engine::commit as 'stale belief at commit'. The gate's Approved verdict is therefore not final, and the slot's history disagrees with the graph. Encoded as the ignored test dvp_lock_reserves_liquidity_so_a_second_swap_cannot_pass_the_gate (fails today: got (approved, rejected) = (2, 1), want (1, 1)). Fix sketch: Stage2LetterSlot::verify_batch keeps a per-initiator BTreeMap<NodeId, f64> of locked amounts for the batch and rejects with 'lock failed' once truth - locked < requested.
- The verified hash is not bound to the locked amount (doc 05 Stage 2 'Both verify the exact payload size and signature'): the slot compares believed_price_hash to graph.price_hash(service) but never checks hash_price(service, believed_price) == believed_price_hash nor requested_liquidity == believed_price. A seat presenting the hash of 10.0 with believed_price = 1.0 and requested_liquidity = 1.0 settles for 1.0. Encoded as the ignored test dvp_binds_the_lock_amount_to_the_verified_price (fails today: got (2, 0), want (0, 2)). Fix is two lines in Stage2LetterSlot::verify.
- Receiver locks no compute and never verifies (doc 04 s3 step 1 'Receiver locks Compute', step 3 'Both nodes cryptographically verify'): the target's purse is untouched throughout the DvP; the target's Oak Table is written only at Commit (orders/<id>); HoldReason::AwaitingCounterparty exists but is never produced; DvpPhase::Lock and DvpPhase::Transfer are never recorded (the ledger enters at Verify and jumps to Settled/Reverted). The engine models a one-sided check of the initiator's belief against the global truth, not a two-party handshake. Acceptable as an abstraction, but the AtomicDvP.locked_compute field records the INITIATOR's compute_weight, which is misleading given the doc's wording.
- 'The Compute spent verifying is permanently burned' (doc 04 s3 step 4) is only partly true: on a revert the engine sinks the crossing tax (0.25 x weight = 0.5 cr) and never charges the 2.0 send weight; on a settle it charges both. Yet AtomicDvP.locked_compute = 2.0 claims the weight was locked, so on a revert the ledger overstates the sunk compute 4x. Either record tax_paid as locked_compute, or burn the weight on revert as the doc says (the tests assert today's behaviour: purse drops by exactly the tax).
- Stage 4 court double-penalises epistemic drift: Stage4StatutoryLaw::assess runs every tick regardless of active_scale and counts hash-mismatch reverts as rejections. Five stale houses with no deliveries in a tick (5 of 5 rejected) trigger a graph rollback, a 25% liquidity slash of each house and an injunction, with the camera still at Street. Doc 04 s3 says the penalty for a stale swap is burned compute (not seized liquidity) and doc 05 scopes the court to a clearinghouse failure / liquidity crisis; a revert moves no liquidity, so there is no crisis. Documented by a_street_wide_stale_price_trips_the_high_court. Suggested fix: have the court count only Slashed/unbacked verdicts (liquidity failures) in TickStats, or assess only when active_scale >= City. Note this also constrains requirement (2)'s 'graph unchanged': it holds only while fewer than 5 envelopes are rejected in a tick or the rejection ratio stays <= 50%.
- Verify compares against the global service_prices, not against House B's data: doc 05 says 'House B locks data' and both verify, so a stale COUNTERPARTY should also be able to make a swap revert. In the engine only the initiator's staleness matters. Fine as a simplification, but it means the receiver can never be wrong, which flattens the gameplay loop described at the end of doc 04.

## test output tail
```
test an_overdue_house_asks_the_oracle_itself_and_settles_next_tick ... ok
test a_moved_truth_reverts_every_stale_swap_and_sinks_only_the_tax ... ok
test a_street_wide_stale_price_trips_the_high_court ... ok
test the_default_staff_reverts_under_drift_until_the_scout_pays_the_oracle ... ok
test replay_under_drift_is_exact ... ok
test scribble_hallucination_path_is_dormant_with_the_default_staff ... ok

test result: ok. 10 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 1.67s

   Doc-tests context_engine

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

## core diff: src/scenarios/mod.rs
why: Registration only: declares the new drift scenario module and re-exports its two functions and two constants so `context_engine::prelude::*` (and the house binary / wasm ABI, if wanted) can reach them. No behaviour in any existing scenario changed.
```diff
--- /Users/gch2021/Dev/Multi-Asset Workflows/engine/src/scenarios/mod.rs
+++ src/scenarios/mod.rs
@@ -7,6 +7,9 @@
 use crate::tick::{Engine, EngineConfig};
 use std::sync::Arc;
 
+pub mod drift;
+pub use drift::{move_truth, street_under_drift, MOVED_PRICE, STALE_PRICE};
+
 /// Stage 1. One house, one purse, the oak table, the door. The parent
 /// street exists only as the outside world the Porter sends to.
 pub fn house(mut config: EngineConfig, budget: f64, tasks: usize) -> Engine {
```