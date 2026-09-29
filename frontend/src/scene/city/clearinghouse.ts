// The Clearinghouse (DESIGN §7) at (0, 0): a round hall under a 4 m --brass dome on the 2 m plinth, six ports,
// its lantern --paper toward --gold. The dome flares --gold in the NETTED pulse's second beat (240–400 ms).

import * as THREE from 'three';
import { HEIGHT } from '../../engine/gpu/TileMesh.ts';

export interface Clearinghouse { group: THREE.Group; dome: THREE.MeshLambertMaterial; lantern: THREE.MeshLambertMaterial; top: number }

export function buildClearinghouse(): Clearinghouse {
  const g = new THREE.Group();
  g.name = 'clearinghouse';
  const base = HEIGHT.clearinghouse;
  const hall = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4.1, 1.4, 24), new THREE.MeshLambertMaterial({ color: '#e3d6bb' })); // limewash
  hall.position.y = base + 0.7;
  const dome = new THREE.MeshLambertMaterial({ color: '#a8842e', emissive: '#d4a755', emissiveIntensity: 0 });
  const cup = new THREE.Mesh(new THREE.SphereGeometry(4, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), dome);
  cup.position.y = base + 1.4;
  cup.scale.y = 0.75;
  const brass = new THREE.MeshLambertMaterial({ color: '#a8842e', flatShading: true });
  for (let k = 0; k < 6; k++) { // six ports, one per hex side
    const a = (k * Math.PI) / 3;
    const port = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.4), brass);
    port.position.set(Math.sin(a) * 4.05, base + 0.55, Math.cos(a) * 4.05);
    port.rotation.y = a;
    g.add(port);
  }
  const lantern = new THREE.MeshLambertMaterial({ color: '#3e3a34', emissive: '#f0e6d2', emissiveIntensity: 0.6 });
  const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), lantern);
  const top = base + 1.4 + 3.0 + 0.5;
  lamp.position.y = top;
  for (const m of [hall, cup]) { m.castShadow = true; m.receiveShadow = true; }
  g.add(hall, cup, lamp);
  return { group: g, dome, lantern, top };
}

const PAPER = new THREE.Color('#f0e6d2'), GOLD = new THREE.Color('#d4a755');

/** Beat 2: the dome flares 240–400 ms after NETTED; the lantern leans from --paper toward --gold with it. */
export function flareAt(age: number): number {
  if (age < 0.24 || age > 0.9) return 0;
  return age < 0.4 ? (age - 0.24) / 0.16 : Math.max(0, 1 - (age - 0.4) / 0.5);
}
export function setFlare(c: Clearinghouse, f: number): void {
  c.dome.emissiveIntensity = f * 0.9;
  c.lantern.emissive.copy(PAPER).lerp(GOLD, f);
  c.lantern.emissiveIntensity = 0.6 + 0.6 * f;
}
