//! scenarios::world_full: the whole tree with statistical staff at the houses.
//! At the Country (pack_depth 3) the houses are packed and the streets sealed;
//! at the City they are live again.

use context_engine::prelude::*;

fn count(e: &Engine, s: Stage) -> usize {
    e.nodes.values().filter(|n| n.scale_level == s).count()
}

#[test]
fn the_whole_tree_packs_its_houses_at_the_country_and_unpacks_them_at_the_city() {
    let mut e = world_full(EngineConfig::default(), 1, 3, 2, 3, 400.0, 3);
    assert_eq!(
        [
            count(&e, Stage::Country),
            count(&e, Stage::City),
            count(&e, Stage::Street),
            count(&e, Stage::House)
        ],
        [1, 3, 6, 18]
    );
    assert_eq!(e.config.pack_depth, 3);
    let streets: Vec<NodeId> = e
        .nodes
        .values()
        .filter(|n| n.scale_level == Stage::Street)
        .map(|n| n.id)
        .collect();
    assert!(
        streets.iter().all(|s| e.node(*s).unwrap().packed.is_some()),
        "every street sealed at the Country"
    );
    let cities: Vec<NodeId> = e
        .nodes
        .values()
        .filter(|n| n.scale_level == Stage::City)
        .map(|n| n.id)
        .collect();
    assert!(
        cities.iter().all(|c| e.node(*c).unwrap().packed.is_none()),
        "streets stay unpacked: only houses pack"
    );
    e.set_active_scale(Stage::City);
    assert!(
        streets.iter().all(|s| e.node(*s).unwrap().packed.is_none()),
        "houses live again at the City"
    );
    block_on(e.tick()); // a block runs with the houses live again
    assert!(count(&e, Stage::House) == 18);
}

#[test]
fn at_the_world_the_cities_run_and_the_heartbeat_lands_at_tick_16() {
    // world_full(3, 2, 3, 4) at the World (Stage 5): pack_depth 3 packs the houses and seals the streets; the cities
    // run discretely under three country roots, and the STARK heartbeat lands every stark_period (16) ticks.
    let mut e = world_full(EngineConfig::default(), 3, 2, 3, 4, 800.0, 15);
    e.set_active_scale(Stage::World);
    assert_eq!(
        [
            count(&e, Stage::Country),
            count(&e, Stage::City),
            count(&e, Stage::Street),
            count(&e, Stage::House)
        ],
        [3, 6, 18, 72]
    );
    let of = |e: &Engine, s: Stage| -> Vec<NodeId> {
        e.nodes
            .values()
            .filter(|n| n.scale_level == s)
            .map(|n| n.id)
            .collect()
    };
    assert!(of(&e, Stage::Street)
        .iter()
        .all(|s| e.node(*s).unwrap().packed.is_some()));
    assert!(
        of(&e, Stage::City)
            .iter()
            .all(|c| e.node(*c).unwrap().packed.is_some()),
        "a city's streets fold into it: the city itself runs"
    );
    assert!(
        of(&e, Stage::City)
            .iter()
            .all(|c| e.node(*c).unwrap().status != NodeStatus::Packed),
        "cities live"
    );
    let mut beats = Vec::new();
    for _ in 0..16 {
        block_on(e.tick());
        for ev in e.events() {
            if let EngineEvent::GlobalStateConfirmed {
                tick,
                latency_ticks,
                partitioned,
                ..
            } = ev
            {
                beats.push((*tick, *latency_ticks, partitioned.len()));
            }
        }
    }
    assert_eq!(beats.len(), 1, "one heartbeat in 16 ticks: {beats:?}");
    let (tick, latency, partitioned) = beats[0];
    assert_eq!(tick, 16);
    assert!((8..=32).contains(&latency));
    assert_eq!(partitioned, 0, "the first heartbeat is the baseline");
}
