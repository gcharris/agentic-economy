//! `house`: a week with a helper, in the terminal.
//!
//! ```text
//! cargo run --release --bin house -- --ticks 40 --budget 800 --tasks 15 --door hold:4
//! cargo run --release --bin house -- --door interactive
//! cargo run --release --bin house -- --hidden-cost --budget 300
//! ```

use context_engine::prelude::*;
use std::io::{self, BufRead, Write};

#[derive(Clone, Debug)]
enum DoorMode {
    Auto,
    Hold(u64),
    Reject,
    Interactive,
}

struct Args {
    ticks: u64,
    budget: f64,
    tasks: usize,
    seed: u64,
    door: DoorMode,
    cost_visible: bool,
    json: bool,
    scenario: String,
}

fn parse_args() -> Args {
    let mut a = Args { ticks: 40, budget: 800.0, tasks: 15, seed: 7, door: DoorMode::Hold(3), cost_visible: true, json: false, scenario: "house".into() };
    let mut it = std::env::args().skip(1);
    while let Some(k) = it.next() {
        match k.as_str() {
            "--ticks" => a.ticks = it.next().and_then(|v| v.parse().ok()).unwrap_or(a.ticks),
            "--budget" => a.budget = it.next().and_then(|v| v.parse().ok()).unwrap_or(a.budget),
            "--tasks" => a.tasks = it.next().and_then(|v| v.parse().ok()).unwrap_or(a.tasks),
            "--seed" => a.seed = it.next().and_then(|v| v.parse().ok()).unwrap_or(a.seed),
            "--scenario" => a.scenario = it.next().unwrap_or(a.scenario),
            "--hidden-cost" => a.cost_visible = false,
            "--json" => a.json = true,
            "--door" => {
                let v = it.next().unwrap_or_default();
                a.door = match v.as_str() {
                    "auto" => DoorMode::Auto,
                    "reject" => DoorMode::Reject,
                    "interactive" => DoorMode::Interactive,
                    s if s.starts_with("hold:") => DoorMode::Hold(s[5..].parse().unwrap_or(3)),
                    _ => DoorMode::Hold(3),
                };
            }
            _ => {}
        }
    }
    a
}

const GOLD: &str = "\x1b[38;5;179m";
const DIM: &str = "\x1b[2m";
const CYAN: &str = "\x1b[38;5;73m";
const RED: &str = "\x1b[38;5;167m";
const GREEN: &str = "\x1b[38;5;108m";
const BOLD: &str = "\x1b[1m";
const RESET: &str = "\x1b[0m";

fn banner(a: &Args, executor: &str) {
    let door = match &a.door {
        DoorMode::Auto => "auto-approve".to_string(),
        DoorMode::Hold(n) => format!("hold {n} ticks, then approve"),
        DoorMode::Reject => "reject everything".to_string(),
        DoorMode::Interactive => "you, at the keyboard".to_string(),
    };
    println!("{GOLD}{BOLD}╔══════════════════════════════════════════════════════════════════════╗{RESET}");
    println!("{GOLD}{BOLD}║  THE CONTEXT ENGINE · Stage 1 · The House                            ║{RESET}");
    println!("{GOLD}{BOLD}╚══════════════════════════════════════════════════════════════════════╝{RESET}");
    println!("{DIM}  purse {:.0} cr · {} tasks · door: {door} · seed {} · cost {} · executor {executor}{RESET}", a.budget, a.tasks, a.seed, if a.cost_visible { "visible" } else { "hidden" });
    println!("{DIM}  Rule: thought is free to look; the send waits at the door; the purse does not drain while it waits.{RESET}");
    println!();
}

#[tokio::main]
async fn main() {
    let a = parse_args();
    let config = EngineConfig { seed: a.seed, cost_visible: a.cost_visible, ..Default::default() };
    let mut engine = match a.scenario.as_str() {
        "street" => street(config, 6, a.budget, a.tasks),
        _ => house(config, a.budget, a.tasks),
    };
    engine.set_executor(Box::new(TokioExecutor)); // same engine, all cores
    if !a.json {
        banner(&a, engine.executor_name());
    }

    let mut held_since: std::collections::BTreeMap<EnvelopeId, u64> = Default::default();
    let stdin = io::stdin();

    for _ in 0..a.ticks {
        let report = engine.tick().await;
        let events = engine.drain_events();
        if a.json {
            println!("{}", serde_json::to_string(&serde_json::json!({"report": report, "events": events})).unwrap());
        } else {
            print_tick(&engine, &report, &events);
        }

        // The person at the door.
        let held: Vec<(EnvelopeId, NodeId, String, f64)> = engine.held_envelopes().map(|(n, e)| (e.id, n.id, e.payload.describe(), e.compute_weight)).collect();
        for (id, _node, desc, cost) in held {
            let since = *held_since.entry(id).or_insert(report.tick);
            match &a.door {
                DoorMode::Auto => {
                    engine.authorize(id);
                }
                DoorMode::Reject => {
                    engine.reject(id);
                }
                DoorMode::Hold(n) => {
                    if report.tick - since >= *n {
                        engine.authorize(id);
                        if !a.json {
                            println!("  {GREEN}✓ you said yes after {n} ticks at the door → {desc}{RESET}");
                        }
                    }
                }
                DoorMode::Interactive => {
                    print!("  {GOLD}🚪 The Porter is at the Door:{RESET} {desc} ({cost:.0} cr). Nothing burns while you decide. [y/n] ");
                    io::stdout().flush().ok();
                    let mut line = String::new();
                    stdin.lock().read_line(&mut line).ok();
                    if line.trim().eq_ignore_ascii_case("y") {
                        engine.authorize(id);
                    } else {
                        engine.reject(id);
                    }
                }
            }
        }

        if engine.nodes.values().all(|n| n.status == NodeStatus::Halted || (n.tasks.iter().all(|t| matches!(t.state, TaskState::Sent | TaskState::Rejected)) && n.held_at_door.is_empty())) {
            break;
        }
    }

    if !a.json {
        print_receipt(&mut engine);
    }
}

fn print_tick(engine: &Engine, r: &TickReport, events: &[EngineEvent]) {
    let t = format!("{DIM}t{:02}{RESET}", r.tick);
    let burns: Vec<String> = events.iter().filter_map(|e| match e {
        EngineEvent::Burn { seat, credits, tier, cache_hit, .. } => Some(format!("{seat} {credits:.1}cr{}{}", if *cache_hit { "·hit" } else { "" }, DIM.to_string() + &format!("[{}]", &tier[..4]) + RESET)),
        _ => None,
    }).collect();
    if !burns.is_empty() {
        println!("{t}  {GOLD}    DRAFT{RESET}  {}", burns.join("  "));
    }
    for e in events {
        match e {
            EngineEvent::Thought { seat, text, .. } => println!("{t}  {DIM}{seat:>9}{RESET}  {text}"),
            EngineEvent::Proposed { envelope, kind, tax_paid, .. } => println!("{t}  {CYAN}  COLLECT{RESET}  {envelope} {kind} · crossing tax {tax_paid:.1} cr"),
            EngineEvent::AwaitingHumanSignature { description, cost, .. } => println!("{t}  {GOLD}   VERIFY{RESET}  🚪 The Porter is at the Door: {description} ({cost:.0} cr). Nothing burns while you decide."),
            EngineEvent::Approved { envelope, gate, .. } => println!("{t}  {GREEN}   VERIFY{RESET}  {envelope} approved at {}", gate.gate_name()),
            EngineEvent::Rejected { envelope, reason, sunk_compute, .. } => println!("{t}  {RED}   VERIFY{RESET}  {envelope} rejected: {reason} · sunk {sunk_compute:.1} cr"),
            EngineEvent::Delivered { envelope, .. } => println!("{t}  {GREEN}   COMMIT{RESET}  {envelope} delivered · root {}", r.root.short()),
            EngineEvent::Settled { amount, from, to, .. } => println!("{t}  {GREEN}   COMMIT{RESET}  {amount:.1} settled {from} → {to}"),
            EngineEvent::StateSync { cost, confidence_before, .. } => println!("{t}  {CYAN}   COMMIT{RESET}  ✦ state sync · paid {cost:.0} cr · Φ {:.0}% → 100%", confidence_before * 100.0),
            EngineEvent::Halted { note, .. } => println!("{t}  {RED}{BOLD}{note}{RESET}"),
            EngineEvent::DroppedByCourier { reason, .. } => println!("{t}  {RED}  COURIER{RESET}  dropped: {reason}"),
            EngineEvent::GlobalStateConfirmed { root, latency_ticks, .. } => println!("{t}  {GOLD}    STARK{RESET}  ⚡ global state confirmed · root {} · finality {latency_ticks} ticks", root.short()),
            _ => {}
        }
    }
    for n in engine.nodes.values().filter(|n| n.scale_level == Stage::House) {
        let status = match n.status {
            NodeStatus::Active => format!("{GREEN}active{RESET}"),
            NodeStatus::WaitingAtDoor => format!("{GOLD}waiting at the door · 0.0 cr idle burn{RESET}"),
            NodeStatus::Halted => format!("{RED}halted{RESET}"),
            NodeStatus::Packed => format!("{DIM}packed{RESET}"),
            NodeStatus::Partitioned => format!("{RED}partitioned{RESET}"),
        };
        println!("{t}  {DIM}    PURSE{RESET}  {:.1} cr · Φ {:.1}% · {}/{} sent · {status}", n.purse.compute, n.epistemics.confidence * 100.0, n.tasks_done(), n.tasks.len());
    }
}

fn print_receipt(engine: &mut Engine) {
    println!();
    println!("{GOLD}{BOLD}── THE NOTE ON THE TABLE ─────────────────────────────────────────────{RESET}");
    let view = engine.state_view();
    for n in view.nodes.iter().filter(|n| n.stage == Stage::House) {
        println!("  {BOLD}{}{RESET}  ({})", n.name, n.id);
        println!("    purse allocated   {:>9.1} cr", n.compute_allocated);
        println!("    burned on thought {:>9.1} cr  ({:.2} J)", n.compute_burned, n.joules_burned);
        println!("    left in the purse {:>9.1} cr", n.compute);
        println!("    cushion swept     {:>9.1} cr  (never yield)", n.compute_reclaimed);
        println!("    tasks sent        {:>6}/{}", n.tasks_done, n.tasks_total);
        println!("    truth Φ           {:>8.1}%  after {} handovers, {} oracle calls", n.confidence * 100.0, n.generation, n.calibrations);
        println!("    papers on table   {:>6}", n.papers);
        println!("    oak table root    {}", n.oak_root.short());
        if let Some(note) = &n.note {
            println!("    {RED}{note}{RESET}");
        }
    }
    println!("  {DIM}coordination tax paid {:.1} cr · approved {} · rejected {} · sovereign root {}{RESET}", view.totals.tax_paid, view.totals.approved, view.totals.rejected, view.root.short());
    for g in &view.gates {
        println!("  {DIM}{g}{RESET}");
    }
    println!("{GOLD}{BOLD}──────────────────────────────────────────────────────────────────────{RESET}");
}
