//! A Week on Elm Street (doc 06 §8, round 1): the person's oracle, a settled hire that delivers its draft, the price
//! walk and the week's Note. Deterministic: every run is a pure function of the seed.

use context_engine::prelude::*;

fn names(n: usize) -> Vec<String> {
    ELM_NAMES.iter().take(n).map(|s| s.to_string()).collect()
}

fn game(seed: u64, houses: usize) -> Engine {
    let config = EngineConfig {
        seed,
        oracle_policy: OraclePolicy::Person,
        ..EngineConfig::default()
    };
    elm_street(config, &names(houses), 800.0, 15)
}

fn houses(e: &Engine) -> Vec<NodeId> {
    e.nodes
        .values()
        .filter(|n| n.scale_level == Stage::House)
        .map(|n| n.id)
        .collect()
}

/// Tick until `house` has both a send and a hire for the same draft at its Door; return (send, hire, task, price).
fn knock(e: &mut Engine, house: NodeId) -> (EnvelopeId, EnvelopeId, String, f64) {
    for _ in 0..12 {
        block_on(e.tick());
        let n = e.node(house).unwrap();
        let send = n.held_at_door.iter().find_map(|env| match &env.payload {
            Payload::Dispatch { task_id, .. } => Some((env.id, task_id.clone())),
            _ => None,
        });
        let hire = n.held_at_door.iter().find_map(|env| match &env.payload {
            Payload::HireService {
                task_id: Some(t),
                believed_price,
                ..
            } => Some((env.id, t.clone(), *believed_price)),
            _ => None,
        });
        if let (Some((s, ts)), Some((h, th, price))) = (send, hire) {
            assert_eq!(ts, th, "the Porter's hire names the draft the send is for");
            return (s, h, ts, price);
        }
    }
    panic!("no knock with a send and a hire in 12 ticks");
}

fn task_state(e: &Engine, house: NodeId, task: &str) -> TaskState {
    e.node(house)
        .unwrap()
        .tasks
        .iter()
        .find(|t| t.id == task)
        .unwrap()
        .state
}

#[test]
fn a_hire_at_the_wrong_price_reverts_and_the_task_stays() {
    let mut e = game(11, 3);
    let ada = houses(&e)[0];
    let (send, hire, task, believed) = knock(&mut e, ada);
    assert_eq!(believed, 10.0);
    e.graph.service_prices.insert("courier".into(), 12.0); // the price moved; Ada's table still says 10
    let before = e.graph.liquidity_of(ada);
    assert!(e.authorize(hire));
    assert!(e.reject(send));
    block_on(e.tick()); // the Door: no to the send, yes to the hire; the hire goes to the kerb
    assert!(!e
        .events()
        .iter()
        .any(|ev| matches!(ev, EngineEvent::Settled { envelope, .. } if *envelope == hire)));
    block_on(e.tick()); // the kerb
    let reverted = e.events().iter().any(|ev| matches!(ev, EngineEvent::Rejected { envelope, gate: Stage::Street, reason, .. } if *envelope == hire && reason.contains("hash mismatch")));
    assert!(reverted, "the Letter Slot turns the stale price back");
    assert_ne!(
        task_state(&e, ada, &task),
        TaskState::Sent,
        "the task stays"
    );
    assert_eq!(e.graph.liquidity_of(ada), before, "nothing moves");
    assert_eq!(e.node(ada).unwrap().tally.swaps_reverted, 1);
    assert_eq!(e.node(ada).unwrap().tally.swaps_settled, 0);
}

#[test]
fn a_hire_at_the_right_price_settles_delivers_the_draft_and_moves_liquidity() {
    let mut e = game(11, 3);
    let ada = houses(&e)[0];
    let (send, hire, task, price) = knock(&mut e, ada);
    let peer = e
        .node(ada)
        .unwrap()
        .held_at_door
        .iter()
        .find(|x| x.id == hire)
        .unwrap()
        .target;
    let (a0, p0) = (e.graph.liquidity_of(ada), e.graph.liquidity_of(peer));
    let done0 = e.node(ada).unwrap().tasks_done();
    e.authorize(hire);
    e.reject(send);
    block_on(e.tick());
    block_on(e.tick());
    let ev = e.events();
    assert!(ev.iter().any(|x| matches!(x, EngineEvent::Settled { envelope, amount, .. } if *envelope == hire && *amount == price)));
    assert!(
        ev.iter()
            .any(|x| matches!(x, EngineEvent::Delivered { envelope, .. } if *envelope == hire)),
        "Delivered fires for the hire, as for a send"
    );
    assert_eq!(task_state(&e, ada, &task), TaskState::Sent);
    assert_eq!(e.node(ada).unwrap().tasks_done(), done0 + 1);
    assert_eq!(e.graph.liquidity_of(ada), a0 - price);
    assert_eq!(e.graph.liquidity_of(peer), p0 + price);
    assert_eq!(e.node(ada).unwrap().tally.swaps_settled, 1);
}

#[test]
fn the_persons_sync_charges_15_cr_and_resets_phi() {
    let mut e = game(5, 2);
    let ada = houses(&e)[0];
    knock(&mut e, ada); // the Porter waits at the Door: the house stands still, its notes go stale
    for _ in 0..4 {
        block_on(e.tick());
    }
    let n = e.node(ada).unwrap();
    assert!(
        n.epistemics.confidence < 0.95,
        "Φ has decayed while waiting: {}",
        n.epistemics.confidence
    );
    let purse = n.purse.compute;
    e.graph.service_prices.insert("courier".into(), 14.0);
    assert!(e.sync(ada));
    block_on(e.tick());
    let n = e.node(ada).unwrap();
    assert!(e.events().iter().any(|x| matches!(x, EngineEvent::StateSync { node, cost, .. } if *node == ada && *cost == ORACLE_COST)));
    assert!(
        (purse - n.purse.compute - ORACLE_COST).abs() < 1e-9,
        "15 cr, nothing else: the house still waits at its Door"
    );
    assert_eq!(n.epistemics.confidence, 1.0);
    assert_eq!(n.oak_table.get("price/courier"), Some("14"));
    assert_eq!(n.oracle.map(|o| (o.price, o.tick)), Some((14.0, e.tick)));
    assert_eq!(n.tally.oracle_queries, 1);
    assert_eq!(
        n.status,
        NodeStatus::WaitingAtDoor,
        "the card comes back: the person still decides"
    );
}

/// Every Door answered yes for `ticks` ticks; the number of syncs proposed.
fn syncs_with_every_door_answered(policy: OraclePolicy, ticks: u64) -> usize {
    let config = EngineConfig {
        seed: 3,
        oracle_policy: policy,
        ..EngineConfig::default()
    };
    let mut e = elm_street(config, &names(3), 800.0, 15);
    let mut syncs = 0;
    for _ in 0..ticks {
        let held: Vec<EnvelopeId> = e.held_envelopes().map(|(_, env)| env.id).collect();
        for id in held {
            e.authorize(id);
        }
        block_on(e.tick());
    }
    syncs += e
        .events()
        .iter()
        .filter(|x| matches!(x, EngineEvent::Proposed { kind, .. } if kind == "state_sync"))
        .count();
    syncs
}

#[test]
fn under_person_scout_never_proposes_a_sync() {
    assert!(
        syncs_with_every_door_answered(OraclePolicy::Staff, 40) > 0,
        "the control: Scout asks on his own"
    );
    assert_eq!(syncs_with_every_door_answered(OraclePolicy::Person, 40), 0);
}

#[test]
fn the_week_ends_with_a_note_per_house() {
    let config = EngineConfig {
        seed: 9,
        oracle_policy: OraclePolicy::Person,
        week_ticks: Some(12),
        ..EngineConfig::default()
    };
    let mut e = elm_street(config, &names(4), 800.0, 15);
    let ids = houses(&e);
    let ada = ids[0];
    e.top_up(ada, 25.0);
    for t in 1..=12 {
        let held: Vec<EnvelopeId> = e.held_envelopes().map(|(_, env)| env.id).collect();
        for id in held {
            e.authorize(id);
        }
        block_on(e.tick());
        if t < 12 {
            assert!(!e.events().iter().any(|x| matches!(x, EngineEvent::Halted { note, .. } if note.reason == HaltReason::WeekOver)));
        }
    }
    let notes: Vec<&Note> = e
        .events()
        .iter()
        .filter_map(|x| match x {
            EngineEvent::Halted { note, .. } if note.reason == HaltReason::WeekOver => Some(note),
            _ => None,
        })
        .collect();
    assert_eq!(notes.len(), 4, "one Note per house on Friday");
    for id in &ids {
        let n = e.node(*id).unwrap();
        assert_eq!(n.status, NodeStatus::Halted);
        let w = n
            .note
            .as_ref()
            .unwrap()
            .week
            .as_ref()
            .expect("the week's numbers");
        assert_eq!(w.pieces_total, 15);
        assert_eq!(w.pieces_done, n.tasks_done());
        assert_eq!(w.purse_left, n.purse.compute);
        assert_eq!(w.compute_burned, n.purse.compute_burned);
        assert_eq!(w.liquidity_left, e.graph.liquidity_of(*id));
        assert_eq!(w.swaps_settled, n.tally.swaps_settled);
        assert_eq!(w.swaps_reverted, n.tally.swaps_reverted);
    }
    let ada_week = e
        .node(ada)
        .unwrap()
        .note
        .as_ref()
        .unwrap()
        .week
        .clone()
        .unwrap();
    assert_eq!((ada_week.top_ups, ada_week.top_up_credits), (1, 25.0));
    // The no-score rule holds with the Notes on the table: the essay's numbers, per house, never compared.
    let json = e.state_json();
    for banned in ["reputation", "score", "rank", "leaderboard", "rating"] {
        assert!(!json.contains(banned), "found `{banned}` in the state view");
    }
    // Nothing drafts after Friday.
    block_on(e.tick());
    let after: Vec<&EngineEvent> = e
        .events()
        .iter()
        .filter(|x| {
            x.tick() > 12 && matches!(x, EngineEvent::Burn { .. } | EngineEvent::Proposed { .. })
        })
        .collect();
    assert!(after.is_empty(), "nothing drafts after Friday: {after:?}");
}

#[test]
fn the_price_walk_is_seeded_and_moves_about_once_a_day() {
    let walk = PriceWalk::elm_street(42);
    let run = |w: &PriceWalk| {
        let mut p = 10.0;
        (1..=400)
            .map(|t| {
                p = w.step(t, p);
                p
            })
            .collect::<Vec<f64>>()
    };
    let a = run(&walk);
    assert_eq!(a, run(&walk), "deterministic");
    assert!(a.iter().all(|p| [8.0, 10.0, 12.0, 14.0].contains(p)));
    let moves = a.windows(2).filter(|w| w[0] != w[1]).count();
    assert!(
        (30..=70).contains(&moves),
        "about once in eight ticks over 400: {moves}"
    );
    // In the engine: the truth walks, the Oak Tables do not.
    let config = EngineConfig {
        seed: 1,
        price_walk: Some(walk),
        ..EngineConfig::default()
    };
    let mut e = elm_street(config, &names(2), 800.0, 15);
    let mut seen = std::collections::BTreeSet::new();
    for _ in 0..40 {
        block_on(e.tick());
        seen.insert(e.graph.service_prices["courier"] as i64);
    }
    assert!(seen.len() >= 2, "the truth moved in a week: {seen:?}");
}

#[test]
fn oracle_reprices_the_waiting_hire_without_another_formatting_tax() {
    let mut e = game(11, 2);
    let ada = houses(&e)[0];
    let (send, hire, _, _) = knock(&mut e, ada);
    e.graph.service_prices.insert("courier".into(), 14.0);
    let burned = e.node(ada).unwrap().purse.compute_burned;
    e.sync(ada);
    block_on(e.tick());
    let env = e
        .node(ada)
        .unwrap()
        .held_at_door
        .iter()
        .find(|x| x.id == hire)
        .unwrap();
    assert_eq!(env.requested_liquidity, 14.0);
    assert_eq!(env.tax_paid, 0.5);
    assert_eq!(e.node(ada).unwrap().purse.compute_burned - burned, 15.0);
    e.authorize(hire);
    e.reject(send);
    block_on(e.tick());
    block_on(e.tick());
    assert_eq!(e.node(ada).unwrap().tally.swaps_settled, 1);
}

#[test]
fn yes_to_send_and_hire_pays_twice_but_delivers_once() {
    let mut e = game(11, 2);
    let ada = houses(&e)[0];
    let (send, hire, task, _) = knock(&mut e, ada);
    e.replace_staff(ada, vec![]);
    let burned = e.node(ada).unwrap().purse.compute_burned;
    e.authorize(send);
    e.authorize(hire);
    block_on(e.tick());
    block_on(e.tick());
    assert_eq!(task_state(&e, ada, &task), TaskState::Sent);
    assert_eq!(e.events().iter().filter(|ev| matches!(ev, EngineEvent::Delivered { envelope, .. } if *envelope == send || *envelope == hire)).count(), 1);
    assert_eq!(e.node(ada).unwrap().tally.swaps_settled, 1);
    assert_eq!(e.graph.liquidity_of(ada), 190.0);
    assert!((e.node(ada).unwrap().purse.compute_burned - burned - 12.0).abs() < 1e-9);
}

#[test]
fn an_unaffordable_hire_at_commit_is_counted_as_reverted() {
    let mut e = game(11, 2);
    let ada = houses(&e)[0];
    let (send, hire, _, _) = knock(&mut e, ada);
    e.authorize(hire);
    e.reject(send);
    block_on(e.tick());
    e.replace_staff(ada, vec![]); // Keep the initiator alive, so rejection occurs at commit, not preflight.
    e.node_mut(ada).unwrap().purse.compute = 0.0;
    block_on(e.tick());
    assert_eq!(e.node(ada).unwrap().tally.swaps_reverted, 1);
    assert_eq!(e.graph.liquidity_of(ada), 200.0);
}

#[test]
fn friday_freezes_unanswered_and_in_flight_envelopes_and_notes() {
    let mut e = game(11, 2);
    let ada = houses(&e)[0];
    let (send, hire, _, _) = knock(&mut e, ada);
    e.config.week_ticks = Some(e.tick + 1);
    e.authorize(hire);
    e.reject(send);
    block_on(e.tick());
    let state = e.state_json();
    e.top_up(ada, 20.0);
    assert!(!e.authorize(hire));
    for _ in 0..3 {
        block_on(e.tick());
    }
    assert_eq!(e.state_json(), state);
}

#[test]
fn halted_target_and_unbacked_initiator_revert_but_a_poor_seller_can_sell() {
    for case in 0..3 {
        let mut e = game(11, 2);
        let ada = houses(&e)[0];
        let (send, hire, _, _) = knock(&mut e, ada);
        let target = e
            .node(ada)
            .unwrap()
            .held_at_door
            .iter()
            .find(|h| h.id == hire)
            .unwrap()
            .target;
        match case {
            0 => {}
            1 => {
                e.graph.set_liquidity(ada, 1.0);
            }
            _ => {
                e.graph.set_liquidity(target, 0.0);
            }
        }
        e.authorize(hire);
        e.reject(send);
        block_on(e.tick());
        if case == 0 {
            e.close(target);
        } // Target closes after the Door, before the kerb.
        block_on(e.tick());
        assert_eq!(
            e.node(ada).unwrap().tally.swaps_settled,
            u32::from(case == 2)
        );
        assert_eq!(
            e.node(ada).unwrap().tally.swaps_reverted,
            u32::from(case != 2)
        );
    }
}

#[test]
fn friday_replaces_an_exhaustion_note_and_includes_a_house_with_no_tasks() {
    let mut e = elm_street(
        EngineConfig {
            week_ticks: Some(3),
            oracle_policy: OraclePolicy::Person,
            ..Default::default()
        },
        &names(2),
        5.0,
        15,
    );
    block_on(e.tick());
    for id in houses(&e) {
        assert!(matches!(
            e.node(id).unwrap().note.as_ref().unwrap().reason,
            HaltReason::RunwayExhausted { .. }
        ));
    }
    block_on(e.tick());
    block_on(e.tick());
    for id in houses(&e) {
        assert!(e.node(id).unwrap().note.as_ref().unwrap().week.is_some());
    }
    let mut empty = elm_street(
        EngineConfig {
            week_ticks: Some(1),
            ..Default::default()
        },
        &names(2),
        800.0,
        0,
    );
    block_on(empty.tick());
    for id in houses(&empty) {
        assert_eq!(
            empty
                .node(id)
                .unwrap()
                .note
                .as_ref()
                .unwrap()
                .week
                .as_ref()
                .unwrap()
                .pieces_total,
            0
        );
    }
}

#[test]
fn state_view_numbers_houses_in_supplied_names_order() {
    let mut e = elm_street(
        EngineConfig::default(),
        &["Zoe".into(), "Ada".into(), "Ben".into()],
        800.0,
        15,
    );
    let view = e.state_view();
    let mut numbered: Vec<_> = view
        .nodes
        .iter()
        .filter(|n| n.stage == Stage::House)
        .collect();
    numbered.sort_by_key(|n| n.house_number);
    assert_eq!(
        numbered.iter().map(|n| n.name.as_str()).collect::<Vec<_>>(),
        vec!["Zoe", "Ada", "Ben"]
    );
}
