//! AUDIT-LEDGER #30: the level of detail is a knob. `pack_depth` 2 (the
//! default) packs the houses once the camera is at the City; 3 keeps them live
//! at the City and packs them from the Country up.

use context_engine::node::Stage;
use context_engine::scenarios;
use context_engine::tick::EngineConfig;

fn packed_streets(depth: u8, stage: Stage) -> (usize, usize) {
    let config = EngineConfig {
        pack_depth: depth,
        ..Default::default()
    };
    let mut e = scenarios::city(config, 2, 3, 400.0, 3);
    e.set_active_scale(stage);
    let streets: Vec<_> = e
        .nodes
        .values()
        .filter(|n| n.scale_level == Stage::Street)
        .map(|n| n.id)
        .collect();
    let packed = streets
        .iter()
        .filter(|id| e.node(**id).unwrap().packed.is_some())
        .count();
    (packed, streets.len())
}

#[test]
fn pack_depth_two_packs_the_houses_at_the_city() {
    assert_eq!(EngineConfig::default().pack_depth, 2);
    assert_eq!(packed_streets(2, Stage::City), (2, 2));
}

#[test]
fn pack_depth_three_keeps_the_houses_live_at_the_city_and_packs_them_at_the_country() {
    assert_eq!(packed_streets(3, Stage::City), (0, 2));
    assert_eq!(packed_streets(3, Stage::Country), (2, 2));
}
