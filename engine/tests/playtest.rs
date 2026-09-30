//! Reproducible Elm Street person strategies. No direct state mutation; actions use the public hands API.
use context_engine::prelude::*;
use serde_json::{json, Value};

const STRATEGIES: [&str; 4] = ["SEND", "BLIND", "MORNING", "CAUTIOUS"];

fn run(seed: u64, homogeneous: Option<usize>) -> Value {
    let names: Vec<String> = ["Ada", "Ben", "Cal", "Dee"]
        .iter()
        .map(|n| n.to_string())
        .collect();
    let mut e = elm_street(
        EngineConfig {
            seed,
            oracle_policy: OraclePolicy::Person,
            price_walk: Some(PriceWalk::elm_street(seed)),
            week_ticks: Some(40),
            ..Default::default()
        },
        &names,
        800.0,
        15,
    );
    let ids: Vec<NodeId> = names
        .iter()
        .map(|name| e.nodes.values().find(|n| &n.name == name).unwrap().id)
        .collect();
    let mut asked_day = [None; 4];
    let mut early = [false; 4];
    let mut last_decision = [0; 4];
    let mut actions = Vec::new();
    let mut moved = 0;
    let mut kerb = [0; 4];
    let mut price = 10.0;
    for _ in 0..40 {
        for (i, id) in ids.iter().enumerate() {
            let strategy = homogeneous.unwrap_or((i + seed as usize % 4) % 4);
            let n = e.node(*id).unwrap();
            if n.status == NodeStatus::Halted {
                continue;
            }
            let send = n
                .held_at_door
                .iter()
                .find(|h| matches!(h.payload, Payload::Dispatch { .. }));
            let Some(send) = send else {
                continue;
            };
            let send_id = send.id;
            let task = match &send.payload {
                Payload::Dispatch { task_id, .. } => task_id,
                _ => unreachable!(),
            };
            let hire = n.held_at_door.iter().find(|h| matches!(&h.payload, Payload::HireService { task_id: Some(t), .. } if t == task));
            let hire_id = hire.map(|h| h.id);
            let day = (e.tick.saturating_sub(1)) / 8;
            let ask = (strategy == 2 && asked_day[i] != Some(day))
                || (strategy == 3 && n.epistemics.confidence < 0.9);
            if ask {
                asked_day[i] = Some(day);
                assert!(e.sync(*id));
                actions.push(json!([e.tick, "sync", id.0]));
                continue;
            }
            let known = hire.is_some_and(|h| match h.payload {
                Payload::HireService { believed_price, .. } => {
                    n.oracle.is_some_and(|o| o.price == believed_price)
                }
                _ => false,
            });
            let use_hire =
                hire_id.is_some() && (strategy == 1 || strategy == 2 || (strategy == 3 && known));
            let chosen = if use_hire { hire_id.unwrap() } else { send_id };
            assert!(e.authorize(chosen));
            actions.push(json!([e.tick, "approve", chosen.0]));
            let refused = if use_hire { Some(send_id) } else { hire_id };
            if let Some(no) = refused {
                assert!(e.reject(no));
                actions.push(json!([e.tick, "reject", no.0]));
            }
            last_decision[i] = e.tick;
        }
        // These are the hires that actually reach the kerb during this week, not approvals queued on Friday.
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
            early[i] |= e.tick < 40 && n.status == NodeStatus::Halted;
            assert!(
                (n.purse.compute - (800.0 - n.purse.compute_burned + n.tally.top_up_credits)).abs()
                    < 1e-8
            );
        }
        let total: f64 = ids.iter().map(|id| e.graph.liquidity_of(*id)).sum();
        assert!((total - 800.0).abs() < 1e-8, "liquidity conserved");
        e.drain_events();
    }
    let notes: Vec<Value> = ids.iter().enumerate().map(|(i, id)| {
        let n = e.node(*id).unwrap(); let note = n.note.as_ref().unwrap(); let w = note.week.as_ref().unwrap();
        assert_eq!(w.pieces_done, n.tasks_done());
        assert_eq!(w.swaps_settled + w.swaps_reverted, kerb[i]);
        json!({"strategy": STRATEGIES[homogeneous.unwrap_or((i + seed as usize % 4) % 4)], "early": early[i], "last_decision": last_decision[i], "note": note})
    }).collect();
    json!({"seed":seed, "moves":moved, "houses":notes, "actions":actions})
}

#[test]
fn twenty_seed_playtest_and_deterministic_notes() {
    let mixed: Vec<Value> = (0..20)
        .map(|seed| {
            let a = run(seed, None);
            assert_eq!(a, run(seed, None));
            a
        })
        .collect();
    let controls: Vec<Value> = (0..4)
        .flat_map(|s| (0..20).map(move |seed| run(seed, Some(s))))
        .collect();
    if let Ok(path) = std::env::var("PLAYTEST_OUT") {
        std::fs::write(
            path,
            serde_json::to_string_pretty(&json!({"mixed":mixed,"controls":controls})).unwrap(),
        )
        .unwrap();
    }
    for (label, runs) in [("mixed", &mixed), ("homogeneous controls", &controls)] {
        println!("{label}: strategy, pieces, burned, purse, liquidity, settled, reverted, oracle, early/observations, last decision");
        for strategy in STRATEGIES {
            let rows: Vec<&Value> = runs
                .iter()
                .flat_map(|r| r["houses"].as_array().unwrap())
                .filter(|h| h["strategy"] == strategy)
                .collect();
            let mean = |key: &str| {
                rows.iter()
                    .map(|h| h["note"]["week"][key].as_f64().unwrap())
                    .sum::<f64>()
                    / rows.len() as f64
            };
            println!(
                "{strategy}, {:.2}, {:.2}, {:.2}, {:.2}, {:.2}, {:.2}, {:.2}, {}/{}, {:.2}",
                mean("pieces_done"),
                mean("compute_burned"),
                mean("purse_left"),
                mean("liquidity_left"),
                mean("swaps_settled"),
                mean("swaps_reverted"),
                mean("oracle_queries"),
                rows.iter().filter(|h| h["early"] == true).count(),
                rows.len(),
                rows.iter()
                    .map(|h| h["last_decision"].as_f64().unwrap())
                    .sum::<f64>()
                    / rows.len() as f64
            );
        }
    }
    println!(
        "mean price moves/week: {:.2}",
        mixed
            .iter()
            .map(|r| r["moves"].as_f64().unwrap())
            .sum::<f64>()
            / 20.0
    );
}
