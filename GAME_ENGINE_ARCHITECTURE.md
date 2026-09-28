# The Agentic Economy: Game Engine Architecture

## 1. Vision & Core Paradigm
This document outlines the underlying "Context Engine" required to build the Agentic Economy Simulation. Unlike traditional city-builders (where entities follow hardcoded behavior trees and share immediate global state), this engine simulates an economy of **autonomous, LLM-backed (or statistically modeled) agents** operating under strict boundaries of computation, privacy, and verification.

The game is a multi-scale fractal. Whether the player is zoomed into a single room or out to the planetary orbit, the mechanical ruleset remains identical.

### The Golden Invariant (The Fractal Rule)
At every single level of zoom, the engine enforces the following invariant:
1. **Parallel Encapsulation**: Entities draft work in private. They do not share a global state.
2. **The Oak Table (Local Truth)**: State is strictly local to the bounded environment.
3. **The Gate (Verification)**: State transitions only occur when crossing a threshold (The Door).
4. **Sovereignty**: Irreversible commits require authorization (a human click, a cryptographic proof, or a smart contract stop-line).

---

## 2. Engine Substrate: The "Context Engine"

Instead of a traditional `tick()` loop updating global physics and logic simultaneously, this engine operates an **Asynchronous State Machine** modeled on mempools and block verification.

### 2.1 The Resource Mechanics
The economy does not run on gold or wood; it runs on **Compute, Truth, and Liquidity**.
* **Compute (FLOPs / Tokens / Joules)**: The energy required to think. Every agent action burns Compute. If the Purse is empty, the agent halts.
* **Truth (Epistemic Drift)**: The accuracy of an agent's internal model of the world. As agents act on outdated cached context, their Epistemic Drift increases. The only way to reset Truth is to sync with the "Oak Table" (local shared context) or pay for external verification.
* **Liquidity**: The ability to settle debts atomically.

### 2.2 The Tick Architecture (The Block Loop)
The game loop is broken into four distinct phases per "tick" (which scales temporally depending on zoom level):

1. **Draft Phase (Off-chain)**: Agents compute independently. They consume local compute budgets. They generate a "Proposed State Change" (a draft, a bid, a transaction). *Mechanically: This is calculated asynchronously in parallel.*
2. **Propose Phase (The Courier)**: Agents submit their proposals to the boundary (The Door, The Letter Slot, The Clearinghouse).
3. **Verification Phase (The Gate)**: The boundary evaluates the proposal. 
   * *Stage 1 (House)*: The game pauses and waits for the Player to click "Approve" (Human Sovereignty).
   * *Stage 5 (World)*: The engine runs a simulated STARK verification (Zero-Knowledge Proof check taking 8 seconds).
4. **Commit Phase (State Transition)**: If verified, the global state for that specific boundary is updated. If rejected, the compute burned during the Draft Phase is lost (Sunk Cost).

---

## 3. The Fractal Data Model (Entity Component System)

To support seamless zooming (from House to World), the engine uses a nested Entity-Component-System (ECS). A Node at Stage *N* becomes an encapsulated cluster of sub-nodes at Stage *N-1*.

### Stage 1: The House (The Room)
* **Nodes**: Specialized Agents (e.g., *Scribble* the drafter, *Scout* the researcher).
* **Edges**: Context Tokens shared on the *Oak Table*.
* **The Gate**: *The Door*. Manned by *The Porter*.
* **Mechanic**: Pure Human-in-the-Loop. The player manually manages the Purse and approves the Porter's ledger.

### Stage 2: The Neighborhood (The Street)
* **Nodes**: Houses (Stage 1 instances abstracted into single actors).
* **Edges**: Physical Couriers on the street. 
* **The Gate**: *The Letter Slot*.
* **Mechanic**: Atomic Delivery-vs-Payment (DvP). A courier swaps an envelope of data for a payment token simultaneously. If one fails, both revert. Houses *never* see each other's internal variables.

### Stage 3: The City (Utilities & Foundries)
* **Nodes**: Neighborhoods, Municipal Foundries (Wholesale compute generators).
* **Edges**: High-bandwidth fiber (Compute distribution) and *Penny’s Automated Liquidity Sweeps*.
* **The Gate**: The Municipal Clearinghouse.
* **Mechanic**: Batching and Netting. Instead of atomic DvP for every action, thousands of neighborhood actions are netted against each other at the end of the day.

### Stage 4: The Country (Sovereign Ballast)
* **Nodes**: Cities, Central Bank, High Court.
* **Edges**: Three-tier money rails (Stablecoins, Tokenized Deposits, CBDC).
* **The Gate**: Statutory Law (Stop-lines).
* **Mechanic**: Dispute Resolution and Slashing. If an agent at a lower level commits fraud, the High Court executes a state-level rollback or seizes collateral.

### Stage 5: The World (The Cryptographic World Computer)
* **Nodes**: Countries / Continental Data Centers.
* **Edges**: 24/7 Cross-border Liquidity Rails and Sun-following energy grids.
* **The Gate**: Recursive STARK Verifiers.
* **Mechanic**: Mathematical absolute truth. Trustless settlement across hostile boundaries. 

---

## 4. UI / Representation Hooks for the Developer

While the frontend handles the visual hex grids and isometric 3D models, the backend Context Engine must expose specific data streams for the UI to render:

### 4.1 Abstraction Rendering (Level of Detail)
The Engine must *not* simulate every Stage 1 action when the player is zoomed out to Stage 5. 
* **Macro-Tick Approximation**: When zoomed out, the engine switches to statistical approximations for lower levels. The output of a City is modeled as a stochastic function of its aggregated Compute Burn and Epistemic Drift, rather than simulating 10,000 individual couriers.
* **Seamless Zoom-In**: When the player zooms into a specific Neighborhood, the Engine unpacks the statistical state into a deterministic Stage 2 simulation, spawning individual couriers based on the macro-variables.

### 4.2 Visualizing "The Invisible"
The UI developer will need endpoints from this engine to draw:
* **Compute Burn**: Visualized as heat, exhaust, or battery drain at the Node level.
* **Epistemic Drift**: Visualized as a "Fog of War", static, or visual corruption around an agent's avatar when they haven't synced with the Oak Table recently.
* **Verification Pulses**: Visualized as sweeping radar lines (STARK proofs at Stage 5) or physical handshakes (Stage 2 DvP).

---

## 5. Summary of Core Developer Tasks

To bring this architecture to life, the development team must build:
1. **The Parallel Node Runtime**: A system allowing thousands of nodes to execute their "Draft Phases" without locking the main thread.
2. **The Boundary Gateways**: Strict API interfaces representing the Doors, Letter Slots, and Clearinghouses. A Node cannot access another Node's memory directly under *any* circumstances.
3. **The Epistemic Decay Algorithm**: A core mathematical model that degrades the quality of an agent's output the longer it goes without syncing to a verified state.
4. **The Zoom Aggregator**: The LOD (Level of Detail) engine that summarizes thousands of Stage 1 House states into a single Stage 3 City metric, and vice versa.

*End of Architecture Document. Hand this directly to the Game Engine Developer.*
