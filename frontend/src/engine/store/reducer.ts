// reduce(frame): the one O(nodes) pass per tick (ARCHITECTURE §4 step 3), in
// this order: (a) slots + index; (b) layout rehash; (c) burnRef; (d) packTruth
// (sse/trace; wasm frames arrive packed) and the variance texels; (e) per
// event, in engine order: clip, uTimes writes (STATE_SYNC → syncT + cascade,
// PACKED/UNPACKED → packT, HALTED → haltT), pulses, the feed line; (f) the
// Door queue from state.held; the Notes; (g) ui.apply(frame). Nothing here
// runs from the render loop (reducer.test.ts).

import { HOUSE_R } from '../layout/layoutBulbs.ts';
import type { Frame } from '../source/EngineSource.ts';
import type { SceneEvent } from './bus.ts';
import { feedLine, PULSE_EVENTS, PulseRing, type ClipContext } from './clips.ts';
import { packTruth, toHalfFloat, TRUTH_CHANNELS } from './slots.ts';
import { NOOP_UI, Store, TIMES_HALT, TIMES_PACK, TIMES_SYNC, TIMES_VARIANCE, type UiLayer } from './Store.ts';

/** Seconds of cascade per hex ring on STATE_SYNC (the room adds its own per-fixture delays). */
export const CASCADE_PER_RING = 0.04;

/**
 * Reduce one committed frame into the store. Returns the SceneEvents (with
 * clips) in engine order for App to emit on the bus and hand to the bands.
 * `store.commit(frame)` must have run first (see acceptFrame).
 */
export function reduce(frame: Frame, store: Store, ui: UiLayer = NOOP_UI): SceneEvent[] {
  const { state, arrivedAt } = frame;
  const nodes = state.nodes;
  const seeked = frame.seeked === true;

  // (a) slots + the id / children index
  if (frame.packed) store.slots.adopt(frame.packed.slots); else store.slots.ensure(nodes);
  store.index(nodes);

  // (b) layout: only when the (id, parent) set changed
  if (store.layout.update(nodes)) store.bus.emit('layout', store.layout.current);
  const layout = store.layout.current;

  // (c) burnRef: p90 of burned_this_tick over the last 8 ticks
  store.burnRef = frame.packed ? frame.packed.burnRef : store.burns.push(nodes);

  // (d) truth: wasm frames arrive packed; sse/trace pack here
  if (frame.packed) store.truth = frame.packed.truth; else packTruth(nodes, store.slots, store.truth, store.burnRef);
  for (const n of nodes) {
    if (n.packed) {
      store.writeTime(n.id, TIMES_VARIANCE, n.packed.epistemic_variance);
      for (const c of store.childrenOf(n.id)) store.writeTime(c, TIMES_VARIANCE, n.packed.epistemic_variance);
    }
  }

  // (e) events, in engine order
  // Pulses travel 40 ms per house diameter (the §7 'per hex' now reads 'per bulb').
  const rings = layout.radius / (2 * HOUSE_R);
  const ctx: ClipContext = { tickSeconds: store.tickSeconds, radius: rings };
  const out: SceneEvent[] = [];
  for (const ev of frame.events) {
    const clip = seeked ? null : store.clips.schedule(ev, arrivedAt, ctx);
    if (!seeked) {
      switch (ev.type) {
        case 'STATE_SYNC': {
          store.writeTime(ev.node, TIMES_SYNC, arrivedAt);
          // the prev texel keeps the pre-sync Φ until the sweep is over
          const s = store.slots.peek(ev.node);
          if (s >= 0) store.truthPrev[s * TRUTH_CHANNELS] = toHalfFloat(ev.confidence_before);
          // The cascade is written, not computed (§6.5): 40 ms per generation down the bulbs.
          for (const d of store.descendantsOf(ev.node)) store.writeTime(d.id, TIMES_SYNC, arrivedAt + CASCADE_PER_RING * d.depth);
          break;
        }
        case 'PACKED': case 'UNPACKED': {
          store.writeTime(ev.parent, TIMES_PACK, arrivedAt);
          for (const c of store.childrenOf(ev.parent)) store.writeTime(c, TIMES_PACK, arrivedAt);
          break;
        }
        case 'HALTED': store.writeTime(ev.node, TIMES_HALT, arrivedAt); break;
        case 'APPROVED': case 'REJECTED': store.clips.endHold(ev.envelope, arrivedAt); break;
        default: break;
      }
      if (PULSE_EVENTS.has(ev.type)) {
        const at = ev.type === 'SLASHED' ? layout.plates.get(ev.node) : undefined;
        const origin = at ? { x: at.cx, z: at.cz } : { x: 0, z: 0 };
        const pulse = PulseRing.fromEvent(ev, arrivedAt, origin, { radius: rings, tickCount: 8 });
        if (pulse) store.pulses.push(pulse);
      }
    }
    const envelope = 'envelope' in ev ? ev.envelope : undefined;
    store.pushFeed({ tick: ev.tick, type: ev.type, text: feedLine(ev, store.nameOf), envelope });
    out.push({ ev, tick: frame.tick, arrivedAt, clip: clip && clip.kind !== 'none' ? clip : null, seeked });
  }

  // (f) the Door queue: open once per envelope, close when absent
  const seen = new Set<number>();
  for (const h of state.held) {
    if (h.reason !== 'awaiting_human_signature') continue; // finality never opens the Door
    seen.add(h.envelope);
    const entry = store.door.get(h.envelope);
    if (entry) { entry.held = h; continue; }
    const n = store.node(h.node);
    store.door.set(h.envelope, {
      envelope: h.envelope, node: h.node, held: h, openedTick: state.tick,
      openedCompute: n?.compute ?? 0, openedPhi: n?.confidence ?? 0, sent: null,
    });
  }
  for (const [envelope] of store.door) {
    if (!seen.has(envelope)) { store.door.delete(envelope); store.clips.endHold(envelope, arrivedAt); }
  }

  // the Notes: shown while node.note !== null
  for (const n of nodes) if (n.note) store.notes.set(n.id, n.note);
  for (const [id] of store.notes) {
    if (!store.node(id)?.note) { store.notes.delete(id); store.clips.endNote(id, arrivedAt); }
  }

  // a default focus: the first House (ascending id), else the root
  if (store.focus === null || !store.node(store.focus)) {
    store.focus = nodes.find((n) => n.stage === 'House')?.id ?? layout.root ?? nodes[0]?.id ?? null;
  }

  store.clips.prune(arrivedAt);

  // (g) the DOM patch, then the GPU upload
  ui.apply(frame, store);
  if (store.truthSink) {
    store.truthSink.upload(store.truth, store.truthPrev);
    if (store.timesTouched.size) store.truthSink.uploadTimes(store.times, store.timesTouched);
  }
  store.timesTouched.clear();
  store.notify();
  return out;
}

/**
 * App.accept(frame) in one call: commit, reduce, then the bus emits 'frame'
 * and one 'event' per EngineEvent (ARCHITECTURE §4 steps 2–4). Bands are
 * driven by App after this returns.
 */
export function acceptFrame(frame: Frame, store: Store, ui: UiLayer = NOOP_UI): SceneEvent[] {
  if (store.pendingDecisions.length && frame.decisions.length === 0) {
    frame.decisions = store.pendingDecisions.splice(0);
  }
  store.commit(frame);
  const events = reduce(frame, store, ui);
  store.bus.emit('frame', frame);
  for (const se of events) store.bus.emit('event', se);
  return events;
}
