//! Stage 3, the Clearinghouse. A city of 2 streets × 3 houses, zoomed to the
//! city, so every envelope crosses the Municipal Clearinghouse. The houses
//! know addresses on the other street only, so every hire is a cross-parent
//! crossing; every dispatch to a house's own street is same-parent.
//!
//! ## Why commit settled gross before this lane (the empirical record)
//!
//! Probed on the unmodified engine (seed 3, two houses A and B on different
//! streets hiring each other's courier at 10, all other peers cleared):
//!
//! * rich (truth 200 each): gate approved both; commit ran two
//!   `graph.transfer`s of 10; `settled_liquidity` = 20 = gross. The `Netted`
//!   event said `gross: 20, net: 20` although the true net position of both
//!   houses was 0, because `tick.rs` computed `net` as the *approved gross*,
//!   not the netted position (`Stage3Clearinghouse.last_net` had it right,
//!   but the engine cannot read it through `dyn VerificationStrategy`).
//! * poor (truth 3 each): the gate approved both (net position 0 ≤ 3), then
//!   commit rejected both with "stale belief at commit: truth 3.0", because
//!   commit settled each envelope gross in order and neither truth covered
//!   10. The gate and the commit disagreed about what "backed" meant.
//!
//! The minimal change (reported as diffs in the lane report): `commit`
//! partitions off City-gate liquidity envelopes and settles them as one
//! multilateral batch through `SovereignGraph::settle_net` (net positions,
//! unwinding uncovered debtors until every net debit is backed), and the
//! `Netted` event's `net` is the sum of net debits over the approved set.

use context_engine::prelude::*;
use std::sync::{Arc, Mutex};

const STREETS: usize = 2;
const HOUSES: usize = 3;

fn cfg(seed: u64) -> EngineConfig {
    EngineConfig {
        seed,
        cost_visible: true,
        ..Default::default()
    }
}

fn small_city(seed: u64) -> Engine {
    city(cfg(seed), STREETS, HOUSES, 400.0, 3)
}

fn houses(e: &Engine) -> Vec<NodeId> {
    e.nodes
        .values()
        .filter(|n| n.scale_level == Stage::House)
        .map(|n| n.id)
        .collect()
}

fn street_of(e: &Engine, h: NodeId) -> NodeId {
    e.node(h).unwrap().parent.unwrap()
}

/// Two houses on different streets that know only each other; every other
/// house forgets its peers and only dispatches to its own street.
fn mutual_pair(e: &mut Engine) -> (NodeId, NodeId) {
    let hs = houses(e);
    let a = hs[0];
    let b = *hs
        .iter()
        .find(|h| street_of(e, **h) != street_of(e, a))
        .unwrap();
    for h in &hs {
        e.node_mut(*h).unwrap().known_peers.clear();
    }
    e.node_mut(a).unwrap().known_peers = vec![b];
    e.node_mut(b).unwrap().known_peers = vec![a];
    (a, b)
}

fn netted_events(e: &Engine, tick: u64) -> Vec<(f64, f64, usize)> {
    e.events()
        .iter()
        .filter_map(|ev| match ev {
            EngineEvent::Netted {
                tick: t,
                clearinghouse,
                gross,
                net,
                envelopes,
            } if *t == tick => {
                assert_eq!(*clearinghouse, Stage::City);
                Some((*gross, *net, *envelopes))
            }
            _ => None,
        })
        .collect()
}

/// The Strategy Pattern used as a test probe: the real Clearinghouse behind
/// a recorder that keeps a copy of every envelope it was asked to verify, so
/// the tests can assert on `ProposalEnvelope` fields, not on events.
struct RecordingClearinghouse {
    inner: Stage3Clearinghouse,
    seen: Arc<Mutex<Vec<ProposalEnvelope>>>,
}

impl VerificationStrategy for RecordingClearinghouse {
    fn stage(&self) -> Stage {
        Stage::City
    }
    fn verify(&mut self, env: &ProposalEnvelope, view: &BoundaryView<'_>) -> Verdict {
        self.seen.lock().unwrap().push(env.clone());
        self.inner.verify(env, view)
    }
    fn verify_batch(&mut self, envs: &[ProposalEnvelope], view: &BoundaryView<'_>) -> Vec<Verdict> {
        self.seen.lock().unwrap().extend(envs.iter().cloned());
        self.inner.verify_batch(envs, view)
    }
    fn describe(&self) -> String {
        self.inner.describe()
    }
}

fn record_clearinghouse(e: &mut Engine) -> Arc<Mutex<Vec<ProposalEnvelope>>> {
    let seen = Arc::new(Mutex::new(Vec::new()));
    e.set_strategy(
        Stage::City,
        Box::new(RecordingClearinghouse {
            inner: Stage3Clearinghouse::default(),
            seen: seen.clone(),
        }),
    );
    seen
}

/// The shape of the world: one city, N streets, M houses each, staffed,
/// peers on other streets only, camera at the city, gate = Clearinghouse.
#[test]
fn the_city_is_built_as_specified() {
    let e = small_city(1);
    let cities: Vec<_> = e
        .nodes
        .values()
        .filter(|n| n.scale_level == Stage::City)
        .collect();
    assert_eq!(cities.len(), 1);
    assert_eq!(cities[0].parent, None);
    assert_eq!(cities[0].children.len(), STREETS);
    let streets: Vec<_> = e
        .nodes
        .values()
        .filter(|n| n.scale_level == Stage::Street)
        .collect();
    assert_eq!(streets.len(), STREETS);
    assert!(streets
        .iter()
        .all(|s| s.parent == Some(cities[0].id) && s.children.len() == HOUSES));
    let hs = houses(&e);
    assert_eq!(hs.len(), STREETS * HOUSES);
    for h in &hs {
        let n = e.node(*h).unwrap();
        assert_eq!(
            n.known_peers.len(),
            (STREETS - 1) * HOUSES,
            "peers span the other streets only"
        );
        assert!(n
            .known_peers
            .iter()
            .all(|p| street_of(&e, *p) != n.parent.unwrap()));
        assert!(n
            .known_peers
            .iter()
            .all(|p| e.crossing(*h, *p) == Crossing::CrossParent));
        assert_eq!(e.crossing(*h, n.parent.unwrap()), Crossing::SameParent);
        assert_eq!(
            e.effective_gate(n),
            Stage::City,
            "the camera at the city makes every door a clearinghouse"
        );
        assert_eq!(n.tasks.len(), 3);
        assert_eq!(
            n.boundary_rules.slash_rate, 0.0,
            "a house's own policy does not slash; the city's gate does"
        );
    }
    assert_eq!(e.config.active_scale, Stage::City);
    assert!(e
        .strategy(Stage::City)
        .unwrap()
        .describe()
        .starts_with("The Clearinghouse"));
}

/// (1) One `Netted` event per tick at the City clearinghouse, gross ≥ net,
/// counting every envelope the gate saw that tick.
#[test]
fn one_netting_run_per_tick_with_gross_at_least_net() {
    let mut e = small_city(2);
    let mut ticks_with_traffic = 0;
    for _ in 0..12 {
        let r = block_on(e.tick());
        let runs = netted_events(&e, r.tick);
        if r.envelopes_minted == 0 {
            assert!(runs.is_empty(), "nothing to net, no run");
            continue;
        }
        ticks_with_traffic += 1;
        assert_eq!(
            runs.len(),
            1,
            "exactly one netting run per tick, tick {}",
            r.tick
        );
        let (gross, net, envelopes) = runs[0];
        assert!(
            gross >= net - 1e-9,
            "tick {}: gross {gross} < net {net}",
            r.tick
        );
        assert!(net >= 0.0);
        assert_eq!(
            envelopes, r.envelopes_minted,
            "the run covers every envelope minted this tick (nothing is held at a clearinghouse)"
        );
        assert_eq!(r.held, 0);
        // What the graph moved is what the run said would move (no unwind in a solvent city).
        assert!(
            (r.settled_liquidity - net).abs() < 1e-9,
            "tick {}: settled {} vs net {net}",
            r.tick,
            r.settled_liquidity
        );
    }
    assert!(ticks_with_traffic >= 3, "the houses had three tasks each");
    let desc = e.strategy(Stage::City).unwrap().describe();
    assert!(
        desc.contains(&format!("{ticks_with_traffic} runs")),
        "{desc}"
    );
}

/// (2) Netting works: two houses that hire each other settle the net
/// difference (zero), not the gross (twenty). Both contracts still exist.
#[test]
fn mutual_hires_settle_net_not_gross() {
    let mut e = small_city(3);
    let (a, b) = mutual_pair(&mut e);
    let truth_a = e.graph.liquidity_of(a);
    let truth_b = e.graph.liquidity_of(b);
    let r = block_on(e.tick());
    let runs = netted_events(&e, r.tick);
    assert_eq!(runs.len(), 1);
    let (gross, net, _) = runs[0];
    assert!(
        (gross - 2.0 * CITY_COURIER_PRICE).abs() < 1e-9,
        "two hires at {CITY_COURIER_PRICE}: gross {gross}"
    );
    assert!(
        net < gross,
        "netting cancelled opposing debts: net {net} < gross {gross}"
    );
    assert!(
        net.abs() < 1e-9,
        "A owes B what B owes A: nothing has to move"
    );
    assert!(
        r.settled_liquidity < gross,
        "settled {} < gross {gross}",
        r.settled_liquidity
    );
    assert!((r.settled_liquidity - net).abs() < 1e-9);
    assert_eq!(r.rejected, 0);
    // Truth did not move; the contracts were recorded at their gross value.
    assert_eq!(e.graph.liquidity_of(a), truth_a);
    assert_eq!(e.graph.liquidity_of(b), truth_b);
    let hires: Vec<_> = e
        .graph
        .contracts
        .iter()
        .filter(|c| c.kind == "hire_service")
        .collect();
    assert_eq!(hires.len(), 2);
    assert!(hires
        .iter()
        .all(|c| (c.amount - CITY_COURIER_PRICE).abs() < 1e-9));
    assert!(hires.iter().any(|c| c.initiator == a && c.target == b));
    assert!(hires.iter().any(|c| c.initiator == b && c.target == a));
    // Both houses' tables show the order and the service.
    assert!(e
        .node(a)
        .unwrap()
        .oak_table
        .entries()
        .any(|(k, _)| k.starts_with("services/")));
    assert!(e
        .node(a)
        .unwrap()
        .oak_table
        .entries()
        .any(|(k, _)| k.starts_with("orders/")));
    assert!(e.graph.total_settled.abs() < 1e-9);
}

/// (2, the design intent) "Massively reduces the total liquidity required to
/// operate the city": two houses with 3 in truth clear a 10-for-10 exchange
/// that gross settlement rejected at commit on the unmodified engine.
#[test]
fn netting_clears_what_gross_settlement_could_not() {
    let mut e = small_city(3);
    let (a, b) = mutual_pair(&mut e);
    for h in [a, b] {
        e.graph.set_liquidity(h, 3.0);
        e.node_mut(h).unwrap().purse.liquidity = 3.0;
    }
    let r = block_on(e.tick());
    assert_eq!(
        r.rejected, 0,
        "the gate approved on net position 0 ≤ 3, and commit agreed"
    );
    assert_eq!(r.slashed, 0);
    assert!(!e.events().iter().any(|ev| matches!(ev, EngineEvent::Rejected { reason, .. } if reason.contains("stale belief at commit"))));
    assert_eq!(
        e.graph
            .contracts
            .iter()
            .filter(|c| c.kind == "hire_service")
            .count(),
        2
    );
    assert_eq!(e.graph.liquidity_of(a), 3.0);
    assert_eq!(e.graph.liquidity_of(b), 3.0);
    assert!(r.settled_liquidity.abs() < 1e-9);
}

/// (3) A net debtor whose truth cannot back its position is slashed at
/// `slash_rate` 0.10 of the unbacked envelope and its truth balance drops.
///
/// Post-audit the Clearinghouse price-checks (`dvp_binding`) before it
/// nets, so the lane's hallucinated 500 would be rejected as a hash
/// mismatch and never enter the netting. To be unbacked a house must owe
/// more than its truth *at the true price*: A hires B at the true 10 with a
/// truth of 3, and B does not hire A back (a mutual pair nets to 0, which
/// any truth backs; see `netting_clears_what_gross_settlement_could_not`).
/// A's purse still believes it holds 200: the delusion is in the balance,
/// not in the price.
#[test]
fn unbacked_net_position_is_slashed_at_ten_percent() {
    let mut e = small_city(4);
    let (a, b) = mutual_pair(&mut e);
    e.node_mut(b).unwrap().known_peers.clear();
    let truth_before = 3.0;
    e.graph.set_liquidity(a, truth_before);
    assert_eq!(
        e.node(a).unwrap().purse.liquidity,
        CITY_HOUSE_LIQUIDITY,
        "A still believes it is rich"
    );
    let policy = BoundaryPolicy::for_stage(Stage::City);
    assert!(policy.slash_unbacked);
    assert_eq!(policy.slash_rate, 0.10);

    let r = block_on(e.tick());
    assert_eq!(r.slashed, 1, "exactly one slashing");
    let slashes: Vec<(NodeId, f64, String)> = e
        .events()
        .iter()
        .filter_map(|ev| match ev {
            EngineEvent::Slashed {
                node,
                amount,
                reason,
                ..
            } => Some((*node, *amount, reason.clone())),
            _ => None,
        })
        .collect();
    assert_eq!(slashes.len(), 1);
    let (who, amount, reason) = &slashes[0];
    assert_eq!(*who, a);
    assert!(
        (amount - CITY_COURIER_PRICE * 0.10).abs() < 1e-9,
        "slash = requested 10 × 0.10 = 1.0, got {amount}"
    );
    assert!(reason.contains("unbacked in netting"), "{reason}");
    assert!(
        reason.contains(&format!(
            "net position {CITY_COURIER_PRICE:.1} > truth {truth_before:.1}"
        )),
        "A owed 10, was owed nothing, had 3: {reason}"
    );
    let truth_after = e.graph.liquidity_of(a);
    assert!(
        truth_after < truth_before,
        "truth dropped: {truth_before} → {truth_after}"
    );
    // Seized 1.0 at the gate; nobody paid A, so that is the whole movement.
    assert!(
        (truth_after - (truth_before - amount)).abs() < 1e-9,
        "truth {truth_before} − slash {amount} = {truth_after}"
    );
    assert!((e.graph.total_slashed - amount).abs() < 1e-9);
    assert!(
        (e.node(a).unwrap().purse.liquidity - truth_after).abs() < 1e-9,
        "the belief was corrected to the truth"
    );
    assert_eq!(
        e.graph
            .contracts
            .iter()
            .filter(|c| c.initiator == a && c.kind == "hire_service")
            .count(),
        0,
        "the unbacked hire never became a contract"
    );
    // B hired nobody: gross is A's 10, and the approved set moves no liquidity.
    let (gross, net, _) = netted_events(&e, r.tick)[0];
    assert!((gross - CITY_COURIER_PRICE).abs() < 1e-9);
    assert!(net.abs() < 1e-9, "net over the approved set: nothing");
    assert!(r.settled_liquidity.abs() < 1e-9);
    assert_eq!(
        e.graph.liquidity_of(b),
        CITY_HOUSE_LIQUIDITY,
        "B paid nobody and was paid by nobody"
    );
    // Slashing is a rejection too: sunk cost, no refund.
    assert!(e.events().iter().any(|ev| matches!(ev, EngineEvent::Rejected { gate: Stage::City, reason, .. } if reason.contains("unbacked in netting"))));
    assert!(
        !r.rolled_back,
        "one liquidity verdict is below the court's min_sample of 5"
    );
}

/// (3, the lane's original scenario, post-audit) A hallucinated price is a
/// hash mismatch at the City gate, not an unbacked position: ledger #4 put
/// `dvp_binding` in front of the netting, so A's believed 500 is rejected
/// before it can enter the net positions and nobody is slashed. B's honest
/// hire of A is unaffected and clears.
#[test]
fn a_hallucinated_price_is_a_hash_mismatch_at_the_clearinghouse_not_a_slash() {
    let mut e = small_city(4);
    let (a, b) = mutual_pair(&mut e);
    let believed = 500.0;
    e.node_mut(a)
        .unwrap()
        .oak_table
        .put("price/courier", format!("{believed}"));
    let r = block_on(e.tick());
    assert_eq!(
        r.slashed, 0,
        "a hallucinated price is rejected, not slashed"
    );
    assert_eq!(r.rejected, 1, "A's hire alone is rejected");
    assert!(!e
        .events()
        .iter()
        .any(|ev| matches!(ev, EngineEvent::Slashed { .. })));
    assert!(e.graph.total_slashed.abs() < 1e-9);
    let rejections: Vec<String> = e
        .events()
        .iter()
        .filter_map(|ev| match ev {
            EngineEvent::Rejected { gate, reason, .. } => {
                assert_eq!(*gate, Stage::City);
                Some(reason.clone())
            }
            _ => None,
        })
        .collect();
    assert_eq!(rejections.len(), 1);
    assert!(rejections[0].contains("hash mismatch"), "{}", rejections[0]);
    assert!(
        rejections[0].contains(&format!("{believed:.2}")),
        "the reason names the claimed price: {}",
        rejections[0]
    );
    // A's hire never became a contract; B's honest hire of A did.
    assert_eq!(
        e.graph
            .contracts
            .iter()
            .filter(|c| c.initiator == a && c.kind == "hire_service")
            .count(),
        0,
        "the mismatched hire never became a contract"
    );
    assert_eq!(
        e.graph
            .contracts
            .iter()
            .filter(|c| c.initiator == b && c.target == a && c.kind == "hire_service")
            .count(),
        1
    );
    // The event's gross is what the batch asked for (510, the 500 included, as
    // for a slashed envelope); its net is over the approved set alone, and only
    // B's 10 was approved: B pays A.
    let (gross, net, envelopes) = netted_events(&e, r.tick)[0];
    assert!(
        (gross - (believed + CITY_COURIER_PRICE)).abs() < 1e-9,
        "gross is the asked-for total: {gross}"
    );
    assert!(
        (net - CITY_COURIER_PRICE).abs() < 1e-9,
        "the rejected 500 never entered the net positions: net {net}"
    );
    assert_eq!(
        envelopes, r.envelopes_minted,
        "the run still counts every envelope the gate saw"
    );
    assert!((r.settled_liquidity - CITY_COURIER_PRICE).abs() < 1e-9);
    assert_eq!(
        e.graph.liquidity_of(a),
        CITY_HOUSE_LIQUIDITY + CITY_COURIER_PRICE
    );
    assert_eq!(
        e.graph.liquidity_of(b),
        CITY_HOUSE_LIQUIDITY - CITY_COURIER_PRICE
    );
    assert!(!r.rolled_back, "a hash mismatch is not a liquidity failure");
}

/// (4) The coordination tax on the envelope itself: cross-street hires pay
/// ×1.40, same-street sends pay ×1.25, and the intra-node oracle pays nothing.
#[test]
fn cross_street_pays_1_40_and_same_street_pays_1_25() {
    let mut e = small_city(5);
    let seen = record_clearinghouse(&mut e);
    let tax = e.tax;
    let r = block_on(e.tick());
    let envs = seen.lock().unwrap().clone();
    assert_eq!(envs.len(), r.envelopes_minted);
    let hires: Vec<_> = envs
        .iter()
        .filter(|x| matches!(x.payload, Payload::HireService { .. }))
        .collect();
    let sends: Vec<_> = envs
        .iter()
        .filter(|x| matches!(x.payload, Payload::Dispatch { .. }))
        .collect();
    assert_eq!(
        hires.len(),
        STREETS * HOUSES,
        "every house hired a courier on the other street"
    );
    assert_eq!(
        sends.len(),
        STREETS * HOUSES,
        "every house sent its draft to its own street"
    );
    for x in &hires {
        assert_eq!(x.gate, Stage::City);
        assert_eq!(x.crossing, Crossing::CrossParent);
        assert_ne!(street_of(&e, x.initiator), street_of(&e, x.target));
        assert!(
            (x.tax_paid - x.compute_weight * 0.40).abs() < 1e-9,
            "×1.40: tax {} on weight {}",
            x.tax_paid,
            x.compute_weight
        );
        assert!((x.tax_paid - tax.tax_only(Crossing::CrossParent, x.compute_weight)).abs() < 1e-9);
    }
    for x in &sends {
        assert_eq!(x.crossing, Crossing::SameParent);
        assert_eq!(x.target, street_of(&e, x.initiator));
        assert!(
            (x.tax_paid - x.compute_weight * 0.25).abs() < 1e-9,
            "×1.25: tax {} on weight {}",
            x.tax_paid,
            x.compute_weight
        );
        // The send fee is 10 cr (what the kernel charged: 100 tokens), not the
        // battery's unused `spend_amount = 25`; a quarter of it is the same-street tax.
        assert_eq!(
            x.tax_paid, 2.5,
            "the send fee is 10 cr; a quarter of it is the same-street tax"
        );
    }
    let expected: f64 = envs.iter().map(|x| x.tax_paid).sum();
    assert!((r.tax_paid - expected).abs() < 1e-9);

    // A same-street hire, for contrast: point one house at its neighbour.
    let mut e2 = small_city(5);
    let seen2 = record_clearinghouse(&mut e2);
    let hs = houses(&e2);
    let a = hs[0];
    let neighbour = *hs
        .iter()
        .find(|h| **h != a && street_of(&e2, **h) == street_of(&e2, a))
        .unwrap();
    e2.node_mut(a).unwrap().known_peers = vec![neighbour];
    block_on(e2.tick());
    let mine: Vec<ProposalEnvelope> = seen2
        .lock()
        .unwrap()
        .iter()
        .filter(|x| x.initiator == a && matches!(x.payload, Payload::HireService { .. }))
        .cloned()
        .collect();
    assert_eq!(mine.len(), 1);
    assert_eq!(mine[0].crossing, Crossing::SameParent);
    assert!(
        (mine[0].tax_paid - mine[0].compute_weight * 0.25).abs() < 1e-9,
        "same-street hire pays ×1.25: {}",
        mine[0].tax_paid
    );
    assert!(
        mine[0].tax_paid < hires[0].tax_paid,
        "the clearinghouse route is the expensive one"
    );
}

/// (5) The city replays bit for bit: same seed, same roots, same reports,
/// same events, same state view, tick by tick.
#[test]
fn the_city_replays_bit_for_bit() {
    let mut a = small_city(11);
    let mut b = small_city(11);
    for _ in 0..14 {
        let ra = block_on(a.tick());
        let rb = block_on(b.tick());
        assert_eq!(ra.root, rb.root);
        assert_eq!(ra, rb);
        assert_eq!(a.drain_events(), b.drain_events());
    }
    assert_eq!(a.graph, b.graph);
    assert_eq!(a.state_json(), b.state_json());
    // And a different seed is a different city (the seed is doing the work).
    let mut c = small_city(12);
    let mut differs = false;
    for r in a.reports.clone() {
        let rc = block_on(c.tick());
        if rc.root != r.root {
            differs = true;
            break;
        }
    }
    assert!(differs);
}

/// Documentation, not a wish: the LOD rule ("discrete at level ≥ active − 1")
/// packs the houses when the camera is *moved* to the city, and a packed
/// house drafts nothing, so the Clearinghouse has nothing to net. The city
/// scenario therefore places the camera by configuration, as the street
/// scenario does. See the lane report's design notes.
#[test]
fn moving_the_camera_to_the_city_packs_the_houses_the_clearinghouse_needs() {
    let mut e = small_city(6);
    let r1 = block_on(e.tick());
    assert!(r1.drafted == STREETS * HOUSES && !netted_events(&e, 1).is_empty());
    e.set_active_scale(Stage::City);
    assert!(houses(&e)
        .iter()
        .all(|h| e.node(*h).unwrap().status == NodeStatus::Packed));
    let r2 = block_on(e.tick());
    assert_eq!(r2.drafted, 0);
    assert_eq!(r2.packed_groups, STREETS);
    assert!(
        netted_events(&e, 2).is_empty(),
        "nothing reaches the clearinghouse from a packed street"
    );
}
