//! Stage 2, the Letter Slot under drift. The atomic DvP story, proven in
//! the engine rather than told:
//!
//! 1. On a street, with the camera at the street, swaps settle through the
//!    Letter Slot and the Sovereign Graph moves by exactly what settled.
//! 2. When the world moves and the tables do not, every swap reverts on a
//!    hash mismatch. Nothing moves in the graph. The crossing tax is sunk.
//! 3. A house that pays the oracle settles again. Its neighbours, who did
//!    not, keep reverting: truth is local, and so is its repair.
//! 4. A liquidity payload with no allocation never reaches a gate. The
//!    courier drops it.
//! 5. The Letter Slot keeps the record: `Settled` and `Reverted`, envelope
//!    by envelope.
//! 6. The Lock phase binds and reserves (doc 04 §3): a lock that is not the
//!    verified price reverts (ledger #4), and two swaps one purse cannot
//!    both cover do not both pass the gate (ledger #11).

use context_engine::prelude::*;
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

const HIRE_WEIGHT: f64 = 2.0;
/// Same-parent crossing: 1.25× on a weight of 2.0 → 0.5 cr of tax.
const HIRE_TAX: f64 = 0.5;

fn cfg(seed: u64) -> EngineConfig {
    EngineConfig { seed, cost_visible: true, ..Default::default() }
}

fn houses(e: &Engine) -> Vec<NodeId> {
    e.nodes.values().filter(|n| n.scale_level == Stage::House).map(|n| n.id).collect()
}

fn balances(e: &Engine) -> BTreeMap<NodeId, f64> {
    e.graph.balances().clone()
}

fn compute_of(e: &Engine, id: NodeId) -> f64 {
    e.node(id).unwrap().purse.compute
}

fn cached_price(e: &Engine, id: NodeId) -> Option<f64> {
    e.node(id).unwrap().oak_table.get("price/courier").and_then(|s| s.parse().ok())
}

/// One block, and everything it emitted.
fn step(e: &mut Engine) -> (TickReport, Vec<EngineEvent>) {
    let r = block_on(e.tick());
    (r, e.drain_events())
}

fn settled(events: &[EngineEvent]) -> Vec<(NodeId, NodeId, f64)> {
    events.iter().filter_map(|ev| match ev { EngineEvent::Settled { from, to, amount, .. } => Some((*from, *to, *amount)), _ => None }).collect()
}

fn rejected(events: &[EngineEvent]) -> Vec<(EnvelopeId, Stage, String, f64)> {
    events.iter().filter_map(|ev| match ev { EngineEvent::Rejected { envelope, gate, reason, sunk_compute, .. } => Some((*envelope, *gate, reason.clone(), *sunk_compute)), _ => None }).collect()
}

fn done(ctx: DraftContext) -> DraftFuture {
    Box::pin(async move { ctx })
}

// ───────────────────────── the real slot, observable ─────────────────────

/// The engine's own `Stage2LetterSlot`, behind a shared handle so a test can
/// read its `history` after the engine has boxed it as a trait object. The
/// engine sees only the trait; the verdicts are the real slot's verdicts.
/// Both hooks are forwarded: the engine calls `verify_batch`, and the
/// slot's per-batch lock map (ledger #11) lives there, not in `verify`.
struct SharedSlot(Arc<Mutex<Stage2LetterSlot>>);

impl VerificationStrategy for SharedSlot {
    fn stage(&self) -> Stage {
        Stage::Street
    }
    fn verify(&mut self, env: &ProposalEnvelope, view: &BoundaryView<'_>) -> Verdict {
        self.0.lock().unwrap().verify(env, view)
    }
    fn verify_batch(&mut self, envs: &[ProposalEnvelope], view: &BoundaryView<'_>) -> Vec<Verdict> {
        self.0.lock().unwrap().verify_batch(envs, view)
    }
    fn describe(&self) -> String {
        self.0.lock().unwrap().describe()
    }
}

fn install_slot(e: &mut Engine) -> Arc<Mutex<Stage2LetterSlot>> {
    let slot = Arc::new(Mutex::new(Stage2LetterSlot::default()));
    e.set_strategy(Stage::Street, Box::new(SharedSlot(slot.clone())));
    slot
}

// ───────────────────────────── test seats ────────────────────────────────

/// A seat that only hires. It reads the courier price from its *own* table
/// and asks the first neighbour it knows for the service at that price. No
/// inference burn, no dispatch: every credit that leaves the purse is the
/// swap's, so the accounting can be exact.
struct Hirer;

impl Agent for Hirer {
    fn seat(&self) -> &str {
        "Hirer"
    }
    fn tier(&self) -> ModelTier {
        ModelTier::FastQuantized
    }
    fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
        let Some(&peer) = ctx.known_peers().first() else { return done(ctx) };
        let believed = ctx.oak().get_f64("price/courier").unwrap_or(STALE_PRICE);
        ctx.think("Hirer", format!("My table says the courier costs {believed:.2}. Hiring next door at that price."));
        ctx.propose(ProposalDraft {
            target: peer,
            payload: Payload::HireService { service: "courier".into(), believed_price: believed, believed_price_hash: SovereignGraph::hash_price("courier", believed) },
            requested_liquidity: believed,
            compute_weight: HIRE_WEIGHT,
        });
        done(ctx)
    }
}

/// A seat that pays the oracle, unconditionally. The smallest helper that
/// forces a StateSync without touching the node's epistemics from outside.
struct PayOracle;

impl Agent for PayOracle {
    fn seat(&self) -> &str {
        "PayOracle"
    }
    fn tier(&self) -> ModelTier {
        ModelTier::FastQuantized
    }
    fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
        ctx.propose(ProposalDraft { target: ctx.node_id(), payload: Payload::StateSync, requested_liquidity: 0.0, compute_weight: ORACLE_COST });
        done(ctx)
    }
}

/// A seat that asks for the courier and allocates nothing.
struct Freeloader;

impl Agent for Freeloader {
    fn seat(&self) -> &str {
        "Freeloader"
    }
    fn tier(&self) -> ModelTier {
        ModelTier::FastQuantized
    }
    fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
        let Some(&peer) = ctx.known_peers().first() else { return done(ctx) };
        ctx.propose(ProposalDraft {
            target: peer,
            payload: Payload::HireService { service: "courier".into(), believed_price: STALE_PRICE, believed_price_hash: SovereignGraph::hash_price("courier", STALE_PRICE) },
            requested_liquidity: 0.0,
            compute_weight: HIRE_WEIGHT,
        });
        done(ctx)
    }
}

/// A street where every house is staffed by one seat only.
fn street_of<A: Agent + 'static>(seed: u64, houses_n: usize, make: fn() -> A) -> Engine {
    let mut e = street(cfg(seed), houses_n, 500.0, 1);
    for h in houses(&e) {
        e.replace_staff(h, vec![Arc::new(make())]);
    }
    e
}

// ═══════════════════════════ (1) swaps settle ════════════════════════════

/// With the camera at the street no human is asked. Each house hires a
/// neighbour's courier; the Letter Slot verifies the hash against the truth;
/// the graph moves by exactly the sum of what settled, and by nothing else.
#[test]
fn swaps_settle_through_the_letter_slot_and_move_the_graph_exactly() {
    let mut e = street(cfg(31), 3, 1500.0, 12);
    let slot = install_slot(&mut e);
    assert_eq!(e.config.active_scale, Stage::Street);
    for h in houses(&e) {
        assert_eq!(e.effective_gate(e.node(h).unwrap()), Stage::Street, "a house's Door becomes the street's Letter Slot under this camera");
    }
    let before = balances(&e);
    let (r, events) = step(&mut e);

    let swaps = settled(&events);
    assert_eq!(swaps.len(), 3, "every house hired a courier this tick");
    assert!(events.iter().all(|ev| !matches!(ev, EngineEvent::AwaitingHumanSignature { .. })), "nobody waited for a hand on the latch");
    assert!((r.settled_liquidity - 30.0).abs() < 1e-9, "3 swaps × the true price of 10");

    // The graph moved by exactly the settled amounts.
    let mut expected = before.clone();
    for (from, to, amount) in &swaps {
        assert!((amount - e.graph.service_prices["courier"]).abs() < 1e-9, "a settled swap pays the true price");
        *expected.get_mut(from).unwrap() -= amount;
        *expected.entry(*to).or_insert(0.0) += amount;
    }
    let after = balances(&e);
    for (id, want) in &expected {
        assert!((after[id] - want).abs() < 1e-9, "{id}: truth {} vs expected {want}", after[id]);
    }
    assert!((before.values().sum::<f64>() - after.values().sum::<f64>()).abs() < 1e-9, "liquidity is conserved: a swap moves it, it never mints it");
    for h in houses(&e) {
        assert!((e.node(h).unwrap().purse.liquidity - e.graph.liquidity_of(h)).abs() < 1e-9, "after a settle the purse's belief equals the truth");
    }
    assert_eq!(e.graph.contracts.iter().filter(|c| c.kind == "hire_service").count(), 3);

    let slot = slot.lock().unwrap();
    assert_eq!((slot.swaps, slot.reverts), (3, 0));
    assert!(slot.history.iter().all(|d| d.phase == DvpPhase::Settled && d.expected_hash == d.actual_hash && (d.locked_liquidity - 10.0).abs() < 1e-9));
}

// ══════════════════════════ (2) drift reverts ════════════════════════════

/// The world moves; the tables do not. Every swap drafted on the stale
/// belief reverts with a hash mismatch, no liquidity moves, and the only
/// cost is the crossing tax, sunk. Measured with a one-seat house so the
/// purse moves by the tax and nothing else.
#[test]
fn a_moved_truth_reverts_every_stale_swap_and_sinks_only_the_tax() {
    let mut e = street_of(32, 3, || Hirer);
    let slot = install_slot(&mut e);
    let hs = houses(&e);

    let (r, events) = step(&mut e);
    assert_eq!((r.approved, r.rejected), (3, 0), "sanity: with the tables true, everything settles");
    assert_eq!(settled(&events).len(), 3);

    move_truth(&mut e, "courier", MOVED_PRICE);
    for h in &hs {
        assert_eq!(cached_price(&e, *h), Some(STALE_PRICE), "no table heard the news");
    }
    let frozen = balances(&e);
    let settled_before = e.graph.total_settled;

    for tick in 2..=6 {
        let compute_before: Vec<f64> = hs.iter().map(|h| compute_of(&e, *h)).collect();
        let (r, events) = step(&mut e);

        assert_eq!(r.tick, tick);
        assert_eq!((r.approved, r.rejected, r.slashed), (0, 3, 0), "tick {tick}");
        assert_eq!(r.settled_liquidity, 0.0);
        assert!(settled(&events).is_empty(), "no liquidity moves on a stale belief");

        let rej = rejected(&events);
        assert_eq!(rej.len(), 3);
        for (_, gate, reason, sunk) in &rej {
            assert_eq!(*gate, Stage::Street);
            assert!(reason.contains("hash mismatch"), "tick {tick}: {reason}");
            assert!((sunk - HIRE_TAX).abs() < 1e-9, "the sunk cost is the crossing tax, {sunk}");
        }
        for (i, h) in hs.iter().enumerate() {
            let paid = compute_before[i] - compute_of(&e, *h);
            assert!((paid - HIRE_TAX).abs() < 1e-9, "tick {tick}: house paid {paid}, expected exactly the tax; the send cost of {HIRE_WEIGHT} is not charged on a revert");
        }
        assert_eq!(balances(&e), frozen, "tick {tick}: the graph did not move");
        assert_eq!(e.graph.total_settled, settled_before);
    }

    let slot = slot.lock().unwrap();
    assert_eq!((slot.swaps, slot.reverts), (3, 15));
    let stale = SovereignGraph::hash_price("courier", STALE_PRICE);
    let truth = SovereignGraph::hash_price("courier", MOVED_PRICE);
    for d in slot.history.iter().skip(3) {
        assert_eq!(d.phase, DvpPhase::Reverted);
        assert_eq!((d.expected_hash, d.actual_hash), (stale, truth));
    }
}

/// The same story with the real staff. The Scribble prices the courier off
/// the table, the Porter commits to it, the Letter Slot says no, and it
/// keeps saying no until the Scout's own rule (five uncalibrated handovers)
/// sends it to the oracle. Then, and only then, the swaps settle again at
/// the new price.
#[test]
fn the_default_staff_reverts_under_drift_until_the_scout_pays_the_oracle() {
    let mut e = street(cfg(33), 3, 1500.0, 12);
    let hs = houses(&e);
    let (_, events) = step(&mut e);
    assert_eq!(settled(&events).len(), 3);

    move_truth(&mut e, "courier", MOVED_PRICE);
    let frozen = balances(&e);

    let mut synced_at = None;
    for tick in 2..=8 {
        let (r, events) = step(&mut e);
        let rej = rejected(&events);
        assert_eq!(rej.len(), 3, "tick {tick}: three stale swaps, three reverts");
        assert!(rej.iter().all(|(_, _, reason, _)| reason.contains("hash mismatch")));
        assert!(settled(&events).is_empty());
        assert_eq!(balances(&e), frozen);
        assert!(!r.rolled_back, "three reverts against three deliveries is not a systemic failure");
        if r.synced > 0 {
            assert_eq!(r.synced, 3, "the houses are in lockstep: all ask the oracle the same tick");
            synced_at = Some(tick);
            break;
        }
    }
    let synced_at = synced_at.expect("the Scout asked the oracle within a few ticks");
    assert!(synced_at <= 5, "generation 5 is reached on the third draft; the sync commits on the fourth");
    for h in &hs {
        let n = e.node(*h).unwrap();
        assert_eq!(cached_price(&e, *h), Some(MOVED_PRICE), "the oracle copied the truth onto the table");
        assert_eq!(n.epistemics.confidence, 1.0);
        assert_eq!(n.epistemics.calibrations, 1);
    }

    let (r, events) = step(&mut e);
    let swaps = settled(&events);
    assert_eq!(swaps.len(), 3, "the tick after the oracle, everything settles again");
    assert!(swaps.iter().all(|(_, _, a)| (a - MOVED_PRICE).abs() < 1e-9), "at the new price");
    assert!((r.settled_liquidity - 36.0).abs() < 1e-9);
    assert!(rejected(&events).is_empty());
}

// ═════════════════════ (3) paying the oracle repairs ═════════════════════

/// Force one house to the oracle by seating a seat that pays it. That
/// house's next swap settles at the new price. Its neighbours, who did not
/// pay, keep reverting. Truth is local; so is its repair.
#[test]
fn a_house_that_pays_the_oracle_settles_again_while_its_neighbours_still_revert() {
    let mut e = street_of(34, 3, || Hirer);
    let hs = houses(&e);
    let (a, b, c) = (hs[0], hs[1], hs[2]);
    step(&mut e);
    move_truth(&mut e, "courier", MOVED_PRICE);
    let (r, _) = step(&mut e);
    assert_eq!(r.rejected, 3);

    // The oracle, forced.
    e.replace_staff(a, vec![Arc::new(PayOracle), Arc::new(Hirer)]);
    let compute_before = compute_of(&e, a);
    let (r, events) = step(&mut e);
    assert_eq!(r.synced, 1);
    assert!(events.iter().any(|ev| matches!(ev, EngineEvent::StateSync { node, cost, .. } if *node == a && *cost == ORACLE_COST)));
    assert_eq!(r.rejected, 3, "the swap drafted in the same block as the sync still carried the stale snapshot");
    assert!((compute_before - compute_of(&e, a) - (ORACLE_COST + HIRE_TAX)).abs() < 1e-9, "the oracle costs compute, not liquidity");
    assert_eq!(cached_price(&e, a), Some(MOVED_PRICE));
    assert_eq!(cached_price(&e, b), Some(STALE_PRICE));
    assert_eq!(cached_price(&e, c), Some(STALE_PRICE));
    e.replace_staff(a, vec![Arc::new(Hirer)]);

    let before = balances(&e);
    let (r, events) = step(&mut e);
    let swaps = settled(&events);
    assert_eq!((r.approved, r.rejected), (1, 2));
    assert_eq!(swaps.len(), 1);
    let (from, to, amount) = swaps[0];
    assert_eq!(from, a);
    assert!((amount - MOVED_PRICE).abs() < 1e-9);
    let after = balances(&e);
    assert!((before[&a] - after[&a] - MOVED_PRICE).abs() < 1e-9);
    assert!((after[&to] - before[&to] - MOVED_PRICE).abs() < 1e-9);
    for id in after.keys().filter(|id| **id != a && **id != to) {
        assert_eq!(after[id], before[id], "a bystander's balance did not move");
    }
    let rej = rejected(&events);
    assert_eq!(rej.len(), 2);
    assert!(rej.iter().all(|(_, _, reason, _)| reason.contains("hash mismatch")));
}

/// The other way to force it: mark one house overdue (generation ≥ 5) and
/// the real Scout asks the oracle on its own. One tick later that house
/// settles; the other two, at generation 2, still revert.
#[test]
fn an_overdue_house_asks_the_oracle_itself_and_settles_next_tick() {
    let mut e = street(cfg(35), 3, 1500.0, 12);
    let hs = houses(&e);
    let a = hs[0];
    step(&mut e);
    move_truth(&mut e, "courier", MOVED_PRICE);

    e.node_mut(a).unwrap().epistemics.generation = MAX_UNCALIBRATED_HANDOVERS;
    let (r, events) = step(&mut e);
    assert_eq!(r.synced, 1);
    assert!(events.iter().any(|ev| matches!(ev, EngineEvent::StateSync { node, .. } if *node == a)));
    assert!(events.iter().any(|ev| matches!(ev, EngineEvent::Thought { node, seat, text, .. } if *node == a && seat == "Scout" && text.contains("Asking the oracle"))));
    assert_eq!(rejected(&events).len(), 3);

    let (r, events) = step(&mut e);
    let swaps = settled(&events);
    assert_eq!((r.approved - r.synced, r.rejected), (4, 2), "one swap and three deliveries approved; two stale swaps reverted");
    assert_eq!(swaps.len(), 1);
    assert_eq!(swaps[0].0, a);
    assert!((swaps[0].2 - MOVED_PRICE).abs() < 1e-9);
    for h in &hs[1..] {
        assert_eq!(cached_price(&e, *h), Some(STALE_PRICE));
    }
}

// ═══════════════════════════ (4) the courier rule ════════════════════════

/// A liquidity payload with zero allocation is dropped by the courier in the
/// Collect phase. It is never minted into the mempool, never reaches the
/// Letter Slot, and never costs the send fee.
#[test]
fn the_courier_drops_a_liquidity_payload_with_zero_allocation_before_verification() {
    let mut e = street(cfg(36), 2, 500.0, 1);
    let slot = install_slot(&mut e);
    let hs = houses(&e);
    let (a, b) = (hs[0], hs[1]);
    e.replace_staff(a, vec![Arc::new(Freeloader)]);
    e.replace_staff(b, vec![]);
    let before = balances(&e);
    let compute_before = compute_of(&e, a);

    let (r, events) = step(&mut e);
    assert_eq!(r.drafted, 1);
    assert_eq!(r.dropped_by_courier, 1);
    assert_eq!(r.envelopes_minted, 0);
    assert_eq!((r.approved, r.rejected, r.held), (0, 0, 0), "nothing reached a gate");
    assert!(events.iter().any(|ev| matches!(ev, EngineEvent::DroppedByCourier { from, to, reason, .. } if *from == a && *to == b && reason.contains("courier rule"))));
    assert!(events.iter().all(|ev| !matches!(ev, EngineEvent::Proposed { .. } | EngineEvent::Approved { .. } | EngineEvent::Rejected { .. } | EngineEvent::Settled { .. })));
    assert_eq!(e.mempool.dropped_total, 1);
    assert_eq!(e.mempool.accepted_total, 0);
    assert_eq!(balances(&e), before);
    assert!(compute_of(&e, a) > compute_before - HIRE_WEIGHT, "the send fee was never charged: the envelope never reached commit");

    let slot = slot.lock().unwrap();
    assert_eq!((slot.swaps, slot.reverts), (0, 0));
    assert!(slot.history.is_empty(), "the Letter Slot never saw it");
}

// ═══════════════════════════ (5) the record ══════════════════════════════

/// The Letter Slot's history is the 2-phase-commit ledger: one record per
/// swap, `Settled` when the believed hash met the truth, `Reverted` when it
/// did not, each bound to its envelope and its locked amounts.
#[test]
fn the_letter_slot_history_records_settled_and_reverted_phases() {
    let mut e = street_of(37, 2, || Hirer);
    let slot = install_slot(&mut e);

    let (_, ev1) = step(&mut e);
    move_truth(&mut e, "courier", MOVED_PRICE);
    let (_, ev2) = step(&mut e);

    let approved: Vec<EnvelopeId> = ev1.iter().filter_map(|ev| match ev { EngineEvent::Approved { envelope, .. } => Some(*envelope), _ => None }).collect();
    let reverted: Vec<EnvelopeId> = rejected(&ev2).into_iter().map(|(id, ..)| id).collect();
    assert_eq!((approved.len(), reverted.len()), (2, 2));

    let slot = slot.lock().unwrap();
    assert_eq!(slot.describe(), "The Letter Slot (atomic DvP): 2 settled, 2 reverted");
    assert_eq!(slot.history.len(), 4);
    let stale = SovereignGraph::hash_price("courier", STALE_PRICE);
    let truth = SovereignGraph::hash_price("courier", MOVED_PRICE);
    for (i, d) in slot.history.iter().enumerate() {
        assert!((d.locked_liquidity - STALE_PRICE).abs() < 1e-9);
        assert!((d.locked_compute - HIRE_WEIGHT).abs() < 1e-9);
        if i < 2 {
            assert_eq!(d.phase, DvpPhase::Settled);
            assert!(approved.contains(&d.envelope));
            assert_eq!((d.expected_hash, d.actual_hash), (stale, stale));
        } else {
            assert_eq!(d.phase, DvpPhase::Reverted);
            assert!(reverted.contains(&d.envelope));
            assert_eq!((d.expected_hash, d.actual_hash), (stale, truth));
        }
    }
    // The phases the engine never records: it enters the ledger at Verify.
    assert!(slot.history.iter().all(|d| !matches!(d.phase, DvpPhase::Lock | DvpPhase::Transfer | DvpPhase::Verify)));
}

// ═══════════════════════════ determinism ═════════════════════════════════

/// Drift does not break replay: the same seed and the same moment of
/// truth-moving produce the same roots, reports and reverts.
#[test]
fn replay_under_drift_is_exact() {
    let mut a = street_under_drift(cfg(38), 4, 1500.0, 10, MOVED_PRICE);
    let mut b = street_under_drift(cfg(38), 4, 1500.0, 10, MOVED_PRICE);
    for _ in 0..10 {
        let (ra, ea) = step(&mut a);
        let (rb, eb) = step(&mut b);
        assert_eq!(ra, rb);
        assert_eq!(ea, eb);
    }
    assert!(a.reports.iter().map(|r| r.rejected).sum::<usize>() > 0, "the drift street did revert");
    assert!(a.reports.iter().map(|r| r.synced).sum::<usize>() > 0, "and did pay the oracle");
}

// ═══════════════════ the court watches the street too ════════════════════

/// Five stale houses, five reverts, zero deliveries: the Stage 4 circuit
/// breaker reads a 100 % rejection rate as systemic hallucination, rolls
/// the graph back one tick and slashes a quarter of every offender's
/// reserves, with the camera still at the street. Recorded here because
/// it changes what "no liquidity moves" means on a wide stale street (see
/// the lane report: the reverts already sank compute; the slash is on top).
#[test]
fn a_street_wide_stale_price_trips_the_high_court() {
    let mut e = street_of(39, 5, || Hirer);
    let (r, _) = step(&mut e);
    assert_eq!(r.approved, 5);
    let end_of_tick_1 = balances(&e);
    move_truth(&mut e, "courier", MOVED_PRICE);

    let (r, events) = step(&mut e);
    assert_eq!(r.rejected, 5);
    assert!(r.rolled_back, "5 of 5 rejected clears the court's min_sample and threshold");
    assert!(events.iter().any(|ev| matches!(ev, EngineEvent::RolledBack { to_tick: 1, slashed: 5, .. })));
    assert_eq!(e.court.rollbacks, 1);
    for h in houses(&e) {
        assert!((e.graph.liquidity_of(h) - end_of_tick_1[&h] * 0.75).abs() < 1e-9, "a quarter of the reserves seized for a stale table");
        assert!(e.court.injunctions.contains(&h));
    }
}

// ══════════════ the Scribble's hallucination path, characterised ═════════

/// Finding, not a law: with the default staff the Scribble's hallucination
/// branch (`is_hallucinating() && chance(fog)`) is dormant. Structurally,
/// the Scout syncs at generation ≥ 5, so the deepest generation the Scribble
/// ever drafts at on a street is 7, and Φ after 7 handovers through this
/// staff is far above the 0.75 threshold. Empirically, twelve seeds and 30
/// ticks of street produce no hallucinated price and no revert while the
/// truth stands still. The lane report proposes the smallest change.
#[test]
fn scribble_hallucination_path_is_dormant_with_the_default_staff() {
    // Structural: Scribble (balanced, rigor 0.90) and Inspector (frontier, 0.98) alternate.
    let mut phi = 1.0;
    for gen in 1..=7 {
        phi = if gen % 2 == 1 { handover(phi, ModelTier::BalancedStaff, 0.90) } else { handover(phi, ModelTier::FrontierDeep, 0.98) };
    }
    assert!(phi > HALLUCINATION_THRESHOLD + 0.10, "Φ after seven handovers is {phi:.4}; the 0.75 cliff is never reached before the oracle");

    // Empirical: no hallucinated price, no mismatch, across seeds.
    for seed in 1..=12u64 {
        let mut e = street(cfg(seed), 3, 3000.0, 30);
        let mut min_phi: f64 = 1.0;
        for _ in 0..30 {
            let (_, events) = step(&mut e);
            for ev in &events {
                match ev {
                    EngineEvent::Thought { seat, text, .. } if seat == "Scribble" => assert!(!text.starts_with("I'm fairly sure the courier costs"), "seed {seed}: {text}"),
                    EngineEvent::Rejected { reason, .. } => assert!(!reason.contains("hash mismatch"), "seed {seed}: {reason}"),
                    _ => {}
                }
            }
            for h in houses(&e) {
                min_phi = min_phi.min(e.node(h).unwrap().epistemics.confidence);
            }
        }
        assert!(min_phi > HALLUCINATION_THRESHOLD, "seed {seed}: Φ never fell below the threshold (min {min_phi:.4})");
    }
}

// ═══════════════ doc 04 §3, Lock: what the engine does not yet do ════════

/// A seat that lies to the slot: it presents the hash of the true price but
/// asks to lock (and pay) a tenth of it.
struct Cheat;

impl Agent for Cheat {
    fn seat(&self) -> &str {
        "Cheat"
    }
    fn tier(&self) -> ModelTier {
        ModelTier::FastQuantized
    }
    fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
        let Some(&peer) = ctx.known_peers().first() else { return done(ctx) };
        ctx.propose(ProposalDraft {
            target: peer,
            payload: Payload::HireService { service: "courier".into(), believed_price: 1.0, believed_price_hash: SovereignGraph::hash_price("courier", STALE_PRICE) },
            requested_liquidity: 1.0,
            compute_weight: HIRE_WEIGHT,
        });
        done(ctx)
    }
}

/// Doc 05 Stage 2: "Both verify the exact payload size and signature." The
/// lock amount must be the amount the verified hash commits to: a 1.0 lock
/// under a 10.0 hash is a revert, not a settle for 1.0. Regression test for
/// ledger #4 (`dvp_binding()`).
#[test]
fn dvp_binds_the_lock_amount_to_the_verified_price() {
    let mut e = street_of(40, 2, || Cheat);
    let slot = install_slot(&mut e);
    let before = balances(&e);
    let (r, events) = step(&mut e);
    assert_eq!((r.approved, r.rejected), (0, 2), "a lock that does not match the verified price is a revert");
    assert!(settled(&events).is_empty());
    assert_eq!(balances(&e), before);
    assert_eq!(slot.lock().unwrap().reverts, 2);
}

/// A seat that hires twice in one draft.
struct DoubleHirer;

impl Agent for DoubleHirer {
    fn seat(&self) -> &str {
        "DoubleHirer"
    }
    fn tier(&self) -> ModelTier {
        ModelTier::FastQuantized
    }
    fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
        let Some(&peer) = ctx.known_peers().first() else { return done(ctx) };
        for _ in 0..2 {
            ctx.propose(ProposalDraft {
                target: peer,
                payload: Payload::HireService { service: "courier".into(), believed_price: STALE_PRICE, believed_price_hash: SovereignGraph::hash_price("courier", STALE_PRICE) },
                requested_liquidity: STALE_PRICE,
                compute_weight: HIRE_WEIGHT,
            });
        }
        done(ctx)
    }
}

/// Doc 04 §3 step 1: "Sender locks Liquidity." A lock reserves. Two swaps
/// of 10 from a purse of 15 must produce one settle and one revert *at the
/// gate*, not a second `Settled` that later fails in Commit as "stale
/// belief at commit". Regression test for ledger #11 (the per-batch lock
/// map in `Stage2LetterSlot::verify_batch`).
#[test]
fn dvp_lock_reserves_liquidity_so_a_second_swap_cannot_pass_the_gate() {
    let mut e = street(cfg(41), 2, 500.0, 1);
    let slot = install_slot(&mut e);
    let hs = houses(&e);
    let (a, b) = (hs[0], hs[1]);
    e.replace_staff(a, vec![Arc::new(DoubleHirer)]);
    e.replace_staff(b, vec![]);
    e.graph.set_liquidity(a, 15.0);
    e.node_mut(a).unwrap().purse.liquidity = 15.0;

    let (r, events) = step(&mut e);
    assert_eq!((r.approved, r.rejected), (1, 1), "the second lock fails at the gate, not in commit");
    assert!(rejected(&events).iter().all(|(_, _, reason, _)| reason.contains("lock failed")));
    assert_eq!(settled(&events).len(), 1);
    let slot = slot.lock().unwrap();
    assert_eq!((slot.swaps, slot.reverts), (1, 1), "the ledger agrees with the graph");
    assert!((e.graph.liquidity_of(a) - 5.0).abs() < 1e-9);
}
