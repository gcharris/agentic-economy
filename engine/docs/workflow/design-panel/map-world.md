# World bible · the room with the oak table (Reader B: the visual world)

Sources read in full: `engine/docs/FRONTEND-DESIGNER-BRIEF.md`, `IF-THE-AGENTS-DO-THE-ECONOMY.md`, `game_design_docs/03_FRACTAL_SCALING_AND_LOD.md` §3, `game_design_docs/02_ENTITY_STATE_MACHINE.md` §4, `GAME_ENGINE_ARCHITECTURE.md`, `the-house.html`, `the-zoom.html`, `presentation/index.template.html` lines 1–120, `engine/src/agents/statistical.rs`; the two prototype screenshots and the three mood images. Line numbers below point into those files so the builder can lift exact values.

Standing rules carried through every section: the vocabulary is the Purse, the Oak Table, the Door, the Porter, the Note, the Letter Slot, the Clearinghouse, the High Court, the STARK heartbeat, and the five seats Scout / Scribble / Inspector / Penny / Porter. Seats are staff, not traders. Nothing on screen measures one seat against another.

---

## 1. Palette tokens and type

### 1.1 The validated tokens (`presentation/index.template.html` lines 8–33)

These are already validated for colour-vision deficiency on the dark ground. Extend, do not replace.

| token | hex | for |
|---|---|---|
| `--ground` | `#16110c` | the page and the room's deepest dark; the floor plane at every stage; `body` background |
| `--panel` | `#1e1710` | cards, HUD panels, the Door `<dialog>` body, `kbd` background |
| `--raised` | `#27201a` | hover and raised surfaces (button hover) |
| `--line` | `#3a2f24` | hairlines, card borders, section rules |
| `--line-2` | `#4c3f30` | stronger borders, `kbd` edge, button borders |
| `--ink` | `#ece2cf` | primary text on the dark ground |
| `--ink-2` | `#b9a88f` | secondary text, the lede |
| `--ink-3` | `#8a7a64` | muted labels, uppercase `h4` eyebrows, rail labels (the brief's "muted") |
| `--dim` | `#7a6c5c` | the dimmest legible text |
| `--gold` | `#d4a755` | display gold: headings' accent, the primary button, focus ring, the lit rail dot, the Door's brass when a helper waits |
| `--gold-2` | `#b98626` | gold for marks: gauge fills, brass hardware, small glyphs (darker so it does not glare) |
| `--cyan` | `#2aa5b8` | the one cold accent: verification. StateSync sweeps, the Inspector's stamp glint, DvP handshakes, the STARK heartbeat |
| `--cyan-2` | `#7cc8d3` | verification as text: links, `code`, the lit stage ladder, hashes |
| `--ember` | `#c95140` | sunk cost and burn: `Rejected` sunk compute, `Slashed`, danger buttons, heat at a seat |
| `--ember-2` | `#e0705f` | ember as text |
| `--sage` | `#6a9a6e` | approval: `Approved`, `Settled`, the "good" button border |
| `--sage-2` | `#8fbf92` | approval as text; the live dot |
| `--paper` | `#f0e6d2` | paper: drafts, the Note, receipts, thought pills |
| `--paper-2` | `#e3d6bb` | the second sheet in a stack, aged paper |
| `--paper-ink` | `#1c150e` | ink on paper; text on the primary (gold) button |

Rules the template already encodes (lines 42–70): `a` in `--cyan-2`; `:focus-visible` is a 2px `--gold` outline offset 3px; `code` is `--cyan-2` on `rgba(42,165,184,0.08)`; `.num` uses tabular figures; `prefers-reduced-motion` kills the fog canvas and sweep animations (line 39).

### 1.2 Proposed extension tokens (from the prototypes; new names, not replacements)

The validated set has no wood, and the room is made of it. These are the prototypes' literal values, promoted to names. Reason written down: the room needs oak surfaces and the brief's tokens cover ground, panel and line only.

| token | hex | source | for |
|---|---|---|---|
| `--wall` | `#2c2219` | house line 652 (top of wallpaper gradient) | the cutaway's back wall, top of gradient |
| `--wall-2` | `#201811` | house line 653 | wallpaper mid-stop (70%) |
| `--floor` | `#19130d` | house `--floor` line 11; canvas line 725 | the floor band and its `#2e2116` skirting line |
| `--oak` | `#5a422f` | house `--wood` line 13 | oak furniture body, door panels, shelf frames |
| `--oak-dark` | `#3e2d1f` | house `--wood-dark` line 14 | oak in shadow; thought-pill stroke |
| `--oak-top` | `#423021` | house line 696 | the Oak Table's top plank |
| `--oak-leg` | `#312318` | house line 698 | table legs, undersides |
| `--door` | `#4a3525` | house line 676 | the Door's leaf |
| `--door-frame` | `#2e2116` | house line 678 (idle) | the Door frame at rest; flips to `--gold-light` on knock |
| `--gold-light` | `#f2cb7a` | house `--gold-light` line 16 | the lit door frame and plaque; the "you" label |
| `--spine-a…d` | `#7a4f32` `#8b3a2b` `#3d5c48` `#a6884e` | house line 666 | book spines in the Archives (cycle of four) |
| `--shelf` | `#4f3926` | house line 661 | shelf boards |
| `--case` | `#3a2a1c` | house line 659 | bookcase carcass |
| `--pill` | `#fff8ed` | house line 798 | thought-pill fill (slightly warmer than paper so it reads as air, not paper) |
| `--paper-aged` | `#d8c8a8` | house `--paper-dark` line 18; canvas line 706 | the lower sheet of a paper stack; the receipt's `#e4d8bf` note block sits between this and paper |
| `--purse-fill-a/b` | `#c49132` → `#e8be66` | house line 105 | the Purse gauge gradient (left to right); `--gold-2` → `--gold` is the validated equivalent |
| `--fur-scout` `--fur-scribble` `--fur-porter` | `#d4913b` `#7a624d` `#3e3b38` | house lines 738–740 (declared, never used by `drawHelper`) | fur tones for the actor kit (§3) |

Prototype tokens that the validated set supersedes (do not carry): house `--bg #14110e`, `--room-bg #221b14`, `--text #e8ded0`, `--muted #a39580`, `--red #b84a39`, `--green #4a8a55`; zoom `--bg #0f0d0b`, `--card #1c1712`, `--border #382c20`, `--gold-bright #f5cf7d`, `--text #ede4d6`, `--muted #9e8e79`, `--cyan #56b6c2`, `--green #4da662`. Map them to `--ground`, `--panel`, `--ink`, `--ink-3`, `--ember`, `--sage`, `--line`, `--gold-light`, `--cyan`. The zoom's brighter cyan `#56b6c2` is close to `--cyan-2`; use `--cyan` for strokes and `--cyan-2` for text.

### 1.3 Type (`index.template.html` lines 5, 29–31, 51–63)

- Display: **Fraunces** (`opsz 9..144`, `wght 300..600`, `SOFT 0..100`). Weight 400 throughout. `h1` at `clamp(2.6rem, 6.5vw, 5.4rem)`, line-height 1.02, `"opsz" 144, "SOFT" 40`; `h2` `clamp(1.9rem, 3.6vw, 2.9rem)`, 1.12, `opsz 72 SOFT 30`; `h3` 1.35rem, 1.25, `opsz 24 SOFT 20`. Letter-spacing `-0.005em`, `text-wrap: balance`.
- UI: **Schibsted Grotesk** 400/500/600/700. Body 17px / 1.55. `h4` and eyebrows are the small caps voice: 0.8rem 600 uppercase `0.08em` in `--ink-3`; eyebrow 0.78rem 600 `0.12em` in `--gold`.
- Receipts, hashes, Φ, credits: **JetBrains Mono** 400/500 at `0.86em`, tabular numerals.
- Fallbacks: Georgia / Times; Helvetica Neue / Arial; Menlo / Consolas.
- The prototypes used Palatino/Georgia for everything and `ui-monospace` for receipts; the receipt's monospace-on-paper is the one prototype type decision to keep (house lines 165–176: 0.8rem, line-height 1.5, `rotate(-0.5deg)`, dashed `#998870` rule under the title).

### 1.4 Stage palettes (proposal, derived)

One world, five distances. The ground stays `--ground`; what changes is which accent carries the gate.

| stage | ground / plate | gate accent | second accent | notes |
|---|---|---|---|---|
| 1 House | `--wall` → `--floor` gradient | `--gold` (the Door) | `--ember` heat, `--cyan` sync | oak everywhere; paper is the brightest thing |
| 2 Street | `--ground` night, `#221c16` road (zoom line 324) | `--cyan` (the Letter Slot handshake) | `--gold` door-lights | stars `rgba(255,255,255,0.4)` 1.5px (zoom lines 560–567) |
| 3 City | `--ground` plate, hex rims in `--line-2` | `--gold` (the Clearinghouse) | `--ember` foundries, `--sage` settled | the `Netted` pulse runs `--gold-2` → `--gold` |
| 4 Country | `--ground` map, contour lines `--line` | `--paper` / `--ink` (the High Court's stop-line) | `--ember` `RolledBack`, `--cyan` `Voided` | a drawn map, not a diagram |
| 5 World | `#0a0806` (zoom line 453) | `--cyan` (the STARK heartbeat) | `--gold` sunlit side | globe body may go cold: `#141d24` stroke `#385b66` (zoom lines 467–469) is the one place a blue-black is allowed |

---

## 2. Every object in the room

The room is a left-to-right sentence: **look** (Archives) → **draft and audit** (Oak Table) → **send** (Door), with the person's Desk and the Purse at the Door end. Both prototypes keep this order; keep it.

Prototype geometry (house canvas is 980×380 CSS px; house lines 647–744, zoom lines 250–312):

| object | house prototype | zoom prototype | meaning (story / engine) |
|---|---|---|---|
| **Back wall** | vertical gradient `#2c2219` (0) → `#201811` (0.7) → `#15100b` (1), lines 651–656 | `#231b14` → `#140f0b`, lines 252–256 | the house; fog (1 − Φ) should live here as haze |
| **Floor** | `#19130d` band, bottom 70px, skirting line `#2e2116` 1px, lines 724–732 | `#16110c` band, bottom 80px, line 301 | the ground token; actors' shadows fall on it (ellipse 16×6 `rgba(0,0,0,0.3)`, line 755) |
| **The Archives** (bookcase, left) | case `#3a2a1c` 110×180 at (30,80); 4 shelves `#4f3926` 100×6 every 40px; 6 spines per shelf 11×26 cycling `#7a4f32 #8b3a2b #3d5c48 #a6884e`; label "ARCHIVES" `#c2b199` 10px serif at (55,75). Lines 658–672 | 110×220 at (40,80), shelves every 50px, spines `#8a3a2b #3d5c48 #a6884e #634735`; label "ARCHIVES (Look)". Lines 258–271 | Scout's station. "Looking something up costs a little." In the engine every lookup is a cache miss (`statistical.rs` line 15: "the world is new every time"), so the shelf is never the same shelf twice. The oracle (`StateSync`) belongs here too: Scout "asks the oracle before I look anything up". |
| **The Oak Table** (centre) | top `#423021` at `x = 0.32w`, width `0.36w`, y 230, height 26; two legs `#312318` 14×50 at each end. Lines 693–699 | top `#4a3525` at `0.35w`, width `0.32w`, y 230, h 30; legs 14×80 `#332419`. Lines 273–279 | Local truth. `SovereignNode.local_cache: MerkleTree` (doc 02 §1). "Keep the papers in the house, not in the helper." `NodeView.oak_root` is its hash. Nothing on it is ever shown to another house (brief §7). |
| **The papers** (on the table) | drawn only when `papersSaved > 0`: two sheets 28×16, `#f0e6d2` at (centre−20, 222) over `#d8c8a8` at (centre−18, 220); "DRAFT" 9px monospace `#998870`. Lines 702–711 | always drawn, 32×20, "DRAFT" `#332419`. Lines 281–287 | `NodeView.papers`. The engine leaves three kinds per task, in order: Scout's "Lookup notes · {task}", Scribble's "Draft · {task}", Inspector's "Audit · {task}" (`statistical.rs` lines 73, 162, 234). Draw a stack that grows by one sheet per paper; the Audit sheet carries a sage tick (passed) or an ember mark (flagged). "A draft on the table is still yours to ignore." |
| **The Door** (right) | leaf `#4a3525` 75×190 at (w−110, 70); frame 4px `#2e2116` at rest → `#f2cb7a` when `doorKnocked`; knob `#d4a755` r5 at (x+16,170); plaque "THE DOOR" bold 11px serif `#7a6a57` at rest → `#f2cb7a` when knocked. Lines 674–691 | leaf `#5c412c` 85×240 at (w−130, 80); frame 3px `#d4a755` always; knob r6; plaque `#f5cf7d` bold 12px. Lines 289–298 | The boundary. `boundary_rules` (doc 02 §3). Rule 2: a `<LiquidityTransfer>` halts here and the node freezes; Rule 3: a No destroys the envelope and does not refund the draft's burn. The frame lighting up is the one canvas signal of `AwaitingHumanSignature`; the DOM `<dialog>` is the hand. The Porter stops 30px short of it (house line 478: `targetX = 760`). |
| **The Door card** (DOM) | `.door-card` idle: border `#4a3a2a`; `.active`: border `--gold`, glow `0 0 16px rgba(212,167,85,0.2)`, background `#292016`. Badge "CLEAR" (muted) / "HELPER WAITING" (gold). Two buttons: yes `--green` white text, no `#382c20` with `#52402e` border. Lines 124–144, 262–274, 493–515 | none | becomes the brief's `<dialog>`: **Yes, send it** / **No, leave it on the table**, the cost, "Nothing burns while you decide" with the live proof (ticks held, purse unchanged, Φ then and now). |
| **The Purse** (DOM card, never on canvas) | title "The Purse" + "N coins"; `.purse-bar` 16px pill on `#14110e` with `#3d3022` border; `.purse-fill` gradient `#c49132 → #e8be66`, width = purse/max, 0.3s ease; "Burned: N" / "Max: 100" in monospace `--muted`; a cost hint box `#18130e`. Lines 100–110, 228–246, 392–400 | not drawn (HUD text "Burn: 100 coins") | "The amount you are willing to let them burn, this week, on thinking." Engine gauge = `compute / compute_allocated`; heat = `burned_this_tick`. Doc 03 lists the Purse as a station actors walk to, so give it a body in the room: a brass-bound box on the Desk whose lid-gauge mirrors the DOM bar. Penny's station. |
| **The Desk** (the person's) | not drawn as furniture; "You" (🐁) sits at (w−65, h−100) labelled "You (The Door)" in `#f2cb7a` bold 10px serif. Lines 734–735, 773–783 | "You (Door Latch)" at (w−90, h−45). Line 308 | The brief names it first: the Desk, the Purse, the Oak Table, the Door. It is where the Note arrives and receipts are read: a small writing desk beside the Door with a lamp. Proposal: the person is not an actor; the lamp lights when a helper knocks, and the Purse sits on this desk. |
| **The Note** (receipt modal) | `#receipt-modal` dims the canvas `rgba(10,8,6,0.85)` + blur 4px; `.paper-receipt` 440px, `--paper` on `--ink`, monospace 0.8rem/1.5, `rotate(-0.5deg)`, shadow `0 12px 30px rgba(0,0,0,0.8)`; title "NOTE ON THE TABLE" with dashed `#998870` rule; five `.line` rows; `.note` block `#e4d8bf` with 3px `#665540` left border, italic; button `#33271c`. Lines 159–181, 210–223, 583–595 | none | `Halted { note: Note }`, `NodeView.note`. "The note says what they were in the middle of, what they spent, and that they stopped because the purse was empty." Also shown at week end. It is not a moral judgement; it is the piece of paper that lets you see the burn. |
| **The receipts** | folded into the Note (Purse Burned / Left in Purse rows) | none | `NodeView.receipts`: one per `Burn` (seat, tier, tokens, credits, joules, cache_hit). JetBrains Mono on `--paper-2`, stacked in the Desk's drawer ("Put Receipt in Drawer & Continue"). |
| **Thought pills** | `#fff8ed` roundRect radius 6, 22px tall, stroke 1px `#3e2d1f`, text 11px serif `#1c150e`, centred 44px above the actor; live 90–180 frames, fade over the last 30. Lines 785–816 | none | `Thought { seat, text }`. Move to DOM so text is real text; keep the pill shape and the fade. |
| **Actor shadow** | ellipse 16×6 `rgba(0,0,0,0.3)` under each helper, line 755 | none | keep in 2.5D as a contact shadow so feet touch the floor |

Not carried from the prototype: the wall-board experiment (house lines 608–613, 713–722, 422–437) that shows the stampede failure. It was built to demonstrate why the room has no such board; the build has no toggle for it and no board.

Room proportions to keep: Archives occupy the left ~12%, the Oak Table the middle 32–68%, the Door the right ~11%; actor row at y ≈ 71% of canvas height; the Porter's walk from table-end to door is the longest walk in the room, and that is on purpose.

---

## 3. The five staff as characters

What each seat does per tick is from `engine/src/agents/statistical.rs`. Tiers from `engine/src/resources.rs` lines 19–44: `FastQuantized` (~7B quantised; 0.002 J/tok; "drifts fastest"), `BalancedStaff` (~70B; 0.008 J/tok; the production default), `FrontierDeep` (0.035 J/tok). Epistemics from `engine/src/epistemics.rs`: hallucination below Φ 0.75; overdue for the oracle after 5 uncalibrated handovers; the oracle costs 15 cr; default rigor 0.82.

The scratch-key chain (`sources` → `believed_price` → `audit`) implies the order Scout → Scribble → Inspector → Penny → Porter within a tick. Every seat skips its work when the node is halted (no burn on an empty purse).

### 3.1 Scout — reads
- Tier `FastQuantized`. Station: the Archives.
- Each tick with a task: if its notes are overdue or Φ < 0.75, thinks *"My notes are {gen} handovers old (Φ {n}%). Asking the oracle before I look anything up."* and proposes a `StateSync` to itself (15 cr). If the price is on the table and the purse is under 1.5× the task's nominal cost, thinks *"The purse is light ({n} cr). Buying the compact lookup."* and reads 60% of the tokens. Burns "lookup" (always a cache miss), rolls 3–6 sources, leaves the paper **Lookup notes · {task}** ("{k} sources consulted, {t} tokens read"), thinks *"Looked up {k} sources for {task}."*
- Character: the one who notices its own notes are old. Curious, quick, cheap, forgetful.

### 3.2 Scribble — drafts
- Tier `BalancedStaff`, rigor 0.90. Station: the Oak Table, near end.
- Each tick with a task: a cache hit if Scout's `sources` are on the table. **With the price hidden** it buys `FrontierDeep` at 2× tokens ("because it sounds thorough"); with the price visible and the purse light, thinks *"The purse is light ({n} cr). Writing the compact draft."* at 60%; otherwise the ordinary draft. Burns "draft", records a handover (Φ moves), reads `price/courier` from the Oak Table (default 10.0). If hallucinating, with probability = fog, believes a price drifted ±10–30% and thinks *"I'm fairly sure the courier costs {x} now (Φ {n}%)."* Leaves **Draft · {task}** ("{t} tokens, courier priced at {x}, Φ {n}%"), thinks *"Drafted {task} ({t} tok, cache hit)."*
- Character: the writer. Below the threshold it starts to believe prices that are not on the table; the fog is its failure mode.

### 3.3 Inspector — audits
- Tier `FrontierDeep`, rigor 0.98. Station: the Oak Table, far end, under the lamp.
- Each tick with a task: cache hit if `believed_price` is on the table; audit tokens (1.5× when the price is hidden). Burns "audit", records a handover at high rigor; verdict **passed** unless the node is hallucinating, then **flagged**. Leaves **Audit · {task}** ("{verdict}, {t} tokens, Φ {n}%"); thinks *"Audit passed for {task}."* or *"I cannot verify {task} from what is on the table. Flagging it."*
- Character: the most expensive thinker in the house and the slowest to speak. Its stamp is the only place the cold accent appears inside the room.

### 3.4 Penny — the Steward, sweeps the cushion
- Tier `FastQuantized`. Station: the Purse (on the Desk). Burns nothing.
- Each tick with a task: cushion = max(0, nominal estimate − burned so far); if positive, notes it back to the runway and thinks *"Swept {c} cr of unburned allocation back to the runway. Zero yield."*
- Character: "Never yield. Never a balance." Penny tidies; Penny does not invest. Draw motes going back into the Purse, never a pile growing beside it. The zoom prototype's "Penny's Vault (MMF)" / "Automated Liquidity Sweeps (0% idle cash)" (lines 402, 179) contradicts this and must not be carried; at Stage 3 Penny's sweeps are reclaim lines, not a vault.

### 3.5 Porter — walks to the Door
- Tier `FastQuantized`. No inference burn of its own; the send cost is charged only after Yes.
- Each tick with a task, once the Audit paper is on the table: thinks *"Walking to the door with {task}. Sending costs {n} cr. Nothing burns while we wait."* and proposes `Dispatch` to the parent (compute weight = the task's spend). On a street with known neighbours it also proposes `HireService { courier }` to one random neighbour at the believed price with its hash (this is what `Settled` / "hash mismatch" at Stage 2 is about).
- Character: carries and waits. The only seat that touches the boundary. Standing at the Door costs nothing and the drawing must say so: zero glow, still tail.

### 3.6 The actor kit (no emoji)

The prototypes use 🐈 for helpers and 🐁 for the person (house lines 738–740, 778; zoom lines 305–308). Keep the species, drop the glyph.

**Base: the peg-cat.** One low-poly body shared by all five: a rounded capsule body, a sphere head, two triangular ears, a tail as a single curved strip. Roughly 10–14 visible facets on the silhouette so it reads as carved wood, not as a mesh. No face at distance; two ink dots when the camera is close. Height ≈ 0.9 of a Stage-1 floor tile; ~32 px at default altitude; must still read at 16 px by ears + prop alone. Flat-shaded, one fur tone, one prop, a contact shadow. Toon outline in `--oak-dark` at 1 px.

| seat | fur | the one prop that makes the silhouette | idle | at work | on the move |
|---|---|---|---|---|---|
| Scout | `--fur-scout #d4913b` | round spectacles + a satchel; a small lantern that lights `--cyan` only during `StateSync` | on a stool by the Archives | reaching up to a shelf, a volume in paw | quick trot, tail up |
| Scribble | `--fur-scribble #7a624d` | a long quill (the tallest line in the room) + ink pot | seated at the table | bent over the table, quill ticking, a sheet appearing | walks little; slides along the bench |
| Inspector | `#5c5148` (new, darker taupe) | a loupe (a circle on a stick) + a stamp | standing at the far table end | holds the draft up to the lamp; stamps: `--sage` tick or `--ember` mark | slow, deliberate |
| Penny | `--ink-2 #b9a88f` (pale) | a broom (long diagonal) + a brass scoop | beside the Purse on the Desk | sweeps motes of `--gold-2` from the table edge back into the Purse | short busy steps |
| Porter | `--fur-porter #3e3b38` | flat cap + an envelope held out in front (a `--paper` rectangle, the most readable prop of all) | by the table's door end | stands at the Door, still; envelope out; no glow | the long walk; the envelope leads |

"You" is not an actor. The Desk's lamp is your presence: unlit when nobody is at the Door, lit `--gold-light` when the Porter knocks, and the `<dialog>` is your hand. If a small figure is ever wanted at the Desk for warmth, it is the mouse from the prototype, in the same kit, and it never moves.

Heat and fog on actors: `Burn` puts an ember glow at the seat's feet scaled by tier (`FastQuantized` a faint `--ember` at 20%, `BalancedStaff` steady, `FrontierDeep` bright with rising motes); `waiting_at_door` is explicitly zero. Fog (1 − Φ) is drawn on the house, not the cat: haze on the back wall and jitter on the papers' ink; the cat only *says* it (Scout's oracle line, Scribble's price line).

Stage 2 courier: the same peg-cat pulling a hand-cart, envelope on the cart; at 20–50 houses per street it may reduce to the envelope with two feet. The zoom prototype used 🛹 (line 517); do not carry the skateboard.

---

## 4. Per stage: what the prototypes draw, what doc 03 §3 asks for

Zoom prototype note: `setZoom` (lines 204–221) sets `animProgress = 0` and records `prevZoom` but nothing reads them; every stage change is a hard cut. The brief wants one altitude scalar with cross-dissolves at band edges (§5).

### Stage 1 · The House
- **Draws (house):** wallpaper gradient, the Archives, the Door with a frame that lights on knock, the Oak Table with a growing paper stack, the floor, "You" at the Desk, three helpers (Scout, Scribble, Porter; no Inspector, no Penny), thought pills; DOM deck of three cards (Purse / Table / Door); the Note as a paper modal. Sim step 1800 ms ÷ speed (line 824); actors lerp 8% per frame (line 748). Walks: Scout 140 → 220 (to the shelves) → 370 (hands notes); Scribble stays at 420; Porter 680 → 760 (Door) → 640 after Yes, → 460 after No; "You" at 860 (lines 354–359, 409, 453, 478, 537, 555).
- **Draws (zoom):** the same room without the DOM, three sprites with role labels "Scout (Survey)", "Scribble (Draft)", "Porter (Waiting)", "You (Door Latch)", and a banner (lines 305–311).
- **Doc 03 asks:** interior cutaway; individual avatars moving between the Desk, the Purse and the Door; animation 1:1 with real compute execution.
- **Gap to close:** five seats (add the Inspector at the far table end and Penny at the Purse); the Purse and the Desk as furniture; per-event moments from the brief's table: `Burn` heat, `Thought` pill, `Proposed` (Porter walks), `AwaitingHumanSignature` (frame lights, lamp lights, dialog opens, the whole node pauses), `Approved` / `Rejected`, `Delivered`, `StateSync` (cascading light from the Archives across the wall), `Halted` (the Note lands on the table).

### Stage 2 · The Street
- **Draws (zoom, lines 315–384):** night ground `#181410` + 30 pseudo-random stars; a road band at `0.56h`, 90 px tall, `#221c16` with `#382e24` edge and `#4a3c2e` dashes `[16,16]`; four houses ("House A (Your Study)", "House B (The Bakery)", "House C (The Clinic)", "House D (Law Office)") each a 110×110 body `#2b221a`/`#5a432f`, a roof triangle `#4a2d1d` 130 wide × 45 tall, a door 28×45 `#16110c` stroked 1.5 px `--gold`; one courier moving at 2.2 px/frame along the road; a DvP spark: a `#56b6c2` circle r8 at House B's threshold, blinking on a 40-frame cycle, captioned "ATOMIC DVP CURB SWAP".
- **Doc 03 asks:** a street map of 20–50 houses as single buildings; couriers (vehicles or drones) between properties; animations from `AtomicDvP` events on the Courier Event Bus.
- **Brief asks:** `Settled` as an atomic handshake at the kerb; `Rejected` with "hash mismatch" as the swap reverting with a ripple of static; `Netted` is not here. Also `DroppedByCourier` and `Proposed { HireService }`.
- **Keep:** the Letter Slot as the lit rectangle in each door; the spark colour is `--cyan`; the road stays warm. Lose the emoji roofs and the four hardcoded names (the engine's `NodeView.name` supplies them).

### Stage 3 · The City
- **Draws (zoom, lines 387–418):** `#120f0c` + stars; three labelled boxes `#1f1711` with coloured strokes: "Compute Foundry" (left, `--ember`, "Bob's Oven at Scale (Wholesale FLOPs & Energy)"), "City Clearinghouse" (centre, `--gold`, "Shared Inter-House Registry (Swift/DTCC rails)"), "Penny's Vault (MMF)" (right, green); two `#e8be66` 3 px pipes joining them at `cy+80`; one `#f5cf7d` r5 pulse travelling left to right at 3 px/frame.
- **Doc 03 asks:** hex-grid zoning "like the reference screenshot"; large foundries, data centres and the central Clearinghouse; batch transport lines (glowing tubes or highways) for liquidity sweeps; pulsing networks for end-of-day clearing.
- **Brief asks:** one `InstancedMesh` of hex prisms; `Netted` as an end-of-tick pulse through the Clearinghouse (gross in, net out); `Slashed`. `scenarios::city` at 2 streets × 3 houses is enough.
- **Keep:** the three-part zoning (foundries ember, Clearinghouse gold, Penny's sweep lines) and the pulse-on-a-tube idea. **Drop:** the "Vault (MMF)" and every yield word (see §3.4); the boxes become hex districts.

### Stage 4 · The Country
- **Draws (zoom, lines 421–449):** `#100d0a`; three explanatory columns `#1c150e` (Tier 1 pocket cash `--cyan`; Tier 2 bank deposits `--gold`; Tier 3 central bank `--ember`) with bullet text; a stop-line bar `#1e1610`/`#5a432f` at the bottom reading "THE SOVEREIGN STOP-LINE: National Laws & Constitutional Courts" and "Software is deterministic, but the state holds the human monopoly on physical law."
- **Doc 03 asks:** a topographic map with cities as interconnected nodes; regulatory boundary lines (the High Court); broad sweeps of colour for the three-tier money flows (CBDC ballast settling).
- **Brief asks:** `RolledBack` (the whole graph rewinds one snapshot; a visible unwind), `Voided`, `Slashed`.
- **Keep:** only the stop-line as a concept (the High Court is a drawn line on the map, in `--paper`/`--ink`, that nothing crosses without a mark). **Drop:** the columns; the prototype is a slide, not a place.

### Stage 5 · The World
- **Draws (zoom, lines 452–497):** `#0a0806` + stars; a globe r110 at (0.5w, 0.54h): atmosphere radial `rgba(86,182,194,0.2)` → transparent from 0.7r to 1.3r, body `#141d24`, stroke 2 px `#385b66`; three nodes (Tokyo, London, New York) as `#56b6c2` r5 dots; a dashed `[4,6]` cyan ring at r+18; a `#f5cf7d` r4 satellite orbiting at 0.02 rad/frame; a badge "RECURSIVE STARK: Verified in 8s" in `#1e1610` stroked cyan.
- **Doc 03 asks:** planetary sphere / orbital view; intercontinental fibre lines; massive pulses for the 8–32 s global STARK verification beats; sun/shadow maps showing energy arbitrage.
- **Brief asks:** `GlobalStateConfirmed` as a sweeping radar line (the STARK heartbeat, 8–32 tick finality), `AwaitingFinality`, and partition (a country goes dark on the rails). The camera opens from dimetric to orbital perspective here.
- **Keep:** the cold ring and satellite as the heartbeat; the atmosphere glow in `--cyan` at low alpha. **Drop:** the three city names (the engine's nodes name them); the badge becomes a HUD pill.

---

## 5. The mood references

### mood-3 (`mood-3-hex-colony-video-frame.png`): take and not take
What is in the frame: an isometric hex colony on a grey-blue plate over a green planet with low-poly trees; hexes grouped into zones with a coloured rim per zone (blue, purple, red, green, orange) and a floating zone label; white domed modules with coloured trims, antennae, a rocket, walkways; dozens of tiny white-grey agents walking between modules; a card popup with Open / Archive; and a settings rail: Quality preset (Potato / Low / Balanced / High / Ultra), HDR + bloom, Shadows, Particles, Textures, Ground detail, Anti-aliasing, Render scale, Adaptive quality, Scatter, Max crew, Stars; Planet (Luna / Mars / Terra); Lighting (Dawn / Morning / Noon / Golden / Dusk / Night), Time of day, Cycle day/night, Cycle length, Environment light, Exposure, Bloom; View: Rest to isometric, Field of view.

**Take**
- The hex zoning: districts as clusters of hex prisms with one rim colour per district meaning. Ours: `--ember` foundries, `--gold` the Clearinghouse district, `--sage` settled streets, `--cyan` only where verification lives.
- Readable little actors: high contrast against the plate, one prop each, visibly busy, walking real paths between real stations (the joy is that they are *doing something*, and in our world what they do is the engine's events).
- Crispness and depth: hard-edged prisms, soft contact shadows, a slight bevel on the tile top, no motion blur; depth from the dimetric angle, not from fog.
- The settings rail's two ideas: **day/night** (a lighting preset list and a time-of-day slider; ours runs Dawn → Night over the warm palette, and Stage 5's sun/shadow map is the same slider seen from orbit) and **quality presets** (Potato → Ultra mapping to shadow/particle/instance budgets; the brief's 60 fps with 5,000 tiles is the Balanced floor). "Rest to isometric" becomes "rest to the room's angle".
- The joy: small, warm, a little bouncy; the world looks lived-in.

**Do not take**
- The palette: grey-blue plates, white plastic modules, saturated neon rims, green grass, a bright sky. Ours is oak, brass, paper and ink on a dark ground.
- The sci-fi kit: domes, antennae, rockets, robot agents, walkways with rails, the Luna/Mars planet presets.
- HDR + bloom as a look. Bloom, if any, is reserved for the cold accent (the heartbeat, a sync sweep) and never on gold.
- Floating zone labels over tiles and the repo/thread side list. Labels go in the DOM HUD.

### mood-1 (Julia) and mood-2 (Mandelbrot): how they inform the zoom
- **mood-1** is a spiral of nested ovals; every ring holds smaller copies of the whole, and the detail sits on the rings, not inside them. **mood-2** is the black cardioid with bulbs on bulbs and red filaments on the boundary; the interior is calm and featureless, the edge is where everything happens.
- Read for the zoom: (1) **the same motif at every altitude**: an interior, a rim, a gate. The house's walls, the street's kerb, the city's hex rim, the country's boundary line, the world's orbital ring are one shape drawn at five sizes; the gate always sits on the rim. (2) **Detail concentrates at boundaries**: doors, letter slots, the Clearinghouse, the High Court's line, the STARK ring get the animation budget; interiors stay quiet. (3) **Packed nodes are the black interior**: a `packed` node renders as a smooth dark body with its parent's statistical profile and nothing moving inside; `Unpacked` is the filaments appearing. (4) **Continuity**: one altitude scalar, and a zoom into a hex should let its rim become the house's walls before the room resolves, never a hard cut. The prototype's stage change is exactly the cut to avoid.

---

## 6. Sound cues in the house prototype (keep them)

`the-house.html` lines 294–330: a Web Audio synth with no assets. `playTone(freq, type, duration, gain)` builds one oscillator into a gain node with an exponential ramp to 0.0001 over `duration`. A header toggle reads "Sound: ON" / "Sound: OFF" (line 329; drop the emoji). The zoom prototype has no sound.

| cue | synthesis | fired on (prototype) | engine event to bind |
|---|---|---|---|
| `sfxCoin` | 987 Hz sine 0.15 s g0.08, then +50 ms 1318 Hz sine 0.20 s g0.06 | every purse deduction (`updatePurse`, line 395) | `Burn` (credits > 0); `ToppedUp` reversed (play the pair upward) |
| `sfxWrite` | 300–500 Hz random sawtooth 0.06 s g0.02 | look and draft steps (lines 449, 471) | `Burn` by Scout or Scribble; a soft tick per `Thought` is acceptable |
| `sfxKnock` | 120 Hz triangle 0.12 s g0.20, then +110 ms 110 Hz triangle 0.14 s g0.22 | Porter reaches the Door (line 486) | `AwaitingHumanSignature` |
| `sfxStamp` | 180 Hz sine 0.18 s g0.18, then +60 ms 90 Hz triangle 0.25 s g0.20 | both Yes and No at the Door (lines 527, 546) | `Approved` and `Rejected` (same stamp; the frame colour tells them apart) |
| `sfxHalt` | 220 Hz square 0.30 s g0.08, then +200 ms 164 Hz square 0.40 s g0.08 | the purse empties (line 574) | `Halted` |

Not in the prototype, proposed to match the accent: `StateSync` a single 1318 Hz sine 0.4 s g0.05 (the cold one); `Settled` the coin pair; `GlobalStateConfirmed` the same sine held for the sweep. Keep gains where the prototype put them; nothing above 0.22. Sound is off when `prefers-reduced-motion` is set unless the person turns it on.

---

## 7. Copy the prototypes use (reuse verbatim)

Units: the prototypes say "coins"; the engine and the brief say credits, "cr". Keep "coins" only where the story is quoted; the room shows "cr".

### The Door (house prototype)
- Card title: **The Door** · badge **CLEAR** / **HELPER WAITING** (lines 265, 502, 508)
- Idle: *"Nobody is at the door. Work on the table stays inside the house."* (lines 267, 511)
- Waiting: *"Porter has **{task}**. Sending costs **30 coins**. Nothing drains while they wait."* (line 504)
- Buttons: **Y — Send it (30)** · **N — Not yet (0)** (lines 271–272). The brief's final wording replaces them: **Yes, send it** · **No, leave it on the table**, plus *"Nothing burns while you decide"* with the live proof.
- Footer hint: *"Press [Y] or [N] when the helper knocks."* (line 285)
- Porter's pill: *"Knocking at door..."* (line 487); after Yes *"Dispatched out door!"* (line 533); after No *"Returning draft to table"* (line 552)
- The person's pill: *"Authorized."* (line 534) · *"Not yet. Revise."* (line 551)
- Table card after Yes: *"Sent out into the world. You permitted it. Cost: {n} coins."* (line 535)
- Table card after No: *"You said no. The draft sits safely on the table. Scribble will try another draft."* (line 553)
- Porter's engine line (statistical.rs line 305): *"Walking to the door with {task}. Sending costs {n} cr. Nothing burns while we wait."*

### The Note (house prototype, lines 210–223, 565–590)
- Title: **NOTE ON THE TABLE**
- Rows: **Day:** · **Status:** · **Tasks Done:** ("{sent} sent, {drafted} drafted") · **Purse Burned:** ("{n} coins") · **Left in Purse:** ("{n} coins")
- Default note: *"The purse had enough for the drafts. We left the papers on the table. Nothing was sent without your hand at the door."*
- Week complete: status **Week Completed Cleanly**; note *"All 5 days finished. You authorized {n} dispatches at the door. The helpers never sent a page without your hand."*
- Purse empty: status **Purse Empty (Runway Halted)**; note *"{reason} The helper left the papers on the oak table and left a note. You can top up or close."* Reasons: *"The purse emptied while looking up background facts."* · *"The purse ran out while writing the draft."* · *"Not enough coins in the purse to send the letter out."* (lines 445, 467, 523)
- Table card on halt: *"HALTED: {reason} Papers stay on the table. Nobody is deleted."* (line 576)
- Button: **Put Receipt in Drawer & Continue**

### The other cards and headers (house prototype)
- Header: **The House** · *"A week with a helper. You hand them a purse. You stand at the door."* (lines 194–195)
- Day badge: *"Day {n} of 5 ({weekday})"* (line 404)
- The Purse: **The Purse** · *"{n} coins"* · *"Burned: {n}"* · *"Max: 100"* · cost hint *"Thinking costs: • Lookup: 10 coins (cheap) • Drafting: 24 coins (standard) • Sending at Door: 30 coins (irreversible)"* (lines 231–245). In the build the three prices come from the engine's task (`lookup_tokens`, `draft_tokens`, `audit_tokens`, `spend`), never from copy.
- The Table: **The Table** · *"{n} Task Active"* · *"Papers on Table: **{n} drafts saved** | Replacing a helper loses nothing."* (line 258) · *"… | Work belongs to the house."* (line 473)
- Step lines: *"Scout is walking to the city archives to look up initial facts..."* (406) · *"Scout finished surveying. Handing research notes to Scribble on the table."* (451) · *"Scribble laid the draft on the oak table. Porter takes it to the door."* (475)
- Pills: *"Looked up data (-{n}c)"* (450) · *"Draft on table (-{n}c)"* (474). In the build these come from `Thought` events; the engine's own lines (§3) replace them.
- Footer buttons: **Speed: 1x** (2x, 4x) · **Start Week Again** (lines 280, 283). The two experiment buttons are not carried.
- Task names, reusable as scenario flavour only (lines 334–338): *Investigating city supplier prices* · *Drafting the merchant agreement* · *Reviewing lease terms with the landlord* · *Settling courier contracts across town* · *End-of-week client ledger summary*.

### The zoom prototype (HUD lines; lines 108–150, 163–194, 311, 383, 417, 448, 496)
- Header: **The Agentic Economy: Powers of Ten** · *"From the planetary cryptographic rails all the way into the quiet room with the oak table."* · *"Click on map or use controls to Zoom"* · buttons **◀ Zoom Out (Larger Scale)** / **Zoom In (Deeper Scale) ▶** · hint *"Click anywhere inside the view to drill deeper."*
- Default HUD rule: *"Rule: Thought is free to look; the send waits at the door."*
- Stage 1: title *"Stage 1: The House (The Room)"*; sub *"One helper, one purse, the oak table, and the door."*; stats *"Sovereignty: In the human hand • Burn: 100 coins • Idle Leak: 0.0%"*; law *"The work belongs to the house. The irreversible commit stops at the Door."*; banner **STAGE 1: INSIDE THE ROOM** / *"The Oak Table holds the work. The Purse burns on thinking. The Door halts the spend."*
- Stage 2: *"Stage 2: The Neighborhood (The Street)"*; *"Bilateral trade between houses. Couriers, letter slots, and atomic swaps."*; *"Connective Tissue: Atomic DvP (curb swap) • Policy: Letter Slot"*; law *"Houses do not dissolve their walls. They meet at the curb or not at all."*; banner **STAGE 2: THE NEIGHBORHOOD (THE STREET)** / *"Houses do not dissolve their walls. Envelopes swap atomically at the curb."*; spark caption *"ATOMIC DVP CURB SWAP"*.
- Stage 3: *"Stage 3: The City (Shared Utilities & Foundries)"*; *"Compute foundries, centralized clearinghouse, and automated yield sweeps."*; law *"Infrastructure scales up so houses do not need 500 bilateral couriers."*; banner **STAGE 3: THE CITY (MUNICIPAL UTILITIES)** / *"Houses connect through shared compute foundries and automated clearing hubs."* The stats line *"… Sweeps: Penny (MMF)"* and the word "yield" are not carried (§3.4).
- Stage 4: *"Stage 4: The Country (Sovereign Ballast & The Law)"*; *"Three-tier cash (Stablecoins, Tokenized Deposits, Wholesale CBDC) & Courts."*; *"Anchor: Sovereign Central Bank CBDC • Stop Line: Constitutional Court"*; law *"Deterministic software rests on the physical monopoly of sovereign law."*; banner **STAGE 4: THE COUNTRY (SOVEREIGN ANCHOR)** / *"The three-tier cash leg backs the economy; national courts provide the final stop."*; stop-line *"THE SOVEREIGN STOP-LINE: National Laws & Constitutional Courts"* / *"Software is deterministic, but the state holds the human monopoly on physical law."*
- Stage 5: *"Stage 5: The World (The Cryptographic World Computer)"*; *"Recursive STARKs, 24/7 cross-border liquidity, planetary energy arbitrage."*; *"Finality: 8-32 seconds • Proofs: Recursive STARKs • Scope: Planetary"*; law *"Nations verify proofs without trusting foreign servers. The Door scales globally."*; banner **STAGE 5: THE WORLD (CRYPTOGRAPHIC COMPUTER)** / *"Planetary 24/7 liquidity and recursive proofs route energy across time zones."*; badge *"RECURSIVE STARK: Verified in 8s"*.

### From the story, for the Door dialog's proof line and the Note's voice
- *"The purse does not drain while they stand there. The draft stays on the table if you say no."*
- *"They leave the papers on the table, and they leave a note."*
- *"It is not a moral judgment. It is the piece of paper that lets you see the burn without having watched every minute."*
