use context_engine::prelude::*;

fn game(tasks: usize) -> (Engine, NodeId) {
    let e = elm_street(
        EngineConfig {
            oracle_policy: OraclePolicy::Person,
            week_ticks: Some(40),
            ..Default::default()
        },
        &["Ada".into(), "Ben".into()],
        800.0,
        tasks,
    );
    let ada = e.nodes.values().find(|n| n.name == "Ada").unwrap().id;
    (e, ada)
}
fn card(e: &Engine, id: NodeId) -> (EnvelopeId, EnvelopeId, String) {
    let n = e.node(id).unwrap();
    let send = n
        .held_at_door
        .iter()
        .find(|h| matches!(h.payload, Payload::Dispatch { .. }))
        .unwrap();
    let hire = n
        .held_at_door
        .iter()
        .find(|h| matches!(h.payload, Payload::HireService { .. }))
        .unwrap();
    let Payload::Dispatch { task_id, .. } = &send.payload else {
        unreachable!()
    };
    (send.id, hire.id, task_id.clone())
}
#[test]
fn reverted_hire_reuses_the_finished_asset_and_only_buys_a_new_half_credit_attempt() {
    let (mut e, ada) = game(1);
    block_on(e.tick());
    let (send, hire, task) = card(&e, ada);
    let papers = e.node(ada).unwrap().oak_table.papers.len();
    e.graph.service_prices.insert("courier".into(), 12.0);
    assert!(e.answer(ada, send, DoorAnswer::Hire));
    assert_eq!(e.node(ada).unwrap().held_at_door.len(), 1);
    block_on(e.tick());
    block_on(e.tick());
    assert_eq!(e.node(ada).unwrap().tally.swaps_reverted, 1);
    e.node_mut(ada)
        .unwrap()
        .oak_table
        .put("price/courier", "12");
    let burned = e.node(ada).unwrap().purse.compute_burned;
    e.drain_events();
    let report = block_on(e.tick());
    let (again, new_hire, same_task) = card(&e, ada);
    assert_eq!(again, send);
    assert_ne!(new_hire, hire);
    assert_eq!(same_task, task);
    assert_eq!(e.node(ada).unwrap().oak_table.papers.len(), papers);
    assert!((e.node(ada).unwrap().purse.compute_burned - burned - 0.5).abs() < 1e-9);
    assert_eq!(report.envelopes_minted, 1);
    assert!(!e
        .events()
        .iter()
        .any(|ev| matches!(ev, EngineEvent::Burn { node, .. } if *node == ada)));
    assert!(e.answer(ada, again, DoorAnswer::Hire));
    block_on(e.tick());
    block_on(e.tick());
    assert_eq!(e.node(ada).unwrap().tasks_done(), 1);
    assert!(
        (e.node(ada).unwrap().purse.compute_burned - burned - 0.5).abs() < 1e-9,
        "successful hire has no base fee"
    );
    assert_eq!(e.graph.liquidity_of(ada), 188.0);
}
#[test]
fn leave_defers_until_the_new_piece_has_had_its_knock_then_reoffers_without_mint_or_burn() {
    let (mut e, ada) = game(2);
    block_on(e.tick());
    let original = card(&e, ada);
    assert!(e.answer(ada, original.0, DoorAnswer::Leave));
    assert!(e.node(ada).unwrap().held_at_door.is_empty());
    block_on(e.tick());
    let new = card(&e, ada);
    assert_ne!(new.2, original.2);
    assert!(e.answer(ada, new.0, DoorAnswer::Send));
    block_on(e.tick());
    let burned = e.node(ada).unwrap().purse.compute_burned;
    e.drain_events();
    let report = block_on(e.tick());
    assert_eq!(card(&e, ada), original);
    assert_eq!(e.node(ada).unwrap().purse.compute_burned, burned);
    assert_eq!(report.envelopes_minted, 0);
    assert_eq!(e.node(ada).unwrap().finished_drafts.len(), 2);
    assert_eq!(e.node(ada).unwrap().tasks_done(), 1);
}
#[test]
fn leave_at_the_end_of_the_list_returns_next_tick_without_rebuying_anything() {
    let (mut e, ada) = game(1);
    block_on(e.tick());
    let original = card(&e, ada);
    let burned = e.node(ada).unwrap().purse.compute_burned;
    assert!(e.answer(ada, original.0, DoorAnswer::Leave));
    let report = block_on(e.tick());
    assert_eq!(card(&e, ada), original);
    assert_eq!(report.envelopes_minted, 0);
    assert_eq!(e.node(ada).unwrap().purse.compute_burned, burned);
}
#[test]
fn atomic_answers_validate_the_entire_offer_and_cannot_be_applied_twice() {
    let (mut e, ada) = game(1);
    block_on(e.tick());
    let (send, hire, _) = card(&e, ada);
    let state = e.state_json();
    assert!(!e.answer(NodeId(0), send, DoorAnswer::Hire));
    assert!(!e.answer(ada, EnvelopeId(0), DoorAnswer::Send));
    assert_eq!(e.state_json(), state);
    assert!(e.answer(ada, send, DoorAnswer::Hire));
    let state = e.state_json();
    assert!(!e.answer(ada, hire, DoorAnswer::Send));
    assert_eq!(e.state_json(), state);
    block_on(e.tick());
    block_on(e.tick());
    assert_eq!(e.node(ada).unwrap().tasks_done(), 1);
    assert!(
        !e.events().iter().any(|ev| matches!(
            ev,
            EngineEvent::Rejected {
                gate: Stage::House,
                ..
            }
        )),
        "complement is withdrawn, not rejected"
    );
}
#[test]
fn the_pocket_is_finite_and_closing_leaves_a_note_and_refuses_further_topups() {
    let (mut e, ada) = game(1);
    for _ in 0..4 {
        assert!(e.top_up(ada, 50.0));
    }
    let before = e.state_json();
    assert!(!e.top_up(ada, 50.0));
    assert!(!e.top_up(ada, f64::NAN));
    assert_eq!(e.state_json(), before);
    let note = e.close(ada).unwrap();
    assert_eq!(note.week.unwrap().top_up_credits, 200.0);
    assert!(!e.top_up(ada, 1.0));
    assert!(e.close(ada).is_none());
    block_on(e.tick());
    assert_eq!(e.node(ada).unwrap().status, NodeStatus::Halted);
}
#[test]
fn oracle_cost_is_configurable_and_a_refused_atomic_ask_changes_nothing() {
    let (mut e, ada) = game(1);
    e.config.oracle_cost = 10.0;
    block_on(e.tick());
    let (send, _, _) = card(&e, ada);
    let burned = e.node(ada).unwrap().purse.compute_burned;
    assert!(e.answer(ada, send, DoorAnswer::Ask));
    block_on(e.tick());
    assert_eq!(e.node(ada).unwrap().purse.compute_burned - burned, 10.0);
    e.node_mut(ada).unwrap().purse.compute = 5.0;
    let before = e.state_json();
    assert!(!e.answer(ada, send, DoorAnswer::Ask));
    assert_eq!(e.state_json(), before);
}

#[test]
fn ask_is_atomic_against_other_answers_and_regular_cadence_moves_only_on_boundaries() {
    let (mut e, ada) = game(1);
    e.config.price_walk = Some(PriceWalk::elm_street(7));
    e.config.price_period = Some(12);
    block_on(e.tick());
    let (send, _, _) = card(&e, ada);
    assert!(e.answer(ada, send, DoorAnswer::Ask));
    let state = e.state_json();
    assert!(!e.answer(ada, send, DoorAnswer::Hire));
    assert!(!e.answer(ada, send, DoorAnswer::Leave));
    assert_eq!(e.state_json(), state);
    let mut previous = 10.0;
    for tick in 2..=36 {
        block_on(e.tick());
        let price = e.graph.service_prices["courier"];
        assert_eq!(price != previous, tick % 12 == 0);
        previous = price;
    }
}
#[test]
fn closing_with_an_approved_hire_does_not_pay_or_deliver_later() {
    let (mut e, ada) = game(1);
    block_on(e.tick());
    let (send, _, _) = card(&e, ada);
    assert!(e.answer(ada, send, DoorAnswer::Hire));
    block_on(e.tick());
    let note = e.close(ada).unwrap();
    let purse = e.node(ada).unwrap().purse.compute;
    let liq = e.graph.liquidity_of(ada);
    block_on(e.tick());
    block_on(e.tick());
    assert_eq!(e.node(ada).unwrap().purse.compute, purse);
    assert_eq!(e.graph.liquidity_of(ada), liq);
    assert_eq!(e.node(ada).unwrap().tasks_done(), 0);
    assert_eq!(e.node(ada).unwrap().note.as_ref().unwrap(), &note);
}

#[test]
fn a_finished_asset_survives_an_unaffordable_attempt_then_a_pocket_topup() {
    let (mut e, ada) = game(1);
    block_on(e.tick());
    let (send, _, task) = card(&e, ada);
    assert!(e.answer(ada, send, DoorAnswer::Hire));
    e.graph.service_prices.insert("courier".into(), 12.0);
    block_on(e.tick());
    block_on(e.tick());
    let papers = e.node(ada).unwrap().oak_table.papers.len();
    e.node_mut(ada).unwrap().purse.compute = 0.1;
    block_on(e.tick());
    assert_eq!(e.node(ada).unwrap().status, NodeStatus::Halted);
    assert!(e.top_up(ada, 50.0));
    e.drain_events();
    block_on(e.tick());
    assert_eq!(card(&e, ada).0, send);
    assert_eq!(card(&e, ada).2, task);
    assert_eq!(e.node(ada).unwrap().oak_table.papers.len(), papers);
    assert!(!e
        .events()
        .iter()
        .any(|ev| matches!(ev,EngineEvent::Burn{node,..} if *node==ada)));
}
#[test]
fn the_retry_switch_retains_the_original_no_means_abandon_behavior() {
    let (mut e, ada) = game(1);
    e.config.retry_drafts = false;
    block_on(e.tick());
    let (send, _, task) = card(&e, ada);
    assert!(e.answer(ada, send, DoorAnswer::Leave));
    block_on(e.tick());
    block_on(e.tick());
    assert!(e.node(ada).unwrap().held_at_door.is_empty());
    assert!(e.node(ada).unwrap().finished_drafts.is_empty());
    assert_eq!(
        e.node(ada)
            .unwrap()
            .tasks
            .iter()
            .find(|t| t.id == task)
            .unwrap()
            .state,
        TaskState::Rejected
    );
}
