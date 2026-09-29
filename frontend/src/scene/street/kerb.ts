// The kerb (DESIGN §6): a #4c3f30 stone ribbon 1.2 m wide through a street's kerb stones, one --brass stud
// (r 0.12) per tile at 5.0 m from its centre toward the ring centre. The road inside is #221c16.

import * as THREE from 'three';
import type { Axial } from '../../engine/layout/hex.ts';
import { HEX_SIZE, toWorld } from '../../engine/layout/hex.ts';
import { kerbStone } from '../../engine/layout/layoutCity.ts';

const KERB = new THREE.MeshLambertMaterial({ color: '#4c3f30', flatShading: true });
const STUD = new THREE.MeshLambertMaterial({ color: '#a8842e', emissive: '#a8842e', emissiveIntensity: 0.2 });
const ROAD = new THREE.MeshLambertMaterial({ color: '#221c16' });
export const KERB_HEIGHT = 0.32;

/** The stones of a street's cells, in ring order; closed when the street fills its ring. */
export function buildKerb(cells: readonly Axial[], closed: boolean): THREE.Group {
  const g = new THREE.Group();
  g.name = 'kerb';
  const stones = cells.map((c) => { const s = kerbStone(c); return new THREE.Vector3(s.x, 0, s.z); });
  const n = stones.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = stones[i], b = stones[(i + 1) % n];
    const len = a.distanceTo(b);
    if (len < 1e-3) continue;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(len + 1.2, KERB_HEIGHT, 1.2), KERB);
    seg.position.copy(a).add(b).multiplyScalar(0.5).setY(KERB_HEIGHT / 2);
    seg.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    seg.receiveShadow = true;
    g.add(seg);
  }
  for (const s of stones) {
    const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 10), STUD);
    stud.position.copy(s).setY(KERB_HEIGHT + 0.02);
    g.add(stud);
  }
  return g;
}

/** The road: a hex plate under the ring's centre, below the plinths. */
export function buildRoad(centre: Axial, radiusCells: number): THREE.Mesh {
  const w = toWorld(centre);
  const r = HEX_SIZE * (1.8 * radiusCells + 1);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.1, 6).translate(0, -0.05, 0), ROAD);
  m.position.set(w.x, 0, w.z);
  m.receiveShadow = true;
  return m;
}

/** The kerb point for a courier's meeting: the stone midway between two houses' stones, pulled onto the kerb. */
export function meetingStone(a: Axial, b: Axial): THREE.Vector3 {
  const sa = kerbStone(a), sb = kerbStone(b);
  const m = new THREE.Vector3((sa.x + sb.x) / 2, 0, (sa.z + sb.z) / 2);
  const r = Math.hypot(sa.x, sa.z);
  const l = Math.hypot(m.x, m.z);
  if (l < 1e-3) m.set(-sa.z, 0, sa.x).setLength(r); // opposite houses: go round, not through the middle
  else m.setLength(r);
  return m.setY(KERB_HEIGHT);
}
