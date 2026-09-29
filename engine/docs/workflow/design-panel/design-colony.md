# DESIGN.md · direction: THE COLONY (lanterns, glaze and timber)

The hex-colony frame's joy (little actors bustling between real stations, one rim colour per district, day and night on a slider, quality presets on a rail) rebuilt in the room's materials: glazed ceramic and timber tiles, lanterns instead of neon, brass letter slots that glow only when an envelope crosses. Everything here renders `StateView` and the event stream and nothing else.

## 1. Principles

1. **Lanterns hang on boundaries, never in interiors**: the Door, the Letter Slot, the kerb, the Clearinghouse dome, the Court's line and the STARK ring carry every lantern and every clip, because state moves only at a boundary.
2. **A house is a lit window, not an open book**: a tile shows heat, fog, purse and status from its own texel and nothing from its Oak Table, because nothing is shared by default.
3. **Cats walk real paths between real stations**: a seat moves only when an event names it, so the bustle is the engine's word, never decoration.
4. **The engine's word is the only motion**: a clip is born from an event with a tick and an arrival time; the shader tweens between two engine truths and invents nothing.
5. **Waiting is lit, not loading**: a node at the Door is drawn frozen, desk lamp on, beside "Nothing burns while you decide", so a boundary that holds reads as the thesis.

## 2. Palette

The brief's tokens and the world bible's oak set (`--wall #2c2219`, `--floor #19130d`, `--oak #5a422f`, `--oak-dark #3e2d1f`, `--door #4a3525`, `--gold-light #f2cb7a`, `--pill #fff8ed`) are kept verbatim. Five are added because the validated set has no fired clay, glaze or lantern glass: `--glaze #2b2117` (ceramic tile top), `--glaze-lit #4a3826` (its bevel), `--terracotta #7d4a34` (roofs, chimney pots, foundry stacks), `--lantern-glass #f6d89a` (lantern paper at rest, tinted by status), `--soot #0e0a06` (smoke, the darkest fog).

| stage | floor | wall | tile | accent | fog tint |
|---|---|---|---|---|---|
| 1 House | `#19130d` | `#2c2219` → `#201811` | `#2b2117` plinth | `#d4a755` gold, the Door | `#8a7a64` |
| 2 Street | `#221c16` road, `#4c3f30` kerb | `#2b221a` facades, `#5a422f` timber | `#2f2519` plot | `#2aa5b8` cyan, the Letter Slot | `#6e6152` |
| 3 City | `#16110c` plate | `#241b13` prism sides | `#2b2117` top, `#4a3826` bevel | `#d4a755` gold, the Clearinghouse; `#c95140` foundry rims | `#5f5548` |
| 4 Country | `#120e0a` | `#1e1710` contour risers | `#2a2118` plateau | `#f0e6d2` paper, the High Court's line | `#4f4740` |
| 5 World | `#0a0806` | `#141d24` globe, stroke `#385b66` | `#1e1710` beacon plates | `#2aa5b8` cyan, the STARK ring | `#385b66`, the one cold fog |

The fog tint is what the fog shader desaturates toward (`mix(col, tint * luma, 0.7 * fog)`): lantern smoke, warm in the room, colder higher up.

One accent per thing. **Gold** is the human hand and the brass that waits for it (the Door frame on a knock, the desk lamp, the dome). **Cyan** is verification only (Scout's lantern in `STATE_SYNC`, the Inspector's stamp, the kerb handshake, the radar sweep). **Ember** is burned, sunk or seized (a chimney pot, `REJECTED` on the step, `SLASHED`, a halted rim). **Sage** is approved or settled. Bloom (Balanced and up) touches cyan and lantern glass, never gold.

**Day and night are a lighting preset, not a palette swap**: tokens never change; the key light, the hemisphere and the lanterns do, and lanterns come up as the key light goes down.

| preset | key light azimuth / elevation / colour / intensity | hemisphere sky / ground / intensity | lantern emissive |
|---|---|---|---|
| Dawn | 100° / 10° / `#e6b78a` / 1.4 | `#2c2219` / `#16110c` / 0.5 | 0.9 |
| Noon | 200° / 62° / `#f4e6c8` / 2.4 | `#3a2f24` / `#19130d` / 0.8 | 0.25 |
| Golden (default) | 235° / 26° / `#e8c48a` / 1.9 | `#2c2219` / `#16110c` / 0.6 | 0.8 |
| Dusk | 265° / 8° / `#d49a6a` / 1.0 | `#241c14` / `#120e0a` / 0.45 | 1.3 |
| Night | 300° / 18° / `#8a7a64` / 0.3 | `#1e1710` / `#0a0806` / 0.3 | 1.6 |

A time-of-day slider interpolates between neighbours; "Cycle day/night" steps one preset every 64 ticks on `TICK_COMMITTED`, never wall time; at Stage 5 the key light is the sun on the sphere. Quality: Potato (DPR 1, no shadows or bloom, one noise octave, ≤ 256 courier quads), Low, Balanced (60 fps at 5,000 tiles: DPR ≤ 1.5, contact shadows, half-res bloom), High, Ultra (DPR ≤ 2, 2048 shadow map, particles ×2). "Rest to the room's angle" snaps yaw 45°, pitch 30°.

## 3. Type and the HUD

Fraunces 400 for display, Schibsted Grotesk for UI (17 px / 1.55; eyebrows 0.78 rem 600 uppercase in `--gold`), JetBrains Mono tabular for receipts, hashes, Φ and credits. **Canvas** draws geometry, lights, contact shadows, fog, heat, lanterns, the purse dial on the Purse's lid, paper stacks and the cats. **DOM** draws every glyph (HUD, the Door `<dialog>`, the Note, receipts, the feed, thought bubbles, the stasis plate, at most eight projected labels moved by `transform`), patched in `reduce()` and on clip boundaries, never per render frame.

HUD zones, `--panel` cards with a 1 px `--line` edge: **top-left** the stage ladder (five stage names, `active_scale` in gold, a pending band in `--ink-3` with "asking the engine…", the gate under each); **top-centre** the block line (`tick`, `root` 8 hex, `executor`, `mempool`, mode badge, the STARK mark with `latency_ticks`); **top-right** the focus card (`name`, status pill, purse `compute / compute_allocated`, Φ with `generation` and `fog`, `tasks_done / tasks_total`, `current_task`, `burned_this_tick` as "0.0 cr this tick" while waiting, belief vs truth when they differ, `papers`, `oak_root`); **right edge** the rail, the mood frame's settings column in oak (Quality, Lighting, Time of day, Cycle, Sound, Rest to the room's angle); **bottom-left** the five `state.gates` strings verbatim; **bottom-right** the eight `totals`; **bottom-centre** run, pause, step, speed, zoom rail, a 40-line feed drawer.

**The Door dialog** is a real `<dialog>` (`showModal`; Escape and backdrop cancelled; focus on No): a `--paper` card 440 px wide hinged in brass at the Door's projected position, backdrop `rgba(10,8,6,0.35)` without blur so the frozen room stays visible.

```
▪ THE PORTER IS AT THE DOOR                              eyebrow, --gold
The House                                                Fraunces h2: held.node_name
send the finished draft for doc_synthesis_01             held.description
Sending costs 10.0 cr. It comes out of the purse only if you say yes.
────────────────────────────────────────────────────────
Nothing burns while you decide.                          bold
Held 3 ticks · purse unchanged at 754.95 cr · Φ 97.3% then, 89.3% now      mono, live
The camera is at the Street. This envelope was already presented to you; it stays at the Door.
                                                         only when active_scale !== 'House'
1 of 2 at the Door                                       only when held.length > 1
[ No, leave it on the table ]             [ Yes, send it ]
Recorded run · the person's answer replays at the recorded tick     trace only
```

The proof is live: `Held N ticks` is `state.tick − held.created_tick`; the purse line compares `node.compute` with its value when the dialog opened (else `purse X cr → Y cr (topped up)`); Φ then and now are the opening and current `confidence`, so the smoke thickens while the purse stays put. The dialog closes only on the engine's `APPROVED`/`REJECTED` or a frame whose `held` no longer lists the envelope; a click shows "sent to the Door…", nothing optimistic.

## 4. The room (Stage 1)

The room is the interior of the focused house's hex tile (`HEX_SIZE` 6, one unit one metre, flat-to-flat 10.39 m): 8 m east–west by 6 m north–south, the porch on the tile's eastern point. The camera stands south-west (pitch 30°, yaw 45°, fov 4°, view height 14 m), so the omitted near walls are south and west, and the far walls, north (Archives, Desk) and east (the Door), stay in shot. Left to right, the Archives, the Oak Table, the Desk with the Purse, the Door: look, draft and audit, send.

```
 x:   -4    -3    -2    -1     0    +1    +2    +3    +4    (metres; east +, south +)
 z    |.....|.....|.....|.....|.....|.....|.....|.....|
wall  #================================================#   north wall (far), --wall to --wall-2: the fog haze lives here
-3.0  # AAAAAAAAAAAAA                        KKLKKPKK  #   A Archives x -3.8..-1.6 z -3.0..-2.5, 2.4 m tall (S1)
-2.5  #       1                              KKKKKKKK  #   K Desk x 2.4..3.8 z -2.9..-2.2, top 0.80; L desk lamp (2.7,1.2,-2.6); P Purse (3.3,0.85,-2.6)
-2.0  #       ^                                  4     #   1 Scout at the shelf (-2.7,-2.3); ^ stool (-2.7,-1.8); 4 Penny at the Purse (3.0,-1.7) (S4)
-1.5  #                                                #
-1.0  #                               3                #   3 Inspector at the table's NE end (1.2,-1.0) (S3)
-0.5  #               TTTTTTTTTTTNTTTTTT               D   T the Oak Table x -1.5..1.5 z -0.5..0.5, top 0.76 (S2); N the Note (0.4,0.77,-0.2), halted only
 0.0  #               TTTTTTTTTTTTTlTTTT   5       5   D   l table lamp L1 (0.8,2.4,0.0); 5 Porter idle (2.0,0.2), knocking (3.4,0.0) (S5)
+0.5  #                                                #   D the Door: east wall x = 4.0, z -0.5..0.5, leaf 1.0 x 2.1 m, brass frame; step x 4.0..4.6
+1.0  #                  2                             #   2 Scribble seated (-1.0,1.0), facing north (S2)
+1.5  #                                                #
+2.0  #                                                #
+2.5  #                                                #
+3.0  +- - - - - - - - - - - - - - - - - - - - - - - - +   south wall, west wall and roof omitted at band 1
```

| status | Scout | Scribble | Inspector | Penny | Porter |
|---|---|---|---|---|---|
| `active` | shelf (−2.7, −2.3), then the table's west end (−1.8, −0.8) with notes; stool with no task | seated (−1.0, 1.0), quill ticking | (1.2, −1.0), draft to L1, then the stamp | table edge (1.8, −0.8) sweeping back to the Purse | (2.0, 0.2); the long walk to (3.4, 0.0) on `PROPOSED` |
| `waiting_at_door` | frozen | frozen | frozen | frozen | (3.4, 0.0) facing the Door, envelope out, no glow |
| `halted` | stool | quill down | still | beside the empty Purse | (2.0, 0.2); the Note on the table |
| `packed` / `partitioned` | the room is not drawn: roof on, tile in haze or dark | | | | |

Lights: the preset's key light and hemisphere; **L1** the table lamp (point, `#f2cb7a`, intensity 1.2, range 5, decay 2, always on); **L2** the desk lamp (same, lit only while `held > 0` or `note !== null`: your presence); **L3** the Door's brass frame (emissive `--gold-light`, 0 at rest, 1.0 on a knock); **L4** Scout's lantern (`--cyan`, the 600 ms of `STATE_SYNC` only); **L5** the ember point at a burning seat's feet (`heat` from the truth texel). At most four point lights at once, so Potato still runs.

## 5. The actor kit

One low-poly peg-cat for all five: a capsule body 0.45 × 0.30 m, a 0.28 m sphere head, two 0.10 m triangular ears, a tail as one curved 0.40 m strip, 0.90 m in all; 10–14 visible facets so it reads as carved timber; flat-shaded, one fur tone, a 1 px toon outline in `--oak-dark`, a contact-shadow ellipse 0.32 × 0.12 m at 30 % black. No face at distance, two ink dots when `A < 1.3`. About 32 px at the room's default altitude, readable at 16 px by ears and prop alone. At Stage 2 the same kit pulls a hand-cart; from Stage 3 up cats are not drawn.

| seat | fur | the one prop | idle | work | walk | wait |
|---|---|---|---|---|---|---|
| Scout | `#d4913b` | spectacles, satchel, a small lantern (`--cyan` during `STATE_SYNC` only) | on the stool, tail sway | reaching up, a volume in paw | quick trot, tail up, 2.6 steps/s | — |
| Scribble | `#7a624d` | a long quill (the tallest line in the room) and an ink pot | seated | bent over the table, quill ticking at 4 Hz, a sheet rising 6 cm | slides along the bench | — |
| Inspector | `#5c5148` | a loupe on a stick and a stamp | standing, north-east end | draft held to L1; stamps a `--sage` tick or an `--ember` mark | slow, 1.4 steps/s | — |
| Penny | `#b9a88f` | a broom (long diagonal) and a brass scoop | beside the Purse | sweeps `--gold-2` motes from the table edge into the Purse's lid | short busy steps, 3 steps/s | — |
| Porter | `#3e3b38` | a flat cap and an envelope held out front (a `--paper` quad, the most readable prop) | by the table's east end | — | the long walk, 2.0 steps/s, envelope leading | still at the Door, tail down, envelope out, zero glow |

Four clips per cat on a six-bone rig: idle is a 0.5 Hz tail sway of ±6° with weight on one foot; walk a four-frame stride with a 3 cm bob; work as in the table; wait has no bob at all. A **Thought** bubble is a DOM pill (`--pill`, 1 px `--oak-dark` stroke, 11 px, radius 6) anchored 0.35 m above the head through `project()`, sliding up 8 px in 120 ms, living 2.4 s, at most three per node. A **Burn** glow is an emissive disc of radius 0.35 m at the feet plus L5, intensity by tier (`fast_quantized` 0.2, `balanced_staff` 0.5, `frontier_deep` 1.0, halved on `cache_hit`), with 6–12 ember motes rising 0.6 m over 900 ms on the frontier tier only; it cools as `exp(−3 · age / tickSeconds)`, gone before the next tick.

## 6. The street (Stage 2)

A house tile is a pointy-top hex, centre-to-corner 6 m, flat-to-flat 10.39 m: a glazed plate 0.30 m thick with a 0.15 m bevel (`--glaze` top, `--glaze-lit` bevel, `--line-2` edge) carrying a timber-framed cottage 6 × 5 × 4.5 m whose long face looks at the kerb, a `--terracotta` roof at 35°, a `--door` leaf 1.0 × 2.1 m centred on the kerb face, a lantern 0.4 m to its right at 2.0 m. **The Letter Slot** is a brass plate 0.40 × 0.12 m in the leaf at 1.10 m: a `--gold-2` glint at rest, `--cyan` during a handshake, `--gold-light` for 300 ms on `DELIVERED`. **The chimney** is a `--terracotta` pot 0.5 m tall on the rear ridge: `BURN` lights an ember glow in it and smoke motes above it scaled by `heat`; a waiting house's chimney is cold. The lantern says the status: gold steady `active`, cyan breathing `waiting_at_door`, ember `halted`, off when `packed` or `partitioned`.

Houses sit on the ring cells `layoutCity` gives them, joined by **the kerb**, a `--line-2` stone ribbon 1.2 m wide past each door with lantern posts every three cells; a swap settles at the kerb stone midway between the two door edges. **Couriers** are the peg-cat pulling a 0.6 m hand-cart with the envelope quad upright on it; above 20 houses in view they reduce to the envelope with two feet (one instanced quad mesh, cap 1,024). `PROPOSED { kind: 'hire_service' }` sends a courier from `from`'s slot to the kerb stone in 900 ms; `SETTLED` plays the four-beat handshake there (lock: both slots cyan; swap: the quads cross; verify: a cyan ring 0.8 m wide; settle: sage flash) in 800 ms; `DELIVERED` enters `to`'s slot in 300 ms; a `REJECTED` whose reason starts `hash mismatch` snaps the courier back to `from` under a 500 ms ripple of static on both plates; `DROPPED_BY_COURIER` stops the cart at the kerb and the envelope dissolves.

## 7. The city (Stage 3)

One `InstancedMesh` of hex prisms (36 indices, `HEX_SIZE` 6; height 0.6 ground, 1.2 house cell, 2.0 the Clearinghouse), `aKind` picking the facade. **The Clearinghouse** at `(0,0)` is a round hall with a 4 m brass dome on a 2 m plinth, the dome itself a lantern (`--lantern-glass` toward `--gold`). Each **street** is a contiguous run of ring cells sharing one rim: small lanterns along the shared edge in the street's colour (`--sage` when its last `SETTLED` was within 16 ticks, `--gold-2` otherwise, `--ember` while any house on it is halted, off when packed). Outside the last street ring, ground cells become scenery quarters by `hash(q, r)`: **foundries** (three `--terracotta` stacks, `--ember` rims, a slow plume tied to the day preset) and **data yards** (timber longhouses with lantern rows at 30 %). They carry no number and read no texel; the engine has no foundry node, and when it does the tile gets a slot. **Tubes** are brass-ringed glass ribbons (one instanced ribbon mesh, cap 512) from each street's marker cell along the ring roads to the dome, a 10 % gold pilot glow at rest.

**The `NETTED` pulse**, once per tick, four beats from one event: (1) 0–240 ms, every tube fills inward from its street to the dome, width `clamp(gross / 200, 0.2, 1.0)` m, `--gold-2`, quad-in; (2) 240–400 ms, the dome flares `--gold` and the block line writes `gross → net`; (3) from 400 ms, one thin ring leaves the dome outward at 40 ms per hex, width scaled by `net / gross`, tinted `--sage`, so a heavily netted city visibly sends less out than came in; (4) each `SETTLED` in the same frame blinks the destination cell's lantern gold for 300 ms. `SLASHED` flashes a cell's rim ember for 400 ms and its purse arc drops. `PACKED` folds a street's cells into its marker cell ring by ring (600 ms, 40 ms per ring); `UNPACKED` unfolds them in `stochastic_seed` order with `burn_distributed` falling as embers.

## 8. Stages 4–5

**The Country** is a topographic hex map at `HEX_SIZE × 7`: a seeded heightfield with contour lines in `--line` every 0.5 units, cities as lantern clusters on plateaus, streets and houses packed beneath. **The High Court's boundary lines** are inlaid `--paper` lines at 40 % alpha along the hex edges between city groups, a brass pin at each vertex; nothing crosses one without a mark. `ROLLED_BACK` sweeps the region back to front in ember over 900 ms while the root ticker rewinds to `to_tick` and the `slashed` count prints; `VOIDED` strikes the envelope's feed line through in sage; `SLASHED` is the city's ember flash.

**The World** is a sphere of radius 6,000 (`#141d24`, stroke `#385b66`, the one blue-black allowed), countries as lantern beacons by ascending id on the 30° N circle, fibre as great-circle ribbons with a faint pilot glow. `GLOBAL_STATE_CONFIRMED` is the STARK heartbeat: a cyan radar line orbiting once per `latency_ticks × tickSeconds`, a cyan tick on the block line with the root's first 8 hex. `AWAITING_FINALITY` puts the envelope on a small orbit round its beacon until `until_tick`. **A partition is a country going dark**: every beacon in `partitioned[]` loses its lantern, its fibre goes cold, its pill reads "partitioned", and it returns only when a later heartbeat no longer lists it.

## 9. Motion rules

One orchestrated moment per event type; every clip starts at the event's `arrivedAt` and is scaled by `uTickSeconds`.

| event | what moves | ms | easing | colour | sound |
|---|---|---|---|---|---|
| `THOUGHT` | DOM pill above the seat | 2400 | slide-up 120 ease-out | `--pill` | soft tick |
| `BURN` | ember disc and L5 at the seat; chimney glow on the street | to next tick | exp cool | `--ember` | `sfxCoin`; `sfxWrite` for Scout, Scribble |
| `PROPOSED` | Porter walks table to Door (room); courier leaves the slot (street) | 900 | ease-in-out | `--paper` | — |
| `DROPPED_BY_COURIER` | cart stops at the kerb, envelope dissolves | 500 | ease-out | `--ink-3` | — |
| `AWAITING_HUMAN_SIGNATURE` | Door frame and desk lamp light, dialog opens, room freezes | until decided | 200 ease-out | `--gold-light` | `sfxKnock` |
| `AWAITING_FINALITY` | envelope orbits the beacon | until `until_tick` | linear | `--cyan` | — |
| `APPROVED` | Door swings 30°, the Porter steps out (House); handshake completes (Street); tube lights (City) | 600 | ease-out | `--sage` | `sfxStamp` |
| `REJECTED` | paper returns to the table, ember on the step (House); courier snaps back, static ripple (Street) | 700 | ease-in | `--ember` | `sfxStamp` |
| `SLASHED` | rim flash, purse arc drops | 400 | ease-out | `--ember` | — |
| `SETTLED` | four-beat kerb handshake | 800 | 4 × 200 steps | `--cyan` → `--sage` | coin pair |
| `DELIVERED` | envelope enters the Letter Slot | 300 | ease-in | `--gold-light` | — |
| `STATE_SYNC` | Scout's lantern cyan, the sweep front, fog cleared behind it | 600 + cascade | linear front | `--gold` band | 1318 Hz sine 0.4 s |
| `HALTED` | the Note drops onto the table, rim goes ember | 400 | ease-in, one bounce | `--paper` | `sfxHalt` |
| `SEAT_FAILED` | the seat's chair tips and rights itself | 400 | ease-out | — | — |
| `VOIDED` | sage strike-through | 500 | linear | `--sage` | — |
| `TOPPED_UP` | coins into the Purse's lid, the Note lifts | 600 | ease-out | `--gold-2` | coin pair, upward |
| `PACKED` | children fold into the marker cell ring by ring | 600 | 40 ms per ring | haze | — |
| `UNPACKED` | children unfold in seed order, embers fall | 600 | 40 ms per ring | `--ember` motes | — |
| `NETTED` | the four-beat dome pulse (§7) | 400 + 40 × radius | quad-in, then linear | `--gold-2` → `--sage` | coin pair |
| `ROLLED_BACK` | region sweep back to front, root ticker rewinds | 900 | ease-in-out | `--ember` | — |
| `GLOBAL_STATE_CONFIRMED` | radar line one orbit; partitioned beacons dark | `latency_ticks × tick s` | linear | `--cyan` | sine held |
| `TICK_COMMITTED` | block line, five counts, day-cycle step | 0 | — | — | — |

**Fog** is `1 − Φ` from the truth texel, drawn as lantern smoke: a domain-warped 3D simplex sample (`warp = fog · 0.06`; octaves 3 in the room, 2 on the street, 1 above), desaturation toward the stage's fog tint at `0.7 · fog`, grain at `fog² · 0.35`, a 0.012 chroma split below Φ 0.75. **The `STATE_SYNC` sweep** is a diagonal front crossing a tile in 600 ms behind a gold band 12 % wide; fragments behind it read the new Φ, ahead of it the old; the reducer writes cascade delays into `uTimes` (room: table, Desk, Purse, Door at 80 ms per station; city: 40 ms per hex ring), so the shader makes no cross-node lookup. Between events Φ, purse and heat tween from `uTruthPrev` to `uTruth` over one tick.

**Reduced motion**: sweeps become 150 ms fades; no warp animation, grain flicker or breathing rims; cats cross-fade between stations in 120 ms with no bob; bubbles appear without slide; the dialog opens without scale; the radar sweep is a rail tick; band dissolves are a 150 ms fade through `--ground`; sound off unless turned on.

**Nothing animates from polling.** A clip is born only from an event with a tick and an arrival time; a value that looks different this frame is not a cue. The reducer runs once per frame, the render loop reads uniforms and textures only, and `reducer.test.ts` keeps it so.

## 10. The zoom

One `PerspectiveCamera`, one altitude scalar `A ∈ [1, 5]`, distance from the dolly identity `d = H / (2 tan(fov/2))`.

| band | steady A | view height H | fov | pitch | tick s | dissolve window |
|---|---|---|---|---|---|---|
| 1 House | [1.0, 1.5) | 14 m | 4° | 30° | 1.2 | [1.35, 1.65]: roof and near walls fade in, fixtures and cats fade out |
| 2 Street | [1.5, 2.5) | max(70, 2.4 × the ring arc) | 4° | 30° | 0.7 | [2.35, 2.65]: half-res RT through the fog medium |
| 3 City | [2.5, 3.5) | clamp(2.2 × cityRadius, 140, 1200) | 4° | 30° | 0.4 | [3.35, 3.65]: same |
| 4 Country | [3.5, 4.5) | 6,000 | 4° | 30° → 55° over [3.5, 4.0] | 0.3 | [4.35, 4.65]: flat map fades, sphere fades in |
| 5 World | [4.5, 5.0] | 16,000 | 4° → 40° | 55° → 35° | 0.25 | — |

`H` between bands is log-interpolated. Crossing `k + 0.6` going up or `k + 0.4` going down calls `zoom/<n>` once; the ladder shows "asking the engine…" and the dissolve weight is clamped at 0.5 until `PACKED`/`UNPACKED` or a confirming `TICK_COMMITTED` arrives, so the camera never shows a scale the engine is not simulating. At 1↔2 nothing is composited: the roof lowers onto the room like a lid and the neighbours light their lanterns out of their own fog.

**A Packed street** renders the parent's profile, not the children: its marker cell becomes a stasis lantern, one wider hex (1.6 × a house cell) under haze whose shimmer rate is `0.5 + 4 · epistemic_variance`, lantern brightness `mean_confidence`, chimney heat `avg_compute_burn_rate × child_count / uBurnRef`, a brass plate reading "`child_count` in stasis · `macro_ticks` ticks", and a purse arc from the parent's texel. The children's cells are unlit `--glaze` plates with the roof on and no lantern; nothing moves on them, because their clocks are stopped.

## 11. Thumbnail test

The frame: house run, seed 7, tick 3, altitude 1.3, Dusk preset, the camera at the room's angle. The house tile fills the left two-thirds: the roof is lifting, the room is open, four cats are frozen at their stations, and the Porter stands at the Door with a white envelope held out; the Door's brass frame and the desk lamp are the two brightest warm things in the frame. Through the open east wall the kerb runs off to the right, where three neighbouring cottages sit dim in their own fog with one brass letter slot each catching lantern light. The smoke on the wall behind the table is visibly thicker than at tick 1. Over the Door, one DOM pill: "Nothing burns while we wait." No HUD but the block line.

It reads because it has one contrast, one figure and one object: a dark warm ground, one gold rectangle (the boundary), one white rectangle (the thing that wants to cross it), and a cat between them. At 320 × 180 the hex, the door and the envelope are still three distinct shapes, and the neighbours' unlit slots say "many houses, one door open".

## 12. What I left out, and why

- **Any score, rank, reputation or leaderboard**: none exists in `StateView` and the DOM test forbids it; a street's lantern rim says status, never standing.
- **The mood frame's palette and kit**: grey-blue plates, white domes, antennae, rockets, robots, walkways, planet presets. They are another world.
- **Floating labels over tiles**: labels live in the HUD or as at most eight projected DOM tags; text on the plate turns a colony into a diagram.
- **Bloom on gold**: it turns brass into neon; bloom is spent on cyan and lantern glass only.
- **House names at Stage 3**: 5,000 labels is a wall of text; the focus card names one node at a time.
- **Foundry and data-yard numbers**: the engine has no such node, and scenery shows no value it does not have.
- **A vault, yield or sweep balance for Penny**: her motes go back into the Purse; nothing accumulates beside it.
- **The person as a walking actor**: the desk lamp is your presence and the `<dialog>` is your hand.
- **Weather, seasons, a minimap, wall-time day cycles**: nothing on screen moves that the engine did not move.
- **Curling the flat map onto the sphere at 4↔5**: the dissolve is the shipped default; the curl stays behind `?morph=1`.
