//! Deterministic identifiers. No UUID v4, no wall clock: every id is minted
//! from the engine's seeded generator so a run can be replayed bit for bit,
//! which is what a High Court rollback and a fractal unpack both depend on.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Identity of a [`crate::SovereignNode`] at any scale.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Debug, Default)]
pub struct NodeId(pub u64);

/// Identity of a [`crate::ProposalEnvelope`] in the mempool.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Debug, Default)]
pub struct EnvelopeId(pub u64);

impl fmt::Display for NodeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "node:{:08x}", self.0 & 0xffff_ffff)
    }
}

impl fmt::Display for EnvelopeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "env:{:08x}", self.0 & 0xffff_ffff)
    }
}
