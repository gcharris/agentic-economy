# Truth Buffer
angle: render-performance-first: the Sovereign Graph is uploaded once per tick as a GPU state texture; fog, sweeps and pulses are time-parametric shader effects that cost nothing per frame; 50k instanced hex tiles in one draw call, WebGL2 baseline, WebGPU as a flag.

A three.js/WebGL2 frontend whose central idea is a per-node RGBA16F "truth buffer" texture fed by the engine's NodeView array (confidence, compute fraction, burn, status+sync time). 50,000 hex tiles render as one InstancedMesh fetching that texture; fog-of-war, the StateSync cascade and the five gate-specific verification pulses are evaluated on the GPU from event timestamps, so the CPU does no per-frame work. Five stage renderers share one context and a single log-altitude camera rig (orthographic S1-S3, perspective S4-S5), with transitions triggered by the engine's Packed/Unpacked events and rendered as a fog dissolve. State arrives through one EngineSource interface with wasm-in-a-Worker, WebSocket stream and recorded-trace implementations. Testing runs the real wasm in Node under vitest, compiles shaders with glslangValidator, and asserts a draw-call budget under Playwright+SwiftShader. The demo is recorded in a fixed-dt director mode with per-frame 2160p capture into ffmpeg. The honest caveat: the engine only has house and street scenarios today, so the 50k-tile city first renders a seeded synthetic graph.

## stack
- **Renderer**: three.js (pin the current release; WebGPURenderer/TSL stabilised around r167-r170) on WebGL2, WebGPURenderer behind a query flag
  why: WebGL2 is the only thing guaranteed on every laptop the video will be watched on; three provides InstancedMesh, DataTexture, RawShaderMaterial, render targets and a camera rig without writing a scene graph. Babylon 7/8 is a viable alternative; PixiJS 8 is ruled out by the globe and isometric tilt.
- **Tile pipeline**: One InstancedMesh (12-vertex hex prism, 50k instances, one draw call) reading a 512x512 RGBA16F DataTexture: R=confidence, G=compute/allocated, B=burned_this_tick, A=status+last-sync time
  why: One texSubImage2D per engine tick replaces 50k per-instance attribute writes; two buffers (tick N, N+1) are lerped in-shader so animation between discrete blocks is free. Target <= 12 draw calls at Stage 3.
- **Shaders**: GLSL ES 3.00 chunks via vite-plugin-glsl; Ashima/Gustavson webgl-noise 3D simplex; 64-slot pulse ring-buffer uniform
  why: fog = 1 - confidence warps/desaturates/dithers the tile (crisp at 1.0, reference distortion at the observed 0.5636 floor); packed nodes use mean_confidence for amplitude and epistemic_variance for noise frequency; StateSync stamps a sync time and the sweep cascades by hexDistance x 40 ms entirely on the GPU; Approved/Rejected carry gate: Stage so each of the five gates gets its own pulse.
- **Scene and camera**: Five stage renderers, one context, one log-scale altitude scalar; orthographic dimetric for S1 room cutaway, S2 street, S3 hex city; perspective 55-degree tilt over a displaced heightfield for S4; orbital globe with equirect texture, instanced beacons and sun-terminator uniform for S5
  why: Not a continuous world: threshold crossings blend a half-res render target of the outgoing stage with the incoming one using the fog shader as the medium, triggered by the engine's Packed/Unpacked events, so zooming visually is a StateSync and the camera cannot show a scale the engine is not simulating. 3->4 uses the matched-frustum ortho->perspective trick with fog dissolve as fallback.
- **Hex grid**: Axial (q,r) in an Int16Array, instance index -> coordinate table, six-delta neighbours, hexDistance = (|dq|+|dr|+|dq+dr|)/2; deterministic ring layout from the graph tree seeded by stochastic_seed
  why: The Sovereign Graph carries no geometry; a pure layout function is testable in Node and stable across ticks, which the truth buffer requires (texel i must always mean node i).
- **UI layer**: Preact 10 + @preact/signals, updated on events never per frame; native <dialog> for the Stage 1 Door fed by state.held and AwaitingHumanSignature, calling engine_authorize/engine_reject
  why: Keeps DOM work off the render loop; the render loop keeps running while the Door is open and the HUD shows the waiting house's burned_this_tick at 0.0, putting benchmark 3 on screen. Receipts, halt notes and liquidity_belief vs liquidity_truth are DOM.
- **State ingestion**: One EngineSource interface with three implementations: WasmSource (raw C ABI in a Web Worker, transferable Float32Array frames), StreamSource (WebSocket to the Tokio server, same JSON), TraceSource (replays presentation/trace.json); plus a proposed ~40-line engine_state_f32() ABI export
  why: The main thread only uploads a texture; JSON parsing happens in the worker (re-fetching memory.buffer each read since it detaches on growth). At 50k nodes JSON with receipts is several MB per tick, so a typed f32 export feeds the truth buffer by memcpy while JSON stays for the HUD.
- **Build tooling**: Vite 6/7 + TypeScript 5 + pnpm; cargo build --profile wasm --target wasm32-unknown-unknown --no-default-features (~320 KB); optional wasm-opt -Oz (binaryen, not installed); keep presentation/build.py for the single-file page
  why: All present on the machine except binaryen; the app serves .wasm for instantiateStreaming while the base64-inlined single file remains for the artifact/demo page.
- **Testing without a GPU**: vitest running the real wasm in Node for layout, hex math, event->pulse mapping and Frame packing (snapshotted against trace.json); glslangValidator compile-checks every chunk; Playwright + Chromium --use-angle=swiftshader for low-res pixel snapshots and a draw-call budget assertion (renderer.info.render.calls <= 12 at 50k tiles)
  why: Asserts architecture invariants that hold on software GL instead of fps numbers that do not; record_trace.mjs already proves the wasm-in-Node path.
- **Demo recording**: Director mode: fixed dt = 1/60, keyframed shot list (room -> through the ceiling -> street -> hex city -> tilt to country -> orbit), per-frame Playwright/CDP capture at 3840x2160 to PNG, ffmpeg -framerate 60 -c:v prores_ks -profile:v 3 (or libx264 -crf 16)
  why: The engine is seeded so every take is the same take; fixed-dt plus per-frame capture gives perfect 60 fps regardless of capture speed and keeps the 8-32 s STARK heartbeat legible. The cost-visible vs cost-hidden split-screen comes straight from the two recorded house runs. ffmpeg is installed.

## strengths
- Per-frame CPU cost is independent of node count: one texture upload per engine tick, everything else derived in shaders, so 50k tiles and 60 fps on a laptop is an architecture property rather than an optimisation.
- Maps one-to-one onto what the engine already emits: NodeView.confidence/fog/status/burned_this_tick feed the texture channels, and the 20 EngineEvent variants (StateSync with confidence_before, Approved/Rejected with gate, Netted, RolledBack, GlobalStateConfirmed with partitioned, Packed/Unpacked) each have a named visual.
- Honours the Golden Invariant visually: the renderer draws only the Sovereign Graph plus events, and stage transitions are gated by the engine's Packed/Unpacked events so the camera never shows a scale the engine is not simulating.
- Every non-pixel layer (layout, hex math, frame packing, event translation) is a pure function testable in Node against the real wasm, extending the record_trace.mjs path that already exists in presentation/.
- Deterministic seeds plus fixed-dt director mode make the YouTube take reproducible frame-for-frame, and the draw-call budget test guards the performance claim in CI without a GPU.
- Three ingestion sources behind one interface mean the same renderer runs the in-page wasm, a native streamed server, or a recorded trace where WebAssembly is blocked.

## risks
- The 50k-tile target is ahead of the engine: only house (Stage 1) and street (Stage 2, six houses) scenarios exist in engine/src/scenarios/mod.rs, so Stage 3-5 will first render a seeded synthetic graph fixture, and the video must say so in the laboratory's own spirit of not stretching a measurement.
- JSON state export scales with node count and includes receipt strings; at 50k nodes it is several MB per tick and will not hold 60 fps without the proposed engine_state_f32() typed export or stream deltas.
- NodeId/EnvelopeId are u64 serialised as JSON numbers; values above 2^53 lose precision in JavaScript (record_trace.mjs already wraps envelope ids in BigInt). Ids should be strings or parsed with a reviver before the graph grows.
- three.js WebGPURenderer/TSL APIs still move between releases and browser WebGPU coverage is uneven; WebGL2 must remain the shipping promise with WebGPU as a bonus, and the three version must be pinned.
- Per-fragment simplex noise at 2160p is fill-rate bound on older integrated GPUs; mitigate with a half-res fog pass and fewer octaves when zoomed out, and cap devicePixelRatio at 2. Apple M-series laptops are comfortable; older Intel iGPUs are not guaranteed.
- The Stage 3 -> 4 orthographic-to-perspective transition is the hardest shot and may need to fall back to a pure fog dissolve.
- The truth-buffer mapping requires the engine's state_view node ordering to be stable across ticks; this must be confirmed or an id->index map maintained on the frontend.
- Scope: five stage renderers is substantial work. Recommended order is Stage 3 hex grid (the performance proof), Stage 1 room (the Door), then 2, 5, 4.
- wasm-opt (binaryen) is not installed; the ~320 KB module ships un-optimised until brew install binaryen is run, which is acceptable but worth noting.

## write-up
# Truth Buffer: a render-performance-first frontend for The Agentic Economy

**Premise.** The engine already draws the line the design docs demand: the renderer sees only the Sovereign Graph (`StateView.nodes`, an array of `NodeView`) and the drained `EngineEvent` log (20 variants in `engine/src/events.rs`). Nothing else exists to draw. So the frontend's whole job is to turn one array of node views per tick into pixels at 60 fps, and to turn events into GPU-side effects that cost nothing per frame. The design below makes that literal: per-tick node state is uploaded once, as a texture, and everything visible is derived from it in shaders.

## 1. Renderer

**three.js (pin the current release; the WebGPU path stabilised around r167-r170) on WebGL2, with `WebGPURenderer` behind a query flag.** WebGL2 is the shipping baseline because it is the only thing guaranteed on every laptop the video will be watched on, and because the 50k-tile budget does not need compute shaders. three gives `InstancedMesh`, `DataTexture`, `RawShaderMaterial`, render targets and an orbit rig without writing a scene graph. Babylon 7/8 would also work; PixiJS 8 is ruled out by the globe and the isometric tilt.

Budget at Stage 3: one `InstancedMesh` of a 12-vertex hex prism (50,000 instances, one draw call), one instanced line mesh for the liquidity tubes, one pulse quad, one screen-space fog pass, DOM on top. Target: at most 12 draw calls. The Playwright test asserts that number, not fps.

## 2. The truth buffer

Per-node state lives in a 512x512 `RGBA16F` `DataTexture` (262,144 texels, 2 MB). Call it the truth buffer:

| channel | source (`NodeView`) | drives |
|---|---|---|
| R | `confidence` (the observed floor is 0.5636 after 20 handovers) | fog amplitude |
| G | `compute / compute_allocated` | tile brightness, battery |
| B | `burned_this_tick`, normalised | heat exhaust |
| A | packed `status` (active, waiting_at_door, halted, packed, partitioned) plus last-sync time | outline, sweep origin |

Instance *i* maps to texel *i*; the vertex shader fetches it with `texelFetch`. One `texSubImage2D` per engine tick replaces 50k per-instance attribute writes. Because ticks are blocks, not frames, the renderer holds two buffers (tick N and N+1) and lerps between them in the shader. Animation is free; the CPU touches nothing per frame.

## 3. Shaders

GLSL ES 3.00 split into `#include`d chunks via `vite-plugin-glsl`; 3D simplex noise from the Ashima/Gustavson `webgl-noise` set (MIT).

- **Fog of war.** `fog = 1 - confidence` warps the tile UVs, desaturates, and dithers alpha: crisp at 1.0, the reference distortion at 0.56. For a `packed` neighbourhood, `mean_confidence` sets amplitude and `epistemic_variance` sets noise frequency, so a street that disagrees with itself looks grainy rather than merely dim.
- **StateSync sweep.** The event stamps `syncTime = now` into the node's texel. The fragment shader draws an expanding `smoothstep` ring from the tile centre; the cascade to children and neighbours is `delay = hexDistance x 40 ms`, computed in-shader from axial coordinates. Set once, animated by the GPU.
- **Verification pulses.** A 64-slot uniform ring buffer of `(origin, t0, kind, gate)`. `Approved` and `Rejected` carry `gate: Stage`, so each gate has its own signature: a warm door-frame glow (1), a two-way dashed handshake along the `Settled` from-to segment (2), a radial `Netted` pulse from the clearinghouse showing gross collapsing to net (3), a broad `RolledBack` colour sweep across the region polygon (4), and a `GlobalStateConfirmed` radar line orbiting the globe over `latency_ticks` while `partitioned` countries dim (5).
- **Heat.** `Burn.joules` accumulates into B with exponential cooling.

## 4. Scenes and the camera rig

Five stage renderers share one context and one camera rig that owns a single log-scale **altitude** scalar. Stages 1-3 are orthographic (dimetric 2:1 cutaway room, street, hex city). Stages 4-5 are perspective: a 55-degree tilt over a displaced topographic heightfield, then an orbital globe with an equirectangular texture, instanced beacons per country, and a sun-terminator uniform for the energy-arbitrage shading.

Transitions are not a continuous world. Crossing an altitude threshold renders the outgoing stage to a half-resolution target and blends it with the incoming stage over about 600 ms, using the fog shader as the medium: the outgoing view decays into noise, the incoming one syncs into crispness. The blend is triggered by the engine's `Packed` and `Unpacked` events, so zooming *is* a StateSync visually, and the camera can never show a scale the engine is not simulating. The 3-to-4 cut uses the matched-frustum trick (a perspective fov chosen so the target plane equals the orthographic height); if it fights, fall back to the fog dissolve alone.

## 5. Hex grid

Axial `(q, r)` in an `Int16Array`, an instance-index-to-coordinate table, six-delta neighbour lookup, and `hexDistance = (|dq| + |dr| + |dq+dr|) / 2`. The Sovereign Graph carries no geometry, so layout is a pure function of the tree: a parent occupies a centre hex and children fill rings in graph order, offset by `stochastic_seed`. Pure functions are testable in Node and stable across ticks, which the truth buffer requires: texel *i* must always mean node *i*.

## 6. UI layer

**Preact 10 with `@preact/signals`**, updated on events, never per frame. The Stage 1 Door is a native `<dialog>` fed by `state.held` and `AwaitingHumanSignature`, showing `description` and `cost`; its buttons call `engine_authorize` and `engine_reject`. While it is open the render loop keeps running and the HUD shows the waiting house's `burned_this_tick` at 0.0, which is benchmark 3 on screen. Receipts, the halt `note`, and `liquidity_belief` against `liquidity_truth` are DOM, not canvas.

## 7. State ingestion

One `EngineSource` interface, three implementations, one `Frame` type (typed arrays plus an event list):

- `WasmSource`: the raw C ABI running in a **Web Worker**. The worker calls `engine_tick`, reads JSON out of linear memory (re-fetching `memory.buffer` on each read because it detaches on growth, as `record_trace.mjs` already does), and posts a transferable `Float32Array` frame. The main thread only uploads the texture.
- `StreamSource`: a WebSocket to the native Tokio server, same JSON shape, same worker parser.
- `TraceSource`: replays `presentation/trace.json` where WebAssembly is blocked. This already exists.

At Stage 3 scale JSON is the bottleneck: 50k `NodeView`s with receipt strings is several MB per tick. The proposal is a roughly 40-line addition in the engine's own ABI style, `engine_state_f32()`, writing `[confidence, compute_frac, burn, status]` per node into the out buffer for a straight memcpy into the truth buffer. JSON stays for the HUD.

## 8. Build

Vite 6/7, TypeScript 5, pnpm (installed). Engine: `cargo build --profile wasm --target wasm32-unknown-unknown --no-default-features` (present, about 320 KB); `wasm-opt -Oz` from binaryen is optional and not yet installed. Keep `presentation/build.py` for the single-file page; the app itself serves `.wasm` for `instantiateStreaming`.

## 9. Testing without a GPU

1. **Pure layers under vitest, against the real wasm in Node:** layout, hex math, event-to-pulse mapping, `Frame` packing, snapshot-tested against `trace.json`.
2. **Shader compile:** `glslangValidator` on every chunk in CI.
3. **Playwright with Chromium `--use-angle=swiftshader`:** low-resolution pixel snapshots per stage and the **draw-call budget assertion** (`renderer.info.render.calls <= 12` at 50k tiles). These are architecture invariants that hold on software GL.

## 10. Recording the video

The engine is seeded, so every take is the same take. Add a *director mode*: fixed `dt = 1/60`, a keyframed shot list (room, up through the ceiling, street, hex city, tilt to country, orbit), and per-frame capture through Playwright/CDP at 3840x2160 to PNGs, then `ffmpeg -framerate 60 ... -c:v prores_ks -profile:v 3` for editing or `libx264 -crf 16` for upload (ffmpeg is installed). Fixed dt plus per-frame capture yields perfect 60 fps regardless of capture speed, and the 8-32 s STARK heartbeat stays legible. The cost-visible versus cost-hidden split-screen comes straight from the two recorded house runs.

## Risks, plainly

- **The 50k tiles are ahead of the engine.** Only `house` and `street` scenarios exist. Stages 3-5 will first render a seeded synthetic graph; the video must say so, in the laboratory's own spirit of not stretching a measurement.
- **JSON at scale** is solved only by the typed export or stream deltas.
- **u64 ids:** JSON numbers above 2^53 lose precision in JavaScript (`record_trace.mjs` already wraps ids in `BigInt`); ids should be strings or parsed with a reviver.
- **WebGPU and TSL churn** between three releases; WebGL2 is the promise, WebGPU the bonus.
- **Fill rate:** per-fragment noise at 2160p on an older integrated GPU; mitigate with a half-resolution fog pass and fewer octaves when zoomed out. Apple M-series is comfortable.
- **The 3-to-4 orthographic-to-perspective cut** is the hardest shot.
- **Node ordering** in `state_view` must be stable across ticks, or the frontend keeps an id-to-index map.
- **Scope:** five renderers. Build order: Stage 3 grid (the performance proof), Stage 1 room (the Door), then 2, 5, 4.