# Elm Street: Director's usability sheet

**One shared week; 2–4 people; 10 seconds per tick; about 6m 40s.** Prepared under doc 06 §11.7. This session has not been run. Its purpose is comprehension, not balance, deception, winning, or replay appeal.

**Session record:** Date __________ Participants / house names ____________________ Observer __________

## Before people arrive

Use the kitchen-table recipe in HANDOFF §9: laptop and phones on the same household Wi-Fi. Choose 2–4 names in the server command and give each person exactly one of those houses. These are explicit experiment settings: **send 3, budget 800, oracle 10, R8, week 40, seed 7**. Defaults stay unchanged.

From the repository root, prepare `cd frontend && npm install && npm run copy-assets`. Requires Node 22.18+ and Rust stable. Then start these in separate terminals:

```sh
cd frontend && npx vite --host --port 5173 --strictPort
```

```sh
cd engine && cargo run --release --bin serve -- --scenario street --names Ada,Ben,Cal,Dee --tasks 15 --budget 800 --week 40 --seed 7 --send-ticks 3 --price-walk --price-every 8 --oracle person --oracle-cost 10 --interval-ms 10000 --bind 0.0.0.0 --port 8787
```

Pause as soon as the server prints its listening address (it starts ticking immediately): `curl -X POST http://127.0.0.1:8787/pause`. Record starting tick _____; restart if setup has consumed more than one tick.

Open on the TV: `http://<laptop-ip>:5173/?source=sse&view=tv`. On each phone: `http://<laptop-ip>:5173/?source=sse&house=Ada` (replace Ada). Confirm correct names and matching ticks. Use SSE: all phones must share this one engine. Browser WASM tabs each run separate games. Allow local-network access if the system requests it.

## At the table

Read: “You each have a house and fifteen pieces to finish. Your staff draft them; you decide what happens at the Door. Try the available choices and tell us when something is unclear. We are testing the screen, not you.” Explain only how to tap a button. Let people ask questions; record help given. Do not assign harness strategies or suggest who should finish first.

Resume: `curl -X POST http://127.0.0.1:8787/resume`. Observe one week. If a connection fails, record the failure and reopen that same SSE URL. Do not coach trading or change settings mid-week.

At a relevant moment ask, without supplying the answer: (1) What will each card choice do? (2) Where is the Porter, and when can you act again? (3) What does the oracle's answer tell you, and can it become stale? (4) What happens if you put in 50, or end your house's week? (5) What does your final Note say happened? If a feature was never used, mark it “not observed” rather than understood.

## Record each person's words

| Person / house | Confused by; help given | Wanted to do but could not | Did price matter? How? |
|---|---|---|---|
| 1 __________ | | | |
| 2 __________ | | | |
| 3 __________ | | | |
| 4 __________ | | | |

After Friday, save the Notes and record bugs separately from misunderstandings. Keep any comments about fun as anecdotes. This sheet supports usability findings only; the formal economics-and-deception session remains a separate decision after matrix review.
