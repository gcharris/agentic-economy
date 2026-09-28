//! Receipts and the Note. Not a moral judgment: the piece of paper that lets
//! a person see the burn without having watched every minute.

use crate::ids::NodeId;
use crate::resources::{ModelTier, ResourceUnit};
use serde::{Deserialize, Serialize};
use std::fmt;

/// What a seat did and what it cost. One line per inference turn.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SeatReceipt {
    pub tick: u64,
    pub node: NodeId,
    pub seat: String,
    pub action: String,
    pub tier: ModelTier,
    pub cost: ResourceUnit,
    pub credits: f64,
    pub confidence_after: f64,
    pub status: String,
}

impl SeatReceipt {
    pub fn to_plain_line(&self) -> String {
        format!(
            "[{}] t{} {} · {} · {} · burned {:.1} cr ({:.2} J, {} tok{}) · Φ {:.1}%",
            self.status.to_uppercase(),
            self.tick,
            self.node,
            self.seat,
            self.action,
            self.credits,
            self.cost.joules,
            self.cost.tokens,
            if self.cost.cache_hit { ", cache hit" } else { "" },
            self.confidence_after * 100.0
        )
    }
}

impl fmt::Display for SeatReceipt {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.to_plain_line())
    }
}

/// Why a node stopped.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum HaltReason {
    /// The purse is empty. A person must top up or close.
    RunwayExhausted { shortfall: f64 },
    /// The human said the week is over.
    Closed,
    /// The High Court slashed the node below viability.
    Slashed { amount: f64 },
    /// The country's root did not match the planetary proof.
    Partitioned,
}

/// The Note left on the table when a node halts. Nothing is deleted.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Note {
    pub tick: u64,
    pub node: NodeId,
    pub node_name: String,
    pub doing: String,
    pub compute_burned_total: f64,
    pub compute_remaining: f64,
    pub joules_burned_total: f64,
    pub papers_on_table: usize,
    pub reason: HaltReason,
    pub saved_state: String,
}

impl Note {
    pub fn to_plain_line(&self) -> String {
        let status = match &self.reason {
            HaltReason::RunwayExhausted { .. } => "Runway exhausted. A person must top up or close.",
            HaltReason::Closed => "Closed by the person. The week is over.",
            HaltReason::Slashed { .. } => "Slashed by the High Court. Reserves seized.",
            HaltReason::Partitioned => "Partitioned from the global rails until the root resolves.",
        };
        format!(
            "[HALTED] What it was doing: {} | Total cost burned: {:.1} credits ({:.2} J) | Papers left on the table: {} | Local state saved: {} | Status: {}",
            self.doing, self.compute_burned_total, self.joules_burned_total, self.papers_on_table, self.saved_state, status
        )
    }
}

impl fmt::Display for Note {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.to_plain_line())
    }
}
