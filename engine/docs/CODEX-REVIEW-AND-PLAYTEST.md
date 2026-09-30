# For Codex: review round 1 of the street game, then play it (2026-09-30)

You are working in a Director-declared laboratory. Read `LABORATORY.md` at the repo root first; its rules bind you: no docket, launcher, worktree or PR ceremony; the stop line (nothing from here writes to a core repository, production service, public surface or customer data, becomes a shared dependency or contract, or is described as shipped or adopted); secrets never in files, chat or logs.

**Branch.** Start from `claude/dreamy-carson-g1load` of `gcharris/agentic-economy`. Create `codex/round-1-review` from it and work there. Never push to a `claude/*` branch. Open no pull request unless the Director asks. No multi-agent fan-out; one agent, small commits, each with its test.

**Read, in this order** (all short): `game_design_docs/06_A_WEEK_ON_ELM_STREET.md` (the game: §3 the rules card, §4 the costed decisions, §8 what round 1 built), `engine/docs/HANDOFF.md` §4.9, §9 and §11, then the round-1 commits `3b23796` (engine) and `c85ef97` (frontend) and the finish commit after them. Design decisions are the Director's and stay: no score, rank, reputation or leaderboard anywhere (a test enforces it); the vocabulary (the Purse, the Oak Table, the Door, the Porter, the Note, the Letter Slot; Scout, Scribble, Inspector, Penny, Porter); the Door's answers (send, hire, ask the oracle first, leave it on the table). Do not refactor. Fix only clear bugs.

## Part 1: the review

Check that the engine does exactly what the rules card says, rule by rule, with the enforcing code cited as `file:line`, and name every divergence. In particular:

1. A hire the person approves at the Door crosses the Letter Slot at the **next** tick (`door_cleared`), where `dvp_binding` checks the believed price against the truth; a stale price reverts with only the formatting tax sunk (0.5 cr at compute weight 2.0), the draft stays on the table, and the revert is counted in the house's tally while a "no" at the Door is not.
2. `Engine::sync(node)` costs 15 cr, resets Φ to 1.0 and writes the truth to the Oak Table's `price/courier`, even while the Porter waits at the Door, and idle decay does not undo it in the same tick. Under `OraclePolicy::Person`, Scout never proposes a `StateSync`.
3. The price walk (`PriceWalk::elm_street(seed)`) is seeded and deterministic, moves the `courier` truth among 8, 10, 12 and 14 about once a day, and emits no event: only the oracle knows.
4. At `week_ticks` every house halts with `Note.week`, and its numbers reconcile: purse left = start − compute burned + top-ups; liquidity is conserved across the street; settled + reverted = hires that reached the kerb; pieces done matches the tasks' states. A house that halted earlier (empty purse) gets the week's Note in place of its old one.
5. `serve`: `POST /sync/<node>` (404 for an unknown node), CORS for phones on another origin, `--names` order = `?house=n`, `--week`, `--price-walk`, `--oracle person`; nothing stalls the tick loop when a phone drops its SSE stream mid-week.
6. The wasm exports (`engine_sync`, `engine_new_game`) and `frontend/src/engine/contract/*` agree with the JSON the engine emits (the contract tests cover the keys; check the values' meaning too).
7. The phone view (`frontend/src/ui/phone.ts`, `tests/dom/phone.test.ts`) sends the right command for each of the four answers, composes the send and the hire for the **same** draft into one card, and shows the oracle's last answer and the Note.

Also look for: a yes to both the send and the hire of one draft (intended to cost twice; check the draft is delivered once and the second envelope's outcome is sane); a hire whose target house is halted or short of liquidity; Φ decay while a sync is pending; envelopes still held when the week ends; determinism (same seed → identical Notes) native and in wasm; the 25 % coordination tax applied once per crossing.

Run everything and report counts: `cd engine && cargo test && cargo clippy`, `cd frontend && npm install && npm run copy-assets && npm test && npm run test:gpu && npm run build` (the SwiftShader tests need Chromium; Playwright's config sets `--use-angle=swiftshader`).

## Part 2: the playtest

**Automated, through the engine's own API** (`authorize`, `reject`, `sync`): add `engine/tests/playtest.rs` (or an example under `engine/examples/`, whichever is cheaper to run). Four houses, Ada, Ben, Cal, Dee, on `scenarios::elm_street` with `oracle_policy: Person`, `price_walk: PriceWalk::elm_street(seed)`, `week_ticks: 40`. Four person strategies: SEND (always send, never hire); BLIND (always hire at the believed price, never ask); MORNING (ask the oracle at the first knock of each day, then hire); CAUTIOUS (ask only when Φ < 0.9, hire when the price is known, otherwise send). Run 20 seeds. Table per strategy: pieces done, compute burned, purse left, liquidity left, settled, reverted, oracle queries, weeks halted before Friday.

Answer from the numbers: does hiring pay against sending, in pieces and in purse; is the oracle worth 15 cr at the current cadence; how many times the price moves per week; how many ticks of slack a house has (drafts per tick against 40); does anyone run out before Friday; is a wrong guess cheap enough to spam.

**In the browser, with Playwright on SwiftShader:** `serve` with the game flags at `--interval-ms 300`, the TV at `?source=sse&view=tv`, four phone pages at `?source=sse&house=<name>`; drive each phone through its answers with real clicks (not the `window.__app` hook) until Friday; assert the Notes appear on the TV and on each phone; save one still of each view to `frontend/tests/gpu/out/`.

**Knobs** (doc 06 §4): the hire's compute weight, the price steps and cadence, the week's length, the top-up pocket. Propose values with the evidence in the report. Do not change the defaults.

## Deliverable

`engine/docs/CODEX-REVIEW-2026-09-30.md`, under 2,000 words: findings (severity, `file:line`, a one-line fix or a question for the Director), the test counts, the playtest tables and the answers, the knob proposal. Clear bugs fixed on your branch in small commits with tests. Push the branch, then stop. Do not touch `frontend/takes/`, `presentation/`, or the design documents.
