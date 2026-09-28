//! Stage 4: Statutory Law and the High Court, as tests.
//!
//! Doc 05, Stage 4: "If a Stage 3 City clearinghouse fails (e.g. a massive
//! systemic hallucination causes a liquidity crisis), the Stage 4 boundary
//! acts as a circuit breaker. The High Court maintains a deeply archived
//! Snapshot of the State DAG. It can execute a hard rollback of the City to
//! a previous coherent state, slashing the reserves of the offending nodes."
//!
//! The worlds come from `scenarios::high_court`: a jurisdiction in which a
//! minority of nodes believe they are rich (their purse belief is set above
//! the truth) and, from an arming tick on, try to pay 10 000 each to the
//! same mark. Everything is seeded; nothing reads a clock.

use context_engine::prelude::*;
use std::sync::Arc;

fn cfg(seed: u64) -> EngineConfig {
    EngineConfig {
        seed,
        cost_visible: true,
        ..Default::default()
    }
}

const TRUTH: f64 = 200.0;
const DELUSION: f64 = 10_000.0;

/// Every `Slashed` event of one tick whose reason names the High Court.
fn court_slashes(e: &Engine, tick: u64) -> Vec<(NodeId, f64)> {
    e.events()
        .iter()
        .filter_map(|ev| match ev {
            EngineEvent::Slashed {
                tick: t,
                node,
                amount,
                reason,
            } if *t == tick && reason.contains("High Court") => Some((*node, *amount)),
            _ => None,
        })
        .collect()
}

fn rolled_back(e: &Engine, tick: u64) -> Option<(u64, String, usize)> {
    e.events().iter().find_map(|ev| match ev {
        EngineEvent::RolledBack {
            tick: t,
            to_tick,
            reason,
            slashed,
        } if *t == tick => Some((*to_tick, reason.clone(), *slashed)),
        _ => None,
    })
}

fn rejections(e: &Engine, tick: u64) -> Vec<(EnvelopeId, Stage, String)> {
    e.events()
        .iter()
        .filter_map(|ev| match ev {
            EngineEvent::Rejected {
                tick: t,
                envelope,
                gate,
                reason,
                ..
            } if *t == tick => Some((*envelope, *gate, reason.clone())),
            _ => None,
        })
        .collect()
}

fn settled_at(e: &Engine, tick: u64) -> usize {
    e.events().iter().filter(|ev| matches!(ev, EngineEvent::Settled { tick: t, .. } | EngineEvent::Delivered { tick: t, .. } if *t == tick)).count()
}

fn proposed_by(e: &Engine, tick: u64, node: NodeId) -> Vec<EnvelopeId> {
    e.events()
        .iter()
        .filter_map(|ev| match ev {
            EngineEvent::Proposed {
                tick: t,
                envelope,
                from,
                ..
            } if *t == tick && *from == node => Some(*envelope),
            _ => None,
        })
        .collect()
}

/// (1) The circuit breaker at the Letter Slot.
///
/// Tick 1 is calm: the two honest houses pay each other 5.0 and it settles,
/// so the tick-1 snapshot is a real, moved state. Tick 2: five forgers wake
/// up and ask for 10 000 each; the Letter Slot's lock fails for all five.
/// Seven envelopes verified, five rejected (71 %): the court rules.
#[test]
fn a_systemic_failure_trips_the_circuit_breaker() {
    let (mut e, w) = forged_street(cfg(41), 5, 2, 2, TRUTH, DELUSION);
    for f in &w.forgers {
        assert_eq!(e.graph.liquidity_of(*f), TRUTH, "the truth is modest");
        assert_eq!(
            e.node(*f).unwrap().purse.liquidity,
            DELUSION,
            "the belief is not"
        );
    }

    // ── tick 1: calm ──
    let r1 = block_on(e.tick());
    assert!(!r1.rolled_back);
    assert_eq!(r1.approved, 2, "two honest payments");
    assert_eq!(r1.rejected, 0);
    assert!((r1.settled_liquidity - 10.0).abs() < 1e-9);
    let root_1 = r1.root;
    let truth_1 = e.graph.clone(); // the previous coherent state, kept by the test
    assert_eq!(truth_1.root(), root_1);
    assert_eq!(
        e.graph.snapshots().last().map(|s| (s.tick, s.root)),
        Some((1, root_1))
    );

    // ── tick 2: the collapse ──
    let r2 = block_on(e.tick());
    assert_eq!(r2.envelopes_minted, 7, "5 forgeries + 2 honest payments");
    assert_eq!(r2.rejected, 5, "every forgery failed the lock");
    assert_eq!(r2.slashed, 0, "the Letter Slot rejects; it does not seize");
    assert!(r2.rejected as f64 / (r2.approved + r2.rejected + r2.held) as f64 > 0.5);
    assert!(r2.rolled_back, "the circuit breaker tripped");

    // The order: rolled back to the previous tick, five slashed.
    let (to_tick, reason, slashed) = rolled_back(&e, 2).expect("a RolledBack event");
    assert_eq!(to_tick, 1);
    assert_eq!(slashed, 5);
    // The court's sample is liquidity verdicts at algorithmic gates only
    // (ledger #6): 5 failed locks + 2 honest payments = 7, of which 5 failed = 71 %.
    assert!(
        reason.contains("71%") && reason.contains("7 liquidity verdicts"),
        "reason: {reason}"
    );
    assert_eq!(e.court.rollbacks, 1);

    // The lock failures are ordinary rejections, one per forger.
    let rej = rejections(&e, 2);
    assert_eq!(rej.len(), 5);
    assert!(rej
        .iter()
        .all(|(_, gate, reason)| *gate == Stage::Street && reason.starts_with("lock failed")));

    // Offenders lost exactly 25 % of their *truth* liquidity, once, to the court.
    let slashes = court_slashes(&e, 2);
    assert_eq!(
        slashes.len(),
        5,
        "one High Court slash per offender: {slashes:?}"
    );
    for f in &w.forgers {
        let before = truth_1.liquidity_of(*f);
        let (_, amount) = slashes
            .iter()
            .find(|(n, _)| n == f)
            .expect("every forger was slashed");
        assert!(
            (amount - before * 0.25).abs() < 1e-9,
            "25% of {before} is not {amount}"
        );
        assert!((e.graph.liquidity_of(*f) - before * 0.75).abs() < 1e-9);
        // The delusion is over: the purse belief was re-synced to the truth.
        assert!((e.node(*f).unwrap().purse.liquidity - e.graph.liquidity_of(*f)).abs() < 1e-9);
        assert!(e.court.injunctions.contains(f));
    }
    for h in &w.honest {
        assert_eq!(
            e.graph.liquidity_of(*h),
            truth_1.liquidity_of(*h),
            "the innocent were not touched"
        );
        assert!(!e.court.injunctions.contains(h));
    }

    // The graph is the previous coherent state plus the court's seizures and
    // nothing else. (It cannot *equal* the tick-1 root while the court has
    // seized anything: the seizure is a state change. See the next test for
    // the exact-root case.)
    let mut expected = truth_1.clone();
    for f in &w.forgers {
        let have = expected.liquidity_of(*f);
        expected.slash(*f, have * 0.25);
    }
    assert_eq!(
        e.graph.root(),
        expected.root(),
        "the truth after the ruling is tick 1 + the fines"
    );
    assert_eq!(r2.root, expected.root());
    assert_ne!(e.graph.root(), root_1);
    assert_eq!(
        e.graph.contracts.len(),
        truth_1.contracts.len(),
        "no contract from the failed tick was booked"
    );
    // The snapshot chain was cut at tick 1 and continued at tick 2.
    let ticks: Vec<u64> = e.graph.snapshots().map(|s| s.tick).collect();
    assert_eq!(ticks, vec![1, 2]);
    assert_eq!(
        e.graph
            .root_history
            .iter()
            .map(|(t, _)| *t)
            .collect::<Vec<_>>(),
        vec![1, 2]
    );
}

/// (1b) The exact-root case: when the court has nothing to seize (the
/// offenders' truth is already zero) the rollback lands on the previous
/// tick's root *exactly*.
#[test]
fn rollback_lands_on_the_previous_root_when_there_is_nothing_to_seize() {
    let (mut e, w) = forged_street(cfg(42), 5, 2, 2, 0.0, DELUSION);
    for h in &w.honest {
        e.graph.set_liquidity(*h, TRUTH);
        e.node_mut(*h).unwrap().purse.liquidity = TRUTH;
    }
    let r1 = block_on(e.tick());
    assert_eq!(r1.approved, 2);
    let root_1 = r1.root;
    let r2 = block_on(e.tick());
    assert!(r2.rolled_back);
    assert_eq!(r2.rejected, 5);
    assert_eq!(rolled_back(&e, 2).map(|(t, _, n)| (t, n)), Some((1, 5)));
    assert_eq!(
        e.graph.root(),
        root_1,
        "nothing seized, nothing settled: the root is tick 1's"
    );
    assert_eq!(r2.root, root_1);
    assert!(court_slashes(&e, 2).iter().all(|(_, a)| *a == 0.0));
}

/// (2) After the ruling the offenders are under injunction: at the Country
/// gate their envelopes are refused on sight, backed or not, while an
/// honest neighbour's identical envelope passes the same gate.
#[test]
fn offenders_are_under_injunction_at_the_country_gate() {
    let (mut e, w) = forged_street(cfg(43), 5, 2, 2, TRUTH, DELUSION);
    block_on(e.tick());
    let r2 = block_on(e.tick());
    assert!(r2.rolled_back);
    assert_eq!(e.court.injunctions.len(), 5);

    // The camera goes to the Country. Zooming out packs the street's houses
    // into stasis; the test unpacks them so they can keep drafting, now
    // against the Country gate (a node's gate is the higher of its own and
    // the camera's).
    e.set_active_scale(Stage::Country);
    e.unpack_children(w.parent);
    for m in w.members() {
        assert_eq!(e.node(m).unwrap().status, NodeStatus::Active);
        assert_eq!(e.effective_gate(e.node(m).unwrap()), Stage::Country);
    }
    // Two of the offenders come back with a *backed* payment of 1.0 (they
    // hold 150.0 in truth now). The other three stay quiet, so the sample
    // this tick (2 + 2 = 4) is below the court's minimum and the ruling
    // itself is what is under test, not a second collapse.
    let knockers = [w.forgers[0], w.forgers[1]];
    for f in &w.forgers {
        let staff: Vec<Arc<dyn Agent>> = if knockers.contains(f) {
            vec![Arc::new(Transferor {
                amount: 1.0,
                arm_tick: 0,
                memo: "a small, backed payment",
            })]
        } else {
            vec![]
        };
        e.replace_staff(*f, staff);
    }
    let truth_before = e.graph.clone();
    let r3 = block_on(e.tick());
    assert_eq!(r3.envelopes_minted, 4);
    assert!(
        !r3.rolled_back,
        "2 of 4 is below the sample the court needs"
    );
    assert_eq!(r3.approved, 2, "the honest payments passed Statutory Law");
    assert_eq!(r3.rejected, 2, "the offenders' did not");

    let rej = rejections(&e, 3);
    assert_eq!(rej.len(), 2);
    for f in knockers {
        let mine = proposed_by(&e, 3, f);
        assert_eq!(mine.len(), 1);
        let (_, gate, reason) = rej
            .iter()
            .find(|(id, _, _)| *id == mine[0])
            .expect("the offender's envelope was rejected");
        assert_eq!(*gate, Stage::Country);
        assert!(reason.contains("injunction"), "reason: {reason}");
        assert!(
            e.graph.liquidity_of(f) + 1e-9 >= 1.0,
            "it was backed; the injunction, not the lock, refused it"
        );
        assert_eq!(
            e.graph.liquidity_of(f),
            truth_before.liquidity_of(f),
            "refused on sight, not fined again"
        );
    }
    for h in &w.honest {
        let mine = proposed_by(&e, 3, *h);
        assert_eq!(mine.len(), 1);
        assert!(!rej.iter().any(|(id, _, _)| *id == mine[0]));
        assert!(e.events().iter().any(|ev| matches!(ev, EngineEvent::Approved { tick: 3, envelope, gate: Stage::Country } if *envelope == mine[0])));
    }
    assert_eq!(
        settled_at(&e, 3),
        2,
        "the honest payments settled at the Country gate"
    );
    // The one court: the gate the frontend sees is the court that ruled.
    let view = e.state_view();
    assert!(
        view.gates
            .iter()
            .any(|g| g.contains("1 rollbacks") && g.contains("5 injunctions")),
        "gates: {:?}",
        view.gates
    );
}

/// (3) Approved-but-uncommitted envelopes from the failed tick are void.
/// The honest payments were approved at the gate in the same tick the
/// court ruled; none of them settled, no send fee was charged for them,
/// and only the crossing tax (paid at mint) is sunk.
#[test]
fn approvals_from_the_failed_tick_are_voided() {
    let (mut e, w) = forged_street(cfg(44), 5, 2, 2, TRUTH, DELUSION);
    block_on(e.tick());
    let compute_before: Vec<f64> = w
        .honest
        .iter()
        .map(|h| e.node(*h).unwrap().purse.compute)
        .collect();
    let liquidity_before: Vec<f64> = w.honest.iter().map(|h| e.graph.liquidity_of(*h)).collect();
    let contracts_before = e.graph.contracts.len();
    let settled_before = e.graph.total_settled;

    let r2 = block_on(e.tick());
    assert!(r2.rolled_back);
    assert_eq!(
        r2.approved, 2,
        "the gate approved the honest payments before the court sat"
    );
    assert_eq!(settled_at(&e, 2), 0, "nothing settled in the failed tick");
    assert_eq!(r2.settled_liquidity, 0.0);
    assert_eq!(e.graph.contracts.len(), contracts_before);
    assert_eq!(e.graph.total_settled, settled_before);
    for (i, h) in w.honest.iter().enumerate() {
        assert_eq!(
            e.graph.liquidity_of(*h),
            liquidity_before[i],
            "truth unchanged"
        );
        assert_eq!(
            e.node(*h).unwrap().purse.liquidity,
            liquidity_before[i],
            "belief unchanged"
        );
        // Only the crossing tax of one envelope (1.0 cr × 25 %) left the purse;
        // the 1.0 cr send fee is charged at commit, which never came.
        let spent = compute_before[i] - e.node(*h).unwrap().purse.compute;
        assert!((spent - 0.25).abs() < 1e-9, "spent {spent}");
    }
    // The approved ids were announced and then never settled or delivered.
    let approved_ids: Vec<EnvelopeId> = e
        .events()
        .iter()
        .filter_map(|ev| match ev {
            EngineEvent::Approved {
                tick: 2, envelope, ..
            } => Some(*envelope),
            _ => None,
        })
        .collect();
    assert_eq!(approved_ids.len(), 2);
    for id in approved_ids {
        assert!(!e.events().iter().any(|ev| matches!(ev, EngineEvent::Settled { envelope, .. } | EngineEvent::Delivered { envelope, .. } if *envelope == id)));
    }
    // Next tick, with the forgers still forging, the court sits again: the
    // honest houses can only settle once the offenders stop knocking.
    let r3 = block_on(e.tick());
    assert!(r3.rolled_back);
    assert_eq!(settled_at(&e, 3), 0);
}

/// The same collapse at the Clearinghouse. Netting turns each forgery into
/// a `Slashed` verdict (10 % of the request, capped at the truth: the whole
/// 200), and the court then rolls the tick back and fines 25 %. What
/// stands is the court's fine alone: the gate's seizure was undone by the
/// rollback, so the offender ends the tick at 75 % of its truth, not 0.
#[test]
fn a_clearinghouse_collapse_is_fined_once_by_the_court() {
    let (mut e, w) = forged_country(cfg(45), 5, 2, 2, TRUTH, DELUSION);
    let r1 = block_on(e.tick());
    assert_eq!(r1.approved, 2);
    let truth_1 = e.graph.clone();
    let r2 = block_on(e.tick());
    assert_eq!(r2.envelopes_minted, 7);
    assert_eq!(r2.slashed, 5, "netting found five unbacked net positions");
    assert_eq!(r2.rejected, 5);
    assert!(r2.rolled_back);
    assert!(e.events().iter().any(|ev| matches!(
        ev,
        EngineEvent::Netted {
            tick: 2,
            envelopes: 7,
            ..
        }
    )));
    for f in &w.forgers {
        assert!(
            (e.graph.liquidity_of(*f) - truth_1.liquidity_of(*f) * 0.75).abs() < 1e-9,
            "the fine that stands is the court's 25%"
        );
        assert!((e.node(*f).unwrap().purse.liquidity - e.graph.liquidity_of(*f)).abs() < 1e-9);
    }
    let mut expected = truth_1.clone();
    for f in &w.forgers {
        let have = expected.liquidity_of(*f);
        expected.slash(*f, have * 0.25);
    }
    assert_eq!(e.graph.root(), expected.root());
    assert_eq!(settled_at(&e, 2), 0);
}

/// `assess` needs a sample and a majority. Three forgeries at 100 % are
/// below `min_sample`; five forgeries against five honest payments is
/// exactly 50 %, not more. Neither is a ruling.
#[test]
fn the_court_needs_a_sample_and_a_majority() {
    let (mut e, _) = forged_street(cfg(46), 3, 0, 1, TRUTH, DELUSION);
    let r = block_on(e.tick());
    assert_eq!((r.rejected, r.approved), (3, 0));
    assert!(!r.rolled_back, "3 < min_sample 5");
    assert!(e.court.injunctions.is_empty());

    let (mut e, _) = forged_street(cfg(47), 5, 5, 1, TRUTH, DELUSION);
    let r = block_on(e.tick());
    assert_eq!((r.rejected, r.approved), (5, 5));
    assert!(!r.rolled_back, "50% is not more than the threshold");
    assert_eq!(settled_at(&e, 1), 5, "the honest half settled");

    let (mut e, _) = forged_street(cfg(48), 5, 4, 1, TRUTH, DELUSION);
    let r = block_on(e.tick());
    assert_eq!((r.rejected, r.approved), (5, 4));
    assert!(r.rolled_back, "5 of 9 is a majority");
}

/// A ruling on tick 1 has no earlier snapshot to restore. The engine must
/// still veto the tick and fine the offenders without panicking.
#[test]
fn a_ruling_on_tick_one_still_vetoes_and_fines() {
    let (mut e, w) = forged_street(cfg(49), 5, 2, 1, TRUTH, DELUSION);
    assert!(e.graph.snapshots().next().is_none());
    let r1 = block_on(e.tick());
    assert!(r1.rolled_back);
    assert_eq!(settled_at(&e, 1), 0);
    for f in &w.forgers {
        assert!((e.graph.liquidity_of(*f) - TRUTH * 0.75).abs() < 1e-9);
    }
    for h in &w.honest {
        assert_eq!(e.graph.liquidity_of(*h), TRUTH);
    }
    assert_eq!(
        e.graph.snapshots().map(|s| s.tick).collect::<Vec<_>>(),
        vec![1]
    );
}

/// Determinism through the court: two engines with the same seed roll back
/// and fine identically, tick for tick.
#[test]
fn replay_through_the_court_is_exact() {
    let (mut a, _) = forged_street(cfg(50), 5, 2, 2, TRUTH, DELUSION);
    let (mut b, _) = forged_street(cfg(50), 5, 2, 2, TRUTH, DELUSION);
    for _ in 0..6 {
        let ra = block_on(a.tick());
        let rb = block_on(b.tick());
        assert_eq!(ra, rb);
    }
    assert_eq!(a.court.rollbacks, b.court.rollbacks);
    assert_eq!(a.court.injunctions, b.court.injunctions);
    assert_eq!(a.graph.root(), b.graph.root());
}
