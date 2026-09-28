//! Stage 2 under drift. The same street as [`super::street`], and then the
//! world moves: the Sovereign Graph's price for the courier changes while
//! every house's Oak Table still says the old number. Nobody tells the
//! houses. Every swap drafted on the stale belief reverts at the Letter
//! Slot, the crossing tax is sunk each time, and the only way back is to
//! pay the oracle.
//!
//! This is doc 04 §3's gameplay loop made reproducible: check too rarely
//! and you burn compute on reverted swaps; check too often and you burn it
//! on the oracle.

use crate::tick::{Engine, EngineConfig};

/// What every table on the street caches at the start.
pub const STALE_PRICE: f64 = 10.0;
/// Where the truth goes when the world moves.
pub const MOVED_PRICE: f64 = 12.0;

/// The street, with the truth already moved before the first tick. Every
/// Oak Table caches [`STALE_PRICE`]; the graph says `new_price`.
pub fn street_under_drift(
    config: EngineConfig,
    houses: usize,
    budget_each: f64,
    tasks_each: usize,
    new_price: f64,
) -> Engine {
    let mut e = super::street(config, houses, budget_each, tasks_each);
    move_truth(&mut e, "courier", new_price);
    e
}

/// The world moves. Ground truth changes; no Oak Table hears about it.
///
/// This is a host action, outside the tick, the way doc 03 describes the
/// layer above the camera as a stochastic environment generator. A draft
/// cannot do this (law 1: it has no reference to the graph) and the Commit
/// phase does not (it moves liquidity, never prices).
pub fn move_truth(e: &mut Engine, service: &str, price: f64) {
    e.graph.service_prices.insert(service.into(), price);
}
