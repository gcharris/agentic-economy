//! SHA-256 content hashes. Used for Oak Table Merkle roots, payload hashes,
//! simulated signatures, and the Sovereign Graph root chain.

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use sha2::{Digest, Sha256};
use std::fmt;

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
pub struct Hash32(pub [u8; 32]);

impl Hash32 {
    pub const ZERO: Hash32 = Hash32([0u8; 32]);

    pub fn digest(bytes: &[u8]) -> Self {
        Hash32(Sha256::digest(bytes).into())
    }

    pub fn digest_parts(parts: &[&[u8]]) -> Self {
        let mut h = Sha256::new();
        for p in parts {
            h.update(p);
        }
        Hash32(h.finalize().into())
    }

    pub fn combine(a: &Hash32, b: &Hash32) -> Self {
        Self::digest_parts(&[&a.0, &b.0])
    }

    /// Merkle root over an ordered list of leaves. Odd leaves are paired with
    /// themselves. An empty list has the zero root.
    pub fn merkle_root(leaves: &[Hash32]) -> Hash32 {
        if leaves.is_empty() {
            return Hash32::ZERO;
        }
        let mut level: Vec<Hash32> = leaves.to_vec();
        while level.len() > 1 {
            let mut next = Vec::with_capacity(level.len().div_ceil(2));
            for pair in level.chunks(2) {
                let r = if pair.len() == 2 { &pair[1] } else { &pair[0] };
                next.push(Hash32::combine(&pair[0], r));
            }
            level = next;
        }
        level[0]
    }

    pub fn to_hex(&self) -> String {
        let mut s = String::with_capacity(64);
        for b in self.0 {
            s.push_str(&format!("{b:02x}"));
        }
        s
    }

    /// First eight hex characters, for logs and the HUD.
    pub fn short(&self) -> String {
        self.to_hex()[..8].to_string()
    }

    pub fn from_hex(s: &str) -> Option<Self> {
        if s.len() != 64 {
            return None;
        }
        let mut out = [0u8; 32];
        for (i, chunk) in s.as_bytes().chunks(2).enumerate() {
            let hi = (chunk[0] as char).to_digit(16)?;
            let lo = (chunk[1] as char).to_digit(16)?;
            out[i] = (hi * 16 + lo) as u8;
        }
        Some(Hash32(out))
    }

    /// A deterministic u64 view of the hash (little-endian first 8 bytes).
    pub fn as_u64(&self) -> u64 {
        let mut b = [0u8; 8];
        b.copy_from_slice(&self.0[..8]);
        u64::from_le_bytes(b)
    }
}

impl fmt::Debug for Hash32 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Hash32({})", self.short())
    }
}

impl fmt::Display for Hash32 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.to_hex())
    }
}

impl Serialize for Hash32 {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_hex())
    }
}

impl<'de> Deserialize<'de> for Hash32 {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        Hash32::from_hex(&s).ok_or_else(|| serde::de::Error::custom("bad hex hash"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_roundtrip() {
        let h = Hash32::digest(b"oak table");
        assert_eq!(Hash32::from_hex(&h.to_hex()), Some(h));
    }

    #[test]
    fn merkle_is_order_sensitive_and_stable() {
        let a = Hash32::digest(b"a");
        let b = Hash32::digest(b"b");
        assert_eq!(Hash32::merkle_root(&[a, b]), Hash32::merkle_root(&[a, b]));
        assert_ne!(Hash32::merkle_root(&[a, b]), Hash32::merkle_root(&[b, a]));
        assert_eq!(Hash32::merkle_root(&[]), Hash32::ZERO);
    }
}
