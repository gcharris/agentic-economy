//! The LLM-backed seat. Same [`Agent`] trait, but `draft` awaits a network
//! call. Under the Tokio executor twenty houses' model calls run
//! concurrently; under the sequential executor they run one at a time. The
//! engine does not know the difference, which is the point.
//!
//! No live backend ships in this scaffold. The Vault route is documented in
//! the estate's reference docs; wire it as an [`InferenceBackend`].
//!
//! Trust boundary: the prompt carries the house's name, purse balance, task
//! and the last papers on its table to whichever backend the host installs.
//! A shared backend sees every house's prompt. That is the host's choice to
//! make, and it is why the backend is a trait the host implements.

use crate::node::{Agent, DraftContext, DraftFuture};
use crate::resources::ModelTier;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

pub type BackendFuture = Pin<Box<dyn Future<Output = Result<String, String>> + Send>>;

pub trait InferenceBackend: Send + Sync {
    fn name(&self) -> &str;
    fn complete(&self, tier: ModelTier, prompt: String) -> BackendFuture;
}

/// A seat whose thinking is a model call.
pub struct LlmSeat {
    pub seat: String,
    pub tier: ModelTier,
    pub rigor: f64,
    pub backend: Arc<dyn InferenceBackend>,
}

impl std::fmt::Debug for LlmSeat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "LlmSeat({} on {})", self.seat, self.backend.name())
    }
}

impl LlmSeat {
    fn prompt(&self, ctx: &DraftContext) -> String {
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
        let backend = self.backend.clone();
        let tier = self.tier;
        let seat = self.seat.clone();
        let rigor = self.rigor;
        Box::pin(async move {
            let prompt_tokens = (prompt.len() / 4) as u32;
            match backend.complete(tier, prompt).await {
                Ok(text) => {
                    let tokens = prompt_tokens + (text.len() / 4) as u32;
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
