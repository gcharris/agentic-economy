# 05. VERIFICATION BOUNDARIES & THE GATES

## 1. The Core Purpose of a Boundary
In traditional game engines, an entity directly accesses another entity's memory pointer (e.g., `Player.Inventory.Add(Item)`). 
In the Agentic Engine, this is strictly forbidden. 

State can only mutate by crossing a **Verification Boundary**. The type of verification scales fractally depending on the zoom level.

## 2. The 5 Stages of Verification

### Stage 1: The Door (Human Sovereignty)
- **Actor:** The Porter.
- **Rule:** The system enforces a hard interrupt. The game loop pauses for this specific Node.
- **Mechanic:** The UI throws a modal (e.g., "Scribble wants to spend 5 tokens to hire the neighbor's Scout"). The user must manually click `Authorize()` or `Reject()`.
- **Engine Impact:** Zero-knowledge is required here because the Human acts as the ultimate Oracle.

### Stage 2: The Letter Slot (Atomic DvP)
- **Actor:** Neighborhood Couriers.
- **Rule:** 2-Phase Commit (Lock -> Swap -> Verify -> Settle).
- **Mechanic:** The engine executes a local cryptographic handshake between two neighboring Houses. House A locks funds. House B locks data. Both verify the exact payload size and signature. If a hash mismatch occurs (due to Epistemic Decay hallucinating a different price), the engine rolls back the locks instantly.
- **Engine Impact:** P2P event bus messages. High frequency, low latency.

### Stage 3: The Clearinghouse (Batch Netting)
- **Actor:** Municipal Treasuries (Penny).
- **Rule:** End-of-Tick Batch Processing.
- **Mechanic:** Instead of millions of P2P messages, all Stage 2 DvP transactions are routed to the Municipal Node. At the end of the City's macro-tick, the engine runs a netting algorithm (O(N) complexity) to cancel out opposing debts, settling only the net differences.
- **Engine Impact:** Massively reduces the total liquidity required to operate the city. Unlocks "wholesale" compute foundries.

### Stage 4: Statutory Law (Stop-Lines & The High Court)
- **Actor:** The Sovereign State.
- **Rule:** Dispute Resolution & Slashing.
- **Mechanic:** If a Stage 3 City clearinghouse fails (e.g., a massive systemic hallucination causes a liquidity crisis), the Stage 4 boundary acts as a circuit breaker. 
- **The Rollback:** The High Court maintains a deeply archived Snapshot of the State DAG. It can execute a hard rollback of the City to a previous coherent state, slashing the reserves of the offending nodes.
- **Engine Impact:** Simulates legal jurisdiction. Defines the absolute limits of liability.

### Stage 5: Recursive STARKs (The Planetary Computer)
- **Actor:** Global Validators.
- **Rule:** Trustless Mathematical Proofs.
- **Mechanic:** At the planetary scale, there is no High Court. Instead, the Engine simulates Zero-Knowledge STARK proofs. 
- **The Abstraction:** The engine does not actually run millions of cryptographic hashes. Instead, it aggregates the Merkle roots of all Stage 4 Countries, applies an 8-32 second delay (representing global finality latency), and emits a `GLOBAL_STATE_CONFIRMED` event.
- **Engine Impact:** Provides the absolute heartbeat of the simulation. If a Country's Merkle root does not align with the STARK proof, that Country is temporarily partitioned from the global liquidity rails until it resolves its state.

---

## 3. Implementation Note for the Engine Developer
These boundaries must be implemented using the **Strategy Pattern**.

```typescript
interface VerificationStrategy {
    verify(proposal: ProposalEnvelope): boolean;
}

class Stage1_HumanVerification implements VerificationStrategy {
    verify(proposal) {
        return UI.awaitHumanClick(proposal);
    }
}

class Stage3_ClearinghouseVerification implements VerificationStrategy {
    verify(proposal) {
        return Engine.runNettingAlgorithm(proposal);
    }
}
```

By decoupling the Nodes from the Boundary Strategies, the engine achieves true fractal scaling. A Node doesn't care if it's a House or a Country; it simply submits its work to its assigned Boundary Strategy and waits for the resolution event.
