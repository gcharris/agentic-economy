# The Journaled Tick (keep Rust, make replay true)
angle: Invariant-first: Golden Invariant violations are compile errors, lint failures, or divergent root chains. The tick is a pure function of (state, journaled inputs); humans and models are inputs, never callers.

Keep the Rust scaffold at /Users/gch2021/Dev/Multi-Asset Workflows/engine: it already proves Law 1 by ownership, has one write path into the Sovereign Graph, passes 13 invariant tests, and type-checks for wasm32. Add the six things that turn "deterministic and replayable" from a test that passes on one laptop into a guarantee: integer money, libm for the two transcendental calls, an append-only journal that records every human decision and every LLM completion with the tick that admitted it, a persistent (structurally shared) graph for O(1) snapshot and rollback, per-tick deltas over WebSocket or the wasm ABI, and a Vault-backed inference layer with per-call receipts and a three-permit semaphore. Go and Node cannot express Law 1; a rewrite would have to rebuild the compile-time proof, the executor-parity test and the wasm build before reaching parity.

## stack
- **Language and runtime**: Rust stable (1.91.1 installed, MSRV 1.85), #![deny(unsafe_code)], crate-type rlib + cdylib
  why: Ownership is the only mainstream type system that proves Law 1: DraftContext is Send + 'static with no lifetime, so a draft cannot hold a reference to the engine, another node or the graph. The scaffold already encodes this as the GOLDEN_INVARIANT_LAW_1 constant.
- **Async and parallelism model**: tokio 1.53 (JoinSet) for households with LLM seats; rayon 1.12 par_iter for purely statistical households; Collect, Verify and Commit single-threaded over job order
  why: Draft is the only parallel phase and it is embarrassingly parallel by construction. I/O-bound model calls and CPU-bound statistical seats should not share a scheduler. Results return in job order, so the mempool is a sorted batch and arrival time never enters a result; the existing tokio-vs-sequential parity test must keep passing.
- **Engine actor and input admission**: One Engine owned by one task; authorize/reject/top_up/zoom arrive on tokio::sync::mpsc and are admitted at the start of the next tick
  why: Every outside input gets a tick number before it acts. That is what makes the tick a pure function and human decisions replayable.
- **State representation (Sovereign Graph)**: imbl 7.0 persistent OrdMap<NodeId, i64> with structural sharing, plus hash-chained blocks {parent(s), tick, state_root, ops_root}; LOD pack/unpack emit two-parent blocks
  why: O(1) snapshot (keep an Arc) and O(1) rollback (swap the Arc, truncate the chain). The scaffold clones the entire liquidity map every tick and restores it in O(N). Two-parent blocks at pack/unpack are what make it a DAG, not a chain.
- **Hashing**: blake3 1.8 (sha2 0.11 acceptable; the swap is one file, hash.rs)
  why: Several times faster than SHA-256 for a root computed every tick; SIMD on native, pure Rust on wasm; keyed mode for the simulated signatures.
- **Numerics and determinism**: i64 micro-credits for compute, i64 minor units for liquidity; libm 0.2 for exp, ln and cos; clippy disallowed_types (std HashMap) and disallowed_methods (f64 transcendental methods) in clippy.toml
  why: epistemics.rs and rng.rs call the platform libm on native and Rust's own port on wasm; a last-ulp difference changes a Merkle root. Money as floats with round()/100.0 and format!("{:.6}") inside Merkle leaves is the same hazard. Lints make the rule a build failure, not a review comment.
- **Serialization**: postcard 1.1 for canonical bytes, journal frames and the binary wire; serde_json 1.0 only for the HUD, receipts and notes
  why: postcard has a specified wire format and no map-ordering ambiguity; Payload::hash() moves off serde_json. JSON stays where a human reads it.
- **Persistence**: Append-only journal of postcard frames with crc32fast 1.5 per record, fsync per tick; periodic full snapshots and indices in redb 4.3
  why: Event-sourced by construction: Admitted{tick, command}, Completion{tick, node, seat, prompt_hash, text, tokens, request_id}, Snapshot{tick, root}. Replay from the last snapshot is bounded. Pure Rust, one file, nothing to operate.
- **Transport to the frontend**: axum 0.8 WebSocket (tokio-tungstenite 0.30 underneath): snapshot on connect, then one TickDelta per tick carrying changed node views (by view hash), drained events and changed held envelopes; postcard frames for WebGL, JSON for the debug HUD
  why: Doc 01 says the frontend renders only the Sovereign Graph and events. A dirty set maintained in Collect and Commit makes the payload proportional to what changed, not to the world. Packed children never ship.
- **LLM-agent integration**: reqwest 0.13 (rustls) VaultBackend against the estate's POST /api/v1/llm/review; tokio Semaphore(3); backon 1.6 bounded retry; budget reserved from the purse copy before submission and swept back by Penny; per-call CallReceipt with the Vault request_id; JournalBackend for replay
  why: The Vault returns 429 above roughly three parallel calls and caps max_tokens at 8192; the estate's spend-control rules require reservation before submission, bounded retries and no silent fallback to a dearer model. Every completion is journaled as an input so replay never touches the network. Anthropic and OpenAI are not on the Vault by the Director's choice, so no vendor SDK is named.
- **Deployment**: One static release binary per world (clap 4.6 CLI, tracing 0.1 + tracing-subscriber 0.3), engine actor and WebSocket server in one process; a container with the journal on a mounted volume for a hosted world
  why: No database server, no queue, no sidecar. The only operational object is a journal file. A hosted world needs a persistent volume, so a scale-to-zero platform must run with a minimum of one instance.
- **Browser and offline**: Same crate on wasm32-unknown-unknown with the existing raw C ABI (no wasm-bindgen), run in a Web Worker, TickDelta bytes over postMessage, journal in IndexedDB, wasm-opt on the size profile
  why: Offline first, single HTML file like the existing prototypes. Statistical seats run live; LLM-backed weeks recorded on the laptop replay bit-exactly in the browser because completions are journal entries. The Director key never reaches a browser.
- **Invariant verification**: proptest 1.11 for conservation laws (allocated == remaining + burned + reclaimed; graph liquidity conserved net of slashes); insta 1.48 snapshots of journals and root chains; wasmtime 49 in CI running the wasm build on the same seed and diffing root chains against native
  why: Cross-target determinism is otherwise an assertion. The diff job is the only thing that proves it.

## strengths
- Law 1 is a compile-time fact: DraftContext carries no borrow, so no draft can reach shared state; the scaffold's GOLDEN_INVARIANT_LAW_1 constant and law_1 test already exist.
- One write path into the Sovereign Graph (Engine::commit) and one cross-node write (delivery from an approved envelope); auditable by grepping for self.graph.
- Draft is parallel, Verify batches by gate (Stage 3 netting is already an O(N) verify_batch), and results return in job order, so the executor is provably not part of the result (tokio_executor_matches_sequential passes).
- Humans and models become journaled inputs with tick numbers; replay never calls the network or waits for a click, and a diverging root chain is a loud failure.
- O(1) snapshot and rollback through structural sharing replaces the per-tick full-map clone, so the High Court's rollback and the STARK heartbeat cost the same at Stage 5 as at Stage 1.
- One crate serves native, hosted and browser; the wasm build already type-checks and the C ABI already exists.
- The LLM layer matches the estate's real call path and spend-control rules (reservation before submission, three-wide concurrency, bounded retries, request_id provenance) instead of an imagined provider SDK.
- Every constant is traceable to the laboratory record (0.5636 after 20 handovers, 19.99% and 30.5% coordination tax, 15-credit oracle, 0.0-credit door holding), and the engine's own tests reproduce those numbers.

## risks
- Cross-target determinism is currently a claim, not a proof: epistemics.rs and rng.rs call exp, ln and cos through the platform libm, and money is f64 with rounding and formatted floats inside Merkle leaves. replay_is_exact runs both sides on the same machine and cannot see this. Steps 1-2 plus the wasmtime CI diff close it.
- Tick latency is bound to the slowest model call under in-tick await. Twenty houses with three LLM seats each is sixty calls a tick through a three-permit door, roughly twenty round trips. Cross-tick inference (a Thinking state that reserves rather than burns) is the second milestone and must be tested against the zero-idle-burn invariant.
- The Vault endpoint returns content and request_id but no usage counts, so LLM cost accounting is an estimate at 4 chars per token; statistical seats are exact. Receipts must say 'estimated' or the receipt is dressed.
- The browser cannot call the Vault without exposing the Director key. LLM-backed play is native-only; the browser replays recorded weeks. Good for the video, a limit for the product.
- imbl is a maintained fork of the dormant im crate with a smaller community; fallback is rpds 1.2 or keeping per-tick clones with a depth cap at O(N) rollback.
- Journal schema evolution has only a header version and a refusal to replay a mismatch; old journals are not migrated.
- A hosted world needs a persistent volume and a minimum of one instance; scale-to-zero platforms lose the journal unless it is on mounted or object storage.
- The whole-Sovereign-Graph Merkle root is still O(N) per tick until the incremental (delta-hashed) root lands; at Stage 5 sizes this is the next bottleneck after the map clone.

## write-up
# Backend stack proposal: the journaled tick

**Verdict.** Keep the Rust scaffold at `/Users/gch2021/Dev/Multi-Asset Workflows/engine`. It already proves Law 1 of the Golden Invariant at compile time (`DraftContext: Send + 'static` carries no borrow, so a draft cannot reach the engine, another node, or the Sovereign Graph), it has exactly one write path into the graph (`Engine::commit`), its 13 Golden Invariant tests pass, and the same crate type-checks for `wasm32-unknown-unknown`. Go and Node cannot express Law 1; they can only document it. What the scaffold does not yet have is the part that makes "deterministic and replayable" a true sentence rather than a test that happens to pass on one laptop. Most of this proposal is about that.

## The invariant as engineering

Four rules, each with a mechanism rather than a comment:

1. **Drafts are isolated by ownership.** Keep `DraftContext` owned and `'static`. Add a clippy `disallowed_types` entry for `std::collections::HashMap` and `disallowed_methods` entries for the `f64` transcendental methods in the engine crate, so iteration order and platform libm can never enter a result.
2. **The tick is a pure function of (state, admitted inputs).** Human clicks, top-ups, zooms and every LLM completion are inputs, stamped with the tick at which the engine admitted them and appended to a journal before they take effect. Replay reads the journal instead of the network or the mouse. A replay whose root chain diverges from the recorded chain is a loud failure.
3. **The mempool is a sorted batch, not a queue.** Draft is embarrassingly parallel; the executor returns results in job order (the scaffold already does this); Collect and Verify run single-threaded over that order, and Verify groups envelopes by gate and calls `verify_batch`, which is where Stage 3 netting already does its O(N) pass. Arrival time is not a fact the engine is allowed to know. This is what makes `tokio_executor_matches_sequential` pass, and it must stay that way.
4. **Money is an integer.** Credits become `i64` micro-credits, liquidity `i64` minor units. No `f64` in the ledger, no `format!(\"{:.6}\")` inside a Merkle leaf.

## The stack

| Layer | Choice | Why |
|---|---|---|
| Language | Rust stable (1.91.1 installed, MSRV 1.85), `#![deny(unsafe_code)]` | Ownership is the only mainstream type system that proves Law 1 |
| Parallelism | `tokio` 1.53 for households with LLM seats; `rayon` 1.12 for purely statistical households; single-threaded Collect, Verify, Commit | Draft is the only parallel phase; I/O and CPU should not share a scheduler |
| Engine actor | one `Engine` owned by one task; commands on `tokio::sync::mpsc`, admitted at tick start | inputs get a tick number before they act |
| Sovereign Graph | `imbl` 7.0 persistent `OrdMap` (structural sharing) + hash-chained blocks | O(1) snapshot and O(1) rollback by swapping an `Arc`; the scaffold clones the whole map every tick |
| Hashing | `blake3` 1.8 | several times faster than SHA-256 per tick root; SIMD on native, pure Rust on wasm; `sha2` 0.11 remains acceptable |
| Numerics | `i64` fixed-point for money; `libm` 0.2 for the two `exp` calls and Box-Muller | bit-identical on macOS, Linux and wasm |
| Serialization | `postcard` 1.1 (canonical bytes, journal, wire) + `serde_json` (HUD, receipts, notes) | specified wire format; JSON only where a human reads it |
| Persistence | append-only journal of `postcard` frames with `crc32fast` 1.5; snapshots in `redb` 4.3 | event-sourced; replay from the last snapshot is bounded; pure Rust, one file |
| Transport | `axum` 0.8 WebSocket: snapshot, then a `TickDelta` (changed node views by view hash, events, held envelopes) | the frontend renders only the graph and events, as doc 01 requires; the payload scales with what changed |
| LLM seats | `reqwest` 0.13 (rustls) against the estate Vault `/api/v1/llm/review`; `Semaphore(3)`; `backon` 1.6 bounded retry; reservation before submission | the Vault returns 429 above roughly three parallel calls; the spend-control rules require reserved budget and no silent upgrade |
| Deployment | one static binary per world (`clap` 4.6, `tracing` 0.1); a container with a mounted volume for a hosted world | nothing to operate but a journal file |
| Browser | same crate, `wasm32-unknown-unknown`, the existing raw C ABI, run in a Web Worker, journal in IndexedDB | offline first; statistical seats live, recorded LLM weeks replayed |
| Verification | `proptest` 1.11 (conservation laws), `insta` 1.48 (journal snapshots), `wasmtime` 49 in CI diffing native and wasm root chains | violations become red builds |

## What changes in the scaffold, in order

1. **Integer money** (`resources.rs`, `graph.rs`). Replace `f64` credits and liquidity; the receipt does the formatting. This also removes the `round()/100.0` in `ResourceUnit::credits` and the formatted floats inside `SovereignGraph::root`.
2. **`libm` for `exp`, `ln`, `cos`** (`epistemics.rs`, `rng.rs`). Today these call the platform libm on native and Rust's own port on wasm; the last ulp can differ, and a differing ulp changes a Merkle root. `replay_is_exact` cannot see this because both sides run on the same machine.
3. **Journal** (new `journal.rs`). Records: `Admitted{tick, command}`, `Completion{tick, node, seat, prompt_hash, text, tokens_in, tokens_out, request_id, latency_ms}`, `Snapshot{tick, root}`. `InferenceBackend` gains a `JournalBackend` that replays completions; the engine refuses to tick if a replay needs a completion the journal lacks.
4. **Persistent graph** (`graph.rs`). `imbl::OrdMap<NodeId, i64>`; `GraphSnapshot` becomes `Arc<Block>`; `rollback_to` swaps pointers. A block is `{parents, tick, state_root, ops_root}`; LOD pack and unpack produce blocks with two parents, which is what makes this a DAG rather than a chain.
5. **Deltas** (`tick.rs`). A dirty set maintained in Collect and Commit; `TickDelta` replaces polling `state_view()`. `Payload::hash()` moves from `serde_json` to `postcard` canonical bytes.
6. **Vault backend** (`agents/llm.rs`). A per-call `CallReceipt` with the Vault `request_id` as provenance. Token counts are estimated at four characters per token until the endpoint reports usage, and the receipt says so.

## Risks, honestly

- **Cross-target determinism is asserted, not yet proven.** Until steps 1 and 2 land and the wasmtime diff runs in CI, "bit-for-bit on native and in the browser" is a claim.
- **Tick latency is bound to the slowest model call.** In-tick await is right for a Stage 1 demo with a few houses. Twenty houses with three LLM seats each is sixty calls a tick through a three-permit door, roughly twenty round trips. The second milestone moves inference across ticks (a `Thinking` state that reserves rather than burns); it touches the zero-idle-burn invariant and must be tested against it.
- **The Vault gives no usage counts.** LLM cost accounting is an estimate; statistical seats are exact. The receipt must show this, or the receipt is dressed.
- **The browser cannot call the Vault** without exposing the Director key. LLM-backed play is native-only; the browser replays. That is a feature for the video (record a real week, replay it anywhere) and a limit for the product.
- **`imbl` is a fork** of the dormant `im`, API-stable with a smaller community. Fallback is `rpds` 1.2, or per-tick clones with a depth cap at O(N) rollback.
- **The whole-graph root is still O(N) per tick** until an incremental root over the block's delta lands; at Stage 5 sizes it is the next bottleneck after the map clone.
- **Journal schema evolution** is a header version and a refusal to replay a mismatch. That is the whole plan for now.

## What would be lost by switching

**Go**: goroutines share the heap; nothing stops a draft closure from holding the engine pointer, so Law 1 becomes a code-review rule. Floats and `map` iteration order need the same discipline, with no compiler help. **Node/TypeScript**: `worker_threads` with structured clone gives isolation by copying, which is honest, but one thread for Collect and Verify plus V8 for a ten-thousand-house Stage 3 macro tick is the CPU the LOD design was written to avoid, and there is no wasm-parity story because Node is the runtime. The scaffold's `tokio_executor_matches_sequential` test, its wasm build, and the compile-time `GOLDEN_INVARIANT_LAW_1` constant are three things a rewrite would have to rebuild before reaching parity.