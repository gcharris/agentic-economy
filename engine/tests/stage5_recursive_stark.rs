//! Stage 5: Recursive STARKs. The planetary computer has no court, only
//! proofs. These tests pin the four properties doc 05 asks of the gate and
//! the partition rule that follows from them.

use context_engine::prelude::*;
use context_engine::scenarios::world::SETTLEMENT_FEE;
use std::collections::BTreeMap;

fn cfg(seed: u64, stark_period: u64) -> EngineConfig {
    EngineConfig {
        seed,
        stark_period,
        ..Default::default()
    }
}

fn countries(e: &Engine) -> Vec<NodeId> {
    e.nodes
        .values()
        .filter(|n| n.parent.is_none())
        .map(|n| n.id)
        .collect()
}

/// The first AwaitingFinality per envelope: (envelope → (tick, until_tick)).
fn first_holds(events: &[EngineEvent]) -> BTreeMap<EnvelopeId, (u64, u64)> {
    let mut m = BTreeMap::new();
    for ev in events {
        if let EngineEvent::AwaitingFinality {
            tick,
            envelope,
            until_tick,
        } = ev
        {
            m.entry(*envelope).or_insert((*tick, *until_tick));
        }
    }
    m
}

/// A signed envelope dropped straight into the mempool, as a country's
/// courier would. Lets a test provoke the gate without a seat.
fn inject(e: &mut Engine, from: NodeId, to: NodeId, amount: f64, id: u64) -> EnvelopeId {
    let tick = e.tick;
    let payload = Payload::LiquidityTransfer {
        amount,
        memo: format!("injected {id}"),
    };
    let payload_hash = payload.hash();
    let node = e.node(from).expect("initiator");
    let env = ProposalEnvelope {
        id: EnvelopeId(id),
        initiator: from,
        target: to,
        payload_hash,
        requested_liquidity: amount,
        compute_weight: 0.0,
        tax_paid: 0.0,
        auth_signature: node.sign(&payload_hash, tick),
        created_tick: tick,
        origin_stage: Stage::Country,
        gate: Stage::World,
        crossing: Crossing::CrossParent,
        asked_human: false,
        payload,
    };
    e.mempool
        .submit(env)
        .expect("courier accepts a funded transfer");
    EnvelopeId(id)
}

/// The world is built as doc 05 describes it: countries are root nodes, the
/// camera is at the World, cities are in stasis, and a country's envelopes
/// cross at CrossParent to be verified by the STARK gate.
#[test]
fn the_world_is_wired_for_stage_5() {
    let mut e = world(cfg(50, 16), 3, 2);
    assert_eq!(e.config.active_scale, Stage::World);
    let cs = countries(&e);
    assert_eq!(cs.len(), 3);
    for c in &cs {
        let n = e.node(*c).unwrap();
        assert_eq!(n.scale_level, Stage::Country);
        assert_eq!(n.children.len(), 2);
        assert!(
            n.packed.is_some(),
            "cities fold into the country's statistical profile"
        );
        assert_eq!(e.effective_gate(n), Stage::World);
        assert_eq!(n.known_peers.len(), 2);
    }
    assert!(e
        .nodes
        .values()
        .filter(|n| n.scale_level == Stage::City)
        .all(|n| n.status == NodeStatus::Packed));
    let r = block_on(e.tick());
    assert_eq!(
        r.drafted, 3,
        "a country holding a packed profile still drafts"
    );
    assert_eq!(r.envelopes_minted, 3);
    assert_eq!(r.packed_groups, 3);
    for (_, env) in e.held_envelopes() {
        assert_eq!(env.crossing, Crossing::CrossParent);
        assert_eq!(env.gate, Stage::World);
        assert!(matches!(env.payload, Payload::LiquidityTransfer { .. }));
        assert!(
            (env.tax_paid - SETTLEMENT_FEE * 0.40).abs() < 1e-9,
            "cross-parent tax on the settlement fee"
        );
    }
}

/// (1) The first verification yields AwaitingFinality with
/// `until_tick − tick ∈ [8, 32]`, the envelope is held at the country's door
/// (status WaitingAtDoor), and nothing burns while it waits.
#[test]
fn first_verification_holds_for_finality_at_zero_burn() {
    let mut e = world(cfg(51, 16), 2, 1);
    let cs = countries(&e);
    let r1 = block_on(e.tick());
    assert_eq!(r1.drafted, 2);
    assert_eq!(r1.held, 2);
    assert_eq!(r1.approved, 0);
    let holds = first_holds(e.events());
    assert_eq!(holds.len(), 2);
    let mut min_until = u64::MAX;
    for (id, (tick, until)) in &holds {
        assert_eq!(*tick, 1);
        let latency = until - tick;
        assert!((8..=32).contains(&latency), "latency {latency}");
        let env = e
            .held_envelopes()
            .find(|(_, env)| env.id == *id)
            .map(|(_, env)| env.clone())
            .expect("held at the door");
        assert_eq!(
            latency,
            e.stark.latency_for(&env.payload_hash),
            "the latency is the payload hash's"
        );
        min_until = min_until.min(*until);
    }
    let compute_at_door: BTreeMap<NodeId, f64> = cs
        .iter()
        .map(|c| (*c, e.node(*c).unwrap().purse.compute))
        .collect();
    for c in &cs {
        let n = e.node(*c).unwrap();
        assert_eq!(n.status, NodeStatus::WaitingAtDoor);
        assert_eq!(n.held_at_door.len(), 1);
    }
    // Every tick before the earliest finality: no draft, no burn, still held.
    for _ in 2..min_until {
        let r = block_on(e.tick());
        assert_eq!(
            r.drafted, 0,
            "a country waiting for finality does not draft"
        );
        assert_eq!(
            r.compute_burned, 0.0,
            "zero idle burn at the planetary door"
        );
        assert_eq!(r.approved, 0);
        for c in &cs {
            let n = e.node(*c).unwrap();
            assert_eq!(n.status, NodeStatus::WaitingAtDoor);
            assert_eq!(n.purse.compute, compute_at_door[c]);
        }
    }
}

/// (2) An envelope is approved exactly when `tick >= until_tick`, and it
/// settles in the Sovereign Graph that same tick. Checked for every envelope
/// over a long run, not just the first.
#[test]
fn approved_exactly_at_until_tick_and_settles() {
    let mut e = world(cfg(52, 16), 3, 1);
    let mut all: Vec<EngineEvent> = Vec::new();
    for _ in 0..120 {
        block_on(e.tick());
        all.extend(e.drain_events());
    }
    let holds = first_holds(&all);
    assert!(
        holds.len() >= 6,
        "several settlement cycles ran ({})",
        holds.len()
    );
    let mut approved = 0;
    for ev in &all {
        if let EngineEvent::Approved {
            tick,
            envelope,
            gate,
        } = ev
        {
            assert_eq!(*gate, Stage::World);
            let (_, until) = holds[envelope];
            assert_eq!(
                *tick, until,
                "approved at finality, not before and not after"
            );
            assert!(all.iter().any(|s| matches!(s, EngineEvent::Settled { tick: t, envelope: id, .. } if t == tick && id == envelope)), "settled the tick it was approved");
            approved += 1;
        }
    }
    assert!(approved >= 6);
    // Before finality it is held and re-held: every AwaitingFinality after the
    // first repeats the same until_tick, and none lands at or after it.
    for ev in &all {
        if let EngineEvent::AwaitingFinality {
            tick,
            envelope,
            until_tick,
        } = ev
        {
            let (_, until) = holds[envelope];
            assert_eq!(*until_tick, until);
            assert!(*tick < until);
        }
    }
    assert!(
        !all.iter()
            .any(|ev| matches!(ev, EngineEvent::Rejected { .. })),
        "belief and truth never parted"
    );
    // Belief equals truth for every country once the proofs have landed.
    for c in countries(&e) {
        let n = e.node(c).unwrap();
        assert!((n.purse.liquidity - e.graph.liquidity_of(c)).abs() < 1e-6);
    }
    assert!(e.graph.total_settled > 0.0);
}

/// (3) The heartbeat: GLOBAL_STATE_CONFIRMED every `stark_period` ticks,
/// latency in [8, 32], and a root that is the Merkle aggregate of the
/// countries' Oak Table roots, so it moves when a table does and only then.
#[test]
fn heartbeat_every_stark_period_with_a_root_that_follows_the_tables() {
    let period = 16;
    let mut e = world(cfg(53, period), 3, 2);
    let mut beats: Vec<(u64, Hash32, u64)> = Vec::new();
    for t in 1..=64u64 {
        let r = block_on(e.tick());
        assert_eq!(r.global_confirmed, t % period == 0);
        for ev in e.drain_events() {
            if let EngineEvent::GlobalStateConfirmed {
                tick,
                root,
                latency_ticks,
                partitioned,
            } = ev
            {
                assert_eq!(tick, t);
                assert!((8..=32).contains(&latency_ticks));
                assert_eq!(latency_ticks, e.stark.latency_for(&root));
                assert!(partitioned.is_empty());
                // The root is exactly the aggregate of the countries' roots.
                let leaves: Vec<Hash32> = e
                    .nodes
                    .values_mut()
                    .filter(|n| n.parent.is_none())
                    .map(|n| Hash32::digest_parts(&[&n.id.0.to_le_bytes(), &n.oak_table.root().0]))
                    .collect();
                assert_eq!(root, Hash32::merkle_root(&leaves));
                beats.push((tick, root, latency_ticks));
            }
        }
    }
    assert_eq!(
        beats.iter().map(|b| b.0).collect::<Vec<_>>(),
        vec![16, 32, 48, 64]
    );
    assert_eq!(e.stark.proofs, 4);
    // The ledgers moved during the run, so the root moved with them.
    assert_ne!(beats[0].1, beats[3].1);

    // A frozen world: no seats, no ledger lines, the root holds still ...
    let mut f = world(cfg(53, period), 3, 2);
    let cs = countries(&f);
    for c in &cs {
        f.replace_staff(*c, vec![]);
    }
    let mut roots: BTreeMap<u64, Hash32> = BTreeMap::new();
    for t in 1..=64u64 {
        if t == 40 {
            // ... until one country's Oak Table changes.
            f.node_mut(cs[1])
                .unwrap()
                .oak_table
                .put("ledger/restatement", "the treasury restated its reserves");
        }
        block_on(f.tick());
        for ev in f.drain_events() {
            if let EngineEvent::GlobalStateConfirmed { tick, root, .. } = ev {
                roots.insert(tick, root);
            }
        }
    }
    assert_eq!(roots[&16], roots[&32], "nothing changed, the root did not");
    assert_ne!(
        roots[&32], roots[&48],
        "a country's table changed, the root did"
    );
    assert_eq!(roots[&48], roots[&64], "and held again");
}

/// (4) Finality latency is a deterministic function of the payload hash:
/// same payload, same latency, on any instance, always in [8, 32].
#[test]
fn latency_is_deterministic_in_the_payload_hash() {
    let a = Stage5RecursiveStark::default();
    let b = Stage5RecursiveStark::default();
    let mut seen = std::collections::BTreeSet::new();
    for i in 0..64u64 {
        let h = Payload::LiquidityTransfer {
            amount: 12.5,
            memo: format!("t{i}"),
        }
        .hash();
        let l = a.latency_for(&h);
        assert_eq!(l, a.latency_for(&h));
        assert_eq!(l, b.latency_for(&h));
        assert!((8..=32).contains(&l));
        assert_eq!(l, 8 + h.as_u64() % 25, "the documented formula");
        seen.insert(l);
    }
    assert!(
        seen.len() > 1,
        "different payloads land at different finality"
    );
    // And the engine uses the same function: two worlds, same seed, same until_ticks.
    let mut x = world(cfg(54, 16), 4, 1);
    let mut y = world(cfg(54, 16), 4, 1);
    for _ in 0..40 {
        block_on(x.tick());
        block_on(y.tick());
    }
    assert_eq!(first_holds(x.events()), first_holds(y.events()));
    assert_eq!(x.reports, y.reports, "replay is exact at Stage 5");
}

/// The partition rule (doc 05, Stage 5), minimally: a country whose root
/// moved since the previous heartbeat *and* whose proof failed in the same
/// window is partitioned from the rails; while partitioned its envelopes die
/// at preflight; it is re-admitted at the first heartbeat at which its root
/// held still.
#[test]
fn partition_rule_cuts_and_readmits() {
    let period = 8;
    let mut e = world(cfg(55, period), 3, 1);
    let cs = countries(&e);
    let (a, b, c) = (cs[0], cs[1], cs[2]);
    for id in &cs {
        e.replace_staff(*id, vec![]); // a frozen world: only what the test injects moves
    }
    let mut beats: BTreeMap<u64, Vec<NodeId>> = BTreeMap::new();
    let run =
        |e: &mut Engine, until: u64, beats: &mut BTreeMap<u64, Vec<NodeId>>| -> Vec<EngineEvent> {
            let mut out = Vec::new();
            while e.tick < until {
                block_on(e.tick());
                for ev in e.drain_events() {
                    if let EngineEvent::GlobalStateConfirmed {
                        tick, partitioned, ..
                    } = &ev
                    {
                        beats.insert(*tick, partitioned.clone());
                    }
                    out.push(ev);
                }
            }
            out
        };

    // Window 1: the baseline heartbeat at tick 8.
    run(&mut e, 8, &mut beats);
    assert_eq!(beats[&8], Vec::<NodeId>::new());
    assert_eq!(e.stark.last_roots.len(), 3);

    // Window 2: B and C both fail a proof (truth cannot back the transfer);
    // only C's Oak Table changes in the window.
    e.graph.set_liquidity(b, 0.0);
    e.graph.set_liquidity(c, 0.0);
    inject(&mut e, b, a, 10.0, 0xB1);
    inject(&mut e, c, a, 10.0, 0xC1);
    e.node_mut(c)
        .unwrap()
        .oak_table
        .put("ledger/restatement", "reserves restated");
    let evs = run(&mut e, 9, &mut beats);
    let rejected: Vec<&EngineEvent> = evs
        .iter()
        .filter(|ev| {
            matches!(
                ev,
                EngineEvent::Rejected {
                    gate: Stage::World,
                    ..
                }
            )
        })
        .collect();
    assert_eq!(rejected.len(), 2);
    assert!(rejected.iter().all(|ev| matches!(ev, EngineEvent::Rejected { reason, .. } if reason.starts_with("proof failed"))));
    assert!(e.stark.rejected_this_window.contains(&b) && e.stark.rejected_this_window.contains(&c));
    run(&mut e, 16, &mut beats);
    assert_eq!(
        beats[&16],
        vec![c],
        "root moved AND proof failed: partitioned"
    );
    assert_eq!(e.node(c).unwrap().status, NodeStatus::Partitioned);
    assert_eq!(
        e.node(b).unwrap().status,
        NodeStatus::Active,
        "proof failed but the root held: not partitioned"
    );
    assert_eq!(e.node(a).unwrap().status, NodeStatus::Active);
    assert!(
        e.stark.rejected_this_window.is_empty(),
        "the window closed with the heartbeat"
    );

    // Window 3: C is cut from the rails. A fully backed transfer from C dies
    // at preflight. C's table moves again, so it stays partitioned.
    e.graph.set_liquidity(c, 100.0);
    let dead = inject(&mut e, c, a, 10.0, 0xC2);
    e.node_mut(c)
        .unwrap()
        .oak_table
        .put("ledger/restatement", "restated twice");
    let evs = run(&mut e, 17, &mut beats);
    assert!(evs.iter().any(|ev| matches!(ev, EngineEvent::Rejected { envelope, gate: Stage::World, reason, .. } if *envelope == dead && reason.contains("partitioned"))));
    assert!(!evs.iter().any(
        |ev| matches!(ev, EngineEvent::AwaitingFinality { envelope, .. } if *envelope == dead)
    ));
    run(&mut e, 24, &mut beats);
    assert_eq!(beats[&24], vec![c], "root still moving: still partitioned");
    assert_eq!(e.node(c).unwrap().status, NodeStatus::Partitioned);

    // Window 4: C's root holds still. Re-admitted at the heartbeat.
    run(&mut e, 32, &mut beats);
    assert_eq!(beats[&32], Vec::<NodeId>::new());
    assert_eq!(e.node(c).unwrap().status, NodeStatus::Active);

    // Window 5: back on the rails, C's transfer is held for finality again.
    let alive = inject(&mut e, c, a, 10.0, 0xC3);
    let evs = run(&mut e, 33, &mut beats);
    assert!(evs.iter().any(
        |ev| matches!(ev, EngineEvent::AwaitingFinality { envelope, .. } if *envelope == alive)
    ));
    assert_eq!(e.node(c).unwrap().status, NodeStatus::WaitingAtDoor);
}

/// Preflight itself, with no engine in the way: a partitioned initiator is
/// refused before any gate's own rule runs.
#[test]
fn preflight_refuses_a_partitioned_initiator() {
    let e = world(cfg(56, 16), 2, 1);
    let cs = countries(&e);
    let (a, b) = (cs[0], cs[1]);
    let payload = Payload::LiquidityTransfer {
        amount: 5.0,
        memo: "x".into(),
    };
    let payload_hash = payload.hash();
    let env = ProposalEnvelope {
        id: EnvelopeId(1),
        initiator: a,
        target: b,
        payload_hash,
        requested_liquidity: 5.0,
        compute_weight: 0.0,
        tax_paid: 0.0,
        auth_signature: e.node(a).unwrap().sign(&payload_hash, 0),
        created_tick: 0,
        origin_stage: Stage::Country,
        gate: Stage::World,
        crossing: Crossing::CrossParent,
        asked_human: false,
        payload,
    };
    let secrets: BTreeMap<NodeId, u64> = e.nodes.values().map(|n| (n.id, n.secret)).collect();
    let mut status: BTreeMap<NodeId, NodeStatus> =
        e.nodes.values().map(|n| (n.id, n.status)).collect();
    {
        let view = BoundaryView {
            tick: 1,
            graph: &e.graph,
            decisions: &e.decisions,
            node_status: &status,
            node_secrets: &secrets,
        };
        assert_eq!(
            preflight(&env, &view),
            None,
            "on the rails: preflight passes"
        );
        let mut gate = Stage5RecursiveStark::default();
        assert!(matches!(
            gate.verify(&env, &view),
            Verdict::Held {
                reason: HoldReason::AwaitingFinality { .. }
            }
        ));
        assert_eq!(gate.pending(), 1);
    }
    status.insert(a, NodeStatus::Partitioned);
    let view = BoundaryView {
        tick: 1,
        graph: &e.graph,
        decisions: &e.decisions,
        node_status: &status,
        node_secrets: &secrets,
    };
    assert!(
        matches!(preflight(&env, &view), Some(Verdict::Rejected { reason }) if reason.contains("partitioned"))
    );
    let mut gate = Stage5RecursiveStark::default();
    gate.verify(&env, &{
        BoundaryView {
            tick: 1,
            graph: &e.graph,
            decisions: &e.decisions,
            node_status: &BTreeMap::new(),
            node_secrets: &secrets,
        }
    });
    // A preflight rejection also clears the finality queue for that envelope.
    assert!(matches!(gate.verify(&env, &view), Verdict::Rejected { .. }));
    assert_eq!(gate.pending(), 0);
}

/// A partitioned country does not draft (no envelope, no burn) and the
/// envelope it already had at the door is destroyed at the next verify.
#[test]
fn a_partitioned_country_is_quiet_and_its_held_envelope_dies() {
    let mut e = world(cfg(57, 16), 2, 1);
    let cs = countries(&e);
    let a = cs[0];
    block_on(e.tick());
    let held = e.node(a).unwrap().held_at_door[0].id;
    let compute = e.node(a).unwrap().purse.compute;
    e.node_mut(a).unwrap().status = NodeStatus::Partitioned; // the validators' verdict, applied by hand
    let r = block_on(e.tick());
    assert_eq!(r.drafted, 0);
    assert!(e.events().iter().any(|ev| matches!(ev, EngineEvent::Rejected { envelope, reason, .. } if *envelope == held && reason.contains("partitioned"))));
    let n = e.node(a).unwrap();
    assert!(n.held_at_door.is_empty());
    assert_eq!(
        n.status,
        NodeStatus::Partitioned,
        "rejection does not lift the partition"
    );
    assert_eq!(
        n.purse.compute, compute,
        "sunk cost only: nothing further burned"
    );
    // Until the next heartbeat the other country goes on settling and the
    // partitioned one stays quiet: no envelope, no burn.
    while e.tick < 15 {
        block_on(e.tick());
        let n = e.node(a).unwrap();
        assert_eq!(n.status, NodeStatus::Partitioned);
        assert_eq!(n.purse.compute, compute);
        assert!(n.held_at_door.is_empty());
        assert!(!e.events().iter().any(|ev| matches!(ev, EngineEvent::Proposed { from, .. } | EngineEvent::Burn { node: from, .. } if *from == a && ev.tick() > 1)), "no envelope and no burn from a partitioned country");
    }
    // Its root held still through the window, so the heartbeat lets it back on.
    let r = block_on(e.tick());
    assert!(r.global_confirmed);
    assert_eq!(e.node(a).unwrap().status, NodeStatus::Active);
    assert!(e.events().iter().any(|ev| matches!(ev, EngineEvent::GlobalStateConfirmed { tick: 16, partitioned, .. } if partitioned.is_empty())));
    let r = block_on(e.tick());
    assert!(r.drafted >= 1, "back on the rails, it drafts again");
    assert!(e
        .events()
        .iter()
        .any(|ev| matches!(ev, EngineEvent::Proposed { from, tick: 17, .. } if *from == a)));
}
