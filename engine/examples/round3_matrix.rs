#[path = "../tests/support/elm_playtest.rs"]
mod playtest;
use playtest::*;
use serde_json::json;
fn main() {
    let mut rows = Vec::new();
    let mut raw = Vec::new();
    for send_ticks in [1, 2, 3] {
        for budget in [800.0] {
            for cadence in [8, 12] {
                for oracle in [10.0] {
                    for week in [40, 48] {
                        let v = Variant {
                            budget,
                            cadence,
                            oracle,
                            week,
                            send_ticks,
                        };
                        for control in [None, Some(0), Some(1), Some(2), Some(3)] {
                            let runs: Vec<_> = (0..20).map(|seed| run(seed, control, v)).collect();
                            for (s, label) in STRATEGIES.iter().enumerate() {
                                if control.is_some_and(|c| c != s) {
                                    continue;
                                }
                                let houses: Vec<_> = runs
                                    .iter()
                                    .flat_map(|r| r["houses"].as_array().unwrap())
                                    .filter(|h| h["strategy"] == *label)
                                    .collect();
                                let mean = |key: &str| {
                                    houses
                                        .iter()
                                        .map(|h| h["note"]["week"][key].as_f64().unwrap())
                                        .sum::<f64>()
                                        / houses.len() as f64
                                };
                                let mut row = json!({"send_ticks":send_ticks,"budget":budget,"cadence":cadence,"oracle":oracle,"week":week,"street":if control.is_none(){"mixed"}else{"control"},"strategy":label,"n":houses.len(),
                    "complete":houses.iter().filter(|h|h["note"]["week"]["pieces_done"]==15).count(),
                    "complete_without_pocket":houses.iter().filter(|h|h["note"]["week"]["pieces_done"]==15&&h["note"]["week"]["top_up_credits"].as_f64()==Some(0.0)).count(),
                    "exhausted":houses.iter().filter(|h|h["early"]==true).count(),
                    "moves":runs.iter().map(|r|r["moves"].as_f64().unwrap()).sum::<f64>()/20.0});
                                for key in [
                                    "pieces_done",
                                    "compute_burned",
                                    "purse_left",
                                    "liquidity_left",
                                    "swaps_settled",
                                    "swaps_reverted",
                                    "oracle_queries",
                                    "top_up_credits",
                                ] {
                                    row[key] = json!(mean(key));
                                }
                                rows.push(row);
                            }
                            raw.extend(runs);
                        }
                    }
                }
            }
        }
    }
    let historical: serde_json::Value = serde_json::from_str(include_str!(
        "../docs/review-assets/round-2-2026-09-30/matrix.json"
    ))
    .unwrap();
    for row in rows.iter().filter(|r| r["send_ticks"] == 1) {
        let old = historical
            .as_array()
            .unwrap()
            .iter()
            .find(|r| {
                ["budget", "cadence", "oracle", "week", "street", "strategy"]
                    .iter()
                    .all(|k| r[k] == row[k])
            })
            .unwrap();
        for key in old.as_object().unwrap().keys() {
            if let (Some(now), Some(before)) = (row[key].as_f64(), old[key].as_f64()) {
                assert!((now - before).abs() < 1e-9, "round-two control {key}");
            } else {
                assert_eq!(&row[key], &old[key], "round-two control {key}");
            }
        }
    }
    let base = std::env::args().nth(1).expect("output prefix");
    std::fs::write(
        format!("{base}.json"),
        serde_json::to_string_pretty(&json!({"rows":rows,"runs":raw})).unwrap(),
    )
    .unwrap();
    let keys = [
        "send_ticks",
        "budget",
        "cadence",
        "oracle",
        "week",
        "street",
        "strategy",
        "n",
        "pieces_done",
        "compute_burned",
        "purse_left",
        "liquidity_left",
        "swaps_settled",
        "swaps_reverted",
        "oracle_queries",
        "top_up_credits",
        "complete",
        "complete_without_pocket",
        "exhausted",
        "moves",
    ];
    let mut csv = keys.join(",") + "\n";
    for row in rows {
        csv += &keys
            .iter()
            .map(|k| {
                row[k]
                    .as_str()
                    .map(String::from)
                    .unwrap_or_else(|| row[k].to_string())
            })
            .collect::<Vec<_>>()
            .join(",");
        csv.push('\n');
    }
    std::fs::write(format!("{base}.csv"), csv).unwrap();
    println!("1200 street-weeks (800 experimental + 400 matched controls), 4800 house-weeks written to {base}.json/.csv");
}
