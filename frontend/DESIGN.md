# DESIGN.md · The Agentic Economy frontend

**Provenance.** Three directions were scored by three judges (the Director, the Engineer, the Viewer). Combined totals: **The Colony** 94 (31 + 29 + 34), **The Diorama** 93 (33 + 31 + 29), **The Ledger** 90 (27 + 32 + 31). The Colony is the base. From the Diorama: the nested-model dissolves, "waiting is stillness", ember as emissive never a light, bloom on cyan only, the 70° Door, the hero frame's checkable claim, the forbidden-word scan as first acceptance, the morph-target actors. From the Ledger: the colour law, the cyan STATE_SYNC band, the root ticker, the SLASHED scorch, the inverted-hull outline, the hatch as accessibility fog. Fixed from the Colony's flaws: the hero frame carries the brief's sentence and its proof; the waiting lantern is gold, not cyan; the 16-tick rim window is cut; room and cottage share one footprint and one Door; the rig, the five-step quality ladder, the settings column and the glaze / terracotta naming are gone; the arithmetic is corrected; every `smoothstep` has ascending edges. GLSL, `tokens.css`, the lighting table, HUD zone ids, the Note copy and the sound synthesis are in ARCHITECTURE.md (§6, §B).

Standing rules (brief §2, §7): the Purse, the Oak Table, the Door, the Porter, the Note, the Letter Slot, the Clearinghouse, the High Court, the STARK heartbeat, Scout / Scribble / Inspector / Penny / Porter; seats are staff, not traders; no score, rank, reputation or leaderboard anywhere; only `StateView` and `EngineEvent` are drawn.

## 1. Principles

1. **Lanterns hang on boundaries, never in interiors.** The Door, the Letter Slot, the kerb, the Clearinghouse dome, the Court's line and the STARK ring carry every lantern and every clip: state moves only at a boundary (brief §1).
2. **A house is a lit window, not an open book.** A tile shows heat, fog, purse and status from its own texel, nothing from its Oak Table (brief §7).
3. **Before a gate decides, an envelope is plain paper.** Gold leaf only after APPROVED, SETTLED, DELIVERED; ember only for sunk cost, SLASHED, HALTED.
4. **The engine's word is the only motion.** A clip is born from an event with a tick and an arrival time; the shader tweens two engine truths and invents nothing (brief §4).
5. **Waiting is stillness, not absence.** A node at the Door is drawn frozen, desk lamp lit, beside "Nothing burns while you decide" and its live proof.
6. **A miniature never lies about scale.** One camera, one altitude, one lamp rig, one house footprint at every band.

## 2. Palette

The brief's eleven tokens and the world bible's oak set are kept verbatim. Added, because the validated set has no cloth, hardware, plinth, roof or resin: `--baize #120e0a` (the cloth under every stage), `--brass #a8842e` (hardware; a flat colour, never PBR), `--linen #e9dfc6` (HUD card), `--plinth #2b2117`, `--plinth-lit #4a3826` (bevel), `--roof #7d4a34` (fired-clay shingles, the one warm mid-tone above oak, for tonal range at 320 × 180), `--resin #3e3a34` (a packed block), `--soot #0e0a06`.

| stage | floor / plate | wall | tile | accent = the gate | fog tint |
|---|---|---|---|---|---|
| 1 House | `#19130d` | `#2c2219` → `#201811` | `--plinth` | `--gold #d4a755`, the Door | `#8a7a64` |
| 2 Street | `#221c16` road, `#4c3f30` kerb | `#2c2219`, `#5a422f` timber | `#2f2519` | `--cyan #2aa5b8`, the Letter Slot | `#6e6152` |
| 3 City | `#16110c` on `--baize` | `#241b13` | `--plinth`, bevel `--plinth-lit` | `--gold`, the Clearinghouse; `--ember #c95140` foundry rims | `#5f5548` |
| 4 Country | `--baize` | `#1e1710` risers | `#2a2118` plateau | `--paper #f0e6d2`, the High Court's line | `#4f4740` |
| 5 World | `#0a0806` | `#141d24` globe, stroke `#385b66` | `#1e1710` beacons | `--cyan`, the STARK ring | `#385b66` |

**The colour law.** Gold is the boundary: the brass that waits for a yes (Door frame on a knock, desk lamp, dome) and the leaf a yes leaves behind (APPROVED, SETTLED, DELIVERED, the purse gauge). Cyan is verification only: the STATE_SYNC sweep and lantern, the handshake's lock and verify beats, the STARK meridian, an envelope awaiting finality. Ember is cost that cannot return. Sage is the quiet yes that moved no liquidity (the Inspector's stamp, a settle-beat rim tick, VOIDED). Paper is an envelope nobody has decided on. Fog only desaturates toward the stage's tint.

**Day and night are a lighting preset, never a palette swap.** Five presets, Dawn → Night (ARCHITECTURE §B.1): Golden is the default (key 235° / 26°, `#e8c48a` × 1.9; hemisphere `#2c2219` / `#16110c` × 0.6; lanterns 0.8) and Night the darkest (key 300° / 18°, `#8a7a64` × 0.3; lanterns 1.6). Lanterns come up as the key goes down; every key is warm so cyan stays the only cold colour; "Cycle" steps one preset every 64 ticks on `TICK_COMMITTED`, never wall time.

**Quality**, three rows: **Low** (DPR 1, no shadow map, one noise octave, courier cap 256); **Balanced**, the default and the 60 fps / 5,000-tile floor (DPR ≤ 1.5, one 1024² shadow from L1 at band 1, octaves 3 / 2 / 1 by band, cap 1,024, contact shadows); **High** (DPR ≤ 2, 2048² at bands 1–2, a half-res bloom pass on the verification layer, 200 dust points in L1's cone at band 1). Below High, glow is halo geometry, cyan only. Three point lights at most (L1, L2, L4) plus key and hemisphere; ember is emissive.

## 3. Type and the HUD

Fraunces 400 for display, Schibsted Grotesk for UI (17 px / 1.55; eyebrows 0.78 rem 600 uppercase in `--gold`), JetBrains Mono at `0.86em`, tabular, for receipts, hashes, ids, Φ and credits. Credits two decimals (`754.95 cr`), costs one (`10.0 cr`), Φ one-decimal percent, hashes first 8 hex. Canvas draws geometry, lights, fog, heat, lanterns, the purse dial, paper and cats; DOM draws every glyph, patched in `reduce()` and on clip boundaries, never per render frame, except `transform` on at most eight projected labels.

The HUD is six `--panel` cards (ARCHITECTURE §B.2 has the ids): the stage ladder top-left (`active_scale` in gold, a pending band "asking the engine…", the gate under each stage); the block line top-centre (`tick`, `root` 8 hex, `executor`, `mempool`, mode badge, the STARK mark, one settings button for quality, lighting, time of day, cycle, sound and "rest to the room's angle"); the focus card top-right (the `NodeView` fields, `burned_this_tick` read "0.0 cr this tick" while waiting, belief beside truth when they differ); the five `state.gates` strings and the eight `totals` bottom-left and right; run / pause / step / speed / zoom rail bottom-centre with a 40-line feed drawer and `node.receipts` verbatim; and, at ≥ 1024 px, the root ticker along the bottom edge: `root_history` as 16 mono tabs, newest right, a cyan tab on `GLOBAL_STATE_CONFIRMED`, the tabs after `to_tick` sliding off on `ROLLED_BACK`. Under 720 px only the block line, the focus card and the Door show. Pill copy: "active"; "waiting at the door · 0.0 cr idle burn"; "halted · the note is on the table"; "packed · statistical stasis"; "partitioned".

**The Door** is a real `<dialog>` (`showModal`; Escape and backdrop cancelled; focus on No): a `--paper` card 440 px wide at the Door's projected position, backdrop `rgba(10,8,6,0.35)`, no blur, opening in 200 ms ease-out with an 8 px rise. Its copy, exactly:

```
THE PORTER IS AT THE DOOR                                  eyebrow, --gold
{held.node_name}                                           Fraunces h2
{held.description}
Sending costs {cost} cr. It comes out of the purse only if you say yes.
────────────────────────────────────────────────────────
Nothing burns while you decide.                            bold
Held {N} ticks · purse unchanged at {X} cr · Φ {a}% then, {b}% now      mono, live
The camera is at the {Street|City|Country|World}. This envelope was already
presented to you; it stays at the Door.                    only when active_scale !== 'House'
{k} of {n} at the Door                                     only when n > 1
[ No, leave it on the table ]              [ Yes, send it ]   Yes is the gold primary
sent to the Door…                                          after a click, until the engine answers
Recorded run · the person's answer replays at the recorded tick   trace only; buttons disabled
```

`N = state.tick − held.created_tick`; the purse line compares `node.compute` with its value when the card opened, else reads `purse X cr → Y cr (topped up)`; Φ then and now are the opening and current `confidence`. At tick 4 of the recorded house run: "Held 3 ticks · purse unchanged at 754.95 cr · Φ 97.3% then, 89.3% now". The card closes only on the engine's `APPROVED` / `REJECTED` for that envelope or a frame whose `held` no longer lists it (brief §5); `awaiting_finality` never opens it. **The Note** is a `--paper` card anchored to the Note on the Oak Table while `node.note !== null`, headed "A note on the table", with the Note's fields, the reason line and one button, **Top up the purse** (copy in ARCHITECTURE §B.2).

## 4. The room (Stage 1)

The house is one object at every band: interior 8.0 m east–west × 6.0 m north–south, walls 0.10 m thick and 3.2 m high (exterior 8.2 × 6.2, corner radius 5.14 m, inside the hex's 5.196 m inradius at any rotation), on a pointy-top hex of `HEX_SIZE` 6. Coordinates are house-local metres, x east, z south, y up, origin at the floor's centre. **The Door is on the east wall**: x = 4.0, z ∈ [−0.5, 0.5], leaf 1.0 × 2.1 m `--door`, frame 0.08 m `--brass` (emissive `--gold-light` while an envelope is held for a signature), knob at 1.0 m, step x 4.1–4.7. On a street tile the house is rotated so the Door wall faces the ring centre, where the kerb runs; at band 1 the camera's yaw is measured in the house's frame (§10). The camera stands south-west (pitch 30°, yaw 45°, fov 4°, view height 14 m): the near walls, south and west, are omitted; north (Archives, Desk) and east (the Door) stay in shot. Left to right: look, draft and audit, send.

```
 x:   -4    -3    -2    -1     0    +1    +2    +3    +4    (metres; east +, south +)
 z    |.....|.....|.....|.....|.....|.....|.....|.....|
wall  #================================================#   north wall (far), --wall to --wall-2: the fog haze lives here
-3.0  # AAAAAAAAAAAAA                        KKLKKPKK  #   A Archives x -3.8..-1.6 z -3.0..-2.5, 2.4 m tall, four shelves
-2.5  #       1                              KKKKKKKK  #   K Desk x 2.4..3.8 z -2.9..-2.2, top 0.80; L desk lamp L2 (2.7,1.2,-2.6); P Purse (3.3,0.85,-2.6)
-2.0  #       ^                                  4     #   1 Scout at the shelf (-2.7,-2.3); ^ stool (-2.7,-1.8); 4 Penny at the Purse (3.0,-1.7)
-1.5  #                                                #
-1.0  #                               3                #   3 Inspector at the table's NE end (1.2,-1.0)
-0.5  #               TTTTTTTTTTTNTTTTTT               D   T Oak Table x -1.5..1.5 z -0.5..0.5, top 0.76; N the Note (0.4,0.77,-0.2), halted only
 0.0  #               TTTTTTTTTTTTTlTTTT   5       5   D   l table lamp L1 (0.8,2.4,0.0); 5 Porter idle (2.0,0.2), knocking (3.4,0.0)
+0.5  #                                                #   D the Door: east wall x = 4.0, z -0.5..0.5; step x 4.1..4.7
+1.0  #                  2                             #   2 Scribble seated (-1.0,1.0), facing north
+1.5  #                                                #
+3.0  +- - - - - - - - - - - - - - - - - - - - - - - - +   south wall, west wall and roof omitted at band 1
```

The paper stack at (0.6, 0.77, 0.2) grows one 0.28 × 0.20 × 0.004 m sheet per `papers`; every third sheet, the Audit, carries a `--sage` tick or an `--ember` mark. The Purse is a brass-bound box 0.40 × 0.30 × 0.25 whose lid arc (`--gold-2` → `--gold`) fills to `compute / compute_allocated`, ember below 15 %. Stations by status: `active`, Scout between the shelf and the table's west end (−1.8, −0.8) with notes (the stool with no task), Scribble seated with the quill ticking at 4 Hz, the Inspector at (1.2, −1.0) raising the draft to L1 then stamping, Penny between the table edge (1.8, −0.8) and the Purse sweeping motes, the Porter at (2.0, 0.2) until `PROPOSED` sends him on the long walk to (3.4, 0.0); `waiting_at_door`, every cat frozen and the Porter at (3.4, 0.0) with the envelope out and no glow; `halted`, every cat idle, Penny beside the empty Purse, the Note on the table; `packed` or `partitioned`, the room is not drawn (roof on, tile in haze or dark).

Lights: the preset's key and hemisphere; **L1** the table lamp (point, `#f2cb7a`, 1.2, range 5, decay 2, always on, the one shadow caster); **L2** the desk lamp (same, lit while `held > 0` with a human reason or `note !== null`, read from state so a replay begun mid-hold is right; the event only starts its 200 ms ramp); **L3** the Door frame's emissive, same rule; **L4** Scout's lantern, `--cyan`, the 600 ms of `STATE_SYNC` only.

## 5. The actor kit

One low-poly peg-cat for all five: capsule body 0.45 × 0.30 m, sphere head 0.28, two 0.10 m tetrahedral ears, a tail as one curved 0.40 m strip, a 0.24 m base disc in `--oak-dark`; 0.90 m tall, 10–14 facets, `flatShading`, vertex colours (× 0.92 feet, × 1.06 head), a contact-shadow ellipse 0.32 × 0.12 m at 30 % black. At view height 14 m on 1080 rows (77 px per metre) a cat is 69 px; at 320 × 180 it is 12 px and reads by ears and prop alone. The outline is an inverted hull, a `BackSide` copy pushed 1 px in screen space along **smoothed** normals (a flat hull cracks at the facets), in `--oak-dark`. Two ink dots for a face when `A < 1.3`. From Stage 3 up cats are not drawn.

| seat | fur | the one prop | at work | walk (steps / s) |
|---|---|---|---|---|
| Scout | `#d4913b` | spectacles, satchel, a lantern (`--cyan` during `STATE_SYNC` only) | reaching up, a volume in paw | quick trot, tail up, 2.6 |
| Scribble | `#7a624d` | a long quill, the tallest line in the room, and an ink pot | bent over the table, quill ticking | slides along the bench, 1.0 |
| Inspector | `#5c5148` | a loupe on a stick and a stamp | draft to L1; stamps a `--sage` tick or an `--ember` mark | slow, 1.4 |
| Penny | `#b9a88f` | a broom (long diagonal) and a brass scoop | sweeps motes table → Purse, never a pile | short busy steps, 3.0 |
| Porter | `#3e3b38` | flat cap, a `--paper` envelope 0.24 × 0.16 held out | at the Door: still, tail down, zero glow | the long walk, 2.0, envelope leading |

Poses are five morph targets, not a rig: `idle`, `walkA`, `walkB`, `work`, `wait`. Walking sets `walkA = 0.5 + 0.5 · sin(2π · f · t)` at the seat's rate, `walkB` its complement, a 3 cm bob; idle sways the tail ±6° at 0.5 Hz; `wait` has the tail still, head 6° down, no bob. A **Thought** is a DOM pill (`--pill`, 1 px `--oak-dark`, 11 px, radius 6) anchored 0.35 m above the head, sliding up 8 px in 120 ms, living 2.4 s, at most three per node. A **Burn** glow is the base disc's emissive, radius 0.35 m: 0.2 for `fast_quantized`, 0.5 for `balanced_staff`, 1.0 with 6–12 motes rising 0.6 m over 900 ms for `frontier_deep`; `cache_hit` halves it; it cools as `exp(−3 · age / tickSeconds)`; a waiting figure has none.

## 6. The street (Stage 2)

A house tile is a hex plinth (top `--plinth`, bevel `--plinth-lit` 0.15 m, edge `#4c3f30`), 0.30 m thick, carrying the §4 house with its roof on: walls `#2c2219`, timber corners `#5a422f`, `--roof` shingles on a gable whose ridge runs east–west 1.6 m above the eaves (pitch 27°), so the Door sits under the east gable, facing the ring centre; a lantern hangs 0.4 m right of the leaf at 2.0 m. **The Letter Slot** is a `--brass` plate 0.40 × 0.12 m in the leaf at 1.10 m: `--gold-2` at rest, `--cyan` during a handshake, `--gold-light` for 300 ms on `DELIVERED`. **The chimney**, a 0.5 m brass-capped pot on the ridge at x = −1.0, glows and smokes with `heat`; a waiting house's chimney is cold. **The lantern is the status pill made physical**, never cold: `--paper` steady at 0.6 for `active` (a lit window), `--gold-light` breathing 0.4 → 1.0 at 0.41 Hz for `waiting_at_door`, `--ember` steady for `halted`, off for `packed` or `partitioned`. Neighbours keep their roofs on at every altitude: nothing is shared by default.

**The kerb** is a `#4c3f30` stone ribbon 1.2 m wide through the ring's kerb stones (one `--brass` stud, r 0.12, per tile at 5.0 m from its centre toward the ring centre), lantern posts every three cells. **Couriers** are the peg-cat pulling a 0.6 m hand-cart with the envelope upright on it; above 20 houses in view, an envelope with two feet on one instanced quad mesh (cap 1,024). `PROPOSED { kind: 'hire_service' }` sends a courier from `from`'s slot to the stone midway between the two houses' stones in 900 ms. `SETTLED` plays four beats there in 800 ms: **lock** (both slots `--cyan`, 150), **swap** (the quads cross, 250), **verify** (a `--cyan` ring 0.8 m wide, 200), **settle** (a gold-leaf seal on the stone, both rims tick `--sage`, `amount` as a projected label, 200). A `REJECTED` whose reason starts `hash mismatch` snaps the courier back in 300 ms under a 500 ms ripple of static (grain at 40 %) on both plates; `DROPPED_BY_COURIER` stops the cart at the kerb and the envelope dissolves to grain in 500 ms.

## 7. The city (Stage 3)

One `InstancedMesh` of hex prisms (top cap 4 + 12 side triangles: 16 triangles, 48 indices, no bottom; 5,000 instances = 80k triangles), `HEX_SIZE` 6; heights 0.6 ground, 1.2 house cell, 2.0 the Clearinghouse; the baseboard's bevelled `--oak` frame runs round the spiral's edge. **The Clearinghouse** at `(0, 0)`: a round hall, a 4 m `--brass` dome on a 2 m plinth, six ports, its lantern `--paper` toward `--gold`. Each **street** is a contiguous run of ring cells sharing one rim with small lanterns along it: `--gold-2` at rest, `--ember` while any house on it is `halted` (a state read, not a memory), off when packed; a rim never says a street was busy lately. The ground spiral extends two rings past the last street: **foundries** on the six corner cells of ring `radius + 1` (three `--roof` stacks, `--ember` rims at 60 %, a slow plume), **data yards** on the six corners of ring `radius + 2` (timber longhouses, lantern rows at 30 %); they carry no number and read no texel (`aSlot = −1`). **Tubes** are brass-ringed glass ribbons (one instanced mesh, cap 512) from each street's marker cell along the ring roads to the dome, 10 % gold pilot glow at rest; Penny's sweeps are the same ribbons at 15 %, never a vault.

**The `NETTED` pulse**, once per tick from one `uPulses` entry: (1) 0–240 ms every tube fills inward, width `clamp(gross / 200, 0.2, 1.0)` m, `--gold-2`, quad-in; (2) 240–400 ms the dome flares `--gold` and the block line writes `netted 12 envelopes · gross 60.0 → net 20.0`; (3) from 400 ms one gold ring leaves the dome at 40 ms per hex, width scaled by `net / gross`, so a heavily netted city visibly sends less out than came in; (4) every `SETTLED` in the same frame ticks the destination rim `--sage` for 300 ms. `SLASHED` flashes a rim ember for 400 ms, drops the purse arc from the next frame's texel, and leaves an ember scorch at 40 % that fades over the next eight `TICK_COMMITTED` and clears at once on `TOPPED_UP`. `PACKED` folds a street's cells into its marker cell ring by ring (600 ms, 40 ms per ring); `UNPACKED` unfolds them in `stochastic_seed` order with `burn_distributed` falling as ember motes (`min(64, ceil(burn_distributed / 5))`).

## 8. Stages 4–5

**The Country** is a raised-relief model of cut card at `HEX_SIZE × 7`: a seeded heightfield composed *around* the city cells `layoutCountry` places (each city on a plateau; the field fills only between them), five contour steps of 0.5, risers `#1e1710`, plateaus `#2a2118`, contour lines `#3a2f24`; streets and houses packed beneath. **The High Court's line** is an inlaid `--paper` strip 0.3 wide at 40 % along the hex edges between city groups, a `--brass` pin at every vertex; nothing crosses it without a mark. `ROLLED_BACK { to_tick }` is the visible unwind: over 900 ms every contour layer slides 0.5 toward the case edge and returns while the plate desaturates to the fog tint and the root ticker rewinds to `to_tick`, `slashed` printed. `VOIDED` strikes the envelope's feed line through in `--sage`; `SLASHED` is the city's flash and scorch.

**The World** is a globe on a brass stand: sphere R 6,000 (`#141d24`, stroke `#385b66`, the one blue-black allowed), a `--brass` armillary ring at R + 300 tilted 23°, countries as lantern beacons by ascending id on the 30° N circle (`--panel` plates, a `--gold` pin), fibre as great-circle ribbons in `#4c3f30` with a 20 % `--cyan` core. `GLOBAL_STATE_CONFIRMED` is the STARK heartbeat: a cyan meridian sweeps once round the ring over `latency_ticks × tickSeconds` and a cyan tab lands on the ticker. `AWAITING_FINALITY` orbits the envelope at R + 150 round its beacon until `until_tick` (dedupe by `envelope`). **A partition is a country going dark**: every beacon in `partitioned[]` loses its lantern and its fibre core, its pill reads "partitioned", until a later heartbeat omits it.

## 9. Motion rules

One orchestrated moment per event type; every clip starts at the event's `arrivedAt` and is scaled by `uTickSeconds`. Easings are CSS names for DOM and the same curves in GLSL. Sound is the house prototype's Web Audio synth (no assets, nothing above gain 0.22; ARCHITECTURE §B), off under reduced motion unless turned on.

| event | what moves | ms | easing | colour | sound |
|---|---|---|---|---|---|
| `THOUGHT` | DOM pill above the seat | 2400 | slide-up 120 ease-out | `--pill` | write tick |
| `BURN` | ember disc at the seat; chimney glow on the street | to next tick | exp cool | `--ember` | `sfxCoin`; `sfxWrite` for Scout, Scribble |
| `PROPOSED` | Porter walks table → Door; courier leaves the slot | 900 | ease-in-out | `--paper` | — |
| `DROPPED_BY_COURIER` | cart stops at the kerb, envelope dissolves | 500 | ease-out | `--ink-3` | — |
| `AWAITING_HUMAN_SIGNATURE` | Door frame and desk lamp ramp, dialog opens, room freezes | until decided | 200 ease-out | `--gold-light` | `sfxKnock` |
| `AWAITING_FINALITY` | envelope orbits the beacon | until `until_tick` | linear | `--cyan` | — |
| `APPROVED` | Door swings 70° about its north jamb, the Porter steps out, gold leaf on the frame; handshake completes (Street); tube lights (City) | 600 | ease-in-out | `--gold` | `sfxStamp` |
| `REJECTED` | paper returns to the table, ember on the step; courier snaps back, static ripple (Street) | 700 | ease-in / snap | `--ember` | `sfxStamp` |
| `SLASHED` | rim flash, purse arc drops, scorch | 400 + 8 ticks | ease-out | `--ember` | short `sfxHalt` |
| `SETTLED` | four-beat kerb handshake | 800 | 4 steps | `--cyan` → gold leaf, `--sage` tick | coin pair |
| `DELIVERED` | envelope enters the Letter Slot | 300 | ease-in | `--gold-light` | — |
| `STATE_SYNC` | Scout's lantern, the cyan front, fog cleared behind it | 600 + cascade | linear front | `--cyan` band | 1318 Hz sine 0.4 s |
| `HALTED` | the Note drops onto the table, rim goes ember, L1 dims to half | 400 | ease-in, one bounce | `--paper` | `sfxHalt` |
| `SEAT_FAILED` | the seat's stool tips 15° and rights itself | 400 | ease-out | — | — |
| `VOIDED` | sage strike-through | 500 | linear | `--sage` | — |
| `TOPPED_UP` | coins into the Purse's lid, the Note lifts | 600 | ease-out | `--gold-2` | coin pair, upward |
| `PACKED` | children fold into the marker cell ring by ring | 600 | 40 ms per ring | fog tint | — |
| `UNPACKED` | children unfold in seed order, embers fall | 600 | 40 ms per ring | `--ember` motes | — |
| `NETTED` | the four-beat dome pulse (§7) | 400 + 40 × radius | quad-in, then linear | `--gold-2` → `--gold`, `--sage` ticks | coin pair |
| `ROLLED_BACK` | contour layers slide back, root ticker rewinds | 900 | ease-in-out | fog tint | `sfxHalt` |
| `GLOBAL_STATE_CONFIRMED` | meridian sweep; partitioned beacons dark; ticker tab | `latency_ticks × tick s` | linear | `--cyan` | sine held |
| `TICK_COMMITTED` | block line, five counts, ticker tab, day-cycle step | 0 | — | — | — |

**Fog** is `1 − Φ` from the truth texel, drawn as lantern smoke: a domain-warped simplex sample (`warp = fog · 0.06`), desaturation toward the stage's tint at `0.7 · fog`, grain at `fog² · 0.35`, a chroma split below Φ 0.75 written `(1.0 − smoothstep(0.55, 0.75, phi)) · 0.012`, and under it at 35 % weight the Ledger's hatch, four grades at fog 0.02–0.12, 0.30–0.40, 0.55–0.65 and 0.80–0.90, anchored to the tile's own uv so lines never swim and stay 6 px on screen: a pattern channel a colour-vision-deficient viewer reads like everyone else. The **`STATE_SYNC` sweep** is a hard diagonal front crossing a tile in 600 ms behind a `--cyan` band 12 % wide (paying the oracle is verification): the new Φ behind it with hatch and grain erased, the old ahead; the reducer writes cascade delays into `uTimes` (room: table, Desk, Purse, Door at 80 ms per station; city: 40 ms per hex ring), so the shader makes no cross-node lookup. Between events Φ, purse and heat tween from `uTruthPrev` to `uTruth` over one tick.

**Reduced motion** (`prefers-reduced-motion` or `?motion=reduced`; `uReducedMotion = 1`): sweeps and band dissolves become 150 ms fades; no warp animation, grain flicker or breathing (waiting reads as steady `--gold-light`); the fog is hatch only at 85 %; cats cross-fade between stations in 120 ms with no bob; bubbles appear without slide; the dialog opens without transform; the radar sweep is a ticker tab; dust off; sound off unless turned on.

**Nothing animates from polling.** A clip is born only from an event; a value that looks different this frame is not a cue. The reducer runs once per frame, the render loop reads uniforms and textures only, and `reducer.test.ts` keeps it so.

## 10. The zoom

One `PerspectiveCamera`, one altitude scalar `A ∈ [1, 5]`. The camera sits at `T + d · (−cos p · sin y, sin p, cos p · cos y)` looking at the focus `T`, `d = H / (2 tan(fov / 2))` (the dolly identity; at fov 4°, `d = 14.32 H`), `near = d / 50`, `far = 4d`. Pitch 30° and yaw 45° give the 2:1 dimetric read; 4° keeps convergence under 2 % without a camera swap. A critically damped spring (half-life 120 ms) smooths `A`, `T` and yaw.

| band | stage | steady A | up / down at | dissolve window | view height H (m) | pitch / fov | tick s |
|---|---|---|---|---|---|---|---|
| 1 | House | [1.0, 1.5) | 1.6 / — | [1.35, 1.65] the lid | 14 | 30° / 4° | 1.2 |
| 2 | Street | [1.5, 2.5) | 2.6 / 1.4 | [2.35, 2.65] the baseboard | max(70, 2.4 × the ring arc) | 30° / 4° | 0.7 |
| 3 | City | [2.5, 3.5) | 3.6 / 2.4 | [3.35, 3.65] the plateau | clamp(2.2 × radius, 140, 1200) | 30° / 4° | 0.4 |
| 4 | Country | [3.5, 4.5) | 4.6 / 3.4 | [4.35, 4.65] the globe | 6,000 | 30° → 55° over [3.5, 4.0] / 4° | 0.3 |
| 5 | World | [4.5, 5.0] | — / 4.4 | — | 16,000 | 55° → 35° / 4° → 40° | 0.25 |

`H` is log-interpolated between bands. Crossing `k + 0.6` going up or `k + 0.4` going down calls `zoom/<n>` once (brief §5); the ladder shows "asking the engine…" and the dissolve weight is clamped at 0.5 until `PACKED` / `UNPACKED` or a confirming `TICK_COMMITTED` arrives, so the camera never shows a scale the engine is not simulating. At band 1 the yaw is 45° in the focused house's frame (its Door always on the right); the house's rotation is blended out of the yaw over `A ∈ [1.5, 2.0]`, after the lid is on, so the room never turns while open. Each dissolve is a modeller's gesture: **1 → 2**, nothing composited, the roof and the two near walls fade in while translating down 0.6 m over `A ∈ [1.35, 1.65]`, the lid going back on, as fixtures and cats fade out and the neighbours' lanterns come up out of their own fog; **2 → 3**, the baseboard's bevelled `--oak` frame appears and the plinths rise 0 → 0.35 m as the outgoing band fogs out through a half-res render target (`w = smoothstep(k + 0.35, k + 0.65, A)`); **3 → 4**, the city plate becomes one plateau of the relief; **4 → 5**, the relief fades onto the globe (the curl stays behind `?morph=1`).

**A packed street** renders the parent's profile, never the children: its cells merge into one smooth cast block (`aFold = 1`, `--resin`, y-scale 0.05 on the children's cells) at the marker cell, haze at `1 − mean_confidence` shimmering at `0.5 + 4 · epistemic_variance`, one chimney with heat `avg_compute_burn_rate × child_count / uBurnRef`, a lantern at `mean_confidence`, a purse arc from the parent's texel, a DOM plate "`child_count` in stasis · `macro_ticks` ticks": the Mandelbrot interior, nothing moving inside, because the children's clocks are stopped.

## 11. Thumbnail test

**The thumbnail**: house run, seed 7, tick 4, Golden, a director take at H = 7 m framing the Oak Table's east end to the step (154 px per metre at 1080p; at 320 × 180 the cat is 23 px, the Door leaf 26 × 54, the envelope a 6 × 4 px white mark). The Porter stands at the step, envelope out, still; the Door's brass frame and the desk lamp are the two brightest warm things in the frame; L1 pools gold on the table where the Inspector stands, loupe down; the smoke on the north wall is visibly thicker than at tick 1 (Φ 0.973 → 0.893). Over the Door, the paper card: **Nothing burns while you decide.** Held 3 ticks · purse unchanged at 754.95 cr · Φ 97.3% then, 89.3% now. One figure, one lit door, one sentence, provably true in the same frame: the gauge on the brass box has not moved since tick 1.

**The hero wide** (the opening shot): the street run with `zoom/1` sent before tick 1 so every house's gate is the Door, tick 1, `A = 1.3` (H ≈ 22.7 m, roof off). The focused room is open, four cats frozen at their stations, the Porter at the Door; beyond the kerb five cottages sit with their roofs on and one gold lantern each, breathing. One contrast and one object: a dark warm ground, one gold rectangle (the boundary), one white rectangle (the thing that wants to cross it), a cat between them; at 320 × 180 the hex, the roofs and the doorway are three shapes, and the figures are the thumbnail's job.

## 12. Left out, and why

- **Any score, rank, reputation or leaderboard**, and any client-side ordering of nodes: none exists in `StateView`; the DOM scan of every recorded frame for the forbidden words is the first acceptance.
- **The 16-tick rim recency, the barometer dial, any number not in a frame**: a window is frontend arithmetic; a needle invites comparison.
- **The mood frame's palette and kit** and its settings column: one popover, not a rail.
- **Tilt-shift**: a second blur competing with fog = 1 − Φ.
- **Bloom on gold or lantern glass**: the only glow is cyan, so a proof is the only thing that glows.
- **PBR brass, environment maps, textures, a skinned rig**: flat colour, line and hatch keep 5,000 tiles in one draw call and render the same on SwiftShader; five morph targets read the same at 69 px.
- **Cyan for waiting**: waiting is the human hand, gold; only Stage 5's finality hold, a proof pending, stays cyan.
- **Floating tile labels, house names at Stage 3, a minimap, weather, wall-time cycles**: labels are DOM cards, at most eight; nothing moves that the engine did not move.
- **A vault or yield for Penny, the wall board, the mouse at the Desk, the skateboard courier**: Penny's motes go back into the Purse; the desk lamp is your presence and the `<dialog>` is your hand.
