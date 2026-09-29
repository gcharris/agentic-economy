# Review of the room (Stage 1), 2026-09-29

Reviewer: the design session (Fable), from `tests/gpu/out/room-t1.png`, `door-t4.png`, `thumbnail-t4.png` on commit fccedcd. Verdict: the bones are right and should not be reworked (camera angle, the room's plan, the Door card's copy and paper, the HUD zones, the Archives). Three things stop it reading, all lighting and scale. Fix these before the street, because the street and city reuse the same light rig and actor kit.

## 1. It is far too dark

The floor and walls are near black; only the desk lamp's pool is visible. DESIGN §2's Golden preset means a warm, visibly lit room: the oak floor readable as oak, the north wall visibly two-toned (`#2c2219` → `#201811`), the lamp pool warmer than its surroundings rather than the only light. In three.js physical units the current numbers are an order of magnitude low. Targets, checked on a SwiftShader screenshot: median floor luminance ≥ 40/255; the wall tone distinguishable from the floor; no pixel of a cat below 20/255. Use ACES tone mapping with exposure about 1.2, a hemisphere light around 1.5 to 2.0, the key directional around 2.5, the table lamp and desk lamp as point lights in the tens of candela with decay 2. Keep ember emissive, never a light (DESIGN §2).

## 2. The actors are silhouettes

The five cats read as black blobs; fur tones and props are lost, so the Porter is not distinguishable from the Inspector. Give the peg-cat material vertex colours with a small emissive floor (about 0.06 of the fur tone) so shadow never takes them to black, the inverted-hull outline in `--oak-dark`, and the props at the sizes in DESIGN §5. The Porter's envelope is the most important prop on screen: a 0.24 × 0.16 m paper quad in `--paper`, slightly emissive, held out in front, so it is the one white rectangle in the frame.

## 3. The room is too small in the frame

At 1280 × 720 the room occupies about a third of the height, with dead ground around it. DESIGN §10 sets H = 14 m for 1080 rows (77 px per metre, a 69 px cat). Make the pixels-per-metre constant instead of H: H = viewport height ÷ 77, so the cat is 69 px at any height. The thumbnail take (DESIGN §11) is H = 7 m, framing the table's east end to the step; the shipped thumbnail looks wider than that. Re-shoot it after the fixes and check the four elements: the gold frame, the white envelope, the cat between them, the sentence.

## Smaller

- The Purse should read as a brass-bound box (0.40 × 0.30 × 0.25) with the lid arc, not a pale lump; the Note is a sheet on the table only while `note` is non-null.
- When the Door card is open it covers the focus card. Anchor it to the Door's projected position, lower right of the room, per DESIGN §3, and let the focus card stay visible.
- The receipts feed is the loudest thing on screen: three lines, smaller mono, `--ink-3`.
- The Door leaf at tick 4 must be closed with the frame lit; it opens only on `APPROVED` (tick 5).

Then continue in §11 order: (c) the street, (d) the city, committing and pushing after each, with one screenshot per milestone sent to the Director. No reports in between.
