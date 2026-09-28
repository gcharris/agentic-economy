//! The Sovereign Graph: the one global object. Ground truth of who owns
//! what, exact liquidity balances, completed contracts. Read-only for
//! agents. Written only inside the Commit phase of the tick, only from
//! envelopes a boundary approved. Snapshotted every tick so the High Court
//! can roll a city back.

use crate::hash::Hash32;
use crate::ids::{EnvelopeId, NodeId};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, VecDeque};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Contract {
    pub id: EnvelopeId,
    pub tick: u64,
    pub initiator: NodeId,
    pub target: NodeId,
    pub kind: String,
    pub amount: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GraphSnapshot {
    pub tick: u64,
    pub root: Hash32,
    pub liquidity: BTreeMap<NodeId, f64>,
    pub contracts_len: usize,
    pub deliveries: BTreeMap<NodeId, usize>,
    pub total_settled: f64,
    pub total_slashed: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SovereignGraph {
    /// The truth of every balance.
    liquidity: BTreeMap<NodeId, f64>,
    pub contracts: Vec<Contract>,
    /// Ground-truth prices for services (what the Oak Table caches drift from).
    pub service_prices: BTreeMap<String, f64>,
    /// Messages delivered across boundaries, by recipient.
    pub deliveries: BTreeMap<NodeId, Vec<(EnvelopeId, String)>>,
    pub root_history: Vec<(u64, Hash32)>,
    snapshots: VecDeque<GraphSnapshot>,
    pub snapshot_depth: usize,
    pub total_settled: f64,
    pub total_slashed: f64,
}

impl Default for SovereignGraph {
    fn default() -> Self {
        Self::new(64)
    }
}

impl SovereignGraph {
    pub fn new(snapshot_depth: usize) -> Self {
        SovereignGraph {
            liquidity: BTreeMap::new(),
            contracts: Vec::new(),
            service_prices: BTreeMap::new(),
            deliveries: BTreeMap::new(),
            root_history: Vec::new(),
            snapshots: VecDeque::with_capacity(snapshot_depth),
            snapshot_depth,
            total_settled: 0.0,
            total_slashed: 0.0,
        }
    }

    pub fn liquidity_of(&self, id: NodeId) -> f64 {
        *self.liquidity.get(&id).unwrap_or(&0.0)
    }

    pub fn set_liquidity(&mut self, id: NodeId, amount: f64) {
        self.liquidity.insert(id, amount);
    }

    pub fn balances(&self) -> &BTreeMap<NodeId, f64> {
        &self.liquidity
    }

    pub fn price_hash(&self, service: &str) -> Option<Hash32> {
        self.service_prices.get(service).map(|p| Self::hash_price(service, *p))
    }

    pub fn hash_price(service: &str, price: f64) -> Hash32 {
        Hash32::digest_parts(&[service.as_bytes(), b"@", format!("{price:.4}").as_bytes()])
    }

    /// Move liquidity. Fails without side effects if the truth cannot cover it.
    pub fn transfer(&mut self, from: NodeId, to: NodeId, amount: f64) -> Result<(), f64> {
        let have = self.liquidity_of(from);
        if have < amount {
            return Err(have);
        }
        *self.liquidity.entry(from).or_insert(0.0) -= amount;
        *self.liquidity.entry(to).or_insert(0.0) += amount;
        self.total_settled += amount;
        Ok(())
    }

    /// Stage 3: settle one multilateral netting batch. `positions` maps each
    /// node to what it pays (+) or receives (−) once opposing debts cancel;
    /// they sum to zero. Fails without side effects, naming the first node
    /// whose truth cannot cover its net position. Returns the net that moved.
    pub fn settle_net(&mut self, positions: &BTreeMap<NodeId, f64>) -> Result<f64, (NodeId, f64)> {
        for (id, p) in positions {
            let have = self.liquidity_of(*id);
            if *p > 0.0 && have < *p {
                return Err((*id, have));
            }
        }
        let mut net = 0.0;
        for (id, p) in positions {
            *self.liquidity.entry(*id).or_insert(0.0) -= p;
            if *p > 0.0 {
                net += p;
            }
        }
        self.total_settled += net;
        Ok(net)
    }

    pub fn slash(&mut self, node: NodeId, amount: f64) -> f64 {
        let have = self.liquidity_of(node);
        let taken = amount.min(have).max(0.0);
        self.liquidity.insert(node, have - taken);
        self.total_slashed += taken;
        taken
    }

    pub fn deliver(&mut self, to: NodeId, envelope: EnvelopeId, message: String) {
        self.deliveries.entry(to).or_default().push((envelope, message));
    }

    pub fn record_contract(&mut self, c: Contract) {
        self.contracts.push(c);
    }

    /// The Merkle-style root of the whole truth.
    pub fn root(&self) -> Hash32 {
        let mut leaves: Vec<Hash32> = self
            .liquidity
            .iter()
            .map(|(id, amt)| Hash32::digest_parts(&[&id.0.to_le_bytes(), format!("{amt:.6}").as_bytes()]))
            .collect();
        leaves.extend(self.contracts.iter().map(|c| Hash32::digest_parts(&[&c.id.0.to_le_bytes(), &c.tick.to_le_bytes(), format!("{:.6}", c.amount).as_bytes()])));
        for (to, msgs) in &self.deliveries {
            for (id, msg) in msgs {
                leaves.push(Hash32::digest_parts(&[&to.0.to_le_bytes(), &id.0.to_le_bytes(), msg.as_bytes()]));
            }
        }
        Hash32::merkle_root(&leaves)
    }

    pub fn snapshot(&mut self, tick: u64) -> Hash32 {
        let root = self.root();
        self.root_history.push((tick, root));
        if self.snapshots.len() == self.snapshot_depth {
            self.snapshots.pop_front();
        }
        let deliveries = self.deliveries.iter().map(|(k, v)| (*k, v.len())).collect();
        self.snapshots.push_back(GraphSnapshot { tick, root, liquidity: self.liquidity.clone(), contracts_len: self.contracts.len(), deliveries, total_settled: self.total_settled, total_slashed: self.total_slashed });
        root
    }

    pub fn snapshots(&self) -> impl Iterator<Item = &GraphSnapshot> {
        self.snapshots.iter()
    }

    /// The High Court's hard rollback to the most recent snapshot at or
    /// before `tick`. Returns the tick actually restored.
    pub fn rollback_to(&mut self, tick: u64) -> Option<u64> {
        let idx = self.snapshots.iter().rposition(|s| s.tick <= tick)?;
        let snap = self.snapshots[idx].clone();
        self.liquidity = snap.liquidity.clone();
        self.contracts.truncate(snap.contracts_len);
        self.total_settled = snap.total_settled;
        self.total_slashed = snap.total_slashed;
        for (to, msgs) in self.deliveries.iter_mut() {
            msgs.truncate(*snap.deliveries.get(to).unwrap_or(&0));
        }
        self.snapshots.truncate(idx + 1);
        self.root_history.retain(|(t, _)| *t <= snap.tick);
        Some(snap.tick)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transfer_is_atomic() {
        let mut g = SovereignGraph::new(4);
        g.set_liquidity(NodeId(1), 10.0);
        assert_eq!(g.transfer(NodeId(1), NodeId(2), 11.0), Err(10.0));
        assert_eq!(g.liquidity_of(NodeId(2)), 0.0);
        assert!(g.transfer(NodeId(1), NodeId(2), 4.0).is_ok());
        assert_eq!(g.liquidity_of(NodeId(1)), 6.0);
        assert_eq!(g.liquidity_of(NodeId(2)), 4.0);
    }

    #[test]
    fn rollback_restores_a_coherent_past() {
        let mut g = SovereignGraph::new(4);
        g.set_liquidity(NodeId(1), 10.0);
        let r1 = g.snapshot(1);
        g.transfer(NodeId(1), NodeId(2), 3.0).unwrap();
        g.snapshot(2);
        g.transfer(NodeId(1), NodeId(2), 3.0).unwrap();
        g.snapshot(3);
        assert_eq!(g.rollback_to(1), Some(1));
        assert_eq!(g.liquidity_of(NodeId(1)), 10.0);
        assert_eq!(g.root(), r1);
    }
}
