# 03. FRACTAL SCALING & LEVEL OF DETAIL (LOD) MECHANICS

## 1. The Scaling Problem
Simulating an entire world (Stage 5) down to the individual thoughts of a single house's internal scribe (Stage 1) requires an O(10^9) computational burden per tick. This will instantly crash any game engine. 

To solve this, the engine employs **Fractal Level of Detail (LOD) Data Aggregation**. Just as 3D graphics engines swap high-poly meshes for low-poly blobs at a distance, the Agentic Engine swaps discrete agent execution for stochastic statistical modeling at scale.

## 2. The Zoom Thresholds

### Active Simulation vs. Stasis Simulation
At any given moment, the player's camera defines the **Active Scale**. 
- If the player is at Stage 3 (The City), the engine fully simulates the City Nodes and their immediate child Neighborhood Nodes (Stage 2).
- The Houses (Stage 1) inside those Neighborhoods are placed in **Statistical Stasis**.
- The Country (Stage 4) above the City is treated as a **Stochastic Environment Generator** (providing weather, macro-economic rates, and randomized API latency).

### Packing and Unpacking Nodes

#### Zooming OUT (Packing: Stage 1 -> Stage 2)
When the player zooms out from a Neighborhood, the engine stops executing the discrete Asynchronous State Machine for the individual Houses.
1. The Engine triggers a `PackNode()` function on all 20 houses.
2. The House's final explicit `compute_reserves` and `epistemic_confidence` are recorded.
3. The Neighborhood Node calculates an aggregate Vector representing the street's total economic output and volatility.
4. During subsequent ticks, the Neighborhood Node uses a Monte Carlo simulation based on those Vectors to generate macro-outputs, rather than running 20 individual House LLMs.

#### Zooming IN (Unpacking: Stage 2 -> Stage 1)
When the player clicks on a Neighborhood to zoom into the Houses:
1. The Engine triggers `UnpackNode()`.
2. The engine calculates how many macro-ticks occurred while the houses were in Stasis.
3. It retroactively distributes the aggregated compute burn and liquidity shifts back down to the 20 Houses based on a deterministic seeded distribution.
4. The individual House ASM threads are spun back up.

## 3. Visual Representation of Scale

For the visual developer constructing the UI (e.g., in a Hex/Grid builder):

### Stage 1 Visuals (The House)
- **Geometry:** Interior cutaway (The Room).
- **Entities:** Individual agents (Avatars) moving between The Desk, The Purse, and The Door.
- **Animations:** 1:1 mapped to actual background compute execution.

### Stage 2 Visuals (The Neighborhood)
- **Geometry:** A street map showing 20-50 houses as single buildings.
- **Entities:** Couriers (little vehicles or drones) moving between properties.
- **Animations:** Triggered by `AtomicDvP` events on the Courier Event Bus.

### Stage 3 Visuals (The City)
- **Geometry:** Hex-grid zoning (like the reference screenshot). Large foundries, data centers, and the central clearinghouse.
- **Entities:** Batch transport lines (glowing tubes or highways) representing liquidity sweeps.
- **Animations:** Pulsing networks representing the End-of-Day clearing algorithms.

### Stage 4 Visuals (The Country)
- **Geometry:** Topographical maps showing cities as interconnected nodes.
- **Entities:** Regulatory boundary lines (The High Court).
- **Animations:** Broad sweeps of color representing the three-tier money flows (CBDC ballast settling).

### Stage 5 Visuals (The World)
- **Geometry:** Planetary sphere / Orbital view.
- **Entities:** Intercontinental fiber lines.
- **Animations:** Massive pulses representing the 8-32s global STARK verification beats. Sun/shadow maps showing energy arbitrage.

## 4. The Data Structures for Lod 

```typescript
// A packed state representation for O(1) processing at high scales
interface PackedStatisticalState {
    avg_compute_burn_rate: float;
    liquidity_velocity: float;
    epistemic_variance: float; 
    
    // Seed used to deterministically unpack the state when zoomed in
    stochastic_seed: string;
}

class MacroNode extends SovereignNode {
    is_packed: boolean;
    statistical_profile: PackedStatisticalState;
    
    tick() {
        if (this.is_packed) {
            // Do NOT execute child nodes.
            // Execute O(1) math function to update macro state.
            this.simulate_stochastically();
        } else {
            // Execute all child threads asynchronously.
            this.execute_children();
        }
    }
}
```
