//! The reservation rule: an `LlmSeat` prices its call before it makes it,
//! and a purse that cannot cover the estimate keeps the backend uncalled.
//! Default features; no network.

use context_engine::agents::llm::{
    BackendFuture, InferenceBackend, LlmSeat, MockBackend, DEFAULT_MAX_TOKENS_ESTIMATE,
};
use context_engine::executor::block_on;
use context_engine::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

/// A backend that must never be reached.
#[derive(Debug)]
struct TrapBackend;

impl InferenceBackend for TrapBackend {
    fn name(&self) -> &str {
        "trap"
    }
    fn complete(&self, _tier: ModelTier, _prompt: String) -> BackendFuture {
        panic!("the backend was called without a reservation");
    }
}

/// A backend that counts its calls and answers like the mock.
#[derive(Debug)]
struct CountingBackend {
    calls: AtomicUsize,
    inner: MockBackend,
}

impl InferenceBackend for CountingBackend {
    fn name(&self) -> &str {
        "counting"
    }
    fn complete(&self, tier: ModelTier, prompt: String) -> BackendFuture {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.inner.complete(tier, prompt)
    }
}

fn context_with(compute: f64) -> DraftContext {
    let mut node = SovereignNode::new(
        NodeId(7),
        "House Seven",
        Stage::House,
        None,
        Purse::new(compute, 0.0),
        42,
    );
    node.draft_context(1, 1, true)
}

#[test]
fn a_purse_that_cannot_afford_the_estimate_keeps_the_backend_uncalled() {
    let seat = LlmSeat::new(
        "Scout",
        ModelTier::BalancedStaff,
        0.8,
        Arc::new(TrapBackend),
    );
    assert_eq!(seat.max_tokens_estimate, DEFAULT_MAX_TOKENS_ESTIMATE);
    // 512 completion tokens alone are 51.2 cr; 10 cr cannot cover them.
    let ctx = context_with(10.0);
    let out = block_on(seat.draft(ctx)).into_outputs();

    assert_eq!(out.burned, 0.0, "nothing is debited");
    assert!(
        out.receipts.is_empty(),
        "no receipt: the call was never made"
    );
    assert!(out.papers.is_empty());
    assert!(out.halted_doing.is_none(), "a refusal is not a halt");
    assert_eq!(out.thoughts.len(), 1);
    let thought = &out.thoughts[0];
    assert_eq!(thought.seat, "Scout");
    assert!(
        thought.text.starts_with("cannot reserve "),
        "{}",
        thought.text
    );
    assert!(
        thought.text.ends_with("; purse holds 10.00"),
        "{}",
        thought.text
    );
}

#[test]
fn the_estimate_is_the_burn_rule_applied_to_prompt_plus_allowance() {
    let seat = LlmSeat {
        seat: "Scribble".into(),
        tier: ModelTier::FrontierDeep,
        rigor: 0.9,
        backend: Arc::new(TrapBackend),
        max_tokens_estimate: 1000,
    };
    // 1000 tokens of allowance + 0 prompt tokens = 100.0 cr, whatever the tier.
    assert_eq!(seat.reservation(0), 100.0);
    assert_eq!(
        seat.reservation(37),
        ResourceUnit::burn(ModelTier::FrontierDeep, 1037, false).credits()
    );
    // Just short of the estimate: refused, with the numbers in the thought.
    let ctx = context_with(99.99);
    let out = block_on(seat.draft(ctx)).into_outputs();
    assert!(out.receipts.is_empty());
    assert!(out.thoughts[0].text.contains("purse holds 99.99"));
}

#[test]
fn a_purse_that_can_afford_the_estimate_calls_the_backend_and_burns_the_actual_cost() {
    let backend = Arc::new(CountingBackend {
        calls: AtomicUsize::new(0),
        inner: MockBackend {
            reply: "The scout reports: two doors, one open.".into(),
        },
    });
    let seat = LlmSeat::new("Scout", ModelTier::FastQuantized, 0.8, backend.clone());
    let ctx = context_with(1000.0);
    let out = block_on(seat.draft(ctx)).into_outputs();

    assert_eq!(
        backend.calls.load(Ordering::SeqCst),
        1,
        "called exactly once"
    );
    assert_eq!(out.receipts.len(), 1);
    assert_eq!(out.receipts[0].action, "inference");
    assert!(out.burned > 0.0);
    assert!(
        out.burned < seat.reservation(0) + 100.0,
        "the burn is the actual cost, well under the reservation"
    );
    assert_eq!(out.papers.len(), 1);
    assert!(out.papers[0].body.starts_with("The scout reports"));
    assert!(
        out.thoughts
            .iter()
            .all(|t| !t.text.starts_with("cannot reserve")),
        "no refusal on the record"
    );
    assert_eq!(out.handovers.len(), 1);
}

#[test]
fn a_purse_holding_exactly_the_estimate_proceeds_and_one_cent_less_does_not() {
    // With the price hidden the prompt does not mention the purse, so its
    // size, and the estimate, do not depend on the balance.
    let context = |compute: f64| {
        let mut node = SovereignNode::new(
            NodeId(8),
            "House Eight",
            Stage::House,
            None,
            Purse::new(compute, 0.0),
            42,
        );
        node.draft_context(1, 1, false)
    };
    let backend = Arc::new(CountingBackend {
        calls: AtomicUsize::new(0),
        inner: MockBackend { reply: "ok".into() },
    });
    let seat = LlmSeat::new("Scout", ModelTier::FastQuantized, 0.8, backend.clone());
    let estimate = seat.reservation(LlmSeat::estimate_tokens(&seat.prompt(&context(0.0))));
    assert!(
        estimate > 51.0,
        "512 tokens of allowance plus the prompt: {estimate}"
    );

    let out = block_on(seat.draft(context(estimate))).into_outputs();
    assert_eq!(
        backend.calls.load(Ordering::SeqCst),
        1,
        "exactly affordable: called"
    );
    assert_eq!(out.receipts.len(), 1);
    assert!(out.burned <= estimate);

    let trap = LlmSeat::new(
        "Scout",
        ModelTier::FastQuantized,
        0.8,
        Arc::new(TrapBackend),
    );
    let out = block_on(trap.draft(context(estimate - 0.01))).into_outputs();
    assert!(out.receipts.is_empty(), "one cent short: not called");
    assert!(out.thoughts[0].text.starts_with("cannot reserve"));
}
