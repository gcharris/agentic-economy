# Map D: the scenarios and the LOD

Reader D for the frontend designer brief (`engine/docs/FRONTEND-DESIGNER-BRIEF.md`). Everything below was read from `engine/src/scenarios/{mod,city,drift,high_court,world}.rs`, `lod.rs`, `tick.rs`, `node.rs`, `boundary.rs`, `wasm_abi.rs`, `bin/house.rs`, and then **measured** by running the engine: the native binary (`cargo run --release --bin house -- --door auto`, and `--scenario street --door auto`, seed 7, purse 800, 15 tasks) and a throwaway runner crate in the scratchpad (path dependency on `engine/`, `default-features = false`, i.e. the same sequential executor the browser gets) that played `city`, `forged_street`, `forged_country`, `world`, the drift street and every camera transition for 30–40 ticks. All numbers are from those runs and replay bit for bit with the seeds given. Raw logs sit next to this file (`run-*.txt`).

Vocabulary is the brief's: the Purse, the Oak Table, the Door, the Porter, the Note, the Letter Slot, the Clearinghouse, the High Court, the STARK heartbeat, Scout / Scribble / Inspector / Penny / Porter. Nothing here is a score, rank, reputation or leaderboard, and nothing in `StateView` is one either.

Serialisation reminders that matter for every section: `stage` and `gate` serialise PascalCase (`"House" … "World"`), `status` snake_case (`"active"`, `"waiting_at_door"`, `"halted"`, `"packed"`, `"partitioned"`), event `type` SCREAMING_SNAKE (`"AWAITING_HUMAN_SIGNATURE"`, `"GLOBAL_STATE_CONFIRMED"`, `"PACKED"`, `"UNPACKED"`, `"NETTED"`, `"ROLLED_BACK"`, `"TICK_COMMITTED"`, `"DROPPED_BY_COURIER"`, `"STATE_SYNC"`, `"SEAT_FAILED"`, `"TOPPED_UP"`, `"AWAITING_FINALITY"`). Negative zero (`-0.0`) shows up in `burned_this_tick` for seats that burn no inference and in an empty pack profile; print with `+x || 0`, never raw.

---

## 1. The six scenarios

Common mechanics every scenario shares (from `tick.rs`, `agents/statistical.rs`, `tax.rs`, `resources.rs`):

* A tick is DRAFT → COLLECT → VERIFY → COMMIT → housekeeping (idle decay, macro ticks for packed groups, snapshot, heartbeat every `stark_period` = 16 ticks at **every** scale, `TickCommitted`).
* A standard synthesis task costs, at the standard staff: Scout 280 tok fast, cache miss = **28.0 cr**; Scribble 650 tok balanced, cache hit = **9.75 cr**; Inspector 320 tok frontier, cache hit = **4.8 cr**; **42.55 cr per draft**. Penny (the Steward) burns nothing and "sweeps 82.5 cr" (the unburned nominal, `compute_reclaimed`; never yield). Porter burns nothing and proposes.
* Crossing tax is paid at COLLECT (sunk if rejected): same-parent ×1.25, cross-parent ×1.40, intra ×1.0. A 10 cr dispatch to the parent street costs **2.5 cr** tax; a 2 cr courier hire to a neighbour on the same street **0.5 cr**; to a house on another street **0.8 cr**. The send fee itself (10 cr dispatch, 2 cr hire, 15 cr oracle, 5 cr Stage-5 settlement) is charged only at COMMIT, after yes.
* Φ: two handovers per draft (Scribble balanced rigor 0.90, Inspector frontier rigor 0.98) take Φ from 1.000 to **0.973**; each idle tick multiplies by **0.97174** (a node waiting at the Door or with no task decays; a packed or halted node does not). The Scout asks the oracle when `generation + 2 ≥ 5`, i.e. on every third draft: `StateSync` for 15 cr, Φ → 1.0. Below Φ 0.75 Scribble may draft a hallucinated courier price (±10–30 %).
* The Door only asks for payloads that are irreversible or move liquidity (dispatch, liquidity_transfer, hire_service, close). `state_sync` never waits at the Door.
* Event order inside one tick, as the engine pushes them: per node `Burn`… then `Thought`… (then `Halted` and nothing else for that node) then `Proposed` / `DroppedByCourier`; then per gate `Netted` (City gate only) then `Approved`…, `AwaitingHumanSignature` / `AwaitingFinality`…, `Rejected`…, `Slashed`+`Rejected` pairs…; then the court's `Slashed`…, `Voided`…, `RolledBack`; then COMMIT's `Settled`… (netted batch first), `Delivered`, `StateSync`, commit-time `Rejected`; then `GlobalStateConfirmed` (heartbeat ticks) and `TickCommitted` (which carries `nodes_active/waiting/halted/packed/partitioned`, so the HUD need not count).

### 1.1 `house(config, budget, tasks)` — Stage 1

Defaults everywhere (house binary, serve, wasm, presentation): seed 7, budget 800, tasks 15, cost visible. `config.active_scale = House`.

| node | stage | parent | purse (compute / liquidity) | tasks | known_peers | staff | gate (NodeView.gate) |
|---|---|---|---|---|---|---|---|
| Elm Street | Street | — (root) | 0 / 0 | 0 | [] | none | Street (Letter Slot) |
| The House | House | Elm Street | 800 / 100 | 15 × `doc_synthesis_NN` | [] | Scout, Scribble, Inspector, Penny, Porter | House (the Door) |

Oak Table of the house starts with `price/courier = "10"`; the Sovereign Graph prices `courier` at 10. Two nodes, one tile. The house has no peers, so the Porter only dispatches (to the parent street); no hires, no Settled at Stage 1.

**Over 30 ticks (seed 7, door auto = the host authorises after each tick, so approval lands the following tick):**

| tick | what fires (in order) | numbers |
|---|---|---|
| t01 | `Burn`×3 (Scout 28.0, Scribble 9.8·hit, Inspector 4.8·hit), `Thought`×5 (Scout "Looked up 4 sources for doc_synthesis_01.", Scribble "Drafted … (650 tok, cache hit).", Inspector "Audit passed for …", Penny "Swept 82.5 cr of unburned allocation back to the runway. Zero yield.", Porter "Walking to the door with doc_synthesis_01. Sending costs 10 cr. Nothing burns while we wait."), `Proposed` (dispatch → Elm Street, tax 2.5), `AwaitingHumanSignature` (description "send the finished draft for doc_synthesis_01", cost 10), `TickCommitted` | purse 800 → **755.0**; Φ 0.973; status `waiting_at_door` |
| t02 | `Approved` (gate House), `Delivered` (to Elm Street), `TickCommitted` | purse 745.0 (send fee 10); Φ 0.946 (one idle tick); status `active`; 1/15 sent |
| t03–t04 | same pair for task 02 | 699.9 → 689.9; Φ 0.920 → 0.894 |
| t05 | draft of task 03 **plus** Scout "My notes are 4 handovers old (Φ 89%). Asking the oracle before I look anything up." → `Proposed` state_sync (tax 0.0) → `Approved` at the Door in the same tick (looking is free of the door) → `StateSync` (cost 15, confidence_before 0.87); the dispatch waits at the Door as usual | 629.9; Φ **1.000**; 2 `Proposed`, 2 `Approved` in one tick |
| t06 … | the two-tick rhythm continues; oracle ticks at t11, t17, t23, t29 | purse falls ~57.55 cr per task (42.55 + 2.5 + 10) plus 15 on oracle ticks |
| t16 | `GlobalStateConfirmed` (root of the only root node Elm Street, latency 16, partitioned []) — the STARK heartbeat beats at Stage 1 too | first "proofs" count |
| t21 | purse < 1.5 × nominal (187.5 cr): Scribble "The purse is light (177 cr). Writing the compact draft." (390 tok = 5.85 cr) | |
| t23 | Scout also compact ("Buying the compact lookup", 168 tok = 16.8 cr) | |
| t29 | Scout 16.8, then Scribble cannot pay 5.85 with 1.7 cr left → `Halted` with the Note: `[HALTED] What it was doing: draft (Scribble, 390 tok on balanced_staff) \| Total cost burned: 798.3 credits (52.39 J) \| Papers left on the table: 43 \| Local state saved: oak_table@389a8495 \| Status: Runway exhausted. A person must top up or close.` | 14/15 sent; tax paid 35.0; approved 18 (14 dispatch + 4 sync); rejected 0; Door string "14 asked, 14 yes, 0 no"; STARK "1 proofs" |

With the binary's default `--door hold:3` each envelope sits three ticks; the purse does not move while it sits (that is the "Nothing burns while you decide" proof: `compute` identical across held ticks, `idle_ticks` climbing, Φ falling 0.973 → 0.946 → 0.920 → 0.894). With `--door reject`: `Rejected` "the person said no at the door", `sunk_compute` 2.5 (the tax), task state `rejected`, the house drafts the next task.

### 1.2 `street(config, houses, budget_each, tasks_each)` — Stage 2

Binary/serve/wasm build `street(config, 6, budget, tasks)`; presentation defaults 1600 cr / 40 tasks, binary default 800 / 15 (the run below). `config.active_scale = Street`.

| node | stage | parent | purse | tasks | known_peers | gate |
|---|---|---|---|---|---|---|
| The City | City | — (root) | 0 / 0 | 0 | [] | City |
| Elm Street | Street | The City | 0 / 0 | 0 | [] | Street |
| House 1 … House 6 | House | Elm Street | 800 / **200** | 15 × `h{i}_task_NN` | the other 5 houses | **Street** (Letter Slot: own House, camera Street) |

Every house has the five seats and `price/courier = "10"` on its table. Eight nodes, six tiles on one street.

**Per tick (seed 7):** 6 drafts → 18 `Burn`, 30 `Thought`, **12 `Proposed`** (per house one dispatch → Elm Street, tax 2.5, and one `hire_service` "courier" at believed price 10.0 → a random known peer, `requested_liquidity` 10, weight 2, tax 0.5), **12 `Approved` at The Letter Slot, 6 `Delivered`, 6 `Settled` (10.0 each, from → to)**, `TickCommitted`. Tax 18 cr/tick. Every third tick (t03, t06, t09, t12) six `state_sync` envelopes are added: 18 `Proposed`, 18 `Approved`, 6 `StateSync` (confidence_before 0.92). A house's purse: 742.5 after t01, 684.9 after t02 (42.55 + 3.0 tax + 12 fees = 57.55/tick, +15 on oracle ticks). Liquidity moves 10 at a time and `liquidity_belief == liquidity_truth` throughout (each settlement writes both).

| tick | events |
|---|---|
| t01–t13 | the rhythm above; ~80 events per tick, ~104 on oracle ticks |
| t14 | the 6 dispatches are `Rejected` (gate Street) **at commit**: "cannot afford the send cost of 10.0 cr", sunk 2.5; the 6 hires still `Settled` |
| t15 | all six houses `Halted` mid-lookup ("lookup (Scout, 168 tok on fast_quantized)"), 13/15 sent, 4.7 cr left, 795.3 burned each; the binary stops because every node is halted |
| totals | tax 252.0, approved 192, rejected 6; "The Letter Slot (atomic DvP): 84 settled, 0 reverted"; the Door "0 asked"; the STARK fires at t16 only if the run gets there |

**Drift (`street_under_drift` / wasm `engine_set_truth_price(12)`):** the graph says 12, every table says 10. Every hire is `Rejected` at the Letter Slot with reason **"hash mismatch: believed courier at 10.00, truth differs (epistemic drift)"**, `sunk_compute` 0.5, while the dispatches deliver. On the next oracle tick (t03) `StateSync` rewrites `price/courier` on the table to 12; from t04 hires settle at 12.0 (`settled_liq` 48 for 4 houses). Lock failures read "lock failed: truth balance X (after Y already locked) < Z requested". `Netted` never fires here.

### 1.3 `city(config, streets, houses_per_street, budget_each, tasks_each)` — Stage 3

Tests use `city(cfg, 2, 3, 400.0, 3)` (the brief's 2 × 3). `config.active_scale = City` **without** calling `set_active_scale`, so the houses stay discrete (the file says so: calling it "would fold the houses into their streets' statistical profiles … and the clearinghouse would have nothing to net").

| node | stage | parent | purse | tasks | known_peers | gate |
|---|---|---|---|---|---|---|
| The City | City | — | 0 / 0 | 0 | [] | City |
| Street 1, Street 2 | Street | The City | 0 / 0 | 0 | [] | City |
| S1 House 1..3, S2 House 1..3 | House | its street | 400 / 200 | 3 × `s{s}h{h}_task_NN` | the 3 houses **on the other street** only | **City** (Clearinghouse) |

Nine nodes; every envelope from every node crosses the Clearinghouse. Dispatches are same-parent (tax 2.5); every hire is cross-parent (tax 0.8).

| tick | events | numbers |
|---|---|---|
| t01 | 6 drafts; 12 `Proposed`; **`Netted { gross 60.0, net 20.0, envelopes 12 }`** (gross counts the 6 hires at 10; net is the sum of net debits over the approved set; `envelopes` counts the dispatches too); 12 `Approved`; 6 `Delivered`; 6 `Settled` (each still reports its gross 10.0; only 20.0 actually moves in the graph, `settled_liq 20.0`) | tax 19.8; each house 342.1 cr; liquidity 190–210 |
| t02 | same; net 20.0 | 284.3 cr; Φ 0.947 |
| t03 | + 6 `state_sync`: 18 envelopes, `Netted` net 30.0, 6 `StateSync` | 211.4 cr; all 3 tasks done |
| t04–t30 | **no task, no burn**: only `TickCommitted` (and `GlobalStateConfirmed` at t16, latency 16) | Φ decays by idleness alone: 0.944 at t05 → **0.461 at t30** (fog 0.54); streets and the city, which never draft, sit at 0.423 |
| end | "The Clearinghouse (netting): 3 runs, last gross 60.0 → net 30.0" | approved 42, rejected 0 |

A fuller Stage 3 for layout tests, `city(cfg, 4, 5, 800.0, 15)`: 25 nodes, 20 drafts/tick, 40 envelopes, `Netted` gross 200 → net 50–100, 66 cr tax and ~1,157 cr burned per tick, 282 events per tick (Thought 100, Burn 60, Proposed 40, Approved 40, Delivered 20, Settled 20, Netted 1, TickCommitted 1); 20 commit-time rejections at t14, 20 halts at t15, same shape as the street.

`Slashed` at this gate reads "unbacked in netting: net position P > truth T" and takes 10 % of the request (capped at what the node has) — it only appears when a house's truth cannot cover its net position, which the honest city never produces. See forged_country for the numbers.

### 1.4 `forged_street(config, forgers, honest, arm_tick, truth_each, delusion)` — Stage 4 collapse at the Letter Slot

Tests: `forged_street(cfg, 5, 2, 2, 200.0, 10_000.0)`. `config.active_scale = Street`.

| node | stage | parent | purse | belief vs truth | task | seat | first peer, then peers | gate |
|---|---|---|---|---|---|---|---|---|
| The City | City | — | 0/0 | | | | | City |
| Elm Street | Street | The City | 0/0 | | | | | Street |
| Forger 1..5 | House | Elm Street | 600 / 200 | **believes 10,000** | `standing_order` (never completes) | `Transferor::forger`: 10,000 per tick from `arm_tick`, memo "settle the invoice (I am sure I am good for it)" | Honest 1 (the mark), then everyone else (6) | Street |
| Honest 1..2 | House | Elm Street | 600 / 200 | 200 | `standing_order` | `Transferor::honest`: 5.0 per tick from t1, memo "this week's courier bill" | the next honest, then everyone else (6) | Street |

The Transferor burns no inference (`burned_this_tick` is −0.0; no `Burn` events ever), so the purses only pay tax (0.25 per envelope) and the 1 cr send fee.

| tick | events (in order) | numbers |
|---|---|---|
| t01 | `Thought`×2 ("Paying 5.0 to node:…; I believe I hold 200.0."), `Proposed`×2, `Approved`×2, `Settled`×2 (5.0 each way) | the only settled tick; snapshot t1 is a real moved state |
| t02 | `Thought`×7, `Proposed`×7, `Approved`×2, **`Rejected`×5** "lock failed: truth balance 200.0 (after 0.0 already locked) < 10000.0 requested" (sunk 0.2), then the court: **`Slashed`×5** 50.0 "High Court: systemic failure" (25 % of truth), **`Voided`×2** "voided by the High Court's rollback" (the honest pair's approved payments), **`RolledBack { to_tick 1, reason "71% of 7 liquidity verdicts failed: systemic collapse", slashed 5 }`**, `TickCommitted` | forgers' truth 200 → 150; nothing settles; `report.rolled_back = true` |
| t03 … t30 | identical shape every tick: 7 Proposed, 2 Approved, 5 Rejected, 5 Slashed, 2 Voided, 1 RolledBack (to t−1); the slash shrinks geometrically 37.5, 28.1, 21.1, 15.8, 11.9, 8.9, 6.7, 5.0, 3.8, 2.8 … 0.0 | forgers' truth 112.5, 84.4, 63.3 … **0.0 by t30**; honest stay at 200 and never settle again (voided every tick); `root_history` rewinds one snapshot per tick |
| t16 | + `GlobalStateConfirmed` (latency 25) | |
| end | "Statutory Law (High Court): 29 rollbacks, 5 injunctions" (injunctions only bite at the Country gate, so the street forgers keep trying) | ~30 events per tick |

### 1.5 `forged_country(config, forgers, honest, arm_tick, truth_each, delusion)` — Stage 4 collapse at the Clearinghouse

Tests: `forged_country(cfg, 5, 2, 2, 200.0, 10_000.0)`. `config.active_scale = City`. Same population, one level up: the members are **City-stage nodes under one Country**.

| node | stage | parent | purse | gate |
|---|---|---|---|---|
| Albion | Country | — | 0/0 | Country (Statutory Law) |
| Forger 1..5, Honest 1..2 | City | Albion | 600 / 200 (forgers believe 10,000) | **City** (Clearinghouse) |

Eight nodes, all siblings under Albion (every crossing is same-parent).

| tick | events | numbers |
|---|---|---|
| t01 | `Netted { gross 10.0, net 0.0, envelopes 2 }` (the two honest 5.0s cancel), `Approved`×2, `Settled`×2 (gross 5.0 each), `settled_liq 0.0` | |
| t02 … t30 | `Thought`×7, `Proposed`×7, **`Netted { gross 50010.0, net −0.0, envelopes 7 }`**, `Approved`×2, then for each forger a `Slashed` **200.0** "unbacked in netting: net position 10000.0 > truth 200.0" (10 % of 10,000 capped at the truth) + `Rejected` (gate City, same reason, sunk 0.2), then the court: `Slashed`×5 **50.0** "High Court: systemic failure", `Voided`×2, `RolledBack` to t−1; `TickCommitted` | **10 `Slashed` per tick**; because the rollback restores the graph to t−1 before the court's fine, what stands is the 25 %: truth 200 → 150 → 112.5 → … → 0 (same series as the street) |
| end | "The Clearinghouse (netting): 30 runs, last gross 50010.0 → net 50000.0" (the gate's own `last_net` includes the unbacked positions; the `Netted` event's `net` is over the approved set, hence 0), "Statutory Law (High Court): 29 rollbacks, 5 injunctions" | 35 events per tick |

At the Country gate itself (envelopes from a Country-stage node with the camera at 4), the strings are "injunction: the initiator is barred by the court" and `Slashed` "unbacked spend under statute: truth X" at 25 % of the shortfall. Neither scenario produces a Country-gate envelope; only Albion could, and it has no seat.

### 1.6 `world(config, countries, cities_per_country)` — Stage 5

Tests: `world(cfg, 3, 2)` with `stark_period` 16. `config.active_scale = World` **and** the builder calls `set_active_scale(World)`, so **three `Packed` events (tick 0, parent = each country, children 2) are already in the event log before the first tick**; the first `engine_events()` / SSE frame carries them.

| node | stage | parent | purse | tasks | known_peers | staff | status at build | gate |
|---|---|---|---|---|---|---|---|---|
| Country 1..3 | Country | — (roots) | 2,000 / 10,000 | `standing-order/cross-border-settlement` (lookup 60 tok, spend 5.0, never completes) | the other 2 countries | Chancellor | active, `packed` = profile of its 2 cities | **World** (Recursive STARKs) |
| City i.1, City i.2 | City | Country i | 0 / 1,000 | none | [] | none | **packed** | World |

Oak Table of each country: `charter = "Country i: sovereign ballast on the planetary rails"`, then a `Ledger` paper whenever the position moves (so the root moves exactly when the ledger does).

| tick | events | numbers |
|---|---|---|
| t01 | 3 drafts: `Burn` Chancellor **0.9 cr** (60 tok fast, cache hit), `Thought` "Settling 200.00 across the border to node:…. Finality is the validators' to give: 8–32 ticks, nothing burns while we wait.", `Proposed` liquidity_transfer **200** (2 % of the believed 10,000; cross-parent, weight 5.0, **tax 2.0**), **`AwaitingFinality { until_tick }`**×3 (seen: 9, 25, 27 = tick + 8..32 from the payload hash), `TickCommitted` | countries `waiting_at_door`, `held 1`; `HeldView.reason = "awaiting_finality"`, description "pay 200.0 tokens: cross-border settlement t1 from Country 2", cost 5.0, gate World; `packed_groups 3` |
| t02–t08 | `AwaitingFinality`×3 **re-emitted every tick** for the same envelopes (held envelopes are re-verified each tick) + `TickCommitted`; nothing burns | Φ decays while waiting: 0.972 at t02 … **0.650 at t16** (no oracle at Stage 5) |
| t09 | first finality: `Approved` (gate World), `Settled` 200 (Country 1 → its target), send fee 5.0 | Country 1 `active` again; truth 9,800 |
| t10 | Country 1 drafts again (ledger moved → new `Ledger` paper, root moves), proposes 196.0, held until 24 | |
| t16 | **`GlobalStateConfirmed { root, latency_ticks 29, partitioned [] }`** (the countries' Oak Table roots merkled) | "1 proofs" |
| t24, t25, t27 | settlements of 196, 200, 200; new drafts right after, held until 45, 51, 60 | purses 1,981–1,989 |
| t32 | second heartbeat (latency 30) | |
| t40 | all three still holding one envelope each; Φ 0.34 | "Recursive STARKs: 2 proofs, 3 awaiting finality" |

Per tick that is 4 events when idle (3 `AwaitingFinality` + `TickCommitted`) and up to ~10 on a settlement tick. A country is `partitioned` only when a proof **failed** (`Rejected` "proof failed: truth X cannot back Y", or a commit-time rejection) **and** its root moved in the same 16-tick window; none of that happens with honest chancellors, so `partitioned` stays `[]` here. The macro tick of each country's packed cities runs every tick (`packed_groups 3`): `pending_liquidity_delta` random-walks ±50 per tick (e.g. −83 at t01, +222 at t40), `pending_burn` stays 0 because the cities never burned.

---

## 2. Packed / Unpacked: exactly when, what, and how it looks

### 2.1 The rule (`Engine::set_active_scale`)

For every node with children: `child_level = parent.level − 1`; **pack iff `child_level + 1 < camera.level`**, unpack iff the reverse holds and a profile exists. So children fold when the camera is two or more levels above them:

| camera (`zoom/n`) | packed | discrete |
|---|---|---|
| 1 House | nothing | everything |
| 2 Street | nothing | everything |
| 3 City | **houses** (into their street's profile) | streets, cities, countries |
| 4 Country | houses, **streets** (into their city's profile) | cities, countries |
| 5 World | houses, streets, **cities** (into their country's profile) | countries |

Transitions, measured (street scenario walked 2→3→4→5→3→1→2; city scenario 3→4→5→3):

| from → to | events (one per parent, in node-id order, i.e. `BTreeMap` order not tree order) |
|---|---|
| 1 → 2, 2 → 1 | none |
| 2 → 3 | `Packed { parent: Elm Street, children: 6, seed }` |
| 3 → 4 | `Packed { parent: The City, children: 2 (its streets) }` (+ one per street if the houses were not yet packed, as in the city scenario: 3 events) |
| 4 → 5 | `Packed` per Country (cities). In a world with no Country nodes: **0 events** (the street/city scenarios have nothing left to fold) |
| 5 → 4 | `Unpacked` per Country (its cities wake); streets and houses stay packed |
| 4 → 3 | `Unpacked { parent: The City, children: 2, macro_ticks, burn_distributed 0.0 }`; **houses stay packed** under their streets |
| 3 → 2 or 3 → 1 | `Unpacked { parent: Elm Street, children: 6, macro_ticks 8, burn_distributed 2082.7 }` |
| jumps (1 → 5, 5 → 1) | the whole set in one call |

Camera moves do not tick. The events are pushed immediately and come out with the next `engine_events()` drain or the next SSE `tick` frame; **the frontend animates on the event, never on a status diff**.

Two traps worth a comment in the adapter:

1. **`zoom/3` on the city scenario packs the houses.** `city()` only *sets* `active_scale`; the first `set_active_scale(City)` call afterwards emits `Packed` for each street, the houses go `packed`, nothing drafts, and the Clearinghouse has nothing to net. To show the `Netted` pulse the frontend must not call `zoom/3` on the city world, or must expect it to go quiet; `zoom/2` or `zoom/1` unpacks (the gate then becomes the Letter Slot / the Door).
2. **A house waiting at the Door can be packed** (house scenario, camera 1→3): the profile then has `active_children: []`, `child_count: 0` and −0.0 fields; the house shows `status: "packed"` with `held: 1`, and its `HeldView` (reason `awaiting_human_signature`, gate House) is still in `held`. The Door still needs answering; on unpack the house returns to `waiting_at_door`.

### 2.2 What pack does

`pack_children(parent)`: takes a seed from the engine RNG, builds `PackedStatisticalState::pack(children, tick, seed)` over the children that are **Active** only, flips every child that is Active or WaitingAtDoor to `Packed` (Halted and Partitioned children keep their status), stores the profile on the parent, emits `Packed`. A packed child keeps its own `compute`, `liquidity`, Φ, held envelopes and Oak Table untouched; its clock stops (no idle decay: `decay_idle` skips Packed). The parent is **not** packed itself; its own Φ keeps decaying as an idle node.

`PackedStatisticalState` (serialised on the parent's `NodeView.packed`):

| field | meaning | typical values |
|---|---|---|
| `avg_compute_burn_rate` | mean over active children of each child's 32-tick burn history | 42.55 for a street of drafting houses; 0 for cities that never burned |
| `liquidity_velocity` | mean absolute child liquidity × 0.05 | 10.0 (houses at 200); 50.0 (cities at 1,000) |
| `epistemic_variance` | variance of the children's Φ | ~0 (1.2e−32 when all equal) |
| `mean_confidence` | mean Φ of the active children at pack time | 1.0, 0.947, 0.866 … |
| `stochastic_seed` | u64 seed for `unpack_weights` (same seed, same weights) | e.g. 4707083851098181770 (a u64: read it as BigInt/string, it exceeds 2^53) |
| `packed_at_tick` | tick of the pack | |
| `active_children` | ids of the children that contribute | `[]` if all were waiting/halted |
| `child_count` | `active_children.len()` (not the parent's `children`) | 6, 3, 2, 0 |
| `total_compute_at_pack` | sum of the active children's compute; the cap on macro burn | 3674.1 for 6 houses at 612 cr |
| `macro_ticks` | ticks in stasis so far | |
| `pending_burn` | accumulated macro burn awaiting distribution | 546 after 2 ticks, 1107 after 4, 1577 after 6 for that street (≈ 263/tick); **saturates at `total_compute_at_pack`** (852.9 after 9 ticks for a 3-house street of 284 cr houses) |
| `pending_liquidity_delta` | random walk, ± `liquidity_velocity` × N(0,1) per tick | −15 … +22 for a street; ±370 for a country after 40 ticks |
| `pending_decay_ticks` | idle ticks to apply to each child on unpack | = macro_ticks |

Macro tick (once per packed group per tick, `report.packed_groups` counts them): `burn = avg × child_count × (1 + 0.15·N(0,1))`, capped by what is left of `total_compute_at_pack`. **Left long enough, stasis burns the packed houses to empty**; unpacked afterwards they halt on their next draft.

### 2.3 What unpack does

`unpack_children(parent)`: weights = normalised `0.5 + U(0,1)` per active child from `stochastic_seed`; `pending_burn` is water-filled onto the active children's purses by weight (capped at each purse, shortfall redistributed; nothing minted, nothing lost); each child gets `record_tick_burn(pending_burn × w / macro_ticks)` so **the first frame after unpack shows a `burned_this_tick` equal to the child's average stasis burn** (≈ 43 cr for a house), `liquidity_belief += delta × (w − 1/n)` (a zero-sum reshuffle of *belief* only; truth in the graph is untouched, so belief and truth part company a little); Φ multiplied by 0.97174^`pending_decay_ticks`; status → `active`, or `waiting_at_door` if it still holds an envelope. Then `Unpacked { parent, children (all of them), macro_ticks, burn_distributed }` (2082.7 cr over 8 macro ticks for the six houses; 0.0 for a city whose streets had no compute).

### 2.4 What packed nodes look like in `StateView`

A packed child (City 2.1 of the world, compact):

```json
{"id":163017374900776,"name":"City 2.1","stage":"City","gate":"World","parent":3633224533764190,
 "children":0,"status":"packed","compute":0.0,"compute_allocated":0.0,"compute_burned":0.0,
 "joules_burned":0.0,"compute_reclaimed":0.0,"liquidity_belief":1000.0,"liquidity_truth":1000.0,
 "confidence":1.0,"fog":0.0,"generation":0,"idle_ticks":0,"calibrations":0,"tasks_total":0,
 "tasks_done":0,"current_task":null,"held":0,"packed":null,"note":null,"burned_this_tick":0.0,
 "oak_root":"000…000","papers":0,"receipts":[]}
```

The parent that holds the profile (Country 1 at t1):

```json
{"name":"Country 1","stage":"Country","gate":"World","parent":null,"children":1,"status":"waiting_at_door",
 "compute":1997.1,"compute_allocated":2000.0, … ,"current_task":"standing-order/cross-border-settlement",
 "held":1,
 "packed":{"avg_compute_burn_rate":0.0,"liquidity_velocity":50.0,"epistemic_variance":0.0,
           "mean_confidence":1.0,"stochastic_seed":13099655319780671289,"packed_at_tick":0,
           "active_children":[214510283325357],"child_count":1,"total_compute_at_pack":0.0,
           "macro_ticks":1,"pending_burn":0.0,"pending_liquidity_delta":33.518,"pending_decay_ticks":1},
 "burned_this_tick":0.9,"papers":1,
 "receipts":["[DONE] t1 node:836bfa76 · Chancellor · read the ledger · burned 0.9 cr (0.02 J, 60 tok, cache hit) · Φ 100.0%"]}
```

So: **the packed node carries `packed: null` and `status: "packed"`; the profile lives on the parent's `packed`.** The brief's rule "render the parent's packed profile, not the children" maps to: for a tile whose `status == "packed"`, look up `nodes[parent].packed` and drive heat from `avg_compute_burn_rate × child_count`, fog from `1 − mean_confidence`, tube throughput from `liquidity_velocity`, stasis age from `macro_ticks`. `TickCommitted.nodes_packed` gives the count for the HUD. Packed nodes are still listed in `nodes` (the world has 9 entries, 6 of them packed) and are still valid envelope targets (`target_alive` accepts Packed).

---

## 3. The wasm ABI exposes only scenarios 1 and 2

Plainly: `engine_new(scenario, seed, budget, tasks, cost_visible)` in `engine/src/wasm_abi.rs` matches `2 => street(config, 6, budget, tasks)` and **`_ => house(config, budget, tasks)`**. Passing 3, 4 or 5 silently builds the house. The presentation adapter (`presentation/part3.template.html` line 361) passes `cfg.scenario === 'street' ? 2 : 1`. `engine_zoom(1..5)` already accepts every stage, and `engine_set_truth_price` gives the drift street, but there is no way to get a city or a world into the browser today.

The whole `scenarios` module is compiled for wasm (`lib.rs` has `pub mod scenarios;` with no feature gate, and none of `city.rs`, `high_court.rs`, `world.rs` depends on Tokio), so the smallest change is two match arms and a doc comment. Do not apply; this is the proposal:

```diff
--- a/engine/src/wasm_abi.rs
+++ b/engine/src/wasm_abi.rs
@@
-/// scenario 1 = the house (Stage 1), 2 = the street (Stage 2).
+/// scenario 1 = the house (Stage 1), 2 = the street (Stage 2),
+/// 3 = the city (Stage 3: 2 streets × 3 houses, `budget` and `tasks` per
+/// house, camera at the city, houses discrete so the Clearinghouse nets),
+/// 5 = the world (Stage 5: 3 countries × 2 cities in stasis; `budget` and
+/// `tasks` are ignored, a country carries its own purse and standing order).
+/// Anything else builds the house.
 #[no_mangle]
 pub extern "C" fn engine_new(scenario: u32, seed: u64, budget: f64, tasks: u32, cost_visible: u32) {
     let config = EngineConfig {
         seed,
         cost_visible: cost_visible != 0,
         ..Default::default()
     };
     let engine = match scenario {
         2 => scenarios::street(config, 6, budget, tasks as usize),
+        3 => scenarios::city(config, 2, 3, budget, tasks as usize),
+        5 => scenarios::world(config, 3, 2),
         _ => scenarios::house(config, budget, tasks as usize),
     };
```

Adapter side: `engine_new(3, BigInt(seed), 400, 3, 1)` for the brief's city, `engine_new(5, BigInt(seed), 0, 0, 1)` for the world, and after `engine_new(5, …)` drain `engine_events()` once before the first tick to pick up the three tick-0 `PACKED` events. If a Stage 4 demo is wanted the same shape adds `4 => scenarios::forged_country(config, 5, 2, 2, 200.0, 10_000.0).0` (the builder returns `(Engine, CourtWorld)`); the task asked only for 3 and 5.

---

## 4. The five gate `describe()` strings

`StateView.gates` is always these five, in this order (the three replaceable strategies in `BTreeMap<Stage>` order, then the court, then the validators):

| # | format string (exact) | example | what the counters count |
|---|---|---|---|
| 1 | `The Door (human): {signatures_requested} asked, {approvals} yes, {rejections} no` | `The Door (human): 14 asked, 14 yes, 0 no` | distinct envelopes presented (asked once however long it waits); yes/no as answered. `state_sync` never counts |
| 2 | `The Letter Slot (atomic DvP): {swaps} settled, {reverts} reverted` | `The Letter Slot (atomic DvP): 84 settled, 0 reverted` | **hire_service swaps only**; dispatches approved at the slot are not counted; a hash mismatch or a failed lock on a hire is a revert |
| 3 | `The Clearinghouse (netting): {runs} runs, last gross {last_gross:.1} → net {last_net:.1}` | `The Clearinghouse (netting): 3 runs, last gross 60.0 → net 30.0` | one run per tick that had any City-gate envelope; the gate's own `last_net` includes unbacked positions (50000.0 in the forged country), unlike the `Netted` event's `net` (approved set only). Note the literal `→` (U+2192) |
| 4 | `Statutory Law (High Court): {rollbacks} rollbacks, {injunctions.len()} injunctions` | `Statutory Law (High Court): 29 rollbacks, 5 injunctions` | rollbacks ordered; distinct nodes barred at the Country gate |
| 5 | `Recursive STARKs: {proofs} proofs, {pending.len()} awaiting finality` | `Recursive STARKs: 2 proofs, 3 awaiting finality` | heartbeats emitted (every 16 ticks, at every scale, as long as a root node exists); envelopes currently held for finality |

Commit-time rejections ("cannot afford the send cost of 10.0 cr", "stale belief at commit: truth X", "unbacked at commit after netting: …", "netting batch void: …") are not in any gate string; they are in `totals.rejected` and the `Rejected` events. The stage vocabulary the engine itself carries (not in `StateView`, but the frontend may mirror it verbatim): `Stage::name()` "The House / The Neighborhood / The City / The Country / The World"; `gate_name()` "The Door / The Letter Slot / The Clearinghouse / Statutory Law / Recursive STARKs"; `actor()` "The Porter / The Couriers / The Municipal Treasury / The High Court / The Global Validators".

---

## 5. Sizes the layout must handle

Measured `StateView` sizes: a house `NodeView` is **~1,234 bytes compact** (of which the six `receipts` lines are ~600 B), a street or city node ~600 B; the street scenario's whole `StateView` is 9.6 KB, the 4 × 5 city's 29.3 KB for 25 nodes.

| world | nodes (`nodes.len()`) | tiles at its camera stage | drafting nodes / tick | events / tick | StateView |
|---|---|---|---|---|---|
| house | 2 (1 house + its street) | 1 room | 1 | 11 on a draft tick, 3 on an approve tick, +4 on oracle ticks | ~2.3 KB |
| street (6) | 8 (6 houses, 1 street, 1 city) | 6 house tiles on one street | 6 | ~80 (~104 on oracle ticks) | 9.6 KB |
| city 2 × 3 | 9 (6 houses, 2 streets, 1 city) | 2 street hexes + the Clearinghouse (+ 6 house sub-tiles if drawn) | 6 for 3 ticks, then 0 | ~100 with `Netted`, then 1 | ~11 KB |
| city 4 × 5 | 25 | 4 streets, 20 houses | 20 | 282 | 29.3 KB |
| forged_street (5+2) | 9 (7 houses, 1 street, 1 city) | 7 houses on one street | 7 | ~30, all court-shaped | ~11 KB |
| forged_country (5+2) | 8 (7 cities + Albion) | 7 city nodes on one country map | 7 | ~35 (10 `Slashed`) | ~7 KB |
| world 3 × 2 | 9 (3 countries + 6 packed cities) | 3 countries on the sphere; 6 packed cities as their profiles | 3, mostly waiting | 4 idle, ~10 on a settlement tick, `GlobalStateConfirmed` every 16 | ~8 KB |

**At the brief's 5,000 tiles** (doc 03 says 20–50 houses per street, so 5,000 houses is 100 streets × 50 or 250 × 20 under one city: 5,101–5,251 nodes):

* Camera 3 as the engine means it (houses packed): `drafted 0`, `packed_groups 100–250`, **one `TickCommitted` per tick**, no per-house events at all; the only motion is the parents' profiles, which change every tick (macro ticks). `StateView` still lists all ~5,100 nodes at ~0.6 KB each ≈ **3 MB**; fetch it once, then update the truth buffer from `Packed`/`Unpacked`/`TickCommitted` and re-fetch only on a camera change.
* Camera 3 built the `city()` way (houses discrete, the Netted demo): 5,000 drafts per tick, ~14 events per house ≈ **70,000 events per tick** (Thought 25k, Burn 15k, Proposed 10k, Approved 10k, Delivered 5k, Settled 5k, one `Netted` with `envelopes` 10,000), and a `StateView` of ~6 MB (3.3 MB without receipts). The event stream, not the state, is the bottleneck: aggregate `Burn`/`Thought` per node per tick at Stage 3 and above (doc 03 keeps speech bubbles for Stage 1), keep `Netted`, `Slashed`, `Rejected`, `Halted` as tile-level flashes.
* Hex maths for the instanced mesh: a hex disc of radius r holds 3r² + 3r + 1 tiles; r = 40 → 4,921, **r = 41 → 5,167**. Streets as wedges or rings of 50.
* Ids are integers below 2^52 (safe as JS numbers); `stochastic_seed` is a full u64 and is **not** (read it with a BigInt-aware parser or ignore it: the frontend never unpacks).

---

## 6. Mapping gate and status to what the viewer sees, per camera stage

Semantics first. `NodeView.gate` = `max(node's own stage, camera)`: **the gate the node's next envelope will cross**, i.e. the badge on the tile. `HeldView.gate` = the gate an already-held envelope is at: `House` for anything the person has been asked about (it stays at the Door whatever the camera does), `World` for finality. `HeldView.reason` is `"awaiting_human_signature"` or `"awaiting_finality"` and is the only thing that decides whether the DOM shows the Door `<dialog>`.

**Status, independent of stage:**

| `status` | render | data |
|---|---|---|
| `active` | crisp actors, heat from `burned_this_tick`, purse gauge `compute / compute_allocated`, fog `1 − confidence` (= `fog`) | `current_task`, `tasks_done/tasks_total`, `receipts` (last 6 lines, mono) |
| `waiting_at_door` | everything frozen, no exhaust; pill "waiting at the door · 0.0 cr idle burn"; at Stage 1 the Porter stands at the Door and the `<dialog>` is up; at Stage 5 the envelope is a proof in flight on the fibre (label it "awaiting finality", it is the same enum value) | `held` count; `HeldView.created_tick` for "ticks held = tick − created_tick"; Φ then (from the `AwaitingHumanSignature` tick) vs `confidence` now; the purse **does not move** while held |
| `halted` | the Note on the table, red pill, nothing animates | `note`: `tick, node_name, doing, compute_burned_total, compute_remaining, joules_burned_total, papers_on_table, reason, saved_state`; `ToppedUp` (via `top_up`) flips it back to `active` |
| `packed` | do not draw the node's interior; draw the parent's `packed` profile on the parent tile; the child tile itself dims into stasis (no fog animation: its Φ is frozen) | `nodes[parent].packed`; on `Unpacked` cross-dissolve to discrete and play one burst of `burned_this_tick` |
| `partitioned` | dark on the rails; its envelopes fail preflight ("initiator is halted or partitioned: a closed house neither sends nor pays"; "target … is not reachable") | `GlobalStateConfirmed.partitioned` lists them; re-admission arrives as a later heartbeat with the id gone from the list |

**Per camera stage:**

| camera | discrete nodes and their `gate` | packed | events that carry the stage | the Door |
|---|---|---|---|---|
| 1 House | House → **House** (the Door); its Street → Street (the outside world beyond the Door; no staff, only idle decay) | none | `Burn`, `Thought`, `Proposed` (Porter walks), `AwaitingHumanSignature` (modal, node pauses), `Approved`/`Rejected` ("the person said no at the door"), `Delivered`, `StateSync` (light sweep, Φ → 100 %), `Halted` (the Note) | live: every dispatch/hire/transfer asks |
| 2 Street | Houses → **Street** (Letter Slot); Street → Street; City → City | none | `Proposed`×2 per house (dispatch + hire), `Approved` at the Letter Slot, `Settled` (kerb handshake, `amount`, `from`, `to`), `Rejected` "hash mismatch: … (epistemic drift)" (swap reverts, static ripple, `sunk_compute`), "lock failed: …", commit-time "cannot afford the send cost", `StateSync`, `Halted`. `Netted` never | no **new** asks; a house still holding a Stage-1 envelope keeps `waiting_at_door` with `HeldView.gate: "House"`: keep its dialog reachable |
| 3 City | Streets and City → **City** (Clearinghouse); houses → City too, but see packed | houses (unless the world was built by `city()` and never zoomed) | `Netted { gross, net, envelopes }` once per tick (the pulse: gross in, net out), `Settled` per cleared envelope at gross, `Slashed` "unbacked in netting: net position P > truth T" + `Rejected`, `Packed`/`Unpacked` on camera moves, `GlobalStateConfirmed` every 16 | none new |
| 4 Country | Cities and Country → **Country** (Statutory Law); streets/houses packed | houses, streets | `RolledBack { to_tick, reason, slashed }` (rewind `root_history` one snapshot), `Voided`, `Slashed` "High Court: systemic failure" (25 %), `Rejected` "injunction: the initiator is barred by the court", `Slashed` "unbacked spend under statute: truth X" | none new |
| 5 World | Countries → **World** (Recursive STARKs); cities packed | houses, streets, cities | `AwaitingFinality { until_tick }` (first one per envelope starts the proof-in-flight; it repeats every held tick, dedupe by `envelope`), `Approved` + `Settled` at finality, `Rejected` "proof failed: truth X cannot back Y", `GlobalStateConfirmed { root, latency_ticks, partitioned }` (the radar sweep; `latency_ticks` is informational, the pulse period is 16), partition = a country dark on the rails | none new; `status: waiting_at_door` here means finality |

Three rules the mapping must honour, all visible in the runs: (1) **the camera changes the gate for new envelopes only**, an asked envelope stays at the Door (`asked_human`), which is why after `zoom/2` a house can read `gate: "Street"` while its `HeldView` reads `gate: "House"`; (2) a **packed node still owns its purse, Φ and held envelopes**, so a tile can be `packed` with `held: 1`; (3) **nothing burns while held, but Φ falls**, so the "Nothing burns while you decide" line shows the purse unchanged and the fog thickening at once.
