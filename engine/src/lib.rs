//! # The Context Engine
//!
//! The invisible backend of *The Agentic Economy*: an **Asynchronous Agentic
//! State Machine** (AASM), not an Entity-Component-System.
//!
//! ## The Golden Invariant (the Fractal Rule)
//!
//! At every level of zoom, from the room with the oak table (Stage 1) to the
//! planetary cryptographic computer (Stage 5), the engine enforces four laws:
//!
//! 1. **Parallel encapsulation.** Entities draft in private. A draft runs
//!    against an owned [`DraftContext`] snapshot and has *no reference* to the
//!    engine, to other nodes, or to the Sovereign Graph. The type system
//!    enforces this: `DraftContext: Send + 'static` carries no borrows, its
//!    fields are private, and the engine reconciles a draft by the job it
//!    issued, never by anything the draft claims about itself.
//! 2. **The Oak Table (local truth).** State is strictly local to the bounded
//!    environment. Each [`SovereignNode`] owns a Merkle-rooted [`OakTable`].
//!    Nobody else can read or write it.
//! 3. **The Gate (verification).** State transitions only happen when a
//!    [`ProposalEnvelope`] crosses a [`VerificationStrategy`] boundary. There
//!    is no other path from a draft to the Sovereign Graph.
//! 4. **Sovereignty.** Irreversible commits require authorisation: a human
//!    click at Stage 1, an atomic swap at Stage 2, a netting run at Stage 3,
//!    a statutory ruling at Stage 4, a recursive proof at Stage 5.
//!
//! There is **no shared global state by default**. The only global object,
//! the [`SovereignGraph`], is written exclusively inside the Commit phase of
//! [`Engine::tick`], and only from envelopes that a boundary approved.
//!
//! ## The tick is a block, not a frame
//!
//! ```text
//!   ┌──────────── Phase 1: DRAFT ───────────┐   off-chain, parallel, isolated
//!   │  node ─▶ DraftContext ─▶ seats ─▶ Draft │   burns the Purse, never touches the Graph
//!   └───────────────────────────────────────┘
//!   ┌──────────── Phase 2: COLLECT ─────────┐   reconcile burns, mint envelopes,
//!   │  Draft ─▶ ProposalEnvelope ─▶ Mempool  │   apply the coordination tax, courier rule
//!   └───────────────────────────────────────┘
//!   ┌──────────── Phase 3: VERIFY ──────────┐   the Gates (Strategy Pattern):
//!   │  Mempool ─▶ Boundary ─▶ Verdict        │   Door, Letter Slot, Clearinghouse, Court, STARK
//!   └───────────────────────────────────────┘
//!   ┌──────────── Phase 4: COMMIT ──────────┐   Approved ─▶ Sovereign Graph
//!   │  Graph root, cache invalidation, decay │   rejected drafts are sunk cost
//!   └───────────────────────────────────────┘
//! ```
//!
//! ## Empirical anchors
//!
//! Every constant that shapes behaviour is traceable to a measurement made in
//! this laboratory (see `output/ael_experiment_results.json` and
//! `ENERGETIC_RUNWAY_EXPERIMENTS.md`):
//!
//! | constant | value | provenance |
//! |---|---|---|
//! | [`epistemics::OBSERVED_CONFIDENCE_AFTER_20_HANDOVERS`] | 0.5636 | benchmark 2, uncalibrated |
//! | [`epistemics::DECAY_RATE`] | 0.02867 / tick | fitted to the above |
//! | [`tax::OBSERVED_MARKET_TAX_PCT`] | 19.99 % | benchmark 1, Coasean market |
//! | [`tax::OBSERVED_JOB_MARKET_TAX_PCT`] | 30.5 % | runway experiment 2 |
//! | [`epistemics::ORACLE_COST`] | 15 credits | benchmark 2, calibrated |
//! | door holding cost | 0.0 credits | benchmark 3 |

#![deny(unsafe_code)]
#![warn(missing_debug_implementations)]

pub mod agents;
pub mod boundary;
pub mod envelope;
pub mod epistemics;
pub mod events;
pub mod executor;
pub mod graph;
pub mod hash;
pub mod ids;
pub mod lod;
pub mod mempool;
pub mod node;
pub mod oak_table;
pub mod receipt;
pub mod resources;
pub mod rng;
pub mod scenarios;
pub mod tax;
pub mod tick;

#[cfg(target_arch = "wasm32")]
pub mod wasm_abi;

pub use boundary::{HoldReason, HumanDecision, HumanDecisions, Verdict, VerificationStrategy};
pub use envelope::{Crossing, Payload, ProposalEnvelope};
pub use epistemics::Epistemics;
pub use events::EngineEvent;
pub use executor::{
    block_on, block_on_bounded, DraftExecutor, DraftJob, DraftOutcome, SequentialExecutor,
};
pub use graph::SovereignGraph;
pub use hash::Hash32;
pub use ids::{EnvelopeId, NodeId};
pub use node::{
    Agent, BoundaryPolicy, DraftContext, DraftFuture, DraftOutputs, Handover, NodeStatus,
    ProposalDraft, SovereignNode, Stage, Task,
};
pub use oak_table::OakTable;
pub use receipt::{Note, SeatReceipt};
pub use resources::{ModelTier, Purse, ResourceUnit};
pub use rng::Rng;
pub use tick::{Engine, EngineConfig, TickReport};

/// Everything a scenario or a host needs, in one import.
pub mod prelude {
    pub use crate::agents::statistical::{Inspector, Porter, Scout, Scribble, Steward};
    pub use crate::boundary::*;
    pub use crate::envelope::*;
    pub use crate::epistemics::*;
    pub use crate::events::*;
    pub use crate::executor::*;
    pub use crate::graph::*;
    pub use crate::hash::Hash32;
    pub use crate::ids::*;
    pub use crate::lod::*;
    pub use crate::node::*;
    pub use crate::oak_table::*;
    pub use crate::receipt::*;
    pub use crate::resources::*;
    pub use crate::rng::Rng;
    pub use crate::scenarios::*;
    pub use crate::tax::*;
    pub use crate::tick::*;
}
