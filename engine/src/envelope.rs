//! The ProposalEnvelope: the only thing that ever leaves a node.
//!
//! `[Initiator_ID, Target_ID, Payload_Hash, Requested_Liquidity, Auth_Signature]`
//! plus what the engine needs to price and route it.

use crate::hash::Hash32;
use crate::ids::{EnvelopeId, NodeId};
use crate::node::Stage;
use serde::{Deserialize, Serialize};

/// What the envelope asks the world to do.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Payload {
    /// Pay a stranger. Irreversible. Halts at the Door at Stage 1.
    LiquidityTransfer { amount: f64, memo: String },
    /// Send a letter. Irreversible. Halts at the Door at Stage 1.
    Dispatch { message: String, task_id: String },
    /// Hire a neighbour's service by atomic swap (Stage 2 DvP). The
    /// initiator commits to the price it *believes* is true; a stale belief
    /// produces a hash mismatch at the Letter Slot and the swap reverts.
    HireService { service: String, believed_price: f64, believed_price_hash: Hash32 },
    /// Pay the oracle: copy the Sovereign Graph's truth onto the Oak Table.
    /// Costs compute, not liquidity. Looking is not sending.
    StateSync,
    /// Close a contract. Irreversible.
    Close { contract: String },
}

impl Payload {
    pub fn kind(&self) -> &'static str {
        match self {
            Payload::LiquidityTransfer { .. } => "liquidity_transfer",
            Payload::Dispatch { .. } => "dispatch",
            Payload::HireService { .. } => "hire_service",
            Payload::StateSync => "state_sync",
            Payload::Close { .. } => "close",
        }
    }

    /// Cannot be taken back once it leaves the house.
    pub fn is_irreversible(&self) -> bool {
        matches!(self, Payload::LiquidityTransfer { .. } | Payload::Dispatch { .. } | Payload::Close { .. })
    }

    /// Carries a `<LiquidityTransfer>` flag in doc 02's sense.
    pub fn moves_liquidity(&self) -> bool {
        matches!(self, Payload::LiquidityTransfer { .. } | Payload::HireService { .. })
    }

    /// Stage 1 rule 2: anything that moves liquidity or cannot be undone
    /// waits for the human's hand on the latch.
    pub fn needs_signature_at_house(&self) -> bool {
        self.is_irreversible() || self.moves_liquidity()
    }

    pub fn hash(&self) -> Hash32 {
        let bytes = serde_json::to_vec(self).expect("payload serialises");
        Hash32::digest(&bytes)
    }

    pub fn describe(&self) -> String {
        match self {
            Payload::LiquidityTransfer { amount, memo } => format!("pay {amount:.1} tokens: {memo}"),
            Payload::Dispatch { task_id, .. } => format!("send the finished draft for {task_id}"),
            Payload::HireService { service, believed_price, .. } => format!("hire {service} at {believed_price:.1}"),
            Payload::StateSync => "sync with the Sovereign Graph".to_string(),
            Payload::Close { contract } => format!("close contract {contract}"),
        }
    }
}

/// Which boundary a payload crosses, which sets the coordination tax.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Crossing {
    /// Same node. Seats pass the page across the table for free.
    Intra,
    /// Same parent. Same street.
    SameParent,
    /// Different parent. Routes through a clearinghouse.
    CrossParent,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ProposalEnvelope {
    pub id: EnvelopeId,
    pub initiator: NodeId,
    pub target: NodeId,
    pub payload: Payload,
    pub payload_hash: Hash32,
    pub requested_liquidity: f64,
    /// Compute weight of the payload before tax: what it cost to draft.
    pub compute_weight: f64,
    /// Coordination tax already paid to mint this envelope.
    pub tax_paid: f64,
    pub auth_signature: Hash32,
    pub created_tick: u64,
    pub origin_stage: Stage,
    /// The gate this envelope must pass, decided at verify time from the
    /// camera and the initiator's own policy.
    pub gate: Stage,
    pub crossing: Crossing,
    /// Set the first time the Door presents this envelope to the person.
    /// Once asked, only the person can answer: no camera move re-routes it.
    #[serde(default)]
    pub asked_human: bool,
}

impl ProposalEnvelope {
    pub fn is_irreversible(&self) -> bool {
        self.payload.is_irreversible()
    }

    /// Recompute and compare the signature a node would have produced.
    pub fn signature_for(initiator: NodeId, secret: u64, payload_hash: &Hash32, tick: u64) -> Hash32 {
        Hash32::digest_parts(&[&initiator.0.to_le_bytes(), &secret.to_le_bytes(), &payload_hash.0, &tick.to_le_bytes()])
    }
}

/// The 2-phase commit record of a Stage 2 atomic Delivery-versus-Payment.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AtomicDvP {
    pub envelope: EnvelopeId,
    pub locked_liquidity: f64,
    pub locked_compute: f64,
    pub expected_hash: Hash32,
    pub actual_hash: Hash32,
    pub phase: DvpPhase,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DvpPhase {
    Lock,
    Transfer,
    Verify,
    Settled,
    /// Locks revert. The compute spent verifying is permanently burned.
    Reverted,
}
