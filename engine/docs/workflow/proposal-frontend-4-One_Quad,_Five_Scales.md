# One Quad, Five Scales
angle: engineering-simplicity-first: fewest moving parts, one language for the whole client, testable without a GPU, publishable as a static page

A TypeScript-only client that draws every stage of The Agentic Economy with a single instanced unit quad and a handful of fragment shaders on raw WebGL2 (twgl.js as the only rendering helper), lays the hex grid out deterministically from the Sovereign Graph, ingests the engine through one Frame contract from three interchangeable sources (wasm worker, recorded trace, WebSocket stream), keeps all text and the Stage 1 Door in plain DOM (`<dialog>`), tests 95% of the client as pure functions in Vitest against the real wasm engine and the remaining 5% in headless Chromium on SwiftShader, and records the YouTube demo as deterministic 4K frames stepped by a director track and stitched with ffmpeg.

## stack
- **Language & runtime**: TypeScript 5.8 everywhere (client, vite.config.ts, record_trace.ts, render.ts, tests); Node 23 runs .ts directly with --experimental-strip-types (tsx as fallback)
  why: One language for the whole client and its tooling; the machine already has Node 23.2. The current build.py migrates to build.ts so the one-language claim holds end to end.
- **Renderer**: Raw WebGL2 + twgl.js 5.x (~30 KB helper for program/buffer/uniform boilerplate, not a framework). No WebGPU path yet.
  why: Every stage is drawn by one vertex shader and one drawArraysInstanced call over a unit quad; the fragment shader is the material (hex tile, house lot, room fixture, agent, pulse, terrain, planet). WebGL2 is universal today; the wrapper is ~500 lines, so a later GLSL-to-WGSL port is a port, not a rewrite.
- **Math**: gl-matrix 3.4.3 for the 3x3 camera affine (or 40 hand-written lines)
  why: The camera is a 2D affine plus a constant isometric skew baked into the vertex shader; nothing needs a full 3D matrix stack.
- **Scene & camera**: One continuous camera {x, y, zoom}; five LOD bands by zoom; 400 ms cross-dissolve-and-scale at band edges; engine_zoom(stage) called at the midpoint; Packed/Unpacked events animate children flying into and out of the parent hex
  why: The 'Powers of Ten' cut is honest about the fact that a sphere does not unfold into a hex map, and it costs no framebuffers. The LOD fold/unfold visual comes free from events the engine already emits.
- **Hex grid**: Axial (q, r) cube coordinates, ~40 lines after Red Blob Games; no hex library. Layout is a pure function of the Sovereign Graph: parent at center, children in spiral rings by index, seeded by NodeId. One Float32Array instance buffer, 12 floats per node.
  why: The geometry IS the graph, so 'render only the Sovereign Graph' is structural, not a convention. A typed array snapshot is the unit of test.
- **Stage visuals**: S1 room: SDF fixtures (Desk, Purse, Oak Table, Door) plus four seat quads moving between stations on Thought/Burn/AwaitingHumanSignature, speech bubbles in DOM. S2 street: isometric house-lot SDF strip, courier pulses on Proposed/Delivered, handshake bolt on Settled, revert flash on Rejected. S3 city: hex grid with the Clearinghouse at center, Netted fires radial tube pulses. S4 country: full-screen fbm heightfield with contour lines, cities as hex nodes, RolledBack is a colour sweep. S5 world: full-screen ray-sphere SDF with fbm continents and a time-driven sun terminator, GlobalStateConfirmed is a radar sweep, partitioned countries go dark.
  why: Everything is procedural and seeded, so there are zero art assets to load, the static page is self-contained, and every pixel traces back to a node id or an EngineEvent.
- **Fog-of-war & effects shaders**: Per-instance confidence uniform; fog = 1 - confidence drives 3-octave simplex fbm (Ashima GLSL, public domain, inlined) that displaces UV, desaturates and adds static. StateSync sets sync_t0 and a bright diagonal band crosses the tile in 600 ms, cascading to children at 80 ms per ring. A second pooled instance buffer (cap 4096) draws verification pulses: ring, bolt, tube, sweep, one per gate type.
  why: Matches doc 02 exactly: 1.0 crisp, 0.56 visibly corrupted, sweep resets to crisp. The frontend never computes decay; it reads confidence and fog from NodeView.
- **UI layer**: Plain DOM + CSS, no framework. Native <dialog>.showModal() for the Stage 1 Door driven by AwaitingHumanSignature, buttons call engine_authorize/engine_reject. HUD from TickCommitted (tick, root, active scale, node counts), Note ledger from Halted, stage breadcrumb. Escape hatch: Preact 10 (3 KB) if it ever grows.
  why: Text in WebGL is the classic pain; DOM does it for free. The modal is non-blocking to the rest of the scene, and the HUD showing 'holding cost 0.0' while the dialog is open is benchmark 3 on screen.
- **State ingestion**: One Frame = {tick, state: StateView, events: EngineEvent[]}. Interface EngineSource {step, authorize, reject, topUp, zoom, setTruthPrice} with three implementations: WasmSource (raw C ABI in a Web Worker, the exact engine_out_ptr + TextDecoder protocol already in record_trace.mjs, no wasm-bindgen), TraceSource (replays trace.json, already produced), StreamSource (WebSocket JSON frames from the native server).
  why: The renderer never knows which source it has. The worker keeps engine_tick off the main thread; the source is the only caller of engine_events, so drained events are never lost.
- **Build tooling**: Vite 6 (vite build -> dist/), GLSL imported with ?raw, wasm as a sibling asset via ?url, optional base64 inlining for the single-file artifact the presentation already ships
  why: One command, one config file in TypeScript, a static directory that any host serves. No bundler plugins beyond what Vite ships.
- **Testing without a GPU**: Tier 1: Vitest 3, pure functions (hex math, layout, instance packing as Float32Array snapshots, event reducers, camera bands, worldToScreen) driven by the REAL wasm engine in Node's built-in WebAssembly. Tier 2: Playwright 1.5x + headless Chromium with --use-angle=swiftshader (software WebGL2) compiles every shader, asserts COMPILE/LINK status, and takes low-res golden screenshots with maxDiffPixelRatio 0.02. Tier 3: determinism test, same seed + same director track yields byte-identical instance buffers every frame.
  why: 95% of the client is a pure function from Frame to typed arrays and runs anywhere; the 5% that touches GL runs on the same software rasterizer GitHub Actions runners use.
- **YouTube recording**: render.ts: Playwright driving real Chrome on this Mac, viewport 1920x1080 at deviceScaleFactor 2 = 3840x2160; the app exposes app.step(dt) so time is a parameter, no rAF; a director track JSON (camera keyframes, stage changes, door decisions, truth-price shocks, captions) drives both the live demo and the render; per-frame page.screenshot -> PNG; ffmpeg 8 -framerate 60 to ProRes 422 HQ for editing or libx264 -crf 15 -pix_fmt yuv420p for upload; the same track emits an SRT for narration alignment
  why: Deterministic frame stepping gives a flawless 4K60 render that a live capture never will, and the identical track replays live during the talk. Playwright's built-in 25 fps VP8 recorder is not used; OBS is the fallback for a live-narrated take.

## strengths
- One rendering primitive for all five stages: an instanced unit quad plus fragment-shader materials, so there is no scene graph, no mesh pipeline, no asset loader and no 3D library to learn or upgrade.
- The 'render only the Sovereign Graph' rule is enforced by construction: the scene builder is a pure function of (Frame, previousScene, now), and the hex layout is derived from node ids, so a test can prove nothing else is drawn.
- Three engine sources behind one Frame contract: the same client runs the wasm engine live, replays a recorded trace when WebAssembly is blocked (already the case in the current presentation), or follows a native server stream, with no renderer changes.
- Almost the entire client is GPU-free testable, and the tests run against the real Rust engine compiled to wasm inside Node, not against mocks.
- Zero art assets and fully procedural, seeded visuals mean the static page is self-contained, deterministic, and small (engine 316 KB + a few hundred KB of TypeScript and GLSL).
- The Stage 1 Door is a native <dialog>: the human sits at the boundary, the rest of the world keeps moving, and the HUD shows the 0.0 holding cost from benchmark 3 live on screen.
- The demo recording is a deterministic offline render driven by the same director track as the live demo, giving broadcast-quality 4K60 with no dropped frames and reproducible takes.
- Every effect maps to an existing EngineEvent (StateSync, Packed/Unpacked, Netted, GlobalStateConfirmed, Rejected, Halted); no new engine work is needed to ship the first visual.

## risks
- No true 3D meshes: the architecture doc says 'isometric 3D models'. This stack gives the isometric look through 2.5D SDF materials; if real modelled buildings are required later, the renderer is a dead end and three.js (r170 or later) replaces it, with the shaders and the Frame contract surviving.
- Procedural-everything can look sterile, and the Stage 1 room needs warmth and character to carry the narrative; mitigation is one sprite-atlas PNG for the room (the pipeline already draws textured quads), but that is an art dependency the simplicity story otherwise avoids.
- The sphere-to-map transition between Stage 5 and Stage 4 is a cross-dissolve, not geometric continuity; it is a defensible 'Powers of Ten' cut but not the seamless zoom the design docs imply.
- SwiftShader golden screenshots drift across Chromium versions; pin the Playwright version, keep goldens low-resolution, and use a diff tolerance, accepting that a Chromium bump means regenerating goldens.
- engine_state serialises the entire world as JSON every tick: fine at Stages 1 and 2, but at Stage 5 with thousands of nodes it becomes megabytes per tick; the Web Worker hides the CPU cost but not the memory, so the engine will eventually need a per-active-scale view or delta output.
- WebGL2 has a long horizon but WebGPU is the future; the wrapper is ~500 lines and GLSL to WGSL is a port, yet it is real work that this stack defers rather than avoids.
- Canvas and DOM text share coordinates through one worldToScreen function; any camera change that forgets the DOM side produces misaligned speech bubbles and labels, so that function must stay tested.
- Library versions are cited from memory because the npm registry is unreachable from this sandbox; verify at first install. Node's --experimental-strip-types is still experimental, tsx is the fallback.

## write-up
# One Quad, Five Scales

**A frontend stack for The Agentic Economy, engineering-simplicity-first.**

The client draws only two things: the Sovereign Graph as the engine's `StateView` publishes it, and the `EngineEvent` stream. Nothing else exists to draw. That single fact lets the whole frontend collapse to one rendering primitive, one language, one ingestion contract, and a test suite that mostly never touches a GPU.

## Renderer: raw WebGL2, one instanced quad

Every stage is rendered by one vertex shader and one `drawArraysInstanced` call over a unit quad. The fragment shader is the material, selected by an instance attribute: hex tile, house lot, room fixture, agent seat, pulse, terrain, planet. The only rendering library is **twgl.js 5.x**, a ~30 KB helper that removes the program/buffer/uniform boilerplate without imposing a scene graph. **gl-matrix 3.4.3** supplies the 3×3 camera affine; the isometric skew is a constant 2×2 baked into the vertex shader.

No WebGPU path for now. WebGL2 is universal, the wrapper is about 500 lines, and the shaders are the real asset; a later GLSL→WGSL port is a port, not a rewrite. three.js (r170+) and PixiJS 8 were considered and rejected for this angle: both add a framework where the requirement is a handful of materials.

## Scene and camera across the five stages

There is one continuous camera `{x, y, zoom}` and five LOD bands defined by zoom. Crossing a band triggers a 400 ms cross-dissolve-and-scale, with `engine_zoom(stage)` called at the midpoint. The engine's own `Packed` and `Unpacked` events animate children flying into and out of the parent hex, so the LOD fold is a visual the engine already pays for.

- **Stage 1, the room:** SDF fixtures for the Desk, Purse, Oak Table and Door; four seat quads (Scribble, Scout, Inspector, Porter) move between stations on `Thought`, `Burn` and `AwaitingHumanSignature`. Speech bubbles are DOM.
- **Stage 2, the street:** an isometric strip of house-lot SDFs. `Proposed`/`Delivered` spawn courier pulses; `Settled` draws a two-way handshake bolt; `Rejected` flashes a revert.
- **Stage 3, the city:** the hex grid proper, Clearinghouse at the centre. `Netted` fires tube pulses from every street hex inward.
- **Stage 4, the country:** a full-screen fbm heightfield with contour lines, cities as hex nodes, three rails as coloured line quads. `RolledBack` is a broad colour sweep.
- **Stage 5, the world:** a full-screen ray-sphere SDF with fbm continents and a time-driven sun terminator. `GlobalStateConfirmed` is a radar sweep; partitioned countries go dark.

Everything is procedural and seeded from node ids. There are zero art assets.

## The hex grid

Axial `(q, r)` cube coordinates, about forty lines after Red Blob Games; no hex library. Layout is a pure function of the graph: a parent sits at the centre and its children occupy spiral rings by index, seeded by `NodeId`. The representation is one `Float32Array` with a 12-float stride per node:

```
[q, r, stage, status, confidence, burn_this_tick,
 sync_t0, halt_t0, parent_q, parent_r, pack_t, seed]
```

That typed array is the unit of test and the unit of upload.

## Fog, sweep, pulses, the Door

`confidence` arrives per node in `NodeView`; the shader computes `fog = 1 - confidence` and feeds it to a 3-octave simplex fbm (the public-domain Ashima GLSL, inlined) that displaces UV, desaturates and adds static. 1.0 is crisp; 0.56, the empirical floor from benchmark 2, is visibly corrupted. The frontend never computes decay.

`StateSync` sets `sync_t0`; a bright diagonal band crosses the tile in 600 ms and cascades to children at 80 ms per ring. A second pooled instance buffer (cap 4096) draws verification pulses: ring, bolt, tube and sweep, one per gate.

The Stage 1 Door is a native `<dialog>` opened by `showModal()` on `AwaitingHumanSignature`; its buttons call `engine_authorize` / `engine_reject`. The rest of the world keeps moving, and the HUD shows the holding cost as 0.0 while it is open, which is benchmark 3 rendered live.

## UI layer

Plain DOM and CSS, no framework. HUD from `TickCommitted` (tick, root, active scale, node counts), a Note ledger from `Halted`, a stage breadcrumb. Text lives in DOM because text in WebGL is the classic pain. Escape hatch if it grows: Preact 10 at 3 KB.

## State ingestion: one Frame, three sources

```ts
type Frame = { tick: number; state: StateView; events: EngineEvent[] };
interface EngineSource {
  step(): Promise<Frame>;
  authorize(env: bigint): void; reject(env: bigint): void;
  topUp(node: bigint, cr: number): void; zoom(stage: 1|2|3|4|5): void;
  setTruthPrice(p: number): void;
}
```

`WasmSource` runs the raw C ABI in a Web Worker using exactly the `engine_out_ptr` + `TextDecoder` protocol already in `presentation/record_trace.mjs`; no wasm-bindgen. `TraceSource` replays `trace.json`, which already exists and already carries the door decisions. `StreamSource` reads identical JSON frames over a WebSocket from the native server. The renderer never learns which one it has, and the source is the sole caller of `engine_events`, so drained events are never lost.

## Build tooling

**TypeScript 5.8** everywhere, including `vite.config.ts`, `record_trace.ts` and `render.ts`; Node 23 on this machine runs `.ts` directly with `--experimental-strip-types` (tsx as fallback). **Vite 6**: `vite build` produces `dist/`, GLSL comes in via `?raw`, the wasm as a sibling asset via `?url`, with optional base64 inlining to keep the single-file artifact the presentation already ships. `build.py` migrates to `build.ts` so the one-language claim holds.

## Testing without a GPU

1. **Vitest 3, pure functions:** hex math, layout, instance packing (snapshot the `Float32Array`), event reducers, camera bands, `worldToScreen`, and the invariant that the scene builder is a pure function of `(Frame, previousScene, now)`. These tests drive the *real* wasm engine inside Node's built-in `WebAssembly`; nothing is mocked.
2. **Playwright 1.5x + headless Chromium with `--use-angle=swiftshader`:** compiles every shader and asserts `COMPILE_STATUS`/`LINK_STATUS`, then takes low-resolution golden screenshots with `maxDiffPixelRatio: 0.02`. This is the same software rasterizer GitHub Actions runners use.
3. **Determinism:** same seed plus same director track yields byte-identical instance buffers on every frame.

## Recording the YouTube demo

`render.ts` drives real Chrome on this Mac through Playwright at a 1920×1080 viewport with `deviceScaleFactor: 2`, i.e. 3840×2160. The app exposes `app.step(dt)`; time is a parameter and there is no `requestAnimationFrame` in render mode. A director-track JSON (camera keyframes, stage changes, door decisions, truth-price shocks, captions) drives both the live demo and the render. Each frame is a `page.screenshot` PNG; **ffmpeg 8** (installed here) stitches at 60 fps to ProRes 422 HQ for editing or `libx264 -crf 15 -pix_fmt yuv420p` for upload. A minute is 3,600 frames, roughly ten minutes of rendering. The same track emits an SRT so narration lines up. Playwright's built-in 25 fps VP8 recorder is not used; OBS is the fallback for a live-narrated take.

## Risks, stated plainly

- **No real 3D meshes.** The architecture doc says \"isometric 3D models\"; this gives the isometric *look* via 2.5D SDFs. If modelled buildings are demanded later, the renderer is a dead end and three.js replaces it, with shaders and the Frame contract surviving.
- **Procedural sterility.** The room needs character; the mitigation is one sprite-atlas PNG, an art dependency the rest of the stack avoids.
- **The sphere-to-map cut** is a dissolve, not continuity.
- **SwiftShader goldens drift** across Chromium versions; pin Playwright, keep goldens small, regenerate on bumps.
- **`engine_state` serialises the whole world per tick.** Fine at Stages 1 and 2; megabytes per tick at Stage 5. The Worker hides CPU, not memory; the engine will need a per-active-scale view or deltas.
- **WebGL2 versus WebGPU** is deferred, not avoided.
- **Versions above are cited from memory**; the npm registry was unreachable from this sandbox. Verify at first install.