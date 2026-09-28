//! Draft executors. The Draft phase is embarrassingly parallel by
//! construction: every job owns its [`DraftContext`] and its seats, and no
//! job can see another. On native the jobs fan out across cores under
//! Tokio; in the browser they run in sequence on the one thread. Same
//! engine, same results.
//!
//! Every outcome is keyed by the node the engine issued the job for. A seat
//! cannot re-address its draft; the executor never asks the context who it
//! belongs to.

use crate::ids::NodeId;
use crate::node::{Agent, DraftContext};
use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};

/// One node's draft for one tick: the snapshot and the staff.
#[derive(Debug)]
pub struct DraftJob {
    pub node: NodeId,
    pub ctx: DraftContext,
    pub seats: Vec<Arc<dyn Agent>>,
}

/// What came back for one job. `ctx` is `None` when a seat panicked: the
/// node's purse and table are then left exactly as they were.
#[derive(Debug)]
pub struct DraftOutcome {
    pub node: NodeId,
    pub ctx: Option<DraftContext>,
}

/// Run the seats in order, passing the page across the table. Stops at the
/// first seat that runs out of runway.
pub async fn run_job(job: DraftJob) -> DraftOutcome {
    let node = job.node;
    let mut ctx = job.ctx;
    for seat in job.seats {
        if ctx.halted() {
            break;
        }
        ctx = seat.draft(ctx).await;
    }
    DraftOutcome { node, ctx: Some(ctx) }
}

pub type ExecFuture<'a> = Pin<Box<dyn Future<Output = Vec<DraftOutcome>> + Send + 'a>>;

pub trait DraftExecutor: Send + Sync {
    /// Outcomes come back in job order, whatever order they finished in, so
    /// the Collect phase mints ids deterministically.
    fn run(&self, jobs: Vec<DraftJob>) -> ExecFuture<'_>;
    fn name(&self) -> &'static str;
}

impl fmt::Debug for dyn DraftExecutor {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "DraftExecutor({})", self.name())
    }
}

/// One thread, in order. The browser build and the reference for tests.
/// A panicking seat aborts the tick here (there is no task boundary to
/// catch it), which is the loud failure a laboratory wants.
#[derive(Debug, Default, Clone, Copy)]
pub struct SequentialExecutor;

impl DraftExecutor for SequentialExecutor {
    fn run(&self, jobs: Vec<DraftJob>) -> ExecFuture<'_> {
        Box::pin(async move {
            let mut out = Vec::with_capacity(jobs.len());
            for j in jobs {
                out.push(run_job(j).await);
            }
            out
        })
    }

    fn name(&self) -> &'static str {
        "sequential"
    }
}

/// Every job on its own Tokio task, across all cores. A seat that panics
/// takes down only its own task; the node comes back as an outcome with no
/// context and the engine reports a `SeatFailed` event.
#[cfg(feature = "native")]
#[derive(Debug, Default, Clone, Copy)]
pub struct TokioExecutor;

#[cfg(feature = "native")]
impl DraftExecutor for TokioExecutor {
    fn run(&self, jobs: Vec<DraftJob>) -> ExecFuture<'_> {
        Box::pin(async move {
            let nodes: Vec<NodeId> = jobs.iter().map(|j| j.node).collect();
            let mut set = tokio::task::JoinSet::new();
            for (i, job) in jobs.into_iter().enumerate() {
                set.spawn(async move { (i, run_job(job).await) });
            }
            let mut slots: Vec<DraftOutcome> = nodes.iter().map(|n| DraftOutcome { node: *n, ctx: None }).collect();
            while let Some(res) = set.join_next().await {
                if let Ok((i, outcome)) = res {
                    slots[i] = outcome;
                }
            }
            slots
        })
    }

    fn name(&self) -> &'static str {
        "tokio-multi-thread"
    }
}

/// Drive a future to completion on the current thread without a runtime.
/// The engine's own futures never park (statistical seats are ready
/// immediately), so this never spins in practice. Hosts that cannot park,
/// like the browser, should prefer [`block_on_bounded`].
pub fn block_on<F: Future>(fut: F) -> F::Output {
    let mut fut = std::pin::pin!(fut);
    let waker = std::task::Waker::noop();
    let mut cx = Context::from_waker(waker);
    loop {
        match fut.as_mut().poll(&mut cx) {
            Poll::Ready(v) => return v,
            Poll::Pending => std::hint::spin_loop(),
        }
    }
}

/// Like [`block_on`], but gives up after `max_polls` pending polls and
/// returns `None` instead of hanging the host. A seat that waits on an
/// external wake (a network call) cannot complete on a single-threaded host
/// with no reactor; this makes that a reported failure, not a frozen tab.
pub fn block_on_bounded<F: Future>(fut: F, max_polls: u32) -> Option<F::Output> {
    let mut fut = std::pin::pin!(fut);
    let waker = std::task::Waker::noop();
    let mut cx = Context::from_waker(waker);
    for _ in 0..max_polls {
        if let Poll::Ready(v) = fut.as_mut().poll(&mut cx) {
            return Some(v);
        }
    }
    None
}
