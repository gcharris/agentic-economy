//! A raw C ABI for the browser. No wasm-bindgen, no framework: a handful of
//! exported functions and one output buffer. The host reads JSON out of
//! linear memory. This is the same engine as the native binary, compiled
//! for `wasm32-unknown-unknown` with `--no-default-features`.

// `#[no_mangle]` exports are classed as `unsafe_code` by the lint. This is the
// one module that speaks to a foreign host, so the exception lives here.
#![allow(unsafe_code)]

use crate::executor::block_on_bounded;
use crate::ids::{EnvelopeId, NodeId};
use crate::node::Stage;
use crate::scenarios;
use crate::tick::{Engine, EngineConfig};
use std::cell::RefCell;

thread_local! {
    static ENGINE: RefCell<Option<Engine>> = const { RefCell::new(None) };
    static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

fn with_engine<R>(f: impl FnOnce(&mut Engine) -> R) -> Option<R> {
    ENGINE.with(|e| e.borrow_mut().as_mut().map(f))
}

fn write_out(bytes: Vec<u8>) -> u32 {
    OUT.with(|o| {
        let mut o = o.borrow_mut();
        *o = bytes;
        o.len() as u32
    })
}

/// scenario 1 = the house (Stage 1), 2 = the street (Stage 2), 3 = the city
/// (Stage 3: 2 streets × 3 houses, `budget` and `tasks` per house, the camera
/// at the city so the Clearinghouse nets), 4 = a country whose cities'
/// clearing collapses (Stage 4: the High Court; fixed parameters, `budget`
/// and `tasks` ignored), 5 = the world (Stage 5: 3 countries × 2 cities in
/// stasis; `budget` and `tasks` ignored; drain `engine_events()` once before
/// the first tick to see the tick-0 `PACKED` events). Anything else builds
/// the house.
#[no_mangle]
pub extern "C" fn engine_new(scenario: u32, seed: u64, budget: f64, tasks: u32, cost_visible: u32) {
    let config = EngineConfig {
        seed,
        cost_visible: cost_visible != 0,
        ..Default::default()
    };
    let engine = match scenario {
        2 => scenarios::street(config, 6, budget, tasks as usize),
        3 => scenarios::city(config, 2, 3, budget, tasks as usize),
        4 => scenarios::forged_country(config, 5, 2, 2, 200.0, 10_000.0).0,
        5 => scenarios::world(config, 3, 2),
        _ => scenarios::house(config, budget, tasks as usize),
    };
    ENGINE.with(|e| *e.borrow_mut() = Some(engine));
}

/// A sized city (Stage 3): `streets` × `houses` per street, `budget` and
/// `tasks` per house, the camera at the city. Scenario 3 of `engine_new` keeps
/// its 2 × 3 default; this is the video's city (DESIGN §2c.5: about 6 × 8).
#[no_mangle]
pub extern "C" fn engine_new_city(
    streets: u32,
    houses: u32,
    budget: f64,
    tasks: u32,
    seed: u64,
    cost_visible: u32,
) {
    let config = EngineConfig {
        seed,
        cost_visible: cost_visible != 0,
        ..Default::default()
    };
    let engine = scenarios::city(
        config,
        streets.max(1) as usize,
        houses.max(1) as usize,
        budget,
        tasks as usize,
    );
    ENGINE.with(|e| *e.borrow_mut() = Some(engine));
}

/// Run one block. Returns the tick number, or 0 if a seat's future could
/// not complete on this single-threaded host (a seat that waits on a
/// network wake has no reactor here; the tab is not frozen, the tick is
/// simply reported as not run).
#[no_mangle]
pub extern "C" fn engine_tick() -> u64 {
    with_engine(|e| {
        block_on_bounded(e.tick(), 100_000)
            .map(|r| r.tick)
            .unwrap_or(0)
    })
    .unwrap_or(0)
}

/// Returns 1 if the envelope was actually held at a door, 0 otherwise.
#[no_mangle]
pub extern "C" fn engine_authorize(envelope: u64) -> u32 {
    with_engine(|e| e.authorize(EnvelopeId(envelope)) as u32).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn engine_reject(envelope: u64) -> u32 {
    with_engine(|e| e.reject(EnvelopeId(envelope)) as u32).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn engine_top_up(node: u64, credits: f64) {
    with_engine(|e| e.top_up(NodeId(node), credits));
}

#[no_mangle]
pub extern "C" fn engine_zoom(stage: u32) {
    if let Some(s) = Stage::from_level(stage as u8) {
        with_engine(|e| e.set_active_scale(s));
    }
}

/// Move ground truth under the houses' feet: the courier now costs `price`.
/// Every Oak Table still caches the old price until it pays the oracle.
#[no_mangle]
pub extern "C" fn engine_set_truth_price(price: f64) {
    with_engine(|e| scenarios::move_truth(e, "courier", price));
}

/// Serialise the state view into the output buffer. Returns its length.
#[no_mangle]
pub extern "C" fn engine_state() -> u32 {
    let json = with_engine(|e| e.state_json()).unwrap_or_else(|| "null".into());
    write_out(json.into_bytes())
}

/// Serialise and drain the event log into the output buffer. Returns its length.
#[no_mangle]
pub extern "C" fn engine_events() -> u32 {
    let json =
        with_engine(|e| serde_json::to_string(&e.drain_events()).unwrap_or_else(|_| "[]".into()))
            .unwrap_or_else(|| "[]".into());
    write_out(json.into_bytes())
}

/// Pointer to the output buffer (valid until the next call that writes it).
#[no_mangle]
pub extern "C" fn engine_out_ptr() -> *const u8 {
    OUT.with(|o| o.borrow().as_ptr())
}

/// The engine's version string, for the HUD.
#[no_mangle]
pub extern "C" fn engine_version() -> u32 {
    write_out(
        format!(
            "context-engine {} (wasm32, sequential executor)",
            env!("CARGO_PKG_VERSION")
        )
        .into_bytes(),
    )
}
