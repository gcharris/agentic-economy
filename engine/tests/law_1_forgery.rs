//! Law 1 under attack. Every seat here stays inside the `Agent` trait and
//! tries to reach past its own draft: to write another house's table, to
//! spend another house's money, to raise its own truth for free, to burn a
//! purse without a receipt. Each attempt fails, and each test says how.
//! These were the adversarial audit's confirmed findings, kept as
//! regression tests now that the fields are private and the engine
//! reconciles by the job it issued.

use context_engine::prelude::*;
use std::sync::Arc;

fn cfg(seed: u64) -> EngineConfig {
    EngineConfig { seed, cost_visible: true, ..Default::default() }
}

fn houses(e: &Engine) -> Vec<NodeId> {
    e.nodes.values().filter(|n| n.scale_level == Stage::House).map(|n| n.id).collect()
}

fn done(ctx: DraftContext) -> DraftFuture {
    Box::pin(async move { ctx })
}

/// A seat that hands back a context it built itself, carrying the victim's
/// identity. The engine attributes the draft to the job it issued anyway.
struct Impostor {
    victim: NodeId,
}

impl Agent for Impostor {
    fn seat(&self) -> &str {
        "Impostor"
    }
    fn tier(&self) -> ModelTier {
        ModelTier::FastQuantized
    }
    fn draft(&self, ctx: DraftContext) -> DraftFuture {
        let mut fake = SovereignNode::new(self.victim, "a forgery", Stage::House, None, Purse::new(999.0, 0.0), 0);
        let mut forged = fake.draft_context(ctx.tick(), 1, true);
        forged.leave_paper("Impostor", "poison", format!("written in the name of {}", self.victim), 0);
        done(forged)
    }
}

#[test]
fn a_forged_identity_is_attributed_to_the_job_not_the_claim() {
    let mut e = street(cfg(101), 2, 600.0, 1);
    let hs = houses(&e);
    let (a, b) = (hs[0], hs[1]);
    e.replace_staff(a, vec![Arc::new(Impostor { victim: b })]);
    e.replace_staff(b, vec![]);
    let b_root = e.node_mut(b).unwrap().oak_table.root();
    let b_compute = e.node(b).unwrap().purse.compute;
    let a_compute = e.node(a).unwrap().purse.compute;

    block_on(e.tick());

    assert_eq!(e.node_mut(b).unwrap().oak_table.root(), b_root, "B's table did not move");
    assert_eq!(e.node(b).unwrap().purse.compute, b_compute, "B paid nothing");
    assert!(e.node(a).unwrap().oak_table.papers.iter().any(|p| p.title == "poison"), "the paper landed on the impostor's own table");
    assert_eq!(e.node(a).unwrap().purse.compute, a_compute, "a forged context with no receipts burns nothing");
    assert!(e.events().iter().any(|ev| matches!(ev, EngineEvent::Thought { seat, text, .. } if seat == "engine" && text.contains("claiming to be"))));
}

/// A seat cannot spend another house's liquidity: every envelope is signed
/// in the name of the job's node, and a transfer to a stranger is dropped
/// by the courier before any gate sees it.
struct Thief {
    victim: NodeId,
}

impl Agent for Thief {
    fn seat(&self) -> &str {
        "Thief"
    }
    fn tier(&self) -> ModelTier {
        ModelTier::FastQuantized
    }
    fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
        // Try to make the victim pay a stranger the victim has never heard of.
        ctx.propose(ProposalDraft { target: NodeId(0xDEAD_BEEF), payload: Payload::LiquidityTransfer { amount: 150.0, memo: "to a stranger".into() }, requested_liquidity: 150.0, compute_weight: 0.0 });
        // And try to pay itself out of the victim's pocket: the only name the
        // engine will sign with is the thief's own.
        let _ = self.victim;
        done(ctx)
    }
}

#[test]
fn a_seat_cannot_spend_another_houses_liquidity() {
    let mut e = street(cfg(102), 2, 600.0, 1);
    let hs = houses(&e);
    let (a, b) = (hs[0], hs[1]);
    e.replace_staff(a, vec![Arc::new(Thief { victim: b })]);
    e.replace_staff(b, vec![]);
    let a_truth = e.graph.liquidity_of(a);
    let b_truth = e.graph.liquidity_of(b);

    let r = block_on(e.tick());

    assert_eq!(r.envelopes_minted, 0);
    assert_eq!(r.dropped_by_courier, 1, "unknown address");
    assert_eq!(e.graph.liquidity_of(a), a_truth);
    assert_eq!(e.graph.liquidity_of(b), b_truth);
    assert!(e.graph.contracts.is_empty());
    assert!(e.events().iter().any(|ev| matches!(ev, EngineEvent::DroppedByCourier { reason, .. } if reason.starts_with("unknown address"))));
}

/// A seat cannot raise its own truth. The only things it can do to Φ are
/// handovers, which lower it; a reset costs the oracle's fee at the gate.
struct SelfOracle;

impl Agent for SelfOracle {
    fn seat(&self) -> &str {
        "SelfOracle"
    }
    fn tier(&self) -> ModelTier {
        ModelTier::FastQuantized
    }
    fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
        for _ in 0..5 {
            ctx.record_handover(ModelTier::FastQuantized, 0.5);
        }
        done(ctx)
    }
}

#[test]
fn a_seat_can_only_lower_its_truth() {
    let mut e = house(cfg(103), 800.0, 1);
    let h = houses(&e)[0];
    e.replace_staff(h, vec![Arc::new(SelfOracle)]);
    let before = e.node(h).unwrap().epistemics.confidence;
    block_on(e.tick());
    let after = e.node(h).unwrap();
    assert!(after.epistemics.confidence < before);
    assert_eq!(after.epistemics.generation, 5, "five recorded handovers, replayed by the engine");
    assert_eq!(after.epistemics.calibrations, 0, "no free calibration");
}

/// A seat cannot burn a purse without a receipt, and the receipts are the
/// burn: the engine debits exactly their sum and nothing else.
struct Spendthrift;

impl Agent for Spendthrift {
    fn seat(&self) -> &str {
        "Spendthrift"
    }
    fn tier(&self) -> ModelTier {
        ModelTier::FrontierDeep
    }
    fn draft(&self, mut ctx: DraftContext) -> DraftFuture {
        let _ = ctx.burn("Spendthrift", "think", ModelTier::FrontierDeep, 1000, false); // 100 cr
        let _ = ctx.burn("Spendthrift", "think again", ModelTier::FrontierDeep, 500, true); // 7.5 cr
        done(ctx)
    }
}

#[test]
fn the_receipts_are_the_burn() {
    let mut e = house(cfg(104), 800.0, 1);
    let h = houses(&e)[0];
    e.replace_staff(h, vec![Arc::new(Spendthrift)]);
    let r = block_on(e.tick());
    let n = e.node(h).unwrap();
    assert!((r.compute_burned - 107.5).abs() < 1e-9);
    assert!((n.purse.compute - 692.5).abs() < 1e-9);
    assert_eq!(n.receipts.len(), 2);
    assert!((n.purse.joules_burned - (1000.0 * 0.035 + 75.0 * 0.035)).abs() < 1e-6, "joules follow the tier physics on the receipts");
}

/// A seat that panics under the Tokio executor loses only its own draft.
/// The node's purse and table are untouched and the engine says so.
#[cfg(feature = "native")]
struct Faulty;

#[cfg(feature = "native")]
impl Agent for Faulty {
    fn seat(&self) -> &str {
        "Faulty"
    }
    fn tier(&self) -> ModelTier {
        ModelTier::FastQuantized
    }
    fn draft(&self, _ctx: DraftContext) -> DraftFuture {
        Box::pin(async move { panic!("a seat fell over") })
    }
}

#[cfg(feature = "native")]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_panicking_seat_loses_only_its_own_draft() {
    let mut e = street(cfg(105), 2, 600.0, 1);
    e.set_executor(Box::new(TokioExecutor));
    let hs = houses(&e);
    e.replace_staff(hs[0], vec![Arc::new(Faulty)]);
    let compute = e.node(hs[0]).unwrap().purse.compute;
    let r = e.tick().await;
    assert_eq!(r.seat_failures, 1);
    assert_eq!(e.node(hs[0]).unwrap().purse.compute, compute);
    assert!(e.events().iter().any(|ev| matches!(ev, EngineEvent::SeatFailed { node, .. } if *node == hs[0])));
    assert!(e.node(hs[1]).unwrap().tasks_done() == 1 || e.node(hs[1]).unwrap().purse.compute < 600.0, "the other house drafted normally");
}
