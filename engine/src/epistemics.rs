//! Truth is the gravity. Data isolated in an agent's head rots.
//!
//! Two decay mechanisms, both from the laboratory record:
//!
//! * **Handover decay** (mechanistic). When seat B consumes seat A's
//!   synthetic output the confidence multiplies by
//!   `1 − (1 − σ_tier)·(1 − 0.5·ρ_rigor)`. Twenty handovers through the
//!   battery's tier rotation at rigor 0.82 land on exactly 0.5636. The test
//!   below reproduces that number to four decimal places.
//! * **Idle decay** (doc 02's rule, borrowed from the record). A node that is
//!   not drafting still watches the world move: `Φ(Δt) = Φ_sync · e^(−k·Δt)`
//!   with `k` chosen so that twenty idle ticks land where twenty handovers
//!   did. This is a design rule, not a measurement: benchmark 2 measured
//!   handovers, and benchmark 3 held Φ constant while the door was closed.
//!   The engine follows doc 02: waiting at the Door is free in compute and
//!   *not* free in truth. The factor is a literal so native and WebAssembly
//!   builds multiply the same number and replay bit for bit.
//!
//! A paid oracle query (`StateSync`) resets Φ to 1.0.

use crate::resources::ModelTier;
use serde::{Deserialize, Serialize};

/// Benchmark 2, uncalibrated, generation 20.
pub const OBSERVED_CONFIDENCE_AFTER_20_HANDOVERS: f64 = 0.5636;
/// `−ln(0.5636) / 20`. Doc 02 rounds this to 0.0287.
pub const DECAY_RATE: f64 = 0.028_67;
/// `e^(−DECAY_RATE)`, precomputed so no platform libm is involved.
pub const DECAY_FACTOR: f64 = 0.9717370847993241;
/// Below this a node starts acting on hallucinated prices.
pub const HALLUCINATION_THRESHOLD: f64 = 0.75;
/// Benchmark 2, calibrated: four oracles at 15 credits each.
pub const ORACLE_COST: f64 = 15.0;
/// Architectural principle 3: never exceed 4–5 uncalibrated handovers.
pub const MAX_UNCALIBRATED_HANDOVERS: u32 = 5;
/// The battery's default synthesis rigor.
pub const DEFAULT_RIGOR: f64 = 0.82;

/// One handover of synthetic output from one seat to the next.
pub fn handover(confidence: f64, tier: ModelTier, rigor: f64) -> f64 {
    let decay = (1.0 - tier.spec().stability) * (1.0 - rigor * 0.5);
    (confidence * (1.0 - decay)).max(0.05)
}

/// Confidence after `ticks_since_sync` ticks of watching the world move.
/// Repeated multiplication, not `exp`, so every host computes the same bits.
pub fn idle_decay(confidence_at_sync: f64, ticks_since_sync: u64) -> f64 {
    let mut c = confidence_at_sync;
    for _ in 0..ticks_since_sync {
        c *= DECAY_FACTOR;
    }
    c.max(0.05)
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Epistemics {
    /// Φ ∈ [0.05, 1.0]. The node's grip on ground truth.
    pub confidence: f64,
    pub confidence_at_sync: f64,
    pub last_sync_tick: u64,
    /// Handovers since the last calibration.
    pub generation: u32,
    pub calibrations: u32,
    /// Idle ticks since the node last drafted (drives the fog shader).
    pub idle_ticks: u64,
}

impl Default for Epistemics {
    fn default() -> Self {
        Epistemics { confidence: 1.0, confidence_at_sync: 1.0, last_sync_tick: 0, generation: 0, calibrations: 0, idle_ticks: 0 }
    }
}

impl Epistemics {
    pub fn record_handover(&mut self, tier: ModelTier, rigor: f64) -> f64 {
        self.generation += 1;
        self.confidence = handover(self.confidence, tier, rigor);
        self.confidence
    }

    /// One tick passed without a draft. The world moved; the cache did not.
    pub fn record_idle_tick(&mut self) -> f64 {
        self.idle_ticks += 1;
        self.confidence = (self.confidence * DECAY_FACTOR).max(0.05);
        self.confidence
    }

    pub fn record_active_tick(&mut self) {
        self.idle_ticks = 0;
    }

    /// Paid oracle query. Resets Φ to 1.0.
    pub fn calibrate(&mut self, tick: u64) -> f64 {
        self.confidence = 1.0;
        self.confidence_at_sync = 1.0;
        self.last_sync_tick = tick;
        self.generation = 0;
        self.calibrations += 1;
        self.idle_ticks = 0;
        1.0
    }

    pub fn is_hallucinating(&self) -> bool {
        self.confidence < HALLUCINATION_THRESHOLD
    }

    /// Principle 3: never let the chain exceed 4–5 uncalibrated handovers.
    /// A house draft adds two (Scribble, Inspector), so the Scout asks when
    /// the *next* draft would cross the line.
    pub fn overdue_for_oracle(&self) -> bool {
        self.generation + 2 >= MAX_UNCALIBRATED_HANDOVERS
    }

    /// Fraction of the tile that should be fogged: `1 − Φ`.
    pub fn fog(&self) -> f64 {
        (1.0 - self.confidence).clamp(0.0, 1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reproduces `output/ael_experiment_results.json` → benchmark 2, uncalibrated.
    #[test]
    fn twenty_handovers_land_on_the_laboratory_record() {
        let rotation = [ModelTier::FastQuantized, ModelTier::BalancedStaff, ModelTier::FrontierDeep];
        let mut e = Epistemics::default();
        let mut history = Vec::new();
        for gen in 1..=20u32 {
            let tier = rotation[(gen % 3) as usize];
            history.push((e.record_handover(tier, DEFAULT_RIGOR) * 10_000.0).round() / 10_000.0);
        }
        assert_eq!(history[0], 0.9764);
        assert_eq!(history[4], 0.8866);
        assert_eq!(history[9], 0.7440);
        assert_eq!(history[19], OBSERVED_CONFIDENCE_AFTER_20_HANDOVERS);
    }

    /// Doc 02's exponential fit lands within 0.1 % of the same record.
    #[test]
    fn idle_decay_is_calibrated_to_the_record() {
        let after_20 = idle_decay(1.0, 20);
        assert!((after_20 - OBSERVED_CONFIDENCE_AFTER_20_HANDOVERS).abs() < 0.001, "{after_20}");
        let mut e = Epistemics::default();
        for _ in 0..20 {
            e.record_idle_tick();
        }
        assert!((e.confidence - after_20).abs() < 1e-9);
    }

    #[test]
    fn oracle_every_five_generations_holds_the_line() {
        let rotation = [ModelTier::FastQuantized, ModelTier::BalancedStaff, ModelTier::FrontierDeep];
        let mut e = Epistemics::default();
        let mut spend = 0.0;
        for gen in 1..=20u32 {
            e.record_handover(rotation[(gen % 3) as usize], DEFAULT_RIGOR);
            if gen % 5 == 0 {
                e.calibrate(gen as u64);
                spend += ORACLE_COST;
            }
        }
        assert_eq!(e.confidence, 1.0);
        assert_eq!(spend, 60.0);
        assert_eq!(e.calibrations, 4);
    }
}
