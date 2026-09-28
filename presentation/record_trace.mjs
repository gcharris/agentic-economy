// Records deterministic runs of the real engine (the wasm build) so the page
// can replay them wherever a viewer's policy blocks WebAssembly.
// usage: node record_trace.mjs ../engine/target/wasm32-unknown-unknown/wasm/context_engine.wasm trace.json
import fs from 'node:fs';
const [,, wasmPath, outPath] = process.argv;
const bytes = fs.readFileSync(wasmPath);
const mod = new WebAssembly.Module(bytes);

function fresh() {
  const inst = new WebAssembly.Instance(mod, {});
  const x = inst.exports;
  const read = (len) => new TextDecoder().decode(new Uint8Array(x.memory.buffer, x.engine_out_ptr(), len));
  return {
    x,
    version: () => read(x.engine_version()),
    state: () => JSON.parse(read(x.engine_state())),
    events: () => JSON.parse(read(x.engine_events())),
  };
}

function slim(state) {
  // keep the fields the page renders; drop long receipt arrays
  return { ...state, nodes: state.nodes.map(n => ({ ...n, receipts: n.receipts.slice(0, 3) })) };
}

// Run 1: the house, 800 cr, 15 tasks, cost visible, the person says yes after 3 ticks at the door.
function houseRun({ seed = 7n, budget = 800, tasks = 15, costVisible = 1, holdTicks = 3, ticks = 70 } = {}) {
  const e = fresh();
  e.x.engine_new(1, seed, budget, tasks, costVisible);
  const frames = [];
  const heldSince = new Map();
  const decisions = [];
  for (let i = 0; i < ticks; i++) {
    const t = Number(e.x.engine_tick());
    const state = e.state();
    const events = e.events();
    frames.push({ tick: t, state: slim(state), events, decisions: decisions.splice(0) });
    for (const h of state.held) {
      if (!heldSince.has(h.envelope)) heldSince.set(h.envelope, t);
      if (t - heldSince.get(h.envelope) >= holdTicks) {
        e.x.engine_authorize(BigInt(h.envelope));
        decisions.push({ tick: t, envelope: h.envelope, decision: 'approve', description: h.description });
      }
    }
    const house = state.nodes.find(n => n.stage === 'House');
    if (house && house.status === 'halted') break;
    if (house && house.tasks_done === house.tasks_total) break;
  }
  return frames;
}

// Run 2: the street, six houses, letter slot; truth changes half way so stale prices revert.
function streetRun({ seed = 7n, budget = 1600, tasks = 40, ticks = 30 } = {}) {
  const e = fresh();
  e.x.engine_new(2, seed, budget, tasks, 1);
  const frames = [];
  for (let i = 0; i < ticks; i++) {
    const decisions = [];
    if (i === 6) { e.x.engine_set_truth_price(12); decisions.push({ tick: i + 1, decision: 'truth_changed', description: 'the courier now costs 12; every table still says 10' }); }
    const t = Number(e.x.engine_tick());
    frames.push({ tick: t, state: slim(e.state()), events: e.events(), decisions });
  }
  return frames;
}

const trace = {
  version: fresh().version(),
  house: houseRun(),
  house_hidden_cost: houseRun({ costVisible: 0, budget: 300, tasks: 10, holdTicks: 0, ticks: 60 }),
  house_visible_cost: houseRun({ costVisible: 1, budget: 300, tasks: 10, holdTicks: 0, ticks: 60 }),
  street: streetRun(),
};
fs.writeFileSync(outPath, JSON.stringify(trace));
const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
console.log(`trace: house ${trace.house.length} frames, hidden ${trace.house_hidden_cost.length}, visible ${trace.house_visible_cost.length}, street ${trace.street.length}, ${kb} KB`);
const last = trace.house[trace.house.length - 1].state.nodes.find(n => n.stage === 'House');
console.log(`house final: ${last.tasks_done}/${last.tasks_total} sent, ${last.compute.toFixed(1)} cr left, Φ ${(last.confidence*100).toFixed(1)}%, status ${last.status}`);
const hv = trace.house_visible_cost.at(-1).state.nodes.find(n => n.stage === 'House');
const hh = trace.house_hidden_cost.at(-1).state.nodes.find(n => n.stage === 'House');
console.log(`cost visible: ${hv.tasks_done}/${hv.tasks_total} (${hv.status}) · hidden: ${hh.tasks_done}/${hh.tasks_total} (${hh.status})`);
