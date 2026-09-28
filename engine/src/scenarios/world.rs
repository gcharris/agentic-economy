//! Stage 5. The World: countries as root nodes on the planetary rails.
//!
//! There is no High Court up here. Every envelope that crosses a border is
//! verified by the Global Validators ([`crate::boundary::Stage5RecursiveStark`]):
//! it is held at the country's door for 8–32 ticks of finality, then
//! settles or fails its proof. Every `stark_period` ticks the validators
//! aggregate the countries' Oak Table roots into one global root and emit
//! `GLOBAL_STATE_CONFIRMED`, the heartbeat of the simulation.
//!
//! Same engine, same four laws. A country is a [`SovereignNode`] like a
//! house; its seat is a [`Chancellor`] instead of a Porter; its gate is a
//! proof instead of a hand on a latch.
//!
//! Camera at [`Stage::World`]: countries run discretely, their cities are in
//! statistical stasis (doc 03), and the country's own gate is the higher of
//! Statutory Law and the camera, which is the STARK verifier.

use crate::envelope::Payload;
use crate::node::{Agent, DraftContext, DraftFuture, ProposalDraft, Stage, Task, TaskState};
use crate::resources::{ModelTier, Purse};
use crate::tick::{Engine, EngineConfig};
use std::sync::Arc;

/// Compute a country starts the run with, in credits.
pub const COUNTRY_COMPUTE: f64 = 2_000.0;
/// Liquidity a country starts the run with (belief and truth agree at t0).
pub const COUNTRY_LIQUIDITY: f64 = 10_000.0;
/// Liquidity each city holds. Cities never draft at this zoom; their balance
/// only feeds the packed profile's velocity.
pub const CITY_LIQUIDITY: f64 = 1_000.0;
/// The flat fee for a cross-border settlement, in credits. Paid only after
/// the proof lands (the send cost comes out after yes, at every stage).
pub const SETTLEMENT_FEE: f64 = 5.0;
/// Tokens the Chancellor spends reading the ledger. Cache hit: the ledger is
/// already on the table.
pub const LEDGER_TOKENS: u32 = 60;
/// Title of the ledger line the Chancellor leaves on the Oak Table.
pub const LEDGER_TITLE: &str = "Ledger";
/// The standing order every country carries. It never completes: it is the
/// mandate to settle, not a document to finish. Stage 1 rule 1 still holds:
/// no task, no burn, and this is the task.
pub const STANDING_ORDER: &str = "standing-order/cross-border-settlement";

/// The country's one seat at Stage 5. Reads the ledger with one cheap cached
/// call, writes a ledger line only when the country's position moved (so the
/// Oak Table root is the ledger, and moves exactly when the ledger does),
/// and proposes one cross-border `LiquidityTransfer` to another country.
///
/// It cannot see the Sovereign Graph. The amount is a share of the balance
/// the country *believes* it has. If belief and truth have parted, the proof
/// fails at the gate and the compute is sunk; that is the whole point.
#[derive(Debug, Clone)]
pub struct Chancellor {
    /// Fraction of the believed balance settled per envelope.
    pub share: f64,
    /// Flat fee for the crossing, in credits.
    pub settlement_fee: f64,
}

impl Default for Chancellor {
    fn default() -> Self {
        Chancellor {
            share: 0.02,
            settlement_fee: SETTLEMENT_FEE,
        }
    }
}

fn done(ctx: DraftContext) -> DraftFuture {
    Box::pin(async move { ctx })
}

impl Agent for Chancellor {
    fn seat(&self) -> &str {
        "Chancellor"
    }

    fn tier(&self) -> ModelTier {
        ModelTier::FastQuantized
    }

    fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
        if ctx.known_peers().is_empty() {
            return done(ctx);
        }
        // One cheap, cached call to read the ledger. On exhaustion the seat
        // stops here and the engine writes the note.
        let Ok(unit) = ctx.burn(
            "Chancellor",
            "read the ledger",
            ModelTier::FastQuantized,
            LEDGER_TOKENS,
            true,
        ) else {
            return done(ctx);
        };

        // The ledger line goes on the table only when the position moved.
        // The country's Merkle root therefore changes exactly when its
        // ledger does, which is what the validators aggregate.
        let balance = ctx.purse().liquidity;
        let line = format!("{balance:.2}");
        let last = ctx
            .oak()
            .papers
            .iter()
            .rev()
            .find(|p| p.title == LEDGER_TITLE)
            .map(|p| p.body.as_str());
        if last != Some(line.as_str()) {
            ctx.leave_paper("Chancellor", LEDGER_TITLE, line, unit.tokens);
        }

        let amount = (balance * self.share * 100.0).round() / 100.0;
        if amount < 1.0 {
            ctx.think(
                "Chancellor",
                format!("Nothing to settle: the ledger shows {balance:.2}."),
            );
            return done(ctx);
        }
        let peer_count = ctx.known_peers().len() as u64;
        let idx = ctx.rng().below(peer_count) as usize;
        let target = ctx.known_peers()[idx];
        ctx.think("Chancellor", format!("Settling {amount:.2} across the border to {target}. Finality is the validators' to give: 8–32 ticks, nothing burns while we wait."));
        ctx.propose(ProposalDraft {
            target,
            payload: Payload::LiquidityTransfer {
                amount,
                memo: format!(
                    "cross-border settlement t{} from {}",
                    ctx.tick(),
                    ctx.node_name()
                ),
            },
            requested_liquidity: amount,
            compute_weight: self.settlement_fee,
        });
        done(ctx)
    }
}

/// Stage 5. `countries` root nodes, each with `cities_per_country` City
/// children in stasis, each staffed by a [`Chancellor`] that settles across
/// borders through the Recursive STARK gate. The camera is at the World.
pub fn world(mut config: EngineConfig, countries: usize, cities_per_country: usize) -> Engine {
    config.active_scale = Stage::World;
    let mut e = Engine::new(config);
    let mut ids = Vec::with_capacity(countries);
    for i in 1..=countries {
        let c = e.add_node(
            format!("Country {i}"),
            Stage::Country,
            None,
            Purse::new(COUNTRY_COMPUTE, COUNTRY_LIQUIDITY),
        );
        for j in 1..=cities_per_country {
            e.add_node(
                format!("City {i}.{j}"),
                Stage::City,
                Some(c),
                Purse::new(0.0, CITY_LIQUIDITY),
            );
        }
        let node = e.node_mut(c).expect("just added");
        node.tasks.push(Task {
            id: STANDING_ORDER.into(),
            lookup_tokens: LEDGER_TOKENS,
            draft_tokens: 0,
            audit_tokens: 0,
            spend: SETTLEMENT_FEE,
            state: TaskState::Pending,
        });
        node.oak_table.put(
            "charter",
            format!("Country {i}: sovereign ballast on the planetary rails"),
        );
        e.seat(c, Arc::new(Chancellor::default()));
        ids.push(c);
    }
    for c in &ids {
        let peers: Vec<_> = ids.iter().copied().filter(|p| p != c).collect();
        e.node_mut(*c).expect("country").known_peers = peers;
    }
    // The camera: cities fold into their countries' statistical profiles.
    e.set_active_scale(Stage::World);
    e
}
