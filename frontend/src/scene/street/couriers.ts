// Couriers (DESIGN §6): the peg-cat pulling a 0.6 m hand-cart with the envelope on it. PROPOSED hire_service sends
// one from the sender's Letter Slot to the stone midway between the two houses' stones in 900 ms. SETTLED plays
// four beats there in 800 ms: lock (both slots --cyan, 150), swap (the quads cross, 250), verify (a --cyan ring
// 0.8 m wide, 200), settle (a gold-leaf seal on the stone, both rims tick --sage, the amount as a label, 200).
// A hash-mismatch REJECTED snaps the courier back in 300 ms under 500 ms of static on both plates;
// DROPPED_BY_COURIER stops the cart at the kerb and the envelope dissolves in 500 ms.

import * as THREE from 'three';
import { PegCat } from '../room/actors/PegCat.ts';

export const CARRY = 0.9, BEATS = 0.8, SNAP = 0.3, STATIC = 0.5, DISSOLVE = 0.5;
/** The four beats' boundaries within BEATS seconds. */
export const BEAT_EDGES = { lock: 0.15, swap: 0.4, verify: 0.6, settle: 0.8 } as const;

export type Outcome =
  | { kind: 'settled'; t0: number; amount: number }
  | { kind: 'snapback'; t0: number }
  | { kind: 'dropped'; t0: number };

export interface Run {
  envelope: number;
  from: number;
  to: number | null;
  start: THREE.Vector3;   // the sender's slot, world
  meet: THREE.Vector3;    // the meeting stone, world
  t0: number;             // PROPOSED clip start
  outcome: Outcome | null;
}

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Where a run's beats start: after the walk, or when the outcome arrived, whichever is later. */
export function beatsStart(r: Run): number { return Math.max(r.t0 + CARRY, r.outcome?.t0 ?? Infinity); }

/** The courier's state at time t (pure; street.test drives it). */
export function courierAt(r: Run, t: number): { pos: THREE.Vector3; visible: boolean; walking: boolean; envelope: number; beat: 'walk' | 'wait' | 'lock' | 'swap' | 'verify' | 'settle' | 'done' | 'snap' | 'drop'; k: number } {
  const walkK = clamp01((t - r.t0) / CARRY);
  const pos = r.start.clone().lerp(r.meet, ease(walkK));
  const o = r.outcome;
  if (o?.kind === 'snapback' && t >= Math.max(o.t0, r.t0)) {
    const s0 = Math.max(o.t0, r.t0);
    const k = clamp01((t - s0) / SNAP);
    const from = r.start.clone().lerp(r.meet, ease(clamp01((s0 - r.t0) / CARRY)));
    return { pos: from.lerp(r.start, k), visible: k < 1, walking: false, envelope: 1, beat: k < 1 ? 'snap' : 'done', k };
  }
  if (o?.kind === 'dropped' && t >= o.t0) {
    const k = clamp01((t - o.t0) / DISSOLVE);
    return { pos, visible: k < 1, walking: false, envelope: 1 - k, beat: k < 1 ? 'drop' : 'done', k };
  }
  if (walkK < 1) return { pos, visible: t >= r.t0, walking: true, envelope: 1, beat: 'walk', k: walkK };
  if (!o || o.kind !== 'settled' || t < beatsStart(r)) return { pos, visible: true, walking: false, envelope: 1, beat: 'wait', k: 0 };
  const bt = t - beatsStart(r);
  const beat = bt < BEAT_EDGES.lock ? 'lock' : bt < BEAT_EDGES.swap ? 'swap' : bt < BEAT_EDGES.verify ? 'verify' : bt < BEAT_EDGES.settle ? 'settle' : 'done';
  return { pos, visible: beat !== 'done', walking: false, envelope: 1, beat, k: bt / BEATS };
}

/** One pooled courier: the cat, its cart, the envelope quad, the value quad that swaps with it, the verify ring and the seal. */
export class Courier {
  readonly group = new THREE.Group();
  readonly cat = new PegCat('#3e3b38');
  readonly envelope: THREE.Mesh;
  readonly value: THREE.Mesh;
  readonly ring: THREE.Mesh;
  readonly seal: THREE.Mesh;
  run: Run | null = null;

  constructor() {
    const cart = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.4), new THREE.MeshLambertMaterial({ color: '#5a422f', flatShading: true }));
    cart.position.set(0, 0.25, -0.55);
    const wheel = new THREE.MeshLambertMaterial({ color: '#3e2d1f' });
    for (const x of [-0.26, 0.26]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 8).rotateZ(Math.PI / 2), wheel);
      w.position.set(x, 0.12, -0.55);
      this.group.add(w);
    }
    this.envelope = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.16), new THREE.MeshLambertMaterial({ color: '#f0e6d2', emissive: '#f0e6d2', emissiveIntensity: 0.3, transparent: true }));
    this.envelope.position.set(0, 0.36, -0.55);
    this.value = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.2), new THREE.MeshLambertMaterial({ color: '#d4a755', emissive: '#d4a755', emissiveIntensity: 0.3 }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.4, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#2aa5b8', transparent: true, opacity: 0, depthWrite: false }));
    this.seal = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.03, 16), new THREE.MeshLambertMaterial({ color: '#d4a755', emissive: '#d4a755', emissiveIntensity: 0.5, transparent: true, opacity: 0 }));
    this.group.add(this.cat, cart, this.envelope);
    this.group.visible = false;
  }
}

/** The static ripple on a Letter Slot plate: grain at 40 % between --gold-2 and --ink-3. */
export function staticAt(seed: number, t: number): number { const x = Math.sin(seed * 12.9898 + Math.floor(t * 30) * 78.233) * 43758.5453; return (x - Math.floor(x)) * 0.4; }
