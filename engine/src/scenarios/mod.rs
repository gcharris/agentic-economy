//! Ready-made worlds. The same engine, seeded so a run replays exactly.
//! One file per stage; each stage's scenario is a pure function of its config.

use crate::agents::statistical::{Inspector, Porter, Scout, Scribble, Steward};
use crate::node::{Stage, Task};
use crate::resources::Purse;
use crate::tick::{Engine, EngineConfig};
use std::sync::Arc;

pub mod city;
pub mod drift;
pub mod high_court;
pub mod world;
pub use city::{city, CITY_COURIER_PRICE, CITY_HOUSE_LIQUIDITY};
pub use drift::{move_truth, street_under_drift, MOVED_PRICE, STALE_PRICE};
pub use high_court::{forged_country, forged_street, CourtWorld, Transferor};
pub use world::{world, Chancellor};

/// Stage 1. One house, one purse, the oak table, the door. The parent
/// street exists only as the outside world the Porter sends to.
pub fn house(mut config: EngineConfig, budget: f64, tasks: usize) -> Engine {
    config.active_scale = Stage::House;
    let mut e = Engine::new(config);
    let street = e.add_node("Elm Street", Stage::Street, None, Purse::new(0.0, 0.0));
    let house = e.add_node(
        "The House",
        Stage::House,
        Some(street),
        Purse::new(budget, 100.0),
    );
    for i in 1..=tasks {
        e.node_mut(house)
            .unwrap()
            .tasks
            .push(Task::synthesis(format!("doc_synthesis_{i:02}")));
    }
    e.node_mut(house)
        .unwrap()
        .oak_table
        .put("price/courier", "10");
    e.graph.service_prices.insert("courier".into(), 10.0);
    for seat in staff() {
        e.seat(house, seat);
    }
    e
}

/// Stage 2. A street of houses that hire each other's couriers through the
/// Letter Slot. Zoomed to the street, no human is asked; the atomic swap
/// verifies instead. Truth drifts on each table; stale prices revert.
pub fn street(
    mut config: EngineConfig,
    houses: usize,
    budget_each: f64,
    tasks_each: usize,
) -> Engine {
    config.active_scale = Stage::Street;
    let mut e = Engine::new(config);
    let city = e.add_node("The City", Stage::City, None, Purse::new(0.0, 0.0));
    let street = e.add_node(
        "Elm Street",
        Stage::Street,
        Some(city),
        Purse::new(0.0, 0.0),
    );
    let mut ids = Vec::new();
    for i in 1..=houses {
        let h = e.add_node(
            format!("House {i}"),
            Stage::House,
            Some(street),
            Purse::new(budget_each, 200.0),
        );
        for t in 1..=tasks_each {
            e.node_mut(h)
                .unwrap()
                .tasks
                .push(Task::synthesis(format!("h{i}_task_{t:02}")));
        }
        e.node_mut(h).unwrap().oak_table.put("price/courier", "10");
        for seat in staff() {
            e.seat(h, seat);
        }
        ids.push(h);
    }
    for h in &ids {
        let peers: Vec<_> = ids.iter().copied().filter(|p| p != h).collect();
        e.node_mut(*h).unwrap().known_peers = peers;
    }
    e.graph.service_prices.insert("courier".into(), 10.0);
    e
}

pub fn staff() -> Vec<Arc<dyn crate::node::Agent>> {
    vec![
        Arc::new(Scout::default()),
        Arc::new(Scribble::default()),
        Arc::new(Inspector::default()),
        Arc::new(Steward),
        Arc::new(Porter),
    ]
}
