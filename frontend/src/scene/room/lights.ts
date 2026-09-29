// The room's lights (DESIGN §4; the preset's key and hemisphere are the App's WorldLights): L1 the table lamp (the one shadow caster,
// always on); L2 the desk lamp and L3 the Door frame's emissive, lit while an envelope is held for a signature
// or a Note lies on the table (read from state, so a replay begun mid-hold is right; the event only starts
// the 200 ms ramp); L4 Scout's lantern, cyan, during STATE_SYNC only.

import * as THREE from 'three';
import type { QualityPreset } from '../../engine/store/bus.ts';

/** three's physically based point lights are in candela; DESIGN's 1.2 is a relative value (1.2 → 36 cd). */
const POINT_SCALE = 30;
const RAMP = 0.2;

export class RoomLights {
  readonly group = new THREE.Group();
  readonly l1: THREE.PointLight;
  readonly l2: THREE.PointLight;
  readonly l4: THREE.PointLight;
  private presence = { from: 0, to: 0, t0: -1e9 };
  private dim = { from: 1, to: 1, t0: -1e9 };

  constructor(quality: QualityPreset) {
    this.l1 = new THREE.PointLight('#f2cb7a', 1.2 * POINT_SCALE, 5.5, 2);
    this.l1.position.set(0.8, 2.3, 0.0);
    this.l1.castShadow = quality !== 'low';
    this.l1.shadow.mapSize.set(1024, 1024);
    this.l1.shadow.bias = -0.004;
    this.l2 = new THREE.PointLight('#f2cb7a', 0, 5, 2);
    this.l2.position.set(2.7, 1.12, -2.6);
    this.l4 = new THREE.PointLight('#2aa5b8', 0, 3, 2);
    this.group.add(this.l1, this.l2, this.l4);
  }

  /** From state: someone is being asked (a held envelope or a Note). */
  setPresence(on: boolean, now: number): void {
    const to = on ? 1 : 0;
    if (to === this.presence.to) return;
    this.presence = { from: this.presenceAt(now), to, t0: now };
  }

  /** HALTED dims L1 to half; a lifted Note restores it. */
  setHalted(halted: boolean, now: number): void {
    const to = halted ? 0.5 : 1;
    if (to === this.dim.to) return;
    this.dim = { from: this.dimAt(now), to, t0: now };
  }

  presenceAt(t: number): number {
    const k = Math.min(1, Math.max(0, (t - this.presence.t0) / RAMP));
    return this.presence.from + (this.presence.to - this.presence.from) * (1 - (1 - k) ** 3);
  }
  private dimAt(t: number): number {
    const k = Math.min(1, Math.max(0, (t - this.dim.t0) / 0.4));
    return this.dim.from + (this.dim.to - this.dim.from) * k;
  }

  /** Per render frame. `sync` is 0–1 while Scout's lantern is lit. Returns the presence weight for L3. */
  update(t: number, sync: number, scoutPos: THREE.Vector3 | null): number {
    const p = this.presenceAt(t);
    this.l2.intensity = 1.2 * POINT_SCALE * p;
    this.l1.intensity = 1.2 * POINT_SCALE * this.dimAt(t);
    this.l4.intensity = 0.8 * POINT_SCALE * sync;
    if (scoutPos) this.l4.position.copy(scoutPos).add(new THREE.Vector3(0, 0.5, 0));
    return p;
  }
}
