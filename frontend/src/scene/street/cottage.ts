// A cottage on its house plate (DESIGN §6, §2c): the §4 house with its roof on; the plate is the plinth. Walls #2c2219, timber
// corners #5a422f, a --roof gable whose ridge runs east–west 1.6 m above the eaves, the Door under the east gable
// with the Letter Slot in its leaf, a lantern 0.4 m right of the leaf at 2.0 m (the status pill made physical),
// and a brass-capped chimney pot on the ridge at x = −1.0 that glows with heat. House-local metres, as the room.

import * as THREE from 'three';
import { seedOf } from '../../engine/layout/layoutBulbs.ts';
import type { NodeStatus } from '../../engine/contract/state.ts';

const flat = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const M = {
  edge: flat('#4c3f30'), plinth: flat('#2b2117'), bevel: flat('#4a3826'), wall: flat('#e3d6bb'), // limewash in daylight (DESIGN §2b)
  timber: flat('#5a422f'),
  roof: flat('#7d4a34'), pane: new THREE.MeshLambertMaterial({ color: '#2a2118', emissive: '#f2cb7a', emissiveIntensity: 0.35 }), door: flat('#4a3525'), brass: flat('#a8842e'), pot: flat('#3e3a34'), step: flat('#3e2d1f'),
};
const EAVES = 3.2, RIDGE = 1.6;
const BASE = { wall: new THREE.Color('#e3d6bb'), timber: new THREE.Color('#5a422f'), roof: new THREE.Color('#7d4a34') };
/**
 * Exterior exposure. Golden's light gains are measured for the dark oak room (room-light.spec); under them a limewash
 * wall outdoors (albedo 0.68) blows out to a blank white slab next to the room at band 1. The street band scales the
 * exterior set by the preset in force: 0.45 under Golden, 1 under Noon (DESIGN §2b's daylight materials as written).
 */
export function setExteriorExposure(k: number): void {
  M.wall.color.copy(BASE.wall).multiplyScalar(k);
  M.timber.color.copy(BASE.timber).multiplyScalar(Math.min(1, k * 1.3));
}
export const SLOT_LOCAL = new THREE.Vector3(4.13, 1.1, 0.0);

/** Shared geometries: six cottages or sixty, one set of buffers. */
const G = (() => {
  const body = new THREE.BoxGeometry(8.2, EAVES, 6.2).translate(0, EAVES / 2, 0);
  const course = new THREE.BoxGeometry(8.26, 0.35, 6.26).translate(0, 0.175, 0);
  const frame = new THREE.BoxGeometry(1.15, 1.25, 0.08);
  const pane = new THREE.BoxGeometry(0.85, 0.95, 0.06);
  const post = new THREE.BoxGeometry(0.22, EAVES, 0.22).translate(0, EAVES / 2, 0);
  // The gable: a triangular prism along x (ridge east–west), eaves overhanging 0.3 m.
  const half = 3.1 + 0.3;
  const shape = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, RIDGE)]);
  const gable = new THREE.ExtrudeGeometry(shape, { depth: 8.2, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-4.1, EAVES, 0);
  const slope = Math.hypot(half, RIDGE);
  const roofPlane = new THREE.BoxGeometry(8.8, 0.12, slope + 0.1);
  return { body, course, frame, pane, post, gable, roofPlane, slope, half };
})();

export interface Cottage {
  id: number;
  group: THREE.Group;
  /** Everything above the plinth: hidden for the focused house while the room is drawn. */
  house: THREE.Group;
  slot: THREE.MeshLambertMaterial;
  lantern: THREE.MeshLambertMaterial;
  chimney: THREE.MeshLambertMaterial;
  smoke: THREE.Mesh[];
  /** Seeded variation: the chimney's end of the ridge and the extra storey height (0 for most). */
  chimneyX: number;
  lift: number;
  /** The lid gesture (DESIGN §10, 1 → 2): the roof and upper storey, faded and lowered into place. */
  upper: THREE.Group;
  materials: THREE.Material[];
}

/** Seeded house variation (the video's polish): roof tint ±8 %, the chimney at one end of the ridge, one in six taller. */
export function variation(id: number): { tint: number; chimneyX: number; lift: number } {
  const a = seedOf(id), b = seedOf(id + 7919), c = seedOf(id + 104729);
  return { tint: 1 + (a - 0.5) * 0.16, chimneyX: b < 0.5 ? -3.0 : 2.4, lift: c < 1 / 6 ? 1.2 : 0 };
}

export function buildCottage(id: number): Cottage {
  const v = variation(id);
  const roofMat = M.roof.clone();
  roofMat.color.multiplyScalar(v.tint);
  const group = new THREE.Group();
  group.name = `cottage-${id}`;
  const house = new THREE.Group();
  house.position.y = 0; // the group stands at the house plate's top (a terrace, DESIGN §2c.1)
  group.add(house);
  const stretch = (EAVES + v.lift) / EAVES;
  const body = new THREE.Mesh(G.body, M.wall);
  body.scale.y = stretch;
  body.castShadow = body.receiveShadow = true;
  house.add(body);
  for (const [x, z] of [[-4.0, -3.0], [4.0, -3.0], [-4.0, 3.0], [4.0, 3.0]]) {
    const p = new THREE.Mesh(G.post, M.timber);
    p.position.set(x, 0, z);
    p.scale.y = stretch;
    house.add(p);
  }
  // A house is a lit window (DESIGN §1.2): two windows on each long wall and one in the west gable end, timber-framed,
  // their panes warm with lamplight; a dark plinth course along the foot of the walls. (A bare limewash wall filled the
  // frame beside the room at band 1 as a blank slab.)
  const course = new THREE.Mesh(G.course, M.timber);
  house.add(course);
  for (const [x, z, ry] of [[-2.2, 3.12, 0], [2.0, 3.12, 0], [-2.2, -3.12, 0], [2.0, -3.12, 0], [-4.12, 0, Math.PI / 2]] as const) {
    const frame = new THREE.Mesh(G.frame, M.timber);
    frame.position.set(x, 1.55 + v.lift * 0.5, z);
    frame.rotation.y = ry;
    const pane = new THREE.Mesh(G.pane, M.pane);
    pane.position.set(x + (ry ? -0.02 : 0), frame.position.y, z + (ry ? 0 : Math.sign(z) * 0.02));
    pane.rotation.y = ry;
    house.add(frame, pane);
  }
  // Everything above the eaves rides one group, lifted for a taller house and lowered in by the lid gesture.
  const upper = new THREE.Group();
  upper.position.y = v.lift;
  house.add(upper);
  const gable = new THREE.Mesh(G.gable, M.wall);
  gable.castShadow = true;
  upper.add(gable);
  const tilt = Math.atan2(RIDGE, G.half);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(G.roofPlane, roofMat);
    r.position.set(0, EAVES + RIDGE / 2 + 0.06, (s * G.half) / 2);
    r.rotation.x = s * tilt;
    r.castShadow = true;
    upper.add(r);
  }
  // The Door on the east wall, under the east gable; the step outside.
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.1, 1.0), M.door);
  leaf.position.set(4.12, 1.05, 0);
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 1.2), M.step);
  step.position.set(4.4, 0.05, 0);
  house.add(leaf, step);
  // The Letter Slot: a brass plate 0.40 × 0.12 in the leaf at 1.10 m, --gold-2 at rest.
  const slot = new THREE.MeshLambertMaterial({ color: '#b98626', emissive: '#b98626', emissiveIntensity: 0.25 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.4), slot);
  plate.position.copy(SLOT_LOCAL);
  house.add(plate);
  // The lantern, 0.4 m right of the leaf (seen from outside, facing west, right is −z) at 2.0 m.
  const lantern = new THREE.MeshLambertMaterial({ color: '#3e3a34', emissive: '#f0e6d2', emissiveIntensity: 0.6 });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.16), lantern);
  glass.position.set(4.2, 2.0, -0.9);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.1, 4), M.brass);
  cap.position.set(4.2, 2.17, -0.9);
  house.add(glass, cap);
  // The chimney: a 0.5 m pot on the ridge at x = −1.0 with a brass cap; its mouth glows with heat.
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 8), M.pot);
  pot.position.set(v.chimneyX, EAVES + RIDGE * (1 - Math.abs(v.chimneyX) / 4.4) + 0.2, 0);
  const chimney = new THREE.MeshLambertMaterial({ color: '#a8842e', emissive: '#c95140', emissiveIntensity: 0 });
  const potCap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 8), chimney);
  potCap.position.set(v.chimneyX, pot.position.y + 0.28, 0);
  upper.add(pot, potCap);
  const smokeMat = () => new THREE.MeshBasicMaterial({ color: '#8a7a64', transparent: true, opacity: 0, depthWrite: false });
  const smoke = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), smokeMat());
    m.position.set(v.chimneyX, pot.position.y + 0.4, 0);
    upper.add(m);
    return m;
  });
  return { id, group, house, slot, lantern, chimney, smoke, chimneyX: v.chimneyX, lift: v.lift, upper, materials: [roofMat] };
}

const PAPER = new THREE.Color('#f0e6d2'), GOLD_LIGHT = new THREE.Color('#f2cb7a'), EMBER = new THREE.Color('#c95140');

/** The lantern is the status pill made physical, never cold: paper steady for active, gold breathing at the Door. */
export function setLantern(c: Cottage, status: NodeStatus, t: number, reduced: boolean): void {
  const m = c.lantern;
  switch (status) {
    case 'active': m.emissive.copy(PAPER); m.emissiveIntensity = 0.6; break;
    case 'waiting_at_door':
      m.emissive.copy(GOLD_LIGHT);
      m.emissiveIntensity = reduced ? 1.0 : 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.41 * t);
      break;
    case 'halted': m.emissive.copy(EMBER); m.emissiveIntensity = 0.9; break;
    default: m.emissiveIntensity = 0; // packed, partitioned: off
  }
}

/** The chimney glows and smokes with heat (0–1); a waiting house's chimney is cold. */
export function setChimney(c: Cottage, heat: number, t: number, reduced: boolean): void {
  const h = Math.max(0, Math.min(1, heat));
  c.chimney.emissiveIntensity = h * 1.2;
  c.smoke.forEach((m, i) => {
    const phase = reduced ? 0.5 : (t * 0.5 + i / 3) % 1;
    const y0 = EAVES + RIDGE * (1 - Math.abs(c.chimneyX) / 4.4) + 0.6;
    m.position.y = y0 + phase * 1.6;
    m.position.x = c.chimneyX + phase * 0.5;
    m.scale.setScalar(0.6 + phase * 1.4);
    (m.material as THREE.MeshBasicMaterial).opacity = h * 0.45 * (1 - phase);
  });
}
