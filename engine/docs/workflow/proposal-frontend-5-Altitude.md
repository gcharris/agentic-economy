# Altitude
angle: Camera-and-feel-first: one altitude scalar drives the camera, the LOD, the shaders and the engine's zoom, so the descent from orbit to the oak table is one continuous motion, and the engine's Packed/Unpacked events are what the transition visibly waits for.

Three.js r186 on WebGL2 (WebGPU behind a flag) with one never-swapped perspective camera whose field of view and distance are both functions of a single altitude scalar, giving a seamless isometric-to-orbital zoom. The renderer draws only the engine's StateView and EngineEvent log, ingested from the ~320 KB wasm cdylib in a Worker, from a WebSocket stream, or from a recorded trace behind one interface. Fog, sweeps and gate pulses are driven directly by exported state; tests run GPU-less on SwiftShader (verified on this machine today), and the demo is rendered frame-stepped through WebCodecs into a 4K60 MP4.

## stack
- **Renderer**: three@0.186.1 (WebGLRenderer), custom GLSL ES 3.0 via ShaderMaterial/onBeforeCompile, postprocessing@6.39.5 for bloom/SMAA/fog Effect, vite-plugin-glsl@1.6.1
  why: Scene is ~10k instanced hexes plus particles and a globe, well inside WebGL2 headroom at 4K; Three's WebGPURenderer with WebGL2 fallback is the later migration path without a rewrite. PixiJS 8 is 2D-only, Babylon 9 is heavier and less shader-hackable, regl means writing everything.
- **Camera and scene architecture**: Single PerspectiveCamera; altitude A in [0,4] drives fov (4 deg iso for A<=3.5, opening to 40 deg with a dolly-zoom for 3.5..4), a uCurvature vertex uniform curls the country into the globe; cutaway room via clippingPlanes; maath@0.10.8 damped spring; hysteresis 0.6 up / 0.4 down calls engine_zoom
  why: No orthographic/perspective camera swap means no seam; the same descend-into-a-tile trick serves city, street and room, which is the fractal rule as a camera move.
- **Hex grid**: In-house axial (q,r) pointy-top math for the city (InstancedMesh, one draw call, per-instance aConfidence/aBurn/aStatus/aUnpack); h3-js@4.5.0 res 1-2 cells for the planet; seeded heightfield with shader contour lines for the country
  why: Layout is a pure function of graph plus seed, so replays lay out identically; H3 tiles the sphere in the same hex language as the city so the fractal rhymes visually.
- **Fog, sweep, pulses**: fog = 1 - confidence into 3D simplex noise with domain warp (UV displacement, desaturation, static, chroma split below the engine's 0.75 hallucination threshold); packed parents map mean_confidence to density and epistemic_variance to flicker; StateSync sweeps as a plane wave in a ring buffer of 8 with cascade delay = hex distance; one pulse vocabulary per gate
  why: Every visual is a function of an exported field or an event, never of art direction alone, which is what 'render only the Sovereign Graph plus events' means in practice.
- **LOD transition**: Frontend never packs; it moves the camera, calls engine_zoom, and animates only when Packed/Unpacked arrive: haze condenses into children seeded by stochastic_seed, purse gauges interpolate to each child's next-frame value, burn_distributed falls as embers; pack is the inverse ending in a profile card
  why: The engine owns the state transition; the one-tick latency is shown as stasis haze rather than hidden.
- **UI layer**: solid-js@1.9.15 HUD (purse, Phi meter, receipts, event feed, stage rail); DOM <dialog> for the Door wired to engine_authorize/engine_reject; DOM labels projected; troika-three-text@0.52.5 for in-scene numerals
  why: Fine-grained signals update numbers per tick rather than diffing a tree; the Door as a DOM modal is accessible, styleable as the porter's note, and cheap to test.
- **State ingestion**: EngineSource interface producing Frame{tick,state,events}: WasmSource (cdylib in a Web Worker, raw C ABI, ~40-line loader, no wasm-bindgen), StreamSource (WebSocket JSON lines from the native Tokio server), TraceSource (replays trace.json); TickClock interpolates and schedules event clips across each block interval
  why: The recorded-trace shape already exists in record_trace.mjs; three sources behind one interface make tests and the demo deterministic and keep the render thread free.
- **Build tooling**: vite@8.3.1, TypeScript 7.0, ts-rs@12.0.1 deriving StateView/EngineEvent/HeldView types from the Rust structs, cargo build --profile wasm --target wasm32-unknown-unknown --no-default-features, optional wasm-opt -Oz
  why: The Rust-to-TS contract becomes a compile-time check; the wasm profile already yields the small build the page embeds.
- **Testing without a GPU**: vitest@5.0.2 for hex math, hysteresis, scheduler, unpack determinism, Frame reducer and a real-wasm-in-Node parse test; @playwright/test@1.63.0 Chromium with --use-angle=swiftshader --enable-unsafe-swiftshader for golden screenshots per stage from TraceSource, page.clock frozen, pixelmatch@7.2.0 at <=0.5% differing pixels, console listener failing on shader errors
  why: Verified today on this machine: headless Chrome 153 renders WebGL2 in software (SwiftShader Device, red test pixel 255,0,0,255) and exposes a SwiftShader WebGPU adapter under --enable-unsafe-webgpu --use-webgpu-adapter=swiftshader; headless-gl is WebGL1-only and unusable.
- **Recording the demo**: ?take= mode loading a Take (trace, camera keyframes, tick duration, HUD toggles) stepped at a fixed 1/60 s; each frame to WebCodecs VideoEncoder (H.264 High or AV1, 3840x2160) muxed by mp4-muxer@5.2.2 and saved via the File System Access API; ffmpeg 8.1 (installed) for voice-over and cut; OBS Studio for hands-on segments on the M4
  why: Frame-stepped encoding never drops a frame regardless of render speed; the same trace and take make the shot reproducible; uploading 4K60 gets YouTube's VP9/AV1 tier.

## strengths
- One scalar (altitude) is the single source of truth for camera, LOD, shader density, HUD and engine_zoom, so the zoom cannot desynchronise from the simulation.
- No camera swap anywhere: the dolly-zoom plus curvature uniform gives a genuinely continuous path from the isometric city to the orbital sphere.
- Every visual effect is a function of an exported state field or an EngineEvent (fog from confidence, flicker from epistemic_variance, sweeps from StateSync, cascade order from hex distance), which enforces the 'render only the Sovereign Graph plus events' rule structurally, with ts-rs making the contract a compile-time check.
- The pack/unpack transition waits for the engine's own Packed/Unpacked events and shows the one-tick latency as stasis haze rather than faking it.
- Three ingestion sources behind one interface: the same renderer runs live wasm, a streamed native server, or a recorded trace, and the trace shape already exists in the laboratory.
- GPU-less CI is not a hope: SwiftShader WebGL2 and WebGPU were both verified on this machine with Chrome 153 today.
- Deterministic frame-stepped WebCodecs recording produces YouTube-grade 4K60 with zero dropped frames and a reproducible shot list.
- Every named library version was checked against the npm and crates.io registries today.

## risks
- The engine ships scenario constructors for the house and the street only (scenarios/mod.rs); Netted, RolledBack and GlobalStateConfirmed exist as events but no city, country or world scenario. Stages 3-5 cannot be live until scenarios::city/country/world exist; until then they run on a clearly labeled synthetic event script.
- engine_state serialises the whole StateView every tick, including receipts; at thousands of nodes that is megabytes of JSON per block. A delta export or binary frame is needed before a live city; the Worker keeps it off the render thread but not off the wall clock.
- The flat-to-globe morph between altitude 3.5 and 4 is the hardest shot in the piece; the fallback is a 400 ms cross-dissolve.
- Software-rendered goldens differ per pixel from GPU renders (noise, bloom), so the reference set must be SwiftShader and the comparison perceptual, or the suite will flake.
- WebGPU in Safari and Three's TSL are not mature enough to be the demo's foundation; the demo stays on WebGL2 and WebGPU remains a flag.
- Trace replay is indistinguishable from a live run on screen; the recorded-run banner must stay, as the existing page already does.
- 4K bloom and full-screen noise are heavy on integrated GPUs; render scale must be capped and a quality toggle exposed.
- wasm-opt is not installed here and TypeScript 7 is new; both are optional and 5.x TypeScript works, but the toolchain should be pinned before the demo week.

## write-up
# Altitude: a camera-first frontend for The Agentic Economy

## The one idea

The whole frontend hangs on a single scalar, **altitude** `A ∈ [0, 4]`. `round(A)` is the stage (0 room … 4 orbit); `frac(A)` is how far through a transition you are. Camera, LOD, shader density, HUD and the engine's `engine_zoom(stage)` all read this one number. Nothing else in the renderer decides scale. The renderer draws exactly two things: the `StateView` (the Sovereign Graph's node views) and the `EngineEvent` log. It never sees an Oak Table; the TypeScript types are generated from the Rust structs, so it cannot.

## Renderer: Three.js r186 on WebGL2, WebGPU behind a flag

`three@0.186.1` with `WebGLRenderer`. The scene is small by game standards, roughly 10k instanced hex prisms, a few thousand particles and one globe, so WebGL2 has headroom at 4K. Custom GLSL ES 3.0 via `ShaderMaterial`/`onBeforeCompile`, chunked with `vite-plugin-glsl@1.6.1`. `postprocessing@6.39.5` (pmndrs) supplies bloom, SMAA and one custom `Effect` for the fog. Three's `WebGPURenderer` with its WebGL2 fallback is the migration path; TSL is not yet stable enough to carry a demo that must never flicker. Considered and set aside: PixiJS 8 (2D only; the cutaway room and the globe want depth), Babylon 9 (capable, heavier, less shader-hackable), regl (perfect, but you write everything).

## Camera architecture across the five stages

One `PerspectiveCamera`, never swapped. For `A ≤ 3.5` it sits far along the isometric direction (yaw 45°, pitch 35.26°) with a 4° field of view: visually orthographic, no matrix change, no seam. Between 3.5 and 4 the FOV opens to 40° while the distance shrinks to hold the target's apparent size (`d = h / (2·tan(fov/2))`, a dolly-zoom), and a `uCurvature` vertex uniform curls the flat country into a sphere. Stages 1–3 are the same trick repeated: the camera descends into one tile and the tile's interior *is* the next scene. City hex, then its street lane, then one house whose roof and front wall are removed by `clippingPlanes` as `A` drops below 0.5. Rig smoothing is a frame-rate-independent damped spring (`maath@0.10.8`). Hysteresis at k+0.6 going up and k+0.4 going down calls `engine_zoom`, so a wobble at a threshold never thrashes pack/unpack.

## Hex grid

City (Stage 3): axial `(q, r)` pointy-top, Red Blob math written in-house (about 80 lines: round, distance, ring, spiral). Layout is a pure function of the graph and the engine seed: clearinghouse at (0,0), neighborhoods on rings 1–2, foundries on the rim, so a replayed trace lays out identically. One `InstancedMesh`, one draw call, per-instance floats `aConfidence, aBurn, aStatus, aUnpack`. World (Stage 5): `h3-js@4.5.0` at resolution 1–2 (842 / 5,882 cells) on the sphere, so the planet is tiled in the city's own hex language and the fractal rhymes visually. Country (Stage 4): cities as nodes on a seeded heightfield with contour lines drawn in the fragment shader (`fract(height·N)`), the three money tiers as three ribbons.

## Fog, sweep, pulses: driven by state, not by art

`fog = 1 − confidence`, which the engine already exports per node. 3D simplex noise with domain warp: UV displacement `0.04·fog`, desaturation `0.7·fog`, static `fog²`, and below the engine's `HALLUCINATION_THRESHOLD = 0.75` a chroma split begins. For packed parents, `mean_confidence` sets spatial density and `epistemic_variance` sets temporal flicker: the profile card shimmers with its own variance.

StateSync: a ring buffer of eight sweeps `(origin, t0)`; a plane wave `band = 1 − smoothstep(0, w, |dist − v(t − t0)|)` emits gold into bloom and clears fog behind the front, then the next frame's `confidence = 1.0` takes over. Cascade delay equals hex distance from the origin, so a `Netted` event at the clearinghouse rolls outward ring by ring.

Gate pulses, one vocabulary per stage: the Door (porter walks, modal opens, holding counter stays at 0.0 cr); the Letter Slot (two arcs meet in four beats, lock/swap/verify/settle, a hash mismatch snaps them back red); the Clearinghouse (tube glow shrinks from `gross` to `net`); the Court (`RolledBack` sweeps the country backwards to `to_tick`); STARKs (`GlobalStateConfirmed` expands a radar ring for `latency_ticks`, `partitioned` cells go dark).

## The LOD transition, made visible

The frontend never packs on its own. It moves the camera, calls `engine_zoom`, and waits for `Packed` or `Unpacked`. Unpack: the parent's haze condenses into `children` sprites seeded from the last `stochastic_seed`; purse gauges interpolate from the parent's value to each child's actual next-frame value over 600 ms, with `burn_distributed` falling as embers. Pack is the inverse, ending in the profile card. The typical wait is one tick, and the tile shows stasis haze in between: honest latency, shown.

## UI layer

`solid-js@1.9.15` for the HUD (purse, Φ meter, receipts ledger, event feed, stage rail); fine-grained signals mean a tick updates numbers, not a tree. The Door is a DOM `<dialog>` styled as the porter's note, opened by `AwaitingHumanSignature` and wired to `engine_authorize`/`engine_reject`. Labels are DOM elements projected onto the canvas; `troika-three-text@0.52.5` where a numeral must sit on geometry.

## State ingestion: three sources, one interface

`EngineSource { start, onFrame, authorize, reject, topUp, zoom }` producing `Frame { tick, state, events }`, the shape `record_trace.mjs` already writes. **WasmSource**: the ~320 KB cdylib in a Web Worker, loaded with about 40 lines and no wasm-bindgen: `engine_tick`, then `engine_state`/`engine_events` read from `engine_out_ptr` (re-fetch `memory.buffer` on every call; it detaches on growth). **StreamSource**: WebSocket JSON lines from the native Tokio server, same shape. **TraceSource**: replays `trace.json`; this is what tests and the recorded demo run on. Rendering runs at 60 fps while frames are discrete blocks, so a `TickClock` interpolates and schedules event clips across the block interval (1.2 s per tick in the room, 0.4 s in the city, the 8–32-tick heartbeat in orbit).

## Build

`vite@8.3.1` and TypeScript 7.0; `ts-rs@12.0.1` derives `StateView`, `EngineEvent` and `HeldView` types from the Rust structs, so the contract is enforced at compile time. `cargo build --profile wasm --target wasm32-unknown-unknown --no-default-features`, optionally `wasm-opt -Oz` (binaryen; not installed here).

## Testing without a GPU

Three tiers. (1) `vitest@5.0.2` in Node: hex math, altitude hysteresis, the event scheduler, unpack determinism (same seed, same positions), the Frame reducer, and a test that loads the real wasm in Node and parses `engine_state()` against the generated types. (2) `@playwright/test@1.63.0` Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader`. Verified today on this machine: headless Chrome 153 renders WebGL2 in software (renderer reports `SwiftShader Device`, test pixel `255,0,0,255`), and `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader` yields a WebGPU adapter as well. Golden screenshots per stage from TraceSource with `page.clock` frozen, `pixelmatch@7.2.0` at no more than 0.5% differing pixels, and a console listener that fails the run on any shader compile error. (3) `headless-gl` is WebGL1 only and is not usable.

## Recording the YouTube demo

A `?take=oak-table-to-orbit` mode loads a Take: a trace, camera keyframes (altitude, target, yaw, easing, holds), tick duration and HUD toggles, and steps the loop at a fixed 1/60 s. Each stepped frame becomes a WebCodecs `VideoFrame`, goes through `VideoEncoder` (H.264 High or AV1 at 3840×2160), is muxed by `mp4-muxer@5.2.2` and saved with the File System Access API. Slower than real time if it must be; every frame lands. `ffmpeg 8.1` (installed) for voice-over, music and cut; upload 4K60 so YouTube assigns its VP9/AV1 tier. Hands-on segments: OBS Studio capturing headed Chrome on the M4.

## Risks, plainly

1. The engine ships scenarios for the house and the street only. `Netted`, `RolledBack` and `GlobalStateConfirmed` exist as events, but there is no city, country or world constructor. Stages 3–5 need `scenarios::city/country/world` before they can be live; until then they run on a labeled synthetic event script, and the demo must say so.
2. `engine_state` serialises the whole view every tick; at thousands of nodes that is megabytes of JSON per block. A delta export or binary frame is needed before the city is live.
3. The flat-to-globe morph is the hardest shot; the fallback is a 400 ms cross-dissolve.
4. Software-rendered goldens differ per pixel from GPU renders; the reference must be SwiftShader and the threshold perceptual.
5. WebGPU in Safari and TSL maturity: stay on WebGL2 for the demo.
6. Trace replay looks live; keep the recorded-run banner the existing page already has.
7. 4K bloom on integrated GPUs; cap render scale and expose a quality toggle.