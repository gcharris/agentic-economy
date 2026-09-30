//! Statistically modelled seats. Every burn is priced by the laboratory
//! kernel; every handover moves Φ by the laboratory formula. These are the
//! seats the LOD engine falls back to, and the seats the browser build runs.

use crate::envelope::Payload;
use crate::epistemics::{DEFAULT_RIGOR, ORACLE_COST};
use crate::graph::SovereignGraph;
use crate::node::{Agent, DraftContext, DraftFuture, ProposalDraft, Stage};
use crate::resources::ModelTier;

fn done(ctx: DraftContext) -> DraftFuture {
    Box::pin(async move { ctx })
}

/// Reads. Survey and ingest. Cache miss (the world is new every time).
/// Also the seat that notices its notes are old and asks the oracle.
#[derive(Debug, Clone)]
pub struct Scout {
    pub rigor: f64,
}

impl Default for Scout {
    fn default() -> Self {
        Scout {
            rigor: DEFAULT_RIGOR,
        }
    }
}

impl Agent for Scout {
    fn seat(&self) -> &str {
        "Scout"
    }

    fn tier(&self) -> ModelTier {
        ModelTier::FastQuantized
    }

    fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
        let Some(task) = ctx.task().cloned() else {
            return done(ctx);
        };

        // Under `OraclePolicy::Person` only the person asks the oracle (doc 06 §8.1).
        if ctx.staff_oracle()
            && (ctx.epistemics().overdue_for_oracle() || ctx.epistemics().is_hallucinating())
        {
            let (gen, phi) = (ctx.epistemics().generation, ctx.epistemics().confidence);
            ctx.think("Scout", format!("My notes are {gen} handovers old (Φ {:.0}%). Asking the oracle before I look anything up.", phi * 100.0));
            let me = ctx.node_id();
            ctx.propose(ProposalDraft {
                target: me,
                payload: Payload::StateSync,
                requested_liquidity: 0.0,
                compute_weight: ORACLE_COST,
            });
        }

        let nominal = task.nominal_estimate();
        let tokens = if ctx.cost_visible() && ctx.purse().compute < nominal * 1.5 {
            let left = ctx.purse().compute;
            ctx.think(
                "Scout",
                format!("The purse is light ({left:.0} cr). Buying the compact lookup."),
            );
            (task.lookup_tokens as f64 * 0.6) as u32
        } else {
            task.lookup_tokens
        };

        if let Ok(unit) = ctx.burn("Scout", "lookup", ModelTier::FastQuantized, tokens, false) {
            let sources = 3 + ctx.rng().below(4);
            ctx.scratch().insert("sources".into(), sources.to_string());
            ctx.leave_paper(
                "Scout",
                format!("Lookup notes · {}", task.id),
                format!("{sources} sources consulted, {} tokens read", unit.tokens),
                unit.tokens,
            );
            ctx.think(
                "Scout",
                format!("Looked up {sources} sources for {}.", task.id),
            );
        }
        done(ctx)
    }
}

/// Drafts. Balanced tier, cache hit (the Scout's notes are already on the
/// table). One handover. Below the hallucination threshold it starts to
/// believe prices that are not on the table.
#[derive(Debug, Clone)]
pub struct Scribble {
    pub rigor: f64,
}

impl Default for Scribble {
    fn default() -> Self {
        Scribble { rigor: 0.90 }
    }
}

impl Agent for Scribble {
    fn seat(&self) -> &str {
        "Scribble"
    }

    fn tier(&self) -> ModelTier {
        ModelTier::BalancedStaff
    }

    fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
        let Some(task) = ctx.task().cloned() else {
            return done(ctx);
        };
        if ctx.halted() {
            return done(ctx);
        }
        let cache_hit = ctx.scratch().contains_key("sources");
        // The live-cost-visibility finding, as behaviour. With the price on
        // the table the seat buys the ordinary draft, and the compact one
        // when the purse is light. With the price hidden it buys the
        // longest, heaviest thinking because it sounds thorough, until the
        // next one does not fit.
        let (tier, tokens) = if !ctx.cost_visible() {
            (ModelTier::FrontierDeep, task.draft_tokens * 2)
        } else if ctx.purse().compute < task.nominal_estimate() * 1.5 {
            let left = ctx.purse().compute;
            ctx.think(
                "Scribble",
                format!("The purse is light ({left:.0} cr). Writing the compact draft."),
            );
            (
                ModelTier::BalancedStaff,
                (task.draft_tokens as f64 * 0.6) as u32,
            )
        } else {
            (ModelTier::BalancedStaff, task.draft_tokens)
        };
        if let Ok(unit) = ctx.burn("Scribble", "draft", tier, tokens, cache_hit) {
            let phi = ctx.record_handover(tier, self.rigor);
            // The price this house believes the courier charges.
            let cached = ctx.oak().get_f64("price/courier").unwrap_or(10.0);
            let fog = ctx.epistemics().fog();
            let hallucinating = ctx.epistemics().is_hallucinating();
            let believed = if hallucinating && ctx.rng().chance(fog) {
                let sign = if ctx.rng().chance(0.5) { 1.0 } else { -1.0 };
                let drift = 1.0 + ctx.rng().range_f64(0.10, 0.30) * sign;
                let b = (cached * drift * 100.0).round() / 100.0;
                ctx.think(
                    "Scribble",
                    format!(
                        "I'm fairly sure the courier costs {b:.2} now (Φ {:.0}%).",
                        phi * 100.0
                    ),
                );
                b
            } else {
                cached
            };
            ctx.scratch()
                .insert("believed_price".into(), format!("{believed:.4}"));
            ctx.leave_paper(
                "Scribble",
                format!("Draft · {}", task.id),
                format!(
                    "{} tokens, courier priced at {believed:.2}, Φ {:.1}%",
                    unit.tokens,
                    phi * 100.0
                ),
                unit.tokens,
            );
            ctx.think(
                "Scribble",
                format!(
                    "Drafted {} ({} tok{}).",
                    task.id,
                    unit.tokens,
                    if cache_hit { ", cache hit" } else { "" }
                ),
            );
        }
        done(ctx)
    }
}

/// Audits. Frontier tier, cache hit. One handover at high rigor.
#[derive(Debug, Clone)]
pub struct Inspector {
    pub rigor: f64,
}

impl Default for Inspector {
    fn default() -> Self {
        Inspector { rigor: 0.98 }
    }
}

impl Agent for Inspector {
    fn seat(&self) -> &str {
        "Inspector"
    }

    fn tier(&self) -> ModelTier {
        ModelTier::FrontierDeep
    }

    fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
        let Some(task) = ctx.task().cloned() else {
            return done(ctx);
        };
        if ctx.halted() {
            return done(ctx);
        }
        let cache_hit = ctx.scratch().contains_key("believed_price");
        let tokens = if ctx.cost_visible() {
            task.audit_tokens
        } else {
            task.audit_tokens * 3 / 2
        };
        if let Ok(unit) = ctx.burn(
            "Inspector",
            "audit",
            ModelTier::FrontierDeep,
            tokens,
            cache_hit,
        ) {
            let phi = ctx.record_handover(ModelTier::FrontierDeep, self.rigor);
            let verdict = if ctx.epistemics().is_hallucinating() {
                "flagged"
            } else {
                "passed"
            };
            ctx.scratch().insert("audit".into(), verdict.into());
            ctx.leave_paper(
                "Inspector",
                format!("Audit · {}", task.id),
                format!("{verdict}, {} tokens, Φ {:.1}%", unit.tokens, phi * 100.0),
                unit.tokens,
            );
            ctx.think(
                "Inspector",
                if verdict == "passed" {
                    format!("Audit passed for {}.", task.id)
                } else {
                    format!(
                        "I cannot verify {} from what is on the table. Flagging it.",
                        task.id
                    )
                },
            );
        }
        done(ctx)
    }
}

/// Sweeps the cushion. Never yield. Never a balance.
#[derive(Debug, Clone, Default)]
pub struct Steward;

impl Agent for Steward {
    fn seat(&self) -> &str {
        "Penny"
    }

    fn tier(&self) -> ModelTier {
        ModelTier::FastQuantized
    }

    fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
        if let Some(task) = ctx.task().cloned() {
            let cushion = (task.nominal_estimate() - ctx.burned()).max(0.0);
            if cushion > 0.0 {
                ctx.note_cushion(cushion);
                ctx.think("Penny", format!("Swept {cushion:.1} cr of unburned allocation back to the runway. Zero yield."));
            }
        }
        done(ctx)
    }
}

/// Walks to the door. Produces the envelope that leaves the house. No
/// inference burn of its own; the send cost is charged only after yes.
#[derive(Debug, Clone, Default)]
pub struct Porter;

impl Agent for Porter {
    fn seat(&self) -> &str {
        "Porter"
    }

    fn tier(&self) -> ModelTier {
        ModelTier::FastQuantized
    }

    fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
        let Some(task) = ctx.task().cloned() else {
            return done(ctx);
        };
        if ctx.halted() || !ctx.scratch().contains_key("audit") {
            return done(ctx);
        }
        let audit = ctx.scratch().get("audit").cloned().unwrap_or_default();
        let target = ctx.parent().unwrap_or(ctx.node_id());
        ctx.think(
            "Porter",
            format!(
                "Walking to the door with {}. Sending costs {:.0} cr. Nothing burns while we wait.",
                task.id, task.spend
            ),
        );
        ctx.propose(ProposalDraft {
            target,
            payload: Payload::Dispatch {
                message: format!("Finished draft for {} (audit {audit})", task.id),
                task_id: task.id.clone(),
            },
            requested_liquidity: 0.0,
            compute_weight: task.spend,
        });

        // On a street, a house also hires its neighbour's courier by atomic swap.
        if ctx.stage() == Stage::House && !ctx.known_peers().is_empty() {
            if let Some(believed) = ctx
                .scratch()
                .get("believed_price")
                .and_then(|s| s.parse::<f64>().ok())
            {
                let peers = ctx.known_peers().to_vec();
                let idx = ctx.rng().below(peers.len() as u64) as usize;
                let peer = peers[idx];
                ctx.propose(ProposalDraft {
                    target: peer,
                    payload: Payload::HireService {
                        service: "courier".into(),
                        believed_price: believed,
                        believed_price_hash: SovereignGraph::hash_price("courier", believed),
                        task_id: Some(task.id.clone()),
                    },
                    requested_liquidity: believed,
                    compute_weight: 2.0,
                });
            }
        }
        done(ctx)
    }
}
