// The room's lights (DESIGN §4): the preset's key and hemisphere; L1 the table lamp (the one shadow caster,
// always on); L2 the desk lamp and L3 the Door frame's emissive, lit while an envelope is held for a signature
// or a Note lies on the table (read from state, so a replay begun mid-hold is right; the event only starts
// the 200 ms ramp); L4 Scout's lantern, cyan, during STATE_SYNC only.

import * as THREE from 'three';
import { keyDirection, LIGHTING } from '../../app/lighting.ts';
import type { LightingState, QualityPreset } from '../../engine/store/bus.ts';

/** three's physically based point lights are in candela; DESIGN's 1.2 is a relative value (1.2 → 36 cd). */
const POINT_SCALE = 30;
/** The preset's sky/ground are dark sRGB tones; as light colours they are tints, so normalise to full brightness. */
const tint = (hex: string) => { const c = new THREE.Color(hex); const m = Math.max(c.r, c.g, c.b) || 1; return c.multiplyScalar(1 / m); };
/** REVIEW-ROOM §1: key about 2.5 and hemisphere 1.5–2.0 at the Golden preset; other presets scale with DESIGN's table. */
const KEY_GAIN = 4.5 / 1.9; // measured: three's Lambert is albedo/π, so the review's 2.5 leaves the floor at 6/255 (room-light.spec.ts)
const HEMI_GAIN = 4.0 / 0.6;
const RAMP = 0.2;

export class RoomLights {
  readonly group = new THREE.Group();
  readonly key: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly l1: THREE.PointLight;
  readonly l2: THREE.PointLight;
  readonly l4: THREE.PointLight;
  private presence = { from: 0, to: 0, t0: -1e9 };
  private dim = { from: 1, to: 1, t0: -1e9 };

  constructor(quality: QualityPreset, lighting: LightingState) {
    const row = LIGHTING[lighting.preset];
    this.key = new THREE.DirectionalLight(row.key, row.keyIntensity * KEY_GAIN);
    const [x, y, z] = keyDirection(row);
    this.key.position.set(x * 20, y * 20, z * 20);
    this.hemi = new THREE.HemisphereLight(tint(row.sky), tint(row.ground), row.hemi * HEMI_GAIN);
    this.l1 = new THREE.PointLight('#f2cb7a', 1.2 * POINT_SCALE, 5.5, 2);
    this.l1.position.set(0.8, 2.3, 0.0);
    this.l1.castShadow = quality !== 'low';
    this.l1.shadow.mapSize.set(1024, 1024);
    this.l1.shadow.bias = -0.004;
    this.l2 = new THREE.PointLight('#f2cb7a', 0, 5, 2);
    this.l2.position.set(2.7, 1.12, -2.6);
    this.l4 = new THREE.PointLight('#2aa5b8', 0, 3, 2);
    this.group.add(this.key, this.key.target, this.hemi, this.l1, this.l2, this.l4);
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
