//! The Oak Table: a node's local, mutable, Merkle-rooted state.
//!
//! "Keep the papers in the house, not in the helper." Drafts, notes and
//! decisions live here. The helper (the [`crate::Agent`]) can be replaced on
//! Wednesday and the papers are still on the table on Thursday.
//!
//! Only the owning node writes here. Drafts receive an [`OakSnapshot`], an
//! owned copy, never a reference.

use crate::hash::Hash32;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// A piece of work left on the table by a seat.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Paper {
    pub tick: u64,
    pub seat: String,
    pub title: String,
    pub body: String,
    pub tokens: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
pub struct OakTable {
    entries: BTreeMap<String, String>,
    pub papers: Vec<Paper>,
    #[serde(skip)]
    cached_root: Option<Hash32>,
}

impl OakTable {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get(&self, key: &str) -> Option<&str> {
        self.entries.get(key).map(String::as_str)
    }

    pub fn put(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.entries.insert(key.into(), value.into());
        self.cached_root = None;
    }

    pub fn remove(&mut self, key: &str) -> Option<String> {
        self.cached_root = None;
        self.entries.remove(key)
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn entries(&self) -> impl Iterator<Item = (&String, &String)> {
        self.entries.iter()
    }

    pub fn leave_paper(&mut self, paper: Paper) {
        self.papers.push(paper);
        self.cached_root = None;
    }

    /// The Merkle root of everything on the table. Cached until the next write.
    pub fn root(&mut self) -> Hash32 {
        if let Some(r) = self.cached_root {
            return r;
        }
        let r = Self::compute_root(&self.entries, &self.papers);
        self.cached_root = Some(r);
        r
    }

    pub fn compute_root(entries: &BTreeMap<String, String>, papers: &[Paper]) -> Hash32 {
        let mut leaves: Vec<Hash32> = entries
            .iter()
            .map(|(k, v)| Hash32::digest_parts(&[k.as_bytes(), b"=", v.as_bytes()]))
            .collect();
        leaves.extend(papers.iter().map(|p| Hash32::digest_parts(&[p.seat.as_bytes(), b":", p.title.as_bytes(), b":", p.body.as_bytes()])));
        Hash32::merkle_root(&leaves)
    }

    /// An owned copy for a draft. This is the *only* view a draft ever gets.
    pub fn snapshot(&mut self, tick: u64) -> OakSnapshot {
        let root = self.root();
        OakSnapshot { entries: self.entries.clone(), papers: self.papers.clone(), root, taken_at_tick: tick }
    }
}

/// What a draft sees: a copy of the table, frozen at a tick.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct OakSnapshot {
    pub entries: BTreeMap<String, String>,
    pub papers: Vec<Paper>,
    pub root: Hash32,
    pub taken_at_tick: u64,
}

impl OakSnapshot {
    pub fn get(&self, key: &str) -> Option<&str> {
        self.entries.get(key).map(String::as_str)
    }

    pub fn get_f64(&self, key: &str) -> Option<f64> {
        self.get(key)?.parse().ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_changes_with_content() {
        let mut t = OakTable::new();
        let empty = t.root();
        t.put("price/flour", "12.5");
        let one = t.root();
        assert_ne!(empty, one);
        t.put("price/flour", "12.5");
        assert_eq!(one, t.root(), "idempotent write keeps the root");
        t.leave_paper(Paper { tick: 1, seat: "Scribble".into(), title: "Draft".into(), body: "…".into(), tokens: 10 });
        assert_ne!(one, t.root());
    }

    #[test]
    fn snapshot_is_a_copy() {
        let mut t = OakTable::new();
        t.put("a", "1");
        let snap = t.snapshot(3);
        t.put("a", "2");
        assert_eq!(snap.get("a"), Some("1"));
        assert_eq!(t.get("a"), Some("2"));
    }
}
