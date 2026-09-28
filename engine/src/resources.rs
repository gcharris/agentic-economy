//! The tripartite resource system: Compute (the fuel), Truth (the gravity,
//! see [`crate::epistemics`]) and Liquidity (the exchange).
//!
//! The base particle is the burn. Money is the fuel tank a human fills.

use serde::{Deserialize, Serialize};
use std::fmt;

/// 1 credit ≈ 10 tokens ≈ 0.05 J (the laboratory kernel's accounting unit).
pub const TOKENS_PER_CREDIT: f64 = 10.0;
pub const JOULES_PER_CREDIT: f64 = 0.05;
/// A prompt-cache hit cuts ingestion energy by 85 %.
pub const CACHE_HIT_DISCOUNT: f64 = 0.85;

/// The three inference tiers a seat can buy. Numbers are the laboratory
/// kernel's (`backend/ael/kernel.py`), carried over unchanged.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum ModelTier {
    /// ~7B quantised. Cheap, fast, drifts fastest.
    FastQuantized,
    /// ~70B staff model. The production default.
    BalancedStaff,
    /// 400B+ deep reasoning. Expensive, slow, drifts least.
    FrontierDeep,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TierSpec {
    pub joules_per_tok: f64,
    pub flops_per_tok: f64,
    pub ms_per_tok: f64,
    /// σ_tier in the drift formulation: how much of the truth survives a handover.
    pub stability: f64,
}

impl ModelTier {
    pub const ALL: [ModelTier; 3] = [ModelTier::FastQuantized, ModelTier::BalancedStaff, ModelTier::FrontierDeep];

    pub fn spec(self) -> TierSpec {
        match self {
            ModelTier::FastQuantized => TierSpec { joules_per_tok: 0.002, flops_per_tok: 1.4e10, ms_per_tok: 0.8, stability: 0.90 },
            ModelTier::BalancedStaff => TierSpec { joules_per_tok: 0.008, flops_per_tok: 1.4e11, ms_per_tok: 2.2, stability: 0.96 },
            ModelTier::FrontierDeep => TierSpec { joules_per_tok: 0.035, flops_per_tok: 8.0e11, ms_per_tok: 6.5, stability: 0.99 },
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            ModelTier::FastQuantized => "fast_quantized",
            ModelTier::BalancedStaff => "balanced_staff",
            ModelTier::FrontierDeep => "frontier_deep",
        }
    }
}

/// The multi-dimensional burn of one inference turn.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, Default)]
pub struct ResourceUnit {
    pub tokens: u32,
    pub joules: f64,
    pub flops: f64,
    pub latency_ms: f64,
    pub cache_hit: bool,
}

impl ResourceUnit {
    /// The normalised accounting credit debited from the Purse.
    pub fn credits(&self) -> f64 {
        let mut base = self.tokens as f64 / TOKENS_PER_CREDIT;
        if self.cache_hit {
            base *= 0.15; // the kernel's literal, so odd token counts round the same way
        }
        (base * 100.0).round() / 100.0
    }

    /// The physical cost of an inference turn on a given tier.
    pub fn burn(tier: ModelTier, tokens: u32, cache_hit: bool) -> ResourceUnit {
        let spec = tier.spec();
        let effective = if cache_hit { (tokens as f64 * (1.0 - CACHE_HIT_DISCOUNT)) as u32 } else { tokens };
        ResourceUnit {
            tokens,
            joules: effective as f64 * spec.joules_per_tok,
            flops: effective as f64 * spec.flops_per_tok,
            latency_ms: effective as f64 * spec.ms_per_tok,
            cache_hit,
        }
    }

    /// A flat cost expressed directly in credits (a door fee, a courier fee).
    pub fn flat(credits: f64) -> ResourceUnit {
        ResourceUnit { tokens: (credits * TOKENS_PER_CREDIT).round() as u32, joules: credits * JOULES_PER_CREDIT, flops: 0.0, latency_ms: 0.0, cache_hit: false }
    }
}

/// Raised when a Purse cannot cover a burn. Exhaustion is a pause, not a death.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Exhausted {
    pub requested: f64,
    pub available: f64,
}

impl fmt::Display for Exhausted {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "runway exhausted: needed {:.2} cr, had {:.2} cr", self.requested, self.available)
    }
}

/// The Purse: compute reserves (local truth, the fuel) and liquidity
/// reserves (the node's *belief* about its balance; the Sovereign Graph
/// holds the truth, and the two can drift apart).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, Default)]
pub struct Purse {
    pub compute: f64,
    pub liquidity: f64,
    /// Everything ever handed to this purse, for the receipt.
    pub compute_allocated: f64,
    pub compute_burned: f64,
    pub joules_burned: f64,
    /// Swept back by the steward (the Penny principle). Never yield.
    pub compute_reclaimed: f64,
}

impl Purse {
    pub fn new(compute: f64, liquidity: f64) -> Self {
        Purse { compute, liquidity, compute_allocated: compute, ..Default::default() }
    }

    /// Exact: a purse never goes below zero, not even by a rounding error.
    pub fn can_burn(&self, credits: f64) -> bool {
        self.compute >= credits
    }

    /// Debit the fuel. Fails without debiting when the purse is short.
    pub fn burn(&mut self, unit: ResourceUnit) -> Result<f64, Exhausted> {
        let credits = unit.credits();
        if !self.can_burn(credits) {
            return Err(Exhausted { requested: credits, available: self.compute });
        }
        self.compute -= credits;
        self.compute_burned += credits;
        self.joules_burned += unit.joules;
        Ok(credits)
    }

    /// Debit an already-priced amount (used when reconciling a draft's burn).
    pub fn burn_credits(&mut self, credits: f64) -> Result<f64, Exhausted> {
        if !self.can_burn(credits) {
            return Err(Exhausted { requested: credits, available: self.compute });
        }
        self.compute -= credits;
        self.compute_burned += credits;
        self.joules_burned += credits * JOULES_PER_CREDIT;
        Ok(credits)
    }

    /// Debit a burn whose joules were priced by the kernel's tier physics
    /// (the receipts carry them); credits and joules are recorded separately.
    pub fn burn_priced(&mut self, credits: f64, joules: f64) -> f64 {
        let actual = credits.min(self.compute).max(0.0);
        self.compute -= actual;
        self.compute_burned += actual;
        self.joules_burned += if credits > 0.0 { joules * (actual / credits) } else { 0.0 };
        actual
    }

    /// Burn whatever is left. Returns what was actually burned.
    pub fn burn_to_empty(&mut self, credits: f64) -> f64 {
        let actual = credits.min(self.compute).max(0.0);
        self.compute -= actual;
        self.compute_burned += actual;
        self.joules_burned += actual * JOULES_PER_CREDIT;
        actual
    }

    /// The human puts more money in the purse.
    pub fn top_up(&mut self, credits: f64) {
        self.compute += credits;
        self.compute_allocated += credits;
    }

    /// The steward's sweep (the Penny principle). In a one-purse house the
    /// unburned cushion never left the runway, so nothing moves: this is the
    /// receipt line that proves the cushion went back to the runway and not
    /// into a balance. It is never yield, and it never mints credits.
    pub fn note_cushion(&mut self, credits: f64) {
        self.compute_reclaimed += credits.max(0.0);
    }

    pub fn joules_remaining(&self) -> f64 {
        self.compute * JOULES_PER_CREDIT
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kernel_parity_with_laboratory() {
        // 280 tokens fast, cache miss → 28.0 cr; 650 balanced cache hit → 9.75 cr
        assert_eq!(ResourceUnit::burn(ModelTier::FastQuantized, 280, false).credits(), 28.0);
        assert_eq!(ResourceUnit::burn(ModelTier::BalancedStaff, 650, true).credits(), 9.75);
        let u = ResourceUnit::burn(ModelTier::FrontierDeep, 320, true);
        assert_eq!(u.credits(), 4.8);
        assert!((u.joules - 48.0 * 0.035).abs() < 1e-9);
    }

    #[test]
    fn exhaustion_does_not_debit() {
        let mut p = Purse::new(10.0, 0.0);
        let e = p.burn(ResourceUnit::flat(11.0)).unwrap_err();
        assert_eq!(e.available, 10.0);
        assert_eq!(p.compute, 10.0);
        assert_eq!(p.compute_burned, 0.0);
    }
}
