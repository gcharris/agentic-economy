#[path = "support/elm_playtest.rs"]
mod playtest;
use playtest::*;
#[test]
fn twenty_seed_playtest_and_deterministic_notes() {
    let mut mixed = Vec::new();
    for seed in 0..20 {
        let a = run(seed, None, Variant::default());
        assert_eq!(a, run(seed, None, Variant::default()));
        mixed.push(a);
    }
    // Each experimental axis is also replayed in the browser fixture.
    for budget in [720.0, 800.0] {
        for cadence in [8, 12] {
            for oracle in [10.0, 15.0] {
                for week in [40, 48] {
                    let v = Variant {
                        budget,
                        cadence,
                        oracle,
                        week,
                        send_ticks: 1,
                    };
                    let a = run(7, None, v);
                    assert_eq!(a, run(7, None, v));
                    mixed.push(a);
                }
            }
        }
    }
    if let Ok(path) = std::env::var("PLAYTEST_OUT") {
        std::fs::write(path, serde_json::to_string(&mixed).unwrap()).unwrap();
    }
}
