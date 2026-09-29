// The globe's frame (DESIGN §8, Stage 5), pure: where the sphere stands and where each country's beacon sits on it.
// Shared by the World band (which draws it) and the altitude rig (which looks at it), so the two cannot disagree.
//
// Countries are beacons by ascending id on the 30° N circle, the row centred on the front of the circle (the side the
// camera, south-west at YAW_DEG, looks at) and at most 45° apart, so from the band-5 pitch of 35° the countries sit in
// the middle of the face and the pole near the top; the pole stands upright in its brass stand. The globe is placed so the focused country's
// beacon is exactly where its flat relief stood at band 4: the 4 → 5 dissolve fades the relief onto the sphere in place.

import * as THREE from 'three';
import type { NodeId } from '../../engine/contract/state.ts';
import type { BulbLayout } from '../../engine/layout/layoutBulbs.ts';
import { YAW_DEG } from '../camera/bands.ts';

export const GLOBE_R = 6000;
/** The brass armillary ring, tilted 23° to the equator. */
export const RING_R = GLOBE_R + 300;
export const RING_TILT = (23 * Math.PI) / 180;
/** AWAITING_FINALITY: the envelope orbits its beacon at this distance from the globe's centre. */
export const ORBIT_R = GLOBE_R + 150;
export const LATITUDE = (30 * Math.PI) / 180;
const POLE_LEAN = 0;

export interface Beacon { id: NodeId; normal: THREE.Vector3; pos: THREE.Vector3 }
export interface GlobeFrame {
  centre: THREE.Vector3;
  /** Globe-local to world: local +y is the pole, local +x the front of the 30° N circle. */
  quat: THREE.Quaternion;
  pole: THREE.Vector3;
  beacons: Beacon[];
}

/** The root of a plate's tree (its country), or null. */
export function rootOf(layout: BulbLayout, id: NodeId | null): NodeId | null {
  let p = id === null ? undefined : layout.plates.get(id);
  while (p && p.parent !== null) p = layout.plates.get(p.parent);
  return p ? p.id : null;
}

/** Longitude step between neighbouring beacons: evenly round the circle, but never wider than 45°, so a few
 *  countries spread across the face the camera sees instead of hiding behind the limb. */
export const lonStep = (n: number): number => Math.min((2 * Math.PI) / Math.max(1, n), (45 * Math.PI) / 180);

/** Local unit normal of beacon i of n by ascending id, the row centred on the front (local +x). */
export function beaconNormal(i: number, n: number): THREE.Vector3 {
  const lon = (i - (n - 1) / 2) * lonStep(n);
  return new THREE.Vector3(Math.cos(LATITUDE) * Math.cos(lon), Math.sin(LATITUDE), Math.cos(LATITUDE) * Math.sin(lon));
}

export function globeFrame(layout: BulbLayout, focusRoot: NodeId | null): GlobeFrame | null {
  const trees = layout.trees;
  if (trees.length === 0) return null;
  const f = Math.max(0, trees.findIndex((t) => t.id === focusRoot));
  // The camera's horizontal direction at band 5 (yaw blended out): south-west, as AltitudeRig places it.
  const y = (YAW_DEG * Math.PI) / 180;
  const h = new THREE.Vector3(-Math.sin(y), 0, Math.cos(y));
  const up = new THREE.Vector3(0, 1, 0);
  const pole = up.clone().multiplyScalar(Math.cos(POLE_LEAN)).addScaledVector(h, Math.sin(POLE_LEAN));
  const front = h.clone().multiplyScalar(Math.cos(POLE_LEAN)).addScaledVector(up, -Math.sin(POLE_LEAN));
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(front, pole, front.clone().cross(pole)));
  const focus = trees[f];
  const top = layout.plates.get(focus.id)?.top ?? 0;
  const nf = beaconNormal(f, trees.length).applyQuaternion(quat);
  const centre = new THREE.Vector3(focus.cx, top, focus.cz).addScaledVector(nf, -GLOBE_R);
  const beacons = trees.map((t, i) => {
    const normal = beaconNormal(i, trees.length).applyQuaternion(quat);
    return { id: t.id, normal, pos: centre.clone().addScaledVector(normal, GLOBE_R) };
  });
  return { centre, quat, pole, beacons };
}

/** Great-circle points from unit normal a to b at radius r about `centre` (steps + 1 points). */
export function greatCircle(a: THREE.Vector3, b: THREE.Vector3, r: number, steps: number): THREE.Vector3[] {
  const omega = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const v = omega < 1e-6 ? a.clone()
      : a.clone().multiplyScalar(Math.sin((1 - t) * omega) / Math.sin(omega)).addScaledVector(b, Math.sin(t * omega) / Math.sin(omega));
    out.push(v.normalize().multiplyScalar(r));
  }
  return out;
}
