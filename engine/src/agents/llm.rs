//! The LLM-backed seat. Same [`Agent`] trait, but `draft` awaits a network
//! call. Under the Tokio executor twenty houses' model calls run
//! concurrently; under the sequential executor they run one at a time. The
//! engine does not know the difference, which is the point.
//!
//! The scaffold ships [`MockBackend`] for tests and demos. A real backend
//! over the estate Vault route is `crate::agents::vault::VaultBackend`,
//! behind the `vault` cargo feature (native only): a host builds it with
//! `VaultBackend::new(VaultConfig::default())?` and hands it to every
//! [`LlmSeat`] in an `Arc`. See that module for the spend controls it
//! enforces (bounded retries, no fallback, circuit breaker).
//!
//! ## The reservation rule
//!
//! A budget is reserved before submission, not after: the seat prices the
//! call it is about to make (prompt tokens plus [`LlmSeat::max_tokens_estimate`]
//! of completion, on its tier, by the same tokens→credits rule
//! [`DraftContext::burn`] applies) and refuses to call the backend when the
//! purse cannot cover that estimate. The refusal is a [`Thought`] on the
//! record, not a burn: nothing is debited and the backend never sees the
//! prompt. Set `max_tokens_estimate` to the backend's real completion
//! allowance for a hard reservation.
//!
//! Trust boundary: the prompt carries the house's name, purse balance, task
//! and the last papers on its table to whichever backend the host installs.
//! A shared backend sees every house's prompt. That is the host's choice to
//! make, and it is why the backend is a trait the host implements.
//!
//! [`Thought`]: crate::node::Thought

use crate::node::{Agent, DraftContext, DraftFuture};
use crate::resources::{ModelTier, ResourceUnit};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

pub type BackendFuture = Pin<Box<dyn Future<Output = Result<String, String>> + Send>>;

pub trait InferenceBackend: Send + Sync {
    fn name(&self) -> &str;
    fn complete(&self, tier: ModelTier, prompt: String) -> BackendFuture;
}

/// The completion allowance a seat reserves for when the host has not said
/// otherwise: 512 tokens, about a page.
pub const DEFAULT_MAX_TOKENS_ESTIMATE: u32 = 512;

/// A seat whose thinking is a model call.
pub struct LlmSeat {
    pub seat: String,
    pub tier: ModelTier,
    pub rigor: f64,
    pub backend: Arc<dyn InferenceBackend>,
    /// Completion tokens reserved before the call, on top of the prompt.
    /// The estimate the purse must cover; see the module docs.
    pub max_tokens_estimate: u32,
}

impl std::fmt::Debug for LlmSeat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "LlmSeat({} on {})", self.seat, self.backend.name())
    }
}

impl LlmSeat {
    /// A seat with the default reservation ([`DEFAULT_MAX_TOKENS_ESTIMATE`]).
    pub fn new(
        seat: impl Into<String>,
        tier: ModelTier,
        rigor: f64,
        backend: Arc<dyn InferenceBackend>,
    ) -> Self {
        LlmSeat {
            seat: seat.into(),
            tier,
            rigor,
            backend,
            max_tokens_estimate: DEFAULT_MAX_TOKENS_ESTIMATE,
        }
    }

    /// The rough token count the seat uses for both the reservation and the
    /// burn: four characters per token.
    pub fn estimate_tokens(text: &str) -> u32 {
        (text.len() / 4) as u32
    }

    /// The credits this call must be able to burn before it is made:
    /// prompt tokens plus the completion allowance, priced as the burn will
    /// price them.
    pub fn reservation(&self, prompt_tokens: u32) -> f64 {
        let tokens = prompt_tokens.saturating_add(self.max_tokens_estimate);
        ResourceUnit::burn(self.tier, tokens, false).credits()
    }

    /// The prompt this seat would send for `ctx`. Public so a host can
    /// preview it and price the reservation ([`Self::reservation`]) itself.
    pub fn prompt(&self, ctx: &DraftContext) -> String {
        let mut p = String::new();
        p.push_str(&format!(
            "You are {} at the oak table of {}.\n",
            self.seat,
            ctx.node_name()
        ));
        if ctx.cost_visible() {
            p.push_str(&format!(
                "Purse: {:.1} credits remain. This call is priced at {} J/token.\n",
                ctx.purse().compute,
                self.tier.spec().joules_per_tok
            ));
        }
        if let Some(t) = ctx.task() {
            p.push_str(&format!("Task: {}.\n", t.id));
        }
        for paper in ctx.papers().iter().rev().take(3) {
            p.push_str(&format!("On the table: {} — {}\n", paper.title, paper.body));
        }
        p.push_str(
            "Reply with your work. You may look and draft. You may not send, pay, or close.\n",
        );
        p
    }
}

impl Agent for LlmSeat {
    fn seat(&self) -> &str {
        &self.seat
    }

    fn tier(&self) -> ModelTier {
        self.tier
    }

    fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
        let prompt = self.prompt(&ctx);
        let prompt_tokens = Self::estimate_tokens(&prompt);
        let reservation = self.reservation(prompt_tokens);
        let backend = self.backend.clone();
        let tier = self.tier;
        let seat = self.seat.clone();
        let rigor = self.rigor;
        Box::pin(async move {
            // The reservation rule: no purse, no call. Nothing is debited and
            // the backend is not consulted; the thought is the record.
            if !ctx.purse().can_burn(reservation) {
                let held = ctx.purse().compute;
                ctx.think(
                    &seat,
                    format!(
                        "cannot reserve {reservation:.2} cr for this call; purse holds {held:.2}"
                    ),
                );
                return ctx;
            }
            match backend.complete(tier, prompt).await {
                Ok(text) => {
                    let tokens = prompt_tokens + Self::estimate_tokens(&text);
                    if ctx.burn(&seat, "inference", tier, tokens, false).is_ok() {
                        ctx.record_handover(tier, rigor);
                        let title = format!(
                            "{seat} · {}",
                            ctx.task().map(|t| t.id.clone()).unwrap_or_default()
                        );
                        ctx.leave_paper(&seat, title, text.clone(), tokens);
                        ctx.think(&seat, text.chars().take(120).collect::<String>());
                    }
                }
                Err(e) => ctx.think(&seat, format!("The model did not answer: {e}")),
            }
            ctx
        })
    }
}

/// A backend that answers instantly with canned text. For tests and demos.
#[derive(Debug, Clone)]
pub struct MockBackend {
    pub reply: String,
}

impl InferenceBackend for MockBackend {
    fn name(&self) -> &str {
        "mock"
    }

    fn complete(&self, _tier: ModelTier, _prompt: String) -> BackendFuture {
        let reply = self.reply.clone();
        Box::pin(async move { Ok(reply) })
    }
}
