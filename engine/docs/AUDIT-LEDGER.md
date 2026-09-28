# Audit ledger

Source: the adversarial audit of 2026-09-28 (5 lenses, 33 findings, 81 refutation votes; 23 votes failed on a usage limit so 13 findings were refuted, the rest stood). Raw text: `docs/workflow/audit.md`. Status as of the handoff.

| # | finding | severity | status |
|---|---|---|---|
| 1 | A draft could rename itself: `ctx.node_id` was public and Collect trusted it | critical | **fixed**: `DraftContext` fields private; executor returns outcomes keyed by the job's node; `tests/law_1_forgery.rs` |
| 2 | Forged id yielded envelopes signed with the victim's secret | critical | **fixed** (same) |
| 3 | A seat could copy `epistemics` back and calibrate for free | high | **fixed**: handovers are recorded and replayed; Φ can only fall inside a draft |
| 4 | The verified DvP hash did not bind the settled amount | critical | **fixed**: `dvp_binding()` checks hash-of-claimed-price, amount == price, price == truth; applied at Stages 2, 3, 4, 5 |
| 5 | Zooming out approved an envelope the person was asked to sign | high | **fixed**: `asked_human`; test `once_asked_only_the_person_answers` |
| 6 | The court slashed the person for saying no at the Door | high | **fixed**: `TickStats` counts only liquidity failures at algorithmic gates (`Verdict::is_liquidity_failure`) |
| 7 | Injunction refusals re-triggered the court (DoS) | medium | **fixed**: injunction rejections excluded from stats |
| 8 | Two courts / two STARK instances | high | **fixed**: `Engine.court` and `Engine.stark` are the only instances; `default_strategies()` returns Stages 1–3 |
| 9 | Clearinghouse approved net, commit settled gross | high | **fixed** (lane 3 merged): `settle_netted`, `SovereignGraph::settle_net`, `Netted.net` correct |
| 10 | Netting evaded by pairing / non-atomic commit | high/medium | **fixed** by 9 (unwind loop, atomic `settle_net`) |
| 11 | Letter Slot lock reserved nothing; two swaps from one purse both passed | medium | **fixed**: per-batch locked map in `Stage2LetterSlot::verify_batch` |
| 12 | Send fee silently discounted to whatever was left | high | **fixed**: unaffordable send → `Rejected("cannot afford the send cost")`, nothing goes out |
| 13 | Macro ticks burned a house waiting at the Door; closed house burned in stasis | high/medium | **fixed**: `PackedStatisticalState.active_children`; only Active children carry macro burn |
| 14 | A closed house could still send and pay | medium | **fixed**: `preflight` rejects halted/partitioned initiators |
| 15 | Panicking seat silently lost the node's draft under Tokio | high | **fixed**: `DraftOutcome{ctx: None}` → `SeatFailed` event, node untouched; test in `law_1_forgery.rs` |
| 16 | Native vs wasm replay could diverge (libm `ln`/`cos`/`exp`) | medium | **fixed**: Irwin–Hall gaussian, `DECAY_FACTOR` literal with repeated multiplication |
| 17 | `block_on` could spin forever on wasm | medium | **fixed**: `block_on_bounded`; `engine_tick` returns 0 |
| 18 | `ProposalDraft.target` unchecked | medium | **fixed**: `SovereignNode::allowed_target`; courier drops "unknown address" |
| 19 | Purse could go −1e-9 | low | **fixed**: exact `can_burn` |
| 20 | Cache-hit rounding differed from kernel on odd tokens | low | **fixed**: literal `0.15` |
| 21 | Joules used a flat 0.05 J/cr | medium | **fixed**: `burn_priced` uses receipts' tier joules; door/tax fees stay flat (documented) |
| 22 | Oracle trigger let the chain reach 6–8 handovers | medium | **fixed**: `generation + 2 >= 5` |
| 23 | Benchmark-1 house run not reproducible (send 25 + tax vs 10 + 0) | high | **partly**: send fee now 10; the crossing tax remains by design (doc 04) and is stated |
| 24 | Idle decay presented as fitted to a measurement of waiting | medium | **fixed** (documentation): doc 02 rule, honestly attributed |
| 25 | Tax provenance "category error" | low | **fixed** (documentation) |
| 26 | `Agent: Send + Sync` admits shared `Arc<Mutex>` between seats | medium | **open by nature**: documented trust boundary in `node.rs`; a wasm seat sandbox would close it |
| 27 | Shared LLM backend sees every house's prompt | low | **documented** in `agents/llm.rs` |
| 28 | Court rollback depth is effectively 1; no coherence marker; `snapshot_depth` unused in anger | policy | **open**: decide veto-vs-rollback semantics (lane 4 report, `docs/workflow/lane-stage4-court.md`) |
| 29 | Court double-counts seizures undone by rollback in `total_slashed` | low | **partly**: snapshots now carry and restore `total_settled`/`total_slashed`; event stream still shows both |
| 30 | Stage 3 LOD tension: camera at City packs the houses the clearinghouse needs | policy | **open** (lane 3 report) |
| 31 | Receiver never verifies in DvP; `AwaitingCounterparty` never produced | policy | **open** (lane 2 report) |
| 32 | Stage 5: settlement writes no ledger line to Oak Tables, so country roots are static | policy | **open** (lane 5 report; the Chancellor seat compensates) |
| 33 | `serve`: `POST /authorize/<unheld>` answers ok | low | **enabled**: `Engine::authorize` now returns bool; wire the 404 in `src/bin/serve.rs` |
