# Codex review and playtest · 30 September 2026

Laboratory review of `3ab9ce4`, following `CODEX-REVIEW-AND-PLAYTEST.md`, on `codex/round-1-review`. One agent; no default tuning changes, design-document edits, takes, presentation edits, PR or deployment. Paths below are repository-relative; citations describe the repaired branch.

**Assessment:** the simulation and visual prototype are substantial, coherent work. The economics do not yet make hiring a compelling alternative to sending. Establish the retry rule and validate the social game at a kitchen table before building another scale or adding polish.

## Findings

| Severity | Finding and evidence | Fix or Director decision |
|---|---|---|
| P1, fixed | An oracle answer updated the table but left a waiting hire priced at the old value (`engine/src/tick.rs:1333`). Asking could knowingly submit the wrong price. | Reprice and re-sign only the unsigned offers still at that house's Door; preserve the envelope and paid tax. Approved, in-flight hires retain their approved price. Regression settles a refreshed 14-cr offer. |
| P1, fixed | A yes to both send and hire delivered the same task twice (`engine/src/tick.rs:1397`). | Keep both payments and the settled swap, but suppress the second delivery. Regression checks one delivery, 12 cr in fees, and 10 liquidity transferred. |
| P1, open | Refusing the send marks its task `Rejected` (`engine/src/tick.rs:1111`); `current_task` never selects rejected tasks (`engine/src/node.rs:319`). Thus a reverted hire or “leave” permanently loses a piece without an explicit host `redraft` call. | Decide whether retry reuses the finished draft or buys a new one, and when it returns. The rules promise staff “come back later”; the phone exposes no redraft. Implement only after that decision. |
| P2, fixed | Friday's held/in-flight envelopes were processed after the Note, and a later top-up changed the purse without changing its Note (`engine/src/tick.rs:474`). Zero-task houses received no Note (`engine/src/tick.rs:876`). | Freeze ticks and person decisions/top-ups after Friday; retain unresolved papers at their Friday state. Include every house and replace earlier exhaustion Notes. |
| P2, fixed | A hire rejected for insufficient compute at commit was missing from the reverted tally (`engine/src/tick.rs:1217`). | Count that outcome once; test an alive initiator with an unaffordable hire. |
| P2, fixed | `?house=n` sorted names alphabetically, violating `--names` order (`frontend/src/ui/phone.ts:23`). Node IDs are random, so sorting IDs is also wrong. | Export `NodeView.house_number` from ordered parent children (`engine/src/tick.rs:1754`); resolve numbered phones with it. Native and DOM tests cover Zoe,Ada,Ben. |
| P2, fixed | A newly connected SSE phone stayed blank while the server was paused (`frontend/src/engine/source/SseSource.ts:64`). | Fetch and emit current state at hello, including reconnects. Unit test and paused-start browser test. |
| P2, fixed | Asking with fewer than 15 cr, or a refused sync command, left an indefinite asking state (`frontend/src/ui/phone.ts:161`). | Disable unaffordable asks and clear pending state when a command returns false; DOM regression. |
| P2, open | The rules' 200-cr top-up pocket is not enforced; no phone top-up/close controls exist (`engine/src/tick.rs:356`, `frontend/src/ui/phone.ts:145`). | Decide whether the pocket is a table convention or an engine limit; add the person controls if round 1 must cover the entire rules card. |
| P2, open | A successful hire also burns its 2-cr base weight (`engine/src/agents/statistical.rs:341`, `engine/src/tick.rs:1248`); the card's cost table describes only its 0.5-cr tax. Every draft formats both options, sinking 3 cr even when only one is chosen. | Confirm the intended successful-hire fee and explain both formatting charges. Defaults preserved. |
| P2, open | The paired approve/reject commands are separate asynchronous POSTs (`frontend/src/ui/phone.ts:153`); a tick or failed request can split the decision. | Make the composed answer atomic and acknowledge failure before the next human table test. The observed browser run succeeded, but does not prove atomicity. |
| P3, fixed | Node 20 is insufficient: scripts run TypeScript directly and the package requires Node ≥22.18. Playwright hardcoded a Linux-only executable. | Installed Node 22 locally under ignored `engine/target/review-runtime`; use bundled Chromium when the cloud path is absent. Ignore only the known screenshot ReadPixels performance warning; retain shader/error checks. |
| Governance | GitHub reports this repository public, while `LABORATORY.md` forbids writes to a public surface. | This turn's explicit instruction authorizes the review-branch push only. Clarify the standing publication rule; no claim of shipment/adoption. |

## Rules checked

**Door and kerb.** `engine/src/tick.rs:1030` queues a Door-approved hire with `door_cleared`; it reaches Stage 2 next tick. `engine/src/boundary.rs:198` binds the claimed price, hash and locked amount to truth. A mismatch transfers nothing, keeps only the paid tax sunk, and increments the house's revert tally (`engine/src/tick.rs:1095`); a human no does not. The rejected-draft retry divergence above remains. Halted targets reject; insufficient buyer liquidity fails the lock; a seller with zero liquidity can sell (`engine/src/boundary.rs:170`, `:335`), covered by a three-case regression.

**Oracle and waiting.** `engine/src/tick.rs:342` requests a next-Draft StateSync, including while waiting. Commit charges exactly 15 cr, writes `price/courier`, records the answer and calibrates Φ (`:1327`); idle decay skips a same-tick calibration (`:1554`). Scout's oracle proposal is gated by staff policy (`engine/src/agents/statistical.rs:45`). Waiting burns zero compute but decays Φ; ordinary staff handovers also reduce Φ. The cost is charged on the answer tick, not at the click.

**Price.** `PriceWalk::elm_street` and `step` (`engine/src/tick.rs:92`, `:101`) use seed/tick deterministically, choose a different member of 8/10/12/14 with probability 1/8 per tick, and emit no event (`:492`). This is a random cadence, not a guaranteed daily move.

**Friday and conservation.** `engine/src/tick.rs:876` emits a WeekNote per house with task counts, truth liquidity, purse, burns and tallies. Tests reconcile purse = 800 − burns + top-ups every tick, conserve 800 liquidity across four houses, and reconcile settled + reverted with hires actually reaching the kerb. Friday approvals still awaiting the kerb are unresolved, not reverts. Early exhaustion Notes are replaced. No score/rank/reputation/leaderboard fields or UI are introduced.

**Server.** Flags are parsed at `engine/src/bin/serve.rs:138`; sync routing returns 404 for unknown nodes; all responses/preflight carry CORS (`:274`). Separate socket handlers and broadcast delivery (`:247`, `:383`) isolate dropped SSE clients. Smoke tests and a real mid-week disconnect pass. The UI calendar still hardcodes eight ticks/day and five days; a non-40 `--week` changes the engine cutoff, not calendar labels (`frontend/src/ui/week.ts:9`).

**Wasm, contracts and phone.** `engine/src/wasm_abi.rs:130`, `:161` expose the same game/sync behavior. Exact native inputs replay to identical complete Notes in wasm for 20 seeds, twice. Contract types match emitted keys, including the new house position. The phone groups send/hire by the same task, answers the complementary envelope, shows the last oracle answer and its Note (`frontend/src/ui/phone.ts:40`, `:64`, `:121`). DOM tests and real clicks cover all four answers. Tax is charged at mint (`engine/src/tick.rs:728`, `engine/src/tax.rs:49`), not again at the kerb; sync is an intra-house crossing with zero tax.

## Playtest

`engine/tests/playtest.rs`: seeds 0–19, four houses, 800 compute and 200 liquidity each, 15 tasks, Person oracle, seeded walk, 40 ticks, zero top-ups. Strategies rotate among Ada/Ben/Cal/Dee per seed. SEND sends; BLIND hires; MORNING asks at the first knock of each day and waits for the answer before hiring; CAUTIOUS asks below Φ 0.9, otherwise hires only if its offer matches its last oracle answer, else sends. “Known” means the person's last observation, never access to hidden truth. Means per house; early halts are counts, not means.

| Strategy | Pieces | Burned | Purse | Liquidity | Settled | Reverted | Oracle | Early/20 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| SEND | 15.00 | 784.05 | 15.95 | 270.80 | 0.00 | 0.00 | 0.00 | 0 |
| BLIND | 3.70 | 671.65 | 128.35 | 228.80 | 3.70 | 11.30 | 0.00 | 0 |
| MORNING | 8.95 | 732.53 | 67.47 | 147.40 | 8.95 | 6.05 | 5.00 | 0 |
| CAUTIOUS | 10.60 | 776.25 | 23.75 | 153.00 | 8.60 | 4.40 | 7.00 | 0 |

Controls run 20 seeds per strategy with all four houses following that strategy (80 house-weeks per row). This removes mixed-street income differences:

| Strategy | Pieces | Burned | Purse | Liquidity | Settled | Reverted | Oracle | Early/80 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| SEND | 15.00 | 784.05 | 15.95 | 200.00 | 0.00 | 0.00 | 0.00 | 0 |
| BLIND | 3.55 | 671.35 | 128.65 | 200.00 | 3.55 | 11.45 | 0.00 | 0 |
| MORNING | 8.95 | 732.53 | 67.47 | 200.00 | 8.95 | 6.05 | 5.00 | 0 |
| CAUTIOUS | 10.60 | 776.25 | 23.75 | 200.00 | 8.60 | 4.40 | 7.00 | 0 |

Hiring retains compute but finishes fewer pieces. Its apparently larger purse partly reflects fees not paid on failed deliveries. SEND finishes all 15 in every seed, despite the claim that hiring is needed to finish. Compact staff work near exhaustion helps it stay within 800.

The oracle improves MORNING by 5.25 pieces over BLIND in the mixed street, for 60.88 more compute. Five queries cost 75 cr. It is useful information, but not a demonstrated compute-saving purchase: a successful hire saves 8 cr against a send under actual fees, requiring at least two additional successful hires per query to recover 15 cr. Three hires per eight-tick day are not consistently available.

Prices moved 4.85 times/week on average, range 1–9. Staff draft at most once every two ticks with prompt answers. SEND's last decision is tick 29 and delivery tick 30: ten ticks of slack. MORNING's last decision is 34, with hire settlement by 36; CAUTIOUS's is 36, settlement by 38. Nobody exhausted their purse before Friday in these strategies. A wrong-price envelope loses only 0.5 additional compute, but also a 2.5-cr refused-send format and a previously funded draft that currently will not return. Spam is therefore misleadingly cheap at the envelope level, expensive in lost work, and not yet a meaningful repeat-guess mechanic.

## Verification and next experiment

`cargo test`: **96 passed**, zero failures/ignored; `cargo clippy` passes with the existing `high_court.rs:118` argument-count warning. `cargo fmt --check`, wasm build, asset copy, TypeScript check and production build pass. Vitest: **100 passed, 1 existing todo**, 22 files. SwiftShader: **11 passed, 9 recording tests intentionally skipped**; affected phone/SSE specs subsequently rerun, **3 passed**. Build retains the large-bundle warning.

The shared-server browser test uses 300-ms ticks, one TV and four 390×844 phones, real clicks only, a mid-week phone reconnect, and Friday assertions on all five views. Final stills: `frontend/tests/gpu/out/sse-tv-friday.png` and `sse-phone-{ada,ben,cal,dee}-friday.png`. Tracked copies of all five Friday views and the oracle Door still are in [review-assets/2026-09-30](review-assets/2026-09-30/) for cloud review. No human playtest has happened; screenshots and automation cannot validate lying, negotiation or the desire for another week.

**Knob proposal, after the retry decision:** keep hire weight **2.0** initially; keep prices **8/10/12/14**; compare cadence **every 12 ticks** against 8 so a 15-cr answer can support more hires; keep **40 ticks** as the baseline and test **48** only if retries consume the observed slack; use a finite **200-cr pocket**, recorded and enforced if implemented. Do not raise the guess tax until repeated guessing exists. Retest these variants without changing defaults, then run two kitchen-table sessions using doc 06's existing second-week/lying criteria. No additional world-building before that evidence.
