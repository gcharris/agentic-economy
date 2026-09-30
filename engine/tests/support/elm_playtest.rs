use context_engine::prelude::*;
use serde_json::{json, Value};
pub const STRATEGIES: [&str; 4] = ["SEND", "BLIND", "MORNING", "CAUTIOUS"];
#[derive(Clone, Copy)]
pub struct Variant {
    pub budget: f64,
    pub cadence: u64,
    pub oracle: f64,
    pub week: u64,
}
impl Default for Variant {
    fn default() -> Self {
        Self {
            budget: 800.0,
            cadence: 8,
            oracle: 15.0,
            week: 40,
        }
    }
}
pub fn run(seed: u64, homogeneous: Option<usize>, v: Variant) -> Value {
    let names: Vec<String> = ["Ada", "Ben", "Cal", "Dee"]
        .iter()
        .map(|n| n.to_string())
        .collect();
    let mut e = elm_street(
        EngineConfig {
            seed,
            oracle_policy: OraclePolicy::Person,
            price_walk: Some(PriceWalk::elm_street(seed)),
            price_period: if v.cadence == 8 {
                None
            } else {
                Some(v.cadence)
            },
            oracle_cost: v.oracle,
            week_ticks: Some(v.week),
            ..Default::default()
        },
        &names,
        v.budget,
        15,
    );
    let ids: Vec<NodeId> = names
        .iter()
        .map(|name| e.nodes.values().find(|n| &n.name == name).unwrap().id)
        .collect();
    let mut asked_day = [None; 4];
    let mut early = [false; 4];
    let mut last_decision = [0; 4];
    let mut finished = [None; 4];
    let mut actions = Vec::new();
    let mut moved = 0;
    let mut kerb = [0; 4];
    let mut price = 10.0;
    for _ in 0..v.week {
        for (i, id) in ids.iter().enumerate() {
            let strategy = homogeneous.unwrap_or((i + seed as usize % 4) % 4);
            let n = e.node(*id).unwrap();
            if n.status == NodeStatus::Halted {
                if matches!(
                    n.note.as_ref().map(|n| &n.reason),
                    Some(HaltReason::RunwayExhausted { .. })
                ) && n.tally.top_up_credits <= 150.0
                {
                    assert!(e.top_up(*id, 50.0));
                    actions.push(json!([e.tick, "top_up", id.0, 50]));
                } else {
                    continue;
                }
            }
            let n = e.node(*id).unwrap();
            let Some(send) = n
                .held_at_door
                .iter()
                .find(|h| matches!(h.payload, Payload::Dispatch { .. }))
            else {
                continue;
            };
            let offer = send.id;
            let task = match &send.payload {
                Payload::Dispatch { task_id, .. } => task_id,
                _ => unreachable!(),
            };
            let hire = n.held_at_door.iter().find(
                |h| matches!(&h.payload,Payload::HireService{task_id:Some(t),..} if t == task),
            );
            let day = e.tick.saturating_sub(1) * 5 / v.week;
            let ask = (strategy == 2 && asked_day[i] != Some(day))
                || (strategy == 3 && n.epistemics.confidence < 0.9);
            let known = hire.is_some_and(|h| match h.payload {
                Payload::HireService { believed_price, .. } => {
                    n.oracle.is_some_and(|o| o.price == believed_price)
                }
                _ => false,
            });
            let use_hire =
                hire.is_some() && (strategy == 1 || strategy == 2 || (strategy == 3 && known));
            let answer = if ask {
                DoorAnswer::Ask
            } else if use_hire {
                DoorAnswer::Hire
            } else {
                DoorAnswer::Send
            };
            let needed = if ask {
                v.oracle
            } else if use_hire {
                0.0
            } else {
                send.compute_weight
            };
            if n.purse.compute < needed && n.tally.top_up_credits <= 150.0 {
                assert!(e.top_up(*id, 50.0));
                actions.push(json!([e.tick, "top_up", id.0, 50]));
            }
            if !e.answer(*id, offer, answer) {
                continue;
            }
            let code = match answer {
                DoorAnswer::Send => 0,
                DoorAnswer::Hire => 1,
                DoorAnswer::Ask => 2,
                DoorAnswer::Leave => 3,
            };
            actions.push(json!([e.tick, "answer", id.0, offer.0, code]));
            if ask {
                asked_day[i] = Some(day);
            } else {
                last_decision[i] = e.tick;
            }
        }
        for h in e.mempool.peek() {
            if h.door_cleared {
                if let Some(i) = ids.iter().position(|id| *id == h.initiator) {
                    kerb[i] += 1;
                }
            }
        }
        block_on(e.tick());
        let now = e.graph.service_prices["courier"];
        if now != price {
            moved += 1;
        }
        price = now;
        for (i, id) in ids.iter().enumerate() {
            let n = e.node(*id).unwrap();
            early[i] |= e.tick < v.week && n.status == NodeStatus::Halted;
            if n.tasks_done() == 15 && finished[i].is_none() {
                finished[i] = Some(e.tick);
            }
            assert!(
                (n.purse.compute - (v.budget - n.purse.compute_burned + n.tally.top_up_credits))
                    .abs()
                    < 1e-8
            );
            assert!(n.tally.top_up_credits <= 200.0);
            assert_eq!(
                n.finished_drafts.len(),
                n.tasks
                    .iter()
                    .filter(|t| t.state != TaskState::Pending)
                    .count()
            );
        }
        assert!((ids.iter().map(|id| e.graph.liquidity_of(*id)).sum::<f64>() - 800.0).abs() < 1e-8);
        e.drain_events();
    }
    let notes:Vec<Value>=ids.iter().enumerate().map(|(i,id)|{
        let n=e.node(*id).unwrap();let note=n.note.as_ref().unwrap();let w=note.week.as_ref().unwrap();
        assert_eq!(w.pieces_done,n.tasks_done());assert_eq!(w.swaps_settled+w.swaps_reverted,kerb[i]);
        json!({"strategy":STRATEGIES[homogeneous.unwrap_or((i+seed as usize%4)%4)],"early":early[i],"last_decision":last_decision[i],"finished":finished[i],"note":note})
    }).collect();
    json!({"seed":seed,"budget":v.budget,"cadence":v.cadence,"oracle":v.oracle,"week":v.week,"moves":moved,"houses":notes,"actions":actions})
}
