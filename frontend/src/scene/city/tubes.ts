// Tubes (DESIGN §7): a brass-ringed glass ribbon from each street's marker cell to the dome, a 10 % gold pilot glow
// at rest. NETTED beat 1 (0–240 ms): every tube fills inward, width clamp(gross / 200, 0.2, 1.0) m, --gold-2, quad-in.

import * as THREE from 'three';
import { toWorld, type Axial } from '../../engine/layout/hex.ts';

export interface Tube { group: THREE.Group; fill: THREE.Mesh; length: number }

const GLASS = new THREE.MeshLambertMaterial({ color: '#e9dfc6', emissive: '#d4a755', emissiveIntensity: 0.1, transparent: true, opacity: 0.45, depthWrite: false });
const RING = new THREE.MeshLambertMaterial({ color: '#a8842e', flatShading: true });
const FILL = new THREE.MeshBasicMaterial({ color: '#b98626' });
export const TUBE_Y = 3.0;

export function buildTube(from: Axial, domeRadius = 4): Tube {
  const w = toWorld(from);
  const start = new THREE.Vector3(w.x, TUBE_Y, w.z);
  const dir = new THREE.Vector3(-w.x, 0, -w.z);
  const full = dir.length();
  const length = Math.max(0.5, full - domeRadius - 1.5);
  const g = new THREE.Group();
  g.position.copy(start);
  g.rotation.y = Math.atan2(dir.x, dir.z); // local +z points at the dome
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, length, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, length / 2), GLASS);
  g.add(glass);
  for (const z of [0.1, length / 2, length - 0.1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 4, 12), RING);
    ring.position.z = z;
    g.add(ring);
  }
  // Legs down to the house tile, so the tube reads as carried, not floating.
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, TUBE_Y - 1.2, 0.12), RING);
  leg.position.set(0, -(TUBE_Y - 1.2) / 2, 0.3);
  g.add(leg);
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5), FILL);
  fill.visible = false;
  g.add(fill);
  return { group: g, fill, length };
}

/** Beat 1 at age (s): the fill runs from the street end inward, quad-in; it stays lit until the ring leaves, then fades. */
export function setFill(t: Tube, age: number, gross: number): void {
  if (age < 0 || age > 1.0) { t.fill.visible = false; return; }
  const k = Math.min(1, age / 0.24);
  const width = Math.min(1.0, Math.max(0.2, gross / 200));
  t.fill.visible = true;
  t.fill.scale.set(width, width, Math.max(0.01, t.length * k * k));
  (t.fill.material as THREE.MeshBasicMaterial).opacity = 1;
}
