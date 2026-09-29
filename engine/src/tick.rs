//! The Engine and its tick. A tick is a block, not a frame.
//!
//! ```text
//!   DRAFT ─▶ COLLECT ─▶ VERIFY ─▶ COMMIT
//! ```
//!
//! The Sovereign Graph is mutated in exactly two functions, both in the
//! Commit phase: [`Engine::commit`] and its Stage 3 helper
//! [`Engine::settle_netted`], plus the court's rollback in
//! [`Engine::apply_court_order`]. Nodes' Oak Tables are written by their
//! owner in [`Engine::collect`], keyed by the job the engine issued, and, for
//! deliveries, in Commit from an approved envelope. Search this file for
//! `self.graph.` to audit it.

use crate::boundary::{
    default_strategies, BoundaryView, CourtOrder, HoldReason, HumanDecisions, Stage4StatutoryLaw,
    Stage5RecursiveStark, TickStats, Verdict, VerificationStrategy,
};
use crate::envelope::{Crossing, Payload, ProposalEnvelope};
use crate::events::EngineEvent;
use crate::executor::{DraftExecutor, DraftJob, SequentialExecutor};
use crate::graph::{Contract, SovereignGraph};
use crate::hash::Hash32;
use crate::ids::{EnvelopeId, NodeId};
use crate::lod::PackedStatisticalState;
use crate::mempool::Mempool;
use crate::node::{Agent, DraftOutputs, NodeStatus, SovereignNode, Stage, TaskState};
use crate::receipt::{HaltReason, Note};
use crate::resources::Purse;
use crate::rng::Rng;
use crate::tax::CoordinationTax;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fmt;
use std::sync::Arc;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct EngineConfig {
    pub seed: u64,
    /// The live-cost-visibility finding: seats see the price by default.
    pub cost_visible: bool,
    pub active_scale: Stage,
    /// Snapshots kept for the High Court.
    pub snapshot_depth: usize,
    /// Ticks between planetary heartbeats.
    pub stark_period: u64,
    pub max_events_retained: usize,
    /// Level of detail: `set_active_scale` packs the children of any parent
    /// whose children sit `pack_depth` or more levels below the camera. 2 (the
    /// default) packs the houses once the camera is at the City; 3 keeps them
    /// live at the City and packs them from the Country up (AUDIT-LEDGER #30).
    #[serde(default = "default_pack_depth")]
    pub pack_depth: u8,
}

fn default_pack_depth() -> u8 {
    2
}

impl Default for EngineConfig {
    fn default() -> Self {
        EngineConfig {
            seed: 7,
            cost_visible: true,
            active_scale: Stage::House,
            snapshot_depth: 64,
            stark_period: 16,
            max_events_retained: 4096,
            pack_depth: default_pack_depth(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct TickReport {
    pub tick: u64,
    pub drafted: usize,
    pub compute_burned: f64,
    pub tax_paid: f64,
    pub envelopes_minted: usize,
    pub dropped_by_courier: usize,
    pub approved: usize,
    pub rejected: usize,
    pub held: usize,
    pub slashed: usize,
    pub voided: usize,
    pub settled_liquidity: f64,
    pub halted: usize,
    pub seat_failures: usize,
    pub synced: usize,
    pub root: Hash32,
    pub global_confirmed: bool,
    pub rolled_back: bool,
    pub packed_groups: usize,
}

pub struct Engine {
    pub config: EngineConfig,
    pub tick: u64,
    pub nodes: BTreeMap<NodeId, SovereignNode>,
    households: HashMap<NodeId, Vec<Arc<dyn Agent>>>,
    pub graph: SovereignGraph,
    pub mempool: Mempool,
    /// The replaceable gates: House, Street, City.
    strategies: BTreeMap<Stage, Box<dyn VerificationStrategy>>,
    pub decisions: HumanDecisions,
    /// Stage 4. One court: the instance that rules is the instance whose
    /// injunctions bind at the Country gate.
    pub court: Stage4StatutoryLaw,
    /// Stage 5. One set of validators: the instance that holds the finality
    /// queue is the instance the heartbeat reads.
    pub stark: Stage5RecursiveStark,
    approved: Vec<ProposalEnvelope>,
    events: Vec<EngineEvent>,
    rng: Rng,
    executor: Box<dyn DraftExecutor>,
    pub tax: CoordinationTax,
    next_id: u64,
    pub reports: Vec<TickReport>,
}

impl fmt::Debug for Engine {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Engine(tick {}, {} nodes, {} events, executor {})",
            self.tick,
            self.nodes.len(),
            self.events.len(),
            self.executor.name()
        )
    }
}

impl Engine {
    /// A new engine on the sequential executor (browser, tests, hosts without Tokio).
    pub fn new(config: EngineConfig) -> Self {
        Self::with_executor(config, Box::new(SequentialExecutor))
    }

    /// A new engine that fans drafts out across all cores.
    #[cfg(feature = "native")]
    pub fn with_tokio(config: EngineConfig) -> Self {
        Self::with_executor(config, Box::new(crate::executor::TokioExecutor))
    }

    pub fn with_executor(config: EngineConfig, executor: Box<dyn DraftExecutor>) -> Self {
        let rng = Rng::seed_from_u64(config.seed);
        Engine {
            graph: SovereignGraph::new(config.snapshot_depth),
            config,
            tick: 0,
            nodes: BTreeMap::new(),
            households: HashMap::new(),
            mempool: Mempool::default(),
            strategies: default_strategies(),
            decisions: HumanDecisions::default(),
            court: Stage4StatutoryLaw::default(),
            stark: Stage5RecursiveStark::default(),
            approved: Vec::new(),
            events: Vec::new(),
            rng,
            executor,
            tax: CoordinationTax::default(),
            next_id: 0,
            reports: Vec::new(),
        }
    }

    pub fn executor_name(&self) -> &'static str {
        self.executor.name()
    }

    /// Swap the draft executor. The engine's results do not depend on it.
    pub fn set_executor(&mut self, executor: Box<dyn DraftExecutor>) {
        self.executor = executor;
    }

    /// Ids are 52-bit so they survive a trip through JSON and JavaScript
    /// numbers unchanged. Deterministic: seeded generator, no clock.
    fn mint_id(&mut self) -> u64 {
        self.next_id += 1;
        (self.rng.next_u64() >> 12) ^ self.next_id
    }

    fn mint_node_id(&mut self) -> NodeId {
        loop {
            let id = NodeId(self.mint_id());
            if !self.nodes.contains_key(&id) {
                return id;
            }
        }
    }

    // ───────────────────────────── world building ─────────────────────────

    pub fn add_node(
        &mut self,
        name: impl Into<String>,
        stage: Stage,
        parent: Option<NodeId>,
        purse: Purse,
    ) -> NodeId {
        let id = self.mint_node_id();
        let secret = self.mint_id();
        let node = SovereignNode::new(id, name, stage, parent, purse, secret);
        self.graph.set_liquidity(id, purse.liquidity);
        if let Some(p) = parent {
            if let Some(pn) = self.nodes.get_mut(&p) {
                pn.children.push(id);
            }
        }
        self.nodes.insert(id, node);
        id
    }

    /// Install a seat. Seats are host-installed code the host vouches for;
    /// the type system keeps them inside their own draft.
    pub fn seat(&mut self, node: NodeId, agent: Arc<dyn Agent>) {
        self.households.entry(node).or_default().push(agent);
    }

    pub fn replace_staff(&mut self, node: NodeId, staff: Vec<Arc<dyn Agent>>) {
        self.households.insert(node, staff);
    }

    pub fn node(&self, id: NodeId) -> Option<&SovereignNode> {
        self.nodes.get(&id)
    }

    pub fn node_mut(&mut self, id: NodeId) -> Option<&mut SovereignNode> {
        self.nodes.get_mut(&id)
    }

    /// The gate for a stage. Stages 4 and 5 are the engine's own instances.
    pub fn strategy(&self, stage: Stage) -> Option<&dyn VerificationStrategy> {
        match stage {
            Stage::Country => Some(&self.court),
            Stage::World => Some(&self.stark),
            _ => self.strategies.get(&stage).map(|b| b.as_ref()),
        }
    }

    /// Replace a Stage 1–3 gate. Stages 4 and 5 cannot be replaced: use the
    /// `court` and `stark` fields to configure them.
    pub fn set_strategy(&mut self, stage: Stage, strategy: Box<dyn VerificationStrategy>) {
        if matches!(stage, Stage::House | Stage::Street | Stage::City) {
            self.strategies.insert(stage, strategy);
        }
    }

    // ───────────────────────────── the person's hands ─────────────────────

    /// The click at the Door. Returns whether the envelope is actually held.
    pub fn authorize(&mut self, envelope: EnvelopeId) -> bool {
        self.decisions.approve(envelope);
        self.is_held(envelope)
    }

    pub fn reject(&mut self, envelope: EnvelopeId) -> bool {
        self.decisions.reject(envelope);
        self.is_held(envelope)
    }

    pub fn is_held(&self, envelope: EnvelopeId) -> bool {
        self.nodes
            .values()
            .any(|n| n.held_at_door.iter().any(|e| e.id == envelope))
    }

    /// Put money in the purse. A halted house continues.
    pub fn top_up(&mut self, node: NodeId, credits: f64) {
        let tick = self.tick;
        if let Some(n) = self.nodes.get_mut(&node) {
            n.top_up(credits);
            self.events.push(EngineEvent::ToppedUp {
                tick,
                node,
                credits,
            });
        }
    }

    /// The week is over. Nothing is deleted.
    pub fn close(&mut self, node: NodeId) -> Option<Note> {
        let tick = self.tick;
        let n = self.nodes.get_mut(&node)?;
        let doing = n
            .current_task()
            .map(|t| t.id.clone())
            .unwrap_or_else(|| "idle".into());
        let note = n.halt(tick, doing, HaltReason::Closed);
        self.events.push(EngineEvent::Halted {
            tick,
            node,
            note: note.clone(),
        });
        Some(note)
    }

    /// Put a rejected task back on the table to be drafted again (sunk cost stays sunk).
    pub fn redraft(&mut self, node: NodeId, task_id: &str) {
        if let Some(t) = self.nodes.get_mut(&node).and_then(|n| n.task_mut(task_id)) {
            if t.state == TaskState::Rejected {
                t.state = TaskState::Pending;
            }
        }
    }

    /// The camera. Sets the active scale and packs or unpacks accordingly.
    /// Discrete simulation runs for every node at level ≥ active − 1; the
    /// rest fold into their parents' statistical profiles.
    pub fn set_active_scale(&mut self, stage: Stage) {
        self.config.active_scale = stage;
        let parents: Vec<NodeId> = self
            .nodes
            .values()
            .filter(|n| !n.children.is_empty())
            .map(|n| n.id)
            .collect();
        for p in parents {
            let child_level = self.nodes[&p].scale_level.level().saturating_sub(1);
            // Children `pack_depth` or more levels below the camera are packed
            // (pack_depth 2: `child_level + 1 < stage`, the rule before the knob).
            let should_pack = child_level + self.config.pack_depth.max(1) <= stage.level();
            let is_packed = self.nodes[&p].packed.is_some();
            if should_pack && !is_packed {
                self.pack_children(p);
            } else if !should_pack && is_packed {
                self.unpack_children(p);
            }
        }
    }

    /// The gate an envelope crosses is the higher of the node's own gate and
    /// the active scale: zoom out from a house and its Door becomes the
    /// street's Letter Slot for envelopes the person has not seen. An
    /// envelope that has already been presented to the person stays at the
    /// Door whatever the camera does: once asked, only the person answers.
    pub fn effective_gate(&self, node: &SovereignNode) -> Stage {
        self.effective_gate_for(node, false)
    }

    /// [`effective_gate`](Self::effective_gate) for an envelope that may
    /// already have been presented to the person.
    pub fn effective_gate_for(&self, node: &SovereignNode, asked_human: bool) -> Stage {
        if asked_human {
            return Stage::House;
        }
        node.boundary_rules.gate.max(self.config.active_scale)
    }

    pub fn crossing(&self, from: NodeId, to: NodeId) -> Crossing {
        if from == to {
            return Crossing::Intra;
        }
        let fp = self.nodes.get(&from).and_then(|n| n.parent);
        let tp = self.nodes.get(&to).and_then(|n| n.parent);
        if fp == Some(to) || tp == Some(from) || (fp.is_some() && fp == tp) {
            Crossing::SameParent
        } else {
            Crossing::CrossParent
        }
    }

    pub fn drain_events(&mut self) -> Vec<EngineEvent> {
        std::mem::take(&mut self.events)
    }

    pub fn events(&self) -> &[EngineEvent] {
        &self.events
    }

    pub fn held_envelopes(&self) -> impl Iterator<Item = (&SovereignNode, &ProposalEnvelope)> {
        self.nodes
            .values()
            .flat_map(|n| n.held_at_door.iter().map(move |e| (n, e)))
    }

    // ───────────────────────────────── the tick ───────────────────────────

    /// One temporal block. See the module docs for the four phases.
    pub async fn tick(&mut self) -> TickReport {
        self.tick += 1;
        let tick = self.tick;
        let mut report = TickReport {
            tick,
            ..Default::default()
        };
        let cost_visible = self.config.cost_visible;

        // ── Phase 1: DRAFT. Off-chain, parallel, isolated. ──
        let mut jobs: Vec<DraftJob> = Vec::new();
        let mut drafted: BTreeSet<NodeId> = BTreeSet::new();
        let ids: Vec<NodeId> = self.nodes.keys().copied().collect();
        for id in ids {
            let seats = match self.households.get(&id) {
                Some(s) if !s.is_empty() => s.clone(),
                _ => continue,
            };
            let seed = self.rng.next_u64();
            let node = self.nodes.get_mut(&id).expect("node exists");
            node.burned_this_tick = 0.0;
            if !node.is_draftable() {
                continue; // WaitingAtDoor: zero idle burn. Halted: the note. Packed: stasis. No task: no thread.
            }
            let ctx = node.draft_context(tick, seed, cost_visible);
            drafted.insert(id);
            jobs.push(DraftJob {
                node: id,
                ctx,
                seats,
            });
        }
        report.drafted = jobs.len();
        let outcomes = self.executor.run(jobs).await;

        // ── Phase 2: COLLECT. Reconcile burns, mint envelopes, tax, courier rule. ──
        for outcome in outcomes {
            match outcome.ctx {
                Some(ctx) => self.collect(outcome.node, ctx.into_outputs(), tick, &mut report),
                None => {
                    self.events.push(EngineEvent::SeatFailed {
                        tick,
                        node: outcome.node,
                    });
                    report.seat_failures += 1;
                }
            }
        }

        // ── Phase 3: VERIFY. The gates. ──
        self.verify(tick, &mut report);

        // ── Phase 4: COMMIT. The one write path into the Sovereign Graph. ──
        self.commit(tick, &mut report);

        // ── Housekeeping: decay, stasis, snapshot, heartbeat. ──
        self.decay_idle(&drafted);
        report.packed_groups = self.macro_ticks();
        report.root = self.graph.snapshot(tick);
        if self.config.stark_period > 0 && tick % self.config.stark_period == 0 {
            report.global_confirmed = self.heartbeat(tick);
        }
        let (mut active, mut waiting, mut halted, mut packed, mut partitioned) = (0, 0, 0, 0, 0);
        for n in self.nodes.values() {
            match n.status {
                NodeStatus::Active => active += 1,
                NodeStatus::WaitingAtDoor => waiting += 1,
                NodeStatus::Halted => halted += 1,
                NodeStatus::Packed => packed += 1,
                NodeStatus::Partitioned => partitioned += 1,
            }
        }
        self.events.push(EngineEvent::TickCommitted {
            tick,
            root: report.root,
            active_scale: self.config.active_scale,
            nodes_active: active,
            nodes_waiting: waiting,
            nodes_halted: halted,
            nodes_packed: packed,
            nodes_partitioned: partitioned,
        });
        if self.events.len() > self.config.max_events_retained {
            let drop = self.events.len() - self.config.max_events_retained;
            self.events.drain(..drop);
        }
        self.reports.push(report.clone());
        report
    }

    /// Reconcile one draft onto the node the engine issued it for. Nothing
    /// the seat wrote is trusted for identity or for money: the burn is the
    /// sum of the receipts, Φ moves by replaying the recorded handovers, and
    /// `claimed_node` is ignored.
    fn collect(
        &mut self,
        node_id: NodeId,
        mut out: DraftOutputs,
        tick: u64,
        report: &mut TickReport,
    ) {
        let active_scale = self.config.active_scale;
        let tax = self.tax;
        if out.claimed_node != node_id {
            self.events.push(EngineEvent::Thought {
                tick,
                node: node_id,
                seat: "engine".into(),
                text: format!(
                    "a seat handed back a draft claiming to be {}; attributed to {} regardless",
                    out.claimed_node, node_id
                ),
            });
        }
        let allowed: Vec<bool> = out
            .proposals
            .iter()
            .map(|p| {
                self.nodes
                    .get(&node_id)
                    .map(|n| n.allowed_target(p.target))
                    .unwrap_or(false)
            })
            .collect();
        let crossings: Vec<Crossing> = out
            .proposals
            .iter()
            .map(|p| self.crossing(node_id, p.target))
            .collect();
        let ids: Vec<u64> = (0..out.proposals.len()).map(|_| self.mint_id()).collect();

        let Some(node) = self.nodes.get_mut(&node_id) else {
            return;
        };

        // Reconcile the burn against the real purse. The draft burned a copy
        // of this same purse, receipt by receipt, so this cannot overdraw.
        let burned = node.purse.burn_priced(out.burned, out.joules);
        node.record_tick_burn(burned);
        node.purse.note_cushion(out.cushion);
        node.epistemics.record_active_tick();
        for h in &out.handovers {
            node.epistemics.record_handover(h.tier, h.rigor);
        }
        report.compute_burned += burned;

        for r in &out.receipts {
            if r.credits > 0.0 {
                self.events.push(EngineEvent::Burn {
                    tick,
                    node: node_id,
                    seat: r.seat.clone(),
                    credits: r.credits,
                    joules: r.cost.joules,
                    tier: r.tier.label().into(),
                    cache_hit: r.cost.cache_hit,
                });
            }
        }
        node.receipts.append(&mut out.receipts);
        for p in out.papers.drain(..) {
            node.oak_table.leave_paper(p);
        }
        for t in out.thoughts.drain(..) {
            self.events.push(EngineEvent::Thought {
                tick,
                node: node_id,
                seat: t.seat,
                text: t.text,
            });
        }

        // Exhaustion is a pause, not a failure. The papers stay on the table.
        if let Some(doing) = out.halted_doing.take() {
            let shortfall = node
                .receipts
                .last()
                .map(|r| r.cost.credits() - node.purse.compute)
                .unwrap_or(0.0)
                .max(0.0);
            let note = node.halt(tick, doing, HaltReason::RunwayExhausted { shortfall });
            self.events.push(EngineEvent::Halted {
                tick,
                node: node_id,
                note,
            });
            report.halted += 1;
            return;
        }

        // Mint envelopes. The crossing tax is paid now (the envelope was
        // formatted); the base send cost is paid only after approval.
        for (i, p) in out.proposals.drain(..).enumerate() {
            if !allowed[i] {
                self.events.push(EngineEvent::DroppedByCourier {
                    tick,
                    from: node_id,
                    to: p.target,
                    reason: format!(
                        "unknown address: {} is not this node, its parent, a child or a known peer",
                        p.target
                    ),
                });
                report.dropped_by_courier += 1;
                continue;
            }
            let crossing = crossings[i];
            let tax_due = tax.tax_only(crossing, p.compute_weight);
            if !node.purse.can_burn(tax_due) {
                self.events.push(EngineEvent::DroppedByCourier {
                    tick,
                    from: node_id,
                    to: p.target,
                    reason: format!("cannot afford the crossing tax of {tax_due:.1} cr"),
                });
                report.dropped_by_courier += 1;
                continue;
            }
            let _ = node.purse.burn_credits(tax_due);
            report.tax_paid += tax_due;
            report.compute_burned += tax_due;
            let payload_hash = p.payload.hash();
            let auth_signature = node.sign(&payload_hash, tick);
            let env = ProposalEnvelope {
                id: EnvelopeId(ids[i]),
                initiator: node_id,
                target: p.target,
                payload_hash,
                requested_liquidity: p.requested_liquidity,
                compute_weight: p.compute_weight,
                tax_paid: tax_due,
                auth_signature,
                created_tick: tick,
                origin_stage: node.scale_level,
                gate: node.boundary_rules.gate.max(active_scale),
                crossing,
                asked_human: false,
                payload: p.payload,
            };
            if let Payload::Dispatch { task_id, .. } = &env.payload {
                if let Some(t) = node.task_mut(task_id) {
                    t.state = TaskState::Drafted;
                }
            }
            match self.mempool.submit(env) {
                Ok(()) => {
                    report.envelopes_minted += 1;
                    let e = self.mempool.peek().last().expect("just pushed");
                    self.events.push(EngineEvent::Proposed {
                        tick,
                        envelope: e.id,
                        from: e.initiator,
                        to: e.target,
                        kind: e.payload.kind().into(),
                        requested_liquidity: e.requested_liquidity,
                        tax_paid: e.tax_paid,
                    });
                }
                Err(boxed) => {
                    let (env, reason) = *boxed;
                    report.dropped_by_courier += 1;
                    self.events.push(EngineEvent::DroppedByCourier {
                        tick,
                        from: env.initiator,
                        to: env.target,
                        reason,
                    });
                }
            }
        }
    }

    fn verify(&mut self, tick: u64, report: &mut TickReport) {
        let active_scale = self.config.active_scale;
        let node_status: BTreeMap<NodeId, NodeStatus> =
            self.nodes.values().map(|n| (n.id, n.status)).collect();
        let node_secrets: BTreeMap<NodeId, u64> =
            self.nodes.values().map(|n| (n.id, n.secret)).collect();
        let own_gates: BTreeMap<NodeId, Stage> = self
            .nodes
            .values()
            .map(|n| (n.id, n.boundary_rules.gate))
            .collect();

        // Previously held envelopes are re-evaluated first (a decision may
        // have arrived, finality may have landed), then the fresh mempool.
        let mut all: Vec<ProposalEnvelope> = Vec::new();
        for n in self.nodes.values_mut() {
            all.append(&mut n.held_at_door);
        }
        all.append(&mut self.mempool.drain());

        // The gate is decided now, from the camera and the node's own
        // policy. An envelope the person has been asked about stays at the
        // Door whatever the camera does.
        let mut by_gate: BTreeMap<Stage, Vec<ProposalEnvelope>> = BTreeMap::new();
        for mut e in all {
            let own = own_gates
                .get(&e.initiator)
                .copied()
                .unwrap_or(e.origin_stage);
            e.gate = if e.asked_human {
                Stage::House
            } else {
                own.max(active_scale)
            };
            by_gate.entry(e.gate).or_default().push(e);
        }

        let mut strategies = std::mem::take(&mut self.strategies);
        let mut approved: Vec<ProposalEnvelope> = Vec::new();
        let mut held: Vec<(ProposalEnvelope, HoldReason)> = Vec::new();
        let mut rejected: Vec<(ProposalEnvelope, Verdict)> = Vec::new();
        let mut slashed: Vec<(ProposalEnvelope, f64, String)> = Vec::new();
        {
            let view = BoundaryView {
                tick,
                graph: &self.graph,
                decisions: &self.decisions,
                node_status: &node_status,
                node_secrets: &node_secrets,
            };
            for (gate, envs) in by_gate {
                let verdicts = match gate {
                    Stage::Country => self.court.verify_batch(&envs, &view),
                    Stage::World => self.stark.verify_batch(&envs, &view),
                    _ => strategies
                        .get_mut(&gate)
                        .expect("a strategy for every replaceable stage")
                        .verify_batch(&envs, &view),
                };
                if gate == Stage::City && !envs.is_empty() {
                    let (_, gross) = net_positions(envs.iter());
                    let (positions, _) = net_positions(
                        envs.iter()
                            .zip(&verdicts)
                            .filter(|(_, v)| matches!(v, Verdict::Approved))
                            .map(|(e, _)| e),
                    );
                    let net = net_of(&positions);
                    self.events.push(EngineEvent::Netted {
                        tick,
                        clearinghouse: gate,
                        gross,
                        net,
                        envelopes: envs.len(),
                    });
                }
                for (env, v) in envs.into_iter().zip(verdicts) {
                    match v {
                        Verdict::Approved => approved.push(env),
                        Verdict::Held { reason } => held.push((env, reason)),
                        Verdict::Slashed { amount, reason } => slashed.push((env, amount, reason)),
                        rejected_verdict => rejected.push((env, rejected_verdict)),
                    }
                }
            }
        }
        self.strategies = strategies;

        // What the court gets to see: liquidity verdicts at algorithmic gates.
        let mut stats = TickStats::default();

        for env in &approved {
            self.decisions.take(env.id);
            self.events.push(EngineEvent::Approved {
                tick,
                envelope: env.id,
                gate: env.gate,
            });
            if env.gate != Stage::House && env.payload.moves_liquidity() {
                stats.total += 1;
            }
        }
        report.approved += approved.len();
        self.approved.extend(approved);

        for (mut env, reason) in held {
            match reason {
                HoldReason::AwaitingHumanSignature => {
                    if !env.asked_human {
                        env.asked_human = true;
                        self.events.push(EngineEvent::AwaitingHumanSignature {
                            tick,
                            node: env.initiator,
                            envelope: env.id,
                            description: env.payload.describe(),
                            cost: env.compute_weight,
                        });
                    }
                }
                HoldReason::AwaitingFinality { until_tick } => {
                    self.events.push(EngineEvent::AwaitingFinality {
                        tick,
                        envelope: env.id,
                        until_tick,
                    });
                }
                HoldReason::AwaitingCounterparty => {}
            }
            if let Payload::Dispatch { task_id, .. } = &env.payload {
                if let Some(t) = self
                    .nodes
                    .get_mut(&env.initiator)
                    .and_then(|n| n.task_mut(task_id))
                {
                    t.state = TaskState::AtDoor;
                }
            }
            if let Some(n) = self.nodes.get_mut(&env.initiator) {
                n.held_at_door.push(env);
            }
            report.held += 1;
        }

        for (env, verdict) in rejected {
            self.decisions.take(env.id);
            let reason = match &verdict {
                Verdict::Rejected { reason } => reason.clone(),
                _ => String::new(),
            };
            if env.gate == Stage::World {
                self.stark.note_rejection(env.initiator);
            }
            if env.gate != Stage::House
                && env.payload.moves_liquidity()
                && !reason.starts_with("injunction")
            {
                stats.total += 1;
                if verdict.is_liquidity_failure() {
                    stats.rejected += 1;
                    stats.offenders.push(env.initiator);
                }
            }
            self.events.push(EngineEvent::Rejected {
                tick,
                envelope: env.id,
                gate: env.gate,
                reason,
                sunk_compute: env.tax_paid,
            });
            if let Payload::Dispatch { task_id, .. } = &env.payload {
                if let Some(t) = self
                    .nodes
                    .get_mut(&env.initiator)
                    .and_then(|n| n.task_mut(task_id))
                {
                    t.state = TaskState::Rejected;
                }
            }
            report.rejected += 1;
        }

        for (env, amount, reason) in slashed {
            self.decisions.take(env.id);
            stats.total += 1;
            stats.rejected += 1;
            stats.offenders.push(env.initiator);
            let taken = self.graph.slash(env.initiator, amount);
            if let Some(n) = self.nodes.get_mut(&env.initiator) {
                n.purse.liquidity = self.graph.liquidity_of(env.initiator);
            }
            self.events.push(EngineEvent::Slashed {
                tick,
                node: env.initiator,
                amount: taken,
                reason: reason.clone(),
            });
            self.events.push(EngineEvent::Rejected {
                tick,
                envelope: env.id,
                gate: env.gate,
                reason,
                sunk_compute: env.tax_paid,
            });
            report.slashed += 1;
            report.rejected += 1;
        }

        // Door status follows the held queue.
        for n in self.nodes.values_mut() {
            match (n.status, n.held_at_door.is_empty()) {
                (NodeStatus::Active, false) => n.status = NodeStatus::WaitingAtDoor,
                (NodeStatus::WaitingAtDoor, true) => n.status = NodeStatus::Active,
                _ => {}
            }
        }

        // Stage 4: the circuit breaker watches the whole tick.
        stats.offenders.sort();
        stats.offenders.dedup();
        if let Some(order) = self.court.assess(tick, &stats) {
            self.apply_court_order(tick, order, report);
        }
    }

    fn apply_court_order(&mut self, tick: u64, order: CourtOrder, report: &mut TickReport) {
        match order {
            CourtOrder::Rollback {
                to_tick,
                reason,
                slash,
            } => {
                let restored = self.graph.rollback_to(to_tick);
                let mut count = 0;
                for n in &slash {
                    let have = self.graph.liquidity_of(*n);
                    let taken = self.graph.slash(*n, have * 0.25);
                    if let Some(node) = self.nodes.get_mut(n) {
                        node.purse.liquidity = self.graph.liquidity_of(*n);
                    }
                    self.events.push(EngineEvent::Slashed {
                        tick,
                        node: *n,
                        amount: taken,
                        reason: "High Court: systemic failure".into(),
                    });
                    count += 1;
                }
                // Approved-but-uncommitted envelopes from the failed tick are void.
                for env in self.approved.drain(..) {
                    self.events.push(EngineEvent::Voided {
                        tick,
                        envelope: env.id,
                        reason: "voided by the High Court's rollback".into(),
                    });
                    report.voided += 1;
                }
                self.events.push(EngineEvent::RolledBack {
                    tick,
                    to_tick: restored.unwrap_or(tick),
                    reason,
                    slashed: count,
                });
                report.rolled_back = true;
            }
        }
    }

    fn commit(&mut self, tick: u64, report: &mut TickReport) {
        let approved = std::mem::take(&mut self.approved);
        // Stage 3: liquidity the Clearinghouse approved settles as one netted
        // batch (only the net differences move). Everything else, one by one.
        let (netted, approved): (Vec<ProposalEnvelope>, Vec<ProposalEnvelope>) = approved
            .into_iter()
            .partition(|e| e.gate == Stage::City && e.payload.moves_liquidity());
        self.settle_netted(tick, netted, report);
        for env in approved {
            // The cost of sending comes out of the purse after yes, and it
            // must be there: a send the purse cannot pay for does not go out.
            let affordable = self
                .nodes
                .get(&env.initiator)
                .map(|n| n.purse.can_burn(env.compute_weight))
                .unwrap_or(false);
            if !affordable {
                if env.gate == Stage::World {
                    self.stark.note_rejection(env.initiator);
                }
                self.events.push(EngineEvent::Rejected {
                    tick,
                    envelope: env.id,
                    gate: env.gate,
                    reason: format!(
                        "cannot afford the send cost of {:.1} cr",
                        env.compute_weight
                    ),
                    sunk_compute: env.tax_paid,
                });
                report.rejected += 1;
                continue;
            }
            match &env.payload {
                Payload::LiquidityTransfer { .. } | Payload::HireService { .. } => match self
                    .graph
                    .transfer(env.initiator, env.target, env.requested_liquidity)
                {
                    Ok(()) => {
                        report.compute_burned +=
                            self.charge_send(env.initiator, env.compute_weight);
                        if let Some(n) = self.nodes.get_mut(&env.initiator) {
                            n.purse.liquidity -= env.requested_liquidity;
                            if let Payload::HireService { service, .. } = &env.payload {
                                n.oak_table.put(
                                    format!("services/{}", env.id),
                                    format!("{service} delivered by {}", env.target),
                                );
                            }
                        }
                        if let Some(t) = self.nodes.get_mut(&env.target) {
                            t.purse.liquidity += env.requested_liquidity;
                            if let Payload::HireService { service, .. } = &env.payload {
                                t.oak_table.put(
                                    format!("orders/{}", env.id),
                                    format!("{service} for {}", env.initiator),
                                );
                            }
                        }
                        self.graph.record_contract(Contract {
                            id: env.id,
                            tick,
                            initiator: env.initiator,
                            target: env.target,
                            kind: env.payload.kind().into(),
                            amount: env.requested_liquidity,
                        });
                        self.events.push(EngineEvent::Settled {
                            tick,
                            envelope: env.id,
                            from: env.initiator,
                            to: env.target,
                            amount: env.requested_liquidity,
                        });
                        report.settled_liquidity += env.requested_liquidity;
                    }
                    Err(have) => {
                        if env.gate == Stage::World {
                            self.stark.note_rejection(env.initiator);
                        }
                        self.events.push(EngineEvent::Rejected {
                            tick,
                            envelope: env.id,
                            gate: env.gate,
                            reason: format!("stale belief at commit: truth {have:.1}"),
                            sunk_compute: env.tax_paid,
                        });
                        report.rejected += 1;
                    }
                },
                Payload::Dispatch { message, task_id } => {
                    report.compute_burned += self.charge_send(env.initiator, env.compute_weight);
                    // The only cross-node write besides settlement: a
                    // delivery, from an approved envelope, into the
                    // recipient's inbox.
                    self.graph.deliver(env.target, env.id, message.clone());
                    if let Some(t) = self.nodes.get_mut(&env.target) {
                        t.oak_table
                            .put(format!("inbox/{}", env.id), message.clone());
                    }
                    if let Some(t) = self
                        .nodes
                        .get_mut(&env.initiator)
                        .and_then(|n| n.task_mut(task_id))
                    {
                        t.state = TaskState::Sent;
                    }
                    self.events.push(EngineEvent::Delivered {
                        tick,
                        envelope: env.id,
                        to: env.target,
                    });
                }
                Payload::StateSync => {
                    report.compute_burned += self.charge_send(env.initiator, env.compute_weight);
                    let truth = self.graph.liquidity_of(env.initiator);
                    let truth_price = self.graph.service_prices.get("courier").copied();
                    if let Some(n) = self.nodes.get_mut(&env.initiator) {
                        let before = n.epistemics.confidence;
                        n.purse.liquidity = truth;
                        if let Some(p) = truth_price {
                            n.oak_table.put("price/courier", format!("{p}"));
                        }
                        n.epistemics.calibrate(tick);
                        self.events.push(EngineEvent::StateSync {
                            tick,
                            node: env.initiator,
                            cost: env.compute_weight,
                            confidence_before: before,
                        });
                        report.synced += 1;
                    }
                }
                Payload::Close { contract } => {
                    report.compute_burned += self.charge_send(env.initiator, env.compute_weight);
                    self.graph.record_contract(Contract {
                        id: env.id,
                        tick,
                        initiator: env.initiator,
                        target: env.target,
                        kind: format!("close:{contract}"),
                        amount: 0.0,
                    });
                }
            }
        }
    }

    /// The send fee, flat-priced (no tier physics: it is a door fee, not a
    /// thought). Callers check affordability first.
    fn charge_send(&mut self, node: NodeId, credits: f64) -> f64 {
        self.nodes
            .get_mut(&node)
            .and_then(|n| n.purse.burn_credits(credits).ok())
            .unwrap_or(0.0)
    }

    /// Stage 3 settlement. The gate verified every initiator's *net* position
    /// against the truth; here the batch is netted again over what survived
    /// the gate (a slashed counterparty's payments are gone, so a creditor's
    /// position can have worsened), the uncovered debtors drop out until
    /// every net position is backed, and the graph moves by the net only.
    /// Each cleared envelope is still a contract at its gross value.
    fn settle_netted(&mut self, tick: u64, batch: Vec<ProposalEnvelope>, report: &mut TickReport) {
        if batch.is_empty() {
            return;
        }
        // A send the purse cannot pay for drops out before netting.
        let mut batch: Vec<ProposalEnvelope> = batch
            .into_iter()
            .filter(|env| {
                let ok = self
                    .nodes
                    .get(&env.initiator)
                    .map(|n| n.purse.can_burn(env.compute_weight))
                    .unwrap_or(false);
                if !ok {
                    self.events.push(EngineEvent::Rejected {
                        tick,
                        envelope: env.id,
                        gate: env.gate,
                        reason: format!(
                            "cannot afford the send cost of {:.1} cr",
                            env.compute_weight
                        ),
                        sunk_compute: env.tax_paid,
                    });
                    report.rejected += 1;
                }
                ok
            })
            .collect();
        // Unwind. Removing a debtor only worsens the others, so the loop converges.
        loop {
            let (positions, _) = net_positions(batch.iter());
            let unbacked: Vec<(NodeId, f64, f64)> = positions
                .iter()
                .map(|(id, p)| (*id, *p, self.graph.liquidity_of(*id)))
                .filter(|(_, p, truth)| *p > 0.0 && *truth < *p)
                .collect();
            if unbacked.is_empty() {
                break;
            }
            for (id, position, truth) in unbacked {
                let (mine, rest): (Vec<ProposalEnvelope>, Vec<ProposalEnvelope>) =
                    batch.into_iter().partition(|e| e.initiator == id);
                batch = rest;
                for env in mine {
                    self.events.push(EngineEvent::Rejected { tick, envelope: env.id, gate: env.gate, reason: format!("unbacked at commit after netting: net position {position:.1} > truth {truth:.1}"), sunk_compute: env.tax_paid });
                    report.rejected += 1;
                }
            }
        }
        let (positions, _) = net_positions(batch.iter());
        let net = match self.graph.settle_net(&positions) {
            Ok(net) => net,
            Err((who, have)) => {
                for env in batch {
                    self.events.push(EngineEvent::Rejected {
                        tick,
                        envelope: env.id,
                        gate: env.gate,
                        reason: format!("netting batch void: {who} truth {have:.1}"),
                        sunk_compute: env.tax_paid,
                    });
                    report.rejected += 1;
                }
                return;
            }
        };
        for env in batch {
            report.compute_burned += self.charge_send(env.initiator, env.compute_weight);
            if let Some(n) = self.nodes.get_mut(&env.initiator) {
                n.purse.liquidity -= env.requested_liquidity;
                if let Payload::HireService { service, .. } = &env.payload {
                    n.oak_table.put(
                        format!("services/{}", env.id),
                        format!("{service} delivered by {}", env.target),
                    );
                }
            }
            if let Some(t) = self.nodes.get_mut(&env.target) {
                t.purse.liquidity += env.requested_liquidity;
                if let Payload::HireService { service, .. } = &env.payload {
                    t.oak_table.put(
                        format!("orders/{}", env.id),
                        format!("{service} for {}", env.initiator),
                    );
                }
            }
            self.graph.record_contract(Contract {
                id: env.id,
                tick,
                initiator: env.initiator,
                target: env.target,
                kind: env.payload.kind().into(),
                amount: env.requested_liquidity,
            });
            self.events.push(EngineEvent::Settled {
                tick,
                envelope: env.id,
                from: env.initiator,
                to: env.target,
                amount: env.requested_liquidity,
            });
        }
        report.settled_liquidity += net;
    }

    /// Nodes that did not draft still watch the world move. A node in
    /// stasis or halted does not: its clock is stopped with it.
    fn decay_idle(&mut self, drafted: &BTreeSet<NodeId>) {
        for n in self.nodes.values_mut() {
            if !drafted.contains(&n.id)
                && !matches!(n.status, NodeStatus::Halted | NodeStatus::Packed)
            {
                n.epistemics.record_idle_tick();
            }
        }
    }

    /// O(1) statistical update for every packed group. Returns how many.
    fn macro_ticks(&mut self) -> usize {
        let mut count = 0;
        let mut rng = self.rng.fork(0xA11CE);
        for n in self.nodes.values_mut() {
            if let Some(p) = n.packed.as_mut() {
                p.simulate_stochastically(&mut rng);
                count += 1;
            }
        }
        count
    }

    /// Stage 5 heartbeat: aggregate the countries' roots into the planetary
    /// proof, then apply the partition rule. Returns true when a proof was
    /// emitted.
    fn heartbeat(&mut self, tick: u64) -> bool {
        let roots: Vec<(NodeId, Hash32)> = self
            .nodes
            .values_mut()
            .filter(|n| n.parent.is_none())
            .map(|n| (n.id, n.oak_table.root()))
            .collect();
        if roots.is_empty() {
            return false;
        }
        let global = self.stark.heartbeat(&roots);
        let latency = self.stark.latency_for(&global);
        // A country whose root moved and whose proof failed in the same
        // window is cut from the rails; one whose root held still is let
        // back on. Its Oak Table is untouched: partition is a status, not a
        // write, so the root it must hold still is its own.
        let status: BTreeMap<NodeId, NodeStatus> =
            self.nodes.values().map(|n| (n.id, n.status)).collect();
        let order = self.stark.assess(&roots, &status);
        for id in &order.partition {
            if let Some(n) = self.nodes.get_mut(id) {
                n.status = NodeStatus::Partitioned;
            }
        }
        for id in &order.readmit {
            if let Some(n) = self.nodes.get_mut(id) {
                n.status = NodeStatus::Active;
            }
        }
        let partitioned: Vec<NodeId> = self
            .nodes
            .values()
            .filter(|n| n.status == NodeStatus::Partitioned)
            .map(|n| n.id)
            .collect();
        self.events.push(EngineEvent::GlobalStateConfirmed {
            tick,
            root: global,
            latency_ticks: latency,
            partitioned,
        });
        true
    }

    // ────────────────────────────────── LOD ───────────────────────────────

    /// Fold `parent`'s children into a statistical profile. Their threads
    /// stop. Only children that were Active contribute to the macro burn: a
    /// child waiting at the Door or halted burns nothing in stasis, as it
    /// would have burned nothing awake.
    pub fn pack_children(&mut self, parent: NodeId) {
        let tick = self.tick;
        let seed = self.rng.next_u64();
        let child_ids = match self.nodes.get(&parent) {
            Some(p) if !p.children.is_empty() && p.packed.is_none() => p.children.clone(),
            _ => return,
        };
        let children: Vec<&SovereignNode> =
            child_ids.iter().filter_map(|c| self.nodes.get(c)).collect();
        let profile = PackedStatisticalState::pack(&children, tick, seed);
        let count = children.len();
        for c in &child_ids {
            if let Some(n) = self.nodes.get_mut(c) {
                if n.status == NodeStatus::Active || n.status == NodeStatus::WaitingAtDoor {
                    n.status = NodeStatus::Packed;
                }
            }
        }
        if let Some(p) = self.nodes.get_mut(&parent) {
            p.packed = Some(profile);
        }
        self.events.push(EngineEvent::Packed {
            tick,
            parent,
            children: count,
            seed,
        });
    }

    /// Unfold the profile back onto the children, deterministically.
    pub fn unpack_children(&mut self, parent: NodeId) {
        let tick = self.tick;
        let Some(profile) = self.nodes.get_mut(&parent).and_then(|p| p.packed.take()) else {
            return;
        };
        let child_ids = self
            .nodes
            .get(&parent)
            .map(|p| p.children.clone())
            .unwrap_or_default();
        let active = &profile.active_children;
        let weights = profile.unpack_weights();
        let n = active.len().max(1) as f64;
        // Water-filling over the children that were active: distribute the
        // macro burn by weight, cap each at its purse, re-distribute any
        // shortfall among those with room. The whole burn lands exactly;
        // nothing is minted; nothing is lost.
        let mut remaining = profile.pending_burn;
        let mut burn_distributed = 0.0;
        for _pass in 0..active.len().max(1) {
            if remaining <= 1e-9 {
                break;
            }
            let room: Vec<(usize, f64)> = active
                .iter()
                .enumerate()
                .filter(|(_, c)| {
                    self.nodes
                        .get(c)
                        .map(|x| x.purse.compute > 1e-9)
                        .unwrap_or(false)
                })
                .map(|(i, _)| (i, weights.get(i).copied().unwrap_or(1.0 / n)))
                .collect();
            let weight_room: f64 = room.iter().map(|(_, w)| w).sum();
            if room.is_empty() || weight_room <= 0.0 {
                break;
            }
            let pool = remaining;
            for (i, w) in room {
                if let Some(node) = self.nodes.get_mut(&active[i]) {
                    let burned = node.purse.burn_to_empty(pool * w / weight_room);
                    remaining -= burned;
                    burn_distributed += burned;
                }
            }
        }
        for (i, c) in active.iter().enumerate() {
            let w = weights.get(i).copied().unwrap_or(1.0 / n);
            if let Some(node) = self.nodes.get_mut(c) {
                node.record_tick_burn(profile.pending_burn * w / profile.macro_ticks.max(1) as f64);
                node.purse.liquidity += profile.pending_liquidity_delta * (w - 1.0 / n);
            }
        }
        for c in &child_ids {
            if let Some(node) = self.nodes.get_mut(c) {
                if node.status == NodeStatus::Packed {
                    for _ in 0..profile.pending_decay_ticks {
                        node.epistemics.record_idle_tick();
                    }
                    node.status = if node.held_at_door.is_empty() {
                        NodeStatus::Active
                    } else {
                        NodeStatus::WaitingAtDoor
                    };
                }
            }
        }
        self.events.push(EngineEvent::Unpacked {
            tick,
            parent,
            children: child_ids.len(),
            macro_ticks: profile.macro_ticks,
            burn_distributed,
        });
    }

    // ────────────────────────────── the frontend's view ───────────────────

    pub fn state_view(&mut self) -> StateView {
        let active_scale = self.config.active_scale;
        let mut nodes = Vec::with_capacity(self.nodes.len());
        let mut held = Vec::new();
        let mut waiting = 0;
        let mut halted = 0;
        let ids: Vec<NodeId> = self.nodes.keys().copied().collect();
        for id in ids {
            let truth = self.graph.liquidity_of(id);
            let n = self.nodes.get_mut(&id).expect("node");
            let gate = n.boundary_rules.gate.max(active_scale);
            if n.status == NodeStatus::WaitingAtDoor {
                waiting += 1;
            }
            if n.status == NodeStatus::Halted {
                halted += 1;
            }
            for e in &n.held_at_door {
                let reason = if e.gate == Stage::World {
                    "awaiting_finality"
                } else {
                    "awaiting_human_signature"
                };
                held.push(HeldView {
                    envelope: e.id,
                    node: n.id,
                    node_name: n.name.clone(),
                    description: e.payload.describe(),
                    cost: e.compute_weight,
                    gate: e.gate,
                    reason: reason.into(),
                    created_tick: e.created_tick,
                });
            }
            let oak_root = n.oak_table.root();
            nodes.push(NodeView {
                id: n.id,
                name: n.name.clone(),
                stage: n.scale_level,
                gate,
                parent: n.parent,
                children: n.children.len(),
                status: n.status,
                compute: n.purse.compute,
                compute_allocated: n.purse.compute_allocated,
                compute_burned: n.purse.compute_burned,
                joules_burned: n.purse.joules_burned,
                compute_reclaimed: n.purse.compute_reclaimed,
                liquidity_belief: n.purse.liquidity,
                liquidity_truth: truth,
                confidence: n.epistemics.confidence,
                fog: n.epistemics.fog(),
                generation: n.epistemics.generation,
                idle_ticks: n.epistemics.idle_ticks,
                calibrations: n.epistemics.calibrations,
                tasks_total: n.tasks.len(),
                tasks_done: n.tasks_done(),
                current_task: n.current_task().map(|t| t.id.clone()),
                held: n.held_at_door.len(),
                packed: n.packed.clone(),
                note: n.note.clone(),
                burned_this_tick: n.burned_this_tick,
                oak_root,
                papers: n.oak_table.papers.len(),
                receipts: n
                    .receipts
                    .iter()
                    .rev()
                    .take(6)
                    .map(|r| r.to_plain_line())
                    .collect(),
            });
        }
        let mut gates: Vec<String> = self.strategies.values().map(|s| s.describe()).collect();
        gates.push(self.court.describe());
        gates.push(self.stark.describe());
        StateView {
            tick: self.tick,
            active_scale,
            root: self.graph.root(),
            executor: self.executor.name(),
            nodes,
            held,
            mempool: self.mempool.len(),
            totals: Totals {
                compute_burned: self.reports.iter().map(|r| r.compute_burned).sum(),
                tax_paid: self.reports.iter().map(|r| r.tax_paid).sum(),
                settled: self.graph.total_settled,
                slashed: self.graph.total_slashed,
                approved: self.reports.iter().map(|r| r.approved).sum(),
                rejected: self.reports.iter().map(|r| r.rejected).sum(),
                waiting,
                halted,
            },
            gates,
            last_report: self.reports.last().cloned(),
            root_history: self
                .graph
                .root_history
                .iter()
                .rev()
                .take(16)
                .map(|(t, r)| (*t, r.short()))
                .collect(),
        }
    }

    pub fn state_json(&mut self) -> String {
        serde_json::to_string(&self.state_view()).expect("state serialises")
    }
}

/// Multilateral netting: what each node pays (+) or receives (−) once the
/// opposing debts in a batch cancel, and the gross the batch asked for.
fn net_positions<'a>(
    envs: impl Iterator<Item = &'a ProposalEnvelope>,
) -> (BTreeMap<NodeId, f64>, f64) {
    let mut positions: BTreeMap<NodeId, f64> = BTreeMap::new();
    let mut gross = 0.0;
    for e in envs.filter(|e| e.payload.moves_liquidity()) {
        *positions.entry(e.initiator).or_insert(0.0) += e.requested_liquidity;
        *positions.entry(e.target).or_insert(0.0) -= e.requested_liquidity;
        gross += e.requested_liquidity;
    }
    (positions, gross)
}

/// The liquidity that actually has to move: the sum of the net debits.
fn net_of(positions: &BTreeMap<NodeId, f64>) -> f64 {
    positions.values().filter(|v| **v > 0.0).sum()
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct NodeView {
    pub id: NodeId,
    pub name: String,
    pub stage: Stage,
    pub gate: Stage,
    pub parent: Option<NodeId>,
    pub children: usize,
    pub status: NodeStatus,
    pub compute: f64,
    pub compute_allocated: f64,
    pub compute_burned: f64,
    pub joules_burned: f64,
    pub compute_reclaimed: f64,
    pub liquidity_belief: f64,
    pub liquidity_truth: f64,
    pub confidence: f64,
    pub fog: f64,
    pub generation: u32,
    pub idle_ticks: u64,
    pub calibrations: u32,
    pub tasks_total: usize,
    pub tasks_done: usize,
    pub current_task: Option<String>,
    pub held: usize,
    pub packed: Option<PackedStatisticalState>,
    pub note: Option<Note>,
    pub burned_this_tick: f64,
    pub oak_root: Hash32,
    pub papers: usize,
    pub receipts: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HeldView {
    pub envelope: EnvelopeId,
    pub node: NodeId,
    pub node_name: String,
    pub description: String,
    pub cost: f64,
    pub gate: Stage,
    pub reason: String,
    pub created_tick: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
pub struct Totals {
    pub compute_burned: f64,
    pub tax_paid: f64,
    pub settled: f64,
    pub slashed: f64,
    pub approved: usize,
    pub rejected: usize,
    pub waiting: usize,
    pub halted: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct StateView {
    pub tick: u64,
    pub active_scale: Stage,
    pub root: Hash32,
    pub executor: &'static str,
    pub nodes: Vec<NodeView>,
    pub held: Vec<HeldView>,
    pub mempool: usize,
    pub totals: Totals,
    pub gates: Vec<String>,
    pub last_report: Option<TickReport>,
    pub root_history: Vec<(u64, String)>,
}
