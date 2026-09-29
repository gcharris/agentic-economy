//! Stage 3. A city of streets of houses, zoomed to the city, so every
//! envelope crosses the Municipal Clearinghouse instead of a Door or a
//! Letter Slot. The houses know addresses on *other* streets only, so every
//! hire is a cross-parent crossing that routes through the clearinghouse and
//! pays the heavy coordination tax (doc 04: ×1.40). Each house's dispatch to
//! its own street stays same-parent (×1.25). At the end of the tick the
//! Clearinghouse nets the hires and settles only the net differences.
//!
//! Same engine as the house and the street; only the camera moved.

use super::staff;
use crate::ids::NodeId;
use crate::node::{Stage, Task};
use crate::resources::Purse;
use crate::tick::{Engine, EngineConfig};

/// The truth of every house's liquidity at the start of the week.
pub const CITY_HOUSE_LIQUIDITY: f64 = 200.0;
/// The ground-truth courier price the tables cache and drift from.
pub const CITY_COURIER_PRICE: f64 = 10.0;

/// Build a city: one City node, `streets` Street children, `houses_per_street`
/// House grandchildren per street, each with the standard staff. Every
/// house's `known_peers` lists every house on every *other* street.
///
/// The camera is placed at [`Stage::City`] by configuration, exactly as the
/// street scenario places it at [`Stage::Street`], so the effective gate for
/// every house is the Stage 3 Clearinghouse while the houses keep drafting
/// discretely. (Calling `Engine::set_active_scale(Stage::City)` afterwards
/// would fold the houses into their streets' statistical profiles under the
/// LOD rule, and the clearinghouse would have nothing to net.)
pub fn city(
    mut config: EngineConfig,
    streets: usize,
    houses_per_street: usize,
    budget_each: f64,
    tasks_each: usize,
) -> Engine {
    config.active_scale = Stage::City;
    let mut e = Engine::new(config);
    populate_city(
        &mut e,
        None,
        "The City",
        "",
        streets,
        houses_per_street,
        budget_each,
        tasks_each,
    );
    e.graph
        .service_prices
        .insert("courier".into(), CITY_COURIER_PRICE);
    e
}

/// One city's subtree: `streets` × `houses` houses with the statistical staff,
/// `tasks` synthesis tasks and `budget` credits each, the courier price on
/// every Oak Table, and peers on the city's other streets only. `prefix`
/// names the nodes (`""` for the stand-alone city, `"C1.2 "` in a world).
/// Returns the city's id. The caller sets the courier price on the graph.
#[allow(clippy::too_many_arguments)]
pub fn populate_city(
    e: &mut Engine,
    parent: Option<NodeId>,
    name: &str,
    prefix: &str,
    streets: usize,
    houses_per_street: usize,
    budget_each: f64,
    tasks_each: usize,
) -> NodeId {
    let city = e.add_node(name, Stage::City, parent, Purse::new(0.0, 0.0));
    let tag = prefix.to_lowercase().replace([' ', '.'], "");
    // (street, house) pairs, in build order, so peer lists are deterministic.
    let mut houses: Vec<(NodeId, NodeId)> = Vec::with_capacity(streets * houses_per_street);
    for s in 1..=streets {
        let street = e.add_node(
            format!("{prefix}Street {s}"),
            Stage::Street,
            Some(city),
            Purse::new(0.0, 0.0),
        );
        for h in 1..=houses_per_street {
            let house = e.add_node(
                format!("{prefix}S{s} House {h}"),
                Stage::House,
                Some(street),
                Purse::new(budget_each, CITY_HOUSE_LIQUIDITY),
            );
            for t in 1..=tasks_each {
                e.node_mut(house)
                    .unwrap()
                    .tasks
                    .push(Task::synthesis(format!("{tag}s{s}h{h}_task_{t:02}")));
            }
            e.node_mut(house)
                .unwrap()
                .oak_table
                .put("price/courier", format!("{CITY_COURIER_PRICE}"));
            for seat in staff() {
                e.seat(house, seat);
            }
            houses.push((street, house));
        }
    }
    // Local knowledge, not a directory: addresses on the city's other streets only.
    for (street, house) in &houses {
        let peers: Vec<NodeId> = houses
            .iter()
            .filter(|(s, _)| s != street)
            .map(|(_, h)| *h)
            .collect();
        e.node_mut(*house).unwrap().known_peers = peers;
    }
    city
}

/// The whole tree (Stage 4 and up): `countries` roots, each with `cities`
/// cities of `streets` × `houses`, statistical staff at every house. The level
/// of detail keeps houses live at the City and packs them from the Country up
/// (`pack_depth` 3, AUDIT-LEDGER #30); the camera starts at the Country, so the
/// houses are packed and every street is sealed until someone zooms in.
pub fn world_full(
    mut config: EngineConfig,
    countries: usize,
    cities: usize,
    streets: usize,
    houses: usize,
    budget_each: f64,
    tasks_each: usize,
) -> Engine {
    config.active_scale = Stage::House;
    config.pack_depth = 3;
    let mut e = Engine::new(config);
    for i in 1..=countries {
        let country = e.add_node(
            format!("Country {i}"),
            Stage::Country,
            None,
            Purse::new(0.0, 0.0),
        );
        for j in 1..=cities {
            populate_city(
                &mut e,
                Some(country),
                &format!("City {i}.{j}"),
                &format!("C{i}.{j} "),
                streets,
                houses,
                budget_each,
                tasks_each,
            );
        }
    }
    e.graph
        .service_prices
        .insert("courier".into(), CITY_COURIER_PRICE);
    e.set_active_scale(Stage::Country);
    e
}
