// NodeId → slot, first-seen, never freed within a session (ARCHITECTURE §6.2),
// and the pure truth packer shared by the wasm worker and the reducer. No
// import of three here: the worker must stay small, so toHalfFloat is a port
// of THREE.DataUtils.toHalfFloat.

import { normaliseBurn, type NodeId, type NodeStatus, type NodeView } from '../contract/state.ts';

export const TRUTH_SIZE = 256; // texture side: 65,536 slots (5,000 needed)
export const TRUTH_SLOTS = TRUTH_SIZE * TRUTH_SIZE;
export const TRUTH_CHANNELS = 4;
export const TRUTH_LENGTH = TRUTH_SLOTS * TRUTH_CHANNELS;

export const STATUS_CODE: Record<NodeStatus, 0 | 1 | 2 | 3 | 4> = { active: 0, waiting_at_door: 1, halted: 2, packed: 3, partitioned: 4 };
export const HELD_FLAG = 8; // status code + 8·(held > 0)

export class SlotTable {
  private readonly map = new Map<NodeId, number>();
  private ids: number[] = [];

  get size(): number { return this.ids.length; }

  /** The slot for an id, allocating the next free one the first time the id is seen. */
  slotOf(id: NodeId): number {
    let s = this.map.get(id);
    if (s === undefined) {
      s = this.ids.length;
      if (s >= TRUTH_SLOTS) throw new RangeError(`slot table full at ${TRUTH_SLOTS} nodes`);
      this.map.set(id, s);
      this.ids.push(id);
    }
    return s;
  }

  /** Known slot or -1; never allocates. */
  peek(id: NodeId): number { return this.map.get(id) ?? -1; }
  idAt(slot: number): NodeId | undefined { return this.ids[slot]; }

  /** Allocate for every node (ascending id order as they arrive). Returns the number of new slots. */
  ensure(nodes: readonly Pick<NodeView, 'id'>[]): number {
    const before = this.ids.length;
    for (const n of nodes) this.slotOf(n.id);
    return this.ids.length - before;
  }

  /** NodeId per slot as a transferable Float64Array (ids < 2^52 are exact). */
  toArray(): Float64Array { return Float64Array.from(this.ids); }

  /** Adopt a worker's table (wasm frames arrive packed against the worker's slots). Existing assignments must agree. */
  adopt(slots: Float64Array): void {
    for (let s = 0; s < slots.length; s++) {
      const id = slots[s];
      const have = this.map.get(id);
      if (have === undefined) {
        if (s !== this.ids.length) throw new Error(`slot table divergence: slot ${s} for id ${id}, have ${this.ids.length} slots`);
        this.map.set(id, s); this.ids.push(id);
      } else if (have !== s) {
        throw new Error(`slot table divergence: id ${id} is slot ${have} here and ${s} in the worker`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// fp16

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

// Fast Half Float Conversions, http://www.fox-toolkit.org/ftp/fasthalffloatconversion.pdf
// (the same tables three/src/extras/DataUtils.js builds, so the worker and the
// GPU-side DataTexture agree bit for bit)
const baseTable = new Uint32Array(512);
const shiftTable = new Uint32Array(512);
for (let i = 0; i < 256; ++i) {
  const e = i - 127;
  if (e < -27) { // very small number (0, -0)
    baseTable[i] = 0x0000; baseTable[i | 0x100] = 0x8000; shiftTable[i] = 24; shiftTable[i | 0x100] = 24;
  } else if (e < -14) { // small number (denorm)
    baseTable[i] = 0x0400 >> (-e - 14); baseTable[i | 0x100] = (0x0400 >> (-e - 14)) | 0x8000; shiftTable[i] = -e - 1; shiftTable[i | 0x100] = -e - 1;
  } else if (e <= 15) { // normal number
    baseTable[i] = (e + 15) << 10; baseTable[i | 0x100] = ((e + 15) << 10) | 0x8000; shiftTable[i] = 13; shiftTable[i | 0x100] = 13;
  } else if (e < 128) { // large number (Infinity, -Infinity)
    baseTable[i] = 0x7c00; baseTable[i | 0x100] = 0xfc00; shiftTable[i] = 24; shiftTable[i | 0x100] = 24;
  } else { // stay (NaN, Infinity, -Infinity)
    baseTable[i] = 0x7c00; baseTable[i | 0x100] = 0xfc00; shiftTable[i] = 13; shiftTable[i | 0x100] = 13;
  }
}

/** Port of THREE.DataUtils.toHalfFloat (table-based, truncating), clamped to ±65504. */
export function toHalfFloat(val: number): number {
  if (Math.abs(val) > 65504) val = val > 0 ? 65504 : -65504;
  f32[0] = val;
  const f = u32[0];
  const e = (f >> 23) & 0x1ff;
  return baseTable[e] + ((f & 0x007fffff) >> shiftTable[e]);
}

export function fromHalfFloat(h: number): number {
  const sign = (h & 0x8000) ? -1 : 1;
  const exp = (h >>> 10) & 0x1f;
  const mant = h & 0x3ff;
  if (exp === 0) return sign * mant * 2 ** -24;
  if (exp === 0x1f) return mant ? NaN : sign * Infinity;
  return sign * (1 + mant / 1024) * 2 ** (exp - 15);
}

// ---------------------------------------------------------------------------
// burnRef: the 90th percentile of positive burned_this_tick over the last 8 ticks

export const BURN_WINDOW_TICKS = 8;

export class BurnWindow {
  private readonly ticks: number[][] = [];
  /** Push one tick's burns (only positive values are kept). Returns the new reference. */
  push(nodes: readonly Pick<NodeView, 'burned_this_tick'>[]): number {
    const burns: number[] = [];
    for (const n of nodes) { const b = normaliseBurn(n.burned_this_tick); if (b > 0) burns.push(b); }
    this.ticks.push(burns);
    if (this.ticks.length > BURN_WINDOW_TICKS) this.ticks.shift();
    return this.ref;
  }
  /** p90 of the window; 1 when nothing burned (heat then reads 0 for every node). */
  get ref(): number {
    const all: number[] = [];
    for (const t of this.ticks) for (const b of t) all.push(b);
    if (all.length === 0) return 1;
    all.sort((a, b) => a - b);
    const i = Math.min(all.length - 1, Math.floor(0.9 * (all.length - 1) + 0.5));
    return all[i] || 1;
  }
}

// ---------------------------------------------------------------------------
// packTruth

export const truthChannels = (phi: number, purse: number, heat: number, code: number) => ({ phi, purse, heat, code });

/**
 * Pure: writes RGBA16F per slot: R phi = confidence, G purse = compute /
 * compute_allocated (0 when allocated is 0), B heat = burned_this_tick /
 * burnRef, A status code + 8·(held > 0). Packed children are written from
 * their parent's profile: phi = mean_confidence, purse = parent's, status 3.
 * Returns the number of slots written. Slots not in `nodes` keep their bytes.
 */
export function packTruth(nodes: readonly NodeView[], slots: SlotTable, out: Uint16Array, burnRef: number): number {
  const ref = burnRef > 0 ? burnRef : 1;
  // parents with a packed profile (few): id → profile
  let packedParents: Map<NodeId, NodeView> | null = null;
  for (const n of nodes) if (n.packed) { (packedParents ??= new Map()).set(n.id, n); }

  let written = 0;
  for (const n of nodes) {
    const s = slots.slotOf(n.id) * TRUTH_CHANNELS;
    const parent = n.parent !== null && packedParents ? packedParents.get(n.parent) : undefined;
    let phi: number, purse: number, heat: number, code: number;
    if (parent && parent.packed) {
      phi = parent.packed.mean_confidence;
      purse = purseOf(parent);
      heat = 0;
      code = STATUS_CODE.packed;
    } else {
      phi = n.confidence;
      purse = purseOf(n);
      heat = clamp01(normaliseBurn(n.burned_this_tick) / ref);
      code = STATUS_CODE[n.status] ?? 0;
    }
    if (n.held > 0) code += HELD_FLAG;
    out[s] = toHalfFloat(phi);
    out[s + 1] = toHalfFloat(purse);
    out[s + 2] = toHalfFloat(heat);
    out[s + 3] = toHalfFloat(code);
    written++;
  }
  return written;
}

export const purseOf = (n: Pick<NodeView, 'compute' | 'compute_allocated'>): number =>
  n.compute_allocated > 0 ? clamp01(n.compute / n.compute_allocated) : 0;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x || 0);

/** Read one slot back (tests, the ?stats overlay). */
export function readTruth(out: Uint16Array, slot: number): { phi: number; purse: number; heat: number; status: number; held: boolean } {
  const s = slot * TRUTH_CHANNELS;
  const code = Math.round(fromHalfFloat(out[s + 3]));
  return { phi: fromHalfFloat(out[s]), purse: fromHalfFloat(out[s + 1]), heat: fromHalfFloat(out[s + 2]), status: code & 7, held: code >= HELD_FLAG };
}
