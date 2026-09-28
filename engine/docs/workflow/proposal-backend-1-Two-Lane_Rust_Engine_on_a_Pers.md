# Two-Lane Rust Engine on a Persistent Merkle-DAG
angle: Throughput-first: maximise mempool envelopes per second and parallel drafts per core, assuming 100k nodes at Stage 3, with the Draft phase embarrassingly parallel and the Verify phase batched at boundaries.

Keep the existing Rust scaffold (its type system proves the Golden Invariant, its replay is bit-exact across executors, and the same crate compiles to a 418 KB wasm32 binary), but fix the four hot spots that measurements at 100k houses expose: a two-lane executor (Rayon for CPU-bound statistical drafts and Verify preflight, Tokio only for I/O-bound model calls and transport), a persistent Merkle-DAG with O(1) snapshot and rollback and O(changes log N) root recompute, viewport-scoped binary delta streaming instead of a 129 MB JSON state view, and an integer ledger instead of f64 money. Measured today: 69k envelopes/s aggregate and about 100k envelopes/s in busy ticks on one 10-core machine, with Tokio giving no speedup over sequential for statistical seats (0.80x) while completing 10k concurrent 50 ms model calls in 98 ms; projected after the changes: a busy 100k-house tick from about 2.5 s to 0.4-0.5 s, with an honest serial Commit ceiling near 1M envelopes/s per shard.

## stack
- **Language and runtime**: Rust 1.85+ (1.91.1 installed), edition 2021, the existing context-engine crate (4,534 lines, 29 tests green, dependencies: serde 1, serde_json 1, sha2 0.10, tokio 1.53)
  why: DraftContext: Send + 'static carries no borrow, so a draft cannot reach the engine or the Sovereign Graph at compile time; replay is bit-exact across 1 and 10 cores (tokio_executor_matches_sequential); one crate serves the server and the browser. Go would lose the compile-time isolation proof and the browser build; Node would lose the multi-core draft lane entirely.
- **Async model**: Two lanes behind the one DraftExecutor trait: rayon 1.12 par_iter for statistical seats and Verify preflight; tokio 1.53 multi-thread JoinSet for LLM seats and transport. A job routes to Tokio if any of its seats is I/O-bound. Results returned in job order for determinism.
  why: Measured at 100k houses: Rayon 1.51x, Tokio 0.80x versus sequential for CPU-bound drafts; Tokio completes 10,000 concurrent 50 ms model calls in 0.098 s where sequential needs 5.4 s for 100. Preflight (hash + signature per envelope) is pure and parallel; Stage 3 netting stays a serial ordered reduction.
- **State representation (Sovereign Graph as Merkle-DAG)**: Persistent Merkle-DAG: im 15.1 OrdMap with Arc structural sharing and cached subtree hashes; Oak Table snapshots as Arc versions instead of deep clones; blake3 1.8 for hashes (keyed mode as the envelope MAC); money as i128 micro-credits, never f64
  why: Snapshot and High Court rollback become an Arc swap, O(1) in fact rather than in name (the scaffold clones a 100k-entry BTreeMap per tick and recomputes the full root: 0.14-0.32 s per tick, the floor of an idle tick). BLAKE3 measured 103 ns vs 222 ns for SHA-256 per 104-byte envelope header on M4. The serial 0.37 s draft_context clone disappears. f64 with 1e-9 epsilons drifts at 600k contracts per tick.
- **Persistence**: Journal-first: approved envelopes, human decisions and the seed are the source of truth; state is a fold of the journal. redb 4.3 for journal and snapshots (single file, ACID, pure Rust); fjall 3.1 if the write rate outgrows a B-tree; rkyv 0.8.18 snapshots for zero-copy reload; object_store 0.14 for cold copies to S3/GCS/local
  why: Recovery is load-latest-snapshot plus replay, and replay is already proven exact. One writer per shard means an embedded store; a SQL round-trip per envelope would cap the pipeline near 20k/s.
- **Transport to the frontend (delta streaming)**: axum 0.8.9 WebSocket (tokio-tungstenite 0.30) with binary frames; per-subscriber viewport (active scale plus visible node set); TickDelta with field masks; coalescing backpressure where the latest cumulative delta wins; keyframe every N ticks for late joiners; quinn 0.11 WebTransport later, not first
  why: The scaffold's full state view is 129 MB of JSON at 100k houses (1.6 s to build) and max_events_retained: 4096 silently discards the event stream at scale. A Stage 3 camera must receive street and city aggregates, never 100k house rows. WebSocket first because of Safari WebTransport gaps.
- **Serialization**: postcard 1.1 as the canonical byte encoding for envelope hashing and the wire; rkyv 0.8 for storage; ciborium 0.2 CBOR or JSON only for the debug HUD; serde stays as the schema layer
  why: serde_json inside Payload::hash() is most of the measured 1.5 us per envelope in preflight (200k envelopes: 0.31 s). Canonical deterministic bytes make the payload hash stable across languages and the browser.
- **LLM-agent integration**: Keep the InferenceBackend trait. Ship VaultBackend on reqwest 0.13 + rustls against the estate's single endpoint (Director key read from disk, never logged); record execution.request_id on every SeatReceipt; governor 0.10 rate limiter per provider and a tokio Semaphore per model tier; reserve-then-settle Purse accounting from the provider's usage (input, output, cached tokens) replacing the len()/4 estimate; moka 0.12 for prompt-prefix reuse; reqwest-eventsource 0.6 streaming only for Stage 1 speech bubbles
  why: Many concurrent calls with per-call cost accounting is exactly the Tokio lane plus the Purse. Provider cached-read rates fall in the 85-97 percent discount band, so the kernel's 0.85 cache-hit term becomes measured rather than assumed. Anthropic and OpenAI are not carried by the Vault (the Director's choice), so the adapter stays provider-neutral; the estate's spend-control rules (reserve before submission, no silent fallback to a dearer model, bounded retries, circuit breaker) map directly onto DraftContext::burn.
- **Deployment**: One static binary per shard, shard = parent node (a street or a city), cross-shard flow only through the Stage 3 clearinghouse; mimalloc 0.1.52 as global allocator; tracing 0.1, metrics 0.24, hdrhistogram 7.6 per phase; proptest 1.11, criterion 0.8, loom 0.7 for tests
  why: Netting is the natural shard boundary. The draft lane is allocation-bound (1.5x on ten cores says so), so the allocator is a first-order choice. Per-phase histograms make the four hot spots visible in production.
- **Browser and offline**: Same crate to wasm32-unknown-unknown with --no-default-features (418 KB with the plain release profile, smaller with the size profile); wasm-bindgen 0.2.129 and wasm-bindgen-futures 0.4 in a Web Worker; wasm-bindgen-rayon 1.3 when COOP/COEP headers permit SharedArrayBuffer; IndexedDB holds the same rkyv snapshot
  why: Stages 1 and 2 run entirely on the person's machine: the papers stay in the house, and the Door is a local click. Stage 3 and above stream deltas from the server. The wasm build was compiled in this session and works today.

## strengths
- The scaffold already enforces the Golden Invariant at compile time and replays bit-exactly across executors; nothing in this proposal weakens either property.
- Every hot spot is measured, not guessed: at 100k houses the tick is bound by a serial Oak Table clone (0.37 s), a full Merkle recompute (0.14-0.32 s), a serde_json-dominated preflight (0.31 s) and allocation in the draft lane, not by drafting itself.
- Two-lane execution matches each phase to its physics: Rayon for CPU-bound drafts (1.51x measured), Tokio for I/O-bound model calls (10k concurrent calls in 98 ms).
- A persistent Merkle-DAG makes O(1) snapshot and High Court rollback literal, and turns the per-tick root cost from O(N) into O(changes log N).
- Journal-first persistence with exact replay gives recovery, audit and time travel from one mechanism.
- Viewport-scoped binary deltas replace a 129 MB JSON view, so the frontend cost scales with what the camera sees, not with the world.
- The same crate ships to the browser (418 KB wasm) so Stage 1 and 2 are offline-capable and the person's papers never leave their machine.
- Per-call cost accounting comes from the provider's own usage figures with request_id provenance on every receipt, honouring the laboratory's cost-visibility finding.
- Every library named exists at the stated version on crates.io as of 2026-09-28.

## risks
- Persistent structures (im) cost 2-5x per operation; the win is O(1) snapshot and rollback, not raw speed. Benchmark against a dirty-set rehash on the current BTreeMap before committing.
- The Commit phase is a single writer by design (about 1 us per envelope, near 1M envelopes/s per shard); cross-shard atomic DvP and cross-shard High Court rollback need a coordinator that does not exist yet.
- Oak Table papers grow without bound (every seat leaves one per tick), tens of megabytes per tick at 100k houses; a retention policy that moves old papers to the journal is required.
- Real provider rate limits, not Tokio, bound the LLM lane; the Vault response envelope documents request_id but not token usage, so receipts may have to be marked estimated until that is confirmed.
- rkyv schema evolution is manual; version every snapshot and keep the journal in postcard with an explicit version byte.
- The current f64 ledger with 1e-9 epsilons will drift at 600k contracts per tick; the integer change is not optional.
- scenarios::street gives every house every other house as a peer (O(N^2)); the probe used eight neighbours. Fine for demos, fatal at scale.
- Browser multi-core drafting needs COOP/COEP headers and SharedArrayBuffer; without them the wasm build is single-threaded. Safari WebTransport gaps keep WebSocket as the primary transport.
- Rust iteration speed and hiring; mitigated by the small core and by seats living behind a trait, so scenario logic can move to a sidecar later.
- The projected 0.4-0.5 s busy tick at 100k houses is derived from measured phase costs, not measured end to end; treat it as a target until the four changes land.

## write-up
# Backend stack proposal: throughput-first

**Angle.** Maximise mempool envelopes per second and parallel drafts per core at 100k nodes (Stage 3). Everything below was measured on the existing scaffold (`/Users/gch2021/Dev/Multi-Asset Workflows/engine`, 4,534 lines, 29 tests green, four dependencies) on a 10-core Apple M4, with a probe kept outside the project at `/private/tmp/claude-501/-Users-gch2021-Dev-Multi-Asset-Workflows/8644f859-ac58-45f1-8794-84c71d2ade47/scratchpad/bench/src/main.rs`.

## Verdict

Keep Rust and keep the scaffold. Its type system already proves the Golden Invariant (`DraftContext: Send + 'static` carries no borrow, so a draft cannot reach the engine or the Sovereign Graph), its replay is bit-exact, and the same crate compiles to a 418 KB wasm32 binary. What must change is not the language but four hot spots the measurements expose: the executor, the Merkle root, the state view, and the ledger's number type.

## What the scaffold does today at 100k houses

| Measurement (10 ticks, statistical seats, Stage 2 gate) | Result |
|---|---|
| Wall time, sequential vs Tokio executor | 8.68 s vs 8.69 s, identical roots |
| Aggregate throughput | 34.5k drafts/s, 69k envelopes/s (about 100k envelopes/s inside busy ticks) |
| Tick floor with no drafts | 0.37 s, of which full Merkle recompute is 0.32 s |
| Full state view | 129 MB of JSON, 1.6 s |
| Per-phase, one busy tick | draft_context (serial Oak Table clone) 0.37 s; drafts 0.27 s sequential, 0.34 s Tokio (0.80x), 0.18 s Rayon (1.51x); verify preflight 0.31 s for 200k envelopes; graph snapshot 0.14 s |
| I/O-bound seat (50 ms mock model call) | sequential: 100 houses in 5.4 s; Tokio: 10,000 houses in 0.098 s |

Two conclusions. Tokio is the wrong lane for CPU-bound drafts and the only lane for model calls. And the tick is bound by allocation and serial O(N) work, not by drafting: `Rayon` reaches only 1.5x on ten cores because each draft deep-clones its Oak Table and boxes its future.

## The stack

| Layer | Choice | Why |
|---|---|---|
| Language, runtime | Rust 1.85+ (1.91 installed), edition 2021, the existing `context-engine` crate | Compile-time isolation, deterministic replay across executors (proven by `tokio_executor_matches_sequential`), one crate for server and browser |
| Async model | Two lanes behind the one `DraftExecutor` trait: `rayon` 1.12 `par_iter` for statistical seats and the Verify preflight; `tokio` 1.53 multi-thread `JoinSet` for LLM seats and transport. A job routes to Tokio if any of its seats is I/O-bound | Measured: Rayon 1.51x where Tokio is 0.80x; Tokio completes 10k concurrent model calls in 98 ms |
| State | Persistent Merkle-DAG: `im` 15.1 `OrdMap` (Arc structural sharing) with cached subtree hashes; Oak Table snapshots become `Arc` versions, not clones; `blake3` 1.8 (measured 103 ns vs 222 ns for SHA-256 per envelope header on M4; keyed mode is the envelope MAC); money as `i128` micro-credits, never `f64` | Snapshot and High Court rollback become an Arc swap, O(1) in fact rather than in name; root recompute drops from O(N) per tick to O(changes log N); the 0.37 s serial clone disappears |
| Persistence | Journal-first: approved envelopes, human decisions and the seed are the truth; state is a fold. `redb` 4.3 for journal and snapshots (single file, ACID, pure Rust), `fjall` 3.1 if writes outgrow a B-tree; snapshots in `rkyv` 0.8.18 for zero-copy reload; `object_store` 0.14 for cold copies | Recovery is load-plus-replay, and replay is already exact. A SQL round-trip per envelope would cap the pipeline near 20k/s |
| Transport | `axum` 0.8.9 WebSocket (`tokio-tungstenite` 0.30), binary frames; per-subscriber viewport (active scale plus visible node set); `TickDelta` with field masks; coalescing backpressure (latest cumulative delta wins); keyframe every N ticks; `quinn` 0.11 WebTransport later | A Stage 3 camera must receive street and city aggregates, never 100k house rows. The scaffold's `max_events_retained: 4096` silently drops the event stream at scale and must become a subscriber ring |
| Serialization | `postcard` 1.1 as the canonical byte encoding for envelope hashing and the wire; `rkyv` for storage; JSON only for the debug HUD | `serde_json` inside `Payload::hash()` is most of the 1.5 µs per envelope in preflight; canonical bytes also make the hash stable across languages |
| LLM integration | Keep `InferenceBackend`. Ship `VaultBackend` on `reqwest` 0.13 + rustls against the estate's single endpoint (the Director key is read from disk, never logged); record `execution.request_id` on every `SeatReceipt`; `governor` 0.10 per provider, a `Semaphore` per tier; reserve-then-settle purse accounting from the provider's `usage` (input, output, cached tokens), replacing the `len()/4` estimate; `moka` 0.12 for prompt-prefix reuse | Many concurrent calls with per-call cost is exactly the Tokio lane plus the Purse. Provider cached-read rates fall in the 85-97 percent discount band, so the kernel's 0.85 cache term becomes measured, not assumed. Anthropic and OpenAI are not carried by the Vault, so the adapter stays provider-neutral |
| Deployment | One static binary per shard, shard = parent node (street or city), cross-shard flow only through the Stage 3 clearinghouse; `mimalloc` 0.1.52 global allocator; `tracing` 0.1, `metrics` 0.24, `hdrhistogram` 7.6 per phase; `proptest` 1.11, `criterion` 0.8, `loom` 0.7 | Netting is the natural shard boundary; the draft lane is allocation-bound, so the allocator is a first-order choice |
| Browser, offline | Same crate to wasm32 (`--no-default-features`, sequential executor); `wasm-bindgen` 0.2.129 and `wasm-bindgen-futures` 0.4 in a Worker; `wasm-bindgen-rayon` 1.3 when COOP/COEP headers allow; IndexedDB holds the same rkyv snapshot | Stages 1 and 2 run entirely on the person's machine: the papers stay in the house. Stage 3 and above stream from the server |

## Throughput plan

With the four changes, a busy 100k-house tick is projected to fall from about 2.5 s to 0.4 to 0.5 s: draft context O(1) removes 0.37 s; incremental Merkle takes the snapshot from 0.14 to 0.32 s down to single-digit milliseconds; Rayon preflight with postcard takes Verify from 0.31 s to roughly 40 ms; Rayon drafts with mimalloc from 0.27 s to roughly 50 ms. Commit stays a single writer at about 1 µs per envelope, which is the honest ceiling: near 1M envelopes/s per shard. Beyond that, shard by parent. These are projections from measured phase costs, not measurements.

## What Go or Node would lose

Go: the compile-time isolation proof (a goroutine can capture anything), deterministic timing under a garbage collector holding 100k nodes, and the browser build. Node: the multi-core draft lane entirely, since `worker_threads` structured-clone state, which is the exact O(N) copy this proposal removes. Both would keep the design; neither would keep the proofs.

## Risks

1. Persistent structures cost 2 to 5x per operation; the win is O(1) snapshot and rollback, not raw speed. Benchmark `im` against a dirty-set rehash on the current `BTreeMap` before committing.
2. The Commit phase is serial by design; cross-shard atomic DvP and a cross-shard High Court rollback need a coordinator that does not exist yet.
3. Oak Table papers grow without bound (every seat leaves one per tick); at 100k houses that is tens of megabytes per tick. A retention policy that moves old papers to the journal is required.
4. Real provider rate limits, not Tokio, bound the LLM lane; the Vault response envelope documents `request_id` but not token usage, so receipts may have to be marked estimated until that is confirmed.
5. `rkyv` schema evolution is manual; version every snapshot and keep the journal in postcard with an explicit version byte.
6. `f64` money with `1e-9` epsilons in the current ledger will drift at 600k contracts per tick; the integer change is not optional.
7. `scenarios::street` gives every house every other house as a peer, O(N²); the probe used eight neighbours. Fine for demos, fatal at scale.
8. Rust iteration speed and hiring; mitigated by the small core and by seats living behind a trait, so scenario logic can move to a sidecar later.

## Reproduce

From the bench directory: `cargo run --release -- 1000 10000 100000`, `cargo run --release -- phases 100000`, `cargo run --release -- llm 10000`, `cargo run --release -- hash`.