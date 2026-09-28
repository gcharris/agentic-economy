//! The Golden Invariant, as tests. If one of these fails the engine is no
//! longer the engine the design docs describe.

use context_engine::prelude::*;
use std::sync::Arc;

fn cfg(seed: u64) -> EngineConfig {
    EngineConfig { seed, cost_visible: true, ..Default::default() }
}

fn house_id(e: &Engine) -> NodeId {
    e.nodes.values().find(|n| n.scale_level == Stage::House).unwrap().id
}

/// Law 1. A draft owns its context. There is no lifetime through which a
/// reference to the engine could enter. (Compile-time, restated at runtime.)
#[test]
fn law_1_drafts_are_isolated_by_type() {
    fn assert_send_static<T: Send + 'static>() {}
    assert_send_static::<DraftContext>();
    assert_send_static::<DraftJob>();
    // A seat that tries to reach the graph has nothing to reach for:
    struct Nosy;
    impl Agent for Nosy {
        fn seat(&self) -> &str {
            "Nosy"
        }
        fn tier(&self) -> ModelTier {
            ModelTier::FastQuantized
        }
        fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
            // Everything reachable from here is a copy owned by `ctx`.
            let _my_purse_copy = ctx.purse();
            let _my_table_copy = ctx.oak().clone();
            ctx.think("Nosy", "I can see my own table and nothing else.");
            Box::pin(async move { ctx })
        }
    }
    let mut e = house(cfg(1), 100.0, 1);
    let h = house_id(&e);
    e.replace_staff(h, vec![Arc::new(Nosy)]);
    block_on(e.tick());
    assert!(e.events().iter().any(|ev| matches!(ev, EngineEvent::Thought { seat, .. } if seat == "Nosy")));
}

/// Law 2. The Oak Table is local: a draft's snapshot is a copy, and the
/// only cross-node write is a delivery from an approved envelope.
#[test]
fn law_2_oak_table_is_local() {
    let mut e = house(cfg(2), 800.0, 2);
    let h = house_id(&e);
    let street = e.node(h).unwrap().parent.unwrap();
    let street_root_before = e.node_mut(street).unwrap().oak_table.root();
    block_on(e.tick());
    // The house drafted; the street's table did not move.
    assert_eq!(e.node_mut(street).unwrap().oak_table.root(), street_root_before);
    // Approve the dispatch: now, and only now, the street's inbox changes.
    let held: Vec<EnvelopeId> = e.held_envelopes().map(|(_, env)| env.id).collect();
    assert_eq!(held.len(), 1);
    e.authorize(held[0]);
    block_on(e.tick());
    assert_ne!(e.node_mut(street).unwrap().oak_table.root(), street_root_before);
    assert!(e.node(street).unwrap().oak_table.entries().any(|(k, _)| k.starts_with("inbox/")));
}

/// Law 3. State transitions only at boundaries: the Sovereign Graph root
/// does not move until an envelope is approved.
#[test]
fn law_3_graph_moves_only_through_a_gate() {
    // A house whose door nobody answers: five ticks, no change to the truth.
    let mut e = house(cfg(3), 800.0, 3);
    let root0 = e.graph.root();
    for _ in 0..5 {
        block_on(e.tick());
    }
    assert_eq!(e.graph.root(), root0, "no approval, no graph change");
    // A street seen from the street: the gate is the Letter Slot, swaps settle.
    let mut s = street(cfg(3), 3, 600.0, 2);
    let root1 = s.graph.root();
    let mut settled = false;
    for _ in 0..6 {
        block_on(s.tick());
        if s.graph.contracts.iter().any(|c| c.kind == "hire_service") {
            settled = true;
            break;
        }
    }
    assert!(settled, "atomic swaps settle through the letter slot");
    assert_ne!(s.graph.root(), root1);
}

/// Sovereignty is not a camera setting. An envelope the person has been
/// asked about stays at the Door however far the camera zooms out; only
/// the person's yes moves it.
#[test]
fn once_asked_only_the_person_answers() {
    let mut e = house(cfg(31), 800.0, 2);
    block_on(e.tick());
    assert_eq!(e.held_envelopes().count(), 1, "the porter is at the door");
    e.set_active_scale(Stage::World); // the camera leaves the room entirely
    for _ in 0..3 {
        let r = block_on(e.tick());
        assert_eq!(r.approved, 0, "zooming out approved nothing");
    }
    assert_eq!(e.held_envelopes().count(), 1, "still waiting for a hand");
    let id = e.held_envelopes().next().unwrap().1.id;
    assert!(e.authorize(id));
    let r = block_on(e.tick());
    assert_eq!(r.approved, 1);
    assert!(!e.authorize(id), "an envelope that is no longer held cannot be answered again");
}

/// Law 4. Sovereignty: the Door holds an irreversible send, nothing burns
/// while it waits, and truth still decays. Benchmark 3, re-run inside the engine.
#[test]
fn law_4_the_door_holds_at_zero_burn() {
    let mut e = house(cfg(4), 500.0, 3);
    let h = house_id(&e);
    let r1 = block_on(e.tick());
    assert!(r1.held == 1, "the porter is at the door");
    let compute_at_door = e.node(h).unwrap().purse.compute;
    let phi_at_door = e.node(h).unwrap().epistemics.confidence;
    assert_eq!(e.node(h).unwrap().status, NodeStatus::WaitingAtDoor);
    for _ in 0..100 {
        let r = block_on(e.tick());
        assert_eq!(r.compute_burned, 0.0, "idle burn while waiting");
        assert_eq!(r.drafted, 0);
    }
    let n = e.node(h).unwrap();
    assert_eq!(n.purse.compute, compute_at_door, "0.0 credits leaked in 100 ticks");
    assert!(n.epistemics.confidence < phi_at_door, "truth decays while the person thinks");
    assert!((n.epistemics.confidence - idle_decay(phi_at_door, 100)).abs() < 1e-9);
    // The person says yes: the send cost comes out only now.
    let id = e.held_envelopes().next().unwrap().1.id;
    e.authorize(id);
    let r = block_on(e.tick());
    assert_eq!(r.approved, 1);
    let n = e.node(h).unwrap();
    assert!((compute_at_door - n.purse.compute - 10.0).abs() < 30.0, "the door fee (10 cr) plus the next draft");
    assert_eq!(n.tasks_done(), 1);
}

/// Stage 1 rule 3: a rejected envelope is destroyed and nothing is refunded.
#[test]
fn rejection_is_sunk_cost() {
    let mut e = house(cfg(5), 500.0, 1);
    let h = house_id(&e);
    block_on(e.tick());
    let after_draft = e.node(h).unwrap().purse.compute;
    let id = e.held_envelopes().next().unwrap().1.id;
    e.reject(id);
    let r = block_on(e.tick());
    assert_eq!(r.rejected, 1);
    let n = e.node(h).unwrap();
    assert_eq!(n.purse.compute, after_draft, "no refund, and no send fee either");
    assert!(n.held_at_door.is_empty());
    assert_eq!(n.tasks[0].state, TaskState::Rejected);
    assert!(!n.boundary_rules.refund_on_reject);
}

/// Exhaustion is a pause, not a death: the note is on the table, the
/// papers are kept, and a top-up continues the week.
#[test]
fn exhaustion_leaves_a_note_and_keeps_the_papers() {
    let mut e = house(cfg(6), 20.0, 3); // enough for the compact lookup, not for the draft
    let h = house_id(&e);
    let r = block_on(e.tick());
    assert_eq!(r.halted, 1);
    let n = e.node(h).unwrap();
    assert_eq!(n.status, NodeStatus::Halted);
    let note = n.note.clone().expect("a note");
    assert!(matches!(note.reason, HaltReason::RunwayExhausted { .. }));
    assert!(note.to_plain_line().contains("A person must top up or close"));
    assert!(!n.oak_table.papers.is_empty(), "the papers stay on the table");
    assert!(n.oak_table.get("note").is_some());
    // Nothing was deleted; the person tops up and it continues.
    e.top_up(h, 500.0);
    assert_eq!(e.node(h).unwrap().status, NodeStatus::Active);
    let r = block_on(e.tick());
    assert_eq!(r.drafted, 1);
}

/// Every boundary crossing pays the coordination tax; the intra-node
/// oracle call does not.
#[test]
fn crossings_pay_the_coordination_tax() {
    let mut e = house(cfg(7), 800.0, 1);
    let r = block_on(e.tick());
    // One dispatch to the parent street (same-parent crossing): 10 cr × 0.25 = 2.5 cr of tax.
    assert!((r.tax_paid - 2.5).abs() < 1e-9, "tax was {}", r.tax_paid);
    let env = e.held_envelopes().next().unwrap().1.clone();
    assert_eq!(env.crossing, Crossing::SameParent);
    assert_eq!(env.tax_paid, 2.5);
}

/// The epistemic record: after five handovers the Scout asks the oracle,
/// and the oracle resets truth to 1.0 at the recorded cost.
#[test]
fn the_oracle_is_paid_and_resets_truth() {
    let mut e = house(cfg(8), 2000.0, 8);
    let h = house_id(&e);
    let mut synced = false;
    for _ in 0..20 {
        block_on(e.tick());
        for (_, env) in e.held_envelopes().map(|(n, e)| (n.id, e.id)).collect::<Vec<_>>() {
            e.authorize(env);
        }
        if e.events().iter().any(|ev| matches!(ev, EngineEvent::StateSync { cost, .. } if *cost == ORACLE_COST)) {
            synced = true;
            break;
        }
    }
    assert!(synced, "the Scout paid the oracle");
    assert_eq!(e.node(h).unwrap().epistemics.calibrations, 1);
}

/// Fractal LOD: packing stops the children's threads, macro ticks run in
/// O(1), unpacking is deterministic and never mints compute.
#[test]
fn pack_and_unpack_conserve_compute() {
    let mut e = street(cfg(9), 5, 400.0, 3);
    let street_id = e.nodes.values().find(|n| n.scale_level == Stage::Street).unwrap().id;
    block_on(e.tick());
    let total_before: f64 = e.nodes.values().filter(|n| n.scale_level == Stage::House).map(|n| n.purse.compute).sum();
    e.set_active_scale(Stage::Country); // houses are two levels below the camera's neighbour: stasis
    assert!(e.node(street_id).unwrap().packed.is_some());
    assert!(e.nodes.values().filter(|n| n.scale_level == Stage::House).all(|n| n.status == NodeStatus::Packed));
    let mut macro_ticks = 0;
    for _ in 0..10 {
        let r = block_on(e.tick());
        assert_eq!(r.drafted, 0, "no discrete drafts in stasis");
        macro_ticks += r.packed_groups;
    }
    assert!(macro_ticks >= 10);
    let pending = e.node(street_id).unwrap().packed.as_ref().unwrap().pending_burn;
    e.set_active_scale(Stage::Street);
    assert!(e.node(street_id).unwrap().packed.is_none());
    let total_after: f64 = e.nodes.values().filter(|n| n.scale_level == Stage::House).map(|n| n.purse.compute).sum();
    assert!(total_after <= total_before + 1e-9, "unpacking never mints compute");
    assert!((total_before - total_after - pending).abs() < 1e-6, "the macro burn was distributed exactly");
    // Determinism: the same seed packs and unpacks to the same weights.
    let a = PackedStatisticalState { stochastic_seed: 99, child_count: 5, ..PackedStatisticalState::pack(&[], 0, 99) }.unpack_weights();
    let b = PackedStatisticalState { stochastic_seed: 99, child_count: 5, ..PackedStatisticalState::pack(&[], 0, 99) }.unpack_weights();
    assert_eq!(a, b);
}

/// The same seed replays bit for bit: sovereign roots match tick by tick.
#[test]
fn replay_is_exact() {
    let mut a = street(cfg(11), 4, 500.0, 3);
    let mut b = street(cfg(11), 4, 500.0, 3);
    for _ in 0..12 {
        let ra = block_on(a.tick());
        let rb = block_on(b.tick());
        assert_eq!(ra.root, rb.root);
        assert_eq!(ra, rb);
    }
}

/// The cost-visibility finding, re-run in the engine: with the price on
/// the table the house paces itself and finishes more of the list.
#[test]
fn cost_visibility_changes_what_gets_bought() {
    fn run(visible: bool) -> (usize, f64) {
        let mut e = house(EngineConfig { seed: 12, cost_visible: visible, ..Default::default() }, 260.0, 10);
        let h = house_id(&e);
        for _ in 0..60 {
            block_on(e.tick());
            for id in e.held_envelopes().map(|(_, env)| env.id).collect::<Vec<_>>() {
                e.authorize(id);
            }
            if e.node(h).unwrap().status == NodeStatus::Halted {
                break;
            }
        }
        let n = e.node(h).unwrap();
        (n.tasks_done(), n.purse.compute)
    }
    let (done_visible, _) = run(true);
    let (done_hidden, _) = run(false);
    assert!(done_visible >= done_hidden, "visible {done_visible} vs hidden {done_hidden}");
}

/// Nobody keeps a score. There is no field anywhere that ranks seats.
#[test]
fn there_is_no_leaderboard() {
    let mut e = house(cfg(13), 800.0, 2);
    block_on(e.tick());
    let json = e.state_json();
    for banned in ["reputation", "score", "rank", "leaderboard", "rating"] {
        assert!(!json.contains(banned), "found `{banned}` in the state view");
    }
}

/// The executor is not part of the result. Ten cores or one, the sovereign
/// roots match tick for tick.
#[cfg(feature = "native")]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn tokio_executor_matches_sequential() {
    let mut a = street(cfg(21), 8, 500.0, 3);
    let mut b = street(cfg(21), 8, 500.0, 3);
    b.set_executor(Box::new(TokioExecutor));
    assert_eq!(b.executor_name(), "tokio-multi-thread");
    for _ in 0..12 {
        let ra = a.tick().await;
        let rb = b.tick().await;
        assert_eq!(ra.root, rb.root);
        assert_eq!(ra, rb);
    }
}
