# lane stage5-stark · green=True

## files created
- src/scenarios/world.rs: Stage 5 scenario: pub fn world(config, countries, cities_per_country) -> Engine. Countries are root nodes (parent None) each with cities_per_country City children packed into the country's statistical profile (camera at Stage::World via set_active_scale). Defines the lightweight `Chancellor` agent: one cheap cached FastQuantized call (60 tok = 0.9 cr) to read the ledger, leaves a 'Ledger' paper only when the believed balance moved (so the Oak Table root tracks the ledger), then proposes one LiquidityTransfer (2% of believed balance, flat 5 cr settlement fee) to a seeded-random peer country each active tick. Each country carries a standing-order Task that never completes so has_work() holds. Envelopes cross at CrossParent (tax 5 × 0.40 = 2.0 cr) and are gated by Stage5RecursiveStark.
- tests/stage5_recursive_stark.rs: Eight integration tests proving the four required Stage 5 properties plus the partition rule, preflight refusal of a partitioned initiator, and the quiet/readmission behaviour of a partitioned country.

## cargo toml diff
```diff

```

## tests added
- the_world_is_wired_for_stage_5 — countries are root nodes at Stage::World, cities Packed into the country's profile, effective gate is World, envelopes cross at CrossParent with tax 5×0.40, and a country holding a packed profile still drafts
- first_verification_holds_for_finality_at_zero_burn — (1) first verification yields AwaitingFinality with until_tick − tick ∈ [8,32] equal to stark.latency_for(payload_hash); node is WaitingAtDoor with the envelope in held_at_door; every tick before finality has drafted == 0, compute_burned == 0.0 and purse.compute unchanged
- approved_exactly_at_until_tick_and_settles — (2) over 120 ticks and 6+ settlement cycles, every Approved lands at exactly the first AwaitingFinality's until_tick, a Settled event lands the same tick, every re-hold repeats the same until_tick and precedes it, no rejections occur, and belief == truth for every country afterwards
- heartbeat_every_stark_period_with_a_root_that_follows_the_tables — (3) GlobalStateConfirmed at ticks 16/32/48/64 exactly, report.global_confirmed only on those ticks, latency_ticks ∈ [8,32] and == latency_for(root), root == merkle(digest(id‖oak_root)) over the countries, root moves with the ledgers; in a frozen (staff-less) world the root holds at 16==32, changes at 48 after one country's Oak Table put at tick 40, and holds again at 64
- latency_is_deterministic_in_the_payload_hash — (4) same hash → same latency on any instance, in [8,32], equals 8 + h.as_u64() % 25, distinct payloads land at distinct latencies, and two same-seed worlds produce identical until_ticks and identical TickReports over 40 ticks
- partition_rule_cuts_and_readmits — frozen 3-country world with stark_period 8: baseline heartbeat at 8; in window 2 both B and C fail a proof (truth set to 0) but only C's Oak Table changes → at 16 partitioned == [C], B stays Active; in window 3 a fully backed transfer from C is Rejected at preflight with reason containing 'partitioned' and C's root moves again → still partitioned at 24; window 4 root holds → Active at 32 and partitioned == []; window 5 C's transfer is held for finality again
- preflight_refuses_a_partitioned_initiator — direct BoundaryView test: preflight passes and Stage5 holds for finality when the initiator is on the rails; with the initiator Partitioned preflight returns Rejected('...partitioned...') and the gate's pending queue is cleared for that envelope
- a_partitioned_country_is_quiet_and_its_held_envelope_dies — a country set Partitioned with an envelope at the door: the envelope is Rejected at the next verify, the node stays Partitioned, burns nothing and proposes nothing until the heartbeat, then (root stable) is re-admitted at tick 16 and drafts again at tick 17

## observations
- Full run: unit tests 16 passed, tests/golden_invariant.rs 13 passed, tests/stage5_recursive_stark.rs 8 passed, 0 warnings. `cargo check --no-default-features --lib` also compiles. Cargo.toml untouched (no new dependencies, no feature changes).
- Lane crate: /private/tmp/claude-501/-Users-gch2021-Dev-Multi-Asset-Workflows/8644f859-ac58-45f1-8794-84c71d2ade47/scratchpad/lanes/stage5-stark/engine. New files: src/scenarios/world.rs (142 lines), tests/stage5_recursive_stark.rs (391 lines). Source crate /Users/gch2021/Dev/Multi-Asset Workflows/engine was never modified.
- The partition rule as specified was workable and is implemented exactly: partition = (oak root at heartbeat != root at previous heartbeat) AND (an envelope rejected at the World gate in the same window); readmission = root stable at the next heartbeat, stability only. One interpretive choice, documented in code: at the very first heartbeat there is no previous root, and 'no baseline' is treated as stable (a country is never cut off for want of a baseline). 'Rejected at Stage 5' counts any Rejected verdict from the World gate (including preflight) plus the commit-phase 'stale belief at commit' failure for a World-gated envelope; because readmission is stability-only, the preflight rejections a partitioned country accrues do not prolong its partition.
- Rule placement mirrors Stage 4: Stage5RecursiveStark::assess() returns a PartitionOrder the engine applies, exactly as Stage4StatutoryLaw::assess() returns a CourtOrder. Partitioning writes nothing to the country's Oak Table (no note, no paper), because a write would move the root and make re-admission impossible; the HaltReason::Partitioned variant that already exists is therefore deliberately unused.
- Determinism preserved: grep of every touched/new file for SystemTime/Instant/std::time/rand/getrandom/now() finds nothing; the Chancellor picks its target from ctx.rng (seeded per node per tick); latency is 8 + payload_hash.as_u64() % 25; the replay test asserts identical TickReports across two same-seed worlds at Stage 5.
- Chancellor economics per settlement cycle: 0.9 cr (60 tok FastQuantized, cache hit) + 2.0 cr CrossParent tax at mint + 5.0 cr fee after the proof lands; 2 % of believed balance moves; with COUNTRY_COMPUTE = 2000 a country runs ~250 cycles. Liquidity belief and truth stay equal in the unprovoked scenario, so no country is ever partitioned spontaneously; the tests provoke proof failures by setting graph truth below belief and injecting signed envelopes into the mempool.
- The source crate drifted from the lane copy after the lane was cut (src/agents/statistical.rs, src/wasm_abi.rs, tests/golden_invariant.rs changed at 21:04–21:17, apparently another lane's cost-visibility work merging). None of the files I modified drifted, so the four diffs above apply cleanly to the current source with `patch -p0`.
- The scenario calls e.set_active_scale(Stage::World) at construction so cities are genuinely in stasis (Packed event at tick 0, packed_groups == countries each tick). Without the node.rs fix this call would have silenced every country; the test the_world_is_wired_for_stage_5 asserts drafted == 3 on tick 1 precisely to lock that in.

## design flaws
- FIXED (node.rs, 1 line): SovereignNode::is_draftable() required packed.is_none(). That conflates 'this node holds its children's packed profile' with 'this node is in stasis'. At Stage::World every country holds a profile of its cities, so the camera's own zoom-out silenced every country's seats, contradicting doc 03 (the camera's level and the level below run discretely). A node in stasis is already excluded by status == Packed.
- FIXED (boundary.rs, 1 line): Stage5RecursiveStark::verify returned a preflight rejection without removing the envelope from its `pending` finality map, so destroyed envelopes stayed queued forever and describe() overcounted 'awaiting finality'.
- NOT FIXED, flagged: there are two Stage5RecursiveStark instances. Engine.stark (pub) does heartbeat/latency, while strategies[Stage::World] (a Box<dyn VerificationStrategy> from default_strategies()) holds the finality queue and issues verdicts. The gate cannot record its own proof failures into the instance the heartbeat reads, so the engine has to call stark.note_rejection() in verify()/commit(). Unifying them needs either a trait hook (e.g. a `heartbeat` method on VerificationStrategy) or a downcast; out of scope for a minimal lane.
- NOT FIXED, flagged: Engine::decay_idle skips any node with packed.is_some(). A country waiting 8–32 ticks at the planetary door therefore does not idle-decay while its cities are packed, so the Stage 1 law 'holding is free in compute and not free in truth' silently stops holding for countries at Stage 5. The fix is the same shape as the is_draftable one (test status == Packed, not the profile), but it changes epistemic trajectories at Stages 3–5 and belongs to a lane that owns those numbers.
- NOT FIXED, worked around: has_work() requires a Pending/Drafted Task, and a LiquidityTransfer never touches task state, so a country with a standing mandate to settle has no way to be draftable without a task. The scenario gives each country a 'standing-order/cross-border-settlement' Task that never completes. Semantically 'no task, no burn' does not map onto a treasury's continuous mandate; a first-class notion of a standing order (or a per-node `mandate` flag) would be cleaner.
- NOT FIXED, flagged: settling a LiquidityTransfer writes neither party's Oak Table, so country roots would never move from settlement alone and the planetary root would be static in a busy world. The Chancellor compensates by leaving a 'Ledger' paper whenever its believed balance changed. If the engine is meant to be the source of the ledger line (commit writing e.g. `ledger/<envelope>` to both tables, as it already does for HireService orders/services), the seat should stop doing it.
- MINOR, flagged: the TickCommitted event's status tally has `NodeStatus::Partitioned => {}`, so a frontend cannot count partitioned countries from TickCommitted; it must read GlobalStateConfirmed.partitioned. Adding a nodes_partitioned field is a one-field event change I did not make to keep the wire format stable for other lanes.
- MINOR, flagged: the sunk-cost figure on a Rejected event is `env.tax_paid + env.compute_weight.min(0.0).abs()`; compute_weight is never negative so the second term is always 0. Probably intended as `.max(0.0)` or simply tax_paid. Cosmetic; untouched.

## test output tail
```
test first_verification_holds_for_finality_at_zero_burn ... ok
test a_partitioned_country_is_quiet_and_its_held_envelope_dies ... ok
test partition_rule_cuts_and_readmits ... ok
test latency_is_deterministic_in_the_payload_hash ... ok
test heartbeat_every_stark_period_with_a_root_that_follows_the_tables ... ok
test approved_exactly_at_until_tick_and_settles ... ok

test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.05s

   Doc-tests context_engine

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

## core diff: src/node.rs
why: MUST change for Stage 5 to work: is_draftable() required packed.is_none(), but at Stage::World every country holds its cities' packed profile, so countries stopped drafting the moment the camera packed their cities. Doc 03 says the camera's level and the level below it run discretely; a node that is itself in stasis has status == Packed, which the check already covers. One-line fix; all existing tests still pass.
```diff
--- /Users/gch2021/Dev/Multi-Asset Workflows/engine/src/node.rs
+++ src/node.rs
@@ -249,9 +249,13 @@
         self.current_task().is_some()
     }
 
-    /// Should this node run a discrete draft this tick?
+    /// Should this node run a discrete draft this tick? A node holding a
+    /// packed profile of its *children* still drafts itself: at Stage 5 a
+    /// country's cities are in stasis while the country's own seat runs
+    /// (doc 03: the camera's level and the level below it run discretely).
+    /// A node that is itself in stasis has `status == Packed`.
     pub fn is_draftable(&self) -> bool {
-        self.status == NodeStatus::Active && self.packed.is_none() && self.has_work()
+        self.status == NodeStatus::Active && self.has_work()
     }
 
     /// The one and only view a draft ever gets of this node: an owned
```

## core diff: src/boundary.rs
why: The partition rule lives in the Stage 5 gate (Strategy Pattern, mirroring Stage4StatutoryLaw::assess -> CourtOrder): Stage5RecursiveStark gains last_roots (each country's root at the previous heartbeat), rejected_this_window, note_rejection(), and assess() -> PartitionOrder { partition, readmit }. Also a one-line fix: a preflight rejection now clears the envelope's entry from the finality queue (previously leaked, and describe() overcounted 'awaiting finality').
```diff
--- /Users/gch2021/Dev/Multi-Asset Workflows/engine/src/boundary.rs
+++ src/boundary.rs
@@ -402,8 +402,25 @@
 
 // ───────────────────────── Stage 5: Recursive STARKs ─────────────────────
 
+/// The validators' decision at a heartbeat: who is cut from the rails and
+/// who is let back on. Applied by the engine, like a [`CourtOrder`].
+#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
+pub struct PartitionOrder {
+    pub partition: Vec<NodeId>,
+    pub readmit: Vec<NodeId>,
+}
+
 /// The planetary computer. No court, only proofs. The engine does not run
 /// the hashes; it aggregates the roots and waits 8–32 ticks for finality.
+///
+/// The partition rule (doc 05, Stage 5): a country whose Merkle root does
+/// not align with the proof is temporarily partitioned from the global
+/// liquidity rails until it resolves its state. Concretely, at a heartbeat a
+/// country is partitioned when its root moved since the previous heartbeat
+/// *and* one of its envelopes failed its proof in the same window; a
+/// partitioned country is re-admitted at the next heartbeat at which its
+/// root held still. The first heartbeat is the baseline: with no previous
+/// root there is nothing to disagree with.
 #[derive(Clone, Debug, Serialize, Deserialize)]
 pub struct Stage5RecursiveStark {
     pub min_latency: u64,
@@ -411,11 +428,15 @@
     pending: BTreeMap<EnvelopeId, u64>,
     pub proofs: u64,
     pub last_global_root: Option<Hash32>,
+    /// Every country's root at the previous heartbeat.
+    pub last_roots: BTreeMap<NodeId, Hash32>,
+    /// Countries with a proof failure since the previous heartbeat.
+    pub rejected_this_window: BTreeSet<NodeId>,
 }
 
 impl Default for Stage5RecursiveStark {
     fn default() -> Self {
-        Stage5RecursiveStark { min_latency: 8, max_latency: 32, pending: BTreeMap::new(), proofs: 0, last_global_root: None }
+        Stage5RecursiveStark { min_latency: 8, max_latency: 32, pending: BTreeMap::new(), proofs: 0, last_global_root: None, last_roots: BTreeMap::new(), rejected_this_window: BTreeSet::new() }
     }
 }
 
@@ -433,6 +454,29 @@
         global
     }
 
+    /// A proof failed for this initiator. Counted at the next heartbeat.
+    pub fn note_rejection(&mut self, initiator: NodeId) {
+        self.rejected_this_window.insert(initiator);
+    }
+
+    /// The partition rule, once per heartbeat, over every country's current
+    /// root and status. Stores the roots as the next baseline and opens a
+    /// new window.
+    pub fn assess(&mut self, roots: &[(NodeId, Hash32)], status: &BTreeMap<NodeId, NodeStatus>) -> PartitionOrder {
+        let mut order = PartitionOrder::default();
+        for (id, root) in roots {
+            let stable = self.last_roots.get(id).map_or(true, |prev| prev == root);
+            match status.get(id) {
+                Some(NodeStatus::Partitioned) if stable => order.readmit.push(*id),
+                Some(NodeStatus::Active | NodeStatus::WaitingAtDoor) if !stable && self.rejected_this_window.contains(id) => order.partition.push(*id),
+                _ => {}
+            }
+        }
+        self.last_roots = roots.iter().copied().collect();
+        self.rejected_this_window.clear();
+        order
+    }
+
     pub fn pending(&self) -> usize {
         self.pending.len()
     }
@@ -445,6 +489,7 @@
 
     fn verify(&mut self, env: &ProposalEnvelope, view: &BoundaryView<'_>) -> Verdict {
         if let Some(v) = preflight(env, view) {
+            self.pending.remove(&env.id);
             return v;
         }
         if let Err(have) = view.liquidity_backed(env) {
```

## core diff: src/tick.rs
why: The engine records every World-gated rejection into Engine.stark (verify-phase Rejected verdicts, which include preflight, plus the commit-phase 'stale belief at commit' failure) and, at the heartbeat, calls stark.assess() and applies the PartitionOrder: NodeStatus::Partitioned for cut countries, Active for re-admitted ones, before emitting GlobalStateConfirmed whose `partitioned` list now reflects the verdict. No Oak Table is written by partitioning, so the root a country must hold still is its own.
```diff
--- /Users/gch2021/Dev/Multi-Asset Workflows/engine/src/tick.rs
+++ src/tick.rs
@@ -521,6 +521,9 @@
         for (env, reason) in rejected {
             self.decisions.take(env.id);
             offenders.push(env.initiator);
+            if env.gate == Stage::World {
+                self.stark.note_rejection(env.initiator);
+            }
             let sunk = env.tax_paid + env.compute_weight.min(0.0).abs();
             self.events.push(EngineEvent::Rejected { tick, envelope: env.id, gate: env.gate, reason, sunk_compute: sunk });
             if let Payload::Dispatch { task_id, .. } = &env.payload {
@@ -615,6 +618,9 @@
                             report.settled_liquidity += env.requested_liquidity;
                         }
                         Err(have) => {
+                            if env.gate == Stage::World {
+                                self.stark.note_rejection(env.initiator);
+                            }
                             self.events.push(EngineEvent::Rejected { tick, envelope: env.id, gate: env.gate, reason: format!("stale belief at commit: truth {have:.1}"), sunk_compute: env.tax_paid + env.compute_weight });
                             report.rejected += 1;
                             continue;
@@ -677,7 +683,8 @@
     }
 
     /// Stage 5 heartbeat: aggregate the countries' roots into the planetary
-    /// proof. Returns true when a proof was emitted.
+    /// proof, then apply the partition rule. Returns true when a proof was
+    /// emitted.
     fn heartbeat(&mut self, tick: u64) -> bool {
         let roots: Vec<(NodeId, Hash32)> = self.nodes.values_mut().filter(|n| n.parent.is_none()).map(|n| (n.id, n.oak_table.root())).collect();
         if roots.is_empty() {
@@ -685,6 +692,22 @@
         }
         let global = self.stark.heartbeat(&roots);
         let latency = self.stark.latency_for(&global);
+        // A country whose root moved and whose proof failed in the same
+        // window is cut from the rails; one whose root held still is let
+        // back on. Its Oak Table is untouched: partition is a status, not a
+        // write, so the root it must hold still is its own.
+        let status: BTreeMap<NodeId, NodeStatus> = self.nodes.values().map(|n| (n.id, n.status)).collect();
+        let order = self.stark.assess(&roots, &status);
+        for id in &order.partition {
+            if let Some(n) = self.nodes.get_mut(id) {
+                n.status = NodeStatus::Partitioned;
+            }
+        }
+        for id in &order.readmit {
+            if let Some(n) = self.nodes.get_mut(id) {
+                n.status = NodeStatus::Active;
+            }
+        }
         let partitioned: Vec<NodeId> = self.nodes.values().filter(|n| n.status == NodeStatus::Partitioned).map(|n| n.id).collect();
         self.events.push(EngineEvent::GlobalStateConfirmed { tick, root: global, latency_ticks: latency, partitioned });
         true
```

## core diff: src/scenarios/mod.rs
why: Register the new scenario module and re-export world() and Chancellor so they reach the prelude.
```diff
--- /Users/gch2021/Dev/Multi-Asset Workflows/engine/src/scenarios/mod.rs
+++ src/scenarios/mod.rs
@@ -7,6 +7,9 @@
 use crate::tick::{Engine, EngineConfig};
 use std::sync::Arc;
 
+pub mod world;
+pub use world::{world, Chancellor};
+
 /// Stage 1. One house, one purse, the oak table, the door. The parent
 /// street exists only as the outside world the Porter sends to.
 pub fn house(mut config: EngineConfig, budget: f64, tasks: usize) -> Engine {
```