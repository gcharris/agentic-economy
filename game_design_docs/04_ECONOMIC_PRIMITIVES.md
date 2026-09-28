# 04. ECONOMIC PRIMITIVES & RESOURCE ROUTING

## 1. The Tripartite Resource System
The entire game engine runs on three interconnected resources. These are not "Gold" and "Wood". They are fundamental properties of physics and information theory in an agentic system.

### A. Compute (The Fuel)
- **Unit:** `FLOPs` or `Context Tokens`. 
- **Source:** The Purse. 
- **Mechanic:** Every time an Agent thread evaluates a prompt, runs a heuristic, or attempts to synchronize state, it burns Compute. Compute is finite. It trickles in as a baseline (e.g., Solar allocation) or must be purchased using Liquidity.
- **Visuals:** Depicted as glowing energy reserves, exhaust, or runway countdown timers.

### B. Truth / Coherence (The Gravity)
- **Unit:** `Epistemic Confidence` (0.0 to 1.0).
- **Source:** The Oak Table (Local shared memory) or The Global Merkle Root.
- **Mechanic:** Data isolated in an agent's head rots. If an agent does not spend Compute to fetch the latest state from the outside world, its Truth decays. Operating with low Truth leads to failed transactions (slashing) or hallucinated proposals that get rejected at The Door.
- **Visuals:** Fog of war, visual static, geometric distortion.

### C. Liquidity (The Exchange)
- **Unit:** `Tokens` (Representing commercial bank money, stablecoins, or CBDC depending on the Stage).
- **Source:** Earned by delivering verified state changes to other Nodes.
- **Mechanic:** Liquidity is required to bridge the gap between nodes. You cannot ask the Neighborhood to do work without sending Liquidity via an `AtomicDvP` (Delivery vs. Payment) envelope.

## 2. The Coordination Tax Model
Based on the empirical battery data (`ael_experiment_results.json`), the Engine enforces a strict **Coordination Tax** whenever data crosses a Boundary.

- **Intra-node execution (House internal):** 100% of compute goes to task generation.
- **Inter-node execution (Neighborhood routing):** The engine subtracts a 20-30% `COORDINATION_TAX`. 

*Developer Implementation:*
```python
def route_payload(sender_node, receiver_node, payload):
    base_cost = payload.compute_weight
    
    if sender_node.parent_id == receiver_node.parent_id:
        # Same neighborhood, moderate tax
        final_cost = base_cost * 1.25 
    else:
        # Different city, heavy tax (routing through clearinghouses)
        final_cost = base_cost * 1.40
        
    sender_node.deduct_compute(final_cost)
```

## 3. Atomic Delivery vs. Payment (DvP)
The Engine never allows partial state updates between two sovereign nodes. 
To exchange data or money, the Engine uses a 2-Phase Commit mechanism.

1. **Lock:** Sender locks Liquidity. Receiver locks Compute.
2. **Transfer:** The Payload is exchanged.
3. **Verify:** Both nodes cryptographically verify the payload.
4. **Settle or Revert:** If valid, the locks finalize. If invalid (due to Epistemic Decay causing a hallucinated contract), the locks revert. *However, the Compute spent verifying the transaction is permanently burned.*

This creates the core gameplay loop: The player must balance their Epistemic Decay against the Compute cost of verification. Check too often, and you burn all your compute on pinging the network. Check too rarely, and you burn all your compute on failed, reverted transactions due to outdated assumptions.
