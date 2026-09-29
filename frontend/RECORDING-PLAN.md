# RECORDING-PLAN.md · the shot list

Every take is rendered from the real page on the real engine: `npm run copy-assets` puts the wasm and the recorded trace
in place, Playwright opens the page in headless Chromium on SwiftShader (software WebGL), and a take spec drives the
manual handle (`window.__app`: `stepTo`, `step`, `command`, `altitude`, `look`, `render(at)`) frame by frame on a virtual
clock. Decisions (approve, reject, zoom) go through `command`, the same path a person's click takes, and land at the
next block.

**Recorded on:** the cloud build container (Linux, headless Chromium, SwiftShader), 1280 × 720 CSS px, DPR 1,
quality Balanced, 24 fps, seed 7, engine as built by `engine/build-wasm.sh`. Lighting follows DESIGN §2b: Golden in
the room (band 1), Noon outdoors (bands 2–5). Output: WebM (VP8) in `tests/gpu/out/`, then `scripts/encode-takes.sh`
→ H.264 MP4 under `takes/` (committed). Takes are skipped in the normal test run; `TAKE=1` renders them.

| # | name | what it shows | source and flags | tick or range | band | lighting | duration | take command | output file |
|---|---|---|---|---|---|---|---|---|---|
| 1 | room at tick 4 | the room with the lid off; the Porter at the Door, envelope out, every cat frozen; the Door card: "Held 3 ticks · purse unchanged at 754.95 cr · Φ 97.3% then, 89.3% now" (the thumbnail framing, 154 px/m at 1080 rows) | recorded trace: `?source=trace&run=house&clock=manual&take=thumbnail&quality=balanced` | t4 (held) | 1 House | Golden | 4 s | `TAKE=1 SHOT=room-t4 npx playwright test take-shots` | `takes/01-room-t4.mp4` |
| 2 | Door no, then yes | live: the Porter knocks, the card opens, the proof line counts two held ticks; "No, leave it on the table" (the paper returns to the table, ember on the step, "rejected at the Door · the person said no" in the feed); the next knock; "Yes, send it" (the Door swings, the Porter steps out, gold leaf; the purse down by the 10.0 cr fee the next frame, 709.90 → 699.90) | live wasm house run: `?source=wasm&run=house&clock=manual&take=door&quality=balanced` (HUD and card shown, 64 px/m) | t1 knock, t3 No, t4 REJECTED, t5 knock, t6 APPROVED | 1 House | Golden | 11.5 s | `TAKE=1 npx playwright test take-door` | `takes/02-door-no-then-yes.mp4` |
| 3 | street settle and revert | t6: six couriers settle at the kerbs (the four-beat handshake, settle labels at the receiving houses); t7: the hash-mismatch rejections, couriers snap back, "hash mismatch … 0.5 cr sunk" in the feed | recorded trace: `?source=trace&run=street&clock=manual&quality=balanced` | t5 → t7 | 2 Street | Noon | 6 s | `TAKE=1 SHOT=street-settle-revert npx playwright test take-shots` | `takes/03-street-settle-revert-t7.mp4` |
| 4 | city NETTED | scenario 3 (2 × 3): the Clearinghouse's pulse, tubes filling inward, the dome flaring, the gold ring out; "netted N envelopes · gross → net" on the block line | live wasm scenario 3: `?source=wasm&run=city&clock=manual&quality=balanced` | t1 → t3 | 3 City | Noon | 4 s | `TAKE=1 SHOT=city-netted npx playwright test take-shots` | `takes/04-city-netted.mp4` |
| 5 | drifted streets | the 6 × 8 city after the Door sequence: streets 1–3 answered (Φ ≈ 1, clean rims), streets 4–6 left at the Door (Φ < 0.7, frayed coastlines) | live wasm `engine_new_city(6, 8)`: `?source=wasm&run=city&streets=6&houses=8&clock=manual&take=zoom&quality=balanced`; setup: zoom 1, two blocks, zoom 2, approve S1–S3 for 12 blocks, zoom 3 | t1 → t18 (recorded from t16) | 3 City | Noon | 5 s | `TAKE=1 SHOT=city-drifted npx playwright test take-shots` | `takes/05-city-drifted-streets.mp4` |
| 6 | court rollback | scenario 4 (forged_country) seen from the Country: ROLLED_BACK's 900 ms unwind across the plate, the ticker rewinding, "rolled back to tN · M slashed", VOIDED struck in sage, the slashed cities' flash and scorch | live wasm scenario 4: `?source=wasm&run=country&clock=manual&quality=balanced`; `look(4)` (the court runs at City scale; the camera looks from band 4) | t2 → t3 | 4 Country (camera) | Noon | 3.5 s | `TAKE=1 SHOT=court-rollback npx playwright test take-shots` | `takes/06-court-rollback-t3.mp4` |
| 7 | zoom room to world | the room at tick 4 (the Door held) out through the street, the city, the country (the plateau), night falling onto the globe; ends in orbit on the tick-16 heartbeat | live wasm `engine_new_world(3, 2, 3, 4)`: `?source=wasm&run=world_full&countries=3&cities=2&streets=3&houses=4&clock=manual&zoom=1&take=zoom&quality=balanced` | t4 → t16 | 1 → 5 | Golden → Noon | 12 s | `TAKE=1 npx playwright test take-zoom` | `takes/07-zoom-room-to-world.mp4` |
| 8 | heartbeat | the globe at tick 16: GLOBAL_STATE_CONFIRMED, the cyan meridian sweeping once round over latency × 0.25 s (9 ticks, 2.25 s), the comet on the armillary ring, the cyan tab landing on the ticker | live wasm `engine_new_world(3, 2, 3, 4)` at the World: `?source=wasm&run=world_full&countries=3&cities=2&streets=3&houses=4&zoom=5&clock=manual&quality=balanced` | t15 → t16 | 5 World | Noon | 3.5 s | `TAKE=1 SHOT=heartbeat npx playwright test take-shots` | `takes/08-heartbeat-t16.mp4` |
| 9 | streets sealing and unpacking | City → Country: the houses fold into their streets (PACKED), each street a sealed resin plate with "N in stasis"; Country → City: UNPACKED, the houses back | live wasm `engine_new_world(1, 3, 6, 8)`: `?source=wasm&run=world_full&countries=1&cities=3&streets=6&houses=8&zoom=3&clock=manual&take=zoom&quality=balanced`; altitude 3 → 4 → 3 | from t1, a block per band change | 3 → 4 → 3 | Noon | 9 s | `TAKE=1 SHOT=streets-seal-unpack npx playwright test take-shots` | `takes/09-streets-seal-unpack.mp4` |

Stills (PNG, written by the SwiftShader tests on every `npm run test:gpu`, into `tests/gpu/out/`): `thumbnail-t4.png`
and `door-t4.png` (the thumbnail and the Door card), `street-t3.png`, `city-netted-t1.png`, `city-phi-mixed.png`,
`country-rollback.png`, `world-heartbeat.png`.

Encoding: `sh scripts/encode-takes.sh` (H.264, CRF 20, `+faststart`); `GIF=1` also writes 12 fps, 640 px GIFs to
`takes-gif/` for chat previews (not committed).
