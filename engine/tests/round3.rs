use context_engine::prelude::*;
fn game(tasks: usize, send_ticks: u64, week: u64) -> (Engine, NodeId) {
    let e = elm_street(
        EngineConfig {
            send_ticks,
            week_ticks: Some(week),
            oracle_policy: OraclePolicy::Person,
            ..Default::default()
        },
        &["Ada".into(), "Ben".into()],
        800.0,
        tasks,
    );
    let id = e.nodes.values().find(|n| n.name == "Ada").unwrap().id;
    (e, id)
}
fn card(e: &Engine, id: NodeId) -> EnvelopeId {
    e.node(id)
        .unwrap()
        .held_at_door
        .iter()
        .find(|h| matches!(h.payload, Payload::Dispatch { .. }))
        .unwrap()
        .id
}
#[test]
fn send_charges_at_next_commit_delivers_at_t_plus_duration_minus_one_and_returns_afterwards() {
    for duration in [2, 3] {
        let (mut e, id) = game(4, duration, 40);
        block_on(e.tick());
        let offer = card(&e, id);
        let burned = e.node(id).unwrap().purse.compute_burned;
        assert!(e.answer(id, offer, DoorAnswer::Send));
        for tick in 2..=duration {
            block_on(e.tick());
            assert_eq!(
                e.node(id).unwrap().tasks_done(),
                if tick == duration { 1 } else { 0 }
            );
            assert!(e.node(id).unwrap().held_at_door.is_empty());
        }
        assert!(e.node(id).unwrap().purse.compute_burned >= burned + 10.0);
        assert_eq!(e.node(id).unwrap().porter_back_tick, 1 + duration);
        assert_eq!(e.node(id).unwrap().finished_drafts.len(), duration as usize);
        block_on(e.tick());
        assert_eq!(e.tick, 1 + duration);
        assert_ne!(card(&e, id), offer);
    }
}
#[test]
fn staff_draft_all_pieces_while_waiting_but_only_oldest_piece_knocks() {
    let (mut e, id) = game(4, 3, 40);
    for tick in 1..=4 {
        block_on(e.tick());
        let n = e.node(id).unwrap();
        assert_eq!(n.finished_drafts.len(), tick);
        assert_eq!(n.held_at_door.len(), 2);
        assert_eq!(n.tasks_done(), 0);
    }
    let first = card(&e, id);
    assert!(e.answer(id, first, DoorAnswer::Hire));
    block_on(e.tick());
    block_on(e.tick());
    assert_eq!(e.node(id).unwrap().tasks_done(), 1);
    let second = card(&e, id);
    assert_ne!(second, first);
    let task = e
        .node(id)
        .unwrap()
        .held_at_door
        .iter()
        .find_map(|h| match &h.payload {
            Payload::Dispatch { task_id, .. } => Some(task_id.as_str()),
            _ => None,
        })
        .unwrap();
    assert_eq!(task, e.node(id).unwrap().finished_drafts[1].task_id);
}
#[test]
fn defer_waits_for_the_next_pieces_knock_even_when_it_was_queued_while_porter_was_out() {
    let (mut e, id) = game(4, 3, 40);
    block_on(e.tick());
    let first = card(&e, id);
    assert!(e.answer(id, first, DoorAnswer::Leave));
    block_on(e.tick());
    let second = card(&e, id);
    assert_ne!(second, first);
    assert!(e.answer(id, second, DoorAnswer::Send));
    block_on(e.tick());
    block_on(e.tick());
    assert!(e.node(id).unwrap().held_at_door.is_empty());
    block_on(e.tick());
    assert_eq!(card(&e, id), first);
    assert_eq!(e.node(id).unwrap().finished_drafts.len(), 4);
}

#[test]
fn leave_with_a_finished_queue_follows_its_next_piece_even_when_no_pending_staff_work_remains() {
    for drafted in [2, 4] {
        let (mut e, id) = game(4, 3, 40);
        for _ in 0..drafted {
            block_on(e.tick());
        }
        let first = card(&e, id);
        let next_task = e.node(id).unwrap().finished_drafts[1].task_id.clone();
        assert!(e.answer(id, first, DoorAnswer::Leave));
        assert_eq!(
            e.node(id).unwrap().finished_drafts[0].after_piece.as_ref(),
            Some(&next_task)
        );
        block_on(e.tick());
        let second = card(&e, id);
        assert_ne!(second, first);
        assert!(e.answer(id, second, DoorAnswer::Send));
        block_on(e.tick());
        block_on(e.tick());
        block_on(e.tick());
        assert_eq!(card(&e, id), first);
    }
}
#[test]
fn friday_delivers_due_parcels_and_freezes_later_parcels_without_buying_them_again() {
    let (mut e, id) = game(3, 3, 3);
    block_on(e.tick());
    assert!(e.answer(id, card(&e, id), DoorAnswer::Send));
    block_on(e.tick());
    assert_eq!(e.node(id).unwrap().tasks_done(), 0);
    block_on(e.tick());
    assert_eq!(e.node(id).unwrap().tasks_done(), 1);
    let frozen = e.state_json();
    block_on(e.tick());
    assert_eq!(e.state_json(), frozen);
    let (mut e, id) = game(1, 3, 2);
    block_on(e.tick());
    assert!(e.answer(id, card(&e, id), DoorAnswer::Send));
    block_on(e.tick());
    assert_eq!(e.node(id).unwrap().tasks_done(), 0);
    assert_eq!(e.node(id).unwrap().own_deliveries.len(), 1);
    let frozen = e.state_json();
    block_on(e.tick());
    assert_eq!(e.state_json(), frozen);
}
#[test]
fn close_cancels_future_delivery_but_exhaustion_does_not_cancel_a_paid_parcel() {
    let (mut e, id) = game(1, 3, 40);
    block_on(e.tick());
    assert!(e.answer(id, card(&e, id), DoorAnswer::Send));
    block_on(e.tick());
    let purse = e.node(id).unwrap().purse.compute;
    e.close(id).unwrap();
    block_on(e.tick());
    assert_eq!(e.node(id).unwrap().tasks_done(), 0);
    assert_eq!(e.node(id).unwrap().purse.compute, purse);
    let (mut e, id) = game(1, 3, 40);
    block_on(e.tick());
    assert!(e.answer(id, card(&e, id), DoorAnswer::Send));
    block_on(e.tick());
    e.node_mut(id)
        .unwrap()
        .halt(2, "runway", HaltReason::RunwayExhausted { shortfall: 1.0 });
    block_on(e.tick());
    assert_eq!(e.node(id).unwrap().tasks_done(), 1);
}
#[test]
fn concurrent_staff_cannot_spend_a_command_reservation_or_block_its_accepted_send() {
    let (mut e, id) = game(2, 3, 40);
    block_on(e.tick());
    e.node_mut(id).unwrap().purse.compute = 11.0;
    assert!(e.answer(id, card(&e, id), DoorAnswer::Send));
    e.drain_events();
    block_on(e.tick());
    assert_eq!(e.node(id).unwrap().own_deliveries.len(), 1);
    assert_eq!(e.node(id).unwrap().purse.compute, 1.0);
    assert_eq!(e.node(id).unwrap().status, NodeStatus::Halted);
    block_on(e.tick());
    assert_eq!(e.node(id).unwrap().tasks_done(), 1);
}

#[test]
fn slow_walk_retry_keeps_the_paid_send_and_finished_draft_and_only_buys_a_half_credit_attempt() {
    let (mut e, id) = game(1, 3, 40);
    block_on(e.tick());
    let send = card(&e, id);
    let old_hire = e
        .node(id)
        .unwrap()
        .held_at_door
        .iter()
        .find(|h| matches!(h.payload, Payload::HireService { .. }))
        .unwrap()
        .id;
    let papers = e.node(id).unwrap().oak_table.papers.len();
    e.graph.service_prices.insert("courier".into(), 12.0);
    assert!(e.answer(id, send, DoorAnswer::Hire));
    block_on(e.tick());
    block_on(e.tick());
    assert_eq!(e.node(id).unwrap().tally.swaps_reverted, 1);
    e.node_mut(id).unwrap().oak_table.put("price/courier", "12");
    let burned = e.node(id).unwrap().purse.compute_burned;
    block_on(e.tick());
    assert_eq!(card(&e, id), send);
    let new_hire = e
        .node(id)
        .unwrap()
        .held_at_door
        .iter()
        .find(|h| matches!(h.payload, Payload::HireService { .. }))
        .unwrap()
        .id;
    assert_ne!(old_hire, new_hire);
    assert_eq!(e.node(id).unwrap().finished_drafts.len(), 1);
    assert_eq!(e.node(id).unwrap().oak_table.papers.len(), papers);
    assert!((e.node(id).unwrap().purse.compute_burned - burned - 0.5).abs() < 1e-9);
    assert!(e.answer(id, send, DoorAnswer::Hire));
    block_on(e.tick());
    block_on(e.tick());
    assert_eq!(e.node(id).unwrap().tasks_done(), 1);
    assert!((e.node(id).unwrap().purse.compute_burned - burned - 0.5).abs() < 1e-9);
}
