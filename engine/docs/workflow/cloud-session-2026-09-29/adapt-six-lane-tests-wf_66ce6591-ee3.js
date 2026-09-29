export const meta = {
  name: 'adapt-six-lane-tests',
  description: 'Apply the six test adaptations from HANDOFF §5, wire serve 404 (ledger #33), clippy + fmt, then adversarially verify',
  phases: [
    { title: 'Fix', detail: 'one agent applies the handoff adaptations and runs the suite' },
    { title: 'Verify', detail: 'three skeptics with distinct lenses try to refute the fix' },
    { title: 'Repair', detail: 'address confirmed findings, rerun' },
  ],
}

const REPORT = {
  type: 'object',
  properties: {
    suite_green: { type: 'boolean' },
    test_summary: { type: 'string', description: 'the cargo test result lines per test binary' },
    changes: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, what: { type: 'string' } }, required: ['file', 'what'] } },
    clippy_clean: { type: 'boolean' },
    fmt_clean: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['suite_green', 'test_summary', 'changes', 'clippy_clean', 'fmt_clean', 'notes'],
}

const FINDINGS = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      file: { type: 'string' }, line: { type: 'integer' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] },
      claim: { type: 'string' }, evidence: { type: 'string' }, proposed_fix: { type: 'string' } },
      required: ['file', 'severity', 'claim', 'evidence', 'proposed_fix'] } },
  },
  required: ['findings'],
}

const FIX_PROMPT = `You are working in the Rust crate at /home/user/agentic-economy/engine (a Director-declared laboratory; no PR ceremony; never write outside /home/user/agentic-economy).

Read /home/user/agentic-economy/engine/docs/HANDOFF.md §4 and §5 first, then engine/docs/AUDIT-LEDGER.md row 33.

TASK A — adapt exactly the six lane tests listed in HANDOFF §5. Each is a one-to-three-line change that makes the test encode the post-audit behaviour the handoff describes. Rules:
- Keep every test meaningful: it must still assert the behaviour the handoff row names (e.g. stage3 'unbacked' must still produce exactly one Slashed of 1.0 at the TRUE price; stage2 'street-wide stale price' must now assert the court does NOT roll back, no injunctions, truth unchanged). Never delete a test, never #[ignore] one, never loosen an assertion beyond what the row says. If a row's suggested change does not make the test pass, read the engine source (src/tick.rs, src/boundary.rs, src/envelope.rs, src/epistemics.rs, src/tax.rs, src/graph.rs) to find the precise post-audit value and assert that, and explain in notes.
- Update the test's doc comment / inline comment so it says why the value is what it is (send fee 10 cr; tax_paid inside locked_compute; oracle trigger generation+2 >= MAX_UNCALIBRATED_HANDOVERS; the court no longer counts hash-mismatch reverts; the Clearinghouse price-checks; the court reason text).

TASK B — ledger #33: in src/bin/serve.rs, POST /authorize/<id> and POST /reject/<id> must answer 404 (with a small JSON body like {"ok":false,"error":"no envelope held with that id"}) when Engine::authorize / Engine::reject returns false, and 200 as before when true. Keep tests/serve_smoke.rs passing; extend it with one assertion that an unheld id returns 404 if the smoke test's shape makes that straightforward (read it first; do not restructure it).

TASK C — run, in this order, and make all of them clean:
  cargo test --no-fail-fast 2>&1 | grep -E "^(test result|running|test .*FAILED|failures)"
  cargo clippy --all-targets 2>&1 | tail -30      (the handoff mentions one pre-existing note; fix it if it is trivial and local, otherwise report it verbatim)
  cargo fmt
  cargo test 2>&1 | grep -E "^test result"        (again, after fmt)
Do NOT touch engine/target in git (it is untracked now). Do NOT change engine behaviour in src/ beyond serve.rs. Do not run git commit.

Return the structured report. In test_summary paste the "test result:" lines with the binary names. In changes list every file you edited and what changed in one sentence each.`

phase('Fix')
let report = await agent(FIX_PROMPT, { label: 'fix:six-tests+serve404', phase: 'Fix', schema: REPORT })
log(`fix round 1: green=${report && report.suite_green} clippy=${report && report.clippy_clean} fmt=${report && report.fmt_clean}`)

const LENSES = [
  { key: 'intent', prompt: `Lens: INTENT. For each of the six adapted tests in HANDOFF §5, read the current test body (engine/tests/stage2_letter_slot.rs, stage3_clearinghouse.rs, stage4_high_court.rs) and refute the claim "this test still verifies the post-audit behaviour the handoff row names and was not weakened to trivially pass". Check specifically: (1) stage3 'unbacked_net_position_is_slashed_at_ten_percent' asserts exactly one Slashed event with amount 1.0 and the initiator is unbacked at the TRUE price; (2) stage2 'a_street_wide_stale_price_trips_the_high_court' now asserts the inverse (no rollback, no injunction, truth unchanged) rather than just deleting assertions; (3) stage2 'an_overdue_house_asks_the_oracle_itself' still asserts house A syncs on its own and settles next tick; (4) the locked_compute assertion equals HIRE_WEIGHT*0.25 exactly because tax_paid is inside it, and the comment says so; (5) tax_paid 2.5 = 10 cr × 0.25; (6) the court reason substring check is on the real reason string produced by src/boundary.rs / src/tick.rs (grep for it). Run cargo test for those three binaries yourself to confirm they pass. Report only findings you can evidence with a file:line and a quote.` },
  { key: 'serve', prompt: `Lens: SERVE + SCOPE. Read the git diff of engine/src/bin/serve.rs and engine/tests/serve_smoke.rs (run: cd /home/user/agentic-economy && git diff -- engine/src engine/tests). Refute: (a) POST /authorize/<unheld> and /reject/<unheld> now answer 404 with a JSON body and held ids still answer 200; (b) no other engine behaviour changed in src/ (only serve.rs may differ; any other src change is a blocking finding); (c) tests/serve_smoke.rs passes (run cargo test --test serve_smoke). Also check HTTP correctness: the 404 response has a correct Content-Length and the server keeps serving after it (read the response-writing helper). Report only evidenced findings.` },
  { key: 'hygiene', prompt: `Lens: HYGIENE. In /home/user/agentic-economy/engine run: cargo fmt --check (must be clean), cargo clippy --all-targets 2>&1 | tail -40 (report every warning verbatim with file:line), cargo test --no-fail-fast 2>&1 | grep -E "^(test result|test .*FAILED)" (every binary must be ok, and the two stage2 'ignored (by design)' tests must still be ignored, not deleted: grep for #[ignore] in engine/tests/stage2_letter_slot.rs and confirm two remain). Also confirm no file under engine/ other than src/bin/serve.rs, the three stage test files and serve_smoke.rs changed: run git status --short -- engine/src engine/tests engine/Cargo.toml engine/Cargo.lock. Report only evidenced findings.` },
]

let round = 0
while (round < 3) {
  round++
  phase('Verify')
  const results = await parallel(LENSES.map(l => () => agent(l.prompt + `\n\nContext from the fixer's own report: ${JSON.stringify(report)}\n\nReturn findings as structured output. An empty findings array means the fix survives your lens.`, { label: `verify:${l.key}:r${round}`, phase: 'Verify', schema: FINDINGS })))
  const findings = results.filter(Boolean).flatMap(r => r.findings).filter(f => f.severity !== 'nit')
  log(`verify round ${round}: ${findings.length} non-nit findings`)
  if (findings.length === 0) break
  phase('Repair')
  report = await agent(`You are repairing the work of a previous agent in /home/user/agentic-economy/engine. The previous fixer's report: ${JSON.stringify(report)}.\n\nThree reviewers found these issues (each with evidence):\n${JSON.stringify(findings, null, 2)}\n\nFor each finding: verify it against the code, fix it if real (keep the handoff §5 intent; never weaken or delete a test), or explain in notes why it is not real. Then rerun: cargo test --no-fail-fast, cargo clippy --all-targets, cargo fmt, cargo test. Do not run git commit. Return the same structured report.`, { label: `repair:r${round}`, phase: 'Repair', schema: REPORT })
}
return { report, rounds: round }