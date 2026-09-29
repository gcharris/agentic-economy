// The Store (ARCHITECTURE §4): the last Frame and its predecessor, the slot
// table, the truth and times buffers, the layout handle, focus, the Door
// queue, the Notes, the feed, the clips and the pulse ring, one bus, and
// subscribe(). Frozen on day 0: other lanes read it, only the reducer writes
// it. The ui lane plugs in through `UiLayer` (app.registerUi(ui)); the gpu
// TruthBuffer through `TruthSink`. Both default to no-ops so the engine layer
// boots and tests with zero bands and no DOM.

import type { EventType } from '../contract/events.ts';
import type { EnvelopeId, HeldView, NodeId, NodeView, Note } from '../contract/state.ts';
import { LayoutHandle } from '../layout/layoutBulbs.ts';
import type { Decision, Frame, SourceHello, SourceStatus } from '../source/EngineSource.ts';
import { TICK_SECONDS_BY_BAND } from '../source/TickClock.ts';
import { Bus } from './bus.ts';
import { ClipScheduler, PulseRing } from './clips.ts';
import { BurnWindow, SlotTable, TRUTH_CHANNELS, TRUTH_LENGTH } from './slots.ts';

/** One open Door card: opened once per envelope, closed when `held` no longer lists it. */
export interface DoorEntry {
  envelope: EnvelopeId;
  node: NodeId;
  held: HeldView; // the latest HeldView for this envelope
  openedTick: number; // state.tick of the frame that opened the card
  openedCompute: number; // node.compute when the card opened ("purse unchanged at X cr")
  openedPhi: number; // node.confidence when the card opened ("Φ a% then")
  sent: 'approve' | 'reject' | null; // a click, until the engine answers ("sent to the Door…")
}

export interface FeedLine { tick: number; type: EventType; text: string }

/** The DOM layer (ui lane). `apply` runs once per frame at the end of reduce(); never from the render loop. */
export interface UiLayer {
  apply(frame: Frame, store: Store): void;
  dispose?(): void;
}
export const NOOP_UI: UiLayer = { apply() { /* no DOM yet: the ui lane registers the real one */ } };

/** The GPU side of the truth buffer (gpu/TruthBuffer.ts). Called once per frame after packing. */
export interface TruthSink {
  upload(truth: Uint16Array, prev: Uint16Array): void;
  uploadTimes(times: Float32Array, touchedSlots: ReadonlySet<number>): void;
}

export const TIMES_SYNC = 0; // R: app-seconds of the last STATE_SYNC (or −1e9)
export const TIMES_PACK = 1; // G: of the last PACKED / UNPACKED touching the node
export const TIMES_HALT = 2; // B: of HALTED
export const TIMES_VARIANCE = 3; // A: packed.epistemic_variance (0 when not packed)
export const TIME_NEVER = -1e9;

export const FEED_CAP = 200; // the drawer shows 40; the store keeps a little history

export class Store {
  frame: Frame | null = null;
  prev: Frame | null = null;
  frameCount = 0;

  readonly slots = new SlotTable();
  truth: Uint16Array<ArrayBufferLike> = new Uint16Array(TRUTH_LENGTH);
  truthPrev: Uint16Array<ArrayBufferLike> = new Uint16Array(TRUTH_LENGTH);
  readonly times = new Float32Array(TRUTH_LENGTH);
  readonly timesTouched = new Set<number>();
  readonly burns = new BurnWindow();
  burnRef = 1;

  readonly layout = new LayoutHandle();
  readonly clips = new ClipScheduler();
  readonly pulses = new PulseRing();
  readonly bus: Bus;

  focus: NodeId | null = null;
  readonly door = new Map<EnvelopeId, DoorEntry>();
  readonly notes = new Map<NodeId, Note>();
  readonly feed: FeedLine[] = [];

  /** Seconds per tick of the current band (bands.ts); scales every clip. */
  tickSeconds: number = TICK_SECONDS_BY_BAND[1];
  hello: SourceHello | null = null;
  status: SourceStatus = { kind: 'connecting' };
  /** Commands sent since the last frame; attached as `decisions` to the next accepted frame (live sources). */
  readonly pendingDecisions: Decision[] = [];

  truthSink: TruthSink | null = null;

  private byId = new Map<NodeId, NodeView>();
  private childMap = new Map<NodeId, NodeId[]>();
  private readonly subscribers = new Set<(s: Store) => void>();

  constructor(bus: Bus = new Bus()) {
    this.bus = bus;
    this.resetTimes();
  }

  /** The previous frame becomes `prev`; the truth buffers swap by reference. */
  commit(frame: Frame): void {
    this.prev = this.frame;
    this.frame = frame;
    this.frameCount++;
    const t = this.truth; this.truth = this.truthPrev; this.truthPrev = t;
  }

  /** Rebuild the id → node and parent → children indexes: the one O(n) walk, called by the reducer. */
  index(nodes: readonly NodeView[]): void {
    this.byId = new Map();
    this.childMap = new Map();
    for (const n of nodes) {
      this.byId.set(n.id, n);
      if (n.parent !== null) {
        const list = this.childMap.get(n.parent);
        if (list) list.push(n.id); else this.childMap.set(n.parent, [n.id]);
      }
    }
  }

  node(id: NodeId): NodeView | undefined { return this.byId.get(id); }
  nameOf = (id: NodeId): string => this.byId.get(id)?.name ?? `node ${id}`;
  childrenOf(id: NodeId): readonly NodeId[] { return this.childMap.get(id) ?? []; }
  /** Every descendant with its depth (1 = child). */
  descendantsOf(id: NodeId): { id: NodeId; depth: number }[] {
    const out: { id: NodeId; depth: number }[] = [];
    const stack: { id: NodeId; depth: number }[] = this.childrenOf(id).map((c) => ({ id: c, depth: 1 }));
    while (stack.length) {
      const cur = stack.pop()!;
      out.push(cur);
      for (const c of this.childrenOf(cur.id)) stack.push({ id: c, depth: cur.depth + 1 });
    }
    return out;
  }
  get nodeCount(): number { return this.byId.size; }

  /** A per-node time write into uTimes (a few texels per event). */
  writeTime(id: NodeId, channel: 0 | 1 | 2 | 3, value: number): void {
    const s = this.slots.peek(id);
    if (s < 0) return;
    this.times[s * TRUTH_CHANNELS + channel] = value;
    this.timesTouched.add(s);
  }
  readTime(id: NodeId, channel: 0 | 1 | 2 | 3): number {
    const s = this.slots.peek(id);
    return s < 0 ? TIME_NEVER : this.times[s * TRUTH_CHANNELS + channel];
  }

  pushFeed(line: FeedLine): void {
    this.feed.push(line);
    if (this.feed.length > FEED_CAP) this.feed.splice(0, this.feed.length - FEED_CAP);
  }

  /** Called at the end of every reduce(). */
  subscribe(cb: (s: Store) => void): () => void {
    this.subscribers.add(cb);
    return () => { this.subscribers.delete(cb); };
  }
  notify(): void { for (const cb of [...this.subscribers]) cb(this); }

  /** Forget a run (switching sources); the slot table is part of the run. */
  reset(): void {
    this.frame = null; this.prev = null; this.frameCount = 0;
    this.truth = new Uint16Array(TRUTH_LENGTH); this.truthPrev = new Uint16Array(TRUTH_LENGTH);
    this.resetTimes();
    this.burnRef = 1;
    this.layout.update([]);
    this.clips.clear(); this.pulses.clear();
    this.focus = null; this.door.clear(); this.notes.clear(); this.feed.length = 0;
    this.pendingDecisions.length = 0;
    this.byId = new Map(); this.childMap = new Map();
    (this as { slots: SlotTable }).slots = new SlotTable();
    (this as { burns: BurnWindow }).burns = new BurnWindow();
  }

  private resetTimes(): void {
    for (let s = 0; s < TRUTH_LENGTH; s += TRUTH_CHANNELS) {
      this.times[s + TIMES_SYNC] = TIME_NEVER; this.times[s + TIMES_PACK] = TIME_NEVER; this.times[s + TIMES_HALT] = TIME_NEVER; this.times[s + TIMES_VARIANCE] = 0;
    }
    this.timesTouched.clear();
  }
}
