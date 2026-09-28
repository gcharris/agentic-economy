//! The Courier Network's holding area. Envelopes wait here between the
//! Collect and Verify phases. The courier rule: a message that asks for
//! liquidity without allocating any is dropped before it reaches anyone.

use crate::envelope::ProposalEnvelope;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Mempool {
    pending: Vec<ProposalEnvelope>,
    pub dropped_total: usize,
    pub accepted_total: usize,
}

impl Mempool {
    pub fn submit(&mut self, env: ProposalEnvelope) -> Result<(), Box<(ProposalEnvelope, String)>> {
        if env.payload.moves_liquidity() && env.requested_liquidity <= 0.0 {
            self.dropped_total += 1;
            return Err(Box::new((env, "courier rule: liquidity payload without liquidity allocation".into())));
        }
        if env.requested_liquidity < 0.0 {
            self.dropped_total += 1;
            return Err(Box::new((env, "courier rule: negative liquidity".into())));
        }
        self.accepted_total += 1;
        self.pending.push(env);
        Ok(())
    }

    pub fn drain(&mut self) -> Vec<ProposalEnvelope> {
        std::mem::take(&mut self.pending)
    }

    pub fn len(&self) -> usize {
        self.pending.len()
    }

    pub fn is_empty(&self) -> bool {
        self.pending.is_empty()
    }

    pub fn peek(&self) -> &[ProposalEnvelope] {
        &self.pending
    }
}
