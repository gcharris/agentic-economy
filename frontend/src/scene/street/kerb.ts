// The kerb (DESIGN §6): a #4c3f30 stone ribbon 1.2 m wide through a street's kerb stones, one --brass stud
// (r 0.12) per tile at 5.0 m from its centre toward the ring centre. The ground plate is limestone (§2b).

import * as THREE from 'three';
import type { Axial } from '../../engine/layout/hex.ts';
import { HEX_SIZE, toWorld } from '../../engine/layout/hex.ts';
import { kerbStone } from '../../engine/layout/layoutCity.ts';

const KERB = new THREE.MeshLambertMaterial({ color: '#4c3f30', flatShading: true });
const STUD = new THREE.MeshLambertMaterial({ color: '#a8842e', emissive: '#a8842e', emissiveIntensity: 0.2 });
/** The ground plate at Stages 2–3: warm limestone (DESIGN §2b; the baize returns at night and at Stages 4–5). */
const ROAD = new THREE.MeshLambertMaterial({ color: '#a8977a' });
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

/** DESIGN §2b.3: one rim dye per street, from a muted set, assigned by street id. It names a district; it orders nothing. */
export const STREET_DYES = ['#8c3b2e', '#b0802c', '#3f4a63', '#5d6b3a'] as const; // madder, ochre, indigo-grey, moss
export const dyeFor = (streetId: number): string => STREET_DYES[Number(BigInt(streetId) % BigInt(STREET_DYES.length))];

/** A soft contact shadow (DESIGN §2b.4): a radial falloff texture shared by every plinth and figure. */
let softTex: THREE.DataTexture | null = null;
export function softShadowTexture(): THREE.DataTexture {
  if (softTex) return softTex;
  const n = 64, d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
    const a = Math.max(0, Math.min(1, (1 - r) / 0.35));
    d.set([0, 0, 0, Math.round(255 * a * a)], (y * n + x) * 4);
  }
  softTex = new THREE.DataTexture(d, n, n);
  softTex.needsUpdate = true;
  return softTex;
}
export function contactShadow(radius: number, opacity = 0.45): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: softShadowTexture(), transparent: true, opacity, depthWrite: false }));
  m.position.y = 0.004;
  m.renderOrder = -1;
  return m;
}
