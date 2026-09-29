// The altitude rig (ARCHITECTURE §8). One PerspectiveCamera placed by the dolly identity from the altitude
// scalar A, standing south-west of the focused house in that house's frame, so its north and east walls
// (the Archives, the Desk, the Door) are the far walls. A critically damped spring (half-life 120 ms)
// smooths A, the target and the yaw. This build drives band 1; zoom calls and dissolves come with the street.

import * as THREE from 'three';
import { toWorld } from '../../engine/layout/hex.ts';
import { houseYaw } from '../../engine/layout/layoutCity.ts';
import type { Band } from '../../engine/store/bus.ts';
import type { Store } from '../../engine/store/Store.ts';
import { BANDS, dolly, heightAt, YAW_DEG } from './bands.ts';

const HALF_LIFE = 0.12;
const DEG = Math.PI / 180;

/** A director's framing: a view height and a target in the focused house's local metres. */
export interface Take { H: number; target: [number, number, number] }

export class AltitudeRig {
  a = 1.2;
  aTarget = 1.2;
  /** The focused house's frame in world space. */
  readonly origin = new THREE.Vector3();
  frameYaw = 0;
  /** Target in house-local metres (the Oak Table's centre by default). */
  readonly local = new THREE.Vector3(0.6, 0.8, -0.6);
  take: Take | null = null;
  private readonly target = new THREE.Vector3();
  private readonly smoothTarget = new THREE.Vector3();
  private lastT = -1;

  get band(): Band { return (Math.min(5, Math.max(1, Math.round(this.a))) as Band); }

  /** After each frame: the focused node's cell and yaw (a layout read, not a walk of the nodes). */
  follow(store: Store): void {
    const id = store.focus;
    const cell = id === null ? null : store.layout.cellOf(id);
    if (!cell) return;
    const w = toWorld(cell);
    this.origin.set(w.x, 0, w.z);
    this.frameYaw = houseYaw(cell);
  }

  setTake(take: Take | null): void {
    this.take = take;
    if (take) this.local.set(...take.target);
  }

  /** Per render frame. Writes the camera pose; reads no Frame. */
  update(t: number, camera: THREE.PerspectiveCamera): void {
    const dt = this.lastT < 0 ? 1 : Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const k = 1 - Math.pow(0.5, dt / HALF_LIFE);
    this.a += (this.aTarget - this.a) * k;
    this.target.copy(this.local).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.frameYaw).add(this.origin);
    if (dt >= 1) this.smoothTarget.copy(this.target); else this.smoothTarget.lerp(this.target, k);

    const row = BANDS[this.band - 1];
    const H = this.take?.H ?? heightAt(this.a);
    const fov = row.fovDeg;
    const d = dolly(H, fov);
    const p = row.pitchDeg * DEG;
    const y = YAW_DEG * DEG;
    const off = new THREE.Vector3(-Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)).multiplyScalar(d);
    off.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.frameYaw);
    camera.fov = fov;
    camera.near = d / 50;
    camera.far = d * 4;
    camera.position.copy(this.smoothTarget).add(off);
    camera.lookAt(this.smoothTarget);
    camera.updateProjectionMatrix();
  }
}
