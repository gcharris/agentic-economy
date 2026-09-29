// The altitude rig (ARCHITECTURE §8). One PerspectiveCamera placed by the dolly identity from the altitude
// scalar A, standing south-west of its target. At band 1 the frame is the focused house's (its Door on the
// right); the house's yaw is blended out over A ∈ [1.5, 2.0] and the target slides to the street's centre.
// Hysteresis: going up, band k + 1 at A ≥ k + 0.6; going down, band k at A ≤ k + 0.4; each change calls
// zoom(band) once and holds `pending` until the engine confirms (PACKED / UNPACKED, or a TICK_COMMITTED whose
// active_scale is the pending band). While pending, the altitude the bands see is clamped at the band edge,
// so the camera never shows a scale the engine is not simulating. A critically damped spring (half-life
// 120 ms) smooths A, the target and the yaw.

import * as THREE from 'three';
import { STAGE_LEVEL } from '../../engine/contract/copy.ts';
import type { Frame } from '../../engine/source/EngineSource.ts';
import type { Band } from '../../engine/store/bus.ts';
import type { Store } from '../../engine/store/Store.ts';
import { BANDS, dolly, heightAt, YAW_DEG } from './bands.ts';

const HALF_LIFE = 0.12;
const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

/** A director's framing: pixels per metre (DESIGN §11: 154 at 1080 rows) and a target in house-local metres. */
export interface Take { ppm: number; target: [number, number, number] }

/** Band 1 holds pixels per metre, not H (REVIEW-ROOM §3): 77 px/m, so a 0.9 m cat is 69 px at any viewport. */
export const ROOM_PPM = 77;
/** Band centres: where A rests when a band is chosen from the ladder or a recorded run's active_scale. */
export const BAND_REST: Record<Band, number> = { 1: 1.0, 2: 2.0, 3: 3.0, 4: 4.0, 5: 4.8 };

const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export class AltitudeRig {
  a = 1.0;
  aTarget = 1.0;
  /** The committed band (hysteresis state), and a zoom the engine has not yet confirmed. */
  band: Band = 1;
  pending: { band: Band; from: Band; sentTick: number } | null = null;
  /** Called once per band change; the app turns it into `zoom/<n>` when the source is live. */
  onZoom: ((band: Band) => void) | null = null;
  /** The focused house's frame in world space. */
  readonly origin = new THREE.Vector3();
  frameYaw = 0;
  /** The street band's centre (the ring's centre) and its view height, from the layout. */
  readonly streetCentre = new THREE.Vector3();
  /** The root plate's centre: the Clearinghouse. */
  readonly cityCentre = new THREE.Vector3();
  streetH = 70;
  cityH = 140;
  /** Target in house-local metres (between the Oak Table and the Desk by default). */
  readonly local = new THREE.Vector3(0.6, 0.8, -0.6);
  take: Take | null = null;
  /** CSS pixel rows of the viewport; App sets it from the renderer. */
  rows = 1080;
  private readonly target = new THREE.Vector3();
  private readonly smoothTarget = new THREE.Vector3();
  /** The view height used on the last update (the key light's shadow frustum follows it). */
  viewH = 14;
  get lookTarget(): THREE.Vector3 { return this.smoothTarget; }
  private yaw = 0;
  private lastT = -1;
  private tick = 0;
  private snap = false;
  private opened = false;
  private focusId: number | null = null;

  /** The altitude bands should draw at: A, held at the band edge while a zoom is pending. */
  get visualA(): number {
    const p = this.pending;
    if (!p) return this.a;
    return p.band > p.from ? Math.min(this.a, p.from + 0.5) : Math.max(this.a, p.from - 0.5);
  }

  /** After each frame: the focused house's plate and yaw, its street's plate, the city's extent, zoom confirmation. */
  follow(store: Store, frame?: Frame, recorded = false): void {
    const id = store.focus;
    const plate = id === null ? undefined : store.layout.plateOf(id);
    if (plate) {
      if (id !== this.focusId) { this.focusId = id; this.snap = true; }
      this.origin.set(plate.cx, plate.top, plate.cz);
      this.frameYaw = store.layout.yawOf(plate.id);
    }
    const layout = store.layout.current;
    // Band 2 looks at the focused house's street plate; band 3 at the root (the Clearinghouse). A disc of extent E
    // fills a 16:9 frame at pitch 30° when H ≈ 1.3·E.
    const street = plate?.stage === 'House' ? store.layout.parentOf(plate.id) : plate;
    const k = this.rows / 1080; // DESIGN §10's heights are for 1080 rows; hold their pixels per metre at any viewport
    if (street) {
      // Frame the street plate and its houses together: their bounding box, since the houses bud on one side.
      let x0 = street.cx - street.r, x1 = street.cx + street.r, z0 = street.cz - street.r, z1 = street.cz + street.r;
      for (const p of layout.plates.values()) {
        if (p.parent !== street.id) continue;
        x0 = Math.min(x0, p.cx - p.r); x1 = Math.max(x1, p.cx + p.r); z0 = Math.min(z0, p.cz - p.r); z1 = Math.max(z1, p.cz + p.r);
      }
      this.streetCentre.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      this.streetH = Math.max(70 * k, 1.3 * 0.5 * Math.hypot(x1 - x0, z1 - z0));
    }
    this.cityH = Math.min(1600, Math.max(140 * k, 1.3 * layout.radius));
    if (!frame) return;
    this.tick = frame.tick;
    const scale = STAGE_LEVEL[frame.state.active_scale];
    if (this.pending) {
      const confirmed = frame.events.some((e) =>
        e.type === 'PACKED' || e.type === 'UNPACKED' || (e.type === 'TICK_COMMITTED' && STAGE_LEVEL[e.active_scale] === this.pending!.band));
      if (confirmed || scale === this.pending.band) this.pending = null;
    }
    // Any run opens at the engine's scale, without a zoom call (zoom/3 on the city world would pack it).
    if (!this.opened) { this.opened = true; if (scale !== this.band) this.setBand(scale as Band, true); }
    void recorded;
  }

  setTake(take: Take | null): void {
    this.take = take;
    if (take) this.local.set(...take.target);
  }

  /** Jump or glide to a band's rest altitude (the ladder, `[` / `]`, a recorded run's scale). */
  setBand(b: Band, jump = false): void {
    this.setTarget(BAND_REST[b]);
    if (jump) { this.a = this.aTarget; this.band = b; this.pending = null; this.snap = true; }
  }

  setTarget(a: number): void { this.aTarget = Math.min(5, Math.max(1, a)); }
  nudge(d: number): void { this.setTarget(this.aTarget + d); }

  /** Band changes with hysteresis; one zoom call per change. */
  private hysteresis(): void {
    const a = this.a;
    let b = this.band;
    while (b < 5 && a >= b + 0.6) b = (b + 1) as Band;
    while (b > 1 && a <= b - 1 + 0.4) b = (b - 1) as Band;
    if (b !== this.band) {
      this.pending = { band: b, from: this.band, sentTick: this.tick };
      this.band = b;
      this.onZoom?.(b);
    }
  }

  /** Test seam: set A directly (no spring) and apply the hysteresis. */
  jumpTo(a: number): void { this.a = this.aTarget = a; this.hysteresis(); }

  /** Per render frame. Writes the camera pose; reads no Frame. */
  update(t: number, camera: THREE.PerspectiveCamera): void {
    // Real elapsed time (a long gap converges); snap on the first frame and when the focus first lands.
    const dt = this.lastT < 0 || this.snap ? 1 : Math.max(0, t - this.lastT);
    this.snap = false;
    this.lastT = t;
    const k = dt >= 1 ? 1 : 1 - Math.pow(0.5, dt / HALF_LIFE);
    this.a += (this.aTarget - this.a) * k;
    if (Math.abs(this.aTarget - this.a) < 1e-4) this.a = this.aTarget;
    this.hysteresis();
    const a = this.visualA;

    // Band 1: the house's frame and local target; from A 1.5 to 2.0 blend to the street centre at world yaw.
    const s = smooth(1.5, 2.0, a);
    const houseTarget = this.local.clone().applyAxisAngle(UP, this.frameYaw).add(this.origin);
    this.target.copy(houseTarget).lerp(this.streetCentre, s).lerp(this.cityCentre, smooth(2.5, 3.0, a));
    const yawTarget = this.frameYaw * (1 - s);
    this.yaw = dt >= 1 ? yawTarget : this.yaw + (yawTarget - this.yaw) * k;
    if (dt >= 1) this.smoothTarget.copy(this.target); else this.smoothTarget.lerp(this.target, k);

    const row = BANDS[Math.min(4, Math.max(0, Math.round(a) - 1))];
    const H = this.take ? this.rows / this.take.ppm
      : heightAt(a, BANDS.map((b, i) => (i === 0 ? this.rows / ROOM_PPM : i === 1 ? this.streetH : i === 2 ? this.cityH : b.H)));
    this.viewH = H;
    const fov = row.fovDeg;
    const d = dolly(H, fov);
    const p = row.pitchDeg * DEG;
    const y = YAW_DEG * DEG;
    const off = new THREE.Vector3(-Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)).multiplyScalar(d);
    off.applyAxisAngle(UP, this.yaw);
    camera.fov = fov;
    camera.near = d / 50;
    camera.far = d * 4;
    camera.position.copy(this.smoothTarget).add(off);
    camera.lookAt(this.smoothTarget);
    camera.updateProjectionMatrix();
  }
}
