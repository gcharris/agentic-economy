//! The Gates: five verification strategies, one trait. A node does not care
//! whether it is a house or a country; it submits its envelope to whichever
//! [`VerificationStrategy`] the engine assigns and waits for the verdict.
//!
//! | stage | gate | actor | rule |
//! |---|---|---|---|
//! | 1 | The Door | The Porter | hard interrupt, a human clicks |
//! | 2 | The Letter Slot | Couriers | atomic DvP, 2-phase commit, per-batch locks |
//! | 3 | The Clearinghouse | Municipal Treasury | end-of-tick netting |
//! | 4 | Statutory Law | The High Court | stop-lines, rollback, slashing |
//! | 5 | Recursive STARKs | Global Validators | 8–32 tick finality, partition |
//!
//! Stages 1–3 are ordinary strategies the host may replace with
//! [`crate::Engine::set_strategy`]. Stages 4 and 5 are the engine's own
//! [`Stage4StatutoryLaw`] and [`Stage5RecursiveStark`] instances, because
//! the court that rules and the validators that prove also act on the tick
//! as a whole; there is exactly one of each.

use crate::envelope::{AtomicDvP, DvpPhase, Payload, ProposalEnvelope};
use crate::graph::SovereignGraph;
use crate::hash::Hash32;
use crate::ids::{EnvelopeId, NodeId};
use crate::node::{NodeStatus, Stage};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HumanDecision {
    Approve,
    Reject,
}

/// The person's hand on the latch. Written by the host (a click, a key), read by Stage 1.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct HumanDecisions {
    map: BTreeMap<EnvelopeId, HumanDecision>,
}

impl HumanDecisions {
    pub fn approve(&mut self, id: EnvelopeId) {
        self.map.insert(id, HumanDecision::Approve);
    }

    pub fn reject(&mut self, id: EnvelopeId) {
        self.map.insert(id, HumanDecision::Reject);
    }

    pub fn get(&self, id: EnvelopeId) -> Option<HumanDecision> {
        self.map.get(&id).copied()
    }

    pub fn take(&mut self, id: EnvelopeId) -> Option<HumanDecision> {
        self.map.remove(&id)
    }

    pub fn len(&self) -> usize {
        self.map.len()
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum HoldReason {
    /// Stage 1: the tick pauses for this node until the person decides.
    AwaitingHumanSignature,
    /// Stage 5: the proof lands `until_tick`.
    AwaitingFinality { until_tick: u64 },
    /// Stage 2: the counterparty has not locked yet.
    AwaitingCounterparty,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "verdict", rename_all = "snake_case")]
pub enum Verdict {
    Approved,
    /// The envelope is destroyed. Compute spent generating it is not refunded.
    Rejected {
        reason: String,
    },
    /// The envelope waits at the gate. Zero idle burn.
    Held {
        reason: HoldReason,
    },
    /// Rejected, and reserves seized on top.
    Slashed {
        amount: f64,
        reason: String,
    },
}

impl Verdict {
    /// A liquidity failure the High Court should count: an unbacked spend,
    /// a failed lock, a failed proof, or a seizure. Not a stale price, not a
    /// person saying no, not an injunction being enforced.
    pub fn is_liquidity_failure(&self) -> bool {
        match self {
            Verdict::Slashed { .. } => true,
            Verdict::Rejected { reason } => {
                reason.starts_with("lock failed")
                    || reason.starts_with("unbacked")
                    || reason.starts_with("proof failed")
            }
            _ => false,
        }
    }
}

/// What a gate may look at: the truth, the person's decisions, and who is
/// alive. It cannot see any Oak Table. Gates verify; they do not snoop.
#[derive(Debug)]
pub struct BoundaryView<'a> {
    pub tick: u64,
    pub graph: &'a SovereignGraph,
    pub decisions: &'a HumanDecisions,
    pub node_status: &'a BTreeMap<NodeId, NodeStatus>,
    pub node_secrets: &'a BTreeMap<NodeId, u64>,
}

impl BoundaryView<'_> {
    pub fn signature_valid(&self, env: &ProposalEnvelope) -> bool {
        match self.node_secrets.get(&env.initiator) {
            Some(secret) => {
                ProposalEnvelope::signature_for(
                    env.initiator,
                    *secret,
                    &env.payload_hash,
                    env.created_tick,
                ) == env.auth_signature
            }
            None => false,
        }
    }

    pub fn target_alive(&self, env: &ProposalEnvelope) -> bool {
        matches!(
            self.node_status.get(&env.target),
            Some(NodeStatus::Active | NodeStatus::WaitingAtDoor | NodeStatus::Packed)
        )
    }

    pub fn initiator_alive(&self, env: &ProposalEnvelope) -> bool {
        matches!(
            self.node_status.get(&env.initiator),
            Some(NodeStatus::Active | NodeStatus::WaitingAtDoor | NodeStatus::Packed)
        )
    }

    /// Lock phase of every liquidity-bearing verdict: the *truth* must cover
    /// it, net of what this initiator has already locked in the same batch.
    pub fn liquidity_backed(&self, env: &ProposalEnvelope, already_locked: f64) -> Result<(), f64> {
        if !env.payload.moves_liquidity() {
            return Ok(());
        }
        let have = self.graph.liquidity_of(env.initiator) - already_locked;
        if have >= env.requested_liquidity {
            Ok(())
        } else {
            Err(have)
        }
    }
}

/// Checks every gate runs before its own rule.
pub fn preflight(env: &ProposalEnvelope, view: &BoundaryView<'_>) -> Option<Verdict> {
    if env.payload_hash != env.payload.hash() {
        return Some(Verdict::Rejected {
            reason: "payload hash does not match payload".into(),
        });
    }
    if !view.signature_valid(env) {
        return Some(Verdict::Rejected {
            reason: "bad signature".into(),
        });
    }
    if !view.initiator_alive(env) {
        return Some(Verdict::Rejected {
            reason: "initiator is halted or partitioned: a closed house neither sends nor pays"
                .into(),
        });
    }
    if !view.target_alive(env) {
        return Some(Verdict::Rejected {
            reason: format!("target {} is not reachable", env.target),
        });
    }
    None
}

/// Doc 04 §3 and doc 05 Stage 2: the hash the initiator committed to must
/// be the hash of the price it claims, the locked amount must be that
/// price, and the price must be the truth. Otherwise the swap reverts.
pub fn dvp_binding(env: &ProposalEnvelope, view: &BoundaryView<'_>) -> Option<Verdict> {
    let Payload::HireService {
        service,
        believed_price,
        believed_price_hash,
        ..
    } = &env.payload
    else {
        return None;
    };
    if SovereignGraph::hash_price(service, *believed_price) != *believed_price_hash {
        return Some(Verdict::Rejected { reason: format!("hash mismatch: the committed hash is not the hash of the claimed price {believed_price:.2}") });
    }
    if (env.requested_liquidity - believed_price).abs() > 1e-9 {
        return Some(Verdict::Rejected {
            reason: format!(
                "lock failed: locked {:.2} but the verified price is {believed_price:.2}",
                env.requested_liquidity
            ),
        });
    }
    match view.graph.price_hash(service) {
        None => Some(Verdict::Rejected { reason: format!("no such service: {service}") }),
        Some(truth) if truth != *believed_price_hash => Some(Verdict::Rejected { reason: format!("hash mismatch: believed {service} at {believed_price:.2}, truth differs (epistemic drift)") }),
        _ => None,
    }
}

pub trait VerificationStrategy: Send + Sync {
    fn stage(&self) -> Stage;
    fn verify(&mut self, env: &ProposalEnvelope, view: &BoundaryView<'_>) -> Verdict;
    /// Batch hook. Default: one by one. Stages 2 and 3 override it. The
    /// engine's Verify phase calls this hook, so a wrapper that delegates to
    /// another strategy must forward it too, or the wrapped strategy's batch
    /// logic (Stage 2's lock map, Stage 3's netting) never runs.
    fn verify_batch(&mut self, envs: &[ProposalEnvelope], view: &BoundaryView<'_>) -> Vec<Verdict> {
        envs.iter().map(|e| self.verify(e, view)).collect()
    }
    fn describe(&self) -> String;
}

impl fmt::Debug for dyn VerificationStrategy {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.describe())
    }
}

// ─────────────────────────── Stage 1: The Door ───────────────────────────

/// Human sovereignty. Anything that leaves the house or cannot be undone
/// waits here. Holding costs nothing. The person clicks.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Stage1Door {
    /// Distinct envelopes presented to the person.
    pub signatures_requested: u64,
    pub approvals: u64,
    pub rejections: u64,
}

impl VerificationStrategy for Stage1Door {
    fn stage(&self) -> Stage {
        Stage::House
    }

    fn verify(&mut self, env: &ProposalEnvelope, view: &BoundaryView<'_>) -> Verdict {
        if let Some(v) = preflight(env, view) {
            return v;
        }
        if !env.payload.needs_signature_at_house() {
            // Looking is free of the door.
            return Verdict::Approved;
        }
        match view.decisions.get(env.id) {
            Some(HumanDecision::Approve) => {
                self.approvals += 1;
                Verdict::Approved
            }
            Some(HumanDecision::Reject) => {
                self.rejections += 1;
                Verdict::Rejected {
                    reason: "the person said no at the door".into(),
                }
            }
            None => {
                if !env.asked_human {
                    self.signatures_requested += 1;
                }
                Verdict::Held {
                    reason: HoldReason::AwaitingHumanSignature,
                }
            }
        }
    }

    fn describe(&self) -> String {
        format!(
            "The Door (human): {} asked, {} yes, {} no",
            self.signatures_requested, self.approvals, self.rejections
        )
    }
}

// ───────────────────────── Stage 2: The Letter Slot ──────────────────────

/// Atomic Delivery-versus-Payment between two houses. Lock → Transfer →
/// Verify → Settle or Revert. Locks accumulate per initiator within a
/// batch, so two swaps a single purse cannot both cover do not both pass.
/// A stale price on the initiator's table makes the hash mismatch and the
/// swap reverts; the compute spent formatting the envelope stays burned.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Stage2LetterSlot {
    pub swaps: u64,
    pub reverts: u64,
    pub history: Vec<AtomicDvP>,
}

impl Stage2LetterSlot {
    fn record(
        &mut self,
        env: &ProposalEnvelope,
        expected: Hash32,
        actual: Hash32,
        phase: DvpPhase,
    ) {
        if self.history.len() >= 256 {
            self.history.remove(0);
        }
        self.history.push(AtomicDvP {
            envelope: env.id,
            locked_liquidity: env.requested_liquidity,
            locked_compute: env.tax_paid,
            expected_hash: expected,
            actual_hash: actual,
            phase,
        });
    }

    fn verify_one(
        &mut self,
        env: &ProposalEnvelope,
        view: &BoundaryView<'_>,
        locked: &mut BTreeMap<NodeId, f64>,
    ) -> Verdict {
        if let Some(v) = preflight(env, view) {
            return v;
        }
        let already = *locked.get(&env.initiator).unwrap_or(&0.0);
        if let Err(have) = view.liquidity_backed(env, already) {
            if let Payload::HireService {
                believed_price_hash,
                ..
            } = &env.payload
            {
                self.reverts += 1;
                self.record(env, *believed_price_hash, Hash32::ZERO, DvpPhase::Reverted);
            }
            return Verdict::Rejected { reason: format!("lock failed: truth balance {have:.1} (after {already:.1} already locked) < {:.1} requested", env.requested_liquidity) };
        }
        if let Some(v) = dvp_binding(env, view) {
            if let Payload::HireService {
                service,
                believed_price_hash,
                ..
            } = &env.payload
            {
                self.reverts += 1;
                self.record(
                    env,
                    *believed_price_hash,
                    view.graph.price_hash(service).unwrap_or(Hash32::ZERO),
                    DvpPhase::Reverted,
                );
            }
            return v;
        }
        if env.payload.moves_liquidity() {
            *locked.entry(env.initiator).or_insert(0.0) += env.requested_liquidity;
        }
        if let Payload::HireService {
            believed_price_hash,
            ..
        } = &env.payload
        {
            self.swaps += 1;
            self.record(
                env,
                *believed_price_hash,
                *believed_price_hash,
                DvpPhase::Settled,
            );
        }
        Verdict::Approved
    }
}

impl VerificationStrategy for Stage2LetterSlot {
    fn stage(&self) -> Stage {
        Stage::Street
    }

    fn verify(&mut self, env: &ProposalEnvelope, view: &BoundaryView<'_>) -> Verdict {
        let mut locked = BTreeMap::new();
        self.verify_one(env, view, &mut locked)
    }

    fn verify_batch(&mut self, envs: &[ProposalEnvelope], view: &BoundaryView<'_>) -> Vec<Verdict> {
        let mut locked: BTreeMap<NodeId, f64> = BTreeMap::new();
        envs.iter()
            .map(|e| self.verify_one(e, view, &mut locked))
            .collect()
    }

    fn describe(&self) -> String {
        format!(
            "The Letter Slot (atomic DvP): {} settled, {} reverted",
            self.swaps, self.reverts
        )
    }
}

// ───────────────────────── Stage 3: The Clearinghouse ────────────────────

/// End-of-tick batch netting. Thousands of P2P messages become one O(N)
/// pass that cancels opposing debts and settles only the net. A node whose
/// truth cannot cover its *net* position is slashed (statutory fail-safe).
/// The price check of Stage 2 still applies: zooming out does not turn a
/// hallucinated price into a good one.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Stage3Clearinghouse {
    pub slash_rate: f64,
    pub runs: u64,
    pub last_gross: f64,
    pub last_net: f64,
    pub last_envelopes: usize,
}

impl Default for Stage3Clearinghouse {
    fn default() -> Self {
        Stage3Clearinghouse {
            slash_rate: 0.10,
            runs: 0,
            last_gross: 0.0,
            last_net: 0.0,
            last_envelopes: 0,
        }
    }
}

impl VerificationStrategy for Stage3Clearinghouse {
    fn stage(&self) -> Stage {
        Stage::City
    }

    fn verify(&mut self, env: &ProposalEnvelope, view: &BoundaryView<'_>) -> Verdict {
        self.verify_batch(std::slice::from_ref(env), view).remove(0)
    }

    fn verify_batch(&mut self, envs: &[ProposalEnvelope], view: &BoundaryView<'_>) -> Vec<Verdict> {
        self.runs += 1;
        // Envelopes that fail preflight or the price binding never enter the netting.
        let pre: Vec<Option<Verdict>> = envs
            .iter()
            .map(|e| preflight(e, view).or_else(|| dvp_binding(e, view)))
            .collect();
        let mut net: BTreeMap<NodeId, f64> = BTreeMap::new();
        let mut gross = 0.0;
        for (e, p) in envs.iter().zip(&pre) {
            if p.is_none() && e.payload.moves_liquidity() {
                *net.entry(e.initiator).or_insert(0.0) += e.requested_liquidity;
                *net.entry(e.target).or_insert(0.0) -= e.requested_liquidity;
                gross += e.requested_liquidity;
            }
        }
        let net_total: f64 = net.values().filter(|v| **v > 0.0).sum();
        self.last_gross = gross;
        self.last_net = net_total;
        self.last_envelopes = envs.len();
        envs.iter()
            .zip(pre)
            .map(|(e, p)| {
                if let Some(v) = p {
                    return v;
                }
                if !e.payload.moves_liquidity() {
                    return Verdict::Approved;
                }
                let position = *net.get(&e.initiator).unwrap_or(&0.0);
                let truth = view.graph.liquidity_of(e.initiator);
                if truth >= position {
                    Verdict::Approved
                } else {
                    Verdict::Slashed {
                        amount: e.requested_liquidity * self.slash_rate,
                        reason: format!(
                            "unbacked in netting: net position {position:.1} > truth {truth:.1}"
                        ),
                    }
                }
            })
            .collect()
    }

    fn describe(&self) -> String {
        format!(
            "The Clearinghouse (netting): {} runs, last gross {:.1} → net {:.1}",
            self.runs, self.last_gross, self.last_net
        )
    }
}

// ─────────────────────────── Stage 4: Statutory Law ──────────────────────

/// What the court sees of a tick: only the verdicts of the algorithmic
/// gates (Street and above), and only the liquidity failures among them. A
/// person saying no at the Door, a stale price reverting, or an injunction
/// being enforced is not a crisis.
#[derive(Clone, Debug, PartialEq, Default, Serialize, Deserialize)]
pub struct TickStats {
    pub total: usize,
    pub rejected: usize,
    pub offenders: Vec<NodeId>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "order", rename_all = "snake_case")]
pub enum CourtOrder {
    Rollback {
        to_tick: u64,
        reason: String,
        slash: Vec<NodeId>,
    },
}

/// Stop-lines and the High Court. Verifies country-level envelopes like any
/// gate, and also watches the tick: if a clearing collapses (a wave of
/// unbacked liquidity), it rolls the Sovereign Graph back to the last
/// coherent snapshot and slashes the offenders. One instance: the court that
/// rules is the court whose injunctions bind at the gate.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Stage4StatutoryLaw {
    pub reject_threshold: f64,
    pub min_sample: usize,
    pub rollbacks: u64,
    pub injunctions: BTreeSet<NodeId>,
}

impl Default for Stage4StatutoryLaw {
    fn default() -> Self {
        Stage4StatutoryLaw {
            reject_threshold: 0.5,
            min_sample: 5,
            rollbacks: 0,
            injunctions: BTreeSet::new(),
        }
    }
}

impl Stage4StatutoryLaw {
    /// The circuit breaker. Called once per tick after all verdicts.
    pub fn assess(&mut self, tick: u64, stats: &TickStats) -> Option<CourtOrder> {
        if stats.total < self.min_sample {
            return None;
        }
        let rate = stats.rejected as f64 / stats.total as f64;
        if rate > self.reject_threshold {
            self.rollbacks += 1;
            for n in &stats.offenders {
                self.injunctions.insert(*n);
            }
            Some(CourtOrder::Rollback {
                to_tick: tick.saturating_sub(1),
                reason: format!(
                    "{:.0}% of {} liquidity verdicts failed: systemic collapse",
                    rate * 100.0,
                    stats.total
                ),
                slash: stats.offenders.clone(),
            })
        } else {
            None
        }
    }
}

impl VerificationStrategy for Stage4StatutoryLaw {
    fn stage(&self) -> Stage {
        Stage::Country
    }

    fn verify(&mut self, env: &ProposalEnvelope, view: &BoundaryView<'_>) -> Verdict {
        if let Some(v) = preflight(env, view) {
            return v;
        }
        if self.injunctions.contains(&env.initiator) {
            return Verdict::Rejected {
                reason: "injunction: the initiator is barred by the court".into(),
            };
        }
        if let Some(v) = dvp_binding(env, view) {
            return v;
        }
        match view.liquidity_backed(env, 0.0) {
            Ok(()) => Verdict::Approved,
            Err(have) => Verdict::Slashed {
                amount: (env.requested_liquidity - have) * 0.25,
                reason: format!("unbacked spend under statute: truth {have:.1}"),
            },
        }
    }

    fn describe(&self) -> String {
        format!(
            "Statutory Law (High Court): {} rollbacks, {} injunctions",
            self.rollbacks,
            self.injunctions.len()
        )
    }
}

// ───────────────────────── Stage 5: Recursive STARKs ─────────────────────

/// The validators' decision at a heartbeat: who is cut from the rails and
/// who is let back on. Applied by the engine, like a [`CourtOrder`].
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PartitionOrder {
    pub partition: Vec<NodeId>,
    pub readmit: Vec<NodeId>,
}

/// The planetary computer. No court, only proofs. The engine does not run
/// the hashes; it aggregates the roots and waits 8–32 ticks for finality.
///
/// The partition rule (doc 05, Stage 5): a country whose Merkle root does
/// not align with the proof is temporarily partitioned from the global
/// liquidity rails until it resolves its state. Concretely, at a heartbeat a
/// country is partitioned when its root moved since the previous heartbeat
/// *and* one of its envelopes failed its proof in the same window; a
/// partitioned country is re-admitted at the next heartbeat at which its
/// root held still. The first heartbeat is the baseline.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Stage5RecursiveStark {
    pub min_latency: u64,
    pub max_latency: u64,
    pending: BTreeMap<EnvelopeId, u64>,
    pub proofs: u64,
    pub last_global_root: Option<Hash32>,
    /// Every country's root at the previous heartbeat.
    pub last_roots: BTreeMap<NodeId, Hash32>,
    /// Countries with a proof failure since the previous heartbeat.
    pub rejected_this_window: BTreeSet<NodeId>,
}

impl Default for Stage5RecursiveStark {
    fn default() -> Self {
        Stage5RecursiveStark {
            min_latency: 8,
            max_latency: 32,
            pending: BTreeMap::new(),
            proofs: 0,
            last_global_root: None,
            last_roots: BTreeMap::new(),
            rejected_this_window: BTreeSet::new(),
        }
    }
}

impl Stage5RecursiveStark {
    pub fn latency_for(&self, h: &Hash32) -> u64 {
        self.min_latency + h.as_u64() % (self.max_latency - self.min_latency + 1)
    }

    /// Aggregate the roots of the countries into one global root.
    pub fn heartbeat(&mut self, roots: &[(NodeId, Hash32)]) -> Hash32 {
        let leaves: Vec<Hash32> = roots
            .iter()
            .map(|(id, r)| Hash32::digest_parts(&[&id.0.to_le_bytes(), &r.0]))
            .collect();
        let global = Hash32::merkle_root(&leaves);
        self.proofs += 1;
        self.last_global_root = Some(global);
        global
    }

    /// A proof failed for this initiator. Counted at the next heartbeat.
    pub fn note_rejection(&mut self, initiator: NodeId) {
        self.rejected_this_window.insert(initiator);
    }

    /// The partition rule, once per heartbeat, over every country's current
    /// root and status. Stores the roots as the next baseline and opens a
    /// new window.
    pub fn assess(
        &mut self,
        roots: &[(NodeId, Hash32)],
        status: &BTreeMap<NodeId, NodeStatus>,
    ) -> PartitionOrder {
        let mut order = PartitionOrder::default();
        for (id, root) in roots {
            let stable = self.last_roots.get(id).is_none_or(|prev| prev == root);
            match status.get(id) {
                Some(NodeStatus::Partitioned) if stable => order.readmit.push(*id),
                Some(NodeStatus::Active | NodeStatus::WaitingAtDoor)
                    if !stable && self.rejected_this_window.contains(id) =>
                {
                    order.partition.push(*id)
                }
                _ => {}
            }
        }
        self.last_roots = roots.iter().copied().collect();
        self.rejected_this_window.clear();
        order
    }

    pub fn pending(&self) -> usize {
        self.pending.len()
    }
}

impl VerificationStrategy for Stage5RecursiveStark {
    fn stage(&self) -> Stage {
        Stage::World
    }

    fn verify(&mut self, env: &ProposalEnvelope, view: &BoundaryView<'_>) -> Verdict {
        if let Some(v) = preflight(env, view) {
            self.pending.remove(&env.id);
            return v;
        }
        if let Some(v) = dvp_binding(env, view) {
            self.pending.remove(&env.id);
            return v;
        }
        if let Err(have) = view.liquidity_backed(env, 0.0) {
            self.pending.remove(&env.id);
            return Verdict::Rejected {
                reason: format!(
                    "proof failed: truth {have:.1} cannot back {:.1}",
                    env.requested_liquidity
                ),
            };
        }
        match self.pending.get(&env.id).copied() {
            Some(until) if view.tick >= until => {
                self.pending.remove(&env.id);
                Verdict::Approved
            }
            Some(until) => Verdict::Held {
                reason: HoldReason::AwaitingFinality { until_tick: until },
            },
            None => {
                let until = view.tick + self.latency_for(&env.payload_hash);
                self.pending.insert(env.id, until);
                Verdict::Held {
                    reason: HoldReason::AwaitingFinality { until_tick: until },
                }
            }
        }
    }

    fn describe(&self) -> String {
        format!(
            "Recursive STARKs: {} proofs, {} awaiting finality",
            self.proofs,
            self.pending.len()
        )
    }
}

/// The three replaceable gates. Stages 4 and 5 live on the engine itself.
pub fn default_strategies() -> BTreeMap<Stage, Box<dyn VerificationStrategy>> {
    let mut m: BTreeMap<Stage, Box<dyn VerificationStrategy>> = BTreeMap::new();
    m.insert(Stage::House, Box::new(Stage1Door::default()));
    m.insert(Stage::Street, Box::new(Stage2LetterSlot::default()));
    m.insert(Stage::City, Box::new(Stage3Clearinghouse::default()));
    m
}
