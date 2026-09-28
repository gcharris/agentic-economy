//! The coordination tax. Every boundary crossing costs formatting,
//! translating and verifying. The multipliers are doc 04's; the two observed
//! percentages that justify them are recorded here so nobody has to trust
//! the multipliers on faith.

use crate::envelope::Crossing;
use serde::{Deserialize, Serialize};

/// Benchmark 1: the Coasean market cannibalised 19.99 % of its budget.
pub const OBSERVED_MARKET_TAX_PCT: f64 = 19.99;
/// Runway experiment 2: a market of jobs burned 30.5 % on handoffs.
pub const OBSERVED_JOB_MARKET_TAX_PCT: f64 = 30.5;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct CoordinationTax {
    /// Inside one node: seats pass the page across the table for free.
    pub intra: f64,
    /// Same parent (same street): moderate tax.
    pub same_parent: f64,
    /// Different parent (routes through a clearinghouse): heavy tax.
    pub cross_parent: f64,
}

impl Default for CoordinationTax {
    fn default() -> Self {
        CoordinationTax {
            intra: 1.0,
            same_parent: 1.25,
            cross_parent: 1.40,
        }
    }
}

impl CoordinationTax {
    pub fn multiplier(&self, crossing: Crossing) -> f64 {
        match crossing {
            Crossing::Intra => self.intra,
            Crossing::SameParent => self.same_parent,
            Crossing::CrossParent => self.cross_parent,
        }
    }

    /// Total compute debited to route a payload of `compute_weight` credits.
    pub fn routed_cost(&self, crossing: Crossing, compute_weight: f64) -> f64 {
        compute_weight * self.multiplier(crossing)
    }

    /// Only the tax part, for the ledger.
    pub fn tax_only(&self, crossing: Crossing, compute_weight: f64) -> f64 {
        compute_weight * (self.multiplier(crossing) - 1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn doc_04_multipliers() {
        let t = CoordinationTax::default();
        assert_eq!(t.routed_cost(Crossing::Intra, 10.0), 10.0);
        assert_eq!(t.routed_cost(Crossing::SameParent, 10.0), 12.5);
        assert_eq!(t.routed_cost(Crossing::CrossParent, 10.0), 14.0);
        // the observed band the multipliers are drawn from
        assert!(
            t.tax_only(Crossing::SameParent, 100.0) / 125.0 * 100.0
                <= OBSERVED_MARKET_TAX_PCT + 0.01
        );
        assert!(
            t.tax_only(Crossing::CrossParent, 100.0) / 140.0 * 100.0 <= OBSERVED_JOB_MARKET_TAX_PCT
        );
    }
}
