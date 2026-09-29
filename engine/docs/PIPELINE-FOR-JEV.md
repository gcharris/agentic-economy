# The cloud session's design pipeline, for the jev agent

**Written for:** the jev agent, so it can analyse how this laboratory's design and build pipeline ran on 2026-09-28/29 and where a cheaper, faster judge could take over. **Written by:** the cloud session's operator (Claude, session `session_017K6GES9PnR23AwS2vThJFM`). **Branch:** `claude/dreamy-carson-g1load` of `gcharris/agentic-economy`; everything named here is committed on it. Pull with `git fetch origin claude/dreamy-carson-g1load && git checkout claude/dreamy-carson-g1load`.

Links below are to the branch on GitHub; the same paths work in a local clone. `B` = `https://github.com/gcharris/agentic-economy/blob/claude/dreamy-carson-g1load/`.

## 1. What the pipeline was asked to do

The handoff ([B/engine/docs/HANDOFF.md](https://github.com/gcharris/agentic-economy/blob/claude/dreamy-carson-g1load/engine/docs/HANDOFF.md)) listed the work in priority order: adapt six tests to the audited Rust engine, refresh and publish the presentation, then design and build the game's frontend from the brief ([B/engine/docs/FRONTEND-DESIGNER-BRIEF.md](https://github.com/gcharris/agentic-economy/blob/claude/dreamy-carson-g1load/engine/docs/FRONTEND-DESIGNER-BRIEF.md)). The engine's contract for the frontend is `StateView` plus the `EngineEvent` stream; the renderer draws only those.

## 2. The shape of every workflow

Five workflows ran, all written as scripts that orchestrate subagents deterministically. The scripts, with their full prompts, are in [B/engine/docs/workflow/cloud-session-2026-09-29/](https://github.com/gcharris/agentic-economy/tree/claude/dreamy-carson-g1load/engine/docs/workflow/cloud-session-2026-09-29) (`*.js`), and every agent's returned value is beside them (`*.results.json`, one file per workflow, `label` and `phase` per result). Each workflow has the same skeleton:

1. **Build**: one or more agents do the work against a written spec.
2. **Verify**: three agents with distinct lenses each try to refute the work; each returns findings as `{file, line, severity: blocking | should-fix | nit, claim, evidence, proposed_fix}`.
3. **Repair**: one agent verifies each non-nit finding against the code, fixes it or says why it is not real, reruns the checks.
4. Loop 2 and 3 until a round returns no non-nit findings, at most three rounds.

| workflow | script | agents | subagent tokens | rounds | outcome |
|---|---|---|---|---|---|
| six test adaptations, serve 404 | `adapt-six-lane-tests-*.js` | 13 | 1.36M | 2 (round 1 found 3, round 2 clean) | suite green, 71 tests; one coverage gap restored as a new test |
| presentation refresh | `refresh-presentation-*.js` | 13 | 2.44M | 3 | published; nine copy and layout fixes across rounds |
| frontend design panel | `frontend-design-panel-*.js` | 11 | 2.56M | n/a (panel, see §3) | `frontend/DESIGN.md`, `frontend/ARCHITECTURE.md` |
| Vault backend | `vault-backend-*.js` | 8 (4 finished) | 0.63M | round 1 found 6; repair died on the usage limit | WIP checkpoint, findings listed in HANDOFF §7 |
| frontend scaffold | `frontend-scaffold-*.js` | 5 (0 finished) | 0.27M | none | the builder had written the engine layer before dying; 69 unit tests green |

Session cost as recorded by the session itself: USD 252.78 on the cloud grant.

## 3. The design panel in detail (the part most worth analysing)

Script: `frontend-design-panel-wf_bb257de1-961.js`. Four phases:

1. **Understand**: four readers in parallel, each with one question, wrote a map: the engine contract as serialised, the visual world (prototypes, palette, actors, copy), the converged render architecture from three earlier proposals, and the scenarios and LOD behaviour. Maps: [B/engine/docs/workflow/design-panel/](https://github.com/gcharris/agentic-economy/tree/claude/dreamy-carson-g1load/engine/docs/workflow/design-panel) (`map-contract.md`, `map-world.md`, `map-architecture.md`, `map-scenarios.md`).
2. **Design**: three designers, each given all four maps, the mood images and one angle, wrote a complete direction to the same twelve-section template: `design-colony.md` (the joy of the hex-colony reference in oak and brass), `design-diorama.md` (a model-maker's miniature), `design-ledger.md` (paper, ink and engraved brass).
3. **Judge**: three judges, each with a lens (the Director's brief, the Three.js engineer's feasibility, the first-time and colour-blind viewer's legibility), scored every direction 1–10 on fidelity, feasibility, legibility and delight, named ideas to graft and fatal flaws, and picked a winner. Scores: `cloud-session-2026-09-29/judges.json`.

| direction | Director | Engineer | Viewer | total |
|---|---|---|---|---|
| Colony | 31 | 29 | 34 | 94 |
| Diorama | 33 | 31 | 29 | 93 |
| Ledger | 27 | 32 | 31 | 90 |

Each judge picked a different winner (Director: Diorama; Engineer: Ledger; Viewer: Colony); the totals sit within four points.

4. **Synthesise**: one agent took the highest total as the base, grafted the ideas the judges named from the other two, fixed every named flaw, and wrote [B/frontend/DESIGN.md](https://github.com/gcharris/agentic-economy/blob/claude/dreamy-carson-g1load/frontend/DESIGN.md) and [B/frontend/ARCHITECTURE.md](https://github.com/gcharris/agentic-economy/blob/claude/dreamy-carson-g1load/frontend/ARCHITECTURE.md). Its provenance paragraph at the top of DESIGN.md lists exactly what was grafted and fixed.

The same panel shape had run the day before for the stack decision ([B/engine/docs/TECH-STACK-DECISION.md](https://github.com/gcharris/agentic-economy/blob/claude/dreamy-carson-g1load/engine/docs/TECH-STACK-DECISION.md)): six proposals in [B/engine/docs/workflow/](https://github.com/gcharris/agentic-economy/tree/claude/dreamy-carson-g1load/engine/docs/workflow) whose judges never ran, so the record was written by one reader.

## 4. Questions jev could answer from this evidence

These are questions, not instructions; the Director decides what jev is for.

1. **The judge panel.** Given the three directions and the brief, does jev's ranking agree with the three judges' totals, with any one judge, or with none? The three judges disagreed on the winner and cost about a fifth of the panel's tokens.
2. **Finding triage.** Every verify round's findings carry a severity, evidence and a proposed fix, and the following repair result says which were real and which were not. Can jev predict, from the finding alone, which ones the repair agent confirmed? (`wf_66ce6591-ee3`, `wf_754f6288-a8f`, `wf_ac6a4486-a5f` results.)
3. **Routing.** Of the 50 agent jobs, which needed a frontier model (the designers, the synthesiser, the repair agents) and which were mechanical (the hygiene lens, the reader that lists routes, the copy-fact check)? A label per job from jev, compared with what each job actually produced, is the routing table the estate's 2026-09-28 direction asks for.
4. **Copy against record.** The presentation's numbers must match the raw JSON, not the report tables ([B/engine/docs/workflow/facts.md](https://github.com/gcharris/agentic-economy/blob/claude/dreamy-carson-g1load/engine/docs/workflow/facts.md) lists 62 facts and 17 discrepancies). Checking each number on the page against the record is a labelling job.
5. **Shot list.** The recording plan needs each engine event type labelled with a stage, a camera altitude and a duration; the event catalogue and the motion table are in `map-contract.md` §6 and DESIGN.md §9.

## 5. What is where

- The engine: [B/engine/](https://github.com/gcharris/agentic-economy/tree/claude/dreamy-carson-g1load/engine) (`src/lib.rs` states the four laws; `cargo test` is green: 75 by default, 99 with `--features vault`).
- The audit ledger: [B/engine/docs/AUDIT-LEDGER.md](https://github.com/gcharris/agentic-economy/blob/claude/dreamy-carson-g1load/engine/docs/AUDIT-LEDGER.md).
- The presentation source and build: [B/presentation/](https://github.com/gcharris/agentic-economy/tree/claude/dreamy-carson-g1load/presentation); the published page is a private Artifact (URL in HANDOFF §6) that needs sharing before another account can open it.
- The frontend so far: [B/frontend/](https://github.com/gcharris/agentic-economy/tree/claude/dreamy-carson-g1load/frontend) (the two specs, the engine layer under `src/engine/`, the unit tests). `cd frontend && npm install && npm run copy-assets && npm test`.
- Status and open work: HANDOFF §7, §9, §10.

Laboratory rules apply ([B/LABORATORY.md](https://github.com/gcharris/agentic-economy/blob/claude/dreamy-carson-g1load/LABORATORY.md)): nothing here is shipped or adopted; no secrets anywhere in the folder.
