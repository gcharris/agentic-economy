# Energetic Runway Experiments — Laboratory Results

**Location:** `/Users/gch2021/Dev/Multi-Asset Workflows`  
**Authority:** `LABORATORY.md` (Laboratory Mode)  
**Date:** 2026-09-27 15:22:38  

---

## Overview

This note records the empirical measurements from the three energetic runway experiments built inside this folder. The experiments test a model where:
1. The base particle is **the burn** (inference compute, energy, tokens).
2. The person sits outside the loop, sets the goal, allocates runway, and alone holds the permission to spend or close.
3. Sub-agents are staff seats (lookup, draft, check), not trading counterparties.
4. Runway exhaustion causes a clean halt with a preserved local state, not agent deletion.

---

## Experiment 1: Hunger as Compute Runway (Cost-Visible vs. Cost-Hidden)

**Setup:** Initial compute runway budget = **300.0 credits**. Target = 10 sequential tasks.  
- Three call tiers available: Compact (15 cost / 20 value), Standard (35 cost / 40 value), Exhaustive (90 cost / 50 value).
- **Condition 1A (Cost Visible):** The decision logic inspects remaining runway and candidate costs upfront.
- **Condition 1B (Cost Hidden):** The decision logic sees only the nominal value/appeal, oblivious to burn rate until the halt.

### Results

| Metric | Condition 1A: Cost Visible | Condition 1B: Cost Hidden | Difference |
| :--- | :--- | :--- | :--- |
| **Tasks Completed** | **10 / 10** | **3 / 10** | **+7 tasks (+233%)** |
| **Total Runway Burned** | 290.0 credits | 270.0 credits | Both burned within budget |
| **Runway Remaining** | 10.0 credits | 30.0 credits | Hidden had stranded 30 cr |
| **Total Value Delivered** | **340.0** | **150.0** | **+210.0 (+140%)** |
| **Efficiency (Value / Burn)** | **1.17** | **0.56** | Visible is 1.9x more efficient |
| **Halt Behavior** | Finished cleanly without halt | Halted at Task #4 (Runway exhausted) | Clean halt, logged plain line |

### Logged Output on Exhaustion (Condition 1B):
```text
[HALTED] What it was doing: Task #4 (Inference Request) | Total cost burned: 270.0 credits | Local state saved: local_saved_state.json | Status: Runway exhausted. A person must top up or close.
```
*Note:* Agent was preserved; state was saved to `local_saved_state.json` (not called the writing desk).

### Finding
Showing cost upfront fundamentally alters spending. When cost is hidden, the agent naively selects premium calls based on surface appeal, burning out after 3 calls with 70% of the workload left unattempted. When cost is visible, the agent paces its consumption, mixing Standard and Compact calls to complete 100% of the target workload while maintaining a reserve.

---

## Experiment 2: One Orchestrator vs. A Market of Jobs

**Setup:** Same total budget = **1,000.0 credits**. Target = 10 work items.  
Each item requires three sequential seats: `lookup` (20 cr), `draft` (50 cr), and `check` (30 cr). Direct job cost = 100.0 credits/item.
- **Version 2A (One Orchestrator / Staff Model):** One orchestrator pays direct job costs. Jobs do not pay each other and cannot spend. Direct data handoff.
- **Version 2B (Market of Jobs):** Jobs act as market counterparties charging each other for "coordination" (lookup-to-draft handoff: 15 cr; draft-to-check handoff: 20 cr; clearance fee: 10 cr; total coordination tax = 45 cr/item).

### Results

| Metric | Version 2A: One Orchestrator | Version 2B: Market of Jobs |
| :--- | :--- | :--- |
| **Work Items Completed** | **10 / 10** | **6 / 10** |
| **Budget Spent on Actual Jobs** | **1000.0 credits (100.0%)** | **670.0 credits (67.0%)** |
| **Budget Spent on "Coordination"** | **0.0 credits (0.0%)** | **305.0 credits (30.5%)** |
| **Unspent / Stranded Budget** | 0.0 credits | 25.0 credits |
| **Outcome Status** | All 10 items completed cleanly | Halted mid-way (Item #7 during check) |

*(Per instruction: No leaderboard or relative earnings score is generated for the individual seats).*

### Finding
The market mechanism imposes a direct 30.5% overhead tax on the same fixed budget. By allowing jobs to charge each other "coordination fees" to hand off data, 305 credits of energy were consumed purely on internal friction without producing an ounce of additional work product. As a result, the market ran out of runway at item 7, delivering 40% less completed work than the unified staff model.

---

## Experiment 3: A Door on Spend, Not on Looking

**Setup:** Total budget = **500.0 credits**. Target = 5 operational cycles.  
Each cycle has:
- `lookup` (15 cr): read/survey. No door, does not wait.
- `draft` (25 cr): drafting/assembly. No door, does not wait.
- `spend` (40 cr): external transfer/commit. **Waits for external flag `allowed` (default: `False`).**

### Results

| Metric | Scenario 3A: Flag Never Set | Scenario 3B: Flag Set After Fixed Delay |
| :--- | :--- | :--- |
| **Lookups/Drafts Executed** | 1 cycle (40.0 cr burned) | 5 cycles (200.0 cr burned) |
| **Budget Burned While Waiting** | **0.0 credits** | **0.0 credits** |
| **Allowed Spends Executed** | **0** | **5 (200.0 cr burned)** |
| **Spends Attempted Without Allowance** | **1 (Blocked at door)** | **5 (Held until flag set)** |
| **State Preservation** | Preserved in `local_saved_state.json` | Preserved across all delays |
| **Final Status** | Halted cleanly at Door (0 leakage) | All 5 cycles completed |

### Finding
This result is plain and boring in the best sense:
1. **Zero leakage while parked:** When spend is gated, cleanly parking the agent burns **0.0 credits** while awaiting human review. The delay does not destroy the work; the state sits safely in local storage.
2. **Looking remains fluid:** Lookups and drafts execute immediately without bothering the human operator, burning only the direct compute cost of reasoning.
3. **No skipped doors:** Gating irreversible spends did not require an autonomous bypass. The boundary between survey (open) and spend (gated) held firm.

---

## Summary of Findings

1. **Visibility alters burn:** Hiding compute costs leads to rapid, naive runway exhaustion. Making cost visible enables rational rationing and 2.3x more completed work.
2. **Inter-agent markets cannibalize budget:** Allowing sub-agent seats to charge each other for coordination burned nearly a third of the total budget on internal friction, stranding incomplete work.
3. **Clean gating has zero holding cost:** Gating spends behind an explicit human `allowed` flag incurs zero compute burn while waiting, preserving local state without needing to bypass the door for "velocity".
