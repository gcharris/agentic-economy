# context-engine

The invisible backend of *The Agentic Economy*: an Asynchronous Agentic State Machine in Rust, one crate for native (Tokio) and the browser (wasm32).

Start with `docs/HANDOFF.md`, then `src/lib.rs`. Tests: `cargo test`. Terminal demo: `cargo run --release --bin house -- --door interactive`. Server: `cargo run --release --bin serve`. Browser build: `cargo build --profile wasm --no-default-features --target wasm32-unknown-unknown`.

Laboratory artefact under `../LABORATORY.md`; nothing here is shipped or adopted until the Director carries it across the stop line.
