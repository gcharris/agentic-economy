#[path = "support/elm_playtest.rs"]
mod playtest;
use playtest::*;
#[test]
fn slow_walk_notes_repeat_for_twenty_seeds_and_every_matrix_variant() {
    let mut runs = Vec::new();
    for send_ticks in [2, 3] {
        for week in [40, 48] {
            for cadence in [8, 12] {
                for seed in 0..20 {
                    let v = Variant {
                        budget: 800.0,
                        oracle: 10.0,
                        send_ticks,
                        week,
                        cadence,
                    };
                    let a = run(seed, None, v);
                    assert_eq!(a, run(seed, None, v));
                    runs.push(a);
                }
            }
        }
    }
    if let Ok(path) = std::env::var("ROUND3_PLAYTEST_OUT") {
        std::fs::write(path, serde_json::to_string(&runs).unwrap()).unwrap();
    }
}
