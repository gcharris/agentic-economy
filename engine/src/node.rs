//! The SovereignNode: the one unit of the simulation. A house, a street, a
//! city, a country and the world are the same struct at a different
//! `scale_level`. That is the Fractal Rule made concrete.
//!
//! The node never executes. It *is* the house. The seats (the [`Agent`]s)
//! are the staff, and they can be replaced without losing the papers.

use crate::envelope::Payload;
use crate::envelope::ProposalEnvelope;
use crate::epistemics::Epistemics;
use crate::hash::Hash32;
use crate::ids::NodeId;
use crate::lod::PackedStatisticalState;
use crate::oak_table::{OakSnapshot, OakTable, Paper};
use crate::receipt::{HaltReason, Note, SeatReceipt};
use crate::resources::{Exhausted, ModelTier, Purse, ResourceUnit};
use crate::rng::Rng;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, VecDeque};
use std::future::Future;
use std::pin::Pin;

/// The five scales. Same rules at every one of them.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
#[repr(u8)]
pub enum Stage {
    House = 1,
    Street = 2,
    City = 3,
    Country = 4,
    World = 5,
}

impl Stage {
    pub const ALL: [Stage; 5] = [
        Stage::House,
        Stage::Street,
        Stage::City,
        Stage::Country,
        Stage::World,
    ];

    pub fn level(self) -> u8 {
        self as u8
    }

    pub fn from_level(level: u8) -> Option<Stage> {
        Stage::ALL.iter().copied().find(|s| s.level() == level)
    }

    pub fn name(self) -> &'static str {
        match self {
            Stage::House => "The House",
            Stage::Street => "The Neighborhood",
            Stage::City => "The City",
            Stage::Country => "The Country",
            Stage::World => "The World",
        }
    }

    pub fn gate_name(self) -> &'static str {
        match self {
            Stage::House => "The Door",
            Stage::Street => "The Letter Slot",
            Stage::City => "The Clearinghouse",
            Stage::Country => "Statutory Law",
            Stage::World => "Recursive STARKs",
        }
    }

    pub fn actor(self) -> &'static str {
        match self {
            Stage::House => "The Porter",
            Stage::Street => "The Couriers",
            Stage::City => "The Municipal Treasury",
            Stage::Country => "The High Court",
            Stage::World => "The Global Validators",
        }
    }

    pub fn above(self) -> Option<Stage> {
        Stage::from_level(self.level() + 1)
    }

    pub fn below(self) -> Option<Stage> {
        self.level().checked_sub(1).and_then(Stage::from_level)
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeStatus {
    /// Drafting when it has a task.
    Active,
    /// The Porter is at the Door. Zero idle burn. Truth still decays.
    WaitingAtDoor,
    /// The purse is empty or the person closed the week. The note is on the table.
    Halted,
    /// Folded into the parent's statistical profile (LOD stasis).
    Packed,
    /// Cut from the global rails until its root resolves (Stage 5).
    Partitioned,
}

/// The Door, as configuration. Which gate this node's envelopes cross and
/// what that gate is allowed to do.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct BoundaryPolicy {
    pub gate: Stage,
    /// Stage 1 rule 2: a human hand on the latch for anything irreversible.
    pub human_gate: bool,
    /// Stage 1 rule 1: no task, no burn.
    pub zero_idle_burn: bool,
    /// Stage 1 rule 3, made explicit so a test can assert it never flips.
    pub refund_on_reject: bool,
    /// Stage 3 rule 3: unbacked spends are slashed.
    pub slash_unbacked: bool,
    /// Slash fraction of the unbacked amount.
    pub slash_rate: f64,
}

impl BoundaryPolicy {
    pub fn for_stage(stage: Stage) -> Self {
        match stage {
            Stage::House => BoundaryPolicy {
                gate: Stage::House,
                human_gate: true,
                zero_idle_burn: true,
                refund_on_reject: false,
                slash_unbacked: false,
                slash_rate: 0.0,
            },
            Stage::Street => BoundaryPolicy {
                gate: Stage::Street,
                human_gate: false,
                zero_idle_burn: true,
                refund_on_reject: false,
                slash_unbacked: false,
                slash_rate: 0.0,
            },
            Stage::City => BoundaryPolicy {
                gate: Stage::City,
                human_gate: false,
                zero_idle_burn: true,
                refund_on_reject: false,
                slash_unbacked: true,
                slash_rate: 0.10,
            },
            Stage::Country => BoundaryPolicy {
                gate: Stage::Country,
                human_gate: false,
                zero_idle_burn: true,
                refund_on_reject: false,
                slash_unbacked: true,
                slash_rate: 0.25,
            },
            Stage::World => BoundaryPolicy {
                gate: Stage::World,
                human_gate: false,
                zero_idle_burn: true,
                refund_on_reject: false,
                slash_unbacked: true,
                slash_rate: 0.50,
            },
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskState {
    Pending,
    Drafted,
    AtDoor,
    Sent,
    Rejected,
    /// Game only: staff have finished the asset; only the Porter may re-offer it.
    Finished,
}

/// A unit of work the house was asked to do this week.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub lookup_tokens: u32,
    pub draft_tokens: u32,
    pub audit_tokens: u32,
    /// The door fee for sending, in credits.
    pub spend: f64,
    pub state: TaskState,
}

impl Task {
    /// The battery's standard synthesis task. The send is priced at what the
    /// laboratory kernel actually charged for a send (100 tokens, 10 cr);
    /// the battery's `spend_amount = 25` was declared and never read. The
    /// engine adds doc 04's crossing tax on top, which the kernel did not.
    pub fn synthesis(id: impl Into<String>) -> Task {
        Task {
            id: id.into(),
            lookup_tokens: 280,
            draft_tokens: 650,
            audit_tokens: 320,
            spend: 10.0,
            state: TaskState::Pending,
        }
    }

    /// Worst-case nominal estimate, for the steward's sweep.
    pub fn nominal_estimate(&self) -> f64 {
        (self.lookup_tokens + self.draft_tokens + self.audit_tokens) as f64
            / crate::resources::TOKENS_PER_CREDIT
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SovereignNode {
    pub id: NodeId,
    pub name: String,
    /// 1 = House … 5 = World.
    pub scale_level: Stage,
    pub parent: Option<NodeId>,
    /// Internal sub-nodes, for fractal expansion.
    pub children: Vec<NodeId>,

    // ── The Purse ──
    pub purse: Purse,

    // ── The Oak Table ──
    pub oak_table: OakTable,

    // ── Epistemics ──
    pub epistemics: Epistemics,

    // ── The Door ──
    pub boundary_rules: BoundaryPolicy,

    // ── Runtime ──
    pub status: NodeStatus,
    pub tasks: Vec<Task>,
    /// Envelopes held at this node's gate, waiting for a decision or finality.
    pub held_at_door: Vec<ProposalEnvelope>,
    pub packed: Option<PackedStatisticalState>,
    pub note: Option<Note>,
    /// Addresses this node knows. Local knowledge, not a global directory.
    pub known_peers: Vec<NodeId>,
    /// Secret for the simulated signature.
    pub secret: u64,
    pub burned_this_tick: f64,
    pub burn_history: VecDeque<f64>,
    pub receipts: Vec<SeatReceipt>,
    pub liquidity_locked: f64,
    /// The person asked the oracle (`Engine::sync`): at the next Draft the house proposes a `StateSync`.
    #[serde(default)]
    pub sync_requested: bool,
    /// The oracle's last answer to this house: the courier's truth price and the tick it was given.
    #[serde(default)]
    pub oracle: Option<OracleAnswer>,
    /// The week's running numbers, written on Friday's Note (doc 06 §3).
    #[serde(default)]
    pub tally: WeekTally,
    #[serde(default)]
    pub finished_drafts: Vec<FinishedDraft>,
    #[serde(default)]
    pub porter_back_tick: u64,
    #[serde(default)]
    pub own_deliveries: Vec<ScheduledDelivery>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum DraftDisposition {
    Ready,
    AtDoor,
    InFlight,
    Deferred,
    Delivered,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScheduledDelivery {
    pub envelope: ProposalEnvelope,
    pub due_tick: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FinishedDraft {
    pub task_id: String,
    pub message: String,
    pub target: NodeId,
    pub hire_target: Option<NodeId>,
    pub send: Option<ProposalEnvelope>,
    pub hire: Option<ProposalEnvelope>,
    pub state: DraftDisposition,
    pub drafted_tick: u64,
    pub ready_tick: u64,
    pub after_piece: Option<String>,
    #[serde(default)]
    pub answered_tick: Option<u64>,
}

/// What the oracle last told a house.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct OracleAnswer {
    pub price: f64,
    pub tick: u64,
}

/// A house's own counts for the week. Never compared across houses by the engine.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct WeekTally {
    pub swaps_settled: u32,
    pub swaps_reverted: u32,
    pub oracle_queries: u32,
    pub top_ups: u32,
    pub top_up_credits: f64,
}

impl SovereignNode {
    pub fn new(
        id: NodeId,
        name: impl Into<String>,
        scale_level: Stage,
        parent: Option<NodeId>,
        purse: Purse,
        secret: u64,
    ) -> Self {
        SovereignNode {
            id,
            name: name.into(),
            scale_level,
            parent,
            children: Vec::new(),
            purse,
            oak_table: OakTable::new(),
            epistemics: Epistemics::default(),
            boundary_rules: BoundaryPolicy::for_stage(scale_level),
            status: NodeStatus::Active,
            tasks: Vec::new(),
            held_at_door: Vec::new(),
            packed: None,
            note: None,
            known_peers: Vec::new(),
            secret,
            burned_this_tick: 0.0,
            burn_history: VecDeque::with_capacity(32),
            receipts: Vec::new(),
            liquidity_locked: 0.0,
            sync_requested: false,
            oracle: None,
            tally: WeekTally::default(),
            finished_drafts: Vec::new(),
            porter_back_tick: 0,
            own_deliveries: Vec::new(),
        }
    }

    pub fn remember_offer(&mut self, env: &ProposalEnvelope) {
        let task = match &env.payload {
            Payload::Dispatch { task_id, .. } => Some(task_id),
            Payload::HireService { task_id, .. } => task_id.as_ref(),
            _ => None,
        };
        if let Some(d) = self
            .finished_drafts
            .iter_mut()
            .find(|d| Some(&d.task_id) == task)
        {
            if matches!(env.payload, Payload::Dispatch { .. }) {
                d.send = Some(env.clone());
            } else {
                d.hire = Some(env.clone());
            }
            d.state = DraftDisposition::AtDoor;
        }
    }

    pub fn epistemic_confidence(&self) -> f64 {
        self.epistemics.confidence
    }

    pub fn current_task(&self) -> Option<&Task> {
        self.tasks
            .iter()
            .find(|t| matches!(t.state, TaskState::Pending | TaskState::Drafted))
    }

    pub fn current_task_mut(&mut self) -> Option<&mut Task> {
        self.tasks
            .iter_mut()
            .find(|t| matches!(t.state, TaskState::Pending | TaskState::Drafted))
    }

    pub fn task_mut(&mut self, id: &str) -> Option<&mut Task> {
        self.tasks.iter_mut().find(|t| t.id == id)
    }

    pub fn tasks_done(&self) -> usize {
        self.tasks
            .iter()
            .filter(|t| t.state == TaskState::Sent)
            .count()
    }

    /// Stage 1 rule 1: no active task, no thread, no burn.
    pub fn has_work(&self) -> bool {
        self.current_task().is_some()
    }

    /// Should this node run a discrete draft this tick? A node holding a
    /// packed profile of its *children* still drafts itself: at Stage 5 a
    /// country's cities are in stasis while the country's own seat runs
    /// (doc 03: the camera's level and the level below it run discretely).
    /// A node that is itself in stasis has `status == Packed`.
    pub fn is_draftable(&self) -> bool {
        self.status == NodeStatus::Active && self.has_work()
    }

    /// The one and only view a draft ever gets of this node: an owned
    /// snapshot. It carries no reference to the node, the engine, or the
    /// Sovereign Graph. See [`DraftContext`].
    pub fn draft_context(&mut self, tick: u64, seed: u64, cost_visible: bool) -> DraftContext {
        let oak = self.oak_table.snapshot(tick);
        DraftContext {
            node_id: self.id,
            node_name: self.name.clone(),
            stage: self.scale_level,
            tick,
            parent: self.parent,
            known_peers: self.known_peers.clone(),
            children: self.children.clone(),
            purse: self.purse,
            oak,
            epistemics: self.epistemics,
            task: self.current_task().cloned(),
            rng: Rng::seed_from_u64(seed ^ self.id.0),
            cost_visible,
            scratch: BTreeMap::new(),
            papers: Vec::new(),
            proposals: Vec::new(),
            thoughts: Vec::new(),
            receipts: Vec::new(),
            handovers: Vec::new(),
            cushion: 0.0,
            halted_doing: None,
            staff_oracle: true,
        }
    }

    /// The addresses this node may send to: itself, its parent, its
    /// children, and the peers it knows. Local knowledge, not a directory.
    /// An envelope to anyone else is dropped by the courier.
    pub fn allowed_target(&self, target: NodeId) -> bool {
        target == self.id
            || self.parent == Some(target)
            || self.children.contains(&target)
            || self.known_peers.contains(&target)
    }

    pub fn sign(&self, payload_hash: &Hash32, tick: u64) -> Hash32 {
        ProposalEnvelope::signature_for(self.id, self.secret, payload_hash, tick)
    }

    /// Stop cleanly. Nothing is deleted. The note goes on the table.
    pub fn halt(&mut self, tick: u64, doing: impl Into<String>, reason: HaltReason) -> Note {
        let note = Note {
            tick,
            node: self.id,
            node_name: self.name.clone(),
            doing: doing.into(),
            compute_burned_total: self.purse.compute_burned,
            compute_remaining: self.purse.compute,
            joules_burned_total: self.purse.joules_burned,
            papers_on_table: self.oak_table.papers.len(),
            reason,
            saved_state: format!("oak_table@{}", self.oak_table.root().short()),
            week: None,
        };
        self.status = NodeStatus::Halted;
        self.oak_table.put("note", note.to_plain_line());
        self.note = Some(note.clone());
        note
    }

    /// The person puts more in the purse. If the node was halted for
    /// exhaustion, the week continues.
    pub fn top_up(&mut self, credits: f64) {
        self.purse.top_up(credits);
        self.tally.top_ups += 1;
        self.tally.top_up_credits += credits;
        if self.status == NodeStatus::Halted
            && matches!(
                self.note.as_ref().map(|n| &n.reason),
                Some(HaltReason::RunwayExhausted { .. })
            )
        {
            self.status = NodeStatus::Active;
            self.note = None;
        }
    }

    pub fn record_tick_burn(&mut self, credits: f64) {
        self.burned_this_tick = credits;
        if self.burn_history.len() == 32 {
            self.burn_history.pop_front();
        }
        self.burn_history.push_back(credits);
    }

    pub fn avg_burn_rate(&self) -> f64 {
        if self.burn_history.is_empty() {
            0.0
        } else {
            self.burn_history.iter().sum::<f64>() / self.burn_history.len() as f64
        }
    }
}

/// A seat's intention to send something out of the house. The engine mints
/// the id, prices the crossing and signs it in the Collect phase, in the
/// name of the node whose job produced it, never in a name the seat claims.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ProposalDraft {
    pub target: NodeId,
    pub payload: Payload,
    pub requested_liquidity: f64,
    pub compute_weight: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Thought {
    pub seat: String,
    pub text: String,
}

/// One handover of synthetic output between seats, recorded so the engine
/// can replay it onto the node's real epistemics. A seat cannot set Φ; it
/// can only do the things that move Φ.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Handover {
    pub tier: ModelTier,
    pub rigor: f64,
}

/// **The Golden Invariant, as a type.**
///
/// A draft runs against this and nothing else. It is owned, `Send`, and
/// `'static`: it cannot hold a reference to the engine, another node, or the
/// Sovereign Graph, because there is no lifetime parameter through which
/// such a reference could enter.
///
/// Its fields are private. Identity and inputs are read through getters and
/// cannot be changed; outputs are produced only through methods that record
/// what happened ([`burn`](Self::burn), [`record_handover`](Self::record_handover),
/// [`leave_paper`](Self::leave_paper), [`propose`](Self::propose)). The
/// engine reconciles from that record, keyed by the job it issued, never
/// from a field a seat could set. A seat cannot rename itself, cannot burn
/// another purse, cannot calibrate its own truth for free, and cannot forge
/// a signature, because none of those are things the type lets it say.
///
/// What remains a matter of trust: seats are host-installed Rust code in the
/// engine's own process. A seat that smuggles a channel into its own struct
/// (an `Arc<Mutex<_>>` shared with another seat) is outside what the type
/// system can forbid; the host that installs it vouches for it.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DraftContext {
    node_id: NodeId,
    node_name: String,
    stage: Stage,
    tick: u64,
    parent: Option<NodeId>,
    known_peers: Vec<NodeId>,
    children: Vec<NodeId>,
    purse: Purse,
    oak: OakSnapshot,
    epistemics: Epistemics,
    task: Option<Task>,
    rng: Rng,
    cost_visible: bool,
    scratch: BTreeMap<String, String>,
    papers: Vec<Paper>,
    proposals: Vec<ProposalDraft>,
    thoughts: Vec<Thought>,
    receipts: Vec<SeatReceipt>,
    handovers: Vec<Handover>,
    cushion: f64,
    halted_doing: Option<String>,
    /// `OraclePolicy::Staff`: Scout may ask the oracle on his own. Under `Person` only the person asks.
    staff_oracle: bool,
}

fn assert_send_static<T: Send + 'static>() {}
/// Compile-time proof of law 1: a draft context can be moved to any thread
/// and outlive any borrow, because it holds no borrow at all.
pub const GOLDEN_INVARIANT_LAW_1: fn() = assert_send_static::<DraftContext>;

impl DraftContext {
    // ── identity and inputs: read-only ──

    pub fn node_id(&self) -> NodeId {
        self.node_id
    }

    pub fn node_name(&self) -> &str {
        &self.node_name
    }

    pub fn stage(&self) -> Stage {
        self.stage
    }

    pub fn tick(&self) -> u64 {
        self.tick
    }

    pub fn parent(&self) -> Option<NodeId> {
        self.parent
    }

    pub fn known_peers(&self) -> &[NodeId] {
        &self.known_peers
    }

    pub fn children(&self) -> &[NodeId] {
        &self.children
    }

    /// The purse as the seat sees it: the real one at the snapshot, minus
    /// what this draft has burned so far.
    pub fn purse(&self) -> &Purse {
        &self.purse
    }

    pub fn oak(&self) -> &OakSnapshot {
        &self.oak
    }

    pub fn epistemics(&self) -> &Epistemics {
        &self.epistemics
    }

    pub fn task(&self) -> Option<&Task> {
        self.task.as_ref()
    }

    /// The live-cost-visibility finding: when the price is on the table the
    /// seat buys the cheap call and finishes the list.
    /// Whether the staff may ask the oracle on their own (`OraclePolicy::Staff`).
    pub fn staff_oracle(&self) -> bool {
        self.staff_oracle
    }

    /// The engine sets the oracle policy on each context it issues.
    pub fn set_staff_oracle(&mut self, allowed: bool) {
        self.staff_oracle = allowed;
    }

    /// Protect an accepted command from concurrent staff spending. This changes availability, not burn.
    pub(crate) fn reserve_compute(&mut self, credits: f64) {
        self.purse.compute = (self.purse.compute - credits).max(0.0);
    }

    pub fn cost_visible(&self) -> bool {
        self.cost_visible
    }

    /// This node's own stream for this tick. Deterministic.
    pub fn rng(&mut self) -> &mut Rng {
        &mut self.rng
    }

    /// The page passed across the table between seats this tick. Free, and
    /// not durable: what matters goes on the table as a Paper.
    pub fn scratch(&mut self) -> &mut BTreeMap<String, String> {
        &mut self.scratch
    }

    // ── acts: each one leaves a record ──

    /// Burn an inference turn against the purse copy. On exhaustion the
    /// seat gets an `Err`, the context records what it was doing, and the
    /// engine writes the note when it reconciles.
    pub fn burn(
        &mut self,
        seat: &str,
        action: &str,
        tier: ModelTier,
        tokens: u32,
        cache_hit: bool,
    ) -> Result<ResourceUnit, Exhausted> {
        let unit = ResourceUnit::burn(tier, tokens, cache_hit);
        match self.purse.burn(unit) {
            Ok(credits) => {
                self.receipts.push(SeatReceipt {
                    tick: self.tick,
                    node: self.node_id,
                    seat: seat.to_string(),
                    action: action.to_string(),
                    tier,
                    cost: unit,
                    credits,
                    confidence_after: self.epistemics.confidence,
                    status: "done".into(),
                });
                Ok(unit)
            }
            Err(e) => {
                self.halted_doing = Some(format!(
                    "{} ({}, {} tok on {})",
                    action,
                    seat,
                    tokens,
                    tier.label()
                ));
                self.receipts.push(SeatReceipt {
                    tick: self.tick,
                    node: self.node_id,
                    seat: seat.to_string(),
                    action: action.to_string(),
                    tier,
                    cost: unit,
                    credits: 0.0,
                    confidence_after: self.epistemics.confidence,
                    status: "halted (runway exhausted)".into(),
                });
                Err(e)
            }
        }
    }

    /// One seat consumed another's synthetic output. Moves Φ by the
    /// laboratory formula and records the handover for the engine to replay.
    pub fn record_handover(&mut self, tier: ModelTier, rigor: f64) -> f64 {
        self.handovers.push(Handover { tier, rigor });
        self.epistemics.record_handover(tier, rigor)
    }

    /// The steward's sweep. Bookkeeping only; it never mints credits.
    pub fn note_cushion(&mut self, credits: f64) {
        self.cushion += credits.max(0.0);
    }

    pub fn leave_paper(
        &mut self,
        seat: &str,
        title: impl Into<String>,
        body: impl Into<String>,
        tokens: u32,
    ) {
        self.papers.push(Paper {
            tick: self.tick,
            seat: seat.to_string(),
            title: title.into(),
            body: body.into(),
            tokens,
        });
    }

    pub fn think(&mut self, seat: &str, text: impl Into<String>) {
        self.thoughts.push(Thought {
            seat: seat.to_string(),
            text: text.into(),
        });
    }

    pub fn propose(&mut self, draft: ProposalDraft) {
        self.proposals.push(draft);
    }

    /// Credits burned so far this draft: the sum of the receipts, nothing else.
    pub fn burned(&self) -> f64 {
        self.receipts.iter().map(|r| r.credits).sum()
    }

    pub fn halted(&self) -> bool {
        self.halted_doing.is_some()
    }

    pub fn papers(&self) -> &[Paper] {
        &self.papers
    }

    /// Consumed by the engine in the Collect phase.
    pub fn into_outputs(self) -> DraftOutputs {
        let burned = self.burned();
        let joules = self
            .receipts
            .iter()
            .filter(|r| r.credits > 0.0)
            .map(|r| r.cost.joules)
            .sum();
        DraftOutputs {
            claimed_node: self.node_id,
            burned,
            joules,
            papers: self.papers,
            proposals: self.proposals,
            thoughts: self.thoughts,
            receipts: self.receipts,
            handovers: self.handovers,
            cushion: self.cushion,
            halted_doing: self.halted_doing,
        }
    }
}

/// What a draft produced, as a record. The engine attributes it to the node
/// whose job it was; `claimed_node` is informational and never trusted.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DraftOutputs {
    pub claimed_node: NodeId,
    pub burned: f64,
    pub joules: f64,
    pub papers: Vec<Paper>,
    pub proposals: Vec<ProposalDraft>,
    pub thoughts: Vec<Thought>,
    pub receipts: Vec<SeatReceipt>,
    pub handovers: Vec<Handover>,
    pub cushion: f64,
    pub halted_doing: Option<String>,
}

/// The future a seat returns. Boxed so LLM-backed seats can await a network
/// call and statistical seats can return immediately, behind one trait.
pub type DraftFuture = Pin<Box<dyn Future<Output = DraftContext> + Send>>;

/// A seat at the oak table. Scout, Scribble, Inspector, Porter, Steward, or
/// an LLM adapter. Receives the context by value, returns it by value.
///
/// Trust boundary: a seat is host-installed code in the engine's process.
/// The type keeps it from touching any other node's state; it does not keep
/// it from misbehaving inside its own draft (burning wastefully, drafting
/// nonsense). That is what the gates and the purse are for.
pub trait Agent: Send + Sync {
    fn seat(&self) -> &str;
    fn tier(&self) -> ModelTier;
    fn draft(&self, ctx: DraftContext) -> DraftFuture;
}

impl std::fmt::Debug for dyn Agent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Agent({})", self.seat())
    }
}
