# Round 3 - the slow walk, 2026-09-30

Branch: `codex/round-3`, based on lab commit `3d18e2f` (including round 2, `6fdf469`). Authority: doc 06 §11. Implemented 1–4, ran 5, tested 6, prepared 7; no human session run. No defaults, design documents, demo takes, recorded traces, repository visibility or hosting configuration changed. No pull request or push to a `claude/*` branch.

## Finding and judgement

**The slow walk creates the predicted thirteen-piece floor at 40 ticks, but does not make cautious hiring a reliable route to fifteen.** SEND completes 13/15 in every seed with a three-tick walk and a 40-tick week, or all fifteen at tick 45 in a 48-tick week. With a two-tick walk it completes at tick 30 in both week lengths. None needs the pocket.

For §10.10's two named measures, define dominance as at least as many pieces AND at least as much purse left, with one strictly greater. On means, seven of the eight experimental cells separate the four strategies with no pair dominating, in mixed streets and controls. The exception is send 2 / F12 / 48: CAUTIOUS and SEND both finish fifteen, while CAUTIOUS retains 49.35 cr against SEND's 0.85 cr. CAUTIOUS dominates SEND on those two measures, though spends liquidity and finishes later. Liquidity and timing are reported; they are not silently added to the specified two-axis criterion.

**The literal criterion has passing cells; the stronger hiring hypothesis mostly fails.** Send 3 / F12 / 48 has no pair dominance in any of its twenty mixed-street seeds. Yet SEND completes fifteen and CAUTIOUS only thirteen, retaining 44.45 cr instead of 0.85. With F12, extending the walk from two to three ticks shifts CAUTIOUS from three reverted hires and eight queries to five reverts and nine queries; it is not a monotone improvement in that strategy. This is a measurable tradeoff, not proof that people value the retained compute, need one another, enjoy risk, or want another week. The harness does not test negotiation, rumours, lying, human reaction time, or continuing play. It cannot answer the Director's “would my kids choose this?” question.

Defaults remain send 1, budget 800, oracle 15, R8 and week 40. **No candidate is promoted.** The Director's comprehension sheet is prepared below. A formal economics-and-deception session requires the Director's judgement of this evidence; none was scheduled or run. Work stops after this report and branch push. The larger fork into unequal lists or hiring drafting capacity was not attempted.

## Hypotheses (§11.6)

| Hypothesis | Result |
|---|---|
| SEND at send 3 gives about thirteen safe pieces | Supported for 40 ticks: exactly 13 in all 20 mixed seeds and all 80 control houses, both cadences. Not universal: 48 ticks gives 15 in all observations. |
| CAUTIOUS finishes fifteen in most seeds, spending liquidity and ticks | Fails in every send-3 cell: completions are 2/20 (R8/40), 5/20 (R8/48), 0/20 (F12/40), 0/20 (F12/48). At send 2, only F12/48 supports it: 20/20, finishing at tick 45, mean mixed liquidity 129.70 cr. R8 gives 0/20 and 6/20; F12/40 gives 0/20. |
| BLIND finishes fewer than SEND | Supported on means in all eight cells (5.75–7.70 versus 13–15). Not every seed: R8 blind hiring sometimes completes all fifteen; it beats SEND's 13 in three of twenty mixed seeds at send 3 / R8 / 40. |
| Notes separate, with no dominance on pieces and purse | Seven cells pass on means; see seed qualification below. Send 2 / F12 / 48 fails this strict criterion because CAUTIOUS dominates SEND. |

Mean-level separation can hide seed-level dominance. “No pair” below counts mixed seeds where no strategy dominates another; it does not claim statistical significance. All homogeneous results use the same twenty price paths, not eighty independent samples.

| Send | Prices | Week | Mean pair dominance (mixed and controls) | Mixed seeds with no pair / 20 | BLIND fewer pieces than SEND / 20 |
|---:|---|---:|---|---:|---:|
| 2 | R8 | 40 | None | 9 | 18 |
| 2 | R8 | 48 | None | 7 | 17 |
| 2 | F12 | 40 | None | 16 | 20 |
| 2 | F12 | 48 | CAUTIOUS over SEND | 0 | 20 |
| 3 | R8 | 40 | None | 5 | 17 |
| 3 | R8 | 48 | None | 5 | 17 |
| 3 | F12 | 40 | None | 16 | 20 |
| 3 | F12 | 48 | None | 20 | 20 |

## Implementation and scope

The opt-in path is `Engine::slow_walk` (`engine/src/tick.rs:370`): game, retry enabled, send duration greater than one. **Send 1 keeps round-two scheduling**, including staff waiting at the Door. This preserves the explicit unchanged-default requirement and makes historical controls comparable. Thus send 2/3 test the authorized slow walk **together with concurrent drafting**, not duration alone. The demo remains on its existing path even if a native caller supplies a different duration.

An atomic Send records the answer's visible tick; its fee settles at the next commit. The scheduled delivery commits at `t + send_ticks - 1`, and the next knock is allowed at `t + send_ticks` (`tick.rs:1903`, `2064`). For example, answer at tick 1 with send 3: charge at 2, deliver at 3, next knock at 4. Hire keeps its existing extra kerb tick.

Finished assets queue while staff draft at the Door, at the kerb and during absence. Only the oldest eligible asset knocks (`tick.rs:557`, `950`, `1291`). Defer releases after the next piece actually knocks; saved formatting and draft identity survive retries. Reservations protect accepted send/query fees from concurrent staff spending (`node.rs:658`, `tick.rs:987`); a staff runway halt cannot cancel a paid delivery. Closing explicitly freezes the house; Friday includes deliveries due on its commit and freezes later ones.

No unit cost or fee formula changed. Total burn nevertheless changes: staff draft earlier against a different available purse, so their existing economising policy makes different purchases. SEND now burns 799.15 cr for all fifteen, versus 784.05 in send-1 controls; at send 3 / 40 it burns 779.15, including already finished assets still awaiting delivery. This is a scheduling consequence, not an added walking fee. All experimental cells have zero top-ups and zero observed runway halts; the pocket therefore still does not bite at budget 800.

`serve --send-ticks N`, engine config and browser `?send-ticks=N` default to 1. The WASM setter accepts a positive duration only before the game starts (`wasm_abi.rs:210`). Phone state carries return tick and queue length; it hides the card during absence, states return time, retains Φ on the purse, and replaces the old “Nothing burns” promise in this opt-in path. TV unchanged. One inherited display limitation remains: “Held” uses envelope age, so a queued card can show elapsed ticks before its first knock; record confusion about that in usability.

## Matrix method and reproduction

Send 2/3 × 40/48 ticks × R8/F12, budget **800** and oracle **10**, seeds 0–19. Each seed runs one rotating mixed street plus four homogeneous controls: **800 experimental street-weeks / 3,200 house-weeks**. Also reran the four matching send-1 controls: **400 street-weeks / 1,600 house-weeks**, for **1,200 / 4,800** total. All 32 send-1 aggregate rows match round 2 within 1e-9 for numeric JSON parsing; strings/counts agree. No baseline fixtures were regenerated.

The round-two harness and four decision policies are retained: SEND always sends; BLIND always hires; MORNING asks at the first knock of each calendar day then hires; CAUTIOUS asks below Φ 0.9, hires when its quote agrees with its latest oracle answer, otherwise sends. All answer through the atomic public API, with the existing emergency 50 cr withdrawal policy and 200 cr cap. They act at every available tick, unlike people in the prepared ten-second session.

R8 is the original probability-1/8 random walk, averaging 4.85 actual changes in 40 ticks and 5.70 in 48. F12 changes regularly every twelve ticks (three/four changes); the seeded price steps stay 8/10/12/14. Every tick checks purse reconciliation, liquidity conservation, asset/task accounting and pocket cap; Friday reconciles deliveries and kerb outcomes.

```sh
cd engine
cargo run --release --example round3_matrix -- target/round3-matrix
ROUND3_PLAYTEST_OUT=../frontend/tests/fixtures/elm-round3-native.json cargo test --test round3_playtest
```

Exact aggregates: [CSV](review-assets/round-3-2026-09-30/matrix.csv), [JSON](review-assets/round-3-2026-09-30/matrix.json). All individual runs, actions and Notes: [compressed JSON](review-assets/round-3-2026-09-30/runs.json.gz). Native/browser fixture contains all 160 mixed experimental runs.

## Verification and Director sheet

- Rust: **117 tests passed** with default features; eight focused slow-walk tests cover timing, concurrent queue, defer, retry costs, accepted-command reservation, close and Friday boundaries. Native matrix variants repeat identically; HTTP smoke verifies `--send-ticks 3`, atomic send, queue and return timing.
- Frontend: **106 passed, 1 existing todo**, 24 files (final run with `--no-file-parallelism`); typecheck and production build pass. All 160 experimental native Notes replay twice identically in WASM; existing round-two parity passes. Demo guard compares **200 exact state/event hashes**, unchanged.
- Browser: all **13 active SwiftShader checks passed across the full run and targeted reruns**; nine recording specs remain opt-in/skipped. Initial full run had a LAN-test timeout and a new assertion using the wrong calendar spelling. Corrected the assertion; the unchanged LAN test and all game checks passed together on rerun. The final slow-walk UI check passed again after a copy correction. No takes were overwritten.
- Existing warnings remain: Clippy's eight-argument `high_court::populate`, and Vite's large bundle warning. No new Clippy warning. A parallel frontend run overlapped the native suite and exceeded the existing 50 ms layout benchmark (145 ms); the final serial frontend run passed that unchanged benchmark.
- [Director sheet, Markdown](CODEX-ROUND-3-USABILITY-2026-09-30.md) and [printable one-page PDF](review-assets/round-3-2026-09-30/director-usability-sheet.pdf): 2–4 people, one shared SSE week, ten seconds per tick. PDF rendered and visually checked. **Prepared only; no people recruited or session run.**
- Phone stills, inspected: [Porter out](review-assets/round-3-2026-09-30/round3-phone-out.png), [Porter back](review-assets/round-3-2026-09-30/round3-phone-back.png).

## Full matrix tables

Same columns as round 2. Numeric values are house means; final three columns are counts. M = mixed (n=20 per strategy); C = homogeneous (n=80, twenty shared seeds). Done is out of fifteen. Burn/purse/liquidity/pocket are credits; S/R = settled/reverted swaps; Q = queries; All = completed; Free = completed without pocket; Halt = runway halt before Friday. Liquidity is the final balance, including receipts from neighbours, not gross hire spend.

### Send 1 (round-two control) · 800 cr · R8 · oracle 10 cr · 40 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 784.05 | 15.95 | 283.70 | 0.00 | 0.00 | 0.00 | 0.00 | 20 | 20 | 0 |
| M | BLIND | 4.85 | 308.44 | 491.56 | 219.40 | 4.85 | 14.15 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 10.30 | 566.13 | 233.87 | 139.30 | 10.30 | 6.60 | 5.00 | 0.00 | 3 | 3 | 0 |
| M | CAUTIOUS | 11.25 | 644.76 | 155.24 | 157.60 | 9.25 | 4.75 | 7.00 | 0.00 | 0 | 0 | 0 |
| C | SEND | 15.00 | 784.05 | 15.95 | 200.00 | 0.00 | 0.00 | 0.00 | 0.00 | 80 | 80 | 0 |
| C | BLIND | 4.86 | 306.42 | 493.58 | 200.00 | 4.86 | 14.14 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 10.30 | 566.14 | 233.87 | 200.00 | 10.30 | 6.60 | 5.00 | 0.00 | 12 | 12 | 0 |
| C | CAUTIOUS | 11.25 | 644.76 | 155.24 | 200.00 | 9.25 | 4.75 | 7.00 | 0.00 | 0 | 0 | 0 |

### Send 1 (round-two control) · 800 cr · R8 · oracle 10 cr · 48 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 784.05 | 15.95 | 306.50 | 0.00 | 0.00 | 0.00 | 0.00 | 20 | 20 | 0 |
| M | BLIND | 5.70 | 353.43 | 446.57 | 216.40 | 5.70 | 17.30 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 11.30 | 600.18 | 199.82 | 132.00 | 11.30 | 9.00 | 4.90 | 0.00 | 5 | 5 | 0 |
| M | CAUTIOUS | 13.05 | 705.96 | 94.04 | 145.10 | 11.05 | 5.45 | 8.70 | 0.00 | 6 | 6 | 0 |
| C | SEND | 15.00 | 784.05 | 15.95 | 200.00 | 0.00 | 0.00 | 0.00 | 0.00 | 80 | 80 | 0 |
| C | BLIND | 5.58 | 349.01 | 450.99 | 200.00 | 5.58 | 17.43 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 11.30 | 600.18 | 199.82 | 200.00 | 11.30 | 9.00 | 4.90 | 0.00 | 20 | 20 | 0 |
| C | CAUTIOUS | 13.05 | 705.96 | 94.04 | 200.00 | 11.05 | 5.45 | 8.70 | 0.00 | 24 | 24 | 0 |

### Send 1 (round-two control) · 800 cr · F12 · oracle 10 cr · 40 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 784.05 | 15.95 | 289.70 | 0.00 | 0.00 | 0.00 | 0.00 | 20 | 20 | 0 |
| M | BLIND | 6.30 | 372.65 | 427.35 | 207.00 | 6.30 | 12.70 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 9.00 | 554.55 | 245.45 | 170.50 | 9.00 | 8.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| M | CAUTIOUS | 13.00 | 699.00 | 101.00 | 132.80 | 11.00 | 3.00 | 7.00 | 0.00 | 0 | 0 | 0 |
| C | SEND | 15.00 | 784.05 | 15.95 | 200.00 | 0.00 | 0.00 | 0.00 | 0.00 | 80 | 80 | 0 |
| C | BLIND | 6.39 | 376.59 | 423.41 | 200.00 | 6.39 | 12.61 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 9.00 | 554.55 | 245.45 | 200.00 | 9.00 | 8.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| C | CAUTIOUS | 13.00 | 699.00 | 101.00 | 200.00 | 11.00 | 3.00 | 7.00 | 0.00 | 0 | 0 | 0 |

### Send 1 (round-two control) · 800 cr · F12 · oracle 10 cr · 48 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 784.05 | 15.95 | 312.20 | 0.00 | 0.00 | 0.00 | 0.00 | 20 | 20 | 0 |
| M | BLIND | 6.85 | 401.68 | 398.32 | 212.80 | 6.85 | 16.15 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 12.00 | 672.70 | 127.30 | 149.30 | 12.00 | 9.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| M | CAUTIOUS | 15.00 | 739.45 | 60.55 | 125.70 | 13.00 | 3.00 | 8.00 | 0.00 | 20 | 20 | 0 |
| C | SEND | 15.00 | 784.05 | 15.95 | 200.00 | 0.00 | 0.00 | 0.00 | 0.00 | 80 | 80 | 0 |
| C | BLIND | 6.91 | 405.62 | 394.38 | 200.00 | 6.91 | 16.09 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 12.00 | 672.70 | 127.30 | 200.00 | 12.00 | 9.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| C | CAUTIOUS | 15.00 | 739.45 | 60.55 | 200.00 | 13.00 | 3.00 | 8.00 | 0.00 | 80 | 80 | 0 |

### Send 2 · 800 cr · R8 · oracle 10 cr · 40 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 799.15 | 0.85 | 288.30 | 0.00 | 0.00 | 0.00 | 0.00 | 20 | 20 | 0 |
| M | BLIND | 5.75 | 670.38 | 129.63 | 215.20 | 5.75 | 12.85 | 0.00 | 0.00 | 2 | 2 | 0 |
| M | MORNING | 10.30 | 710.09 | 89.91 | 141.10 | 10.30 | 6.60 | 5.00 | 0.00 | 3 | 3 | 0 |
| M | CAUTIOUS | 11.25 | 741.35 | 58.65 | 155.40 | 9.25 | 4.75 | 7.00 | 0.00 | 0 | 0 | 0 |
| C | SEND | 15.00 | 799.15 | 0.85 | 200.00 | 0.00 | 0.00 | 0.00 | 0.00 | 80 | 80 | 0 |
| C | BLIND | 5.75 | 670.38 | 129.63 | 200.00 | 5.75 | 12.85 | 0.00 | 0.00 | 8 | 8 | 0 |
| C | MORNING | 10.30 | 710.10 | 89.91 | 200.00 | 10.30 | 6.60 | 5.00 | 0.00 | 12 | 12 | 0 |
| C | CAUTIOUS | 11.25 | 741.35 | 58.65 | 200.00 | 9.25 | 4.75 | 7.00 | 0.00 | 0 | 0 | 0 |

### Send 2 · 800 cr · R8 · oracle 10 cr · 48 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 799.15 | 0.85 | 297.70 | 0.00 | 0.00 | 0.00 | 0.00 | 20 | 20 | 0 |
| M | BLIND | 6.65 | 671.55 | 128.45 | 213.90 | 6.65 | 15.40 | 0.00 | 0.00 | 3 | 3 | 0 |
| M | MORNING | 11.30 | 710.32 | 89.68 | 144.50 | 11.30 | 9.00 | 4.90 | 0.00 | 5 | 5 | 0 |
| M | CAUTIOUS | 13.05 | 758.82 | 41.18 | 143.90 | 11.05 | 5.45 | 8.70 | 0.00 | 6 | 6 | 0 |
| C | SEND | 15.00 | 799.15 | 0.85 | 200.00 | 0.00 | 0.00 | 0.00 | 0.00 | 80 | 80 | 0 |
| C | BLIND | 6.65 | 671.55 | 128.45 | 200.00 | 6.65 | 15.40 | 0.00 | 0.00 | 12 | 12 | 0 |
| C | MORNING | 11.30 | 710.32 | 89.68 | 200.00 | 11.30 | 9.00 | 4.90 | 0.00 | 20 | 20 | 0 |
| C | CAUTIOUS | 13.05 | 758.83 | 41.18 | 200.00 | 11.05 | 5.45 | 8.70 | 0.00 | 24 | 24 | 0 |

### Send 2 · 800 cr · F12 · oracle 10 cr · 40 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 799.15 | 0.85 | 294.20 | 0.00 | 0.00 | 0.00 | 0.00 | 20 | 20 | 0 |
| M | BLIND | 6.70 | 670.02 | 129.98 | 202.50 | 6.70 | 12.30 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 9.00 | 717.75 | 82.25 | 166.70 | 9.00 | 8.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| M | CAUTIOUS | 13.00 | 740.65 | 59.35 | 136.60 | 11.00 | 3.00 | 7.00 | 0.00 | 0 | 0 | 0 |
| C | SEND | 15.00 | 799.15 | 0.85 | 200.00 | 0.00 | 0.00 | 0.00 | 0.00 | 80 | 80 | 0 |
| C | BLIND | 6.70 | 670.02 | 129.98 | 200.00 | 6.70 | 12.30 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 9.00 | 717.75 | 82.25 | 200.00 | 9.00 | 8.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| C | CAUTIOUS | 13.00 | 740.65 | 59.35 | 200.00 | 11.00 | 3.00 | 7.00 | 0.00 | 0 | 0 | 0 |

### Send 2 · 800 cr · F12 · oracle 10 cr · 48 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 799.15 | 0.85 | 311.50 | 0.00 | 0.00 | 0.00 | 0.00 | 20 | 20 | 0 |
| M | BLIND | 7.70 | 671.52 | 128.48 | 210.80 | 7.70 | 15.30 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 12.00 | 718.25 | 81.75 | 148.00 | 12.00 | 9.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| M | CAUTIOUS | 15.00 | 750.65 | 49.35 | 129.70 | 13.00 | 3.00 | 8.00 | 0.00 | 20 | 20 | 0 |
| C | SEND | 15.00 | 799.15 | 0.85 | 200.00 | 0.00 | 0.00 | 0.00 | 0.00 | 80 | 80 | 0 |
| C | BLIND | 7.70 | 671.52 | 128.48 | 200.00 | 7.70 | 15.30 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 12.00 | 718.25 | 81.75 | 200.00 | 12.00 | 9.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| C | CAUTIOUS | 15.00 | 750.65 | 49.35 | 200.00 | 13.00 | 3.00 | 8.00 | 0.00 | 80 | 80 | 0 |

### Send 3 · 800 cr · R8 · oracle 10 cr · 40 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 13.00 | 779.15 | 20.85 | 290.60 | 0.00 | 0.00 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | BLIND | 5.75 | 670.38 | 129.63 | 221.20 | 5.75 | 12.85 | 0.00 | 0.00 | 2 | 2 | 0 |
| M | MORNING | 10.30 | 710.09 | 89.91 | 137.60 | 10.30 | 6.60 | 5.00 | 0.00 | 3 | 3 | 0 |
| M | CAUTIOUS | 10.85 | 743.97 | 56.03 | 150.60 | 9.85 | 4.15 | 7.90 | 0.00 | 2 | 2 | 0 |
| C | SEND | 13.00 | 779.15 | 20.85 | 200.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | BLIND | 5.75 | 670.38 | 129.63 | 200.00 | 5.75 | 12.85 | 0.00 | 0.00 | 8 | 8 | 0 |
| C | MORNING | 10.30 | 710.10 | 89.91 | 200.00 | 10.30 | 6.60 | 5.00 | 0.00 | 12 | 12 | 0 |
| C | CAUTIOUS | 10.85 | 743.98 | 56.03 | 200.00 | 9.85 | 4.15 | 7.90 | 0.00 | 8 | 8 | 0 |

### Send 3 · 800 cr · R8 · oracle 10 cr · 48 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 799.15 | 0.85 | 304.60 | 0.00 | 0.00 | 0.00 | 0.00 | 20 | 20 | 0 |
| M | BLIND | 6.65 | 671.55 | 128.45 | 218.40 | 6.65 | 15.40 | 0.00 | 0.00 | 3 | 3 | 0 |
| M | MORNING | 11.30 | 710.32 | 89.68 | 140.50 | 11.30 | 9.00 | 4.90 | 0.00 | 5 | 5 | 0 |
| M | CAUTIOUS | 12.65 | 752.42 | 47.58 | 136.50 | 11.65 | 4.90 | 8.70 | 0.00 | 5 | 5 | 0 |
| C | SEND | 15.00 | 799.15 | 0.85 | 200.00 | 0.00 | 0.00 | 0.00 | 0.00 | 80 | 80 | 0 |
| C | BLIND | 6.65 | 671.55 | 128.45 | 200.00 | 6.65 | 15.40 | 0.00 | 0.00 | 12 | 12 | 0 |
| C | MORNING | 11.30 | 710.32 | 89.68 | 200.00 | 11.30 | 9.00 | 4.90 | 0.00 | 20 | 20 | 0 |
| C | CAUTIOUS | 12.65 | 752.43 | 47.58 | 200.00 | 11.65 | 4.90 | 8.70 | 0.00 | 20 | 20 | 0 |

### Send 3 · 800 cr · F12 · oracle 10 cr · 40 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 13.00 | 779.15 | 20.85 | 283.10 | 0.00 | 0.00 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | BLIND | 6.70 | 670.02 | 129.98 | 194.10 | 6.70 | 12.30 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 9.00 | 717.75 | 82.25 | 166.00 | 9.00 | 8.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| M | CAUTIOUS | 10.00 | 745.05 | 54.95 | 156.80 | 9.00 | 5.00 | 8.00 | 0.00 | 0 | 0 | 0 |
| C | SEND | 13.00 | 779.15 | 20.85 | 200.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | BLIND | 6.70 | 670.02 | 129.98 | 200.00 | 6.70 | 12.30 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 9.00 | 717.75 | 82.25 | 200.00 | 9.00 | 8.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| C | CAUTIOUS | 10.00 | 745.05 | 54.95 | 200.00 | 9.00 | 5.00 | 8.00 | 0.00 | 0 | 0 | 0 |

### Send 3 · 800 cr · F12 · oracle 10 cr · 48 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 799.15 | 0.85 | 306.00 | 0.00 | 0.00 | 0.00 | 0.00 | 20 | 20 | 0 |
| M | BLIND | 7.70 | 671.52 | 128.48 | 208.10 | 7.70 | 15.30 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 12.00 | 718.25 | 81.75 | 146.80 | 12.00 | 9.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| M | CAUTIOUS | 13.00 | 755.55 | 44.45 | 139.10 | 12.00 | 5.00 | 9.00 | 0.00 | 0 | 0 | 0 |
| C | SEND | 15.00 | 799.15 | 0.85 | 200.00 | 0.00 | 0.00 | 0.00 | 0.00 | 80 | 80 | 0 |
| C | BLIND | 7.70 | 671.52 | 128.48 | 200.00 | 7.70 | 15.30 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 12.00 | 718.25 | 81.75 | 200.00 | 12.00 | 9.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| C | CAUTIOUS | 13.00 | 755.55 | 44.45 | 200.00 | 12.00 | 5.00 | 9.00 | 0.00 | 0 | 0 | 0 |
