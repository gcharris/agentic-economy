//! Fractal Level of Detail. When the camera is far away the engine stops
//! executing discrete children and runs an O(1) statistical update on the
//! parent instead (Stochastic Stasis). Packing records enough to unpack
//! deterministically later; the seed makes the retroactive distribution
//! replayable.

use crate::ids::NodeId;
use crate::node::{NodeStatus, SovereignNode};
use crate::rng::Rng;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PackedStatisticalState {
    pub avg_compute_burn_rate: f64,
    pub liquidity_velocity: f64,
    pub epistemic_variance: f64,
    pub mean_confidence: f64,
    /// Seed used to deterministically unpack the state when zoomed in.
    pub stochastic_seed: u64,
    pub packed_at_tick: u64,
    /// Children that were Active when packed: the only ones the macro burn
    /// belongs to. A child waiting at the Door or halted burns nothing in
    /// stasis, exactly as it would have burned nothing awake.
    pub active_children: Vec<NodeId>,
    pub child_count: usize,
    pub total_compute_at_pack: f64,
    /// Accumulated while in stasis; distributed on unpack.
    pub macro_ticks: u64,
    pub pending_burn: f64,
    pub pending_liquidity_delta: f64,
    pub pending_decay_ticks: u64,
}

impl PackedStatisticalState {
    /// Fold a set of discrete children into one profile.
    pub fn pack(all_children: &[&SovereignNode], tick: u64, seed: u64) -> Self {
        let children: Vec<&SovereignNode> = all_children.iter().copied().filter(|c| c.status == NodeStatus::Active).collect();
        let children = &children[..];
        let n = children.len().max(1) as f64;
        let burn: f64 = children.iter().map(|c| c.avg_burn_rate()).sum::<f64>() / n;
        let liq: f64 = children.iter().map(|c| c.purse.liquidity.abs()).sum::<f64>() / n;
        let mean_conf: f64 = children.iter().map(|c| c.epistemics.confidence).sum::<f64>() / n;
        let var: f64 = children.iter().map(|c| (c.epistemics.confidence - mean_conf).powi(2)).sum::<f64>() / n;
        let total_compute: f64 = children.iter().map(|c| c.purse.compute).sum();
        PackedStatisticalState {
            avg_compute_burn_rate: burn,
            liquidity_velocity: liq * 0.05,
            epistemic_variance: var,
            mean_confidence: mean_conf,
            stochastic_seed: seed,
            packed_at_tick: tick,
            active_children: children.iter().map(|c| c.id).collect(),
            child_count: children.len(),
            total_compute_at_pack: total_compute,
            macro_ticks: 0,
            pending_burn: 0.0,
            pending_liquidity_delta: 0.0,
            pending_decay_ticks: 0,
        }
    }

    /// One O(1) macro tick instead of `child_count` discrete drafts.
    pub fn simulate_stochastically(&mut self, rng: &mut Rng) {
        self.macro_ticks += 1;
        let noise = 1.0 + 0.15 * rng.gaussian();
        let burn = (self.avg_compute_burn_rate * self.child_count as f64 * noise).max(0.0);
        let available = (self.total_compute_at_pack - self.pending_burn).max(0.0);
        self.pending_burn += burn.min(available);
        self.pending_liquidity_delta += self.liquidity_velocity * rng.gaussian();
        self.pending_decay_ticks += 1;
    }

    /// Deterministic weights for distributing the accumulated macro state
    /// back onto the children. Same seed, same weights, every time.
    pub fn unpack_weights(&self) -> Vec<f64> {
        let mut rng = Rng::seed_from_u64(self.stochastic_seed);
        let raw: Vec<f64> = (0..self.child_count).map(|_| 0.5 + rng.next_f64()).collect();
        let sum: f64 = raw.iter().sum::<f64>().max(f64::MIN_POSITIVE);
        raw.into_iter().map(|w| w / sum).collect()
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UnpackReport {
    pub parent: NodeId,
    pub children: usize,
    pub macro_ticks: u64,
    pub burn_distributed: f64,
    pub liquidity_distributed: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weights_are_deterministic_and_normalised() {
        let p = PackedStatisticalState { avg_compute_burn_rate: 1.0, liquidity_velocity: 0.0, epistemic_variance: 0.0, mean_confidence: 1.0, stochastic_seed: 42, packed_at_tick: 0, active_children: Vec::new(), child_count: 20, total_compute_at_pack: 100.0, macro_ticks: 0, pending_burn: 0.0, pending_liquidity_delta: 0.0, pending_decay_ticks: 0 };
        let a = p.unpack_weights();
        let b = p.unpack_weights();
        assert_eq!(a, b);
        assert!((a.iter().sum::<f64>() - 1.0).abs() < 1e-9);
    }

    #[test]
    fn macro_burn_never_exceeds_packed_compute() {
        let mut p = PackedStatisticalState { avg_compute_burn_rate: 30.0, liquidity_velocity: 0.0, epistemic_variance: 0.0, mean_confidence: 1.0, stochastic_seed: 1, packed_at_tick: 0, active_children: Vec::new(), child_count: 5, total_compute_at_pack: 200.0, macro_ticks: 0, pending_burn: 0.0, pending_liquidity_delta: 0.0, pending_decay_ticks: 0 };
        let mut rng = Rng::seed_from_u64(9);
        for _ in 0..100 {
            p.simulate_stochastically(&mut rng);
        }
        assert!(p.pending_burn <= 200.0 + 1e-9);
    }
}
