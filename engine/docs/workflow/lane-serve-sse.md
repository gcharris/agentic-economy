# lane serve-sse · green=True

## files created
- src/bin/serve.rs: Dependency-free HTTP/1.1 + SSE server (307 lines) hosting one Engine (house|street) in a single tokio task that owns &mut Engine, driven by tokio::time::interval and a tokio::sync::mpsc command channel with oneshot replies; ticks are serialised once and fanned out via tokio::sync::broadcast to every GET /events subscriber. Endpoints documented in the top doc comment: GET /state, GET /events (hello + tick frames), POST /authorize/<id>, /reject/<id>, /top-up/<node>/<credits>, /zoom/<1-5>, /pause, /resume, OPTIONS preflight, CORS * on every answer. Minimal parser (request line + headers to blank line, 16 KiB cap, bodies ignored). Client disconnects handled by select-ing on the read half for EOF alongside the broadcast receiver; a slow subscriber gets an 'event: lagged' frame instead of being dropped. Flags: --scenario --budget --tasks --seed --interval-ms (700) --port (8787; 0 = pick free port). First stdout line is 'listening on http://127.0.0.1:PORT' for launchers/tests.
- tests/serve_smoke.rs: Integration smoke test: spawns the serve binary via CARGO_BIN_EXE_serve with --port 0, reads the port from the first stdout line, then speaks raw HTTP over tokio TcpStream: GET /state (200, CORS header, JSON with tick/nodes/held/active_scale/executor), GET /events (asserts hello frame and parses one 'event: tick' data payload as {report, events}), drops the SSE client, POST /pause ({"ok":true} and the tick counter stops), POST /zoom/2 (active_scale becomes Street), POST /top-up/<real node>/25.5 (200), /zoom/9 (400), /top-up/424242/1 (404 ok:false), GET /nope (404), OPTIONS (204 with Allow-Methods), POST /resume. A Drop guard kills the child even on panic.

## cargo toml diff
```diff
--- /Users/gch2021/Dev/Multi-Asset Workflows/engine/Cargo.toml	2026-09-28 20:46:15
+++ Cargo.toml	2026-09-28 21:22:13
@@ -11,7 +11,7 @@
 crate-type = ["rlib", "cdylib"]
 
 [features]
-# `native` = the Tokio multi-core draft executor and the `house` binary.
+# `native` = the Tokio multi-core draft executor and the `house` and `serve` binaries.
 # Build for the browser with `--no-default-features --target wasm32-unknown-unknown`.
 default = ["native"]
 native = ["dep:tokio"]
@@ -20,12 +20,21 @@
 serde = { version = "1", features = ["derive"] }
 serde_json = "1"
 sha2 = "0.10"
-tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time"], optional = true }
+tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time", "net", "io-util"], optional = true }
 
 [[bin]]
 name = "house"
 required-features = ["native"]
 
+# `serve`: the engine behind a dependency-free HTTP/1.1 + SSE wall (see src/bin/serve.rs).
+[[bin]]
+name = "serve"
+required-features = ["native"]
+
+[[test]]
+name = "serve_smoke"
+required-features = ["native"]
+
 [profile.release]
 opt-level = 3
 lto = "fat"
```

## tests added
- tests/serve_smoke.rs::serve_speaks_state_events_and_commands

## observations
- Merge recipe: copy src/bin/serve.rs and tests/serve_smoke.rs into the original crate and apply the Cargo.toml diff. No core file changed; src/scenarios/mod.rs is byte-identical to the original.
- The original crate moved forward while this lane ran (statistical.rs and wasm_abi.rs at 21:14, golden_invariant.rs at 21:17; the lane was copied ~21:00-21:04). Those changes (cost-visibility behaviour in Scribble/Inspector, engine_set_truth_price in the wasm ABI, a test budget of 30 instead of 20) are upstream work, not mine. I copied the three current upstream files into the lane before the final run, so the green result above is against the crate as it stands now; after the sync `diff -rq` shows only my two new files plus Cargo.toml.
- Live probe with curl (house scenario, 100 ms interval): OPTIONS answered 204 with Allow-Origin/Methods/Headers; GET /events emitted 'retry: 1000', 'event: hello' with 'context-engine 0.1.0 (native, tokio-multi-thread executor, scenario house, seed 7)', then tick frames; a held envelope read from /state was authorised via POST /authorize/<id> and totals.approved rose on the next tick; POST /authorize/abc answered 400 {"ok":false,"error":"malformed envelope id"}.
- Determinism preserved: the engine is seeded from --seed (default 7); the only clock is the host's tokio interval between ticks, outside the engine. No OS randomness, no wall clock inside the engine path. Pause simply gates the interval arm of the select!, so commands and /state still answer while paused.
- Envelope and node ids on the wire are plain u64 JSON numbers; they are minted as (rng >> 12) ^ counter (tick.rs:145), so they are < 2^52 and survive JavaScript's 2^53 number precision. The server accepts decimal ids only; the Display form 'env:xxxxxxxx' masks to 32 bits and is not round-trippable, so a frontend must post state.held[].envelope, not the display string.
- The SSE response uses a close-delimited body (no Content-Length, no chunked encoding), which browsers' EventSource and curl -N both accept; every non-SSE answer uses Connection: close, so one TCP connection per request (fine for a control plane at 700 ms ticks).
- Every mutating command is acknowledged only after the engine task applied it (oneshot reply), so a GET /state issued after a 200 already reflects the change; the smoke test relies on this for the pause and zoom assertions.
- cargo clippy reports one pre-existing warning in the lib (extend vs append), none in serve.rs or the smoke test; cargo build/test emit zero warnings.
- Unlike the house binary, serve never stops ticking when every task is sent; the tick counter keeps advancing on an idle house (idle_ticks grow). A frontend that wants a still frame should POST /pause.

## design flaws
- Engine::authorize and Engine::reject return () and do not check that the envelope is currently held at a door, so POST /authorize/<stale or invented id> answers {"ok":true} while nothing happens. The server pre-validates node ids for /top-up (Engine::top_up also silently ignores unknown nodes) but cannot do the same for envelopes without walking held_envelopes(); a Result-returning or bool-returning authorize/reject in tick.rs would let the HTTP layer report 404 honestly. Not changed here to keep core files untouched.
- The lane copy mechanism has no guard against the original advancing mid-lane: three upstream files changed after the copy and would have been reported as spurious diffs. Worth having the orchestrator snapshot a hash of the original at lane-open time so lanes can tell upstream drift from their own edits.

## test output tail
```
test result: ok. 13 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.05s

     Running tests/serve_smoke.rs (target/debug/deps/serve_smoke-3ca09e9c4d5a2f69)

running 1 test
test serve_speaks_state_events_and_commands ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.69s

   Doc-tests context_engine

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```