// The SceneBus (ARCHITECTURE §5): one typed emitter every band subscribes to.
// Who emits what: App emits frame, event, status, quality, lighting,
// reducedMotion, resize; the rig emits altitude, focus, zoomPending,
// zoomConfirmed; the reducer emits layout; bands emit label and sound. Bands
// never emit frame or event.

import type { Vector3 } from 'three';
import type { EngineEvent } from '../contract/events.ts';
import type { NodeId } from '../contract/state.ts';
import type { Axial } from '../layout/hex.ts';
import type { Layout } from '../layout/layoutCity.ts';
import type { Frame, SourceStatus } from '../source/EngineSource.ts';
import type { Clip } from './clips.ts';

export type Band = 1 | 2 | 3 | 4 | 5;

/** One call per EngineEvent, in engine order, after 'frame'. `clip` is null for `none` clips and seeked frames. */
export interface SceneEvent { ev: EngineEvent; tick: number; arrivedAt: number; clip: Clip | null; seeked: boolean }

/** The three quality rows and the five lighting presets are data in src/app (quality.ts, lighting.ts); their names are the seam. */
export type QualityPreset = 'low' | 'balanced' | 'high';
export type LightingPreset = 'dawn' | 'noon' | 'golden' | 'dusk' | 'night';
export interface LightingState {
  preset: LightingPreset;
  /** 0–1 blend toward the next preset (the time-of-day slider); 0 = exactly `preset`. */
  blend: number;
  /** "Cycle day/night": one preset every 64 ticks on TICK_COMMITTED, never wall time. */
  cycle: boolean;
}

export type SoundCue = 'coin' | 'coinUp' | 'write' | 'knock' | 'stamp' | 'halt' | 'sync' | 'heartbeat';

export interface BusEvents {
  frame: Frame; // after reduce()
  event: SceneEvent; // one per EngineEvent, after 'frame'
  altitude: { a: number; band: Band; pending: Band | null; w: number }; // per render frame, from the rig
  focus: { node: NodeId | null; cell: Axial | null };
  layout: Layout; // only when the (id, parent) set changed
  zoomPending: { band: Band; sentTick: number };
  zoomConfirmed: { band: Band; by: 'PACKED' | 'UNPACKED' | 'TICK_COMMITTED' };
  quality: QualityPreset;
  lighting: LightingState;
  reducedMotion: boolean;
  resize: { w: number; h: number; dpr: number };
  status: SourceStatus;
  label: { id: string; world: Vector3; text: string; kind: 'bubble' | 'plate' | 'caption'; ttl: number } | { id: string; remove: true };
  sound: { cue: SoundCue; at: number };
}

export interface SceneBus {
  on<K extends keyof BusEvents>(k: K, cb: (p: BusEvents[K]) => void): () => void; // returns unsubscribe
  emit<K extends keyof BusEvents>(k: K, p: BusEvents[K]): void;
}

type Handler = (p: unknown) => void;

/** The default SceneBus: synchronous, ordered, re-entrant safe (a handler may unsubscribe itself). */
export class Bus implements SceneBus {
  private readonly handlers = new Map<keyof BusEvents, Set<Handler>>();
  /** Count of emits per key, for tests (reducer.test: no 'frame' from the render loop). */
  readonly counts: Partial<Record<keyof BusEvents, number>> = {};

  on<K extends keyof BusEvents>(k: K, cb: (p: BusEvents[K]) => void): () => void {
    let set = this.handlers.get(k);
    if (!set) { set = new Set(); this.handlers.set(k, set); }
    const h = cb as Handler;
    set.add(h);
    return () => { set!.delete(h); };
  }

  emit<K extends keyof BusEvents>(k: K, p: BusEvents[K]): void {
    this.counts[k] = (this.counts[k] ?? 0) + 1;
    const set = this.handlers.get(k);
    if (!set || set.size === 0) return;
    for (const h of [...set]) h(p);
  }

  listenerCount(k: keyof BusEvents): number { return this.handlers.get(k)?.size ?? 0; }
  clear(): void { this.handlers.clear(); }
}

export const createBus = (): Bus => new Bus();
