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
