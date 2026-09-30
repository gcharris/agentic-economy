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
pub use city::{city, populate_city, world_full, CITY_COURIER_PRICE, CITY_HOUSE_LIQUIDITY};
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
pub fn street(config: EngineConfig, houses: usize, budget_each: f64, tasks_each: usize) -> Engine {
    let names: Vec<String> = (1..=houses).map(|i| format!("House {i}")).collect();
    street_of(config, &names, budget_each, tasks_each, Stage::Street)
}

/// Doc 06's names for the table when none are given (`serve --names` overrides them).
pub const ELM_NAMES: [&str; 6] = ["Ada", "Ben", "Cal", "Dee", "Eve", "Fin"];

/// A Week on Elm Street (doc 06): the street as a game. One house per person, named for them, each with the
/// street's purse, 200 liquidity and its list of work. The engine runs at the House, so every Door knocks for
/// its person (the TV looks at the street without moving the engine); a hire the person says yes to crosses the
/// kerb at the next tick. The week, the price walk and who asks the oracle come from `config`.
/// The week's pieces of work, named as a person writes them on the list (doc 06 §3): the game's houses draft
/// "the council letter", not "h1_task_01". Only the game's street (built at the House, so every Door knocks) uses
/// them; the demo's street keeps its ids, so its recorded trace and its takes still read.
pub const PIECES: [&str; 15] = [
    "the council letter",
    "the insurance claim",
    "the week's accounts",
    "the tenancy renewal",
    "the school forms",
    "the garden quote",
    "the dentist's paperwork",
    "the car's registration",
    "the wedding reply",
    "the grant application",
    "the reading list",
    "the photo album",
    "the parcel note",
    "the holiday booking",
    "the Friday summary",
];

fn piece_name(scale: Stage, house: usize, t: usize) -> String {
    if scale != Stage::House {
        return format!("h{house}_task_{t:02}");
    }
    let name = PIECES[(t - 1) % PIECES.len()];
    if t <= PIECES.len() {
        name.to_string()
    } else {
        format!("{name} ({})", (t - 1) / PIECES.len() + 1)
    }
}

pub fn elm_street(
    config: EngineConfig,
    names: &[String],
    budget_each: f64,
    tasks_each: usize,
) -> Engine {
    street_of(config, names, budget_each, tasks_each, Stage::House)
}

fn street_of(
    mut config: EngineConfig,
    names: &[String],
    budget_each: f64,
    tasks_each: usize,
    scale: Stage,
) -> Engine {
    config.active_scale = scale;
    let mut e = Engine::new(config);
    let city = e.add_node("The City", Stage::City, None, Purse::new(0.0, 0.0));
    let street = e.add_node(
        "Elm Street",
        Stage::Street,
        Some(city),
        Purse::new(0.0, 0.0),
    );
    let mut ids = Vec::new();
    for (k, name) in names.iter().enumerate() {
        let i = k + 1;
        let h = e.add_node(
            name.clone(),
            Stage::House,
            Some(street),
            Purse::new(budget_each, 200.0),
        );
        for t in 1..=tasks_each {
            e.node_mut(h)
                .unwrap()
                .tasks
                .push(Task::synthesis(piece_name(scale, i, t)));
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
