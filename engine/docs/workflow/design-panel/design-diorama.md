# DESIGN.md · The Diorama

**One direction for the frontend of The Agentic Economy.** A model-maker's miniature: room, street and city are one architectural model under warm lamps: oak, brass, linen, tilt-shift focus, long shadows, dust in the lamplight. The staff are carved figures. The zoom pulls back from a model on a table until the table is the world. Only `StateView` and `EngineEvent` are drawn.

## 1. Principles

1. **A model is private until a figure carries something to its edge**: nothing inside an interior is drawn on any other tile; nothing is shared by default.
2. **State moves only on a rim**: the Door step, the kerb, the dome, the Court's line and the armillary ring get the animation budget; interiors are still.
3. **The engine's word is the only motion**: a clip starts on an event with a tick and an arrival time, never on a value that changed.
4. **A miniature never lies about scale**: one camera, one altitude, one lamp rig; roof, plinth, plateau and globe are interior, rim and gate at five distances.
5. **Waiting is stillness, not absence**: a node at the Door is drawn frozen, lamp lit, beside "Nothing burns while you decide" and its proof; a boundary that holds is the thesis.

## 2. Palette

The brief's tokens and the world bible's oak set are kept verbatim. Three are added, reason written down: a model sits on cloth, is held with hardware and is labelled on card. `--baize #120e0a`, the cloth under every stage; `--brass #a8842e`, hardware (`metalness 0.85 roughness 0.35`); `--linen #e9dfc6`, the HUD's card.

| stage | floor | wall | tile | accent | fog tint |
|---|---|---|---|---|---|
| 1 House | `#19130d` | `#2c2219` → `#201811` | `#3e2d1f` | `#d4a755` gold, the Door | `#8a7a64` |
| 2 Street | `#221c16` road | `#2b221a` | `#2f2419` | `#2aa5b8` cyan, the Letter Slot | `#6e6152` |
| 3 City | `#16110c` | `#27201a` | `#2d2419` | `#d4a755` gold, the Clearinghouse; `#c95140` foundry rims | `#5f5548` |
| 4 Country | `#120e0a` case | `#241c14` | `#2a2118` | `#f0e6d2` paper, the High Court's line | `#4f4740` |
| 5 World | `#0a0806` | `#141d24` globe | `#1e1710` beacons | `#2aa5b8` cyan, the STARK ring | `#385b66` |

Fog desaturates toward the tint (`mix(col, tint * luma(col), 0.7 * fog)`): dust on the model. A thing is only ever one accent: **gold** is the human hand and the brass that waits for it (Door frame, dome, desk lamp); **cyan** is verification, only where a proof or sync happens (lantern, stamp, handshake, STARK ring); **ember** is sunk, burned or seized; **sage** is settled or approved.

Day and night are lighting presets, never a palette swap: tokens hold, lights move, a slider interpolates; at Stage 5 the key light is the sun. **Golden** (default): key azimuth 225°, elevation 28°, `#e8c48a` at 2.0; hemisphere `#2c2219` / `#16110c` at 0.6; lamps 0.8. **Night**: 300° / 20°, `#8a7a64` at 0.35; hemisphere `#1e1710` / `#0a0806` at 0.3; lamps 1.6.

## 3. Type and the HUD

Type is the brief's: Fraunces, Schibsted Grotesk, JetBrains Mono for receipts, hashes, Φ and credits. **Canvas** draws geometry, lights, fog, dust, tilt-shift, the brass gauge, papers, figures. **DOM** draws every glyph: HUD, the Door `<dialog>`, the Note, receipts, feed, bubbles, at most eight projected labels.

The HUD is linen index cards pinned around the model. **Top-left**, the stage rail: five stages, `active_scale` in gold, a pending band "asking the engine…". **Top-centre**, the block line: `tick`, `root` (8 hex), `executor`, `mempool`, the STARK mark. **Top-right**, the focus card: the `NodeView` fields, `burned_this_tick` read "0.0 cr this tick" while waiting, belief beside truth. **Bottom-left**, the five `state.gates` strings verbatim; **bottom-right**, `totals`. **The Note** is a `--paper` card projected onto the Oak Table while `node.note !== null`.

**The Door** is a real `<dialog>`, a linen card 440 px wide at the Door's projected position, backdrop `rgba(10,8,6,0.35)`, no blur, the frozen model visible behind:

```
▪ THE PORTER IS AT THE DOOR
The House                                                  (held.node_name)
send the finished draft for doc_synthesis_01               (held.description)
Sending costs 10.0 cr. It comes out of the purse only if you say yes.
────────────────────────────────────────────────────────
Nothing burns while you decide.
Held 3 ticks · purse unchanged at 754.95 cr · Φ 97.3% then, 89.3% now   (live)
[ No, leave it on the table ]            [ Yes, send it ]  (No focused; Yes gold)
The camera is at the Street. This envelope was already presented to you; it stays at the Door.
                                                           (when active_scale !== 'House')
1 of 2 at the Door                                         (when several are held)
```

`Held N` is `state.tick − held.created_tick`; the purse line reads `purse unchanged at X cr` while `node.compute === openedAt.compute`, else `purse X cr → Y cr (topped up)`; Φ then is the `confidence` when the card opened. The card closes only when `state.held` no longer lists the envelope.

## 4. The room (Stage 1)

Units are metres; the room is the focused house tile's interior (`HEX_SIZE` 6), near wall and roof omitted at band 1, wall stubs ending in a clean `--oak` bevel. Origin at the floor's centre, x east, z south, y up; walls 3.2 m; columns 0.25 m, rows 0.5 m.

```
  x:  -4  -3  -2  -1   0  +1  +2  +3  +4
  z   |...|...|...|...|...|...|...|...|
-3.0  +################################+   back wall: wallpaper --wall to --wall-2, the fog haze
-2.5  #AAA                             #   A  Archives  x -3.95..-3.55  z -2.4..-0.2  (S1)
-2.0  #AAA                             #
-1.5  #AAA 1                           #   1  Scout (-3.0, -1.3)
-1.0  #AAA      TTTTTTTTTTTTTT         #   T  Oak Table  x -1.8..1.4  z -1.15..-0.05  top 0.76
-0.5  #AAA      TTTTTTTTTTTTT* 3       D   *  lamp L1 (1.6, 2.6, -0.6)   3  Inspector (1.9, -0.6)  (S3)
+0.0  #                          5   5 D   5  Porter idle (2.4, 0.2), at the step (3.5, 0.0)  (S5)   D  Door, z -0.5..0.5
+0.5  #           2                    #   2  Scribble (-1.2, 0.5)  (S2)
+1.0  #                           KLKPK#   K  Desk  x 2.8..3.9  z 1.0..1.6   L  desk lamp L2 (3.1, 1.15)   P  Purse (3.5, 1.3)
+1.5  #                           KKKKK#
+2.0  #                            4   #   4  Penny (3.0, 2.0)  (S4)
+2.5  #                                #
+3.0  +- - - - - - - - - - - - - - - - +   cutaway
```

The Porter stops 0.5 m short of x = 4.0. The Purse's lid gauge fills to `compute / compute_allocated`; the paper stack at (−0.6, −0.6) grows one sheet per `papers`.

| seat | idle | at work | on the move | waiting / halted |
|---|---|---|---|---|
| Scout | on the stool | at (−3.4, −1.3), reaching up | trots to (−2.1, −0.6), back | still |
| Scribble | seated | quill ticking, a sheet appears | slides 0.3 m | quill down |
| Inspector | standing | draft raised to L1, stamp | none | loupe down |
| Penny | by the Purse | sweeps motes from (1.4, −0.3) into it | short steps | still |
| Porter | (2.4, 0.2) | envelope out | `PROPOSED`: to the step, 900 ms; `APPROVED`: out through the Door; `REJECTED`: back to (1.6, 0.2) | at the step, zero glow |

On `HALTED` figures return to idle, the Note lands at (0.4, −0.6), L1 dims to half; `SEAT_FAILED` tips a stool 15° for 400 ms.

Lights: **L1** ceiling `SpotLight` `#f2cb7a` at (1.6, 2.6, −0.6), angle 38°, penumbra 0.6, shadows 1024². **L2** desk `PointLight` `#f2cb7a` at (3.1, 0.9, 1.15), distance 2.5, 0 → 1.4 on `AWAITING_HUMAN_SIGNATURE`: the person's presence. **L3** the modeller's `DirectionalLight` from the preset, shadows 2048²; **L4** its `HemisphereLight`. **L5** Scout's cyan lantern, only during `STATE_SYNC`. Ember is emissive, never a light. **Dust**: 400 `Points` in L1's cone, `--gold-light` at 18 %, alpha × (1 + fog).

## 5. The actor kit

Five carved figures from one base, the peg-cat: 0.60 m tall on a 0.24 m base disc (46 px at band 1, legible at 16 px). `flatShading: true`, one `BufferGeometry` per figure with vertex colours: capsule body 0.22 × 0.34 (about twelve facets), sphere head r 0.11 at y 0.44, two tetrahedral ears, a five-segment tail, the base disc in `--oak-dark`, one prop. A vertical gradient (× 0.92 feet, × 1.06 head) reads as turned wood.

Fur and prop: **Scout** `#d4913b`, spectacles, satchel, a lantern (cyan only during `STATE_SYNC`); **Scribble** `#7a624d`, a long quill and an ink pot; **Inspector** `#5c5148`, a loupe on a stick and a stamp; **Penny** `#b9a88f`, a broom and a brass scoop; **Porter** `#3e3b38`, a flat cap and a `--paper` envelope held out.

Poses are five morph targets: `idle`, `walkA`, `walkB`, `work`, `wait`; walking sets `walkA = 0.5 + 0.5·sin(2π·2.2·t)`, `walkB` its complement; `wait` is `idle` with the tail still, head 6° down. A **Thought bubble** is a DOM pill anchored by `project()` at the head top + 0.18 m, rising 8 px and fading over 2.4 s. A **Burn glow** is the base disc's emissive: `--ember` at 0.2 for `fast_quantized`, 0.55 for `balanced_staff`, 1.0 with 6 / 12 / 24 motes rising 0.4 m for `frontier_deep`; `cache_hit` halves it; it flares on the event and cools with `exp(−3·(uTime − uTickT)/uTickSeconds)`; a waiting figure has none.

## 6. The street (Stage 2)

A house tile is a piece of the baseboard: a hex prism, `HEX_SIZE` 6, 0.35 thick, top `#2f2419`, sides `#2b221a`, bevelled 0.06. The house, 8.0 × 6.0 × 3.2 in `--wall`, sits 1.2 from the south (kerb) edge under a 30° gable roof 1.4 high. **The Letter Slot** is a `--brass` plate 0.5 × 0.12 at 1.0 m on the south-face Door, its 0.02 `--cyan` line lit only during a handshake. **The chimney**, the heat vent, sits at the roof's north-east corner (+2.6, −2.0), 0.5 × 0.5 × 0.9, brass cap; `heatGlow()` masks the cap, motes rise 1.2 m from `burned_this_tick`.

**The kerb** is a 1.2-wide ribbon of `#2a221a` along each ring's inner side with a brass stud (r 0.12) at every tile's south midpoint. `SETTLED { from, to, amount }` plays at the stud between the two houses in four beats: envelope sprites meet and a `--cyan` bar joins them (lock, 150 ms), they cross (swap, 250 ms), the bar flashes `--cyan-2` (verify, 150 ms), then turns `--sage` with `amount` as a label (settle, 250 ms). A `hash mismatch` `REJECTED` runs two beats and snaps back: envelopes return in 120 ms and a ring of `hash12` grain, radius 2 m, `--ember` at 40 %, ripples for 300 ms. **Couriers** are the peg-cat pulling a hand-cart; past twenty houses, an envelope with two feet on an instanced quad. `DROPPED_BY_COURIER` stops the cart; the envelope dissolves to grain in 500 ms.

## 7. The city (Stage 3)

One `InstancedMesh` of hex prisms on the `--ground` plate, laid out by `layoutCity`: the Clearinghouse at `(0,0)`, streets as rings, houses along a ring. Lit tiles are plinths 0.35 thick, street rings 0.45, ground tiles 0.2 and matte. **Set dressing reads no truth** (`aSlot = −1`): six **foundries** on the corners of ring `radius + 1` (a squat block, two stacks, `--ember` rim at 60 %), six **data centres** at the edge midpoints of ring `ceil(radius / 2)` (a low block, a hairline `--cyan` vent at 25 %). **The Clearinghouse** is a 1.0 plinth carrying a `--brass` dome (r 3.5) with six ports. **The tubes** are instanced ribbons from each street's marker cell to the nearest port, 0.6 wide, `--gold-2` at 30 % at rest, on brass saddles; Penny's sweeps are the same ribbons at 15 %, never a vault.

**The Netted pulse** (`NETTED { gross, net, envelopes }`, once per tick) is four beats from one `uPulses` entry: (1) **gross in**, 40 ms per hex, every tube carries a band toward the dome, width 0.6 × its share of `gross`; (2) **the dome takes it**, 120 ms, emissive to `--gold`, ports flash; (3) **net out**, 40 ms per hex, one ring expands from the centre, width `0.6 × net / gross`; (4) **settle**, 300 ms, `--sage` rim ticks on the tiles that `SETTLED`. The block line reads `netted 12 envelopes · gross 60.0 → net 20.0`. `SLASHED` is an `--ember` flash on the plinth, 400 ms, its purse arc dropping.

## 8. Stages 4–5

**The country** is a raised-relief model of cut card: a heightfield in five contour steps of 0.5, risers `#241c14`, plateaus `#2a2118`, laid out by `layoutCountry` (`HEX_SIZE × 7`). **The High Court's line** is an inlaid `--paper` strip 0.3 wide with a brass pin at every vertex; nothing crosses it unmarked. `ROLLED_BACK { to_tick }` is the visible unwind: over 900 ms every contour layer slides 0.5 toward the case edge and returns, the plate desaturates to the fog tint, `root_history` steps back. `VOIDED` strikes an envelope's line through in `--sage`.

**The world** is a globe on a brass stand: sphere R 6,000 in `#141d24`, stroke `#385b66`, a `--brass` armillary ring at R + 300 tilted 23°, country beacons (`layoutWorld`, on the 30° N great circle) as `--panel` plates with a `--gold` pin, fibre arcs as great-circle ribbons in `--line-2` with a 20 % `--cyan` core. `GLOBAL_STATE_CONFIRMED { latency_ticks, partitioned }` is the STARK heartbeat: a cyan meridian sweeps once round the ring over `latency_ticks × tickSeconds`. `AWAITING_FINALITY` orbits an envelope at R + 150 until `until_tick`. **Partition** is a country going dark: pin out, plate at 25 %, arcs without their core, until a heartbeat omits it.

## 9. Motion rules

One orchestrated moment per event (`TICK_COMMITTED` moves only the block line); otherwise only dust, lamps and the fog's breath move, on `uTime`.

| event | what moves | ms | easing | colour | sound |
|---|---|---|---|---|---|
| `THOUGHT` | bubble at the seat | 2400 | ease-out | pill | write tick |
| `BURN` | base emissive flares, motes | to next tick | exp cool | ember | coin pair |
| `PROPOSED` | Porter walks to the step | 900 | sine | paper | — |
| `AWAITING_HUMAN_SIGNATURE` | L2 lights, frame → gold-light, card slides | 300 | ease-out | gold | knock |
| `APPROVED` | Door swings 70°, Porter exits | 600 | ease-in-out | gold | stamp |
| `REJECTED` | House: paper back, ember at the step; Street hash mismatch: handshake snaps back, grain ring | 700 | ease-in / snap | ember | stamp |
| `DELIVERED` | envelope enters the letter slot | 300 | ease-in | paper | — |
| `SETTLED` | four-beat kerb handshake | 800 | steps(4) | cyan → sage | coin pair |
| `STATE_SYNC` | lantern, sweep, 80 ms per station | 600 + cascade | linear | cyan, gold | 1318 Hz sine |
| `HALTED` | the Note drops, L1 dims | 500 | bounce | paper, ember | halt |
| `TOPPED_UP` | coins into the Purse, the Note lifts | 600 | ease-out | gold | coin pair up |
| `NETTED` | tubes in, dome, ring out, sage ticks | 40/hex × 2 + 420 | linear | gold, sage | — |
| `SLASHED` | plinth flash, purse arc drops | 400 | ease-out | ember | — |
| `PACKED` / `UNPACKED` | children fold into / out of the block, ring by ring | 600 | ease-in-out | fog tint | — |
| `ROLLED_BACK` | contour layers slide back, return | 900 | ease-in-out | fog tint | — |
| `GLOBAL_STATE_CONFIRMED` | meridian sweep | latency × tick s | linear | cyan | sine held |

**Fog** is `1 − Φ`: dust on the model; `applyFog` warps the surface by `fog × 0.06` of simplex, desaturates toward the stage's fog tint, adds quadratic grain, splits chroma below Φ 0.75. **The StateSync sweep** is a hard diagonal front, 600 ms, a `--gold` band riding it, new Φ behind, old ahead; the reducer writes `syncT + 0.04 × hexDistance` per descendant, so the cascade is free in the shader. **Reduced motion** (`uReducedMotion = 1`): no warp or grain flicker, 150 ms fades in place of sweeps and dissolves, dust still, figures cross-fading between marks, sound off. **Nothing animates from polling**: every clip is `{ event, tick, arrivedAt }`; the render loop reads only uniforms and textures; values that change without an event are block-lerped between two engine truths.

## 10. The zoom

One `PerspectiveCamera`, altitude `A ∈ [1, 5]`, pitch 30°, yaw 45° (the 2:1 dimetric read), fov 4° so convergence stays under 2 %. Tilt-shift is a half-resolution two-pass blur masked by `|depth − focusDepth| / (0.14 × H)`, following the focus point, off on "low".

| band | stage | steady A | up / down at | dissolve | view height H | pitch / fov |
|---|---|---|---|---|---|---|
| 1 | House | [1.0, 1.5) | 1.6 / — | [1.35, 1.65] the lid | 14 | 30° / 4° |
| 2 | Street | [1.5, 2.5) | 2.6 / 1.4 | [2.35, 2.65] | max(70, 2.4 × arc) | 30° / 4° |
| 3 | City | [2.5, 3.5) | 3.6 / 2.4 | [3.35, 3.65] | clamp(2.2 × radius, 140, 1200) | 30° / 4° |
| 4 | Country | [3.5, 4.5) | 4.6 / 3.4 | [4.35, 4.65] | 6,000 | 30° → 55° / 4° |
| 5 | World | [4.5, 5.0] | — / 4.4 | — | 16,000 | 55° → 35° / 4° → 40° |

`H` is log-interpolated between bands, `d = H / (2 tan(fov/2))`, and hysteresis (0.6 up, 0.4 down) sends `zoom/<n>` once per crossing. Each dissolve is a modeller's gesture: **1→2** roof and near wall fade in while translating down 0.6, the lid going back on; **2→3** the baseboard's bevelled `--oak` frame appears and the plinths rise 0 → 0.35 as the outgoing band fogs out; **3→4** the city plate becomes one plateau of the relief; **4→5** the relief fades onto the globe.

**A Packed street** renders the parent's profile, never the children: the ring's cells merge into one smooth cast block (`aFold = 1`), `#3e3a34` resin, haze at `1 − mean_confidence` shimmering on `epistemic_variance`, one chimney with heat `avg_compute_burn_rate × child_count / uBurnRef`, a DOM plate "6 in stasis · 8 macro-ticks": the Mandelbrot interior, nothing moving inside. Until `PACKED` or the confirming `TICK_COMMITTED` arrives the children show stasis haze and the incoming band is not drawn. `UNPACKED` is the filaments appearing: children rise in `stochastic_seed` order, purse arcs interpolate over 600 ms, `burn_distributed` falls as ember motes.

## 11. Thumbnail test

House run, seed 7, tick 4, Golden preset, band 1, roof off. L1 pools gold on the Oak Table's east end, the Inspector under it, loupe down. The Porter is at the step, envelope out, still, throwing a long shadow toward the Archives; the Door frame is `--gold-light`, the desk lamp lit. Dust hangs in the cone; the model's edges blur. Lower right, on the linen card: **Nothing burns while you decide.** Held 3 ticks · purse unchanged at 754.95 cr · Φ 97.3% then, 89.3% now. One lit figure, one lit door, one sentence, provably true in the same frame: the gauge on the brass box has not moved since tick 1.

## 12. Left out, and why

- **The wall-board experiment**: it shows why the room has no shared board.
- **Bloom on gold**: bloom is for cyan only, so a proof is the only thing that glows.
- **Shadow maps above band 2**: a lit side face and a baked contact shadow read the same at 5,000 plinths.
- **A "you" figure, faces**: the desk lamp and the dialog are the person; carved figures do not emote.
- **Yield, vaults, the MMF**: Penny sweeps; nothing accrues.
- **In-canvas labels, the sci-fi kit, weather, motion blur**: labels are DOM cards; a diorama's only optics are focus and dust.
- **Any per-frame walk of state, any ordering of nodes against each other, any number not in a frame**: the DOM test that scans every frame for the brief's forbidden words is the first acceptance.
