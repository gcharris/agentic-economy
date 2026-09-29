# DESIGN.md · direction: THE LEDGER (paper, ink, engraved brass)

The world is an instrument: brass plates with lines cut into them, paper receipts lying on the plates, fog as hatching rather than smoke. One cold colour exists and it means "verified". The viewer reads a barometer of the economy.

## 1. Principles

1. **Engrave the boundary, ink the interior.** Walls, kerbs, hex rims, court lines and the orbital ring are cut deepest and lit brightest, because state moves only there; interiors are flat plate with quiet hatching.
2. **A receipt is an object.** Every BURN, SETTLED, REJECTED and TICK_COMMITTED leaves a paper slip or an engraved mark that stays on screen; nothing is shared, so nothing is summarised across houses.
3. **Cyan is spent only on verification.** Sync sweeps, the Letter Slot handshake, the Inspector's stamp, the STARK heartbeat; nowhere else, so the eye learns the one place truth is checked.
4. **Gold seals a commit, ember scars a loss.** Gold leaf appears only after APPROVED/SETTLED; ember only for `sunk_compute`, SLASHED, HALTED. Before a gate decides, an envelope is plain paper.
5. **Fog is drawn, never simulated.** Hatch density is `1 − Φ` from the truth texture; it changes only when a frame or a STATE_SYNC says so, and the sweep that clears it is the one moment the burin light moves.

## 2. Palette

The brief's eleven base tokens are kept verbatim (`--ground #16110c` … `--paper #f0e6d2`), with the world bible's oak, paper and `--gold-light #f2cb7a` extensions. Ledger additions, because the base set has no plate and no engraved line: `--plate #2a2015` (oxidised brass, every tile top), `--engrave #6b5330` (a cut line at rest), `--engrave-lit #d9b46a` (a cut line catching the key light), `--hatch #0e0a06` (fog ink), `--vellum #a8967a` (the Country page), `--space #0a0806`.

| stage | floor | wall / beyond | tile | accent | fog tint (hatch ink) |
|---|---|---|---|---|---|
| 1 House | `#19130d` oak boards, grain engraved | `#2c2219` → `#201811` | `#2a2015` | `#d4a755` the Door | `#0e0a06` |
| 2 Street | `#221c16` road | `#16110c` night | `#2a2015` | `#2aa5b8` the Letter Slot | `#0d0a08` |
| 3 City | `#2a2015` plate | `#16110c` | `#332818`, lit rim `#6b5330` | `#b98626` the Clearinghouse | `#0b0906` |
| 4 Country | `#a8967a` vellum page | `#16110c` sea | `#2a2015` city studs | `#1c150e` court ink | `#4c3f30` |
| 5 World | `#2a2015` globe | `#0a0806` | `#8c6a2e` country studs | `#2aa5b8` the heartbeat | `#0a0806` |

Fixed meanings: **gold** = a commit that happened (APPROVED, SETTLED, DELIVERED, the purse gauge, the lit Door); **cyan** = verification (STATE_SYNC, the DvP handshake, GLOBAL_STATE_CONFIRMED, the Inspector's passed stamp); **ember** = cost that cannot return (BURN heat, `sunk_compute`, SLASHED, the halted rim, a flagged audit); **sage** = a yes that moved no liquidity (the audit tick, VOIDED, `settled` totals).

**Day/night is a lighting preset.** One directional key light (the "burin light", from the camera's upper left, elevation 50°) and one ambient. Dawn key `#e8c9a0` ×0.7, ambient 0.35; Noon `#fff3dc` ×1.0, 0.45; Golden `#f2c078` ×0.9, 0.30; Dusk `#c98a62` ×0.6, 0.22; Night `#7c88a8` ×0.35, 0.15, desk lamp always on. A 0–24 h slider interpolates linearly. Tokens never change; `--engrave-lit` is `--engrave` × key colour × Fresnel.

## 3. Type and the HUD

Canvas draws geometry only; every glyph is DOM. Fraunces 400 for the Door title and the Note heading; Schibsted Grotesk for UI; JetBrains Mono for receipts, hashes, Φ, credits (tabular, `0.86em`). HUD zones, a ledger page over the instrument:

- **Top-left, index tabs:** the five stages, `active_scale` in gold, a pending band in `--ink-3` "asking the engine…", gate names beneath.
- **Top-centre, the block line:** a brass strip (`--plate`, an `--engrave` rule): `tick 4 · root 6f626a64 · sequential · mempool 0`, plus the mode badge.
- **Top-right, the barometer (focus card):** an SVG dial 180 px, gold needle = `compute / compute_allocated`, cyan needle = `confidence`, ember arc under 15 %. Beneath: `name`, status pill, `tasks_done/tasks_total`, `current_task`, `burned_this_tick` ("0.0 cr this tick" while waiting), `liquidity_belief` vs `liquidity_truth` when they differ, `oak_root` first 8 hex.
- **Right column, the receipt strip:** `--paper`, rotated −0.5°, `node.receipts` verbatim newest first, then the 40-line event feed.
- **Bottom-left:** the five `state.gates` strings verbatim. **Bottom-right, the footing:** the eight `totals`, single rule above, double rule below.
- **Bottom edge, the root ticker:** `root_history` as 16 engraved tabs, 8 hex each, newest right; a cyan tab on each GLOBAL_STATE_CONFIRMED.
- Controls bottom-centre: run/pause, step, speed, sound, quality, day/night.

**The Door `<dialog>`**, a paper card 440 px, `--paper` on `--paper-ink`, focus on No:

```
┌────────────────────────────────────────────┐
│ THE PORTER IS AT THE DOOR                   │
│ The House                                   │
│ send the finished draft for doc_synthesis_01│
│ Sending costs 10.0 cr. It comes out of the  │
│ purse only if you say yes.                  │
│ NOTHING BURNS WHILE YOU DECIDE.             │
│ Held 3 ticks · purse unchanged at 754.95 cr │
│ · Φ 97.3% then, 89.3% now                   │
│ ┌──────────────────────┐ ┌────────────────┐ │
│ │ No, leave it on the  │ │  Yes, send it  │ │
│ │ table                │ │                │ │
│ └──────────────────────┘ └────────────────┘ │
└────────────────────────────────────────────┘
```

Hidden unless true, above the buttons: "The camera is at the Street. This envelope was already presented to you; it stays at the Door." and "1 of 2 at the Door"; below them on a recorded run: "Recorded run · the person's answer replays at the recorded tick". The proof line is recomputed each frame while open: `Held N` = `tick − created_tick`; "purse unchanged at X cr" while `compute === openedAt.compute`, else "purse X → Y cr (topped up)"; Φ then = confidence at open, now = current. The card closes only when `state.held` drops the envelope.

## 4. The room (Stage 1)

World units are metres; x east, z south, y up; the hex tile (`HEX_SIZE 6`, flat-to-flat 10.39) holds an 8 × 6 interior. Camera yaw 45°, pitch 30°: the west (x = 0) and north (z = 0) walls are drawn; east and south are cut away; the roof fades in above altitude 1.35.

```
z=0 N wall ═══════════════════════════════════════════════════════
    ║A║                                  DESK 5.0-6.4    ╔DOOR╗
    ║R║                                 ┌──────────┐ lamp ║6.6 ║
 1  ║C║ Scout work (0.7,1.8)            │PURSE 5.4,.6│(6.1)║-7.4║
    ║H║                                 └──────────┘      ╚════╝
    ║I║                   Inspector (4.9,2.0)  pendant (4.9,2.4,y2.3)
 2  ║V║ Scout idle (1.0,2.6)  ┌────────────────────┐  Porter knock
    ║E║                       │     OAK TABLE      │    (7.0,0.8)
 3  ║S║ Scout hands (2.4,3.0) │   papers (4.0,3.0) │ Porter idle (5.9,3.0)
    ║ ║                       │ x 2.6-5.4 z 2.4-3.6│ Penny (5.6,1.2)
 4  ║ ║       Scribble (3.3,4.0)└──────────────────┘
 5  ║x0-.4, z1-4║
 6  ─────────────── cutaway: S and E walls omitted ────────────────
    x=0       1      2      3      4      5      6      7      8
```

Fixtures: the Archives on the west wall, 2.4 high, four engraved shelf lines, spines in the four spine tones; the Oak Table top at 0.75 m, papers a stack of 0.28 × 0.20 sheets, one per `papers`; the Desk 1.4 × 0.6 on the north wall, the Purse a brass-bound box 0.4 × 0.3 × 0.25 on it with a lid gauge (gold arc = `compute / compute_allocated`); the Door 2.1 high, frame `--engrave` at rest, `--gold-light` while `held > 0`; a drawer under the Desk where receipt slips land.

| state | Scout | Scribble | Inspector | Penny | Porter |
|---|---|---|---|---|---|
| active | shelves → hands notes (2.4,3.0) | seated, quill ticking | draft to the pendant, stamps | table east end (5.6,2.4) → Purse | idle until the Audit paper lands, then walks to (7.0,0.8) |
| waiting_at_door | stool | seated, still | standing, still | at the Desk | at the Door, envelope out, zero glow |
| halted | stool | seated | standing | at the Desk | idle; the Note on the table at (4.0,3.0) |
| packed | nothing drawn; the roof is on and the parent's seal shows | | | | |

Lights: (1) the burin key light, directional, camera upper-left; (2) the pendant over the table, `--gold-light`, 60° cone, the only cast shadow (one 1024 shadow map, band 1 only); (3) the desk lamp and (4) the Door frame emissive, both off until AWAITING_HUMAN_SIGNATURE and on while `held > 0`; (5) Scout's lantern, `--cyan`, only during STATE_SYNC.

## 5. The actor kit

One low-poly body, five staff. Height 0.90 m; capsule body 0.45 × 0.30, sphere head 0.28, two triangular ears 0.10, tail one curved strip 0.35; 12 visible facets; flat-shaded, one fur tone, inverted-hull ink outline 1 px in `--oak-dark`; shadow side hatched at 6 px pitch; contact ellipse 0.32 × 0.12. No face beyond 8 m; two ink dots inside it.

| seat | fur | prop (the silhouette) | idle | work | walk |
|---|---|---|---|---|---|
| Scout | `#d4913b` | spectacles + satchel; lantern, cyan on sync | on the stool | reaching up, one volume | quick trot, tail up |
| Scribble | `#7a624d` | a 0.5 m quill, the tallest line in the room | seated | bent, quill ticks 2 Hz, a sheet appears | slides along the bench |
| Inspector | `#5c5148` | loupe + stamp | standing, far end | draft to the pendant; stamp: sage tick or ember mark | slow |
| Penny | `#b9a88f` | broom (long diagonal) + brass scoop | beside the Purse | sweeps `--gold-2` motes table → Purse, never a pile | short busy steps |
| Porter | `#3e3b38` | flat cap + envelope held out, 0.24 × 0.16 `--paper` | table east end | stands at the Door, still | the long walk, envelope leads |

**Thought bubble:** DOM paper pill anchored at the head top `(0, 0.95, 0)`, projected per frame, ink tail, 2.4 s, at most three per node. **Burn glow:** an ember disc at the feet, radius 0.35, alpha = `heat × cool` from `heatGlow()`; `fast_quantized` 20 %, `balanced_staff` 60 %, `frontier_deep` 100 % plus 8 rising motes; `cache_hit` halves it. While `waiting_at_door` the disc is off by rule, not by fade.

## 6. The street (Stage 2)

A house tile: hex prism, corner radius 6 m, height 0.4 m, top `--plate`, rim engraved. On it the house: 8.6 × 6.6 × 3.3 m body, gable 1.6 m rise, shingles as engraved lines. The Door on the north face at x 6.6–7.4; the **Letter Slot** a 0.5 × 0.08 m brass slot at 1.0 m in the door, cyan while an envelope is in flight to or from it. The **chimney** 0.6 × 0.6, 1.2 m above the ridge, over the table at (4.0, 3.0): the same `heat` texel as the room, ember glow and motes; a `packed` house has no chimney.

Houses sit on spiral rings (`layoutCity`); the **kerb** is a 1.2 m brass ribbon along each ring's inner edge, and a swap between A and B settles at the kerb point midway between their door paths. **Couriers** are the peg-cat with a hand-cart, envelope on the cart, an ember wax seal sized by `tax_paid`; above 20 houses the courier reduces to the envelope with two feet; instanced quads, cap 1,024.

SETTLED, 800 ms in four beats: lock (both envelopes stop at the kerb, 150), swap (they cross, 250), verify (a cyan hairline joins them, 200), settle (a gold leaf seal stamps the kerb, both enter their slots, 200). REJECTED with `hash mismatch`: the envelope snaps back to its slot in 300 ms, the hatching around the kerb point scrambles for 700 ms (the ripple of static), an ember slip "0.5 cr sunk" drops into the feed.

## 7. The city (Stage 3)

One `InstancedMesh` of hex prisms. Zoning by ring: a street's houses are contiguous cells on its ring; the street's marker cell carries a brass plaque tile; house rims `--engrave`, a `--sage` rim for one tick after SETTLED. **Foundries** (prisms 1.6× tall, ember-hatched tops) and **data centres** (flat prisms with a cyan rule) are engraved set-dressing on ground cells chosen by `hash(q,r)`; they carry no data and no label. The **Clearinghouse** at `(0,0)`: a three-tier hex plinth, 3 × tile height, a brass ring 8 m across on top.

**Tubes:** instanced ribbons (cap 512) from each street's marker cell to the ring, two ink lines with a hollow core, dark until a pulse passes. **NETTED choreography:** t₀ inbound, gold-2 pulses run every tube inward, width ∝ each street's share of `gross`, 40 ms × radius; t₁ the ring flashes `--cyan` 120 ms (verification); t₂ outbound, one gold ring leaves the plinth at `net / gross` of the inbound width, 40 ms × radius; `envelopes` is a count on the plaque label. SLASHED: ember flash 400 ms, the purse arc drops, a scorch mark stays until `compute` next changes.

## 8. Stages 4–5

**Country:** the plate becomes a vellum page. A seeded heightfield (world-space simplex, 3 octaves) rendered as engraved contour lines every 40 m in `#4c3f30`; cities are brass studs (hex, `HEX_SIZE × 7`) on the ridges; each country's cluster is bounded by the **High Court's line**, a double rule in `#1c150e`, 2 px and 1 px, 6 px apart, that nothing crosses without a mark. ROLLED_BACK: the region's hatching sweeps back to front over 900 ms while the root ticker rewinds one tab to `to_tick`; VOIDED: the envelope's tube line struck through in sage; SLASHED: an ember scorch on the stud.

**World:** a brass sphere R = 6,000 with engraved meridians every 15°; countries are studs on the 30° N great circle; fibre arcs are great-circle ink lines with a cyan core that lights while an envelope is `awaiting_finality` (it orbits the arc until `until_tick`). GLOBAL_STATE_CONFIRMED: a cyan meridian plane sweeps once around the globe over `latency_ticks × tickSeconds`, leaving crisp plate behind it; `partitioned` studs and their arcs go dark (`status 4`, colour × 0.25, hatch at full) until a later heartbeat drops them from the list.

## 9. Motion rules

| event | what moves | ms | easing | colour | sound |
|---|---|---|---|---|---|
| THOUGHT | paper pill above the seat | 2400 | fade last 400 | paper | write tick |
| BURN | ember disc + motes; a receipt slip drops to the drawer | to next tick | `exp(−3t)` | ember | coin pair |
| PROPOSED | Porter walks table → Door; courier leaves the slot | 900 | ease-in-out | paper | none |
| AWAITING_HUMAN_SIGNATURE | lamp + Door frame on; dialog opens; node pauses | until decided | 150 ramp | gold-light | knock |
| APPROVED | Door opens, Porter steps out; gold leaf seal on the frame | 600 | ease-out | gold | stamp |
| REJECTED | paper returns to the table / snap-back + static | 700 | ease-in | ember | stamp |
| DELIVERED | envelope enters the target's slot | 300 | linear | gold | none |
| SETTLED | four beats at the kerb | 800 | stepped | cyan → gold | coin pair |
| STATE_SYNC | cyan hairline crosses the tile lower-left → upper-right, hatching erased behind it; cascade 80 ms per station, 40 ms per hex | 600 + cascade | linear front | cyan | 1318 Hz sine |
| HALTED | the Note lands on the table; rim ember | until top-up | 300 drop | ember | halt |
| TOPPED_UP | coins into the Purse; the Note lifts | 600 | ease-out | gold | coin pair up |
| SEAT_FAILED | the figure flickers, returns | 400 | linear | none | none |
| PACKED / UNPACKED | children fold into / unfold from the seal | 600 | 40 ms per ring | plate | none |
| NETTED | inbound tubes → ring flash → outbound ring | 40r + 120 + 40r | linear | gold-2 → cyan → gold | coin pair |
| SLASHED | ember flash, purse arc drops, scorch | 400 | ease-in | ember | short halt |
| ROLLED_BACK | region hatching sweeps back; ticker rewinds | 900 | ease-in-out | ember rim | halt |
| VOIDED | sage strike-through | 500 | linear | sage | none |
| GLOBAL_STATE_CONFIRMED | meridian sweep; cyan tab on the ticker | latency × tick s | linear | cyan | sine held |
| TICK_COMMITTED | block line, ticker tab, counts | 0 | none | engrave | none |

**Fog shader** (replaces `applyFog`'s grain and chroma split; `visiblePhi`, `sweepFront`, `heatGlow`, `purseArc`, `statusTint` stay):

```glsl
float stripe(vec2 p, float a) {            // one ink line per 6 px, ~1 px wide
  float d = fract(dot(p, vec2(cos(a), sin(a))));
  return 1.0 - smoothstep(0.08, 0.16, abs(d - 0.5));
}
vec3 applyHatch(vec3 col, float phi, float seed) {
  float fog = 1.0 - phi;
  vec2 p = gl_FragCoord.xy / 6.0 + seed * 7.0;
  p += 0.03 * fog * snoise(vec3(p * 0.4, mix(uTime * 0.2, 0.0, uReducedMotion)));
  float h = stripe(p, 0.0)   * smoothstep(0.15, 0.25, fog)
          + stripe(p, 0.785) * smoothstep(0.40, 0.50, fog)
          + stripe(p, 1.571) * smoothstep(0.65, 0.75, fog)
          + stripe(p, 2.356) * smoothstep(0.85, 0.95, fog)
          + smoothstep(0.75, 0.55, phi) * 0.5 * stripe(p + vec2(0.25, 0.0), 0.0); // doubles below 0.75
  return mix(col, vec3(0.055, 0.039, 0.024), clamp(h, 0.0, 1.0) * 0.85);       // --hatch
}
```

`visiblePhi` decides per fragment whether the old or the new Φ feeds `applyHatch`, so the STATE_SYNC front erases lines as it passes; the band itself is `sweepLight` in `vec3(0.16, 0.65, 0.72)` (cyan, not gold). Hatch pitch scales with `uAltitude` to stay 6 px on screen at every band.

**Reduced motion:** `uReducedMotion = 1` → no wobble, sweeps become 150 ms fades, walks become position cuts with a 150 ms cross-fade, the dialog opens without scale, motes off, sound off unless enabled. **Nothing animates from polling:** every row above is keyed to an event's `arrivedAt`; the only value-driven motion is the block lerp `blendT()` between frames, which moves nothing an event did not announce.

## 10. The zoom

One perspective camera, one altitude scalar `A`. Bands and view heights (world units): House [1.0, 1.5) H 14; Street [1.5, 2.5) H max(70, 2.4 × arc); City [2.5, 3.5) H clamp(2.2 × radius, 140, 1200); Country [3.5, 4.5) H 6,000; World [4.5, 5] H 16,000. Hysteresis: `zoom/<k+1>` at `A ≥ k + 0.6`, `zoom/<k>` at `A ≤ k + 0.4`, sent once. Fov 4° through band 4 (dolly `d = 14.3 H`), opening to 40° over [4.5, 5]; pitch 30° → 55° over [3.5, 4.0], back to 35° at 5.

Cross-dissolves: 1↔2, the roof and near walls fade in over `A ∈ [1.35, 1.65]` as engraved shingles, no render target; 2↔3, 3↔4, 4↔5, the outgoing band renders to a half-res target and is hatched to full while the incoming band is un-hatched outward from the focus (`w = smoothstep(k + 0.35, k + 0.65, A)`): the loupe moving across one plate. While a zoom is unconfirmed, `w ≤ 0.5`.

**A Packed street:** the children's cells collapse to flat outlined plate (y scale 0.05); at the street's marker cell a **seal** appears: a smooth dark hex body in `--plate`, nothing moving inside (the Mandelbrot interior), hatch density `1 − packed.mean_confidence`, a slow shimmer whose rate is `epistemic_variance`, chimney heat `avg_compute_burn_rate × child_count / uBurnRef`, and `child_count` as engraved tally strokes on the rim (one per 5, at most 10). The DOM plaque reads "N children in stasis · M macro-ticks". The children's stale numbers are never drawn.

## 11. Thumbnail test

House run, seed 7, tick 4, Golden preset. The room is a brass plate lit from the upper left; every line is warm except one. The Porter stands at the Door with the envelope out; the desk lamp and the Door frame are the brightest gold in the frame; the room carries a thin single-direction hatch (Φ 0.893). Over the table, the paper Door card: "NOTHING BURNS WHILE YOU DECIDE · Held 3 ticks · purse unchanged at 754.95 cr · Φ 97.3% then, 89.3% now", two buttons, the gold one right. Top-right, the barometer's gold needle at 94 %. It reads because there is one doorway, one paper, and one number that has not moved, while the hatching says time is passing anyway.

## 12. Left out, and why

- **Bloom on gold, and any bloom in the room.** Engraving reads by line contrast; bloom fills the cuts. Cyan may bloom at Stages 3–5 only.
- **Textures and normal maps.** Grain, shingles and brushed brass are shader lines; flat colour + line + hatch keeps 5,000 tiles in one draw call.
- **Dynamic shadows beyond the pendant.** Hatching is the shadow.
- **Faces at distance, the mouse at the Desk, the skateboard courier, the sci-fi kit.** The lamp is the person.
- **Foundry and data-centre numbers.** The engine has no such nodes, so they show no value.
- **The wall board, "Penny's Vault", the word yield, city names, per-house labels at Stage 3, a minimap.** Each contradicts the engine or adds a glyph the canvas must not draw.
- **Colour swaps for day/night.** Light multiplies the same tokens, so gold always means a commit.
