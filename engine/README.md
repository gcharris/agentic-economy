# context-engine

The invisible backend of *The Agentic Economy*: an Asynchronous Agentic State Machine in Rust, one crate for native (Tokio) and the browser (wasm32).

Start with `docs/HANDOFF.md`, then `src/lib.rs`. Tests: `cargo test`. Terminal demo: `cargo run --release --bin house -- --door interactive`. Server: `cargo run --release --bin serve`. Browser build: `cargo build --profile wasm --no-default-features --target wasm32-unknown-unknown`.

Real model calls: the `vault` feature (native only) adds `agents::vault::VaultBackend`, an `InferenceBackend` over the estate Vault route (`POST /api/v1/llm/review`, Director key read once from `~/.ces-director-key`, never printed): `VaultBackend::new(VaultConfig::default())?`. Bounded retries, no fallback to another model, a circuit breaker, and a purse reservation in `LlmSeat` before every call. Tests run against a loopback mock, never the live route: `cargo test --features vault`.

Laboratory artefact under `../LABORATORY.md`; nothing here is shipped or adopted until the Director carries it across the stop line.
