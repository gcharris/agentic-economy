//! Stage 4 laboratory worlds: a jurisdiction in which a minority of nodes
//! propose liquidity their truth cannot back, so that one tick's clearing
//! collapses and the High Court has something to rule on.
//!
//! Two shapes of the same failure, one per gate the collapse happens at:
//!
//! * [`forged_street`]: houses under a street, camera at the street, so the
//!   forgeries fail the Letter Slot's *lock* (a plain `Rejected`).
//! * [`forged_country`]: cities under a country, camera at the city, so the
//!   forgeries fail the Clearinghouse's *netting* (a `Slashed` verdict) and
//!   the court's rollback and the gate's slash interact.
//!
//! Nothing here reads a clock or OS entropy: the only "randomness" is the
//! engine's seeded generator, and the seats below do not even use that.

use crate::envelope::Payload;
use crate::ids::NodeId;
use crate::node::{Agent, DraftContext, DraftFuture, ProposalDraft, Stage, Task};
use crate::resources::{ModelTier, Purse};
use crate::tick::{Engine, EngineConfig};
use std::sync::Arc;

/// A seat with a standing order: from `arm_tick` on, propose one
/// `LiquidityTransfer` of `amount` per tick to the first peer it knows.
///
/// It burns no inference. It does not check whether the purse covers the
/// amount: a seat only ever sees its *belief* about its balance, and the
/// whole point of Stage 4 is what happens when many beliefs are wrong at
/// once. Backing is the gate's business, not the seat's.
#[derive(Debug, Clone)]
pub struct Transferor {
    pub amount: f64,
    pub arm_tick: u64,
    pub memo: &'static str,
}

impl Transferor {
    /// Proposes more than any truth in the world can back.
    pub fn forger(arm_tick: u64) -> Self {
        Transferor {
            amount: 10_000.0,
            arm_tick,
            memo: "settle the invoice (I am sure I am good for it)",
        }
    }

    /// Proposes a modest, backed payment.
    pub fn honest(arm_tick: u64) -> Self {
        Transferor {
            amount: 5.0,
            arm_tick,
            memo: "this week's courier bill",
        }
    }
}

impl Agent for Transferor {
    fn seat(&self) -> &str {
        "Transferor"
    }

    fn tier(&self) -> ModelTier {
        ModelTier::FastQuantized
    }

    fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
        if ctx.tick() < self.arm_tick || ctx.task().is_none() {
            return Box::pin(async move { ctx });
        }
        let Some(&peer) = ctx.known_peers().first() else {
            return Box::pin(async move { ctx });
        };
        ctx.think(
            "Transferor",
            format!(
                "Paying {:.1} to {peer}; I believe I hold {:.1}.",
                self.amount,
                ctx.purse().liquidity
            ),
        );
        ctx.propose(ProposalDraft {
            target: peer,
            payload: Payload::LiquidityTransfer {
                amount: self.amount,
                memo: self.memo.to_string(),
            },
            requested_liquidity: self.amount,
            compute_weight: 1.0,
        });
        Box::pin(async move { ctx })
    }
}

/// Who is who in a court world.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CourtWorld {
    /// The node the members hang under (the street, or the country).
    pub parent: NodeId,
    /// Members whose belief about their balance is a delusion.
    pub forgers: Vec<NodeId>,
    /// Members whose belief is the truth.
    pub honest: Vec<NodeId>,
}

impl CourtWorld {
    pub fn members(&self) -> impl Iterator<Item = NodeId> + '_ {
        self.forgers.iter().chain(self.honest.iter()).copied()
    }
}

/// Population shared by both shapes. Every member has truth `truth_each`
/// in the Sovereign Graph; forgers additionally *believe* they hold
/// `delusion` (their purse belief is set above the truth). Honest members
/// trade from tick 1; forgers sleep until `arm_tick`. Peer wiring is
/// deterministic: a forger's first peer is the first honest node (the
/// mark), or the next forger when there is no honest node; an honest
/// node's first peer is the next honest node, or the first forger.
fn populate(
    e: &mut Engine,
    parent: NodeId,
    stage: Stage,
    forgers: usize,
    honest: usize,
    arm_tick: u64,
    truth_each: f64,
    delusion: f64,
) -> CourtWorld {
    let mut f_ids = Vec::with_capacity(forgers);
    let mut h_ids = Vec::with_capacity(honest);
    for i in 1..=forgers {
        let id = e.add_node(
            format!("Forger {i}"),
            stage,
            Some(parent),
            Purse::new(600.0, truth_each),
        );
        let n = e.node_mut(id).expect("just added");
        n.purse.liquidity = delusion;
        n.tasks.push(Task::synthesis("standing_order"));
        e.seat(id, Arc::new(Transferor::forger(arm_tick)));
        f_ids.push(id);
    }
    for i in 1..=honest {
        let id = e.add_node(
            format!("Honest {i}"),
            stage,
            Some(parent),
            Purse::new(600.0, truth_each),
        );
        e.node_mut(id)
            .expect("just added")
            .tasks
            .push(Task::synthesis("standing_order"));
        e.seat(id, Arc::new(Transferor::honest(0)));
        h_ids.push(id);
    }
    for (i, f) in f_ids.iter().enumerate() {
        let mut peers: Vec<NodeId> = Vec::new();
        if let Some(mark) = h_ids.first() {
            peers.push(*mark);
        } else if f_ids.len() > 1 {
            peers.push(f_ids[(i + 1) % f_ids.len()]);
        }
        let rest: Vec<NodeId> = f_ids
            .iter()
            .chain(h_ids.iter())
            .copied()
            .filter(|p| p != f && !peers.contains(p))
            .collect();
        peers.extend(rest);
        e.node_mut(*f).expect("forger").known_peers = peers;
    }
    for (i, h) in h_ids.iter().enumerate() {
        let mut peers: Vec<NodeId> = Vec::new();
        if h_ids.len() > 1 {
            peers.push(h_ids[(i + 1) % h_ids.len()]);
        } else if let Some(f) = f_ids.first() {
            peers.push(*f);
        }
        let rest: Vec<NodeId> = h_ids
            .iter()
            .chain(f_ids.iter())
            .copied()
            .filter(|p| p != h && !peers.contains(p))
            .collect();
        peers.extend(rest);
        e.node_mut(*h).expect("honest").known_peers = peers;
    }
    CourtWorld {
        parent,
        forgers: f_ids,
        honest: h_ids,
    }
}

/// A street whose clearing collapses at the Letter Slot. Camera at the
/// street. Each forger believes it holds `delusion` while the truth is
/// `truth_each`; from `arm_tick` on it tries to pay 10 000 to the mark.
pub fn forged_street(
    mut config: EngineConfig,
    forgers: usize,
    honest: usize,
    arm_tick: u64,
    truth_each: f64,
    delusion: f64,
) -> (Engine, CourtWorld) {
    config.active_scale = Stage::Street;
    let mut e = Engine::new(config);
    let city = e.add_node("The City", Stage::City, None, Purse::new(0.0, 0.0));
    let street = e.add_node(
        "Elm Street",
        Stage::Street,
        Some(city),
        Purse::new(0.0, 0.0),
    );
    let world = populate(
        &mut e,
        street,
        Stage::House,
        forgers,
        honest,
        arm_tick,
        truth_each,
        delusion,
    );
    (e, world)
}

/// A country whose cities' clearing collapses at the Clearinghouse. Camera
/// at the city, so every member's envelope is netted before the court sees
/// the tick.
pub fn forged_country(
    mut config: EngineConfig,
    forgers: usize,
    honest: usize,
    arm_tick: u64,
    truth_each: f64,
    delusion: f64,
) -> (Engine, CourtWorld) {
    config.active_scale = Stage::City;
    let mut e = Engine::new(config);
    let country = e.add_node("Albion", Stage::Country, None, Purse::new(0.0, 0.0));
    let world = populate(
        &mut e,
        country,
        Stage::City,
        forgers,
        honest,
        arm_tick,
        truth_each,
        delusion,
    );
    (e, world)
}
