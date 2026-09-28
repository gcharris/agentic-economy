//! Events the engine emits for the frontend. The renderer draws *only* what
//! these carry plus the Sovereign Graph; it never reaches into a node.

use crate::hash::Hash32;
use crate::ids::{EnvelopeId, NodeId};
use crate::node::Stage;
use crate::receipt::Note;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EngineEvent {
    /// A seat thought out loud. Drives the speech bubbles.
    Thought { tick: u64, node: NodeId, seat: String, text: String },
    /// A seat burned compute. Drives the exhaust/heat shader.
    Burn { tick: u64, node: NodeId, seat: String, credits: f64, joules: f64, tier: String, cache_hit: bool },
    /// A draft became an envelope in the mempool.
    Proposed { tick: u64, envelope: EnvelopeId, from: NodeId, to: NodeId, kind: String, requested_liquidity: f64, tax_paid: f64 },
    /// The courier dropped an unfunded envelope before it reached anyone.
    DroppedByCourier { tick: u64, from: NodeId, to: NodeId, reason: String },
    /// Stage 1: the Porter is at the Door. The tick pauses for this node.
    AwaitingHumanSignature { tick: u64, node: NodeId, envelope: EnvelopeId, description: String, cost: f64 },
    /// Stage 5: waiting for the planetary proof.
    AwaitingFinality { tick: u64, envelope: EnvelopeId, until_tick: u64 },
    Approved { tick: u64, envelope: EnvelopeId, gate: Stage },
    /// Sunk cost: the compute is gone, the envelope is destroyed.
    Rejected { tick: u64, envelope: EnvelopeId, gate: Stage, reason: String, sunk_compute: f64 },
    Slashed { tick: u64, node: NodeId, amount: f64, reason: String },
    /// A liquidity transfer settled in the Sovereign Graph.
    Settled { tick: u64, envelope: EnvelopeId, from: NodeId, to: NodeId, amount: f64 },
    /// A message was delivered across a boundary (the only cross-node write).
    Delivered { tick: u64, envelope: EnvelopeId, to: NodeId },
    /// A node paid the oracle and its truth reset. Drives the sweeping light.
    StateSync { tick: u64, node: NodeId, cost: f64, confidence_before: f64 },
    /// A node halted and left a note on the table.
    Halted { tick: u64, node: NodeId, note: Note },
    /// A seat panicked mid-draft. The node's purse and table are untouched;
    /// nothing from that draft is reconciled.
    SeatFailed { tick: u64, node: NodeId },
    /// An approved envelope was voided by a court order before it committed.
    Voided { tick: u64, envelope: EnvelopeId, reason: String },
    /// The human put money in the purse; the node continues.
    ToppedUp { tick: u64, node: NodeId, credits: f64 },
    /// LOD: discrete children folded into a statistical profile.
    Packed { tick: u64, parent: NodeId, children: usize, seed: u64 },
    /// LOD: statistical profile unfolded back into discrete children.
    Unpacked { tick: u64, parent: NodeId, children: usize, macro_ticks: u64, burn_distributed: f64 },
    /// Stage 3: end-of-tick netting run.
    Netted { tick: u64, clearinghouse: Stage, gross: f64, net: f64, envelopes: usize },
    /// Stage 4: the circuit breaker tripped.
    RolledBack { tick: u64, to_tick: u64, reason: String, slashed: usize },
    /// Stage 5: the planetary heartbeat.
    GlobalStateConfirmed { tick: u64, root: Hash32, latency_ticks: u64, partitioned: Vec<NodeId> },
    /// End of block.
    TickCommitted { tick: u64, root: Hash32, active_scale: Stage, nodes_active: usize, nodes_waiting: usize, nodes_halted: usize, nodes_packed: usize, nodes_partitioned: usize },
}

impl EngineEvent {
    pub fn tick(&self) -> u64 {
        use EngineEvent::*;
        match self {
            Thought { tick, .. } | Burn { tick, .. } | Proposed { tick, .. } | DroppedByCourier { tick, .. }
            | AwaitingHumanSignature { tick, .. } | AwaitingFinality { tick, .. } | Approved { tick, .. }
            | Rejected { tick, .. } | Slashed { tick, .. } | Settled { tick, .. } | Delivered { tick, .. }
            | StateSync { tick, .. } | Halted { tick, .. } | SeatFailed { tick, .. } | Voided { tick, .. } | ToppedUp { tick, .. } | Packed { tick, .. }
            | Unpacked { tick, .. } | Netted { tick, .. } | RolledBack { tick, .. }
            | GlobalStateConfirmed { tick, .. } | TickCommitted { tick, .. } => *tick,
        }
    }
}
