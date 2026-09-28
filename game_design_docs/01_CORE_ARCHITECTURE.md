# 01. CORE ENGINE ARCHITECTURE & SYSTEM TOPOLOGY

## 1. System Overview
The Agentic Economy Engine is not a traditional Entity Component System (ECS) designed for rendering rigid physics grids. It is an **Asynchronous Agentic State Machine (AASM)** designed to handle massively parallel, non-deterministic state generation that only collapses into a shared global state at cryptographic or human-authorized boundaries.

The core challenge of this engine is implementing the "Oak Table" and "The Door" as strict technical boundaries, preventing O(n^2) communication explosions while maintaining strict data sovereignty.

## 2. Global Loop vs. Asynchronous Mempool
In a standard game (e.g., Cities: Skylines), a global `tick()` iterates over all entities, updating their state sequentially or via parallel ECS systems sharing a global memory bus. 

Here, **Global State does not exist by default.** 

### The Engine Tick Pipeline
The engine loop operates as a blockchain-inspired block-builder, resolving state in discrete Temporal Blocks:

1. **The Parallel Draft Phase (Off-Chain):** 
   - Entities (Houses, Neighborhoods, Cities) are spun up in isolated threads/WebWorkers.
   - Each entity consumes local compute (represented by the `compute_budget` float) to generate `ProposedStateTransitions`.
   - *Technical Constraint:* These threads have ZERO read/write access to the global engine state. They can only read from their local `OakTableCache`.

2. **The Mempool Collection Phase:**
   - Entities emit `ProposalEnvelopes` into a localized mempool. 
   - A `ProposalEnvelope` contains: `[Initiator_ID, Target_ID, Payload_Hash, Requested_Liquidity, Auth_Signature]`.

3. **The Boundary Verification Phase (The Gate):**
   - The engine iterates through the mempool and applies the Boundary Rules based on the scale of the interaction (See `05_VERIFICATION_BOUNDARIES.md`).
   - If the verification requires Human Input (Stage 1), the tick pauses for that specific boundary until user interrupt.

4. **The State Commit Phase:**
   - Validated envelopes are executed. 
   - The Global Object Graph (the visual layer) is updated.
   - Entity caches are invalidated based on Epistemic Decay logic.

## 3. Data Topologies

The system memory is divided into three tiers:

### A. The Sovereign Graph (Global Immutable State)
Stored as a highly optimized Directed Acyclic Graph (DAG) or Merkle Tree. This represents the *ground truth* of the simulation: who owns what, exact liquidity balances, and completed contracts. This state is read-only for agents.

### B. The Oak Table (Local Mutable State)
Each Node (e.g., A House) has a localized Key-Value store representing its Oak Table. 
- **Schema:** `Map<EntityID, LocalContext>`
- Only entities within the specific Node's boundary can read/write here. 
- *Crucially, The Oak Table decays.* See `02_ENTITY_STATE_MACHINE.md` for Epistemic Drift.

### C. The Courier Network (Message Passing)
To move data between Oak Tables, the engine uses an Event Bus (The Courier Network). Messages must conform strictly to `AtomicDvP` (Delivery vs. Payment) structs. If a message lacks the corresponding liquidity allocation, the Engine's Event Bus drops it before it reaches the destination node.

## 4. Empirical Scaling Constraints
Based on the `ael_experiment_results.json` battery:
- **Coordination Tax:** Every boundary crossing requires compute overhead. The engine must deduct an exact 20-30% `COORDINATION_TAX_MULTIPLIER` to account for formatting, translating, and verifying data across boundaries.
- **Truth Degradation:** To prevent endless free simulation, the engine enforces truth decay. If an agent does not sync with the Sovereign Graph, its `epistemic_confidence` drops to 56.4% over 20 temporal blocks, introducing deliberate noise/RNG into its outputs.

## 5. Technology Stack Recommendations
For the developer implementing this:
- **Core Engine Runtime:** Rust (Tokio for async agent execution) or Go (Goroutines for high-concurrency mempool processing).
- **State Representation:** A custom Merkle-DAG structure to allow fast O(1) state rollbacks when Stage 4 (High Court) stop-lines are triggered.
- **Frontend Bridging:** The backend emits Delta payloads via WebSockets to the WebGL/WebGPU frontend. The frontend should *only* render the Sovereign Graph, applying visual "Fog of War" shaders to represent Epistemic Drift.
