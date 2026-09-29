export const meta = {
  name: 'refresh-presentation',
  description: 'Apply the HANDOFF §6 copy corrections, re-record the trace on the fresh wasm, rebuild index.html, verify by three lenses, repair',
  phases: [
    { title: 'Edit and build', detail: 'copy corrections, trace, build, screenshot' },
    { title: 'Verify', detail: 'copy accuracy, build integrity, layout' },
    { title: 'Repair', detail: 'address confirmed findings and rebuild' },
  ],
}

const REPORT = {
  type: 'object',
  properties: {
    built: { type: 'boolean' },
    trace_stats: { type: 'string', description: 'the console lines printed by record_trace.mjs' },
    build_stats: { type: 'string', description: 'the line printed by build.py' },
    edits: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, item: { type: 'string' }, before: { type: 'string' }, after: { type: 'string' } }, required: ['file', 'item', 'before', 'after'] } },
    console_errors: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['built', 'trace_stats', 'build_stats', 'edits', 'console_errors', 'notes'],
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

const SHOT = '/tmp/claude-0/-home-user-agentic-economy/cb18da94-1b1d-5696-9695-4826407a9893/scratchpad/shot.mjs'
const SHOTS = '/tmp/claude-0/-home-user-agentic-economy/cb18da94-1b1d-5696-9695-4826407a9893/scratchpad/shots'

const EDIT_PROMPT = `You are refreshing the built presentation page in /home/user/agentic-economy/presentation (a Director-declared laboratory; never write outside /home/user/agentic-economy; do not run git commit).

Read first: /home/user/agentic-economy/engine/docs/HANDOFF.md §4 (decisions) and §6 (the presentation), engine/docs/TECH-STACK-DECISION.md, engine/docs/AUDIT-LEDGER.md rows 23–25, and engine/docs/workflow/facts.md (the provenance sheet: cite the JSON numbers, not the report tables). Then read presentation/index.template.html, part2.template.html, part3.template.html, build.py, record_trace.mjs in full.

TASK A — copy corrections, every one of the six items in HANDOFF §6, in the page's existing voice (plain, concrete, no hype; the page already avoids em-dashes and marketing tone; keep that):
1. "Truth, though, keeps decaying while you decide" (index.template.html ~line 410): rewrite so the decay while waiting is attributed to doc 02's rule (game_design_docs/02_ENTITY_STATE_MACHINE.md §2), and say plainly that the kernel's benchmark 3 held Φ constant while the door was closed; the engine keeps the rule and says where it comes from.
2. Gates section (part2.template.html ~line 119): "Zoom out from a house and its Door becomes the street's Letter Slot" → add "for envelopes the person has not yet been asked about" and one sentence that an envelope already presented to the person stays at the Door whatever the camera does (asked_human).
3. Benchmark 1 caption and the provenance box (find them: grep "19.99" and "provenance" in the templates): add the correction that in the original Python kernel the 19.99% coordination tax was added to a ledger but never deducted from the runway, so that market halted because of cache misses; the engine keeps doc 04's 1.25/1.40 multipliers as a design rule; the two observed percentages justify that a tax exists, not the multipliers.
4. The console's camera control (part3.template.html, the #camera buttons and the log line written when the camera changes): keep the control; make the log line say that the camera changes which gate verifies NEW envelopes and that an envelope already at the Door stays there. Read the JS around lines 470–560 to find where the log line is written and where a held envelope is displayed; do not break the console.
5. Send fee 25 → 10 anywhere the copy states it (grep "25" carefully; only the send fee, not other numbers), and where the page describes the house run on 800 cr / 15 tasks, make sure the numbers match the FRESH trace you record in TASK B (record_trace.mjs prints "house final: X/15 sent, ..." and the cost-visible/hidden line). If the page hard-codes results of the engine's house run, update them to the fresh trace's numbers; if a number is the Python benchmark's (5/15, 800.0 cr, 159.9 cr) leave it, it is historical and labelled as such.
6. part3.template.html STACK object (~line 329): replace its backend and frontend layer texts with the decision in TECH-STACK-DECISION.md: backend Rust 1.85+ with Tokio for the Draft fan-out, one crate two hosts, next steps (journal, persistent map, canonical bytes, VaultBackend); frontend TypeScript + Three.js on WebGL2 with WebGPU behind a flag, instanced hex tiles fed by a per-node truth buffer, one altitude scalar driving the camera from room cutaway to orbital, EngineSource with wasm-in-worker / SSE / recorded trace, fog = 1 − Φ in a noise shader, LOD animated only on Packed/Unpacked. Keep the same [label, sentence] pair shape the renderer expects (see line ~593). Also state, in the stack section's lede or a short provenance line, that the judges of the panel never ran (usage limit) so the scoring is one reader's, as TECH-STACK-DECISION.md says.

TASK B — build:
- Edit build.py so it reads the wasm from ../engine/dist/context_engine.wasm if that exists, else the old target path. (engine/target is no longer tracked in git.)
- cd presentation && node record_trace.mjs ../engine/dist/context_engine.wasm trace.json && python3 build.py
- Screenshot: node ${SHOT} /home/user/agentic-economy/presentation/index.html ${SHOTS}/pres-desktop.png 1400 900 4000 1  and  node ${SHOT} /home/user/agentic-economy/presentation/index.html ${SHOTS}/pres-phone.png 390 844 4000 1 . The script prints console warnings/errors; report any error or pageerror verbatim. Then Read both PNGs and look at them (you can view images with the Read tool): confirm the page rendered, the charts drew, the live console section shows the engine badge (live wasm or recorded run) and no layout is broken at phone width.
Return the structured report with every edit (before/after excerpts), the trace stats, the build line and any console errors.`

phase('Edit and build')
let report = await agent(EDIT_PROMPT, { label: 'edit+build', phase: 'Edit and build', schema: REPORT })
log(`edit+build: built=${report && report.built}; ${report && report.trace_stats}`)

const LENSES = [
  { key: 'copy', prompt: `Lens: COPY ACCURACY. Read HANDOFF.md §4 and §6, AUDIT-LEDGER.md rows 23–25, TECH-STACK-DECISION.md and workflow/facts.md, then read presentation/index.template.html, part2.template.html and part3.template.html in full. Refute the claim "all six §6 items are applied, and every factual sentence on the page is consistent with the handoff decisions and facts.md": in particular the coordination-tax correction (never deducted from the runway; cache misses; multipliers are a design rule), the Φ-decay attribution (doc 02 rule; kernel held Φ constant), asked_human at the Door, send fee 10, the stack decision incl. the judges-never-ran caveat, and any hard-coded engine-run numbers vs the fresh trace stats in the fixer's report. Also flag any sentence that now contradicts another sentence elsewhere on the page. Quote file:line for every finding.` },
  { key: 'build', prompt: `Lens: BUILD INTEGRITY. In /home/user/agentic-economy/presentation: (1) confirm index.html was built from ../engine/dist/context_engine.wasm (compare: python3 -c to base64-encode the wasm and check the first 64 chars appear in index.html) and from the current trace.json (check the trace's "version" string appears in index.html and the trace's house frame count matches what record_trace printed); (2) run node record_trace.mjs ../engine/dist/context_engine.wasm /tmp/claude-0/-home-user-agentic-economy/cb18da94-1b1d-5696-9695-4826407a9893/scratchpad/trace-check.json and confirm it is byte-identical to trace.json (determinism) via cmp; (3) run node ${SHOT} /home/user/agentic-economy/presentation/index.html ${SHOTS}/pres-verify.png 1400 900 6000 0 and report any console error/pageerror; then Read that PNG and confirm the live console (the section with the engine badge) shows a running engine or a recorded run, not an error; (4) check that build.py's __LOC__/__TESTS__/__WASM_KB__ substitutions produced sensible numbers in index.html (grep for "lines of Rust" or the colophon). Quote evidence for every finding.` },
  { key: 'layout', prompt: `Lens: LAYOUT AND VOICE. Take screenshots: node ${SHOT} /home/user/agentic-economy/presentation/index.html ${SHOTS}/pres-l-desktop.png 1400 900 4000 1 ; node ${SHOT} /home/user/agentic-economy/presentation/index.html ${SHOTS}/pres-l-phone.png 390 844 4000 1 ; node ${SHOT} /home/user/agentic-economy/presentation/index.html ${SHOTS}/pres-l-tablet.png 820 1100 4000 1 . Read each PNG (the Read tool shows images). Refute: "no horizontal overflow at 390px, no overlapping text, every chart and the tick diagram legible, the stack section renders both cards with the new layers, the console section is not broken". Then read the three templates and refute "the new copy keeps the page's voice: plain sentences, no marketing tone, no em-dashes introduced, no orphaned references to removed numbers (e.g. a caption that still says 25 cr or that the market paid the tax)". Quote file:line or name the screenshot region for every finding.` },
]

let round = 0
while (round < 3) {
  round++
  phase('Verify')
  const results = await parallel(LENSES.map(l => () => agent(l.prompt + `\n\nThe editor's report: ${JSON.stringify(report)}\n\nReturn findings as structured output; an empty array means the page survives your lens.`, { label: `verify:${l.key}:r${round}`, phase: 'Verify', schema: FINDINGS })))
  const findings = results.filter(Boolean).flatMap(r => r.findings).filter(f => f.severity !== 'nit')
  log(`verify round ${round}: ${findings.length} non-nit findings`)
  if (findings.length === 0) break
  phase('Repair')
  report = await agent(`You are repairing the presentation in /home/user/agentic-economy/presentation after review. The editor's report: ${JSON.stringify(report)}.\n\nReviewers found (with evidence):\n${JSON.stringify(findings, null, 2)}\n\nFor each finding: verify against the files, fix if real (keep the page's plain voice; keep HANDOFF §6's six items), or explain in notes why not. Then rebuild: node record_trace.mjs ../engine/dist/context_engine.wasm trace.json && python3 build.py, and screenshot with node ${SHOT} /home/user/agentic-economy/presentation/index.html ${SHOTS}/pres-repair.png 1400 900 4000 1 and look at it. Do not run git commit. Return the same structured report (edits = the repairs you made).`, { label: `repair:r${round}`, phase: 'Repair', schema: REPORT })
}
return { report, rounds: round }