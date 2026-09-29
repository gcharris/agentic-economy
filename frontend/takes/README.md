# Takes

The demo's rendered takes: 1280 × 720, 24 fps, H.264 (MP4 only). They are rendered from the real page on the real
engine (the wasm in a worker, or the recorded trace), frame by frame on a virtual clock, in headless Chromium on
SwiftShader. `../RECORDING-PLAN.md` has one row per shot: what it shows, its source and flags, ticks, band, lighting,
duration and the command that renders it.

| file | shot | seconds |
|---|---|---|
| `01-room-t4.mp4` | the room at tick 4, the Porter at the Door, the card open (the thumbnail framing) | 4 |
| `02-door-no-then-yes.mp4` | the live Door: knock, two held ticks, "No, leave it on the table"; knock, "Yes, send it" | 11.5 |
| `03-street-settle-revert-t7.mp4` | the street: t6 settles at the kerb; t7 the hash-mismatch reverts, 0.5 cr sunk | 6 |
| `04-city-netted.mp4` | scenario 3: the Clearinghouse's NETTED pulse, twice | 4 |
| `05-city-drifted-streets.mp4` | the 6 × 8 city after the Door sequence: streets 1–3 crisp, 4–6 drifted | 5 |
| `06-court-rollback-t3.mp4` | scenario 4 from the Country: ROLLED_BACK's unwind, the ticker rewinding, the scorches | 3.5 |
| `07-zoom-room-to-world.mp4` | the room at tick 4 out to orbit on world_full(3, 2, 3, 4), ending on the tick-16 heartbeat | 12 |
| `08-heartbeat-t16.mp4` | the globe at tick 16: the meridian sweep, the comet on the ring, the cyan ticker tab | 3.5 |
| `09-streets-seal-unpack.mp4` | City → Country → City: the streets seal (PACKED) and unpack (UNPACKED) | 9 |

To render again (from `frontend/`, after `npm install && npm run copy-assets`):

```
TAKE=1 npx playwright test take-shots      # 01, 03–06, 08, 09 (SHOT=<name> for one)
TAKE=1 npx playwright test take-door       # 02
TAKE=1 npx playwright test take-zoom       # 07
sh scripts/encode-takes.sh                 # WebM → takes/*.mp4 (GIF=1 also writes takes-gif/, not committed)
```

The engine side is deterministic for a given build and seed (7): the same command replays the same ticks and events.
