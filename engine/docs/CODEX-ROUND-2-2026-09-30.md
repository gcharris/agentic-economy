# Round 2 — A Week on Elm Street, 2026-09-30

Branch: `codex/round-2`, based on lab commit `ac6acdd`. Authority: doc 06 §10. Implemented points 1–7, measured point 9, and judged the result against point 10. Budget **800**, oracle **15**, random walk **1/8**, and week **40** remain defaults. Retry is enabled only for the explicit game. No design document, demo take, recorded trace, repository visibility, or hosting configuration changed.

## Findings and judgement

**The engineering rules pass; the balance criterion is not yet demonstrated.** The Notes separate the strategies, but SEND finishes all fifteen pieces in every variant and every seed, in mixed streets and controls. It costs more compute and can need the pocket; those are real tradeoffs, not evidence that players will value them enough to choose trading. No automatic score or currency conversion was introduced.

At current defaults, mixed-street means are SEND **15**, BLIND **4.85**, MORNING **10.30**, CAUTIOUS **11.25** pieces. Retry repairs permanent loss, but cannot repair a stale belief: BLIND repeatedly brings the same asset back until the price happens to agree. Its **14.15** reverted attempts cost ticks and **7.075 cr** in attempt formatting, rather than buying the staff draft again. Friday can still arrive with unfinished assets.

The **720 cr candidate does bite**, though staff economise: SEND burns **757.80 cr**, needs exactly **50 cr** from the pocket, and finishes at tick **31**, versus **784.05 cr**, no pocket, and tick **30** at 800. In the 40-tick week the send-only top-up is requested at tick 29, Thursday. Lowering the allocation alone therefore does not make trading necessary to finish.

**Oracle-and-hire without a top-up is conditional.** At current defaults MORNING completes in **3/20** mixed observations without the pocket. With regular twelve-tick prices and a 48-tick week, CAUTIOUS completes in **20/20** at 800, with either oracle price; at 720 it completes in **16/20** with the 10 cr oracle, and **0/20** with the 15 cr oracle. The latter spends 50 cr from the pocket on average. These are measurements, not chosen defaults.

MORNING supports **1.66–2.40 settled hires per query** across the matrix, below the suggested three. Twelve-tick prices improve cautious completion when there is time, but do not uniformly improve morning querying: calendar boundaries, query ticks, and the following kerb tick can straddle a price change. Cheap wrong guesses are easy to repeat, but leave BLIND late and with unused compute.

**Proposal only:** keep the baseline as a comparison and take the 720/regular-12/10/48 candidate to a kitchen-table week. Ask whether avoiding the pocket and retaining compute compensate for slower completion and liquidity spent. Do not declare balanced play, change defaults, or claim adoption before that evidence.

## Implementation evidence

| §10 | Enforcement and checks |
|---|---|
| 1–3 | `engine/src/node.rs` stores finished assets and paid offers; `tick.rs:990` captures each finished draft, `tick.rs:529` reoffers it. Wrong hires consume an attempt and buy only its replacement; send formatting persists. Leave waits for the next new draft's knock, or the next tick at the end of the list. `tests/round2.rs` covers identity, burn, mint count, ordering, exhaustion/resume, and the legacy retry switch. |
| 4 | `tick.rs:1663` uses zero settlement compute fee for game hires. The 0.5 cr attempt tax and liquidity payment remain. Demo fees are unchanged. |
| 5 | `tick.rs:691` caps pocket withdrawals at 200 cr; `tick.rs:720` closes the house and writes its Note. Closing also stops an approved hire before payment/delivery. Phone controls show remaining pocket and refuse further withdrawals after close/Friday. |
| 6 | `tick.rs:361` validates the house, whole card, affordability, pending answer and offer before mutation. `/answer/<house>/<offer>/<send|hire|ask|leave>` and `engine_answer` expose it; `frontend/src/ui/phone.ts` sends one command and shows refusal/transport failure. HTTP tests cover wrong-house, duplicate answers, pocket exhaustion and close; browser tests exercise the controls. |
| 7 | `frontend/src/ui/week.ts` divides the configured week over five days. Forty-eight ticks become 10/10/9/10/9. The phone's current day and oracle timestamp use that calendar; partial Notes no longer say Friday. |

## Matrix method

Full factorial: 2 budgets × 2 price schedules × 2 oracle prices × 2 week lengths × 20 seeds (0–19) × five street compositions = **1,600 street-weeks / 6,400 house-weeks**. Four houses each have fifteen pieces and 200 liquidity; liquidity totals 800 throughout. Mixed streets rotate strategy-to-house assignment by seed. Each homogeneous control has four houses using the same strategy; its 80 observations share twenty seeds and are not eighty independent price paths.

SEND always sends; BLIND always hires; MORNING asks at the first knock of each derived calendar day then hires; CAUTIOUS asks below Φ 0.9, hires when its offer agrees with its latest oracle answer, otherwise sends. Every answer uses the public atomic API. All strategies share an emergency policy: withdraw 50 cr when halted for runway or unable to afford their intended send/query, at most four times. No direct truth or purse edits occur in the harness. Complete-without-pocket tests the no-top-up hypothesis separately.

`R8` means the **original stochastic walk**, probability 1/8 per tick: mean **4.85** changes in 40 ticks and **5.70** in 48. `F12` means **regular changes every twelve ticks**, using the same seeded price choices 8/10/12/14: three changes in 40, four in 48. This is a cadence comparison, not another stochastic 1/12 walk. A Friday change remains part of the last tick's frozen snapshot.

Every tick checks purse reconciliation, liquidity conservation, pocket cap and finished-asset/task accounting. Friday checks pieces against tasks and settled + reverted against hires reaching the kerb. Twenty baseline seeds and all sixteen variants (seed 7) also replay twice to identical native/browser Notes.

## Full matrix tables

All numeric measures are means per house except the final counts. `M` = mixed (n=20 per strategy); `C` = homogeneous control (n=80). Done is out of 15. Burn/purse/liquidity/pocket are credits. S/R = settled/reverted swaps; Q = queries. All = completed; Free = completed without pocket; Halt = runway halt observed before Friday, including houses subsequently resumed. A refused unaffordable send/query followed by a top-up is not a halt. Exact aggregates: [CSV](review-assets/round-2-2026-09-30/matrix.csv), [JSON](review-assets/round-2-2026-09-30/matrix.json).

### 720 cr · R8 · oracle 10 cr · 40 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 757.75 | 12.25 | 275.60 | 0.00 | 0.00 | 0.00 | 50.00 | 20 | 0 | 20 |
| M | BLIND | 5.10 | 322.33 | 397.68 | 215.80 | 4.65 | 13.90 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 10.20 | 552.86 | 167.15 | 146.40 | 9.95 | 6.80 | 5.00 | 0.00 | 3 | 3 | 0 |
| M | CAUTIOUS | 10.85 | 632.25 | 87.75 | 162.20 | 8.85 | 4.60 | 7.00 | 0.00 | 0 | 0 | 0 |
| C | SEND | 15.00 | 757.75 | 12.25 | 200.00 | 0.00 | 0.00 | 0.00 | 50.00 | 80 | 0 | 80 |
| C | BLIND | 4.86 | 303.22 | 416.78 | 200.00 | 4.86 | 14.14 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 10.30 | 554.06 | 165.95 | 200.00 | 10.30 | 6.60 | 5.00 | 0.00 | 12 | 12 | 0 |
| C | CAUTIOUS | 11.25 | 626.25 | 93.75 | 200.00 | 9.25 | 4.75 | 7.00 | 0.00 | 0 | 0 | 0 |

### 720 cr · R8 · oracle 10 cr · 48 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 757.75 | 12.25 | 290.30 | 0.00 | 0.00 | 0.00 | 50.00 | 20 | 0 | 20 |
| M | BLIND | 5.90 | 366.67 | 353.33 | 218.80 | 5.40 | 17.10 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 11.05 | 593.68 | 126.32 | 139.40 | 11.00 | 8.75 | 4.85 | 0.00 | 1 | 1 | 0 |
| M | CAUTIOUS | 12.75 | 685.76 | 39.24 | 151.50 | 10.70 | 5.15 | 8.55 | 5.00 | 3 | 2 | 1 |
| C | SEND | 15.00 | 757.75 | 12.25 | 200.00 | 0.00 | 0.00 | 0.00 | 50.00 | 80 | 0 | 80 |
| C | BLIND | 5.58 | 344.77 | 375.23 | 200.00 | 5.58 | 17.43 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 11.30 | 586.76 | 133.24 | 200.00 | 11.30 | 9.00 | 4.90 | 0.00 | 20 | 20 | 0 |
| C | CAUTIOUS | 13.00 | 683.17 | 44.33 | 200.00 | 10.95 | 5.45 | 8.60 | 7.50 | 20 | 16 | 8 |

### 720 cr · R8 · oracle 15 cr · 40 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 757.75 | 12.25 | 274.90 | 0.00 | 0.00 | 0.00 | 50.00 | 20 | 0 | 20 |
| M | BLIND | 5.05 | 322.33 | 397.68 | 215.10 | 4.60 | 13.90 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 10.20 | 573.49 | 146.52 | 146.40 | 9.90 | 6.80 | 5.00 | 0.00 | 2 | 2 | 0 |
| M | CAUTIOUS | 10.65 | 655.10 | 67.41 | 163.60 | 8.65 | 4.75 | 7.00 | 2.50 | 0 | 0 | 1 |
| C | SEND | 15.00 | 757.75 | 12.25 | 200.00 | 0.00 | 0.00 | 0.00 | 50.00 | 80 | 0 | 80 |
| C | BLIND | 4.86 | 303.22 | 416.78 | 200.00 | 4.86 | 14.14 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 10.30 | 573.43 | 146.57 | 200.00 | 10.30 | 6.60 | 5.00 | 0.00 | 12 | 12 | 0 |
| C | CAUTIOUS | 11.05 | 649.85 | 72.65 | 200.00 | 9.05 | 4.90 | 7.00 | 2.50 | 0 | 0 | 4 |

### 720 cr · R8 · oracle 15 cr · 48 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 757.75 | 12.25 | 289.80 | 0.00 | 0.00 | 0.00 | 50.00 | 20 | 0 | 20 |
| M | BLIND | 5.95 | 369.43 | 350.58 | 217.80 | 5.40 | 17.05 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 10.95 | 611.17 | 108.83 | 138.10 | 10.95 | 8.65 | 4.85 | 0.00 | 1 | 1 | 0 |
| M | CAUTIOUS | 12.45 | 722.97 | 32.03 | 154.30 | 10.45 | 5.55 | 8.80 | 35.00 | 1 | 0 | 8 |
| C | SEND | 15.00 | 757.75 | 12.25 | 200.00 | 0.00 | 0.00 | 0.00 | 50.00 | 80 | 0 | 80 |
| C | BLIND | 5.58 | 344.77 | 375.23 | 200.00 | 5.58 | 17.43 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 11.30 | 604.69 | 115.31 | 200.00 | 11.30 | 9.00 | 4.90 | 0.00 | 20 | 20 | 0 |
| C | CAUTIOUS | 12.65 | 721.73 | 33.27 | 200.00 | 10.65 | 5.90 | 8.90 | 35.00 | 8 | 0 | 36 |

### 720 cr · F12 · oracle 10 cr · 40 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 757.75 | 12.25 | 283.60 | 0.00 | 0.00 | 0.00 | 50.00 | 20 | 0 | 20 |
| M | BLIND | 6.65 | 391.92 | 328.08 | 206.20 | 6.30 | 12.35 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 8.50 | 532.07 | 187.93 | 178.60 | 8.30 | 8.50 | 5.00 | 0.00 | 0 | 0 | 0 |
| M | CAUTIOUS | 13.00 | 668.80 | 51.20 | 131.60 | 11.00 | 3.00 | 7.00 | 0.00 | 0 | 0 | 0 |
| C | SEND | 15.00 | 757.75 | 12.25 | 200.00 | 0.00 | 0.00 | 0.00 | 50.00 | 80 | 0 | 80 |
| C | BLIND | 6.39 | 376.16 | 343.84 | 200.00 | 6.39 | 12.61 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 9.00 | 550.65 | 169.35 | 200.00 | 9.00 | 8.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| C | CAUTIOUS | 13.00 | 668.80 | 51.20 | 200.00 | 11.00 | 3.00 | 7.00 | 0.00 | 0 | 0 | 0 |

### 720 cr · F12 · oracle 10 cr · 48 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 757.75 | 12.25 | 305.10 | 0.00 | 0.00 | 0.00 | 50.00 | 20 | 0 | 20 |
| M | BLIND | 7.05 | 412.80 | 307.20 | 210.80 | 6.80 | 15.95 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 12.00 | 659.88 | 60.12 | 154.20 | 12.00 | 8.55 | 5.00 | 0.00 | 0 | 0 | 0 |
| M | CAUTIOUS | 14.80 | 709.25 | 10.75 | 129.90 | 12.80 | 3.00 | 8.00 | 0.00 | 16 | 16 | 0 |
| C | SEND | 15.00 | 757.75 | 12.25 | 200.00 | 0.00 | 0.00 | 0.00 | 50.00 | 80 | 0 | 80 |
| C | BLIND | 6.91 | 405.19 | 314.81 | 200.00 | 6.91 | 16.09 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 12.00 | 646.40 | 73.60 | 200.00 | 12.00 | 9.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| C | CAUTIOUS | 15.00 | 709.25 | 10.75 | 200.00 | 13.00 | 3.00 | 8.00 | 0.00 | 80 | 80 | 0 |

### 720 cr · F12 · oracle 15 cr · 40 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 757.75 | 12.25 | 283.60 | 0.00 | 0.00 | 0.00 | 50.00 | 20 | 0 | 20 |
| M | BLIND | 6.65 | 391.92 | 328.08 | 206.20 | 6.30 | 12.35 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 8.50 | 551.48 | 168.53 | 178.60 | 8.30 | 8.50 | 5.00 | 0.00 | 0 | 0 | 0 |
| M | CAUTIOUS | 13.00 | 699.90 | 20.10 | 131.60 | 11.00 | 3.00 | 7.00 | 0.00 | 0 | 0 | 0 |
| C | SEND | 15.00 | 757.75 | 12.25 | 200.00 | 0.00 | 0.00 | 0.00 | 50.00 | 80 | 0 | 80 |
| C | BLIND | 6.39 | 376.16 | 343.84 | 200.00 | 6.39 | 12.61 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 9.00 | 564.45 | 155.55 | 200.00 | 9.00 | 8.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| C | CAUTIOUS | 13.00 | 699.90 | 20.10 | 200.00 | 11.00 | 3.00 | 7.00 | 0.00 | 0 | 0 | 0 |

### 720 cr · F12 · oracle 15 cr · 48 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 757.75 | 12.25 | 302.30 | 0.00 | 0.00 | 0.00 | 50.00 | 20 | 0 | 20 |
| M | BLIND | 7.35 | 429.06 | 290.94 | 206.40 | 6.75 | 15.65 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 11.55 | 680.98 | 39.02 | 154.90 | 11.55 | 8.55 | 5.00 | 0.00 | 0 | 0 | 0 |
| M | CAUTIOUS | 13.80 | 760.85 | 9.15 | 136.40 | 11.80 | 4.00 | 9.00 | 50.00 | 0 | 0 | 20 |
| C | SEND | 15.00 | 757.75 | 12.25 | 200.00 | 0.00 | 0.00 | 0.00 | 50.00 | 80 | 0 | 80 |
| C | BLIND | 6.91 | 405.19 | 314.81 | 200.00 | 6.91 | 16.09 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 12.00 | 667.50 | 52.50 | 200.00 | 12.00 | 9.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| C | CAUTIOUS | 14.00 | 760.85 | 9.15 | 200.00 | 12.00 | 4.00 | 9.00 | 50.00 | 0 | 0 | 80 |

### 800 cr · R8 · oracle 10 cr · 40 ticks

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

### 800 cr · R8 · oracle 10 cr · 48 ticks

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

### 800 cr · R8 · oracle 15 cr · 40 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 784.05 | 15.95 | 283.70 | 0.00 | 0.00 | 0.00 | 0.00 | 20 | 20 | 0 |
| M | BLIND | 4.85 | 308.44 | 491.56 | 219.40 | 4.85 | 14.15 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 10.30 | 588.89 | 211.11 | 139.30 | 10.30 | 6.60 | 5.00 | 0.00 | 3 | 3 | 0 |
| M | CAUTIOUS | 11.25 | 673.33 | 126.67 | 157.60 | 9.25 | 4.75 | 7.00 | 0.00 | 0 | 0 | 0 |
| C | SEND | 15.00 | 784.05 | 15.95 | 200.00 | 0.00 | 0.00 | 0.00 | 0.00 | 80 | 80 | 0 |
| C | BLIND | 4.86 | 306.42 | 493.58 | 200.00 | 4.86 | 14.14 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 10.30 | 588.90 | 211.11 | 200.00 | 10.30 | 6.60 | 5.00 | 0.00 | 12 | 12 | 0 |
| C | CAUTIOUS | 11.25 | 673.33 | 126.67 | 200.00 | 9.25 | 4.75 | 7.00 | 0.00 | 0 | 0 | 0 |

### 800 cr · R8 · oracle 15 cr · 48 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 784.05 | 15.95 | 306.50 | 0.00 | 0.00 | 0.00 | 0.00 | 20 | 20 | 0 |
| M | BLIND | 5.70 | 353.43 | 446.57 | 216.40 | 5.70 | 17.30 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 11.30 | 622.22 | 177.78 | 132.00 | 11.30 | 9.00 | 4.90 | 0.00 | 5 | 5 | 0 |
| M | CAUTIOUS | 13.05 | 741.32 | 58.68 | 145.10 | 11.05 | 5.45 | 8.70 | 0.00 | 6 | 6 | 0 |
| C | SEND | 15.00 | 784.05 | 15.95 | 200.00 | 0.00 | 0.00 | 0.00 | 0.00 | 80 | 80 | 0 |
| C | BLIND | 5.58 | 349.01 | 450.99 | 200.00 | 5.58 | 17.43 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 11.30 | 622.22 | 177.78 | 200.00 | 11.30 | 9.00 | 4.90 | 0.00 | 20 | 20 | 0 |
| C | CAUTIOUS | 13.05 | 741.32 | 58.68 | 200.00 | 11.05 | 5.45 | 8.70 | 0.00 | 24 | 24 | 0 |

### 800 cr · F12 · oracle 10 cr · 40 ticks

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

### 800 cr · F12 · oracle 10 cr · 48 ticks

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

### 800 cr · F12 · oracle 15 cr · 40 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 784.05 | 15.95 | 289.70 | 0.00 | 0.00 | 0.00 | 0.00 | 20 | 20 | 0 |
| M | BLIND | 6.30 | 372.65 | 427.35 | 207.00 | 6.30 | 12.70 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 9.00 | 579.55 | 220.45 | 170.50 | 9.00 | 8.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| M | CAUTIOUS | 13.00 | 718.90 | 81.10 | 132.80 | 11.00 | 3.00 | 7.00 | 0.00 | 0 | 0 | 0 |
| C | SEND | 15.00 | 784.05 | 15.95 | 200.00 | 0.00 | 0.00 | 0.00 | 0.00 | 80 | 80 | 0 |
| C | BLIND | 6.39 | 376.59 | 423.41 | 200.00 | 6.39 | 12.61 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 9.00 | 579.55 | 220.45 | 200.00 | 9.00 | 8.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| C | CAUTIOUS | 13.00 | 718.90 | 81.10 | 200.00 | 11.00 | 3.00 | 7.00 | 0.00 | 0 | 0 | 0 |

### 800 cr · F12 · oracle 15 cr · 48 ticks

| Street | Strategy | Done | Burn | Purse | Liquidity | S | R | Q | Pocket | All | Free | Halt |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M | SEND | 15.00 | 784.05 | 15.95 | 312.20 | 0.00 | 0.00 | 0.00 | 0.00 | 20 | 20 | 0 |
| M | BLIND | 6.85 | 401.68 | 398.32 | 212.80 | 6.85 | 16.15 | 0.00 | 0.00 | 0 | 0 | 0 |
| M | MORNING | 12.00 | 686.50 | 113.50 | 149.30 | 12.00 | 9.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| M | CAUTIOUS | 15.00 | 764.35 | 35.65 | 125.70 | 13.00 | 3.00 | 8.00 | 0.00 | 20 | 20 | 0 |
| C | SEND | 15.00 | 784.05 | 15.95 | 200.00 | 0.00 | 0.00 | 0.00 | 0.00 | 80 | 80 | 0 |
| C | BLIND | 6.91 | 405.62 | 394.38 | 200.00 | 6.91 | 16.09 | 0.00 | 0.00 | 0 | 0 | 0 |
| C | MORNING | 12.00 | 686.50 | 113.50 | 200.00 | 12.00 | 9.00 | 5.00 | 0.00 | 0 | 0 | 0 |
| C | CAUTIOUS | 15.00 | 764.35 | 35.65 | 200.00 | 13.00 | 3.00 | 8.00 | 0.00 | 80 | 80 | 0 |

## Validation and reproducibility

- Rust: **107 tests pass** (105 full-suite tests, then two additional retry/pocket regression tests). `cargo clippy --all-targets` completes with the pre-existing `too_many_arguments` warning in `scenarios/high_court.rs:118`; no new warnings. Rust stable 1.91, wasm32 target.
- Frontend: **103 tests pass, one existing todo**; TypeScript and production build pass. Vite retains its existing large-chunk advisory. Node 22.23.3 runtime.
- Chromium/SwiftShader: **11 original active tests pass**, nine opt-in take exports skipped; **two existing take previews pass** (Door rejection/approval with the unchanged ten-credit send fee, zoom through the world heartbeat). The three game browser checks, including the new pocket/close check, pass after the final phone styling change.
- Demo guard: saved round-one hashes compare **200 exact state/event outputs** (five scenarios × forty ticks), including approvals, rejections and price drift. Recorded trace tests and thumbnail/room/street/city/court/world rendering checks also pass. `frontend/takes/` and `presentation/` are untouched; previews write only ignored test output.
- The five-view native SSE week exercised all four answers, a phone reconnect and all Friday Notes. It is an integration check with finite click time, not the strategy matrix or a substitute for two human kitchen-table weeks.

Run from `engine/`:

```sh
cargo test
cargo clippy --all-targets
PLAYTEST_OUT=../frontend/tests/fixtures/elm-playtest-native.json cargo test --test playtest
cargo run --release --example round2_matrix -- target/round2-matrix
sh build-wasm.sh
```

Then from `frontend/`, with Node 22.18+ and Playwright Chromium installed:

```sh
npm run copy-assets
npm test
npm run typecheck
npm run test:gpu
TAKE_PREVIEW=24 npx playwright test take-door take-zoom
npm run build
```

Experiment knobs: native `--oracle-cost 10 --price-every 12 --week 48 --budget 720`; browser `?run=game&oracle-cost=10&cadence=12&week=48&budget=720`. Eight selects the original walk; twelve selects the regular cadence. Knobs are opt-in; engine defaults are retained.

Review stills: [phone card and pocket](review-assets/round-2-2026-09-30/phone-door.png), [closed house / spent pocket](review-assets/round-2-2026-09-30/phone-closed-pocket.png), [TV Friday](review-assets/round-2-2026-09-30/sse-tv-friday.png), phones [Ada](review-assets/round-2-2026-09-30/sse-phone-ada-friday.png), [Ben](review-assets/round-2-2026-09-30/sse-phone-ben-friday.png), [Cal](review-assets/round-2-2026-09-30/sse-phone-cal-friday.png), [Dee](review-assets/round-2-2026-09-30/sse-phone-dee-friday.png). Browser stills were inspected; matrix conclusions come from the deterministic harness.

The repository remains public under §10.11. This is a laboratory result for cloud review; no PR or promotion is requested. The branch is pushed only to `codex/round-2`, then work stops.
