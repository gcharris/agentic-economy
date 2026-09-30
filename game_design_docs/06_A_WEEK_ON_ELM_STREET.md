# 06. A WEEK ON ELM STREET: the street as a game

**Status:** a design pass, not a build. Written 2026-09-29 for the Director, from the engine as it stands (`engine/src`) and the demo as rendered (`frontend/takes/`). Everything here is laboratory work under `LABORATORY.md`: nothing is shipped, and the first table it runs on is a kitchen table on a LAN, not a public surface. A hosted table is Controlled work behind a docket.

**The test it has to pass** (the Director's, 2026-09-29): would teenagers around a table choose to play this the way they choose Monopoly, or only if made to? §7 answers that honestly. The short version: this is not a shooter and never will be. It is a seven-minute bluffing and push-your-luck game for two to six people, and whether it hooks anyone is decided at the first kitchen-table playtest, not in this document.

## 1. The game in one paragraph

Two to six people, one house each, on one street. Each house has a purse of compute (the fuel), a stack of liquidity (the money), a list of fifteen pieces of work, and five staff who draft on their own. A week is five days. You stand at your Door. Everything that leaves your house or spends money knocks: a finished draft to send, a neighbour's courier to hire. You answer one of three ways: yes, no, or ask the oracle first. The street's price for a courier moves under everyone's feet. Only the oracle knows it, for 15 cr; everyone else guesses, or believes what the table says. Every hire settles or reverts at the kerb, in front of everyone. On Friday evening each house leaves its Note on the table: what got done, what it cost, what was left. The game never says who won. The table does.

## 2. Why the demo is not a game and this is

The demo is a thesis you can watch: one person says yes or no at a door and the world moves at a boundary. A game needs four more things, and the engine already has the physics for each.

| what a game needs | what the engine already enforces | where |
|---|---|---|
| stakes | the purse is the clock: sized to finish the list with nothing spare; empty it and the house halts with a Note | `Purse`, `Halted`, `Note` |
| decisions with trade-offs | yes at the Door costs the fee; no sinks the formatting tax; waiting is free in compute and not free in truth (Φ × 0.9717 per tick) | `envelope.rs` `needs_signature_at_house`, `epistemics.rs` |
| uncertainty you can push against | the truth price lives in the Sovereign Graph; the house acts on its Oak Table's belief; a stale belief reverts at the Letter Slot with the tax sunk; the oracle resets Φ to 1.0 for 15 cr | `boundary.rs` `dvp_binding`, `ORACLE_COST` |
| other people | a hire is an atomic swap with a neighbour; liquidity moves house to house and is conserved on the street; the kerb is public | `Stage2LetterSlot`, `graph.transfer` |

Monopoly's ingredients are trade, trust, timing and shared catastrophe. Elm Street has all four with better physics, and one thing Monopoly lacks: a referee that makes lying possible and expensive at the same time. You can tell the table the courier costs 12. The kerb decides who believed you.

## 3. The rules card

Written in the house's vocabulary, to be printed and put on the table.

**The street.** Each of you keeps a house on Elm Street. Your house has a purse (compute, the fuel your staff burn to think), a stack of liquidity (money that can leave the house), and a list of fifteen pieces of work for the week. Your staff, Scout, Scribble, Inspector, Penny and the Porter, do the work on their own. You do not tell them what to do. You stand at the Door.

**The week.** Five days, eight ticks a day, forty ticks. A tick is ten seconds at the table. Friday's last tick ends the week.

**The Door.** When your Porter has a finished draft, he walks to your Door and knocks. The card on your phone says what it is and what it costs. Nothing burns while you decide, but your house stands still while he waits, everyone else's keeps working, and your staff's notes go stale by 2.8 % a tick. You answer one of three ways:

- **Yes, send it.** The fee (10 cr) leaves the purse. The draft goes out. One piece of work is done.
- **No, leave it on the table.** The draft stays. The 2.5 cr already spent formatting it is gone. Your staff move on and come back later.
- **Ask the oracle first.** 15 cr. Your house learns the truth about the street: the courier's price today. Your staff's notes are fresh again (Φ 100 %). The card comes back and you decide.

**Hiring.** Instead of sending a draft yourself, you can hire a neighbour's courier to carry it. The card says which neighbour and the price your house believes (what your Oak Table says, which may be old). Say yes and the swap goes to the kerb at the next tick: your liquidity locks, their courier's run locks, and the Letter Slot checks your price against the truth. If it matches, the swap settles, the money moves to your neighbour, and your draft is delivered without spending the fee. If it does not match, the swap reverts in front of everyone, nothing moves, 0.5 cr is sunk, and you lost a tick.

**The price.** The courier's price on Elm Street moves during the week: 8, 10, 12 or 14. It moves without warning, about once a day. The oracle knows. Whoever asked the oracle knows. Anyone can say what it is. Nobody has to tell the truth.

**Selling.** When a neighbour hires your courier and the swap settles, their money lands in your stack. You do nothing; your courier does the run.

**The empty purse.** If your purse runs out, your staff stop. They leave the papers on the table and a Note: what they were in the middle of, what they spent, and that they stopped because the purse was empty. You may put money in from your own pocket (you have 200 cr for the week, and every top-up is written on the Note), or say the week is over for your house.

**Friday.** At the last tick every house leaves its Note on the table: pieces done of fifteen, compute burned, purse left, liquidity left, swaps settled, swaps reverted, times the oracle was asked, top-ups. There is no score. Read the Notes out. Argue.

## 4. The decisions, costed

Every number below is the engine's today except the two marked *new*.

| decision | costs | risks | the engine's rule |
|---|---|---|---|
| yes to a send | 10 cr compute (the task's `spend`) | none; the draft is delivered | `Dispatch` approved at the Door, `charge_send`, `Delivered` |
| no to a send | 2.5 cr sunk (the 25 % coordination tax on 10) | the piece is not done; a tick lost | `Rejected { sunk_compute: tax_paid }` |
| wait | 0 cr; Φ × 0.9717 per tick; the house stands still | Φ under 0.75 makes Scribble hallucinate the price with probability = fog | `idle_decay`, `HALLUCINATION_THRESHOLD` |
| ask the oracle *(new as a person's choice)* | 15 cr | none; Φ → 1.0, the belief price is the truth | `Payload::StateSync`, `ORACLE_COST`; today only Scout asks, when overdue or hallucinating |
| yes to a hire | liquidity = the believed price; 0.5 cr tax | reverts if the belief is stale (0.5 cr sunk, a tick lost, nothing moves) | `HireService`, `Stage2LetterSlot::verify_one`, `dvp_binding` |
| a settled hire delivers the draft *(new)* | nothing more | none | today a settled hire moves liquidity and writes `services/<id>` on the Oak Table; it finishes no work |
| top-up | from the person's 200 cr pocket, written on the Note | none in the engine; at the table, everyone sees it | `top_up`, `ToppedUp` |

**Why anyone hires.** The purse is sized to the list with nothing spare (fifteen drafts at about 42.5 cr each plus fifteen fees at 10 cr comes to roughly the 800 cr purse). Liquidity is the slack: 200 cr that can only leave the house through a hire. Every send you replace with a settled hire keeps 10 cr of compute in the purse, and ten such hires are the difference between finishing on Friday and the Note on Thursday. Every hire you get wrong costs half a credit and a tick, and the tick is the real price: forty ticks for fifteen pieces leaves about ten ticks of slack for the whole week, spent on hesitation, reverts and oracle visits alike.

**Why anyone asks the oracle.** Because 15 cr buys certainty for as long as the price holds, and the price holds about a day. One hire on that knowledge does not pay for it. Three do. Telling the table what you learned is free, and so is lying about it.

**What the tuning knobs are** (set at the playtest, not here): the hire's compute weight (2.0 today, so 0.5 cr sunk; raise it if people spam guesses), the price steps and how often the price moves, the week's length in ticks, and the pocket for top-ups.

## 5. The table

- **The TV** runs the street as the demo renders it now (band 2: the cottages, the kerb, the couriers' four-beat settle and the snap-back), with each cottage named for its person. The kerb is the shared moment: every ten seconds, everyone watches whose swaps settle.
- **Each phone** shows one Door: the card as it exists today, one more button ("Ask the oracle first, 15 cr"), the purse and liquidity, the oracle's last answer and when it was given, and the Note when there is one. The URL carries the house (`?house=3`); no accounts, no names in the engine beyond the cottage label.
- **Hot seat** without phones: one screen, the Door cards queue with the person's name on them; pass the laptop.
- **Where it runs:** `serve` on a laptop on the household LAN (`--bind 0.0.0.0` exists), the phones on the same wifi, the engine ticking at the table's pace (`--interval-ms 10000`). No internet, no hosting: inside the laboratory. Cloud Run is a docket later, if the table says the game is worth sharing.

## 6. The no-score rule

The brief forbids a score, rank, reputation or leaderboard anywhere, and a test enforces it in the state view. That rule is right for the thesis and stays. A game still has to tell you how you are doing, and the essay already says how: the Note. What got done, what it cost, what you had left. Friday's Notes are the essay's own currency, laid side by side, and the ranking happens in people's heads and mouths, not on the screen. This is how a golf card works and how most Monopoly games actually end: by counting up and arguing. The engine never counts anyone above anyone.

## 7. The kitchen-table test, honestly

- **Who it is for.** People who like Werewolf, Codenames, Monopoly's trading phase, Poker for matchsticks: games where the fun is what the other people at the table say. The loop is a decision every twenty seconds, table talk between, and a public reckoning every ten. Seven minutes a week, best of three weeks.
- **Who it is not for.** Someone who wants a shooter. There is no aiming, no reflex, nothing to master with the thumbs. Do not pitch it to them; let them wander in when the table gets loud.
- **The bet.** The rumour layer does the work. If people say "it's 12, I just asked" and someone else says "he's lying, it moved", the game exists. If everyone sits silently pressing yes, it does not, and no amount of art will fix it.
- **What to measure at the first playtest** (three or four people, the Director moving the price by hand with `engine_set_truth_price`): did anyone lie about the price; did anyone ask the oracle; did anyone top up; how many reverts per person; did anyone pick a neighbour on purpose; did they ask for a second week without being asked.
- **Kill criteria.** No lies and no second week in two playtests means the street is not the game and the design should stop here, with the demo as the deliverable.

## 8. Build order (one round, the Opus session)

Round 1 is the playable street: the engine changes below, the phone Door, the Notes on the table, and a LAN run. Nothing else. Estimated at one Opus 5.5 session at high effort on the subscription, no workflows, no subagents, a spend checkpoint at the midpoint.

**Engine** (`engine/`):

1. **The person's oracle.** `Engine::sync(node)`: the person asks; at the next Draft the house proposes `Payload::StateSync` (15 cr, Φ → 1.0, the Oak Table's `price/courier` set to the truth). wasm `engine_sync`, `serve` `POST /sync/<node>`. `EngineConfig.oracle_policy: Staff | Person`: under `Person`, Scout no longer asks on his own.
2. **A settled hire delivers the draft.** `HireService` gains `task_id: Option<String>`; the Porter's hire names the draft it is for; on `Settled` the task is done and `Delivered` fires for it, as an approved `Dispatch` would. The Porter still proposes both the send and the hire for the same draft; both knock; a yes to one and a no to the other is the person's answer (a yes to both pays twice, which is theirs to regret).
3. **The price walk.** `EngineConfig.price_walk: Option<PriceWalk { every: u64, steps: Vec<f64>, seed: u64 }>` moving the `courier` truth among 8, 10, 12, 14 about once a day, seeded and deterministic; `engine_set_truth_price` stays for the Director's hand.
4. **The week.** `EngineConfig.week_ticks: Option<u64>`; at the last tick every house halts with the week's Note: pieces done of total, compute burned, purse left, liquidity left, swaps settled, swaps reverted, oracle queries, top-ups. `Halted` carries it. The no-score test stays green: these are the essay's numbers, per house, never compared by the engine.
5. **`serve`** flags: `--scenario street --houses N --budget 800 --tasks 15 --interval-ms 10000` exist; add `--names Ada,Ben,...`, `--week 40`, `--price-walk`, `--oracle person`.

**Frontend** (`frontend/`):

6. The phone view `?source=sse&house=<n>`: the Door card with the third button, the purse and liquidity, the oracle's last answer, the Note. The card composes the send and the hire for the same draft into one card with "Send it (10 cr)", "Hire <neighbour>'s courier at <believed price>", "Ask the oracle first (15 cr)", "Leave it on the table".
7. The TV view: the street band with the cottages labelled by name, and on Friday's last tick the Notes on the table, side by side, in the Note's own typography. No totals row.

**Tests:** engine, deterministic: a hire at the wrong price reverts and the task stays; at the right price the task completes and liquidity moves; the person's sync charges 15 cr and resets Φ; under `Person` Scout never proposes a sync; the week ends with a Note per house; the no-score test green. Frontend: a DOM test of the composed card; one SwiftShader still of the phone view and one of the Notes on the table.

**Not in round 1:** sound, avatars, chat, timers on the card, the Clearinghouse or the Court as a season, any hosted table, any change to the demo's takes.

## 9. What comes after, only if the table says so

A second street (the Clearinghouse netting the day between streets) makes a season of it. The High Court's rollback makes the shared catastrophe. Neither is worth a token until people at a kitchen table have lied about the price of a courier.

## 10. Round 2: the rules the Director authorized on 2026-09-30

After the Codex review and playtest (`engine/docs/CODEX-REVIEW-2026-09-30.md`), whose first playtest measured lost drafts as much as economics. These rules are approved; Codex implements them on its own branch; the demo's runs and takes stay as they are, behind the explicit game configuration, with regression checks.

1. **A finished draft is drafted once and never bought again.** After the staff finish a piece it stays on the table until delivered. No later step runs Scout, Scribble or Inspector on it again.
2. **What a retry costs.** Formatting is paid once per finished draft for the send offer (2.5 cr) and once per hire attempt (0.5 cr). Re-offering the same draft mints nothing and charges nothing. A wrong guess therefore costs the tick and the half credit; "leave it on the table" costs ticks and Φ, not compute. The unchosen offer of a composed answer is withdrawn to the table, not destroyed.
3. **When a draft comes back.** A draft whose hire reverted: the Porter knocks again with it at his next free tick, at the house's current belief. A deferred draft ("leave it on the table"): after the staff finish the next piece, offered after the new draft, one knock each; if nothing is left to draft, at the next tick. Never immediately, so the house keeps drafting.
4. **A successful hire costs the price in liquidity plus its 0.5 cr, nothing else.** The 2 cr base weight is not burned on settlement.
5. **The pocket.** 200 cr per house, enforced by the engine: a top-up beyond it is refused. Two controls on the phone: "Put in 50 cr from your pocket" (with what is left) and "The week is over for my house". Top-ups stay on the Note.
6. **The answer is atomic.** One command carries the person's answer for a draft (send, hire, ask, leave); the engine applies it whole or not at all, and the phone acknowledges failure.
7. **The calendar** (days and ticks per day) derives from the week's length, not constants.
8. **The budget of 720 cr is a candidate, not a default.** Staff already spend less when the purse is light, so sending everything at 720 is measured before anything is claimed about it.
9. **The matrix**, on the playtest harness, retries on: budget 720 and 800; price cadence every 12 ticks against the current walk; oracle at 10 and 15 cr; 40 and 48 ticks; 20 seeds each, the four strategies, mixed streets and controls. Reported as tables. No default changes from the results; proposals only.
10. **What counts as working.** The strategies separate on the Notes and none dominates. "Oracle-and-hire finishes without a top-up" is a hypothesis the matrix tests, not an outcome to tune for. If sending everything wins at every budget, that is a finding about the design and it stands.
11. Repository visibility stays as it is unless the Director chooses otherwise. No pull request; no push to a `claude/*` branch; no hosting.

## 11. Round 3: the slow walk (a bounded experiment, authorized by the Director on 2026-09-30)

Round 2 (`engine/docs/CODEX-ROUND-2-2026-09-30.md`) showed that sending finishes every variant: compute is not the clock, ticks are, and the hire path is a tick slower per piece. Round 3 tests one rule against that finding. Defaults and the demo stay as they are; the rule lives in the game configuration only, behind the demo guard. If the matrix does not separate the strategies without one dominating, the report says so and work stops before the larger fork (unequal lists, hiring a neighbour's staff to draft). That fork is not authorized.

1. **The rule.** The Porter's own delivery takes `send_ticks` ticks. Answered "send it" at tick t, the fee is charged as now, the Porter leaves with the parcel, the piece is delivered at the commit of tick t + send_ticks − 1, and the Porter is back to knock at tick t + send_ticks. The demo keeps `send_ticks` 1, which is today's behaviour exactly. A hired courier takes the parcel at the kerb at the next tick, as now.
2. **The staff keep working while he is out.** Drafting no longer waits for delivery: when a draft is finished it joins the Porter's queue and the staff start the next piece, whether the Porter is out, at the kerb or waiting at the Door. The compute a piece costs is unchanged. The queue is offered oldest first; a deferred draft follows §10.3.
3. **What the person sees.** The phone's status line says the Porter is out and when he is back; no card until then. Φ stays on the purse panel as the cue for asking. Nothing new on the TV is required.
4. **Knobs.** `send_ticks` on the engine's game config, `serve --send-ticks` and `?send-ticks=` in the browser, default 1. No other rule changes.
5. **The matrix**, on the round-2 harness: `send_ticks` 2 and 3 × week 40 and 48 × prices R8 and F12; budget 800 and oracle 10 fixed; 20 seeds; the four strategies; mixed streets and controls. Round 2's `send_ticks` 1 cells are the control. Reported as tables with the same columns as round 2.
6. **Hypotheses, not targets.** Sending finishes about thirteen pieces at `send_ticks` 3 and is the safe floor; cautious oracle-and-hire finishes fifteen in most seeds at the cost of liquidity and ticks; blind hiring finishes fewer than sending. Each is tested and reported whichever way it falls. The criterion is §10.10: the strategies separate on the Notes and none dominates on pieces and purse together.
7. **Playtests.** The formal economics-and-deception playtest waits for a matrix that separates. A short usability session is allowed now, on the kitchen-table recipe (HANDOFF §9), two to four people, one week at ten seconds a tick: it asks only whether people understand the card, the Porter's absence, the oracle's answer, the pocket and the Note. Record, per person, what confused them, what they wanted to do and could not, and whether the price mattered to them at all. No conclusions about balance or lying from it.
8. Same constraints as §10.11: no default changes, demo guard green, no pull request, no push to a `claude/*` branch, no hosting; branch `codex/round-3`; report `engine/docs/CODEX-ROUND-3-<date>.md`; then stop.
