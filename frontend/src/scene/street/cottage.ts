// A cottage on its tile (DESIGN §6): the §4 house with its roof on, on a hex plinth. Walls #2c2219, timber
// corners #5a422f, a --roof gable whose ridge runs east–west 1.6 m above the eaves, the Door under the east gable
// with the Letter Slot in its leaf, a lantern 0.4 m right of the leaf at 2.0 m (the status pill made physical),
// and a brass-capped chimney pot on the ridge at x = −1.0 that glows with heat. House-local metres, as the room.

import * as THREE from 'three';
import { HEX_SIZE } from '../../engine/layout/hex.ts';
import type { NodeStatus } from '../../engine/contract/state.ts';

const flat = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const M = {
  edge: flat('#4c3f30'), plinth: flat('#2b2117'), bevel: flat('#4a3826'), wall: flat('#e3d6bb'), // limewash in daylight (DESIGN §2b)
  timber: flat('#5a422f'),
  roof: flat('#7d4a34'), door: flat('#4a3525'), brass: flat('#a8842e'), pot: flat('#3e3a34'), step: flat('#3e2d1f'),
};
const EAVES = 3.2, RIDGE = 1.6;
export const PLINTH_TOP = 0.3;
export const SLOT_LOCAL = new THREE.Vector3(4.13, 1.1, 0.0);

/** Shared geometries: six cottages or sixty, one set of buffers. */
const G = (() => {
  const plinthBase = new THREE.CylinderGeometry(HEX_SIZE, HEX_SIZE, 0.15, 6).translate(0, 0.075, 0);
  const plinthTop = new THREE.CylinderGeometry(HEX_SIZE - 0.15, HEX_SIZE, 0.15, 6).translate(0, 0.225, 0);
  const body = new THREE.BoxGeometry(8.2, EAVES, 6.2).translate(0, EAVES / 2, 0);
  const post = new THREE.BoxGeometry(0.22, EAVES, 0.22).translate(0, EAVES / 2, 0);
  // The gable: a triangular prism along x (ridge east–west), eaves overhanging 0.3 m.
  const half = 3.1 + 0.3;
  const shape = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, RIDGE)]);
  const gable = new THREE.ExtrudeGeometry(shape, { depth: 8.2, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-4.1, EAVES, 0);
  const slope = Math.hypot(half, RIDGE);
  const roofPlane = new THREE.BoxGeometry(8.8, 0.12, slope + 0.1);
  return { plinthBase, plinthTop, body, post, gable, roofPlane, slope, half };
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
}

export function buildCottage(id: number): Cottage {
  const group = new THREE.Group();
  group.name = `cottage-${id}`;
  const plinth = new THREE.Mesh(G.plinthBase, M.edge);
  const top = new THREE.Mesh(G.plinthTop, [M.bevel, M.plinth, M.edge]);
  plinth.receiveShadow = top.receiveShadow = true;
  plinth.castShadow = top.castShadow = true;
  group.add(plinth, top);

  const house = new THREE.Group();
  house.position.y = PLINTH_TOP;
  group.add(house);
  const body = new THREE.Mesh(G.body, M.wall);
  body.castShadow = body.receiveShadow = true;
  house.add(body);
  for (const [x, z] of [[-4.0, -3.0], [4.0, -3.0], [-4.0, 3.0], [4.0, 3.0]]) {
    const p = new THREE.Mesh(G.post, M.timber);
    p.position.set(x, 0, z);
    house.add(p);
  }
  const gable = new THREE.Mesh(G.gable, M.wall);
  gable.castShadow = true;
  house.add(gable);
  const tilt = Math.atan2(RIDGE, G.half);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(G.roofPlane, M.roof);
    r.position.set(0, EAVES + RIDGE / 2 + 0.06, (s * G.half) / 2);
    r.rotation.x = s * tilt;
    r.castShadow = true;
    house.add(r);
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
  pot.position.set(-1.0, EAVES + RIDGE + 0.2, 0);
  const chimney = new THREE.MeshLambertMaterial({ color: '#a8842e', emissive: '#c95140', emissiveIntensity: 0 });
  const potCap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 8), chimney);
  potCap.position.set(-1.0, EAVES + RIDGE + 0.48, 0);
  house.add(pot, potCap);
  const smokeMat = () => new THREE.MeshBasicMaterial({ color: '#8a7a64', transparent: true, opacity: 0, depthWrite: false });
  const smoke = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), smokeMat());
    m.position.set(-1.0, EAVES + RIDGE + 0.6, 0);
    house.add(m);
    return m;
  });
  return { id, group, house, slot, lantern, chimney, smoke };
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
    m.position.y = EAVES + RIDGE + 0.6 + phase * 1.6;
    m.position.x = -1.0 + phase * 0.5;
    m.scale.setScalar(0.6 + phase * 1.4);
    (m.material as THREE.MeshBasicMaterial).opacity = h * 0.45 * (1 - phase);
  });
}
