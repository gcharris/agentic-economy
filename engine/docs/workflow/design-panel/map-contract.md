# Reader A · The engine contract, as serialised

Source of truth (as on disk after the `cargo fmt` pass of 2026-09-28; the reformat changed no wire shape, only serve's `404` for a decision on an envelope nobody holds is new): `engine/src/events.rs`, `tick.rs`, `node.rs`, `lod.rs`, `receipt.rs`, `hash.rs`, `ids.rs`, `wasm_abi.rs`, `bin/serve.rs`, `presentation/record_trace.mjs`, `presentation/part3.template.html`; every example below is copied from `presentation/trace.json` (engine `context-engine 0.1.0`, seed 7). The renderer draws only what is in `StateView` and the event stream. No score, rank, reputation or leaderboard exists in any of it (test `there_is_no_leaderboard`).

## 1. Types as serde emits them (TypeScript)

Serde rules that decide the wire shape, checked against the source:

| Rust | attribute | JSON |
|---|---|---|
| `Stage` (`#[repr(u8)]`, no `rename_all`) | variant name | `"House" \| "Street" \| "City" \| "Country" \| "World"` — a **string**, never the number |
| `NodeStatus` | `rename_all = "snake_case"` | `"active" \| "waiting_at_door" \| "halted" \| "packed" \| "partitioned"` |
| `HaltReason` | `tag = "kind", rename_all = "snake_case"` | `{"kind":"runway_exhausted","shortfall":11.8}` etc. |
| `EngineEvent` | `tag = "type", rename_all = "SCREAMING_SNAKE_CASE"` | `{"type":"BURN", …}` |
| `Hash32` | custom `Serialize` → `to_hex()` | 64 lowercase hex chars |
| `NodeId(u64)`, `EnvelopeId(u64)` | newtype, transparent | a JSON **number** |
| `Option<T>` | default | `null` or `T` |
| `(u64, String)` | tuple | `[4, "6f626a64"]` |
| `&'static str` (`executor`) | default | string |
| `ModelTier` | `snake_case` | `"fast_quantized" \| "balanced_staff" \| "frontier_deep"` (sent as a plain string in `Burn.tier`) |
| `Payload::kind()` | hand-written | `"liquidity_transfer" \| "dispatch" \| "hire_service" \| "state_sync" \| "close"` |

```ts
// ── scalars ──────────────────────────────────────────────────────────────
export type Stage = 'House' | 'Street' | 'City' | 'Country' | 'World';
export const STAGE_LEVEL: Record<Stage, 1 | 2 | 3 | 4 | 5> = { House: 1, Street: 2, City: 3, Country: 4, World: 5 };
export const GATE_NAME: Record<Stage, string> = { House: 'The Door', Street: 'The Letter Slot', City: 'The Clearinghouse', Country: 'Statutory Law', World: 'Recursive STARKs' };
export const STAGE_ACTOR: Record<Stage, string> = { House: 'The Porter', Street: 'The Couriers', City: 'The Municipal Treasury', Country: 'The High Court', World: 'The Global Validators' };

export type NodeStatus = 'active' | 'waiting_at_door' | 'halted' | 'packed' | 'partitioned';

/** 64 lowercase hex characters (SHA-256). e.g. "6f626a64f775d1531db56e1a1e01d430f213e62b593d4acf73d5f5c07aa2d54b" */
export type Hash32 = string;
/** First 8 hex chars of a Hash32; only in StateView.root_history. e.g. "6f626a64" */
export type HashShort = string;

/** u64 minted below 2^52 (largest in the trace: 3781345924436676). Safe as a JS number; post back as a decimal string / BigInt. */
export type NodeId = number;
export type EnvelopeId = number;

export type Seat = 'Scout' | 'Scribble' | 'Inspector' | 'Penny' | 'Porter' | 'engine' | (string & {});
export type ModelTier = 'fast_quantized' | 'balanced_staff' | 'frontier_deep';
export type PayloadKind = 'liquidity_transfer' | 'dispatch' | 'hire_service' | 'state_sync' | 'close';
export type HeldReason = 'awaiting_human_signature' | 'awaiting_finality';
export type Executor = 'sequential' | 'tokio-multi-thread';

// ── receipt.rs ───────────────────────────────────────────────────────────
export type HaltReason =
  | { kind: 'runway_exhausted'; shortfall: number }   // purse empty; top-up resumes the node
  | { kind: 'closed' }                                 // the person closed the week
  | { kind: 'slashed'; amount: number }                // the High Court seized reserves
  | { kind: 'partitioned' };                           // cut from the global rails

export interface Note {
  tick: number;
  node: NodeId;
  node_name: string;
  doing: string;                 // "lookup (Scout, 280 tok on fast_quantized)"
  compute_burned_total: number;
  compute_remaining: number;
  joules_burned_total: number;
  papers_on_table: number;
  reason: HaltReason;
  saved_state: string;           // "oak_table@7e70f463"
}

// ── lod.rs ───────────────────────────────────────────────────────────────
export interface PackedStatisticalState {
  avg_compute_burn_rate: number;
  liquidity_velocity: number;
  epistemic_variance: number;
  mean_confidence: number;
  stochastic_seed: number;       // full u64: may exceed 2^53, display only
  packed_at_tick: number;
  active_children: NodeId[];     // only the children that were `active` at pack time
  child_count: number;           // = active_children.length
  total_compute_at_pack: number;
  macro_ticks: number;
  pending_burn: number;
  pending_liquidity_delta: number;
  pending_decay_ticks: number;
}

// ── tick.rs (bottom) ─────────────────────────────────────────────────────
export interface NodeView {
  id: NodeId;
  name: string;                  // "The House", "House 2", "Elm Street", "The City", "S1 House 2"
  stage: Stage;
  gate: Stage;                   // max(node's own gate, state.active_scale)
  parent: NodeId | null;
  children: number;              // a COUNT, not ids (group nodes by `parent` to build the tree)
  status: NodeStatus;
  compute: number;
  compute_allocated: number;
  compute_burned: number;
  joules_burned: number;
  compute_reclaimed: number;
  liquidity_belief: number;
  liquidity_truth: number;
  confidence: number;            // Φ ∈ [0.05, 1]
  fog: number;                   // clamp(1 − Φ, 0, 1)
  generation: number;            // u32: handovers since last calibration
  idle_ticks: number;            // u64
  calibrations: number;          // u32
  tasks_total: number;
  tasks_done: number;
  current_task: string | null;   // "doc_synthesis_02", "h2_task_02", "s1h2_task_03"
  held: number;                  // envelopes held at this node's gate
  packed: PackedStatisticalState | null;
  note: Note | null;
  burned_this_tick: number;
  oak_root: Hash32;
  papers: number;
  receipts: string[];            // newest first, at most 6 (trace slices to 3), plain text lines
}

export interface HeldView {
  envelope: EnvelopeId;
  node: NodeId;
  node_name: string;
  description: string;           // Payload::describe(): "send the finished draft for doc_synthesis_01"
  cost: number;                  // the send fee (envelope.compute_weight)
  gate: Stage;                   // the envelope's own gate at mint time; House once the person was asked
  reason: HeldReason;            // "awaiting_finality" iff gate === 'World', else "awaiting_human_signature"
  created_tick: number;
}

export interface Totals {
  compute_burned: number;
  tax_paid: number;
  settled: number;
  slashed: number;
  approved: number;
  rejected: number;
  waiting: number;               // nodes with status waiting_at_door
  halted: number;                // nodes with status halted
}

export interface TickReport {
  tick: number;
  drafted: number;
  compute_burned: number;
  tax_paid: number;
  envelopes_minted: number;
  dropped_by_courier: number;
  approved: number;
  rejected: number;
  held: number;
  slashed: number;
  voided: number;
  settled_liquidity: number;
  halted: number;
  seat_failures: number;
  synced: number;
  root: Hash32;
  global_confirmed: boolean;
  rolled_back: boolean;
  packed_groups: number;
}

export interface StateView {
  tick: number;
  active_scale: Stage;
  root: Hash32;                  // Sovereign Graph root after this tick
  executor: Executor;
  nodes: NodeView[];             // BTreeMap order = ascending id, NOT creation order
  held: HeldView[];
  mempool: number;
  totals: Totals;
  gates: string[];               // 5 strings, fixed order: Door, Letter Slot, Clearinghouse, Statutory Law, Recursive STARKs
  last_report: TickReport | null; // null before the first tick
  root_history: [tick: number, root: HashShort][]; // newest first, ≤ 16
}

// ── EngineConfig (not on the wire; what engine_new / serve set) ──────────
export interface EngineConfig {
  seed: number;                  // u64; default 7
  cost_visible: boolean;         // default true
  active_scale: Stage;           // default 'House'
  snapshot_depth: number;        // default 64
  stark_period: number;          // default 16: GLOBAL_STATE_CONFIRMED every 16 ticks
  max_events_retained: number;   // default 4096
}

// ── the one interface (brief §4) ─────────────────────────────────────────
export interface Frame {
  tick: number;                  // = state.tick; 0 from wasm means "tick did not run"
  state: StateView;
  events: EngineEvent[];
  decisions?: TraceDecision[];   // recorded traces only
}
export type TraceDecision =
  | { tick: number; decision: 'approve'; envelope: EnvelopeId; description: string }
  | { tick: number; decision: 'truth_changed'; description: string };
```

Real examples (trace `house[3]`, tick 4):

```json
"node": { "id": 3781345924436676, "name": "The House", "stage": "House", "gate": "House", "parent": 3155115984088982, "children": 0, "status": "waiting_at_door", "compute": 754.95, "compute_allocated": 800, "compute_burned": 45.05, "joules_burned": 3.141, "compute_reclaimed": 82.45, "liquidity_belief": 100, "liquidity_truth": 100, "confidence": 0.892821453367653, "fog": 0.10717854663234705, "generation": 2, "idle_ticks": 3, "calibrations": 0, "tasks_total": 15, "tasks_done": 0, "current_task": "doc_synthesis_02", "held": 1, "packed": null, "note": null, "burned_this_tick": 0, "oak_root": "28e61b7fe904d78dd7f2ff2c4d52ab114d85c39791100772cfa2395d05fb1541", "papers": 3, "receipts": ["[DONE] t1 node:349952c4 · Inspector · audit · burned 4.8 cr (1.68 J, 320 tok, cache hit) · Φ 97.8%", "…"] }
"held": [{ "envelope": 3930624385311261, "node": 3781345924436676, "node_name": "The House", "description": "send the finished draft for doc_synthesis_01", "cost": 10, "gate": "House", "reason": "awaiting_human_signature", "created_tick": 1 }]
"gates": ["The Door (human): 1 asked, 0 yes, 0 no", "The Letter Slot (atomic DvP): 0 settled, 0 reverted", "The Clearinghouse (netting): 0 runs, last gross 0.0 → net 0.0", "Statutory Law (High Court): 0 rollbacks, 0 injunctions", "Recursive STARKs: 0 proofs, 0 awaiting finality"]
"root_history": [[4, "6f626a64"], [3, "6f626a64"]]
"note" (house_hidden_cost, t9): { "tick": 9, "node": 3781345924436676, "node_name": "The House", "doing": "lookup (Scout, 280 tok on fast_quantized)", "compute_burned_total": 283.8, "compute_remaining": 16.200000000000017, "joules_burned_total": 42.870000000000005, "papers_on_table": 12, "reason": { "kind": "runway_exhausted", "shortfall": 11.799999999999983 }, "saved_state": "oak_table@7e70f463" }
```

Street topology (trace `street[0]`): `The City` (stage City, gate City, parent null, children 1) → `Elm Street` (Street, parent = city, children 6) → `House 1..6` (stage House, **gate Street**, parent = street). House run: `Elm Street` (children 1) → `The House` (gate House).

## 2. `EngineEvent` as a discriminated union

```ts
export type EngineEvent =
  | { type: 'THOUGHT'; tick: number; node: NodeId; seat: Seat; text: string }
  | { type: 'BURN'; tick: number; node: NodeId; seat: Seat; credits: number; joules: number; tier: ModelTier; cache_hit: boolean }
  | { type: 'PROPOSED'; tick: number; envelope: EnvelopeId; from: NodeId; to: NodeId; kind: PayloadKind; requested_liquidity: number; tax_paid: number }
  | { type: 'DROPPED_BY_COURIER'; tick: number; from: NodeId; to: NodeId; reason: string }
  | { type: 'AWAITING_HUMAN_SIGNATURE'; tick: number; node: NodeId; envelope: EnvelopeId; description: string; cost: number }
  | { type: 'AWAITING_FINALITY'; tick: number; envelope: EnvelopeId; until_tick: number }
  | { type: 'APPROVED'; tick: number; envelope: EnvelopeId; gate: Stage }
  | { type: 'REJECTED'; tick: number; envelope: EnvelopeId; gate: Stage; reason: string; sunk_compute: number }
  | { type: 'SLASHED'; tick: number; node: NodeId; amount: number; reason: string }
  | { type: 'SETTLED'; tick: number; envelope: EnvelopeId; from: NodeId; to: NodeId; amount: number }
  | { type: 'DELIVERED'; tick: number; envelope: EnvelopeId; to: NodeId }
  | { type: 'STATE_SYNC'; tick: number; node: NodeId; cost: number; confidence_before: number }
  | { type: 'HALTED'; tick: number; node: NodeId; note: Note }
  | { type: 'SEAT_FAILED'; tick: number; node: NodeId }
  | { type: 'VOIDED'; tick: number; envelope: EnvelopeId; reason: string }
  | { type: 'TOPPED_UP'; tick: number; node: NodeId; credits: number }
  | { type: 'PACKED'; tick: number; parent: NodeId; children: number; seed: number /* full u64, display only */ }
  | { type: 'UNPACKED'; tick: number; parent: NodeId; children: number; macro_ticks: number; burn_distributed: number }
  | { type: 'NETTED'; tick: number; clearinghouse: Stage; gross: number; net: number; envelopes: number }
  | { type: 'ROLLED_BACK'; tick: number; to_tick: number; reason: string; slashed: number }
  | { type: 'GLOBAL_STATE_CONFIRMED'; tick: number; root: Hash32; latency_ticks: number; partitioned: NodeId[] }
  | { type: 'TICK_COMMITTED'; tick: number; root: Hash32; active_scale: Stage; nodes_active: number; nodes_waiting: number; nodes_halted: number; nodes_packed: number; nodes_partitioned: number };
```

Real examples from the trace:

```json
{"type":"BURN","tick":1,"node":3781345924436676,"seat":"Scout","credits":28,"joules":0.56,"tier":"fast_quantized","cache_hit":false}
{"type":"THOUGHT","tick":1,"node":3781345924436676,"seat":"Scout","text":"Looked up 4 sources for doc_synthesis_01."}
{"type":"PROPOSED","tick":1,"envelope":3930624385311261,"from":3781345924436676,"to":3155115984088982,"kind":"dispatch","requested_liquidity":0,"tax_paid":2.5}
{"type":"PROPOSED","tick":1,"envelope":1265856040825034,"from":273603042565826,"to":2438102915047933,"kind":"hire_service","requested_liquidity":10,"tax_paid":0.5}
{"type":"AWAITING_HUMAN_SIGNATURE","tick":1,"node":3781345924436676,"envelope":3930624385311261,"description":"send the finished draft for doc_synthesis_01","cost":10}
{"type":"APPROVED","tick":5,"envelope":3930624385311261,"gate":"House"}
{"type":"DELIVERED","tick":5,"envelope":3930624385311261,"to":3155115984088982}
{"type":"REJECTED","tick":7,"envelope":1781250340165327,"gate":"Street","reason":"hash mismatch: believed courier at 10.00, truth differs (epistemic drift)","sunk_compute":0.5}
{"type":"REJECTED","tick":11,"envelope":617390534776855,"gate":"House","reason":"cannot afford the send cost of 15.0 cr","sunk_compute":0}
{"type":"SETTLED","tick":1,"envelope":1265856040825034,"from":273603042565826,"to":2438102915047933,"amount":10}
{"type":"STATE_SYNC","tick":11,"node":3781345924436676,"cost":15,"confidence_before":0.7323945005604056}
{"type":"HALTED","tick":9,"node":3781345924436676,"note":{ …Note as above… }}
{"type":"GLOBAL_STATE_CONFIRMED","tick":16,"root":"7da22ff0ca1df4ebd9b9d0a32d760d7ddc841faab3babd4f808aa4da72494770","latency_ticks":32,"partitioned":[]}
{"type":"TICK_COMMITTED","tick":4,"root":"6f626a64f775d1531db56e1a1e01d430f213e62b593d4acf73d5f5c07aa2d54b","active_scale":"House","nodes_active":1,"nodes_waiting":1,"nodes_halted":0,"nodes_packed":0,"nodes_partitioned":0}
```

Not present in the shipped trace (house/street only) but emitted by the engine: `DROPPED_BY_COURIER`, `AWAITING_FINALITY`, `SLASHED`, `SEAT_FAILED`, `VOIDED`, `TOPPED_UP`, `PACKED`, `UNPACKED`, `NETTED`, `ROLLED_BACK`.

**Reason-string catalogue** (from `boundary.rs`/`tick.rs`; match by prefix, never by equality):

- `REJECTED.reason`: `hash mismatch: …` (Stage 2 stale price → the swap reverts), `lock failed: …`, `unbacked …`, `proof failed: …`, `the person said no at the door`, `cannot afford the send cost of N cr`, `stale belief at commit: truth N`, `injunction: the initiator is barred by the court`, `no such service: …`, `target … is not reachable`, `bad signature`, `payload hash does not match payload`, `initiator is halted or partitioned: …`, `netting batch void: …`, `unbacked at commit after netting: …`.
- `DROPPED_BY_COURIER.reason`: `unknown address: …`, `cannot afford the crossing tax of N cr`.
- `SLASHED.reason`: `unbacked in netting: …`, `unbacked spend under statute: …`, `High Court: systemic failure`. A `SLASHED` is always immediately followed by a `REJECTED` for the same envelope with the same reason.
- `VOIDED.reason`: `voided by the High Court's rollback`. `ROLLED_BACK.reason`: `N% of M liquidity verdicts failed: systemic collapse`.

**Order inside one tick** (Draft → Collect → Verify → Commit → housekeeping): per drafting node `BURN`×n then `THOUGHT`×n, then `HALTED` (runway) / `PROPOSED` / `DROPPED_BY_COURIER`; then Verify: `NETTED`, `APPROVED`, `AWAITING_HUMAN_SIGNATURE` / `AWAITING_FINALITY`, `REJECTED`, `SLASHED`+`REJECTED`, `SLASHED`/`VOIDED`/`ROLLED_BACK` (court); then Commit: `SETTLED`, `DELIVERED`, `STATE_SYNC`; then `GLOBAL_STATE_CONFIRMED` (only when `tick % stark_period == 0`, default every 16); **`TICK_COMMITTED` is always last** and is the frame boundary. `TOPPED_UP`, `HALTED{closed}`, `PACKED`, `UNPACKED` come from commands between ticks and appear at the head of the next drain.

## 3. The wasm exports

Build: `cd engine && cargo build --profile wasm --no-default-features --target wasm32-unknown-unknown` → `engine/target/wasm32-unknown-unknown/wasm/context_engine.wasm` (~354 KB, **zero imports**: `WebAssembly.instantiate(bytes, {})`). Also exports `memory`.

| export | signature (JS view) | notes |
|---|---|---|
| `engine_new(scenario: u32, seed: u64→BigInt, budget: f64, tasks: u32, cost_visible: u32)` | → void | `1` = `scenarios::house(config, budget, tasks)`; `2` = `scenarios::street(config, 6, budget, tasks)` (six houses, fixed); anything else = house. Calling again replaces the engine (reset). No city scenario here. |
| `engine_tick()` | → u64 (BigInt) | Runs one block. **Returns `0n` when the tick could not run** (a seat future that needs a reactor; never with the statistical seats). `Number()` it. |
| `engine_authorize(envelope: u64→BigInt)` | → u32 | `1` if the envelope was actually held at a door, else `0`. Takes effect at the next tick's Verify. |
| `engine_reject(envelope: u64→BigInt)` | → u32 | same |
| `engine_top_up(node: u64→BigInt, credits: f64)` | → void | Emits `TOPPED_UP`; resumes a node halted for `runway_exhausted` |
| `engine_zoom(stage: u32)` | → void | 1–5; others ignored. Packs/unpacks immediately (`PACKED`/`UNPACKED` in the next drain) |
| `engine_set_truth_price(price: f64)` | → void | `scenarios::move_truth(e, "courier", price)`: ground truth moves, every Oak Table still caches the old price |
| `engine_state()` | → u32 length | Writes `StateView` JSON (or `null` before `engine_new`) to the out buffer |
| `engine_events()` | → u32 length | Writes `EngineEvent[]` JSON and **drains** the log; a second call returns `[]` |
| `engine_out_ptr()` | → u32 pointer | Valid until the next call that writes the buffer |
| `engine_version()` | → u32 length | `"context-engine 0.1.0 (wasm32, sequential executor)"` |

Read-out recipe (verbatim from `record_trace.mjs` / part3 `Eng.read`):

```js
const { instance } = await WebAssembly.instantiate(bytes, {});
const x = instance.exports;
const read = (len) => new TextDecoder().decode(new Uint8Array(x.memory.buffer, x.engine_out_ptr(), len));
x.engine_new(1, 7n, 800, 15, 1);
const tick   = Number(x.engine_tick());            // 0 → no frame this call
const state  = JSON.parse(read(x.engine_state()));  // read immediately after the call that wrote
const events = JSON.parse(read(x.engine_events())); // drains; call exactly once per tick
x.engine_authorize(BigInt(state.held[0].envelope));
```

Always re-read `x.memory.buffer` after each call (memory growth detaches the old `ArrayBuffer`); call `engine_out_ptr()` after the writing call, not before. Run it in a Web Worker and post `Frame`s; the engine is single-threaded and thread-local, so one instance per worker.

## 4. `serve` (engine/src/bin/serve.rs)

`cargo run --release --bin serve -- --scenario house|street --budget 800 --tasks 15 --seed 7 --interval-ms 700 --port 8787` (`--port 0` picks a free port). Binds **127.0.0.1 only**; first stdout line is `listening on http://127.0.0.1:PORT`. One Tokio task owns the engine; commands are applied before their reply is sent, so a `GET /state` after the reply reflects them. Every response carries `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`, `Cache-Control: no-store`, `Connection: close` (except SSE). Request bodies are ignored; the query string is stripped.

| method | path | response |
|---|---|---|
| `OPTIONS` | any | `204`, CORS headers, `Access-Control-Max-Age: 86400` |
| `GET` | `/state` | `200 application/json` → `StateView` |
| `GET` | `/events` | `200 text/event-stream` (below) |
| `POST` | `/authorize/<envelope_id>` | `200 {"ok":true}` when a Door holds that envelope; **`404 {"ok":false,"error":"no envelope held with that id"}`** otherwise (ledger #33, current source); `400 {"ok":false,"error":"malformed envelope id"}` |
| `POST` | `/reject/<envelope_id>` | same shape (`200` held, `404` not held, `400` malformed) |
| `POST` | `/top-up/<node_id>/<credits>` | `200 {"ok":true}`; `404 {"ok":false,"error":"unknown node N"}`; `400` on bad id / non-finite / negative credits |
| `POST` | `/zoom/<1-5>` | `200 {"ok":true}`; `400 {"ok":false,"error":"malformed zoom level (1-5)"}` |
| `POST` | `/pause`, `/resume` | `200 {"ok":true}`; stops/restarts the tick clock; state and commands still answer; no event is emitted |
| `GET`/`POST` | other | `404 {"ok":false,"error":"no route for GET /x"}`; other methods `405` |
| any | engine task gone | `503 {"ok":false,"error":"engine gone"}` |

Ids in paths are decimal `u64` (`String(state.held[0].envelope)`); credits is an `f64` literal.

SSE wire format, exactly:

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
<CORS>
Connection: keep-alive

retry: 1000
event: hello
data: context-engine 0.1.0 (native, tokio-multi-thread executor, scenario house, seed 7)

event: tick
data: {"report":{…TickReport…},"events":[{…EngineEvent…},…]}

event: lagged
data: {"skipped":3}
```

- `hello` data is **plain text**, not JSON.
- `tick` data is `{ report: TickReport, events: EngineEvent[] }` — **no `state`**. To build a `Frame` from SSE, on each `tick` event do one `GET /state` (keyed to the tick, which satisfies "no per-frame polling"), then emit `{ tick: report.tick, state, events }`. The events for a tick are broadcast once; a subscriber that connects later never sees them.
- `lagged` arrives when the 64-message broadcast buffer overflowed for this client; the skipped ticks' events are gone (resync from `GET /state`).
- Use `EventSource` with `addEventListener('hello'|'tick'|'lagged', …)`; the default `message` listener never fires.

## 5. `trace.json` (presentation/record_trace.mjs)

```ts
interface Trace {
  version: string;                 // "context-engine 0.1.0 (wasm32, sequential executor)"
  house: Frame[];                  // 70 frames
  house_hidden_cost: Frame[];      // 9 frames (halts at t9, runway_exhausted)
  house_visible_cost: Frame[];     // 13 frames
  street: Frame[];                 // 30 frames
}
// Frame = { tick, state: StateView (each node's receipts sliced to 3), events: EngineEvent[], decisions: TraceDecision[] }
```

How each run was recorded (all seed 7, from the wasm build):

| key | `engine_new` | script |
|---|---|---|
| `house` | `(1, 7n, 800, 15, 1)` | up to 70 ticks; the person authorizes an envelope once `tick − created_tick ≥ 3`; stops when the house halts or `tasks_done === tasks_total` |
| `house_hidden_cost` | `(1, 7n, 300, 10, 0)` | authorize immediately (holdTicks 0), ≤ 60 ticks |
| `house_visible_cost` | `(1, 7n, 300, 10, 1)` | same, price visible |
| `street` | `(2, 7n, 1600, 40, 1)` | 30 ticks; before tick 7 `engine_set_truth_price(12)` |

Decision timing: the click is issued **after** frame `t` was captured, so it is recorded on frame `t+1`'s `decisions` with `tick: t`. In `house`: the Door opens at tick 1 (`AWAITING_HUMAN_SIGNATURE`, `held[0].created_tick = 1`), the recorded yes is issued after frame 4 (`decisions` on frame tick 5 = `[{tick:4, envelope:3930624385311261, decision:'approve', description:'send the finished draft for doc_synthesis_01'}]`), and frame 5 carries `APPROVED` + `DELIVERED`. Ticks 2–4 have only `TICK_COMMITTED` (the node waits, `burned_this_tick: 0`, `compute` unchanged at 754.95, Φ falling 0.95→0.89: that is the "Nothing burns while you decide" proof). In `street`: frame tick 7 carries `decisions: [{tick:7, decision:'truth_changed', description:'the courier now costs 12; every table still says 10'}]` and the first `REJECTED` `hash mismatch` events (six per tick for three ticks: the Letter Slot line goes `36 settled, 6 reverted` → `18 reverted`).

The headless acceptance test: replay `house`, assert the Door `<dialog>` is open on frames with tick 1–4 (`state.held.length > 0`), closed from tick 5.

Rebuild: `cd engine && cargo build --profile wasm --no-default-features --target wasm32-unknown-unknown && cd ../presentation && node record_trace.mjs ../engine/target/wasm32-unknown-unknown/wasm/context_engine.wasm trace.json`.

## 6. What each `NodeView` field means to a renderer, and event → animation

| field | render as |
|---|---|
| `id` | identity for instancing and event joins (`e.node`, `e.from`, `e.to`, `held[].node`, `PACKED.parent`); never shown raw except `node:` + low 32 bits in hex (`short()` in part3) |
| `name` | label |
| `stage` | which geometry kit (1 House … 5 World) |
| `gate` | which gate this node's *new* envelopes cross now (`GATE_NAME[gate]`); changes when the camera zooms |
| `parent` / `children` | tree edges (group by `parent`); `children` is a count for the packed pill ("N children in stasis") |
| `status` | the pill: `active`, `waiting_at_door` ("0.0 cr idle burn"), `halted` (show `note`), `packed` (render the parent's `packed` profile instead of this node), `partitioned` (dark on the rails) |
| `compute` / `compute_allocated` | the Purse gauge = `compute / compute_allocated` |
| `compute_burned`, `joules_burned` | the receipt totals ("burned 45.1 · 3.14 J") |
| `compute_reclaimed` | Penny's sweep total (bookkeeping, never yield) — a small ledger line, not a gauge |
| `liquidity_belief` vs `liquidity_truth` | what the Oak Table thinks vs what the Sovereign Graph holds; show both, the gap is drift; never compute from them |
| `confidence` | Φ ∈ [0.05, 1]: crispness |
| `fog` | `1 − Φ`: noise amplitude on the tile/room; 0 = crisp |
| `generation` | handovers since the last oracle ("2 handovers") |
| `idle_ticks` | ticks the node has watched the world without drafting (rises while waiting at the Door) |
| `calibrations` | oracle calls paid ("1 oracle call") |
| `tasks_total` / `tasks_done` | the week's progress ("3/15 sent") |
| `current_task` | what the seats are on; `null` = no task, no thread, no burn |
| `held` | count of envelopes at this node's gate (`state.held` has the details) |
| `packed` | non-null on a **parent** whose children are folded: draw the statistical profile (mean Φ, avg burn, `child_count`) over the parent's tile |
| `note` | non-null while halted: the Note on the table (`Note.to_plain_line` format is in part3's `noteLine`) |
| `burned_this_tick` | heat/exhaust intensity this tick; 0 while waiting, halted or packed; only nodes with seats ever burn |
| `oak_root` | the table's Merkle root (mono, first 8 chars in the HUD) |
| `papers` | papers on the Oak Table (never their contents to other nodes) |
| `receipts` | newest-first plain-text lines for the receipt strip |

Event → animation, per the brief's table:

| stage | event | animation | join key |
|---|---|---|---|
| 1 House | `BURN` | heat/exhaust at the seat `e.seat`, scaled by `credits`; `cache_hit` cooler; `tier` picks the model glyph | `node`, `seat` |
| 1 | `THOUGHT` | speech bubble at `seat` with `text` | `node`, `seat` |
| 1 | `PROPOSED` | the Porter walks the envelope to the Door; `kind` chooses the envelope glyph; `tax_paid` is the stamp | `from` → `to`, `envelope` |
| 1 | `AWAITING_HUMAN_SIGNATURE` | open the Door `<dialog>` (cost, description, "Nothing burns while you decide"); the whole node pauses. Fires **once** per envelope; keep the dialog open while `state.held` still lists it | `envelope`, `node` |
| 1 | `APPROVED` / `REJECTED` | the Door opens / the envelope burns on the step with `sunk_compute` | `envelope` |
| 1 | `DELIVERED` | the envelope arrives at `to` (the only cross-node write) | `envelope`, `to` |
| 1 | `STATE_SYNC` | cascading light sweep on `node`; fog resets from `confidence_before` to 1.0; `cost` leaves the purse | `node` |
| 1 | `HALTED` | the Note lands on the table; pill → halted; show the top-up affordance when `note.reason.kind === 'runway_exhausted'` | `node` |
| 1 | `TOPPED_UP` | coins into the Purse; the note lifts | `node` |
| 2 Street | `SETTLED` | atomic handshake at the kerb between `from` and `to`, `amount` | `envelope` |
| 2 | `REJECTED` with `reason.startsWith('hash mismatch')` | the swap reverts: a ripple of static at `gate` | `envelope` |
| 2 | `DROPPED_BY_COURIER` | the courier drops the letter between `from` and `to` | — |
| 3 City | `NETTED` | end-of-tick pulse through the Clearinghouse: `gross` in, `net` out, `envelopes` count | `clearinghouse` |
| 3 | `SLASHED` | reserves seized at `node` by `amount` | `node` |
| 4 Country | `ROLLED_BACK` | the whole graph rewinds to `to_tick` (visible unwind); `slashed` count | — |
| 4 | `VOIDED` | an approved envelope dissolves before commit | `envelope` |
| 5 World | `GLOBAL_STATE_CONFIRMED` | the STARK heartbeat: a sweeping radar line; `latency_ticks` (8–32) sets the sweep; `partitioned` countries go dark | `partitioned[]` |
| 5 | `AWAITING_FINALITY` | the envelope orbits until `until_tick` (`held[].reason === 'awaiting_finality'`) | `envelope` |
| any | `PACKED` / `UNPACKED` | children fold into / unfold from the parent's tile (cross-dissolve); never pack yourself | `parent` |
| any | `TICK_COMMITTED` | frame boundary; root ticker; the five counts for the HUD | — |
| any | `SEAT_FAILED` | a seat's chair tips; purse and table untouched | `node` |

## 7. Gotchas

1. **Ids are u64 as JSON numbers, minted below 2^52** (largest in the trace 3781345924436676 ≈ 2^51.7). Safe in a JS `number`; compare with `===`; post back as `String(id)` in serve paths and `BigInt(id)` to wasm. Do not `parseInt`/`parseFloat` through a float path or use them as float keys after arithmetic.
2. **`PACKED.seed` and `packed.stochastic_seed` are full u64** (`rng.next_u64()`), not bounded: they can exceed 2^53 and lose precision in `JSON.parse`. Display only (part3 shows `seed % 100000`); never round-trip them.
3. **`engine_tick()` returns `0n` when the tick could not run** (only a seat that awaits a network wake on the single-threaded host; never with the statistical staff). Treat 0 as "no frame": do not advance, do not read events.
4. **Events are drained on read.** wasm `engine_events()` empties the log; serve drains once per tick into the SSE broadcast. Read exactly once per tick, keep your own ring buffer, and never expect `GET /state` to carry events. A late SSE subscriber has no history; a `lagged` frame means events were lost for good.
5. **`gate` = `max(node.boundary_rules.gate, state.active_scale)`** with the order House < Street < City < Country < World (compare via `STAGE_LEVEL`). `set_active_scale` re-gates new envelopes *and* envelopes still waiting at a gate that the person has not yet been asked about (`e.gate = asked_human ? House : own.max(active_scale)`); an envelope already presented to the person stays at the Door (`held[].gate === 'House'`) whatever the camera does. Show both: the node's `gate` pill and the held envelope's own `gate`, and expect `held[].gate` to change on a zoom only for the un-asked ones.
6. **Held reasons** are exactly two strings, derived: `'awaiting_finality'` iff the envelope's gate is `World`, else `'awaiting_human_signature'` (a Stage 2 `AwaitingCounterparty` hold, if it ever surfaced, would carry the human label; none occur in the trace).
7. **`AWAITING_HUMAN_SIGNATURE` fires once per envelope** (the `asked_human` flag), not every tick. The Door's open/closed state must follow `state.held` presence; the event only starts the animation. Part3 dedupes announcements by envelope for the same reason.
8. **`waiting_at_door` is derived after Verify each tick**: `active` + any held envelope → `waiting_at_door`; held queue empty → back to `active`. While waiting: no draft, `burned_this_tick` 0, purse unchanged, **but Φ keeps decaying** (`decay_idle` runs for every non-halted, non-packed node that did not draft). That is why the Door's proof line reads "purse unchanged · Φ then → now".
9. **`TICK_COMMITTED` is always the last event of a tick** and ticks keep committing while a house waits (the pause is per node, not global). Use it as the frame boundary in streams; `nodes_*` counts there match `state.totals.waiting/halted`.
10. **`nodes[]` is in ascending-id order** (BTreeMap), not creation or stage order: "The City" can sit in the middle. Sort/group yourself; the order is deterministic per seed. `children` is a count; edges come from `parent`.
11. **`stage` and `gate` are strings** (`"House"`), despite `#[repr(u8)]`. Levels 1–5 are a lookup, not the JSON.
12. **`HeldView.cost`** is the send fee (`compute_weight`), while **`REJECTED.sunk_compute`** is only the crossing tax (`tax_paid`), not the drafting cost; the draft's credits are already in `compute_burned`.
13. **SSE `tick` frames have no state**: follow each with one `GET /state`. `hello` data is plain text. `Connection: close` on every non-SSE response (one request per TCP connection; fine for `fetch`).
14. **Commands are acknowledged before they act**: `/authorize` and `/reject` answer `200 {"ok":true}` only when the envelope is actually held (else `404 "no envelope held with that id"`; wasm returns `1`/`0` for the same check). Even on `200` the decision is only *recorded*; it is consumed at the next tick's Verify, so `APPROVED`/`DELIVERED` arrive in the next frame, and the Door must stay open until `state.held` no longer lists the envelope. While `/pause`d nothing advances, so a click at the Door shows no effect until `/resume`. A second click on the same envelope after the first was consumed gets a `404`: treat it as "already decided", not as an error dialog.
15. **`root_history` is newest-first** `[tick, 8-hex]` tuples (≤16); `root` and event roots are full 64-hex.
16. **Nullables**: `parent`, `current_task`, `packed`, `note`, `last_report` are `null`, not absent. `packed` lives on the **parent**; the folded children have `status: 'packed'` and stale numbers (render the parent's profile, not them).
17. **`burned_this_tick` is reset only for nodes with seats**; streets, cities and the world never burn (always 0). After `UNPACKED` it holds each child's share of the macro burn averaged over `macro_ticks`.
18. **Seats are staff, not traders**: `seat` values in the trace are `Scout`, `Scribble`, `Inspector`, `Penny`, `Porter`; the engine may also emit a `THOUGHT` with `seat: "engine"` (a misattribution notice). Do not assume the five are exhaustive.
19. **Floats are raw f64** (`16.200000000000017`): format on display, never compare for equality; `compute` never goes below 0 by construction.
20. **No city in wasm or serve today**: `engine_new` and `--scenario` accept only `house`/`street`; `scenarios::city(config, streets, houses_per_street, budget, tasks)` sets `active_scale = City` (house `gate` becomes `City`, the Clearinghouse nets) but is native-only. Deliverable 3 needs either a scenario code `3` added to `wasm_abi.rs`/`serve.rs` or a natively recorded trace; flag it rather than simulate.
21. **`serve` binds `127.0.0.1` with no TLS or auth**; a hosted deployment (Cloud Run or similar) needs a bind-address change and a front door. Out of the frontend's scope, but do not point a public page at it as is.
22. **The state view is deliberately leaderboard-free**; do not derive a ranking client-side either (brief §2, §7).
