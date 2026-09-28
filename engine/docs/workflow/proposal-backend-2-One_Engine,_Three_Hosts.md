# One Engine, Three Hosts
angle: Velocity-first: keep the existing Rust core (the Golden Invariant is already a compile-time type there) and move daily iteration to the edges as data (prompts, staff, scenarios), with the estate vault as the single LLM backend, a deterministic input tape as persistence, and the same crate running natively, in the browser as wasm, and in Node as a recorder.

Keep the Rust scaffold at /Users/gch2021/Dev/Multi-Asset Workflows/engine (4,557 lines, 12 of 13 Golden Invariant tests green, 329 KB wasm build) rather than rewrite in Go or TypeScript, because DraftContext: Send + 'static is the invariant as a type and a rewrite would lose that proof plus the determinism and browser story. Get velocity by making prompts (minijinja templates), staff (TOML) and scenarios data instead of code; wire LLM seats to the estate vault through one reqwest backend with reserve-before-call cost accounting, a three-permit semaphore per provider, and a process-level USD kill switch; persist the deterministic input tape and periodic postcard snapshots in SQLite; stream per-tick {report, events, state} over an axum WebSocket where the EngineEvent enum is the delta stream; ship one static binary with the frontend embedded; and let the browser run statistical seats live in wasm while replaying server-recorded tapes for LLM runs. Honest risks: one red test, model-latency-bound ticks under the vault's ~3-concurrent-call limit, estimated token usage until the vault returns it, real money behind a game loop, and O(1) rollback (im + blake3) planned but not built.

## stack
- **Language and runtime**: Rust 1.91 (rust-version 1.85 pinned), Tokio 1.53.1 multi-thread runtime; keep the existing engine crate
  why: The scaffold already exists, compiles, passes 12/13 invariant tests, and encodes the Golden Invariant as a type (DraftContext: Send + 'static). A rewrite in Go or TypeScript would lose the compile-time isolation proof, the determinism discipline and the browser build.
- **Async model**: Tokio JoinSet fan-out for the Draft phase (results in job order), single-threaded Collect/Verify/Commit batched per gate via verify_batch; add tokio::time::timeout per draft and a tokio::sync::Semaphore in front of the vault
  why: Matches the Director's requirement exactly: Draft is embarrassingly parallel, Verify batches at boundaries, and only Commit writes the Sovereign Graph. Timeout stops one slow model call from stalling a block.
- **State representation**: SovereignGraph as today (BTreeMap snapshots, 64-deep) through Stage 2-3; migrate to im 15.1.0 persistent maps for O(1) snapshot/rollback and blake3 1.8.7 incremental Merkle root by replacing sha2 in hash.rs
  why: Current O(n) clone per tick is correct and cheap at Stage 1-3; HAMT structural sharing makes snapshot a pointer clone and rollback a pointer swap for Stage 4-5. Do it when a profile shows the clone, not before.
- **Persistence**: Append-only input tape (human decisions, top-ups, zooms, every model reply + receipt) in SQLite via rusqlite 0.40.2 (bundled), plus a postcard 1.1.3 snapshot of the Engine every N ticks
  why: The engine is deterministic given inputs (replay_is_exact proves it), so persisting inputs gives crash recovery, time-travel debugging and recorded demo runs from one sqlite3-openable file with no server.
- **Transport to frontend**: axum 0.8.9 WebSocket (tokio-tungstenite 0.30.0) pushing {report, events, state} per tick and receiving authorize/reject/top_up/zoom/speed; frontend embedded with rust-embed 8.12.0
  why: EngineEvent variants are already documented render triggers, so they are the delta stream. Full StateView per tick is under 20 KB at Stage 1-2; per-node diffs keyed by NodeId come with Stage 3.
- **Serialization**: serde 1.0.229 + serde_json 1.0.151 on the wire; rmp-serde 1.3.1 (MessagePack) behind content negotiation for heavy Stage 3 payloads; postcard for on-disk snapshots
  why: JSON is debuggable and the 52-bit ids already survive JavaScript numbers; no schema compiler or protobuf toolchain to slow a small team.
- **LLM-agent integration**: VaultBackend: InferenceBackend over reqwest 0.13.5 (rustls) to the estate vault POST /api/v1/llm/review with X-Director-Key from ~/.ces-director-key; prompts as minijinja 2.x templates; semaphore of 3 permits per provider, governor 0.10.4 rate shaping, one retry owner, no silent fallback, process-level USD kill switch; tiktoken-rs 0.12.1 for token estimates until the vault returns usage
  why: One HTTP shape for every provider the vault holds (Gemini Flash default, DeepSeek, Mistral, Kimi, Grok, GLM, Qwen) means no per-provider SDKs. Reserve-before-call is already how DraftContext::burn works, matching the estate's spend-control design; the vault 429s above about three concurrent calls, so concurrency must be shaped. Prompt templates let the team iterate daily without recompiling.
- **Deployment**: One static binary (cargo build --release; `house serve --db run.sqlite`) with the frontend embedded; distroless container on Cloud Run for shared demos; tracing 0.1.44 + tracing-subscriber 0.3.23 JSON spans per model call (metadata only, never prompt bodies by default)
  why: Locally the binary is the whole deployment; the estate already runs on Cloud Run; secrets stay out of the folder per LABORATORY.md.
- **Browser and offline**: Same crate built --no-default-features --target wasm32-unknown-unknown (329 KB in the wasm profile; smaller with wasm-opt -Oz once installed), raw C ABI reading JSON from linear memory; statistical seats live in-browser, LLM runs replayed from server-recorded tapes; Node 23 runs the same wasm via record_trace.mjs as the recorder
  why: The key can never be in the browser, so LLM seats run server-side and the deterministic tape makes their runs replayable anywhere. One engine, three hosts, already partly built in presentation/.

## strengths
- Builds on a real, compiling scaffold: 4,557 lines, 12 of 13 Golden Invariant tests green, 329 KB wasm32 module, determinism proven by replay_is_exact and tokio_executor_matches_sequential
- The Golden Invariant is enforced by the type system (DraftContext: Send + 'static, GOLDEN_INVARIANT_LAW_1), not by convention; a seat physically cannot reach the engine or another table
- Velocity comes from data, not language: prompts as minijinja templates, staff as TOML, scenarios as data, so daily iteration never recompiles the core
- Draft phase is already embarrassingly parallel via JoinSet with deterministic result ordering; Verify already batches per gate; the Graph has exactly one write path
- Per-call cost accounting maps one-to-one onto the estate's 2026-09-23 spend-control design: reserve before submission, persist before contact, settle on response, integer money subunits, one retry owner, no silent fallback, kill switch
- One backend (the estate vault) covers every provider with a single HTTP shape and no per-provider SDK; request_id provenance lands in SeatReceipt
- Persistence as an input tape gives crash recovery, time-travel debugging, and recorded runs for the YouTube presentation from one SQLite file
- EngineEvent is already designed as the frontend delta stream; full StateView per tick is under 20 KB at Stage 1-2 so no premature diffing
- Browser/offline story is already half-built: presentation/build.py base64-embeds the wasm and record_trace.mjs records deterministic traces in Node
- Every library version named was verified live against crates.io in this session (axum 0.8.9, reqwest 0.13.5, rusqlite 0.40.2, im 15.1.0, blake3 1.8.7, rmp-serde 1.3.1, postcard 1.1.3, tokio-tungstenite 0.30.0, rust-embed 8.12.0, governor 0.10.4, tiktoken-rs 0.12.1, tracing 0.1.44, tracing-subscriber 0.3.23)

## risks
- One invariant test is red today: exhaustion_leaves_a_note_and_keeps_the_papers (tests/golden_invariant.rs:145) expects a halt on the first tick at 20 credits and gets none; must be fixed before any demo claims all laws are green
- Tick cadence becomes model-latency-bound: the vault 429s above roughly three concurrent calls (tools/vault.py gotcha 6), so a street of six LLM-backed houses ticks in about 5-15 seconds; mitigations are one LLM seat per house, prompt caching, a docket to raise the limit, and later multi-tick drafts
- Token usage is estimated, not reported: the vault envelope returns content and execution.request_id but no usage, so credits/USD per call are tiktoken estimates until the seitiate endpoint is extended (Controlled work with a docket); receipts must say 'estimated', since unknown charges are not zero
- Real money sits behind a game loop: a purse-accounting bug could spend the Director's budget, so the process-level USD kill switch independent of every purse is mandatory, not optional
- O(1) rollback is planned, not built: SovereignGraph still clones BTreeMaps per tick; the im + blake3 migration is roughly a week touching graph.rs and hash.rs and is deferred until a profile shows the clone
- Anthropic and OpenAI are not reachable through the vault by the Director's choice, so LLM seats are Gemini/DeepSeek-class; fine for the game, but it constrains any claim about frontier-tier behaviour
- Rust bus factor: fewer people on a small team read it fluently; mitigated by keeping prompts, staff and scenarios as data and by the Python sidecar-seat fallback (DraftContext already round-trips through serde)
- Determinism depends on the tape: if the SQLite tape is lost, an LLM-backed run is not reproducible
- wasm-opt (binaryen) is not installed on this machine, so the 329 KB wasm figure is the unoptimised-by-binaryen size
- Stop line: nothing here is shipped or adopted; carrying the engine into a core repository, shared contract or production service is Controlled work with its own docket per LABORATORY.md

## write-up
# Backend stack proposal: One Engine, Three Hosts

**Angle.** Velocity-first: a small team ships a playable Stage 1–2 in weeks, with seats that call real models, and iterates daily.

## The verdict

Keep the Rust scaffold at `engine/`. It is not a sketch. It is 4,557 lines; `cargo test --release` passes 12 of 13 Golden Invariant tests; it builds to a 329 KB `wasm32` module; and the Golden Invariant is a *type*: `DraftContext: Send + 'static` has no lifetime through which a reference to the engine, another node, or the Sovereign Graph could enter. A rewrite in Go or TypeScript would buy familiarity and cost the one property the design docs say must never be lost: a compile-time proof that a draft cannot touch anyone else's table. Velocity comes from where the daily-changing parts live, not from the language of the core.

## What "iterate daily" actually touches

Prompts, seat behaviour, prices, scenarios. None of it should require recompiling the engine.

- **Prompts are data.** `minijinja` 2.x templates under `prompts/`, hot-reloaded in dev. The seat renders `DraftContext` into a template; the engine never contains a prompt string.
- **Staff are configuration.** A house's seats are a TOML list (seat, tier, template, rigor, backend). Swapping Scribble from statistical to LLM-backed is one line.
- **Scenarios are data**, the same way.
- The core changes weekly. For a crate this size an incremental `cargo build` is seconds.

## Layer by layer

**Language and runtime.** Rust 1.91 (toolchain on this machine; `rust-version = 1.85` as pinned). Tokio 1.53.1 multi-thread runtime, as resolved in `Cargo.lock`.

**Async model.** The scaffold already satisfies the Director's requirement. Draft fans every node out as a `JoinSet` task; results return in job order so ids mint deterministically. Collect, Verify and Commit run on one thread per tick, batched per gate through `verify_batch`, and only Commit writes the Sovereign Graph (`grep self.graph. src/tick.rs` audits it). Two additions: a `tokio::time::timeout` around each draft so one slow model call cannot stall the block (the seat records "the model did not answer", which the code already handles), and a `tokio::sync::Semaphore` in front of the vault (below).

**State: the Sovereign Graph.** Today `SovereignGraph::snapshot` clones its `BTreeMap`s every tick and `rollback_to` clones them back: O(n) both ways. Correct through Stage 3, wrong for Stage 5. The O(1) version: persistent maps from `im` 15.1.0 (HAMT with structural sharing), so a snapshot is a root-pointer clone and a rollback is a pointer swap; keep the 64-deep `VecDeque` of roots as now. Make the Merkle root incremental with `blake3` 1.8.7 (a tree hash by construction) by replacing `sha2` in the single module `hash.rs`. Do this after Stage 2 ships, when a profile shows the clone, and not before.

**Persistence: the tape.** The engine is deterministic given its inputs; `replay_is_exact` proves it and `presentation/record_trace.mjs` already exploits it. So persist inputs, not state: an append-only SQLite log (`rusqlite` 0.40.2, `bundled`) of human decisions, top-ups, zoom changes and, above all, every model reply with its receipt; plus a `postcard` 1.1.3 snapshot of the whole `Engine` every N ticks for fast resume. Recovery is snapshot plus replay. Time-travel debugging and the recorded runs for the YouTube presentation fall out of the same file. One file, `sqlite3`-openable, no server.

**Transport to the frontend.** `axum` 0.8.9 with the `ws` feature (`tokio-tungstenite` 0.30.0 underneath). One WebSocket per viewer; every tick pushes `{report, events, state}`; the client sends `authorize`, `reject`, `top_up`, `zoom` and `speed` on the same socket. The `EngineEvent` enum *is* the delta stream: each variant is already documented as a render trigger (Burn drives the exhaust shader, StateSync the sweeping light, Packed/Unpacked the LOD swap). For Stage 1–2 also send the full `StateView` per tick; it is under 20 KB. Per-node field diffs keyed by `NodeId` arrive with Stage 3, when state is measured in megabytes. The frontend is served from the binary via `rust-embed` 8.12.0.

**Serialization.** `serde` 1.0.229 and `serde_json` 1.0.151 on the wire: debuggable, and ids are already 52-bit so they survive JavaScript numbers. `rmp-serde` 1.3.1 (MessagePack) behind content negotiation when Stage 3 payloads get heavy. `postcard` for snapshots on disk. No schema compiler, no protobuf toolchain.

**LLM-agent integration.** One backend: the estate vault (`POST /api/v1/llm/review`, `X-Director-Key` read from `~/.ces-director-key`, never copied into this folder). Implemented as `VaultBackend: InferenceBackend` with `reqwest` 0.13.5 on rustls. Every provider the vault holds has one HTTP shape, so no per-provider SDKs: Gemini Flash as default, DeepSeek, Mistral, Kimi, Grok, GLM, Qwen. OpenAI and Anthropic are not on that route by the Director's choice; Gemini-class seats are right for a game.

Per-call cost accounting follows the estate's execution spend-control design (23 Sept 2026): (1) the seat reserves worst-case cost against the `Purse` copy *before* the call, which is already how `DraftContext::burn` behaves, since exhaustion returns `Err` without debiting; (2) the tape row (operation id, idempotency key, resolved model, reserved credits) is written before the provider is contacted; (3) the response settles: `execution.request_id`, actual model, latency, tokens, credits, joules, and an integer micro-USD price from a pricing snapshot, appended to `SeatReceipt`. Game credits stay `f64`; money is `i64` subunits. Concurrency: a semaphore of three permits per provider (the vault returns 429 above roughly three concurrent calls, per `tools/vault.py`), `governor` 0.10.4 for rate shaping, one retry owner with bounded attempts, no silent fallback to a dearer model, and a process-level USD kill switch independent of every purse. Token usage: the vault envelope carries none today, so counts are estimated with `tiktoken-rs` 0.12.1 until the seitiate endpoint returns usage, which is docketed work outside this laboratory.

**Deployment.** One static binary: `cargo build --release` then `house serve --db run.sqlite`. Frontend embedded. Locally that is the entire deployment. For a shared demo, a distroless container on Cloud Run, where the estate already runs, with the key as a secret. `tracing` 0.1.44 and `tracing-subscriber` 0.3.23 emit JSON spans per model call carrying request id, tier, tokens and credits, never prompt bodies by default.

**Browser and offline.** Same crate, `--no-default-features --target wasm32-unknown-unknown`, 329 KB in the `wasm` profile (smaller once `wasm-opt -Oz` is installed). Raw C ABI, no wasm-bindgen: the page reads JSON from linear memory. Statistical seats run at full speed with zero network. LLM seats never run in the browser, because the key cannot be there; the browser replays tapes recorded on the server. Node 23 running the same wasm through `record_trace.mjs` is already the third host. One engine, three hosts.

## What the alternatives would lose

- **TypeScript/Node** is the only serious velocity rival: one language front and back, the best prompt ergonomics, a trivial browser story. Lost: the type-level invariant (a closure can capture anything), the determinism discipline (rebuildable, but rebuilt), roughly an order of magnitude on the CPU-bound Stage 3 draft, and 4.5k working lines.
- **Go.** Goroutines make a fine mempool. Lost: the ownership proof, and the browser (Go wasm modules are multi-megabyte; TinyGo constrains the standard library).
- **Python.** Keeps the laboratory kernel and `vault.py`. Lost: concurrency and the browser. Python remains the experiment battery, and is a legitimate day-one sidecar seat if the Rust vault client slips: `DraftContext` already round-trips through serde, so a Python process can receive it and return it, which is the invariant by construction.

## Risks

1. **One invariant test is red.** `exhaustion_leaves_a_note_and_keeps_the_papers` expects a halt on the first tick at 20 credits and gets none. Fix before any demo claims "12 laws, all green".
2. **Tick cadence becomes model-latency-bound.** With three permits and one to five seconds per call, a street of six LLM houses ticks in five to fifteen seconds. Mitigations: one LLM seat per house with statistical Scout and Inspector; prompt caching; a docket to raise the vault limit; later, drafts that span ticks.
3. **Cost accounting is estimated until usage returns from the vault.** The spend-control rule "unknown charges are not zero" applies: the receipt must show `estimated`, not blank.
4. **Real money behind a game loop.** A purse-accounting bug can spend the Director's budget. The process-level kill switch is not optional.
5. **O(1) rollback is planned, not built.** The `im` migration is a week of careful work touching `graph.rs` and `hash.rs`.
6. **Rust bus factor.** Fewer people read it; mitigated by keeping prompts, staff and scenarios as data.
7. **Stop line.** Nothing here is shipped. Carrying the engine into a core repository is Controlled work with its own docket.

## The first two weeks

1. Green the red test. 2. `VaultBackend`, semaphore, receipt fields, kill switch. 3. Tape and snapshot. 4. `axum` WebSocket with the full-state frame. 5. Prompts and staff as data. Then play Stage 1 with a real Scribble at the oak table, and measure the tick.