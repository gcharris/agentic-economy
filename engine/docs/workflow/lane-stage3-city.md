# lane stage3-city · green=True

## files created
- src/scenarios/city.rs: Stage 3 scenario: pub fn city(config, streets, houses_per_street, budget_each, tasks_each) -> Engine. One City node (no parent), N Street children, M staffed House grandchildren per street; each house's known_peers lists every house on every OTHER street (all hires are Crossing::CrossParent, taxed x1.40; each dispatch to its own street is SameParent, x1.25). Camera placed at Stage::City by configuration (as the street scenario places it at Stage::Street) so effective_gate() is the Stage3Clearinghouse while houses keep drafting discretely. Exports CITY_HOUSE_LIQUIDITY (200.0) and CITY_COURIER_PRICE (10.0).
- tests/stage3_clearinghouse.rs: Stage 3 proofs: world shape; (1) one Netted event per tick with gross >= net and settled == net; (2) mutual hires settle net (0) not gross (20) while both contracts are recorded, plus the design-intent case where two houses with truth 3 clear a 10-for-10 exchange that gross settlement rejected; (3) an unbacked net debtor gets Slashed at 0.10 x requested and its truth drops; (4) ProposalEnvelope.tax_paid is x1.40 cross-street and x1.25 same-street, asserted on real envelopes captured by a RecordingClearinghouse strategy wrapper (Strategy Pattern used as the probe, no core hook needed); (5) bit-for-bit replay of reports, roots, events, graph and state_json; plus one documentation test showing set_active_scale(Stage::City) packs the houses and silences the clearinghouse. The file's module doc records the empirical pre-change probe (gross-at-commit) verbatim.

## cargo toml diff
```diff

```

## tests added
- tests/stage3_clearinghouse.rs::the_city_is_built_as_specified
- tests/stage3_clearinghouse.rs::one_netting_run_per_tick_with_gross_at_least_net  (proof 1)
- tests/stage3_clearinghouse.rs::mutual_hires_settle_net_not_gross  (proof 2)
- tests/stage3_clearinghouse.rs::netting_clears_what_gross_settlement_could_not  (proof 2, design intent: truth 3 each clears a 10-for-10 exchange)
- tests/stage3_clearinghouse.rs::unbacked_net_position_is_slashed_at_ten_percent  (proof 3)
- tests/stage3_clearinghouse.rs::cross_street_pays_1_40_and_same_street_pays_1_25  (proof 4, asserts on ProposalEnvelope.tax_paid via a recording strategy)
- tests/stage3_clearinghouse.rs::the_city_replays_bit_for_bit  (proof 5)
- tests/stage3_clearinghouse.rs::moving_the_camera_to_the_city_packs_the_houses_the_clearinghouse_needs  (documents the LOD tension; asserts current behaviour)

## observations
- Full run in the lane: 16 lib unit tests + 13 golden_invariant + 8 stage3_clearinghouse = 37 passed, 0 failed. The Stage 3 suite finishes in 0.03 s (2 streets x 3 houses, 400 cr budget, 3 tasks each).
- The browser build still compiles: cargo build --no-default-features --target wasm32-unknown-unknown succeeded in the lane after the change.
- Determinism: grep for SystemTime/Instant/rand/getrandom/RandomState over src and tests is clean; the replay test compares reports, roots, drained events, the whole SovereignGraph and state_json across 14 ticks, and confirms a different seed produces a different root.
- The single clippy warning in the lane (tick.rs:368, extend vs append in collect()) is pre-existing and untouched.
- Empirical pre-change record kept in the test file's module doc: on the unmodified engine, rich mutual hires settled 20 = gross and the Netted event reported net: 20 for a true net of 0; poor mutual hires (truth 3 each) were approved by the gate on net position 0 and then both rejected at commit with 'stale belief at commit: truth 3.0'. Post-change: settled 0, both contracts recorded, truths unchanged, and the truth-3 case clears with zero rejections.
- Test (4) captures real ProposalEnvelope structs by wrapping Stage3Clearinghouse in a RecordingClearinghouse installed via Engine::set_strategy; no core hook was needed, which is the Strategy Pattern doing what doc 05 says it is for. Cross-street hires: tax_paid = 2.0 x 0.40 = 0.8 with crossing CrossParent; dispatches to own street: 25 x 0.25 = 6.25 SameParent; a same-street hire (one house repointed at its neighbour): 2.0 x 0.25 = 0.5.
- Slash proof (3): a house whose table says courier = 500 (truth 200) has net position 490 (owes 500, is owed 10); Slashed amount = 500 x 0.10 = 50, reason 'unbacked in netting: net position 490.0 > truth 200.0', truth 200 -> 150 at the gate -> 160 after the counterparty's backed hire of it cleared at commit; graph.total_slashed = 50; belief corrected to truth; no hire contract from the offender; one offender in eight envelopes does not trip the Stage 4 court.
- settle_netted keeps per-envelope Settled events at the envelope's gross (contract) value so a renderer can resolve each envelope, while report.settled_liquidity and graph.total_settled carry only the net. The Netted event is the place the renderer reads gross-vs-net; the unwind in commit can, in principle, make final settled slightly lower than the Netted event's net when a slashed node's counterparties become unbacked, which is why proof (1) asserts settled == net only in a solvent city.
- The city scenario follows the street scenario's precedent of placing the camera by config.active_scale rather than Engine::set_active_scale; see design flaws for why.

## design flaws
- [fixed in this lane, core diff] Gate/commit disagreement at Stage 3: Stage3Clearinghouse verified each initiator's NET position against truth, but Engine::commit settled every approved envelope GROSS and sequentially via graph.transfer, so a pair of mutual hires the gate approved on net position 0 could both fail at commit ('stale belief at commit'), and a solvent city still had to hold gross liquidity. Doc 05's 'settling only the net differences' and 'massively reduces the total liquidity required to operate the city' were not implemented at the write path.
- [fixed in this lane, core diff] EngineEvent::Netted.net was the approved gross, not the net: tick.rs summed requested_liquidity over approved liquidity envelopes instead of the sum of net debits, so the frontend would have drawn gross == net every tick. The strategy's own last_net was correct but unreachable through dyn VerificationStrategy.
- [documented, not changed] LOD vs Clearinghouse tension: the LOD rule ('discrete at level >= active - 1') means Engine::set_active_scale(Stage::City) packs every house under every street, and packed nodes never draft, so a city whose camera was moved to the city has NO envelopes for the clearinghouse to net (proved by the documentation test). Doc 05 says all Stage 2 DvP transactions are routed to the Municipal Node, which presupposes discrete houses. Both the street and city scenarios sidestep this by setting config.active_scale directly. A proper resolution needs either PackedStatisticalState to emit aggregate street-level envelopes (a street-vs-street net position) or the LOD rule to keep level >= active - 2 discrete at Stage 3.
- [documented, not changed] The Clearinghouse does no price verification: a HireService with a hallucinated believed_price passes Stage 3 whenever the net position is backed (the price hash is only checked at the Stage 2 Letter Slot). In the slash test a house that believes courier = 500 is stopped only because its position exceeds its truth; a rich hallucinator would overpay 50x and the target would keep it. Zooming out from Street to City therefore silently drops the DvP hash check; the clearinghouse should at least run the same believed_price_hash comparison before netting.
- [documented, not changed] BoundaryPolicy.for_stage(House).slash_unbacked is false while the city gate slashes house initiators; Stage3Clearinghouse carries its own slash_rate (0.10) and the node's boundary_rules.slash_rate is never consulted by any gate. The BoundaryPolicy slash fields are decorative today.
- [documented, not changed] Netted is emitted only when the City gate saw at least one envelope; a tick with no traffic emits no run (proof 1 asserts exactly this). If the frontend needs a heartbeat per tick it should key off TickCommitted instead.

## test output tail
```
test mutual_hires_settle_net_not_gross ... ok
test netting_clears_what_gross_settlement_could_not ... ok
test moving_the_camera_to_the_city_packs_the_houses_the_clearinghouse_needs ... ok
test cross_street_pays_1_40_and_same_street_pays_1_25 ... ok
test one_netting_run_per_tick_with_gross_at_least_net ... ok
test the_city_replays_bit_for_bit ... ok

test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.03s

   Doc-tests context_engine

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

```

## core diff: src/tick.rs
why: REQUIRED for the stage to work as designed ('settling only the net differences'). Empirical probe on the unmodified engine (seed 3, houses A and B on different streets hiring each other at 10): rich (truth 200 each) -> gate approved both, commit ran two gross graph.transfer(10) calls, settled_liquidity = 20 = gross; poor (truth 3 each) -> gate approved both (net position 0 <= 3) then commit rejected BOTH with 'stale belief at commit: truth 3.0'. The gate verified net, the commit settled gross, so the two disagreed and the Netted event reported net: 20 for a batch whose true net was 0 (it summed the approved gross, not the netted positions; Stage3Clearinghouse.last_net had it right but is unreachable through dyn VerificationStrategy). Change: (a) commit() partitions off City-gate liquidity envelopes and hands them to a new settle_netted() which recomputes multilateral positions over what survived the gate, unwinds uncovered debtors (removing a debtor only worsens others, so the loop converges), settles once through SovereignGraph::settle_net, still burns the send cost, writes orders/ and services/ papers, records each contract at gross value, emits Settled per envelope and adds only the net to report.settled_liquidity; (b) the Netted event's net is now the sum of net debits over the approved set; (c) two private helpers net_positions()/net_of(). Every other stage's path is byte-for-byte unchanged (the partition predicate is gate == Stage::City && payload.moves_liquidity()). All 13 golden-invariant tests still pass.
```diff
--- /Users/gch2021/Dev/Multi-Asset Workflows/engine/src/tick.rs
+++ src/tick.rs
@@ -467,8 +467,9 @@
                 let strat = strategies.get_mut(&gate).expect("a strategy for every stage");
                 let verdicts = strat.verify_batch(&envs, &view);
                 if gate == Stage::City && !envs.is_empty() {
-                    let gross: f64 = envs.iter().filter(|e| e.payload.moves_liquidity()).map(|e| e.requested_liquidity).sum();
-                    let net: f64 = verdicts.iter().zip(&envs).filter(|(v, e)| matches!(v, Verdict::Approved) && e.payload.moves_liquidity()).map(|(_, e)| e.requested_liquidity).sum();
+                    let (_, gross) = net_positions(envs.iter());
+                    let (positions, _) = net_positions(envs.iter().zip(&verdicts).filter(|(_, v)| matches!(v, Verdict::Approved)).map(|(e, _)| e));
+                    let net = net_of(&positions);
                     self.events.push(EngineEvent::Netted { tick, clearinghouse: gate, gross, net, envelopes: envs.len() });
                 }
                 for (env, v) in envs.into_iter().zip(verdicts) {
@@ -586,6 +587,10 @@
 
     fn commit(&mut self, tick: u64, report: &mut TickReport) {
         let approved = std::mem::take(&mut self.approved);
+        // Stage 3: liquidity the Clearinghouse approved settles as one netted
+        // batch (only the net differences move). Everything else, one by one.
+        let (netted, approved): (Vec<ProposalEnvelope>, Vec<ProposalEnvelope>) = approved.into_iter().partition(|e| e.gate == Stage::City && e.payload.moves_liquidity());
+        self.settle_netted(tick, netted, report);
         for env in approved {
             // The cost of sending comes out of the purse after yes.
             if let Some(n) = self.nodes.get_mut(&env.initiator) {
@@ -654,6 +659,68 @@
         }
     }
 
+    /// Stage 3 settlement. The gate verified every initiator's *net* position
+    /// against the truth; here the batch is netted again over what survived
+    /// the gate (a slashed counterparty's payments are gone, so a creditor's
+    /// position can have worsened), the uncovered debtors drop out until
+    /// every net position is backed, and the graph moves by the net only.
+    /// Each cleared envelope is still a contract at its gross value.
+    fn settle_netted(&mut self, tick: u64, mut batch: Vec<ProposalEnvelope>, report: &mut TickReport) {
+        if batch.is_empty() {
+            return;
+        }
+        // The cost of sending comes out of the purse after yes, as everywhere.
+        for env in &batch {
+            if let Some(n) = self.nodes.get_mut(&env.initiator) {
+                report.compute_burned += n.purse.burn_to_empty(env.compute_weight);
+            }
+        }
+        // Unwind. Removing a debtor only worsens the others, so the loop converges.
+        loop {
+            let (positions, _) = net_positions(batch.iter());
+            let unbacked: Vec<(NodeId, f64, f64)> = positions.iter().map(|(id, p)| (*id, *p, self.graph.liquidity_of(*id))).filter(|(_, p, truth)| *p > 0.0 && truth + 1e-9 < *p).collect();
+            if unbacked.is_empty() {
+                break;
+            }
+            for (id, position, truth) in unbacked {
+                let (mine, rest): (Vec<ProposalEnvelope>, Vec<ProposalEnvelope>) = batch.into_iter().partition(|e| e.initiator == id);
+                batch = rest;
+                for env in mine {
+                    self.events.push(EngineEvent::Rejected { tick, envelope: env.id, gate: env.gate, reason: format!("unbacked at commit after netting: net position {position:.1} > truth {truth:.1}"), sunk_compute: env.tax_paid + env.compute_weight });
+                    report.rejected += 1;
+                }
+            }
+        }
+        let (positions, _) = net_positions(batch.iter());
+        let net = match self.graph.settle_net(&positions) {
+            Ok(net) => net,
+            Err((who, have)) => {
+                for env in batch {
+                    self.events.push(EngineEvent::Rejected { tick, envelope: env.id, gate: env.gate, reason: format!("netting batch void: {who} truth {have:.1}"), sunk_compute: env.tax_paid + env.compute_weight });
+                    report.rejected += 1;
+                }
+                return;
+            }
+        };
+        for env in batch {
+            if let Some(n) = self.nodes.get_mut(&env.initiator) {
+                n.purse.liquidity -= env.requested_liquidity;
+                if let Payload::HireService { service, .. } = &env.payload {
+                    n.oak_table.put(format!("services/{}", env.id), format!("{service} delivered by {}", env.target));
+                }
+            }
+            if let Some(t) = self.nodes.get_mut(&env.target) {
+                t.purse.liquidity += env.requested_liquidity;
+                if let Payload::HireService { service, .. } = &env.payload {
+                    t.oak_table.put(format!("orders/{}", env.id), format!("{service} for {}", env.initiator));
+                }
+            }
+            self.graph.record_contract(Contract { id: env.id, tick, initiator: env.initiator, target: env.target, kind: env.payload.kind().into(), amount: env.requested_liquidity });
+            self.events.push(EngineEvent::Settled { tick, envelope: env.id, from: env.initiator, to: env.target, amount: env.requested_liquidity });
+        }
+        report.settled_liquidity += net;
+    }
+
     /// Nodes that did not draft still watch the world move.
     fn decay_idle(&mut self, drafted: &BTreeSet<NodeId>) {
         for n in self.nodes.values_mut() {
@@ -849,6 +916,24 @@
     }
 }
 
+/// Multilateral netting: what each node pays (+) or receives (−) once the
+/// opposing debts in a batch cancel, and the gross the batch asked for.
+fn net_positions<'a>(envs: impl Iterator<Item = &'a ProposalEnvelope>) -> (BTreeMap<NodeId, f64>, f64) {
+    let mut positions: BTreeMap<NodeId, f64> = BTreeMap::new();
+    let mut gross = 0.0;
+    for e in envs.filter(|e| e.payload.moves_liquidity()) {
+        *positions.entry(e.initiator).or_insert(0.0) += e.requested_liquidity;
+        *positions.entry(e.target).or_insert(0.0) -= e.requested_liquidity;
+        gross += e.requested_liquidity;
+    }
+    (positions, gross)
+}
+
+/// The liquidity that actually has to move: the sum of the net debits.
+fn net_of(positions: &BTreeMap<NodeId, f64>) -> f64 {
+    positions.values().filter(|v| **v > 0.0).sum()
+}
+
 #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
 pub struct NodeView {
     pub id: NodeId,

```

## core diff: src/graph.rs
why: Additive only: one new method SovereignGraph::settle_net(&BTreeMap<NodeId,f64>) -> Result<f64,(NodeId,f64)> that applies a multilateral netting batch to the truth in one atomic step (checks every net debtor first, fails without side effects, adds only the net to total_settled). The existing pairwise transfer() cannot express 'A pays B 10 and B pays A 10 with nothing moving'; routing through the City node with two transfer() calls would double-count total_settled. No existing method or field changed.
```diff
--- /Users/gch2021/Dev/Multi-Asset Workflows/engine/src/graph.rs
+++ src/graph.rs
@@ -97,6 +97,28 @@
         Ok(())
     }
 
+    /// Stage 3: settle one multilateral netting batch. `positions` maps each
+    /// node to what it pays (+) or receives (−) once opposing debts cancel;
+    /// they sum to zero. Fails without side effects, naming the first node
+    /// whose truth cannot cover its net position. Returns the net that moved.
+    pub fn settle_net(&mut self, positions: &BTreeMap<NodeId, f64>) -> Result<f64, (NodeId, f64)> {
+        for (id, p) in positions {
+            let have = self.liquidity_of(*id);
+            if *p > 0.0 && have + 1e-9 < *p {
+                return Err((*id, have));
+            }
+        }
+        let mut net = 0.0;
+        for (id, p) in positions {
+            *self.liquidity.entry(*id).or_insert(0.0) -= p;
+            if *p > 0.0 {
+                net += p;
+            }
+        }
+        self.total_settled += net;
+        Ok(net)
+    }
+
     pub fn slash(&mut self, node: NodeId, amount: f64) -> f64 {
         let have = self.liquidity_of(node);
         let taken = amount.min(have).max(0.0);

```

## core diff: src/scenarios/mod.rs
why: Registration of the new scenario module and re-export of its two constants so the prelude (which re-exports scenarios::*) reaches them the same way it reaches house() and street().
```diff
--- /Users/gch2021/Dev/Multi-Asset Workflows/engine/src/scenarios/mod.rs
+++ src/scenarios/mod.rs
@@ -7,6 +7,9 @@
 use crate::tick::{Engine, EngineConfig};
 use std::sync::Arc;
 
+pub mod city;
+pub use city::{city, CITY_COURIER_PRICE, CITY_HOUSE_LIQUIDITY};
+
 /// Stage 1. One house, one purse, the oak table, the door. The parent
 /// street exists only as the outside world the Porter sends to.
 pub fn house(mut config: EngineConfig, budget: f64, tasks: usize) -> Engine {

```