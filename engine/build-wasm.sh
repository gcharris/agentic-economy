#!/usr/bin/env sh
# Build the browser engine and copy the artefact to engine/dist/ (tracked; engine/target/ is not).
set -e
cd "$(dirname "$0")"
cargo build --profile wasm --no-default-features --target wasm32-unknown-unknown
mkdir -p dist
cp target/wasm32-unknown-unknown/wasm/context_engine.wasm dist/context_engine.wasm
ls -l dist/context_engine.wasm
