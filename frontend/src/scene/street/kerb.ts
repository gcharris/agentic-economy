// The kerb (DESIGN §6 as amended by §2c.4): kerb stones sit on the street plate's rim between its houses, and a
// #4c3f30 stone ribbon 1.2 m wide runs along that rim across the houses' arc, one --brass stud (r 0.12) per stone.
// The ground is the street plate itself (limestone, §2b).

import * as THREE from 'three';
import { PLATE_TOP, rimPoint, type Plate } from '../../engine/layout/layoutBulbs.ts';

const KERB = new THREE.MeshLambertMaterial({ color: '#4c3f30', flatShading: true, side: THREE.DoubleSide });
const STONE = new THREE.MeshLambertMaterial({ color: '#5a4a38', flatShading: true });
const STUD = new THREE.MeshLambertMaterial({ color: '#a8842e', emissive: '#a8842e', emissiveIntensity: 0.2 });
export const KERB_WIDTH = 1.2;
export const KERB_Y = PLATE_TOP.Street + 0.03;

/** The angles, seen from the street's centre, of the kerb stones: midway between neighbouring houses. */
export function stoneAngles(street: Plate, houses: readonly Plate[]): number[] {
  const t = houses.map((h) => Math.atan2(h.cz - street.cz, h.cx - street.cx)).sort((a, b) => a - b);
  if (t.length < 2) return t.map((a) => a + 0.35);
  const out: number[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push((t[i] + t[i + 1]) / 2);
  const wrap = t[0] + 2 * Math.PI - t[t.length - 1];
  if (wrap < Math.PI) out.push(t[t.length - 1] + wrap / 2); // a street whose houses go all the way round closes its kerb
  return out;
}

export function buildKerb(street: Plate, houses: readonly Plate[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'kerb';
  const angles = houses.map((h) => Math.atan2(h.cz - street.cz, h.cx - street.cx)).sort((a, b) => a - b);
  if (angles.length) {
    const full = stoneAngles(street, houses).length === angles.length && angles.length > 1;
    const start = full ? 0 : angles[0] - 0.25, len = full ? Math.PI * 2 : angles[angles.length - 1] - angles[0] + 0.5;
    // RingGeometry sweeps counter-clockwise in its own xy plane; rotated flat, +y maps to −z, so negate the angles.
    const ribbon = new THREE.Mesh(new THREE.RingGeometry(street.r - KERB_WIDTH - 0.4, street.r - 0.4, 96, 1, -(start + len), len).rotateX(-Math.PI / 2), KERB);
    ribbon.position.set(street.cx, KERB_Y, street.cz);
    ribbon.receiveShadow = true;
    g.add(ribbon);
  }
  for (const a of stoneAngles(street, houses)) {
    const p = rimPoint(street, a, 1 - (KERB_WIDTH / 2 + 0.4) / street.r);
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.6), STONE);
    stone.position.set(p.x, KERB_Y + 0.09, p.z);
    stone.rotation.y = -a;
    const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 10), STUD);
    stud.position.set(p.x, KERB_Y + 0.2, p.z);
    g.add(stone, stud);
  }
  return g;
}

/** Where two houses' couriers meet: the kerb point midway (by angle) between them on their street's rim. */
export function meetingStone(street: Plate, a: Plate, b: Plate): THREE.Vector3 {
  const ta = Math.atan2(a.cz - street.cz, a.cx - street.cx), tb = Math.atan2(b.cz - street.cz, b.cx - street.cx);
  const m = Math.atan2(Math.sin(ta) + Math.sin(tb), Math.cos(ta) + Math.cos(tb)); // the circular mean
  const p = rimPoint(street, m, 1 - (KERB_WIDTH / 2 + 0.4) / street.r);
  return new THREE.Vector3(p.x, KERB_Y + 0.02, p.z);
}

export { dyeFor, STREET_DYES } from '../../engine/layout/dyes.ts';

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
